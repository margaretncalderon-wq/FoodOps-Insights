import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API } from "../utils/api";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { ChefHat, TrendingUp, Clock, PackageX, ArrowRight, RefreshCw, CheckCircle2 } from "lucide-react";
import { fmtNum } from "../utils/format";

const SECTIONS = [
  { key: "variance", icon: TrendingUp, tone: "rose", es: "Diferencias de costo", en: "Cost variance", hintEs: "Eventos con costo real ≥10% sobre lo teórico", hintEn: "Events with actual cost ≥10% over theoretical" },
  { key: "staleness", icon: Clock, tone: "amber", es: "Costos desactualizados", en: "Stale costs", hintEs: "Menús cuyo costo cambió ≥10%", hintEn: "Menus whose cost drifted ≥10%" },
  { key: "low_stock", icon: PackageX, tone: "orange", es: "Poco stock", en: "Low stock", hintEs: "Insumos por debajo de lo necesario", hintEn: "Ingredients below what's needed" },
];

const TONES = {
  rose: "border-l-rose-500 [&_.tone-text]:text-rose-600",
  amber: "border-l-amber-500 [&_.tone-text]:text-amber-600",
  orange: "border-l-orange-500 [&_.tone-text]:text-orange-600",
};

const fmtValue = (key, it, isEs) => {
  if (key === "low_stock") {
    const qty = `${fmtNum(it.value)} ${it.unit || ""}`.trim();
    return it.events ? `${isEs ? "faltan" : "short"} ${qty} · ${it.events} ${isEs ? "evento(s)" : "event(s)"}` : `${isEs ? "faltan" : "short"} ${qty}`;
  }
  return `${it.value > 0 ? "+" : ""}${Number(it.value || 0).toFixed(1)}%`;
};

// Daily Culinary Insights: variance, stale costs and low stock with deep links.
export const CulinaryInsightsCard = ({ isEs = true, compact = false }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async (refresh = false) => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/culinary-digest/daily-insights${refresh ? "?refresh=true" : ""}`, { withCredentials: true });
      setData(r.data);
    } catch { setData(null); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (!data && !loading) return null;
  const total = data ? SECTIONS.reduce((n, s) => n + (data[s.key]?.count || 0), 0) : 0;

  return (
    <Card data-testid="culinary-insights-card" className={compact ? "border-orange-200/70" : ""}>
      <CardHeader className={compact ? "py-3" : "pb-2"}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-orange-600" />
            <CardTitle className={compact ? "text-base" : "text-lg"}>
              {isEs ? "Resumen culinario de hoy" : "Today's culinary insights"}
            </CardTitle>
            {total > 0 && <Badge className="bg-orange-500/15 text-orange-700 text-xs" data-testid="culinary-insights-total">{total}</Badge>}
          </div>
          <button onClick={() => load(true)} className="p-1.5 rounded-md hover:bg-muted transition-colors" title={isEs ? "Actualizar" : "Refresh"} data-testid="culinary-insights-refresh">
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </CardHeader>
      <CardContent className={compact ? "pt-0 pb-4" : ""}>
        {loading && !data ? (
          <div className="h-20 rounded-lg bg-muted/40 animate-pulse" />
        ) : total === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700 py-2" data-testid="culinary-insights-all-good">
            <CheckCircle2 className="w-4 h-4" />
            {isEs ? "Todo en orden: sin diferencias de costo, costos al día y stock suficiente." : "All good: no variance, costs up to date and enough stock."}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {SECTIONS.map((s) => <InsightColumn key={s.key} section={s} block={data[s.key]} isEs={isEs} compact={compact} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const InsightColumn = ({ section, block, isEs, compact }) => {
  const Icon = section.icon;
  const count = block?.count || 0;
  return (
    <div className={`rounded-lg border border-l-4 bg-card p-3 ${TONES[section.tone]}`} data-testid={`culinary-insight-${section.key}`}>
      <Link to={block?.link || "/food-ops"} className="flex items-center justify-between group" data-testid={`culinary-insight-${section.key}-link`}>
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon className="w-4 h-4 tone-text" />
          {isEs ? section.es : section.en}
        </span>
        <span className="flex items-center gap-1">
          <span className="text-xl font-bold tone-text" data-testid={`culinary-insight-${section.key}-count`}>{count}</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
      {!compact && <p className="text-[11px] text-muted-foreground mt-0.5">{isEs ? section.hintEs : section.hintEn}</p>}
      {count > 0 && (
        <ul className="mt-2 space-y-1">
          {(block.items || []).slice(0, compact ? 2 : 3).map((it, i) => (
            <li key={i}>
              <Link to={it.link} className="flex items-center justify-between gap-2 text-xs rounded px-1.5 py-1 hover:bg-muted transition-colors" data-testid={`culinary-insight-${section.key}-item-${i}`}>
                <span className="truncate">{it.label}</span>
                <span className="shrink-0 font-medium tone-text">{fmtValue(section.key, it, isEs)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
