import { useState, useEffect, useCallback, useMemo } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useModules } from "../contexts/ModulesContext";
import { Routes, Route, NavLink, Navigate, useParams, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Layout } from "../components/Layout";

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";

// Icons
import {
  Music4, ArrowLeft, Calendar, Users, Clock, Package,
  Palette, GitBranch, FileCheck, Star, Search, RefreshCw,
  CheckCircle, AlertCircle, MapPin, Building2, FileText, Lock, ExternalLink,
  LayoutGrid, Briefcase, FolderKanban, ClipboardList
} from "lucide-react";

// Tab Components
import EventBlueprintTab from "../components/orchestration/EventBlueprintTab";
import ExperienceDesignTab from "../components/orchestration/ExperienceDesignTab";
import OperationalFlowTab from "../components/orchestration/OperationalFlowTab";
import RunOfShowTab from "../components/orchestration/RunOfShowTab";
import TeamRolesTab from "../components/orchestration/TeamRolesTab";
import ProductionAssetsTab from "../components/orchestration/ProductionAssetsTab";
import EventCalendarTab from "../components/orchestration/EventCalendarTab";
import PostEventReviewTab from "../components/orchestration/PostEventReviewTab";
import EventBinderTab from "../components/orchestration/EventBinderTab";
import OperationalDocumentsTab from "../components/orchestration/OperationalDocumentsTab";
import RoomSetupTab from "../components/RoomSetupTab";

import { API_BASE as API } from "../utils/api"; // Dynamic API URL

// Icon mapping for dynamic industry icons
const MODULE_ICONS = {
  "calendar-check": Calendar,
  "folder-kanban": FolderKanban,
  "briefcase": Briefcase,
  "clipboard-list": ClipboardList,
  "music": Music4,
};

// ==================== EVENTS LIST ====================
function EventsList() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const { getProgramOrchestrationConfig, getFieldLabel, isEventsIndustry } = useModules();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [timeWindow, setTimeWindow] = useState("all"); // now, 7days, 30days, all

  // Get dynamic terminology
  const poConfig = useMemo(() => getProgramOrchestrationConfig(), [getProgramOrchestrationConfig]);
  const entitySingular = isEs ? poConfig.entity_singular_es : poConfig.entity_singular_en;
  const entityPlural = isEs ? poConfig.entity_plural_es : poConfig.entity_plural_en;
  const dateLabel = getFieldLabel("date", isEs ? "es" : "en");
  const guestCountLabel = getFieldLabel("guest_count", isEs ? "es" : "en");
  const venueLabel = getFieldLabel("venue", isEs ? "es" : "en");

  const fetchEvents = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/orchestration/events`, { withCredentials: true });
      setEvents(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Time Window Filter Logic
  const filterByTimeWindow = (event) => {
    if (timeWindow === "all") return true;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = event.event_date ? new Date(event.event_date) : null;
    
    if (!eventDate) return timeWindow === "all"; // Events without date only show in "All"
    
    eventDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
    
    switch (timeWindow) {
      case "now":
        // Events occurring today or with active execution
        return diffDays === 0 || (diffDays >= -1 && diffDays <= 1);
      case "7days":
        // Events within next 7 days
        return diffDays >= 0 && diffDays <= 7;
      case "30days":
        // Events within next 30 days
        return diffDays >= 0 && diffDays <= 30;
      default:
        return true;
    }
  };

  // Get micro-signals for event cards
  const getMicroSignals = (event) => {
    const signals = [];
    const today = new Date();
    const eventDate = event.event_date ? new Date(event.event_date) : null;
    
    if (eventDate) {
      const diffDays = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
      // Upcoming milestone (event within 7 days)
      if (diffDays >= 0 && diffDays <= 7) {
        signals.push({ icon: "⏱️", label: isEs ? "Próximo" : "Soon", type: "upcoming" });
      }
    }
    
    // Pending dependency (no blueprint or no run of show)
    if (!event.has_blueprint || !event.has_run_of_show) {
      signals.push({ icon: "⚠️", label: isEs ? "Pendiente" : "Pending", type: "dependency" });
    }
    
    // Team not fully assigned
    if (!event.has_team) {
      signals.push({ icon: "👥", label: isEs ? "Equipo" : "Team", type: "team" });
    }
    
    // Recent change (updated within last 24 hours)
    if (event.updated_at) {
      const updatedAt = new Date(event.updated_at);
      const hoursSinceUpdate = (today - updatedAt) / (1000 * 60 * 60);
      if (hoursSinceUpdate <= 24) {
        signals.push({ icon: "🔄", label: isEs ? "Reciente" : "Recent", type: "change" });
      }
    }
    
    return signals;
  };

  const filteredEvents = events
    .filter(filterByTimeWindow)
    .filter(e =>
      e.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.client_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const getStatusBadge = (status) => {
    const styles = {
      "Committed": "bg-emerald-100 text-emerald-700",
      "Won": "bg-emerald-100 text-emerald-700",
      "Closed": "bg-purple-100 text-purple-700"
    };
    return <Badge className={styles[status] || "bg-gray-100 text-gray-700"}>{status}</Badge>;
  };

  const getOrchestrationStatus = (event) => {
    const complete = [event.has_blueprint, event.has_run_of_show, event.has_team].filter(Boolean).length;
    if (complete === 0) return { label: isEs ? "Sin configurar" : "Not configured", color: "text-muted-foreground" };
    if (complete < 3) return { label: isEs ? "En progreso" : "In progress", color: "text-yellow-600" };
    return { label: isEs ? "Configurado" : "Configured", color: "text-green-600" };
  };

  // Time Window options
  const timeWindowOptions = [
    { value: "now", label: isEs ? "Ahora" : "Now" },
    { value: "7days", label: isEs ? "7 Días" : "Next 7 Days" },
    { value: "30days", label: isEs ? "30 Días" : "Next 30 Days" },
    { value: "all", label: isEs ? "Todos" : "All" }
  ];

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="orchestration-events-list">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{isEs ? `${entityPlural} Confirmados` : `Confirmed ${entityPlural}`}</h2>
          <p className="text-muted-foreground">
            {isEs 
              ? `Solo ${entityPlural.toLowerCase()} comprometidos aparecen aquí para ejecución` 
              : `Only committed ${entityPlural.toLowerCase()} appear here for execution`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Time Window Filter */}
          <div className="flex items-center gap-2 text-sm" data-testid="time-window-filter">
            <span className="text-muted-foreground">{isEs ? "Ventana:" : "Time Window:"}</span>
            <div className="flex items-center gap-1">
              {timeWindowOptions.map((option, idx) => (
                <button
                  key={option.value}
                  onClick={() => setTimeWindow(option.value)}
                  className={`px-2.5 py-1 rounded-md transition-colors text-sm ${
                    timeWindow === option.value 
                      ? "bg-primary text-primary-foreground font-medium" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid={`time-window-${option.value}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchEvents}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Info Banner */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="py-3">
          <p className="text-sm text-blue-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {isEs 
              ? `Esta es la capa de ejecución. Los ${entityPlural.toLowerCase()} deben estar Committed desde Client Engagement para aparecer aquí.` 
              : `This is the execution layer. ${entityPlural} must be Committed from Client Engagement to appear here.`}
          </p>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={isEs ? `Buscar ${entityPlural.toLowerCase()}...` : `Search ${entityPlural.toLowerCase()}...`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Subtle Legend for Micro-Signals */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground/70">
        <span className="flex items-center gap-1"><span>⏱️</span> {isEs ? "Próximo" : "Upcoming"}</span>
        <span className="flex items-center gap-1"><span>⚠️</span> {isEs ? "Pendiente" : "Pending"}</span>
        <span className="flex items-center gap-1"><span>🔄</span> {isEs ? "Reciente" : "Recent"}</span>
        <span className="flex items-center gap-1"><span>👥</span> {isEs ? "Equipo" : "Team"}</span>
      </div>

      {/* Events Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEvents.map((event) => {
          const orchStatus = getOrchestrationStatus(event);
          const isLocked = event.is_locked || event.stage === "Closed";
          const microSignals = getMicroSignals(event);
          return (
            <Card 
              key={event.event_id} 
              className={`cursor-pointer hover:shadow-md transition-shadow ${isLocked ? "border-gray-400 bg-gray-50" : ""}`}
              onClick={() => navigate(`/event-orchestration/${event.event_id}`)}
              data-testid={`orchestration-event-${event.event_id}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base line-clamp-1 flex items-center gap-2">
                      {event.name}
                      {isLocked && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-1 mt-1">
                      <Building2 className="w-3 h-3" />
                      {event.client_name || (isEs ? "Sin cliente" : "No client")}
                    </CardDescription>
                  </div>
                  {getStatusBadge(event.stage || "Committed")}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    {event.event_date 
                      ? new Date(event.event_date).toLocaleDateString()
                      : (isEs ? "Fecha por definir" : "Date TBD")}
                  </div>
                  {event.venue && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      <span className="truncate">{event.venue}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="w-4 h-4" />
                    {event.guest_count || "?"} {guestCountLabel.toLowerCase()}
                  </div>
                  
                  {/* Orchestration Status */}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    {event.has_blueprint && <CheckCircle className="w-4 h-4 text-green-500" />}
                    {event.has_run_of_show && <Clock className="w-4 h-4 text-green-500" />}
                    {event.has_team && <Users className="w-4 h-4 text-green-500" />}
                    <span className={`text-xs ${orchStatus.color}`}>{orchStatus.label}</span>
                  </div>
                  
                  {/* Micro-Signals */}
                  {microSignals.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {microSignals.map((signal, idx) => (
                        <span 
                          key={idx} 
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded"
                          title={signal.label}
                        >
                          <span className="text-xs">{signal.icon}</span>
                          <span className="hidden sm:inline">{signal.label}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filteredEvents.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{isEs ? `No hay ${entityPlural.toLowerCase()} para mostrar en esta ventana` : `No ${entityPlural.toLowerCase()} to display in this time window`}</p>
            <p className="text-sm mt-2">
              {timeWindow !== "all" 
                ? (isEs ? "Intenta cambiar el filtro de tiempo o ver 'Todos'" : "Try changing the time filter or view 'All'")
                : (isEs ? `Los ${entityPlural.toLowerCase()} deben marcarse como 'Committed' en Client Engagement` : `${entityPlural} must be marked as 'Committed' in Client Engagement`)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== EVENT DETAIL ====================
function EventDetail() {
  const { eventId } = useParams();
  const { language } = useLanguage();
  const isEs = language === "es";
  const { getProgramOrchestrationConfig, getFieldLabel, isEventsIndustry } = useModules();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("blueprint");

  // Get dynamic terminology
  const poConfig = useMemo(() => getProgramOrchestrationConfig(), [getProgramOrchestrationConfig]);
  const entitySingular = isEs ? poConfig.entity_singular_es : poConfig.entity_singular_en;
  const entityPlural = isEs ? poConfig.entity_plural_es : poConfig.entity_plural_en;
  const guestCountLabel = getFieldLabel("guest_count", isEs ? "es" : "en");

  const fetchEvent = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/orchestration/blueprint/${eventId}`, { withCredentials: true });
      setEvent(res.data);
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error al cargar evento" : "Failed to load event");
    }
    setLoading(false);
  }, [eventId, isEs]);

  useEffect(() => { fetchEvent(); }, [fetchEvent]);

  const handleCloseEvent = async () => {
    if (!window.confirm(isEs 
      ? `¿Estás seguro de cerrar este ${entitySingular.toLowerCase()}? Solo Post-Event Review quedará editable.` 
      : `Are you sure you want to close this ${entitySingular.toLowerCase()}? Only Post-Event Review will remain editable.`)) {
      return;
    }
    try {
      await axios.post(`${API}/api/orchestration/events/${eventId}/close`, {}, { withCredentials: true });
      toast.success(isEs ? `${entitySingular} cerrado` : `${entitySingular} closed`);
      fetchEvent();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? `Error al cerrar ${entitySingular.toLowerCase()}` : `Failed to close ${entitySingular.toLowerCase()}`));
    }
  };

  const handleReopenEvent = async () => {
    if (!window.confirm(isEs 
      ? `¿Estás seguro de reabrir este ${entitySingular.toLowerCase()}?` 
      : `Are you sure you want to reopen this ${entitySingular.toLowerCase()}?`)) {
      return;
    }
    try {
      await axios.post(`${API}/api/orchestration/events/${eventId}/reopen`, {}, { withCredentials: true });
      toast.success(isEs ? `${entitySingular} reabierto` : `${entitySingular} reopened`);
      fetchEvent();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? `Error al reabrir ${entitySingular.toLowerCase()}` : `Failed to reopen ${entitySingular.toLowerCase()}`));
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;
  if (!event) return <div className="text-center py-12">{isEs ? `${entitySingular} no encontrado` : `${entitySingular} not found`}</div>;

  const isLocked = event.stage === "Closed";

  // Build tabs - some are industry-specific
  const tabs = [
    { value: "blueprint", label: isEs ? `${entitySingular} Blueprint` : `${entitySingular} Blueprint`, icon: FileCheck },
    ...(isEventsIndustry ? [{ value: "experience", label: isEs ? "Experience Design" : "Experience Design", icon: Palette }] : []),
    ...(isEventsIndustry ? [{ value: "roomsetup", label: isEs ? "Room Setup" : "Room Setup", icon: LayoutGrid }] : []),
    { value: "operational", label: isEs ? "Operational Flow" : "Operational Flow", icon: GitBranch },
    ...(isEventsIndustry ? [{ value: "runofshow", label: isEs ? "Run of Show" : "Run of Show", icon: Clock }] : []),
    { value: "team", label: isEs ? "Team & Roles" : "Team & Roles", icon: Users },
    { value: "production", label: isEs ? "Production Assets" : "Production Assets", icon: Package },
    { value: "documents", label: isEs ? "Documentos" : "Documents", icon: FileText },
    { value: "calendar", label: isEs ? `${entitySingular} Calendar` : `${entitySingular} Calendar`, icon: Calendar },
    { value: "review", label: isEs ? "Post-Review" : "Post-Review", icon: Star },
    { value: "binder", label: `${entitySingular} Binder`, icon: FileText },
  ];

  return (
    <div className="space-y-6" data-testid="orchestration-event-detail">
      {/* Locked Banner */}
      {isLocked && (
        <Card className="border-gray-300 bg-gray-100">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600 flex items-center gap-2">
                <Lock className="w-4 h-4" />
                {isEs 
                  ? `Este ${entitySingular.toLowerCase()} está cerrado. Solo Post-Review y ${entitySingular} Binder están disponibles.` 
                  : `This ${entitySingular.toLowerCase()} is closed. Only Post-Review and ${entitySingular} Binder are available.`}
              </p>
              <Button variant="outline" size="sm" onClick={handleReopenEvent}>
                {isEs ? `Reabrir ${entitySingular}` : `Reopen ${entitySingular}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button 
            onClick={() => navigate("/event-orchestration")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {isEs ? `Volver a ${entityPlural.toLowerCase()}` : `Back to ${entityPlural.toLowerCase()}`}
          </button>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            {event.name}
            {isLocked && <Badge variant="secondary"><Lock className="w-3 h-3 mr-1" />Closed</Badge>}
          </h2>
          <div className="flex items-center gap-4 mt-1 text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {event.event_date ? new Date(event.event_date).toLocaleDateString() : "TBD"}
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              {event.guest_count || "?"} {guestCountLabel.toLowerCase()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={() => {
              const portalUrl = `${window.location.origin}/portal/event/${eventId}`;
              window.open(portalUrl, '_blank');
            }}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            {isEs ? "Portal Cliente" : "Client Portal"}
          </Button>
          {!isLocked && (
            <Button variant="outline" onClick={handleCloseEvent}>
              <Lock className="w-4 h-4 mr-2" />
              {isEs ? `Cerrar ${entitySingular}` : `Close ${entitySingular}`}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          {tabs.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-2 text-xs sm:text-sm">
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="blueprint">
          <EventBlueprintTab eventId={eventId} event={event} onUpdate={fetchEvent} isLocked={isLocked} />
        </TabsContent>
        <TabsContent value="experience">
          <ExperienceDesignTab eventId={eventId} isLocked={isLocked} />
        </TabsContent>
        <TabsContent value="roomsetup">
          <RoomSetupTab eventId={eventId} event={event} isLocked={isLocked} />
        </TabsContent>
        <TabsContent value="operational">
          <OperationalFlowTab eventId={eventId} isLocked={isLocked} />
        </TabsContent>
        <TabsContent value="runofshow">
          <RunOfShowTab eventId={eventId} eventType={event.event_type} isLocked={isLocked} />
        </TabsContent>
        <TabsContent value="team">
          <TeamRolesTab eventId={eventId} isLocked={isLocked} />
        </TabsContent>
        <TabsContent value="production">
          <ProductionAssetsTab eventId={eventId} isLocked={isLocked} />
        </TabsContent>
        <TabsContent value="documents">
          <OperationalDocumentsTab eventId={eventId} isLocked={isLocked} language={isEs ? "es" : "en"} />
        </TabsContent>
        <TabsContent value="calendar">
          <EventCalendarTab eventId={eventId} />
        </TabsContent>
        <TabsContent value="review">
          <PostEventReviewTab eventId={eventId} eventStatus={event.stage} />
        </TabsContent>
        <TabsContent value="binder">
          <EventBinderTab eventId={eventId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ==================== MAIN PAGE ====================
export default function EventOrchestrationPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const { getProgramOrchestrationConfig, isEventsIndustry } = useModules();
  const location = useLocation();
  const navigate = useNavigate();

  // Get dynamic terminology
  const poConfig = useMemo(() => getProgramOrchestrationConfig(), [getProgramOrchestrationConfig]);
  const moduleName = isEs ? poConfig.name_es : poConfig.name_en;
  const moduleDescription = isEs ? poConfig.description_es : poConfig.description_en;
  const entityPlural = isEs ? poConfig.entity_plural_es : poConfig.entity_plural_en;
  
  // Get dynamic icon
  const ModuleIcon = MODULE_ICONS[poConfig.icon] || ClipboardList;

  const navTabs = [
    { path: "/event-orchestration", label: entityPlural, icon: ModuleIcon, end: true },
    { path: "/event-orchestration/calendar", label: isEs ? "Calendario" : "Calendar", icon: Calendar },
  ];

  // Check if we're viewing an event detail
  const isEventDetail = location.pathname.match(/\/event-orchestration\/[a-f0-9]+/);

  return (
    <Layout>
      <div className="space-y-6" data-testid="event-orchestration-page">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
            <ModuleIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{moduleName}</h1>
            <p className="text-sm text-muted-foreground">
              {moduleDescription || (isEs ? `Planificación y ejecución de ${entityPlural.toLowerCase()}` : `${entityPlural} planning & execution`)}
            </p>
          </div>
        </div>

        {/* Navigation Tabs - only show when not in event detail */}
        {!isEventDetail && (
          <div className="border-b">
            <nav className="flex gap-1 overflow-x-auto pb-px">
              {navTabs.map((tab) => (
                <NavLink
                  key={tab.path}
                  to={tab.path}
                  end={tab.end}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      isActive
                        ? "border-purple-600 text-purple-600"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                    }`
                  }
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}

        {/* Content */}
        <Routes>
          <Route index element={<EventsList />} />
          <Route path="calendar" element={<EventCalendarTab isGlobal={true} />} />
          <Route path=":eventId/*" element={<EventDetail />} />
        </Routes>
      </div>
    </Layout>
  );
}
