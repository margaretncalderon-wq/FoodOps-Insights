import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Layout } from "../components/Layout";
import { PhysicalCountSection } from "../components/culinary/PhysicalCountSection";
import ImportExportSection from "../components/settings/ImportExportSection";

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { SearchableSelect } from "../components/ui/searchable-select";
import { SortSelect, applySort, readStoredSort } from "../components/ui/sort-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";
import { Checkbox } from "../components/ui/checkbox";

// Custom Components
import RecipeBuilder from "../components/RecipeBuilder";
import PlatedMenuBuilder from "../components/PlatedMenuBuilder";
import IngredientWizard from "../components/culinary/IngredientWizard";
import CostHealthDashboard from "../components/CostHealthDashboard";
import BuffetFactorsDialog from "../components/BuffetFactorsDialog";
import MenuEngineeringDialog from "../components/MenuEngineeringDialog";
import CostVarianceDialog from "../components/CostVarianceDialog";
import CulinaryDigestDialog from "../components/CulinaryDigestDialog";
import RecipeImportDialog from "../components/RecipeImportDialog";

// Icons
import { 
  Package, Plus, Search, AlertTriangle, Truck, Edit, Trash2, 
  ArrowUpDown, DollarSign, Archive, ShoppingCart, ChefHat,
  UtensilsCrossed, RefreshCw, Copy, BookOpen, Layers, Beaker,
  Utensils, Menu as MenuIcon, ArrowLeft, History, Printer, CheckCircle,
  Factory, ClipboardList, FileUp, Sparkles, Wand2, Loader2, Sliders, TrendingUp, FileText, Mail
} from "lucide-react";

import { API_BASE as API } from "../utils/api"; // Dynamic API URL

// Culinary Intelligence inventory types (food-related only)
const INVENTORY_TYPES = [
  { value: "food", label: "Food", labelEs: "Alimentos" },
  { value: "packaging", label: "Packaging", labelEs: "Empaque" },
];

// Note: Equipment, Disposables, and Event Supplies have been moved to Operations Supplies module

// ==================== INVENTORY SECTION ====================
function InventorySection() {
  const { language } = useLanguage();
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("items");
  
  // Categories and brands from backend
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [brandSearch, setBrandSearch] = useState("");
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  
  // Dialogs
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [priceHistoryDialogOpen, setPriceHistoryDialogOpen] = useState(false);
  const [selectedItemForHistory, setSelectedItemForHistory] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  
  // Import Dialog State
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [importStep, setImportStep] = useState("select"); // "select", "preview", "result"
  
  // Ingredient Wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardInitial, setWizardInitial] = useState(null);
  const [reviewDrawerOpen, setReviewDrawerOpen] = useState(false);
  
  // Forms
  const [itemForm, setItemForm] = useState({
    name: "", brand: "", category: "dry_goods", inventory_type: "food", unit: "kg",
    cost_per_unit: 0, stock_quantity: 0, par_level: 0, pack_size: 1, 
    preferred_supplier_id: "", secondary_supplier_id: "",
    purchase_unit: "", purchase_pack_size: 1, sku: "", notes: "",
    // New rich fields
    description: "",
    storage_location: "dry",
    allergens: [],
    purchase_quantity_per_unit: 0,
    base_unit: "",
    purchase_cost: 0,
    yield_waste_percent: 0,
    non_yieldable: false,
  });
  const [allergensList, setAllergensList] = useState([]);
  
  const [supplierForm, setSupplierForm] = useState({
    name: "", contact_name: "", email: "", phone: "", notes: "",
    payment_terms: "cash", has_credit: false, credit_limit: 0
  });
  
  const [transactionForm, setTransactionForm] = useState({
    inventory_item_id: "", transaction_type: "Purchase", quantity: 0, notes: ""
  });

  const t = useCallback((key) => {
    const translations = {
      items: { en: "Items", es: "Artículos" },
      suppliers: { en: "Suppliers", es: "Proveedores" },
      transactions: { en: "Transactions", es: "Transacciones" },
      lowStock: { en: "Low Stock", es: "Stock Bajo" },
      addItem: { en: "Add Item", es: "Agregar Artículo" },
      addSupplier: { en: "Add Supplier", es: "Agregar Proveedor" },
      addTransaction: { en: "Add Transaction", es: "Agregar Transacción" },
      name: { en: "Name", es: "Nombre" },
      type: { en: "Type", es: "Tipo" },
      category: { en: "Category", es: "Categoría" },
      unit: { en: "Unit", es: "Unidad" },
      cost: { en: "Cost", es: "Costo" },
      stock: { en: "Stock", es: "Stock" },
      parLevel: { en: "Par Level", es: "Nivel Mínimo" },
      supplier: { en: "Supplier", es: "Proveedor" },
      save: { en: "Save", es: "Guardar" },
      cancel: { en: "Cancel", es: "Cancelar" },
      search: { en: "Search...", es: "Buscar..." },
      all: { en: "All", es: "Todos" },
      purchase: { en: "Purchase", es: "Compra" },
      usage: { en: "Usage", es: "Uso" },
      adjustment: { en: "Adjustment", es: "Ajuste" },
      waste: { en: "Waste", es: "Desperdicio" },
      quantity: { en: "Quantity", es: "Cantidad" },
      notes: { en: "Notes", es: "Notas" },
      email: { en: "Email", es: "Email" },
      phone: { en: "Phone", es: "Teléfono" },
      contact: { en: "Contact", es: "Contacto" },
    };
    return translations[key]?.[language] || translations[key]?.en || key;
  }, [language]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, suppliersRes, transactionsRes, categoriesRes, allergensRes] = await Promise.all([
        axios.get(`${API}/api/inventory/ingredients`, { withCredentials: true }),
        axios.get(`${API}/api/suppliers`, { withCredentials: true }),
        axios.get(`${API}/api/inventory/transactions`, { withCredentials: true }),
        axios.get(`${API}/api/settings/inventory-categories`, { withCredentials: true }),
        axios.get(`${API}/api/allergens`, { withCredentials: true }).catch(() => ({ data: [] })),
      ]);
      // Filter only culinary inventory types (food and packaging)
      const culinaryItems = (itemsRes.data || []).filter(item => 
        ["food", "packaging"].includes(item.inventory_type)
      );
      setItems(culinaryItems);
      setSuppliers(suppliersRes.data);
      setTransactions(transactionsRes.data);
      setCategories(categoriesRes.data || []);
      setAllergensList(allergensRes.data || []);
    } catch (error) {
      toast.error("Error loading data");
    }
    setLoading(false);
  }, []);

  // Fetch brands for autocomplete
  const fetchBrands = useCallback(async (query = "") => {
    try {
      const res = await axios.get(`${API}/api/settings/inventory-brands?q=${query}`, { withCredentials: true });
      setBrands(res.data || []);
    } catch (error) {
      console.error("Error fetching brands:", error);
    }
  }, []);

  useEffect(() => { fetchData(); fetchBrands(); }, [fetchData, fetchBrands]);

  const handleSaveItem = async () => {
    try {
      // Map non_yieldable + yield_waste_percent semantics: if non_yieldable=true and yield_waste_percent is 0, leave as-is (just a tag).
      const payload = { ...itemForm };
      if (editingItem) {
        await axios.put(`${API}/api/inventory/ingredients/${editingItem.ingredient_id}`, payload, { withCredentials: true });
      } else {
        await axios.post(`${API}/api/inventory/ingredients`, payload, { withCredentials: true });
      }
      toast.success(language === "es" ? "Guardado" : "Saved");
      setItemDialogOpen(false);
      setEditingItem(null);
      setItemForm(defaultItemForm());
      fetchData();
      fetchBrands(); // Refresh brands list after adding new item
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error");
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm(language === "es" ? "¿Eliminar?" : "Delete?")) return;
    try {
      await axios.delete(`${API}/api/inventory/ingredients/${itemId}`, { withCredentials: true });
      toast.success(language === "es" ? "Eliminado" : "Deleted");
      fetchData();
    } catch (error) {
      toast.error("Error");
    }
  };

  const defaultItemForm = () => ({
    name: "", brand: "", category: "dry_goods", inventory_type: "food", unit: "kg",
    cost_per_unit: 0, stock_quantity: 0, par_level: 0, pack_size: 1,
    preferred_supplier_id: "", secondary_supplier_id: "",
    purchase_unit: "", purchase_pack_size: 1, sku: "", notes: "",
    description: "", storage_location: "dry", allergens: [],
    purchase_quantity_per_unit: 0, base_unit: "", purchase_cost: 0,
    yield_waste_percent: 0, non_yieldable: false,
  });

  const handleEditItem = (item) => {
    setEditingItem(item);
    setItemForm({
      name: item.name || "", brand: item.brand || "", category: item.category || "dry_goods", inventory_type: item.inventory_type || "food",
      unit: item.unit || "kg", cost_per_unit: item.cost_per_unit || 0, stock_quantity: item.stock_quantity || 0,
      par_level: item.par_level || 0, pack_size: item.pack_size || 1, preferred_supplier_id: item.preferred_supplier_id || "",
      secondary_supplier_id: item.secondary_supplier_id || "", purchase_unit: item.purchase_unit || "",
      purchase_pack_size: item.purchase_pack_size || 1, sku: item.sku || "", notes: item.notes || "",
      description: item.description || "",
      storage_location: item.storage_location || "dry",
      allergens: Array.isArray(item.allergens) ? item.allergens : [],
      purchase_quantity_per_unit: item.purchase_quantity_per_unit || 0,
      base_unit: item.base_unit || "",
      purchase_cost: item.purchase_cost || 0,
      yield_waste_percent: item.yield_waste_percent || 0,
      non_yieldable: !!item.non_yieldable,
    });
    setBrandSearch(item.brand || "");
    setItemDialogOpen(true);
  };

  const handleViewPriceHistory = async (item) => {
    setSelectedItemForHistory(item);
    try {
      const res = await axios.get(`${API}/api/inventory/ingredients/${item.ingredient_id}/price-history`, { withCredentials: true });
      setPriceHistory(res.data.price_history || []);
      setPriceHistoryDialogOpen(true);
    } catch (error) {
      // If endpoint doesn't exist or no history, show empty
      setPriceHistory([]);
      setPriceHistoryDialogOpen(true);
    }
  };

  const handleSaveSupplier = async () => {
    try {
      if (editingSupplier) {
        await axios.put(`${API}/api/suppliers/${editingSupplier.supplier_id}`, supplierForm, { withCredentials: true });
      } else {
        await axios.post(`${API}/api/suppliers`, supplierForm, { withCredentials: true });
      }
      toast.success(language === "es" ? "Guardado" : "Saved");
      setSupplierDialogOpen(false);
      setEditingSupplier(null);
      setSupplierForm({ name: "", contact_name: "", email: "", phone: "", notes: "" });
      fetchData();
    } catch (error) {
      toast.error("Error");
    }
  };

  const handleDeleteSupplier = async (supplierId) => {
    if (!window.confirm(language === "es" ? "¿Eliminar?" : "Delete?")) return;
    try {
      await axios.delete(`${API}/api/suppliers/${supplierId}`, { withCredentials: true });
      toast.success(language === "es" ? "Eliminado" : "Deleted");
      fetchData();
    } catch (error) {
      toast.error("Error");
    }
  };

  const handleEditSupplier = (supplier) => {
    setEditingSupplier(supplier);
    setSupplierForm({
      name: supplier.name || "", contact_name: supplier.contact_name || "",
      email: supplier.email || "", phone: supplier.phone || "", notes: supplier.notes || ""
    });
    setSupplierDialogOpen(true);
  };

  const handleSaveTransaction = async () => {
    try {
      await axios.post(`${API}/api/inventory/transactions`, transactionForm, { withCredentials: true });
      toast.success(language === "es" ? "Registrado" : "Recorded");
      setTransactionDialogOpen(false);
      setTransactionForm({ inventory_item_id: "", transaction_type: "Purchase", quantity: 0, notes: "" });
      fetchData();
    } catch (error) {
      toast.error("Error");
    }
  };

  // ===== IMPORT FUNCTIONS =====
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const validTypes = ['.csv', '.xlsx', '.xls'];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!validTypes.includes(ext)) {
      toast.error(language === "es" ? "Solo archivos CSV o Excel" : "Only CSV or Excel files allowed");
      return;
    }
    
    setImportFile(file);
    setImportResult(null);
    setImportPreview(null);
    setImportStep("select");
  };

  const handleValidateFile = async () => {
    if (!importFile) {
      toast.error(language === "es" ? "Selecciona un archivo" : "Select a file");
      return;
    }
    
    setValidating(true);
    
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      
      const res = await axios.post(
        `${API}/api/inventory/validate-import-file`,
        formData,
        { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } }
      );
      
      setImportPreview(res.data);
      setImportStep("preview");
      
      if (res.data.error_rows > 0) {
        toast.warning(
          language === "es"
            ? `${res.data.error_rows} filas con errores encontradas`
            : `${res.data.error_rows} rows with errors found`
        );
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error validating file");
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      toast.error(language === "es" ? "Selecciona un archivo" : "Select a file");
      return;
    }
    
    setImporting(true);
    setImportResult(null);
    
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      
      const res = await axios.post(
        `${API}/api/inventory/import-from-file?update_existing=${updateExisting}`,
        formData,
        { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } }
      );
      
      setImportResult(res.data);
      setImportStep("result");
      
      if (res.data.created > 0 || res.data.updated > 0) {
        toast.success(
          language === "es"
            ? `Importado: ${res.data.created} nuevos, ${res.data.updated} actualizados`
            : `Imported: ${res.data.created} new, ${res.data.updated} updated`
        );
        fetchData();
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error importing file");
      setImportResult({ success: false, error: error.response?.data?.detail || "Unknown error" });
      setImportStep("result");
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    window.open(`${API}/api/inventory/import-template`, '_blank');
  };

  const resetImport = () => {
    setImportFile(null);
    setImportPreview(null);
    setImportResult(null);
    setUpdateExisting(false);
    setImportStep("select");
  };

  const [itemSortBy, setItemSortBy] = useState(readStoredSort("itemsSortBy", "name_asc"));

  const itemSorters = {
    name_asc: (a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }),
    name_desc: (a, b) => (b.name || "").localeCompare(a.name || "", undefined, { sensitivity: "base" }),
    cost_desc: (a, b) => (b.cost_per_base_unit || b.cost_per_unit || 0) - (a.cost_per_base_unit || a.cost_per_unit || 0),
    cost_asc: (a, b) => (a.cost_per_base_unit || a.cost_per_unit || 0) - (b.cost_per_base_unit || b.cost_per_unit || 0),
    stock_desc: (a, b) => (b.stock_quantity || 0) - (a.stock_quantity || 0),
    stock_asc: (a, b) => (a.stock_quantity || 0) - (b.stock_quantity || 0),
    created_desc: (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
  };

  const filteredItems = applySort(
    items.filter(item => {
      const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === "all" || item.inventory_type === typeFilter;
      return matchesSearch && matchesType;
    }),
    itemSortBy,
    itemSorters,
  );

  const lowStockItems = items.filter(item => item.par_level > 0 && (item.stock_quantity || 0) < item.par_level);
  // Ingredients flagged for chef review: explicit needs_review flag, or missing the new v2 cost axis fields.
  const needsReviewItems = items.filter(item =>
    item.inventory_type === "food" && (
      item.needs_review === true ||
      !item.base_unit ||
      !item.cost_per_base_unit ||
      item.cost_per_base_unit === 0
    )
  );
  const getSupplierName = (id) => suppliers.find(s => s.supplier_id === id)?.name || "-";
  const getItemName = (id) => items.find(i => i.ingredient_id === id)?.name || "Unknown";

  // Calculate value by inventory type
  const valueByType = INVENTORY_TYPES.reduce((acc, type) => {
    const typeItems = items.filter(item => item.inventory_type === type.value);
    acc[type.value] = {
      count: typeItems.length,
      value: typeItems.reduce((sum, item) => sum + (item.stock_quantity || 0) * (item.cost_per_unit || 0), 0),
      label: language === "es" ? type.labelEs : type.label
    };
    return acc;
  }, {});

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;

  return (
    <div className="space-y-6" data-testid="inventory-section">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Package className="h-8 w-8 text-primary" /><div><p className="text-sm text-muted-foreground">{t("items")}</p><p className="text-2xl font-bold">{items.length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Truck className="h-8 w-8 text-blue-500" /><div><p className="text-sm text-muted-foreground">{t("suppliers")}</p><p className="text-2xl font-bold">{suppliers.length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><AlertTriangle className="h-8 w-8 text-yellow-500" /><div><p className="text-sm text-muted-foreground">{t("lowStock")}</p><p className="text-2xl font-bold">{lowStockItems.length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><DollarSign className="h-8 w-8 text-green-500" /><div><p className="text-sm text-muted-foreground">{language === "es" ? "Valor Total" : "Total Value"}</p><p className="text-2xl font-bold">${items.reduce((sum, item) => sum + (item.stock_quantity || 0) * (item.cost_per_unit || 0), 0).toFixed(2)}</p></div></div></CardContent></Card>
      </div>
      
      {/* Value by Type - Collapsible Summary */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{language === "es" ? "Valor por Categoría" : "Value by Category"}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {INVENTORY_TYPES.map(type => (
              <div key={type.value} className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">{language === "es" ? type.labelEs : type.label}</p>
                <p className="text-lg font-semibold">${valueByType[type.value]?.value.toFixed(2) || "0.00"}</p>
                <p className="text-xs text-muted-foreground">{valueByType[type.value]?.count || 0} {language === "es" ? "items" : "items"}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Ingredient Review Banner — pushes chefs to fix data quality issues */}
      {needsReviewItems.length > 0 && (
        <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50" data-testid="ingredient-review-banner">
          <CardContent className="py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-amber-900 text-sm">
                  {language === "es"
                    ? `${needsReviewItems.length} ingrediente${needsReviewItems.length === 1 ? "" : "s"} necesita${needsReviewItems.length === 1 ? "" : "n"} revisión`
                    : `${needsReviewItems.length} ingredient${needsReviewItems.length === 1 ? "" : "s"} need${needsReviewItems.length === 1 ? "s" : ""} review`}
                </p>
                <p className="text-xs text-amber-800 mt-0.5">
                  {language === "es"
                    ? "Sin unidad base o costo por unidad base, las recetas no podrán calcular costos en tiempo real."
                    : "Without a base unit or cost-per-base-unit, recipes cannot compute live costs."}
                </p>
              </div>
            </div>
            <Button
              size="sm" variant="outline" className="border-amber-300 hover:bg-amber-100"
              onClick={() => setReviewDrawerOpen(true)}
              data-testid="open-review-drawer-btn"
            >
              <Wand2 className="w-4 h-4 mr-1" />
              {language === "es" ? "Revisar y reparar" : "Review & fix"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="items"><Package className="w-4 h-4 mr-2" />{t("items")}</TabsTrigger>
          <TabsTrigger value="suppliers"><Truck className="w-4 h-4 mr-2" />{t("suppliers")}</TabsTrigger>
          <TabsTrigger value="transactions"><ArrowUpDown className="w-4 h-4 mr-2" />{t("transactions")}</TabsTrigger>
          <TabsTrigger value="lowstock"><AlertTriangle className="w-4 h-4 mr-2" />{t("lowStock")}{lowStockItems.length > 0 && <Badge variant="destructive" className="ml-1">{lowStockItems.length}</Badge>}</TabsTrigger>
        </TabsList>

        {/* Items Tab */}
        <TabsContent value="items">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("items")}</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder={t("search")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-64" /></div>
                <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("all")}</SelectItem>{INVENTORY_TYPES.map(type => (<SelectItem key={type.value} value={type.value}>{language === "es" ? type.labelEs : type.label}</SelectItem>))}</SelectContent></Select>
                <SortSelect
                  value={itemSortBy}
                  onValueChange={setItemSortBy}
                  storageKey="itemsSortBy"
                  label={language === "es" ? "Ordenar" : "Sort"}
                  triggerClassName="w-[200px]"
                  testId="items-sort-select"
                  options={[
                    { value: "name_asc", label: language === "es" ? "Nombre (A-Z)" : "Name (A-Z)" },
                    { value: "name_desc", label: language === "es" ? "Nombre (Z-A)" : "Name (Z-A)" },
                    { value: "cost_desc", label: language === "es" ? "Mayor costo" : "Highest cost" },
                    { value: "cost_asc", label: language === "es" ? "Menor costo" : "Lowest cost" },
                    { value: "stock_desc", label: language === "es" ? "Más stock" : "Most stock" },
                    { value: "stock_asc", label: language === "es" ? "Menos stock" : "Least stock" },
                    { value: "created_desc", label: language === "es" ? "Más recientes" : "Newest" },
                  ]}
                />
                <Button variant="outline" onClick={() => { resetImport(); setImportDialogOpen(true); }} data-testid="import-inventory-btn"><FileUp className="w-4 h-4 mr-2" />{language === "es" ? "Importar" : "Import"}</Button>
                <Button variant="outline" onClick={() => { setWizardInitial(null); setWizardOpen(true); }} data-testid="open-wizard-btn">
                  <Sparkles className="w-4 h-4 mr-2" />
                  {language === "es" ? "Asistente" : "Wizard"}
                </Button>
                <Button onClick={() => { setEditingItem(null); setItemForm(defaultItemForm()); setBrandSearch(""); setItemDialogOpen(true); }}><Plus className="w-4 h-4 mr-2" />{t("addItem")}</Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>{t("name")}</TableHead><TableHead>{language === "es" ? "Marca" : "Brand"}</TableHead><TableHead>{t("category")}</TableHead><TableHead className="text-right">{language === "es" ? "En Mano" : "On Hand"}</TableHead><TableHead className="text-right">{language === "es" ? "Disponible" : "Available"}</TableHead><TableHead className="text-right">{t("cost")}</TableHead><TableHead>{t("supplier")}</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {filteredItems.map(item => {
                    const onHand = item.stock_quantity || 0;
                    const reserved = item.reserved_quantity || 0;
                    const available = onHand - reserved;
                    const isLowStock = item.par_level > 0 && onHand < item.par_level;
                    const hasReserved = reserved > 0;
                    const categoryInfo = categories.find(c => c.key === item.category);
                    
                    return (
                    <TableRow key={item.ingredient_id} className={isLowStock ? "bg-red-50" : hasReserved ? "bg-amber-50/50" : ""}>
                      <TableCell className="font-medium">
                        <div>
                          <div className="flex items-center gap-2">
                            {item.name}
                            {hasReserved && <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">{language === "es" ? "Reservado" : "Reserved"}</Badge>}
                          </div>
                          {item.sku && <span className="text-xs text-muted-foreground">SKU: {item.sku}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.brand || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: categoryInfo?.color || "#6b7280" }} />
                          <span className="text-sm">{language === "es" ? categoryInfo?.label_es : categoryInfo?.label_en || item.category?.replace("_", " ")}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{onHand} {item.unit}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-mono ${available <= 0 ? "text-red-600 font-bold" : available < (item.par_level || 0) ? "text-amber-600" : "text-green-600"}`}>
                          {available} {item.unit}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">${(item.cost_per_unit || 0).toFixed(2)}/{item.unit}</TableCell>
                      <TableCell>{getSupplierName(item.preferred_supplier_id)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleViewPriceHistory(item)} title={language === "es" ? "Historial de Precios" : "Price History"}>
                            <History className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleEditItem(item)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(item.ingredient_id)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )})}
                  {filteredItems.length === 0 && <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">{language === "es" ? "No hay artículos" : "No items found"}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Suppliers Tab */}
        <TabsContent value="suppliers">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between"><CardTitle>{t("suppliers")}</CardTitle><Button onClick={() => { setEditingSupplier(null); setSupplierForm({ name: "", contact_name: "", email: "", phone: "", notes: "" }); setSupplierDialogOpen(true); }}><Plus className="w-4 h-4 mr-2" />{t("addSupplier")}</Button></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>{t("name")}</TableHead><TableHead>{t("contact")}</TableHead><TableHead>{t("email")}</TableHead><TableHead>{t("phone")}</TableHead><TableHead>{t("notes")}</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {suppliers.map(supplier => (
                    <TableRow key={supplier.supplier_id}>
                      <TableCell className="font-medium">{supplier.name}</TableCell>
                      <TableCell>{supplier.contact_name || "-"}</TableCell>
                      <TableCell>{supplier.email || "-"}</TableCell>
                      <TableCell>{supplier.phone || "-"}</TableCell>
                      <TableCell className="max-w-xs truncate">{supplier.notes || "-"}</TableCell>
                      <TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => handleEditSupplier(supplier)}><Edit className="w-4 h-4" /></Button><Button variant="ghost" size="icon" onClick={() => handleDeleteSupplier(supplier.supplier_id)}><Trash2 className="w-4 h-4 text-red-500" /></Button></div></TableCell>
                    </TableRow>
                  ))}
                  {suppliers.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{language === "es" ? "No hay proveedores" : "No suppliers found"}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between"><CardTitle>{t("transactions")}</CardTitle><Button onClick={() => { setTransactionForm({ inventory_item_id: "", transaction_type: "Purchase", quantity: 0, notes: "" }); setTransactionDialogOpen(true); }}><Plus className="w-4 h-4 mr-2" />{t("addTransaction")}</Button></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>{language === "es" ? "Fecha" : "Date"}</TableHead><TableHead>{t("items")}</TableHead><TableHead>{t("type")}</TableHead><TableHead className="text-right">{t("quantity")}</TableHead><TableHead>{t("notes")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {transactions.slice(0, 50).map(txn => (
                    <TableRow key={txn.transaction_id}>
                      <TableCell>{new Date(txn.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="font-medium">{getItemName(txn.inventory_item_id)}</TableCell>
                      <TableCell><Badge variant={txn.transaction_type === "Purchase" ? "default" : txn.transaction_type === "Waste" ? "destructive" : "secondary"}>{txn.transaction_type}</Badge></TableCell>
                      <TableCell className="text-right">{txn.transaction_type === "Purchase" ? "+" : "-"}{txn.quantity}</TableCell>
                      <TableCell className="max-w-xs truncate">{txn.notes || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {transactions.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{language === "es" ? "No hay transacciones" : "No transactions found"}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Low Stock Tab */}
        <TabsContent value="lowstock">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-yellow-500" />{t("lowStock")}</CardTitle></CardHeader>
            <CardContent>
              {lowStockItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground"><Archive className="w-12 h-12 mx-auto mb-2 opacity-50" /><p>{language === "es" ? "Todo el inventario está en niveles normales" : "All inventory is at normal levels"}</p></div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>{t("name")}</TableHead><TableHead className="text-right">{t("stock")}</TableHead><TableHead className="text-right">{t("parLevel")}</TableHead><TableHead className="text-right">{language === "es" ? "Faltante" : "Shortage"}</TableHead><TableHead>{t("supplier")}</TableHead><TableHead></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {lowStockItems.map(item => (
                      <TableRow key={item.ingredient_id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-right text-red-500 font-semibold">{item.stock_quantity || 0} {item.unit}</TableCell>
                        <TableCell className="text-right">{item.par_level} {item.unit}</TableCell>
                        <TableCell className="text-right text-red-500">{(item.par_level - (item.stock_quantity || 0)).toFixed(2)} {item.unit}</TableCell>
                        <TableCell>{getSupplierName(item.preferred_supplier_id)}</TableCell>
                        <TableCell><Button variant="outline" size="sm" onClick={() => { setTransactionForm({ inventory_item_id: item.ingredient_id, transaction_type: "Purchase", quantity: item.par_level - (item.stock_quantity || 0), notes: "" }); setTransactionDialogOpen(true); }}><ShoppingCart className="w-4 h-4 mr-1" />{language === "es" ? "Ordenar" : "Order"}</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Item Dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingItem ? (language === "es" ? "Editar Artículo" : "Edit Item") : t("addItem")}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {/* Basic Info */}
            <div className="col-span-2"><Label>{t("name")} *</Label><Input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} placeholder={language === "es" ? "Nombre del producto" : "Product name"} /></div>
            
            {/* Brand with autocomplete */}
            <div className="relative">
              <Label>{language === "es" ? "Marca" : "Brand"}</Label>
              <Input 
                value={brandSearch} 
                onChange={(e) => {
                  setBrandSearch(e.target.value);
                  setItemForm({ ...itemForm, brand: e.target.value });
                  setShowBrandDropdown(true);
                  fetchBrands(e.target.value);
                }}
                onFocus={() => { setShowBrandDropdown(true); fetchBrands(brandSearch); }}
                onBlur={() => setTimeout(() => setShowBrandDropdown(false), 200)}
                placeholder={language === "es" ? "Escribir marca..." : "Type brand..."}
              />
              {showBrandDropdown && brands.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-40 overflow-y-auto">
                  {brands.filter(b => b.toLowerCase().includes(brandSearch.toLowerCase())).map((brand, idx) => (
                    <div 
                      key={idx} 
                      className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                      onClick={() => {
                        setBrandSearch(brand);
                        setItemForm({ ...itemForm, brand: brand });
                        setShowBrandDropdown(false);
                      }}
                    >
                      {brand}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* SKU */}
            <div>
              <Label>SKU / {language === "es" ? "Código" : "Code"}</Label>
              <Input value={itemForm.sku || ""} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} placeholder={language === "es" ? "Código interno" : "Internal code"} />
            </div>
            
            <div><Label>{t("type")}</Label><Select value={itemForm.inventory_type} onValueChange={(v) => setItemForm({ ...itemForm, inventory_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{INVENTORY_TYPES.map(type => (<SelectItem key={type.value} value={type.value}>{language === "es" ? type.labelEs : type.label}</SelectItem>))}</SelectContent></Select></div>
            
            {/* Category - Dynamic from settings */}
            <div>
              <Label>{t("category")} *</Label>
              <Select value={itemForm.category} onValueChange={(v) => setItemForm({ ...itemForm, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.key} value={cat.key}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color || "#6b7280" }} />
                        {language === "es" ? cat.label_es : cat.label_en}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div><Label>{t("unit")}</Label><Select value={itemForm.unit} onValueChange={(v) => setItemForm({ ...itemForm, unit: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["kg", "g", "lb", "oz", "L", "ml", "unit", "box", "case", "galón", "botella"].map(u => (<SelectItem key={u} value={u}>{u}</SelectItem>))}</SelectContent></Select></div>
            <div><Label>{t("cost")} / {itemForm.unit}</Label><Input type="number" min="0" step="0.01" value={itemForm.cost_per_unit} onChange={(e) => setItemForm({ ...itemForm, cost_per_unit: parseFloat(e.target.value) || 0 })} /></div>
            <div><Label>{t("stock")}</Label><Input type="number" min="0" step="0.01" value={itemForm.stock_quantity} onChange={(e) => setItemForm({ ...itemForm, stock_quantity: parseFloat(e.target.value) || 0 })} /></div>
            <div><Label>{t("parLevel")}</Label><Input type="number" min="0" step="0.01" value={itemForm.par_level} onChange={(e) => setItemForm({ ...itemForm, par_level: parseFloat(e.target.value) || 0 })} /></div>
            
            {/* Suppliers Section */}
            <div className="col-span-2 border-t pt-4 mt-2">
              <p className="text-sm font-medium mb-3">{language === "es" ? "Proveedores" : "Suppliers"}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{language === "es" ? "Proveedor Principal" : "Primary Supplier"}</Label>
                  <SearchableSelect
                    value={itemForm.preferred_supplier_id || null}
                    onValueChange={(v) => setItemForm({ ...itemForm, preferred_supplier_id: v || "" })}
                    options={[...suppliers]
                      .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }))
                      .map(s => ({ value: s.supplier_id, label: s.name, keywords: [s.company_name].filter(Boolean) }))}
                    placeholder={language === "es" ? "Sin proveedor" : "No supplier"}
                    searchPlaceholder={language === "es" ? "Buscar proveedor..." : "Search supplier..."}
                    emptyText={language === "es" ? "Sin resultados" : "No results"}
                    clearable
                    testId="item-primary-supplier-select"
                  />
                </div>
                <div>
                  <Label>{language === "es" ? "Proveedor Secundario" : "Secondary Supplier"}</Label>
                  <SearchableSelect
                    value={itemForm.secondary_supplier_id || null}
                    onValueChange={(v) => setItemForm({ ...itemForm, secondary_supplier_id: v || "" })}
                    options={[...suppliers]
                      .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }))
                      .map(s => ({ value: s.supplier_id, label: s.name, keywords: [s.company_name].filter(Boolean) }))}
                    placeholder={language === "es" ? "Sin proveedor" : "No supplier"}
                    searchPlaceholder={language === "es" ? "Buscar proveedor..." : "Search supplier..."}
                    emptyText={language === "es" ? "Sin resultados" : "No results"}
                    clearable
                    testId="item-secondary-supplier-select"
                  />
                </div>
              </div>
            </div>
            
            {/* Purchase Info Section - Rich format */}
            <div className="col-span-2 border-t pt-4 mt-2">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">{language === "es" ? "Formato y Precio de Compra" : "Purchase Format & Price"}</p>
                {editingItem && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewPriceHistory(editingItem)}
                    data-testid="item-dialog-price-history-btn"
                  >
                    <History className="w-4 h-4 mr-1" />
                    {language === "es" ? "Historial de Precios" : "Price History"}
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">{language === "es" ? "Formato" : "Format"}</Label>
                  <Select
                    value={itemForm.purchase_unit || "none"}
                    onValueChange={(v) => setItemForm({ ...itemForm, purchase_unit: v === "none" ? "" : v })}
                  >
                    <SelectTrigger data-testid="item-purchase-format"><SelectValue placeholder={language === "es" ? "Saco / Caja / ..." : "Bag / Box / ..."} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{language === "es" ? "Sin formato" : "No format"}</SelectItem>
                      <SelectItem value="saco">{language === "es" ? "Saco" : "Sack"}</SelectItem>
                      <SelectItem value="caja">{language === "es" ? "Caja" : "Box"}</SelectItem>
                      <SelectItem value="funda">{language === "es" ? "Funda" : "Bag"}</SelectItem>
                      <SelectItem value="pack">Pack</SelectItem>
                      <SelectItem value="galón">{language === "es" ? "Galón" : "Gallon"}</SelectItem>
                      <SelectItem value="botella">{language === "es" ? "Botella" : "Bottle"}</SelectItem>
                      <SelectItem value="lata">{language === "es" ? "Lata" : "Can"}</SelectItem>
                      <SelectItem value="bandeja">{language === "es" ? "Bandeja" : "Tray"}</SelectItem>
                      <SelectItem value="unidad">{language === "es" ? "Unidad" : "Unit"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{language === "es" ? "Cantidad" : "Quantity"}</Label>
                  <Input
                    type="number" min="0" step="0.01"
                    value={itemForm.purchase_quantity_per_unit || ""}
                    onChange={(e) => setItemForm({ ...itemForm, purchase_quantity_per_unit: parseFloat(e.target.value) || 0 })}
                    placeholder="54.43"
                    data-testid="item-purchase-qty"
                  />
                </div>
                <div>
                  <Label className="text-xs">{language === "es" ? "Unidad base" : "Base unit"}</Label>
                  <Select
                    value={itemForm.base_unit || "none"}
                    onValueChange={(v) => setItemForm({ ...itemForm, base_unit: v === "none" ? "" : v })}
                  >
                    <SelectTrigger data-testid="item-base-unit"><SelectValue placeholder="kg / lb / oz" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="g">g</SelectItem>
                      <SelectItem value="lb">lb</SelectItem>
                      <SelectItem value="oz">oz</SelectItem>
                      <SelectItem value="L">L</SelectItem>
                      <SelectItem value="ml">ml</SelectItem>
                      <SelectItem value="unit">{language === "es" ? "unidad" : "unit"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <Label className="text-xs">{language === "es" ? `Precio total del ${itemForm.purchase_unit || "pack"}` : `Total price per ${itemForm.purchase_unit || "pack"}`}</Label>
                  <Input
                    type="number" min="0" step="0.01"
                    value={itemForm.purchase_cost || ""}
                    onChange={(e) => {
                      const cost = parseFloat(e.target.value) || 0;
                      const qty = itemForm.purchase_quantity_per_unit || 0;
                      const perBase = qty > 0 ? cost / qty : 0;
                      setItemForm({
                        ...itemForm,
                        purchase_cost: cost,
                        cost_per_unit: perBase || itemForm.cost_per_unit,
                      });
                    }}
                    placeholder="3450"
                    data-testid="item-purchase-cost"
                  />
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md flex flex-col justify-center" data-testid="item-cost-per-base">
                  <p className="text-xs text-emerald-700">
                    {language === "es" ? `Precio por ${itemForm.base_unit || itemForm.unit || "unidad base"}` : `Price per ${itemForm.base_unit || itemForm.unit || "base unit"}`}
                  </p>
                  <p className="text-lg font-bold text-emerald-900 font-mono">
                    {itemForm.purchase_cost > 0 && itemForm.purchase_quantity_per_unit > 0
                      ? `$${(itemForm.purchase_cost / itemForm.purchase_quantity_per_unit).toFixed(4)}`
                      : "—"}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {language === "es"
                  ? "💡 Ej: 1 saco contiene 54.43 kg y cuesta $3,450 → $63.38/kg automático."
                  : "💡 Ex: 1 sack contains 54.43 kg and costs $3,450 → $63.38/kg automatic."}
              </p>
            </div>

            {/* Description */}
            <div className="col-span-2 border-t pt-4 mt-2">
              <Label>{language === "es" ? "Descripción" : "Description"}</Label>
              <Textarea
                value={itemForm.description || ""}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                placeholder={language === "es" ? "Detalles del producto, presentación, observaciones..." : "Product details, presentation, observations..."}
                rows={2}
                data-testid="item-description"
              />
            </div>

            {/* Storage location & yield */}
            <div className="col-span-2 grid grid-cols-2 gap-4">
              <div>
                <Label>{language === "es" ? "Zona de conservación" : "Storage zone"}</Label>
                <Select
                  value={itemForm.storage_location || "dry"}
                  onValueChange={(v) => setItemForm({ ...itemForm, storage_location: v })}
                >
                  <SelectTrigger data-testid="item-storage-location"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dry">{language === "es" ? "🌾 Seco" : "🌾 Dry"}</SelectItem>
                    <SelectItem value="fridge">{language === "es" ? "❄️ Refrigerado" : "❄️ Refrigerated"}</SelectItem>
                    <SelectItem value="freezer">{language === "es" ? "🧊 Congelado" : "🧊 Frozen"}</SelectItem>
                    <SelectItem value="room_temp">{language === "es" ? "🌡️ Temperatura ambiente" : "🌡️ Room temperature"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="flex items-center justify-between">
                  <span>{language === "es" ? "Aprovechamiento" : "Yield"}</span>
                  <span className="text-sm font-mono">
                    {(100 - (itemForm.yield_waste_percent || 0)).toFixed(0)}%
                  </span>
                </Label>
                <Input
                  type="number" min="0" max="100" step="1"
                  value={itemForm.yield_waste_percent || 0}
                  onChange={(e) => setItemForm({ ...itemForm, yield_waste_percent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                  placeholder={language === "es" ? "% de merma (0-100)" : "% waste (0-100)"}
                  data-testid="item-yield-waste"
                />
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <Checkbox
                    checked={!!itemForm.non_yieldable}
                    onCheckedChange={(c) => setItemForm({ ...itemForm, non_yieldable: !!c })}
                    data-testid="item-non-yieldable"
                  />
                  <span className="text-xs text-muted-foreground">
                    {language === "es" ? "Merma no aprovechable" : "Non-yieldable waste"}
                  </span>
                </label>
              </div>
            </div>

            {/* Allergens */}
            {allergensList.length > 0 && (
              <div className="col-span-2 border-t pt-4 mt-2">
                <Label className="mb-2 block">{language === "es" ? "Alérgenos" : "Allergens"}</Label>
                <div className="flex flex-wrap gap-2" data-testid="item-allergens">
                  {allergensList.map((a) => {
                    const key = a.name || a.name_es;
                    const selected = (itemForm.allergens || []).includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          const set = new Set(itemForm.allergens || []);
                          if (selected) set.delete(key); else set.add(key);
                          setItemForm({ ...itemForm, allergens: Array.from(set) });
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                          selected
                            ? "bg-amber-500 text-white border-amber-500"
                            : "bg-white border-slate-300 text-slate-700 hover:bg-slate-100"
                        }`}
                        data-testid={`item-allergen-${key}`}
                      >
                        {language === "es" ? (a.name_es || a.name) : (a.name || a.name_es)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="col-span-2 border-t pt-4 mt-2">
              <Label>{language === "es" ? "Notas" : "Notes"}</Label>
              <Input value={itemForm.notes || ""} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} placeholder={language === "es" ? "Notas adicionales..." : "Additional notes..."} />
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setItemDialogOpen(false)}>{t("cancel")}</Button><Button onClick={handleSaveItem}>{t("save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier Dialog */}
      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingSupplier ? (language === "es" ? "Editar Proveedor" : "Edit Supplier") : t("addSupplier")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("name")}</Label><Input value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} /></div>
            <div><Label>{t("contact")}</Label><Input value={supplierForm.contact_name} onChange={(e) => setSupplierForm({ ...supplierForm, contact_name: e.target.value })} /></div>
            <div><Label>{t("email")}</Label><Input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} /></div>
            <div><Label>{t("phone")}</Label><Input value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} /></div>
            
            {/* Payment & Credit Section */}
            <div className="border-t pt-4 mt-2">
              <p className="text-sm font-medium mb-3">{language === "es" ? "Términos de Pago" : "Payment Terms"}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{language === "es" ? "Forma de Pago" : "Payment Method"}</Label>
                  <Select value={supplierForm.payment_terms || "cash"} onValueChange={(v) => setSupplierForm({ ...supplierForm, payment_terms: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">{language === "es" ? "Efectivo" : "Cash"}</SelectItem>
                      <SelectItem value="transfer">{language === "es" ? "Transferencia" : "Transfer"}</SelectItem>
                      <SelectItem value="credit">{language === "es" ? "Crédito" : "Credit"}</SelectItem>
                      <SelectItem value="mixed">{language === "es" ? "Mixto" : "Mixed"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{language === "es" ? "Límite de Crédito" : "Credit Limit"}</Label>
                  <Input 
                    type="number" 
                    min="0" 
                    step="100" 
                    value={supplierForm.credit_limit || 0} 
                    onChange={(e) => setSupplierForm({ ...supplierForm, credit_limit: parseFloat(e.target.value) || 0, has_credit: parseFloat(e.target.value) > 0 })} 
                    disabled={supplierForm.payment_terms !== "credit"}
                  />
                </div>
              </div>
            </div>
            
            <div><Label>{t("notes")}</Label><Input value={supplierForm.notes} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSupplierDialogOpen(false)}>{t("cancel")}</Button><Button onClick={handleSaveSupplier}>{t("save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction Dialog */}
      <Dialog open={transactionDialogOpen} onOpenChange={setTransactionDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("addTransaction")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("items")}</Label><Select value={transactionForm.inventory_item_id} onValueChange={(v) => setTransactionForm({ ...transactionForm, inventory_item_id: v })}><SelectTrigger><SelectValue placeholder={language === "es" ? "Seleccionar" : "Select"} /></SelectTrigger><SelectContent>{items.map(item => (<SelectItem key={item.ingredient_id} value={item.ingredient_id}>{item.name}</SelectItem>))}</SelectContent></Select></div>
            <div><Label>{t("type")}</Label><Select value={transactionForm.transaction_type} onValueChange={(v) => setTransactionForm({ ...transactionForm, transaction_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Purchase">{t("purchase")}</SelectItem><SelectItem value="Usage">{t("usage")}</SelectItem><SelectItem value="Adjustment">{t("adjustment")}</SelectItem><SelectItem value="Waste">{t("waste")}</SelectItem></SelectContent></Select></div>
            <div><Label>{t("quantity")}</Label><Input type="number" min="0" step="0.01" value={transactionForm.quantity} onChange={(e) => setTransactionForm({ ...transactionForm, quantity: parseFloat(e.target.value) || 0 })} /></div>
            <div><Label>{t("notes")}</Label><Input value={transactionForm.notes} onChange={(e) => setTransactionForm({ ...transactionForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setTransactionDialogOpen(false)}>{t("cancel")}</Button><Button onClick={handleSaveTransaction}>{t("save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price History Dialog */}
      <Dialog open={priceHistoryDialogOpen} onOpenChange={setPriceHistoryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              {language === "es" ? "Historial de Precios" : "Price History"}: {selectedItemForHistory?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Current Price */}
            <div className="p-3 bg-primary/10 rounded-lg">
              <p className="text-sm text-muted-foreground">{language === "es" ? "Precio Actual" : "Current Price"}</p>
              <p className="text-2xl font-bold">${selectedItemForHistory?.cost_per_unit?.toFixed(2) || "0.00"}/{selectedItemForHistory?.unit}</p>
            </div>
            
            {/* History List */}
            {priceHistory.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground">
                {language === "es" ? "Sin historial de cambios de precio" : "No price change history"}
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2">
                {priceHistory.slice().reverse().map((entry, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">${entry.price?.toFixed(2)}/{selectedItemForHistory?.unit}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.source || "Manual"} • {new Date(entry.date).toLocaleDateString()}
                      </p>
                    </div>
                    {idx === 0 && <Badge variant="secondary">{language === "es" ? "Más reciente" : "Latest"}</Badge>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Inventory Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { setImportDialogOpen(open); if (!open) resetImport(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" data-testid="import-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="w-5 h-5" />
              {language === "es" ? "Importar Inventario" : "Import Inventory"}
              {importStep !== "select" && (
                <Badge variant="outline" className="ml-2">
                  {importStep === "preview" ? (language === "es" ? "Paso 2: Validación" : "Step 2: Validation") : (language === "es" ? "Paso 3: Resultado" : "Step 3: Result")}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Step 1: File Selection */}
            {importStep === "select" && (
              <>
                {/* Instructions */}
                <div className="p-4 bg-muted/50 rounded-lg text-sm">
                  <p className="font-medium mb-2">{language === "es" ? "Formato del archivo:" : "File format:"}</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>{language === "es" ? "Archivos CSV o Excel (.xlsx, .xls)" : "CSV or Excel files (.xlsx, .xls)"}</li>
                    <li>{language === "es" ? "Columnas: name (requerido), brand, category, unit, cost_per_unit, stock_quantity, par_level, sku, notes" : "Columns: name (required), brand, category, unit, cost_per_unit, stock_quantity, par_level, sku, notes"}</li>
                    <li>{language === "es" ? "Soporta nombres en español (nombre, marca, categoría, etc.)" : "Supports Spanish column names (nombre, marca, categoría, etc.)"}</li>
                  </ul>
                  <Button variant="link" className="p-0 h-auto mt-2" onClick={handleDownloadTemplate}>
                    {language === "es" ? "Descargar plantilla CSV" : "Download CSV template"}
                  </Button>
                </div>

                {/* File Upload */}
                <div className="space-y-2">
                  <Label>{language === "es" ? "Seleccionar archivo" : "Select file"}</Label>
                  <Input 
                    type="file" 
                    accept=".csv,.xlsx,.xls" 
                    onChange={handleFileSelect}
                    data-testid="import-file-input"
                  />
                  {importFile && (
                    <p className="text-sm text-muted-foreground">
                      {language === "es" ? "Archivo seleccionado:" : "Selected file:"} {importFile.name}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Step 2: Validation Preview */}
            {importStep === "preview" && importPreview && (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-2xl font-bold">{importPreview.total_rows}</p>
                    <p className="text-xs text-muted-foreground">{language === "es" ? "Total filas" : "Total rows"}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg text-center border border-green-200">
                    <p className="text-2xl font-bold text-green-700">{importPreview.valid_rows}</p>
                    <p className="text-xs text-green-600">{language === "es" ? "Válidas" : "Valid"}</p>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg text-center border border-amber-200">
                    <p className="text-2xl font-bold text-amber-700">{importPreview.warning_rows}</p>
                    <p className="text-xs text-amber-600">{language === "es" ? "Advertencias" : "Warnings"}</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg text-center border border-red-200">
                    <p className="text-2xl font-bold text-red-700">{importPreview.error_rows}</p>
                    <p className="text-xs text-red-600">{language === "es" ? "Errores" : "Errors"}</p>
                  </div>
                </div>

                {/* Validation Table */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          <TableHead className="w-16 text-xs">{language === "es" ? "Fila" : "Row"}</TableHead>
                          <TableHead className="w-20 text-xs">{language === "es" ? "Estado" : "Status"}</TableHead>
                          <TableHead className="text-xs">{language === "es" ? "Nombre" : "Name"}</TableHead>
                          <TableHead className="text-xs">{language === "es" ? "Marca" : "Brand"}</TableHead>
                          <TableHead className="text-xs">{language === "es" ? "Categoría" : "Category"}</TableHead>
                          <TableHead className="text-xs">{language === "es" ? "Unidad" : "Unit"}</TableHead>
                          <TableHead className="text-xs text-right">{language === "es" ? "Costo" : "Cost"}</TableHead>
                          <TableHead className="text-xs text-right">{language === "es" ? "Stock" : "Stock"}</TableHead>
                          <TableHead className="text-xs">{language === "es" ? "Problemas" : "Issues"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importPreview.rows?.map((row, idx) => (
                          <TableRow 
                            key={idx} 
                            className={
                              row.status === "error" ? "bg-red-50" : 
                              row.status === "warning" ? "bg-amber-50" : ""
                            }
                          >
                            <TableCell className="text-xs font-mono">{row.row_number}</TableCell>
                            <TableCell>
                              {row.status === "valid" && <Badge variant="outline" className="text-green-700 border-green-300 text-xs">OK</Badge>}
                              {row.status === "warning" && <Badge variant="outline" className="text-amber-700 border-amber-300 text-xs">{language === "es" ? "Aviso" : "Warn"}</Badge>}
                              {row.status === "error" && <Badge variant="destructive" className="text-xs">{language === "es" ? "Error" : "Error"}</Badge>}
                            </TableCell>
                            <TableCell className="text-xs font-medium">{row.data?.name || "-"}</TableCell>
                            <TableCell className="text-xs">{row.data?.brand || "-"}</TableCell>
                            <TableCell className="text-xs">{row.data?.category || "-"}</TableCell>
                            <TableCell className="text-xs">{row.data?.unit || "-"}</TableCell>
                            <TableCell className="text-xs text-right">${row.data?.cost_per_unit?.toFixed(2) || "0.00"}</TableCell>
                            <TableCell className="text-xs text-right">{row.data?.stock_quantity || 0}</TableCell>
                            <TableCell className="text-xs max-w-[200px]">
                              {row.errors?.length > 0 && (
                                <span className="text-red-600">{row.errors.join("; ")}</span>
                              )}
                              {row.warnings?.length > 0 && (
                                <span className="text-amber-600">{row.warnings.join("; ")}</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Update existing option */}
                <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                  <input 
                    type="checkbox" 
                    id="updateExisting" 
                    checked={updateExisting} 
                    onChange={(e) => setUpdateExisting(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="updateExisting" className="text-sm cursor-pointer">
                    {language === "es" 
                      ? "Actualizar productos existentes (si el nombre coincide)" 
                      : "Update existing products (if name matches)"}
                  </Label>
                </div>

                {importPreview.error_rows > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                    <AlertTriangle className="w-4 h-4 inline mr-2" />
                    {language === "es" 
                      ? `${importPreview.error_rows} fila(s) con errores serán omitidas al importar.` 
                      : `${importPreview.error_rows} row(s) with errors will be skipped during import.`}
                  </div>
                )}
              </>
            )}

            {/* Step 3: Import Result */}
            {importStep === "result" && importResult && (
              <div className={`p-6 rounded-lg ${importResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                {importResult.success ? (
                  <div className="space-y-4">
                    <p className="font-medium text-green-700 flex items-center gap-2 text-lg">
                      <CheckCircle className="w-6 h-6" />
                      {language === "es" ? "Importación completada exitosamente" : "Import completed successfully"}
                    </p>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-4 bg-white rounded-lg">
                        <p className="text-3xl font-bold text-green-600">{importResult.created}</p>
                        <p className="text-sm text-muted-foreground">{language === "es" ? "Nuevos productos" : "New products"}</p>
                      </div>
                      <div className="p-4 bg-white rounded-lg">
                        <p className="text-3xl font-bold text-blue-600">{importResult.updated}</p>
                        <p className="text-sm text-muted-foreground">{language === "es" ? "Actualizados" : "Updated"}</p>
                      </div>
                      <div className="p-4 bg-white rounded-lg">
                        <p className="text-3xl font-bold text-gray-600">{importResult.skipped}</p>
                        <p className="text-sm text-muted-foreground">{language === "es" ? "Omitidos" : "Skipped"}</p>
                      </div>
                    </div>
                    {importResult.errors?.length > 0 && (
                      <div className="mt-4 p-3 bg-amber-50 rounded-lg text-sm text-amber-700">
                        <p className="font-medium mb-1">{language === "es" ? "Errores encontrados:" : "Errors found:"}</p>
                        {importResult.errors.map((err, i) => <p key={i} className="text-xs">{err}</p>)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center">
                    <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-2" />
                    <p className="text-red-700 font-medium">{language === "es" ? "Error en la importación" : "Import failed"}</p>
                    <p className="text-red-600 text-sm mt-1">{importResult.error}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 border-t pt-4">
            {importStep === "select" && (
              <>
                <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                  {language === "es" ? "Cancelar" : "Cancel"}
                </Button>
                <Button onClick={handleValidateFile} disabled={!importFile || validating} data-testid="validate-btn">
                  {validating ? (
                    <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />{language === "es" ? "Validando..." : "Validating..."}</>
                  ) : (
                    <><Search className="w-4 h-4 mr-2" />{language === "es" ? "Validar archivo" : "Validate file"}</>
                  )}
                </Button>
              </>
            )}
            {importStep === "preview" && (
              <>
                <Button variant="outline" onClick={() => { setImportStep("select"); setImportPreview(null); }}>
                  {language === "es" ? "Volver" : "Back"}
                </Button>
                <Button 
                  onClick={handleImport} 
                  disabled={importing || (importPreview?.valid_rows === 0 && importPreview?.warning_rows === 0)} 
                  data-testid="import-submit-btn"
                >
                  {importing ? (
                    <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />{language === "es" ? "Importando..." : "Importing..."}</>
                  ) : (
                    <><FileUp className="w-4 h-4 mr-2" />{language === "es" ? `Importar ${(importPreview?.valid_rows || 0) + (importPreview?.warning_rows || 0)} productos` : `Import ${(importPreview?.valid_rows || 0) + (importPreview?.warning_rows || 0)} products`}</>
                  )}
                </Button>
              </>
            )}
            {importStep === "result" && (
              <Button onClick={() => setImportDialogOpen(false)}>
                {language === "es" ? "Cerrar" : "Close"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ingredient Creation/Repair Wizard */}
      <IngredientWizard
        key={wizardInitial?.ingredient_id || (wizardOpen ? "new-open" : "new-closed")}
        open={wizardOpen}
        initial={wizardInitial}
        categories={categories}
        onClose={() => { setWizardOpen(false); setWizardInitial(null); }}
        onSaved={() => { fetchData(); setWizardOpen(false); setWizardInitial(null); }}
      />

      {/* Review Drawer — lists ingredients needing repair, opens wizard on click */}
      <Dialog open={reviewDrawerOpen} onOpenChange={setReviewDrawerOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col" data-testid="review-drawer">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              {language === "es" ? "Ingredientes que necesitan revisión" : "Ingredients needing review"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === "es" ? "Nombre" : "Name"}</TableHead>
                  <TableHead>{language === "es" ? "Unidad base" : "Base unit"}</TableHead>
                  <TableHead className="text-right">{language === "es" ? "Costo/base" : "Cost/base"}</TableHead>
                  <TableHead>{language === "es" ? "Problema" : "Issue"}</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {needsReviewItems.map(item => {
                  const issues = [];
                  if (!item.base_unit) issues.push(language === "es" ? "Sin unidad base" : "No base unit");
                  if (!item.cost_per_base_unit || item.cost_per_base_unit === 0) issues.push(language === "es" ? "Sin costo base" : "No base cost");
                  if (item.needs_review) issues.push(language === "es" ? "Marcado para revisión" : "Flagged");
                  return (
                    <TableRow key={item.ingredient_id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-muted-foreground">{item.base_unit || "—"}</TableCell>
                      <TableCell className="text-right font-mono">
                        {item.cost_per_base_unit ? `$${item.cost_per_base_unit.toFixed(4)}` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {issues.map(i => <Badge key={i} variant="outline" className="text-[10px] border-amber-300 text-amber-700">{i}</Badge>)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm" variant="outline"
                          onClick={() => { setWizardInitial(item); setReviewDrawerOpen(false); setWizardOpen(true); }}
                          data-testid={`repair-btn-${item.ingredient_id}`}
                        >
                          <Wand2 className="w-3.5 h-3.5 mr-1" />
                          {language === "es" ? "Reparar" : "Fix"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {needsReviewItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {language === "es" ? "Todo en orden ✨" : "All clean ✨"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDrawerOpen(false)}>
              {language === "es" ? "Cerrar" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== RECIPES SECTION ====================
function RecipesSection() {
  const { language } = useLanguage();
  const [recipes, setRecipes] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [recalculating, setRecalculating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [recipesRes, ingredientsRes] = await Promise.all([
        axios.get(`${API}/api/recipes`, { withCredentials: true }),
        axios.get(`${API}/api/inventory/ingredients`, { withCredentials: true })
      ]);
      setRecipes(recipesRes.data);
      setIngredients(ingredientsRes.data);
    } catch (error) {
      toast.error("Error loading data");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (recipeId) => {
    if (!window.confirm(language === "es" ? "¿Eliminar?" : "Delete?")) return;
    try {
      await axios.delete(`${API}/api/recipes/${recipeId}`, { withCredentials: true });
      toast.success(language === "es" ? "Eliminado" : "Deleted");
      fetchData();
    } catch (error) {
      toast.error("Error");
    }
  };

  const handleDuplicate = async (recipeId) => {
    try {
      await axios.post(`${API}/api/recipes/${recipeId}/duplicate`, {}, { withCredentials: true });
      toast.success(language === "es" ? "Receta duplicada" : "Recipe duplicated");
      fetchData();
    } catch (error) {
      toast.error("Error");
    }
  };

  const [recalcDialogOpen, setRecalcDialogOpen] = useState(false);
  const [recalcReport, setRecalcReport] = useState(null);
  const [recalcApplying, setRecalcApplying] = useState(false);

  const handleRecalculateAll = async () => {
    setRecalculating(true);
    try {
      const res = await axios.post(
        `${API}/api/recipes/recalculate-all?dry_run=true`, {},
        { withCredentials: true },
      );
      setRecalcReport(res.data);
      setRecalcDialogOpen(true);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Error");
    } finally {
      setRecalculating(false);
    }
  };

  const handleApplyRecalc = async () => {
    setRecalcApplying(true);
    try {
      const res = await axios.post(
        `${API}/api/recipes/recalculate-all?dry_run=false`, {},
        { withCredentials: true },
      );
      toast.success(
        language === "es"
          ? `${res.data.changed_count} receta${res.data.changed_count === 1 ? "" : "s"} actualizada${res.data.changed_count === 1 ? "" : "s"}`
          : `${res.data.changed_count} recipe${res.data.changed_count === 1 ? "" : "s"} updated`,
      );
      setRecalcDialogOpen(false);
      setRecalcReport(null);
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Error");
    } finally {
      setRecalcApplying(false);
    }
  };

  const [pendingReviewOnly, setPendingReviewOnly] = useState(false);
  const [bulkAILoading, setBulkAILoading] = useState(false);
  const [recipeImportOpen, setRecipeImportOpen] = useState(false);
  const [recipeSortBy, setRecipeSortBy] = useState(readStoredSort("recipesSortBy", "name_asc"));

  const recipeSorters = {
    name_asc: (a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }),
    name_desc: (a, b) => (b.name || "").localeCompare(a.name || "", undefined, { sensitivity: "base" }),
    cost_desc: (a, b) => (b.cost_per_portion || 0) - (a.cost_per_portion || 0),
    cost_asc: (a, b) => (a.cost_per_portion || 0) - (b.cost_per_portion || 0),
    created_desc: (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
    created_asc: (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
    updated_desc: (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0),
  };

  const filteredRecipes = applySort(
    recipes.filter(r => {
      const matchesSearch = r.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === "all" || r.recipe_type === typeFilter;
      const matchesReview = !pendingReviewOnly || r.needs_review === true;
      return matchesSearch && matchesType && matchesReview;
    }),
    recipeSortBy,
    recipeSorters,
  );

  const pendingReviewCount = recipes.filter(r => r.needs_review === true).length;

  const getRecipeTypeIcon = (type) => {
    switch (type) {
      case "base": return <Beaker className="w-4 h-4 text-purple-500" />;
      case "component": return <Layers className="w-4 h-4 text-blue-500" />;
      default: return <Utensils className="w-4 h-4 text-green-500" />;
    }
  };

  const getRecipeTypeBadge = (type) => {
    const types = {
      base: { label: language === "es" ? "Base" : "Base", class: "bg-purple-100 text-purple-700" },
      component: { label: language === "es" ? "Componente" : "Component", class: "bg-blue-100 text-blue-700" },
      final_dish: { label: language === "es" ? "Plato Final" : "Final Dish", class: "bg-green-100 text-green-700" }
    };
    const t = types[type] || types.final_dish;
    return <Badge className={t.class}>{t.label}</Badge>;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;

  return (
    <div className="space-y-6" data-testid="recipes-section">
      {/* Cost Health (auto-hides when nothing stale) — top priority alert */}
      <div id="cost-health">
        <CostHealthDashboard mode="section" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Beaker className="h-8 w-8 text-purple-500" /><div><p className="text-sm text-muted-foreground">{language === "es" ? "Bases" : "Base"}</p><p className="text-2xl font-bold">{recipes.filter(r => r.recipe_type === "base").length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Layers className="h-8 w-8 text-blue-500" /><div><p className="text-sm text-muted-foreground">{language === "es" ? "Componentes" : "Components"}</p><p className="text-2xl font-bold">{recipes.filter(r => r.recipe_type === "component").length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Utensils className="h-8 w-8 text-green-500" /><div><p className="text-sm text-muted-foreground">{language === "es" ? "Platos" : "Dishes"}</p><p className="text-2xl font-bold">{recipes.filter(r => r.recipe_type === "final_dish" || !r.recipe_type).length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><ChefHat className="h-8 w-8 text-primary" /><div><p className="text-sm text-muted-foreground">Total</p><p className="text-2xl font-bold">{recipes.length}</p></div></div></CardContent></Card>
      </div>

      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle>{language === "es" ? "Recetas" : "Recipes"}</CardTitle>
            {pendingReviewCount > 0 && (
              <>
                <Button
                  variant={pendingReviewOnly ? "default" : "outline"}
                  size="sm"
                  className={pendingReviewOnly ? "" : "border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100"}
                  onClick={() => setPendingReviewOnly(!pendingReviewOnly)}
                  data-testid="recipes-pending-review-filter"
                >
                  <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                  {pendingReviewCount} {language === "es" ? "por revisar" : "to review"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emerald-400 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                  onClick={async () => {
                    if (!window.confirm(language === "es"
                      ? `¿Sugerir ingredientes con IA para ${pendingReviewCount} receta(s)? Toma 1-2 min. Cada receta queda marcada "por revisar" hasta que la abras y guardes.`
                      : `Suggest ingredients with AI for ${pendingReviewCount} recipe(s)? Takes 1-2 min. Each stays flagged "to review" until you open and save it.`)) return;
                    setBulkAILoading(true);
                    try {
                      const res = await axios.post(`${API}/recipes/suggest-ingredients-bulk`,
                        { language, limit: 25 },
                        { withCredentials: true });
                      toast.success(language === "es"
                        ? `Procesadas: ${res.data.processed} · Completadas: ${res.data.filled} · Errores: ${res.data.errors}`
                        : `Processed: ${res.data.processed} · Filled: ${res.data.filled} · Errors: ${res.data.errors}`);
                      // reload recipes
                      const recipesRes = await axios.get(`${API}/recipes`, { withCredentials: true });
                      setRecipes(recipesRes.data);
                    } catch (err) {
                      toast.error(language === "es" ? "Error en sugerencia masiva" : "Bulk suggestion failed");
                    } finally {
                      setBulkAILoading(false);
                    }
                  }}
                  disabled={bulkAILoading}
                  data-testid="recipes-bulk-ai-suggest"
                >
                  {bulkAILoading ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                  {language === "es" ? "Sugerir todas con IA" : "Suggest all with AI"}
                </Button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder={language === "es" ? "Buscar..." : "Search..."} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-64" /></div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === "es" ? "Todos" : "All"}</SelectItem>
                <SelectItem value="base">{language === "es" ? "Base" : "Base"}</SelectItem>
                <SelectItem value="component">{language === "es" ? "Componente" : "Component"}</SelectItem>
                <SelectItem value="final_dish">{language === "es" ? "Plato Final" : "Final Dish"}</SelectItem>
              </SelectContent>
            </Select>
            <SortSelect
              value={recipeSortBy}
              onValueChange={setRecipeSortBy}
              storageKey="recipesSortBy"
              label={language === "es" ? "Ordenar" : "Sort"}
              triggerClassName="w-[200px]"
              testId="recipes-sort-select"
              options={[
                { value: "name_asc", label: language === "es" ? "Nombre (A-Z)" : "Name (A-Z)" },
                { value: "name_desc", label: language === "es" ? "Nombre (Z-A)" : "Name (Z-A)" },
                { value: "cost_desc", label: language === "es" ? "Mayor costo" : "Highest cost" },
                { value: "cost_asc", label: language === "es" ? "Menor costo" : "Lowest cost" },
                { value: "created_desc", label: language === "es" ? "Más recientes" : "Newest" },
                { value: "created_asc", label: language === "es" ? "Más antiguas" : "Oldest" },
                { value: "updated_desc", label: language === "es" ? "Editadas recientemente" : "Recently updated" },
              ]}
            />
            <Button variant="outline" onClick={handleRecalculateAll} disabled={recalculating}>
              <RefreshCw className={`w-4 h-4 mr-2 ${recalculating ? "animate-spin" : ""}`} />
              {language === "es" ? "Recalcular" : "Recalculate"}
            </Button>
            <Button variant="outline" onClick={() => setRecipeImportOpen(true)} data-testid="recipes-import-btn">
              <FileUp className="w-4 h-4 mr-2" />
              {language === "es" ? "Importar Recetas" : "Import Recipes"}
            </Button>
            <Button onClick={() => { setEditingRecipe(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />{language === "es" ? "Nueva Receta" : "New Recipe"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRecipes.map(recipe => (
              <Card key={recipe.recipe_id} className="hover:shadow-lg transition-shadow group">
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center">
                      {getRecipeTypeIcon(recipe.recipe_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{recipe.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {getRecipeTypeBadge(recipe.recipe_type)}
                        {recipe.needs_review === true && (
                          <Badge className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px]">
                            <AlertTriangle className="w-3 h-3 mr-0.5" />
                            {language === "es" ? "Revisar" : "Review"}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {recipe.yield_quantity} {recipe.yield_unit}
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDuplicate(recipe.recipe_id)} title={language === "es" ? "Duplicar" : "Duplicate"}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingRecipe(recipe); setDialogOpen(true); }}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(recipe.recipe_id)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{recipe.ingredients?.length || 0} {language === "es" ? "ingredientes" : "ingredients"}</span>
                      {recipe.sub_recipes?.length > 0 && (
                        <span>• {recipe.sub_recipes.length} sub-{language === "es" ? "recetas" : "recipes"}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{language === "es" ? "Costo Total" : "Total Cost"}</span>
                      <span className="font-semibold text-green-600">${(recipe.total_cost || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{language === "es" ? "Costo/Porción" : "Cost/Portion"}</span>
                      <span className="font-semibold">${(recipe.cost_per_portion || 0).toFixed(2)}</span>
                    </div>
                    {recipe.sell_price > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{language === "es" ? "% Costo Comida" : "Food Cost %"}</span>
                        <span className={`font-semibold ${recipe.food_cost_percent > 35 ? "text-red-500" : recipe.food_cost_percent > 30 ? "text-yellow-500" : "text-green-500"}`}>
                          {(recipe.food_cost_percent || 0).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredRecipes.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                <ChefHat className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{language === "es" ? "No hay recetas" : "No recipes found"}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recipe Builder Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ChefHat className="w-5 h-5" />
              {editingRecipe ? (language === "es" ? "Editar Receta" : "Edit Recipe") : (language === "es" ? "Nueva Receta" : "New Recipe")}
            </DialogTitle>
          </DialogHeader>
          <RecipeBuilder
            onClose={() => setDialogOpen(false)}
            onSave={() => fetchData()}
            initialRecipe={editingRecipe}
            ingredients={ingredients}
            allRecipes={recipes}
          />
        </DialogContent>
      </Dialog>

      {/* Recalculate Costs Preview Dialog */}
      <Dialog open={recalcDialogOpen} onOpenChange={(o) => { if (!o && !recalcApplying) { setRecalcDialogOpen(false); setRecalcReport(null); } }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" data-testid="recalc-preview-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-emerald-600" />
              {language === "es" ? "Vista previa: Recálculo de costos" : "Preview: Cost Recalculation"}
            </DialogTitle>
          </DialogHeader>
          {recalcReport && (
            <>
              <div className="grid grid-cols-4 gap-3 py-3">
                <div className="p-3 rounded-lg border bg-muted/30">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{language === "es" ? "Recetas evaluadas" : "Recipes scanned"}</p>
                  <p className="text-2xl font-bold">{recalcReport.total_recipes}</p>
                </div>
                <div className="p-3 rounded-lg border bg-amber-50">
                  <p className="text-[10px] uppercase tracking-wide text-amber-700">{language === "es" ? "Con cambios" : "Changed"}</p>
                  <p className="text-2xl font-bold text-amber-900" data-testid="recalc-changed-count">{recalcReport.changed_count}</p>
                </div>
                <div className="p-3 rounded-lg border bg-emerald-50">
                  <p className="text-[10px] uppercase tracking-wide text-emerald-700">{language === "es" ? "Subieron" : "Increased"}</p>
                  <p className="text-2xl font-bold text-emerald-900">{recalcReport.increase_count}</p>
                </div>
                <div className="p-3 rounded-lg border bg-red-50">
                  <p className="text-[10px] uppercase tracking-wide text-red-700">{language === "es" ? "Bajaron" : "Decreased"}</p>
                  <p className="text-2xl font-bold text-red-900">{recalcReport.decrease_count}</p>
                </div>
              </div>
              {recalcReport.changed_count === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle className="w-12 h-12 text-emerald-500 mb-2" />
                  <p className="font-semibold">{language === "es" ? "Todo está al día" : "Everything is up to date"}</p>
                  <p className="text-xs text-muted-foreground">{language === "es" ? "Los costos guardados ya reflejan los ingredientes y mermas actuales." : "Saved costs already reflect current ingredients and waste defaults."}</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto -mx-6 px-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === "es" ? "Receta" : "Recipe"}</TableHead>
                        <TableHead className="text-right">{language === "es" ? "Costo anterior" : "Old cost"}</TableHead>
                        <TableHead className="text-right">{language === "es" ? "Costo nuevo" : "New cost"}</TableHead>
                        <TableHead className="text-right">{language === "es" ? "Diferencia" : "Difference"}</TableHead>
                        <TableHead className="text-right">{language === "es" ? "Food cost %" : "Food cost %"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recalcReport.changes.map((c) => {
                        const isUp = c.diff_pct > 0;
                        return (
                          <TableRow key={c.recipe_id}>
                            <TableCell className="font-medium">{c.name}</TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">${c.old_total_cost.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-mono text-xs font-semibold">${c.new_total_cost.toFixed(2)}</TableCell>
                            <TableCell className={`text-right font-mono text-xs font-semibold ${isUp ? "text-amber-700" : "text-red-600"}`}>
                              {isUp ? "+" : ""}${c.diff_amount.toFixed(2)} <span className="opacity-60">({isUp ? "+" : ""}{c.diff_pct.toFixed(1)}%)</span>
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {c.sell_price > 0 ? `${c.new_food_cost_pct.toFixed(1)}%` : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              <DialogFooter className="border-t pt-3">
                <Button variant="outline" onClick={() => { setRecalcDialogOpen(false); setRecalcReport(null); }} disabled={recalcApplying}>
                  {language === "es" ? "Cancelar" : "Cancel"}
                </Button>
                {recalcReport.changed_count > 0 && (
                  <Button onClick={handleApplyRecalc} disabled={recalcApplying} data-testid="recalc-apply-btn">
                    {recalcApplying
                      ? (language === "es" ? "Aplicando..." : "Applying...")
                      : (language === "es" ? `Aplicar ${recalcReport.changed_count} cambios` : `Apply ${recalcReport.changed_count} changes`)}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <RecipeImportDialog
        open={recipeImportOpen}
        onClose={() => setRecipeImportOpen(false)}
        onImported={fetchData}
      />
    </div>
  );
}

// ==================== PLATED MENUS SECTION ====================
function PlatedMenusSection() {
  const { language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [menus, setMenus] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [stalenessByMenu, setStalenessByMenu] = useState({}); // menu_id -> staleness payload
  const [projectedByMenu, setProjectedByMenu] = useState({}); // menu_id -> projected-cost payload
  const [refreshingMenuId, setRefreshingMenuId] = useState(null);
  const [factorsDialogOpen, setFactorsDialogOpen] = useState(false);
  const [meDialogOpen, setMeDialogOpen] = useState(false);
  const [varianceDialogOpen, setVarianceDialogOpen] = useState(false);
  const [digestDialogOpen, setDigestDialogOpen] = useState(false);
  const [convertingMenuId, setConvertingMenuId] = useState(null);
  const [deeplinkEventId, setDeeplinkEventId] = useState(null);
  const [highlightedMenuId, setHighlightedMenuId] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [menusRes, recipesRes] = await Promise.all([
        axios.get(`${API}/api/plated-menus`, { withCredentials: true }),
        axios.get(`${API}/api/recipes`, { withCredentials: true })
      ]);
      setMenus(menusRes.data);
      setRecipes(recipesRes.data);
      // Fire staleness checks in parallel — non-blocking, best-effort
      const stalenessChecks = await Promise.all(
        (menusRes.data || []).map((m) =>
          axios
            .get(`${API}/api/plated-menus/${m.menu_id}/staleness`, { withCredentials: true })
            .then((r) => [m.menu_id, r.data])
            .catch(() => [m.menu_id, null])
        )
      );
      const map = {};
      stalenessChecks.forEach(([id, data]) => { if (data) map[id] = data; });
      setStalenessByMenu(map);
      // Fire projected-cost checks ONLY for buffet/cocktail menus (Feature 1)
      const buffetMenus = (menusRes.data || []).filter((m) => ["buffet", "cocktail"].includes(m.menu_type));
      const projChecks = await Promise.all(
        buffetMenus.map((m) =>
          axios
            .get(`${API}/api/plated-menus/${m.menu_id}/projected-cost`, { withCredentials: true })
            .then((r) => [m.menu_id, r.data])
            .catch(() => [m.menu_id, null])
        )
      );
      const pmap = {};
      projChecks.forEach(([id, data]) => { if (data) pmap[id] = data; });
      setProjectedByMenu(pmap);
    } catch (error) {
      toast.error("Error loading data");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Deeplink consumer — read ?dialog=...&event_id=...&menu_id=... and open the matching dialog
  useEffect(() => {
    const dialog = searchParams.get("dialog");
    if (!dialog) return;
    const eventId = searchParams.get("event_id");
    const menuId = searchParams.get("menu_id");

    if (dialog === "variance") {
      if (eventId) setDeeplinkEventId(eventId);
      setVarianceDialogOpen(true);
    } else if (dialog === "menu-engineering") {
      setMeDialogOpen(true);
    } else if (dialog === "digest") {
      setDigestDialogOpen(true);
    } else if (dialog === "staleness" && menuId) {
      setHighlightedMenuId(menuId);
      setTimeout(() => {
        const el = document.querySelector(`[data-menu-id="${menuId}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 600);
    }

    // Clear the consumed params so closing the dialog doesn't re-trigger
    const next = new URLSearchParams(searchParams);
    next.delete("dialog");
    next.delete("event_id");
    next.delete("menu_id");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefreshMenuCosts = async (menuId) => {
    setRefreshingMenuId(menuId);
    try {
      await axios.post(`${API}/api/plated-menus/${menuId}/refresh-costs`, {}, { withCredentials: true });
      toast.success(language === "es" ? "Costos actualizados" : "Costs refreshed");
      await fetchData();
    } catch (error) {
      toast.error(language === "es" ? "Error al actualizar" : "Refresh failed");
    } finally {
      setRefreshingMenuId(null);
    }
  };

  const handleDelete = async (menuId) => {
    if (!window.confirm(language === "es" ? "¿Eliminar?" : "Delete?")) return;
    try {
      await axios.delete(`${API}/api/plated-menus/${menuId}`, { withCredentials: true });
      toast.success(language === "es" ? "Eliminado" : "Deleted");
      fetchData();
    } catch (error) {
      toast.error("Error");
    }
  };

  const [menuSortBy, setMenuSortBy] = useState(readStoredSort("menusSortBy", "name_asc"));

  const menuSorters = {
    name_asc: (a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }),
    name_desc: (a, b) => (b.name || "").localeCompare(a.name || "", undefined, { sensitivity: "base" }),
    cost_desc: (a, b) => (b.cost_per_guest || 0) - (a.cost_per_guest || 0),
    cost_asc: (a, b) => (a.cost_per_guest || 0) - (b.cost_per_guest || 0),
    base_price_desc: (a, b) => (b.base_price_per_guest || 0) - (a.base_price_per_guest || 0),
    created_desc: (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
    updated_desc: (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0),
  };

  const filteredMenus = applySort(
    menus.filter(m => m.name?.toLowerCase().includes(searchTerm.toLowerCase())),
    menuSortBy,
    menuSorters,
  );

  const getMenuTypeLabel = (type) => {
    const types = {
      plated: { en: "Plated", es: "Emplatado" },
      buffet: { en: "Buffet", es: "Buffet" },
      cocktail: { en: "Cocktail", es: "Coctel" },
      grab_and_go: { en: "Grab & Go", es: "Para Llevar" }
    };
    return types[type]?.[language] || type;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;

  return (
    <div className="space-y-6" data-testid="menus-section">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{language === "es" ? "Menús Emplatados" : "Plated Menus"}</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder={language === "es" ? "Buscar..." : "Search..."} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-64" /></div>
            <SortSelect
              value={menuSortBy}
              onValueChange={setMenuSortBy}
              storageKey="menusSortBy"
              label={language === "es" ? "Ordenar" : "Sort"}
              triggerClassName="w-[200px]"
              testId="menus-sort-select"
              options={[
                { value: "name_asc", label: language === "es" ? "Nombre (A-Z)" : "Name (A-Z)" },
                { value: "name_desc", label: language === "es" ? "Nombre (Z-A)" : "Name (Z-A)" },
                { value: "cost_desc", label: language === "es" ? "Mayor costo/invitado" : "Highest cost/guest" },
                { value: "cost_asc", label: language === "es" ? "Menor costo/invitado" : "Lowest cost/guest" },
                { value: "base_price_desc", label: language === "es" ? "Mayor precio base" : "Highest base price" },
                { value: "created_desc", label: language === "es" ? "Más recientes" : "Newest" },
                { value: "updated_desc", label: language === "es" ? "Editados recientemente" : "Recently updated" },
              ]}
            />
            <Button variant="outline" onClick={() => setMeDialogOpen(true)} className="gap-1.5" data-testid="open-menu-engineering-btn">
              <TrendingUp className="w-4 h-4" />
              {language === "es" ? "Ingeniería de Menú" : "Menu Engineering"}
            </Button>
            <Button variant="outline" onClick={() => setVarianceDialogOpen(true)} className="gap-1.5" data-testid="open-cost-variance-btn">
              <AlertTriangle className="w-4 h-4" />
              {language === "es" ? "Variación" : "Variance"}
            </Button>
            <Button variant="outline" onClick={() => setFactorsDialogOpen(true)} className="gap-1.5" data-testid="open-buffet-factors-btn">
              <Sliders className="w-4 h-4" />
              {language === "es" ? "Factores Buffet" : "Buffet Factors"}
            </Button>
            <Button variant="outline" onClick={() => setDigestDialogOpen(true)} className="gap-1.5" data-testid="open-culinary-digest-btn">
              <Mail className="w-4 h-4" />
              {language === "es" ? "Resumen Semanal" : "Weekly Digest"}
            </Button>
            <Button onClick={() => { setEditingMenu(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />{language === "es" ? "Nuevo Menú" : "New Menu"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filteredMenus.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MenuIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{language === "es" ? "No hay menús" : "No menus found"}</p>
              <p className="text-sm mt-2">{language === "es" ? "Crea un menú emplatado con varios tiempos" : "Create a plated menu with multiple courses"}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMenus.map(menu => (
                <Card
                  key={menu.menu_id}
                  data-menu-id={menu.menu_id}
                  data-testid={`menu-card-${menu.menu_id}`}
                  className={`hover:shadow-lg transition-all ${highlightedMenuId === menu.menu_id ? "ring-2 ring-amber-400 shadow-lg" : ""}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{menu.name}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Badge variant="outline">{getMenuTypeLabel(menu.menu_type)}</Badge>
                          <span>{menu.courses?.length || 0} {language === "es" ? "tiempos" : "courses"}</span>
                        </CardDescription>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={language === "es" ? "Convertir a Catálogo" : "Convert to Catalog"}
                          disabled={convertingMenuId === menu.menu_id}
                          onClick={async () => {
                            if (!window.confirm(language === "es"
                              ? `¿Convertir "${menu.name}" en un menú de catálogo para usar en propuestas?`
                              : `Convert "${menu.name}" into a Catalog menu for proposals?`
                            )) return;
                            setConvertingMenuId(menu.menu_id);
                            try {
                              const res = await axios.post(
                                `${API}/api/plated-menus/${menu.menu_id}/convert-to-catalog`,
                                {},
                                { withCredentials: true }
                              );
                              toast.success(language === "es"
                                ? `Creado: ${res.data.name}`
                                : `Created: ${res.data.name}`);
                            } catch (err) {
                              const msg = err?.response?.data?.detail;
                              toast.error(typeof msg === "string" ? msg : (language === "es" ? "Error al convertir" : "Convert failed"));
                            } finally {
                              setConvertingMenuId(null);
                            }
                          }}
                          data-testid={`convert-to-catalog-${menu.menu_id}`}
                        >
                          {convertingMenuId === menu.menu_id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <FileText className="w-4 h-4 text-indigo-600" />
                          }
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { setEditingMenu(menu); setDialogOpen(true); }}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(menu.menu_id)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {menu.courses?.slice(0, 3).map((course, idx) => (
                        <div key={idx} className="text-sm">
                          <span className="font-medium capitalize">{course.course_name}</span>
                          <span className="text-muted-foreground ml-1">({course.items?.length || 0})</span>
                        </div>
                      ))}
                      {menu.courses?.length > 3 && (
                        <p className="text-sm text-muted-foreground">+{menu.courses.length - 3} {language === "es" ? "más" : "more"}</p>
                      )}
                      <div className="pt-2 border-t flex items-center justify-between">
                        <span className="text-sm">{language === "es" ? "Costo/Comensal" : "Cost/Guest"}</span>
                        <span className="font-semibold text-green-600">${(menu.cost_per_guest || 0).toFixed(2)}</span>
                      </div>
                      {menu.buffer_percentage > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">+{menu.buffer_percentage}% buffer</span>
                          <span className="font-semibold">${(menu.cost_with_buffer || 0).toFixed(2)}</span>
                        </div>
                      )}
                      {(() => {
                        const proj = projectedByMenu[menu.menu_id];
                        if (!proj || !["buffet", "cocktail"].includes(menu.menu_type)) return null;
                        const overrun = proj.savings_or_overrun;
                        const pct = proj.savings_percent;
                        const color = overrun > 0
                          ? "border-red-200 bg-red-50/40 dark:bg-red-950/10"
                          : "border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10";
                        return (
                          <div className={`mt-2 rounded-md border px-2 py-1.5 text-xs ${color}`} data-testid={`menu-projected-${menu.menu_id}`}>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{language === "es" ? "Costo proyectado" : "Projected cost"}</span>
                              <span className="font-mono font-semibold">${proj.projected_cost_per_guest.toFixed(2)}</span>
                            </div>
                            <div className="text-[10px] opacity-80 mt-0.5">
                              vs ${proj.theoretical_cost_per_guest.toFixed(2)} ({language === "es" ? "teórico" : "theoretical"}) ·
                              {overrun >= 0 ? " +" : " "}{pct.toFixed(1)}%
                            </div>
                          </div>
                        );
                      })()}
                      {(() => {
                        const st = stalenessByMenu[menu.menu_id];
                        if (!st || !st.is_stale) return null;
                        const color = st.severity === "critical"
                          ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300"
                          : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300";
                        const sign = st.drift_amount >= 0 ? "+" : "";
                        return (
                          <div
                            className={`mt-2 rounded-md border px-2 py-1.5 text-xs ${color}`}
                            data-testid={`menu-staleness-${menu.menu_id}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="font-medium">
                                  {language === "es" ? "Costo desactualizado" : "Stale cost"}
                                  {": "}
                                  {sign}{st.drift_percent.toFixed(1)}%
                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                disabled={refreshingMenuId === menu.menu_id}
                                onClick={(e) => { e.stopPropagation(); handleRefreshMenuCosts(menu.menu_id); }}
                                data-testid={`menu-refresh-costs-${menu.menu_id}`}
                              >
                                {refreshingMenuId === menu.menu_id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                            <div className="mt-1 text-[11px] opacity-80">
                              {language === "es" ? "Snapshot" : "Snapshot"}: ${st.snapshot_cost_per_guest.toFixed(2)} →{" "}
                              {language === "es" ? "Actual" : "Live"}: ${st.live_cost_per_guest.toFixed(2)}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plated Menu Builder Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              {editingMenu ? (language === "es" ? "Editar Menú" : "Edit Menu") : (language === "es" ? "Nuevo Menú Emplatado" : "New Plated Menu")}
            </DialogTitle>
          </DialogHeader>
          <PlatedMenuBuilder
            onClose={() => setDialogOpen(false)}
            onSave={() => fetchData()}
            initialMenu={editingMenu}
            recipes={recipes}
          />
        </DialogContent>
      </Dialog>

      <BuffetFactorsDialog
        open={factorsDialogOpen}
        onOpenChange={setFactorsDialogOpen}
        recipes={recipes}
      />

      <MenuEngineeringDialog
        open={meDialogOpen}
        onOpenChange={setMeDialogOpen}
      />

      <CostVarianceDialog
        open={varianceDialogOpen}
        onOpenChange={(o) => { setVarianceDialogOpen(o); if (!o) setDeeplinkEventId(null); }}
        initialEventId={deeplinkEventId}
      />

      <CulinaryDigestDialog
        open={digestDialogOpen}
        onOpenChange={setDigestDialogOpen}
      />
    </div>
  );
}

// ==================== PURCHASES SECTION ====================
function PurchasesSection() {
  const { language } = useLanguage();
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [purchaseData, setPurchaseData] = useState(null);
  const [savedLists, setSavedLists] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    try {
      // Only fetch confirmed (Won/Closed) events for procurement
      const res = await axios.get(`${API}/api/events/confirmed`, { withCredentials: true });
      setEvents(res.data);
    } catch (error) {
      toast.error("Error loading events");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const fetchPurchaseList = async (eventId) => {
    setLoading(true);
    try {
      const [generateRes, savedRes] = await Promise.all([
        axios.get(`${API}/api/purchase-lists/event/${eventId}/generate`, { withCredentials: true }),
        axios.get(`${API}/api/purchase-lists?event_id=${eventId}`, { withCredentials: true })
      ]);
      setPurchaseData(generateRes.data);
      setSavedLists(savedRes.data);
    } catch (error) {
      toast.error("Error loading purchase list");
    }
    setLoading(false);
  };

  const handleSelectEvent = (eventId) => {
    setSelectedEvent(eventId);
    fetchPurchaseList(eventId);
  };

  const handleSavePurchaseList = async (supplierId, supplierData) => {
    try {
      await axios.post(`${API}/api/purchase-lists`, {
        event_id: selectedEvent,
        supplier_id: supplierId === "no_supplier" ? null : supplierId,
        supplier_name: supplierData.supplier_name,
        items: supplierData.items,
        total_cost: supplierData.total_cost
      }, { withCredentials: true });
      toast.success(language === "es" ? "Lista guardada" : "List saved");
      fetchPurchaseList(selectedEvent);
    } catch (error) {
      toast.error("Error");
    }
  };

  const handleUpdateStatus = async (purchaseListId, newStatus) => {
    try {
      await axios.put(`${API}/api/purchase-lists/${purchaseListId}/status`, {
        status: newStatus,
        create_transactions: newStatus === "Received"
      }, { withCredentials: true });
      toast.success(language === "es" ? "Actualizado" : "Updated");
      fetchPurchaseList(selectedEvent);
    } catch (error) {
      toast.error("Error");
    }
  };

  const itemsBySupplier = purchaseData?.items_by_supplier || {};
  const stockRequisition = purchaseData?.stock_requisition || purchaseData?.available || [];
  const purchaseList = purchaseData?.purchase_list || purchaseData?.short || [];

  if (loading && !selectedEvent) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;

  return (
    <div className="space-y-6" data-testid="purchases-section">
      {/* Event Selector */}
      <Card>
        <CardHeader>
          <CardTitle>{language === "es" ? "Seleccionar Evento" : "Select Event"}</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedEvent || ""} onValueChange={handleSelectEvent}>
            <SelectTrigger className="w-full max-w-md"><SelectValue placeholder={language === "es" ? "Seleccionar evento..." : "Select event..."} /></SelectTrigger>
            <SelectContent>
              {events.map(event => (
                <SelectItem key={event.event_id} value={event.event_id}>{event.name} - {event.event_date ? new Date(event.event_date).toLocaleDateString() : "TBD"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Stock Analysis */}
      {selectedEvent && !loading && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Stock Requisition (SR) - Items in Stock */}
          <Card className="border-emerald-200 bg-emerald-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <span>{language === "es" ? "Requisición de Inventario (SR)" : "Stock Requisition (SR)"}</span>
                <Badge variant="secondary" className="ml-auto">{stockRequisition.length}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {language === "es" ? "Items disponibles en inventario actual" : "Items available from current inventory"}
              </p>
            </CardHeader>
            <CardContent>
              {stockRequisition.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {stockRequisition.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-background rounded border">
                      <span className="text-sm font-medium">{item.name}</span>
                      <div className="text-right">
                        <span className="text-sm font-mono">{item.quantity_needed?.toFixed(1)} {item.unit}</span>
                        <span className="text-xs text-emerald-600 ml-2">✓ En stock</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {language === "es" ? "No hay items en stock" : "No items in stock"}
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
                <Badge variant="secondary" className="ml-auto">{purchaseList.length}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {language === "es" ? "Items que necesitan ser comprados" : "Items that need to be purchased"}
              </p>
            </CardHeader>
            <CardContent>
              {purchaseList.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {purchaseList.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-background rounded border">
                      <span className="text-sm font-medium">{item.name}</span>
                      <div className="text-right">
                        <span className="text-sm font-mono text-amber-700">{item.shortage?.toFixed(1)} {item.unit}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          (${((item.shortage || 0) * (item.cost_per_unit || 0)).toFixed(2)})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-emerald-600 text-center py-4">
                  {language === "es" ? "✓ Todo cubierto con inventario" : "✓ All covered by inventory"}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Purchase List by Supplier */}
      {selectedEvent && (
        <>
          {loading ? (
            <div className="flex items-center justify-center h-32"><RefreshCw className="w-6 h-6 animate-spin" /></div>
          ) : Object.keys(itemsBySupplier).length === 0 && purchaseList.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{language === "es" ? "No hay artículos para comprar" : "No items to purchase"}</p>
                <p className="text-sm mt-2">{language === "es" ? "Agrega artículos de tipo Food con recetas vinculadas" : "Add Food type items with linked recipes"}</p>
              </CardContent>
            </Card>
          ) : Object.keys(itemsBySupplier).length > 0 ? (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">{language === "es" ? "Órdenes de Compra por Proveedor" : "Purchase Orders by Supplier"}</h3>
              {Object.entries(itemsBySupplier).map(([supplierId, supplierData]) => (
                <Card key={supplierId}>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Truck className="w-5 h-5 text-blue-500" />
                      <CardTitle className="text-base">{supplierData.supplier_name || (language === "es" ? "Sin Proveedor" : "No Supplier")}</CardTitle>
                      <Badge variant="outline">{supplierData.items.length} items</Badge>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-semibold text-lg">${supplierData.total_cost?.toFixed(2)}</span>
                      <Button variant="outline" size="sm" onClick={() => handleSavePurchaseList(supplierId, supplierData)}>
                        {language === "es" ? "Guardar" : "Save"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader><TableRow><TableHead>{language === "es" ? "Artículo" : "Item"}</TableHead><TableHead className="text-right">{language === "es" ? "Requerido" : "Required"}</TableHead><TableHead className="text-right">{language === "es" ? "Disponible" : "Available"}</TableHead><TableHead className="text-right">{language === "es" ? "Por Comprar" : "To Purchase"}</TableHead><TableHead className="text-right">{language === "es" ? "Costo" : "Cost"}</TableHead><TableHead>{language === "es" ? "Estado" : "Status"}</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {supplierData.items.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{item.item_name}</TableCell>
                            <TableCell className="text-right">{item.required_qty} {item.unit}</TableCell>
                            <TableCell className="text-right">{item.in_stock_qty} {item.unit}</TableCell>
                            <TableCell className="text-right font-semibold">{item.to_purchase_qty > 0 ? <span className="text-red-500">{item.to_purchase_qty}</span> : <span className="text-green-500">0</span>}</TableCell>
                            <TableCell className="text-right">${item.total_cost?.toFixed(2)}</TableCell>
                            <TableCell><Badge variant={item.status === "InStock" ? "default" : item.status === "Short" ? "destructive" : "secondary"}>{item.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}

          {/* Saved Lists */}
          {savedLists.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2">{language === "es" ? "Listas Guardadas" : "Saved Lists"}</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>{language === "es" ? "Proveedor" : "Supplier"}</TableHead><TableHead>Items</TableHead><TableHead className="text-right">Total</TableHead><TableHead>{language === "es" ? "Estado" : "Status"}</TableHead><TableHead></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {savedLists.map(list => (
                      <TableRow key={list.purchase_list_id}>
                        <TableCell className="font-medium">{list.supplier_name || "-"}</TableCell>
                        <TableCell>{list.items?.length || 0}</TableCell>
                        <TableCell className="text-right">${list.total_cost?.toFixed(2)}</TableCell>
                        <TableCell><Badge variant={list.status === "Received" ? "default" : list.status === "Ordered" ? "secondary" : "outline"}>{list.status}</Badge></TableCell>
                        <TableCell>
                          {list.status === "Draft" && <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(list.purchase_list_id, "Ordered")}>{language === "es" ? "Ordenar" : "Order"}</Button>}
                          {list.status === "Ordered" && <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(list.purchase_list_id, "Received")}>{language === "es" ? "Recibido" : "Received"}</Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ==================== MAIN FOOD OPS PAGE ====================
export default function FoodOpsPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const location = useLocation();
  const navigate = useNavigate();
  
  // Culinary Intelligence - Navigation tabs
  const navTabs = [
    { path: "/food-ops/inventory", label: isEs ? "Inventario" : "Inventory", icon: Package },
    { path: "/food-ops/recipes", label: isEs ? "Recetas" : "Recipes", icon: ChefHat },
    { path: "/food-ops/menus", label: isEs ? "Menús" : "Menus", icon: BookOpen },
    { path: "/food-ops/production", label: isEs ? "Producción" : "Production", icon: Factory },
    { path: "/food-ops/consolidated", label: isEs ? "Costos" : "Costs", icon: Layers },
    { path: "/food-ops/purchase-orders", label: isEs ? "Órdenes" : "Orders", icon: Truck },
    { path: "/food-ops/physical-count", label: isEs ? "Conteo Físico" : "Physical Count", icon: ClipboardList },
    { path: "/food-ops/import-export", label: isEs ? "Importar/Exportar" : "Import/Export", icon: FileUp },
  ];

  return (
    <Layout>
      <div className="space-y-6" data-testid="food-ops-page">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Culinary Intelligence</h1>
            <p className="text-sm text-muted-foreground">
              {isEs ? "Recetas, costos e inventario de alimentos" : "Recipes, costing & food inventory"}
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="border-b">
          <nav className="flex gap-1 overflow-x-auto pb-px">
            {navTabs.map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? "border-orange-600 text-orange-600"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                  }`
                }
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Content */}
        <Routes>
          <Route index element={<Navigate to="inventory" replace />} />
          <Route path="inventory" element={<InventorySection />} />
          <Route path="recipes" element={<RecipesSection />} />
          <Route path="menus" element={<PlatedMenusSection />} />
          <Route path="production" element={<ProductionSectionWrapper />} />
          <Route path="purchase-orders" element={<PurchaseOrdersSectionWrapper />} />
          <Route path="consolidated" element={<ConsolidatedPurchaseSectionWrapper />} />
          <Route path="physical-count" element={<PhysicalCountSection />} />
          <Route path="import-export" element={<ImportExportSection filter="culinary" />} />
        </Routes>
      </div>
    </Layout>
  );
}

// Lazy load wrappers
function ProductionSectionWrapper() {
  const [Component, setComponent] = useState(null);
  useEffect(() => {
    import("../components/ProductionSection").then(mod => setComponent(() => mod.default));
  }, []);
  if (!Component) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;
  return <Component />;
}

function PurchaseOrdersSectionWrapper() {
  const [Component, setComponent] = useState(null);
  useEffect(() => {
    import("../components/PurchaseOrdersSection").then(mod => setComponent(() => mod.default));
  }, []);
  if (!Component) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;
  return <Component />;
}

function ConsolidatedPurchaseSectionWrapper() {
  const [Component, setComponent] = useState(null);
  useEffect(() => {
    import("../components/ConsolidatedPurchaseSection").then(mod => setComponent(() => mod.default));
  }, []);
  if (!Component) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;
  return <Component />;
}
