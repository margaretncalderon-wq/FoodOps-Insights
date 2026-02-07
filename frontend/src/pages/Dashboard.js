import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_BASE as API } from "../utils/api";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { 
  Activity, Calendar, Clock, AlertCircle, CheckCircle, ArrowRight,
  FileCheck, Users, Zap, Bell, RefreshCw, ChefHat, MapPin, Building2,
  GitBranch, Lock, Unlock, Target
} from "lucide-react";

// ==================== SYSTEM PULSE ====================
export default function SystemPulse() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState("all");
  const [systemData, setSystemData] = useState({
    activeEvents: [],
    attentionRequired: [],
    recentDecisions: [],
    systemAlerts: []
  });
  const [executionPending, setExecutionPending] = useState(null);

  const fetchSystemData = useCallback(async () => {
    setLoading(true);
    try {
      const [eventsRes, statsRes, pendingRes] = await Promise.all([
        axios.get(`${API}/orchestration/events`, { withCredentials: true }),
        axios.get(`${API}/dashboard/stats`, { withCredentials: true }),
        axios.get(`${API}/execution-hub/my-pending`, { withCredentials: true }).catch(() => ({ data: null }))
      ]);

      const events = eventsRes.data || [];
      const stats = statsRes.data || {};
      setExecutionPending(pendingRes.data);
      
      // Process Active Events (from Event Orchestration)
      const now = new Date();
      const activeEvents = events.map(event => {
        const eventDate = event.event_date ? new Date(event.event_date) : null;
        const daysUntil = eventDate ? Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24)) : null;
        
        // Determine status
        let status = "on-track";
        if (!event.has_blueprint || !event.has_run_of_show) status = "attention";
        if (!event.has_team && daysUntil !== null && daysUntil <= 7) status = "blocked";
        
        return {
          ...event,
          daysUntil,
          status
        };
      });

      // Build Attention Required items
      const attentionRequired = [];
      
      // Events without blueprint
      events.filter(e => !e.has_blueprint).forEach(e => {
        attentionRequired.push({
          id: `blueprint-${e.event_id}`,
          type: "dependency",
          title: isEs ? "Blueprint pendiente" : "Blueprint pending",
          description: e.name,
          link: `/event-orchestration/${e.event_id}`,
          priority: "high"
        });
      });

      // Events without team assigned (within 14 days)
      events.filter(e => {
        if (e.has_team) return false;
        const eventDate = e.event_date ? new Date(e.event_date) : null;
        if (!eventDate) return false;
        const daysUntil = Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24));
        return daysUntil <= 14 && daysUntil >= 0;
      }).forEach(e => {
        attentionRequired.push({
          id: `team-${e.event_id}`,
          type: "blocker",
          title: isEs ? "Equipo sin asignar" : "Team not assigned",
          description: e.name,
          link: `/event-orchestration/${e.event_id}`,
          priority: "medium"
        });
      });

      // Overdue tasks
      (stats.tasks_overdue || []).forEach(task => {
        attentionRequired.push({
          id: `task-${task.task_id}`,
          type: "approval",
          title: isEs ? "Tarea vencida" : "Overdue task",
          description: `${task.title} - ${task.event_name}`,
          link: `/events/${task.event_id}`,
          priority: "high"
        });
      });

      // Build Recent Decisions (events recently moved to Committed/Won)
      const recentDecisions = [];
      
      // Recently confirmed events (check updated_at within 48 hours)
      events.filter(e => {
        if (!e.updated_at) return false;
        const updatedAt = new Date(e.updated_at);
        const hoursSince = (now - updatedAt) / (1000 * 60 * 60);
        return hoursSince <= 48;
      }).forEach(e => {
        recentDecisions.push({
          id: `decision-${e.event_id}`,
          type: "commitment",
          title: isEs ? "Evento confirmado" : "Event confirmed",
          description: e.name,
          timestamp: e.updated_at,
          link: `/event-orchestration/${e.event_id}`
        });
      });

      // Build System Alerts (cross-module impacts)
      const systemAlerts = [];
      
      // Low stock affecting events
      if (stats.low_stock_alerts > 0) {
        systemAlerts.push({
          id: "inventory-impact",
          type: "culinary",
          title: isEs ? "Inventario bajo" : "Low inventory",
          description: isEs 
            ? `${stats.low_stock_alerts} items pueden afectar próximos eventos`
            : `${stats.low_stock_alerts} items may impact upcoming events`,
          link: "/food-ops/inventory"
        });
      }

      setSystemData({
        activeEvents,
        attentionRequired,
        recentDecisions,
        systemAlerts
      });
    } catch (error) {
      console.error("Failed to fetch system data:", error);
    } finally {
      setLoading(false);
    }
  }, [isEs]);

  useEffect(() => {
    fetchSystemData();
  }, [fetchSystemData]);

  // Time Window Filter
  const filterByTimeWindow = (event) => {
    if (timeWindow === "all") return true;
    if (event.daysUntil === null) return timeWindow === "all";
    
    switch (timeWindow) {
      case "now": return event.daysUntil >= -1 && event.daysUntil <= 1;
      case "7days": return event.daysUntil >= 0 && event.daysUntil <= 7;
      case "30days": return event.daysUntil >= 0 && event.daysUntil <= 30;
      default: return true;
    }
  };

  const filteredActiveEvents = systemData.activeEvents.filter(filterByTimeWindow);

  // Time Window Options
  const timeWindowOptions = [
    { value: "now", label: isEs ? "Ahora" : "Now" },
    { value: "7days", label: isEs ? "7 Días" : "Next 7 Days" },
    { value: "30days", label: isEs ? "30 Días" : "Next 30 Days" },
    { value: "all", label: isEs ? "Todos" : "All" }
  ];

  // Status indicator styles
  const getStatusStyle = (status) => {
    switch (status) {
      case "on-track": return { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" };
      case "attention": return { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" };
      case "blocked": return { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", dot: "bg-rose-500" };
      default: return { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700", dot: "bg-gray-500" };
    }
  };

  const getStatusLabel = (status) => {
    const labels = {
      "on-track": isEs ? "En curso" : "On Track",
      "attention": isEs ? "Atención" : "Attention",
      "blocked": isEs ? "Bloqueado" : "Blocked"
    };
    return labels[status] || status;
  };

  const getPriorityStyle = (priority) => {
    switch (priority) {
      case "high": return "border-l-rose-500";
      case "medium": return "border-l-amber-500";
      default: return "border-l-gray-300";
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8" data-testid="system-pulse-page">
        {/* ==================== HEADER ==================== */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-bold text-foreground">
                System Pulse
              </h1>
              <p className="text-sm text-muted-foreground">
                {isEs 
                  ? "Vista en tiempo real del estado del sistema"
                  : "Real-time view of system state"}
              </p>
            </div>
          </div>
          
          {/* Time Window Selector */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{isEs ? "Ventana:" : "Time Window:"}</span>
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              {timeWindowOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTimeWindow(option.value)}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    timeWindow === option.value 
                      ? "bg-background shadow-sm font-medium" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`time-window-${option.value}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button 
              onClick={fetchSystemData}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title={isEs ? "Actualizar" : "Refresh"}
            >
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* ==================== PERMANENT CORE ==================== */}
        <div className="grid lg:grid-cols-2 gap-6">
          
          {/* -------------------- 1) ACTIVE EVENTS -------------------- */}
          <Card className="lg:col-span-2" data-testid="active-events-section">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg">
                    {isEs ? "Eventos Activos" : "Active Events"}
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {filteredActiveEvents.length}
                  </Badge>
                </div>
                <Link 
                  to="/event-orchestration" 
                  className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                >
                  {isEs ? "Ver todos" : "View all"}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {isEs 
                  ? "Eventos confirmados en ejecución o próximos"
                  : "Confirmed events in execution or approaching"}
              </p>
            </CardHeader>
            <CardContent>
              {filteredActiveEvents.length > 0 ? (
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredActiveEvents.slice(0, 6).map((event) => {
                    const statusStyle = getStatusStyle(event.status);
                    return (
                      <Link
                        key={event.event_id}
                        to={`/event-orchestration/${event.event_id}`}
                        className={`block p-4 rounded-lg border ${statusStyle.border} ${statusStyle.bg} hover:shadow-sm transition-all`}
                        data-testid={`active-event-${event.event_id}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-sm line-clamp-1">{event.name}</h4>
                          <div className={`w-2 h-2 rounded-full ${statusStyle.dot} flex-shrink-0 mt-1.5`} />
                        </div>
                        <div className="space-y-1.5 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3 h-3" />
                            <span className="truncate">{event.client_name || "-"}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3" />
                            <span>
                              {event.event_date 
                                ? new Date(event.event_date).toLocaleDateString(isEs ? "es-ES" : "en-US")
                                : "TBD"}
                            </span>
                            {event.daysUntil !== null && event.daysUntil >= 0 && (
                              <Badge variant="outline" className="text-xs ml-auto px-1.5 py-0">
                                {event.daysUntil === 0 
                                  ? (isEs ? "Hoy" : "Today")
                                  : `${event.daysUntil}d`}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-current/10">
                          <span className={`text-xs font-medium ${statusStyle.text}`}>
                            {getStatusLabel(event.status)}
                          </span>
                          <div className="flex items-center gap-1">
                            {event.has_blueprint && <CheckCircle className="w-3 h-3 text-emerald-500" />}
                            {event.has_run_of_show && <Clock className="w-3 h-3 text-emerald-500" />}
                            {event.has_team && <Users className="w-3 h-3 text-emerald-500" />}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">
                    {isEs 
                      ? "No hay eventos activos en esta ventana"
                      : "No active events in this time window"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* -------------------- 2) ATTENTION REQUIRED -------------------- */}
          <Card data-testid="attention-required-section">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <CardTitle className="text-lg">
                  {isEs ? "Requiere Atención" : "Attention Required"}
                </CardTitle>
                {systemData.attentionRequired.length > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 text-xs">
                    {systemData.attentionRequired.length}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {isEs 
                  ? "Decisiones o acciones pendientes"
                  : "Pending decisions or actions"}
              </p>
            </CardHeader>
            <CardContent>
              {systemData.attentionRequired.length > 0 ? (
                <div className="space-y-2 max-h-[320px] overflow-y-auto">
                  {systemData.attentionRequired.map((item) => (
                    <Link
                      key={item.id}
                      to={item.link}
                      className={`block p-3 rounded-lg border-l-4 ${getPriorityStyle(item.priority)} bg-muted/30 hover:bg-muted/50 transition-colors`}
                      data-testid={`attention-${item.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {item.type === "blocker" && <Lock className="w-4 h-4 text-rose-500" />}
                          {item.type === "dependency" && <GitBranch className="w-4 h-4 text-amber-500" />}
                          {item.type === "approval" && <FileCheck className="w-4 h-4 text-blue-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30 text-emerald-500" />
                  <p className="text-sm font-medium text-emerald-600">
                    {isEs ? "Todo en orden" : "All clear"}
                  </p>
                  <p className="text-xs">
                    {isEs ? "Sin items pendientes" : "No pending items"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* -------------------- 3) RECENT DECISIONS -------------------- */}
          <Card data-testid="recent-decisions-section">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">
                  {isEs ? "Decisiones Recientes" : "Recent Decisions"}
                </CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {isEs 
                  ? "Confirmadas en las últimas 48 horas"
                  : "Confirmed within the last 48 hours"}
              </p>
            </CardHeader>
            <CardContent>
              {systemData.recentDecisions.length > 0 ? (
                <div className="space-y-2 max-h-[320px] overflow-y-auto">
                  {systemData.recentDecisions.map((decision) => (
                    <Link
                      key={decision.id}
                      to={decision.link}
                      className="block p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      data-testid={`decision-${decision.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{decision.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{decision.description}</p>
                          {decision.timestamp && (
                            <p className="text-xs text-muted-foreground/70 mt-1">
                              {new Date(decision.timestamp).toLocaleString(isEs ? "es-ES" : "en-US", {
                                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">
                    {isEs 
                      ? "Sin decisiones recientes"
                      : "No recent decisions"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* -------------------- 4) SYSTEM ALERTS -------------------- */}
        {systemData.systemAlerts.length > 0 && (
          <Card className="border-dashed" data-testid="system-alerts-section">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-violet-600" />
                <CardTitle className="text-lg">
                  {isEs ? "Alertas del Sistema" : "System Alerts"}
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  {isEs ? "Impacto cruzado" : "Cross-module"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {isEs 
                  ? "Cambios en un módulo que afectan otros"
                  : "Changes in one module affecting others"}
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {systemData.systemAlerts.map((alert) => (
                  <Link
                    key={alert.id}
                    to={alert.link}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors"
                    data-testid={`alert-${alert.id}`}
                  >
                    {alert.type === "culinary" && <ChefHat className="w-4 h-4 text-violet-600" />}
                    {alert.type === "venue" && <MapPin className="w-4 h-4 text-violet-600" />}
                    {alert.type === "client" && <Building2 className="w-4 h-4 text-violet-600" />}
                    <div>
                      <p className="text-sm font-medium text-violet-900">{alert.title}</p>
                      <p className="text-xs text-violet-600">{alert.description}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-violet-400" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================== QUICK ACTIONS ==================== */}
        <div className="pt-6 border-t">
          <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">
            {isEs ? "Acciones Rápidas" : "Quick Actions"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link 
              to="/client-engagement/proposals" 
              className="group flex flex-col items-center gap-2 p-4 rounded-lg border border-dashed border-muted-foreground/20 hover:border-primary/50 hover:bg-primary/5 transition-all"
              data-testid="quick-action-new-event"
            >
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Calendar className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-center">
                {isEs ? "Nueva Oportunidad" : "New Event Opportunity"}
              </span>
            </Link>
            <Link 
              to="/client-engagement/crm/outreach" 
              className="group flex flex-col items-center gap-2 p-4 rounded-lg border border-dashed border-muted-foreground/20 hover:border-primary/50 hover:bg-primary/5 transition-all"
              data-testid="quick-action-new-lead"
            >
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-center">
                {isEs ? "Nuevo Lead" : "New Lead"}
              </span>
            </Link>
            <Link 
              to="/client-engagement/crm/follow-ups" 
              className="group flex flex-col items-center gap-2 p-4 rounded-lg border border-dashed border-muted-foreground/20 hover:border-primary/50 hover:bg-primary/5 transition-all"
              data-testid="quick-action-follow-ups"
            >
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <span className="text-sm font-medium text-center">
                {isEs ? "Seguimientos" : "Follow-ups Due"}
              </span>
            </Link>
            <Link 
              to="/client-engagement/crm/comms" 
              className="group flex flex-col items-center gap-2 p-4 rounded-lg border border-dashed border-muted-foreground/20 hover:border-primary/50 hover:bg-primary/5 transition-all"
              data-testid="quick-action-comms"
            >
              <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Bell className="w-5 h-5 text-violet-600" />
              </div>
              <span className="text-sm font-medium text-center">
                {isEs ? "Comunicación" : "Communication"}
              </span>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
