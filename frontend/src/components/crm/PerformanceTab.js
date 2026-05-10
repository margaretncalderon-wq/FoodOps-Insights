import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, Phone, Mail, MessageCircle,
  Users, UserPlus, CheckCircle2, FileText, Activity, AlertTriangle,
  Trophy, Target, DollarSign, Wallet, Sparkles, ChevronLeft, ChevronRight,
} from "lucide-react";
import { API_BASE as API } from "../../utils/api";

const RANK_BADGES = ["#1", "#2", "#3"];
const RANK_RING = ["ring-yellow-400", "ring-slate-400", "ring-amber-700"];

function formatMoney(n) {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

function DeltaPill({ value }) {
  if (value == null) {
    return <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5"><Minus className="w-3 h-3" />—</span>;
  }
  const positive = value > 0;
  const negative = value < 0;
  const Icon = positive ? TrendingUp : negative ? TrendingDown : Minus;
  const color = positive ? "text-green-600 bg-green-50" : negative ? "text-red-600 bg-red-50" : "text-muted-foreground bg-muted";
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${color}`}>
      <Icon className="w-2.5 h-2.5" />
      {positive && "+"}{value}%
    </span>
  );
}

function Sparkline({ values, color = "#0ea5e9", width = 100, height = 28 }) {
  if (!values || values.length === 0) return null;
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - (v / max) * height;
    return `${x},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} strokeLinejoin="round" strokeLinecap="round" />
      <polyline
        fill={color}
        fillOpacity="0.12"
        points={`0,${height} ${points} ${width},${height}`}
      />
      {values.length > 0 && (
        <circle
          cx={(values.length - 1) * stepX}
          cy={height - (values[values.length - 1] / max) * height}
          r="2.5"
          fill={color}
        />
      )}
    </svg>
  );
}

const KPI_DEFS = [
  { key: "calls", labelEs: "Llamadas", labelEn: "Calls", icon: Phone, color: "text-blue-500" },
  { key: "emails", labelEs: "Emails", labelEn: "Emails", icon: Mail, color: "text-purple-500" },
  { key: "whatsapp", labelEs: "WhatsApp", labelEn: "WhatsApp", icon: MessageCircle, color: "text-green-500" },
  { key: "meetings", labelEs: "Reuniones", labelEn: "Meetings", icon: Users, color: "text-orange-500" },
  { key: "new_leads", labelEs: "Leads Nuevos", labelEn: "New Leads", icon: UserPlus, color: "text-amber-500" },
  { key: "conversions", labelEs: "Conversiones", labelEn: "Conversions", icon: CheckCircle2, color: "text-emerald-500" },
  { key: "follow_ups_completed", labelEs: "Follow-ups", labelEn: "Follow-ups", icon: Activity, color: "text-cyan-500" },
  { key: "proposals_sent", labelEs: "Propuestas", labelEn: "Proposals", icon: FileText, color: "text-rose-500" },
];

export default function PerformanceTab() {
  const { language } = useLanguage();
  const isEs = language === "es";

  const [granularity, setGranularity] = useState("week"); // day|week|month
  const [periodOffset, setPeriodOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [cleanupRunning, setCleanupRunning] = useState(false);

  const fetchPerformance = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        granularity,
        period_offset: periodOffset.toString(),
        timeseries_buckets: "12",
      });
      const res = await axios.get(`${API}/api/crm/reports/performance?${params}`, { withCredentials: true });
      setData(res.data);
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error al cargar el reporte" : "Error loading report");
    } finally {
      setLoading(false);
    }
  }, [granularity, periodOffset, isEs]);

  useEffect(() => { fetchPerformance(); }, [fetchPerformance]);

  const handleCleanup = async () => {
    setCleanupRunning(true);
    try {
      const res = await axios.post(`${API}/api/crm/admin/cleanup-comm-logs`, null, { withCredentials: true });
      const r = res.data;
      toast.success(
        isEs
          ? `Limpieza OK · ${r.fixed_owner_id} owners + ${r.fixed_comm_type} tipos asignados`
          : `Cleanup OK · ${r.fixed_owner_id} owners + ${r.fixed_comm_type} types assigned`
      );
      fetchPerformance();
    } catch (err) {
      toast.error(isEs ? "Error al limpiar" : "Cleanup error");
    } finally {
      setCleanupRunning(false);
    }
  };

  const periodLabel = useMemo(() => {
    if (!data) return "";
    const cur = data.current_period;
    if (granularity === "day") {
      return new Date(cur.start).toLocaleDateString(isEs ? "es-ES" : "en-US", { weekday: "long", month: "short", day: "numeric" });
    }
    if (granularity === "week") {
      const s = new Date(cur.start);
      const e = new Date(cur.end);
      return `${s.toLocaleDateString(isEs ? "es-ES" : "en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString(isEs ? "es-ES" : "en-US", { month: "short", day: "numeric" })}`;
    }
    return new Date(cur.start).toLocaleDateString(isEs ? "es-ES" : "en-US", { month: "long", year: "numeric" });
  }, [data, granularity, isEs]);

  const offsetButtons = [
    { offset: 0, labelEs: granularity === "day" ? "Hoy" : granularity === "week" ? "Esta sem." : "Este mes", labelEn: granularity === "day" ? "Today" : granularity === "week" ? "This week" : "This month" },
    { offset: -1, labelEs: granularity === "day" ? "Ayer" : granularity === "week" ? "Sem. pasada" : "Mes pasado", labelEn: granularity === "day" ? "Yesterday" : granularity === "week" ? "Last week" : "Last month" },
  ];

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { kpis, leaderboard, alerts, timeseries } = data;
  const maxScore = Math.max(...leaderboard.map(e => e.score), 1);

  return (
    <div className="space-y-4" data-testid="performance-tab">
      {/* HEADER · granularity + offset selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            {data.is_sales_only
              ? (isEs ? "Mi Performance" : "My Performance")
              : (isEs ? "Performance del Equipo" : "Team Performance")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {periodLabel} {periodOffset === 0 && <span className="text-[#AED768]">· en vivo</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Tabs value={granularity} onValueChange={(v) => { setGranularity(v); setPeriodOffset(0); }}>
            <TabsList data-testid="granularity-tabs">
              <TabsTrigger value="day" data-testid="granularity-day">{isEs ? "Día" : "Day"}</TabsTrigger>
              <TabsTrigger value="week" data-testid="granularity-week">{isEs ? "Semana" : "Week"}</TabsTrigger>
              <TabsTrigger value="month" data-testid="granularity-month">{isEs ? "Mes" : "Month"}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-1 border rounded-md">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPeriodOffset(periodOffset - 1)} data-testid="period-prev">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => setPeriodOffset(0)}
              disabled={periodOffset === 0}
              data-testid="period-now"
            >
              {isEs ? "Hoy" : "Now"}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPeriodOffset(Math.min(periodOffset + 1, 0))} disabled={periodOffset >= 0} data-testid="period-next">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={fetchPerformance} data-testid="refresh-performance">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleCleanup} disabled={cleanupRunning} data-testid="cleanup-comm-logs" title={isEs ? "Limpiar logs sin owner/tipo" : "Clean logs without owner/type"}>
            <Sparkles className={`w-4 h-4 ${cleanupRunning ? "animate-pulse" : ""}`} />
          </Button>
        </div>
      </div>

      {/* ALERTS BANNER */}
      {alerts && alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3" data-testid="alerts-banner">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-semibold text-amber-900">
                  {isEs ? `${alerts.length} alerta${alerts.length === 1 ? "" : "s"} de desempeño` : `${alerts.length} performance alert${alerts.length === 1 ? "" : "s"}`}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={async () => {
                    try {
                      const res = await axios.post(`${API}/api/crm/reports/notify-admin-alerts?granularity=${granularity}`, null, { withCredentials: true });
                      toast.success(
                        isEs
                          ? `${res.data.notifications_sent} notificación${res.data.notifications_sent === 1 ? "" : "es"} enviada${res.data.notifications_sent === 1 ? "" : "s"} a admins`
                          : `${res.data.notifications_sent} notification${res.data.notifications_sent === 1 ? "" : "s"} sent to admins`
                      );
                    } catch (err) {
                      toast.error(isEs ? "Error al notificar" : "Notify error");
                    }
                  }}
                  data-testid="notify-admins-btn"
                >
                  {isEs ? "Notificar a admins" : "Notify admins"}
                </Button>
              </div>
              <ul className="mt-1 space-y-0.5">
                {alerts.slice(0, 5).map((a, i) => (
                  <li key={i} className="text-xs text-amber-800 flex items-center gap-1">
                    {a.type === "inactivity" ? "💤" : "⚠️"} {a.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* KPI GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {KPI_DEFS.map(({ key, labelEs, labelEn, icon: Icon, color }) => {
          const k = kpis[key] || {};
          return (
            <Card key={key} data-testid={`kpi-${key}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <DeltaPill value={k.delta_pct} />
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{isEs ? labelEs : labelEn}</p>
                <p className="text-2xl font-bold tabular-nums">{k.current ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">
                  {isEs ? "vs" : "vs"} {k.previous ?? 0}
                </p>
              </CardContent>
            </Card>
          );
        })}
        {/* Money KPIs */}
        <Card className="bg-blue-50 border-blue-200" data-testid="kpi-pipeline">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <Wallet className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-[11px] text-blue-700">{isEs ? "Pipeline $" : "Pipeline $"}</p>
            <p className="text-2xl font-bold text-blue-700 tabular-nums">{formatMoney(kpis.pipeline_value?.current)}</p>
            <p className="text-[10px] text-blue-600/70">{isEs ? "valor activo" : "active value"}</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200" data-testid="kpi-revenue">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <DollarSign className="w-4 h-4 text-green-600" />
              <DeltaPill value={kpis.revenue_closed?.delta_pct} />
            </div>
            <p className="text-[11px] text-green-700">{isEs ? "Revenue cerrado" : "Closed revenue"}</p>
            <p className="text-2xl font-bold text-green-700 tabular-nums">{formatMoney(kpis.revenue_closed?.current)}</p>
            <p className="text-[10px] text-green-600/70">{isEs ? "vs" : "vs"} {formatMoney(kpis.revenue_closed?.previous)}</p>
          </CardContent>
        </Card>
      </div>

      {/* LEADERBOARD + TIMESERIES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Leaderboard */}
        <div className="lg:col-span-2 space-y-3" data-testid="leaderboard">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              {isEs ? "Ranking del equipo" : "Team Leaderboard"}
            </h4>
            <span className="text-xs text-muted-foreground">{leaderboard.length} {isEs ? "vendedores" : "salespeople"}</span>
          </div>
          {leaderboard.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">
              <Trophy className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>{isEs ? "Sin actividad en este período" : "No activity in this period"}</p>
            </CardContent></Card>
          ) : leaderboard.map((entry) => (
            <Card key={entry.owner_id || `unassigned-${entry.rank}`} className={`${entry.rank <= 3 ? "border-l-4" : ""}`} style={entry.rank === 1 ? { borderLeftColor: "#fbbf24" } : entry.rank === 2 ? { borderLeftColor: "#94a3b8" } : entry.rank === 3 ? { borderLeftColor: "#b45309" } : {}} data-testid={`leaderboard-rank-${entry.rank}`}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  {/* Rank Avatar */}
                  <div className={`relative w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold flex-shrink-0 ${entry.rank <= 3 ? `ring-2 ring-offset-1 ${RANK_RING[entry.rank - 1]}` : ""}`}>
                    {entry.rank <= 3 ? (
                      <span className="text-base">{entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉"}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{entry.rank}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold truncate">{entry.owner_name}</span>
                        {entry.alert === "inactivity" && (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">
                            💤 {isEs ? "Inactivo" : "Inactive"}
                          </Badge>
                        )}
                        {entry.alert === "below_goal" && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                            ⚠️ {isEs ? "Bajo meta" : "Below goal"}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Sparkline values={entry.sparkline} color={entry.rank === 1 ? "#fbbf24" : "#0ea5e9"} width={70} height={22} />
                        <DeltaPill value={entry.delta_pct} />
                      </div>
                    </div>

                    {/* Score bar */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#AED768] to-[#9BC75A]" style={{ width: `${(entry.score / maxScore) * 100}%` }} />
                      </div>
                      <span className="text-xs font-bold tabular-nums w-12 text-right">{entry.score}</span>
                      {entry.goal_pct != null && (
                        <Badge variant="outline" className={`text-[10px] ${entry.goal_pct >= 100 ? "bg-green-50 text-green-700 border-green-200" : entry.goal_pct >= 60 ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                          <Target className="w-2.5 h-2.5 mr-0.5" />
                          {entry.goal_pct}%
                        </Badge>
                      )}
                    </div>

                    {/* Activity grid */}
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 text-[10px]">
                      {KPI_DEFS.map(({ key, icon: Icon, color }) => (
                        <div key={key} className="flex items-center gap-1 bg-muted/30 rounded px-1.5 py-1" title={isEs ? KPI_DEFS.find(d => d.key === key)?.labelEs : KPI_DEFS.find(d => d.key === key)?.labelEn}>
                          <Icon className={`w-3 h-3 ${color}`} />
                          <span className="font-semibold tabular-nums">{entry.metrics[key] || 0}</span>
                        </div>
                      ))}
                    </div>

                    {/* Money row */}
                    {(entry.pipeline_value > 0 || entry.revenue_closed > 0) && (
                      <div className="mt-2 flex items-center gap-3 text-xs">
                        {entry.pipeline_value > 0 && (
                          <span className="inline-flex items-center gap-1 text-blue-600">
                            <Wallet className="w-3 h-3" />
                            <span className="font-semibold">{formatMoney(entry.pipeline_value)}</span>
                            <span className="text-muted-foreground">{isEs ? "pipeline" : "pipeline"}</span>
                          </span>
                        )}
                        {entry.revenue_closed > 0 && (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <DollarSign className="w-3 h-3" />
                            <span className="font-semibold">{formatMoney(entry.revenue_closed)}</span>
                            <span className="text-muted-foreground">{isEs ? "cerrado" : "closed"}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Timeseries */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-500" />
            {isEs ? "Tendencia del equipo" : "Team Trend"}
          </h4>
          <Card>
            <CardContent className="p-3 space-y-2">
              {KPI_DEFS.slice(0, 5).map(({ key, labelEs, labelEn, icon: Icon, color }) => {
                const values = timeseries.map(b => b[key] || 0);
                const max = Math.max(...values, 1);
                const total = values.reduce((a, b) => a + b, 0);
                return (
                  <div key={key} className="border-b last:border-0 pb-2 last:pb-0" data-testid={`timeseries-${key}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <Icon className={`w-3 h-3 ${color}`} />
                        <span className="text-xs font-medium">{isEs ? labelEs : labelEn}</span>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">{total} {isEs ? "total" : "total"}</span>
                    </div>
                    <div className="flex items-end gap-0.5 h-8">
                      {values.map((v, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-sm transition-all"
                          style={{
                            height: `${Math.max(6, (v / max) * 100)}%`,
                            background: i === values.length - 1 ? "#AED768" : "#cbd5e1",
                          }}
                          title={`${timeseries[i]?.bucket}: ${v}`}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          {/* Mini summary */}
          <Card>
            <CardContent className="p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                {isEs ? "Resumen del período" : "Period summary"}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-blue-50 rounded p-2">
                  <p className="text-[10px] text-blue-600">{isEs ? "Pipeline" : "Pipeline"}</p>
                  <p className="font-bold text-blue-700">{formatMoney(kpis.pipeline_value?.current)}</p>
                </div>
                <div className="bg-green-50 rounded p-2">
                  <p className="text-[10px] text-green-600">{isEs ? "Cerrado" : "Closed"}</p>
                  <p className="font-bold text-green-700">{formatMoney(kpis.revenue_closed?.current)}</p>
                </div>
                <div className="bg-amber-50 rounded p-2">
                  <p className="text-[10px] text-amber-600">{isEs ? "Conversiones" : "Conversions"}</p>
                  <p className="font-bold text-amber-700">{kpis.conversions?.current || 0}</p>
                </div>
                <div className="bg-purple-50 rounded p-2">
                  <p className="text-[10px] text-purple-600">{isEs ? "Actividad total" : "Total activity"}</p>
                  <p className="font-bold text-purple-700">
                    {(kpis.calls?.current || 0) + (kpis.emails?.current || 0) + (kpis.whatsapp?.current || 0) + (kpis.meetings?.current || 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
