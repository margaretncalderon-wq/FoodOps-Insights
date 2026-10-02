import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API } from "../utils/api";
import { parseDateOnly, formatDateOnly } from "../utils/dates";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { useModules } from "../contexts/ModulesContext";
import { useTerminology } from "../hooks/useTerminology";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { 
  Activity, Calendar, Clock, AlertCircle, CheckCircle, ArrowRight,
  FileCheck, Users, Zap, Bell, RefreshCw, ChefHat, MapPin, Building2,
  GitBranch, Lock, Unlock, Target, FolderKanban, BarChart3, TrendingUp, UserCircle,
  ArrowUpRight, ArrowDownLeft, Phone, Mail, User as UserIcon
} from "lucide-react";
import CostHealthDashboard from "../components/CostHealthDashboard";
import LostReasonsWidget from "../components/LostReasonsWidget";
import { useNavigate } from "react-router-dom";
import { usePendingApprovals } from "../hooks/usePendingApprovals";

// ==================== SYSTEM PULSE ====================
export default function SystemPulse() {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const { industry, isProfessionalServices, isEventsIndustry, getProgramOrchestrationConfig, isModuleEnabled } = useModules();
  const { term } = useTerminology();
  const isEs = language === "es";
  
  // Get dynamic terminology from industry config
  const poConfig = getProgramOrchestrationConfig();
  const entityPlural = isEs ? poConfig.entity_plural_es : poConfig.entity_plural_en;
  const entitySingular = isEs ? poConfig.entity_singular_es : poConfig.entity_singular_en;
  
  // Dynamic client/lead terminology
  const clientLabel = term("events", "client");
  const clientsLabel = term("events", "clients");
  const leadLabel = term("events", "lead");
  const leadsLabel = term("events", "leads");
  
  // Check if Event Orchestration module is enabled
  const hasOrchestrationModule = isModuleEnabled("module_event_orchestration");
  
  const [loading, setLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState("all");
  const [systemData, setSystemData] = useState({
    activeEvents: [],
    attentionRequired: [],
    recentDecisions: [],
    systemAlerts: []
  });
  const [executionPending, setExecutionPending] = useState(null);
  const [executionSignals, setExecutionSignals] = useState(null);
  const [salesPerformance, setSalesPerformance] = useState(null);
  const { require_approval: approvalRequired, count_pending: pendingApprovalCount, pending: pendingApprovals } = usePendingApprovals({ pollMs: 60000 });

  const fetchSystemData = useCallback(async () => {
    setLoading(true);
    try {
      // Calculate date range for last 7 days
      const today = new Date();
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const dateFrom = weekAgo.toISOString().split('T')[0];
      const dateTo = today.toISOString().split('T')[0];
      
      const [eventsRes, statsRes, pendingRes, signalsRes, salesRes] = await Promise.all([
        axios.get(`${API}/orchestration/events`, { withCredentials: true }),
        axios.get(`${API}/dashboard/stats`, { withCredentials: true }),
        axios.get(`${API}/execution-hub/my-pending`, { withCredentials: true }).catch(() => ({ data: null })),
        axios.get(`${API}/execution-hub/signals`, { withCredentials: true }).catch(() => ({ data: null })),
        axios.get(`${API}/crm/reports/owners?date_from=${dateFrom}&date_to=${dateTo}&include_unassigned=true`, { withCredentials: true }).catch(() => ({ data: null }))
      ]);

      const events = eventsRes.data || [];
      const stats = statsRes.data || {};
      setExecutionPending(pendingRes.data);
      setExecutionSignals(signalsRes.data);
      setSalesPerformance(salesRes.data);
      
      // Process Active Events (from Event Orchestration)
      const now = new Date();
      const activeEvents = events.map(event => {
        const eventDate = event.event_date ? parseDateOnly(event.event_date) : null;
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
        const eventDate = e.event_date ? parseDateOnly(e.event_date) : null;
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
          title: isEs ? `${entitySingular} confirmado` : `${entitySingular} confirmed`,
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
            ? `${stats.low_stock_alerts} items pueden afectar próximos ${entityPlural.toLowerCase()}`
            : `${stats.low_stock_alerts} items may impact upcoming ${entityPlural.toLowerCase()}`,
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
  }, [isEs, entitySingular, entityPlural]);

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

        {/* ==================== PENDING APPROVALS WIDGET ==================== */}
        {approvalRequired && pendingApprovalCount > 0 && (
          <Card className="border-amber-500/30 bg-amber-500/5" data-testid="pending-approvals-widget">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-amber-600" />
                  <CardTitle className="text-lg">
                    {isEs ? "Requieren tu aprobación" : "Awaiting your approval"}
                  </CardTitle>
                  <Badge className="bg-amber-500/20 text-amber-700 text-xs" data-testid="pending-approvals-count">
                    {pendingApprovalCount}
                  </Badge>
                </div>
                <Link
                  to="/client-engagement/proposals?approval=pending"
                  className="text-sm text-muted-foreground hover:text-amber-600 flex items-center gap-1"
                  data-testid="pending-approvals-view-all"
                >
                  {isEs ? "Ver todas" : "View all"}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(pendingApprovals || []).slice(0, 5).map((p) => (
                  <Link
                    key={p.proposal_id}
                    to={`/events/${p.event_id}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-colors"
                    data-testid={`pending-approval-item-${p.proposal_id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-amber-900 truncate">{p.event_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {p.client_name || (isEs ? "Sin cliente" : "No client")}
                        {p.revoked_reason && (
                          <span className="ml-2 text-rose-600">· {isEs ? "revocada" : "revoked"}: {p.revoked_reason}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-3 shrink-0">
                      {p.total > 0 && (
                        <span className="text-xs font-medium text-emerald-700">
                          ${Number(p.total).toLocaleString()}
                        </span>
                      )}
                      <Badge variant="outline" className="text-xs border-amber-500/50">
                        <Calendar className="w-3 h-3 mr-1" />
                        {p.event_date ? formatDateOnly(p.event_date, language) : (isEs ? "Sin fecha" : "TBD")}
                      </Badge>
                      {p.data_incomplete && (
                        <Badge className="bg-rose-100 text-rose-700 text-[10px]">
                          {isEs ? "Data incompleta" : "Incomplete"}
                        </Badge>
                      )}
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
                {pendingApprovalCount > 5 && (
                  <Link
                    to="/client-engagement/proposals?approval=pending"
                    className="block text-center text-xs text-amber-700 hover:text-amber-900 pt-2"
                  >
                    +{pendingApprovalCount - 5} {isEs ? "más pendientes" : "more pending"} →
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================== LOST REASONS WIDGET (why we lose deals) =========== */}
        <LostReasonsWidget />

        {/* ==================== EXECUTION SIGNALS (Critical Alerts) ==================== */}
        {executionSignals && (executionSignals.summary?.blocked > 0 || executionSignals.summary?.at_risk > 0) && (          <Card className="border-yellow-500/30 bg-yellow-500/5" data-testid="execution-signals-section">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                  <CardTitle className="text-lg">
                    {t("executionSignals")}
                  </CardTitle>
                  <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">
                    {(executionSignals.summary?.blocked || 0) + (executionSignals.summary?.at_risk || 0)}
                  </Badge>
                </div>
                <Link 
                  to="/execution-hub" 
                  className="text-sm text-muted-foreground hover:text-yellow-500 flex items-center gap-1"
                >
                  {t("viewAllGoals")}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {executionSignals.signals?.filter(s => s.severity !== 'success').slice(0, 5).map((signal, idx) => (
                  <Link
                    key={idx}
                    to={`/execution-hub/${signal.goal_id}`}
                    className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                      signal.severity === 'critical' 
                        ? 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/30' 
                        : 'bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {signal.severity === 'critical' ? (
                        <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                          <AlertCircle className="w-4 h-4 text-red-400" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
                          <Clock className="w-4 h-4 text-yellow-400" />
                        </div>
                      )}
                      <div>
                        <p className={`font-medium text-sm ${
                          signal.severity === 'critical' ? 'text-red-400' : 'text-yellow-400'
                        }`}>
                          {signal.title}
                        </p>
                        <p className="text-xs text-muted-foreground">{signal.message}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {signal.target_date && (
                        <Badge variant="outline" className="text-xs border-yellow-500/50">
                          <Calendar className="w-3 h-3 mr-1" />
                          {formatDateOnly(signal.target_date, language)}
                        </Badge>
                      )}
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
              
              {/* Quick Summary */}
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
                {executionSignals.summary?.blocked > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    <span className="text-muted-foreground">
                      {executionSignals.summary.blocked} {t("blocked")}
                    </span>
                  </div>
                )}
                {executionSignals.summary?.at_risk > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                    <span className="text-muted-foreground">
                      {executionSignals.summary.at_risk} {t("atRisk")}
                    </span>
                  </div>
                )}
                {executionSignals.summary?.completed_this_week > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-muted-foreground">
                      {executionSignals.summary.completed_this_week} {t("completedThisWeek")}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================== COST HEALTH (auto-hides when nothing stale) ==================== */}
        <CostHealthDashboard
          mode="card"
          onNavigate={() => navigate(isModuleEnabled("module_culinary_intelligence") ? "/food-ops/recipes#cost-health" : "/crm/proposals")}
        />

        {/* ==================== PERMANENT CORE ==================== */}
        <div className="grid lg:grid-cols-2 gap-6">
          
          {/* -------------------- 1) ACTIVE EVENTS/PROJECTS -------------------- */}
          {hasOrchestrationModule && (
          <Card className="lg:col-span-2" data-testid="active-events-section">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isProfessionalServices ? (
                    <FolderKanban className="w-5 h-5 text-primary" />
                  ) : (
                    <Calendar className="w-5 h-5 text-primary" />
                  )}
                  <CardTitle className="text-lg">
                    {isEs ? `${entityPlural} Activos` : `Active ${entityPlural}`}
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {filteredActiveEvents.length}
                  </Badge>
                </div>
                <Link 
                  to="/event-orchestration" 
                  className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                >
                  {t("viewAll")}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {isEs 
                  ? `${entityPlural} confirmados en ejecución o próximos` 
                  : `Confirmed ${entityPlural.toLowerCase()} in execution or approaching`
                }
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
                                ? formatDateOnly(event.event_date, isEs ? "es" : "en")
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
                  {isProfessionalServices ? (
                    <FolderKanban className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  ) : (
                    <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  )}
                  <p className="text-sm">
                    {isEs 
                      ? `No hay ${entityPlural.toLowerCase()} activos en esta ventana`
                      : `No active ${entityPlural.toLowerCase()} in this time window`
                    }
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          )}

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

          {/* -------------------- EXECUTION HUB - MY PENDING -------------------- */}
          {executionPending && (executionPending.active_goals > 0 || executionPending.pending_tasks > 0 || executionPending.follow_ups_due > 0) && (
            <Card data-testid="execution-pending-section">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-[#AED768]" />
                    <CardTitle className="text-lg">
                      {t("myPending")}
                    </CardTitle>
                    {(executionPending.active_goals + executionPending.pending_tasks + executionPending.follow_ups_due) > 0 && (
                      <Badge className="bg-[#AED768]/20 text-[#AED768] text-xs">
                        {executionPending.active_goals + executionPending.pending_tasks + executionPending.follow_ups_due}
                      </Badge>
                    )}
                  </div>
                  <Link 
                    to="/execution-hub" 
                    className="text-sm text-muted-foreground hover:text-[#AED768] flex items-center gap-1"
                  >
                    {t("viewAll")}
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isEs 
                    ? "Metas y tareas asignadas"
                    : "Assigned goals and tasks"}
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center p-2 bg-blue-500/10 rounded-lg">
                    <p className="text-xl font-bold text-blue-400">{executionPending.active_goals}</p>
                    <p className="text-xs text-muted-foreground">{t("activeGoals")}</p>
                  </div>
                  <div className="text-center p-2 bg-yellow-500/10 rounded-lg">
                    <p className="text-xl font-bold text-yellow-400">{executionPending.pending_tasks}</p>
                    <p className="text-xs text-muted-foreground">{t("tasks")}</p>
                  </div>
                  <div className="text-center p-2 bg-red-500/10 rounded-lg">
                    <p className="text-xl font-bold text-red-400">{executionPending.blocked_goals}</p>
                    <p className="text-xs text-muted-foreground">{t("blockedGoals")}</p>
                  </div>
                </div>
                
                {executionPending.goals?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      {t("myGoals")}
                    </p>
                    {executionPending.goals.slice(0, 3).map((goal) => (
                      <Link
                        key={goal.goal_id}
                        to={`/execution-hub/${goal.goal_id}`}
                        className="block p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${
                                goal.status === "blocked" 
                                  ? "border-red-500/50 text-red-400" 
                                  : goal.status === "in_progress"
                                  ? "border-yellow-500/50 text-yellow-400"
                                  : "border-blue-500/50 text-blue-400"
                              }`}
                            >
                              {goal.status === "blocked" 
                                ? t("blocked")
                                : goal.status === "in_progress"
                                ? t("inProgress")
                                : t("planning")}
                            </Badge>
                            <span className="text-sm font-medium truncate max-w-[150px]">{goal.title}</span>
                          </div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
                
                {executionPending.tasks?.length > 0 && (
                  <div className="space-y-2 mt-3 pt-3 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      {t("assignedTasks")}
                    </p>
                    {executionPending.tasks.slice(0, 3).map((task) => (
                      <Link
                        key={task.task_id}
                        to={`/execution-hub/${task.goal_id}`}
                        className="block p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${
                              task.status === "in_progress" ? "bg-yellow-500" : "bg-gray-500"
                            }`}></div>
                            <span className="text-sm truncate max-w-[180px]">{task.title}</span>
                          </div>
                          {task.due_date && (
                            <span className="text-xs text-muted-foreground">
                              {formatDateOnly(task.due_date, language)}
                            </span>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
                
                {/* Follow-ups Section */}
                {executionPending.follow_ups?.length > 0 && (
                  <div className="space-y-2 mt-3 pt-3 border-t border-border">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        {isEs ? "Seguimientos Pendientes" : "Pending Follow-ups"}
                      </p>
                      {executionPending.follow_ups_due > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {executionPending.follow_ups_due}
                        </Badge>
                      )}
                    </div>
                    {executionPending.follow_ups.slice(0, 4).map((fu) => (
                      <Link
                        key={`${fu.entity_type}-${fu.entity_id}`}
                        to={fu.link}
                        className={`block p-2 rounded-lg transition-colors ${
                          fu.is_overdue 
                            ? "bg-red-500/10 hover:bg-red-500/20" 
                            : "bg-muted/30 hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {fu.follow_up_type === "Call" && <Phone className="w-3 h-3 text-blue-500" />}
                            {fu.follow_up_type === "Email" && <Mail className="w-3 h-3 text-green-500" />}
                            {fu.follow_up_type === "Meeting" && <UserIcon className="w-3 h-3 text-purple-500" />}
                            {!["Call", "Email", "Meeting"].includes(fu.follow_up_type) && <Clock className="w-3 h-3 text-orange-500" />}
                            <span className={`text-sm truncate max-w-[150px] ${fu.is_overdue ? "text-red-400" : ""}`}>
                              {fu.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${
                                fu.is_overdue 
                                  ? "border-red-500/50 text-red-400" 
                                  : "border-orange-500/50 text-orange-400"
                              }`}
                            >
                              {fu.is_overdue 
                                ? (isEs ? "Vencido" : "Overdue")
                                : (isEs ? "Hoy" : "Today")}
                            </Badge>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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

        {/* -------------------- 5) SALES PERFORMANCE PULSE -------------------- */}
        {salesPerformance && salesPerformance.owners && salesPerformance.owners.length > 0 && (
          <Card data-testid="sales-performance-pulse-section">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-emerald-600" />
                  <CardTitle className="text-lg">
                    {isEs ? "Sales Performance Pulse" : "Sales Performance Pulse"}
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {isEs ? "Últimos 7 días" : "Last 7 days"}
                  </Badge>
                </div>
                <Link 
                  to="/client-engagement/crm/sales-report" 
                  className="text-sm text-muted-foreground hover:text-emerald-600 flex items-center gap-1"
                >
                  {isEs ? "Ver reporte completo" : "View full report"}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {isEs 
                  ? "Snapshot de actividad y conversiones por vendedor"
                  : "Quick snapshot of activity and conversions by salesperson"}
              </p>
            </CardHeader>
            <CardContent>
              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="text-center p-2 bg-blue-50 rounded-lg">
                  <p className="text-xl font-bold text-blue-600">{salesPerformance.totals?.total_leads || 0}</p>
                  <p className="text-xs text-muted-foreground">{leadsLabel}</p>
                </div>
                <div className="text-center p-2 bg-amber-50 rounded-lg">
                  <p className="text-xl font-bold text-amber-600">{salesPerformance.totals?.trabajados || 0}</p>
                  <p className="text-xs text-muted-foreground">{isEs ? "Trabajados" : "Worked"}</p>
                </div>
                <div className="text-center p-2 bg-purple-50 rounded-lg">
                  <p className="text-xl font-bold text-purple-600">{salesPerformance.totals?.interesados || 0}</p>
                  <p className="text-xs text-muted-foreground">{isEs ? "Interesados" : "Interested"}</p>
                </div>
                <div className="text-center p-2 bg-green-50 rounded-lg">
                  <p className="text-xl font-bold text-green-600">{salesPerformance.totals?.convertidos || 0}</p>
                  <p className="text-xs text-muted-foreground">{isEs ? "Convertidos" : "Converted"}</p>
                </div>
              </div>
              
              {/* Owner List - Sorted by conversions */}
              <div className="space-y-2 max-h-[240px] overflow-y-auto">
                {salesPerformance.owners.slice(0, 8).map((owner, idx) => (
                  <Link
                    key={owner.owner_id || `unassigned-${idx}`}
                    to={`/client-engagement/crm/sales-report`}
                    className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                      !owner.owner_id 
                        ? 'bg-yellow-50/50 hover:bg-yellow-50 border border-yellow-200' 
                        : 'bg-muted/30 hover:bg-muted/50'
                    }`}
                    data-testid={`sales-pulse-${owner.owner_id || 'unassigned'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        owner.convertidos > 0 ? 'bg-green-100' : 'bg-gray-100'
                      }`}>
                        <UserCircle className={`w-4 h-4 ${owner.convertidos > 0 ? 'text-green-600' : 'text-gray-500'}`} />
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {owner.owner_name || (isEs ? "Sin Asignar" : "Unassigned")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {owner.nuevos} {isEs ? "nuevos" : "new"} · {owner.trabajados} {isEs ? "trabajados" : "worked"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          <span className="text-purple-600">{owner.interesados}</span>
                          <span className="text-muted-foreground mx-1">/</span>
                          <span className="text-green-600">{owner.convertidos}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isEs ? "Int/Conv" : "Int/Conv"}
                        </p>
                      </div>
                      <div className="text-right min-w-[50px]">
                        <p className={`text-sm font-bold ${
                          owner.tasa_conversion >= 10 ? 'text-green-600' : 
                          owner.tasa_conversion > 0 ? 'text-amber-600' : 'text-muted-foreground'
                        }`}>
                          {owner.tasa_conversion}%
                        </p>
                        <p className="text-xs text-muted-foreground">{isEs ? "Conv" : "Conv"}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              
              {/* Global Conversion Rate Footer */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="w-4 h-4" />
                  <span>{isEs ? "Tasa de conversión global" : "Global conversion rate"}</span>
                </div>
                <Badge className={`${
                  (salesPerformance.totals?.tasa_conversion || 0) >= 10 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {salesPerformance.totals?.tasa_conversion || 0}%
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================== QUICK ACTIONS ==================== */}
        <div className="pt-6 border-t">
          <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">
            {isEs ? "Acciones Rápidas" : "Quick Actions"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Link 
              to="/client-engagement/proposals" 
              className="group flex flex-col items-center gap-2 p-4 rounded-lg border border-dashed border-muted-foreground/20 hover:border-primary/50 hover:bg-primary/5 transition-all"
              data-testid="quick-action-new-event"
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform ${isProfessionalServices ? 'bg-indigo-100' : 'bg-emerald-100'}`}>
                {isProfessionalServices ? (
                  <FolderKanban className="w-5 h-5 text-indigo-600" />
                ) : (
                  <Calendar className="w-5 h-5 text-emerald-600" />
                )}
              </div>
              <span className="text-sm font-medium text-center">
                {isEs ? `Nuevo ${entitySingular}` : `New ${entitySingular}`}
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
                {isEs ? "Seguimientos" : "Follow-ups"}
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
            <Link 
              to="/collaborations" 
              className="group flex flex-col items-center gap-2 p-4 rounded-lg border border-dashed border-muted-foreground/20 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all"
              data-testid="quick-action-collaborations"
            >
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                <ArrowUpRight className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-sm font-medium text-center">
                {isEs ? "Colaboraciones" : "Collaborations"}
              </span>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
