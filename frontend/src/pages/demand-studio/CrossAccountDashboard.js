import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { API } from "../../utils/api";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { TrendingUp, TrendingDown, Minus, RefreshCw, BarChart3, Award, Users, Eye, Heart } from "lucide-react";

/**
 * CrossAccountDashboard — Feb 2026 · Feature agencia
 *
 * Vista side-by-side de todas las cuentas sociales (owned + shared) para
 * comparar seguidores, reach, engagement, engagement rate y su crecimiento
 * vs el período anterior. Ideal para conversaciones con cliente:
 *   "mira, este mes estás 25% arriba de tu benchmark de agencia".
 */
function fmtInt(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toString();
}

function GrowthBadge({ pct }) {
  if (pct === null || pct === undefined) {
    return <span className="text-[10px] text-slate-400 inline-flex items-center gap-0.5"><Minus className="w-2.5 h-2.5" />—</span>;
  }
  const up = pct > 0;
  const flat = Math.abs(pct) < 0.1;
  const Icon = flat ? Minus : (up ? TrendingUp : TrendingDown);
  const cls = flat ? "text-slate-500" : (up ? "text-emerald-600" : "text-rose-600");
  return (
    <span className={`text-[10px] font-semibold inline-flex items-center gap-0.5 ${cls}`}>
      <Icon className="w-2.5 h-2.5" />
      {up && !flat ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

export default function CrossAccountDashboard({ orgId = null }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState({ accounts: [], totals: { followers: 0, reach: 0, engagement: 0 }, agency_benchmark_reach_pct: null });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const orgParam = orgId ? `&org_id=${orgId}` : "&include_shared=true";
      const res = await axios.get(
        `${API}/demand-studio/social-metrics/cross-account?period_days=${period}${orgParam}`,
        { withCredentials: true },
      );
      setData(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || (isEs ? "Error cargando comparativa" : "Error loading comparison"));
    } finally {
      setLoading(false);
    }
  }, [orgId, period, isEs]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const benchmarkStr = data.agency_benchmark_reach_pct !== null
    ? `${data.agency_benchmark_reach_pct >= 0 ? "+" : ""}${data.agency_benchmark_reach_pct.toFixed(1)}%`
    : "—";

  return (
    <div className="space-y-4" data-testid="cross-account-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold">
            {isEs ? "Comparativa cross-cuenta" : "Cross-account comparison"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(period)} onValueChange={(v) => setPeriod(Number(v))}>
            <SelectTrigger className="w-40 h-8 text-xs" data-testid="cross-period-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{isEs ? "Últimos 7 días" : "Last 7 days"}</SelectItem>
              <SelectItem value="30">{isEs ? "Últimos 30 días" : "Last 30 days"}</SelectItem>
              <SelectItem value="90">{isEs ? "Últimos 90 días" : "Last 90 days"}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading} data-testid="cross-refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Totals + Agency benchmark */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Users className="w-3 h-3" /> {isEs ? "Seguidores portafolio" : "Portfolio followers"}
            </div>
            <div className="text-2xl font-bold" data-testid="cross-total-followers">{fmtInt(data.totals.followers)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Eye className="w-3 h-3" /> {isEs ? "Reach total" : "Total reach"}
            </div>
            <div className="text-2xl font-bold" data-testid="cross-total-reach">{fmtInt(data.totals.reach)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Heart className="w-3 h-3" /> {isEs ? "Engagement total" : "Total engagement"}
            </div>
            <div className="text-2xl font-bold" data-testid="cross-total-engagement">{fmtInt(data.totals.engagement)}</div>
          </CardContent>
        </Card>
        <Card className="bg-indigo-50/60 border-indigo-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-indigo-700 mb-1">
              <Award className="w-3 h-3" /> {isEs ? "Benchmark agencia (reach)" : "Agency benchmark (reach)"}
            </div>
            <div className="text-2xl font-bold text-indigo-700" data-testid="cross-agency-benchmark">{benchmarkStr}</div>
            <p className="text-[10px] text-indigo-800/70">
              {isEs ? "Promedio de crecimiento entre todas tus cuentas" : "Average growth across all your accounts"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Per-account comparison table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {isEs ? "Detalle por cuenta · orden por crecimiento reach" : "Per-account detail · sorted by reach growth"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50/50 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">{isEs ? "Cuenta" : "Account"}</th>
                  <th className="px-3 py-2 text-right font-medium">{isEs ? "Seguidores" : "Followers"}</th>
                  <th className="px-3 py-2 text-right font-medium">Reach</th>
                  <th className="px-3 py-2 text-right font-medium">Engagement</th>
                  <th className="px-3 py-2 text-right font-medium">{isEs ? "Tasa Eng." : "Eng. rate"}</th>
                  <th className="px-3 py-2 text-right font-medium">{isEs ? "vs Benchmark" : "vs Benchmark"}</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.length === 0 && !loading && (
                  <tr><td colSpan={7} className="text-center text-muted-foreground py-8 text-xs">
                    {isEs ? "Sin datos aún. Conectá cuentas o agregá métricas manualmente." : "No data yet. Connect accounts or add manual metrics."}
                  </td></tr>
                )}
                {data.accounts.sort((x, y) => (x.rank_by_reach || 999) - (y.rank_by_reach || 999)).map((a) => {
                  const benchmarkDiff = (data.agency_benchmark_reach_pct !== null && a.growth.reach_pct !== null)
                    ? (a.growth.reach_pct - data.agency_benchmark_reach_pct)
                    : null;
                  return (
                    <tr key={a.account_id} className="border-b hover:bg-slate-50/40" data-testid={`cross-row-${a.account_id}`}>
                      <td className="px-3 py-2.5 text-xs font-bold text-slate-500 w-8">
                        {a.rank_by_reach ? `#${a.rank_by_reach}` : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: a.color || "#64748b" }} />
                          <span className="truncate">{a.account_name}</span>
                          <span className="text-[9px] text-muted-foreground uppercase shrink-0">{a.platform}</span>
                          {a._access_type === "shared" && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 border-purple-300 text-purple-700 bg-purple-50 shrink-0">
                              {isEs ? "Compartida" : "Shared"}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <div>{fmtInt(a.current.followers)}</div>
                        <GrowthBadge pct={a.growth.followers_pct} />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <div>{fmtInt(a.current.reach)}</div>
                        <GrowthBadge pct={a.growth.reach_pct} />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <div>{fmtInt(a.current.engagement)}</div>
                        <GrowthBadge pct={a.growth.engagement_pct} />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <div>{a.current.eng_rate.toFixed(2)}%</div>
                        <GrowthBadge pct={a.growth.eng_rate_delta} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {benchmarkDiff !== null ? (
                          <Badge variant="outline" className={`text-[10px] ${benchmarkDiff >= 0 ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-rose-300 text-rose-700 bg-rose-50"}`}>
                            {benchmarkDiff >= 0 ? "+" : ""}{benchmarkDiff.toFixed(1)}%
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground">
        {isEs
          ? "Compara período actual vs período anterior de igual duración. Fuentes: snapshots de OAuth + entradas manuales."
          : "Compares the current period vs the previous period of equal length. Sources: OAuth snapshots + manual entries."}
      </p>
    </div>
  );
}
