import { useEffect, useState, useCallback } from "react";
import { API } from "../utils/api";
import axios from "axios";
import { useLanguage } from "../contexts/LanguageContext";
import DocumentPreview from "./DocumentPreview";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { toast } from "sonner";
import { 
  Plus, Trash2, FileText, Download, Eye, Utensils, Wine, 
  Armchair, Users, Flower2, Package, GripVertical, Percent,
  DollarSign, ChevronDown, ChevronRight, Loader2, AlertTriangle, 
  Search, Send, CheckCircle, XCircle, Lock, History, TrendingUp,
  Edit, Clock, Calculator, Link2, RefreshCw, CreditCard
} from "lucide-react";


const CATEGORY_ICONS = {
  utensils: Utensils,
  wine: Wine,
  armchair: Armchair,
  users: Users,
  flower: Flower2,
  package: Package,
};

const ITEM_TYPES_DEFAULT = ["Food", "Service", "Rental", "Fee"];

const STATUS_COLORS = {
  Draft: "bg-muted text-muted-foreground",
  Sent: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  Accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  Rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export default function ProposalEditor({ eventId, event, onDocumentGenerated }) {
  const { t, language } = useLanguage();
  const [proposal, setProposal] = useState(null);
  const [categories, setCategories] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [picklist, setPicklist] = useState([]);
  const [menus, setMenus] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [featureFlags, setFeatureFlags] = useState(null);
  const [financials, setFinancials] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [generatedDocs, setGeneratedDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocType, setPreviewDocType] = useState("proposal");
  const [client, setClient] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [selectedPicklistCategory, setSelectedPicklistCategory] = useState("");
  const [picklistSearch, setPicklistSearch] = useState("");
  const [activeTab, setActiveTab] = useState("items");
  
  // Customizable item types from company settings
  const [itemTypes, setItemTypes] = useState([]);
  const ITEM_TYPES = itemTypes.length > 0 
    ? itemTypes.filter(t => t.is_active !== false).map(t => t.type_key)
    : ITEM_TYPES_DEFAULT;
  
  // Invoice dialog state
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [existingInvoices, setExistingInvoices] = useState([]);
  const [invoiceType, setInvoiceType] = useState("full"); // full, deposit, final, day
  const [selectedDays, setSelectedDays] = useState([]);
  
  // Edit invoice dialog state
  const [editInvoiceOpen, setEditInvoiceOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  
  // Document types by industry
  const [documentTypes, setDocumentTypes] = useState({ client_facing: [], internal: [], industry: "" });
  
  // Check if event is locked (Closed)
  const isLocked = event?.operational_status === "Closed";
  
  // Form state for new item
  const [newItem, setNewItem] = useState({
    item_type: "Service",
    description: "",
    category_id: "",
    quantity: 1,
    unit_price: 0,
    internal_cost: null,
    reference_id: "",
    internal_notes: "",
    event_date: "",
    section_title: "",
    section_time: "",
  });

  // Fetch all data on mount
  useEffect(() => {
    Promise.all([
      fetchProposal(),
      fetchCategories(),
      fetchTaxRates(),
      fetchPicklist(),
      fetchMenus(),
      fetchRecipes(),
      fetchFeatureFlags(),
      fetchFinancials(),
      fetchClient(),
      fetchGeneratedDocs(),
      fetchEventInvoices(),
      fetchItemTypes(),
    ]).finally(() => setLoading(false));
  }, [eventId]);

  const fetchItemTypes = async () => {
    try {
      const response = await axios.get(`${API}/settings/company`, { withCredentials: true });
      if (response.data?.proposal_item_types?.length > 0) {
        setItemTypes(response.data.proposal_item_types);
      }
    } catch (error) {
      console.error("Failed to fetch item types:", error);
    }
  };

  const getItemTypeLabel = (typeKey) => {
    const itemType = itemTypes.find(t => t.type_key === typeKey);
    if (itemType) {
      return language === "es" ? itemType.label_es : itemType.label_en;
    }
    return typeKey;
  };

  const getItemTypeColor = (typeKey) => {
    const itemType = itemTypes.find(t => t.type_key === typeKey);
    return itemType?.color || "#6b7280";
  };

  const fetchEventInvoices = async () => {
    try {
      const response = await axios.get(`${API}/business-clarity/invoices?event_id=${eventId}`, { withCredentials: true });
      setExistingInvoices(response.data || []);
    } catch (error) {
      console.error("Failed to fetch invoices:", error);
    }
  };

  const fetchClient = async () => {
    if (event?.client_id) {
      try {
        const response = await axios.get(`${API}/crm/clients/${event.client_id}`, { withCredentials: true });
        setClient(response.data);
      } catch (error) {
        console.error("Failed to fetch client:", error);
      }
    }
  };

  const fetchProposal = async () => {
    try {
      const response = await axios.get(`${API}/proposals/event/${eventId}`, { withCredentials: true });
      setProposal(response.data);
      // Expand all categories by default
      const expanded = {};
      response.data.items?.forEach(item => {
        if (item.category_id) expanded[item.category_id] = true;
        if (item.item_type) expanded[item.item_type] = true;
      });
      setExpandedCategories(expanded);
    } catch (error) {
      console.error("Failed to fetch proposal:", error);
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

  const fetchTaxRates = async () => {
    try {
      const response = await axios.get(`${API}/settings/taxes`, { withCredentials: true });
      setTaxRates(response.data);
    } catch (error) {
      console.error("Failed to fetch taxes:", error);
    }
  };

  const fetchPicklist = async () => {
    try {
      // Fetch picklist with calculated costs from recipes/inventory
      const response = await axios.get(`${API}/settings/picklist`, { withCredentials: true });
      setPicklist(response.data);
    } catch (error) {
      console.error("Failed to fetch picklist:", error);
    }
  };

  const fetchMenus = async () => {
    try {
      const response = await axios.get(`${API}/settings/menus`, { withCredentials: true });
      setMenus(response.data);
    } catch (error) {
      console.error("Failed to fetch menus:", error);
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

  const fetchFeatureFlags = async () => {
    try {
      const response = await axios.get(`${API}/settings/feature-flags`, { withCredentials: true });
      setFeatureFlags(response.data);
    } catch (error) {
      console.error("Failed to fetch feature flags:", error);
    }
  };

  const fetchFinancials = async () => {
    try {
      const response = await axios.get(`${API}/events/${eventId}/financials`, { withCredentials: true });
      setFinancials(response.data);
    } catch (error) {
      console.error("Failed to fetch financials:", error);
    }
  };

  const fetchGeneratedDocs = async () => {
    try {
      const response = await axios.get(`${API}/documents?event_id=${eventId}`, { withCredentials: true });
      setGeneratedDocs(response.data || []);
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const response = await axios.get(`${API}/audit/event/${eventId}`, { withCredentials: true });
      setAuditLogs(response.data);
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItem.description) {
      toast.error(language === "es" ? "Descripción es requerida" : "Description is required");
      return;
    }

    try {
      await axios.post(`${API}/proposals/${proposal.proposal_id}/items`, newItem, { withCredentials: true });
      toast.success(language === "es" ? "Ítem agregado" : "Item added");
      fetchProposal();
      fetchFinancials();
      setAddItemOpen(false);
      resetNewItem();
    } catch (error) {
      const msg = error.response?.data?.detail || "Failed to add item";
      toast.error(msg);
    }
  };

  const resetNewItem = () => {
    setNewItem({
      item_type: "Service",
      description: "",
      category_id: "",
      quantity: 1,
      unit_price: 0,
      internal_cost: null,
      reference_id: "",
      internal_notes: "",
      event_date: "",
      section_title: "",
      section_time: "",
    });
  };

  const handleAddMenu = async (menu, variant = null) => {
    // Add all items from the menu to the proposal
    try {
      let addedCount = 0;
      const variantLabel = variant ? ` (${variant.name})` : "";
      
      for (const item of menu.items) {
        // Calculate price with variant discount
        let itemPrice = item.unit_price || (item.calculated_price / (item.quantity || 1)) || 0;
        
        if (variant && variant.discount_value > 0) {
          if (variant.discount_type === "percentage") {
            itemPrice = itemPrice * (1 - variant.discount_value / 100);
          } else {
            // Distribute fixed discount across items
            const totalItems = menu.items.reduce((sum, i) => sum + (i.quantity || 1), 0);
            itemPrice = itemPrice - (variant.discount_value / totalItems);
          }
        }
        
        const orderItem = {
          item_type: item.picklist_item?.item_type || "Service",
          description: item.custom_name || item.picklist_item?.name || item.recipe?.name || "Item",
          quantity: item.quantity || 1,
          unit_price: Math.max(0, itemPrice),
          internal_cost: item.unit_cost || null,
          reference_id: item.recipe_id || item.picklist_item?.recipe_id || null,
          category_id: item.picklist_item?.category_id || null,
          internal_notes: `From: ${menu.name}${variantLabel}`,
        };
        await axios.post(`${API}/proposals/${proposal.proposal_id}/items`, orderItem, { withCredentials: true });
        addedCount++;
      }
      
      toast.success(
        language === "es" 
          ? `${addedCount} ítems agregados desde "${menu.name}${variantLabel}"`
          : `${addedCount} items added from "${menu.name}${variantLabel}"`
      );
      fetchProposal();
      fetchFinancials();
      setAddMenuOpen(false);
    } catch (error) {
      const msg = error.response?.data?.detail || "Failed to add menu items";
      toast.error(msg);
    }
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await axios.delete(`${API}/proposals/${proposal.proposal_id}/items/${itemId}`, { withCredentials: true });
      toast.success(language === "es" ? "Ítem eliminado" : "Item deleted");
      fetchProposal();
      fetchFinancials();
    } catch (error) {
      const msg = error.response?.data?.detail || "Failed to delete item";
      toast.error(msg);
    }
  };

  const handleUpdateFinancials = async (updates) => {
    setSaving(true);
    try {
      await axios.put(`${API}/proposals/${proposal.proposal_id}/financials`, updates, { withCredentials: true });
      toast.success(language === "es" ? "Propuesta actualizada" : "Proposal updated");
      fetchProposal();
      fetchFinancials();
    } catch (error) {
      const msg = error.response?.data?.detail || "Failed to update proposal";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      await axios.put(`${API}/proposals/${proposal.proposal_id}`, { status: newStatus }, { withCredentials: true });
      toast.success(language === "es" ? `Estado cambiado a ${newStatus}` : `Status changed to ${newStatus}`);
      fetchProposal();
      setStatusDialogOpen(false);
    } catch (error) {
      const msg = error.response?.data?.detail || "Failed to update status";
      toast.error(msg);
    }
  };

  const handleGenerateDocument = async (docType) => {
    try {
      const response = await axios.get(`${API}/event-orders/${eventId}/document/${docType}`, { withCredentials: true });
      toast.success(language === "es" ? "Documento generado" : "Document generated");
      if (onDocumentGenerated) onDocumentGenerated(response.data);
    } catch (error) {
      toast.error("Failed to generate document");
    }
  };

  // Check if multi-day event
  const isMultidayEvent = event?.end_date && event?.event_date !== event?.end_date;
  
  // Get event days for multi-day events
  const getEventDays = () => {
    if (!isMultidayEvent) return [];
    const days = [];
    const start = new Date(event.event_date);
    const end = new Date(event.end_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().split('T')[0]);
    }
    return days;
  };
  
  // Get invoiced days
  const getInvoicedDays = () => {
    return existingInvoices
      .filter(inv => inv.event_day)
      .map(inv => inv.event_day);
  };
  
  // Calculate total invoiced amount
  const getTotalInvoiced = () => {
    return existingInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  };
  
  // Check invoice eligibility
  const getInvoiceEligibility = () => {
    const total = financials?.total || 0;
    const totalInvoiced = getTotalInvoiced();
    const invoiceCount = existingInvoices.length;
    
    // Already fully invoiced
    if (totalInvoiced >= total && invoiceCount > 0) {
      return { canInvoice: false, reason: language === "es" ? "Evento ya facturado completamente" : "Event fully invoiced" };
    }
    
    // Check for full invoice
    const hasFullInvoice = existingInvoices.some(inv => inv.invoice_type === "full" || (!inv.invoice_type && inv.total >= total * 0.9));
    if (hasFullInvoice) {
      return { canInvoice: false, reason: language === "es" ? "Ya existe una factura por el total" : "Full invoice already exists" };
    }
    
    // Check deposit/final invoices
    const depositInvoices = existingInvoices.filter(inv => inv.invoice_type === "deposit");
    const finalInvoices = existingInvoices.filter(inv => inv.invoice_type === "final");
    
    if (depositInvoices.length > 0 && finalInvoices.length > 0) {
      return { canInvoice: false, reason: language === "es" ? "Ya existe depósito y factura final" : "Deposit and final invoice exist" };
    }
    
    return { canInvoice: true, reason: null };
  };

  // Open invoice dialog
  const handleOpenInvoiceDialog = () => {
    if (!proposal?.items?.length) {
      toast.error(language === "es" ? "No hay ítems para facturar" : "No items to invoice");
      return;
    }
    
    const eligibility = getInvoiceEligibility();
    if (!eligibility.canInvoice) {
      toast.error(eligibility.reason);
      return;
    }
    
    // Set default invoice type based on existing invoices
    if (existingInvoices.some(inv => inv.invoice_type === "deposit")) {
      setInvoiceType("final");
    } else {
      setInvoiceType("full");
    }
    
    setSelectedDays([]);
    setInvoiceDialogOpen(true);
  };

  // Create Invoice in Business Clarity
  const handleCreateInvoice = async () => {
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      
      let lines = [];
      let invoiceTotal = financials?.total || 0;
      let notes = "";
      
      if (invoiceType === "full") {
        // Full invoice - all items
        lines = proposal.items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percent: 0
        }));
        notes = `${language === "es" ? "Factura total del evento" : "Full event invoice"}: ${event?.name}`;
      } else if (invoiceType === "deposit") {
        // 50% deposit
        invoiceTotal = invoiceTotal * 0.5;
        lines = [{
          description: language === "es" ? `Depósito 50% - ${event?.name}` : `50% Deposit - ${event?.name}`,
          quantity: 1,
          unit_price: invoiceTotal,
          discount_percent: 0
        }];
        notes = language === "es" ? "Depósito inicial del evento" : "Initial event deposit";
      } else if (invoiceType === "final") {
        // Final balance (50%)
        const deposited = existingInvoices
          .filter(inv => inv.invoice_type === "deposit")
          .reduce((sum, inv) => sum + (inv.total || 0), 0);
        invoiceTotal = (financials?.total || 0) - deposited;
        lines = [{
          description: language === "es" ? `Saldo final - ${event?.name}` : `Final Balance - ${event?.name}`,
          quantity: 1,
          unit_price: invoiceTotal,
          discount_percent: 0
        }];
        notes = language === "es" ? "Saldo final del evento" : "Final event balance";
      } else if (invoiceType === "day" && selectedDays.length > 0) {
        // Invoice by day
        const dayItems = proposal.items.filter(item => 
          selectedDays.includes(item.event_date) || (!item.event_date && selectedDays.includes("main"))
        );
        lines = dayItems.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percent: 0
        }));
        const dayLabels = selectedDays.map(d => d === "main" ? (language === "es" ? "Principal" : "Main") : new Date(d).toLocaleDateString()).join(", ");
        notes = `${language === "es" ? "Factura por día(s)" : "Invoice for day(s)"}: ${dayLabels}`;
      }
      
      const invoiceData = {
        client_id: event?.client_id,
        event_id: eventId,
        due_date: dueDate.toISOString(),
        lines: lines,
        discount_percent: invoiceType === "full" ? (financials?.discount_percent || 0) : 0,
        tax_rate: financials?.tax_rate || 0,
        notes: notes,
        invoice_type: invoiceType,
        event_day: invoiceType === "day" ? selectedDays.join(",") : null
      };
      
      const res = await axios.post(`${API}/business-clarity/invoices`, invoiceData, { withCredentials: true });
      toast.success(
        language === "es" 
          ? `Factura ${res.data.invoice_number} creada exitosamente` 
          : `Invoice ${res.data.invoice_number} created successfully`
      );
      
      setInvoiceDialogOpen(false);
      fetchEventInvoices(); // Refresh invoices
      
      if (window.confirm(language === "es" ? "¿Desea ver la factura en Business Clarity?" : "Would you like to view the invoice in Business Clarity?")) {
        window.open("/business-clarity?tab=invoices", "_blank");
      }
    } catch (error) {
      const msg = error.response?.data?.detail || (language === "es" ? "Error al crear factura" : "Failed to create invoice");
      toast.error(msg);
    }
  };

  // Handle edit invoice - open modal with invoice data
  const handleEditInvoice = (invoice) => {
    setEditingInvoice({
      ...invoice,
      lines: invoice.lines || [],
      tax_rate: invoice.tax_rate || 0,
      discount_percent: invoice.discount_percent || 0
    });
    setEditInvoiceOpen(true);
  };

  // Save edited invoice
  const handleSaveInvoice = async () => {
    if (!editingInvoice) return;
    
    try {
      // Calculate totals
      const subtotal = (editingInvoice.lines || []).reduce(
        (sum, line) => sum + (line.quantity || 0) * (line.unit_price || 0), 0
      );
      const discountAmount = subtotal * ((editingInvoice.discount_percent || 0) / 100);
      const taxableAmount = subtotal - discountAmount;
      const taxAmount = taxableAmount * ((editingInvoice.tax_rate || 0) / 100);
      const total = taxableAmount + taxAmount;
      
      const updateData = {
        lines: editingInvoice.lines,
        subtotal: subtotal,
        discount_percent: editingInvoice.discount_percent || 0,
        discount_amount: discountAmount,
        tax_rate: editingInvoice.tax_rate || 0,
        tax_amount: taxAmount,
        total: total,
        notes: editingInvoice.notes,
        due_date: editingInvoice.due_date,
        invoice_type: editingInvoice.invoice_type
      };
      
      await axios.put(
        `${API}/finance/invoices/${editingInvoice.invoice_id}`,
        updateData,
        { withCredentials: true }
      );
      
      toast.success(language === "es" ? "Factura actualizada" : "Invoice updated");
      setEditInvoiceOpen(false);
      setEditingInvoice(null);
      fetchEventInvoices();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error updating invoice");
    }
  };

  // Update line in editing invoice
  const updateInvoiceLine = (index, field, value) => {
    if (!editingInvoice) return;
    const updatedLines = [...editingInvoice.lines];
    updatedLines[index] = { ...updatedLines[index], [field]: value };
    setEditingInvoice({ ...editingInvoice, lines: updatedLines });
  };

  // Add new line to editing invoice
  const addInvoiceLine = () => {
    if (!editingInvoice) return;
    setEditingInvoice({
      ...editingInvoice,
      lines: [...editingInvoice.lines, { description: "", quantity: 1, unit_price: 0 }]
    });
  };

  // Remove line from editing invoice
  const removeInvoiceLine = (index) => {
    if (!editingInvoice) return;
    const updatedLines = editingInvoice.lines.filter((_, i) => i !== index);
    setEditingInvoice({ ...editingInvoice, lines: updatedLines });
  };

  const handlePicklistSelect = (picklistItem) => {
    // Use pre-calculated cost from API (comes from recipe, inventory, or manual)
    let internal_cost = picklistItem.calculated_cost || picklistItem.internal_cost || null;
    let reference_id = picklistItem.recipe_id || null;
    let item_type = picklistItem.item_type || "Service";

    setNewItem({
      ...newItem,
      item_type: item_type,
      description: picklistItem.name,
      category_id: picklistItem.category_id,
      unit_price: picklistItem.default_price,
      internal_cost: internal_cost,
      reference_id: reference_id,
    });

    // Show cost info toast
    if (internal_cost && picklistItem.default_price > 0) {
      const margin = ((picklistItem.default_price - internal_cost) / picklistItem.default_price * 100);
      const source = picklistItem.cost_source || "manual";
      toast.info(
        language === "es" 
          ? `Costo: $${internal_cost.toFixed(2)} (${source}) | Margen: ${margin.toFixed(0)}%`
          : `Cost: $${internal_cost.toFixed(2)} (${source}) | Margin: ${margin.toFixed(0)}%`
      );
    }
  };

  const handleRecipeSelect = (recipe) => {
    const recipeCost = recipe.cost_per_portion || recipe.cost_per_serving || 0;
    const suggestedPrice = recipeCost * 3; // 33% food cost target
    
    setNewItem({
      ...newItem,
      item_type: "Food",
      description: recipe.name,
      category_id: "cat_food",
      unit_price: suggestedPrice,
      internal_cost: recipeCost,
      reference_id: recipe.recipe_id,
    });

    toast.info(
      language === "es" 
        ? `Costo: $${recipeCost.toFixed(2)} | Precio sugerido: $${suggestedPrice.toFixed(2)} (33% food cost)`
        : `Cost: $${recipeCost.toFixed(2)} | Suggested: $${suggestedPrice.toFixed(2)} (33% food cost)`
    );
  };

  const toggleCategory = (catId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catId]: !prev[catId]
    }));
  };

  // Group items by item_type
  const itemsByType = {};
  ITEM_TYPES.forEach(itype => {
    itemsByType[itype] = {
      items: proposal?.items?.filter(i => i.item_type === itype) || [],
      color: getItemTypeColor(itype),
      label: getItemTypeLabel(itype)
    };
  });

  const getCategoryIcon = (iconName) => {
    const IconComponent = CATEGORY_ICONS[iconName] || Package;
    return IconComponent;
  };

  const documentTypes = [
    { type: "proposal", label: language === "es" ? "Propuesta" : "Proposal", icon: "📝" },
    { type: "contract", label: language === "es" ? "Contrato" : "Contract", icon: "📄" },
    { type: "invoice", label: language === "es" ? "Factura" : "Invoice", icon: "💰" },
    { type: "kitchen_sheet", label: language === "es" ? "Hoja de Cocina" : "Kitchen Sheet", icon: "👨‍🍳" },
    { type: "mise_en_place", label: "Mise en Place", icon: "🔪" },
    { type: "packing_list", label: language === "es" ? "Lista de Montaje" : "Packing List", icon: "📦" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="proposal-editor">
      {/* Locked Banner */}
      {isLocked && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-center gap-3">
          <Lock className="w-5 h-5 text-destructive" />
          <div>
            <p className="font-medium text-destructive">
              {language === "es" ? "Evento Cerrado - Solo Lectura" : "Event Closed - Read Only"}
            </p>
            <p className="text-sm text-muted-foreground">
              {language === "es" 
                ? "Este evento está cerrado. No se pueden realizar cambios." 
                : "This event is closed. No changes can be made."}
            </p>
          </div>
        </div>
      )}

      {/* Credit Warnings */}
      {proposal?.credit_warnings?.length > 0 && (
        <div className="space-y-2" data-testid="credit-warnings">
          {proposal.credit_warnings.map((warning, idx) => (
            <div 
              key={idx}
              className={`rounded-lg p-4 flex items-center gap-3 ${
                warning.severity === "high" 
                  ? "bg-red-50 border border-red-200" 
                  : "bg-amber-50 border border-amber-200"
              }`}
            >
              <AlertTriangle className={`w-5 h-5 ${warning.severity === "high" ? "text-red-600" : "text-amber-600"}`} />
              <div className="flex-1">
                <p className={`font-medium ${warning.severity === "high" ? "text-red-700" : "text-amber-700"}`}>
                  {language === "es" ? warning.message : warning.message_en}
                </p>
                {proposal.client_credit && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {language === "es" 
                      ? `Crédito disponible: $${proposal.client_credit.available_credit.toLocaleString()} de $${proposal.client_credit.credit_limit.toLocaleString()}`
                      : `Available credit: $${proposal.client_credit.available_credit.toLocaleString()} of $${proposal.client_credit.credit_limit.toLocaleString()}`}
                  </p>
                )}
              </div>
              {proposal.client_credit && (
                <div className="text-right">
                  <p className="text-sm font-medium">
                    {proposal.client_credit.credit_percentage}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {language === "es" ? "utilizado" : "used"}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Client Credit Context (shown only when has credit but no warnings) */}
      {proposal?.client_credit && proposal?.credit_warnings?.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3" data-testid="credit-context">
          <CreditCard className="w-5 h-5 text-blue-600" />
          <div className="flex-1">
            <p className="font-medium text-blue-700">
              {language === "es" ? "Cliente con Línea de Crédito" : "Client with Credit Line"}
            </p>
            <p className="text-sm text-muted-foreground">
              {language === "es" 
                ? `Usando $${proposal.client_credit.credit_used.toLocaleString()} de $${proposal.client_credit.credit_limit.toLocaleString()} (${proposal.client_credit.credit_percentage}%)`
                : `Using $${proposal.client_credit.credit_used.toLocaleString()} of $${proposal.client_credit.credit_limit.toLocaleString()} (${proposal.client_credit.credit_percentage}%)`}
            </p>
          </div>
          <Badge className="bg-blue-600">
            ${proposal.client_credit.available_credit.toLocaleString()} {language === "es" ? "disponible" : "available"}
          </Badge>
        </div>
      )}

      {/* Compact Header - Proposal Status */}
      <div className="flex items-center justify-between py-3 border-b">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="font-mono text-xs">
            {proposal?.proposal_number}
          </Badge>
          <Badge className={`${STATUS_COLORS[proposal?.status]} px-2 py-0.5 text-xs`}>
            {proposal?.status === "Draft" && <Edit className="w-3 h-3 mr-1" />}
            {proposal?.status === "Sent" && <Send className="w-3 h-3 mr-1" />}
            {proposal?.status === "Accepted" && <CheckCircle className="w-3 h-3 mr-1" />}
            {proposal?.status === "Rejected" && <XCircle className="w-3 h-3 mr-1" />}
            {proposal?.status === "Draft" ? (language === "es" ? "Borrador" : "Draft") : 
             proposal?.status === "Sent" ? (language === "es" ? "Enviado" : "Sent") :
             proposal?.status === "Accepted" ? (language === "es" ? "Aceptado" : "Accepted") :
             proposal?.status === "Rejected" ? (language === "es" ? "Rechazado" : "Rejected") : proposal?.status}
          </Badge>
          {proposal?.status === "Accepted" && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              {language === "es" ? "Evento movido a Comprometido" : "Event moved to Committed"}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Status Change */}
          {!isLocked && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  {language === "es" ? "Cambiar Estado" : "Change Status"}
                  <ChevronDown className="w-3 h-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleStatusChange("Draft")}>
                  <Edit className="w-4 h-4 mr-2" /> {language === "es" ? "Borrador" : "Draft"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("Sent")}>
                  <Send className="w-4 h-4 mr-2" /> {language === "es" ? "Enviado" : "Sent"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("Accepted")} className="text-green-600">
                  <CheckCircle className="w-4 h-4 mr-2" /> {language === "es" ? "Aceptado (→ Comprometido)" : "Accepted (→ Committed)"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange("Rejected")} className="text-red-600">
                  <XCircle className="w-4 h-4 mr-2" /> {language === "es" ? "Rechazado" : "Rejected"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Audit History */}
          <Button 
            variant="ghost" 
            size="sm"
            className="h-8 text-xs"
            onClick={() => { fetchAuditLogs(); setHistoryOpen(true); }}
          >
            <History className="w-3 h-3 mr-1" />
            {language === "es" ? "Historial" : "History"}
          </Button>
        </div>
      </div>

      {/* Main Content - Single View (no nested tabs) */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="items" className="gap-1.5 text-xs h-7" data-testid="tab-items">
            <Package className="w-3.5 h-3.5" />
            {language === "es" ? "Ítems" : "Items"} ({proposal?.items?.length || 0})
          </TabsTrigger>
          {featureFlags?.is_margin_tracking_enabled && (
            <TabsTrigger value="financials" className="gap-1.5 text-xs h-7" data-testid="tab-financials">
              <Calculator className="w-3.5 h-3.5" />
              {language === "es" ? "Finanzas" : "Financials"}
            </TabsTrigger>
          )}
          <TabsTrigger value="generate" className="gap-1.5 text-xs h-7" data-testid="tab-generate">
            <FileText className="w-3.5 h-3.5" />
            {language === "es" ? "Generar" : "Generate"}
          </TabsTrigger>
        </TabsList>

        {/* Items Tab */}
        <TabsContent value="items" className="space-y-4">
          {/* Add Item / Menu Buttons */}
          {!isLocked && (
            <div className="flex justify-end gap-2">
              {menus.length > 0 && (
                <Button variant="outline" onClick={() => setAddMenuOpen(true)} className="gap-2" data-testid="add-menu-btn">
                  <Package className="w-4 h-4" />
                  {language === "es" ? "Agregar Menú" : "Add Menu"}
                </Button>
              )}
              <Button onClick={() => setAddItemOpen(true)} className="gap-2" data-testid="add-item-btn">
                <Plus className="w-4 h-4" />
                {language === "es" ? "Agregar Ítem" : "Add Item"}
              </Button>
            </div>
          )}

          {/* Items by Type */}
          {ITEM_TYPES.map(itype => {
            const typeData = itemsByType[itype];
            if (typeData.items.length === 0) return null;
            
            const isExpanded = expandedCategories[itype];
            const typeTotal = typeData.items.reduce((sum, item) => sum + (item.total_price || 0), 0);
            const typeCost = typeData.items.reduce((sum, item) => sum + (item.total_cost || 0), 0);
            const typeMargin = typeTotal - typeCost;

            return (
              <Card key={itype} data-testid={`type-${itype}`}>
                <CardHeader 
                  className="cursor-pointer hover:bg-muted/50 transition-colors py-3"
                  onClick={() => toggleCategory(itype)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      )}
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${typeData.color}20` }}
                      >
                        {itype === "Food" && <Utensils className="w-4 h-4" style={{ color: typeData.color }} />}
                        {itype === "Service" && <Users className="w-4 h-4" style={{ color: typeData.color }} />}
                        {itype === "Rental" && <Armchair className="w-4 h-4" style={{ color: typeData.color }} />}
                        {itype === "Fee" && <DollarSign className="w-4 h-4" style={{ color: typeData.color }} />}
                        {!["Food", "Service", "Rental", "Fee"].includes(itype) && <Package className="w-4 h-4" style={{ color: typeData.color }} />}
                      </div>
                      <div>
                        <CardTitle className="text-base font-medium">{typeData.label || itype}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {typeData.items.length} {language === "es" ? "ítems" : "items"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {featureFlags?.is_margin_tracking_enabled && typeCost > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {language === "es" ? "Margen" : "Margin"}: ${typeMargin.toFixed(2)}
                        </span>
                      )}
                      <Badge variant="outline" className="font-mono">
                        ${typeTotal.toFixed(2)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                
                {isExpanded && (
                  <CardContent className="pt-0">
                    <div className="border rounded-lg divide-y">
                      {typeData.items.map((item) => (
                        <div 
                          key={item.item_id} 
                          className="flex items-center gap-4 p-3 hover:bg-muted/30 transition-colors"
                          data-testid={`order-item-${item.item_id}`}
                        >
                          <GripVertical className="w-4 h-4 text-muted-foreground/50" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{item.description}</p>
                            {item.internal_notes && (
                              <p className="text-xs text-warning mt-1 italic">
                                📝 {item.internal_notes}
                              </p>
                            )}
                            {/* Margin indicator for admins */}
                            {featureFlags?.is_margin_tracking_enabled && item.internal_cost !== null && (
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-xs ${item.margin_percentage < 20 ? 'text-destructive' : item.margin_percentage > 50 ? 'text-success' : 'text-muted-foreground'}`}>
                                  {language === "es" ? "Margen" : "Margin"}: {item.margin_percentage?.toFixed(0)}%
                                </span>
                                {item.internal_cost === null && (
                                  <Badge variant="outline" className="text-xs text-warning">
                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                    {language === "es" ? "Sin costo" : "No cost"}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-sm">
                              {item.quantity} × ${item.unit_price?.toFixed(2)}
                            </p>
                            {featureFlags?.is_margin_tracking_enabled && item.internal_cost !== null && (
                              <p className="text-xs text-muted-foreground">
                                {language === "es" ? "Costo" : "Cost"}: ${(item.internal_cost * item.quantity).toFixed(2)}
                              </p>
                            )}
                          </div>
                          <p className="font-medium w-24 text-right">
                            ${item.total_price?.toFixed(2)}
                          </p>
                          {!isLocked && (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteItem(item.item_id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}

          {/* Empty State */}
          {(!proposal?.items || proposal.items.length === 0) && (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  {language === "es" 
                    ? "No hay ítems en esta propuesta. Agrega ítems para comenzar." 
                    : "No items in this proposal. Add items to get started."}
                </p>
                {!isLocked && (
                  <Button onClick={() => setAddItemOpen(true)} className="mt-4 gap-2">
                    <Plus className="w-4 h-4" />
                    {language === "es" ? "Agregar Primer Ítem" : "Add First Item"}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Order Summary */}
          {proposal?.items?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {language === "es" ? "Resumen" : "Summary"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{language === "es" ? "Subtotal" : "Subtotal"}</span>
                  <span className="font-mono">${proposal.subtotal?.toFixed(2) || "0.00"}</span>
                </div>

                {/* Discount with type selector */}
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Percent className="w-4 h-4" />
                    {language === "es" ? "Descuento" : "Discount"}
                  </span>
                  <div className="flex-1 flex justify-end items-center gap-2">
                    <Select
                      value={proposal.discount_type || "fixed"}
                      disabled={isLocked}
                      onValueChange={(type) => {
                        setProposal({ ...proposal, discount_type: type });
                        handleUpdateFinancials({ 
                          discount_type: type, 
                          discount_value: proposal.discount_value || 0,
                          tax_ids: proposal.tax_details?.map(t => t.tax_id) || []
                        });
                      }}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">$</SelectItem>
                        <SelectItem value="percentage">%</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-24 text-right"
                      value={proposal.discount_value || 0}
                      disabled={isLocked}
                      onChange={(e) => setProposal({ ...proposal, discount_value: parseFloat(e.target.value) || 0 })}
                      onBlur={() => handleUpdateFinancials({ 
                        discount_type: proposal.discount_type || "fixed",
                        discount_value: proposal.discount_value || 0,
                        tax_ids: proposal.tax_details?.map(t => t.tax_id) || []
                      })}
                    />
                    {proposal.discount_amount > 0 && (
                      <span className="text-sm text-muted-foreground w-24 text-right">
                        -${proposal.discount_amount?.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Taxes */}
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    {language === "es" ? "Impuestos" : "Taxes"}
                  </span>
                  <div className="flex-1 flex justify-end items-center gap-2">
                    <Select
                      value={proposal.tax_details?.[0]?.tax_id || "none"}
                      disabled={isLocked}
                      onValueChange={(taxId) => handleUpdateFinancials({ 
                        tax_ids: taxId === "none" ? [] : [taxId],
                        discount_type: proposal.discount_type || "fixed",
                        discount_value: proposal.discount_value || 0
                      })}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder={language === "es" ? "Seleccionar impuesto" : "Select tax"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{language === "es" ? "Sin impuesto" : "No tax"}</SelectItem>
                        {taxRates.map(tax => (
                          <SelectItem key={tax.tax_id} value={tax.tax_id}>
                            {tax.name} ({tax.rate}%)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="font-mono w-24 text-right">
                      ${proposal.total_tax?.toFixed(2) || "0.00"}
                    </span>
                  </div>
                </div>

                <div className="border-t pt-4 flex justify-between items-center">
                  <span className="font-semibold text-lg">{language === "es" ? "Total" : "Total"}</span>
                  <span className="font-heading text-2xl font-bold">
                    ${proposal.total?.toFixed(2) || "0.00"}
                  </span>
                </div>

                {/* Client Notes */}
                <div className="border-t pt-4">
                  <Label className="mb-2 block">
                    {language === "es" ? "Notas para el Cliente" : "Client Notes"}
                  </Label>
                  <Textarea
                    placeholder={language === "es" ? "Notas visibles en propuestas y facturas..." : "Notes visible on proposals and invoices..."}
                    value={proposal.client_notes || ""}
                    disabled={isLocked}
                    onChange={(e) => setProposal({ ...proposal, client_notes: e.target.value })}
                    onBlur={() => handleUpdateFinancials({ client_notes: proposal.client_notes })}
                    rows={2}
                  />
                </div>

                {/* Payment Terms */}
                <div>
                  <Label className="mb-2 block">
                    {language === "es" ? "Términos de Pago" : "Payment Terms"}
                  </Label>
                  <Input
                    placeholder={language === "es" ? "ej: 50% anticipo, 50% día del evento" : "e.g., 50% deposit, 50% on event day"}
                    value={proposal.payment_terms || ""}
                    disabled={isLocked}
                    onChange={(e) => setProposal({ ...proposal, payment_terms: e.target.value })}
                    onBlur={() => handleUpdateFinancials({ payment_terms: proposal.payment_terms })}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Financials Tab (Internal) */}
        {featureFlags?.is_margin_tracking_enabled && (
          <TabsContent value="financials" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  {language === "es" ? "Finanzas Internas" : "Internal Financials"}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {language === "es" ? "Solo visible para administradores" : "Admin/Owner only"}
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Summary Cards */}
                <div className="grid sm:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">{language === "es" ? "Ingresos" : "Revenue"}</p>
                      <p className="text-2xl font-bold text-foreground">${financials?.total_revenue?.toFixed(2) || "0.00"}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">{language === "es" ? "Costo" : "Cost"}</p>
                      <p className="text-2xl font-bold text-muted-foreground">${financials?.total_cost?.toFixed(2) || "0.00"}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">{language === "es" ? "Margen Bruto" : "Gross Margin"}</p>
                      <p className={`text-2xl font-bold ${financials?.margin_percentage < 20 ? 'text-destructive' : 'text-success'}`}>
                        ${financials?.gross_margin?.toFixed(2) || "0.00"}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">{language === "es" ? "% Margen" : "Margin %"}</p>
                      <p className={`text-2xl font-bold ${financials?.margin_percentage < 20 ? 'text-destructive' : financials?.margin_percentage > 40 ? 'text-success' : 'text-warning'}`}>
                        {financials?.margin_percentage?.toFixed(1) || "0.0"}%
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* By Item Type */}
                {financials?.by_item_type && Object.keys(financials.by_item_type).length > 0 && (
                  <div>
                    <h3 className="font-medium mb-3">{language === "es" ? "Por Tipo de Ítem" : "By Item Type"}</h3>
                    <div className="border rounded-lg divide-y">
                      {Object.entries(financials.by_item_type).map(([itype, data]) => (
                        <div key={itype} className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-3">
                            {itype === "Food" && <Utensils className="w-4 h-4" style={{ color: getItemTypeColor(itype) }} />}
                            {itype === "Service" && <Users className="w-4 h-4" style={{ color: getItemTypeColor(itype) }} />}
                            {itype === "Rental" && <Armchair className="w-4 h-4" style={{ color: getItemTypeColor(itype) }} />}
                            {itype === "Fee" && <DollarSign className="w-4 h-4" style={{ color: getItemTypeColor(itype) }} />}
                            {!["Food", "Service", "Rental", "Fee"].includes(itype) && <Package className="w-4 h-4" style={{ color: getItemTypeColor(itype) }} />}
                            <span className="font-medium">{getItemTypeLabel(itype)}</span>
                            <span className="text-sm text-muted-foreground">({data.count} items)</span>
                          </div>
                          <div className="flex items-center gap-6 text-sm">
                            <span>{language === "es" ? "Ingresos" : "Revenue"}: ${data.revenue?.toFixed(2)}</span>
                            <span className="text-muted-foreground">{language === "es" ? "Costo" : "Cost"}: ${data.cost?.toFixed(2)}</span>
                            <span className={data.margin < 0 ? 'text-destructive' : 'text-success'}>
                              {language === "es" ? "Margen" : "Margin"}: ${data.margin?.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {financials?.warnings?.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-3 flex items-center gap-2 text-warning">
                      <AlertTriangle className="w-4 h-4" />
                      {language === "es" ? "Alertas" : "Warnings"}
                    </h3>
                    <div className="space-y-2">
                      {financials.warnings.map((warning, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-3 bg-warning/10 rounded-lg text-sm">
                          <AlertTriangle className="w-4 h-4 text-warning" />
                          <span>{warning.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Documents Tab */}
        <TabsContent value="generate" className="space-y-4">
          {/* Generated Documents History */}
          {generatedDocs.length > 0 && (
            <Card className="border-green-200 bg-green-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="w-4 h-4 text-green-600" />
                  {language === "es" ? "Documentos Generados" : "Generated Documents"} ({generatedDocs.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {generatedDocs.slice(0, 5).map((doc) => (
                    <div key={doc.document_id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">{doc.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">{doc.document_type}</Badge>
                            {doc.status === "signed" && (
                              <Badge className="bg-green-100 text-green-700 text-xs">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                {language === "es" ? "Firmado" : "Signed"}
                              </Badge>
                            )}
                            {doc.status === "sent" && (
                              <Badge className="bg-blue-100 text-blue-700 text-xs">
                                <Send className="w-3 h-3 mr-1" />
                                {language === "es" ? "Enviado" : "Sent"}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {new Date(doc.created_at).toLocaleDateString(language === "es" ? "es-ES" : "en-US")}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* View Document */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(`/portal/${doc.document_id}`, '_blank')}
                          title={language === "es" ? "Ver documento" : "View document"}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {/* Copy Link */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/portal/${doc.document_id}`);
                            toast.success(language === "es" ? "Enlace copiado" : "Link copied");
                          }}
                          title={language === "es" ? "Copiar enlace" : "Copy link"}
                        >
                          <Link2 className="w-4 h-4" />
                        </Button>
                        {/* Send to Client - for contracts and quotes that are not yet signed */}
                        {(doc.document_type === "contract" || doc.document_type === "quote") && doc.status !== "signed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                const res = await axios.post(`${API}/documents/${doc.document_id}/send`, {}, { withCredentials: true });
                                toast.success(
                                  language === "es" 
                                    ? `Documento enviado a ${res.data.sent_to}` 
                                    : `Document sent to ${res.data.sent_to}`
                                );
                                fetchGeneratedDocs();
                              } catch (error) {
                                toast.error(error.response?.data?.detail || (language === "es" ? "Error al enviar" : "Error sending"));
                              }
                            }}
                            title={language === "es" ? "Enviar al cliente" : "Send to client"}
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            data-testid={`send-doc-${doc.document_id}`}
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                        )}
                        {/* Regenerate (only if not signed) */}
                        {doc.status !== "signed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                await axios.post(`${API}/documents/${doc.document_id}/regenerate`, {}, { withCredentials: true });
                                toast.success(language === "es" ? "Documento regenerado" : "Document regenerated");
                                fetchGeneratedDocs();
                              } catch (error) {
                                toast.error(error.response?.data?.detail || "Error regenerating");
                              }
                            }}
                            title={language === "es" ? "Regenerar con cambios actuales" : "Regenerate with current changes"}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <History className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {generatedDocs.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    +{generatedDocs.length - 5} {language === "es" ? "más" : "more"}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {language === "es" ? "Generar Nuevo Documento" : "Generate New Document"}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {language === "es" 
                  ? "Previsualiza e imprime documentos generados desde esta propuesta" 
                  : "Preview and print documents generated from this proposal"}
              </p>
            </CardHeader>
            <CardContent>
              {/* Existing Invoices */}
              {existingInvoices.length > 0 && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <h4 className="font-medium text-amber-800 mb-2 flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    {language === "es" ? "Facturas Existentes" : "Existing Invoices"} ({existingInvoices.length})
                  </h4>
                  <div className="space-y-2">
                    {existingInvoices.map(inv => (
                      <div key={inv.invoice_id} className="flex items-center justify-between text-sm bg-white p-2 rounded border border-amber-100">
                        <div>
                          <span className="font-medium">{inv.invoice_number}</span>
                          <span className="text-muted-foreground ml-2">
                            {inv.invoice_type === "deposit" ? (language === "es" ? "Depósito" : "Deposit") : inv.invoice_type === "final" ? (language === "es" ? "Final" : "Final") : (language === "es" ? "Total" : "Full")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono">${(inv.total || 0).toFixed(2)}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditInvoice(inv)}
                            title={language === "es" ? "Editar factura" : "Edit invoice"}
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-amber-300 flex justify-between font-medium">
                      <span>{language === "es" ? "Total Facturado" : "Total Invoiced"}</span>
                      <span className="font-mono">${getTotalInvoiced().toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Proposal/Contract */}
                <Button
                  variant="outline"
                  className="h-auto py-6 flex flex-col items-center gap-3 hover:border-primary"
                  onClick={() => { setPreviewDocType("proposal"); setPreviewOpen(true); }}
                  disabled={!proposal?.items?.length}
                >
                  <FileText className="w-8 h-8 text-blue-500" />
                  <span className="font-medium">{language === "es" ? "Propuesta / Contrato" : "Proposal / Contract"}</span>
                  <span className="text-xs text-muted-foreground">{language === "es" ? "Con precios" : "With prices"}</span>
                </Button>

                {/* Invoice Preview */}
                <Button
                  variant="outline"
                  className="h-auto py-6 flex flex-col items-center gap-3 hover:border-primary"
                  onClick={() => { setPreviewDocType("invoice"); setPreviewOpen(true); }}
                  disabled={!proposal?.items?.length}
                >
                  <Eye className="w-8 h-8 text-green-500" />
                  <span className="font-medium">{language === "es" ? "Vista Previa Factura" : "Invoice Preview"}</span>
                  <span className="text-xs text-muted-foreground">{language === "es" ? "Solo vista" : "View only"}</span>
                </Button>

                {/* Create Invoice - Business Clarity */}
                <Button
                  variant="outline"
                  className="h-auto py-6 flex flex-col items-center gap-3 hover:border-primary hover:bg-green-50 border-green-200"
                  onClick={handleOpenInvoiceDialog}
                  disabled={!proposal?.items?.length || !event?.client_id || !getInvoiceEligibility().canInvoice}
                  data-testid="create-invoice-btn"
                >
                  <DollarSign className="w-8 h-8 text-green-600" />
                  <span className="font-medium text-green-700">{language === "es" ? "Crear Factura" : "Create Invoice"}</span>
                  <span className="text-xs text-green-600">{language === "es" ? "Business Clarity" : "Business Clarity"}</span>
                </Button>
              </div>

              {/* Note about operational documents */}
              <p className="text-xs text-muted-foreground mt-4 text-center">
                {language === "es" 
                  ? "Documentos operativos (Hoja de Cocina, Lista de Montaje, Menú) disponibles en Event Orchestration"
                  : "Operational documents (Kitchen Sheet, Packing List, Menu) available in Event Orchestration"}
              </p>
              
              {!proposal?.items?.length && (
                <p className="text-sm text-muted-foreground text-center mt-4">
                  {language === "es" 
                    ? "Agrega ítems para poder generar documentos" 
                    : "Add items to generate documents"}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Document Preview Modal */}
      {previewOpen && (
        <DocumentPreview
          eventId={eventId}
          event={event}
          proposal={proposal}
          client={client}
          documentType={previewDocType}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {/* Add Item Dialog */}
      <Dialog open={addItemOpen} onOpenChange={(open) => {
        setAddItemOpen(open);
        if (!open) {
          setSelectedPicklistCategory("");
          setPicklistSearch("");
          resetNewItem();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {language === "es" ? "Agregar Ítem" : "Add Item"}
            </DialogTitle>
          </DialogHeader>
          
          {/* Category Tabs for Picklist */}
          {picklist.length > 0 && (
            <div className="mb-4 border rounded-lg p-4 bg-muted/30">
              <Label className="mb-3 block text-sm font-medium">
                {language === "es" ? "Selección Rápida" : "Quick Select"}
              </Label>
              
              {/* Search */}
              <Input
                placeholder={language === "es" ? "Buscar ítem..." : "Search item..."}
                value={picklistSearch}
                onChange={(e) => setPicklistSearch(e.target.value)}
                className="mb-3"
              />

              {/* Filtered Items */}
              <div className="max-h-40 overflow-y-auto space-y-1">
                {picklist
                  .filter(item => {
                    const matchesSearch = !picklistSearch || item.name.toLowerCase().includes(picklistSearch.toLowerCase());
                    return matchesSearch;
                  })
                  .slice(0, 10)
                  .map(item => (
                    <div
                      key={item.item_id}
                      className="flex items-center justify-between p-2 rounded-md hover:bg-background cursor-pointer border border-transparent hover:border-border"
                      onClick={() => {
                        handlePicklistSelect(item);
                        setPicklistSearch("");
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        {item.recipe_id && (
                          <Badge variant="outline" className="text-xs">Food</Badge>
                        )}
                      </div>
                      <span className="text-sm font-mono">${item.default_price.toFixed(2)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Recipes Section (for food items) - Only show DISH/final_dish recipes for sales */}
          {featureFlags?.is_food_ops_enabled && recipes.length > 0 && (
            <div className="mb-4">
              <Label className="mb-2 block text-sm">
                {language === "es" ? "Desde Receta (con cálculo de costo)" : "From Recipe (with cost calculation)"}
              </Label>
              <Select onValueChange={(id) => {
                const recipe = recipes.find(r => r.recipe_id === id);
                if (recipe) handleRecipeSelect(recipe);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder={language === "es" ? "Seleccionar receta..." : "Select recipe..."} />
                </SelectTrigger>
                <SelectContent>
                  {recipes
                    .filter(recipe => recipe.recipe_type === "final_dish" || recipe.recipe_type === "dish")
                    .map(recipe => (
                      <SelectItem key={recipe.recipe_id} value={recipe.recipe_id}>
                        {recipe.name} - ${(recipe.cost_per_portion || recipe.cost_per_serving || 0).toFixed(2)} {language === "es" ? "costo" : "cost"}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Divider */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                {language === "es" ? "O agregar manualmente" : "Or add manually"}
              </span>
            </div>
          </div>

          <form onSubmit={handleAddItem} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Item Type */}
              <div>
                <Label>{language === "es" ? "Tipo" : "Type"} *</Label>
                <Select 
                  value={newItem.item_type} 
                  onValueChange={(v) => setNewItem({ ...newItem, item_type: v })}
                >
                  <SelectTrigger data-testid="item-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ITEM_TYPES.map(itype => (
                      <SelectItem key={itype} value={itype}>{getItemTypeLabel(itype)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Category */}
              <div>
                <Label>{language === "es" ? "Categoría" : "Category"}</Label>
                <Select 
                  value={newItem.category_id || "none"} 
                  onValueChange={(v) => setNewItem({ ...newItem, category_id: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={language === "es" ? "Opcional" : "Optional"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{language === "es" ? "Sin categoría" : "No category"}</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.category_id} value={cat.category_id}>
                        {language === "es" ? cat.name_es || cat.name : cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="col-span-2">
                <Label>{language === "es" ? "Descripción" : "Description"} *</Label>
                <Textarea
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  placeholder={language === "es" ? "Descripción visible al cliente" : "Client-facing description"}
                  rows={2}
                  required
                  data-testid="item-description-input"
                />
              </div>

              {/* Quantity */}
              <div>
                <Label>{language === "es" ? "Cantidad" : "Quantity"}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newItem.quantity}
                  onChange={(e) => setNewItem({ ...newItem, quantity: parseFloat(e.target.value) || 1 })}
                  data-testid="item-quantity-input"
                />
              </div>

              {/* Unit Price */}
              <div>
                <Label>{language === "es" ? "Precio Unitario" : "Unit Price"}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newItem.unit_price}
                  onChange={(e) => setNewItem({ ...newItem, unit_price: parseFloat(e.target.value) || 0 })}
                  data-testid="item-price-input"
                />
              </div>

              {/* Internal Cost (if margin tracking enabled) */}
              {featureFlags?.is_margin_tracking_enabled && (
                <div>
                  <Label>{language === "es" ? "Costo Interno" : "Internal Cost"}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newItem.internal_cost || ""}
                    onChange={(e) => setNewItem({ ...newItem, internal_cost: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder={language === "es" ? "Oculto al cliente" : "Hidden from client"}
                  />
                  {newItem.internal_cost !== null && newItem.unit_price > 0 && (
                    <p className={`text-xs mt-1 ${((newItem.unit_price - newItem.internal_cost) / newItem.unit_price * 100) < 20 ? 'text-destructive' : 'text-success'}`}>
                      {language === "es" ? "Margen" : "Margin"}: {((newItem.unit_price - newItem.internal_cost) / newItem.unit_price * 100).toFixed(0)}%
                    </p>
                  )}
                </div>
              )}

              {/* Event Date - For multi-day events */}
              <div>
                <Label>{language === "es" ? "Día del Evento" : "Event Day"}</Label>
                {event?.end_date && event?.event_date !== event?.end_date ? (
                  <Select 
                    value={newItem.event_date || "main"} 
                    onValueChange={(v) => setNewItem({ ...newItem, event_date: v === "main" ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={language === "es" ? "Seleccionar día..." : "Select day..."} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="main">{language === "es" ? "Todos los días" : "All days"}</SelectItem>
                      {(() => {
                        // Generate dates between event_date and end_date
                        const dates = [];
                        const start = new Date(event.event_date);
                        const end = new Date(event.end_date);
                        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                          const dateStr = d.toISOString().split('T')[0];
                          const displayDate = d.toLocaleDateString(language === "es" ? "es" : "en", { weekday: "short", month: "short", day: "numeric" });
                          dates.push({ value: dateStr, label: displayDate });
                        }
                        return dates.map(d => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type="date"
                    value={newItem.event_date}
                    onChange={(e) => setNewItem({ ...newItem, event_date: e.target.value })}
                    placeholder={language === "es" ? "Opcional" : "Optional"}
                  />
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {language === "es" ? "Para eventos de varios días" : "For multi-day events"}
                </p>
              </div>

              {/* Internal Notes */}
              <div className="col-span-2">
                <Label>{language === "es" ? "Notas Internas" : "Internal Notes"}</Label>
                <Textarea
                  value={newItem.internal_notes}
                  onChange={(e) => setNewItem({ ...newItem, internal_notes: e.target.value })}
                  placeholder={language === "es" ? "Notas para cocina/montaje (no visibles al cliente)" : "Notes for kitchen/setup (not visible to client)"}
                  rows={2}
                />
              </div>

              {/* Section Title & Time - for grouping items in proposal */}
              <div className="col-span-2 border-t pt-4 mt-2">
                <p className="text-xs text-muted-foreground mb-3">
                  {language === "es" 
                    ? "Opcional: Agrupa este ítem bajo un título personalizado en la propuesta"
                    : "Optional: Group this item under a custom title in the proposal"}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{language === "es" ? "Título de Sección" : "Section Title"}</Label>
                    <Input
                      value={newItem.section_title}
                      onChange={(e) => setNewItem({ ...newItem, section_title: e.target.value })}
                      placeholder={language === "es" ? "Ej: Cóctel de Bienvenida" : "E.g: Welcome Cocktail"}
                    />
                  </div>
                  <div>
                    <Label>{language === "es" ? "Hora de Servicio" : "Service Time"}</Label>
                    <Input
                      type="time"
                      value={newItem.section_time}
                      onChange={(e) => setNewItem({ ...newItem, section_time: e.target.value })}
                      placeholder="18:30"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setAddItemOpen(false)}>
                {language === "es" ? "Cancelar" : "Cancel"}
              </Button>
              <Button type="submit" data-testid="save-item-btn">
                {language === "es" ? "Agregar Ítem" : "Add Item"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Audit History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              {language === "es" ? "Historial de Cambios" : "Change History"}
            </DialogTitle>
          </DialogHeader>
          
          {auditLogs.length > 0 ? (
            <div className="space-y-3">
              {auditLogs.map((log) => (
                <div key={log.log_id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {log.action_type === "add_item" && <Plus className="w-4 h-4 text-success" />}
                      {log.action_type === "remove_item" && <Trash2 className="w-4 h-4 text-destructive" />}
                      {log.action_type === "edit_item" && <Edit className="w-4 h-4 text-warning" />}
                      {log.action_type === "status_change" && <CheckCircle className="w-4 h-4 text-info" />}
                      {log.action_type === "event_closed" && <Lock className="w-4 h-4 text-muted-foreground" />}
                      <span className="font-medium capitalize">
                        {log.action_type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {log.user_name}
                  </p>
                  {log.item_description && (
                    <p className="text-sm mt-1">{log.item_description}</p>
                  )}
                  {log.impact_on_total !== undefined && log.impact_on_total !== 0 && (
                    <Badge variant="outline" className={`mt-2 ${log.impact_on_total > 0 ? 'text-success' : 'text-destructive'}`}>
                      {log.impact_on_total > 0 ? '+' : ''}${log.impact_on_total.toFixed(2)}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{language === "es" ? "No hay cambios registrados" : "No changes recorded"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Menu Dialog */}
      <Dialog open={addMenuOpen} onOpenChange={setAddMenuOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              {language === "es" ? "Seleccionar Menú / Paquete" : "Select Menu / Package"}
            </DialogTitle>
          </DialogHeader>
          
          <p className="text-sm text-muted-foreground mb-4">
            {language === "es" 
              ? "Selecciona un menú para agregar todos sus ítems a la propuesta de una vez."
              : "Select a menu to add all its items to the proposal at once."}
          </p>

          {menus.length > 0 ? (
            <div className="space-y-3">
              {menus.map((menu) => (
                <Card 
                  key={menu.menu_id} 
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleAddMenu(menu)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold">{language === "es" && menu.name_es ? menu.name_es : menu.name}</h4>
                          <Badge variant="outline" className="text-xs">{menu.menu_type}</Badge>
                          <Badge variant="secondary" className="text-xs">{menu.items?.length || 0} {language === "es" ? "ítems" : "items"}</Badge>
                        </div>
                        {menu.description && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {language === "es" && menu.description_es ? menu.description_es : menu.description}
                          </p>
                        )}
                        {/* Items preview */}
                        <div className="flex flex-wrap gap-1 mb-2">
                          {menu.items?.slice(0, 4).map((item, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {item.custom_name || item.picklist_item?.name || item.recipe?.name || "Item"}
                              {item.quantity > 1 && ` ×${item.quantity}`}
                            </Badge>
                          ))}
                          {menu.items?.length > 4 && (
                            <Badge variant="outline" className="text-xs">+{menu.items.length - 4} {language === "es" ? "más" : "more"}</Badge>
                          )}
                        </div>
                        
                        {/* Variants */}
                        {menu.variants?.length > 0 ? (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {menu.variants.map((variant, idx) => (
                              <Badge 
                                key={idx}
                                className={`text-xs cursor-pointer hover:opacity-80 ${variant.is_default ? 'bg-primary' : 'bg-muted text-foreground'}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Add menu with variant pricing
                                  handleAddMenu(menu, variant);
                                }}
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
                        ) : (
                          <div className="flex items-center gap-4 text-sm mb-2">
                            <span className="font-mono font-medium">${menu.total_price?.toFixed(2)}</span>
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
                        )}
                      </div>
                      <Button variant="outline" size="sm" className="ml-4" onClick={(e) => { e.stopPropagation(); handleAddMenu(menu); }}>
                        <Plus className="w-4 h-4 mr-1" />
                        {language === "es" ? "Agregar" : "Add"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{language === "es" ? "No hay menús creados" : "No menus created"}</p>
              <p className="text-sm mt-2">
                {language === "es" 
                  ? "Crea menús en Settings → Lista de Ítems → Menús"
                  : "Create menus in Settings → Item Picklist → Menus"}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Invoice Creation Dialog */}
      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              {language === "es" ? "Crear Factura" : "Create Invoice"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Invoice Type Selection */}
            <div>
              <Label className="mb-2 block">{language === "es" ? "Tipo de Factura" : "Invoice Type"}</Label>
              <div className="grid grid-cols-2 gap-2">
                {/* Full Invoice */}
                <Button
                  variant={invoiceType === "full" ? "default" : "outline"}
                  className="h-auto py-3 flex flex-col"
                  onClick={() => setInvoiceType("full")}
                  disabled={existingInvoices.some(inv => inv.invoice_type === "deposit")}
                >
                  <span className="font-medium">{language === "es" ? "Total" : "Full"}</span>
                  <span className="text-xs opacity-80">${(financials?.total || 0).toFixed(2)}</span>
                </Button>
                
                {/* Deposit (50%) */}
                <Button
                  variant={invoiceType === "deposit" ? "default" : "outline"}
                  className="h-auto py-3 flex flex-col"
                  onClick={() => setInvoiceType("deposit")}
                  disabled={existingInvoices.some(inv => inv.invoice_type === "deposit" || inv.invoice_type === "full")}
                >
                  <span className="font-medium">{language === "es" ? "Depósito 50%" : "50% Deposit"}</span>
                  <span className="text-xs opacity-80">${((financials?.total || 0) * 0.5).toFixed(2)}</span>
                </Button>
                
                {/* Final Balance */}
                {existingInvoices.some(inv => inv.invoice_type === "deposit") && (
                  <Button
                    variant={invoiceType === "final" ? "default" : "outline"}
                    className="h-auto py-3 flex flex-col col-span-2"
                    onClick={() => setInvoiceType("final")}
                    disabled={existingInvoices.some(inv => inv.invoice_type === "final")}
                  >
                    <span className="font-medium">{language === "es" ? "Saldo Final" : "Final Balance"}</span>
                    <span className="text-xs opacity-80">
                      ${((financials?.total || 0) - getTotalInvoiced()).toFixed(2)}
                    </span>
                  </Button>
                )}
              </div>
            </div>

            {/* Multi-day event options */}
            {isMultidayEvent && (
              <div>
                <Label className="mb-2 block">{language === "es" ? "Facturar por Día" : "Invoice by Day"}</Label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={invoiceType === "day"}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setInvoiceType("day");
                      } else {
                        setInvoiceType("full");
                        setSelectedDays([]);
                      }
                    }}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">{language === "es" ? "Facturar días específicos" : "Invoice specific days"}</span>
                </div>
                
                {invoiceType === "day" && (
                  <div className="border rounded-lg p-3 space-y-2 bg-muted/50">
                    {getEventDays().map(day => {
                      const isInvoiced = getInvoicedDays().includes(day);
                      const dayLabel = new Date(day).toLocaleDateString(language === "es" ? "es-ES" : "en-US", { 
                        weekday: "short", month: "short", day: "numeric" 
                      });
                      return (
                        <label key={day} className={`flex items-center gap-2 ${isInvoiced ? 'opacity-50' : ''}`}>
                          <input
                            type="checkbox"
                            checked={selectedDays.includes(day)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDays([...selectedDays, day]);
                              } else {
                                setSelectedDays(selectedDays.filter(d => d !== day));
                              }
                            }}
                            disabled={isInvoiced}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">{dayLabel}</span>
                          {isInvoiced && (
                            <Badge variant="secondary" className="text-xs">
                              {language === "es" ? "Ya facturado" : "Already invoiced"}
                            </Badge>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Summary */}
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-medium text-green-800">
                  {language === "es" ? "Monto a Facturar" : "Amount to Invoice"}
                </span>
                <span className="text-xl font-bold text-green-700 font-mono">
                  ${invoiceType === "full" 
                    ? (financials?.total || 0).toFixed(2)
                    : invoiceType === "deposit"
                    ? ((financials?.total || 0) * 0.5).toFixed(2)
                    : invoiceType === "final"
                    ? ((financials?.total || 0) - getTotalInvoiced()).toFixed(2)
                    : "0.00"
                  }
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceDialogOpen(false)}>
              {language === "es" ? "Cancelar" : "Cancel"}
            </Button>
            <Button 
              onClick={handleCreateInvoice}
              className="bg-green-600 hover:bg-green-700"
              disabled={invoiceType === "day" && selectedDays.length === 0}
            >
              <DollarSign className="w-4 h-4 mr-2" />
              {language === "es" ? "Crear Factura" : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Invoice Dialog */}
      <Dialog open={editInvoiceOpen} onOpenChange={setEditInvoiceOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5" />
              {language === "es" ? "Editar Factura" : "Edit Invoice"}: {editingInvoice?.invoice_number}
            </DialogTitle>
          </DialogHeader>

          {editingInvoice && (
            <div className="space-y-4">
              {/* Invoice Type & Due Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{language === "es" ? "Tipo de Factura" : "Invoice Type"}</Label>
                  <Select 
                    value={editingInvoice.invoice_type || "full"} 
                    onValueChange={(v) => setEditingInvoice({...editingInvoice, invoice_type: v})}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">{language === "es" ? "Total" : "Full"}</SelectItem>
                      <SelectItem value="deposit">{language === "es" ? "Depósito" : "Deposit"}</SelectItem>
                      <SelectItem value="final">{language === "es" ? "Final" : "Final"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{language === "es" ? "Fecha de Vencimiento" : "Due Date"}</Label>
                  <Input
                    type="date"
                    value={editingInvoice.due_date ? editingInvoice.due_date.split("T")[0] : ""}
                    onChange={(e) => setEditingInvoice({...editingInvoice, due_date: e.target.value})}
                  />
                </div>
              </div>

              {/* Invoice Lines */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>{language === "es" ? "Líneas de Factura" : "Invoice Lines"}</Label>
                  <Button variant="outline" size="sm" onClick={addInvoiceLine}>
                    <Plus className="w-4 h-4 mr-1" />
                    {language === "es" ? "Agregar Línea" : "Add Line"}
                  </Button>
                </div>
                <div className="space-y-2 border rounded-lg p-3 bg-slate-50">
                  {(editingInvoice.lines || []).map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded border">
                      <Input
                        placeholder={language === "es" ? "Descripción" : "Description"}
                        value={line.description || ""}
                        onChange={(e) => updateInvoiceLine(idx, "description", e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        placeholder={language === "es" ? "Cant." : "Qty"}
                        value={line.quantity || ""}
                        onChange={(e) => updateInvoiceLine(idx, "quantity", parseFloat(e.target.value) || 0)}
                        className="w-20"
                      />
                      <Input
                        type="number"
                        placeholder={language === "es" ? "Precio" : "Price"}
                        value={line.unit_price || ""}
                        onChange={(e) => updateInvoiceLine(idx, "unit_price", parseFloat(e.target.value) || 0)}
                        className="w-28"
                      />
                      <span className="text-sm font-medium w-24 text-right">
                        ${((line.quantity || 0) * (line.unit_price || 0)).toFixed(2)}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => removeInvoiceLine(idx)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  {(editingInvoice.lines || []).length === 0 && (
                    <p className="text-center text-muted-foreground py-4">
                      {language === "es" ? "Sin líneas. Agrega una línea." : "No lines. Add a line."}
                    </p>
                  )}
                </div>
              </div>

              {/* Discount & Tax */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{language === "es" ? "Descuento %" : "Discount %"}</Label>
                  <Input
                    type="number"
                    value={editingInvoice.discount_percent || ""}
                    onChange={(e) => setEditingInvoice({...editingInvoice, discount_percent: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div>
                  <Label>{language === "es" ? "IVA %" : "Tax %"}</Label>
                  <Input
                    type="number"
                    value={editingInvoice.tax_rate || ""}
                    onChange={(e) => setEditingInvoice({...editingInvoice, tax_rate: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label>{language === "es" ? "Notas" : "Notes"}</Label>
                <Textarea
                  value={editingInvoice.notes || ""}
                  onChange={(e) => setEditingInvoice({...editingInvoice, notes: e.target.value})}
                  placeholder={language === "es" ? "Notas adicionales..." : "Additional notes..."}
                />
              </div>

              {/* Totals Preview */}
              <Card className="bg-slate-50">
                <CardContent className="pt-4">
                  <div className="space-y-1 text-sm">
                    {(() => {
                      const subtotal = (editingInvoice.lines || []).reduce(
                        (sum, line) => sum + (line.quantity || 0) * (line.unit_price || 0), 0
                      );
                      const discountAmount = subtotal * ((editingInvoice.discount_percent || 0) / 100);
                      const taxableAmount = subtotal - discountAmount;
                      const taxAmount = taxableAmount * ((editingInvoice.tax_rate || 0) / 100);
                      const total = taxableAmount + taxAmount;
                      return (
                        <>
                          <div className="flex justify-between">
                            <span>{language === "es" ? "Subtotal:" : "Subtotal:"}</span>
                            <span>${subtotal.toFixed(2)}</span>
                          </div>
                          {editingInvoice.discount_percent > 0 && (
                            <div className="flex justify-between text-red-600">
                              <span>{language === "es" ? "Descuento:" : "Discount:"} ({editingInvoice.discount_percent}%)</span>
                              <span>-${discountAmount.toFixed(2)}</span>
                            </div>
                          )}
                          {editingInvoice.tax_rate > 0 && (
                            <div className="flex justify-between">
                              <span>{language === "es" ? "IVA:" : "Tax:"} ({editingInvoice.tax_rate}%)</span>
                              <span>${taxAmount.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold text-lg border-t pt-1">
                            <span>Total:</span>
                            <span>${total.toFixed(2)}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditInvoiceOpen(false)}>
              {language === "es" ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveInvoice}>
              <CheckCircle className="w-4 h-4 mr-2" />
              {language === "es" ? "Guardar Cambios" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
