import { useEffect, useState } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Sparkles, RefreshCw, TrendingUp, AlertTriangle, Lightbulb, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";
import { fmtNum } from "../../utils/format";

/** Sprint K — AI-powered operational recommendations. */
export function SmartRecommendationsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const t = (es, en) => (isEs ? es : en);

  const [data, setData] = useState({ generated_at: null, recommendations: [] });
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchCached = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/api/inventory/recommendations`, { withCredentials: true });
      setData(r.data || { generated_at: null, recommendations: [] });
    } catch (_) { setData({ generated_at: null, recommendations: [] }); }
    setLoading(false);
  };

  const regenerate = async () => {
    setGenerating(true);
    try {
      const r = await axios.post(`${API}/api/inventory/recommendations`, {}, { withCredentials: true });
      setData(r.data);
      toast.success(t(
        `${r.data.recommendations.length} recomendaciones generadas`,
        `${r.data.recommendations.length} recommendations generated`
      ));
    } catch (e) {
      toast.error(e.response?.data?.detail || t("Error al generar", "Generate failed"));
    }
    setGenerating(false);
  };

  useEffect(() => { fetchCached(); }, []);

  const recs = data?.recommendations || [];
  const highs = recs.filter((r) => r.priority === "high");
  const totalImpact = recs.reduce((s, r) => s + (Number(r.estimated_impact_usd) || 0), 0);

  return (
    <div className="space-y-4" data-testid="smart-recommendations-section">
      <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-purple-50/30">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-white shadow-sm">
                <Sparkles className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  {t("Recomendaciones inteligentes", "Smart Recommendations")}
                  <Badge variant="outline" className="text-xs bg-white">AI</Badge>
                </CardTitle>
                <CardDescription>
                  {t(
                    "Análisis con IA de tu inventario, alquileres, daños y eventos entrantes. Sugerencias accionables con impacto estimado.",
                    "AI-powered analysis of your inventory, rentals, damages, and upcoming events. Actionable suggestions with estimated impact."
                  )}
                </CardDescription>
              </div>
            </div>
            <Button
              onClick={regenerate}
              disabled={generating}
              data-testid="regenerate-recos-btn"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${generating ? "animate-spin" : ""}`} />
              {generating
                ? t("Analizando…", "Analyzing…")
                : recs.length > 0
                  ? t("Regenerar", "Regenerate")
                  : t("Generar", "Generate")}
            </Button>
          </div>
        </CardHeader>
        {data.generated_at && (
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-3 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1">
                <Lightbulb className="w-4 h-4 text-indigo-500" />
                {recs.length} {t("recomendaciones", "recommendations")}
              </span>
              {highs.length > 0 && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 text-red-700">
                    <AlertTriangle className="w-4 h-4" />
                    {highs.length} {t("de alta prioridad", "high priority")}
                  </span>
                </>
              )}
              {totalImpact > 0 && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <DollarSign className="w-4 h-4" />
                    ${fmtNum(totalImpact)} {t("impacto estimado", "est. impact")}
                  </span>
                </>
              )}
              <span>·</span>
              <span className="text-xs text-slate-500">
                {t("Actualizado", "Updated")}: {formatDateOnly(data.generated_at, language)}
              </span>
            </div>
          </CardContent>
        )}
      </Card>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">{t("Cargando…", "Loading…")}</div>
      ) : recs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Sparkles className="w-10 h-10 mx-auto text-indigo-400" />
            <p className="font-medium">{t("Sin recomendaciones aún", "No recommendations yet")}</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {t(
                'Presiona "Generar" para que la IA analice tu operación y proponga acciones concretas.',
                'Click "Generate" so the AI can analyze your ops and suggest concrete actions.'
              )}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {recs.map((r, idx) => (
            <RecCard key={idx} idx={idx} r={r} isEs={isEs} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecCard({ idx, r, isEs }) {
  const tones = {
    high: { border: "border-red-200", bg: "bg-red-50/40", badge: "bg-red-100 text-red-800", label: isEs ? "Alta" : "High" },
    medium: { border: "border-amber-200", bg: "bg-amber-50/40", badge: "bg-amber-100 text-amber-800", label: isEs ? "Media" : "Medium" },
    low: { border: "border-slate-200", bg: "bg-white", badge: "bg-slate-100 text-slate-700", label: isEs ? "Baja" : "Low" },
  };
  const tone = tones[r.priority] || tones.medium;

  return (
    <Card className={`${tone.border} ${tone.bg}`} data-testid={`rec-card-${idx}`}>
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-white shadow-sm shrink-0">
            <TrendingUp className="w-5 h-5 text-slate-600" />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <h4 className="font-semibold text-slate-900">{r.title}</h4>
              <div className="flex items-center gap-1.5">
                <Badge className={`${tone.badge} text-xs`}>{tone.label}</Badge>
                {r.estimated_impact_usd > 0 && (
                  <Badge variant="outline" className="text-xs">
                    ${fmtNum(r.estimated_impact_usd)}
                  </Badge>
                )}
              </div>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{r.reason}</p>
            {r.action_hint && (
              <p className="text-xs text-slate-600 italic">
                → {r.action_hint}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default SmartRecommendationsSection;
