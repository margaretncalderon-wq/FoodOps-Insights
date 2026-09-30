import { useEffect, useState, useMemo } from "react";
import { API } from "../utils/api";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { useModules } from "../contexts/ModulesContext";
import { useTerminology } from "../hooks/useTerminology";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Calendar } from "../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Switch } from "../components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { SearchableSelect } from "../components/ui/searchable-select";
import { toDateOnly, formatDateOnly, parseDateOnly } from "../utils/dates";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Search, Calendar as CalendarIcon, CalendarDays, MapPin, Users, DollarSign, MoreHorizontal, Trash2, Edit, Copy, List, Music4, FolderKanban, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import EventLocationSelector from "../components/EventLocationSelector";
import LostReasonDialog from "../components/LostReasonDialog";
import LostReasonsWidget from "../components/LostReasonsWidget";
import { usePendingApprovals } from "../hooks/usePendingApprovals";


const EVENT_TYPES = ["wedding", "corporate", "birthday", "social", "other"];
const EVENT_STATUSES = ["planning", "confirmed", "inProgress", "completed", "cancelled"];

// Engagement Types - determines what fields/modules are relevant
const ENGAGEMENT_TYPES = [
  { value: "event", labelEn: "Event", labelEs: "Evento", description: "Full event with venue, catering, timeline" },
  { value: "project", labelEn: "Project", labelEs: "Proyecto", description: "Project-based work with deliverables" },
  { value: "service", labelEn: "Service", labelEs: "Servicio", description: "Simple service → invoice flow" },
];

// Event Source Options
const EVENT_SOURCES = [
  { value: "recurrent_client", labelEn: "Recurrent Client", labelEs: "Cliente Recurrente" },
  { value: "inbound_lead", labelEn: "Inbound Lead", labelEs: "Lead Inbound" },
  { value: "outbound", labelEn: "Outbound", labelEs: "Outbound" },
  { value: "referral", labelEn: "Referral", labelEs: "Referido" },
  { value: "other", labelEn: "Other", labelEs: "Otro" },
];
// Engagement Stages (OS-level progression)
const ENGAGEMENT_STAGES = [
  "Inquiry Received",    // Intention exists, nothing defined
  "Context Captured",    // We understood what they want
  "Scope Drafted",       // Proposal under construction
  "Definition In Review", // Adjustments, changes, validations
  "Committed",           // Approved, ready to orchestrate
  "Archived"             // Not proceeding (no drama)
];

// Legacy mapping for backward compatibility
const LEGACY_STAGE_MAP = {
  "Lead": "Inquiry Received",
  "Contacted": "Context Captured",
  "Proposal": "Scope Drafted",
  "Negotiation": "Definition In Review",
  "Won": "Committed",
  "Lost": "Archived",
  "Closed": "Committed"
};

// Display labels for stages (internal value stays "Archived" — we just show
// "Perdida/Lost" to match how users actually think about it).
const stageLabel = (stage, isEs) => {
  if (stage === "Archived" || stage === "Lost") return isEs ? "Perdida" : "Lost";
  if (!isEs) return stage;
  const ES = {
    "Inquiry Received": "Consulta Recibida",
    "Context Captured": "Contexto Capturado",
    "Scope Drafted": "Alcance Definido",
    "Definition In Review": "Definición en Revisión",
    "Committed": "Comprometido",
  };
  return ES[stage] || stage;
};

export default function EventsPage({ embedded = false }) {
  const { t, language } = useLanguage();
  const { isProfessionalServices, isEventsIndustry, getProgramOrchestrationConfig } = useModules();
  const { term } = useTerminology();
  const [searchParams, setSearchParams] = useSearchParams();
  const isEs = language === "es";
  
  // Get dynamic terminology from industry config
  const poConfig = useMemo(() => getProgramOrchestrationConfig(), [getProgramOrchestrationConfig]);
  const entitySingular = isEs ? poConfig.entity_singular_es : poConfig.entity_singular_en;
  const entityPlural = isEs ? poConfig.entity_plural_es : poConfig.entity_plural_en;
  
  // Dynamic client terminology
  const clientLabel = term("events", "client");
  const clientsLabel = term("events", "clients");
  const venueLabel = term("events", "venue");
  const guestsLabel = term("events", "guests");
  
  // Determine default engagement type based on industry
  const defaultEngagementType = isProfessionalServices ? "project" : "event";
  
  const [events, setEvents] = useState([]);
  const [pipeline, setPipeline] = useState({});
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(searchParams.get("new") === "true");
  const [editingEvent, setEditingEvent] = useState(null);
  const [viewMode, setViewMode] = useState(searchParams.get("view") || "list"); // list, calendar, pipeline
  const [sortBy, setSortBy] = useState(localStorage.getItem("eventsSortBy") || "date_desc");
  // Approval filter chip — driven by ?approval= URL param so the sidebar badge
  // and dashboard widget can deep-link straight into the "Pending" tray.
  // Values: "all" | "pending" | "approved" | "sent" | "incomplete"
  const [approvalFilter, setApprovalFilter] = useState(searchParams.get("approval") || "all");
  const { event_status_map, require_approval, count_pending, refresh: refreshApprovals } = usePendingApprovals();
  // Track which event is being marked as Lost so we can fire the dialog.
  const [lostDialogEventId, setLostDialogEventId] = useState(null);
  const [formData, setFormData] = useState({
    client_id: "",
    name: "",
    engagement_type: defaultEngagementType,
    event_type: "wedding",
    event_date: null,
    event_date_tbd: false,
    end_date: null,
    event_dates: [],
    start_time: "",
    end_time: "",
    internal_delivery_time: "",
    departure_time: "",
    is_booking: false,
    is_multi_select: false,
    venue: "",
    locations: [],
    guest_count: 0,
    participant_count: 0, // NEW: for projects
    deliverables: "", // NEW: for projects
    scope_summary: "", // NEW: for projects/services
    budget: 0,
    notes: "",
    status: "planning",
    stage: "Inquiry Received",
    expected_value: "",
    next_followup_date: null,
    next_step: "",
    source: "",
  });

  useEffect(() => {
    fetchEvents();
    fetchClients();
    if (viewMode === "pipeline") {
      fetchPipeline();
    }
  }, [viewMode]);

  const fetchEvents = async () => {
    try {
      const response = await axios.get(`${API}/events`, { withCredentials: true });
      setEvents(response.data);
    } catch (error) {
      console.error("Failed to fetch events:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPipeline = async () => {
    try {
      const response = await axios.get(`${API}/events/pipeline`, { withCredentials: true });
      setPipeline(response.data);
    } catch (error) {
      console.error("Failed to fetch pipeline:", error);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await axios.get(`${API}/crm/clients`, { withCredentials: true });
      const sorted = [...(response.data || [])].sort((a, b) =>
        (a.display_name || a.name || "").localeCompare(b.display_name || b.name || "", undefined, { sensitivity: "base" })
      );
      setClients(sorted);
    } catch (error) {
      console.error("Failed to fetch clients:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Multi-date mode: derive event_date (first) + end_date (last) for backwards
      // compatibility with components that still read these legacy fields.
      let derivedEventDate = formData.event_date;
      let derivedEndDate = formData.end_date;
      let derivedEventDates = [];
      if (formData.is_multi_select && Array.isArray(formData.event_dates) && formData.event_dates.length > 0) {
        const sorted = [...formData.event_dates].sort((a, b) => a - b);
        derivedEventDate = sorted[0];
        derivedEndDate = sorted[sorted.length - 1];
        derivedEventDates = sorted.map(d => toDateOnly(d)).filter(Boolean);
      } else if (Array.isArray(formData.event_dates) && formData.event_dates.length > 0) {
        derivedEventDates = formData.event_dates.map(d => toDateOnly(d)).filter(Boolean).sort();
      }
      const payload = {
        ...formData,
        engagement_type: formData.engagement_type || "event",
        event_type: formData.event_type || "other",
        event_date: formData.event_date_tbd ? null : toDateOnly(derivedEventDate),
        end_date: formData.is_multi_select
          ? toDateOnly(derivedEndDate)
          : (formData.is_booking && formData.end_date ? toDateOnly(formData.end_date) : null),
        event_dates: derivedEventDates,
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
        internal_delivery_time: formData.internal_delivery_time || null,
        departure_time: formData.departure_time || null,
        next_followup_date: formData.next_followup_date ? formData.next_followup_date.toISOString() : null,
        guest_count: parseInt(formData.guest_count) || 0,
        participant_count: parseInt(formData.participant_count) || 0,
        budget: parseFloat(formData.budget) || 0,
        expected_value: formData.expected_value ? parseFloat(formData.expected_value) : null,
      };
      
      if (editingEvent) {
        await axios.put(`${API}/events/${editingEvent.event_id}`, payload, { withCredentials: true });
        toast.success(language === "es" ? `${entitySingular} actualizado` : `${entitySingular} updated`);
      } else {
        await axios.post(`${API}/events`, payload, { withCredentials: true });
        toast.success(language === "es" ? `${entitySingular} creado` : `${entitySingular} created`);
      }
      fetchEvents();
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      // Pydantic 422 errors are already normalized to a readable string by the
      // global axios interceptor (see utils/errorFormatter.js).
      toast.error(
        error.response?.data?.detail ||
        (language === "es" ? `Error al guardar ${entitySingular.toLowerCase()}` : `Failed to save ${entitySingular.toLowerCase()}`)
      );
    }
  };

  const handleDelete = async (eventId) => {
    if (!confirm(language === "es" ? `¿Eliminar ${entitySingular.toLowerCase()}?` : `Delete ${entitySingular.toLowerCase()}?`)) return;
    try {
      await axios.delete(`${API}/events/${eventId}`, { withCredentials: true });
      toast.success(language === "es" ? `${entitySingular} eliminado` : `${entitySingular} deleted`);
      fetchEvents();
    } catch (error) {
      toast.error(`Failed to delete ${entitySingular.toLowerCase()}`);
    }
  };

  const handleDuplicate = async (eventId) => {
    try {
      await axios.post(`${API}/events/${eventId}/duplicate`, {}, { withCredentials: true });
      toast.success(language === "es" ? `${entitySingular} duplicado` : `${entitySingular} duplicated`);
      fetchEvents();
    } catch (error) {
      toast.error(`Failed to duplicate ${entitySingular.toLowerCase()}`);
    }
  };

  const handleEdit = (event) => {
    setEditingEvent(event);
    setFormData({
      client_id: event.client_id,
      name: event.name,
      engagement_type: event.engagement_type || "event",
      event_type: event.event_type,
      event_date: parseDateOnly(event.event_date),
      event_date_tbd: event.event_date_tbd || !event.event_date,
      end_date: parseDateOnly(event.end_date),
      event_dates: Array.isArray(event.event_dates)
        ? event.event_dates.map(d => parseDateOnly(d)).filter(Boolean)
        : [],
      start_time: event.start_time || "",
      end_time: event.end_time || "",
      internal_delivery_time: event.internal_delivery_time || "",
      departure_time: event.departure_time || "",
      is_booking: event.is_booking || false,
      is_multi_select: Array.isArray(event.event_dates) && event.event_dates.length > 0,
      venue: event.venue || "",
      locations: event.locations || [],
      guest_count: event.guest_count,
      participant_count: event.participant_count || 0,
      deliverables: event.deliverables || "",
      scope_summary: event.scope_summary || "",
      budget: event.budget,
      notes: event.notes || "",
      status: event.status,
      stage: event.stage || "Lead",
      expected_value: event.expected_value || "",
      next_followup_date: event.next_followup_date ? new Date(event.next_followup_date) : null,
      next_step: event.next_step || "",
      source: event.source || "",
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingEvent(null);
    setFormData({
      client_id: "",
      name: "",
      engagement_type: defaultEngagementType,
      event_type: "wedding",
      event_date: null,
      event_date_tbd: false,
      end_date: null,
      event_dates: [],
      start_time: "",
      end_time: "",
      is_booking: false,
      is_multi_select: false,
      venue: "",
      locations: [],
      guest_count: 0,
      participant_count: 0,
      deliverables: "",
      scope_summary: "",
      budget: 0,
      notes: "",
      status: "planning",
      stage: "Inquiry Received",
      expected_value: "",
      next_followup_date: null,
      next_step: "",
      source: "",
    });
  };

  const handleStageChange = async (eventId, newStage) => {
    try {
      const event = events.find(e => e.event_id === eventId);
      if (!event) return;

      // Intercept Lost transition — capture reason via dialog before updating.
      if (newStage === "Archived" && event.stage !== "Archived") {
        setLostDialogEventId(eventId);
        return;
      }

      await axios.put(`${API}/events/${eventId}`, {
        ...event,
        stage: newStage,
        event_date: toDateOnly(event.event_date),
        end_date: toDateOnly(event.end_date),
      }, { withCredentials: true });
      
      toast.success(language === "es" ? "Etapa actualizada" : "Stage updated");
      fetchEvents();
      if (viewMode === "pipeline") fetchPipeline();
    } catch (error) {
      toast.error("Failed to update stage");
    }
  };

  const lostDialogEvent = events.find((e) => e.event_id === lostDialogEventId) || null;

  const handleConfirmLost = async ({ reason, notes }) => {
    if (!lostDialogEvent) return;
    try {
      await axios.put(`${API}/events/${lostDialogEvent.event_id}`, {
        ...lostDialogEvent,
        stage: "Archived",
        lost_reason: reason,
        lost_reason_notes: notes,
        event_date: toDateOnly(lostDialogEvent.event_date),
        end_date: toDateOnly(lostDialogEvent.end_date),
      }, { withCredentials: true });
      toast.success(language === "es" ? "Marcada como Perdida" : "Marked as Lost");
      fetchEvents();
      if (viewMode === "pipeline") fetchPipeline();
    } catch (error) {
      toast.error(language === "es" ? "Error al marcar como perdida" : "Failed to mark as lost");
      throw error;
    }
  };

  const filteredEvents = (() => {
    const list = events.filter((event) => {
      const matchesSearch =
        event.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.venue?.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;
      if (approvalFilter === "all") return true;
      const meta = event_status_map?.[event.event_id];
      if (!meta) return false;
      if (approvalFilter === "pending") return meta.document_status === "Pending Approval";
      if (approvalFilter === "approved") return meta.document_status === "Approved";
      if (approvalFilter === "sent") return meta.document_status === "Sent";
      if (approvalFilter === "incomplete") return !!meta.data_incomplete;
      return true;
    });
    const parseDate = (d) => (d ? new Date(d).getTime() : 0);
    const sorters = {
      date_desc: (a, b) => parseDate(b.event_date) - parseDate(a.event_date),
      date_asc: (a, b) => parseDate(a.event_date) - parseDate(b.event_date),
      name_asc: (a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }),
      name_desc: (a, b) => (b.name || "").localeCompare(a.name || "", undefined, { sensitivity: "base" }),
      guests_desc: (a, b) => (b.guest_count || b.num_guests || 0) - (a.guest_count || a.num_guests || 0),
      guests_asc: (a, b) => (a.guest_count || a.num_guests || 0) - (b.guest_count || b.num_guests || 0),
      value_desc: (a, b) => (b.total_value || b.total || 0) - (a.total_value || a.total || 0),
      value_asc: (a, b) => (a.total_value || a.total || 0) - (b.total_value || b.total || 0),
      created_desc: (a, b) => parseDate(b.created_at) - parseDate(a.created_at),
      created_asc: (a, b) => parseDate(a.created_at) - parseDate(b.created_at),
    };
    return [...list].sort(sorters[sortBy] || sorters.date_desc);
  })();

  const statusColors = {
    planning: "bg-info/10 text-info",
    confirmed: "bg-success/10 text-success",
    inProgress: "bg-warning/10 text-warning",
    completed: "bg-primary/10 text-primary",
    cancelled: "bg-destructive/10 text-destructive",
  };

  const stageColors = {
    "Inquiry Received": "bg-slate-100 text-slate-800 border-slate-200",
    "Context Captured": "bg-blue-100 text-blue-800 border-blue-200",
    "Scope Drafted": "bg-amber-100 text-amber-800 border-amber-200",
    "Definition In Review": "bg-orange-100 text-orange-800 border-orange-200",
    "Committed": "bg-emerald-100 text-emerald-800 border-emerald-200",
    "Archived": "bg-gray-100 text-gray-500 border-gray-200",
    // Legacy support
    Lead: "bg-slate-100 text-slate-800 border-slate-200",
    Contacted: "bg-blue-100 text-blue-800 border-blue-200",
    Proposal: "bg-amber-100 text-amber-800 border-amber-200",
    Negotiation: "bg-orange-100 text-orange-800 border-orange-200",
    Won: "bg-emerald-100 text-emerald-800 border-emerald-200",
    Lost: "bg-gray-100 text-gray-500 border-gray-200",
    Closed: "bg-purple-100 text-purple-800 border-purple-200",
  };

  const stageHeaderColors = {
    "Inquiry Received": "bg-slate-500",
    "Context Captured": "bg-blue-500",
    "Scope Drafted": "bg-amber-500",
    "Definition In Review": "bg-orange-500",
    "Committed": "bg-emerald-500",
    "Archived": "bg-gray-400",
    // Legacy support
    Lead: "bg-slate-500",
    Contacted: "bg-blue-500",
    Proposal: "bg-amber-500",
    Negotiation: "bg-orange-500",
    Won: "bg-emerald-500",
    Lost: "bg-gray-400",
    Closed: "bg-purple-500",
  };

  const getDuration = (event) => {
    if (!event.is_booking || !event.end_date) return null;
    const start = parseDateOnly(event.event_date);
    const end = parseDateOnly(event.end_date);
    if (!start || !end) return null;
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return `${days} ${isEs ? "días" : "days"}`;
  };

  const content = (
    <div className="space-y-6" data-testid="events-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">
            {embedded ? (isEs ? "Propuestas & Acuerdos" : "Proposals & Agreements") : entityPlural}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEs 
              ? `Gestiona tus ${entityPlural.toLowerCase()} y reservas` 
              : `Manage your ${entityPlural.toLowerCase()} and bookings`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center border rounded-lg p-1 bg-muted/30">
            <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => { setViewMode("list"); setSearchParams({ view: "list" }); }}
                className="gap-1"
              >
                <List className="w-4 h-4" />
                {isEs ? "Lista" : "List"}
              </Button>
              <Button
                variant={viewMode === "pipeline" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => { setViewMode("pipeline"); setSearchParams({ view: "pipeline" }); fetchPipeline(); }}
                className="gap-1"
              >
                Pipeline
              </Button>
              <Button
                variant={viewMode === "calendar" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => { setViewMode("calendar"); setSearchParams({ view: "calendar" }); }}
                className="gap-1"
              >
                <CalendarDays className="w-4 h-4" />
              </Button>
            </div>
            <Dialog open={dialogOpen} onOpenChange={(open) => { 
              setDialogOpen(open); 
              if (!open) resetForm(); 
            }}>
              <DialogTrigger asChild>
                <Button className="rounded-full gap-2" data-testid="add-event-btn" onClick={() => { if (!editingEvent) resetForm(); }}>
                  <Plus className="w-4 h-4" />
                  {isEs ? `Agregar ${entitySingular}` : `Add ${entitySingular}`}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-heading">
                    {editingEvent 
                      ? t("edit") 
                      : (isEs ? `Agregar ${entitySingular}` : `Add ${entitySingular}`)}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Engagement Type Selector - First and prominent */}
                  {!editingEvent && (
                    <div className="space-y-2">
                      <Label>{isEs ? "Tipo de Trabajo" : "Work Type"} *</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {ENGAGEMENT_TYPES.map((type) => (
                          <button
                            key={type.value}
                            type="button"
                            onClick={() => setFormData({ ...formData, engagement_type: type.value })}
                            className={`p-3 rounded-lg border-2 text-center transition-all ${
                              formData.engagement_type === type.value
                                ? "border-primary bg-primary/10"
                                : "border-muted hover:border-primary/50"
                            }`}
                          >
                            <span className="block font-medium text-sm">
                              {language === "es" ? type.labelEs : type.labelEn}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>{t("clients")} *</Label>
                    <SearchableSelect
                      value={formData.client_id}
                      onValueChange={(value) => setFormData({ ...formData, client_id: value })}
                      options={[...clients]
                        .sort((a, b) => (a.display_name || a.name || "").localeCompare(b.display_name || b.name || ""))
                        .map((c) => ({
                          value: c.client_id,
                          label: c.display_name || c.name || "—",
                          keywords: [c.email, c.phone, c.company_name].filter(Boolean),
                        }))}
                      placeholder={language === "es" ? "Seleccionar cliente" : "Select client"}
                      searchPlaceholder={language === "es" ? "Buscar cliente..." : "Search client..."}
                      emptyText={language === "es" ? "Sin resultados" : "No results"}
                      testId="event-client-select"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      {formData.engagement_type === "project" 
                        ? (language === "es" ? "Nombre del Proyecto" : "Project Name")
                        : formData.engagement_type === "service"
                        ? (language === "es" ? "Nombre del Servicio" : "Service Name")
                        : t("name")} *
                    </Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      data-testid="event-name-input"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Event Type - only for events */}
                    {formData.engagement_type === "event" && (
                      <div className="space-y-2">
                        <Label>{t("eventType")}</Label>
                        <Select
                          value={formData.event_type}
                          onValueChange={(value) => setFormData({ ...formData, event_type: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EVENT_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>{t("status")}</Label>
                      <Select
                        value={formData.status}
                        onValueChange={(value) => setFormData({ ...formData, status: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EVENT_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {t(status)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Source Field */}
                  <div className="space-y-2">
                    <Label>{language === "es" ? "Origen de la Solicitud" : "Request Source"}</Label>
                    <Select
                      value={formData.source}
                      onValueChange={(value) => setFormData({ ...formData, source: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={language === "es" ? "Seleccionar origen..." : "Select source..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {EVENT_SOURCES.map((source) => (
                          <SelectItem key={source.value} value={source.value}>
                            {language === "es" ? source.labelEs : source.labelEn}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Multi-day toggle */}
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <Label className="font-medium">{isEs ? "Multi-día" : "Multi-day"}</Label>
                      <p className="text-xs text-muted-foreground">
                        {isEs 
                          ? `${entitySingular} con múltiples días` 
                          : `${entitySingular} spanning multiple days`}
                      </p>
                    </div>
                    <Switch
                      id="multiday-toggle"
                      checked={formData.is_booking === true}
                      onCheckedChange={(checked) => {
                        const baseDate = formData.event_date || new Date();
                        const newEndDate = checked 
                          ? new Date(baseDate.getTime() + 86400000) 
                          : null;
                        setFormData({
                          ...formData,
                          is_booking: checked,
                          end_date: newEndDate
                        });
                      }}
                    />
                  </div>

                  {/* TBD Date Toggle */}
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <Label className="font-medium">{isEs ? "Fecha Por Definir" : "Date TBD"}</Label>
                      <p className="text-xs text-muted-foreground">
                        {isEs ? "La fecha aún no está confirmada" : "Date not yet confirmed"}
                      </p>
                    </div>
                    <Switch
                      checked={formData.event_date_tbd === true}
                      onCheckedChange={(checked) => setFormData({ ...formData, event_date_tbd: checked })}
                    />
                  </div>

                  {/* Multi-date (non-consecutive) Toggle */}
                  {!formData.event_date_tbd && (
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg" data-testid="multi-date-toggle-row">
                      <div>
                        <Label className="font-medium">
                          {isEs ? "Días no consecutivos / múltiples fechas" : "Non-consecutive / multiple dates"}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {isEs
                            ? "Selecciona días sueltos (ej: martes y jueves de un curso)"
                            : "Pick individual days (e.g. Tuesdays and Thursdays of a course)"}
                        </p>
                      </div>
                      <Switch
                        data-testid="multi-date-toggle"
                        checked={formData.is_multi_select === true}
                        onCheckedChange={(checked) => {
                          // Toggling ON: seed event_dates from existing single date when present
                          // Toggling OFF: keep first selected date as event_date
                          if (checked) {
                            setFormData({
                              ...formData,
                              is_multi_select: true,
                              is_booking: false,
                              event_dates: formData.event_dates?.length
                                ? formData.event_dates
                                : (formData.event_date ? [formData.event_date] : []),
                            });
                          } else {
                            const first = formData.event_dates?.[0] || formData.event_date || null;
                            setFormData({
                              ...formData,
                              is_multi_select: false,
                              event_dates: [],
                              event_date: first,
                            });
                          }
                        }}
                      />
                    </div>
                  )}

                  {/* Multi-date Calendar + chips */}
                  {!formData.event_date_tbd && formData.is_multi_select && (
                    <div className="space-y-3" data-testid="multi-date-picker-wrapper">
                      <Label>{isEs ? "Selecciona las fechas" : "Pick the dates"}</Label>
                      <div className="border rounded-lg p-2 bg-background">
                        <Calendar
                          mode="multiple"
                          selected={formData.event_dates || []}
                          onSelect={(dates) => setFormData({ ...formData, event_dates: dates || [] })}
                          numberOfMonths={2}
                          initialFocus
                        />
                      </div>
                      {(formData.event_dates?.length || 0) > 0 ? (
                        <div className="flex flex-wrap gap-1.5" data-testid="multi-date-chips">
                          {[...formData.event_dates].sort((a, b) => a - b).map((d, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full pl-2.5 pr-1 py-0.5"
                              data-testid={`multi-date-chip-${idx}`}
                            >
                              {format(d, "PPP")}
                              <button
                                type="button"
                                className="inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-primary/20"
                                onClick={() => setFormData({
                                  ...formData,
                                  event_dates: formData.event_dates.filter((x) => x.getTime() !== d.getTime()),
                                })}
                                aria-label={isEs ? "Quitar fecha" : "Remove date"}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, event_dates: [] })}
                            className="text-xs text-muted-foreground hover:text-destructive underline ml-1"
                            data-testid="multi-date-clear"
                          >
                            {isEs ? "Limpiar todas" : "Clear all"}
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {isEs ? "Aún no has seleccionado fechas." : "No dates picked yet."}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Date fields (single / range) — hidden in multi-select mode */}
                  {!formData.event_date_tbd && !formData.is_multi_select && (formData.is_booking ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{language === "es" ? "Fecha Inicio" : "Start Date"}</Label>
                        <Popover modal={true}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {formData.event_date ? format(formData.event_date, "PPP") : (language === "es" ? "Seleccionar" : "Select")}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={formData.event_date}
                              onSelect={(date) => {
                                if (date) {
                                  const updates = { ...formData, event_date: date };
                                  if (formData.end_date && date > formData.end_date) {
                                    updates.end_date = new Date(date.getTime() + 86400000);
                                  }
                                  setFormData(updates);
                                }
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        <Label>{language === "es" ? "Fecha Fin" : "End Date"}</Label>
                        <Popover modal={true}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {formData.end_date ? format(formData.end_date, "PPP") : (language === "es" ? "Seleccionar" : "Select")}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={formData.end_date}
                              onSelect={(date) => date && setFormData({ ...formData, end_date: date })}
                              disabled={(date) => formData.event_date && date < formData.event_date}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>
                        {formData.engagement_type === "project" 
                          ? (language === "es" ? "Fecha del Proyecto" : "Project Date")
                          : formData.engagement_type === "service"
                            ? (language === "es" ? "Fecha del Servicio" : "Service Date")
                            : t("eventDate")}
                      </Label>
                      <Popover modal={true}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {formData.event_date ? format(formData.event_date, "PPP") : (language === "es" ? "Seleccionar" : "Select")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={formData.event_date}
                            onSelect={(date) => date && setFormData({ ...formData, event_date: date })}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  ))}

                  {/* Time Fields */}
                  {!formData.event_date_tbd && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{language === "es" ? "Hora Inicio" : "Start Time"}</Label>
                        <Input
                          type="time"
                          value={formData.start_time}
                          onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                          data-testid="event-start-time"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{language === "es" ? "Hora Fin" : "End Time"}</Label>
                        <Input
                          type="time"
                          value={formData.end_time}
                          onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                          data-testid="event-end-time"
                        />
                      </div>
                    </div>
                  )}

                  {/* Kitchen logistics — internal delivery + departure */}
                  {!formData.event_date_tbd && formData.engagement_type === "event" && (
                    <div className="grid grid-cols-2 gap-4 p-3 rounded-md border border-amber-200 bg-amber-50/60">
                      <div className="col-span-2 -mb-1">
                        <p className="text-xs font-semibold text-amber-800">
                          {language === "es" ? "Logística de cocina" : "Kitchen logistics"}
                        </p>
                        <p className="text-[11px] text-amber-700/80">
                          {language === "es"
                            ? "Horas internas para la operación. No se muestran al cliente."
                            : "Internal ops times. Not shown to clients."}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">
                          {language === "es" ? "Hora de entrega interna" : "Internal delivery time"}
                        </Label>
                        <Input
                          type="time"
                          value={formData.internal_delivery_time}
                          onChange={(e) => setFormData({ ...formData, internal_delivery_time: e.target.value })}
                          data-testid="event-internal-delivery-time"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">
                          {language === "es" ? "Hora de salida de cocina" : "Kitchen departure time"}
                        </Label>
                        <Input
                          type="time"
                          value={formData.departure_time}
                          onChange={(e) => setFormData({ ...formData, departure_time: e.target.value })}
                          data-testid="event-departure-time"
                        />
                      </div>
                    </div>
                  )}

                  {/* Event Location - only for events */}
                  {formData.engagement_type === "event" && (
                    <div className="space-y-2">
                      <Label>{t("eventLocations")}</Label>
                      <EventLocationSelector
                        value={formData.locations}
                        onChange={(locations) => {
                          // Update locations and legacy venue field for backwards compatibility
                          const primaryLocation = locations[0];
                          const venueStr = primaryLocation?.full_address || primaryLocation?.address || "";
                          setFormData({ ...formData, locations, venue: venueStr });
                        }}
                        clientId={formData.client_id}
                        clientAddress={clients.find(c => c.client_id === formData.client_id)?.address}
                        multiLocation={true}
                        eventDate={formData.event_date}
                        eventId={editingEvent?.event_id}
                      />
                    </div>
                  )}

                  {/* Guest Count - only for events */}
                  {formData.engagement_type === "event" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t("guestCount")}</Label>
                        <Input
                          type="number"
                          value={formData.guest_count}
                          onChange={(e) => setFormData({ ...formData, guest_count: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("budget")}</Label>
                        <Input
                          type="number"
                          value={formData.budget}
                          onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  {/* Project-specific fields */}
                  {formData.engagement_type === "project" && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{language === "es" ? "Participantes" : "Participants"}</Label>
                          <Input
                            type="number"
                            value={formData.participant_count}
                            onChange={(e) => setFormData({ ...formData, participant_count: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("budget")}</Label>
                          <Input
                            type="number"
                            value={formData.budget}
                            onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>{language === "es" ? "Resumen del Alcance" : "Scope Summary"}</Label>
                        <Textarea
                          value={formData.scope_summary}
                          onChange={(e) => setFormData({ ...formData, scope_summary: e.target.value })}
                          placeholder={language === "es" ? "Descripción breve del alcance del proyecto..." : "Brief description of project scope..."}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{language === "es" ? "Entregables" : "Deliverables"}</Label>
                        <Textarea
                          value={formData.deliverables}
                          onChange={(e) => setFormData({ ...formData, deliverables: e.target.value })}
                          placeholder={language === "es" ? "Lista de entregables esperados..." : "List of expected deliverables..."}
                          rows={2}
                        />
                      </div>
                    </>
                  )}

                  {/* Service-specific fields */}
                  {formData.engagement_type === "service" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{language === "es" ? "Descripción del Servicio" : "Service Description"}</Label>
                        <Input
                          value={formData.scope_summary}
                          onChange={(e) => setFormData({ ...formData, scope_summary: e.target.value })}
                          placeholder={language === "es" ? "Breve descripción..." : "Brief description..."}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("budget")}</Label>
                        <Input
                          type="number"
                          value={formData.budget}
                          onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  {/* Pipeline Stage */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{language === "es" ? "Etapa del Pipeline" : "Pipeline Stage"}</Label>
                      <Select
                        value={formData.stage}
                        onValueChange={(value) => setFormData({ ...formData, stage: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ENGAGEMENT_STAGES.map((stage) => (
                            <SelectItem key={stage} value={stage}>{stageLabel(stage, isEs)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{language === "es" ? "Valor Esperado" : "Expected Value"}</Label>
                      <Input
                        type="number"
                        placeholder="$"
                        value={formData.expected_value}
                        onChange={(e) => setFormData({ ...formData, expected_value: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("notes")}</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      {t("cancel")}
                    </Button>
                    <Button type="submit" data-testid="save-event-btn">
                      {t("save")}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search + Sort */}
        {viewMode !== "pipeline" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t("search")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="event-search-input"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {language === "es" ? "Ordenar por" : "Sort by"}:
                </span>
                <Select
                  value={sortBy}
                  onValueChange={(v) => { setSortBy(v); localStorage.setItem("eventsSortBy", v); }}
                >
                  <SelectTrigger className="w-[220px]" data-testid="events-sort-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date_desc">{language === "es" ? "Fecha (más reciente)" : "Date (newest)"}</SelectItem>
                    <SelectItem value="date_asc">{language === "es" ? "Fecha (más antigua)" : "Date (oldest)"}</SelectItem>
                    <SelectItem value="name_asc">{language === "es" ? "Nombre (A-Z)" : "Name (A-Z)"}</SelectItem>
                    <SelectItem value="name_desc">{language === "es" ? "Nombre (Z-A)" : "Name (Z-A)"}</SelectItem>
                    <SelectItem value="guests_desc">{isEs ? `Más ${guestsLabel.toLowerCase()}` : `Most ${guestsLabel.toLowerCase()}`}</SelectItem>
                    <SelectItem value="guests_asc">{isEs ? `Menos ${guestsLabel.toLowerCase()}` : `Fewest ${guestsLabel.toLowerCase()}`}</SelectItem>
                    <SelectItem value="value_desc">{language === "es" ? "Mayor valor" : "Highest value"}</SelectItem>
                    <SelectItem value="value_asc">{language === "es" ? "Menor valor" : "Lowest value"}</SelectItem>
                    <SelectItem value="created_desc">{language === "es" ? "Creado recientemente" : "Recently created"}</SelectItem>
                    <SelectItem value="created_asc">{language === "es" ? "Creado primero" : "Created first"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Approval status filter chips */}
            <div className="flex flex-wrap items-center gap-2" data-testid="approval-filter-bar">
              {[
                { key: "all", labelEs: "Todas", labelEn: "All", tone: "neutral" },
                { key: "pending", labelEs: "Pendientes de aprobación", labelEn: "Pending approval", tone: "amber", count: count_pending },
                { key: "approved", labelEs: "Aprobadas", labelEn: "Approved", tone: "emerald" },
                { key: "sent", labelEs: "Enviadas", labelEn: "Sent", tone: "blue" },
                { key: "incomplete", labelEs: "Data incompleta", labelEn: "Data incomplete", tone: "rose" },
              ].map((chip) => {
                const active = approvalFilter === chip.key;
                const tones = {
                  neutral: active ? "bg-[#1F2937] text-white border-[#1F2937]" : "bg-white text-[#1F2937] border-border hover:bg-muted",
                  amber: active ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
                  emerald: active ? "bg-emerald-600 text-white border-emerald-600" : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
                  blue: active ? "bg-blue-600 text-white border-blue-600" : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
                  rose: active ? "bg-rose-600 text-white border-rose-600" : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100",
                };
                return (
                  <button
                    key={chip.key}
                    type="button"
                    data-testid={`approval-chip-${chip.key}`}
                    onClick={() => {
                      setApprovalFilter(chip.key);
                      const next = new URLSearchParams(searchParams);
                      if (chip.key === "all") next.delete("approval");
                      else next.set("approval", chip.key);
                      setSearchParams(next, { replace: true });
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${tones[chip.tone]}`}
                  >
                    <span>{isEs ? chip.labelEs : chip.labelEn}</span>
                    {chip.count > 0 && (
                      <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${active ? "bg-white/25 text-white" : "bg-amber-500 text-white"}`}>
                        {chip.count > 99 ? "99+" : chip.count}
                      </span>
                    )}
                  </button>
                );
              })}
              {require_approval && (
                <span className="text-xs text-muted-foreground ml-1">
                  {isEs ? "· Aprobación requerida está activa" : "· Approval required is on"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Lost Reasons Insight Widget — collapsed by default */}
        <LostReasonsWidget />

        {/* List View */}
        {viewMode === "list" && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map((event) => (
              <Card
                key={event.event_id}
                className="hover:shadow-card transition-all duration-300 group"
                data-testid={`event-card-${event.event_id}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Engagement Type Badge */}
                      {event.engagement_type && event.engagement_type !== "event" && (
                        <Badge variant="outline" className={
                          event.engagement_type === "project" ? "bg-blue-50 text-blue-700 border-blue-200" :
                          event.engagement_type === "service" ? "bg-gray-50 text-gray-700 border-gray-200" :
                          ""
                        }>
                          {event.engagement_type === "project" 
                            ? (language === "es" ? "Proyecto" : "Project")
                            : event.engagement_type === "service"
                            ? (language === "es" ? "Servicio" : "Service")
                            : ""}
                        </Badge>
                      )}
                      <Badge className={statusColors[event.status]}>{t(event.status)}</Badge>
                      <Badge className={stageColors[event.stage || "Lead"]}>{stageLabel(event.stage || "Inquiry Received", isEs)}</Badge>
                      {(() => {
                        const meta = event_status_map?.[event.event_id];
                        if (!meta) return null;
                        if (meta.document_status === "Pending Approval") {
                          return (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200" data-testid={`approval-status-${event.event_id}`}>
                              {isEs ? "Pend. aprobar" : "Pend. approval"}
                            </Badge>
                          );
                        }
                        if (meta.document_status === "Approved") {
                          return (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200" data-testid={`approval-status-${event.event_id}`}>
                              {isEs ? "Aprobada" : "Approved"}
                            </Badge>
                          );
                        }
                        if (meta.document_status === "Sent") {
                          return (
                            <Badge className="bg-blue-100 text-blue-800 border-blue-200" data-testid={`approval-status-${event.event_id}`}>
                              {isEs ? "Enviada" : "Sent"}
                            </Badge>
                          );
                        }
                        return null;
                      })()}
                      {event_status_map?.[event.event_id]?.data_incomplete && (
                        <Badge className="bg-rose-100 text-rose-700 border-rose-200" data-testid={`data-incomplete-${event.event_id}`}>
                          {isEs ? "Data incompleta" : "Data incomplete"}
                        </Badge>
                      )}
                      {event.is_booking && (
                        <Badge variant="outline" className="text-xs">
                          {language === "es" ? "Reserva" : "Booking"}
                        </Badge>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(event)}>
                          <Edit className="w-4 h-4 mr-2" />
                          {t("edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(event.event_id)}>
                          <Copy className="w-4 h-4 mr-2" />
                          {t("duplicate")}
                        </DropdownMenuItem>
                        {(event.stage === "Committed" || event.stage === "Won" || event.stage === "Closed") && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <Link to={`/event-orchestration/${event.event_id}`} className="flex items-center">
                                <Music4 className="w-4 h-4 mr-2" />
                                {language === "es" ? "Event Orchestration" : "Event Orchestration"}
                              </Link>
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleDelete(event.event_id)} className="text-destructive">
                          <Trash2 className="w-4 h-4 mr-2" />
                          {t("delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Link to={`/events/${event.event_id}`}>
                    <h3 className="font-heading text-xl font-semibold mb-2 hover:text-primary transition-colors">
                      {event.client_info?.client_type === "Company" && event.client_info?.display_name 
                        ? `${event.client_info.display_name} - ${event.name}`
                        : event.name}
                    </h3>
                  </Link>
                  {event.event_type && (event.engagement_type === "event" || !event.engagement_type) && (
                    <p className="text-sm text-muted-foreground mb-4 capitalize">{event.event_type}</p>
                  )}
                  {event.engagement_type === "project" && event.scope_summary && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-1">{event.scope_summary}</p>
                  )}
                  {event.engagement_type === "service" && event.scope_summary && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-1">{event.scope_summary}</p>
                  )}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CalendarIcon className="w-4 h-4" />
                      <span>
                        {event.event_date_tbd || !event.event_date
                          ? "TBD"
                          : Array.isArray(event.event_dates) && event.event_dates.length > 1
                            ? `${event.event_dates.length} ${language === "es" ? "fechas" : "dates"} · ${formatDateOnly(event.event_dates[0], language)}…`
                            : formatDateOnly(event.event_date, language)}
                        {(!Array.isArray(event.event_dates) || event.event_dates.length <= 1) && event.is_booking && event.end_date && (
                          <> - {formatDateOnly(event.end_date, language)}</>
                        )}
                      </span>
                    </div>
                    {getDuration(event) && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CalendarDays className="w-4 h-4" />
                        {getDuration(event)}
                      </div>
                    )}
                    {event.venue && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="w-4 h-4" />
                        {event.venue}
                      </div>
                    )}
                    {(event.engagement_type === "event" || (!event.engagement_type && !isProfessionalServices)) && event.guest_count > 0 && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="w-4 h-4" />
                        {event.guest_count} {guestsLabel.toLowerCase()}
                      </div>
                    )}
                    {event.engagement_type === "project" && event.participant_count > 0 && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="w-4 h-4" />
                        {event.participant_count} {isEs ? "participantes" : "participants"}
                      </div>
                    )}
                    {event.expected_value && (
                      <div className="flex items-center gap-2 text-green-600 font-medium">
                        <DollarSign className="w-4 h-4" />
                        ${Number(event.expected_value).toLocaleString()}
                      </div>
                    )}
                    {event.pending_balance > 0 && (
                      <div className="flex items-center gap-2 text-red-600 font-medium" data-testid={`pending-balance-${event.event_id}`}>
                        <DollarSign className="w-4 h-4" />
                        {language === "es" ? "Saldo Pendiente:" : "Pending Balance:"} ${Number(event.pending_balance).toLocaleString()}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredEvents.length === 0 && (
              <div className="col-span-full text-center py-12">
                <CalendarIcon className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">{t("noResults")}</p>
              </div>
            )}
          </div>
        )}

        {/* Pipeline View (Kanban) */}
        {viewMode === "pipeline" && (
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 min-w-max">
              {ENGAGEMENT_STAGES.map((stage) => (
                <div key={stage} className="w-80 flex-shrink-0">
                  <div className={`${stageHeaderColors[stage]} text-white rounded-t-lg px-4 py-3 flex items-center justify-between`}>
                    <span className="font-semibold">{stageLabel(stage, isEs)}</span>
                    <Badge variant="secondary" className="bg-white/20 text-white">
                      {(pipeline[stage] || []).length}
                    </Badge>
                  </div>
                  <div className="bg-muted/30 rounded-b-lg p-3 min-h-[400px] space-y-3">
                    {(pipeline[stage] || []).map((event) => (
                      <Card key={event.event_id} className="cursor-pointer hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <Link to={`/events/${event.event_id}`}>
                            <h4 className="font-semibold text-sm mb-1 hover:text-primary">
                              {event.client_info?.display_name 
                                ? `${event.client_info.display_name}`
                                : ""}
                            </h4>
                            <p className="text-xs text-muted-foreground mb-2">{event.name}</p>
                          </Link>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                            <CalendarIcon className="w-3 h-3" />
                            {event.event_date_tbd || !event.event_date
                              ? "TBD" 
                              : formatDateOnly(event.event_date, language)}
                          </div>
                          {event.expected_value && (
                            <div className="flex items-center gap-1 text-xs font-medium text-green-600">
                              <DollarSign className="w-3 h-3" />
                              ${Number(event.expected_value).toLocaleString()}
                            </div>
                          )}
                          {event.pending_balance > 0 && (
                            <div className="flex items-center gap-1 text-xs font-medium text-red-600 mt-1" data-testid={`pipeline-pending-balance-${event.event_id}`}>
                              <DollarSign className="w-3 h-3" />
                              {language === "es" ? "Pendiente:" : "Pending:"} ${Number(event.pending_balance).toLocaleString()}
                            </div>
                          )}
                          <div className="mt-3 flex gap-1">
                            {ENGAGEMENT_STAGES.filter(s => s !== stage).slice(0, 3).map((targetStage) => (
                              <Button
                                key={targetStage}
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleStageChange(event.event_id, targetStage);
                                }}
                              >
                                → {stageLabel(targetStage, isEs)}
                              </Button>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {(pipeline[stage] || []).length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        {language === "es" ? "Sin eventos" : "No events"}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Calendar View */}
        {viewMode === "calendar" && (
          <Card>
            <CardContent className="p-6">
              <p className="text-center text-muted-foreground py-12">
                {language === "es" ? "Ir a la página de calendario para ver los eventos en formato calendario" : "Go to calendar page to view events in calendar format"}
                <br />
                <Link to={embedded ? "/client-engagement/calendar" : "/calendar"} className="text-primary hover:underline mt-2 inline-block">
                  {language === "es" ? "Abrir Calendario" : "Open Calendar"} →
                </Link>
              </p>
            </CardContent>
          </Card>
        )}

        <LostReasonDialog
          open={!!lostDialogEventId}
          onOpenChange={(v) => { if (!v) setLostDialogEventId(null); }}
          defaultReason={lostDialogEvent?.lost_reason || ""}
          defaultNotes={lostDialogEvent?.lost_reason_notes || ""}
          eventName={lostDialogEvent?.name || ""}
          onConfirm={handleConfirmLost}
        />
      </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <Layout>
      {content}
    </Layout>
  );
}
