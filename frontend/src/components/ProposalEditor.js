import { useEffect, useState, useCallback } from "react";
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
  Edit, Clock, Calculator
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CATEGORY_ICONS = {
  utensils: Utensils,
  wine: Wine,
  armchair: Armchair,
  users: Users,
  flower: Flower2,
  package: Package,
};

const ITEM_TYPES = ["Food", "Service", "Rental", "Fee"];

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
    ]).finally(() => setLoading(false));
  }, [eventId]);

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

  // Create Invoice in Business Clarity
  const handleCreateInvoice = async () => {
    if (!proposal?.items?.length) {
      toast.error(language === "es" ? "No hay ítems para facturar" : "No items to invoice");
      return;
    }
    
    try {
      // Calculate due date (30 days from now or based on client payment terms)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      
      // Create invoice lines from proposal items
      const lines = proposal.items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_percent: 0
      }));
      
      const invoiceData = {
        client_id: event?.client_id,
        event_id: eventId,
        due_date: dueDate.toISOString(),
        lines: lines,
        discount_percent: financials?.discount_percent || 0,
        tax_rate: financials?.tax_rate || 0,
        notes: `${language === "es" ? "Factura generada desde evento" : "Invoice generated from event"}: ${event?.name}`
      };
      
      const res = await axios.post(`${API}/business-clarity/invoices`, invoiceData, { withCredentials: true });
      toast.success(
        language === "es" 
          ? `Factura ${res.data.invoice_number} creada exitosamente` 
          : `Invoice ${res.data.invoice_number} created successfully`
      );
      
      // Optionally open Business Clarity
      if (window.confirm(language === "es" ? "¿Desea ver la factura en Business Clarity?" : "Would you like to view the invoice in Business Clarity?")) {
        window.open("/business-clarity?tab=invoices", "_blank");
      }
    } catch (error) {
      const msg = error.response?.data?.detail || (language === "es" ? "Error al crear factura" : "Failed to create invoice");
      toast.error(msg);
    }
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
      color: itype === "Food" ? "#22c55e" : itype === "Service" ? "#3b82f6" : itype === "Rental" ? "#f59e0b" : "#8b5cf6"
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
                      </div>
                      <div>
                        <CardTitle className="text-base font-medium">{itype}</CardTitle>
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
                            {itype === "Food" && <Utensils className="w-4 h-4 text-green-500" />}
                            {itype === "Service" && <Users className="w-4 h-4 text-blue-500" />}
                            {itype === "Rental" && <Armchair className="w-4 h-4 text-amber-500" />}
                            {itype === "Fee" && <DollarSign className="w-4 h-4 text-purple-500" />}
                            <span className="font-medium">{itype}</span>
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
                <div className="divide-y divide-green-100">
                  {generatedDocs.slice(0, 5).map((doc) => (
                    <div key={doc.document_id} className="flex items-center justify-between py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{doc.title}</span>
                        <Badge variant="outline" className="text-xs">{doc.document_type}</Badge>
                        {doc.status === "signed" && (
                          <Badge className="bg-green-100 text-green-700 text-xs">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            {language === "es" ? "Firmado" : "Signed"}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(doc.created_at).toLocaleDateString(language === "es" ? "es-ES" : "en-US")}
                      </span>
                    </div>
                  ))}
                </div>
                {generatedDocs.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
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
                  onClick={handleCreateInvoice}
                  disabled={!proposal?.items?.length || !event?.client_id}
                  data-testid="create-invoice-btn"
                >
                  <DollarSign className="w-8 h-8 text-green-600" />
                  <span className="font-medium text-green-700">{language === "es" ? "Crear Factura" : "Create Invoice"}</span>
                  <span className="text-xs text-green-600">{language === "es" ? "Business Clarity" : "Business Clarity"}</span>
                </Button>

                {/* Kitchen Sheet */}
                <Button
                  variant="outline"
                  className="h-auto py-6 flex flex-col items-center gap-3 hover:border-primary"
                  onClick={() => { setPreviewDocType("kitchen_sheet"); setPreviewOpen(true); }}
                  disabled={!proposal?.items?.length}
                >
                  <Utensils className="w-8 h-8 text-orange-500" />
                  <span className="font-medium">{language === "es" ? "Hoja de Cocina" : "Kitchen Sheet"}</span>
                  <span className="text-xs text-muted-foreground">{language === "es" ? "Sin precios" : "No prices"}</span>
                </Button>

                {/* Mise en Place */}
                <Button
                  variant="outline"
                  className="h-auto py-6 flex flex-col items-center gap-3 hover:border-primary"
                  onClick={() => { setPreviewDocType("mise_en_place"); setPreviewOpen(true); }}
                  disabled={!proposal?.items?.length}
                >
                  <Utensils className="w-8 h-8 text-amber-500" />
                  <span className="font-medium">Mise en Place</span>
                  <span className="text-xs text-muted-foreground">{language === "es" ? "Sin precios" : "No prices"}</span>
                </Button>

                {/* Packing List */}
                <Button
                  variant="outline"
                  className="h-auto py-6 flex flex-col items-center gap-3 hover:border-primary"
                  onClick={() => { setPreviewDocType("packing_list"); setPreviewOpen(true); }}
                  disabled={!proposal?.items?.length}
                >
                  <Package className="w-8 h-8 text-purple-500" />
                  <span className="font-medium">{language === "es" ? "Lista de Montaje" : "Packing List"}</span>
                  <span className="text-xs text-muted-foreground">{language === "es" ? "Sin precios" : "No prices"}</span>
                </Button>

                {/* Menu */}
                <Button
                  variant="outline"
                  className="h-auto py-6 flex flex-col items-center gap-3 hover:border-primary"
                  onClick={() => { setPreviewDocType("menu"); setPreviewOpen(true); }}
                  disabled={!proposal?.items?.length}
                >
                  <FileText className="w-8 h-8 text-teal-500" />
                  <span className="font-medium">{language === "es" ? "Menú" : "Menu"}</span>
                  <span className="text-xs text-muted-foreground">{language === "es" ? "Solo nombres" : "Names only"}</span>
                </Button>
              </div>
              
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

          {/* Recipes Section (for food items) */}
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
                  {recipes.map(recipe => (
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
                      <SelectItem key={itype} value={itype}>{itype}</SelectItem>
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

              {/* Event Date */}
              <div>
                <Label>{language === "es" ? "Fecha" : "Date"}</Label>
                <Input
                  type="date"
                  value={newItem.event_date}
                  onChange={(e) => setNewItem({ ...newItem, event_date: e.target.value })}
                />
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
    </div>
  );
}
