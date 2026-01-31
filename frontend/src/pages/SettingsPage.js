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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { toast } from "sonner";
import { Building2, Palette, Globe, DollarSign, FileText, Loader2, Check, Plus, Trash2, Tag, ListChecks, Percent, Package, FormInput, Copy, ExternalLink, Edit, ToggleLeft, Utensils, Calculator, FileStack, ChefHat } from "lucide-react";
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
  const [inventoryItems, setInventoryItems] = useState([]);
  const [menus, setMenus] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [leadForms, setLeadForms] = useState([]);
  const [featureFlags, setFeatureFlags] = useState(null);
  const [documentTemplates, setDocumentTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(null);
  const [savingFlags, setSavingFlags] = useState(false);
  
  // Dialogs
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [picklistDialogOpen, setPicklistDialogOpen] = useState(false);
  const [menuDialogOpen, setMenuDialogOpen] = useState(false);
  const [taxDialogOpen, setTaxDialogOpen] = useState(false);
  const [leadFormDialogOpen, setLeadFormDialogOpen] = useState(false);
  const [editingLeadForm, setEditingLeadForm] = useState(null);
  const [editingMenu, setEditingMenu] = useState(null);
  
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
  const [newPicklist, setNewPicklist] = useState({ 
    name: "", 
    description: "", 
    category_id: "", 
    item_type: "Service",
    default_price: 0, 
    internal_cost: null,
    recipe_id: "", 
    inventory_item_id: "",
    unit: "unit",
    is_active: true
  });
  const [editingPicklist, setEditingPicklist] = useState(null);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkItems, setBulkItems] = useState("");
  const [newTax, setNewTax] = useState({ name: "", rate: 0, is_default: false });
  const [newMenu, setNewMenu] = useState({
    name: "",
    name_es: "",
    description: "",
    description_es: "",
    menu_type: "Menu",
    items: [],
    default_price: null,
    is_fixed_price: false,
    is_active: true,
    variants: []
  });
  const [newVariant, setNewVariant] = useState({
    name: "",
    name_es: "",
    discount_type: "percentage",
    discount_value: 0,
    is_default: false
  });
  const [newLeadForm, setNewLeadForm] = useState({
    form_name: "",
    description: "",
    description_es: "",
    fields: [...DEFAULT_FORM_FIELDS],
    custom_fields: [],
    default_source: "Website",
    default_event_type: "",
    is_active: true,
    thank_you_message_en: "Thank you for your inquiry! We will contact you soon.",
    thank_you_message_es: "¡Gracias por tu consulta! Te contactaremos pronto.",
    banner_url: "",
    show_logo: true
  });
  const [newCustomField, setNewCustomField] = useState({
    field_type: "text",
    label_en: "",
    label_es: "",
    placeholder_en: "",
    placeholder_es: "",
    required: false,
    options: []
  });

  useEffect(() => {
    Promise.all([
      fetchCompany(),
      fetchDocumentTypes(),
      fetchCategories(),
      fetchPicklist(),
      fetchInventory(),
      fetchMenus(),
      fetchTaxes(),
      fetchRecipes(),
      fetchLeadForms(),
      fetchFeatureFlags(),
      fetchDocumentTemplates(),
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
      const response = await axios.get(`${API}/settings/picklist?active_only=false`, { withCredentials: true });
      setPicklist(response.data);
    } catch (error) {
      console.error("Failed to fetch picklist:", error);
    }
  };

  const fetchInventory = async () => {
    try {
      const response = await axios.get(`${API}/inventory`, { withCredentials: true });
      setInventoryItems(response.data);
    } catch (error) {
      console.error("Failed to fetch inventory:", error);
    }
  };

  const fetchMenus = async () => {
    try {
      const response = await axios.get(`${API}/settings/menus?active_only=false`, { withCredentials: true });
      setMenus(response.data);
    } catch (error) {
      console.error("Failed to fetch menus:", error);
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

  const fetchFeatureFlags = async () => {
    try {
      const response = await axios.get(`${API}/settings/feature-flags`, { withCredentials: true });
      setFeatureFlags(response.data);
    } catch (error) {
      console.error("Failed to fetch feature flags:", error);
    }
  };

  const fetchDocumentTemplates = async () => {
    try {
      const response = await axios.get(`${API}/settings/document-templates`, { withCredentials: true });
      setDocumentTemplates(response.data);
    } catch (error) {
      console.error("Failed to fetch document templates:", error);
    }
  };

  const handleUpdateFeatureFlag = async (flagName, value) => {
    setSavingFlags(true);
    try {
      await axios.put(`${API}/settings/feature-flags`, { [flagName]: value }, { withCredentials: true });
      setFeatureFlags(prev => ({ ...prev, [flagName]: value }));
      toast.success(language === "es" ? "Configuración actualizada" : "Setting updated");
    } catch (error) {
      toast.error("Failed to update feature flag");
    } finally {
      setSavingFlags(false);
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
      description_es: form.description_es || "",
      fields: form.fields?.length > 0 ? form.fields : [...DEFAULT_FORM_FIELDS],
      custom_fields: form.custom_fields || [],
      default_source: form.default_source || "Website",
      default_event_type: form.default_event_type || "",
      is_active: form.is_active !== false,
      thank_you_message_en: form.thank_you_message_en || form.thank_you_message || "Thank you for your inquiry!",
      thank_you_message_es: form.thank_you_message_es || "¡Gracias por tu consulta! Te contactaremos pronto.",
      banner_url: form.banner_url || "",
      show_logo: form.show_logo !== false
    });
    setLeadFormDialogOpen(true);
  };

  const resetLeadFormForm = () => {
    setEditingLeadForm(null);
    setNewLeadForm({
      form_name: "",
      description: "",
      description_es: "",
      fields: [...DEFAULT_FORM_FIELDS],
      custom_fields: [],
      default_source: "Website",
      default_event_type: "",
      is_active: true,
      thank_you_message_en: "Thank you for your inquiry! We will contact you soon.",
      thank_you_message_es: "¡Gracias por tu consulta! Te contactaremos pronto.",
      banner_url: "",
      show_logo: true
    });
    setNewCustomField({
      field_type: "text",
      label_en: "",
      label_es: "",
      placeholder_en: "",
      placeholder_es: "",
      required: false,
      options: []
    });
  };

  const addCustomField = () => {
    if (!newCustomField.label_en || !newCustomField.label_es) {
      toast.error(language === "es" ? "Ingresa las etiquetas en ambos idiomas" : "Enter labels in both languages");
      return;
    }
    const fieldId = `custom_${Date.now()}`;
    setNewLeadForm(prev => ({
      ...prev,
      custom_fields: [...prev.custom_fields, { ...newCustomField, field_id: fieldId }]
    }));
    setNewCustomField({
      field_type: "text",
      label_en: "",
      label_es: "",
      placeholder_en: "",
      placeholder_es: "",
      required: false,
      options: []
    });
  };

  const removeCustomField = (fieldId) => {
    setNewLeadForm(prev => ({
      ...prev,
      custom_fields: prev.custom_fields.filter(f => f.field_id !== fieldId)
    }));
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

  const copyFormLink = (formId, lang = null) => {
    let link = `${window.location.origin}/forms/${formId}`;
    if (lang) link += `?lang=${lang}`;
    navigator.clipboard.writeText(link);
    toast.success(language === "es" ? "Enlace copiado" : "Link copied");
  };

  const copyEmbedCode = (formId, lang = null) => {
    let link = `${window.location.origin}/forms/${formId}`;
    if (lang) link += `?lang=${lang}`;
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
      if (editingPicklist) {
        await axios.put(`${API}/settings/picklist/${editingPicklist.item_id}`, newPicklist, { withCredentials: true });
        toast.success(language === "es" ? "Ítem actualizado" : "Item updated");
      } else {
        await axios.post(`${API}/settings/picklist`, newPicklist, { withCredentials: true });
        toast.success(language === "es" ? "Ítem creado" : "Item created");
      }
      fetchPicklist();
      setPicklistDialogOpen(false);
      resetPicklistForm();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save item");
    }
  };

  const handleEditPicklist = (item) => {
    setEditingPicklist(item);
    setNewPicklist({
      name: item.name || "",
      description: item.description || "",
      category_id: item.category_id || "",
      item_type: item.item_type || "Service",
      default_price: item.default_price || 0,
      internal_cost: item.internal_cost || null,
      recipe_id: item.recipe_id || "",
      inventory_item_id: item.inventory_item_id || "",
      unit: item.unit || "unit",
      is_active: item.is_active !== false
    });
    setPicklistDialogOpen(true);
  };

  const resetPicklistForm = () => {
    setEditingPicklist(null);
    setNewPicklist({ 
      name: "", 
      description: "", 
      category_id: "", 
      item_type: "Service",
      default_price: 0, 
      internal_cost: null,
      recipe_id: "", 
      inventory_item_id: "",
      unit: "unit",
      is_active: true
    });
  };

  const handleDeletePicklist = async (itemId) => {
    if (!confirm(language === "es" ? "¿Eliminar este ítem?" : "Delete this item?")) return;
    try {
      await axios.delete(`${API}/settings/picklist/${itemId}`, { withCredentials: true });
      toast.success(language === "es" ? "Ítem eliminado" : "Item deleted");
      fetchPicklist();
    } catch (error) {
      toast.error("Failed to delete item");
    }
  };

  const handleBulkAddPicklist = async () => {
    try {
      // Parse bulk items (one per line: name, price)
      const lines = bulkItems.split("\n").filter(l => l.trim());
      const items = lines.map(line => {
        const parts = line.split(",").map(p => p.trim());
        return {
          name: parts[0],
          description: parts[1] || "",
          category_id: newPicklist.category_id,
          item_type: newPicklist.item_type,
          default_price: parseFloat(parts[2]) || 0,
          internal_cost: parts[3] ? parseFloat(parts[3]) : null,
          unit: "unit",
          is_active: true
        };
      });
      
      await axios.post(`${API}/settings/picklist/bulk`, { items }, { withCredentials: true });
      toast.success(language === "es" ? `${items.length} ítems creados` : `${items.length} items created`);
      fetchPicklist();
      setBulkAddOpen(false);
      setBulkItems("");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to bulk add items");
    }
  };

  // Menu handlers
  const handleSaveMenu = async (e) => {
    e.preventDefault();
    try {
      if (editingMenu) {
        await axios.put(`${API}/settings/menus/${editingMenu.menu_id}`, newMenu, { withCredentials: true });
        toast.success(language === "es" ? "Menú actualizado" : "Menu updated");
      } else {
        await axios.post(`${API}/settings/menus`, newMenu, { withCredentials: true });
        toast.success(language === "es" ? "Menú creado" : "Menu created");
      }
      fetchMenus();
      setMenuDialogOpen(false);
      resetMenuForm();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save menu");
    }
  };

  const handleEditMenu = (menu) => {
    setEditingMenu(menu);
    setNewMenu({
      name: menu.name || "",
      name_es: menu.name_es || "",
      description: menu.description || "",
      description_es: menu.description_es || "",
      menu_type: menu.menu_type || "Menu",
      items: menu.items || [],
      variants: menu.variants || [],
      default_price: menu.default_price || null,
      is_fixed_price: menu.is_fixed_price || false,
      is_active: menu.is_active !== false
    });
    setMenuDialogOpen(true);
  };

  const resetMenuForm = () => {
    setEditingMenu(null);
    setNewMenu({
      name: "",
      name_es: "",
      description: "",
      description_es: "",
      menu_type: "Menu",
      items: [],
      variants: [],
      default_price: null,
      is_fixed_price: false,
      is_active: true
    });
    setNewVariant({
      name: "",
      name_es: "",
      discount_type: "percentage",
      discount_value: 0,
      is_default: false
    });
  };

  const handleDeleteMenu = async (menuId) => {
    if (!confirm(language === "es" ? "¿Eliminar este menú?" : "Delete this menu?")) return;
    try {
      await axios.delete(`${API}/settings/menus/${menuId}`, { withCredentials: true });
      toast.success(language === "es" ? "Menú eliminado" : "Menu deleted");
      fetchMenus();
    } catch (error) {
      toast.error("Failed to delete menu");
    }
  };

  const addItemToMenu = (picklistItem) => {
    const newItem = {
      picklist_item_id: picklistItem.item_id,
      custom_name: picklistItem.name,
      quantity: 1,
      unit_price_override: null,
      internal_cost_override: null
    };
    setNewMenu(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
  };

  const removeItemFromMenu = (index) => {
    setNewMenu(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const updateMenuItemQuantity = (index, quantity) => {
    setNewMenu(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, quantity: parseFloat(quantity) || 1 } : item
      )
    }));
  };

  const addVariantToMenu = () => {
    if (!newVariant.name) return;
    setNewMenu(prev => ({
      ...prev,
      variants: [...prev.variants, { ...newVariant, variant_id: `var_${Date.now()}` }]
    }));
    setNewVariant({
      name: "",
      name_es: "",
      discount_type: "percentage",
      discount_value: 0,
      is_default: false
    });
  };

  const removeVariantFromMenu = (index) => {
    setNewMenu(prev => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index)
    }));
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
            <TabsTrigger value="features" className="gap-2">
              <ToggleLeft className="w-4 h-4" />
              {language === "es" ? "Funciones" : "Features"}
            </TabsTrigger>
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

          {/* Feature Flags Tab */}
          <TabsContent value="features">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <ToggleLeft className="w-5 h-5" />
                  {language === "es" ? "Configuración de Funciones" : "Feature Configuration"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  {language === "es" 
                    ? "Activa o desactiva las funcionalidades del sistema según tus necesidades."
                    : "Enable or disable system features based on your needs."}
                </p>
                
                <div className="space-y-4">
                  {/* Proposal Editing */}
                  <label className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <FileStack className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <span className="font-medium block">
                          {language === "es" ? "Edición de Propuestas" : "Proposal Editing"}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {language === "es" 
                            ? "Permite editar propuestas y contratos de eventos"
                            : "Enable editing of event proposals and contracts"}
                        </span>
                      </div>
                    </div>
                    <Switch 
                      checked={featureFlags?.is_proposal_editing_enabled ?? true}
                      onCheckedChange={(v) => handleUpdateFeatureFlag("is_proposal_editing_enabled", v)}
                      disabled={savingFlags}
                    />
                  </label>

                  {/* Order Items */}
                  <label className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <Package className="w-5 h-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <span className="font-medium block">
                          {language === "es" ? "Ítems de Orden" : "Order Items"}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {language === "es" 
                            ? "Sistema unificado de ítems (Comida, Servicios, Alquiler, Cargos)"
                            : "Unified item system (Food, Services, Rentals, Fees)"}
                        </span>
                      </div>
                    </div>
                    <Switch 
                      checked={featureFlags?.is_order_items_enabled ?? true}
                      onCheckedChange={(v) => handleUpdateFeatureFlag("is_order_items_enabled", v)}
                      disabled={savingFlags}
                    />
                  </label>

                  {/* Margin Tracking */}
                  <label className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <Calculator className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <span className="font-medium block">
                          {language === "es" ? "Seguimiento de Márgenes" : "Margin Tracking"}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {language === "es" 
                            ? "Costo interno y cálculo de márgenes (solo visible para admin)"
                            : "Internal cost and margin calculation (admin only)"}
                        </span>
                      </div>
                    </div>
                    <Switch 
                      checked={featureFlags?.is_margin_tracking_enabled ?? true}
                      onCheckedChange={(v) => handleUpdateFeatureFlag("is_margin_tracking_enabled", v)}
                      disabled={savingFlags}
                    />
                  </label>

                  {/* Document Autogeneration */}
                  <label className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <span className="font-medium block">
                          {language === "es" ? "Auto-generación de Documentos" : "Document Auto-generation"}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {language === "es" 
                            ? "Genera automáticamente propuestas, facturas y hojas de trabajo"
                            : "Auto-generate proposals, invoices, and worksheets"}
                        </span>
                      </div>
                    </div>
                    <Switch 
                      checked={featureFlags?.is_document_autogeneration_enabled ?? true}
                      onCheckedChange={(v) => handleUpdateFeatureFlag("is_document_autogeneration_enabled", v)}
                      disabled={savingFlags}
                    />
                  </label>

                  {/* Custom Fields */}
                  <label className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                        <FormInput className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                      </div>
                      <div>
                        <span className="font-medium block">
                          {language === "es" ? "Campos Personalizados" : "Custom Fields"}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {language === "es" 
                            ? "Campos adicionales en plantillas de documentos"
                            : "Additional fields in document templates"}
                        </span>
                      </div>
                    </div>
                    <Switch 
                      checked={featureFlags?.is_custom_fields_enabled ?? true}
                      onCheckedChange={(v) => handleUpdateFeatureFlag("is_custom_fields_enabled", v)}
                      disabled={savingFlags}
                    />
                  </label>

                  {/* Food Ops */}
                  <label className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                        <Utensils className="w-5 h-5 text-red-600 dark:text-red-400" />
                      </div>
                      <div>
                        <span className="font-medium block">
                          {language === "es" ? "Operaciones de Comida" : "Food Operations"}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {language === "es" 
                            ? "Vincula ítems de comida con recetas y calcula costos automáticamente"
                            : "Link food items to recipes and auto-calculate costs"}
                        </span>
                      </div>
                    </div>
                    <Switch 
                      checked={featureFlags?.is_food_ops_enabled ?? true}
                      onCheckedChange={(v) => handleUpdateFeatureFlag("is_food_ops_enabled", v)}
                      disabled={savingFlags}
                    />
                  </label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

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
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm" title={language === "es" ? "Copiar enlace" : "Copy link"}>
                                    <Copy className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuItem onClick={() => copyFormLink(form.form_id)}>
                                    {language === "es" ? "Enlace (auto-detectar)" : "Link (auto-detect)"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => copyFormLink(form.form_id, "es")}>
                                    {language === "es" ? "Enlace Español" : "Spanish Link"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => copyFormLink(form.form_id, "en")}>
                                    {language === "es" ? "Enlace Inglés" : "English Link"}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm" title={language === "es" ? "Código embed" : "Embed code"}>
                                    <ExternalLink className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuItem onClick={() => copyEmbedCode(form.form_id)}>
                                    {language === "es" ? "Embed (auto-detectar)" : "Embed (auto-detect)"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => copyEmbedCode(form.form_id, "es")}>
                                    {language === "es" ? "Embed Español" : "Spanish Embed"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => copyEmbedCode(form.form_id, "en")}>
                                    {language === "es" ? "Embed Inglés" : "English Embed"}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Description (English)</Label>
                        <Textarea 
                          value={newLeadForm.description} 
                          onChange={(e) => setNewLeadForm({ ...newLeadForm, description: e.target.value })}
                          rows={2}
                          placeholder="Brief description of the form"
                        />
                      </div>
                      <div>
                        <Label>Descripción (Español)</Label>
                        <Textarea 
                          value={newLeadForm.description_es} 
                          onChange={(e) => setNewLeadForm({ ...newLeadForm, description_es: e.target.value })}
                          rows={2}
                          placeholder="Descripción breve del formulario"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Branding */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">
                      {language === "es" ? "Personalización" : "Branding"}
                    </Label>
                    <div>
                      <Label>{language === "es" ? "URL del Banner" : "Banner URL"}</Label>
                      <Input 
                        value={newLeadForm.banner_url} 
                        onChange={(e) => setNewLeadForm({ ...newLeadForm, banner_url: e.target.value })}
                        placeholder="https://example.com/banner.jpg"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {language === "es" ? "Imagen de cabecera (recomendado: 1200x400px)" : "Header image (recommended: 1200x400px)"}
                      </p>
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 p-2 rounded transition-colors">
                      <Switch 
                        checked={newLeadForm.show_logo} 
                        onCheckedChange={(v) => setNewLeadForm({ ...newLeadForm, show_logo: v })}
                      />
                      <span className="text-sm">
                        {language === "es" ? "Mostrar logo de la empresa" : "Show company logo"}
                      </span>
                    </label>
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
                      <Select value={newLeadForm.default_event_type || "none"} onValueChange={(v) => setNewLeadForm({ ...newLeadForm, default_event_type: v === "none" ? "" : v })}>
                        <SelectTrigger><SelectValue placeholder={language === "es" ? "Ninguno" : "None"} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{language === "es" ? "Ninguno" : "None"}</SelectItem>
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
                            <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 px-2 py-1 rounded transition-colors">
                              <Switch 
                                checked={field.enabled} 
                                onCheckedChange={() => toggleFieldEnabled(field.field_name)}
                              />
                              <span className="text-sm text-muted-foreground select-none">
                                {language === "es" ? "Habilitado" : "Enabled"}
                              </span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 px-2 py-1 rounded transition-colors">
                              <Switch 
                                checked={field.required}
                                onCheckedChange={() => toggleFieldRequired(field.field_name)}
                                disabled={!field.enabled}
                              />
                              <span className="text-sm text-muted-foreground select-none">
                                {language === "es" ? "Requerido" : "Required"}
                              </span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Custom Fields */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">
                      {language === "es" ? "Campos Personalizados" : "Custom Fields"}
                    </Label>
                    
                    {/* Existing custom fields */}
                    {newLeadForm.custom_fields.length > 0 && (
                      <div className="border rounded-lg divide-y">
                        {newLeadForm.custom_fields.map((field) => (
                          <div key={field.field_id} className="p-3 flex items-center justify-between">
                            <div>
                              <span className="font-medium">{language === "es" ? field.label_es : field.label_en}</span>
                              <span className="text-xs text-muted-foreground ml-2">({field.field_type})</span>
                              {field.required && <Badge variant="outline" className="ml-2 text-xs">Required</Badge>}
                            </div>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeCustomField(field.field_id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add new custom field */}
                    <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Label (English)</Label>
                          <Input 
                            value={newCustomField.label_en}
                            onChange={(e) => setNewCustomField({ ...newCustomField, label_en: e.target.value })}
                            placeholder="Field label in English"
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Etiqueta (Español)</Label>
                          <Input 
                            value={newCustomField.label_es}
                            onChange={(e) => setNewCustomField({ ...newCustomField, label_es: e.target.value })}
                            placeholder="Etiqueta del campo en español"
                            className="h-9"
                          />
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs">{language === "es" ? "Tipo" : "Type"}</Label>
                          <Select value={newCustomField.field_type} onValueChange={(v) => setNewCustomField({ ...newCustomField, field_type: v })}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">{language === "es" ? "Texto" : "Text"}</SelectItem>
                              <SelectItem value="textarea">{language === "es" ? "Texto largo" : "Long text"}</SelectItem>
                              <SelectItem value="number">{language === "es" ? "Número" : "Number"}</SelectItem>
                              <SelectItem value="date">{language === "es" ? "Fecha" : "Date"}</SelectItem>
                              <SelectItem value="select">{language === "es" ? "Selector" : "Dropdown"}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Switch 
                            checked={newCustomField.required}
                            onCheckedChange={(v) => setNewCustomField({ ...newCustomField, required: v })}
                          />
                          <span className="text-sm">{language === "es" ? "Requerido" : "Required"}</span>
                        </label>
                        <Button type="button" onClick={addCustomField} size="sm" className="h-9">
                          <Plus className="w-4 h-4 mr-1" />
                          {language === "es" ? "Agregar" : "Add"}
                        </Button>
                      </div>
                      {newCustomField.field_type === "select" && (
                        <div>
                          <Label className="text-xs">{language === "es" ? "Opciones (separadas por coma)" : "Options (comma separated)"}</Label>
                          <Input 
                            value={newCustomField.options.join(", ")}
                            onChange={(e) => setNewCustomField({ ...newCustomField, options: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                            placeholder={language === "es" ? "Opción 1, Opción 2, Opción 3" : "Option 1, Option 2, Option 3"}
                            className="h-9"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Thank You Messages - Bilingual */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">
                      {language === "es" ? "Mensajes de Agradecimiento" : "Thank You Messages"}
                    </Label>
                    <div className="grid gap-4">
                      <div>
                        <Label className="text-sm flex items-center gap-2">
                          🇺🇸 English
                        </Label>
                        <Textarea 
                          value={newLeadForm.thank_you_message_en} 
                          onChange={(e) => setNewLeadForm({ ...newLeadForm, thank_you_message_en: e.target.value })}
                          rows={2}
                          placeholder="Thank you for your inquiry! We will contact you soon."
                        />
                      </div>
                      <div>
                        <Label className="text-sm flex items-center gap-2">
                          🇪🇸 Español
                        </Label>
                        <Textarea 
                          value={newLeadForm.thank_you_message_es} 
                          onChange={(e) => setNewLeadForm({ ...newLeadForm, thank_you_message_es: e.target.value })}
                          rows={2}
                          placeholder="¡Gracias por tu consulta! Te contactaremos pronto."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Active Toggle */}
                  <label className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/70 transition-colors">
                    <div>
                      <span className="font-medium block">{language === "es" ? "Formulario Activo" : "Form Active"}</span>
                      <span className="text-xs text-muted-foreground">
                        {language === "es" ? "Solo los formularios activos pueden recibir envíos" : "Only active forms can receive submissions"}
                      </span>
                    </div>
                    <Switch 
                      checked={newLeadForm.is_active} 
                      onCheckedChange={(v) => setNewLeadForm({ ...newLeadForm, is_active: v })}
                    />
                  </label>

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
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setBulkAddOpen(true)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    {language === "es" ? "Agregar Múltiples" : "Bulk Add"}
                  </Button>
                  <Button onClick={() => { resetPicklistForm(); setPicklistDialogOpen(true); }} className="gap-2">
                    <Plus className="w-4 h-4" />
                    {language === "es" ? "Agregar" : "Add"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {language === "es" 
                    ? "Ítems predefinidos para selección rápida. Vincula con recetas (comida) o inventario (desechables) para cálculo automático de costos."
                    : "Predefined items for quick selection. Link to recipes (food) or inventory (disposables) for auto cost calculation."}
                </p>
                
                {/* Filter by Type */}
                <div className="flex gap-2 mb-4 flex-wrap">
                  {["All", "Food", "Service", "Rental", "Fee"].map(itype => (
                    <Badge 
                      key={itype}
                      variant="outline" 
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                      onClick={() => {/* Filter logic could go here */}}
                    >
                      {itype === "All" ? (language === "es" ? "Todos" : "All") : itype}
                    </Badge>
                  ))}
                </div>

                {picklist.length > 0 ? (
                  <div className="space-y-2">
                    {picklist.map(item => (
                      <div 
                        key={item.item_id} 
                        className={`flex items-center justify-between p-3 border rounded-lg ${item.is_active === false ? 'opacity-50' : ''}`} 
                        data-testid={`picklist-row-${item.item_id}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium">{item.name}</p>
                            <Badge variant="outline" className="text-xs">
                              {item.item_type || "Service"}
                            </Badge>
                            {item.is_active === false && (
                              <Badge variant="secondary" className="text-xs">
                                {language === "es" ? "Inactivo" : "Inactive"}
                              </Badge>
                            )}
                          </div>
                          {item.description && <p className="text-xs text-muted-foreground mb-1">{item.description}</p>}
                          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                            <span>{getCategoryName(item.category_id)}</span>
                            <span className="font-mono">${item.default_price?.toFixed(2)}</span>
                            {item.recipe_name && (
                              <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                                <Utensils className="w-3 h-3" /> {item.recipe_name}
                              </span>
                            )}
                            {item.inventory_item_name && (
                              <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                <Package className="w-3 h-3" /> {item.inventory_item_name}
                              </span>
                            )}
                            {item.calculated_cost && (
                              <span className="text-muted-foreground">
                                {language === "es" ? "Costo" : "Cost"}: ${item.calculated_cost?.toFixed(2)} 
                                <span className="text-xs ml-1">({item.cost_source})</span>
                              </span>
                            )}
                            {item.margin_percentage !== undefined && (
                              <span className={`${item.margin_percentage < 20 ? 'text-destructive' : item.margin_percentage > 50 ? 'text-green-600' : 'text-amber-600'}`}>
                                {language === "es" ? "Margen" : "Margin"}: {item.margin_percentage?.toFixed(0)}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEditPicklist(item)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeletePicklist(item.item_id)}>
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

            {/* Add/Edit Picklist Item Dialog */}
            <Dialog open={picklistDialogOpen} onOpenChange={(open) => { setPicklistDialogOpen(open); if (!open) resetPicklistForm(); }}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>
                    {editingPicklist 
                      ? (language === "es" ? "Editar Ítem" : "Edit Item")
                      : (language === "es" ? "Nuevo Ítem" : "New Item")}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddPicklist} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label>{language === "es" ? "Nombre" : "Name"} *</Label>
                      <Input 
                        value={newPicklist.name} 
                        onChange={(e) => setNewPicklist({ ...newPicklist, name: e.target.value })} 
                        required 
                      />
                    </div>
                    
                    <div className="col-span-2">
                      <Label>{language === "es" ? "Descripción" : "Description"}</Label>
                      <Input 
                        value={newPicklist.description} 
                        onChange={(e) => setNewPicklist({ ...newPicklist, description: e.target.value })} 
                        placeholder={language === "es" ? "Descripción opcional" : "Optional description"}
                      />
                    </div>

                    <div>
                      <Label>{language === "es" ? "Tipo" : "Type"} *</Label>
                      <Select 
                        value={newPicklist.item_type} 
                        onValueChange={(v) => setNewPicklist({ ...newPicklist, item_type: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Food">{language === "es" ? "Comida" : "Food"}</SelectItem>
                          <SelectItem value="Service">{language === "es" ? "Servicio" : "Service"}</SelectItem>
                          <SelectItem value="Rental">{language === "es" ? "Alquiler" : "Rental"}</SelectItem>
                          <SelectItem value="Fee">{language === "es" ? "Cargo" : "Fee"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>{language === "es" ? "Categoría" : "Category"} *</Label>
                      <Select 
                        value={newPicklist.category_id} 
                        onValueChange={(v) => setNewPicklist({ ...newPicklist, category_id: v })}
                      >
                        <SelectTrigger><SelectValue placeholder={language === "es" ? "Seleccionar" : "Select"} /></SelectTrigger>
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
                      <Input 
                        type="number" 
                        step="0.01" 
                        value={newPicklist.default_price} 
                        onChange={(e) => setNewPicklist({ ...newPicklist, default_price: parseFloat(e.target.value) || 0 })} 
                      />
                    </div>

                    <div>
                      <Label>{language === "es" ? "Costo Interno (Manual)" : "Internal Cost (Manual)"}</Label>
                      <Input 
                        type="number" 
                        step="0.01" 
                        value={newPicklist.internal_cost || ""} 
                        onChange={(e) => setNewPicklist({ ...newPicklist, internal_cost: e.target.value ? parseFloat(e.target.value) : null })} 
                        placeholder={language === "es" ? "Auto si hay receta" : "Auto if recipe linked"}
                      />
                    </div>

                    {/* Recipe Link (for Food) */}
                    <div className="col-span-2">
                      <Label>{language === "es" ? "Vincular Receta (para cálculo de costo automático)" : "Link Recipe (for auto cost calculation)"}</Label>
                      <Select 
                        value={newPicklist.recipe_id || "none"} 
                        onValueChange={(v) => setNewPicklist({ ...newPicklist, recipe_id: v === "none" ? "" : v })}
                      >
                        <SelectTrigger><SelectValue placeholder={language === "es" ? "Sin receta" : "No recipe"} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{language === "es" ? "Sin receta" : "No recipe"}</SelectItem>
                          {recipes.map(r => (
                            <SelectItem key={r.recipe_id} value={r.recipe_id}>
                              {r.name} - ${(r.cost_per_portion || r.cost_per_serving || 0).toFixed(2)} {language === "es" ? "costo" : "cost"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Inventory Link (for disposables) */}
                    <div className="col-span-2">
                      <Label>{language === "es" ? "Vincular Inventario (para desechables/suministros)" : "Link Inventory (for disposables/supplies)"}</Label>
                      <Select 
                        value={newPicklist.inventory_item_id || "none"} 
                        onValueChange={(v) => setNewPicklist({ ...newPicklist, inventory_item_id: v === "none" ? "" : v })}
                      >
                        <SelectTrigger><SelectValue placeholder={language === "es" ? "Sin inventario" : "No inventory"} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{language === "es" ? "Sin inventario" : "No inventory"}</SelectItem>
                          {inventoryItems.map(inv => (
                            <SelectItem key={inv.item_id} value={inv.item_id}>
                              {inv.name} - ${(inv.unit_cost || 0).toFixed(2)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Active Toggle */}
                    <div className="col-span-2 flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label className="text-base">{language === "es" ? "Activo" : "Active"}</Label>
                        <p className="text-sm text-muted-foreground">
                          {language === "es" ? "Mostrar en selección rápida" : "Show in quick selection"}
                        </p>
                      </div>
                      <Switch 
                        checked={newPicklist.is_active !== false}
                        onCheckedChange={(v) => setNewPicklist({ ...newPicklist, is_active: v })}
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full">{t("save")}</Button>
                </form>
              </DialogContent>
            </Dialog>

            {/* Bulk Add Dialog */}
            <Dialog open={bulkAddOpen} onOpenChange={setBulkAddOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{language === "es" ? "Agregar Múltiples Ítems" : "Bulk Add Items"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {language === "es" 
                      ? "Ingresa un ítem por línea: nombre, descripción, precio, costo (opcional)"
                      : "Enter one item per line: name, description, price, cost (optional)"}
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>{language === "es" ? "Tipo" : "Type"}</Label>
                      <Select 
                        value={newPicklist.item_type} 
                        onValueChange={(v) => setNewPicklist({ ...newPicklist, item_type: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Food">{language === "es" ? "Comida" : "Food"}</SelectItem>
                          <SelectItem value="Service">{language === "es" ? "Servicio" : "Service"}</SelectItem>
                          <SelectItem value="Rental">{language === "es" ? "Alquiler" : "Rental"}</SelectItem>
                          <SelectItem value="Fee">{language === "es" ? "Cargo" : "Fee"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{language === "es" ? "Categoría" : "Category"}</Label>
                      <Select 
                        value={newPicklist.category_id} 
                        onValueChange={(v) => setNewPicklist({ ...newPicklist, category_id: v })}
                      >
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
                  </div>

                  <Textarea
                    value={bulkItems}
                    onChange={(e) => setBulkItems(e.target.value)}
                    placeholder={`${language === "es" ? "Ejemplo:" : "Example:"}
Silla Tiffany, Silla elegante dorada, 15, 5
Mesa Redonda, Mesa para 10 personas, 80, 25
Mantel Blanco, , 10, 3`}
                    rows={8}
                  />
                  
                  <Button onClick={handleBulkAddPicklist} className="w-full" disabled={!bulkItems.trim() || !newPicklist.category_id}>
                    {language === "es" ? "Crear Ítems" : "Create Items"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Menus / Packages Section */}
            <Card className="mt-6">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  {language === "es" ? "Menús / Paquetes" : "Menus / Packages"}
                </CardTitle>
                <Button onClick={() => { resetMenuForm(); setMenuDialogOpen(true); }} className="gap-2">
                  <Plus className="w-4 h-4" />
                  {language === "es" ? "Crear Menú" : "Create Menu"}
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {language === "es" 
                    ? "Agrupa múltiples ítems en menús o paquetes para agregarlos rápidamente a propuestas."
                    : "Group multiple items into menus or packages for quick addition to proposals."}
                </p>
                
                {menus.length > 0 ? (
                  <div className="space-y-3">
                    {menus.map(menu => (
                      <Card key={menu.menu_id} className={`border ${menu.is_active === false ? 'opacity-60' : ''}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold">{menu.name}</h4>
                                <Badge variant="outline" className="text-xs">{menu.menu_type}</Badge>
                                <Badge variant="secondary" className="text-xs">{menu.items?.length || 0} {language === "es" ? "ítems" : "items"}</Badge>
                                {menu.is_active === false && <Badge variant="secondary">{language === "es" ? "Inactivo" : "Inactive"}</Badge>}
                              </div>
                              {menu.description && <p className="text-sm text-muted-foreground mb-2">{menu.description}</p>}
                              
                              {/* Items list */}
                              <div className="flex flex-wrap gap-1 mb-2">
                                {menu.items?.slice(0, 6).map((item, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {item.custom_name || item.picklist_item?.name || "Item"}
                                    {item.quantity > 1 && ` ×${item.quantity}`}
                                  </Badge>
                                ))}
                                {menu.items?.length > 6 && (
                                  <Badge variant="outline" className="text-xs">+{menu.items.length - 6}</Badge>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-4 text-sm">
                                <span className="font-mono font-medium">
                                  {menu.is_fixed_price ? `${language === "es" ? "Precio Fijo" : "Fixed"}: ` : ""}
                                  ${menu.total_price?.toFixed(2)}
                                </span>
                                {featureFlags?.is_margin_tracking_enabled && (
                                  <>
                                    <span className="text-muted-foreground">
                                      {language === "es" ? "Costo" : "Cost"}: ${menu.total_cost?.toFixed(2)}
                                    </span>
                                    <span className={menu.margin_percentage < 20 ? 'text-destructive' : menu.margin_percentage > 50 ? 'text-green-600' : 'text-amber-600'}>
                                      {language === "es" ? "Margen" : "Margin"}: {menu.margin_percentage?.toFixed(0)}%
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEditMenu(menu)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteMenu(menu.menu_id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>{language === "es" ? "No hay menús creados" : "No menus created"}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Menu Dialog */}
            <Dialog open={menuDialogOpen} onOpenChange={(open) => { setMenuDialogOpen(open); if (!open) resetMenuForm(); }}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingMenu 
                      ? (language === "es" ? "Editar Menú" : "Edit Menu")
                      : (language === "es" ? "Nuevo Menú / Paquete" : "New Menu / Package")}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSaveMenu} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>{language === "es" ? "Nombre" : "Name"} *</Label>
                      <Input 
                        value={newMenu.name} 
                        onChange={(e) => setNewMenu({ ...newMenu, name: e.target.value })} 
                        required 
                      />
                    </div>
                    <div>
                      <Label>{language === "es" ? "Nombre (Español)" : "Name (Spanish)"}</Label>
                      <Input 
                        value={newMenu.name_es} 
                        onChange={(e) => setNewMenu({ ...newMenu, name_es: e.target.value })} 
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>{language === "es" ? "Descripción" : "Description"}</Label>
                      <Textarea 
                        value={newMenu.description} 
                        onChange={(e) => setNewMenu({ ...newMenu, description: e.target.value })} 
                        rows={2}
                      />
                    </div>
                    <div>
                      <Label>{language === "es" ? "Tipo" : "Type"}</Label>
                      <Select value={newMenu.menu_type} onValueChange={(v) => setNewMenu({ ...newMenu, menu_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Menu">{language === "es" ? "Menú" : "Menu"}</SelectItem>
                          <SelectItem value="Package">{language === "es" ? "Paquete" : "Package"}</SelectItem>
                          <SelectItem value="Bundle">{language === "es" ? "Bundle" : "Bundle"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch 
                          checked={newMenu.is_fixed_price}
                          onCheckedChange={(v) => setNewMenu({ ...newMenu, is_fixed_price: v })}
                        />
                        <Label>{language === "es" ? "Precio Fijo" : "Fixed Price"}</Label>
                      </div>
                      {newMenu.is_fixed_price && (
                        <Input 
                          type="number"
                          step="0.01"
                          className="w-32"
                          placeholder="$0.00"
                          value={newMenu.default_price || ""}
                          onChange={(e) => setNewMenu({ ...newMenu, default_price: parseFloat(e.target.value) || null })}
                        />
                      )}
                    </div>
                  </div>

                  {/* Items in Menu */}
                  <div className="border rounded-lg p-4">
                    <Label className="mb-3 block">{language === "es" ? "Ítems del Menú" : "Menu Items"}</Label>
                    
                    {/* Add from Picklist */}
                    <Select onValueChange={(itemId) => {
                      const item = picklist.find(p => p.item_id === itemId);
                      if (item) addItemToMenu(item);
                    }}>
                      <SelectTrigger className="mb-3">
                        <SelectValue placeholder={language === "es" ? "Agregar ítem del picklist..." : "Add item from picklist..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {picklist.filter(p => p.is_active !== false).map(item => (
                          <SelectItem key={item.item_id} value={item.item_id}>
                            {item.name} - ${item.default_price?.toFixed(2)} ({item.item_type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Current Items */}
                    {newMenu.items.length > 0 ? (
                      <div className="space-y-2">
                        {newMenu.items.map((item, idx) => {
                          const picklistItem = picklist.find(p => p.item_id === item.picklist_item_id);
                          return (
                            <div key={idx} className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
                              <Input
                                type="number"
                                min="0.1"
                                step="0.1"
                                className="w-20"
                                value={item.quantity}
                                onChange={(e) => updateMenuItemQuantity(idx, e.target.value)}
                              />
                              <span className="flex-1 text-sm">
                                {item.custom_name || picklistItem?.name || "Item"}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                ${((picklistItem?.default_price || 0) * item.quantity).toFixed(2)}
                              </span>
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeItemFromMenu(idx)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-center py-4 text-sm text-muted-foreground">
                        {language === "es" ? "Agrega ítems al menú" : "Add items to the menu"}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label className="text-base">{language === "es" ? "Activo" : "Active"}</Label>
                      <p className="text-sm text-muted-foreground">
                        {language === "es" ? "Disponible para agregar a propuestas" : "Available to add to proposals"}
                      </p>
                    </div>
                    <Switch 
                      checked={newMenu.is_active !== false}
                      onCheckedChange={(v) => setNewMenu({ ...newMenu, is_active: v })}
                    />
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
