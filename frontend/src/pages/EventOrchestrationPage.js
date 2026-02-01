import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Routes, Route, NavLink, Navigate, useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";

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
  CheckCircle, AlertCircle, MapPin, Building2, FileText, Lock
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

const API = process.env.REACT_APP_BACKEND_URL;

// ==================== EVENTS LIST ====================
function EventsList() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

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

  const filteredEvents = events.filter(e =>
    e.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.client_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status) => {
    const styles = {
      Lead: "bg-blue-100 text-blue-700",
      Contacted: "bg-cyan-100 text-cyan-700",
      Proposal: "bg-yellow-100 text-yellow-700",
      Negotiation: "bg-orange-100 text-orange-700",
      Won: "bg-green-100 text-green-700",
      Lost: "bg-red-100 text-red-700"
    };
    return <Badge className={styles[status] || "bg-gray-100 text-gray-700"}>{status}</Badge>;
  };

  const getOrchestrationStatus = (event) => {
    const complete = [event.has_blueprint, event.has_run_of_show, event.has_team].filter(Boolean).length;
    if (complete === 0) return { label: isEs ? "Sin configurar" : "Not configured", color: "text-muted-foreground" };
    if (complete < 3) return { label: isEs ? "En progreso" : "In progress", color: "text-yellow-600" };
    return { label: isEs ? "Configurado" : "Configured", color: "text-green-600" };
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="orchestration-events-list">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{isEs ? "Eventos Confirmados" : "Confirmed Events"}</h2>
          <p className="text-muted-foreground">
            {isEs ? "Solo eventos ganados (Won) aparecen aquí para ejecución" : "Only Won events appear here for execution"}
          </p>
        </div>
        <Button variant="outline" onClick={fetchEvents}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {isEs ? "Actualizar" : "Refresh"}
        </Button>
      </div>

      {/* Info Banner */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="py-3">
          <p className="text-sm text-blue-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {isEs 
              ? "Esta es la capa de ejecución. Los eventos en Lead, Proposal o Negotiation deben ser confirmados (Won) desde el módulo de Ventas para aparecer aquí." 
              : "This is the execution layer. Events in Lead, Proposal or Negotiation must be confirmed (Won) from the Sales module to appear here."}
          </p>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={isEs ? "Buscar eventos..." : "Search events..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Events Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEvents.map((event) => {
          const orchStatus = getOrchestrationStatus(event);
          const isLocked = event.is_locked || event.stage === "Closed";
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
                      {isLocked && <Badge variant="secondary" className="text-xs">Closed</Badge>}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-1 mt-1">
                      <Building2 className="w-3 h-3" />
                      {event.client_name || (isEs ? "Sin cliente" : "No client")}
                    </CardDescription>
                  </div>
                  {getStatusBadge(event.stage || "Won")}
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
                  {event.venue_name && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      {event.venue_name}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="w-4 h-4" />
                    {event.guest_count || "?"} {isEs ? "invitados" : "guests"}
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t">
                    {event.has_blueprint && <CheckCircle className="w-4 h-4 text-green-500" />}
                    {event.has_run_of_show && <Clock className="w-4 h-4 text-green-500" />}
                    {event.has_team && <Users className="w-4 h-4 text-green-500" />}
                    <span className={`text-xs ${orchStatus.color}`}>{orchStatus.label}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filteredEvents.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Music4 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{isEs ? "No hay eventos confirmados para mostrar" : "No confirmed events to display"}</p>
            <p className="text-sm mt-2">
              {isEs ? "Los eventos deben marcarse como 'Won' en el módulo de Ventas" : "Events must be marked as 'Won' in the Sales module"}
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
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("blueprint");

  const fetchEvent = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/orchestration/blueprint/${eventId}`, { withCredentials: true });
      setEvent(res.data.event);
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error al cargar evento" : "Failed to load event");
    }
    setLoading(false);
  }, [eventId, isEs]);

  useEffect(() => { fetchEvent(); }, [fetchEvent]);

  const handleCloseEvent = async () => {
    if (!window.confirm(isEs 
      ? "¿Estás seguro de cerrar este evento? Solo Post-Event Review quedará editable." 
      : "Are you sure you want to close this event? Only Post-Event Review will remain editable.")) {
      return;
    }
    try {
      await axios.post(`${API}/api/orchestration/events/${eventId}/close`, {}, { withCredentials: true });
      toast.success(isEs ? "Evento cerrado" : "Event closed");
      fetchEvent();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al cerrar evento" : "Failed to close event"));
    }
  };

  const handleReopenEvent = async () => {
    if (!window.confirm(isEs 
      ? "¿Estás seguro de reabrir este evento?" 
      : "Are you sure you want to reopen this event?")) {
      return;
    }
    try {
      await axios.post(`${API}/api/orchestration/events/${eventId}/reopen`, {}, { withCredentials: true });
      toast.success(isEs ? "Evento reabierto" : "Event reopened");
      fetchEvent();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al reabrir evento" : "Failed to reopen event"));
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;
  if (!event) return <div className="text-center py-12">{isEs ? "Evento no encontrado" : "Event not found"}</div>;

  const isLocked = event.stage === "Closed";

  const tabs = [
    { value: "blueprint", label: isEs ? "Event Blueprint" : "Event Blueprint", icon: FileCheck },
    { value: "experience", label: isEs ? "Experience Design" : "Experience Design", icon: Palette },
    { value: "operational", label: isEs ? "Operational Flow" : "Operational Flow", icon: GitBranch },
    { value: "runofshow", label: isEs ? "Run of Show" : "Run of Show", icon: Clock },
    { value: "team", label: isEs ? "Team & Roles" : "Team & Roles", icon: Users },
    { value: "production", label: isEs ? "Production Assets" : "Production Assets", icon: Package },
    { value: "calendar", label: isEs ? "Event Calendar" : "Event Calendar", icon: Calendar },
    { value: "review", label: isEs ? "Post-Event Review" : "Post-Event Review", icon: Star },
    { value: "binder", label: "Event Binder", icon: FileText },
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
                  ? "Este evento está cerrado. Solo Post-Event Review y Event Binder están disponibles." 
                  : "This event is closed. Only Post-Event Review and Event Binder are available."}
              </p>
              <Button variant="outline" size="sm" onClick={handleReopenEvent}>
                {isEs ? "Reabrir Evento" : "Reopen Event"}
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
            {isEs ? "Volver a eventos" : "Back to events"}
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
              {event.guest_count || "?"} {isEs ? "invitados" : "guests"}
            </span>
          </div>
        </div>
        {!isLocked && (
          <Button variant="outline" onClick={handleCloseEvent}>
            <Lock className="w-4 h-4 mr-2" />
            {isEs ? "Cerrar Evento" : "Close Event"}
          </Button>
        )}
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

  const sidebarNavItems = [
    { path: "/event-orchestration", label: isEs ? "Todos los Eventos" : "All Events", icon: Music4, end: true },
    { path: "/event-orchestration/calendar", label: isEs ? "Calendario Global" : "Global Calendar", icon: Calendar },
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)]" data-testid="event-orchestration-page">
      {/* Sidebar Navigation */}
      <div className="w-64 border-r bg-muted/30 p-4 flex flex-col">
        <NavLink 
          to="/dashboard" 
          className="flex items-center gap-2 mb-4 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {isEs ? "Volver al Dashboard" : "Back to Dashboard"}
        </NavLink>
        
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Music4 className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-bold">Event Orchestration</h2>
          </div>
          <p className="text-xs text-muted-foreground pl-8">
            {isEs 
              ? "Donde personas, tiempo y ejecución se mueven en sincronía" 
              : "Where people, time, and execution move in sync"}
          </p>
        </div>

        <nav className="space-y-1 flex-1">
          {sidebarNavItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm ${
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "hover:bg-muted"
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <Routes>
          <Route index element={<EventsList />} />
          <Route path="calendar" element={<EventCalendarTab isGlobal={true} />} />
          <Route path=":eventId/*" element={<EventDetail />} />
        </Routes>
      </div>
    </div>
  );
}
