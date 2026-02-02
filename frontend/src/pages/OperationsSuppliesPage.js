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
  Archive, FileText, Building2, Calendar, Clock, CheckCircle2, XCircle
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

// Operations Supplies types (equipment, disposables, event supplies)
const OPS_SUPPLY_TYPES = [
  { value: "equipment", label: "Equipment", labelEs: "Equipo" },
  { value: "disposable", label: "Disposables", labelEs: "Desechables" },
  { value: "event_supply", label: "Event Supplies", labelEs: "Suministros de Evento" },
];

const CATEGORIES = [
  { value: "tables_chairs", label: "Tables & Chairs", labelEs: "Mesas y Sillas" },
  { value: "linens", label: "Linens", labelEs: "Mantelería" },
  { value: "serving", label: "Serving Equipment", labelEs: "Equipo de Servicio" },
  { value: "kitchen", label: "Kitchen Equipment", labelEs: "Equipo de Cocina" },
  { value: "decor", label: "Decor", labelEs: "Decoración" },
  { value: "disposables", label: "Disposables", labelEs: "Desechables" },
  { value: "cleaning", label: "Cleaning", labelEs: "Limpieza" },
  { value: "packaging", label: "Packaging", labelEs: "Empaque" },
  { value: "other", label: "Other", labelEs: "Otros" },
];

// ==================== INVENTORY SECTION ====================
function InventorySection() {
  const { language } = useLanguage();
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm, setItemForm] = useState({
    name: "", category: "other", inventory_type: "equipment", unit: "unit",
    cost_per_unit: 0, stock_quantity: 0, reserved_quantity: 0, par_level: 0, 
    pack_size: 1, preferred_supplier_id: "", replacement_cost: 0
  });
  const [priceHistoryDialog, setPriceHistoryDialog] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedSupplierForUpload, setSelectedSupplierForUpload] = useState("");

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
              <Select value={itemForm.preferred_supplier_id} onValueChange={(v) => setItemForm({...itemForm, preferred_supplier_id: v})}>
                <SelectTrigger><SelectValue placeholder={language === "es" ? "Seleccionar proveedor" : "Select supplier"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{language === "es" ? "Sin proveedor" : "No supplier"}</SelectItem>
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

// ==================== MAIN PAGE ====================
export default function OperationsSuppliesPage() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  
  const tabs = [
    { id: "inventory", path: "/ops-supplies/inventory", label: language === "es" ? "Inventario" : "Inventory", icon: Package },
    { id: "purchasing", path: "/ops-supplies/purchasing", label: language === "es" ? "Compras" : "Purchasing", icon: ShoppingCart },
    { id: "checkin", path: "/ops-supplies/checkin", label: "Check-in/out", icon: ClipboardList, disabled: true, badge: "v2" },
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
          <Route path="/checkin" element={<div className="text-center py-12 text-muted-foreground">Coming in v2</div>} />
          <Route path="/maintenance" element={<div className="text-center py-12 text-muted-foreground">Coming in v2</div>} />
        </Routes>
      </div>
    </Layout>
  );
}
