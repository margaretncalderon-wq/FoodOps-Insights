import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

// Custom Components
import RecipeBuilder from "../components/RecipeBuilder";
import PlatedMenuBuilder from "../components/PlatedMenuBuilder";

// Icons
import { 
  Package, Plus, Search, AlertTriangle, Truck, Edit, Trash2, 
  ArrowUpDown, DollarSign, Archive, ShoppingCart, ChefHat,
  UtensilsCrossed, RefreshCw, Copy, BookOpen, Layers, Beaker,
  Utensils, Menu as MenuIcon, ArrowLeft, History, Printer
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const INVENTORY_TYPES = [
  { value: "food", label: "Food", labelEs: "Alimentos" },
  { value: "packaging", label: "Packaging", labelEs: "Empaque" },
  { value: "disposable", label: "Disposable", labelEs: "Desechables" },
  { value: "equipment", label: "Equipment", labelEs: "Equipo" },
  { value: "event_supply", label: "Event Supply", labelEs: "Suministros" },
];

const CATEGORIES = [
  "protein", "dairy", "produce", "dry_goods", "beverage", "spices", 
  "frozen", "bakery", "packaging", "cleaning", "equipment"
];

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
  
  // Dialogs
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [priceHistoryDialogOpen, setPriceHistoryDialogOpen] = useState(false);
  const [selectedItemForHistory, setSelectedItemForHistory] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  
  // Forms
  const [itemForm, setItemForm] = useState({
    name: "", category: "dry_goods", inventory_type: "food", unit: "kg",
    cost_per_unit: 0, stock_quantity: 0, par_level: 0, pack_size: 1, 
    preferred_supplier_id: "", secondary_supplier_id: "",
    purchase_unit: "", purchase_pack_size: 1
  });
  
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
      const [itemsRes, suppliersRes, transactionsRes] = await Promise.all([
        axios.get(`${API}/api/inventory/ingredients`, { withCredentials: true }),
        axios.get(`${API}/api/suppliers`, { withCredentials: true }),
        axios.get(`${API}/api/inventory/transactions`, { withCredentials: true })
      ]);
      setItems(itemsRes.data);
      setSuppliers(suppliersRes.data);
      setTransactions(transactionsRes.data);
    } catch (error) {
      toast.error("Error loading data");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveItem = async () => {
    try {
      if (editingItem) {
        await axios.put(`${API}/api/inventory/ingredients/${editingItem.ingredient_id}`, itemForm, { withCredentials: true });
      } else {
        await axios.post(`${API}/api/inventory/ingredients`, itemForm, { withCredentials: true });
      }
      toast.success(language === "es" ? "Guardado" : "Saved");
      setItemDialogOpen(false);
      setEditingItem(null);
      setItemForm({ name: "", category: "dry_goods", inventory_type: "food", unit: "kg", cost_per_unit: 0, stock_quantity: 0, par_level: 0, pack_size: 1, preferred_supplier_id: "" });
      fetchData();
    } catch (error) {
      toast.error("Error");
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

  const handleEditItem = (item) => {
    setEditingItem(item);
    setItemForm({
      name: item.name || "", category: item.category || "dry_goods", inventory_type: item.inventory_type || "food",
      unit: item.unit || "kg", cost_per_unit: item.cost_per_unit || 0, stock_quantity: item.stock_quantity || 0,
      par_level: item.par_level || 0, pack_size: item.pack_size || 1, preferred_supplier_id: item.preferred_supplier_id || "",
      secondary_supplier_id: item.secondary_supplier_id || "", purchase_unit: item.purchase_unit || "",
      purchase_pack_size: item.purchase_pack_size || 1
    });
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

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || item.inventory_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const lowStockItems = items.filter(item => item.par_level > 0 && (item.stock_quantity || 0) < item.par_level);
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
              <div className="flex items-center gap-2">
                <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder={t("search")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-64" /></div>
                <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("all")}</SelectItem>{INVENTORY_TYPES.map(type => (<SelectItem key={type.value} value={type.value}>{language === "es" ? type.labelEs : type.label}</SelectItem>))}</SelectContent></Select>
                <Button onClick={() => { setEditingItem(null); setItemForm({ name: "", category: "dry_goods", inventory_type: "food", unit: "kg", cost_per_unit: 0, stock_quantity: 0, par_level: 0, pack_size: 1, preferred_supplier_id: "" }); setItemDialogOpen(true); }}><Plus className="w-4 h-4 mr-2" />{t("addItem")}</Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>{t("name")}</TableHead><TableHead>{t("type")}</TableHead><TableHead>{t("category")}</TableHead><TableHead className="text-right">{t("stock")}</TableHead><TableHead className="text-right">{t("parLevel")}</TableHead><TableHead className="text-right">{t("cost")}</TableHead><TableHead>{t("supplier")}</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {filteredItems.map(item => (
                    <TableRow key={item.ingredient_id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell><Badge variant="outline">{INVENTORY_TYPES.find(t => t.value === item.inventory_type)?.[language === "es" ? "labelEs" : "label"] || item.inventory_type}</Badge></TableCell>
                      <TableCell className="capitalize">{item.category?.replace("_", " ")}</TableCell>
                      <TableCell className="text-right"><span className={item.par_level > 0 && (item.stock_quantity || 0) < item.par_level ? "text-red-500 font-semibold" : ""}>{item.stock_quantity || 0} {item.unit}</span></TableCell>
                      <TableCell className="text-right">{item.par_level || 0} {item.unit}</TableCell>
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
                  ))}
                  {filteredItems.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{language === "es" ? "No hay artículos" : "No items found"}</TableCell></TableRow>}
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
            <div className="col-span-2"><Label>{t("name")}</Label><Input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} /></div>
            <div><Label>{t("type")}</Label><Select value={itemForm.inventory_type} onValueChange={(v) => setItemForm({ ...itemForm, inventory_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{INVENTORY_TYPES.map(type => (<SelectItem key={type.value} value={type.value}>{language === "es" ? type.labelEs : type.label}</SelectItem>))}</SelectContent></Select></div>
            <div><Label>{t("category")}</Label><Select value={itemForm.category} onValueChange={(v) => setItemForm({ ...itemForm, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(cat => (<SelectItem key={cat} value={cat} className="capitalize">{cat.replace("_", " ")}</SelectItem>))}</SelectContent></Select></div>
            <div><Label>{t("unit")}</Label><Select value={itemForm.unit} onValueChange={(v) => setItemForm({ ...itemForm, unit: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["kg", "g", "lb", "oz", "L", "ml", "unit", "box", "case"].map(u => (<SelectItem key={u} value={u}>{u}</SelectItem>))}</SelectContent></Select></div>
            <div><Label>{t("cost")} / {itemForm.unit}</Label><Input type="number" min="0" step="0.01" value={itemForm.cost_per_unit} onChange={(e) => setItemForm({ ...itemForm, cost_per_unit: parseFloat(e.target.value) || 0 })} /></div>
            <div><Label>{t("stock")}</Label><Input type="number" min="0" step="0.01" value={itemForm.stock_quantity} onChange={(e) => setItemForm({ ...itemForm, stock_quantity: parseFloat(e.target.value) || 0 })} /></div>
            <div><Label>{t("parLevel")}</Label><Input type="number" min="0" step="0.01" value={itemForm.par_level} onChange={(e) => setItemForm({ ...itemForm, par_level: parseFloat(e.target.value) || 0 })} /></div>
            
            {/* Suppliers Section */}
            <div className="col-span-2 border-t pt-4 mt-2">
              <p className="text-sm font-medium mb-3">{language === "es" ? "Proveedores" : "Suppliers"}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{language === "es" ? "Proveedor Principal" : "Primary Supplier"}</Label>
                  <Select value={itemForm.preferred_supplier_id || "none"} onValueChange={(v) => setItemForm({ ...itemForm, preferred_supplier_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder={language === "es" ? "Seleccionar" : "Select"} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{language === "es" ? "Sin proveedor" : "No supplier"}</SelectItem>
                      {suppliers.map(s => (<SelectItem key={s.supplier_id} value={s.supplier_id}>{s.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{language === "es" ? "Proveedor Secundario" : "Secondary Supplier"}</Label>
                  <Select value={itemForm.secondary_supplier_id || "none"} onValueChange={(v) => setItemForm({ ...itemForm, secondary_supplier_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder={language === "es" ? "Seleccionar" : "Select"} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{language === "es" ? "Sin proveedor" : "No supplier"}</SelectItem>
                      {suppliers.map(s => (<SelectItem key={s.supplier_id} value={s.supplier_id}>{s.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            
            {/* Purchase Info Section */}
            <div className="col-span-2 border-t pt-4 mt-2">
              <p className="text-sm font-medium mb-3">{language === "es" ? "Info de Compra" : "Purchase Info"}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{language === "es" ? "Unidad de Compra" : "Purchase Unit"}</Label>
                  <Input value={itemForm.purchase_unit} onChange={(e) => setItemForm({ ...itemForm, purchase_unit: e.target.value })} placeholder={language === "es" ? "Ej: caja, bolsa" : "E.g., box, bag"} />
                </div>
                <div>
                  <Label>{language === "es" ? "Tamaño del Pack" : "Pack Size"}</Label>
                  <Input type="number" min="1" step="1" value={itemForm.purchase_pack_size} onChange={(e) => setItemForm({ ...itemForm, purchase_pack_size: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
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

  const handleRecalculateAll = async () => {
    setRecalculating(true);
    try {
      await axios.post(`${API}/api/recipes/recalculate-all`, {}, { withCredentials: true });
      toast.success(language === "es" ? "Costos recalculados" : "Costs recalculated");
      fetchData();
    } catch (error) {
      toast.error("Error");
    } finally {
      setRecalculating(false);
    }
  };

  const filteredRecipes = recipes.filter(r => {
    const matchesSearch = r.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || r.recipe_type === typeFilter;
    return matchesSearch && matchesType;
  });

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
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Beaker className="h-8 w-8 text-purple-500" /><div><p className="text-sm text-muted-foreground">{language === "es" ? "Bases" : "Base"}</p><p className="text-2xl font-bold">{recipes.filter(r => r.recipe_type === "base").length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Layers className="h-8 w-8 text-blue-500" /><div><p className="text-sm text-muted-foreground">{language === "es" ? "Componentes" : "Components"}</p><p className="text-2xl font-bold">{recipes.filter(r => r.recipe_type === "component").length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Utensils className="h-8 w-8 text-green-500" /><div><p className="text-sm text-muted-foreground">{language === "es" ? "Platos" : "Dishes"}</p><p className="text-2xl font-bold">{recipes.filter(r => r.recipe_type === "final_dish" || !r.recipe_type).length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><ChefHat className="h-8 w-8 text-primary" /><div><p className="text-sm text-muted-foreground">Total</p><p className="text-2xl font-bold">{recipes.length}</p></div></div></CardContent></Card>
      </div>

      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{language === "es" ? "Recetas" : "Recipes"}</CardTitle>
          <div className="flex items-center gap-2">
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
            <Button variant="outline" onClick={handleRecalculateAll} disabled={recalculating}>
              <RefreshCw className={`w-4 h-4 mr-2 ${recalculating ? "animate-spin" : ""}`} />
              {language === "es" ? "Recalcular" : "Recalculate"}
            </Button>
            <Button onClick={() => { setEditingRecipe(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />{language === "es" ? "Nueva Receta" : "New Recipe"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRecipes.map(recipe => (
              <Card key={recipe.recipe_id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getRecipeTypeIcon(recipe.recipe_type)}
                        <CardTitle className="text-lg">{recipe.name}</CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        {getRecipeTypeBadge(recipe.recipe_type)}
                        <span className="text-sm text-muted-foreground">
                          {recipe.yield_quantity} {recipe.yield_unit}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleDuplicate(recipe.recipe_id)} title={language === "es" ? "Duplicar" : "Duplicate"}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setEditingRecipe(recipe); setDialogOpen(true); }}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(recipe.recipe_id)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
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
    </div>
  );
}

// ==================== PLATED MENUS SECTION ====================
function PlatedMenusSection() {
  const { language } = useLanguage();
  const [menus, setMenus] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [menusRes, recipesRes] = await Promise.all([
        axios.get(`${API}/api/plated-menus`, { withCredentials: true }),
        axios.get(`${API}/api/recipes`, { withCredentials: true })
      ]);
      setMenus(menusRes.data);
      setRecipes(recipesRes.data);
    } catch (error) {
      toast.error("Error loading data");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const filteredMenus = menus.filter(m => m.name?.toLowerCase().includes(searchTerm.toLowerCase()));

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
          <div className="flex items-center gap-2">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder={language === "es" ? "Buscar..." : "Search..."} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-64" /></div>
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
                <Card key={menu.menu_id} className="hover:shadow-lg transition-shadow">
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
      const res = await axios.get(`${API}/api/events`, { withCredentials: true });
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

      {/* Purchase List */}
      {selectedEvent && (
        <>
          {loading ? (
            <div className="flex items-center justify-center h-32"><RefreshCw className="w-6 h-6 animate-spin" /></div>
          ) : Object.keys(itemsBySupplier).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{language === "es" ? "No hay artículos para comprar" : "No items to purchase"}</p>
                <p className="text-sm mt-2">{language === "es" ? "Agrega artículos de tipo Food con recetas vinculadas" : "Add Food type items with linked recipes"}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
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
          )}

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
  
  const navItems = [
    { path: "/food-ops/inventory", label: language === "es" ? "Inventario" : "Inventory", icon: Package },
    { path: "/food-ops/recipes", label: language === "es" ? "Recetas" : "Recipes", icon: ChefHat },
    { path: "/food-ops/menus", label: language === "es" ? "Menús" : "Menus", icon: BookOpen },
    { path: "/food-ops/purchases", label: language === "es" ? "Compras" : "Purchases", icon: ShoppingCart },
    { path: "/food-ops/purchase-orders", label: language === "es" ? "Órdenes de Compra" : "Purchase Orders", icon: Truck },
    { path: "/food-ops/consolidated", label: language === "es" ? "Consolidado" : "Consolidated", icon: Layers },
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)]" data-testid="food-ops-page">
      {/* Sidebar Navigation */}
      <div className="w-64 border-r bg-muted/30 p-4 flex flex-col">
        {/* Back to Dashboard */}
        <NavLink 
          to="/dashboard" 
          className="flex items-center gap-2 mb-4 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowUpDown className="w-4 h-4 rotate-90" />
          {language === "es" ? "← Volver al Dashboard" : "← Back to Dashboard"}
        </NavLink>
        
        <div className="flex items-center gap-2 mb-6">
          <UtensilsCrossed className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-bold">Food Ops</h2>
        </div>
        <nav className="space-y-2 flex-1">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "hover:bg-muted"
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <Routes>
          <Route index element={<Navigate to="inventory" replace />} />
          <Route path="inventory" element={<InventorySection />} />
          <Route path="recipes" element={<RecipesSection />} />
          <Route path="menus" element={<PlatedMenusSection />} />
          <Route path="purchases" element={<PurchasesSection />} />
          <Route path="purchase-orders" element={<PurchaseOrdersSectionWrapper />} />
          <Route path="consolidated" element={<ConsolidatedPurchaseSectionWrapper />} />
        </Routes>
      </div>
    </div>
  );
}

// Lazy load wrappers
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
