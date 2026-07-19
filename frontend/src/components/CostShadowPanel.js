/**
 * CostShadowPanel — FASE 2 UI
 *
 * Panel del shadow mode dentro de Cost Audit. Muestra:
 * - Flag state (feature enabled / disabled)
 * - Totales por tipo de entidad (recipe / plated_menu / menu / proposal)
 * - Recent runs (walks reactivos disparados por hooks o simulate)
 * - Top drift (recetas con mayor drift en shadow)
 * - Simulate manual: super-admin dispara un walk sobre un ingrediente/receta
 * - Reset: limpia colecciones cost_staleness + cost_cascade_runs
 */
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  Activity, RefreshCw, Zap, Trash2, PlayCircle, AlertTriangle,
  CheckCircle2, Loader2, GitBranch,
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const fmtMoney = (n) =>
  (typeof n === "number" ? n : 0).toLocaleString("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2,
  });

function StatTile({ label, value, tone = "default", testId }) {
  const styles = {
    default: "bg-white border-slate-200",
    warning: "bg-amber-50 border-amber-200",
    success: "bg-emerald-50 border-emerald-200",
    danger: "bg-rose-50 border-rose-200",
  };
  return (
    <div className={`rounded-lg border ${styles[tone]} px-4 py-3`} data-testid={testId}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
    </div>
  );
}

export default function CostShadowPanel() {
  const { language } = useLanguage();
  const { token } = useAuth();
  const isEs = language === "es";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simForm, setSimForm] = useState({
    company_id: "", root_type: "recipe", root_id: "",
  });

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(
        `${API}/api/cost-audit/shadow/dashboard`, authHeaders,
      );
      setData(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load shadow data");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const simulate = async () => {
    if (!simForm.company_id || !simForm.root_id) {
      toast.error(isEs ? "Completa company_id y root_id" : "Fill company_id and root_id");
      return;
    }
    setSimulating(true);
    try {
      const { data } = await axios.post(
        `${API}/api/cost-audit/shadow/simulate`, simForm, authHeaders,
      );
      if (data.status === "failed") {
        toast.error(`Simulate failed: ${data.error}`);
      } else {
        toast.success(
          isEs
            ? `Walk ejecutado (${data.duration_ms} ms · ${data.affected_counts?.recipe || 0} recetas)`
            : `Walk executed (${data.duration_ms} ms · ${data.affected_counts?.recipe || 0} recipes)`,
        );
      }
      await fetchDashboard();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Simulate failed");
    } finally { setSimulating(false); }
  };

  const clearAll = async () => {
    if (!window.confirm(isEs
      ? "Vaciar todas las observaciones del shadow mode? (No modifica recetas ni ingredientes)"
      : "Clear all shadow observations? (Won't modify recipes or ingredients)")) return;
    try {
      const { data } = await axios.post(
        `${API}/api/cost-audit/shadow/clear`, {}, authHeaders,
      );
      toast.success(
        isEs
          ? `Limpiado: ${data.cost_staleness_deleted} entries, ${data.cost_cascade_runs_deleted} runs`
          : `Cleared: ${data.cost_staleness_deleted} entries, ${data.cost_cascade_runs_deleted} runs`,
      );
      await fetchDashboard();
    } catch (e) {
      toast.error("Clear failed");
    }
  };

  const t = data?.totals || { observations: 0, stale_entries: 0, by_type: [] };
  const byType = Object.fromEntries((t.by_type || []).map(x => [x.entity_type, x]));

  return (
    <div className="space-y-5" data-testid="cost-shadow-panel">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-slate-700"/>
                {isEs ? "Shadow Mode — Fase 2 (en paralelo)" : "Shadow Mode — Phase 2 (parallel)"}
              </CardTitle>
              <CardDescription className="mt-1">
                {isEs
                  ? "Cada edición de ingrediente o receta dispara en background un walk del grafo de dependencia. Se registra el drift observado en la colección cost_staleness. Nunca modifica recetas ni ingredientes."
                  : "Every ingredient or recipe edit triggers a background walk of the dependency graph. Observed drift is written to cost_staleness. Never mutates recipes or ingredients."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={data?.shadow_enabled
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                  : "bg-slate-100 text-slate-600 border-slate-300"}
                data-testid="shadow-flag-badge"
              >
                {data?.shadow_enabled
                  ? (isEs ? "Shadow activo" : "Shadow enabled")
                  : (isEs ? "Shadow inactivo" : "Shadow disabled")}
              </Badge>
              <Button variant="outline" onClick={fetchDashboard} disabled={loading}
                      data-testid="shadow-refresh-btn">
                {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCw className="w-4 h-4"/>}
              </Button>
              <Button variant="outline" onClick={clearAll} data-testid="shadow-clear-btn"
                      className="text-rose-700 border-rose-300 hover:bg-rose-50">
                <Trash2 className="w-4 h-4 mr-2"/>{isEs ? "Reset" : "Reset"}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatTile
          label={isEs ? "Observaciones" : "Observations"}
          value={t.observations}
          testId="shadow-tile-obs"
        />
        <StatTile
          label={isEs ? "Stale ahora" : "Stale now"}
          value={t.stale_entries}
          tone={t.stale_entries > 0 ? "warning" : "success"}
          testId="shadow-tile-stale"
        />
        <StatTile
          label={isEs ? "Recetas" : "Recipes"}
          value={byType.recipe?.total || 0}
          testId="shadow-tile-recipes"
        />
        <StatTile
          label={isEs ? "Menús impactados" : "Menus impacted"}
          value={(byType.menu?.total || 0) + (byType.plated_menu?.total || 0)}
          testId="shadow-tile-menus"
        />
        <StatTile
          label={isEs ? "Cotizaciones" : "Proposals"}
          value={byType.proposal?.total || 0}
          testId="shadow-tile-proposals"
        />
      </div>

      {/* Simulate */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-600"/>
            {isEs ? "Disparar un walk manual" : "Trigger a manual walk"}
          </CardTitle>
          <CardDescription>
            {isEs
              ? "Útil para validar que el grafo cubra los caminos esperados. No modifica datos."
              : "Useful to validate graph coverage. Does not modify data."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-slate-500 block mb-1">company_id</label>
            <Input
              placeholder="company_..."
              value={simForm.company_id}
              onChange={(e) => setSimForm(f => ({ ...f, company_id: e.target.value.trim() }))}
              data-testid="shadow-sim-company"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">root_type</label>
            <Select
              value={simForm.root_type}
              onValueChange={(v) => setSimForm(f => ({ ...f, root_type: v }))}
            >
              <SelectTrigger data-testid="shadow-sim-type"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="recipe">recipe</SelectItem>
                <SelectItem value="ingredient">ingredient</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">root_id</label>
            <Input
              placeholder={simForm.root_type === "ingredient" ? "ing_..." : "recipe_..."}
              value={simForm.root_id}
              onChange={(e) => setSimForm(f => ({ ...f, root_id: e.target.value.trim() }))}
              data-testid="shadow-sim-rootid"
            />
          </div>
          <Button
            onClick={simulate} disabled={simulating}
            data-testid="shadow-sim-btn"
            className="bg-slate-900 hover:bg-slate-800 text-white"
          >
            {simulating
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/>{isEs ? "Ejecutando…" : "Running…"}</>
              : <><PlayCircle className="w-4 h-4 mr-2"/>{isEs ? "Ejecutar walk" : "Run walk"}</>}
          </Button>
        </CardContent>
      </Card>

      {/* Top drift table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isEs ? "Top recetas con drift observado" : "Top recipes with observed drift"}
          </CardTitle>
          <CardDescription>
            {isEs
              ? "Recomputo profundo vs. valor almacenado. Tolerancia $0.01."
              : "Deep recompute vs stored value. Tolerance $0.01."}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Empresa" : "Company"}</TableHead>
                <TableHead>{isEs ? "Receta" : "Recipe"}</TableHead>
                <TableHead className="text-right">{isEs ? "Almacenado" : "Stored"}</TableHead>
                <TableHead className="text-right">{isEs ? "Sombra" : "Shadow"}</TableHead>
                <TableHead className="text-right">Δ USD</TableHead>
                <TableHead className="text-right">Δ %</TableHead>
                <TableHead>{isEs ? "Último trigger" : "Last trigger"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data?.top_drift?.length) && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500"/>
                      {isEs
                        ? "Aún no hay drift observado. El shadow mode escucha en background."
                        : "No drift observed yet. Shadow mode is listening in background."}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {data?.top_drift?.map((r) => (
                <TableRow key={`${r.company_id}:${r.entity_id}`}
                          data-testid={`shadow-drift-row-${r.entity_id}`}>
                  <TableCell className="text-sm text-slate-600">{r.company_name}</TableCell>
                  <TableCell className="font-medium">{r.recipe_name}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtMoney(r.stored_value)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtMoney(r.shadow_recomputed_value)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold text-amber-700">
                    {fmtMoney(r.drift_abs)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold text-amber-700">
                    {(r.drift_pct ?? 0).toFixed(2)}%
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <GitBranch className="w-3 h-3"/>
                      {r.last_trigger?.kind || "?"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent runs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isEs ? "Runs recientes" : "Recent runs"}
          </CardTitle>
          <CardDescription>
            {isEs
              ? "Últimos walks disparados por hooks o simulaciones manuales."
              : "Most recent walks triggered by hooks or manual simulations."}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Cuándo" : "When"}</TableHead>
                <TableHead>{isEs ? "Trigger" : "Trigger"}</TableHead>
                <TableHead>{isEs ? "Empresa" : "Company"}</TableHead>
                <TableHead>{isEs ? "Root" : "Root"}</TableHead>
                <TableHead className="text-right">{isEs ? "Recetas" : "Recipes"}</TableHead>
                <TableHead className="text-right">{isEs ? "Con drift" : "Drift"}</TableHead>
                <TableHead className="text-right">ms</TableHead>
                <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data?.recent_runs?.length) && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-slate-500 text-sm">
                    {isEs ? "Sin runs aún" : "No runs yet"}
                  </TableCell>
                </TableRow>
              )}
              {data?.recent_runs?.map((r) => (
                <TableRow key={r.run_id} data-testid={`shadow-run-${r.run_id}`}>
                  <TableCell className="text-xs text-slate-500">
                    {r.started_at?.slice(11, 19)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {r.trigger?.kind || "?"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{r.company_id?.slice(-8)}</TableCell>
                  <TableCell className="text-xs font-mono">
                    {r.root_type}:{r.root_id?.slice(-8)}
                  </TableCell>
                  <TableCell className="text-right">{r.affected_counts?.recipe || 0}</TableCell>
                  <TableCell className={`text-right ${
                    (r.recipes_with_drift || 0) > 0 ? "text-amber-700 font-semibold" : "text-slate-400"
                  }`}>
                    {r.recipes_with_drift || 0}
                  </TableCell>
                  <TableCell className="text-right text-xs">{r.duration_ms}</TableCell>
                  <TableCell>
                    {r.status === "completed"
                      ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">OK</Badge>
                      : <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-300">{r.status}</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Fase 2 reminder */}
      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="p-4 text-xs text-slate-600 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500"/>
          <div>
            <span className="font-semibold text-slate-700">
              {isEs ? "Fase 2 — Modo sombra" : "Phase 2 — Shadow mode"}
            </span>{" "}
            {isEs
              ? "Este panel no modifica recetas ni ingredientes. Todas las observaciones viven en la colección cost_staleness (reset con un click)."
              : "This panel does not modify recipes or ingredients. All observations live in the cost_staleness collection (reset in one click)."}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
