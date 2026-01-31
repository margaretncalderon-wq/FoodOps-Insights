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
import { Building2, Palette, Globe, DollarSign, FileText, Loader2, Check, Plus, Trash2, Tag, ListChecks, Percent, Package, FormInput, Copy, ExternalLink, Edit } from "lucide-react";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const CURRENCIES = ["USD", "EUR", "MXN", "COP", "ARS", "CLP", "PEN", "DOP"];
const EVENT_TYPES = ["wedding", "corporate", "birthday", "social", "other"];
const LEAD_SOURCES = ["Website", "Instagram", "QR", "Referral", "Other"];

// Default form fields configuration
const DEFAULT_FORM_FIELDS = [
  { field_name: "lead_name", label: "Full Name", label_es: "Nombre completo", enabled: true, required: true },
  { field_name: "email", label: "Email", label_es: "Email", enabled: true, required: true },
  { field_name: "phone", label: "Phone", label_es: "Teléfono", enabled: true, required: false },
  { field_name: "company_name", label: "Company", label_es: "Empresa", enabled: true, required: false },
  { field_name: "event_type", label: "Event Type", label_es: "Tipo de Evento", enabled: true, required: true },
  { field_name: "event_date", label: "Event Date", label_es: "Fecha del Evento", enabled: true, required: false },
  { field_name: "estimated_guest_count", label: "Guest Count", label_es: "Cantidad de Invitados", enabled: true, required: false },
  { field_name: "budget_range", label: "Budget Range", label_es: "Rango de Presupuesto", enabled: true, required: false },
  { field_name: "message", label: "Message", label_es: "Mensaje", enabled: true, required: false },
];

export default function SettingsPage() {
  const { t, language, changeLanguage } = useLanguage();
  const [company, setCompany] = useState(null);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [picklist, setPicklist] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [leadForms, setLeadForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(null);
  
  // Dialogs
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [picklistDialogOpen, setPicklistDialogOpen] = useState(false);
  const [taxDialogOpen, setTaxDialogOpen] = useState(false);
  const [leadFormDialogOpen, setLeadFormDialogOpen] = useState(false);
  const [editingLeadForm, setEditingLeadForm] = useState(null);
  
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
  const [newLeadForm, setNewLeadForm] = useState({
    form_name: "",
    description: "",
    fields: [...DEFAULT_FORM_FIELDS],
    default_source: "Website",
    default_event_type: "",
    is_active: true,
    thank_you_message: "Thank you for your inquiry! We will contact you soon."
  });

  useEffect(() => {
    Promise.all([
      fetchCompany(),
      fetchDocumentTypes(),
      fetchCategories(),
      fetchPicklist(),
      fetchTaxes(),
      fetchRecipes(),
      fetchLeadForms(),
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

  const fetchLeadForms = async () => {
    try {
      const response = await axios.get(`${API}/lead-forms`, { withCredentials: true });
      setLeadForms(response.data);
    } catch (error) {
      console.error("Failed to fetch lead forms:", error);
    }
  };

  const handleSaveLeadForm = async () => {
    try {
      if (editingLeadForm) {
        await axios.put(`${API}/lead-forms/${editingLeadForm.form_id}`, newLeadForm, { withCredentials: true });
        toast.success(language === "es" ? "Formulario actualizado" : "Form updated");
      } else {
        await axios.post(`${API}/lead-forms`, newLeadForm, { withCredentials: true });
        toast.success(language === "es" ? "Formulario creado" : "Form created");
      }
      fetchLeadForms();
      setLeadFormDialogOpen(false);
      resetLeadFormForm();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save form");
    }
  };

  const handleDeleteLeadForm = async (formId) => {
    if (!confirm(language === "es" ? "¿Eliminar este formulario?" : "Delete this form?")) return;
    try {
      await axios.delete(`${API}/lead-forms/${formId}`, { withCredentials: true });
      toast.success(language === "es" ? "Formulario eliminado" : "Form deleted");
      fetchLeadForms();
    } catch (error) {
      toast.error("Failed to delete form");
    }
  };

  const handleEditLeadForm = (form) => {
    setEditingLeadForm(form);
    setNewLeadForm({
      form_name: form.form_name,
      description: form.description || "",
      fields: form.fields?.length > 0 ? form.fields : [...DEFAULT_FORM_FIELDS],
      default_source: form.default_source || "Website",
      default_event_type: form.default_event_type || "",
      is_active: form.is_active !== false,
      thank_you_message: form.thank_you_message || "Thank you for your inquiry!"
    });
    setLeadFormDialogOpen(true);
  };

  const resetLeadFormForm = () => {
    setEditingLeadForm(null);
    setNewLeadForm({
      form_name: "",
      description: "",
      fields: [...DEFAULT_FORM_FIELDS],
      default_source: "Website",
      default_event_type: "",
      is_active: true,
      thank_you_message: "Thank you for your inquiry! We will contact you soon."
    });
  };

  const toggleFieldEnabled = (fieldName) => {
    setNewLeadForm(prev => ({
      ...prev,
      fields: prev.fields.map(f => 
        f.field_name === fieldName ? { ...f, enabled: !f.enabled } : f
      )
    }));
  };

  const toggleFieldRequired = (fieldName) => {
    setNewLeadForm(prev => ({
      ...prev,
      fields: prev.fields.map(f => 
        f.field_name === fieldName ? { ...f, required: !f.required } : f
      )
    }));
  };

  const copyFormLink = (formId) => {
    const link = `${window.location.origin}/forms/${formId}`;
    navigator.clipboard.writeText(link);
    toast.success(language === "es" ? "Enlace copiado" : "Link copied");
  };

  const copyEmbedCode = (formId) => {
    const link = `${window.location.origin}/forms/${formId}`;
    const code = `<iframe src="${link}" width="100%" height="700" frameborder="0"></iframe>`;
    navigator.clipboard.writeText(code);
    toast.success(language === "es" ? "Código embed copiado" : "Embed code copied");
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
            <TabsTrigger value="leadforms" className="gap-2">
              <FormInput className="w-4 h-4" />
              {language === "es" ? "Formularios de Leads" : "Lead Forms"}
            </TabsTrigger>
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

          {/* Lead Forms Tab */}
          <TabsContent value="leadforms">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <FormInput className="w-5 h-5" />
                  {language === "es" ? "Formularios de Leads" : "Lead Forms"}
                </CardTitle>
                <Button onClick={() => { resetLeadFormForm(); setLeadFormDialogOpen(true); }} className="gap-2">
                  <Plus className="w-4 h-4" />
                  {language === "es" ? "Nuevo Formulario" : "New Form"}
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {language === "es" 
                    ? "Crea formularios personalizados para capturar leads desde tu sitio web o redes sociales."
                    : "Create custom forms to capture leads from your website or social media."}
                </p>
                
                {leadForms.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {language === "es" ? "No hay formularios creados" : "No forms created yet"}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {leadForms.map((form) => (
                      <Card key={form.form_id} className="border">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold">{form.form_name}</h4>
                                <Badge variant={form.is_active ? "default" : "secondary"}>
                                  {form.is_active ? (language === "es" ? "Activo" : "Active") : (language === "es" ? "Inactivo" : "Inactive")}
                                </Badge>
                              </div>
                              {form.description && (
                                <p className="text-sm text-muted-foreground mb-2">{form.description}</p>
                              )}
                              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                <span>{language === "es" ? "Fuente" : "Source"}: {form.default_source}</span>
                                {form.default_event_type && (
                                  <span>• {language === "es" ? "Tipo" : "Type"}: {form.default_event_type}</span>
                                )}
                                <span>• {form.submissions_count || 0} {language === "es" ? "envíos" : "submissions"}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => copyFormLink(form.form_id)} title={language === "es" ? "Copiar enlace" : "Copy link"}>
                                <Copy className="w-4 h-4" />
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => copyEmbedCode(form.form_id)} title={language === "es" ? "Código embed" : "Embed code"}>
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleEditLeadForm(form)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteLeadForm(form.form_id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Lead Form Dialog */}
            <Dialog open={leadFormDialogOpen} onOpenChange={(open) => { setLeadFormDialogOpen(open); if (!open) resetLeadFormForm(); }}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingLeadForm 
                      ? (language === "es" ? "Editar Formulario" : "Edit Form")
                      : (language === "es" ? "Nuevo Formulario de Leads" : "New Lead Form")}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="grid gap-4">
                    <div>
                      <Label>{language === "es" ? "Nombre del Formulario" : "Form Name"} *</Label>
                      <Input 
                        value={newLeadForm.form_name} 
                        onChange={(e) => setNewLeadForm({ ...newLeadForm, form_name: e.target.value })}
                        placeholder={language === "es" ? "Ej: Formulario de Bodas" : "E.g., Wedding Inquiry Form"}
                      />
                    </div>
                    <div>
                      <Label>{language === "es" ? "Descripción" : "Description"}</Label>
                      <Textarea 
                        value={newLeadForm.description} 
                        onChange={(e) => setNewLeadForm({ ...newLeadForm, description: e.target.value })}
                        rows={2}
                      />
                    </div>
                  </div>

                  {/* Default Settings */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label>{language === "es" ? "Fuente por Defecto" : "Default Source"}</Label>
                      <Select value={newLeadForm.default_source} onValueChange={(v) => setNewLeadForm({ ...newLeadForm, default_source: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {LEAD_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{language === "es" ? "Tipo de Evento por Defecto" : "Default Event Type"}</Label>
                      <Select value={newLeadForm.default_event_type || ""} onValueChange={(v) => setNewLeadForm({ ...newLeadForm, default_event_type: v })}>
                        <SelectTrigger><SelectValue placeholder={language === "es" ? "Ninguno" : "None"} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">{language === "es" ? "Ninguno" : "None"}</SelectItem>
                          {EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Field Configuration */}
                  <div>
                    <Label className="text-base font-semibold mb-3 block">
                      {language === "es" ? "Configuración de Campos" : "Field Configuration"}
                    </Label>
                    <div className="border rounded-lg divide-y">
                      {newLeadForm.fields.map((field) => (
                        <div key={field.field_name} className="p-3 flex items-center justify-between">
                          <div>
                            <span className="font-medium">{language === "es" ? field.label_es : field.label}</span>
                            <span className="text-xs text-muted-foreground ml-2">({field.field_name})</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Switch 
                                checked={field.enabled} 
                                onCheckedChange={() => toggleFieldEnabled(field.field_name)}
                              />
                              <span className="text-sm text-muted-foreground">
                                {language === "es" ? "Habilitado" : "Enabled"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch 
                                checked={field.required}
                                onCheckedChange={() => toggleFieldRequired(field.field_name)}
                                disabled={!field.enabled}
                              />
                              <span className="text-sm text-muted-foreground">
                                {language === "es" ? "Requerido" : "Required"}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Thank You Message */}
                  <div>
                    <Label>{language === "es" ? "Mensaje de Agradecimiento" : "Thank You Message"}</Label>
                    <Textarea 
                      value={newLeadForm.thank_you_message} 
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, thank_you_message: e.target.value })}
                      rows={2}
                    />
                  </div>

                  {/* Active Toggle */}
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <Label className="font-medium">{language === "es" ? "Formulario Activo" : "Form Active"}</Label>
                      <p className="text-xs text-muted-foreground">
                        {language === "es" ? "Solo los formularios activos pueden recibir envíos" : "Only active forms can receive submissions"}
                      </p>
                    </div>
                    <Switch 
                      checked={newLeadForm.is_active} 
                      onCheckedChange={(v) => setNewLeadForm({ ...newLeadForm, is_active: v })}
                    />
                  </div>

                  <Button onClick={handleSaveLeadForm} className="w-full" disabled={!newLeadForm.form_name}>
                    {editingLeadForm ? t("save") : (language === "es" ? "Crear Formulario" : "Create Form")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

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
                          {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                          <p className="text-sm text-muted-foreground">
                            {getCategoryName(item.category_id)} · ${item.default_price.toFixed(2)}
                            {item.recipe_id && <span className="ml-2 text-primary">• {language === "es" ? "Con receta" : "Has recipe"}</span>}
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
                    <Label>{language === "es" ? "Nombre" : "Name"} *</Label>
                    <Input value={newPicklist.name} onChange={(e) => setNewPicklist({ ...newPicklist, name: e.target.value })} required />
                  </div>
                  <div>
                    <Label>{language === "es" ? "Descripción" : "Description"}</Label>
                    <Input 
                      value={newPicklist.description} 
                      onChange={(e) => setNewPicklist({ ...newPicklist, description: e.target.value })} 
                      placeholder={language === "es" ? "Descripción opcional del ítem" : "Optional item description"}
                    />
                  </div>
                  <div>
                    <Label>{language === "es" ? "Categoría" : "Category"} *</Label>
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
                    <Label>{language === "es" ? "Receta (opcional, para comida)" : "Recipe (optional, for food)"}</Label>
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
