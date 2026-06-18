import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";

// Icons
import { 
  Factory, Plus, ChefHat, Package, ArrowRight, CheckCircle, 
  AlertTriangle, RefreshCw, Trash2, Eye, Play, Archive,
  Calendar, FileText, Loader2, Info, Calculator, Printer
} from "lucide-react";

import { API_BASE as API } from "../utils/api";
import EventProductionPlan from "./EventProductionPlan";
import KitchenBEO from "./KitchenBEO";
import { formatDateOnly } from "../utils/dates";
import { fmtNum } from "../utils/format";

export default function ProductionSection() {
  const { language } = useLanguage();
  const [batches, setBatches] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewBatch, setViewBatch] = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  
  // New batch form
  const [newBatch, setNewBatch] = useState({
    linked_event_id: "",
    notes: "",
    lines: []
  });
  const [selectedRecipe, setSelectedRecipe] = useState("");
  const [outputQty, setOutputQty] = useState(1);
  const [onlyStockProducing, setOnlyStockProducing] = useState(false);
  
  const [posting, setPosting] = useState(false);
  const [miseEnPlaceDialogOpen, setMiseEnPlaceDialogOpen] = useState(false);
  const [miseEnPlaceData, setMiseEnPlaceData] = useState(null);
  const [generatingMep, setGeneratingMep] = useState(false);
  const [eventPlanOpen, setEventPlanOpen] = useState(false);
  const [beoOpen, setBeoOpen] = useState(false);

  const fetchBatches = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/production/batches`, { withCredentials: true });
      setBatches(res.data);
    } catch (error) {
      toast.error("Error loading batches");
    }
  }, []);

  const fetchRecipes = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/production/recipes-for-production?only_stock_producing=${onlyStockProducing}`, { withCredentials: true });
      setRecipes(res.data);
    } catch (error) {
      console.error("Error loading recipes:", error);
    }
  }, [onlyStockProducing]);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/events/confirmed`, { withCredentials: true });
      setEvents(res.data);
    } catch (error) {
      console.error("Error loading events:", error);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchBatches(), fetchRecipes(), fetchEvents()]).finally(() => setLoading(false));
  }, [fetchBatches, fetchRecipes, fetchEvents]);

  useEffect(() => {
    fetchRecipes();
  }, [onlyStockProducing, fetchRecipes]);

  const handleAddLine = () => {
    if (!selectedRecipe) return;
    
    const recipe = recipes.find(r => r.recipe_id === selectedRecipe);
    if (!recipe) return;
    
    // Check if already added
    if (newBatch.lines.some(l => l.recipe_id === selectedRecipe)) {
      toast.error(language === "es" ? "Receta ya agregada" : "Recipe already added");
      return;
    }
    
    setNewBatch(prev => ({
      ...prev,
      lines: [...prev.lines, {
        recipe_id: selectedRecipe,
        recipe_name: recipe.name,
        recipe_type: recipe.recipe_type,
        produces_stock: recipe.produces_stock,
        target_output_qty: outputQty,
        output_unit: recipe.yield_unit
      }]
    }));
    
    setSelectedRecipe("");
    setOutputQty(1);
  };

  const handleRemoveLine = (recipeId) => {
    setNewBatch(prev => ({
      ...prev,
      lines: prev.lines.filter(l => l.recipe_id !== recipeId)
    }));
  };

  const handleCreateBatch = async () => {
    if (newBatch.lines.length === 0) {
      toast.error(language === "es" ? "Agrega al menos una receta" : "Add at least one recipe");
      return;
    }
    
    try {
      await axios.post(`${API}/api/production/batches`, {
        linked_event_id: newBatch.linked_event_id || null,
        notes: newBatch.notes,
        lines: newBatch.lines.map(l => ({
          recipe_id: l.recipe_id,
          target_output_qty: l.target_output_qty,
          output_unit: l.output_unit
        }))
      }, { withCredentials: true });
      
      toast.success(language === "es" ? "Lote creado" : "Batch created");
      setCreateDialogOpen(false);
      setNewBatch({ linked_event_id: "", notes: "", lines: [] });
      fetchBatches();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error creating batch");
    }
  };

  const handlePostBatch = async (batchId) => {
    setPosting(true);
    try {
      await axios.put(`${API}/api/production/batches/${batchId}/status`, {
        status: "POSTED"
      }, { withCredentials: true });
      
      toast.success(language === "es" ? "¡Lote publicado! Inventario actualizado." : "Batch posted! Inventory updated.");
      fetchBatches();
      setViewBatch(null);
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (detail?.shortages) {
        toast.error(
          <div>
            <p className="font-bold">{language === "es" ? "Inventario insuficiente:" : "Insufficient inventory:"}</p>
            {detail.shortages.map((s, i) => (
              <p key={i} className="text-sm">{s.item_name}: {language === "es" ? "necesita" : "need"} {s.required}, {language === "es" ? "tiene" : "have"} {s.available}</p>
            ))}
          </div>
        );
      } else {
        toast.error(detail?.message || detail || "Error posting batch");
      }
    }
    setPosting(false);
  };

  const handleUpdateStatus = async (batchId, newStatus) => {
    try {
      await axios.put(`${API}/api/production/batches/${batchId}/status`, {
        status: newStatus
      }, { withCredentials: true });
      
      toast.success(language === "es" ? "Estado actualizado" : "Status updated");
      fetchBatches();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error updating status");
    }
  };

  // Generate Mise en Place from active batches
  const handleGenerateMiseEnPlace = async () => {
    setGeneratingMep(true);
    try {
      // Get active batches (PLANNED or IN_PROGRESS)
      const activeBatches = batches.filter(b => ["PLANNED", "IN_PROGRESS"].includes(b.status));
      
      if (activeBatches.length === 0) {
        toast.error(language === "es" ? "No hay lotes activos para generar Mise en Place" : "No active batches for Mise en Place");
        setGeneratingMep(false);
        return;
      }
      
      // Call API to generate mise en place
      const res = await axios.post(`${API}/api/production/mise-en-place`, {
        batch_ids: activeBatches.map(b => b.batch_id)
      }, { withCredentials: true });
      
      setMiseEnPlaceData(res.data);
      setMiseEnPlaceDialogOpen(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === "es" ? "Error al generar" : "Failed to generate"));
    }
    setGeneratingMep(false);
  };

  // Print Mise en Place
  const handlePrintMiseEnPlace = () => {
    const printWindow = window.open('', '_blank');
    const isEs = language === "es";
    
    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Mise en Place - ${formatDateOnly(new Date(), language)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
          h2 { color: #666; margin-top: 30px; background: #f5f5f5; padding: 10px; }
          h3 { color: #888; margin-top: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #f9f9f9; }
          .event-header { background: #e3f2fd; }
          .category-header { background: #fff3e0; font-weight: bold; }
          .checkbox { width: 20px; }
          @media print { 
            .no-print { display: none; }
            h2 { break-before: page; }
          }
        </style>
      </head>
      <body>
        <h1>🍳 Mise en Place - ${formatDateOnly(new Date(), language)}</h1>
        <p><strong>${isEs ? "Responsable" : "Responsible"}:</strong> _________________</p>
        <p><strong>${isEs ? "Fecha preparación" : "Prep Date"}:</strong> _________________</p>
        
        ${miseEnPlaceData?.events?.map(evt => `
          <h2 class="event-header">📅 ${evt.event_name} - ${evt.event_date ? formatDateOnly(evt.event_date, language) : ''}</h2>
          <p>${evt.guest_count || 0} ${isEs ? "invitados" : "guests"}</p>
          
          ${evt.categories?.map(cat => `
            <h3 class="category-header">${cat.name}</h3>
            <table>
              <thead>
                <tr>
                  <th class="checkbox">✓</th>
                  <th>${isEs ? "Ítem" : "Item"}</th>
                  <th>${isEs ? "Cantidad" : "Qty"}</th>
                  <th>${isEs ? "Unidad" : "Unit"}</th>
                  <th>${isEs ? "Receta" : "Recipe"}</th>
                  <th>${isEs ? "Notas" : "Notes"}</th>
                </tr>
              </thead>
              <tbody>
                ${cat.items?.map(item => `
                  <tr>
                    <td class="checkbox">☐</td>
                    <td>${item.name}</td>
                    <td><strong>${item.quantity}</strong></td>
                    <td>${item.unit}</td>
                    <td>${item.recipe_name || '-'}</td>
                    <td>${item.notes || ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `).join('')}
        `).join('')}
        
        <div style="margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px;">
          <p><strong>${isEs ? "Firma Responsable" : "Responsible Signature"}:</strong> _________________</p>
          <p><strong>${isEs ? "Hora de Inicio" : "Start Time"}:</strong> _______ <strong>${isEs ? "Hora de Fin" : "End Time"}:</strong> _______</p>
        </div>
        
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;
    
    printWindow.document.write(content);
    printWindow.document.close();
  };

  const getStatusBadge = (status) => {
    const styles = {
      PLANNED: "bg-blue-100 text-blue-700",
      IN_PROGRESS: "bg-amber-100 text-amber-700",
      POSTED: "bg-green-100 text-green-700",
      VOIDED: "bg-gray-100 text-gray-500"
    };
    return <Badge className={styles[status] || ""}>{status}</Badge>;
  };

  const filteredBatches = batches.filter(b => {
    if (activeTab === "all") return true;
    if (activeTab === "active") return ["PLANNED", "IN_PROGRESS"].includes(b.status);
    if (activeTab === "posted") return b.status === "POSTED";
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="production-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Factory className="w-6 h-6" />
            {language === "es" ? "Producción" : "Production"}
          </h1>
          <p className="text-muted-foreground">
            {language === "es" 
              ? "Convierte planes de recetas en stock preparado y actualiza inventario"
              : "Convert recipe plans into prepared stock and update inventory"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setEventPlanOpen(true)}
            className="gap-2"
            data-testid="open-event-plan-btn"
          >
            <Calculator className="w-4 h-4" />
            {language === "es" ? "Plan por Evento" : "Event Plan"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setBeoOpen(true)}
            className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
            data-testid="open-kitchen-beo-btn"
          >
            <Printer className="w-4 h-4" />
            {language === "es" ? "BEO Cocina" : "Kitchen BEO"}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleGenerateMiseEnPlace}
            disabled={generatingMep || batches.filter(b => ["PLANNED", "IN_PROGRESS"].includes(b.status)).length === 0}
            className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
          >
            {generatingMep ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChefHat className="w-4 h-4" />}
            Mise en Place
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            {language === "es" ? "Nuevo Lote" : "New Batch"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all" className="gap-2">
            {language === "es" ? "Todos" : "All"} ({batches.length})
          </TabsTrigger>
          <TabsTrigger value="active" className="gap-2">
            {language === "es" ? "Activos" : "Active"} ({batches.filter(b => ["PLANNED", "IN_PROGRESS"].includes(b.status)).length})
          </TabsTrigger>
          <TabsTrigger value="posted" className="gap-2">
            <CheckCircle className="w-4 h-4" />
            {language === "es" ? "Publicados" : "Posted"} ({batches.filter(b => b.status === "POSTED").length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {filteredBatches.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Factory className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{language === "es" ? "No hay lotes de producción" : "No production batches"}</p>
                <Button variant="outline" className="mt-4" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  {language === "es" ? "Crear primer lote" : "Create first batch"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredBatches.map(batch => (
                <Card key={batch.batch_id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-mono text-sm font-medium">{batch.batch_number}</span>
                          {getStatusBadge(batch.status)}
                          {batch.linked_event_name && (
                            <Badge variant="outline" className="text-xs">
                              <Calendar className="w-3 h-3 mr-1" />
                              {batch.linked_event_name}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{batch.lines?.length || 0} {language === "es" ? "recetas" : "recipes"}</span>
                          <span>${fmtNum(batch.total_input_cost)} {language === "es" ? "costo entrada" : "input cost"}</span>
                          {batch.status === "POSTED" && (
                            <span className="text-green-600">${fmtNum(batch.total_output_value)} {language === "es" ? "valor salida" : "output value"}</span>
                          )}
                          <span>{formatDateOnly(batch.created_at, language)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {batch.status === "PLANNED" && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleUpdateStatus(batch.batch_id, "IN_PROGRESS")}
                          >
                            <Play className="w-4 h-4 mr-1" />
                            {language === "es" ? "Iniciar" : "Start"}
                          </Button>
                        )}
                        {batch.status === "IN_PROGRESS" && (
                          <Button 
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => setViewBatch(batch)}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            {language === "es" ? "Publicar" : "Post"}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setViewBatch(batch)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Batch Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Factory className="w-5 h-5" />
              {language === "es" ? "Crear Lote de Producción" : "Create Production Batch"}
            </DialogTitle>
            <DialogDescription>
              {language === "es" 
                ? "Selecciona recetas para producir y actualizar inventario"
                : "Select recipes to produce and update inventory"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Link to Event (optional) */}
            <div>
              <Label>{language === "es" ? "Vincular a Evento (opcional)" : "Link to Event (optional)"}</Label>
              <Select value={newBatch.linked_event_id || "none"} onValueChange={(v) => setNewBatch(prev => ({ ...prev, linked_event_id: v === "none" ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder={language === "es" ? "Seleccionar evento..." : "Select event..."} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">({language === "es" ? "Ninguno" : "None"})</SelectItem>
                  {events.map(e => (
                    <SelectItem key={e.event_id} value={e.event_id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Recipe Selector */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label>{language === "es" ? "Agregar Receta" : "Add Recipe"}</Label>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="onlyStock" 
                    checked={onlyStockProducing}
                    onCheckedChange={setOnlyStockProducing}
                  />
                  <label htmlFor="onlyStock" className="text-xs text-muted-foreground cursor-pointer">
                    {language === "es" ? "Solo recetas que producen stock" : "Only stock-producing recipes"}
                  </label>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Select value={selectedRecipe} onValueChange={setSelectedRecipe} className="flex-1">
                  <SelectTrigger>
                    <SelectValue placeholder={language === "es" ? "Seleccionar receta..." : "Select recipe..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {recipes.map(r => (
                      <SelectItem key={r.recipe_id} value={r.recipe_id}>
                        <div className="flex items-center gap-2">
                          <span>{r.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {r.recipe_type === "final_dish" ? "DISH" : r.recipe_type.toUpperCase()}
                          </Badge>
                          {r.produces_stock && <CheckCircle className="w-3 h-3 text-green-600" />}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input 
                  type="number" 
                  min="0.1"
                  step="0.1"
                  value={outputQty}
                  onChange={(e) => setOutputQty(parseFloat(e.target.value) || 1)}
                  className="w-24"
                  placeholder="Qty"
                />
                <Button onClick={handleAddLine} disabled={!selectedRecipe}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {/* Info about DISH recipes */}
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700 flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  {language === "es" 
                    ? "Las recetas DISH solo crean stock cuando tienen 'Prep-ahead' habilitado. BASE y COMPONENT siempre crean stock."
                    : "DISH recipes only create stock when 'Prep-ahead' is enabled. BASE and COMPONENT always create stock."}
                </span>
              </div>
            </div>

            {/* Lines Added */}
            {newBatch.lines.length > 0 && (
              <div>
                <Label className="mb-2 block">{language === "es" ? "Recetas en el Lote" : "Recipes in Batch"}</Label>
                <div className="border rounded-lg divide-y">
                  {newBatch.lines.map((line, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <ChefHat className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <span className="font-medium">{line.recipe_name}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                              {line.recipe_type === "final_dish" ? "DISH" : line.recipe_type.toUpperCase()}
                            </Badge>
                            {line.produces_stock ? (
                              <span className="text-green-600 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> {language === "es" ? "Produce stock" : "Produces stock"}
                              </span>
                            ) : (
                              <span className="text-amber-600">{language === "es" ? "No produce stock" : "No stock output"}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono">{line.target_output_qty} {line.output_unit}</span>
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveLine(line.recipe_id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <Label>{language === "es" ? "Notas (opcional)" : "Notes (optional)"}</Label>
              <Textarea 
                value={newBatch.notes}
                onChange={(e) => setNewBatch(prev => ({ ...prev, notes: e.target.value }))}
                placeholder={language === "es" ? "Notas adicionales..." : "Additional notes..."}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              {language === "es" ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreateBatch} disabled={newBatch.lines.length === 0}>
              <Plus className="w-4 h-4 mr-2" />
              {language === "es" ? "Crear Lote" : "Create Batch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View/Post Batch Dialog */}
      <Dialog open={!!viewBatch} onOpenChange={() => setViewBatch(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Factory className="w-5 h-5" />
              {viewBatch?.batch_number}
              {viewBatch && getStatusBadge(viewBatch.status)}
            </DialogTitle>
            <DialogDescription>
              {viewBatch?.linked_event_name && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {viewBatch.linked_event_name}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {viewBatch && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold">{viewBatch.lines?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">{language === "es" ? "Recetas" : "Recipes"}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold">${fmtNum(viewBatch.total_input_cost)}</p>
                    <p className="text-xs text-muted-foreground">{language === "es" ? "Costo Entrada" : "Input Cost"}</p>
                  </CardContent>
                </Card>
                <Card className={viewBatch.status === "POSTED" ? "bg-green-50" : ""}>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold">${fmtNum(viewBatch.total_output_value)}</p>
                    <p className="text-xs text-muted-foreground">{language === "es" ? "Valor Salida" : "Output Value"}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Lines */}
              <div>
                <h4 className="font-medium mb-2">{language === "es" ? "Líneas de Producción" : "Production Lines"}</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === "es" ? "Receta" : "Recipe"}</TableHead>
                      <TableHead>{language === "es" ? "Tipo" : "Type"}</TableHead>
                      <TableHead className="text-right">{language === "es" ? "Cantidad" : "Qty"}</TableHead>
                      <TableHead>{language === "es" ? "Stock" : "Stock"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewBatch.lines?.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{line.recipe_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {line.recipe_type === "final_dish" ? "DISH" : line.recipe_type.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{line.target_output_qty} {line.output_unit}</TableCell>
                        <TableCell>
                          {line.produces_stock ? (
                            <span className="text-green-600 flex items-center gap-1">
                              <CheckCircle className="w-4 h-4" /> {language === "es" ? "Sí" : "Yes"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Computed Inputs */}
              {viewBatch.lines?.some(l => l.computed_inputs?.length > 0) && (
                <div>
                  <h4 className="font-medium mb-2">{language === "es" ? "Insumos Requeridos" : "Required Inputs"}</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === "es" ? "Ingrediente" : "Ingredient"}</TableHead>
                        <TableHead>{language === "es" ? "Tipo" : "Type"}</TableHead>
                        <TableHead className="text-right">{language === "es" ? "Requerido" : "Required"}</TableHead>
                        <TableHead className="text-right">{language === "es" ? "En Stock" : "In Stock"}</TableHead>
                        <TableHead className="text-right">{language === "es" ? "Costo" : "Cost"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewBatch.lines?.flatMap(line => 
                        line.computed_inputs?.filter(i => i.item_type === "RAW").map((input, idx) => {
                          const shortage = input.required_qty > input.in_stock;
                          return (
                            <TableRow key={`${line.line_id}-${idx}`} className={shortage ? "bg-red-50" : ""}>
                              <TableCell>{input.item_name}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{input.item_type}</Badge>
                              </TableCell>
                              <TableCell className="text-right">{fmtNum(input.required_qty)} {input.unit}</TableCell>
                              <TableCell className={`text-right ${shortage ? "text-red-600 font-bold" : ""}`}>
                                {fmtNum(input.in_stock)} {input.unit}
                                {shortage && <AlertTriangle className="w-4 h-4 inline ml-1" />}
                              </TableCell>
                              <TableCell className="text-right">${fmtNum(input.total_cost)}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Notes */}
              {viewBatch.notes && (
                <div>
                  <h4 className="font-medium mb-1">{language === "es" ? "Notas" : "Notes"}</h4>
                  <p className="text-sm text-muted-foreground">{viewBatch.notes}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewBatch(null)}>
              {language === "es" ? "Cerrar" : "Close"}
            </Button>
            {viewBatch?.status === "IN_PROGRESS" && (
              <Button 
                onClick={() => handlePostBatch(viewBatch.batch_id)}
                disabled={posting}
                className="bg-green-600 hover:bg-green-700"
              >
                {posting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {language === "es" ? "Publicando..." : "Posting..."}
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {language === "es" ? "Publicar Lote" : "Post Batch"}
                  </>
                )}
              </Button>
            )}
            {viewBatch?.status === "PLANNED" && (
              <Button 
                onClick={() => {
                  handleUpdateStatus(viewBatch.batch_id, "IN_PROGRESS");
                  setViewBatch(null);
                }}
              >
                <Play className="w-4 h-4 mr-2" />
                {language === "es" ? "Iniciar Producción" : "Start Production"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mise en Place Dialog */}
      <Dialog open={miseEnPlaceDialogOpen} onOpenChange={setMiseEnPlaceDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ChefHat className="w-5 h-5 text-amber-600" />
              Mise en Place
            </DialogTitle>
            <DialogDescription>
              {language === "es" 
                ? "Lista de preparación previa para cocina - Generado desde lotes activos"
                : "Pre-preparation checklist for kitchen - Generated from active batches"}
            </DialogDescription>
          </DialogHeader>

          {miseEnPlaceData ? (
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-amber-50 rounded-lg">
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-700">{miseEnPlaceData.events?.length || 0}</p>
                  <p className="text-sm text-amber-600">{language === "es" ? "Eventos" : "Events"}</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-700">{miseEnPlaceData.total_items || 0}</p>
                  <p className="text-sm text-amber-600">{language === "es" ? "Items a preparar" : "Items to prep"}</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-700">{miseEnPlaceData.total_recipes || 0}</p>
                  <p className="text-sm text-amber-600">{language === "es" ? "Recetas" : "Recipes"}</p>
                </div>
              </div>

              {/* Events with their mise en place */}
              {miseEnPlaceData.events?.map((evt, evtIdx) => (
                <Card key={evtIdx}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {evt.event_name}
                      <Badge variant="outline">{evt.guest_count} {language === "es" ? "invitados" : "guests"}</Badge>
                    </CardTitle>
                    <CardDescription>
                      {evt.event_date ? formatDateOnly(evt.event_date, language) : ''}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {evt.categories?.map((cat, catIdx) => (
                      <div key={catIdx} className="mb-4">
                        <h4 className="font-medium text-sm bg-muted px-2 py-1 rounded mb-2">{cat.name}</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-8">☐</TableHead>
                              <TableHead>{language === "es" ? "Ítem" : "Item"}</TableHead>
                              <TableHead className="text-right">{language === "es" ? "Cantidad" : "Qty"}</TableHead>
                              <TableHead>{language === "es" ? "Unidad" : "Unit"}</TableHead>
                              <TableHead>{language === "es" ? "Receta" : "Recipe"}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {cat.items?.map((item, itemIdx) => (
                              <TableRow key={itemIdx}>
                                <TableCell>
                                  <Checkbox />
                                </TableCell>
                                <TableCell className="font-medium">{item.name}</TableCell>
                                <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                                <TableCell>{item.unit}</TableCell>
                                <TableCell className="text-muted-foreground text-sm">{item.recipe_name || '-'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <ChefHat className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{language === "es" ? "No hay datos de Mise en Place" : "No Mise en Place data"}</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setMiseEnPlaceDialogOpen(false)}>
              {language === "es" ? "Cerrar" : "Close"}
            </Button>
            {miseEnPlaceData && (
              <Button onClick={handlePrintMiseEnPlace} className="bg-amber-600 hover:bg-amber-700">
                <FileText className="w-4 h-4 mr-2" />
                {language === "es" ? "Imprimir" : "Print"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* P1-A — Event Production Plan modal */}
      <EventProductionPlan
        open={eventPlanOpen}
        onOpenChange={setEventPlanOpen}
        events={events}
      />

      {/* Feature 2 — Kitchen BEO modal */}
      <KitchenBEO
        open={beoOpen}
        onOpenChange={setBeoOpen}
        events={events}
      />
    </div>
  );
}
