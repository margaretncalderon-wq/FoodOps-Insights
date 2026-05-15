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
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Search, Calendar as CalendarIcon, CalendarDays, MapPin, Users, DollarSign, MoreHorizontal, Trash2, Edit, Copy, List, Music4, FolderKanban } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import EventLocationSelector from "../components/EventLocationSelector";


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
  const [formData, setFormData] = useState({
    client_id: "",
    name: "",
    engagement_type: defaultEngagementType,
    event_type: "wedding",
    event_date: null,
    event_date_tbd: false,
    end_date: null,
    start_time: "",
    end_time: "",
    is_booking: false,
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
      setClients(response.data);
    } catch (error) {
      console.error("Failed to fetch clients:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        engagement_type: formData.engagement_type || "event",
        event_type: formData.event_type || "other",
        event_date: formData.event_date_tbd ? null : (formData.event_date ? formData.event_date.toISOString() : null),
        end_date: formData.is_booking && formData.end_date ? formData.end_date.toISOString() : null,
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
        next_followup_date: formData.next_followup_date ? formData.next_followup_date.toISOString() : null,
        guest_count: parseInt(formData.guest_count) || 0,
        participant_count: parseInt(formData.participant_count) || 0,
        budget: parseFloat(formData.budget) || 0,
        expected_value: formData.expected_value ? parseFloat(formData.expected_value) : null,
      };
      
      if (editingEvent) {
        await axios.put(`${API}/events/${editingEvent.event_id}`, payload, { withCredentials: true });
        toast.success(language === "es" ? "Evento actualizado" : "Event updated");
      } else {
        await axios.post(`${API}/events`, payload, { withCredentials: true });
        toast.success(language === "es" ? "Evento creado" : "Event created");
      }
      fetchEvents();
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      // Pydantic 422 errors are already normalized to a readable string by the
      // global axios interceptor (see utils/errorFormatter.js).
      toast.error(
        error.response?.data?.detail ||
        (language === "es" ? "Error al guardar evento" : "Failed to save event")
      );
    }
  };

  const handleDelete = async (eventId) => {
    if (!confirm(language === "es" ? "¿Eliminar evento?" : "Delete event?")) return;
    try {
      await axios.delete(`${API}/events/${eventId}`, { withCredentials: true });
      toast.success(language === "es" ? "Evento eliminado" : "Event deleted");
      fetchEvents();
    } catch (error) {
      toast.error("Failed to delete event");
    }
  };

  const handleDuplicate = async (eventId) => {
    try {
      await axios.post(`${API}/events/${eventId}/duplicate`, {}, { withCredentials: true });
      toast.success(language === "es" ? "Evento duplicado" : "Event duplicated");
      fetchEvents();
    } catch (error) {
      toast.error("Failed to duplicate event");
    }
  };

  const handleEdit = (event) => {
    setEditingEvent(event);
    setFormData({
      client_id: event.client_id,
      name: event.name,
      engagement_type: event.engagement_type || "event",
      event_type: event.event_type,
      event_date: event.event_date ? new Date(event.event_date) : null,
      event_date_tbd: event.event_date_tbd || !event.event_date,
      end_date: event.end_date ? new Date(event.end_date) : null,
      start_time: event.start_time || "",
      end_time: event.end_time || "",
      is_booking: event.is_booking || false,
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
      start_time: "",
      end_time: "",
      is_booking: false,
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
      
      await axios.put(`${API}/events/${eventId}`, {
        ...event,
        stage: newStage,
        event_date: event.event_date ? new Date(event.event_date).toISOString() : null,
        end_date: event.end_date ? new Date(event.end_date).toISOString() : null,
      }, { withCredentials: true });
      
      toast.success(language === "es" ? "Etapa actualizada" : "Stage updated");
      fetchEvents();
      if (viewMode === "pipeline") fetchPipeline();
    } catch (error) {
      toast.error("Failed to update stage");
    }
  };

  const filteredEvents = events.filter((event) =>
    event.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.venue?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
    const start = new Date(event.event_date);
    const end = new Date(event.end_date);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return `${days} ${isEs ? "días" : "days"}`;
  };

  const content = (
    <div className="space-y-6" data-testid="events-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">
            {embedded ? (isEs ? "Propuestas & Acuerdos" : "Proposals & Agreements") : t("events")}
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
                    <Select
                      value={formData.client_id}
                      onValueChange={(value) => setFormData({ ...formData, client_id: value })}
                    >
                      <SelectTrigger data-testid="event-client-select">
                        <SelectValue placeholder={language === "es" ? "Seleccionar cliente" : "Select client"} />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((client) => (
                          <SelectItem key={client.client_id} value={client.client_id}>
                            {client.display_name || client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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

                  {/* Date fields */}
                  {!formData.event_date_tbd && (formData.is_booking ? (
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
                            <SelectItem key={stage} value={stage}>{stage}</SelectItem>
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

        {/* Search */}
        {viewMode !== "pipeline" && (
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("search")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="event-search-input"
            />
          </div>
        )}

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
                      <Badge className={stageColors[event.stage || "Lead"]}>{event.stage || "Lead"}</Badge>
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
                  <p className="text-sm text-muted-foreground mb-4 capitalize">{event.event_type}</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CalendarIcon className="w-4 h-4" />
                      <span>
                        {event.event_date_tbd || !event.event_date || new Date(event.event_date).getTime() < 86400000
                          ? "TBD" 
                          : new Date(event.event_date).toLocaleDateString(language === "es" ? "es-ES" : "en-US")}
                        {event.is_booking && event.end_date && new Date(event.end_date).getTime() > 86400000 && (
                          <> - {new Date(event.end_date).toLocaleDateString(language === "es" ? "es-ES" : "en-US")}</>
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
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="w-4 h-4" />
                      {event.guest_count} {language === "es" ? "invitados" : "guests"}
                    </div>
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
                    <span className="font-semibold">{stage}</span>
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
                            {event.event_date_tbd || !event.event_date || new Date(event.event_date).getTime() < 86400000
                              ? "TBD" 
                              : new Date(event.event_date).toLocaleDateString()}
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
                                → {targetStage}
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
