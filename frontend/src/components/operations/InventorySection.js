import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { toast } from "sonner";
import { 
  Package, Plus, Edit, Trash2, Search, AlertTriangle, ShoppingCart,
  History, Upload, DollarSign, Archive, Clock, Loader2, Camera, 
  FileImage, Save, TrendingDown, TrendingUp, XCircle
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

// Operations Supplies types
const OPS_SUPPLY_TYPES = [
  { value: "equipment", label: "Equipment", labelEs: "Equipo" },
  { value: "disposable", label: "Disposables", labelEs: "Desechables" },
  { value: "event_supply", label: "Event Supplies", labelEs: "Suministros de Evento" },
];

// Default categories
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

export function InventorySection() {
  const { language } = useLanguage();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [suppliers] = useState([]); // Empty - ops supplies don't use suppliers
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
    purchase_date: "", useful_life_years: 5, depreciation_rate: 20,
    image_url: "", notes: ""
  });
  const [imageUploading, setImageUploading] = useState(false);
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
      costCenter: language === "es" ? "Centro de Costo" : "Cost Center",
      purchaseDate: language === "es" ? "Fecha de Compra" : "Purchase Date",
      usefulLife: language === "es" ? "Vida Útil (años)" : "Useful Life (years)",
      depreciation: language === "es" ? "Depreciación %" : "Depreciation %",
      settings: language === "es" ? "Configuración" : "Settings",
    };
    return translations[key] || key;
  }, [language]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [itemsRes, categoriesRes] = await Promise.all([
        axios.get(`${API}/api/inventory/ingredients`, { withCredentials: true }),
        axios.get(`${API}/api/settings/ops-categories`, { withCredentials: true }).catch(() => ({ data: null }))
      ]);
      // Filter only ops supply types
      const opsItems = (itemsRes.data || []).filter(item => 
        ["equipment", "disposable", "event_supply"].includes(item.inventory_type)
      );
      setItems(opsItems);
      // Use saved categories or defaults
      if (categoriesRes.data?.categories) {
        setCategories(categoriesRes.data.categories);
      }
    } catch (error) {
      toast.error("Error loading data");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

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
        pack_unit: itemForm.unit || "unit",
        replacement_cost: itemForm.replacement_cost || 0,
        cost_center: itemForm.cost_center || "operations",
        purchase_date: itemForm.purchase_date || null,
        useful_life_years: itemForm.useful_life_years || 5,
        depreciation_rate: itemForm.depreciation_rate || 20
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
      replacement_cost: item.replacement_cost || 0,
      cost_center: item.cost_center || "operations",
      purchase_date: item.purchase_date || "",
      useful_life_years: item.useful_life_years || 5,
      depreciation_rate: item.depreciation_rate || 20,
      image_url: item.image_url || "",
      notes: item.notes || ""
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
      pack_size: 1, replacement_cost: 0, cost_center: "operations",
      purchase_date: "", useful_life_years: 5, depreciation_rate: 20,
      image_url: "", notes: ""
    });
  };

  // Save categories to settings
  const handleSaveCategories = async () => {
    try {
      await axios.post(`${API}/api/settings/ops-categories`, { categories }, { withCredentials: true });
      toast.success(language === "es" ? "Categorías guardadas" : "Categories saved");
      setSettingsDialogOpen(false);
    } catch (error) {
      toast.error("Error saving categories");
    }
  };

  const handleAddCategory = () => {
    if (!newCategory.value || !newCategory.label) {
      toast.error(language === "es" ? "Completa los campos" : "Fill in all fields");
      return;
    }
    // Check if already exists
    if (categories.find(c => c.value === newCategory.value)) {
      toast.error(language === "es" ? "La categoría ya existe" : "Category already exists");
      return;
    }
    setCategories([...categories, { ...newCategory }]);
    setNewCategory({ value: "", label: "", labelEs: "" });
  };

  const handleRemoveCategory = (value) => {
    // Don't remove if items are using it
    if (items.some(i => i.category === value)) {
      toast.error(language === "es" ? "Hay items usando esta categoría" : "Items are using this category");
      return;
    }
    setCategories(categories.filter(c => c.value !== value));
  };

  // Calculate depreciation for an item
  const calculateDepreciation = (item) => {
    if (!item.purchase_date || item.inventory_type !== "equipment") return null;
    const purchaseDate = new Date(item.purchase_date);
    const now = new Date();
    const yearsOwned = (now - purchaseDate) / (365.25 * 24 * 60 * 60 * 1000);
    const totalCost = (item.cost_per_unit || 0) * (item.stock_quantity || 0);
    const annualDepreciation = totalCost * ((item.depreciation_rate || 20) / 100);
    const accumulatedDepreciation = Math.min(annualDepreciation * yearsOwned, totalCost);
    const currentValue = Math.max(0, totalCost - accumulatedDepreciation);
    return { totalCost, accumulatedDepreciation, currentValue, yearsOwned };
  };

  const getCostCenterLabel = (value) => {
    const cc = COST_CENTERS.find(c => c.value === value);
    return cc ? (language === "es" ? cc.labelEs : cc.label) : value;
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || item.inventory_type === typeFilter;
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    return matchesSearch && matchesType && matchesCategory;
  });

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
              <Button variant="outline" onClick={() => setSettingsDialogOpen(true)}>
                <Archive className="w-4 h-4 mr-2" />
                {t("settings")}
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
                {categories.map(cat => (
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
                  <TableHead>{t("costCenter")}</TableHead>
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
                    const depreciation = calculateDepreciation(item);
                    
                    return (
                      <TableRow key={item.ingredient_id} className={isLowStock ? "bg-red-50" : ""}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover border" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                                <Package className="w-5 h-5 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <span className="font-medium">{item.name}</span>
                              {isLowStock && <Badge variant="destructive" className="text-xs ml-2">Low</Badge>}
                              {item.notes && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{item.notes}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {OPS_SUPPLY_TYPES.find(t => t.value === item.inventory_type)?.[language === "es" ? "labelEs" : "label"] || item.inventory_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {categories.find(c => c.value === item.category)?.[language === "es" ? "labelEs" : "label"] || item.category}
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
                          <div className="flex flex-col items-end">
                            <span className="font-mono">${(item.cost_per_unit || 0).toFixed(2)}</span>
                            {depreciation && (
                              <span className="text-xs text-muted-foreground" title={`${language === "es" ? "Valor actual" : "Current value"}: $${depreciation.currentValue.toFixed(2)}`}>
                                {language === "es" ? "Dep:" : "Dep:"} ${depreciation.accumulatedDepreciation.toFixed(0)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {getCostCenterLabel(item.cost_center || "operations")}
                          </Badge>
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
                  {categories.map(cat => (
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
            
            {/* Cost Center */}
            <div className="col-span-2">
              <Label>{t("costCenter")}</Label>
              <Select value={itemForm.cost_center || "operations"} onValueChange={(v) => setItemForm({...itemForm, cost_center: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COST_CENTERS.map(cc => (
                    <SelectItem key={cc.value} value={cc.value}>
                      {language === "es" ? cc.labelEs : cc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Equipment-specific fields */}
            {itemForm.inventory_type === "equipment" && (
              <>
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
                
                {/* Depreciation fields */}
                <div className="col-span-2 border-t pt-3 mt-2">
                  <Label className="text-sm font-medium mb-2 block">
                    {language === "es" ? "📊 Depreciación (Activo Fijo)" : "📊 Depreciation (Fixed Asset)"}
                  </Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">{t("purchaseDate")}</Label>
                      <Input 
                        type="date" 
                        value={itemForm.purchase_date || ""} 
                        onChange={(e) => setItemForm({...itemForm, purchase_date: e.target.value})} 
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t("usefulLife")}</Label>
                      <Input 
                        type="number" 
                        value={itemForm.useful_life_years || 5} 
                        onChange={(e) => setItemForm({...itemForm, useful_life_years: parseInt(e.target.value) || 5})} 
                        min={1}
                        max={30}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t("depreciation")}</Label>
                      <Input 
                        type="number" 
                        value={itemForm.depreciation_rate || 20} 
                        onChange={(e) => setItemForm({...itemForm, depreciation_rate: parseFloat(e.target.value) || 20})} 
                        min={0}
                        max={100}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Image Upload Section */}
            <div className="col-span-2 border-t pt-3 mt-2">
              <Label className="flex items-center gap-2 mb-2">
                <Camera className="w-4 h-4" />
                {language === "es" ? "Foto del Item" : "Item Photo"}
              </Label>
              <div className="flex items-center gap-3">
                {itemForm.image_url ? (
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden border">
                    <img src={itemForm.image_url} alt={itemForm.name} className="w-full h-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => setItemForm({...itemForm, image_url: ""})}
                      className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-bl"
                    >
                      <XCircle className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground">
                    <FileImage className="w-6 h-6" />
                  </div>
                )}
                <div className="flex-1">
                  <Input 
                    type="url"
                    value={itemForm.image_url || ""} 
                    onChange={(e) => setItemForm({...itemForm, image_url: e.target.value})} 
                    placeholder={language === "es" ? "URL de la imagen" : "Image URL"}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {language === "es" ? "Pega una URL de imagen o sube a un servicio de imágenes" : "Paste an image URL or upload to an image hosting service"}
                  </p>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="col-span-2">
              <Label>{language === "es" ? "Notas" : "Notes"}</Label>
              <Input 
                value={itemForm.notes || ""} 
                onChange={(e) => setItemForm({...itemForm, notes: e.target.value})}
                placeholder={language === "es" ? "Notas adicionales..." : "Additional notes..."}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSaveItem}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Categories Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="w-5 h-5" />
              {language === "es" ? "Configuración de Categorías" : "Categories Settings"}
            </DialogTitle>
            <DialogDescription>
              {language === "es" ? "Administra las categorías de inventario operativo" : "Manage operations inventory categories"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Add new category */}
            <div className="p-3 border rounded-lg bg-muted/30">
              <Label className="text-sm font-medium mb-2 block">{language === "es" ? "Agregar Nueva Categoría" : "Add New Category"}</Label>
              <div className="grid grid-cols-3 gap-2">
                <Input 
                  placeholder="ID (ej: audio)" 
                  value={newCategory.value}
                  onChange={(e) => setNewCategory({...newCategory, value: e.target.value.toLowerCase().replace(/\s/g, "_")})}
                />
                <Input 
                  placeholder="English name" 
                  value={newCategory.label}
                  onChange={(e) => setNewCategory({...newCategory, label: e.target.value})}
                />
                <Input 
                  placeholder="Nombre español" 
                  value={newCategory.labelEs}
                  onChange={(e) => setNewCategory({...newCategory, labelEs: e.target.value})}
                />
              </div>
              <Button size="sm" className="mt-2" onClick={handleAddCategory}>
                <Plus className="w-4 h-4 mr-1" />
                {language === "es" ? "Agregar" : "Add"}
              </Button>
            </div>

            {/* Categories list */}
            <div className="border rounded-lg max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>English</TableHead>
                    <TableHead>Español</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map(cat => (
                    <TableRow key={cat.value}>
                      <TableCell className="font-mono text-xs">{cat.value}</TableCell>
                      <TableCell>{cat.label}</TableCell>
                      <TableCell>{cat.labelEs}</TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleRemoveCategory(cat.value)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSaveCategories}>
              <Save className="w-4 h-4 mr-2" />
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price History Dialog */}
      <Dialog open={!!priceHistoryDialog} onOpenChange={() => setPriceHistoryDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              {language === "es" ? "Historial de Costo" : "Cost History"} - {priceHistoryDialog?.name}
            </DialogTitle>
            <DialogDescription>
              {language === "es" ? "Historial de cambios de costo del activo" : "Asset cost change history"}
            </DialogDescription>
          </DialogHeader>
          {priceHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {language === "es" ? "No hay historial de costos" : "No cost history available"}
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === "es" ? "Fecha" : "Date"}</TableHead>
                    <TableHead>{language === "es" ? "Motivo" : "Reason"}</TableHead>
                    <TableHead className="text-right">{language === "es" ? "Costo Anterior" : "Old Cost"}</TableHead>
                    <TableHead className="text-right">{language === "es" ? "Nuevo Costo" : "New Cost"}</TableHead>
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

export function SupplierProductUpload({ suppliers, language, onSuccess, onCancel }) {
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

// ==================== MAIN PAGE ====================
