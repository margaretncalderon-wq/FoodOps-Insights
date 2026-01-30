import { useEffect, useState } from "react";
import axios from "axios";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { toast } from "sonner";
import { Building2, Palette, Globe, DollarSign, FileText, Loader2, Check, Plus, Trash2, Tag, ListChecks, Percent, Package } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const CURRENCIES = ["USD", "EUR", "MXN", "COP", "ARS", "CLP", "PEN"];

export default function SettingsPage() {
  const { t, language, changeLanguage } = useLanguage();
  const [company, setCompany] = useState(null);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [picklist, setPicklist] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(null);
  
  // Dialogs
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [picklistDialogOpen, setPicklistDialogOpen] = useState(false);
  const [taxDialogOpen, setTaxDialogOpen] = useState(false);
  
  // Form states
  const [formData, setFormData] = useState({
    name: "",
    logo_url: "",
    primary_color: "#3A4D3F",
    secondary_color: "#E5DCC5",
    default_language: "en",
    currency: "USD",
  });
  
  const [newCategory, setNewCategory] = useState({ name: "", name_es: "", color: "#6B7280", icon: "package", sort_order: 0 });
  const [newPicklist, setNewPicklist] = useState({ name: "", description: "", category_id: "", default_price: 0, recipe_id: "", unit: "unit" });
  const [newTax, setNewTax] = useState({ name: "", rate: 0, is_default: false });

  useEffect(() => {
    Promise.all([
      fetchCompany(),
      fetchDocumentTypes(),
      fetchCategories(),
      fetchPicklist(),
      fetchTaxes(),
      fetchRecipes(),
    ]).finally(() => setLoading(false));
  }, []);

  const fetchCompany = async () => {
    try {
      const response = await axios.get(`${API}/settings/company`, { withCredentials: true });
      setCompany(response.data);
      setFormData({
        name: response.data.name,
        logo_url: response.data.logo_url || "",
        primary_color: response.data.primary_color,
        secondary_color: response.data.secondary_color,
        default_language: response.data.default_language,
        currency: response.data.currency,
      });
    } catch (error) {
      console.error("Failed to fetch company:", error);
    }
  };

  const fetchDocumentTypes = async () => {
    try {
      const response = await axios.get(`${API}/settings/document-types`, { withCredentials: true });
      setDocumentTypes(response.data);
    } catch (error) {
      console.error("Failed to fetch document types:", error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API}/settings/categories`, { withCredentials: true });
      setCategories(response.data);
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  };

  const fetchPicklist = async () => {
    try {
      const response = await axios.get(`${API}/settings/picklist`, { withCredentials: true });
      setPicklist(response.data);
    } catch (error) {
      console.error("Failed to fetch picklist:", error);
    }
  };

  const fetchTaxes = async () => {
    try {
      const response = await axios.get(`${API}/settings/taxes`, { withCredentials: true });
      setTaxes(response.data);
    } catch (error) {
      console.error("Failed to fetch taxes:", error);
    }
  };

  const fetchRecipes = async () => {
    try {
      const response = await axios.get(`${API}/recipes`, { withCredentials: true });
      setRecipes(response.data);
    } catch (error) {
      console.error("Failed to fetch recipes:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put(`${API}/settings/company`, formData, { withCredentials: true });
      toast.success(language === "es" ? "Configuración guardada" : "Settings saved");
      fetchCompany();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTemplateSettingChange = async (docType, setting, value) => {
    const typeIndex = documentTypes.findIndex(dt => dt.type === docType);
    if (typeIndex === -1) return;

    const updatedTypes = [...documentTypes];
    if (!updatedTypes[typeIndex].custom_settings) {
      updatedTypes[typeIndex].custom_settings = {};
    }
    updatedTypes[typeIndex].custom_settings[setting] = value;
    setDocumentTypes(updatedTypes);

    setSavingTemplate(docType);
    try {
      const existingTemplate = updatedTypes[typeIndex].template_id;
      const settings = updatedTypes[typeIndex].custom_settings;

      if (existingTemplate) {
        await axios.put(`${API}/settings/templates/${existingTemplate}`, { name: docType, settings }, { withCredentials: true });
      } else {
        const response = await axios.post(`${API}/settings/templates`, { name: docType, type: docType, settings }, { withCredentials: true });
        updatedTypes[typeIndex].template_id = response.data.template_id;
        setDocumentTypes(updatedTypes);
      }
      toast.success(language === "es" ? "Plantilla actualizada" : "Template updated");
    } catch (error) {
      toast.error("Failed to save template settings");
      fetchDocumentTypes();
    } finally {
      setSavingTemplate(null);
    }
  };

  // Category handlers
  const handleAddCategory = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/settings/categories`, newCategory, { withCredentials: true });
      toast.success(language === "es" ? "Categoría creada" : "Category created");
      fetchCategories();
      setCategoryDialogOpen(false);
      setNewCategory({ name: "", name_es: "", color: "#6B7280", icon: "package", sort_order: 0 });
    } catch (error) {
      toast.error("Failed to create category");
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    try {
      await axios.delete(`${API}/settings/categories/${categoryId}`, { withCredentials: true });
      toast.success(language === "es" ? "Categoría eliminada" : "Category deleted");
      fetchCategories();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete category");
    }
  };

  // Picklist handlers
  const handleAddPicklist = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/settings/picklist`, newPicklist, { withCredentials: true });
      toast.success(language === "es" ? "Ítem creado" : "Item created");
      fetchPicklist();
      setPicklistDialogOpen(false);
      setNewPicklist({ name: "", description: "", category_id: "", default_price: 0, recipe_id: "", unit: "unit" });
    } catch (error) {
      toast.error("Failed to create item");
    }
  };

  const handleDeletePicklist = async (itemId) => {
    try {
      await axios.delete(`${API}/settings/picklist/${itemId}`, { withCredentials: true });
      toast.success(language === "es" ? "Ítem eliminado" : "Item deleted");
      fetchPicklist();
    } catch (error) {
      toast.error("Failed to delete item");
    }
  };

  // Tax handlers
  const handleAddTax = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/settings/taxes`, newTax, { withCredentials: true });
      toast.success(language === "es" ? "Impuesto creado" : "Tax created");
      fetchTaxes();
      setTaxDialogOpen(false);
      setNewTax({ name: "", rate: 0, is_default: false });
    } catch (error) {
      toast.error("Failed to create tax");
    }
  };

  const handleDeleteTax = async (taxId) => {
    try {
      await axios.delete(`${API}/settings/taxes/${taxId}`, { withCredentials: true });
      toast.success(language === "es" ? "Impuesto eliminado" : "Tax deleted");
      fetchTaxes();
    } catch (error) {
      toast.error("Failed to delete tax");
    }
  };

  const getDocTypeLabel = (dt) => {
    const labels = {
      contract: { en: "Contract", es: "Contrato" },
      quote: { en: "Proposal", es: "Propuesta" },
      invoice: { en: "Invoice", es: "Factura" },
      beo: { en: "Banquet Event Order", es: "Orden de Evento" },
      kitchen_sheet: { en: "Kitchen Sheet", es: "Hoja de Cocina" },
      packing_list: { en: "Packing/Setup List", es: "Lista de Montaje" },
      mise_en_place: { en: "Mise en Place", es: "Mise en Place" },
      menu: { en: "Menu", es: "Menú" },
    };
    return labels[dt.type]?.[language] || dt.name;
  };

  const getCategoryName = (catId) => {
    const cat = categories.find(c => c.category_id === catId);
    return cat ? (language === "es" ? cat.name_es || cat.name : cat.name) : catId;
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">{t("loading")}</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6" data-testid="settings-page">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">{t("settings")}</h1>
          <p className="text-muted-foreground mt-1">{t("companySettings")}</p>
        </div>

        <Tabs defaultValue="branding" className="space-y-6">
          <TabsList className="flex-wrap">
            <TabsTrigger value="branding">{t("branding")}</TabsTrigger>
            <TabsTrigger value="categories" className="gap-2">
              <Tag className="w-4 h-4" />
              {language === "es" ? "Categorías" : "Categories"}
            </TabsTrigger>
            <TabsTrigger value="picklist" className="gap-2">
              <ListChecks className="w-4 h-4" />
              {language === "es" ? "Lista de Ítems" : "Item Picklist"}
            </TabsTrigger>
            <TabsTrigger value="taxes" className="gap-2">
              <Percent className="w-4 h-4" />
              {language === "es" ? "Impuestos" : "Taxes"}
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="w-4 h-4" />
              {t("documentTemplates")}
            </TabsTrigger>
            <TabsTrigger value="preferences">
              {language === "es" ? "Preferencias" : "Preferences"}
            </TabsTrigger>
          </TabsList>

          {/* Branding Tab */}
          <TabsContent value="branding">
            <form onSubmit={handleSubmit}>
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-lg flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    {language === "es" ? "Información de la Empresa" : "Company Information"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>{t("companyName")}</Label>
                      <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} data-testid="company-name-input" />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("logoUrl")}</Label>
                      <Input value={formData.logo_url} onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })} placeholder="https://..." />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <Palette className="w-4 h-4" />
                      {language === "es" ? "Colores de Marca" : "Brand Colors"}
                    </h3>
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label>{t("primaryColor")}</Label>
                        <div className="flex gap-3">
                          <Input type="color" value={formData.primary_color} onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })} className="w-16 h-10 p-1 cursor-pointer" />
                          <Input value={formData.primary_color} onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })} className="flex-1" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>{t("secondaryColor")}</Label>
                        <div className="flex gap-3">
                          <Input type="color" value={formData.secondary_color} onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })} className="w-16 h-10 p-1 cursor-pointer" />
                          <Input value={formData.secondary_color} onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })} className="flex-1" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={saving} data-testid="save-settings-btn">
                      {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      {t("save")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </form>
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <Tag className="w-5 h-5" />
                  {language === "es" ? "Categorías de Ítems" : "Item Categories"}
                </CardTitle>
                <Button onClick={() => setCategoryDialogOpen(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  {language === "es" ? "Agregar" : "Add"}
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {language === "es" ? "Categorías para agrupar ítems en las órdenes de evento (Comida, Bebidas, Alquiler, etc.)" : "Categories to group items in event orders (Food, Drinks, Rentals, etc.)"}
                </p>
                <div className="space-y-2">
                  {categories.map(cat => (
                    <div key={cat.category_id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`category-row-${cat.category_id}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${cat.color}20` }}>
                          <Package className="w-4 h-4" style={{ color: cat.color }} />
                        </div>
                        <div>
                          <p className="font-medium">{language === "es" ? cat.name_es || cat.name : cat.name}</p>
                          {cat.is_default && <span className="text-xs text-muted-foreground">{language === "es" ? "Por defecto" : "Default"}</span>}
                        </div>
                      </div>
                      {!cat.is_default && (
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteCategory(cat.category_id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{language === "es" ? "Nueva Categoría" : "New Category"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddCategory} className="space-y-4">
                  <div>
                    <Label>{language === "es" ? "Nombre (EN)" : "Name (EN)"}</Label>
                    <Input value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} required />
                  </div>
                  <div>
                    <Label>{language === "es" ? "Nombre (ES)" : "Name (ES)"}</Label>
                    <Input value={newCategory.name_es} onChange={(e) => setNewCategory({ ...newCategory, name_es: e.target.value })} />
                  </div>
                  <div>
                    <Label>{language === "es" ? "Color" : "Color"}</Label>
                    <Input type="color" value={newCategory.color} onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })} className="w-full h-10" />
                  </div>
                  <Button type="submit" className="w-full">{t("save")}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Picklist Tab */}
          <TabsContent value="picklist">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <ListChecks className="w-5 h-5" />
                  {language === "es" ? "Lista de Ítems Predefinidos" : "Predefined Item Picklist"}
                </CardTitle>
                <Button onClick={() => setPicklistDialogOpen(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  {language === "es" ? "Agregar" : "Add"}
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {language === "es" ? "Ítems predefinidos para selección rápida al crear órdenes de evento" : "Predefined items for quick selection when creating event orders"}
                </p>
                {picklist.length > 0 ? (
                  <div className="space-y-2">
                    {picklist.map(item => (
                      <div key={item.item_id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`picklist-row-${item.item_id}`}>
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {getCategoryName(item.category_id)} · ${item.default_price.toFixed(2)}
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeletePicklist(item.item_id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">{t("noResults")}</p>
                )}
              </CardContent>
            </Card>

            <Dialog open={picklistDialogOpen} onOpenChange={setPicklistDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{language === "es" ? "Nuevo Ítem" : "New Item"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddPicklist} className="space-y-4">
                  <div>
                    <Label>{language === "es" ? "Nombre" : "Name"}</Label>
                    <Input value={newPicklist.name} onChange={(e) => setNewPicklist({ ...newPicklist, name: e.target.value })} required />
                  </div>
                  <div>
                    <Label>{language === "es" ? "Categoría" : "Category"}</Label>
                    <Select value={newPicklist.category_id} onValueChange={(v) => setNewPicklist({ ...newPicklist, category_id: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {categories.map(cat => (
                          <SelectItem key={cat.category_id} value={cat.category_id}>
                            {language === "es" ? cat.name_es || cat.name : cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{language === "es" ? "Precio por Defecto" : "Default Price"}</Label>
                    <Input type="number" step="0.01" value={newPicklist.default_price} onChange={(e) => setNewPicklist({ ...newPicklist, default_price: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label>{language === "es" ? "Receta (opcional)" : "Recipe (optional)"}</Label>
                    <Select value={newPicklist.recipe_id || "none"} onValueChange={(v) => setNewPicklist({ ...newPicklist, recipe_id: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder={language === "es" ? "Sin receta" : "No recipe"} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{language === "es" ? "Sin receta" : "No recipe"}</SelectItem>
                        {recipes.map(r => (
                          <SelectItem key={r.recipe_id} value={r.recipe_id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full">{t("save")}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Taxes Tab */}
          <TabsContent value="taxes">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <Percent className="w-5 h-5" />
                  {language === "es" ? "Tasas de Impuestos" : "Tax Rates"}
                </CardTitle>
                <Button onClick={() => setTaxDialogOpen(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  {language === "es" ? "Agregar" : "Add"}
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {language === "es" ? "Impuestos aplicables a las órdenes de evento" : "Taxes applicable to event orders"}
                </p>
                {taxes.length > 0 ? (
                  <div className="space-y-2">
                    {taxes.map(tax => (
                      <div key={tax.tax_id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`tax-row-${tax.tax_id}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Percent className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{tax.name}</p>
                            <p className="text-sm text-muted-foreground">{tax.rate}%</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {tax.is_default && <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">{language === "es" ? "Por defecto" : "Default"}</span>}
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteTax(tax.tax_id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">{t("noResults")}</p>
                )}
              </CardContent>
            </Card>

            <Dialog open={taxDialogOpen} onOpenChange={setTaxDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{language === "es" ? "Nuevo Impuesto" : "New Tax"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddTax} className="space-y-4">
                  <div>
                    <Label>{language === "es" ? "Nombre" : "Name"}</Label>
                    <Input value={newTax.name} onChange={(e) => setNewTax({ ...newTax, name: e.target.value })} placeholder="IVA, VAT, Sales Tax..." required />
                  </div>
                  <div>
                    <Label>{language === "es" ? "Tasa (%)" : "Rate (%)"}</Label>
                    <Input type="number" step="0.01" value={newTax.rate} onChange={(e) => setNewTax({ ...newTax, rate: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={newTax.is_default} onCheckedChange={(c) => setNewTax({ ...newTax, is_default: c })} />
                    <Label>{language === "es" ? "Por defecto" : "Default"}</Label>
                  </div>
                  <Button type="submit" className="w-full">{t("save")}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Document Templates Tab */}
          <TabsContent value="templates">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  {t("documentTemplates")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-6">
                  {language === "es" ? "Configura las opciones de cada tipo de documento." : "Configure options for each document type."}
                </p>
                <div className="space-y-4">
                  {documentTypes.map((dt) => {
                    const showPrices = dt.custom_settings?.show_prices ?? dt.show_prices;
                    const requiresSignature = dt.custom_settings?.requires_signature ?? dt.requires_signature;
                    const isSaving = savingTemplate === dt.type;

                    return (
                      <div key={dt.type} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`template-${dt.type}`}>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                            <FileText className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div>
                            <h4 className="font-medium">{getDocTypeLabel(dt)}</h4>
                            <p className="text-xs text-muted-foreground">{dt.type}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`${dt.type}-prices`} className="text-sm">{t("showPrices")}</Label>
                            <Switch id={`${dt.type}-prices`} checked={showPrices} onCheckedChange={(c) => handleTemplateSettingChange(dt.type, "show_prices", c)} disabled={isSaving} />
                          </div>
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`${dt.type}-signature`} className="text-sm">{t("requiresSignature")}</Label>
                            <Switch id={`${dt.type}-signature`} checked={requiresSignature} onCheckedChange={(c) => handleTemplateSettingChange(dt.type, "requires_signature", c)} disabled={isSaving} />
                          </div>
                          {isSaving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                          {!isSaving && dt.template_id && <Check className="w-4 h-4 text-success" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  {language === "es" ? "Preferencias Regionales" : "Regional Preferences"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>{t("language")}</Label>
                    <Select value={language} onValueChange={changeLanguage}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      {t("currency")}
                    </Label>
                    <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSubmit} disabled={saving}>
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {t("save")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
