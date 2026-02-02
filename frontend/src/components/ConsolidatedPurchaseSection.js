import { useState, useEffect, useCallback, useRef } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { ScrollArea } from "./ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

// Icons
import { 
  ShoppingCart, Package, Truck, RefreshCw, FileText, Check,
  Calendar, Users, ArrowRight, AlertTriangle, Download, CheckCircle,
  Printer, PackageMinus, Loader2, Archive, Clock, Eye, ArchiveRestore,
  Factory, ChefHat
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function ConsolidatedPurchaseSection() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [processedEvents, setProcessedEvents] = useState([]);
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [purchaseData, setPurchaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [creatingPO, setCreatingPO] = useState(null);
  const [processingSR, setProcessingSR] = useState(false);
  const [srProcessed, setSrProcessed] = useState(false); // Track if SR allocation confirmed
  const [srDialogOpen, setSrDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("pending");
  const [markingComplete, setMarkingComplete] = useState(false);
  const [viewingHistory, setViewingHistory] = useState(null);
  const [productionDialogOpen, setProductionDialogOpen] = useState(false);
  const [suggestedProduction, setSuggestedProduction] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [createdPOs, setCreatedPOs] = useState({}); // Track created POs by supplier ID
  const printRef = useRef(null);

  const t = useCallback((key) => {
    const translations = {
      title: { en: "Consolidated Purchases", es: "Compras Consolidadas" },
      selectEvents: { en: "Select Events to Generate Prep Plan", es: "Selecciona Eventos para Generar Plan de Preparación" },
      generate: { en: "Generate Prep Plan", es: "Generar Plan de Preparación" },
      noEvents: { en: "No upcoming events", es: "No hay eventos próximos" },
      event: { en: "Event", es: "Evento" },
      date: { en: "Date", es: "Fecha" },
      guests: { en: "Guests", es: "Comensales" },
      totalRequired: { en: "Total Required", es: "Total Requerido" },
      inStock: { en: "In Stock", es: "En Stock" },
      toPurchase: { en: "To Purchase", es: "Por Comprar" },
      cost: { en: "Cost", es: "Costo" },
      totalCost: { en: "Total Cost", es: "Costo Total" },
      createPO: { en: "Create PO", es: "Crear OC" },
      noSupplier: { en: "No Supplier", es: "Sin Proveedor" },
      recipes: { en: "Recipes", es: "Recetas" },
      eventsSelected: { en: "events selected", es: "eventos seleccionados" },
      selectAll: { en: "Select All", es: "Seleccionar Todo" },
      clearAll: { en: "Clear All", es: "Limpiar Todo" },
      includeBuffer: { en: "Include 10% buffer", es: "Incluir 10% reserva" },
      compareStock: { en: "Compare with stock", es: "Comparar con inventario" },
      noItemsNeeded: { en: "No items needed to purchase", es: "No hay items que comprar" },
      poCreated: { en: "PO Created!", es: "¡OC Creada!" },
      pending: { en: "Pending", es: "Pendientes" },
      processed: { en: "Processed", es: "Procesados" },
    };
    return translations[key]?.[language] || translations[key]?.en || key;
  }, [language]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/events/confirmed`, { withCredentials: true });
      // Separate events by procurement_status
      const pending = res.data.filter(e => e.procurement_status !== "completed");
      const processed = res.data.filter(e => e.procurement_status === "completed");
      setEvents(pending);
      setProcessedEvents(processed);
    } catch (error) {
      toast.error("Error loading events");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Toggle event selection
  const toggleEvent = (eventId) => {
    setSelectedEvents(prev => 
      prev.includes(eventId) 
        ? prev.filter(id => id !== eventId)
        : [...prev, eventId]
    );
  };

  // Generate purchase list
  const handleGenerate = async () => {
    if (selectedEvents.length === 0) {
      toast.error(language === "es" ? "Selecciona al menos un evento" : "Select at least one event");
      return;
    }
    
    setGenerating(true);
    setCreatedPOs({}); // Reset created POs when regenerating
    setSrProcessed(false); // Reset SR processed state
    try {
      const res = await axios.post(`${API}/api/events/generate-purchase-list`, {
        event_ids: selectedEvents,
        include_buffer: true,
        compare_inventory: true
      }, { withCredentials: true });
      
      setPurchaseData(res.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error generating list");
    }
    setGenerating(false);
  };

  // Process Stock Requisition - Deduct items from inventory
  const handleProcessSR = async () => {
    if (!purchaseData?.stock_requisition?.length) {
      toast.error(language === "es" ? "No hay items para asignar" : "No items to allocate");
      return;
    }
    
    setProcessingSR(true);
    try {
      // Mark SR as confirmed/allocated - does NOT deduct inventory
      // Inventory will be deducted during production posting
      // This just confirms the allocation for planning purposes
      
      toast.success(language === "es" 
        ? "Asignación confirmada - El inventario se deducirá durante producción" 
        : "Allocation confirmed - Inventory will be deducted during production");
      setSrDialogOpen(false);
      
      // Mark events as having SR processed
      setSrProcessed(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error confirming allocation");
    }
    setProcessingSR(false);
  };

  // Print Stock Requisition
  const handlePrintSR = () => {
    if (!purchaseData?.stock_requisition?.length) {
      toast.error(language === "es" ? "No hay items para imprimir" : "No items to print");
      return;
    }
    
    const printContent = `
      <html>
        <head>
          <title>Stock Requisition</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { font-size: 18px; margin-bottom: 5px; }
            h2 { font-size: 14px; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #f5f5f5; font-weight: bold; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            .total { margin-top: 20px; font-weight: bold; text-align: right; }
            .footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px; }
            .signature { display: flex; justify-content: space-between; margin-top: 40px; }
            .signature div { width: 200px; border-top: 1px solid #333; padding-top: 5px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>STOCK REQUISITION (SR)</h1>
              <h2>${language === "es" ? "Requisición de Inventario" : "Inventory Requisition"}</h2>
            </div>
            <div style="text-align: right;">
              <p><strong>${language === "es" ? "Fecha" : "Date"}:</strong> ${new Date().toLocaleDateString()}</p>
              <p><strong>${language === "es" ? "Eventos" : "Events"}:</strong> ${purchaseData.events?.map(e => e.event_name).join(", ")}</p>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>${language === "es" ? "Item" : "Item"}</th>
                <th>${language === "es" ? "Cantidad" : "Quantity"}</th>
                <th>${language === "es" ? "Unidad" : "Unit"}</th>
                <th>${language === "es" ? "Recetas" : "Recipes"}</th>
              </tr>
            </thead>
            <tbody>
              ${purchaseData.stock_requisition.map((item, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${item.item_name}</td>
                  <td style="text-align: right;">${item.in_stock?.toFixed(2)}</td>
                  <td>${item.unit}</td>
                  <td>${item.recipes_used?.join(", ") || "-"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          
          <div class="total">
            ${language === "es" ? "Total Items" : "Total Items"}: ${purchaseData.stock_requisition.length}
          </div>
          
          <div class="signature">
            <div>${language === "es" ? "Solicitado por" : "Requested by"}</div>
            <div>${language === "es" ? "Entregado por" : "Issued by"}</div>
            <div>${language === "es" ? "Recibido por" : "Received by"}</div>
          </div>
        </body>
      </html>
    `;
    
    const printWindow = window.open("", "_blank");
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  // Create PO from supplier items
  const handleCreatePO = async (supplierId, items) => {
    // Check if PO already created for this supplier
    if (createdPOs[supplierId]) {
      toast.error(language === "es" ? "La orden para este proveedor ya fue creada" : "Order for this supplier already created");
      return;
    }
    
    setCreatingPO(supplierId);
    try {
      const itemsToOrder = items.filter(i => i.to_purchase > 0);
      if (itemsToOrder.length === 0) {
        toast.error(language === "es" ? "No hay items para ordenar" : "No items to order");
        setCreatingPO(null);
        return;
      }
      
      await axios.post(`${API}/api/events/create-po-from-purchase-list`, {
        supplier_id: supplierId === "no_supplier" ? null : supplierId,
        items: itemsToOrder.map(i => ({
          inventory_item_id: i.inventory_item_id,
          item_name: i.item_name,
          to_purchase: parseFloat(i.to_purchase) || 0,
          unit: i.unit,
          unit_cost: parseFloat(i.unit_cost) || 0
        }))
      }, { withCredentials: true });
      
      // Mark this supplier's PO as created
      setCreatedPOs(prev => ({ ...prev, [supplierId]: true }));
      toast.success(language === "es" ? "¡Orden enviada a Vendor Orders!" : "Order sent to Vendor Orders!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error creating PO");
    }
    setCreatingPO(null);
  };

  // Open Production Batch dialog with suggestions from SR
  const handleOpenProductionDialog = async () => {
    if (!purchaseData?.events?.length) return;
    
    setLoadingSuggestions(true);
    setProductionDialogOpen(true);
    
    try {
      const eventIds = purchaseData.events.map(e => e.event_id);
      const res = await axios.post(`${API}/api/production/suggest-from-events`, {
        event_ids: eventIds
      }, { withCredentials: true });
      
      setSuggestedProduction(res.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error loading suggestions");
    }
    setLoadingSuggestions(false);
  };

  // Create Production Batch from suggestions
  const handleCreateProductionBatch = async () => {
    if (!suggestedProduction?.suggested_lines?.length) return;
    
    setCreatingBatch(true);
    try {
      const eventIds = purchaseData?.events?.map(e => e.event_id) || [];
      
      await axios.post(`${API}/api/production/batches`, {
        linked_event_id: eventIds[0] || null,
        notes: language === "es" 
          ? `Creado desde SR para: ${suggestedProduction.events?.map(e => e.name).join(", ")}`
          : `Created from SR for: ${suggestedProduction.events?.map(e => e.name).join(", ")}`,
        lines: suggestedProduction.suggested_lines.map(line => ({
          recipe_id: line.recipe_id,
          target_output_qty: Math.ceil(line.qty_needed),
          output_unit: line.yield_unit
        }))
      }, { withCredentials: true });
      
      toast.success(language === "es" ? "¡Lote de producción creado!" : "Production batch created!");
      setProductionDialogOpen(false);
      setSuggestedProduction(null);
      
      // Navigate to Production page
      navigate("/food-ops/production");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error creating batch");
    }
    setCreatingBatch(false);
  };

  // Generate Mise en Place document for selected events
  const handleGenerateMiseEnPlace = async () => {
    if (!purchaseData?.events?.length) {
      toast.error(language === "es" ? "No hay eventos seleccionados" : "No events selected");
      return;
    }
    
    try {
      // Generate mise en place for first selected event (or create combined)
      const eventId = purchaseData.events[0].event_id;
      const res = await axios.post(
        `${API}/api/documents/generate/${eventId}/mise_en_place`,
        {},
        { withCredentials: true }
      );
      
      toast.success(language === "es" ? "Mise en Place generado" : "Mise en Place generated");
      
      // Open in new tab
      window.open(`/portal/${res.data.document_id}`, '_blank');
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === "es" ? "Error al generar" : "Failed to generate"));
    }
  };

  // Mark events as procurement complete
  const handleMarkComplete = async () => {
    if (!purchaseData?.events?.length) return;
    
    setMarkingComplete(true);
    try {
      const eventIds = purchaseData.events.map(e => e.event_id);
      
      // Save procurement history for each event
      await axios.post(`${API}/api/events/mark-procurement-complete`, {
        event_ids: eventIds,
        procurement_data: {
          stock_requisition: purchaseData.stock_requisition,
          purchase_list: purchaseData.purchase_list,
          total_cost: purchaseData.total_cost,
          completed_at: new Date().toISOString()
        }
      }, { withCredentials: true });
      
      toast.success(language === "es" 
        ? `${eventIds.length} evento(s) marcado(s) como completado(s)` 
        : `${eventIds.length} event(s) marked as complete`
      );
      
      // Clear selection and refresh
      setPurchaseData(null);
      setSelectedEvents([]);
      fetchEvents();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error marking complete");
    }
    setMarkingComplete(false);
  };

  // Reopen event for procurement
  const handleReopenEvent = async (eventId) => {
    try {
      await axios.post(`${API}/api/events/${eventId}/reopen-procurement`, {}, { withCredentials: true });
      toast.success(language === "es" ? "Evento reabierto para compras" : "Event reopened for procurement");
      fetchEvents();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error reopening event");
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="consolidated-purchase-section">
      {/* Tabs for Pending vs Processed */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="w-4 h-4" />
            {t("pending")} ({events.length})
          </TabsTrigger>
          <TabsTrigger value="processed" className="gap-2">
            <CheckCircle className="w-4 h-4" />
            {t("processed")} ({processedEvents.length})
          </TabsTrigger>
        </TabsList>

        {/* PENDING TAB */}
        <TabsContent value="pending" className="space-y-6">
          {/* Event Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                {t("selectEvents")}
              </CardTitle>
              <CardDescription>
                {selectedEvents.length} {t("eventsSelected")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500 opacity-70" />
                  <p>{language === "es" ? "¡Todos los eventos han sido procesados!" : "All events have been processed!"}</p>
                </div>
              ) : (
                <>
                  <div className="flex gap-2 mb-4">
                    <Button variant="outline" size="sm" onClick={() => setSelectedEvents(events.map(e => e.event_id))}>
                      {t("selectAll")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSelectedEvents([])}>
                      {t("clearAll")}
                    </Button>
                  </div>
                  
                  <ScrollArea className="h-64">
                    <div className="space-y-2">
                      {events.map(event => (
                        <div 
                          key={event.event_id}
                          className={`flex items-center gap-4 p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedEvents.includes(event.event_id) 
                              ? "bg-primary/10 border-primary" 
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => toggleEvent(event.event_id)}
                        >
                          <Checkbox checked={selectedEvents.includes(event.event_id)} />
                          <div className="flex-1">
                            <p className="font-medium">{event.name}</p>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {event.event_date ? new Date(event.event_date).toLocaleDateString() : "TBD"}
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {event.guest_count || event.num_guests || 0} {language === "es" ? "personas" : "guests"}
                              </span>
                            </div>
                          </div>
                        </div>
                  ))}
                </div>
              </ScrollArea>
              
              <div className="mt-4 flex justify-end">
                <Button onClick={handleGenerate} disabled={selectedEvents.length === 0 || generating}>
                  {generating ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
                  {t("generate")}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Generated Purchase List */}
      {purchaseData && (
        <div className="space-y-4">
          {/* Stock Requisition vs Purchase List Cards */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Stock Requisition (SR) - Items in Stock */}
            <Card className="border-emerald-200 bg-emerald-50/30">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <span>{language === "es" ? "Requisición de Inventario (SR)" : "Stock Requisition (SR)"}</span>
                    <Badge variant="secondary">
                      {purchaseData.stock_requisition?.length || 0}
                    </Badge>
                  </CardTitle>
                  {(purchaseData.stock_requisition?.length || 0) > 0 && (
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handlePrintSR}
                        className="h-8"
                      >
                        <Printer className="w-4 h-4 mr-1" />
                        {language === "es" ? "Imprimir" : "Print"}
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={() => setSrDialogOpen(true)}
                        className="h-8 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <PackageMinus className="w-4 h-4 mr-1" />
                        {language === "es" ? "Procesar SR" : "Process SR"}
                      </Button>
                    </div>
                  )}
                </div>
                <CardDescription>
                  {language === "es" ? "Items disponibles en inventario actual" : "Items available from current inventory"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(purchaseData.stock_requisition?.length || 0) > 0 ? (
                  <>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {purchaseData.stock_requisition.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-background rounded border text-sm">
                          <span className="font-medium">{item.item_name || item.name}</span>
                          <div className="text-right">
                            <span className="font-mono">{(item.in_stock || item.quantity_needed || 0).toFixed(1)} {item.unit}</span>
                            <span className="text-xs text-emerald-600 ml-2">✓</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* SR Total Value */}
                    <div className="mt-3 pt-3 border-t border-emerald-200 flex justify-between items-center">
                      <span className="text-sm font-medium text-emerald-700">
                        {language === "es" ? "Valor del Inventario Usado:" : "Inventory Value Used:"}
                      </span>
                      <span className="text-lg font-bold text-emerald-700">
                        ${purchaseData.stock_requisition.reduce((sum, item) => 
                          sum + (item.total_cost || ((item.in_stock || 0) * (item.unit_cost || 0))), 0
                        ).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {language === "es" ? "No hay items cubiertos por inventario" : "No items covered by inventory"}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Purchase List (PL) - Items to Buy */}
            <Card className="border-amber-200 bg-amber-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-amber-600" />
                  <span>{language === "es" ? "Lista de Compras (PL)" : "Purchase List (PL)"}</span>
                  <Badge variant="secondary" className="ml-auto">
                    {purchaseData.purchase_list?.length || 0}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {language === "es" ? "Items que necesitan ser comprados" : "Items that need to be purchased"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(purchaseData.purchase_list?.length || 0) > 0 ? (
                  <>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {purchaseData.purchase_list.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-background rounded border text-sm">
                          <span className="font-medium">{item.item_name || item.name}</span>
                          <div className="text-right">
                            <span className="font-mono text-amber-700">{(item.to_purchase || item.shortage || 0).toFixed(1)} {item.unit}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              (${((item.to_purchase || item.shortage || 0) * (item.unit_cost || item.cost_per_unit || 0)).toFixed(2)})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* PL Total Cost */}
                    <div className="mt-3 pt-3 border-t border-amber-200 flex justify-between items-center">
                      <span className="text-sm font-medium text-amber-700">
                        {language === "es" ? "Total a Comprar:" : "Total to Purchase:"}
                      </span>
                      <span className="text-lg font-bold text-amber-700">
                        ${purchaseData.purchase_list.reduce((sum, item) => 
                          sum + ((item.to_purchase || item.shortage || 0) * (item.unit_cost || item.cost_per_unit || 0)), 0
                        ).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </span>
                    </div>
                    
                    {/* Create PO buttons by supplier - inside Purchase List card */}
                    {Object.entries(purchaseData.items_by_supplier || {}).filter(([id, items]) => 
                      items.some(i => i.to_purchase > 0) && id !== "no_supplier"
                    ).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-amber-200">
                        <p className="text-xs text-muted-foreground mb-2">
                          {language === "es" ? "Crear órdenes de compra:" : "Create purchase orders:"}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(purchaseData.items_by_supplier || {}).filter(([id, items]) => 
                            items.some(i => i.to_purchase > 0) && id !== "no_supplier"
                          ).map(([supplierId, items]) => (
                            <Button 
                              key={supplierId}
                              size="sm"
                              onClick={() => handleCreatePO(supplierId, items)}
                              disabled={creatingPO === supplierId || createdPOs[supplierId]}
                              className={`h-8 ${createdPOs[supplierId] 
                                ? "bg-green-600 hover:bg-green-600 cursor-not-allowed" 
                                : "bg-amber-600 hover:bg-amber-700"}`}
                            >
                              {creatingPO === supplierId ? (
                                <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                              ) : createdPOs[supplierId] ? (
                                <Check className="w-4 h-4 mr-1" />
                              ) : (
                                <FileText className="w-4 h-4 mr-1" />
                              )}
                              {createdPOs[supplierId] 
                                ? `${items[0]?.supplier_name || "Unknown"} ✓` 
                                : `${items[0]?.supplier_name || "Unknown"} ($${items.filter(i => i.to_purchase > 0).reduce((s, i) => s + i.total_cost, 0).toFixed(0)})`
                              }
                            </Button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {language === "es" 
                            ? "Las órdenes se enviarán a Vendor Orders como borradores" 
                            : "Orders will be sent to Vendor Orders as drafts"}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-emerald-600 text-center py-4">
                    {language === "es" ? "✓ Todo cubierto con inventario" : "✓ All covered by inventory"}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Production Needs (PN) - BASE/COMPONENT recipes to produce */}
          {(purchaseData.production_needs?.length || 0) > 0 && (
            <Card className="border-purple-200 bg-purple-50/30">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Factory className="w-5 h-5 text-purple-600" />
                    <span>{language === "es" ? "Necesidades de Producción (PN)" : "Production Needs (PN)"}</span>
                    <Badge variant="secondary" className="bg-purple-100">
                      {purchaseData.production_needs?.length || 0}
                    </Badge>
                  </CardTitle>
                  <Button 
                    size="sm" 
                    onClick={handleOpenProductionDialog}
                    className="h-8 bg-purple-600 hover:bg-purple-700"
                  >
                    <Factory className="w-4 h-4 mr-1" />
                    {language === "es" ? "Crear Lote" : "Create Batch"}
                  </Button>
                </div>
                <CardDescription>
                  {language === "es" 
                    ? "Recetas BASE/COMPONENT que necesitan ser producidas" 
                    : "BASE/COMPONENT recipes that need to be produced"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {purchaseData.production_needs.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-background rounded border text-sm">
                      <div className="flex items-center gap-2">
                        <ChefHat className="w-4 h-4 text-purple-500" />
                        <div>
                          <span className="font-medium">{item.recipe_name}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs py-0">
                              {item.recipe_type?.toUpperCase()}
                            </Badge>
                            <span>
                              {language === "es" ? "Usado en:" : "Used in:"} {item.dishes_using?.slice(0, 2).join(", ")}
                              {item.dishes_using?.length > 2 && ` +${item.dishes_using.length - 2}`}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          {item.in_stock > 0 && (
                            <span className="text-xs text-emerald-600">
                              {language === "es" ? "Stock:" : "Stock:"} {item.in_stock.toFixed(1)}
                            </span>
                          )}
                          <span className="font-mono text-purple-700 font-bold">
                            {item.to_produce.toFixed(1)} {item.unit}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          ${item.total_cost?.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* PN Total Cost */}
                <div className="mt-3 pt-3 border-t border-purple-200 flex justify-between items-center">
                  <span className="text-sm font-medium text-purple-700">
                    {language === "es" ? "Costo Total Producción:" : "Total Production Cost:"}
                  </span>
                  <span className="text-lg font-bold text-purple-700">
                    ${(purchaseData.production_total_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Procurement Summary Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                <span>{language === "es" ? "Resumen de Procurement" : "Procurement Summary"}</span>
              </CardTitle>
              <CardDescription>
                {language === "es" 
                  ? "Consolidación de compras y resumen de proveedores para los eventos seleccionados"
                  : "Consolidated purchasing and supplier overview for selected events"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Events included with more details */}
              <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-2">
                  {language === "es" ? "Eventos incluidos:" : "Events included:"}
                </p>
                <div className="space-y-2">
                  {purchaseData.events?.map((event, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg text-sm">
                      <div>
                        <span className="font-medium">{event.event_name}</span>
                        <span className="text-muted-foreground ml-2">({event.guest_count} {language === "es" ? "pers." : "guests"})</span>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <Calendar className="w-3 h-3" />
                          {event.date ? new Date(event.date).toLocaleDateString() : "TBD"}
                          {event.time && (
                            <>
                              <Clock className="w-3 h-3 ml-2" />
                              {event.time}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        {event.quoted_total > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {language === "es" ? "Inventariable:" : "Inventory Items:"} ${event.quoted_total.toLocaleString()}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cost Summary */}
              <div className="mb-4 p-3 bg-muted/30 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{language === "es" ? "Stock Requisition (SR):" : "Stock Requisition (SR):"}</span>
                  <span className="font-mono">${(purchaseData.sr_total_cost || purchaseData.stock_requisition?.reduce((sum, item) => sum + (item.total_cost || 0), 0) || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{language === "es" ? "Lista de Compras (PL):" : "Purchase List (PL):"}</span>
                  <span className="font-mono">${(purchaseData.total_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t pt-2">
                  <span>{language === "es" ? "Total Procurement:" : "Total Procurement:"}</span>
                  <span className="font-mono text-lg">
                    ${(purchaseData.grand_total || (purchaseData.sr_total_cost || 0) + (purchaseData.total_cost || 0)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </div>
              </div>

              {/* Quote vs Actual Comparison Alert */}
              {purchaseData.total_quoted > 0 && (
                <div className={`mb-4 p-3 rounded-lg border ${
                  (purchaseData.grand_total || 0) <= purchaseData.total_quoted 
                    ? "bg-emerald-50 border-emerald-200" 
                    : "bg-amber-50 border-amber-200"
                }`}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={`w-4 h-4 mt-0.5 ${
                      (purchaseData.grand_total || 0) <= purchaseData.total_quoted 
                        ? "text-emerald-600" 
                        : "text-amber-600"
                    }`} />
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${
                        (purchaseData.grand_total || 0) <= purchaseData.total_quoted 
                          ? "text-emerald-800" 
                          : "text-amber-800"
                      }`}>
                        {language === "es" ? "Comparación: Cotizado vs Costo Real" : "Comparison: Quoted vs Actual Cost"}
                      </p>
                      <p className="text-xs text-muted-foreground mb-2">
                        {language === "es" 
                          ? "Food, Bebidas, Desechables (todo lo inventariable)" 
                          : "Food, Beverages, Disposables (all inventory items)"}
                      </p>
                      <div className="mt-2 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{language === "es" ? "Cotizado (Inventariable):" : "Quoted (Inventory Items):"}</span>
                          <span className="font-mono font-medium">${purchaseData.total_quoted.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{language === "es" ? "Gasto Esperado:" : "Expected Spend:"}</span>
                          <span className="font-mono font-medium">${(purchaseData.grand_total || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                        <div className="flex justify-between border-t pt-1 mt-1">
                          <span className="font-medium">
                            {(purchaseData.grand_total || 0) <= purchaseData.total_quoted 
                              ? (language === "es" ? "Margen Estimado:" : "Estimated Margin:") 
                              : (language === "es" ? "Sobrecosto:" : "Overspend:")}
                          </span>
                          <span className={`font-mono font-bold ${
                            (purchaseData.grand_total || 0) <= purchaseData.total_quoted 
                              ? "text-emerald-700" 
                              : "text-red-600"
                          }`}>
                            {(purchaseData.grand_total || 0) <= purchaseData.total_quoted ? "+" : "-"}
                            ${Math.abs(purchaseData.total_quoted - (purchaseData.grand_total || 0)).toLocaleString(undefined, {minimumFractionDigits: 2})}
                            {" "}
                            ({(((purchaseData.total_quoted - (purchaseData.grand_total || 0)) / purchaseData.total_quoted) * 100).toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Mark Complete Button */}
              <div className="pt-4 border-t">
                <Button 
                  onClick={handleMarkComplete}
                  disabled={markingComplete}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {markingComplete ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {language === "es" ? "Procesando..." : "Processing..."}
                    </>
                  ) : (
                    <>
                      <Archive className="w-4 h-4 mr-2" />
                      {language === "es" ? "Marcar Procurement Completado" : "Mark Procurement Complete"}
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  {language === "es" 
                    ? "Este resumen es solo para referencia y auditoría. No afecta la contabilidad. El Stock afectó el gasto cuando entró al inventario, y las PO afectarán el gasto cuando se les agreguen las facturas."
                    : "This summary is for reference and audit purposes only. It does not affect accounting. Stock affected expenses when received into inventory, and POs will affect expenses when invoices are added."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      </TabsContent>

      {/* PROCESSED TAB */}
      <TabsContent value="processed" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              {language === "es" ? "Eventos con Compras Completadas" : "Events with Completed Procurement"}
            </CardTitle>
            <CardDescription>
              {language === "es" 
                ? "Eventos que ya tienen POs y requisiciones de inventario procesadas"
                : "Events that already have POs and inventory requisitions processed"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {processedEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Archive className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{language === "es" ? "No hay eventos procesados aún" : "No processed events yet"}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {processedEvents.map(event => (
                  <div 
                    key={event.event_id}
                    className="flex items-center justify-between p-4 rounded-lg border bg-green-50/50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <p className="font-medium">{event.name}</p>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {event.event_date ? new Date(event.event_date).toLocaleDateString() : "TBD"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {event.guest_count || 0} {language === "es" ? "personas" : "guests"}
                        </span>
                        {event.procurement_completed_at && (
                          <span className="text-xs text-green-600">
                            {language === "es" ? "Completado:" : "Completed:"} {new Date(event.procurement_completed_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      
                      {/* Procurement Summary */}
                      {event.procurement_history && (
                        <div className="flex gap-4 mt-2 text-xs">
                          {event.procurement_history.stock_requisition?.length > 0 && (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
                              SR: {event.procurement_history.stock_requisition.length} items
                            </Badge>
                          )}
                          {event.procurement_history.purchase_list?.length > 0 && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700">
                              PL: {event.procurement_history.purchase_list.length} items • ${event.procurement_history.total_cost?.toFixed(0)}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setViewingHistory(event)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        {language === "es" ? "Ver" : "View"}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleReopenEvent(event.event_id)}
                        className="text-amber-600 hover:text-amber-700"
                      >
                        <ArchiveRestore className="w-4 h-4 mr-1" />
                        {language === "es" ? "Reabrir" : "Reopen"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
      </Tabs>

      {/* Process SR Confirmation Dialog */}
      <Dialog open={srDialogOpen} onOpenChange={setSrDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageMinus className="w-5 h-5 text-emerald-600" />
              {language === "es" ? "Procesar Stock Requisition" : "Process Stock Requisition"}
            </DialogTitle>
            <DialogDescription>
              {language === "es" 
                ? "Esta acción deducirá los siguientes items del inventario. Esta operación no se puede deshacer."
                : "This action will deduct the following items from inventory. This operation cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-64 overflow-y-auto border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === "es" ? "Item" : "Item"}</TableHead>
                  <TableHead className="text-right">{language === "es" ? "Cantidad" : "Quantity"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseData?.stock_requisition?.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{item.item_name}</TableCell>
                    <TableCell className="text-right font-mono">
                      -{(item.in_stock || 0).toFixed(2)} {item.unit}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSrDialogOpen(false)} disabled={processingSR}>
              {language === "es" ? "Cancelar" : "Cancel"}
            </Button>
            <Button 
              onClick={handleProcessSR} 
              disabled={processingSR}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {processingSR ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {language === "es" ? "Procesando..." : "Processing..."}
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  {language === "es" ? "Confirmar y Deducir" : "Confirm & Deduct"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Procurement History Dialog */}
      <Dialog open={!!viewingHistory} onOpenChange={() => setViewingHistory(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {language === "es" ? "Historial de Compras" : "Procurement History"}: {viewingHistory?.name}
            </DialogTitle>
            <DialogDescription>
              {viewingHistory?.procurement_completed_at && (
                <span>
                  {language === "es" ? "Completado el" : "Completed on"} {new Date(viewingHistory.procurement_completed_at).toLocaleDateString()}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {/* Stock Requisition Summary */}
            {viewingHistory?.procurement_history?.stock_requisition?.length > 0 && (
              <div>
                <h4 className="font-medium text-emerald-700 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Stock Requisition (SR)
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">{language === "es" ? "Cantidad" : "Qty"}</TableHead>
                      <TableHead className="text-right">{language === "es" ? "Costo" : "Cost"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewingHistory.procurement_history.stock_requisition.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{item.item_name}</TableCell>
                        <TableCell className="text-right">{item.in_stock?.toFixed(1)} {item.unit}</TableCell>
                        <TableCell className="text-right">${item.total_cost?.toFixed(2) || "0.00"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            
            {/* Purchase List Summary */}
            {viewingHistory?.procurement_history?.purchase_list?.length > 0 && (
              <div>
                <h4 className="font-medium text-amber-700 mb-2 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" />
                  Purchase List (PL)
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">{language === "es" ? "Cantidad" : "Qty"}</TableHead>
                      <TableHead className="text-right">{language === "es" ? "Costo" : "Cost"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewingHistory.procurement_history.purchase_list.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{item.item_name}</TableCell>
                        <TableCell className="text-right">{item.to_purchase?.toFixed(1)} {item.unit}</TableCell>
                        <TableCell className="text-right">${item.total_cost?.toFixed(2) || "0.00"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="text-right mt-2 font-bold">
                  Total: ${viewingHistory.procurement_history.total_cost?.toFixed(2)}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingHistory(null)}>
              {language === "es" ? "Cerrar" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Production Batch from SR Dialog */}
      <Dialog open={productionDialogOpen} onOpenChange={setProductionDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Factory className="w-5 h-5 text-purple-600" />
              {language === "es" ? "Crear Lote de Producción desde SR" : "Create Production Batch from SR"}
            </DialogTitle>
            <DialogDescription>
              {language === "es" 
                ? "Recetas BASE/COMPONENT sugeridas basadas en los eventos seleccionados"
                : "Suggested BASE/COMPONENT recipes based on selected events"}
            </DialogDescription>
          </DialogHeader>

          {loadingSuggestions ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            </div>
          ) : suggestedProduction?.suggested_lines?.length > 0 ? (
            <div className="space-y-4">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === "es" ? "Receta" : "Recipe"}</TableHead>
                      <TableHead>{language === "es" ? "Tipo" : "Type"}</TableHead>
                      <TableHead className="text-right">{language === "es" ? "Cantidad" : "Qty"}</TableHead>
                      <TableHead>{language === "es" ? "Eventos" : "Events"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suggestedProduction.suggested_lines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium flex items-center gap-2">
                          <ChefHat className="w-4 h-4 text-muted-foreground" />
                          {line.recipe_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {line.recipe_type?.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Math.ceil(line.qty_needed)} {line.yield_unit}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {line.events_using?.slice(0, 2).map((e, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">{e}</Badge>
                            ))}
                            {line.events_using?.length > 2 && (
                              <Badge variant="secondary" className="text-xs">+{line.events_using.length - 2}</Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-purple-800 mb-1">
                  {language === "es" ? "Esto creará:" : "This will create:"}
                </p>
                <ul className="text-purple-700 space-y-1 text-sm">
                  <li>• {suggestedProduction.suggested_lines.length} {language === "es" ? "líneas de producción" : "production lines"}</li>
                  <li>• {language === "es" ? "Estado inicial: PLANNED" : "Initial status: PLANNED"}</li>
                  <li>• {language === "es" ? "Vinculado a eventos seleccionados" : "Linked to selected events"}</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <ChefHat className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{language === "es" ? "No se encontraron recetas BASE/COMPONENT" : "No BASE/COMPONENT recipes found"}</p>
              <p className="text-sm mt-2">
                {language === "es" 
                  ? "Asegúrate de que los eventos tengan menús con sub-recetas tipo base o componente"
                  : "Make sure events have menus with base or component type sub-recipes"}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setProductionDialogOpen(false)}>
              {language === "es" ? "Cancelar" : "Cancel"}
            </Button>
            {suggestedProduction?.suggested_lines?.length > 0 && (
              <Button 
                onClick={handleCreateProductionBatch}
                disabled={creatingBatch}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {creatingBatch ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {language === "es" ? "Creando..." : "Creating..."}
                  </>
                ) : (
                  <>
                    <Factory className="w-4 h-4 mr-2" />
                    {language === "es" ? "Crear Lote de Producción" : "Create Production Batch"}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
