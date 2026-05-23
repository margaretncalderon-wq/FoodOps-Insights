import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { API_BASE as API } from "../utils/api";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Archive, TrendingDown, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { lostReasonLabel } from "./LostReasonDialog";

// Distinct, colorblind-friendly palette for reason segments.
const REASON_COLORS = {
  price: "#ef4444",        // red
  timing: "#f59e0b",       // amber
  competitor: "#a855f7",   // purple
  no_response: "#64748b",  // slate
  not_a_fit: "#06b6d4",    // cyan
  scope: "#3b82f6",        // blue
  other: "#9ca3af",        // gray
  unspecified: "#d1d5db",  // light gray
};

const formatCurrency = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

const formatDate = (iso, language) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(language === "es" ? "es-ES" : "en-US", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch (_e) {
    return "";
  }
};

export default function LostReasonsWidget() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [period, setPeriod] = useState("90d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/events/lost-reasons-analytics`, {
        params: { period },
        withCredentials: true,
      });
      setData(res.data);
    } catch (_e) {
      setData({ total_lost: 0, total_lost_value: 0, by_reason: [], recent: [] });
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  const empty = !loading && (!data || data.total_lost === 0);
  const chartData = (data?.by_reason || []).map((r) => ({
    name: lostReasonLabel(r.reason, language),
    value: r.count,
    reason: r.reason,
    pct: r.percentage,
    money: r.value,
  }));

  return (
    <Card data-testid="lost-reasons-widget" className="border-gray-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="w-4 h-4 text-rose-500" />
              {isEs ? "Motivos de Pérdida" : "Loss Reasons"}
            </CardTitle>
            <CardDescription className="mt-0.5">
              {isEs
                ? "Por qué se están perdiendo propuestas — accionable para revisión comercial."
                : "Why proposals are slipping through — actionable for sales review."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-8 w-[130px]" data-testid="lost-reasons-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">{isEs ? "Últimos 30 días" : "Last 30 days"}</SelectItem>
                <SelectItem value="90d">{isEs ? "Últimos 90 días" : "Last 90 days"}</SelectItem>
                <SelectItem value="1y">{isEs ? "Último año" : "Last year"}</SelectItem>
                <SelectItem value="all">{isEs ? "Todo el tiempo" : "All time"}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => setExpanded((v) => !v)}
              data-testid="lost-reasons-toggle"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          {loading ? (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
              {isEs ? "Cargando..." : "Loading..."}
            </div>
          ) : empty ? (
            <div className="h-40 flex flex-col items-center justify-center text-center gap-2 text-muted-foreground">
              <Archive className="w-8 h-8 opacity-40" />
              <p className="text-sm">
                {isEs
                  ? "Sin propuestas perdidas en este periodo. ¡Sigue así!"
                  : "No lost proposals in this period. Keep it up!"}
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {/* Donut + totals */}
              <div>
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="text-3xl font-bold text-foreground" data-testid="lost-reasons-total-count">
                    {data.total_lost}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {isEs ? "propuestas perdidas" : "lost proposals"}
                  </span>
                </div>
                {data.total_lost_value > 0 && (
                  <p className="text-sm text-rose-600 mb-3" data-testid="lost-reasons-total-value">
                    {isEs ? "Valor estimado: " : "Estimated value: "}
                    <span className="font-semibold">{formatCurrency(data.total_lost_value)}</span>
                  </p>
                )}
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={chartData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {chartData.map((entry) => (
                          <Cell key={entry.reason} fill={REASON_COLORS[entry.reason] || "#9ca3af"} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name, props) => [
                          `${value} (${props.payload.pct}%)`,
                          name,
                        ]}
                      />
                      <Legend
                        verticalAlign="bottom"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 11 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Breakdown + recent */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                    {isEs ? "Desglose" : "Breakdown"}
                  </h4>
                  <ul className="space-y-2" data-testid="lost-reasons-breakdown">
                    {(data.by_reason || []).map((r) => (
                      <li key={r.reason} className="flex items-center gap-2 text-sm">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: REASON_COLORS[r.reason] || "#9ca3af" }}
                        />
                        <span className="flex-1 truncate">{lostReasonLabel(r.reason, language)}</span>
                        <span className="font-medium tabular-nums">{r.count}</span>
                        <span className="text-muted-foreground tabular-nums w-12 text-right">
                          {r.percentage}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {(data.recent || []).length > 0 && (
                  <div>
                    <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                      {isEs ? "Pérdidas recientes" : "Recent losses"}
                    </h4>
                    <ul className="space-y-1.5" data-testid="lost-reasons-recent">
                      {data.recent.map((e) => (
                        <li key={e.event_id} className="text-xs flex items-center gap-2">
                          <Link
                            to={`/events/${e.event_id}`}
                            className="flex-1 truncate hover:text-primary inline-flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">
                              {e.client_name ? `${e.client_name} · ` : ""}{e.name}
                            </span>
                          </Link>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-auto"
                            style={{ borderColor: REASON_COLORS[e.lost_reason] || "#9ca3af" }}
                          >
                            {lostReasonLabel(e.lost_reason, language)}
                          </Badge>
                          <span className="text-muted-foreground whitespace-nowrap">
                            {formatDate(e.lost_reason_at, language)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
