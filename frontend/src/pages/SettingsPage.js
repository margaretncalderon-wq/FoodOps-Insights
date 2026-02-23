import { useEffect, useState } from "react";
import { API } from "../utils/api";
import axios from "axios";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { useTerminology } from "../hooks/useTerminology";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Checkbox } from "../components/ui/checkbox";
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
import { Building2, Palette, Globe, DollarSign, FileText, Loader2, Check, Plus, Trash2, Tag, ListChecks, Percent, Package, FormInput, Copy, ExternalLink, Edit, ToggleLeft, Utensils, Calculator, FileStack, ChefHat, ShoppingCart, Users, Shield, Zap, Plug, Clock, Languages, Upload, MapPin, Phone, Mail, Globe2, Eye, CreditCard, Landmark, X } from "lucide-react";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";

// New Settings Sections
import RolesSettingsSection from "../components/settings/RolesSettingsSection";
import AutomationsSettingsSection from "../components/settings/AutomationsSettingsSection";
import IntegrationsSettingsSection from "../components/settings/IntegrationsSettingsSection";
import GoogleCalendarSettingsSection from "../components/settings/GoogleCalendarSettingsSection";
import ImportExportSection from "../components/settings/ImportExportSection";
import IndustryConfigSection from "../components/settings/IndustryConfigSection";
import TerminologySettingsSection from "../components/settings/TerminologySettingsSection";
import { BillingSection, TeamSection } from "../components/org";

const CURRENCIES = ["USD", "EUR", "MXN", "COP", "ARS", "CLP", "PEN", "DOP"];
const EVENT_TYPES = ["wedding", "corporate", "birthday", "social", "other"];
const LEAD_SOURCES = ["Website", "Instagram", "QR", "Referral", "Other"];

// Default form fields configuration
const DEFAULT_FORM_FIELDS = [
  { field_name: "lead_name", label: "Full Name", label_es: "Nombre completo", enabled: true, required: true },
  { field_name: "email", label: "Email", label_es: "Email", enabled: true, required: true },
  { field_name: "phone", label: "Phone", label_es: "Teléfono", enabled: true, required: false },
  { field_name: "whatsapp", label: "WhatsApp", label_es: "WhatsApp", enabled: true, required: false },
  { field_name: "company_name", label: "Company", label_es: "Empresa", enabled: true, required: false },
  { field_name: "event_type", label: "Event Type", label_es: "Tipo de Evento", enabled: true, required: true },
  { field_name: "event_date", label: "Event Date", label_es: "Fecha del Evento", enabled: true, required: false },
  { field_name: "estimated_guest_count", label: "Guest Count", label_es: "Cantidad de Invitados", enabled: true, required: false },
  { field_name: "budget_range", label: "Budget Range", label_es: "Rango de Presupuesto", enabled: true, required: false },
  { field_name: "message", label: "Message", label_es: "Mensaje", enabled: true, required: false },
];

export default function SettingsPage() {
  const { t, language, changeLanguage } = useLanguage();
  const { term } = useTerminology();
  
  // Dynamic terminology
  const clientLabel = term("events", "client");
  const clientsLabel = term("events", "clients");
  const eventLabel = term("events", "entity_singular");
  const eventsLabel = term("events", "entity_plural");
  const guestsLabel = term("events", "guests");
  const venueLabel = term("events", "venue");
  
  const [company, setCompany] = useState(null);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [itemTypes, setItemTypes] = useState([]);
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
    time_format: "24h",
    // Business Information
    legal_name: "",
    trade_name: "",
    tax_id: "",
    email: "",
    phone: "",
    website: "",
    // Location
    address: "",
    city: "",
    state: "",
    country: "",
    postal_code: "",
    // Additional
    tax_regime: "",
    industry_sector: "",
    employee_count: "",
    decimal_precision: 2,
    decimal_separator: ".",
    // Terms & Conditions
    terms_proposal_es: "",
    terms_proposal_en: "",
    terms_invoice_es: "",
    terms_invoice_en: "",
    terms_contract_es: "",
    terms_contract_en: "",
    payment_terms_default: "",
    // Bank Account
    bank_name: "",
    bank_account_number: "",
    bank_account_type: "",
    bank_routing_number: "",
    bank_beneficiary: "",
    bank_notes: "",
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [activeTermsTab, setActiveTermsTab] = useState("proposal");
  const [showDocPreview, setShowDocPreview] = useState(false);
  
  const [newCategory, setNewCategory] = useState({ name: "", name_es: "", color: "#6B7280", icon: "package", sort_order: 0 });
  const [editCategory, setEditCategory] = useState(null);
  const [newItemType, setNewItemType] = useState({ name: "", name_es: "" });
  const [editItemType, setEditItemType] = useState(null);
  const [itemTypeDialogOpen, setItemTypeDialogOpen] = useState(false);
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
      fetchItemTypes(),
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
        name: response.data.name || "",
        logo_url: response.data.logo_url || "",
        primary_color: response.data.primary_color || "#3A4D3F",
        secondary_color: response.data.secondary_color || "#E5DCC5",
        default_language: response.data.default_language || "en",
        currency: response.data.currency || "USD",
        time_format: response.data.time_format || "24h",
        // Business Information
        legal_name: response.data.legal_name || "",
        trade_name: response.data.trade_name || "",
        tax_id: response.data.tax_id || "",
        email: response.data.email || "",
        phone: response.data.phone || "",
        website: response.data.website || "",
        // Location
        address: response.data.address || "",
        city: response.data.city || "",
        state: response.data.state || "",
        country: response.data.country || "",
        postal_code: response.data.postal_code || "",
        // Additional
        tax_regime: response.data.tax_regime || "",
        industry_sector: response.data.industry_sector || "",
        employee_count: response.data.employee_count || "",
        decimal_precision: response.data.decimal_precision || 2,
        decimal_separator: response.data.decimal_separator || ".",
        // Terms & Conditions
        terms_proposal_es: response.data.terms_proposal_es || "",
        terms_proposal_en: response.data.terms_proposal_en || "",
        terms_invoice_es: response.data.terms_invoice_es || "",
        terms_invoice_en: response.data.terms_invoice_en || "",
        terms_contract_es: response.data.terms_contract_es || "",
        terms_contract_en: response.data.terms_contract_en || "",
        payment_terms_default: response.data.payment_terms_default || "",
        // Bank Account
        bank_name: response.data.bank_name || "",
        bank_account_number: response.data.bank_account_number || "",
        bank_account_type: response.data.bank_account_type || "",
        bank_routing_number: response.data.bank_routing_number || "",
        bank_beneficiary: response.data.bank_beneficiary || "",
        bank_notes: response.data.bank_notes || "",
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

  const fetchItemTypes = async () => {
    try {
      const response = await axios.get(`${API}/settings/item-types`, { withCredentials: true });
      setItemTypes(response.data);
    } catch (error) {
      console.error("Failed to fetch item types:", error);
      // Fallback to defaults if endpoint doesn't exist yet
      setItemTypes([
        { type_id: "Food", name: "Food", name_es: "Comida" },
        { type_id: "Service", name: "Service", name_es: "Servicio" },
        { type_id: "Rental", name: "Rental", name_es: "Alquiler" },
        { type_id: "Fee", name: "Fee", name_es: "Cargo" }
      ]);
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

  const handleUpdateTemplate = async (templateId, templateData) => {
    setSavingTemplate(templateId);
    try {
      await axios.put(`${API}/settings/document-templates/${templateId}`, {
        template_type: templateData.template_type,
        name: templateData.name,
        is_active: templateData.is_active,
        custom_fields: templateData.custom_fields || [],
        header_text_en: templateData.header_text_en,
        header_text_es: templateData.header_text_es,
        footer_text_en: templateData.footer_text_en,
        footer_text_es: templateData.footer_text_es
      }, { withCredentials: true });
      
      // Update local state
      setDocumentTemplates(prev => prev.map(t => 
        t.template_id === templateId ? { ...t, ...templateData } : t
      ));
      
      toast.success(language === "es" ? "Plantilla actualizada" : "Template updated");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update template");
    } finally {
      setSavingTemplate(null);
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

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) {
      toast.error(language === "es" ? "Tipo de archivo no válido. Use JPEG, PNG, WebP o SVG" : "Invalid file type. Use JPEG, PNG, WebP or SVG");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error(language === "es" ? "El archivo es muy grande. Máximo 5MB" : "File too large. Max 5MB");
      return;
    }

    setUploadingLogo(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append("file", file);

      const response = await axios.post(`${API}/settings/company/logo`, formDataUpload, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" }
      });

      setFormData({ ...formData, logo_url: response.data.logo_url });
      toast.success(language === "es" ? "Logo subido correctamente" : "Logo uploaded successfully");
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === "es" ? "Error al subir logo" : "Failed to upload logo"));
    } finally {
      setUploadingLogo(false);
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

  const handleEditCategory = async (e) => {
    e.preventDefault();
    if (!editCategory) return;
    try {
      await axios.put(`${API}/settings/categories/${editCategory.category_id}`, {
        name: editCategory.name,
        name_es: editCategory.name_es,
        color: editCategory.color
      }, { withCredentials: true });
      toast.success(language === "es" ? "Categoría actualizada" : "Category updated");
      fetchCategories();
      setEditCategory(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update category");
    }
  };

  // Item Type handlers
  const handleAddItemType = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/settings/item-types`, newItemType, { withCredentials: true });
      toast.success(language === "es" ? "Tipo creado" : "Type created");
      fetchItemTypes();
      setItemTypeDialogOpen(false);
      setNewItemType({ name: "", name_es: "" });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create type");
    }
  };

  const handleEditItemType = async (e) => {
    e.preventDefault();
    if (!editItemType) return;
    try {
      await axios.put(`${API}/settings/item-types/${editItemType.type_id}`, {
        name: editItemType.name,
        name_es: editItemType.name_es
      }, { withCredentials: true });
      toast.success(language === "es" ? "Tipo actualizado" : "Type updated");
      fetchItemTypes();
      setEditItemType(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update type");
    }
  };

  const handleDeleteItemType = async (typeId) => {
    try {
      await axios.delete(`${API}/settings/item-types/${typeId}`, { withCredentials: true });
      toast.success(language === "es" ? "Tipo eliminado" : "Type deleted");
      fetchItemTypes();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete type");
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
            <TabsTrigger value="billing" className="gap-2">
              <DollarSign className="w-4 h-4" />
              {language === "es" ? "Facturación" : "Billing"}
            </TabsTrigger>
            <TabsTrigger value="terminology" className="gap-2" data-testid="terminology-tab">
              <Languages className="w-4 h-4" />
              {language === "es" ? "Terminología" : "Terminology"}
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-2">
              <Users className="w-4 h-4" />
              {language === "es" ? "Equipo" : "Team"}
            </TabsTrigger>
            <TabsTrigger value="roles" className="gap-2">
              <Shield className="w-4 h-4" />
              {language === "es" ? "Roles" : "Roles"}
            </TabsTrigger>
            <TabsTrigger value="automations" className="gap-2">
              <Zap className="w-4 h-4" />
              {language === "es" ? "Automatizaciones" : "Automations"}
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-2">
              <Plug className="w-4 h-4" />
              {language === "es" ? "Integraciones" : "Integrations"}
            </TabsTrigger>
            <TabsTrigger value="features" className="gap-2">
              <ToggleLeft className="w-4 h-4" />
              {language === "es" ? "Funciones" : "Features"}
            </TabsTrigger>
            <TabsTrigger value="leadforms" className="gap-2">
              <FormInput className="w-4 h-4" />
              {language === "es" ? "Formularios" : "Lead Forms"}
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-2">
              <Tag className="w-4 h-4" />
              {language === "es" ? "Categorías" : "Categories"}
            </TabsTrigger>
            <TabsTrigger value="picklist" className="gap-2">
              <ListChecks className="w-4 h-4" />
              {language === "es" ? "Ítems" : "Picklist"}
            </TabsTrigger>
            <TabsTrigger value="taxes" className="gap-2">
              <Percent className="w-4 h-4" />
              {language === "es" ? "Impuestos" : "Taxes"}
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="w-4 h-4" />
              {language === "es" ? "Plantillas" : "Templates"}
            </TabsTrigger>
            <TabsTrigger value="import-export" className="gap-2">
              <FileStack className="w-4 h-4" />
              {language === "es" ? "Importar/Exportar" : "Import/Export"}
            </TabsTrigger>
            <TabsTrigger value="data-admin" className="gap-2 text-red-600">
              <Trash2 className="w-4 h-4" />
              {language === "es" ? "Admin Datos" : "Data Admin"}
            </TabsTrigger>
            <TabsTrigger value="preferences">
              {language === "es" ? "Preferencias" : "Preferences"}
            </TabsTrigger>
          </TabsList>

          {/* Billing Tab */}
          <TabsContent value="billing">
            <BillingSection />
          </TabsContent>

          {/* Terminology Tab */}
          <TabsContent value="terminology">
            <TerminologySettingsSection />
          </TabsContent>

          {/* Team Tab */}
          <TabsContent value="team">
            <TeamSection />
          </TabsContent>

          {/* Roles Tab */}
          <TabsContent value="roles">
            <RolesSettingsSection />
          </TabsContent>

          {/* Automations Tab */}
          <TabsContent value="automations">
            <AutomationsSettingsSection />
          </TabsContent>

          {/* Integrations Tab */}
          <TabsContent value="integrations">
            <div className="space-y-6">
              <GoogleCalendarSettingsSection />
              <IntegrationsSettingsSection />
            </div>
          </TabsContent>

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

                  {/* Inventory Module */}
                  <label className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-100 rounded-lg">
                        <Package className="w-5 h-5 text-orange-600" />
                      </div>
                      <div>
                        <span className="font-medium">{language === "es" ? "Módulo de Inventario" : "Inventory Module"}</span>
                        <span className="block text-sm text-muted-foreground">
                          {language === "es" 
                            ? "Gestiona inventario, proveedores y stock"
                            : "Manage inventory, suppliers, and stock levels"}
                        </span>
                      </div>
                    </div>
                    <Switch 
                      checked={featureFlags?.is_inventory_enabled ?? false}
                      onCheckedChange={(v) => handleUpdateFeatureFlag("is_inventory_enabled", v)}
                      disabled={savingFlags}
                    />
                  </label>

                  {/* Purchase Lists */}
                  <label className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-cyan-100 rounded-lg">
                        <ShoppingCart className="w-5 h-5 text-cyan-600" />
                      </div>
                      <div>
                        <span className="font-medium">{language === "es" ? "Listas de Compra" : "Purchase Lists"}</span>
                        <span className="block text-sm text-muted-foreground">
                          {language === "es" 
                            ? "Genera listas de compra automáticas para eventos"
                            : "Auto-generate purchase lists for events"}
                        </span>
                      </div>
                    </div>
                    <Switch 
                      checked={featureFlags?.is_purchase_list_enabled ?? false}
                      onCheckedChange={(v) => handleUpdateFeatureFlag("is_purchase_list_enabled", v)}
                      disabled={savingFlags}
                    />
                  </label>

                  {/* Recipe Composition (Sub-recipes) */}
                  <label className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-violet-100 rounded-lg">
                        <ChefHat className="w-5 h-5 text-violet-600" />
                      </div>
                      <div>
                        <span className="font-medium">{language === "es" ? "Composición de Recetas" : "Recipe Composition"}</span>
                        <span className="block text-sm text-muted-foreground">
                          {language === "es" 
                            ? "Permite usar sub-recetas como ingredientes (salsas, bases)"
                            : "Allow using sub-recipes as ingredients (sauces, bases)"}
                        </span>
                      </div>
                    </div>
                    <Switch 
                      checked={featureFlags?.is_recipe_composition_enabled ?? true}
                      onCheckedChange={(v) => handleUpdateFeatureFlag("is_recipe_composition_enabled", v)}
                      disabled={savingFlags}
                    />
                  </label>

                  {/* Plated Menus */}
                  <label className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 rounded-lg">
                        <Utensils className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <span className="font-medium">{language === "es" ? "Menús Emplatados" : "Plated Menus"}</span>
                        <span className="block text-sm text-muted-foreground">
                          {language === "es" 
                            ? "Crea menús con tiempos y calcula costo por comensal"
                            : "Create menus with courses and calculate cost per guest"}
                        </span>
                      </div>
                    </div>
                    <Switch 
                      checked={featureFlags?.is_plated_menu_enabled ?? true}
                      onCheckedChange={(v) => handleUpdateFeatureFlag("is_plated_menu_enabled", v)}
                      disabled={savingFlags}
                    />
                  </label>

                  {/* Base Recipes */}
                  <label className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-fuchsia-100 rounded-lg">
                        <Calculator className="w-5 h-5 text-fuchsia-600" />
                      </div>
                      <div>
                        <span className="font-medium">{language === "es" ? "Tipos de Receta" : "Recipe Types"}</span>
                        <span className="block text-sm text-muted-foreground">
                          {language === "es" 
                            ? "Clasifica recetas en Base, Componente y Plato Final"
                            : "Classify recipes as Base, Component, or Final Dish"}
                        </span>
                      </div>
                    </div>
                    <Switch 
                      checked={featureFlags?.is_base_recipes_enabled ?? true}
                      onCheckedChange={(v) => handleUpdateFeatureFlag("is_base_recipes_enabled", v)}
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
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Logo & Basic Info Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-lg flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    {language === "es" ? "Datos Generales" : "General Information"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid lg:grid-cols-3 gap-6">
                    {/* Logo Upload Section */}
                    <div className="lg:col-span-1">
                      <Label className="mb-2 block">{language === "es" ? "Logo de la Empresa" : "Company Logo"}</Label>
                      <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center">
                        {formData.logo_url ? (
                          <div className="space-y-3">
                            <img 
                              src={formData.logo_url.startsWith('/api') ? `${API.replace('/api', '')}${formData.logo_url}` : formData.logo_url} 
                              alt="Logo" 
                              className="max-h-24 mx-auto object-contain"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                            <label className="cursor-pointer">
                              <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} />
                              <span className="text-sm text-primary hover:underline flex items-center justify-center gap-1">
                                {uploadingLogo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Edit className="w-3 h-3" />}
                                {language === "es" ? "Cambiar logo" : "Change logo"}
                              </span>
                            </label>
                          </div>
                        ) : (
                          <label className="cursor-pointer block py-4">
                            <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} />
                            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                            <span className="text-sm text-muted-foreground">
                              {uploadingLogo ? (
                                <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{language === "es" ? "Subiendo..." : "Uploading..."}</span>
                              ) : (
                                language === "es" ? "Haz clic para subir logo" : "Click to upload logo"
                              )}
                            </span>
                            <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WebP, SVG (máx 5MB)</p>
                          </label>
                        )}
                      </div>
                    </div>

                    {/* Basic Info */}
                    <div className="lg:col-span-2 grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{language === "es" ? "Razón Social *" : "Legal Name *"}</Label>
                        <Input value={formData.legal_name} onChange={(e) => setFormData({ ...formData, legal_name: e.target.value })} placeholder="Mi Empresa SRL" />
                      </div>
                      <div className="space-y-2">
                        <Label>{language === "es" ? "RNC o Cédula" : "Tax ID"}</Label>
                        <Input value={formData.tax_id} onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })} placeholder="123456789" />
                      </div>
                      <div className="space-y-2">
                        <Label>{language === "es" ? "Nombre Comercial" : "Trade Name"}</Label>
                        <Input value={formData.trade_name || formData.name} onChange={(e) => setFormData({ ...formData, trade_name: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>{language === "es" ? "Correo Electrónico" : "Email"}</Label>
                        <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="contacto@empresa.com" />
                      </div>
                      <div className="space-y-2">
                        <Label>{language === "es" ? "Sitio Web" : "Website"}</Label>
                        <Input value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} placeholder="www.empresa.com" />
                      </div>
                      <div className="space-y-2">
                        <Label>{language === "es" ? "Teléfono *" : "Phone *"}</Label>
                        <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+1 809-555-1234" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Location Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-lg flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    {language === "es" ? "Datos de Ubicación" : "Location Information"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2 space-y-2">
                      <Label>{language === "es" ? "Dirección" : "Address"}</Label>
                      <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Calle Principal No. 123" />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === "es" ? "Código Postal" : "Postal Code"}</Label>
                      <Input value={formData.postal_code} onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })} placeholder="10101" />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === "es" ? "Municipio" : "City"}</Label>
                      <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} placeholder="Santo Domingo" />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === "es" ? "Provincia/Estado" : "State/Province"}</Label>
                      <Input value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} placeholder="Distrito Nacional" />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === "es" ? "País" : "Country"}</Label>
                      <Input value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} placeholder="República Dominicana" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Additional Data & Branding Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    {language === "es" ? "Datos Adicionales" : "Additional Information"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>{language === "es" ? "Régimen Fiscal" : "Tax Regime"}</Label>
                      <Select value={formData.tax_regime} onValueChange={(v) => setFormData({ ...formData, tax_regime: v })}>
                        <SelectTrigger><SelectValue placeholder={language === "es" ? "Seleccionar" : "Select"} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">{language === "es" ? "Régimen General" : "General Regime"}</SelectItem>
                          <SelectItem value="simplified">{language === "es" ? "Régimen Simplificado" : "Simplified Regime"}</SelectItem>
                          <SelectItem value="special">{language === "es" ? "Régimen Especial" : "Special Regime"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{language === "es" ? "Sector" : "Industry Sector"}</Label>
                      <Input value={formData.industry_sector} onChange={(e) => setFormData({ ...formData, industry_sector: e.target.value })} placeholder={language === "es" ? "Alimentación / Gastronomía" : "Food / Gastronomy"} />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === "es" ? "Número de Empleados" : "Number of Employees"}</Label>
                      <Select value={formData.employee_count} onValueChange={(v) => setFormData({ ...formData, employee_count: v })}>
                        <SelectTrigger><SelectValue placeholder={language === "es" ? "Seleccionar" : "Select"} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1-10">1 - 10</SelectItem>
                          <SelectItem value="11-50">11 - 50</SelectItem>
                          <SelectItem value="51-200">51 - 200</SelectItem>
                          <SelectItem value="201-500">201 - 500</SelectItem>
                          <SelectItem value="500+">500+</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{language === "es" ? "Moneda *" : "Currency *"}</Label>
                      <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{language === "es" ? "Precisión Decimal" : "Decimal Precision"}</Label>
                      <Select value={String(formData.decimal_precision)} onValueChange={(v) => setFormData({ ...formData, decimal_precision: parseInt(v) })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0</SelectItem>
                          <SelectItem value="2">2</SelectItem>
                          <SelectItem value="3">3</SelectItem>
                          <SelectItem value="4">4</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{language === "es" ? "Separador Decimal" : "Decimal Separator"}</Label>
                      <Select value={formData.decimal_separator} onValueChange={(v) => setFormData({ ...formData, decimal_separator: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value=".">{language === "es" ? ". (Punto)" : ". (Period)"}</SelectItem>
                          <SelectItem value=",">{language === "es" ? ", (Coma)" : ", (Comma)"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Brand Colors */}
                  <div className="pt-4 border-t space-y-4">
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
                </CardContent>
              </Card>

              {/* Terms & Conditions Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    {language === "es" ? "Términos y Condiciones" : "Terms & Conditions"}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {language === "es" 
                      ? "Configura los términos que aparecerán en propuestas, facturas y contratos" 
                      : "Configure terms that will appear in proposals, invoices and contracts"}
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Payment Terms */}
                  <div className="space-y-2">
                    <Label>{language === "es" ? "Términos de Pago por Defecto" : "Default Payment Terms"}</Label>
                    <Textarea 
                      value={formData.payment_terms_default} 
                      onChange={(e) => setFormData({ ...formData, payment_terms_default: e.target.value })}
                      placeholder={language === "es" ? "Ej: 50% al confirmar, 50% el día del evento" : "E.g.: 50% on confirmation, 50% on event day"}
                      rows={2}
                    />
                  </div>

                  {/* Terms Tabs */}
                  <Tabs value={activeTermsTab} onValueChange={setActiveTermsTab}>
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="proposal">{language === "es" ? "Propuestas" : "Proposals"}</TabsTrigger>
                      <TabsTrigger value="invoice">{language === "es" ? "Facturas" : "Invoices"}</TabsTrigger>
                      <TabsTrigger value="contract">{language === "es" ? "Contratos" : "Contracts"}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="proposal" className="space-y-4 mt-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <span className="text-lg">🇪🇸</span> {language === "es" ? "Español" : "Spanish"}
                          </Label>
                          <Textarea 
                            value={formData.terms_proposal_es} 
                            onChange={(e) => setFormData({ ...formData, terms_proposal_es: e.target.value })}
                            placeholder="Los precios incluyen... La propuesta tiene validez de..."
                            rows={5}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <span className="text-lg">🇺🇸</span> {language === "es" ? "Inglés" : "English"}
                          </Label>
                          <Textarea 
                            value={formData.terms_proposal_en} 
                            onChange={(e) => setFormData({ ...formData, terms_proposal_en: e.target.value })}
                            placeholder="Prices include... This proposal is valid for..."
                            rows={5}
                          />
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="invoice" className="space-y-4 mt-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <span className="text-lg">🇪🇸</span> {language === "es" ? "Español" : "Spanish"}
                          </Label>
                          <Textarea 
                            value={formData.terms_invoice_es} 
                            onChange={(e) => setFormData({ ...formData, terms_invoice_es: e.target.value })}
                            placeholder="El pago debe realizarse antes de... Métodos de pago aceptados..."
                            rows={5}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <span className="text-lg">🇺🇸</span> {language === "es" ? "Inglés" : "English"}
                          </Label>
                          <Textarea 
                            value={formData.terms_invoice_en} 
                            onChange={(e) => setFormData({ ...formData, terms_invoice_en: e.target.value })}
                            placeholder="Payment must be made before... Accepted payment methods..."
                            rows={5}
                          />
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="contract" className="space-y-4 mt-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <span className="text-lg">🇪🇸</span> {language === "es" ? "Español" : "Spanish"}
                          </Label>
                          <Textarea 
                            value={formData.terms_contract_es} 
                            onChange={(e) => setFormData({ ...formData, terms_contract_es: e.target.value })}
                            placeholder="Las partes acuerdan... En caso de cancelación..."
                            rows={5}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <span className="text-lg">🇺🇸</span> {language === "es" ? "Inglés" : "English"}
                          </Label>
                          <Textarea 
                            value={formData.terms_contract_en} 
                            onChange={(e) => setFormData({ ...formData, terms_contract_en: e.target.value })}
                            placeholder="The parties agree... In case of cancellation..."
                            rows={5}
                          />
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              {/* Bank Account Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-lg flex items-center gap-2">
                    <Landmark className="w-5 h-5" />
                    {language === "es" ? "Información Bancaria" : "Bank Account Information"}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {language === "es" 
                      ? "Esta información aparecerá en facturas y propuestas para facilitar el pago" 
                      : "This information will appear in invoices and proposals for easy payment"}
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>{language === "es" ? "Nombre del Banco" : "Bank Name"}</Label>
                      <Input 
                        value={formData.bank_name} 
                        onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                        placeholder="Banco Popular Dominicano"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === "es" ? "Número de Cuenta" : "Account Number"}</Label>
                      <Input 
                        value={formData.bank_account_number} 
                        onChange={(e) => setFormData({ ...formData, bank_account_number: e.target.value })}
                        placeholder="123-456789-0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === "es" ? "Tipo de Cuenta" : "Account Type"}</Label>
                      <Select value={formData.bank_account_type} onValueChange={(v) => setFormData({ ...formData, bank_account_type: v })}>
                        <SelectTrigger><SelectValue placeholder={language === "es" ? "Seleccionar" : "Select"} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="checking">{language === "es" ? "Corriente" : "Checking"}</SelectItem>
                          <SelectItem value="savings">{language === "es" ? "Ahorro" : "Savings"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{language === "es" ? "SWIFT / Número de Ruta" : "SWIFT / Routing Number"}</Label>
                      <Input 
                        value={formData.bank_routing_number} 
                        onChange={(e) => setFormData({ ...formData, bank_routing_number: e.target.value })}
                        placeholder="BPOPDOMX"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === "es" ? "Beneficiario" : "Beneficiary"}</Label>
                      <Input 
                        value={formData.bank_beneficiary} 
                        onChange={(e) => setFormData({ ...formData, bank_beneficiary: e.target.value })}
                        placeholder={formData.legal_name || (language === "es" ? "Nombre de la empresa" : "Company name")}
                      />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-1 space-y-2">
                      <Label>{language === "es" ? "Notas Adicionales" : "Additional Notes"}</Label>
                      <Input 
                        value={formData.bank_notes} 
                        onChange={(e) => setFormData({ ...formData, bank_notes: e.target.value })}
                        placeholder={language === "es" ? "Ej: Referencia: número de factura" : "E.g.: Reference: invoice number"}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Preview & Save Actions */}
              <div className="flex justify-between items-center">
                <Button type="button" variant="outline" onClick={() => setShowDocPreview(true)} className="gap-2">
                  <Eye className="w-4 h-4" />
                  {language === "es" ? "Vista Previa de Documento" : "Document Preview"}
                </Button>
                <Button type="submit" disabled={saving} data-testid="save-settings-btn">
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {t("save")}
                </Button>
              </div>
            </form>

            {/* Document Preview Dialog */}
            <Dialog open={showDocPreview} onOpenChange={setShowDocPreview}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-heading flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    {language === "es" ? "Vista Previa de Documento" : "Document Preview"}
                  </DialogTitle>
                </DialogHeader>
                
                {/* Sample Document Preview */}
                <div className="bg-white border rounded-lg p-8 shadow-sm" style={{ borderTopColor: formData.primary_color, borderTopWidth: "4px" }}>
                  {/* Header */}
                  <div className="flex justify-between items-start mb-6 pb-6 border-b">
                    <div className="flex gap-4 items-start">
                      {formData.logo_url && (
                        <img 
                          src={formData.logo_url.startsWith('/api') ? `${API.replace('/api', '')}${formData.logo_url}` : formData.logo_url} 
                          alt="Logo" 
                          className="h-14 object-contain"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      )}
                      <div>
                        <h2 className="text-lg font-bold" style={{ color: formData.primary_color }}>
                          {formData.legal_name || formData.trade_name || formData.name || (language === "es" ? "Nombre de Empresa" : "Company Name")}
                        </h2>
                        {formData.tax_id && <p className="text-xs text-muted-foreground">RNC: {formData.tax_id}</p>}
                        {(formData.address || formData.city) && (
                          <p className="text-xs text-muted-foreground">{[formData.address, formData.city, formData.state].filter(Boolean).join(", ")}</p>
                        )}
                        {(formData.phone || formData.email) && (
                          <p className="text-xs text-muted-foreground">{[formData.phone, formData.email].filter(Boolean).join(" | ")}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold" style={{ color: formData.primary_color }}>{language === "es" ? "Propuesta" : "Proposal"}</p>
                      <p className="text-sm text-muted-foreground">#SAMPLE-001</p>
                      <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString()}</p>
                    </div>
                  </div>

                  {/* Sample Event & Client */}
                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <h3 className="font-semibold mb-2 text-sm">{language === "es" ? "Detalles del Evento" : "Event Details"}</h3>
                      <p className="font-medium">{language === "es" ? "Boda de Ejemplo" : "Sample Wedding"}</p>
                      <p className="text-sm text-muted-foreground">📅 {new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString()}</p>
                      <p className="text-sm text-muted-foreground">👥 150 {language === "es" ? "invitados" : "guests"}</p>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2 text-sm">{language === "es" ? "Cliente" : "Client"}</h3>
                      <p className="font-medium">Juan Pérez</p>
                      <p className="text-sm text-muted-foreground">cliente@ejemplo.com</p>
                    </div>
                  </div>

                  {/* Sample Items */}
                  <div className="mb-6 p-4 bg-muted/30 rounded-lg">
                    <p className="text-sm text-muted-foreground text-center">{language === "es" ? "[ Aquí aparecerían los ítems del evento ]" : "[ Event items would appear here ]"}</p>
                  </div>

                  {/* Payment Terms */}
                  {formData.payment_terms_default && (
                    <div className="mb-4 p-4 bg-muted/30 rounded-lg">
                      <p className="font-medium text-sm mb-1">{language === "es" ? "Términos de Pago" : "Payment Terms"}:</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-line">{formData.payment_terms_default}</p>
                    </div>
                  )}

                  {/* Bank Info */}
                  {formData.bank_name && (
                    <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="font-medium text-sm mb-2 flex items-center gap-2">
                        <CreditCard className="w-4 h-4" />
                        {language === "es" ? "Información para Pago" : "Payment Information"}
                      </p>
                      <div className="grid sm:grid-cols-2 gap-2 text-sm">
                        <p><span className="text-muted-foreground">{language === "es" ? "Banco" : "Bank"}:</span> {formData.bank_name}</p>
                        <p><span className="text-muted-foreground">{language === "es" ? "Cuenta" : "Account"}:</span> {formData.bank_account_number}</p>
                        {formData.bank_account_type && <p><span className="text-muted-foreground">{language === "es" ? "Tipo" : "Type"}:</span> {formData.bank_account_type === "checking" ? (language === "es" ? "Corriente" : "Checking") : (language === "es" ? "Ahorro" : "Savings")}</p>}
                        {formData.bank_beneficiary && <p><span className="text-muted-foreground">{language === "es" ? "Beneficiario" : "Beneficiary"}:</span> {formData.bank_beneficiary}</p>}
                        {formData.bank_routing_number && <p><span className="text-muted-foreground">SWIFT:</span> {formData.bank_routing_number}</p>}
                      </div>
                      {formData.bank_notes && <p className="text-xs text-muted-foreground mt-2">{formData.bank_notes}</p>}
                    </div>
                  )}

                  {/* Terms & Conditions */}
                  {(formData.terms_proposal_es || formData.terms_proposal_en) && (
                    <div className="p-4 border rounded-lg">
                      <p className="font-medium text-sm mb-2">{language === "es" ? "Términos y Condiciones" : "Terms & Conditions"}:</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-line">
                        {language === "es" ? formData.terms_proposal_es : formData.terms_proposal_en}
                      </p>
                    </div>
                  )}

                  {/* Signature Line */}
                  <div className="mt-8 pt-6 border-t flex justify-between">
                    <div className="w-48">
                      <div className="border-b border-dashed border-gray-400 mb-2 h-10"></div>
                      <p className="text-xs text-muted-foreground">{language === "es" ? "Firma del Cliente" : "Client Signature"}</p>
                    </div>
                    <div className="w-32">
                      <div className="border-b border-dashed border-gray-400 mb-2 h-10"></div>
                      <p className="text-xs text-muted-foreground">{language === "es" ? "Fecha" : "Date"}</p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-center text-muted-foreground mt-4">
                  {language === "es" 
                    ? "Esta es una vista previa. Los documentos reales incluirán los datos específicos de cada evento." 
                    : "This is a preview. Actual documents will include specific event data."}
                </p>
              </DialogContent>
            </Dialog>
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
                  {language === "es" 
                    ? `Categorías para agrupar ítems en las órdenes de ${eventsLabel.toLowerCase()} (Comida, Bebidas, Alquiler, etc.)` 
                    : `Categories to group items in ${eventsLabel.toLowerCase()} orders (Food, Drinks, Rentals, etc.)`}
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
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditCategory({...cat})} title={language === "es" ? "Editar" : "Edit"}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteCategory(cat.category_id)} title={language === "es" ? "Eliminar" : "Delete"}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
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

            {/* Edit Category Dialog */}
            <Dialog open={!!editCategory} onOpenChange={(open) => !open && setEditCategory(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{language === "es" ? "Editar Categoría" : "Edit Category"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleEditCategory} className="space-y-4">
                  <div>
                    <Label>{language === "es" ? "Nombre (EN)" : "Name (EN)"}</Label>
                    <Input 
                      value={editCategory?.name || ""} 
                      onChange={(e) => setEditCategory({ ...editCategory, name: e.target.value })} 
                      required 
                    />
                  </div>
                  <div>
                    <Label>{language === "es" ? "Nombre (ES)" : "Name (ES)"}</Label>
                    <Input 
                      value={editCategory?.name_es || ""} 
                      onChange={(e) => setEditCategory({ ...editCategory, name_es: e.target.value })} 
                    />
                  </div>
                  <div>
                    <Label>{language === "es" ? "Color" : "Color"}</Label>
                    <Input 
                      type="color" 
                      value={editCategory?.color || "#6B7280"} 
                      onChange={(e) => setEditCategory({ ...editCategory, color: e.target.value })} 
                      className="w-full h-10" 
                    />
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
                    ? "Ítems predefinidos para selección rápida. Vincula con recetas o inventario para cálculo automático de costos."
                    : "Predefined items for quick selection. Link to recipes or inventory for auto cost calculation."}
                </p>
                
                {/* Filter by Type */}
                <div className="flex gap-2 mb-4 flex-wrap">
                  <Badge 
                    variant="outline" 
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    {language === "es" ? "Todos" : "All"}
                  </Badge>
                  {itemTypes.map(itype => (
                    <Badge 
                      key={itype.type_id}
                      variant="outline" 
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      {language === "es" ? itype.name_es || itype.name : itype.name}
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
                          {itemTypes.map(it => (
                            <SelectItem key={it.type_id} value={it.type_id}>
                              {language === "es" ? it.name_es || it.name : it.name}
                            </SelectItem>
                          ))}
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
                          {itemTypes.map(it => (
                            <SelectItem key={it.type_id} value={it.type_id}>
                              {language === "es" ? it.name_es || it.name : it.name}
                            </SelectItem>
                          ))}
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

                              {/* Variants */}
                              {menu.variants?.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {menu.variants.map((variant, idx) => (
                                    <Badge 
                                      key={idx} 
                                      className={`text-xs ${variant.is_default ? 'bg-primary' : 'bg-muted text-foreground'}`}
                                    >
                                      {variant.name}: ${variant.final_price?.toFixed(2)}
                                      {variant.discount_value > 0 && (
                                        <span className="ml-1 opacity-75">
                                          ({variant.discount_type === 'percentage' ? `-${variant.discount_value}%` : `-$${variant.discount_value}`})
                                        </span>
                                      )}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              
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

                  {/* Variants Section */}
                  <div className="border rounded-lg p-4">
                    <Label className="mb-3 block">{language === "es" ? "Variantes de Precio (Gold/Silver/Bronze)" : "Price Variants (Gold/Silver/Bronze)"}</Label>
                    <p className="text-xs text-muted-foreground mb-3">
                      {language === "es" 
                        ? "Crea diferentes niveles de precio con descuentos automáticos"
                        : "Create different price tiers with automatic discounts"}
                    </p>
                    
                    {/* Add Variant Form */}
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      <Input 
                        placeholder={language === "es" ? "Nombre (ej: Gold)" : "Name (e.g., Gold)"}
                        value={newVariant.name}
                        onChange={(e) => setNewVariant({ ...newVariant, name: e.target.value })}
                      />
                      <Select 
                        value={newVariant.discount_type}
                        onValueChange={(v) => setNewVariant({ ...newVariant, discount_type: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">{language === "es" ? "% Descuento" : "% Discount"}</SelectItem>
                          <SelectItem value="fixed_amount">{language === "es" ? "$ Fijo" : "$ Fixed"}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input 
                        type="number"
                        step="0.01"
                        placeholder={newVariant.discount_type === "percentage" ? "10" : "100"}
                        value={newVariant.discount_value || ""}
                        onChange={(e) => setNewVariant({ ...newVariant, discount_value: parseFloat(e.target.value) || 0 })}
                      />
                      <Button type="button" variant="outline" onClick={addVariantToMenu} disabled={!newVariant.name}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>

                    {/* Current Variants */}
                    {newMenu.variants.length > 0 ? (
                      <div className="space-y-2">
                        {newMenu.variants.map((variant, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
                            <Badge variant={variant.is_default ? "default" : "outline"}>
                              {variant.name}
                            </Badge>
                            <span className="flex-1 text-sm">
                              {variant.discount_type === "percentage" 
                                ? `-${variant.discount_value}%`
                                : `-$${variant.discount_value}`}
                            </span>
                            <div className="flex items-center gap-2">
                              <label className="text-xs flex items-center gap-1 cursor-pointer">
                                <input 
                                  type="checkbox"
                                  checked={variant.is_default}
                                  onChange={(e) => {
                                    setNewMenu(prev => ({
                                      ...prev,
                                      variants: prev.variants.map((v, i) => ({
                                        ...v,
                                        is_default: i === idx ? e.target.checked : false
                                      }))
                                    }));
                                  }}
                                />
                                {language === "es" ? "Default" : "Default"}
                              </label>
                            </div>
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeVariantFromMenu(idx)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center py-2 text-xs text-muted-foreground">
                        {language === "es" ? "Sin variantes - precio único" : "No variants - single price"}
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
                  {language === "es" 
                    ? "Configura las plantillas de documentos, textos de encabezado/pie y campos personalizados." 
                    : "Configure document templates, header/footer text, and custom fields."}
                </p>
                
                <div className="space-y-4">
                  {documentTemplates.map((template) => {
                    const isSaving = savingTemplate === template.template_id;
                    
                    return (
                      <Card key={template.template_id} className="border" data-testid={`template-${template.template_type}`}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                                <FileText className="w-5 h-5 text-muted-foreground" />
                              </div>
                              <div>
                                <h4 className="font-medium">{template.name}</h4>
                                <p className="text-xs text-muted-foreground">{template.template_type}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch 
                                checked={template.is_active} 
                                onCheckedChange={(v) => handleUpdateTemplate(template.template_id, { ...template, is_active: v })}
                              />
                              <span className="text-xs text-muted-foreground">
                                {template.is_active ? (language === "es" ? "Activo" : "Active") : (language === "es" ? "Inactivo" : "Inactive")}
                              </span>
                              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-2 space-y-4">
                          {/* Header & Footer */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-xs">{language === "es" ? "Encabezado (EN)" : "Header (EN)"}</Label>
                              <Textarea 
                                rows={2}
                                className="text-sm"
                                placeholder={language === "es" ? "Texto de encabezado en inglés..." : "Header text in English..."}
                                value={template.header_text_en || ""}
                                onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, header_text_en: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">{language === "es" ? "Encabezado (ES)" : "Header (ES)"}</Label>
                              <Textarea 
                                rows={2}
                                className="text-sm"
                                placeholder={language === "es" ? "Texto de encabezado en español..." : "Header text in Spanish..."}
                                value={template.header_text_es || ""}
                                onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, header_text_es: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">{language === "es" ? "Pie de Página (EN)" : "Footer (EN)"}</Label>
                              <Textarea 
                                rows={2}
                                className="text-sm"
                                placeholder={language === "es" ? "Texto de pie en inglés..." : "Footer text in English..."}
                                value={template.footer_text_en || ""}
                                onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, footer_text_en: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">{language === "es" ? "Pie de Página (ES)" : "Footer (ES)"}</Label>
                              <Textarea 
                                rows={2}
                                className="text-sm"
                                placeholder={language === "es" ? "Texto de pie en español..." : "Footer text in Spanish..."}
                                value={template.footer_text_es || ""}
                                onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, footer_text_es: e.target.value })}
                              />
                            </div>
                          </div>
                          
                          {/* Section Titles (Only for Proposal template) */}
                          {template.template_type === "Proposal" && (
                            <div className="border-t pt-4">
                              <Label className="text-xs mb-3 block font-medium">
                                {language === "es" ? "Títulos de Secciones en Documentos" : "Document Section Titles"}
                              </Label>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label className="text-xs">{language === "es" ? "Sección Menú (EN)" : "Menu Section (EN)"}</Label>
                                  <Input 
                                    className="text-sm"
                                    placeholder="Custom Menu"
                                    value={template.food_section_title_en || "Custom Menu"}
                                    onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, food_section_title_en: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">{language === "es" ? "Sección Menú (ES)" : "Menu Section (ES)"}</Label>
                                  <Input 
                                    className="text-sm"
                                    placeholder="Menú Personalizado"
                                    value={template.food_section_title_es || "Menú Personalizado"}
                                    onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, food_section_title_es: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">{language === "es" ? "Sección Servicios (EN)" : "Services Section (EN)"}</Label>
                                  <Input 
                                    className="text-sm"
                                    placeholder="Services"
                                    value={template.service_section_title_en || "Services"}
                                    onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, service_section_title_en: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">{language === "es" ? "Sección Servicios (ES)" : "Services Section (ES)"}</Label>
                                  <Input 
                                    className="text-sm"
                                    placeholder="Servicios"
                                    value={template.service_section_title_es || "Servicios"}
                                    onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, service_section_title_es: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">{language === "es" ? "Sección Alquileres (EN)" : "Rentals Section (EN)"}</Label>
                                  <Input 
                                    className="text-sm"
                                    placeholder="Rentals & Equipment"
                                    value={template.rental_section_title_en || "Rentals & Equipment"}
                                    onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, rental_section_title_en: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">{language === "es" ? "Sección Alquileres (ES)" : "Rentals Section (ES)"}</Label>
                                  <Input 
                                    className="text-sm"
                                    placeholder="Alquileres y Equipos"
                                    value={template.rental_section_title_es || "Alquileres y Equipos"}
                                    onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, rental_section_title_es: e.target.value })}
                                  />
                                </div>
                              </div>
                              
                              {/* Terms & Conditions for Proposal */}
                              <div className="mt-4 pt-4 border-t">
                                <Label className="text-xs mb-3 block font-medium">
                                  {language === "es" ? "Términos y Condiciones de Propuesta" : "Proposal Terms & Conditions"}
                                </Label>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <Label className="text-xs">{language === "es" ? "Términos (EN)" : "Terms (EN)"}</Label>
                                    <Textarea 
                                      rows={3}
                                      className="text-sm"
                                      placeholder="50% deposit required to confirm booking..."
                                      value={template.terms_and_conditions_en || ""}
                                      onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, terms_and_conditions_en: e.target.value })}
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">{language === "es" ? "Términos (ES)" : "Terms (ES)"}</Label>
                                    <Textarea 
                                      rows={3}
                                      className="text-sm"
                                      placeholder="Se requiere 50% de depósito para confirmar reserva..."
                                      value={template.terms_and_conditions_es || ""}
                                      onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, terms_and_conditions_es: e.target.value })}
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">{language === "es" ? "Instrucciones de Pago (EN)" : "Payment Instructions (EN)"}</Label>
                                    <Textarea 
                                      rows={2}
                                      className="text-sm"
                                      placeholder="Please make payment to..."
                                      value={template.payment_instructions_en || ""}
                                      onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, payment_instructions_en: e.target.value })}
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">{language === "es" ? "Instrucciones de Pago (ES)" : "Payment Instructions (ES)"}</Label>
                                    <Textarea 
                                      rows={2}
                                      className="text-sm"
                                      placeholder="Por favor realice el pago a..."
                                      value={template.payment_instructions_es || ""}
                                      onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, payment_instructions_es: e.target.value })}
                                    />
                                  </div>
                                  <div className="col-span-2">
                                    <Label className="text-xs">{language === "es" ? "Datos Bancarios" : "Bank Details"}</Label>
                                    <Textarea 
                                      rows={3}
                                      className="text-sm"
                                      placeholder={language === "es" ? "Banco: XXX\nCuenta: XXX\nCLABE: XXX" : "Bank: XXX\nAccount: XXX\nRouting: XXX"}
                                      value={template.bank_details || ""}
                                      onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, bank_details: e.target.value })}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Invoice-specific settings */}
                          {template.template_type === "Invoice" && (
                            <div className="border-t pt-4">
                              <Label className="text-xs mb-3 block font-medium">
                                {language === "es" ? "Configuración de Factura" : "Invoice Settings"}
                              </Label>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label className="text-xs">{language === "es" ? "Términos y Condiciones (EN)" : "Terms & Conditions (EN)"}</Label>
                                  <Textarea 
                                    rows={3}
                                    className="text-sm"
                                    placeholder="Payment is due within 30 days..."
                                    value={template.terms_and_conditions_en || ""}
                                    onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, terms_and_conditions_en: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">{language === "es" ? "Términos y Condiciones (ES)" : "Terms & Conditions (ES)"}</Label>
                                  <Textarea 
                                    rows={3}
                                    className="text-sm"
                                    placeholder="El pago es debido dentro de 30 días..."
                                    value={template.terms_and_conditions_es || ""}
                                    onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, terms_and_conditions_es: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">{language === "es" ? "Instrucciones de Pago (EN)" : "Payment Instructions (EN)"}</Label>
                                  <Textarea 
                                    rows={2}
                                    className="text-sm"
                                    placeholder="Please make payment to..."
                                    value={template.payment_instructions_en || ""}
                                    onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, payment_instructions_en: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">{language === "es" ? "Instrucciones de Pago (ES)" : "Payment Instructions (ES)"}</Label>
                                  <Textarea 
                                    rows={2}
                                    className="text-sm"
                                    placeholder="Por favor realice el pago a..."
                                    value={template.payment_instructions_es || ""}
                                    onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, payment_instructions_es: e.target.value })}
                                  />
                                </div>
                                <div className="col-span-2">
                                  <Label className="text-xs">{language === "es" ? "Datos Bancarios" : "Bank Details"}</Label>
                                  <Textarea 
                                    rows={3}
                                    className="text-sm"
                                    placeholder={language === "es" ? "Banco: XXX\nCuenta: XXX\nCLABE: XXX" : "Bank: XXX\nAccount: XXX\nRouting: XXX"}
                                    value={template.bank_details || ""}
                                    onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, bank_details: e.target.value })}
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-4 mt-4">
                                <div className="flex items-center gap-2">
                                  <Switch 
                                    checked={template.show_logo !== false}
                                    onCheckedChange={(v) => handleUpdateTemplate(template.template_id, { ...template, show_logo: v })}
                                  />
                                  <Label className="text-xs">{language === "es" ? "Mostrar Logo" : "Show Logo"}</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Switch 
                                    checked={template.show_company_address !== false}
                                    onCheckedChange={(v) => handleUpdateTemplate(template.template_id, { ...template, show_company_address: v })}
                                  />
                                  <Label className="text-xs">{language === "es" ? "Mostrar Dirección" : "Show Address"}</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Switch 
                                    checked={template.show_tax_id !== false}
                                    onCheckedChange={(v) => handleUpdateTemplate(template.template_id, { ...template, show_tax_id: v })}
                                  />
                                  <Label className="text-xs">{language === "es" ? "Mostrar RFC/Tax ID" : "Show Tax ID"}</Label>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Packing List / Kitchen Sheet specific settings */}
                          {(template.template_type === "PackingList" || template.template_type === "KitchenSheet") && (
                            <div className="border-t pt-4">
                              <Label className="text-xs mb-3 block font-medium">
                                {language === "es" ? "Opciones de Visualización" : "Display Options"}
                              </Label>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="flex items-center gap-2">
                                  <Switch 
                                    checked={template.show_quantities !== false}
                                    onCheckedChange={(v) => handleUpdateTemplate(template.template_id, { ...template, show_quantities: v })}
                                  />
                                  <Label className="text-xs">{language === "es" ? "Mostrar Cantidades" : "Show Quantities"}</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Switch 
                                    checked={template.show_checkboxes !== false}
                                    onCheckedChange={(v) => handleUpdateTemplate(template.template_id, { ...template, show_checkboxes: v })}
                                  />
                                  <Label className="text-xs">{language === "es" ? "Mostrar Checkboxes" : "Show Checkboxes"}</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Switch 
                                    checked={template.show_notes_column !== false}
                                    onCheckedChange={(v) => handleUpdateTemplate(template.template_id, { ...template, show_notes_column: v })}
                                  />
                                  <Label className="text-xs">{language === "es" ? "Columna de Notas" : "Notes Column"}</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Switch 
                                    checked={template.group_by_category !== false}
                                    onCheckedChange={(v) => handleUpdateTemplate(template.template_id, { ...template, group_by_category: v })}
                                  />
                                  <Label className="text-xs">{language === "es" ? "Agrupar por Categoría" : "Group by Category"}</Label>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Color customization for all templates */}
                          <div className="border-t pt-4">
                            <Label className="text-xs mb-3 block font-medium">
                              {language === "es" ? "Color Principal del Documento" : "Document Primary Color"}
                            </Label>
                            <div className="flex items-center gap-3">
                              <Input 
                                type="color"
                                className="w-12 h-10 p-1 cursor-pointer"
                                value={template.primary_color || "#3A4D3F"}
                                onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, primary_color: e.target.value })}
                              />
                              <Input 
                                className="w-28 text-sm font-mono"
                                value={template.primary_color || "#3A4D3F"}
                                onChange={(e) => handleUpdateTemplate(template.template_id, { ...template, primary_color: e.target.value })}
                              />
                              <span className="text-xs text-muted-foreground">
                                {language === "es" ? "Usado en encabezados y acentos" : "Used for headers and accents"}
                              </span>
                            </div>
                          </div>
                          
                          {/* Custom Fields */}
                          {featureFlags?.is_custom_fields_enabled && (
                            <div className="border-t pt-4">
                              <Label className="text-xs mb-2 block">{language === "es" ? "Campos Personalizados" : "Custom Fields"}</Label>
                              
                              {template.custom_fields?.length > 0 ? (
                                <div className="space-y-2 mb-3">
                                  {template.custom_fields.map((field, idx) => (
                                    <div key={idx} className="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm">
                                      <Badge variant="outline" className="text-xs">{field.field_type}</Badge>
                                      <span className="flex-1">{field.label_en}</span>
                                      {field.required && <Badge variant="secondary" className="text-xs">Required</Badge>}
                                      <Badge variant={field.visibility === "Internal" ? "outline" : "default"} className="text-xs">
                                        {field.visibility}
                                      </Badge>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-6 w-6"
                                        onClick={() => {
                                          const updatedFields = template.custom_fields.filter((_, i) => i !== idx);
                                          handleUpdateTemplate(template.template_id, { ...template, custom_fields: updatedFields });
                                        }}
                                      >
                                        <Trash2 className="w-3 h-3 text-destructive" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground mb-3">
                                  {language === "es" ? "Sin campos personalizados" : "No custom fields"}
                                </p>
                              )}
                              
                              {/* Add Custom Field Form */}
                              <div className="grid grid-cols-5 gap-2">
                                <Input 
                                  placeholder="Label (EN)"
                                  className="text-sm"
                                  id={`cf-label-${template.template_id}`}
                                />
                                <Select defaultValue="Text">
                                  <SelectTrigger className="text-sm" id={`cf-type-${template.template_id}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Text">Text</SelectItem>
                                    <SelectItem value="Number">Number</SelectItem>
                                    <SelectItem value="Date">Date</SelectItem>
                                    <SelectItem value="Boolean">Boolean</SelectItem>
                                    <SelectItem value="Dropdown">Dropdown</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Select defaultValue="Client-facing">
                                  <SelectTrigger className="text-sm" id={`cf-vis-${template.template_id}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Client-facing">{clientLabel}</SelectItem>
                                    <SelectItem value="Internal">{language === "es" ? "Interno" : "Internal"}</SelectItem>
                                  </SelectContent>
                                </Select>
                                <div className="flex items-center gap-1">
                                  <Checkbox id={`cf-req-${template.template_id}`} />
                                  <Label htmlFor={`cf-req-${template.template_id}`} className="text-xs">Req</Label>
                                </div>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => {
                                    const labelInput = document.getElementById(`cf-label-${template.template_id}`);
                                    const typeSelect = document.getElementById(`cf-type-${template.template_id}`);
                                    const visSelect = document.getElementById(`cf-vis-${template.template_id}`);
                                    const reqCheck = document.getElementById(`cf-req-${template.template_id}`);
                                    
                                    const newField = {
                                      field_key: `cf_${Date.now()}`,
                                      label_en: labelInput?.value || "New Field",
                                      label_es: labelInput?.value || "Nuevo Campo",
                                      field_type: "Text",
                                      required: reqCheck?.checked || false,
                                      visibility: "Client-facing",
                                      is_active: true
                                    };
                                    
                                    const updatedFields = [...(template.custom_fields || []), newField];
                                    handleUpdateTemplate(template.template_id, { ...template, custom_fields: updatedFields });
                                    
                                    if (labelInput) labelInput.value = "";
                                  }}
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Proposal Item Types - Multi-tenant Customization */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  {language === "es" ? "Tipos de Items en Propuestas" : "Proposal Item Types"}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {language === "es" 
                    ? "Personaliza las categorías de items disponibles al crear propuestas. Cada tenant puede tener sus propios tipos."
                    : "Customize the item categories available when creating proposals. Each tenant can have their own types."}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Current Item Types */}
                <div className="space-y-2">
                  {(company?.proposal_item_types || []).map((itemType, idx) => (
                    <div key={itemType.type_key} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${itemType.color}20`, color: itemType.color }}
                      >
                        {itemType.icon === "Utensils" && <Utensils className="w-4 h-4" />}
                        {itemType.icon === "Users" && <Users className="w-4 h-4" />}
                        {itemType.icon === "Armchair" && <Package className="w-4 h-4" />}
                        {itemType.icon === "DollarSign" && <DollarSign className="w-4 h-4" />}
                        {itemType.icon === "Package" && <Package className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 grid grid-cols-3 gap-2">
                        <Input 
                          className="text-sm"
                          value={itemType.label_en}
                          onChange={(e) => {
                            const updated = [...(company?.proposal_item_types || [])];
                            updated[idx] = { ...updated[idx], label_en: e.target.value };
                            setCompany({ ...company, proposal_item_types: updated });
                          }}
                          placeholder="Label (EN)"
                        />
                        <Input 
                          className="text-sm"
                          value={itemType.label_es}
                          onChange={(e) => {
                            const updated = [...(company?.proposal_item_types || [])];
                            updated[idx] = { ...updated[idx], label_es: e.target.value };
                            setCompany({ ...company, proposal_item_types: updated });
                          }}
                          placeholder="Label (ES)"
                        />
                        <div className="flex items-center gap-2">
                          <Input 
                            type="color"
                            className="w-10 h-8 p-1 cursor-pointer"
                            value={itemType.color}
                            onChange={(e) => {
                              const updated = [...(company?.proposal_item_types || [])];
                              updated[idx] = { ...updated[idx], color: e.target.value };
                              setCompany({ ...company, proposal_item_types: updated });
                            }}
                          />
                          <Switch 
                            checked={itemType.is_active !== false}
                            onCheckedChange={(v) => {
                              const updated = [...(company?.proposal_item_types || [])];
                              updated[idx] = { ...updated[idx], is_active: v };
                              setCompany({ ...company, proposal_item_types: updated });
                            }}
                          />
                          <span className="text-xs text-muted-foreground">
                            {itemType.is_active !== false ? (language === "es" ? "Activo" : "Active") : (language === "es" ? "Inactivo" : "Inactive")}
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs font-mono">{itemType.type_key}</Badge>
                      {!["Food", "Service", "Rental", "Fee"].includes(itemType.type_key) && (
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => {
                            const updated = (company?.proposal_item_types || []).filter((_, i) => i !== idx);
                            setCompany({ ...company, proposal_item_types: updated });
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add New Item Type */}
                <div className="flex items-center gap-2 p-3 border-2 border-dashed rounded-lg">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      const newType = {
                        type_key: `custom_${Date.now()}`,
                        label_en: "New Type",
                        label_es: "Nuevo Tipo",
                        color: "#6b7280",
                        icon: "Package",
                        is_active: true,
                        sort_order: (company?.proposal_item_types || []).length
                      };
                      setCompany({ 
                        ...company, 
                        proposal_item_types: [...(company?.proposal_item_types || []), newType] 
                      });
                    }}
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {language === "es" ? "Agregar Tipo" : "Add Type"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {language === "es" 
                      ? "Los tipos estándar (Food, Service, Rental, Fee) no se pueden eliminar" 
                      : "Standard types (Food, Service, Rental, Fee) cannot be deleted"}
                  </span>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-4 border-t">
                  <Button 
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await axios.put(`${API}/settings/company`, {
                          proposal_item_types: company?.proposal_item_types || []
                        }, { withCredentials: true });
                        toast.success(language === "es" ? "Tipos de items guardados" : "Item types saved");
                      } catch (err) {
                        toast.error(err.response?.data?.detail || "Error saving");
                      }
                      setSaving(false);
                    }}
                    disabled={saving}
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {language === "es" ? "Guardar Tipos de Items" : "Save Item Types"}
                  </Button>
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
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {language === "es" ? "Formato de Hora" : "Time Format"}
                    </Label>
                    <Select value={formData.time_format || "24h"} onValueChange={(v) => setFormData({ ...formData, time_format: v })}>
                      <SelectTrigger data-testid="time-format-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24h">24h (14:00)</SelectItem>
                        <SelectItem value="12h">12h (2:00 PM)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {language === "es" 
                        ? "Afecta cómo se muestran las horas en calendarios y eventos" 
                        : "Affects how times are displayed in calendars and events"}
                    </p>
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

          {/* Import/Export Tab */}
          <TabsContent value="import-export">
            <ImportExportSection filter="business" />
          </TabsContent>

          {/* Data Admin Tab */}
          <TabsContent value="data-admin">
            <DataAdminSection language={language} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// Data Admin Section Component
function DataAdminSection({ language }) {
  const [deleting, setDeleting] = useState(null);
  const [stats, setStats] = useState({ clients: 0, leads: 0, outreach: 0, inbound: 0 });
  const [debugInfo, setDebugInfo] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const isEs = language === "es";

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    let statsData = null;
    let clientsData = null;
    let errors = [];
    
    // Try to get stats
    try {
      const statsRes = await axios.get(`${API}/crm/stats`, { withCredentials: true });
      statsData = statsRes.data;
    } catch (err) {
      errors.push(`Stats: ${err.message}`);
    }
    
    // Try to get clients - use /crm/clients endpoint
    try {
      const clientsRes = await axios.get(`${API}/crm/clients`, { withCredentials: true });
      clientsData = clientsRes.data;
    } catch (err) {
      errors.push(`Clients: ${err.message}`);
    }
    
    const clientCount = Array.isArray(clientsData) ? clientsData.length : 0;
    
    setStats({
      clients: clientCount,
      leads: statsData?.total_leads || 0,
      outreach: statsData?.outreach_leads || 0,
      inbound: statsData?.inbound_leads || 0
    });
    
    // Set debug info
    if (statsData?.debug) {
      setDebugInfo({
        your_email: statsData.debug.your_email,
        your_company_id: statsData.debug.your_company_id,
        your_clients_count: statsData.total_clients,
        your_leads_count: statsData.total_leads,
        total_clients_all_companies: statsData.debug.total_clients_all_companies,
        total_leads_all_companies: statsData.debug.total_leads_all_companies,
        clients_count_by_company: statsData.debug.clients_by_company
      });
    } else {
      // Show what we have
      setDebugInfo({
        your_email: "Pendiente de deploy backend",
        your_company_id: "Pendiente de deploy backend",
        your_clients_count: clientCount,
        your_leads_count: statsData?.total_leads || 0,
        total_clients_all_companies: statsData?.debug?.total_clients_all_companies || "N/A",
        total_leads_all_companies: statsData?.debug?.total_leads_all_companies || "N/A",
        clients_count_by_company: null,
        raw_stats: statsData
      });
    }
    
    if (errors.length > 0) {
      setFetchError(errors.join(", "));
    }
    setStatsLoaded(true);
  };

  const handleDeleteClients = async () => {
    if (!window.confirm(isEs ? "¿Estás seguro de borrar TODOS los clientes? Esta acción no se puede deshacer." : "Are you sure you want to delete ALL clients? This action cannot be undone.")) return;
    
    setDeleting("clients");
    try {
      const res = await axios.delete(`${API}/crm/clients/bulk-delete`, { withCredentials: true });
      toast.success(isEs ? `${res.data.deleted} clientes borrados` : `${res.data.deleted} clients deleted`);
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteLeads = async (type) => {
    const typeLabel = type === "outreach" ? "outreach" : type === "inbound" ? "inbound" : (isEs ? "TODOS los" : "ALL");
    if (!window.confirm(isEs ? `¿Estás seguro de borrar ${typeLabel} leads? Esta acción no se puede deshacer.` : `Are you sure you want to delete ${typeLabel} leads? This action cannot be undone.`)) return;
    
    setDeleting(`leads-${type}`);
    try {
      const res = await axios.delete(`${API}/crm/leads/bulk-delete?lead_type=${type}`, { withCredentials: true });
      toast.success(isEs ? `${res.data.deleted} leads borrados` : `${res.data.deleted} leads deleted`);
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600 flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            {isEs ? "Zona de Peligro - Borrar Datos" : "Danger Zone - Delete Data"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {isEs 
              ? "⚠️ Estas acciones son permanentes y no se pueden deshacer. Usa con precaución."
              : "⚠️ These actions are permanent and cannot be undone. Use with caution."}
          </p>

          {/* Clients Section */}
          <div className="p-4 border border-red-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{isEs ? "Clientes" : "Clients"}</h3>
                <p className="text-sm text-muted-foreground">
                  {isEs ? `${stats.clients} clientes en el sistema` : `${stats.clients} clients in the system`}
                </p>
              </div>
              <Button 
                variant="destructive" 
                onClick={handleDeleteClients}
                disabled={deleting === "clients" || stats.clients === 0}
              >
                {deleting === "clients" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                {isEs ? "Borrar Todos" : "Delete All"}
              </Button>
            </div>
          </div>

          {/* Leads Section */}
          <div className="p-4 border border-red-200 rounded-lg space-y-4">
            <div>
              <h3 className="font-semibold">{isEs ? "Leads" : "Leads"}</h3>
              <p className="text-sm text-muted-foreground">
                {isEs 
                  ? `${stats.leads} leads totales (${stats.outreach} outreach, ${stats.inbound} inbound)`
                  : `${stats.leads} total leads (${stats.outreach} outreach, ${stats.inbound} inbound)`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button 
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => handleDeleteLeads("outreach")}
                disabled={deleting?.startsWith("leads") || stats.outreach === 0}
              >
                {deleting === "leads-outreach" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                {isEs ? `Borrar Outreach (${stats.outreach})` : `Delete Outreach (${stats.outreach})`}
              </Button>
              <Button 
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => handleDeleteLeads("inbound")}
                disabled={deleting?.startsWith("leads") || stats.inbound === 0}
              >
                {deleting === "leads-inbound" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                {isEs ? `Borrar Inbound (${stats.inbound})` : `Delete Inbound (${stats.inbound})`}
              </Button>
              <Button 
                variant="destructive"
                onClick={() => handleDeleteLeads("all")}
                disabled={deleting?.startsWith("leads") || stats.leads === 0}
              >
                {deleting === "leads-all" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                {isEs ? "Borrar TODOS los Leads" : "Delete ALL Leads"}
              </Button>
            </div>
          </div>

          {/* Debug Info Section */}
          <div className="pt-4 border-t">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowDebug(!showDebug)}
              className="mb-3"
            >
              {showDebug 
                ? (isEs ? "🔼 Ocultar Diagnóstico" : "🔼 Hide Diagnostics") 
                : (isEs ? "🔽 Mostrar Diagnóstico" : "🔽 Show Diagnostics")}
            </Button>
            
            {showDebug && (
              <div className="bg-gray-50 p-4 rounded-lg text-sm font-mono space-y-2">
                {!statsLoaded ? (
                  <p className="text-gray-500">⏳ {isEs ? "Cargando datos..." : "Loading data..."}</p>
                ) : (
                  <>
                    {fetchError && (
                      <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                        <strong>{isEs ? "Errores:" : "Errors:"}</strong> {fetchError}
                      </div>
                    )}
                    
                    <p><strong>{isEs ? "Tu Email:" : "Your Email:"}</strong> {debugInfo?.your_email || "N/A"}</p>
                    <p><strong>{isEs ? "Tus Clientes:" : "Your Clients:"}</strong> {stats.clients}</p>
                    <p><strong>{isEs ? "Tus Leads:" : "Your Leads:"}</strong> {stats.leads} (Outreach: {stats.outreach}, Inbound: {stats.inbound})</p>
                    
                    {stats.clients === 0 && (
                      <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
                        <strong>⚠️ {isEs 
                          ? "Si importaste clientes pero ves 0, contacta soporte." 
                          : "If you imported clients but see 0, contact support."}</strong>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
