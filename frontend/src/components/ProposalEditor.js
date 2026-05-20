import { useEffect, useState, useCallback } from "react";
import { API } from "../utils/api";
import axios from "axios";
import { useLanguage } from "../contexts/LanguageContext";
import { useTerminology } from "../hooks/useTerminology";
import DocumentPreview from "./DocumentPreview";
import BuffetSelectionDialog from "./BuffetSelectionDialog";
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
  Edit, Clock, Calculator, Link2, RefreshCw, CreditCard, Check, X, Type, ChefHat, Calendar as CalendarIcon,
  ArrowUp, ArrowDown, Copy
} from "lucide-react";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import RecipePicker from "./RecipePicker";
import RecipeScalingPanel from "./RecipeScalingPanel";


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

// Sortable wrapper for a single line item — uses @dnd-kit/sortable
const SortableItemRow = ({ id, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="bg-background">
      <div className="flex items-stretch">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex items-center justify-center px-2 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-foreground touch-none"
          aria-label="drag-handle"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
};

// Sortable wrapper for an entire section — used to reorder sections by dragging
// the header. Drag handle is exposed via render-prop so the consumer can place
// it inside the existing header layout without disturbing other controls.
const SortableSectionWrapper = ({ id, children, disabled }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const dragHandleProps = disabled
    ? null
    : {
        ...attributes,
        ...listeners,
        className:
          "flex items-center justify-center w-6 h-6 -ml-1 cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground touch-none rounded hover:bg-muted",
        "aria-label": "section-drag-handle",
        "data-testid": `section-drag-handle-${id}`,
        type: "button",
      };
  return (
    <div ref={setNodeRef} style={style}>
      {children(dragHandleProps)}
    </div>
  );
};

// Droppable empty-section zone — visual highlight on hover
const EmptySectionDropzone = ({ id, label }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      data-testid={`drop-empty-${id}`}
      className={`text-xs text-center py-6 italic border-2 border-dashed transition-colors ${
        isOver ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-transparent text-muted-foreground"
      }`}
    >
      {label}
    </div>
  );
};

export default function ProposalEditor({ eventId, event, onDocumentGenerated }) {
  const { t, language } = useLanguage();
  const { term } = useTerminology();
  
  // Dynamic terminology
  const clientLabel = term("events", "client");
  
  const [proposal, setProposal] = useState(null);
  const [staleness, setStaleness] = useState(null); // { is_stale, stale_count, can_refresh, stale_items }
  const [refreshingCosts, setRefreshingCosts] = useState(false);
  const [categories, setCategories] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [picklist, setPicklist] = useState([]);
  const [menus, setMenus] = useState([]);
  const [platedMenus, setPlatedMenus] = useState([]);
  const [menuSearch, setMenuSearch] = useState("");
  const [recipes, setRecipes] = useState([]);
  const [featureFlags, setFeatureFlags] = useState(null);
  const [financials, setFinancials] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [generatedDocs, setGeneratedDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [menuAddMode, setMenuAddMode] = useState("package"); // "package" | "breakdown"
  const [buffetSelectMenu, setBuffetSelectMenu] = useState(null); // PlatedMenu being configured for selection
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocType, setPreviewDocType] = useState("proposal");
  const [client, setClient] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [selectedPicklistCategory, setSelectedPicklistCategory] = useState("");
  const [picklistSearch, setPicklistSearch] = useState("");
  const [activeTab, setActiveTab] = useState("items");

  // Day-by-day logistics (per-date delivery info)
  const [dayLogistics, setDayLogistics] = useState([]);
  const [logisticsExpanded, setLogisticsExpanded] = useState(false);

  // Margin policy → suggested price helper
  const [marginPolicy, setMarginPolicy] = useState({ by_type: {}, by_category: [] });
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/settings/margin-policy`, { withCredentials: true });
        setMarginPolicy(res.data || { by_type: {}, by_category: [] });
      } catch (e) { /* ignore */ }
    })();
  }, []);
  const getSuggestedUnitPrice = (item) => {
    if (item.internal_cost == null || item.internal_cost <= 0) return null;
    const itype = item.item_type || "Service";
    const cat = item.category_id;
    const rule = (marginPolicy.by_category || []).find(
      (r) => (r.item_type === itype || !r.item_type) && r.category === cat
    );
    const pct = rule?.min_margin_pct != null
      ? Number(rule.min_margin_pct)
      : Number(marginPolicy.by_type?.[itype] ?? 30);
    if (!pct || pct <= 0 || pct >= 100) return null;
    return item.internal_cost / (1 - pct / 100);
  };

  // DnD sensors for sortable items
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Section management (custom titles within item types)
  const [editingSectionKey, setEditingSectionKey] = useState(null); // `${itype}::${oldTitle}`
  const [editingSectionValue, setEditingSectionValue] = useState("");
  const [newSectionForType, setNewSectionForType] = useState(null); // itype string when adding a new section
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [draftSectionTitles, setDraftSectionTitles] = useState({}); // {itype: [title, ...]} — empty sections persisted in-component until first item added

  // Section/Pack Templates
  const [sectionTemplates, setSectionTemplates] = useState([]);
  const [sectionTemplateChecks, setSectionTemplateChecks] = useState({}); // template_id -> {stale_count, items}
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [saveTemplateScope, setSaveTemplateScope] = useState("pack"); // 'pack' = full proposal, 'section' = single section
  const [saveTemplateSectionContext, setSaveTemplateSectionContext] = useState(null); // {itype, section_title} when scope='section'
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false);
  const [useCurrentPrices, setUseCurrentPrices] = useState(false);
  const [reviewTemplateOpen, setReviewTemplateOpen] = useState(false);
  const [reviewTemplate, setReviewTemplate] = useState(null); // {template_id, ...check data}

  // Duplicate-day dialog
  const [dupDayOpen, setDupDayOpen] = useState(false);
  const [dupDaySource, setDupDaySource] = useState(null); // ISO date or null
  const [dupDayTarget, setDupDayTarget] = useState(null);
  const [dupDayMode, setDupDayMode] = useState("append");
  
  // Customizable item types from company settings (deduped by type_key)
  const [itemTypes, setItemTypes] = useState([]);
  const ITEM_TYPES = (() => {
    const seen = new Set();
    const out = [];
    if (itemTypes.length === 0) {
      ITEM_TYPES_DEFAULT.forEach((k) => { seen.add(k); out.push(k); });
    } else {
      for (const t of itemTypes) {
        if (t.is_active === false) continue;
        if (seen.has(t.type_key)) continue;
        seen.add(t.type_key);
        out.push(t.type_key);
      }
    }
    // Append any "orphan" types present in the current proposal items that
    // aren't configured in settings (e.g., legacy "Other", "Bebida", typos).
    // Otherwise those items would be silently hidden from the editor while
    // still rendering in the printed PDF — causing the totals to drift.
    const orphanSet = new Set();
    (proposal?.items || []).forEach((it) => {
      const k = (it.item_type || "").trim();
      if (k && !seen.has(k)) {
        orphanSet.add(k);
        seen.add(k);
      }
    });
    orphanSet.forEach((k) => out.push(k));
    return out;
  })();

  const ORPHAN_TYPES = (() => {
    const configured = new Set();
    if (itemTypes.length === 0) {
      ITEM_TYPES_DEFAULT.forEach((k) => configured.add(k));
    } else {
      itemTypes.forEach((t) => { if (t.is_active !== false) configured.add(t.type_key); });
    }
    const out = new Set();
    (proposal?.items || []).forEach((it) => {
      const k = (it.item_type || "").trim();
      if (k && !configured.has(k)) out.add(k);
    });
    return out;
  })();
  
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
    long_description: "",
    category_id: "",
    quantity: 1,
    unit_price: 0,
    internal_cost: null,
    discount_type: "percentage",
    discount_value: 0,
    tax_exempt: false,
    reference_id: "",
    internal_notes: "",
    event_date: "",
    section_title: "",
    section_time: "",
    // UI-only fields (not sent to backend) — used for badges in the Add Item form
    _recipe_allergens: [],
    _portion_format_name: null,
  });

  // Fetch all data on mount
  useEffect(() => {
    Promise.all([
      fetchProposal(),
      fetchCategories(),
      fetchTaxRates(),
      fetchPicklist(),
      fetchMenus(),
      fetchPlatedMenus(),
      fetchRecipes(),
      fetchFeatureFlags(),
      fetchFinancials(),
      fetchClient(),
      fetchGeneratedDocs(),
      fetchEventInvoices(),
      fetchItemTypes(),
      fetchDocumentTypes(),
      fetchSectionTemplates(),
    ]).finally(() => setLoading(false));
  }, [eventId]);

  const fetchDocumentTypes = async () => {
    try {
      const response = await axios.get(`${API}/settings/document-types`, { withCredentials: true });
      setDocumentTypes({
        client_facing: response.data.client_facing || [],
        internal: response.data.internal || [],
        industry: response.data.industry || "events_hospitality",
      });
    } catch (error) {
      console.error("Failed to fetch document types:", error);
    }
  };

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
      // Detect stale costs (read-only, never mutates)
      try {
        const stale = await axios.get(`${API}/proposals/${response.data.proposal_id}/cost-staleness`, { withCredentials: true });
        setStaleness(stale.data);
      } catch { /* ignore — staleness is informational */ }
    } catch (error) {
      console.error("Failed to fetch proposal:", error);
    }
  };

  const handleRefreshCosts = async () => {
    if (!proposal?.proposal_id) return;
    setRefreshingCosts(true);
    try {
      const res = await axios.post(`${API}/proposals/${proposal.proposal_id}/refresh-costs`, {}, { withCredentials: true });
      toast.success(
        language === "es"
          ? `${res.data.refreshed_count} ítem${res.data.refreshed_count === 1 ? "" : "s"} actualizado${res.data.refreshed_count === 1 ? "" : "s"}`
          : `${res.data.refreshed_count} item${res.data.refreshed_count === 1 ? "" : "s"} refreshed`,
      );
      await fetchProposal();
      await fetchFinancials();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error");
    } finally {
      setRefreshingCosts(false);
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

  const fetchPlatedMenus = async () => {
    try {
      const response = await axios.get(`${API}/plated-menus`, { withCredentials: true });
      setPlatedMenus(response.data || []);
    } catch (error) {
      console.error("Failed to fetch plated menus:", error);
      setPlatedMenus([]);
    }
  };

  const fetchDayLogistics = useCallback(async () => {
    if (!proposal?.proposal_id) return;
    try {
      const res = await axios.get(`${API}/proposals/${proposal.proposal_id}/day-logistics`, { withCredentials: true });
      const existing = res.data?.day_logistics || [];
      // Auto-seed day-logistics from event.event_dates the first time we open a
      // multi-date event's proposal. We never overwrite manually configured days.
      const eventDates = Array.isArray(event?.event_dates) ? event.event_dates.filter(Boolean) : [];
      if (existing.length === 0 && eventDates.length > 1) {
        const seeded = eventDates.map((d) => ({
          event_date: String(d).slice(0, 10),
          delivery_time: "",
          delivery_end_time: "",
          address: event?.venue_address || "",
          instructions: "",
          guest_count: event?.guest_count || event?.num_guests || null,
        }));
        try {
          const put = await axios.put(
            `${API}/proposals/${proposal.proposal_id}/day-logistics`,
            { day_logistics: seeded },
            { withCredentials: true }
          );
          setDayLogistics(put.data?.day_logistics || seeded);
          return;
        } catch (_e) {
          // fall through to existing list on save failure
        }
      }
      setDayLogistics(existing);
    } catch (e) {
      setDayLogistics([]);
    }
  }, [proposal?.proposal_id, event?.event_dates, event?.venue_address, event?.guest_count, event?.num_guests]);

  // Load day-logistics whenever the proposal id changes
  useEffect(() => {
    fetchDayLogistics();
  }, [fetchDayLogistics]);

  const saveDayLogistics = async (newDays) => {
    if (!proposal?.proposal_id) return;
    try {
      const res = await axios.put(
        `${API}/proposals/${proposal.proposal_id}/day-logistics`,
        { day_logistics: newDays },
        { withCredentials: true }
      );
      setDayLogistics(res.data?.day_logistics || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error");
    }
  };

  const addLogisticsDay = () => {
    const fallbackDate = event?.event_date || new Date().toISOString().slice(0, 10);
    const newDay = { event_date: fallbackDate, delivery_time: "", delivery_end_time: "", address: event?.venue_address || "", instructions: "", guest_count: event?.guest_count || event?.num_guests || null };
    saveDayLogistics([...dayLogistics, newDay]);
  };

  const updateLogisticsDay = (idx, patch) => {
    const next = dayLogistics.map((d, i) => (i === idx ? { ...d, ...patch } : d));
    setDayLogistics(next);
  };

  const commitLogisticsDay = () => saveDayLogistics(dayLogistics);

  const removeLogisticsDay = (idx) => {
    const next = dayLogistics.filter((_, i) => i !== idx);
    saveDayLogistics(next);
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

  // Returns the list of dates this proposal/event spans. Prefers dayLogistics
  // (the source of truth — handles non-consecutive `event_dates` AND legacy
  // start/end ranges) and falls back to the event's date range.
  const getProposalDates = () => {
    if (Array.isArray(dayLogistics) && dayLogistics.length > 0) {
      return dayLogistics
        .map((d) => (d?.event_date ? String(d.event_date).slice(0, 10) : null))
        .filter(Boolean);
    }
    if (Array.isArray(event?.event_dates) && event.event_dates.length > 0) {
      return event.event_dates.map((d) => String(d).slice(0, 10));
    }
    if (event?.event_date && event?.end_date && event.event_date !== event.end_date) {
      const out = [];
      const start = new Date(event.event_date);
      const end = new Date(event.end_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        out.push(d.toISOString().split("T")[0]);
      }
      return out;
    }
    if (event?.event_date) return [String(event.event_date).slice(0, 10)];
    return [];
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItem.description) {
      toast.error(language === "es" ? "Descripción es requerida" : "Description is required");
      return;
    }

    try {
      // Strip UI-only fields (prefixed with _) before sending to backend
      const payload = Object.fromEntries(
        Object.entries(newItem).filter(([k]) => !k.startsWith("_")),
      );

      // Fan-out: when the user picks "Todos los días" (event_date === "") on a
      // multi-day proposal, create one independent copy of the item per date.
      // Each copy is identical except for event_date so it appears under the
      // right day in the editor and PDF, and can be edited/removed individually.
      const isFanout =
        !editingItemId &&
        (payload.event_date === "" || payload.event_date == null) &&
        getProposalDates().length > 1;

      if (isFanout) {
        const dates = getProposalDates();
        await Promise.all(
          dates.map((d) =>
            axios.post(
              `${API}/proposals/${proposal.proposal_id}/items`,
              { ...payload, event_date: d },
              { withCredentials: true }
            )
          )
        );
        toast.success(
          language === "es"
            ? `Ítem agregado en ${dates.length} días`
            : `Item added across ${dates.length} days`
        );
      } else if (editingItemId) {
        await axios.put(`${API}/proposals/${proposal.proposal_id}/items/${editingItemId}`, payload, { withCredentials: true });
        toast.success(language === "es" ? "Ítem actualizado" : "Item updated");
      } else {
        await axios.post(`${API}/proposals/${proposal.proposal_id}/items`, payload, { withCredentials: true });
        toast.success(language === "es" ? "Ítem agregado" : "Item added");
      }
      fetchProposal();
      fetchFinancials();
      setAddItemOpen(false);
      setEditingItemId(null);
      resetNewItem();
    } catch (error) {
      const msg = error.response?.data?.detail || "Failed to add item";
      toast.error(msg);
    }
  };

  const handleEditItem = (item) => {
    setEditingItemId(item.item_id);
    setNewItem({
      item_type: item.item_type || "Service",
      description: item.description || "",
      long_description: item.long_description || "",
      category_id: item.category_id || "",
      quantity: item.quantity || 1,
      unit_price: item.unit_price || 0,
      internal_cost: item.internal_cost ?? null,
      discount_type: item.discount_type || (item.discount_pct ? "percentage" : "percentage"),
      discount_value: item.discount_value != null ? item.discount_value : (item.discount_pct || 0),
      tax_exempt: !!item.tax_exempt,
      reference_id: item.reference_id || "",
      internal_notes: item.internal_notes || "",
      event_date: item.event_date || "",
      section_title: item.section_title || "",
      section_time: item.section_time || "",
      _recipe_allergens: [],
      _portion_format_name: null,
    });
    setAddItemOpen(true);
  };

  const resetNewItem = () => {
    // Default the date to the first day-logistics entry (or the event's main date) so
    // newly-added items inherit a date by default. The user can still change it.
    const defaultDate =
      (dayLogistics && dayLogistics[0]?.event_date) ||
      (event?.event_date ? String(event.event_date).slice(0, 10) : "") ||
      "";
    setNewItem({
      item_type: "Service",
      description: "",
      long_description: "",
      category_id: "",
      quantity: 1,
      unit_price: 0,
      internal_cost: null,
      discount_type: "percentage",
      discount_value: 0,
      tax_exempt: false,
      reference_id: "",
      internal_notes: "",
      event_date: defaultDate,
      section_title: "",
      section_time: "",
      _recipe_allergens: [],
      _portion_format_name: null,
    });
  };

  const handleAddMenu = async (menu, variant = null) => {
    try {
      const res = await axios.post(
        `${API}/proposals/${proposal.proposal_id}/items/bulk-from-menu`,
        {
          menu_id: menu.menu_id,
          variant_id: variant?.variant_id || null,
          quantity_multiplier: 1,
          section_title: menu.name,
        },
        { withCredentials: true },
      );
      const addedCount = res.data?.items_added || 0;
      const variantLabel = variant ? ` (${variant.name})` : "";
      toast.success(
        language === "es"
          ? `${addedCount} ítems agregados desde "${menu.name}${variantLabel}"`
          : `${addedCount} items added from "${menu.name}${variantLabel}"`,
      );
      fetchProposal();
      fetchFinancials();
      setAddMenuOpen(false);
    } catch (error) {
      const msg = error.response?.data?.detail || "Failed to add menu items";
      toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
  };

  const handleAddPlatedMenu = async (platedMenu, selectedItems = null) => {
    // If the menu has selection rules or a base_price_per_guest, open the BuffetSelectionDialog first
    // (unless `selectedItems` was already provided by the dialog confirm callback).
    if (!selectedItems) {
      const hasBasePrice = parseFloat(platedMenu?.base_price_per_guest || 0) > 0;
      const hasRules = (platedMenu?.courses || []).some(
        c => c.min_choices != null || c.max_choices != null
      );
      if (hasBasePrice || hasRules) {
        setBuffetSelectMenu(platedMenu);
        return;
      }
    }
    try {
      const res = await axios.post(
        `${API}/proposals/${proposal.proposal_id}/items/bulk-from-plated-menu`,
        {
          menu_id: platedMenu.menu_id,
          guest_count: event?.guest_count || event?.num_guests || 0,
          mode: menuAddMode,
          ...(selectedItems ? { selected_items: selectedItems } : {}),
        },
        { withCredentials: true },
      );
      const addedCount = res.data?.items_added || 0;
      const guests = res.data?.guest_count_used;
      const modeLabel = res.data?.mode === "package"
        ? (language === "es" ? "como paquete" : "as package")
        : (language === "es" ? "desglosado" : "broken down");
      toast.success(
        language === "es"
          ? `${addedCount} línea(s) agregada(s) ${modeLabel} desde "${platedMenu.name}" (${guests} invitados)`
          : `${addedCount} line(s) added ${modeLabel} from "${platedMenu.name}" (${guests} guests)`,
      );
      fetchProposal();
      fetchFinancials();
      setAddMenuOpen(false);
      setBuffetSelectMenu(null);
    } catch (error) {
      const msg = error.response?.data?.detail || "Failed to add plated menu items";
      toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
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

  const handleRecipeSelect = (pick) => {
    // pick comes from RecipePicker.onPick: { recipe, portionFormat, internal_cost, unit_price, suggested_price, allergens, description, long_description }
    const { recipe, portionFormat, internal_cost, unit_price, allergens, description, long_description } = pick;

    setNewItem({
      ...newItem,
      item_type: "Food",
      description,
      long_description: long_description || "",
      category_id: "cat_food",
      unit_price: Math.round(unit_price * 100) / 100,
      internal_cost,
      reference_id: recipe.recipe_id,
      _recipe_allergens: allergens || [],
      _portion_format_name: portionFormat ? portionFormat.format_name : null,
    });

    const fmtMsg = portionFormat
      ? (language === "es" ? `Formato: ${portionFormat.format_name}` : `Format: ${portionFormat.format_name}`)
      : (language === "es" ? "Costo base" : "Base cost");
    toast.info(
      language === "es"
        ? `${fmtMsg} · Costo: $${internal_cost.toFixed(2)} | Precio: $${unit_price.toFixed(2)}`
        : `${fmtMsg} · Cost: $${internal_cost.toFixed(2)} | Price: $${unit_price.toFixed(2)}`,
    );
  };

  const toggleCategory = (catId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catId]: !prev[catId]
    }));
  };

  // -------- Sections (custom titles) helpers --------

  // Section/Pack templates
  const fetchSectionTemplates = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/proposals/section-templates`, { withCredentials: true });
      const tpls = res.data || [];
      setSectionTemplates(tpls);
      // Fetch stale checks in parallel (best-effort)
      const checks = await Promise.allSettled(
        tpls.map((t) =>
          axios.get(`${API}/proposals/section-templates/${t.template_id}/check`, { withCredentials: true })
        )
      );
      const map = {};
      checks.forEach((c, i) => {
        if (c.status === "fulfilled") map[tpls[i].template_id] = c.value.data;
      });
      setSectionTemplateChecks(map);
    } catch (err) {
      console.error("Failed to fetch templates:", err);
    }
  }, []);

  const openReviewTemplate = async (templateId) => {
    try {
      const res = await axios.get(
        `${API}/proposals/section-templates/${templateId}/check`,
        { withCredentials: true }
      );
      setReviewTemplate(res.data);
      setReviewTemplateOpen(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to load template");
    }
  };

  const handleRefreshTemplate = async (templateId, itemIndexes = null) => {
    try {
      const res = await axios.post(
        `${API}/proposals/section-templates/${templateId}/refresh`,
        itemIndexes ? { item_indexes: itemIndexes } : {},
        { withCredentials: true }
      );
      toast.success(
        language === "es"
          ? `${res.data.updated} ítem(s) actualizados`
          : `${res.data.updated} item(s) updated`
      );
      // Reload review + list
      if (reviewTemplate && reviewTemplate.template_id === templateId) {
        await openReviewTemplate(templateId);
      }
      fetchSectionTemplates();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to refresh");
    }
  };

  const handleSaveTemplate = async () => {
    const name = (saveTemplateName || "").trim();
    if (!name) {
      toast.error(language === "es" ? "Nombre requerido" : "Name required");
      return;
    }
    let itemsToSave = [];
    if (saveTemplateScope === "section" && saveTemplateSectionContext) {
      const { itype, section_title } = saveTemplateSectionContext;
      itemsToSave = (proposal?.items || []).filter(
        (i) => i.item_type === itype && (i.section_title || "") === (section_title || "")
      );
    } else {
      itemsToSave = proposal?.items || [];
    }
    if (itemsToSave.length === 0) {
      toast.error(language === "es" ? "No hay ítems para guardar" : "No items to save");
      return;
    }
    try {
      await axios.post(
        `${API}/proposals/section-templates`,
        { name, scope: saveTemplateScope, items: itemsToSave },
        { withCredentials: true }
      );
      toast.success(language === "es" ? `Plantilla "${name}" guardada` : `Template "${name}" saved`);
      setSaveTemplateOpen(false);
      setSaveTemplateName("");
      setSaveTemplateSectionContext(null);
      fetchSectionTemplates();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save template");
    }
  };

  const handleApplyTemplate = async (templateId) => {
    try {
      await axios.post(
        `${API}/proposals/${proposal.proposal_id}/apply-template`,
        { template_id: templateId, use_current_prices: useCurrentPrices },
        { withCredentials: true }
      );
      toast.success(
        useCurrentPrices
          ? (language === "es" ? "Plantilla aplicada (precios actuales)" : "Template applied (current prices)")
          : (language === "es" ? "Plantilla aplicada" : "Template applied")
      );
      setApplyTemplateOpen(false);
      fetchProposal();
      fetchFinancials();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to apply template");
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    try {
      await axios.delete(`${API}/proposals/section-templates/${templateId}`, { withCredentials: true });
      toast.success(language === "es" ? "Plantilla eliminada" : "Template removed");
      fetchSectionTemplates();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete template");
    }
  };

  // Duplicate-day handler
  const handleDuplicateDay = async () => {
    if (!dupDayTarget) {
      toast.error(language === "es" ? "Selecciona el día destino" : "Pick a target day");
      return;
    }
    if ((dupDaySource || "") === (dupDayTarget || "")) {
      toast.error(language === "es" ? "Origen y destino deben ser distintos" : "Source and target must differ");
      return;
    }
    try {
      const res = await axios.post(
        `${API}/proposals/${proposal.proposal_id}/duplicate-day`,
        { source_date: dupDaySource, target_date: dupDayTarget, mode: dupDayMode },
        { withCredentials: true }
      );
      toast.success(
        language === "es"
          ? `${res.data.created} ítems duplicados`
          : `${res.data.created} items duplicated`
      );
      setDupDayOpen(false);
      fetchProposal();
      fetchFinancials();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to duplicate day");
    }
  };

  // Group items in a type into sections by section_title, preserving sort_order.
  const groupBySections = (items, itype) => {
    const sortedItems = [...items].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const map = new Map(); // title -> {title, items}
    sortedItems.forEach((it) => {
      const title = (it.section_title || "").trim();
      if (!map.has(title)) map.set(title, { title, items: [] });
      map.get(title).items.push(it);
    });
    // Inject empty draft sections for this type (kept in component until first item)
    (draftSectionTitles[itype] || []).forEach((t) => {
      if (!map.has(t)) map.set(t, { title: t, items: [], isDraft: true });
    });
    return Array.from(map.values());
  };

  // Bulk-update section_title on a list of items. Returns a promise.
  const updateItemSection = async (item, patch) => {
    try {
      await axios.put(
        `${API}/proposals/${proposal.proposal_id}/items/${item.item_id}`,
        patch,
        { withCredentials: true }
      );
    } catch (err) {
      console.error("Update item section failed:", err);
      throw err;
    }
  };

  const handleRenameSection = async (itype, oldTitle, newTitle) => {
    const trimmed = (newTitle || "").trim();
    if (trimmed === (oldTitle || "")) {
      setEditingSectionKey(null);
      return;
    }
    const items = proposal?.items?.filter(
      (i) => i.item_type === itype && (i.section_title || "") === (oldTitle || "")
    ) || [];
    try {
      await Promise.all(items.map((it) => updateItemSection(it, { section_title: trimmed })));
      // Update draft mapping if needed
      if (draftSectionTitles[itype]?.includes(oldTitle)) {
        setDraftSectionTitles((prev) => ({
          ...prev,
          [itype]: (prev[itype] || []).map((t) => (t === oldTitle ? trimmed : t)),
        }));
      }
      setEditingSectionKey(null);
      toast.success(language === "es" ? "Sección renombrada" : "Section renamed");
      fetchProposal();
    } catch {
      toast.error(language === "es" ? "Error al renombrar sección" : "Failed to rename section");
    }
  };

  const handleAddSection = (itype) => {
    const trimmed = (newSectionTitle || "").trim();
    if (!trimmed) return;
    setDraftSectionTitles((prev) => ({
      ...prev,
      [itype]: Array.from(new Set([...(prev[itype] || []), trimmed])),
    }));
    setNewSectionForType(null);
    setNewSectionTitle("");
    toast.info(
      language === "es"
        ? `Sección "${trimmed}" creada. Agrega ítems para que persista.`
        : `Section "${trimmed}" created. Add items to persist it.`
    );
  };

  const handleAddComponentItem = async (parentItem) => {
    try {
      const payload = {
        item_type: parentItem.item_type || "Food",
        description: language === "es" ? "Nuevo componente" : "New component",
        quantity: 1,
        unit_price: 0,
        internal_cost: 0,
        section_title: parentItem.section_title || "",
        section_time: parentItem.section_time || null,
        section_end_time: parentItem.section_end_time || null,
        parent_item_id: parentItem.item_id,
        category_id: parentItem.category_id || null,
      };
      const res = await axios.post(
        `${API}/proposals/${proposal.proposal_id}/items`,
        payload,
        { withCredentials: true },
      );
      toast.success(language === "es" ? "Componente agregado" : "Component added");
      fetchProposal();
      // Open edit dialog on the new component so user can name it
      if (res.data) handleEditItem(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Error");
    }
  };

  const handleSectionDateChange = async (itype, title, newDate) => {
    const items = proposal?.items?.filter(
      (i) => i.item_type === itype && (i.section_title || "") === (title || "")
    ) || [];
    if (items.length === 0) return;
    try {
      await Promise.all(
        items.map((it) =>
          axios.put(`${API}/proposals/${proposal.proposal_id}/items/${it.item_id}`,
            { event_date: newDate || null },
            { withCredentials: true })
        )
      );
      fetchProposal();
    } catch (e) {
      toast.error(language === "es" ? "Error al cambiar fecha" : "Failed to update date");
    }
  };

  // Replicate a section across multiple dates: for each missing date, clone
  // every item in the section once with that date. Used by the "+N days"
  // button on the section header — lets the user fan out a "Bocadillos"
  // section to every day of a multi-day event in one click.
  const handleReplicateSectionAcrossDays = async (itype, title, missingDates) => {
    const items = (proposal?.items || []).filter(
      (i) => i.item_type === itype && (i.section_title || "") === (title || "")
    );
    if (items.length === 0 || !Array.isArray(missingDates) || missingDates.length === 0) return;
    // Use the section's first dated item as the canonical "template" so we
    // don't accidentally pick up an outlier with a different price/qty.
    const template = items.find((i) => i.event_date) || items[0];
    const cloneFromAll = items; // clone EVERY item per day, not just the template
    try {
      await Promise.all(
        missingDates.flatMap((d) =>
          cloneFromAll.map((it) => {
            const payload = {
              item_type: it.item_type,
              description: it.description,
              long_description: it.long_description || "",
              category_id: it.category_id || "",
              quantity: it.quantity,
              unit_price: it.unit_price,
              internal_cost: it.internal_cost,
              discount_type: it.discount_type || "percentage",
              discount_percent: it.discount_percent,
              discount_amount: it.discount_amount,
              tax_exempt: it.tax_exempt,
              reference_id: it.reference_id || "",
              internal_notes: it.internal_notes || "",
              event_date: d,
              section_title: it.section_title || "",
              section_time: it.section_time || "",
              section_end_time: it.section_end_time || "",
            };
            return axios.post(
              `${API}/proposals/${proposal.proposal_id}/items`,
              payload,
              { withCredentials: true }
            );
          })
        )
      );
      toast.success(
        language === "es"
          ? `Sección replicada en ${missingDates.length} día(s)`
          : `Section replicated across ${missingDates.length} day(s)`
      );
      fetchProposal();
      fetchFinancials();
    } catch (e) {
      toast.error(
        language === "es"
          ? "Error al replicar la sección"
          : "Failed to replicate section"
      );
    }
    // Suppress unused-variable lint without changing the helper signature;
    // the canonical template was looked up for future single-row replication.
    void template;
  };

  const handleSectionTimeChange = async (itype, title, newTime, field = "section_time") => {
    const items = proposal?.items?.filter(
      (i) => i.item_type === itype && (i.section_title || "") === (title || "")
    ) || [];
    if (items.length === 0) return;
    try {
      await Promise.all(
        items.map((it) =>
          axios.put(`${API}/proposals/${proposal.proposal_id}/items/${it.item_id}`,
            { [field]: newTime || null },
            { withCredentials: true })
        )
      );
      fetchProposal();
    } catch (e) {
      toast.error(language === "es" ? "Error al cambiar hora" : "Failed to update time");
    }
  };

  const handleDeleteSection = async (itype, title) => {
    if (!title) return; // never delete the implicit "no section" group
    const items = proposal?.items?.filter(
      (i) => i.item_type === itype && (i.section_title || "") === title
    ) || [];
    try {
      await Promise.all(items.map((it) => updateItemSection(it, { section_title: "" })));
      setDraftSectionTitles((prev) => ({
        ...prev,
        [itype]: (prev[itype] || []).filter((t) => t !== title),
      }));
      toast.success(language === "es" ? "Sección eliminada" : "Section removed");
      fetchProposal();
    } catch {
      toast.error(language === "es" ? "Error al eliminar sección" : "Failed to remove section");
    }
  };

  // Persist a new section ordering for a given item_type by re-stamping all
  // items' sort_order. `newOrderTitles` is the desired sequence of section
  // titles (use "" for the untitled bucket). Items keep their relative order
  // within each section.
  const persistSectionOrder = async (itype, newOrderTitles) => {
    const typeItems = (proposal?.items || []).filter((i) => i.item_type === itype);
    const payload = [];
    newOrderTitles.forEach((title, sIdx) => {
      const items = typeItems
        .filter((it) => (it.section_title || "") === title)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      items.forEach((it, jIdx) => {
        payload.push({ item_id: it.item_id, sort_order: sIdx * 1000 + jIdx });
      });
    });
    if (payload.length === 0) return;
    try {
      await axios.post(
        `${API}/proposals/${proposal.proposal_id}/items/bulk-reorder`,
        { items: payload },
        { withCredentials: true }
      );
      toast.success(language === "es" ? "Sección movida" : "Section moved");
      fetchProposal();
    } catch {
      toast.error(language === "es" ? "Error al mover la sección" : "Failed to move section");
    }
  };

  // Move a section up or down within its item_type via arrow buttons (mobile/a11y backup
  // to the drag handle).
  const moveSection = (itype, sectionTitle, direction) => {
    const typeItems = (proposal?.items || []).filter((i) => i.item_type === itype);
    const sections = groupBySections(typeItems, itype).map((s) => s.title || "");
    const idx = sections.indexOf(sectionTitle || "");
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sections.length) return;
    const newOrder = [...sections];
    [newOrder[idx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[idx]];
    persistSectionOrder(itype, newOrder);
  };

  // Drag-and-drop handler scoped per item_type
  const handleDragEndForType = async (itype, event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const typeItems = (proposal?.items || []).filter((i) => i.item_type === itype);

    // ---- Branch A: Section header dragged ----
    if (typeof active.id === "string" && active.id.startsWith("sectionhdr::")) {
      const activeSection = active.id.replace("sectionhdr::", "");
      // Determine target section based on what we dropped on
      let targetSection = null;
      if (typeof over.id === "string" && over.id.startsWith("sectionhdr::")) {
        targetSection = over.id.replace("sectionhdr::", "");
      } else if (typeof over.id === "string" && over.id.startsWith("section::")) {
        targetSection = over.id.replace("section::", "");
      } else {
        // Dropped on an item row — use that item's section
        const overItem = typeItems.find((i) => i.item_id === over.id);
        if (!overItem) return;
        targetSection = overItem.section_title || "";
      }
      if (activeSection === targetSection) return;

      // Build current section order for this item_type and persist the new order
      const sections = groupBySections(typeItems, itype).map((s) => s.title || "");
      const fromIdx = sections.indexOf(activeSection);
      const toIdx = sections.indexOf(targetSection);
      if (fromIdx < 0 || toIdx < 0) return;
      const newOrder = [...sections];
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, activeSection);
      await persistSectionOrder(itype, newOrder);
      return;
    }

    // ---- Branch B: Item dragged (existing behavior) ----
    const activeItem = typeItems.find((i) => i.item_id === active.id);
    const overItem = typeItems.find((i) => i.item_id === over.id);
    if (!activeItem) return;
    // If dropping on a section header pseudo-id (e.g. "section::Title")
    let targetSectionTitle;
    if (typeof over.id === "string" && over.id.startsWith("section::")) {
      targetSectionTitle = over.id.replace("section::", "");
    } else if (typeof over.id === "string" && over.id.startsWith("sectionhdr::")) {
      targetSectionTitle = over.id.replace("sectionhdr::", "");
    } else if (overItem) {
      targetSectionTitle = overItem.section_title || "";
    } else {
      return;
    }
    const patch = {};
    if ((activeItem.section_title || "") !== targetSectionTitle) {
      patch.section_title = targetSectionTitle;
    }
    // Compute new sort_order: place after overItem (or at end if dropped on header)
    const sectionItems = typeItems
      .filter((i) => (i.section_title || "") === targetSectionTitle && i.item_id !== activeItem.item_id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    let newOrder;
    if (overItem) {
      const idx = sectionItems.findIndex((i) => i.item_id === overItem.item_id);
      const prev = idx >= 0 ? sectionItems[idx].sort_order || 0 : 0;
      const next = sectionItems[idx + 1]?.sort_order ?? prev + 2;
      newOrder = (prev + next) / 2;
    } else {
      newOrder = (sectionItems[sectionItems.length - 1]?.sort_order || 0) + 1;
    }
    patch.sort_order = Math.round(newOrder * 1000);
    try {
      await updateItemSection(activeItem, patch);
      fetchProposal();
    } catch {
      toast.error(language === "es" ? "Error al reordenar" : "Failed to reorder");
    }
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

      {/* Cost Staleness Banner — DRAFT proposals only */}
      {staleness?.is_stale && !isLocked && (
        <div
          className={`rounded-lg p-4 flex items-start gap-3 ${
            staleness.can_refresh
              ? "bg-amber-50 border border-amber-200"
              : "bg-slate-100 border border-slate-200"
          }`}
          data-testid="cost-staleness-banner"
        >
          <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${staleness.can_refresh ? "text-amber-600" : "text-slate-500"}`} />
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm ${staleness.can_refresh ? "text-amber-900" : "text-slate-700"}`}>
              {language === "es"
                ? `${staleness.stale_count} ítem${staleness.stale_count === 1 ? "" : "s"} con costos desactualizados`
                : `${staleness.stale_count} item${staleness.stale_count === 1 ? "" : "s"} with outdated costs`}
            </p>
            <p className={`text-xs mt-0.5 ${staleness.can_refresh ? "text-amber-800" : "text-slate-600"}`}>
              {staleness.can_refresh
                ? (language === "es"
                  ? "Los precios de ingredientes cambiaron desde que se creó esta cotización. Puedes actualizar los costos internos antes de enviar al cliente. El precio al cliente NO cambiará."
                  : "Ingredient prices changed since this quote was created. You can refresh internal costs before sending it. The client price will NOT change.")
                : (language === "es"
                  ? "Esta cotización ya no es Draft, los costos quedan congelados."
                  : "This proposal is past Draft — costs are frozen.")}
            </p>
            {/* Top 3 affected items */}
            <div className="mt-2 flex flex-wrap gap-1">
              {(staleness.stale_items || []).slice(0, 3).map((it) => (
                <Badge key={it.item_id} variant="outline" className={`text-[10px] ${staleness.can_refresh ? "border-amber-300 text-amber-700" : "border-slate-300 text-slate-600"}`}>
                  {it.recipe_name}: ${it.snapshot_cost.toFixed(2)} → ${it.current_cost.toFixed(2)} ({it.diff_pct > 0 ? "+" : ""}{it.diff_pct.toFixed(0)}%)
                </Badge>
              ))}
              {staleness.stale_count > 3 && (
                <Badge variant="outline" className="text-[10px]">+{staleness.stale_count - 3}</Badge>
              )}
            </div>
          </div>
          {staleness.can_refresh && (
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 hover:bg-amber-100 flex-shrink-0"
              onClick={handleRefreshCosts}
              disabled={refreshingCosts}
              data-testid="refresh-costs-btn"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${refreshingCosts ? "animate-spin" : ""}`} />
              {refreshingCosts
                ? (language === "es" ? "Actualizando..." : "Refreshing...")
                : (language === "es" ? "Actualizar costos" : "Refresh costs")}
            </Button>
          )}
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
              {language === "es" ? `${clientLabel} con Línea de Crédito` : `${clientLabel} with Credit Line`}
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
        <div className="flex items-center gap-3 flex-wrap">
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

          {/* Food Cost per Guest KPI */}
          {(() => {
            const guests = event?.guest_count || event?.num_guests || 0;
            const foodData = financials?.by_item_type?.Food;
            if (!guests || !foodData || (foodData.cost || 0) <= 0) return null;
            const foodCost = foodData.cost || 0;
            const foodRevenue = foodData.revenue || 0;
            const costPerGuest = foodCost / guests;
            const foodCostPct = foodRevenue > 0 ? (foodCost / foodRevenue) * 100 : 0;
            // Industry-standard target: 30% food cost
            const targetPct = 30;
            const isOver = foodCostPct > targetPct + 5;
            const isWarning = foodCostPct > targetPct && !isOver;
            const isOk = foodCostPct <= targetPct;
            const color = isOk
              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
              : isWarning
                ? "bg-amber-50 border-amber-300 text-amber-800"
                : "bg-rose-50 border-rose-300 text-rose-800";
            const icon = isOk ? "✅" : isWarning ? "⚠️" : "🚩";
            return (
              <div
                className={`flex items-center gap-2 px-3 py-1 rounded-md border text-xs ${color}`}
                title={
                  language === "es"
                    ? `Costo de comida total: $${foodCost.toFixed(2)} · Ingreso food: $${foodRevenue.toFixed(2)} · Target food cost: ${targetPct}%`
                    : `Total food cost: $${foodCost.toFixed(2)} · Food revenue: $${foodRevenue.toFixed(2)} · Target food cost: ${targetPct}%`
                }
                data-testid="food-cost-per-guest-kpi"
              >
                <span className="text-base leading-none">{icon}</span>
                <div className="flex flex-col leading-tight">
                  <span className="font-semibold">
                    ${costPerGuest.toFixed(2)} <span className="font-normal opacity-70">/{language === "es" ? "invitado" : "guest"}</span>
                  </span>
                  <span className="text-[10px] opacity-80">
                    {language === "es" ? "Food cost" : "Food cost"}: <strong>{foodCostPct.toFixed(1)}%</strong>
                    <span className="opacity-60 ml-1">vs {targetPct}%</span>
                  </span>
                </div>
              </div>
            );
          })()}
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

          {/* Repair item descriptions from recipes/menus */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={async () => {
              try {
                const res = await axios.post(
                  `${API}/proposals/${proposal.proposal_id}/items/repair-descriptions`,
                  {},
                  { withCredentials: true },
                );
                const { fixed = 0, scanned = 0 } = res.data || {};
                toast.success(
                  language === "es"
                    ? `${fixed} de ${scanned} ítem(s) reparados`
                    : `${fixed} of ${scanned} item(s) fixed`,
                );
                fetchProposal();
              } catch (e) {
                toast.error(e.response?.data?.detail || "Repair failed");
              }
            }}
            data-testid="repair-descriptions-btn"
            title={language === "es" ? "Restablecer descripciones de recetas en los ítems" : "Restore recipe descriptions on items"}
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            {language === "es" ? "Reparar descripciones" : "Repair descriptions"}
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
          {/* Day-by-day Logistics */}
          <Card data-testid="day-logistics-card">
            <CardHeader
              className="cursor-pointer hover:bg-muted/50 transition-colors py-3"
              onClick={() => setLogisticsExpanded((v) => !v)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {logisticsExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                  <CalendarIcon className="w-4 h-4 text-amber-600" />
                  <CardTitle className="text-base font-medium">
                    {language === "es" ? "Logística por Fecha" : "Per-Date Logistics"}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {dayLogistics.length > 0
                      ? `${dayLogistics.length} ${language === "es" ? "día(s)" : "day(s)"}`
                      : (language === "es" ? "Sin definir" : "Not set")}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {language === "es" ? "Entrega / Servicio" : "Delivery / Service"}
                </Badge>
              </div>
            </CardHeader>
            {logisticsExpanded && (
              <CardContent className="pt-0">
                {dayLogistics.length === 0 ? (
                  <div className="text-sm text-muted-foreground italic py-4 text-center">
                    {language === "es"
                      ? "Agrega una fila por cada fecha del evento (con su dirección, hora y notas de entrega)."
                      : "Add one row per event date (with address, time and delivery notes)."}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse" data-testid="day-logistics-table">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-medium text-xs">{language === "es" ? "Fecha" : "Date"}</th>
                          <th className="text-left px-2 py-1.5 font-medium text-xs">{language === "es" ? "Hora inicio" : "Start"}</th>
                          <th className="text-left px-2 py-1.5 font-medium text-xs">{language === "es" ? "Hora fin" : "End"}</th>
                          <th className="text-left px-2 py-1.5 font-medium text-xs">{language === "es" ? "Invitados" : "Guests"}</th>
                          <th className="text-left px-2 py-1.5 font-medium text-xs">{language === "es" ? "Dirección" : "Address"}</th>
                          <th className="text-left px-2 py-1.5 font-medium text-xs">{language === "es" ? "Instrucciones" : "Instructions"}</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayLogistics.map((d, idx) => (
                          <tr key={idx} className="border-b" data-testid={`logistics-row-${idx}`}>
                            <td className="px-1 py-1"><Input type="date" value={d.event_date || ""} disabled={isLocked}
                              onChange={(e) => updateLogisticsDay(idx, { event_date: e.target.value })}
                              onBlur={commitLogisticsDay} className="h-8 text-xs" /></td>
                            <td className="px-1 py-1"><Input type="time" value={d.delivery_time || ""} disabled={isLocked}
                              onChange={(e) => updateLogisticsDay(idx, { delivery_time: e.target.value })}
                              onBlur={commitLogisticsDay} className="h-8 text-xs w-[90px]" /></td>
                            <td className="px-1 py-1"><Input type="time" value={d.delivery_end_time || ""} disabled={isLocked}
                              onChange={(e) => updateLogisticsDay(idx, { delivery_end_time: e.target.value })}
                              onBlur={commitLogisticsDay} className="h-8 text-xs w-[90px]" /></td>
                            <td className="px-1 py-1"><Input type="number" min="0" value={d.guest_count ?? ""} disabled={isLocked}
                              onChange={(e) => updateLogisticsDay(idx, { guest_count: e.target.value === "" ? null : parseInt(e.target.value, 10) })}
                              onBlur={commitLogisticsDay} className="h-8 text-xs w-[70px]" /></td>
                            <td className="px-1 py-1"><Input value={d.address || ""} disabled={isLocked}
                              onChange={(e) => updateLogisticsDay(idx, { address: e.target.value })}
                              onBlur={commitLogisticsDay} placeholder={language === "es" ? "Dirección de entrega" : "Delivery address"} className="h-8 text-xs" /></td>
                            <td className="px-1 py-1"><Input value={d.instructions || ""} disabled={isLocked}
                              onChange={(e) => updateLogisticsDay(idx, { instructions: e.target.value })}
                              onBlur={commitLogisticsDay} placeholder={language === "es" ? "Notas para repartidor / chef" : "Notes for driver / chef"} className="h-8 text-xs" /></td>
                            <td className="px-1 py-1">
                              {!isLocked && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLogisticsDay(idx)} data-testid={`remove-logistics-${idx}`}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {!isLocked && (
                  <div className="pt-3">
                    <Button variant="outline" size="sm" onClick={addLogisticsDay} data-testid="add-logistics-day">
                      <Plus className="w-4 h-4 mr-1" />
                      {language === "es" ? "Agregar fecha" : "Add date"}
                    </Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* Add Item / Menu Buttons */}
          {!isLocked && (
            <div className="flex flex-wrap justify-end gap-2">
              {menus.length > 0 || platedMenus.length > 0 ? (
                <Button variant="outline" onClick={() => setAddMenuOpen(true)} className="gap-2" data-testid="add-menu-btn">
                  <Package className="w-4 h-4" />
                  {language === "es" ? "Agregar Menú" : "Add Menu"}
                  <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">{menus.length + platedMenus.length}</Badge>
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setAddMenuOpen(true)} className="gap-2 opacity-70" data-testid="add-menu-btn">
                  <Package className="w-4 h-4" />
                  {language === "es" ? "Agregar Menú" : "Add Menu"}
                </Button>
              )}
              {sectionTemplates.length > 0 && (
                <Button variant="outline" onClick={() => setApplyTemplateOpen(true)} className="gap-2" data-testid="apply-template-btn">
                  <Package className="w-4 h-4" />
                  {language === "es" ? "Usar plantilla" : "Use template"}
                </Button>
              )}
              {(proposal?.items?.length || 0) > 0 && (
                <Button
                  variant="outline"
                  onClick={() => { setSaveTemplateScope("pack"); setSaveTemplateSectionContext(null); setSaveTemplateName(""); setSaveTemplateOpen(true); }}
                  className="gap-2"
                  data-testid="save-template-btn"
                >
                  <FileText className="w-4 h-4" />
                  {language === "es" ? "Guardar como plantilla" : "Save as template"}
                </Button>
              )}
              {isMultidayEvent && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const days = getEventDays();
                    setDupDaySource(days[0] || null);
                    setDupDayTarget(days[1] || days[0] || null);
                    setDupDayMode("append");
                    setDupDayOpen(true);
                  }}
                  className="gap-2"
                  data-testid="duplicate-day-btn"
                >
                  <RefreshCw className="w-4 h-4" />
                  {language === "es" ? "Duplicar día" : "Duplicate day"}
                </Button>
              )}
              <Button onClick={() => { if (!editingItemId) resetNewItem(); setAddItemOpen(true); }} className="gap-2" data-testid="add-item-btn">
                <Plus className="w-4 h-4" />
                {language === "es" ? "Agregar Ítem" : "Add Item"}
              </Button>
            </div>
          )}

          {/* Recipe Scaling Panel (read-only) — only when Food Ops is enabled and recipes exist */}
          {featureFlags?.is_food_ops_enabled && recipes.length > 0 && !isLocked && (
            <details className="group" data-testid="recipe-scaling-section">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-2 select-none">
                <Calculator className="w-4 h-4" />
                {language === "es"
                  ? "Calculadora de escalado de recetas (opcional)"
                  : "Recipe scaling calculator (optional)"}
                <span className="text-[10px] text-muted-foreground group-open:hidden">
                  {language === "es" ? "abrir" : "open"}
                </span>
                <span className="text-[10px] text-muted-foreground hidden group-open:inline">
                  {language === "es" ? "cerrar" : "close"}
                </span>
              </summary>
              <div className="mt-3">
                <RecipeScalingPanel
                  recipes={recipes}
                  defaultPortions={event?.guest_count || event?.num_guests || 0}
                />
              </div>
            </details>
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
                        <CardTitle className="text-base font-medium flex items-center gap-2">
                          {typeData.label || itype}
                          {ORPHAN_TYPES.has(itype) && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-5 px-1.5 border-amber-400 bg-amber-50 text-amber-700"
                              title={language === "es"
                                ? `Tipo "${itype}" no está en Settings → Tipos de Ítems. Estos ítems salen en el PDF pero antes no se veían en el editor. Reasígnalos a un tipo válido.`
                                : `Type "${itype}" is not in Settings → Item Types. These items appear in the PDF but were previously hidden in the editor. Reassign them to a valid type.`}
                              data-testid={`orphan-type-warning-${itype}`}
                            >
                              {language === "es" ? "Tipo no configurado" : "Unconfigured type"}
                            </Badge>
                          )}
                        </CardTitle>
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
                  <CardContent className="pt-0 space-y-4">
                    {(() => {
                      const sections = groupBySections(typeData.items, itype);
                      // Build the full sortable id list: section headers + their items, in order.
                      // This lets DnD detect section drags via the "sectionhdr::" prefix
                      // while still allowing items to be reordered.
                      const sortableIds = sections.flatMap((s) => [
                        `sectionhdr::${s.title || ""}`,
                        ...s.items.map((i) => i.item_id),
                      ]);
                      return (
                        <DndContext
                          sensors={dndSensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(ev) => handleDragEndForType(itype, ev)}
                        >
                          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                          {sections.map((section, sectionIdx) => {
                            const sectionKey = `${itype}::${section.title || ""}`;
                            const isEditing = editingSectionKey === sectionKey;
                            const sectionDragId = `sectionhdr::${section.title || ""}`;
                            const canMoveUp = sectionIdx > 0;
                            const canMoveDown = sectionIdx < sections.length - 1;
                            return (
                              <SortableSectionWrapper
                                key={sectionKey}
                                id={sectionDragId}
                                disabled={isLocked || isEditing}
                              >
                                {(dragHandleProps) => (
                              <div className="border rounded-lg overflow-hidden mb-3" data-testid={`section-${itype}-${section.title || "default"}`}>
                                {/* Section header (only if has a title or it's the only-but-empty draft) */}
                                {(section.title || section.isDraft) && (
                                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 border-b">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      {dragHandleProps ? (
                                        <button {...dragHandleProps} title={language === "es" ? "Arrastrar sección" : "Drag section"}>
                                          <GripVertical className="w-3.5 h-3.5" />
                                        </button>
                                      ) : (
                                        <span className="inline-flex items-center justify-center w-6 h-6 -ml-1 text-muted-foreground/30">
                                          <GripVertical className="w-3.5 h-3.5" />
                                        </span>
                                      )}
                                      {/* Up / Down arrows — keyboard- and mobile-friendly fallback to drag */}
                                      {!isLocked && !isEditing && (sections.length > 1) && (
                                        <div className="flex items-center -ml-0.5">
                                          <button
                                            type="button"
                                            disabled={!canMoveUp}
                                            onClick={() => moveSection(itype, section.title || "", "up")}
                                            className="inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                                            title={language === "es" ? "Subir sección" : "Move section up"}
                                            data-testid={`section-move-up-${section.title || "default"}`}
                                          >
                                            <ArrowUp className="w-3 h-3" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={!canMoveDown}
                                            onClick={() => moveSection(itype, section.title || "", "down")}
                                            className="inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                                            title={language === "es" ? "Bajar sección" : "Move section down"}
                                            data-testid={`section-move-down-${section.title || "default"}`}
                                          >
                                            <ArrowDown className="w-3 h-3" />
                                          </button>
                                        </div>
                                      )}
                                      <Type className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                      {isEditing ? (
                                        <Input
                                          autoFocus
                                          value={editingSectionValue}
                                          onChange={(e) => setEditingSectionValue(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") handleRenameSection(itype, section.title, editingSectionValue);
                                            if (e.key === "Escape") setEditingSectionKey(null);
                                          }}
                                          onBlur={() => handleRenameSection(itype, section.title, editingSectionValue)}
                                          className="h-7 text-sm"
                                          data-testid={`section-rename-input-${section.title}`}
                                        />
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (isLocked) return;
                                            setEditingSectionKey(sectionKey);
                                            setEditingSectionValue(section.title || "");
                                          }}
                                          className="text-sm font-semibold truncate text-left hover:text-primary transition-colors"
                                          data-testid={`section-title-${section.title}`}
                                        >
                                          {section.title || (language === "es" ? "(sin título)" : "(untitled)")}
                                          {section.isDraft && (
                                            <Badge variant="outline" className="ml-2 text-[9px] h-4 px-1">
                                              {language === "es" ? "borrador" : "draft"}
                                            </Badge>
                                          )}
                                        </button>
                                      )}
                                      <span className="text-xs text-muted-foreground shrink-0">
                                        · {section.items.length} {language === "es" ? "ítems" : "items"}
                                      </span>
                                      {/* Section date chips — read-only summary of every distinct
                                          event_date that appears in the section's items. Replaces the
                                          previous bulk Select that overwrote ALL items' dates on change. */}
                                      {dayLogistics.length > 0 && section.items.length > 0 && (() => {
                                        const distinctDates = Array.from(
                                          new Set(
                                            section.items
                                              .map((i) => i.event_date ? String(i.event_date).slice(0, 10) : null)
                                              .filter(Boolean)
                                          )
                                        ).sort();
                                        if (distinctDates.length === 0) {
                                          return (
                                            <span
                                              className="text-[11px] text-muted-foreground italic"
                                              title={language === "es" ? "Los ítems aún no tienen fecha asignada" : "Items have no date yet"}
                                            >
                                              {language === "es" ? "sin fecha" : "no date"}
                                            </span>
                                          );
                                        }
                                        return (
                                          <div className="flex flex-wrap items-center gap-1" data-testid={`section-date-chips-${section.title || "default"}`}>
                                            {distinctDates.map((d) => {
                                              const dt = new Date(d + "T12:00:00");
                                              const label = dt.toLocaleDateString(language === "es" ? "es" : "en", { month: "short", day: "numeric" });
                                              return (
                                                <span key={d} className="inline-flex items-center text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-[1px]">
                                                  {label}
                                                </span>
                                              );
                                            })}
                                          </div>
                                        );
                                      })()}
                                      {/* Replicate section across all days — clones every item N times,
                                          one per day in dayLogistics, so the user gets "Bocadillos · día N"
                                          without re-typing. Disabled if section is empty or single-day event. */}
                                      {!isLocked && dayLogistics.length > 1 && section.items.length > 0 && (() => {
                                        const distinctDatesInSection = new Set(
                                          section.items.map((i) => i.event_date ? String(i.event_date).slice(0, 10) : null).filter(Boolean)
                                        );
                                        const missingDates = dayLogistics
                                          .map((d) => d?.event_date ? String(d.event_date).slice(0, 10) : null)
                                          .filter((d) => d && !distinctDatesInSection.has(d));
                                        if (missingDates.length === 0) return null;
                                        return (
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-6 text-[10px] px-2 gap-1"
                                            onClick={() => handleReplicateSectionAcrossDays(itype, section.title, missingDates)}
                                            data-testid={`section-replicate-${section.title || "default"}`}
                                            title={language === "es" ? `Crear copias para ${missingDates.length} día(s) restante(s)` : `Create copies for ${missingDates.length} more day(s)`}
                                          >
                                            <Copy className="w-3 h-3" />
                                            {language === "es" ? `+${missingDates.length} días` : `+${missingDates.length} days`}
                                          </Button>
                                        );
                                      })()}
                                      {/* Section service time range */}
                                      {(() => {
                                        const firstWithTime = section.items.find(i => i.section_time);
                                        const firstWithEnd = section.items.find(i => i.section_end_time);
                                        const currentTime = firstWithTime?.section_time || "";
                                        const currentEnd = firstWithEnd?.section_end_time || "";
                                        return (
                                          <div className="flex items-center gap-1 ml-1" data-testid={`section-time-${section.title || "default"}`}>
                                            <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                                            <Input
                                              type="time"
                                              defaultValue={currentTime}
                                              key={`start-${section.title}-${currentTime}`}
                                              disabled={isLocked}
                                              onBlur={(e) => {
                                                if (e.target.value !== currentTime) handleSectionTimeChange(itype, section.title, e.target.value, "section_time");
                                              }}
                                              className="h-6 w-[78px] text-[11px] px-1 border-muted-foreground/20 bg-white"
                                              title={language === "es" ? "Hora inicio de servicio (formato 24h)" : "Service start time (24h)"}
                                            />
                                            <span className="text-[10px] text-muted-foreground">→</span>
                                            <Input
                                              type="time"
                                              defaultValue={currentEnd}
                                              key={`end-${section.title}-${currentEnd}`}
                                              disabled={isLocked}
                                              onBlur={(e) => {
                                                if (e.target.value !== currentEnd) handleSectionTimeChange(itype, section.title, e.target.value, "section_end_time");
                                              }}
                                              className="h-6 w-[78px] text-[11px] px-1 border-muted-foreground/20 bg-white"
                                              title={language === "es" ? "Hora fin de servicio (formato 24h)" : "Service end time (24h)"}
                                            />
                                          </div>
                                        );
                                      })()}
                                      {/* Section subtotal */}
                                      {(() => {
                                        const subtotal = section.items.reduce((s, it) => s + (it.total_price || 0), 0);
                                        if (subtotal <= 0) return null;
                                        return (
                                          <Badge variant="secondary" className="font-mono text-xs ml-1" data-testid={`section-subtotal-${section.title || "default"}`}>
                                            ${subtotal.toFixed(2)}
                                          </Badge>
                                        );
                                      })()}
                                    </div>
                                    {!isLocked && !isEditing && (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 text-muted-foreground hover:text-emerald-600"
                                          onClick={() => {
                                            setSaveTemplateScope("section");
                                            setSaveTemplateSectionContext({ itype, section_title: section.title });
                                            setSaveTemplateName(section.title || "");
                                            setSaveTemplateOpen(true);
                                          }}
                                          data-testid={`section-save-template-${section.title}`}
                                          title={language === "es" ? "Guardar esta sección como plantilla" : "Save this section as template"}
                                        >
                                          <FileText className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                          onClick={() => handleDeleteSection(itype, section.title)}
                                          data-testid={`section-delete-${section.title}`}
                                          title={language === "es" ? "Quitar sección (mantiene ítems)" : "Remove section (keeps items)"}
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                )}
                                {/* Drop-zone: section header acts as drop target too */}
                                  <div className="divide-y">
                                    {section.items.length === 0 ? (
                                      <EmptySectionDropzone
                                        id={`section::${section.title || ""}`}
                                        label={language === "es"
                                          ? "Arrastra ítems aquí o crea uno nuevo"
                                          : "Drag items here or add a new one"}
                                      />
                                    ) : (
                                      section.items.filter((it) => !it.parent_item_id).map((item) => {
                                        const childItems = section.items.filter((c) => c.parent_item_id === item.item_id);
                                        return (
                                        <SortableItemRow key={item.item_id} id={item.item_id}>
                                          <div
                                            className="flex flex-col"
                                            data-testid={`order-item-${item.item_id}`}
                                          >
                                          <div className="flex items-center gap-4 p-3 hover:bg-muted/30 transition-colors">
                                            <div className="flex-1 min-w-0">
                                              <p className="font-medium leading-tight">{item.description}</p>
                                              {item.long_description && (
                                                <p className="text-xs text-muted-foreground mt-1 leading-snug whitespace-pre-line">
                                                  {item.long_description}
                                                </p>
                                              )}
                                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                {(() => {
                                                  const dt = item.discount_type || (item.discount_pct ? "percentage" : null);
                                                  const dv = item.discount_value != null ? item.discount_value : item.discount_pct;
                                                  if (!dv || dv <= 0) return null;
                                                  const label = dt === "fixed" ? `-$${Number(dv).toFixed(2)}` : `-${Number(dv)}%`;
                                                  return (
                                                    <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 font-medium">
                                                      {label}
                                                    </span>
                                                  );
                                                })()}
                                                {item.tax_exempt && (
                                                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-medium">
                                                    {language === "es" ? "Exento" : "Tax exempt"}
                                                  </span>
                                                )}
                                              </div>
                                              {item.internal_notes && (
                                                <p className="text-xs text-warning mt-1 italic">
                                                  📝 {item.internal_notes}
                                                </p>
                                              )}
                                              {featureFlags?.is_margin_tracking_enabled && item.internal_cost !== null && (
                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                  <span className={`text-xs ${item.margin_percentage < 20 ? 'text-destructive' : item.margin_percentage > 50 ? 'text-success' : 'text-muted-foreground'}`}>
                                                    {language === "es" ? "Margen" : "Margin"}: {item.margin_percentage?.toFixed(0)}%
                                                  </span>
                                                  {(() => {
                                                    const sugg = getSuggestedUnitPrice(item);
                                                    if (sugg == null || item.unit_price == null) return null;
                                                    const isBelow = item.unit_price < sugg - 0.01;
                                                    if (!isBelow) return null;
                                                    return (
                                                      <span className="text-xs text-emerald-700 inline-flex items-center gap-1" data-testid={`suggested-price-${item.item_id}`}>
                                                        💡 {language === "es" ? "Precio sugerido" : "Suggested"}: <strong>${sugg.toFixed(2)}</strong>
                                                      </span>
                                                    );
                                                  })()}
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
                                              <>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="text-muted-foreground hover:text-emerald-600"
                                                  onClick={() => handleAddComponentItem(item)}
                                                  data-testid={`add-component-${item.item_id}`}
                                                  title={language === "es" ? "Agregar componente / sub-ítem" : "Add component / sub-item"}
                                                >
                                                  <Plus className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="text-muted-foreground hover:text-foreground"
                                                  onClick={() => handleEditItem(item)}
                                                  data-testid={`edit-item-${item.item_id}`}
                                                  title={language === "es" ? "Editar" : "Edit"}
                                                >
                                                  <Edit className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="text-destructive hover:text-destructive"
                                                  onClick={() => handleDeleteItem(item.item_id)}
                                                >
                                                  <Trash2 className="w-4 h-4" />
                                                </Button>
                                              </>
                                            )}
                                          </div>
                                          {/* Nested children / components */}
                                          {childItems.length > 0 && (
                                            <div className="pl-8 pr-3 pb-2 space-y-1 bg-slate-50/50 border-l-2 border-slate-200 ml-3" data-testid={`children-${item.item_id}`}>
                                              {childItems.map((ch) => (
                                                <div key={ch.item_id} className="flex items-center gap-2 text-sm py-1.5" data-testid={`child-item-${ch.item_id}`}>
                                                  <span className="text-muted-foreground text-xs">└─</span>
                                                  <span className="flex-1 truncate">{ch.description}</span>
                                                  <span className="text-xs text-muted-foreground">{ch.quantity}{ch.unit_price > 0 ? ` × $${ch.unit_price.toFixed(2)}` : ` · ${language === "es" ? "incluido" : "included"}`}</span>
                                                  <span className="font-medium w-20 text-right text-sm">
                                                    {ch.total_price > 0 ? `$${ch.total_price.toFixed(2)}` : "—"}
                                                  </span>
                                                  {!isLocked && (
                                                    <>
                                                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                                        onClick={() => handleEditItem(ch)} title={language === "es" ? "Editar" : "Edit"}>
                                                        <Edit className="w-3 h-3" />
                                                      </Button>
                                                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                                                        onClick={() => handleDeleteItem(ch.item_id)}>
                                                        <Trash2 className="w-3 h-3" />
                                                      </Button>
                                                    </>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                          </div>
                                        </SortableItemRow>
                                      );})
                                    )}
                                  </div>
                              </div>
                                )}
                              </SortableSectionWrapper>
                            );
                          })}
                          </SortableContext>
                        </DndContext>
                      );
                    })()}

                    {/* + Nueva sección */}
                    {!isLocked && (
                      <div className="pt-2">
                        {newSectionForType === itype ? (
                          <div className="flex items-center gap-2">
                            <Input
                              autoFocus
                              value={newSectionTitle}
                              onChange={(e) => setNewSectionTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleAddSection(itype);
                                if (e.key === "Escape") { setNewSectionForType(null); setNewSectionTitle(""); }
                              }}
                              placeholder={language === "es" ? "Ej: Bocadillos Salados" : "E.g. Salty Bites"}
                              className="h-8 text-sm"
                              data-testid={`new-section-input-${itype}`}
                            />
                            <Button size="sm" onClick={() => handleAddSection(itype)} data-testid={`new-section-save-${itype}`}>
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setNewSectionForType(null); setNewSectionTitle(""); }}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => { setNewSectionForType(itype); setNewSectionTitle(""); }}
                            data-testid={`new-section-btn-${itype}`}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            {language === "es" ? "Nueva sección" : "New section"}
                          </Button>
                        )}
                      </div>
                    )}
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
                  <Button onClick={() => { resetNewItem(); setAddItemOpen(true); }} className="mt-4 gap-2">
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
                    {language === "es" ? `Notas para el ${clientLabel}` : `${clientLabel} Notes`}
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
            <CardContent className="space-y-6">
              {/* Existing Invoices */}
              {existingInvoices.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
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

              {/* Client-Facing Documents Section */}
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-3 flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  {language === "es" ? `Documentos para el ${clientLabel}` : `${clientLabel}-Facing Documents`}
                </h4>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Proposal/Contract */}
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2 hover:border-primary"
                    onClick={() => { setPreviewDocType("proposal"); setPreviewOpen(true); }}
                    disabled={!proposal?.items?.length}
                    data-testid="generate-proposal-btn"
                  >
                    <FileText className="w-6 h-6 text-blue-500" />
                    <span className="font-medium text-sm">{language === "es" ? "Propuesta / Contrato" : "Proposal / Contract"}</span>
                  </Button>

                  {/* Invoice Preview */}
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2 hover:border-primary"
                    onClick={() => { setPreviewDocType("invoice"); setPreviewOpen(true); }}
                    disabled={!proposal?.items?.length}
                    data-testid="preview-invoice-btn"
                  >
                    <Eye className="w-6 h-6 text-green-500" />
                    <span className="font-medium text-sm">{language === "es" ? "Vista Previa Factura" : "Invoice Preview"}</span>
                  </Button>

                  {/* Create Invoice - Business Clarity */}
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2 hover:border-primary hover:bg-green-50 border-green-200"
                    onClick={handleOpenInvoiceDialog}
                    disabled={!proposal?.items?.length || !event?.client_id || !getInvoiceEligibility().canInvoice}
                    data-testid="create-invoice-btn"
                  >
                    <DollarSign className="w-6 h-6 text-green-600" />
                    <span className="font-medium text-sm text-green-700">{language === "es" ? "Crear Factura" : "Create Invoice"}</span>
                  </Button>
                </div>
              </div>

              {/* Internal Documents Section */}
              {documentTypes.internal.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {language === "es" ? "Documentos Internos / Operativos" : "Internal / Operational Documents"}
                  </h4>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {documentTypes.internal.map((docType) => (
                      <Button
                        key={docType.type}
                        variant="outline"
                        className="h-auto py-4 flex flex-col items-center gap-2 hover:border-muted-foreground/50 text-muted-foreground"
                        onClick={() => { setPreviewDocType(docType.type); setPreviewOpen(true); }}
                        disabled={!proposal?.items?.length}
                        data-testid={`generate-${docType.type}-btn`}
                      >
                        <FileText className="w-6 h-6" />
                        <span className="font-medium text-sm">{language === "es" ? docType.name_es : docType.name}</span>
                        {docType.description_es && (
                          <span className="text-xs text-center opacity-70">{language === "es" ? docType.description_es : docType.description}</span>
                        )}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              
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
          proposal={{ ...proposal, day_logistics: dayLogistics }}
          client={client}
          documentType={previewDocType}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {/* Save Template Dialog */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              {language === "es" ? "Guardar como plantilla" : "Save as template"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {saveTemplateScope === "section"
                ? (language === "es"
                    ? `Guardarás solo la sección "${saveTemplateSectionContext?.section_title || "(sin título)"}" como plantilla reutilizable.`
                    : `You'll save only the "${saveTemplateSectionContext?.section_title || "(untitled)"}" section as a reusable template.`)
                : (language === "es"
                    ? "Guardarás todas las secciones (con sus títulos e ítems) para reutilizarlas en otras propuestas (ej: Cóctel de Bienvenida + Cena + Postre)."
                    : "You'll save all sections (with their titles and items) to reuse in other proposals (e.g. Welcome Cocktail + Dinner + Dessert).")}
            </p>
            <div>
              <Label className="text-sm">{language === "es" ? "Nombre de la plantilla" : "Template name"}</Label>
              <Input
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                placeholder={language === "es" ? "Ej: Boda 100 pax - Cóctel + Cena + Postre" : "E.g. Wedding 100 pax - Cocktail + Dinner + Dessert"}
                data-testid="save-template-name"
                autoFocus
              />
            </div>
            <Button onClick={handleSaveTemplate} className="w-full" data-testid="save-template-submit">
              {language === "es" ? "Guardar plantilla" : "Save template"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Apply Template Dialog */}
      <Dialog open={applyTemplateOpen} onOpenChange={setApplyTemplateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-emerald-600" />
              {language === "es" ? "Usar plantilla" : "Use template"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Price source toggle */}
            <div className="rounded-lg border p-3 bg-muted/30">
              <Label className="text-xs font-semibold text-muted-foreground uppercase">
                {language === "es" ? "Precios al aplicar" : "Prices on apply"}
              </Label>
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant={!useCurrentPrices ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUseCurrentPrices(false)}
                  className="flex-1 h-auto py-2"
                  data-testid="price-mode-snapshot"
                >
                  <div className="text-left">
                    <div className="text-xs font-semibold">{language === "es" ? "Snapshot" : "Snapshot"}</div>
                    <div className="text-[10px] opacity-80">{language === "es" ? "Precios guardados" : "Saved prices"}</div>
                  </div>
                </Button>
                <Button
                  type="button"
                  variant={useCurrentPrices ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUseCurrentPrices(true)}
                  className="flex-1 h-auto py-2"
                  data-testid="price-mode-current"
                >
                  <div className="text-left">
                    <div className="text-xs font-semibold">{language === "es" ? "Actuales" : "Current"}</div>
                    <div className="text-[10px] opacity-80">{language === "es" ? "Del catálogo" : "From catalog"}</div>
                  </div>
                </Button>
              </div>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {sectionTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {language === "es" ? "No tienes plantillas guardadas aún." : "No saved templates yet."}
                </p>
              ) : (
                sectionTemplates.map((tpl) => {
                  const sectionCount = new Set((tpl.items || []).map(i => i.section_title || "")).size;
                  const check = sectionTemplateChecks[tpl.template_id];
                  const staleCount = check?.stale_count || 0;
                  return (
                    <div
                      key={tpl.template_id}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/40 transition-colors"
                      data-testid={`template-row-${tpl.template_id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{tpl.name}</p>
                          {staleCount > 0 && (
                            <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 bg-amber-50 shrink-0">
                              <AlertTriangle className="w-3 h-3 mr-0.5" />
                              {staleCount} {language === "es" ? "desactualizados" : "outdated"}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {(tpl.items || []).length} {language === "es" ? "ítems" : "items"} · {sectionCount} {language === "es" ? "secciones" : "sections"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openReviewTemplate(tpl.template_id)}
                        data-testid={`template-review-${tpl.template_id}`}
                        title={language === "es" ? "Revisar plantilla" : "Review template"}
                      >
                        {language === "es" ? "Revisar" : "Review"}
                      </Button>
                      <Button size="sm" onClick={() => handleApplyTemplate(tpl.template_id)} data-testid={`template-apply-${tpl.template_id}`}>
                        {language === "es" ? "Usar" : "Use"}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteTemplate(tpl.template_id)}
                        title={language === "es" ? "Eliminar plantilla" : "Delete template"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Template Dialog */}
      <Dialog open={reviewTemplateOpen} onOpenChange={setReviewTemplateOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-emerald-600" />
              {language === "es" ? "Revisar plantilla" : "Review template"}: {reviewTemplate?.name}
            </DialogTitle>
          </DialogHeader>
          {reviewTemplate && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <Badge>{(reviewTemplate.items || []).length} {language === "es" ? "ítems" : "items"}</Badge>
                  {reviewTemplate.stale_count > 0 ? (
                    <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {reviewTemplate.stale_count} {language === "es" ? "desactualizados" : "outdated"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-400 text-emerald-700 bg-emerald-50">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      {language === "es" ? "Todo actualizado" : "All up to date"}
                    </Badge>
                  )}
                </div>
                {reviewTemplate.stale_count > 0 && (
                  <Button
                    size="sm"
                    onClick={() => handleRefreshTemplate(reviewTemplate.template_id)}
                    data-testid="template-refresh-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />
                    {language === "es" ? "Actualizar todo" : "Update all"}
                  </Button>
                )}
              </div>

              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-2 py-2 font-medium">{language === "es" ? "Sección" : "Section"}</th>
                      <th className="text-left px-2 py-2 font-medium">{language === "es" ? "Ítem" : "Item"}</th>
                      <th className="text-right px-2 py-2 font-medium">{language === "es" ? "Precio snap" : "Snap price"}</th>
                      <th className="text-right px-2 py-2 font-medium">{language === "es" ? "Precio actual" : "Current price"}</th>
                      <th className="text-right px-2 py-2 font-medium">{language === "es" ? "Costo snap" : "Snap cost"}</th>
                      <th className="text-right px-2 py-2 font-medium">{language === "es" ? "Costo actual" : "Current cost"}</th>
                      <th className="text-center px-2 py-2 font-medium w-24">{language === "es" ? "Acción" : "Action"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reviewTemplate.items || []).map((it) => {
                      const stale = it._is_stale_price || it._is_stale_cost;
                      return (
                        <tr key={it._idx} className={`border-t ${stale ? "bg-amber-50/50" : ""}`}>
                          <td className="px-2 py-2 text-muted-foreground">{it.section_title || "—"}</td>
                          <td className="px-2 py-2 truncate max-w-[280px]">{it.description}</td>
                          <td className={`px-2 py-2 text-right font-mono ${it._is_stale_price ? "text-amber-700 font-semibold" : ""}`}>
                            ${(it.unit_price || 0).toFixed(2)}
                          </td>
                          <td className={`px-2 py-2 text-right font-mono ${it._is_stale_price ? "text-emerald-700 font-semibold" : "text-muted-foreground"}`}>
                            {it._current_price != null ? `$${it._current_price.toFixed(2)}` : "—"}
                          </td>
                          <td className={`px-2 py-2 text-right font-mono ${it._is_stale_cost ? "text-amber-700 font-semibold" : "text-muted-foreground"}`}>
                            {it.internal_cost != null ? `$${it.internal_cost.toFixed(2)}` : "—"}
                          </td>
                          <td className={`px-2 py-2 text-right font-mono ${it._is_stale_cost ? "text-emerald-700 font-semibold" : "text-muted-foreground"}`}>
                            {it._current_cost != null ? `$${it._current_cost.toFixed(2)}` : "—"}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {stale ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => handleRefreshTemplate(reviewTemplate.template_id, [it._idx])}
                                data-testid={`template-refresh-item-${it._idx}`}
                              >
                                <RefreshCw className="w-3 h-3 mr-1" />
                                {language === "es" ? "Refrescar" : "Refresh"}
                              </Button>
                            ) : it._has_reference ? (
                              <Check className="w-4 h-4 text-emerald-600 inline" />
                            ) : (
                              <span className="text-[10px] text-muted-foreground italic">{language === "es" ? "sin ref" : "no ref"}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {language === "es"
                  ? "Los ítems sin referencia (\"sin ref\") fueron creados manualmente y no se pueden refrescar automáticamente."
                  : "Items without reference (\"no ref\") were created manually and cannot be auto-refreshed."}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Duplicate Day Dialog */}
      <Dialog open={dupDayOpen} onOpenChange={setDupDayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-emerald-600" />
              {language === "es" ? "Duplicar día" : "Duplicate day"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {language === "es"
                ? "Copia todos los ítems (con sus secciones) de un día a otro."
                : "Copy all items (with their sections) from one day to another."}
            </p>
            <div>
              <Label className="text-sm">{language === "es" ? "Día origen" : "Source day"}</Label>
              <Select value={dupDaySource || ""} onValueChange={(v) => setDupDaySource(v)}>
                <SelectTrigger data-testid="dup-day-source"><SelectValue placeholder={language === "es" ? "Selecciona día" : "Pick day"} /></SelectTrigger>
                <SelectContent>
                  {getEventDays().map((d, i) => (
                    <SelectItem key={d} value={d}>
                      {language === "es" ? `Día ${i + 1}` : `Day ${i + 1}`} · {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">{language === "es" ? "Día destino" : "Target day"}</Label>
              <Select value={dupDayTarget || ""} onValueChange={(v) => setDupDayTarget(v)}>
                <SelectTrigger data-testid="dup-day-target"><SelectValue placeholder={language === "es" ? "Selecciona día" : "Pick day"} /></SelectTrigger>
                <SelectContent>
                  {getEventDays().filter(d => d !== dupDaySource).map((d, i) => {
                    const idx = getEventDays().indexOf(d);
                    return (
                      <SelectItem key={d} value={d}>
                        {language === "es" ? `Día ${idx + 1}` : `Day ${idx + 1}`} · {d}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">{language === "es" ? "Modo" : "Mode"}</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  type="button"
                  variant={dupDayMode === "append" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDupDayMode("append")}
                  className="flex-1"
                  data-testid="dup-mode-append"
                >
                  {language === "es" ? "Agregar (sumar)" : "Append (add)"}
                </Button>
                <Button
                  type="button"
                  variant={dupDayMode === "replace" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDupDayMode("replace")}
                  className="flex-1"
                  data-testid="dup-mode-replace"
                >
                  {language === "es" ? "Reemplazar" : "Replace"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {dupDayMode === "replace"
                  ? (language === "es" ? "Borrará los ítems existentes en el día destino antes de copiar." : "Will delete existing items in target day before copying.")
                  : (language === "es" ? "Los ítems existentes en el día destino se mantienen." : "Existing items in target day are kept.")}
              </p>
            </div>
            <Button onClick={handleDuplicateDay} className="w-full" data-testid="dup-day-submit">
              {language === "es" ? "Duplicar" : "Duplicate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={addItemOpen} onOpenChange={(open) => {
        setAddItemOpen(open);
        if (!open) {
          setSelectedPicklistCategory("");
          setPicklistSearch("");
          setEditingItemId(null);
          resetNewItem();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItemId
                ? (language === "es" ? "Editar Ítem" : "Edit Item")
                : (language === "es" ? "Agregar Ítem" : "Add Item")}
            </DialogTitle>
          </DialogHeader>
          
          {/* Quick Picks: categorized picklist (Snacks, Rentals, Services, Food) */}
          <div className="mb-4 border rounded-lg p-4 bg-muted/30 space-y-3">
            <Label className="block text-sm font-medium">
              {language === "es" ? "Atajos rápidos" : "Quick Picks"}
            </Label>

            {/* Categorized Picklist items (Food/Snacks, Rentals, Services, Fees) */}
            {picklist.length > 0 ? (
              <div>
                <Input
                  placeholder={language === "es" ? "Buscar bocadillo, alquiler, servicio..." : "Search snack, rental, service..."}
                  value={picklistSearch}
                  onChange={(e) => setPicklistSearch(e.target.value)}
                  className="mb-2"
                  data-testid="picklist-search-input"
                />
                {(() => {
                  // Group picklist items by item_type using the order/labels
                  // configured in Settings → Catálogos → Tipos de Ítems.
                  const q = picklistSearch.toLowerCase();
                  const matching = picklist.filter((i) => !q || i.name.toLowerCase().includes(q) || (i.description || "").toLowerCase().includes(q));
                  const groups = matching.reduce((acc, i) => {
                    const k = i.item_type || "Other";
                    (acc[k] = acc[k] || []).push(i);
                    return acc;
                  }, {});
                  const labelFor = (k) => {
                    const lbl = getItemTypeLabel(k);
                    if (lbl && lbl !== k) return lbl;
                    return k === "Other" ? (language === "es" ? "Otros" : "Other") : k;
                  };
                  // Order: first follow ITEM_TYPES (from settings), then any
                  // remaining keys present in items (e.g., legacy "Other").
                  const sortedKeys = ITEM_TYPES.filter((k) => groups[k]?.length > 0)
                    .concat(Object.keys(groups).filter((k) => !ITEM_TYPES.includes(k)));
                  if (sortedKeys.length === 0) {
                    return <p className="text-xs text-muted-foreground text-center py-2">{language === "es" ? "Sin resultados" : "No results"}</p>;
                  }
                  return (
                    <div className="max-h-60 overflow-y-auto space-y-2" data-testid="picklist-grouped">
                      {sortedKeys.map((k) => (
                        <div key={k}>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{labelFor(k)}</p>
                          <div className="space-y-0.5">
                            {groups[k].slice(0, 12).map((item) => (
                              <div
                                key={item.item_id}
                                className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-background cursor-pointer border border-transparent hover:border-border"
                                onClick={() => { handlePicklistSelect(item); setPicklistSearch(""); }}
                                data-testid={`picklist-item-${item.item_id}`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-medium text-sm truncate">{item.name}</span>
                                  {item.recipe_id && <Badge variant="outline" className="text-[9px] h-4 px-1">Recipe</Badge>}
                                  {item.inventory_item_id && <Badge variant="outline" className="text-[9px] h-4 px-1">Inv</Badge>}
                                </div>
                                <span className="text-xs font-mono text-muted-foreground flex-shrink-0">${(item.default_price || 0).toFixed(2)}</span>
                              </div>
                            ))}
                            {groups[k].length > 12 && (
                              <p className="text-[10px] text-muted-foreground px-2">
                                +{groups[k].length - 12} {language === "es" ? "más" : "more"}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">
                {language === "es"
                  ? "Configura tu picklist en Ajustes → Catálogos → Tipos de Ítems para tener atajos rápidos."
                  : "Configure your picklist in Settings → Catalogs → Item Types for quick shortcuts."}
              </p>
            )}
          </div>

          {/* Recipes Section (for food items) - Searchable picker with portion format + margin awareness */}
          {featureFlags?.is_food_ops_enabled && recipes.length > 0 && (
            <div className="mb-4">
              <Label className="mb-2 block text-sm">
                {language === "es" ? "Desde Receta (con costos en vivo)" : "From Recipe (with live costs)"}
              </Label>
              <RecipePicker
                recipes={recipes}
                onPick={handleRecipeSelect}
                triggerLabel={language === "es" ? "+ Buscar receta y elegir formato..." : "+ Search recipe & pick format..."}
                triggerTestId="proposal-recipe-picker"
              />
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
                  placeholder={language === "es" ? `Descripción visible al ${clientLabel.toLowerCase()}` : `${clientLabel}-facing description`}
                  rows={2}
                  required
                  data-testid="item-description-input"
                />
              </div>

              {/* Long description (recipe description) */}
              <div className="col-span-2">
                <Label className="flex items-center gap-2">
                  {language === "es" ? "Descripción larga" : "Long description"}
                  <span className="text-xs text-muted-foreground font-normal">
                    {language === "es" ? "(aparece bajo el ítem en la propuesta)" : "(shown under the item on the proposal)"}
                  </span>
                </Label>
                <Textarea
                  value={newItem.long_description || ""}
                  onChange={(e) => setNewItem({ ...newItem, long_description: e.target.value })}
                  placeholder={language === "es"
                    ? "Ej: Lechuga romana con aderezo César, queso parmesano fresco y crutones crujientes."
                    : "E.g.: Crisp romaine with Caesar dressing, fresh parmesan and crunchy croutons."}
                  rows={2}
                  data-testid="item-long-description-input"
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
                {(() => {
                  const sugg = getSuggestedUnitPrice(newItem);
                  if (sugg == null) return null;
                  const below = (newItem.unit_price || 0) < sugg - 0.01;
                  return (
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs">
                      <span className={`inline-flex items-center gap-1 ${below ? "text-emerald-700" : "text-muted-foreground"}`}>
                        💡 {language === "es" ? "Sugerido" : "Suggested"}: <strong>${sugg.toFixed(2)}</strong>
                      </span>
                      {below && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                          onClick={() => setNewItem({ ...newItem, unit_price: Number(sugg.toFixed(2)) })}
                          data-testid="apply-suggested-price"
                        >
                          {language === "es" ? "Aplicar" : "Apply"}
                        </Button>
                      )}
                    </div>
                  );
                })()}
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
                    data-testid="item-internal-cost-input"
                  />
                  {newItem.internal_cost !== null && newItem.unit_price > 0 && (() => {
                    const marginPct = (newItem.unit_price - newItem.internal_cost) / newItem.unit_price * 100;
                    const isLow = marginPct < 20;
                    const isHealthy = marginPct >= 30;
                    const cls = isLow ? "bg-red-100 text-red-700 border-red-200" : isHealthy ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200";
                    return (
                      <div className={`mt-1.5 inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs ${cls}`} data-testid="margin-badge">
                        {isLow && <AlertTriangle className="w-3 h-3" />}
                        <span className="font-semibold">{marginPct.toFixed(0)}%</span>
                        <span className="opacity-80">{language === "es" ? "margen" : "margin"}</span>
                        {isLow && <span className="opacity-90">· {language === "es" ? "muy bajo" : "very low"}</span>}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Per-item Discount with $ / % selector */}
              <div className="col-span-2">
                <Label>{language === "es" ? "Descuento" : "Discount"}</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={newItem.discount_type || "percentage"}
                    onValueChange={(t) => setNewItem({ ...newItem, discount_type: t })}
                  >
                    <SelectTrigger className="w-20" data-testid="item-discount-type">
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
                    max={newItem.discount_type === "percentage" ? 100 : undefined}
                    step="0.01"
                    value={newItem.discount_value || 0}
                    onChange={(e) => setNewItem({ ...newItem, discount_value: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="flex-1"
                    data-testid="item-discount-input"
                  />
                </div>
                {(newItem.discount_value || 0) > 0 && newItem.quantity > 0 && newItem.unit_price > 0 && (() => {
                  const gross = newItem.quantity * newItem.unit_price;
                  const dt = newItem.discount_type || "percentage";
                  const dv = newItem.discount_value || 0;
                  const discAmount = dt === "percentage"
                    ? gross * Math.min(100, dv) / 100
                    : Math.min(gross, dv);
                  const net = Math.max(0, gross - discAmount);
                  return (
                    <div className="mt-1.5 text-xs text-emerald-700">
                      {language === "es" ? "Total con descuento" : "Discounted total"}: <strong>${net.toFixed(2)}</strong>
                      <span className="text-muted-foreground"> (-${discAmount.toFixed(2)})</span>
                    </div>
                  );
                })()}
              </div>

              {/* Tax Exempt toggle */}
              <div className="col-span-2 flex items-center gap-2 rounded-md border bg-amber-50/50 border-amber-200 p-2.5">
                <input
                  id="item-tax-exempt"
                  type="checkbox"
                  checked={!!newItem.tax_exempt}
                  onChange={(e) => setNewItem({ ...newItem, tax_exempt: e.target.checked })}
                  className="h-4 w-4 cursor-pointer"
                  data-testid="item-tax-exempt-checkbox"
                />
                <Label htmlFor="item-tax-exempt" className="cursor-pointer text-sm flex-1">
                  {language === "es" ? "Sin impuesto (este ítem no paga IVA)" : "Tax exempt (this item is excluded from tax)"}
                </Label>
                {newItem.tax_exempt && (
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-medium">
                    {language === "es" ? "Exento" : "Exempt"}
                  </span>
                )}
              </div>

              {/* Recipe metadata: portion format + allergens badges */}
              {(newItem._portion_format_name || (newItem._recipe_allergens && newItem._recipe_allergens.length > 0)) && (
                <div className="col-span-2 flex flex-wrap items-center gap-1.5 -mt-2" data-testid="recipe-meta-badges">
                  {newItem._portion_format_name && (
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <Utensils className="w-3 h-3" />
                      {newItem._portion_format_name}
                    </Badge>
                  )}
                  {(newItem._recipe_allergens || []).map((a) => (
                    <Badge key={a} variant="outline" className="text-[10px] border-orange-300 text-orange-700 bg-orange-50">
                      ⚠ {a}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Event Date - For multi-day events */}
              <div>
                <Label>{language === "es" ? "Día del Evento" : "Event Day"}</Label>
                {(() => {
                  // Build the list of dates the proposal spans. Prefer
                  // dayLogistics (handles event_dates + legacy ranges); fall
                  // back to a continuous range if the event has start/end.
                  let availableDates = [];
                  if (Array.isArray(dayLogistics) && dayLogistics.length > 0) {
                    availableDates = dayLogistics
                      .map((d) => d?.event_date ? String(d.event_date).slice(0, 10) : null)
                      .filter(Boolean);
                  } else if (Array.isArray(event?.event_dates) && event.event_dates.length > 0) {
                    availableDates = event.event_dates.map((d) => String(d).slice(0, 10));
                  } else if (event?.event_date && event?.end_date && event.event_date !== event.end_date) {
                    const start = new Date(event.event_date);
                    const end = new Date(event.end_date);
                    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                      availableDates.push(d.toISOString().split("T")[0]);
                    }
                  }
                  const isMulti = availableDates.length > 1;
                  return isMulti ? (
                    <Select
                      value={newItem.event_date || "main"}
                      onValueChange={(v) => setNewItem({ ...newItem, event_date: v === "main" ? "" : v })}
                    >
                      <SelectTrigger data-testid="item-event-date-select">
                        <SelectValue placeholder={language === "es" ? "Seleccionar día..." : "Select day..."} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="main">
                          {language === "es" ? `Todos los días (${availableDates.length})` : `All days (${availableDates.length})`}
                        </SelectItem>
                        {availableDates.map((dateStr) => {
                          const d = new Date(dateStr + "T12:00:00");
                          const label = d.toLocaleDateString(language === "es" ? "es" : "en", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          });
                          return (
                            <SelectItem key={dateStr} value={dateStr}>{label}</SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type="date"
                      value={newItem.event_date || ""}
                      onChange={(e) => setNewItem({ ...newItem, event_date: e.target.value })}
                      placeholder={language === "es" ? "Opcional" : "Optional"}
                    />
                  );
                })()}
                <p className="text-xs text-muted-foreground mt-1">
                  {language === "es"
                    ? '"Todos los días" duplica el ítem una vez por día'
                    : '"All days" duplicates the item once per day'}
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
                {editingItemId
                  ? (language === "es" ? "Guardar cambios" : "Save changes")
                  : (language === "es" ? "Agregar Ítem" : "Add Item")}
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
      <Dialog open={addMenuOpen} onOpenChange={(o) => { setAddMenuOpen(o); if (!o) setMenuSearch(""); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              {language === "es" ? "Seleccionar Menú / Paquete" : "Select Menu / Package"}
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground mb-3">
            {language === "es"
              ? "Selecciona un menú para agregar todos sus ítems a la propuesta. Los menús de Inteligencia Culinaria se multiplican automáticamente por la cantidad de invitados."
              : "Select a menu to add all its items to the proposal. Culinary Intelligence menus are multiplied automatically by the guest count."}
          </p>

          {/* Search */}
          <div className="mb-4">
            <Input
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              placeholder={language === "es" ? "Buscar por nombre..." : "Search by name..."}
              data-testid="menu-search-input"
            />
          </div>

          {/* Mode toggle (only relevant for CI plated menus) */}
          {platedMenus.length > 0 && (
            <div className="mb-4 p-3 bg-slate-50 rounded-md border" data-testid="menu-add-mode-toggle">
              <Label className="text-xs font-medium mb-2 block">
                {language === "es" ? "Cómo agregar el menú a la cotización" : "How to add the menu to the proposal"}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "package", label_es: "Como paquete (1 línea)", label_en: "As package (1 line)", desc_es: "Una sola línea con el menú; recetas anidadas como sub-ítems", desc_en: "One line for the menu; recipes shown as nested sub-items" },
                  { key: "breakdown", label_es: "Desglosado por receta", label_en: "Broken down per recipe", desc_es: "Una línea por cada receta del menú", desc_en: "One line per recipe in the menu" },
                ].map((opt) => {
                  const active = menuAddMode === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setMenuAddMode(opt.key)}
                      className={`text-left p-2 rounded border transition-all ${
                        active ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                      data-testid={`menu-mode-${opt.key}`}
                    >
                      <div className="text-xs font-semibold">{language === "es" ? opt.label_es : opt.label_en}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{language === "es" ? opt.desc_es : opt.desc_en}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(() => {
            const searchLower = (menuSearch || "").trim().toLowerCase();
            const stylePill = (mt, ss) => {
              const key = (ss || mt || "").toLowerCase();
              const map = {
                plated: { es: "🍽️ Plated", en: "🍽️ Plated", color: "bg-violet-100 text-violet-800 border-violet-200" },
                buffet: { es: "🥗 Buffet", en: "🥗 Buffet", color: "bg-amber-100 text-amber-800 border-amber-200" },
                family_style: { es: "👨‍👩‍👧 Familiar", en: "👨‍👩‍👧 Family Style", color: "bg-orange-100 text-orange-800 border-orange-200" },
                cocktail: { es: "🍸 Cocktail", en: "🍸 Cocktail", color: "bg-pink-100 text-pink-800 border-pink-200" },
                stations: { es: "🍴 Stations", en: "🍴 Stations", color: "bg-cyan-100 text-cyan-800 border-cyan-200" },
                grab_and_go: { es: "📦 Grab & Go", en: "📦 Grab & Go", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
              };
              return map[key] || { es: mt || "Menú", en: mt || "Menu", color: "bg-slate-100 text-slate-800 border-slate-200" };
            };

            const filteredCatalog = menus.filter(m => !searchLower || (m.name || "").toLowerCase().includes(searchLower) || (m.name_es || "").toLowerCase().includes(searchLower));
            const filteredPlated = platedMenus.filter(m => !searchLower || (m.name || "").toLowerCase().includes(searchLower));

            const hasAny = filteredCatalog.length + filteredPlated.length > 0;
            const noneAtAll = menus.length === 0 && platedMenus.length === 0;

            if (noneAtAll) {
              return (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">{language === "es" ? "No hay menús creados" : "No menus created"}</p>
                  <p className="text-sm mt-3 max-w-md mx-auto">
                    {language === "es"
                      ? "Puedes crear menús en dos lugares:"
                      : "You can create menus in two places:"}
                  </p>
                  <ul className="text-xs mt-2 space-y-1 inline-block text-left">
                    <li>📋 <strong>{language === "es" ? "Ajustes → Catálogos → Menús/Paquetes" : "Settings → Catalogs → Menus/Packages"}</strong></li>
                    <li>🍽️ <strong>{language === "es" ? "Inteligencia Culinaria → Menús" : "Culinary Intelligence → Menus"}</strong> ({language === "es" ? "Plated, Buffet, Family Style, Cocktail..." : "Plated, Buffet, Family Style, Cocktail..."})</li>
                  </ul>
                </div>
              );
            }

            if (!hasAny) {
              return (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  {language === "es" ? "Sin resultados para" : "No results for"} "{menuSearch}"
                </div>
              );
            }

            return (
              <div className="space-y-5">
                {/* Plated / Culinary Intelligence Menus */}
                {filteredPlated.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ChefHat className="w-4 h-4 text-violet-600" />
                      <h3 className="text-sm font-semibold text-slate-700">
                        {language === "es" ? "Menús de Inteligencia Culinaria" : "Culinary Intelligence Menus"}
                      </h3>
                      <Badge variant="secondary" className="text-[10px]">{filteredPlated.length}</Badge>
                    </div>
                    <div className="space-y-3">
                      {filteredPlated.map((pm) => {
                        const pill = stylePill(pm.menu_type, pm.serving_style);
                        const courseCount = (pm.courses || []).length;
                        const itemCount = (pm.courses || []).reduce((acc, c) => acc + (c.items || []).length, 0);
                        return (
                          <Card
                            key={pm.menu_id}
                            className="cursor-pointer hover:border-violet-400 hover:shadow-sm transition-all"
                            onClick={() => handleAddPlatedMenu(pm)}
                            data-testid={`plated-menu-card-${pm.menu_id}`}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <h4 className="font-semibold">{pm.name}</h4>
                                    <Badge className={`text-xs border ${pill.color}`} variant="outline">
                                      {language === "es" ? pill.es : pill.en}
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs">
                                      {courseCount} {language === "es" ? "cursos" : "courses"}
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs">
                                      {itemCount} {language === "es" ? "ítems" : "items"}
                                    </Badge>
                                  </div>
                                  {pm.description && (
                                    <p className="text-sm text-muted-foreground mb-2">{pm.description}</p>
                                  )}
                                  <div className="flex items-center gap-4 text-sm mb-1">
                                    <span className="font-mono">
                                      ${(pm.cost_with_buffer || pm.cost_per_guest || 0).toFixed(2)}
                                      <span className="text-xs text-muted-foreground ml-1">/{language === "es" ? "invitado" : "guest"}</span>
                                    </span>
                                    {(event?.guest_count || event?.num_guests) > 0 && (
                                      <span className="text-xs text-muted-foreground">
                                        × {event.guest_count || event.num_guests} = <strong>${((pm.cost_with_buffer || pm.cost_per_guest || 0) * (event.guest_count || event.num_guests)).toFixed(2)}</strong>
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <Button variant="outline" size="sm" className="ml-4" onClick={(e) => { e.stopPropagation(); handleAddPlatedMenu(pm); }}>
                                  <Plus className="w-4 h-4 mr-1" />
                                  {language === "es" ? "Agregar" : "Add"}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Catalog / Settings Menus */}
                {filteredCatalog.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="w-4 h-4 text-slate-600" />
                      <h3 className="text-sm font-semibold text-slate-700">
                        {language === "es" ? "Menús del Catálogo" : "Catalog Menus"}
                      </h3>
                      <Badge variant="secondary" className="text-[10px]">{filteredCatalog.length}</Badge>
                    </div>
                    <div className="space-y-3">
                      {filteredCatalog.map((menu) => (
                        <Card
                          key={menu.menu_id}
                          className="cursor-pointer hover:border-primary transition-colors"
                          onClick={() => handleAddMenu(menu)}
                          data-testid={`catalog-menu-card-${menu.menu_id}`}
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
                                        onClick={(e) => { e.stopPropagation(); handleAddMenu(menu, variant); }}
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
                  </div>
                )}
              </div>
            );
          })()}
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

      {/* Buffet Selection Dialog (per-course "pick X of Y" rules) */}
      <BuffetSelectionDialog
        open={!!buffetSelectMenu}
        onClose={() => setBuffetSelectMenu(null)}
        menu={buffetSelectMenu}
        guestCount={event?.guest_count || event?.num_guests || 0}
        onConfirm={async ({ selected_items }) => {
          if (!buffetSelectMenu) return;
          await handleAddPlatedMenu(buffetSelectMenu, selected_items);
        }}
      />
    </div>
  );
}
