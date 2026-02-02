import { useState, useEffect, useCallback } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { useLanguage } from "../contexts/LanguageContext";
import { Layout } from "../components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { toast } from "sonner";
import { 
  Package, Plus, Edit, Trash2, Search, AlertTriangle, ShoppingCart,
  Truck, ClipboardList, History, Upload, DollarSign, TrendingUp, TrendingDown,
  Archive, FileText, Building2, Calendar, Clock, CheckCircle2, XCircle, Save
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

// Operations Supplies types (equipment, disposables, event supplies)
const OPS_SUPPLY_TYPES = [
  { value: "equipment", label: "Equipment", labelEs: "Equipo" },
  { value: "disposable", label: "Disposables", labelEs: "Desechables" },
  { value: "event_supply", label: "Event Supplies", labelEs: "Suministros de Evento" },
];

// Default categories (can be overridden by company settings)
const DEFAULT_CATEGORIES = [
  { value: "tables_chairs", label: "Tables & Chairs", labelEs: "Mesas y Sillas" },
  { value: "linens", label: "Linens", labelEs: "Mantelería" },
  { value: "serving", label: "Serving Equipment", labelEs: "Equipo de Servicio" },
  { value: "kitchen", label: "Kitchen Equipment", labelEs: "Equipo de Cocina" },
  { value: "decor", label: "Decor", labelEs: "Decoración" },
  { value: "disposables", label: "Disposables", labelEs: "Desechables" },
  { value: "cleaning", label: "Cleaning", labelEs: "Limpieza" },
  { value: "packaging", label: "Packaging", labelEs: "Empaque" },
  { value: "transport", label: "Transport", labelEs: "Transporte" },
  { value: "audiovisual", label: "Audio/Visual", labelEs: "Audio/Visual" },
  { value: "other", label: "Other", labelEs: "Otros" },
];

// Cost Centers
const COST_CENTERS = [
  { value: "operations", label: "Operations", labelEs: "Operaciones" },
  { value: "kitchen", label: "Kitchen", labelEs: "Cocina" },
  { value: "service", label: "Service", labelEs: "Servicio" },
  { value: "logistics", label: "Logistics", labelEs: "Logística" },
  { value: "admin", label: "Administration", labelEs: "Administración" },
  { value: "other", label: "Other", labelEs: "Otros" },
];

// ==================== INVENTORY SECTION ====================
function InventorySection() {
  const { language } = useLanguage();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm, setItemForm] = useState({
    name: "", category: "other", inventory_type: "equipment", unit: "unit",
    cost_per_unit: 0, stock_quantity: 0, reserved_quantity: 0, par_level: 0, 
    pack_size: 1, replacement_cost: 0, cost_center: "operations",
    purchase_date: "", useful_life_years: 5, depreciation_rate: 20
  });
  const [priceHistoryDialog, setPriceHistoryDialog] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [newCategory, setNewCategory] = useState({ value: "", label: "", labelEs: "" });

  const t = useCallback((key) => {
    const translations = {
      inventory: language === "es" ? "Inventario de Operaciones" : "Operations Inventory",
      addItem: language === "es" ? "Agregar Item" : "Add Item",
      search: language === "es" ? "Buscar..." : "Search...",
      all: language === "es" ? "Todos" : "All",
      name: language === "es" ? "Nombre" : "Name",
      type: language === "es" ? "Tipo" : "Type",
      category: language === "es" ? "Categoría" : "Category",
      onHand: language === "es" ? "En Mano" : "On Hand",
      reserved: language === "es" ? "Reservado" : "Reserved",
      available: language === "es" ? "Disponible" : "Available",
      cost: language === "es" ? "Costo" : "Cost",
      supplier: language === "es" ? "Proveedor" : "Supplier",
      parLevel: language === "es" ? "Nivel Par" : "Par Level",
      unit: language === "es" ? "Unidad" : "Unit",
      save: language === "es" ? "Guardar" : "Save",
      cancel: language === "es" ? "Cancelar" : "Cancel",
      lowStock: language === "es" ? "Stock Bajo" : "Low Stock",
      uploadBySupplier: language === "es" ? "Subir por Proveedor" : "Upload by Supplier",
      priceHistory: language === "es" ? "Historial de Precios" : "Price History",
    };
    return translations[key] || key;
  }, [language]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [itemsRes, suppliersRes] = await Promise.all([
        axios.get(`${API}/api/inventory/ingredients`, { withCredentials: true }),
        axios.get(`${API}/api/suppliers`, { withCredentials: true })
      ]);
      // Filter only ops supply types
      const opsItems = (itemsRes.data || []).filter(item => 
        ["equipment", "disposable", "event_supply"].includes(item.inventory_type)
      );
      setItems(opsItems);
      setSuppliers(suppliersRes.data || []);
    } catch (error) {
      toast.error("Error loading data");
    }
    setLoading(false);
  };

  const handleSaveItem = async () => {
    try {
      // Prepare data with all required fields
      const saveData = {
        ...itemForm,
        min_stock_level: itemForm.par_level || 0,
        yield_waste_percent: 0,
        allergens: [],
        storage_location: "dry",
        reorder_threshold: 0,
        alternate_supplier_ids: [],
        pack_unit: itemForm.unit || "unit",
        replacement_cost: itemForm.replacement_cost || 0  // For equipment
      };
      
      if (editingItem) {
        await axios.put(`${API}/api/inventory/ingredients/${editingItem.ingredient_id}`, saveData, { withCredentials: true });
        toast.success(language === "es" ? "Item actualizado" : "Item updated");
      } else {
        await axios.post(`${API}/api/inventory/ingredients`, saveData, { withCredentials: true });
        toast.success(language === "es" ? "Item creado" : "Item created");
      }
      setItemDialogOpen(false);
      setEditingItem(null);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error saving item");
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm(language === "es" ? "¿Eliminar este item?" : "Delete this item?")) return;
    try {
      await axios.delete(`${API}/api/inventory/ingredients/${itemId}`, { withCredentials: true });
      toast.success(language === "es" ? "Item eliminado" : "Item deleted");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error deleting item");
    }
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    setItemForm({
      name: item.name || "",
      category: item.category || "other",
      inventory_type: item.inventory_type || "equipment",
      unit: item.unit || "unit",
      cost_per_unit: item.cost_per_unit || 0,
      stock_quantity: item.stock_quantity || 0,
      reserved_quantity: item.reserved_quantity || 0,
      par_level: item.par_level || 0,
      pack_size: item.pack_size || 1,
      preferred_supplier_id: item.preferred_supplier_id || "",
      replacement_cost: item.replacement_cost || 0
    });
    setItemDialogOpen(true);
  };

  const handleViewPriceHistory = async (item) => {
    setPriceHistoryDialog(item);
    try {
      const res = await axios.get(`${API}/api/inventory/ingredients/${item.ingredient_id}/price-history`, { withCredentials: true });
      setPriceHistory(res.data || []);
    } catch (error) {
      setPriceHistory([]);
    }
  };

  const resetForm = () => {
    setItemForm({
      name: "", category: "other", inventory_type: "equipment", unit: "unit",
      cost_per_unit: 0, stock_quantity: 0, reserved_quantity: 0, par_level: 0, 
      pack_size: 1, preferred_supplier_id: "", replacement_cost: 0
    });
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || item.inventory_type === typeFilter;
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    return matchesSearch && matchesType && matchesCategory;
  });

  const getSupplierName = (supplierId) => {
    const supplier = suppliers.find(s => s.supplier_id === supplierId);
    return supplier?.name || "-";
  };

  // Calculate stats
  const totalValue = items.reduce((sum, item) => sum + ((item.stock_quantity || 0) * (item.cost_per_unit || 0)), 0);
  const lowStockItems = items.filter(item => (item.stock_quantity || 0) <= (item.par_level || 0));
  const reservedValue = items.reduce((sum, item) => sum + ((item.reserved_quantity || 0) * (item.cost_per_unit || 0)), 0);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-pulse">Loading...</div></div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{language === "es" ? "Items Totales" : "Total Items"}</p>
                <p className="text-2xl font-bold">{items.length}</p>
              </div>
              <Package className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{language === "es" ? "Valor Total" : "Total Value"}</p>
                <p className="text-2xl font-bold">${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{language === "es" ? "Valor Reservado" : "Reserved Value"}</p>
                <p className="text-2xl font-bold text-amber-600">${reservedValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
              </div>
              <Clock className="w-8 h-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className={lowStockItems.length > 0 ? "border-red-200 bg-red-50/50" : ""}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("lowStock")}</p>
                <p className="text-2xl font-bold text-red-600">{lowStockItems.length}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Inventory Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                {t("inventory")}
              </CardTitle>
              <CardDescription>
                {language === "es" ? "Equipo, desechables y suministros de evento" : "Equipment, disposables, and event supplies"}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setUploadDialogOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                {t("uploadBySupplier")}
              </Button>
              <Button onClick={() => { setEditingItem(null); resetForm(); setItemDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                {t("addItem")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder={t("search")} 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                {OPS_SUPPLY_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {language === "es" ? type.labelEs : type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {language === "es" ? cat.labelEs : cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Items Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("type")}</TableHead>
                  <TableHead>{t("category")}</TableHead>
                  <TableHead className="text-right">{t("onHand")}</TableHead>
                  <TableHead className="text-right">{t("reserved")}</TableHead>
                  <TableHead className="text-right">{t("available")}</TableHead>
                  <TableHead className="text-right">{t("cost")}</TableHead>
                  <TableHead>{t("supplier")}</TableHead>
                  <TableHead className="text-right">{language === "es" ? "Acciones" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {language === "es" ? "No hay items" : "No items found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map(item => {
                    const onHand = item.stock_quantity || 0;
                    const reserved = item.reserved_quantity || 0;
                    const available = onHand - reserved;
                    const isLowStock = onHand <= (item.par_level || 0);
                    const hasReserved = reserved > 0;
                    
                    return (
                      <TableRow key={item.ingredient_id} className={isLowStock ? "bg-red-50" : ""}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {item.name}
                            {isLowStock && <Badge variant="destructive" className="text-xs">Low</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {OPS_SUPPLY_TYPES.find(t => t.value === item.inventory_type)?.[language === "es" ? "labelEs" : "label"] || item.inventory_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {CATEGORIES.find(c => c.value === item.category)?.[language === "es" ? "labelEs" : "label"] || item.category}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono">{onHand} {item.unit}</TableCell>
                        <TableCell className="text-right">
                          {hasReserved ? (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                              {reserved} {item.unit}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono ${available <= 0 ? "text-red-600 font-bold" : available < (item.par_level || 0) ? "text-amber-600" : "text-green-600"}`}>
                            {available} {item.unit}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-auto p-0 font-mono hover:underline"
                            onClick={() => handleViewPriceHistory(item)}
                          >
                            ${(item.cost_per_unit || 0).toFixed(2)}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{getSupplierName(item.preferred_supplier_id)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEditItem(item)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteItem(item.ingredient_id)}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Low Stock Alerts */}
      {lowStockItems.length > 0 && (
        <Card className="border-red-200 bg-red-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              {language === "es" ? "Alertas de Stock Bajo" : "Low Stock Alerts"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {lowStockItems.map(item => (
                <div key={item.ingredient_id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-red-200">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {language === "es" ? "En mano:" : "On hand:"} {item.stock_quantity || 0} / {language === "es" ? "Par:" : "Par:"} {item.par_level || 0}
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    <ShoppingCart className="w-4 h-4 mr-1" />
                    {language === "es" ? "Ordenar" : "Order"}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Item Dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingItem 
                ? (language === "es" ? "Editar Item" : "Edit Item")
                : (language === "es" ? "Agregar Item" : "Add Item")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>{t("name")}</Label>
              <Input value={itemForm.name} onChange={(e) => setItemForm({...itemForm, name: e.target.value})} />
            </div>
            <div>
              <Label>{t("type")}</Label>
              <Select value={itemForm.inventory_type} onValueChange={(v) => setItemForm({...itemForm, inventory_type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPS_SUPPLY_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {language === "es" ? type.labelEs : type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("category")}</Label>
              <Select value={itemForm.category} onValueChange={(v) => setItemForm({...itemForm, category: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {language === "es" ? cat.labelEs : cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("unit")}</Label>
              <Input value={itemForm.unit} onChange={(e) => setItemForm({...itemForm, unit: e.target.value})} />
            </div>
            <div>
              <Label>{t("cost")}</Label>
              <Input type="number" step="0.01" value={itemForm.cost_per_unit} onChange={(e) => setItemForm({...itemForm, cost_per_unit: parseFloat(e.target.value) || 0})} />
            </div>
            <div>
              <Label>{t("onHand")}</Label>
              <Input type="number" value={itemForm.stock_quantity} onChange={(e) => setItemForm({...itemForm, stock_quantity: parseFloat(e.target.value) || 0})} />
            </div>
            <div>
              <Label>{t("parLevel")}</Label>
              <Input type="number" value={itemForm.par_level} onChange={(e) => setItemForm({...itemForm, par_level: parseFloat(e.target.value) || 0})} />
            </div>
            {/* Replacement Cost - only for equipment */}
            {itemForm.inventory_type === "equipment" && (
              <div className="col-span-2">
                <Label className="flex items-center gap-2">
                  {language === "es" ? "Costo de Reposición" : "Replacement Cost"}
                  <Badge variant="outline" className="text-xs">{language === "es" ? "Si se pierde/rompe" : "If lost/broken"}</Badge>
                </Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  value={itemForm.replacement_cost || ""} 
                  onChange={(e) => setItemForm({...itemForm, replacement_cost: parseFloat(e.target.value) || 0})} 
                  placeholder={language === "es" ? "Ej: $150.00" : "E.g., $150.00"}
                />
              </div>
            )}
            <div className="col-span-2">
              <Label>{t("supplier")}</Label>
              <Select value={itemForm.preferred_supplier_id || "none"} onValueChange={(v) => setItemForm({...itemForm, preferred_supplier_id: v === "none" ? "" : v})}>
                <SelectTrigger><SelectValue placeholder={language === "es" ? "Seleccionar proveedor" : "Select supplier"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{language === "es" ? "Sin proveedor" : "No supplier"}</SelectItem>
                  {suppliers.map(s => (
                    <SelectItem key={s.supplier_id} value={s.supplier_id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSaveItem}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price History Dialog */}
      <Dialog open={!!priceHistoryDialog} onOpenChange={() => setPriceHistoryDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              {t("priceHistory")} - {priceHistoryDialog?.name}
            </DialogTitle>
            <DialogDescription>
              {language === "es" ? "Historial de cambios de precio por proveedor" : "Price change history by supplier"}
            </DialogDescription>
          </DialogHeader>
          {priceHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {language === "es" ? "No hay historial de precios" : "No price history available"}
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === "es" ? "Fecha" : "Date"}</TableHead>
                    <TableHead>{language === "es" ? "Proveedor" : "Supplier"}</TableHead>
                    <TableHead className="text-right">{language === "es" ? "Precio Anterior" : "Old Price"}</TableHead>
                    <TableHead className="text-right">{language === "es" ? "Nuevo Precio" : "New Price"}</TableHead>
                    <TableHead className="text-right">{language === "es" ? "Cambio" : "Change"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceHistory.map((entry, idx) => {
                    const change = entry.new_price - entry.old_price;
                    const changePercent = entry.old_price > 0 ? ((change / entry.old_price) * 100).toFixed(1) : 0;
                    return (
                      <TableRow key={idx}>
                        <TableCell>{new Date(entry.date).toLocaleDateString()}</TableCell>
                        <TableCell>{entry.supplier_name || "-"}</TableCell>
                        <TableCell className="text-right font-mono">${entry.old_price?.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">${entry.new_price?.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <span className={`flex items-center justify-end gap-1 ${change > 0 ? "text-red-600" : change < 0 ? "text-green-600" : ""}`}>
                            {change > 0 ? <TrendingUp className="w-3 h-3" /> : change < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                            {change > 0 ? "+" : ""}{changePercent}%
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload by Supplier Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              {t("uploadBySupplier")}
            </DialogTitle>
            <DialogDescription>
              {language === "es" 
                ? "Agrega productos manualmente o sube un archivo CSV" 
                : "Add products manually or upload a CSV file"}
            </DialogDescription>
          </DialogHeader>
          <SupplierProductUpload 
            suppliers={suppliers} 
            language={language}
            onSuccess={() => {
              setUploadDialogOpen(false);
              fetchData();
            }}
            onCancel={() => setUploadDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Supplier Product Upload Component
function SupplierProductUpload({ suppliers, language, onSuccess, onCancel }) {
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [mode, setMode] = useState("manual"); // "manual" or "csv"
  const [products, setProducts] = useState([{ name: "", category: "other", inventory_type: "equipment", unit: "unit", cost_per_unit: 0, stock_quantity: 0 }]);
  const [uploading, setUploading] = useState(false);
  const [csvData, setCsvData] = useState(null);

  const addProduct = () => {
    setProducts([...products, { name: "", category: "other", inventory_type: "equipment", unit: "unit", cost_per_unit: 0, stock_quantity: 0 }]);
  };

  const removeProduct = (index) => {
    setProducts(products.filter((_, i) => i !== index));
  };

  const updateProduct = (index, field, value) => {
    const updated = [...products];
    updated[index][field] = value;
    setProducts(updated);
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n').filter(line => line.trim());
      
      // Skip header if present
      const dataLines = lines[0].toLowerCase().includes('name') ? lines.slice(1) : lines;
      
      const parsed = dataLines.map(line => {
        const cols = line.split(',').map(c => c.trim());
        return {
          name: cols[0] || "",
          inventory_type: cols[1] || "equipment",
          category: cols[2] || "other",
          unit: cols[3] || "unit",
          cost_per_unit: parseFloat(cols[4]) || 0,
          stock_quantity: parseFloat(cols[5]) || 0
        };
      }).filter(p => p.name);

      setCsvData(parsed);
      setProducts(parsed.length > 0 ? parsed : products);
    };
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    if (!selectedSupplier) {
      toast.error(language === "es" ? "Selecciona un proveedor" : "Select a supplier");
      return;
    }

    const validProducts = products.filter(p => p.name?.trim());
    if (validProducts.length === 0) {
      toast.error(language === "es" ? "Agrega al menos un producto" : "Add at least one product");
      return;
    }

    setUploading(true);
    try {
      const res = await axios.post(`${API}/api/inventory/bulk-upload-by-supplier`, {
        supplier_id: selectedSupplier,
        products: validProducts
      }, { withCredentials: true });

      toast.success(
        language === "es" 
          ? `${res.data.created} creados, ${res.data.updated} actualizados, ${res.data.price_changes} cambios de precio`
          : `${res.data.created} created, ${res.data.updated} updated, ${res.data.price_changes} price changes`
      );
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error uploading products");
    }
    setUploading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>{language === "es" ? "Proveedor" : "Supplier"}</Label>
        <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
          <SelectTrigger>
            <SelectValue placeholder={language === "es" ? "Seleccionar proveedor" : "Select supplier"} />
          </SelectTrigger>
          <SelectContent>
            {suppliers.map(s => (
              <SelectItem key={s.supplier_id} value={s.supplier_id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2">
        <Button 
          variant={mode === "manual" ? "default" : "outline"} 
          size="sm"
          onClick={() => setMode("manual")}
        >
          {language === "es" ? "Manual" : "Manual"}
        </Button>
        <Button 
          variant={mode === "csv" ? "default" : "outline"} 
          size="sm"
          onClick={() => setMode("csv")}
        >
          CSV
        </Button>
      </div>

      {mode === "csv" ? (
        <div className="border-2 border-dashed rounded-lg p-6 text-center">
          <Upload className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
            id="csv-upload"
          />
          <label htmlFor="csv-upload">
            <Button variant="outline" size="sm" asChild>
              <span>{language === "es" ? "Seleccionar CSV" : "Select CSV"}</span>
            </Button>
          </label>
          <p className="text-xs text-muted-foreground mt-2">
            {language === "es" 
              ? "Columnas: nombre, tipo, categoría, unidad, costo, cantidad" 
              : "Columns: name, type, category, unit, cost, quantity"}
          </p>
          {csvData && (
            <Badge variant="secondary" className="mt-2">
              {csvData.length} {language === "es" ? "productos cargados" : "products loaded"}
            </Badge>
          )}
        </div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {products.map((product, index) => (
            <div key={index} className="grid grid-cols-12 gap-2 items-center p-2 border rounded-lg bg-muted/30">
              <div className="col-span-3">
                <Input 
                  placeholder={language === "es" ? "Nombre" : "Name"}
                  value={product.name}
                  onChange={(e) => updateProduct(index, "name", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-2">
                <Select 
                  value={product.inventory_type} 
                  onValueChange={(v) => updateProduct(index, "inventory_type", v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPS_SUPPLY_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{language === "es" ? t.labelEs : t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Input 
                  placeholder={language === "es" ? "Unidad" : "Unit"}
                  value={product.unit}
                  onChange={(e) => updateProduct(index, "unit", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-2">
                <Input 
                  type="number"
                  step="0.01"
                  placeholder={language === "es" ? "Costo" : "Cost"}
                  value={product.cost_per_unit || ""}
                  onChange={(e) => updateProduct(index, "cost_per_unit", parseFloat(e.target.value) || 0)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-2">
                <Input 
                  type="number"
                  placeholder={language === "es" ? "Cant." : "Qty"}
                  value={product.stock_quantity || ""}
                  onChange={(e) => updateProduct(index, "stock_quantity", parseFloat(e.target.value) || 0)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-1">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => removeProduct(index)}
                  disabled={products.length === 1}
                  className="h-8 w-8 p-0"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addProduct} className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            {language === "es" ? "Agregar Producto" : "Add Product"}
          </Button>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>{language === "es" ? "Cancelar" : "Cancel"}</Button>
        <Button onClick={handleSubmit} disabled={uploading || !selectedSupplier}>
          {uploading ? (
            <span className="animate-pulse">{language === "es" ? "Subiendo..." : "Uploading..."}</span>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              {language === "es" ? "Subir Productos" : "Upload Products"}
            </>
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ==================== PURCHASING SECTION ====================
function PurchasingSection() {
  const { language } = useLanguage();
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPurchaseOrders();
  }, []);

  const fetchPurchaseOrders = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/purchase-orders`, { withCredentials: true });
      // Filter only ops supply related POs (you might need to add a filter on the backend)
      setPurchaseOrders(res.data || []);
    } catch (error) {
      console.error("Error fetching purchase orders:", error);
    }
    setLoading(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-pulse">Loading...</div></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                {language === "es" ? "Órdenes de Compra" : "Purchase Orders"}
              </CardTitle>
              <CardDescription>
                {language === "es" ? "Gestión de compras de suministros de operaciones" : "Operations supplies purchase management"}
              </CardDescription>
            </div>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              {language === "es" ? "Nueva Orden" : "New Order"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {purchaseOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{language === "es" ? "No hay órdenes de compra" : "No purchase orders"}</p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === "es" ? "# Orden" : "Order #"}</TableHead>
                    <TableHead>{language === "es" ? "Proveedor" : "Supplier"}</TableHead>
                    <TableHead>{language === "es" ? "Fecha" : "Date"}</TableHead>
                    <TableHead className="text-right">{language === "es" ? "Total" : "Total"}</TableHead>
                    <TableHead>{language === "es" ? "Estado" : "Status"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrders.map(po => (
                    <TableRow key={po.po_id}>
                      <TableCell className="font-mono">{po.po_number}</TableCell>
                      <TableCell>{po.supplier_name}</TableCell>
                      <TableCell>{new Date(po.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right font-mono">${(po.total_amount || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={po.status === "received" ? "default" : po.status === "sent" ? "secondary" : "outline"}>
                          {po.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== CHECK-IN/CHECK-OUT SECTION (CONDUCES) ====================
function CheckInOutSection() {
  const { language } = useLanguage();
  const [deliveryNotes, setDeliveryNotes] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [packingListItems, setPackingListItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [viewingNote, setViewingNote] = useState(null);
  const [checkInDialogOpen, setCheckInDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [availableInventory, setAvailableInventory] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [notesRes, eventsRes] = await Promise.all([
        axios.get(`${API}/api/delivery-notes`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/events/confirmed`, { withCredentials: true }).catch(() => ({ data: [] }))
      ]);
      setDeliveryNotes(notesRes.data || []);
      setEvents(eventsRes.data || []);
    } catch (error) {
      console.error("Error:", error);
    }
    setLoading(false);
  };

  const handleEventSelect = async (eventId) => {
    setSelectedEvent(eventId);
    if (!eventId) {
      setPackingListItems([]);
      return;
    }
    
    try {
      // Get packing list items for this event (from ops supplies inventory)
      const res = await axios.get(`${API}/api/events/${eventId}/packing-list-supplies`, { withCredentials: true }).catch(() => ({ data: [] }));
      setPackingListItems(res.data || []);
      // Pre-select all items
      setSelectedItems(res.data?.map(item => ({
        ...item,
        qty_out: item.quantity || 1,
        qty_returned: 0,
        status: "pending"
      })) || []);
    } catch (error) {
      setPackingListItems([]);
    }
  };

  const handleCreateDeliveryNote = async () => {
    if (!selectedEvent || selectedItems.length === 0) {
      toast.error(language === "es" ? "Selecciona un evento e items" : "Select an event and items");
      return;
    }

    try {
      await axios.post(`${API}/api/delivery-notes`, {
        event_id: selectedEvent,
        items: selectedItems.map(item => ({
          inventory_item_id: item.inventory_item_id || item.ingredient_id,
          name: item.name,
          inventory_type: item.inventory_type,
          qty_out: item.qty_out,
          qty_returned: 0,
          replacement_cost: item.replacement_cost || 0,
          unit: item.unit
        }))
      }, { withCredentials: true });

      toast.success(language === "es" ? "Conduce creado" : "Delivery note created");
      setCreateDialogOpen(false);
      setSelectedEvent("");
      setSelectedItems([]);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error creating delivery note");
    }
  };

  const handleCheckIn = async (note) => {
    setViewingNote(note);
    setCheckInDialogOpen(true);
  };

  const handleSaveCheckIn = async () => {
    if (!viewingNote) return;

    try {
      await axios.put(`${API}/api/delivery-notes/${viewingNote.note_id}/check-in`, {
        items: viewingNote.items
      }, { withCredentials: true });

      toast.success(language === "es" ? "Check-in guardado" : "Check-in saved");
      setCheckInDialogOpen(false);
      setViewingNote(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error saving check-in");
    }
  };

  const updateCheckInItem = (index, field, value) => {
    if (!viewingNote) return;
    const updatedItems = [...viewingNote.items];
    updatedItems[index][field] = value;
    
    // Calculate loss if equipment
    if (updatedItems[index].inventory_type === "equipment") {
      const qtyOut = updatedItems[index].qty_out || 0;
      const qtyReturned = updatedItems[index].qty_returned || 0;
      const lost = Math.max(0, qtyOut - qtyReturned);
      updatedItems[index].qty_lost = lost;
      updatedItems[index].loss_cost = lost * (updatedItems[index].replacement_cost || 0);
    }
    
    setViewingNote({ ...viewingNote, items: updatedItems });
  };

  const getEventName = (eventId) => {
    const event = events.find(e => e.event_id === eventId);
    return event?.name || eventId;
  };

  const getStatusBadge = (note) => {
    if (note.status === "returned") {
      return <Badge className="bg-green-600">{language === "es" ? "Devuelto" : "Returned"}</Badge>;
    }
    if (note.status === "partial") {
      return <Badge variant="secondary" className="bg-amber-100 text-amber-800">{language === "es" ? "Parcial" : "Partial"}</Badge>;
    }
    return <Badge variant="outline">{language === "es" ? "Pendiente" : "Pending"}</Badge>;
  };

  // Open edit dialog for a delivery note
  const handleEditNote = async (note) => {
    if (note.status !== "pending") {
      toast.error(language === "es" ? "Solo se pueden editar conduces pendientes" : "Can only edit pending notes");
      return;
    }
    
    // Get available inventory
    try {
      const res = await axios.get(`${API}/api/inventory/ingredients`, { withCredentials: true });
      const opsItems = (res.data || []).filter(i => 
        ["equipment", "disposable", "event_supply"].includes(i.inventory_type)
      );
      setAvailableInventory(opsItems);
    } catch (error) {
      console.error("Error fetching inventory:", error);
    }
    
    setEditingNote({
      ...note,
      items: note.items.map(item => ({ ...item }))
    });
    setEditDialogOpen(true);
  };

  // Update an item in the editing note
  const updateEditingItem = (index, field, value) => {
    if (!editingNote) return;
    const updatedItems = [...editingNote.items];
    updatedItems[index][field] = value;
    setEditingNote({ ...editingNote, items: updatedItems });
  };

  // Add item to editing note
  const addItemToEditingNote = (invItem) => {
    if (!editingNote) return;
    
    // Check if already added
    if (editingNote.items.find(i => i.inventory_item_id === invItem.ingredient_id)) {
      toast.error(language === "es" ? "Item ya agregado" : "Item already added");
      return;
    }
    
    const newItem = {
      inventory_item_id: invItem.ingredient_id,
      name: invItem.name,
      inventory_type: invItem.inventory_type,
      category: invItem.category,
      qty_out: 1,
      qty_returned: 0,
      qty_lost: 0,
      loss_cost: 0,
      replacement_cost: invItem.replacement_cost || 0,
      unit: invItem.unit,
      notes: "",
      status: "pending"
    };
    
    setEditingNote({
      ...editingNote,
      items: [...editingNote.items, newItem]
    });
  };

  // Remove item from editing note
  const removeItemFromEditingNote = (index) => {
    if (!editingNote) return;
    const updatedItems = editingNote.items.filter((_, i) => i !== index);
    setEditingNote({ ...editingNote, items: updatedItems });
  };

  // Save edited delivery note
  const handleSaveEditedNote = async () => {
    if (!editingNote) return;
    
    try {
      await axios.put(`${API}/api/delivery-notes/${editingNote.note_id}`, {
        items: editingNote.items,
        notes: editingNote.notes
      }, { withCredentials: true });
      
      toast.success(language === "es" ? "Conduce actualizado" : "Delivery note updated");
      setEditDialogOpen(false);
      setEditingNote(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error updating note");
    }
  };

  // Cancel/Delete a delivery note
  const handleCancelNote = async (note) => {
    if (note.status !== "pending") {
      toast.error(language === "es" ? "Solo se pueden cancelar conduces pendientes" : "Can only cancel pending notes");
      return;
    }
    
    if (!window.confirm(language === "es" 
      ? "¿Seguro que quieres cancelar este conduce? Los items regresarán al inventario." 
      : "Are you sure you want to cancel this delivery note? Items will return to inventory.")) {
      return;
    }
    
    try {
      await axios.delete(`${API}/api/delivery-notes/${note.note_id}`, { withCredentials: true });
      toast.success(language === "es" ? "Conduce cancelado" : "Delivery note cancelled");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error cancelling note");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-pulse">Loading...</div></div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{language === "es" ? "Conduces Activos" : "Active Notes"}</p>
                <p className="text-2xl font-bold">{deliveryNotes.filter(n => n.status !== "returned").length}</p>
              </div>
              <Truck className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{language === "es" ? "Pendiente Devolución" : "Pending Return"}</p>
                <p className="text-2xl font-bold text-amber-600">
                  {deliveryNotes.filter(n => n.status === "pending").length}
                </p>
              </div>
              <Clock className="w-8 h-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{language === "es" ? "Pérdidas Acumuladas" : "Total Losses"}</p>
                <p className="text-2xl font-bold text-red-600">
                  ${deliveryNotes.reduce((sum, n) => sum + (n.total_loss_cost || 0), 0).toFixed(2)}
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5" />
                {language === "es" ? "Conduces de Evento" : "Event Delivery Notes"}
              </CardTitle>
              <CardDescription>
                {language === "es" 
                  ? "Control de salida y devolución de equipos y suministros" 
                  : "Track equipment and supplies check-out and return"}
              </CardDescription>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {language === "es" ? "Nuevo Conduce" : "New Delivery Note"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {deliveryNotes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{language === "es" ? "No hay conduces" : "No delivery notes"}</p>
              <p className="text-sm">{language === "es" ? "Crea uno desde un evento con packing list" : "Create one from an event with packing list"}</p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === "es" ? "# Conduce" : "Note #"}</TableHead>
                    <TableHead>{language === "es" ? "Evento" : "Event"}</TableHead>
                    <TableHead>{language === "es" ? "Fecha Salida" : "Check-out Date"}</TableHead>
                    <TableHead className="text-center">{language === "es" ? "Items" : "Items"}</TableHead>
                    <TableHead className="text-center">{language === "es" ? "Equipo" : "Equipment"}</TableHead>
                    <TableHead className="text-center">{language === "es" ? "Desechables" : "Disposables"}</TableHead>
                    <TableHead>{language === "es" ? "Estado" : "Status"}</TableHead>
                    <TableHead className="text-right">{language === "es" ? "Pérdida" : "Loss"}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveryNotes.map(note => {
                    const equipmentItems = note.items?.filter(i => i.inventory_type === "equipment") || [];
                    const disposableItems = note.items?.filter(i => i.inventory_type === "disposable" || i.inventory_type === "event_supply") || [];
                    
                    return (
                      <TableRow key={note.note_id}>
                        <TableCell className="font-mono">{note.note_number || note.note_id?.slice(-8)}</TableCell>
                        <TableCell className="font-medium">{getEventName(note.event_id)}</TableCell>
                        <TableCell>{note.checkout_date ? new Date(note.checkout_date).toLocaleDateString() : "-"}</TableCell>
                        <TableCell className="text-center">{note.items?.length || 0}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-blue-50">
                            {equipmentItems.length} <span className="text-xs ml-1">↩️</span>
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-gray-50">
                            {disposableItems.length} <span className="text-xs ml-1">🚫</span>
                          </Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(note)}</TableCell>
                        <TableCell className="text-right">
                          {note.total_loss_cost > 0 ? (
                            <span className="text-red-600 font-mono">${note.total_loss_cost.toFixed(2)}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {note.status === "pending" && (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => handleEditNote(note)} title={language === "es" ? "Editar" : "Edit"}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleCancelNote(note)} title={language === "es" ? "Cancelar" : "Cancel"}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            <Button variant="outline" size="sm" onClick={() => handleCheckIn(note)}>
                              {note.status === "returned" 
                                ? (language === "es" ? "Ver" : "View")
                                : (language === "es" ? "Check-in" : "Check-in")}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Delivery Note Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              {language === "es" ? "Nuevo Conduce" : "New Delivery Note"}
            </DialogTitle>
            <DialogDescription>
              {language === "es" 
                ? "Selecciona un evento para cargar items del packing list" 
                : "Select an event to load items from packing list"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>{language === "es" ? "Evento" : "Event"}</Label>
              <Select value={selectedEvent} onValueChange={handleEventSelect}>
                <SelectTrigger>
                  <SelectValue placeholder={language === "es" ? "Seleccionar evento" : "Select event"} />
                </SelectTrigger>
                <SelectContent>
                  {events.map(e => (
                    <SelectItem key={e.event_id} value={e.event_id}>
                      {e.name} - {e.event_date ? new Date(e.event_date).toLocaleDateString() : "TBD"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedItems.length > 0 && (
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === "es" ? "Item" : "Item"}</TableHead>
                      <TableHead>{language === "es" ? "Tipo" : "Type"}</TableHead>
                      <TableHead className="text-center">{language === "es" ? "Cantidad" : "Qty"}</TableHead>
                      <TableHead className="text-right">{language === "es" ? "Costo Rep." : "Rep. Cost"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedItems.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>
                          <Badge variant={item.inventory_type === "equipment" ? "default" : "secondary"}>
                            {item.inventory_type === "equipment" 
                              ? (language === "es" ? "Equipo ↩️" : "Equipment ↩️")
                              : (language === "es" ? "Desechable 🚫" : "Disposable 🚫")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            value={item.qty_out}
                            onChange={(e) => {
                              const updated = [...selectedItems];
                              updated[idx].qty_out = parseInt(e.target.value) || 0;
                              setSelectedItems(updated);
                            }}
                            className="w-20 h-8 text-center"
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {item.inventory_type === "equipment" 
                            ? `$${(item.replacement_cost || 0).toFixed(2)}`
                            : <span className="text-muted-foreground">N/A</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {selectedEvent && selectedItems.length === 0 && (
              <div className="text-center py-8 text-muted-foreground border rounded-lg">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>{language === "es" ? "No hay items de suministros en el packing list" : "No supply items in packing list"}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              {language === "es" ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreateDeliveryNote} disabled={!selectedEvent || selectedItems.length === 0}>
              <Truck className="w-4 h-4 mr-2" />
              {language === "es" ? "Crear Conduce" : "Create Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Check-in Dialog */}
      <Dialog open={checkInDialogOpen} onOpenChange={setCheckInDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              {language === "es" ? "Check-in de Conduce" : "Delivery Note Check-in"}
            </DialogTitle>
            <DialogDescription>
              {language === "es" 
                ? "Registra la devolución de equipos. Los desechables no requieren devolución." 
                : "Record equipment returns. Disposables don't require return."}
            </DialogDescription>
          </DialogHeader>

          {viewingNote && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <div><strong>{language === "es" ? "Evento:" : "Event:"}</strong> {getEventName(viewingNote.event_id)}</div>
                <div><strong>{language === "es" ? "Salida:" : "Check-out:"}</strong> {viewingNote.checkout_date ? new Date(viewingNote.checkout_date).toLocaleDateString() : "-"}</div>
              </div>

              <div className="border rounded-lg max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === "es" ? "Item" : "Item"}</TableHead>
                      <TableHead>{language === "es" ? "Tipo" : "Type"}</TableHead>
                      <TableHead className="text-center">{language === "es" ? "Salió" : "Out"}</TableHead>
                      <TableHead className="text-center">{language === "es" ? "Devuelto" : "Returned"}</TableHead>
                      <TableHead className="text-center">{language === "es" ? "Perdido" : "Lost"}</TableHead>
                      <TableHead className="text-right">{language === "es" ? "Costo Pérdida" : "Loss Cost"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewingNote.items?.map((item, idx) => {
                      const isEquipment = item.inventory_type === "equipment";
                      const qtyLost = Math.max(0, (item.qty_out || 0) - (item.qty_returned || 0));
                      const lossCost = isEquipment ? qtyLost * (item.replacement_cost || 0) : 0;
                      
                      return (
                        <TableRow key={idx} className={!isEquipment ? "bg-gray-50" : ""}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>
                            <Badge variant={isEquipment ? "default" : "secondary"}>
                              {isEquipment 
                                ? (language === "es" ? "Equipo ↩️" : "Equipment ↩️")
                                : (language === "es" ? "Desechable 🚫" : "Disposable 🚫")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-mono">{item.qty_out}</TableCell>
                          <TableCell className="text-center">
                            {isEquipment ? (
                              <Input
                                type="number"
                                value={item.qty_returned || 0}
                                onChange={(e) => updateCheckInItem(idx, "qty_returned", parseInt(e.target.value) || 0)}
                                className="w-20 h-8 text-center mx-auto"
                                max={item.qty_out}
                              />
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {isEquipment ? (
                              <span className={qtyLost > 0 ? "text-red-600 font-bold" : "text-green-600"}>
                                {qtyLost}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {isEquipment ? (
                              lossCost > 0 ? (
                                <span className="text-red-600">${lossCost.toFixed(2)}</span>
                              ) : (
                                <span className="text-green-600">$0.00</span>
                              )
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Summary */}
              <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                <span className="font-medium">{language === "es" ? "Total Pérdida:" : "Total Loss:"}</span>
                <span className={`text-xl font-bold ${
                  viewingNote.items?.reduce((sum, i) => {
                    if (i.inventory_type !== "equipment") return sum;
                    const lost = Math.max(0, (i.qty_out || 0) - (i.qty_returned || 0));
                    return sum + lost * (i.replacement_cost || 0);
                  }, 0) > 0 ? "text-red-600" : "text-green-600"
                }`}>
                  ${viewingNote.items?.reduce((sum, i) => {
                    if (i.inventory_type !== "equipment") return sum;
                    const lost = Math.max(0, (i.qty_out || 0) - (i.qty_returned || 0));
                    return sum + lost * (i.replacement_cost || 0);
                  }, 0).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckInDialogOpen(false)}>
              {language === "es" ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveCheckIn} className="bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {language === "es" ? "Guardar Check-in" : "Save Check-in"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Delivery Note Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5" />
              {language === "es" ? "Editar Conduce" : "Edit Delivery Note"}
              {editingNote && <Badge variant="outline" className="ml-2">{editingNote.note_number}</Badge>}
            </DialogTitle>
            <DialogDescription>
              {language === "es" 
                ? "Modifica los items antes de realizar el check-in. El inventario se ajustará automáticamente." 
                : "Modify items before check-in. Inventory will be adjusted automatically."}
            </DialogDescription>
          </DialogHeader>

          {editingNote && (
            <div className="space-y-4 flex-1 overflow-y-auto">
              {/* Event info */}
              <div className="flex gap-4 text-sm p-3 bg-muted/50 rounded-lg">
                <div><strong>{language === "es" ? "Evento:" : "Event:"}</strong> {getEventName(editingNote.event_id)}</div>
                <div><strong>{language === "es" ? "Salida:" : "Check-out:"}</strong> {editingNote.checkout_date ? new Date(editingNote.checkout_date).toLocaleDateString() : "-"}</div>
              </div>

              {/* Current Items */}
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  {language === "es" ? "Items en el Conduce" : "Items in Delivery Note"}
                  <Badge variant="secondary">{editingNote.items?.length || 0}</Badge>
                </h4>
                
                {editingNote.items?.length > 0 ? (
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{language === "es" ? "Item" : "Item"}</TableHead>
                          <TableHead>{language === "es" ? "Tipo" : "Type"}</TableHead>
                          <TableHead className="text-center">{language === "es" ? "Cantidad" : "Quantity"}</TableHead>
                          <TableHead>{language === "es" ? "Notas" : "Notes"}</TableHead>
                          <TableHead className="text-right">{language === "es" ? "Costo Reposición" : "Replace Cost"}</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {editingNote.items.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>
                              <Badge variant={item.inventory_type === "equipment" ? "default" : "secondary"}>
                                {item.inventory_type === "equipment" ? "↩️" : "🚫"} {item.inventory_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                value={item.qty_out || 0}
                                onChange={(e) => updateEditingItem(idx, "qty_out", parseInt(e.target.value) || 0)}
                                className="w-20 h-8 text-center"
                                min={1}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={item.notes || ""}
                                onChange={(e) => updateEditingItem(idx, "notes", e.target.value)}
                                placeholder={language === "es" ? "Notas..." : "Notes..."}
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              ${(item.replacement_cost || 0).toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-red-600 hover:text-red-700"
                                onClick={() => removeItemFromEditingNote(idx)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>{language === "es" ? "No hay items en el conduce" : "No items in delivery note"}</p>
                  </div>
                )}
              </div>

              {/* Add Items Section */}
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  {language === "es" ? "Agregar Items" : "Add Items"}
                </h4>
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === "es" ? "Item Disponible" : "Available Item"}</TableHead>
                        <TableHead>{language === "es" ? "Tipo" : "Type"}</TableHead>
                        <TableHead className="text-center">{language === "es" ? "Stock" : "Stock"}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {availableInventory
                        .filter(inv => !editingNote.items?.find(i => i.inventory_item_id === inv.ingredient_id))
                        .map(inv => (
                          <TableRow key={inv.ingredient_id}>
                            <TableCell className="font-medium">{inv.name}</TableCell>
                            <TableCell>
                              <Badge variant={inv.inventory_type === "equipment" ? "default" : "secondary"}>
                                {inv.inventory_type === "equipment" ? "↩️" : "🚫"} {inv.inventory_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">{inv.stock_quantity} {inv.unit}</TableCell>
                            <TableCell>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => addItemToEditingNote(inv)}
                                disabled={inv.stock_quantity <= 0}
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                {language === "es" ? "Agregar" : "Add"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label>{language === "es" ? "Notas del Conduce" : "Delivery Note Notes"}</Label>
                <Input
                  value={editingNote.notes || ""}
                  onChange={(e) => setEditingNote({ ...editingNote, notes: e.target.value })}
                  placeholder={language === "es" ? "Notas adicionales..." : "Additional notes..."}
                />
              </div>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); setEditingNote(null); }}>
              {language === "es" ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveEditedNote} disabled={!editingNote?.items?.length}>
              <Save className="w-4 h-4 mr-2" />
              {language === "es" ? "Guardar Cambios" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== MAIN PAGE ====================
export default function OperationsSuppliesPage() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  
  const tabs = [
    { id: "inventory", path: "/ops-supplies/inventory", label: language === "es" ? "Inventario" : "Inventory", icon: Package },
    { id: "purchasing", path: "/ops-supplies/purchasing", label: language === "es" ? "Compras" : "Purchasing", icon: ShoppingCart },
    { id: "checkin", path: "/ops-supplies/checkin", label: language === "es" ? "Conduces" : "Delivery Notes", icon: Truck },
    { id: "maintenance", path: "/ops-supplies/maintenance", label: language === "es" ? "Mantenimiento" : "Maintenance", icon: Archive, disabled: true, badge: "v2" },
  ];

  const currentTab = tabs.find(t => location.pathname.startsWith(t.path))?.id || "inventory";

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="w-6 h-6 text-indigo-600" />
              {language === "es" ? "Operations Supplies" : "Operations Supplies"}
            </h1>
            <p className="text-muted-foreground">
              {language === "es" 
                ? "Equipo, desechables y suministros para eventos" 
                : "Equipment, disposables, and event supplies"}
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="border-b">
          <nav className="flex gap-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && navigate(tab.path)}
                disabled={tab.disabled}
                className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
                  currentTab === tab.id 
                    ? "border-indigo-600 text-indigo-600" 
                    : tab.disabled 
                      ? "border-transparent text-muted-foreground/50 cursor-not-allowed"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.badge && (
                  <Badge variant="outline" className="text-xs ml-1">{tab.badge}</Badge>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Routes */}
        <Routes>
          <Route path="/" element={<InventorySection />} />
          <Route path="/inventory" element={<InventorySection />} />
          <Route path="/purchasing" element={<PurchasingSection />} />
          <Route path="/checkin" element={<CheckInOutSection />} />
          <Route path="/maintenance" element={<div className="text-center py-12 text-muted-foreground">Coming in v2</div>} />
        </Routes>
      </div>
    </Layout>
  );
}
