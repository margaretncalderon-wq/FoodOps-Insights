import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { API } from "../utils/api";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "./ui/dialog";
import { AlertTriangle, RefreshCw, TrendingUp, TrendingDown, ExternalLink, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useModules } from "../contexts/ModulesContext";

/**
 * Cost Health Dashboard
 *
 * Modes:
 *  - "card": Compact banner-style card. Hides itself when nothing is stale.
 *           Best for embedding in System Pulse.
 *  - "section": Full table with checkboxes + preview-confirm refresh.
 *           Best for embedding inside Food Ops or a dedicated tab.
 *
 * Always read-only on mount. Writes only when user confirms.
 */
export default function CostHealthDashboard({ mode = "section", onNavigate }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const { isModuleEnabled } = useModules();
  const hasFoodOps = isModuleEnabled("module_culinary_intelligence");

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [selected, setSelected] = useState({}); // proposal_id -> bool
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [scope, setScope] = useState("all"); // "all" or "selected"
  const [applying, setApplying] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null); // for inline single-quote refresh

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/proposals/cost-health/overview`, { withCredentials: true });
      setOverview(res.data);
      setSelected({});
    } catch (err) {
      toast.error(err?.response?.data?.detail || (isEs ? "Error cargando salud de costos" : "Error loading cost health"));
    } finally {
      setLoading(false);
    }
  }, [isEs]);

  useEffect(() => { load(); }, [load]);

  const proposals = overview?.proposals || [];
  const staleCount = overview?.stale_proposals || 0;
  const totalDelta = proposals.reduce((s, p) => s + (p.delta_total || 0), 0);
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const selectedProposals = proposals.filter((p) => selected[p.proposal_id]);
  const selectedDelta = selectedProposals.reduce((s, p) => s + (p.delta_total || 0), 0);

  const fmtMoney = (n) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
  const fmtPct = (n) => `${n > 0 ? "+" : ""}${(n || 0).toFixed(1)}%`;
  const marginColor = (pct) => {
    if (pct == null) return "text-muted-foreground";
    if (pct < 20) return "text-red-600";
    if (pct < 30) return "text-amber-600";
    return "text-emerald-700";
  };

  const handleRefresh = async () => {
    setApplying(true);
    try {
      let refreshedProposals = 0;
      let refreshedItems = 0;
      if (scope === "all") {
        const res = await axios.post(`${API}/proposals/cost-health/refresh-all`, {}, { withCredentials: true });
        refreshedProposals = res.data?.refreshed_proposals || 0;
        refreshedItems = res.data?.refreshed_items || 0;
      } else {
        // Refresh only selected — loop through individual endpoint
        for (const pid of selectedIds) {
          try {
            const r = await axios.post(`${API}/proposals/${pid}/refresh-costs`, {}, { withCredentials: true });
            if ((r.data?.refreshed_count || 0) > 0) {
              refreshedProposals += 1;
              refreshedItems += r.data.refreshed_count;
            }
          } catch (_) { /* skip individual failures */ }
        }
      }
      toast.success(
        isEs
          ? `${refreshedProposals} cotización${refreshedProposals === 1 ? "" : "es"} actualizada${refreshedProposals === 1 ? "" : "s"} (${refreshedItems} ítem${refreshedItems === 1 ? "" : "s"})`
          : `${refreshedProposals} quote${refreshedProposals === 1 ? "" : "s"} updated (${refreshedItems} item${refreshedItems === 1 ? "" : "s"})`,
      );
      setConfirmOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || (isEs ? "Error al refrescar" : "Refresh failed"));
    } finally {
      setApplying(false);
    }
  };

  // Refresh a single proposal inline (used by mini-list in card mode)
  const refreshOne = async (proposalId) => {
    setRefreshingId(proposalId);
    try {
      const res = await axios.post(`${API}/proposals/${proposalId}/refresh-costs`, {}, { withCredentials: true });
      const count = res.data?.refreshed_count || 0;
      toast.success(
        isEs
          ? `${count} ítem${count === 1 ? "" : "s"} actualizado${count === 1 ? "" : "s"}`
          : `${count} item${count === 1 ? "" : "s"} updated`,
      );
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || (isEs ? "Error al refrescar" : "Refresh failed"));
    } finally {
      setRefreshingId(null);
    }
  };

  // ----------------- Compact Card Mode (System Pulse) -----------------
  if (mode === "card") {
    if (loading || staleCount === 0) return null; // hide when nothing to do
    return (
      <Card
        className="border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/10"
        data-testid="cost-health-card"
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <CardTitle className="text-base">
                {isEs ? "Costos desactualizados" : "Outdated costs"}
              </CardTitle>
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                {staleCount}
              </Badge>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={load}
              title={isEs ? "Recargar" : "Reload"}
              data-testid="cost-health-card-reload-btn"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div>
            <p className="text-xs text-amber-800/80">
              {isEs
                ? `Si refrescas todas, el costo interno cambiará ${fmtMoney(totalDelta)} en total`
                : `Refreshing all would shift internal cost by ${fmtMoney(totalDelta)}`}
            </p>
            <div className="mt-1 flex items-center gap-2 text-xs text-amber-900/80">
              {totalDelta >= 0
                ? <TrendingUp className="w-3.5 h-3.5" />
                : <TrendingDown className="w-3.5 h-3.5" />}
              <span>
                {isEs
                  ? `${staleCount} cotización${staleCount === 1 ? "" : "es"} en Draft afectada${staleCount === 1 ? "" : "s"}`
                  : `${staleCount} Draft quote${staleCount === 1 ? "" : "s"} affected`}
              </span>
            </div>
          </div>

          {/* Top 3 stale quotes — inline refresh */}
          <div className="space-y-1.5" data-testid="cost-health-card-top-list">
            {proposals.slice(0, 3).map((p) => {
              const isRefreshing = refreshingId === p.proposal_id;
              return (
                <div
                  key={p.proposal_id}
                  className="flex items-center justify-between gap-2 rounded-md border border-amber-200/70 bg-white/60 px-2.5 py-1.5"
                  data-testid={`cost-health-card-row-${p.proposal_id}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">
                      {p.client_name || "—"}
                      <span className="text-muted-foreground font-normal ml-1.5">
                        · {p.proposal_number || p.proposal_id.slice(0, 6)}
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {p.event_name || (isEs ? "Sin evento" : "No event")}
                      {" · "}
                      <span className={p.delta_total >= 0 ? "text-amber-700" : "text-emerald-700"}>
                        {fmtMoney(p.delta_total)}
                      </span>
                      <span className="text-muted-foreground"> · {p.stale_count} {isEs ? "ítems" : "items"}</span>
                    </p>
                    {p.current_margin_pct != null && p.projected_margin_pct != null && (
                      <p
                        className="text-[11px] mt-0.5 flex items-center gap-1 flex-wrap"
                        data-testid={`cost-health-card-margin-${p.proposal_id}`}
                      >
                        <span className="text-muted-foreground">{isEs ? "Margen" : "Margin"}:</span>
                        <span className={marginColor(p.current_margin_pct)}>
                          {p.current_margin_pct.toFixed(1)}%
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className={`font-semibold ${p.below_threshold ? "text-red-600" : marginColor(p.projected_margin_pct)}`}>
                          {p.projected_margin_pct.toFixed(1)}%
                        </span>
                        {p.effective_min_margin != null && (
                          <span className="text-[10px] text-muted-foreground">
                            ({isEs ? "mín" : "min"} {p.effective_min_margin.toFixed(0)}%)
                          </span>
                        )}
                        {p.below_threshold && (
                          <Badge variant="outline" className="text-[9px] py-0 px-1 ml-1 border-red-300 text-red-700 bg-red-50" data-testid={`cost-health-card-below-${p.proposal_id}`}>
                            {isEs ? "Bajo margen" : "Below threshold"}
                          </Badge>
                        )}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-amber-900 hover:bg-amber-100"
                    onClick={() => refreshOne(p.proposal_id)}
                    disabled={isRefreshing || refreshingId !== null}
                    data-testid={`cost-health-card-refresh-one-${p.proposal_id}`}
                  >
                    <RefreshCw className={`w-3 h-3 mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
                    {isEs ? "Refrescar" : "Refresh"}
                  </Button>
                </div>
              );
            })}
            {staleCount > 3 && (
              <p className="text-[11px] text-amber-800/70 px-1">
                {isEs
                  ? `+${staleCount - 3} cotización${staleCount - 3 === 1 ? "" : "es"} más`
                  : `+${staleCount - 3} more quote${staleCount - 3 === 1 ? "" : "s"}`}
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 text-amber-900 hover:bg-amber-100"
              onClick={() => onNavigate ? onNavigate() : window.location.assign(hasFoodOps ? "/food-ops/recipes#cost-health" : "/crm/proposals")}
              data-testid="cost-health-card-open-btn"
            >
              {isEs ? "Revisar todo" : "Review all"}
              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ----------------- Full Section Mode -----------------
  return (
    <Card data-testid="cost-health-section">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <div>
              <CardTitle className="text-lg">
                {isEs ? "Salud de Costos en Cotizaciones" : "Quote Cost Health"}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isEs
                  ? "Cotizaciones en Draft con costos internos desactualizados frente a recetas o servicios"
                  : "Draft quotes with internal costs out of sync with current recipes or services"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="cost-health-reload-btn">
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              {isEs ? "Recargar" : "Reload"}
            </Button>
            {selectedIds.length > 0 && (
              <Button
                size="sm"
                onClick={() => { setScope("selected"); setConfirmOpen(true); }}
                data-testid="cost-health-refresh-selected-btn"
              >
                <RefreshCw className="w-4 h-4 mr-1.5" />
                {isEs ? `Refrescar (${selectedIds.length})` : `Refresh (${selectedIds.length})`}
              </Button>
            )}
            {staleCount > 0 && (
              <Button
                size="sm"
                variant="default"
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() => { setScope("all"); setConfirmOpen(true); }}
                data-testid="cost-health-refresh-all-btn"
              >
                {isEs ? "Refrescar todo" : "Refresh all"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            {isEs ? "Analizando cotizaciones..." : "Scanning quotes..."}
          </div>
        ) : staleCount === 0 ? (
          <div className="text-center py-10" data-testid="cost-health-empty">
            <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
            <p className="text-sm font-medium text-foreground">
              {isEs ? "Todas las cotizaciones Draft están al día" : "All Draft quotes are up to date"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isEs
                ? `${overview?.total_drafts_scanned || 0} cotización${(overview?.total_drafts_scanned || 0) === 1 ? "" : "es"} analizada${(overview?.total_drafts_scanned || 0) === 1 ? "" : "s"}`
                : `${overview?.total_drafts_scanned || 0} draft${(overview?.total_drafts_scanned || 0) === 1 ? "" : "s"} scanned`}
            </p>
          </div>
        ) : (
          <>
            {/* Summary strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {isEs ? "Cotizaciones" : "Quotes"}
                </p>
                <p className="text-xl font-semibold mt-0.5">{staleCount}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {isEs ? "Drafts revisados" : "Drafts scanned"}
                </p>
                <p className="text-xl font-semibold mt-0.5">{overview?.total_drafts_scanned || 0}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {isEs ? "Delta total" : "Total delta"}
                </p>
                <p className={`text-xl font-semibold mt-0.5 ${totalDelta >= 0 ? "text-amber-700" : "text-emerald-700"}`}>
                  {fmtMoney(totalDelta)}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {isEs ? "Seleccionado" : "Selected"}
                </p>
                <p className="text-xl font-semibold mt-0.5">
                  {selectedIds.length}
                  {selectedIds.length > 0 && (
                    <span className="text-xs font-normal text-muted-foreground ml-1.5">
                      ({fmtMoney(selectedDelta)})
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 w-10">
                        <Checkbox
                          checked={selectedIds.length === proposals.length && proposals.length > 0}
                          onCheckedChange={(v) => {
                            if (v) {
                              const all = {};
                              proposals.forEach((p) => { all[p.proposal_id] = true; });
                              setSelected(all);
                            } else { setSelected({}); }
                          }}
                          data-testid="cost-health-select-all"
                        />
                      </th>
                      <th className="px-3 py-2 text-left">{isEs ? "Cotización" : "Quote"}</th>
                      <th className="px-3 py-2 text-left">{isEs ? "Cliente / Evento" : "Client / Event"}</th>
                      <th className="px-3 py-2 text-right">{isEs ? "Ítems stale" : "Stale items"}</th>
                      <th className="px-3 py-2 text-right">{isEs ? "Máx %" : "Max %"}</th>
                      <th className="px-3 py-2 text-right">{isEs ? "Δ Costo" : "Δ Cost"}</th>
                      <th className="px-3 py-2 text-right">{isEs ? "Margen" : "Margin"}</th>
                      <th className="px-3 py-2 text-right">{isEs ? "Total" : "Total"}</th>
                      <th className="px-3 py-2 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.map((p) => (
                      <tr
                        key={p.proposal_id}
                        className="border-t hover:bg-muted/20"
                        data-testid={`cost-health-row-${p.proposal_id}`}
                      >
                        <td className="px-3 py-2.5">
                          <Checkbox
                            checked={!!selected[p.proposal_id]}
                            onCheckedChange={(v) => setSelected((s) => ({ ...s, [p.proposal_id]: !!v }))}
                            data-testid={`cost-health-select-${p.proposal_id}`}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-foreground">
                            {p.proposal_number || p.proposal_id.slice(0, 8)}
                          </p>
                          {p.event_date && (
                            <p className="text-xs text-muted-foreground">
                              {new Date(p.event_date).toLocaleDateString()}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="text-foreground">{p.client_name || "—"}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[280px]">
                            {p.event_name || "—"}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Badge variant="outline" className="border-amber-300 text-amber-800">
                            {p.stale_count}
                          </Badge>
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono text-xs ${Math.abs(p.max_diff_pct) >= 10 ? "text-red-600" : "text-amber-700"}`}>
                          {fmtPct(p.max_diff_pct)}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono text-xs ${p.delta_total >= 0 ? "text-amber-700" : "text-emerald-700"}`}>
                          {fmtMoney(p.delta_total)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs font-mono whitespace-nowrap" data-testid={`cost-health-row-margin-${p.proposal_id}`}>
                          {p.current_margin_pct != null && p.projected_margin_pct != null ? (
                            <div className="inline-flex flex-col items-end gap-0.5">
                              <span className="inline-flex items-center gap-1">
                                <span className={marginColor(p.current_margin_pct)}>
                                  {p.current_margin_pct.toFixed(1)}%
                                </span>
                                <span className="text-muted-foreground">→</span>
                                <span className={`font-semibold ${p.below_threshold ? "text-red-600" : marginColor(p.projected_margin_pct)}`}>
                                  {p.projected_margin_pct.toFixed(1)}%
                                </span>
                              </span>
                              {p.below_threshold && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 border-red-300 text-red-700 bg-red-50" data-testid={`cost-health-row-below-${p.proposal_id}`}>
                                  {isEs ? `Bajo ${p.effective_min_margin?.toFixed(0) ?? ""}%` : `Below ${p.effective_min_margin?.toFixed(0) ?? ""}%`}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                          ${(p.total_amount || 0).toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            asChild
                            data-testid={`cost-health-open-${p.proposal_id}`}
                            title={isEs ? "Abrir cotización" : "Open quote"}
                          >
                            <a
                              href={`/events/${p.event_id}?tab=proposal`}
                              rel="noreferrer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </CardContent>

      {/* Preview / Confirm Dialog */}
      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!applying) setConfirmOpen(o); }}>
        <DialogContent className="max-w-lg" data-testid="cost-health-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              {isEs ? "Confirmar refresco de costos" : "Confirm cost refresh"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {scope === "all"
                ? (isEs
                    ? `Vas a refrescar todas las cotizaciones Draft con costos desactualizados.`
                    : `You're about to refresh every Draft quote with outdated costs.`)
                : (isEs
                    ? `Vas a refrescar las cotizaciones seleccionadas.`
                    : `You're about to refresh the selected quotes.`)}
            </p>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{isEs ? "Cotizaciones afectadas" : "Quotes affected"}</span>
                <span className="font-semibold">{scope === "all" ? staleCount : selectedIds.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{isEs ? "Delta de costo interno" : "Internal cost delta"}</span>
                <span className={`font-semibold ${(scope === "all" ? totalDelta : selectedDelta) >= 0 ? "text-amber-700" : "text-emerald-700"}`}>
                  {fmtMoney(scope === "all" ? totalDelta : selectedDelta)}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {isEs
                ? "Solo se actualiza el costo interno y el margen. Los precios al cliente (unit_price) no se modifican. Las cotizaciones firmadas/aceptadas están protegidas."
                : "Only internal cost and margin are updated. Customer-facing prices (unit_price) stay the same. Signed/accepted quotes are protected."}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={applying}
              data-testid="cost-health-confirm-cancel-btn"
            >
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button
              onClick={handleRefresh}
              disabled={applying}
              data-testid="cost-health-confirm-apply-btn"
            >
              {applying
                ? (<><RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />{isEs ? "Aplicando..." : "Applying..."}</>)
                : (isEs ? "Aplicar refresco" : "Apply refresh")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
