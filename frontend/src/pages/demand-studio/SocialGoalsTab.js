import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { API } from "../../utils/api";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import { Target, RefreshCw, Save, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Clock, Video, Layers, Film, Grid3X3, Camera, PenTool, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";

const FORMATS = [
  { key: "reel",       labelEs: "Reels",       labelEn: "Reels",       icon: Film,     color: "#a855f7" },
  { key: "carousel",   labelEs: "Carrusels",   labelEn: "Carousels",   icon: Layers,   color: "#3b82f6" },
  { key: "story",      labelEs: "Stories",     labelEn: "Stories",     icon: Camera,   color: "#f59e0b" },
  { key: "feed",       labelEs: "Feed",        labelEn: "Feed",        icon: Grid3X3,  color: "#10b981" },
  { key: "photoshoot", labelEs: "Photoshoots", labelEn: "Photoshoots", icon: PenTool,  color: "#ec4899" },
  { key: "live",       labelEs: "Lives",       labelEn: "Lives",       icon: Video,    color: "#ef4444" },
];

const HEALTH_STYLE = {
  complete:    { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-300", icon: CheckCircle2, labelEs: "Completo",  labelEn: "Complete" },
  on_track:    { bg: "bg-blue-100",    text: "text-blue-800",    border: "border-blue-300",    icon: Clock,        labelEs: "En camino", labelEn: "On track" },
  warning:     { bg: "bg-amber-100",   text: "text-amber-800",   border: "border-amber-300",   icon: AlertTriangle,labelEs: "Atento",    labelEn: "Warning" },
  behind:      { bg: "bg-rose-100",    text: "text-rose-800",    border: "border-rose-300",    icon: AlertTriangle,labelEs: "Atrasado",  labelEn: "Behind" },
  not_started: { bg: "bg-slate-100",   text: "text-slate-700",   border: "border-slate-300",   icon: Clock,        labelEs: "Sin empezar", labelEn: "Not started" },
  no_target:   { bg: "bg-slate-50",    text: "text-slate-500",   border: "border-slate-200",   icon: null,         labelEs: "—",          labelEn: "—" },
};

function monthKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(d, isEs) {
  return d.toLocaleDateString(isEs ? "es" : "en", { year: "numeric", month: "long" });
}

/**
 * SocialGoalsTab — Feb 2026 Feature
 * Lets agencies define monthly production targets per social account and
 * track live progress. Targets are FIXED (do not reset per month), but
 * editable when a client changes their plan.
 */
export default function SocialGoalsTab({ orgId = null }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [monthDate, setMonthDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // account_id being saved
  const [data, setData] = useState({ accounts: [], days_in_month: 0, day_of_month: 0, month: "" });
  const [drafts, setDrafts] = useState({}); // {account_id: {reel:5, ...}}
  const [editingId, setEditingId] = useState(null);

  const fetchProgress = useCallback(async () => {
    setLoading(true);
    try {
      const m = monthKey(monthDate);
      const url = `${API}/demand-studio/social/goals-progress?month=${m}${orgId ? `&org_id=${orgId}` : "&include_shared=true"}`;
      const res = await axios.get(url, { withCredentials: true });
      setData(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || (isEs ? "Error cargando metas" : "Error loading goals"));
    } finally {
      setLoading(false);
    }
  }, [monthDate, orgId, isEs]);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  const startEditing = (acct) => {
    setEditingId(acct.account_id);
    setDrafts((prev) => ({
      ...prev,
      [acct.account_id]: { ...(acct.targets || {}) },
    }));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setDrafts({});
  };

  const updateDraft = (accountId, fmt, raw) => {
    const num = parseInt(raw, 10);
    setDrafts((prev) => ({
      ...prev,
      [accountId]: {
        ...(prev[accountId] || {}),
        [fmt]: raw === "" ? "" : isNaN(num) ? 0 : num,
      },
    }));
  };

  const saveTargets = async (accountId) => {
    setSaving(accountId);
    try {
      const payload = { targets: drafts[accountId] || {} };
      // For shared accounts, use the account's own company_id as org_id so the
      // backend permission check passes.
      const acct = data.accounts.find((a) => a.account_id === accountId);
      const scopeOrgId = orgId || (acct?._access_type === "shared" ? acct?._company_id : null);
      const url = `${API}/demand-studio/social/accounts/${accountId}/monthly-targets${scopeOrgId ? `?org_id=${scopeOrgId}` : ""}`;
      await axios.put(url, payload, { withCredentials: true });
      toast.success(isEs ? "Metas guardadas" : "Goals saved");
      setEditingId(null);
      setDrafts((prev) => { const c = { ...prev }; delete c[accountId]; return c; });
      await fetchProgress();
    } catch (err) {
      toast.error(err?.response?.data?.detail || (isEs ? "Error al guardar" : "Save failed"));
    } finally {
      setSaving(null);
    }
  };

  const navigateMonth = (delta) => {
    const d = new Date(monthDate);
    d.setMonth(d.getMonth() + delta);
    setMonthDate(d);
  };

  return (
    <div className="space-y-4" data-testid="social-goals-tab">
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold">
            {isEs ? "Metas mensuales por cuenta" : "Monthly goals per account"}
          </h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger><Info className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                {isEs
                  ? "Metas fijas de producción por cuenta. Se cuentan posts con estado 'programado' o 'publicado' del mes seleccionado. Los formatos sin valor no se trackean."
                  : "Fixed production targets per account. Counts posts in 'scheduled' or 'posted' state for the selected month. Formats without a value are not tracked."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)} data-testid="goals-prev-month">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-[160px] text-center font-medium capitalize" data-testid="goals-month-label">
            {monthLabel(monthDate, isEs)}
          </div>
          <Button variant="outline" size="icon" onClick={() => navigateMonth(1)} data-testid="goals-next-month">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={fetchProgress} disabled={loading} data-testid="goals-refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Progress info bar */}
      <div className="text-xs text-muted-foreground px-1">
        {isEs
          ? `Día ${data.day_of_month} de ${data.days_in_month}. Progreso esperado del mes: ${data.days_in_month ? Math.round((data.day_of_month / data.days_in_month) * 100) : 0}%.`
          : `Day ${data.day_of_month} of ${data.days_in_month}. Expected month progress: ${data.days_in_month ? Math.round((data.day_of_month / data.days_in_month) * 100) : 0}%.`}
      </div>

      {/* Accounts grid */}
      {data.accounts.length === 0 && !loading && (
        <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">
          {isEs ? "No hay cuentas de redes sociales configuradas." : "No social accounts configured."}
        </CardContent></Card>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.accounts.map((acct) => {
          const isEditing = editingId === acct.account_id;
          const draft = drafts[acct.account_id] || {};
          const displayedTargets = isEditing ? draft : acct.targets || {};
          const trackedFormats = FORMATS.filter((f) => (displayedTargets[f.key] || 0) > 0);
          const untrackedFormats = FORMATS.filter((f) => !((displayedTargets[f.key] || 0) > 0));

          return (
            <Card key={acct.account_id} className="overflow-hidden" data-testid={`goals-account-card-${acct.account_id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ background: acct.color || "#64748b" }}
                      />
                      <span className="truncate">{acct.account_name}</span>
                      {acct._access_type === "shared" && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-purple-300 text-purple-700 bg-purple-50 shrink-0" data-testid={`goals-shared-badge-${acct.account_id}`}>
                          {isEs ? "Compartida" : "Shared"}
                        </Badge>
                      )}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {acct.platform} {acct.handle && `· ${acct.handle}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isEditing && acct.has_targets && (
                      <div className="text-right">
                        <div className="text-2xl font-bold text-emerald-600" data-testid={`goals-overall-pct-${acct.account_id}`}>
                          {acct.overall_pct}%
                        </div>
                        <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
                          {isEs ? "Cumplimiento" : "Overall"}
                        </div>
                      </div>
                    )}
                    {isEditing ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={saving === acct.account_id} data-testid={`goals-cancel-${acct.account_id}`}>
                          {isEs ? "Cancelar" : "Cancel"}
                        </Button>
                        <Button size="sm" onClick={() => saveTargets(acct.account_id)} disabled={saving === acct.account_id} data-testid={`goals-save-${acct.account_id}`}>
                          <Save className="w-3.5 h-3.5 mr-1" />
                          {saving === acct.account_id ? (isEs ? "..." : "...") : (isEs ? "Guardar" : "Save")}
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => startEditing(acct)} data-testid={`goals-edit-${acct.account_id}`}>
                        {acct.has_targets ? (isEs ? "Editar" : "Edit") : (isEs ? "Configurar" : "Configure")}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5 pt-1">
                {/* Empty state — no targets configured */}
                {!isEditing && !acct.has_targets && (
                  <div className="text-center py-4 border-2 border-dashed rounded-md text-xs text-muted-foreground">
                    {isEs
                      ? 'Aún no defines metas para esta cuenta. Click en "Configurar" para empezar.'
                      : 'No goals set for this account yet. Click "Configure" to start.'}
                  </div>
                )}

                {/* Tracked formats */}
                {trackedFormats.map((f) => {
                  const target = displayedTargets[f.key] || 0;
                  const actual = acct.actual?.[f.key] || 0;
                  const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
                  const health = acct.health?.[f.key] || "no_target";
                  const HealthIcon = HEALTH_STYLE[health].icon;
                  const Icon = f.icon;
                  return (
                    <div key={f.key} className="flex items-center gap-3" data-testid={`goals-row-${acct.account_id}-${f.key}`}>
                      <div className="w-32 shrink-0 flex items-center gap-1.5 text-xs font-medium">
                        <Icon className="w-3.5 h-3.5" style={{ color: f.color }} />
                        {isEs ? f.labelEs : f.labelEn}
                      </div>
                      {isEditing ? (
                        <Input
                          type="number" min="0" max="999"
                          value={draft[f.key] ?? ""}
                          onChange={(e) => updateDraft(acct.account_id, f.key, e.target.value)}
                          className="w-20 h-8 text-sm"
                          placeholder="0"
                          data-testid={`goals-input-${acct.account_id}-${f.key}`}
                        />
                      ) : (
                        <>
                          <div className="flex-1">
                            <Progress value={pct} className="h-2" />
                          </div>
                          <div className="text-xs font-semibold tabular-nums whitespace-nowrap" data-testid={`goals-count-${acct.account_id}-${f.key}`}>
                            {actual}/{target}
                          </div>
                          {!isEditing && HealthIcon && (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${HEALTH_STYLE[health].bg} ${HEALTH_STYLE[health].text} ${HEALTH_STYLE[health].border} border`}>
                              <HealthIcon className="w-2.5 h-2.5 mr-0.5" />
                              {isEs ? HEALTH_STYLE[health].labelEs : HEALTH_STYLE[health].labelEn}
                            </Badge>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}

                {/* Untracked formats — only visible while editing so user can add them */}
                {isEditing && untrackedFormats.length > 0 && (
                  <div className="pt-2 mt-2 border-t space-y-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                      {isEs ? "Agregar meta" : "Add goal"}
                    </p>
                    {untrackedFormats.map((f) => {
                      const Icon = f.icon;
                      return (
                        <div key={f.key} className="flex items-center gap-3">
                          <div className="w-32 shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Icon className="w-3.5 h-3.5" style={{ color: f.color }} />
                            {isEs ? f.labelEs : f.labelEn}
                          </div>
                          <Input
                            type="number" min="0" max="999"
                            value={draft[f.key] ?? ""}
                            onChange={(e) => updateDraft(acct.account_id, f.key, e.target.value)}
                            className="w-20 h-8 text-sm"
                            placeholder="0"
                            data-testid={`goals-input-${acct.account_id}-${f.key}`}
                          />
                          <span className="text-[10px] text-muted-foreground">
                            {isEs ? "(dejar en 0 para no trackear)" : "(0 = not tracked)"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Show "extra" posts if actual > target (over-delivery) */}
                {!isEditing && acct.has_targets && (
                  <div className="pt-2 mt-2 border-t text-[10px] text-muted-foreground">
                    {(() => {
                      const extras = FORMATS
                        .filter((f) => (acct.targets[f.key] || 0) > 0 && (acct.actual[f.key] || 0) > (acct.targets[f.key] || 0))
                        .map((f) => `${isEs ? f.labelEs : f.labelEn} +${acct.actual[f.key] - acct.targets[f.key]}`);
                      return extras.length > 0 ? (
                        <span>{isEs ? "Sobre-entrega:" : "Over-delivery:"} {extras.join(" · ")}</span>
                      ) : null;
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
