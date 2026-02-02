import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { 
  Package, Plus, Trash2, Save, Search, Truck, RefreshCw, 
  FileText, CheckCircle2, AlertTriangle, ExternalLink
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

const API = process.env.REACT_APP_BACKEND_URL;

export default function PackingListEditor({ eventId, language }) {
  const isEs = language === "es";
  const [packingItems, setPackingItems] = useState([]);
  const [availableItems, setAvailableItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [hasDeliveryNote, setHasDeliveryNote] = useState(false);
  const [deliveryNote, setDeliveryNote] = useState(null);

  const categories = [
    { value: "tables_chairs", label: isEs ? "Mesas y Sillas" : "Tables & Chairs" },
    { value: "linens", label: isEs ? "Mantelería" : "Linens" },
    { value: "serving", label: isEs ? "Equipo de Servicio" : "Serving Equipment" },
    { value: "kitchen", label: isEs ? "Equipo de Cocina" : "Kitchen Equipment" },
    { value: "decor", label: isEs ? "Decoración" : "Decor" },
    { value: "disposables", label: isEs ? "Desechables" : "Disposables" },
    { value: "cleaning", label: isEs ? "Limpieza" : "Cleaning" },
    { value: "packaging", label: isEs ? "Empaque" : "Packaging" },
    { value: "other", label: isEs ? "Otros" : "Other" },
  ];

  useEffect(() => {
    fetchData();
  }, [eventId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [packingRes, inventoryRes, noteRes] = await Promise.all([
        axios.get(`${API}/api/events/${eventId}/packing-list`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/inventory/ingredients`, { withCredentials: true }),
        axios.get(`${API}/api/delivery-notes?event_id=${eventId}`, { withCredentials: true }).catch(() => ({ data: [] }))
      ]);
      
      setPackingItems(packingRes.data || []);
      
      // Filter only operations supplies items (equipment, disposable, event_supply)
      const opsItems = (inventoryRes.data || []).filter(item => 
        ["equipment", "disposable", "event_supply"].includes(item.inventory_type)
      );
      setAvailableItems(opsItems);
      
      // Check for existing delivery note
      const notes = noteRes.data || [];
      const eventNote = notes.find(n => n.event_id === eventId);
      if (eventNote) {
        setHasDeliveryNote(true);
        setDeliveryNote(eventNote);
      }
    } catch (error) {
      console.error("Error:", error);
    }
    setLoading(false);
  };

  const handleAddItem = (item) => {
    // Check if already in list
    if (packingItems.find(p => p.inventory_item_id === item.ingredient_id)) {
      toast.error(isEs ? "Item ya está en la lista" : "Item already in list");
      return;
    }

    const newItem = {
      inventory_item_id: item.ingredient_id,
      name: item.name,
      inventory_type: item.inventory_type,
      category: item.category,
      quantity: 1,
      unit: item.unit,
      replacement_cost: item.replacement_cost || 0,
      notes: ""
    };

    setPackingItems([...packingItems, newItem]);
    toast.success(isEs ? "Item agregado" : "Item added");
  };

  const handleRemoveItem = (index) => {
    const updated = packingItems.filter((_, i) => i !== index);
    setPackingItems(updated);
  };

  const handleUpdateItem = (index, field, value) => {
    const updated = [...packingItems];
    updated[index][field] = value;
    setPackingItems(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/api/events/${eventId}/packing-list`, {
        items: packingItems
      }, { withCredentials: true });
      toast.success(isEs ? "Packing list guardado" : "Packing list saved");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error saving");
    }
    setSaving(false);
  };

  const handleCreateDeliveryNote = async () => {
    if (packingItems.length === 0) {
      toast.error(isEs ? "Agrega items primero" : "Add items first");
      return;
    }

    try {
      const res = await axios.post(`${API}/api/delivery-notes`, {
        event_id: eventId,
        items: packingItems.map(item => ({
          inventory_item_id: item.inventory_item_id,
          name: item.name,
          inventory_type: item.inventory_type,
          qty_out: item.quantity,
          replacement_cost: item.replacement_cost || 0,
          unit: item.unit
        }))
      }, { withCredentials: true });

      toast.success(isEs ? `Conduce ${res.data.note_number} creado` : `Delivery note ${res.data.note_number} created`);
      setHasDeliveryNote(true);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error creating delivery note");
    }
  };

  // Filter available items
  const filteredAvailable = availableItems.filter(item => {
    const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Group packing items by type
  const equipmentItems = packingItems.filter(i => i.inventory_type === "equipment");
  const disposableItems = packingItems.filter(i => i.inventory_type !== "equipment");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-500" />
            {isEs ? "Packing List / Lista de Montaje" : "Packing List / Setup List"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isEs 
              ? "Equipos, servicio, decoración - NO incluye comida" 
              : "Equipment, service, decor - Does NOT include food"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAddDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Agregar Items" : "Add Items"}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {isEs ? "Guardar" : "Save"}
          </Button>
        </div>
      </div>

      {/* Delivery Note Status */}
      {hasDeliveryNote ? (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-medium text-green-800">
                    {isEs ? "Conduce Creado" : "Delivery Note Created"}: {deliveryNote?.note_number}
                  </p>
                  <p className="text-sm text-green-600">
                    {isEs ? "Estado:" : "Status:"} {deliveryNote?.status === "returned" ? (isEs ? "Devuelto" : "Returned") : (isEs ? "Pendiente" : "Pending")}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href="/ops-supplies/checkin" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {isEs ? "Ver Conduce" : "View Note"}
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : packingItems.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Truck className="w-6 h-6 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800">
                    {isEs ? "Listo para crear Conduce" : "Ready to create Delivery Note"}
                  </p>
                  <p className="text-sm text-amber-600">
                    {packingItems.length} items • {equipmentItems.length} {isEs ? "equipos (regresan)" : "equipment (return)"} • {disposableItems.length} {isEs ? "desechables" : "disposables"}
                  </p>
                </div>
              </div>
              <Button onClick={handleCreateDeliveryNote} className="bg-amber-600 hover:bg-amber-700">
                <Truck className="w-4 h-4 mr-2" />
                {isEs ? "Crear Conduce" : "Create Delivery Note"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Packing List Items */}
      {packingItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-4">
              {isEs ? "No hay items en el packing list" : "No items in packing list"}
            </p>
            <Button variant="outline" onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {isEs ? "Agregar Items" : "Add Items"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Equipment Section */}
          {equipmentItems.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge className="bg-blue-600">{isEs ? "Equipo" : "Equipment"}</Badge>
                  <span className="text-sm font-normal text-muted-foreground">
                    ↩️ {isEs ? "Debe regresar" : "Must return"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isEs ? "Item" : "Item"}</TableHead>
                      <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
                      <TableHead className="text-center">{isEs ? "Cantidad" : "Qty"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Costo Rep." : "Rep. Cost"}</TableHead>
                      <TableHead>{isEs ? "Notas" : "Notes"}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {equipmentItems.map((item, idx) => {
                      const realIdx = packingItems.findIndex(p => p.inventory_item_id === item.inventory_item_id);
                      return (
                        <TableRow key={item.inventory_item_id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {categories.find(c => c.value === item.category)?.label || item.category}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleUpdateItem(realIdx, "quantity", parseInt(e.target.value) || 1)}
                              className="w-20 h-8 text-center"
                              min={1}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${(item.replacement_cost || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Input
                              value={item.notes || ""}
                              onChange={(e) => handleUpdateItem(realIdx, "notes", e.target.value)}
                              className="h-8"
                              placeholder={isEs ? "Notas..." : "Notes..."}
                            />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(realIdx)}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <div className="mt-3 pt-3 border-t flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">
                    {isEs ? "Total equipo:" : "Total equipment:"} {equipmentItems.length} items
                  </span>
                  <span className="font-medium text-blue-700">
                    {isEs ? "Costo reposición total:" : "Total replacement cost:"} $
                    {equipmentItems.reduce((sum, i) => sum + (i.quantity * (i.replacement_cost || 0)), 0).toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Disposables Section */}
          {disposableItems.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant="secondary">{isEs ? "Desechables / Suministros" : "Disposables / Supplies"}</Badge>
                  <span className="text-sm font-normal text-muted-foreground">
                    🚫 {isEs ? "No regresa" : "No return"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isEs ? "Item" : "Item"}</TableHead>
                      <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
                      <TableHead className="text-center">{isEs ? "Cantidad" : "Qty"}</TableHead>
                      <TableHead>{isEs ? "Notas" : "Notes"}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {disposableItems.map((item, idx) => {
                      const realIdx = packingItems.findIndex(p => p.inventory_item_id === item.inventory_item_id);
                      return (
                        <TableRow key={item.inventory_item_id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {categories.find(c => c.value === item.category)?.label || item.category}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleUpdateItem(realIdx, "quantity", parseInt(e.target.value) || 1)}
                              className="w-20 h-8 text-center"
                              min={1}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={item.notes || ""}
                              onChange={(e) => handleUpdateItem(realIdx, "notes", e.target.value)}
                              className="h-8"
                              placeholder={isEs ? "Notas..." : "Notes..."}
                            />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(realIdx)}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                  {isEs ? "Total desechables:" : "Total disposables:"} {disposableItems.length} items
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Add Items Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              {isEs ? "Agregar Items al Packing List" : "Add Items to Packing List"}
            </DialogTitle>
            <DialogDescription>
              {isEs 
                ? "Selecciona items de Operations Supplies para agregar" 
                : "Select items from Operations Supplies to add"}
            </DialogDescription>
          </DialogHeader>

          {/* Filters */}
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={isEs ? "Buscar..." : "Search..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEs ? "Todas" : "All"}</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Available Items List */}
          <div className="border rounded-lg max-h-80 overflow-y-auto">
            {filteredAvailable.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>{isEs ? "No hay items disponibles" : "No items available"}</p>
                <Button variant="link" size="sm" asChild>
                  <a href="/ops-supplies/inventory" target="_blank" rel="noopener noreferrer">
                    {isEs ? "Ir a Operations Supplies" : "Go to Operations Supplies"}
                  </a>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Item" : "Item"}</TableHead>
                    <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Disponible" : "Available"}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAvailable.map(item => {
                    const alreadyAdded = packingItems.find(p => p.inventory_item_id === item.ingredient_id);
                    const available = (item.stock_quantity || 0) - (item.reserved_quantity || 0);
                    
                    return (
                      <TableRow key={item.ingredient_id} className={alreadyAdded ? "bg-green-50" : ""}>
                        <TableCell>
                          <div>
                            <span className="font-medium">{item.name}</span>
                            <p className="text-xs text-muted-foreground">
                              {categories.find(c => c.value === item.category)?.label || item.category}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.inventory_type === "equipment" ? "default" : "secondary"}>
                            {item.inventory_type === "equipment" 
                              ? (isEs ? "Equipo ↩️" : "Equipment ↩️")
                              : (isEs ? "Desechable 🚫" : "Disposable 🚫")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          <span className={available <= 0 ? "text-red-600" : "text-green-600"}>
                            {available} {item.unit}
                          </span>
                        </TableCell>
                        <TableCell>
                          {alreadyAdded ? (
                            <Badge variant="outline" className="text-green-600">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              {isEs ? "Agregado" : "Added"}
                            </Badge>
                          ) : (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleAddItem(item)}
                              disabled={available <= 0}
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              {isEs ? "Agregar" : "Add"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              {isEs ? "Cerrar" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
