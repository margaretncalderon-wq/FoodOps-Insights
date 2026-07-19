/**
 * CostAuditSection — FASE 1 UI
 *
 * Panel de auditoría de costos (solo lectura) accesible solo a super admins.
 * Dispara un audit multi-tenant en background y muestra el reporte + descarga CSV.
 *
 * No escribe nada en las recetas. Es literalmente un "diff viewer" entre lo
 * almacenado y el recálculo en cascada.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  ShieldAlert, RefreshCw, Download, AlertTriangle, CheckCircle2,
  Play, ChevronRight, DollarSign, FileWarning, Loader2, Activity,
} from "lucide-react";
import CostShadowPanel from "./CostShadowPanel";

const API = process.env.REACT_APP_BACKEND_URL;

// ---------- helpers ----------
const fmtMoney = (n) =>
  (typeof n === "number" ? n : 0).toLocaleString("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2,
  });
const fmtPct = (n) => `${(typeof n === "number" ? n : 0).toFixed(2)}%`;

function SummaryCard({ label, value, icon: Icon, tone = "default", testId }) {
  const toneStyles = {
    default: "bg-white border-slate-200",
    warning: "bg-amber-50 border-amber-200",
    danger:  "bg-rose-50 border-rose-200",
    success: "bg-emerald-50 border-emerald-200",
  };
  const iconTone = {
    default: "text-slate-500",
    warning: "text-amber-600",
    danger:  "text-rose-600",
    success: "text-emerald-600",
  };
  return (
    <div className={`rounded-lg border ${toneStyles[tone]} px-4 py-3`} data-testid={testId}>
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        {Icon && <Icon className={`w-3.5 h-3.5 ${iconTone[tone]}`} />}
        {label}
      </div>
      <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
    </div>
  );
}

// ---------- main ----------
export default function CostAuditSection() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const isEs = language === "es";
  const isSuper = !!user?.is_super_admin;

  if (!isSuper) {
    return (
      <Card className="border-amber-200 bg-amber-50" data-testid="cost-audit-forbidden">
        <CardContent className="p-8 flex items-center gap-3 text-amber-800">
          <ShieldAlert className="w-5 h-5" />
          <p>{isEs
            ? "Auditoría de Costos disponible solo para super administradores de plataforma."
            : "Cost Audit is available for platform super admins only."}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="audit" className="space-y-4" data-testid="cost-intelligence-tabs">
      <TabsList>
        <TabsTrigger value="audit" data-testid="cost-tab-audit">
          <ShieldAlert className="w-4 h-4 mr-2"/>
          {isEs ? "Auditoría · Fase 1" : "Audit · Phase 1"}
        </TabsTrigger>
        <TabsTrigger value="shadow" data-testid="cost-tab-shadow">
          <Activity className="w-4 h-4 mr-2"/>
          {isEs ? "Shadow Mode · Fase 2" : "Shadow Mode · Phase 2"}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="audit"><CostAuditReport /></TabsContent>
      <TabsContent value="shadow"><CostShadowPanel /></TabsContent>
    </Tabs>
  );
}

function CostAuditReport() {
  const { language } = useLanguage();
  const { token } = useAuth();
  const isEs = language === "es";

  const [latest, setLatest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, offset: 0, limit: 100 });
  const [onlyDrift, setOnlyDrift] = useState(false);
  const [nameFilter, setNameFilter] = useState("");
  const pollRef = useRef(null);

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchLatest = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/cost-audit/latest`, authHeaders);
      setLatest(data);
      if (data?.audit_id && data.status === "completed") {
        const rowsRes = await axios.get(
          `${API}/api/cost-audit/${data.audit_id}?limit=500&only_drift=${onlyDrift}`,
          authHeaders,
        );
        setRows(rowsRes.data.rows || []);
        setPagination(rowsRes.data.pagination || { total: 0 });
      }
    } catch (e) {
      // silent — panel handles empty state
    }
  }, [token, onlyDrift]);

  useEffect(() => { fetchLatest(); }, [fetchLatest]);

  // Poll while a run is in progress
  useEffect(() => {
    if (latest?.status === "running") {
      pollRef.current = setInterval(fetchLatest, 3000);
      return () => clearInterval(pollRef.current);
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [latest?.status, fetchLatest]);

  const startAudit = async () => {
    setStarting(true);
    try {
      const { data } = await axios.post(`${API}/api/cost-audit/run`, {}, authHeaders);
      toast.success(isEs
        ? `Auditoría iniciada (${data.audit_id.slice(0, 8)}…)`
        : `Audit started (${data.audit_id.slice(0, 8)}…)`);
      await fetchLatest();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to start audit");
    } finally { setStarting(false); }
  };

  const downloadCsv = async () => {
    if (!latest?.audit_id) return;
    setLoading(true);
    try {
      const res = await axios.get(
        `${API}/api/cost-audit/${latest.audit_id}/report.csv?only_drift=${onlyDrift}`,
        { ...authHeaders, responseType: "blob" },
      );
      const blob = new Blob([res.data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cost_audit_${latest.audit_id.slice(0, 8)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Failed to download CSV");
    } finally { setLoading(false); }
  };

  // ---------- guard: no-op (parent renders auth-gate) ----------
  const summary = latest?.summary || {};
  const status = latest?.status || "none";
  const isRunning = status === "running";

  const filteredRows = rows.filter(r =>
    !nameFilter ||
    (r.recipe_name || "").toLowerCase().includes(nameFilter.toLowerCase()) ||
    (r.company_name || "").toLowerCase().includes(nameFilter.toLowerCase()),
  );

  return (
    <div className="space-y-6" data-testid="cost-audit-section">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-slate-700" />
                {isEs ? "Auditoría de Costos — Fase 1 (solo lectura)" : "Cost Audit — Phase 1 (read-only)"}
              </CardTitle>
              <CardDescription className="mt-1">
                {isEs
                  ? "Compara el costo almacenado de cada receta contra un recálculo en cascada. No modifica datos."
                  : "Compares each recipe's stored cost against a full cascade recomputation. Never writes."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={startAudit}
                disabled={starting || isRunning}
                data-testid="cost-audit-run-btn"
                className="bg-slate-900 hover:bg-slate-800 text-white"
              >
                {isRunning
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/>{isEs ? "Auditando…" : "Auditing…"}</>
                  : starting
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/>{isEs ? "Iniciando…" : "Starting…"}</>
                    : <><Play className="w-4 h-4 mr-2"/>{isEs ? "Ejecutar auditoría" : "Run audit"}</>}
              </Button>
              <Button
                variant="outline"
                onClick={fetchLatest}
                disabled={loading}
                data-testid="cost-audit-refresh-btn"
              >
                <RefreshCw className="w-4 h-4"/>
              </Button>
              <Button
                variant="outline"
                onClick={downloadCsv}
                disabled={!latest?.audit_id || status !== "completed"}
                data-testid="cost-audit-csv-btn"
              >
                <Download className="w-4 h-4 mr-2"/>CSV
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Alert if percent affected > 20% */}
      {summary.alert_over_20_pct && (
        <Card className="border-rose-300 bg-rose-50">
          <CardContent className="p-4 flex items-start gap-3 text-rose-800">
            <AlertTriangle className="w-5 h-5 mt-0.5"/>
            <div>
              <div className="font-semibold">
                {isEs
                  ? `Más del 20% de las recetas tienen descuadre (${fmtPct(summary.percent_affected)})`
                  : `More than 20% of recipes are drifting (${fmtPct(summary.percent_affected)})`}
              </div>
              <div className="text-sm mt-1 opacity-90">
                {isEs
                  ? "No avancemos a Fase 2 sin revisar contigo. Descarga el CSV y revisa los patrones."
                  : "Do not advance to Phase 2 without review. Download the CSV and inspect the pattern."}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary tiles */}
      {status === "completed" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            label={isEs ? "Recetas escaneadas" : "Recipes scanned"}
            value={summary.recipes_scanned ?? 0}
            icon={CheckCircle2} tone="default"
            testId="cost-audit-total"
          />
          <SummaryCard
            label={isEs ? "Con descuadre directo" : "Direct drift"}
            value={summary.recipes_with_direct_drift ?? 0}
            icon={AlertTriangle}
            tone={(summary.recipes_with_direct_drift ?? 0) > 0 ? "danger" : "success"}
            testId="cost-audit-direct"
          />
          <SummaryCard
            label={isEs ? "Con descuadre por cascada" : "Cascade drift"}
            value={summary.recipes_with_cascade_drift ?? 0}
            icon={AlertTriangle}
            tone={(summary.recipes_with_cascade_drift ?? 0) > 0 ? "warning" : "success"}
            testId="cost-audit-cascade"
          />
          <SummaryCard
            label={isEs ? "USD desalineado" : "USD misaligned"}
            value={fmtMoney(summary.drift_sum_abs_usd ?? 0)}
            icon={DollarSign}
            tone={(summary.drift_sum_abs_usd ?? 0) > 0 ? "warning" : "default"}
            testId="cost-audit-sum"
          />
          <SummaryCard
            label={isEs ? "Ingredientes huérfanos" : "Orphan ingredients"}
            value={summary.orphan_ingredients_count ?? 0}
            icon={FileWarning}
            tone={(summary.orphan_ingredients_count ?? 0) > 0 ? "warning" : "success"}
            testId="cost-audit-orphan-ing"
          />
          <SummaryCard
            label={isEs ? "Sub-recetas huérfanas" : "Orphan sub-recipes"}
            value={summary.orphan_sub_recipes_count ?? 0}
            icon={FileWarning}
            tone={(summary.orphan_sub_recipes_count ?? 0) > 0 ? "warning" : "success"}
            testId="cost-audit-orphan-sub"
          />
          <SummaryCard
            label={isEs ? "Ciclos detectados" : "Cycles detected"}
            value={summary.cycles_detected ?? 0}
            icon={AlertTriangle}
            tone={(summary.cycles_detected ?? 0) > 0 ? "danger" : "success"}
            testId="cost-audit-cycles"
          />
          <SummaryCard
            label={isEs ? "% afectadas" : "% affected"}
            value={fmtPct(summary.percent_affected ?? 0)}
            icon={AlertTriangle}
            tone={summary.alert_over_20_pct ? "danger" : "default"}
            testId="cost-audit-pct"
          />
        </div>
      )}

      {isRunning && (
        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="p-6 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500"/>
            <div>
              <div className="font-medium">{isEs ? "Auditoría en curso…" : "Audit running…"}</div>
              <div className="text-sm text-slate-500">
                {isEs
                  ? "Actualizamos automáticamente cuando termine."
                  : "We refresh automatically when it finishes."}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {status === "none" && !isRunning && (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center text-slate-500">
            <ShieldAlert className="w-8 h-8 mx-auto mb-3 opacity-60"/>
            <div className="font-medium text-slate-700">
              {isEs ? "Aún no se ha ejecutado ninguna auditoría" : "No audit has been run yet"}
            </div>
            <div className="text-sm mt-1">
              {isEs
                ? "Pulsa \"Ejecutar auditoría\" para escanear todas las empresas y recetas."
                : "Click \"Run audit\" to scan every company and recipe."}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rows table */}
      {status === "completed" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-base">
                  {isEs ? "Recetas ordenadas por mayor descuadre" : "Recipes sorted by drift magnitude"}
                </CardTitle>
                <CardDescription>
                  {isEs
                    ? `Mostrando ${filteredRows.length} de ${pagination.total} recetas · tolerancia $${summary.tolerance_usd ?? 0.01}`
                    : `Showing ${filteredRows.length} of ${pagination.total} recipes · tolerance $${summary.tolerance_usd ?? 0.01}`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  placeholder={isEs ? "Buscar receta / empresa…" : "Search recipe / company…"}
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  className="w-56"
                  data-testid="cost-audit-search"
                />
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <Checkbox
                    checked={onlyDrift}
                    onCheckedChange={(v) => setOnlyDrift(!!v)}
                    data-testid="cost-audit-only-drift"
                  />
                  {isEs ? "Solo con descuadre" : "Only drifting"}
                </label>
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Empresa" : "Company"}</TableHead>
                  <TableHead>{isEs ? "Receta" : "Recipe"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Almacenado" : "Stored"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Recalc. 1-nivel" : "Recalc. 1-level"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Recalc. profundo" : "Deep recalc."}</TableHead>
                  <TableHead className="text-right">{isEs ? "Δ directo" : "Direct Δ"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Δ cascada" : "Cascade Δ"}</TableHead>
                  <TableHead>{isEs ? "Notas" : "Notes"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                      {isEs ? "Sin resultados para el filtro actual" : "No results for current filter"}
                    </TableCell>
                  </TableRow>
                )}
                {filteredRows.map((r) => {
                  const hasDrift = r.has_direct_drift || r.has_cascade_drift;
                  const hasIssue = (r.orphan_ingredients?.length || 0) > 0
                    || (r.orphan_sub_recipes?.length || 0) > 0
                    || r.cycle_detected
                    || r.max_depth_exceeded;
                  return (
                    <TableRow
                      key={`${r.company_id}:${r.recipe_id}`}
                      className={hasDrift ? "bg-amber-50/40" : ""}
                      data-testid={`cost-audit-row-${r.recipe_id}`}
                    >
                      <TableCell className="text-sm text-slate-600">{r.company_name}</TableCell>
                      <TableCell className="font-medium">{r.recipe_name}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtMoney(r.stored_total)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtMoney(r.recalc_one_level)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtMoney(r.recalc_deep)}</TableCell>
                      <TableCell className={`text-right font-mono text-sm ${
                        r.has_direct_drift ? "text-rose-700 font-semibold" : "text-slate-400"
                      }`}>
                        {r.has_direct_drift ? `${fmtMoney(r.direct_drift_abs)} (${fmtPct(r.direct_drift_pct)})` : "—"}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm ${
                        r.has_cascade_drift ? "text-amber-700 font-semibold" : "text-slate-400"
                      }`}>
                        {r.has_cascade_drift ? `${fmtMoney(r.cascade_drift_abs)} (${fmtPct(r.cascade_drift_pct)})` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.orphan_ingredients?.length > 0 && (
                            <Badge variant="outline" className="border-amber-300 text-amber-800 bg-amber-50">
                              {r.orphan_ingredients.length} {isEs ? "ing. huérf." : "orphan ing."}
                            </Badge>
                          )}
                          {r.orphan_sub_recipes?.length > 0 && (
                            <Badge variant="outline" className="border-amber-300 text-amber-800 bg-amber-50">
                              {r.orphan_sub_recipes.length} {isEs ? "sub huérf." : "orphan sub"}
                            </Badge>
                          )}
                          {r.cycle_detected && (
                            <Badge variant="outline" className="border-rose-300 text-rose-800 bg-rose-50">
                              {isEs ? "Ciclo" : "Cycle"}
                            </Badge>
                          )}
                          {r.max_depth_exceeded && (
                            <Badge variant="outline" className="border-rose-300 text-rose-800 bg-rose-50">
                              {isEs ? "Profundidad" : "Depth"}
                            </Badge>
                          )}
                          {!hasIssue && !hasDrift && (
                            <span className="text-slate-400 text-xs inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3"/>OK
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Fase 1 reminder */}
      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="p-4 text-xs text-slate-600 flex items-start gap-2">
          <ChevronRight className="w-4 h-4 mt-0.5"/>
          <div>
            <span className="font-semibold text-slate-700">
              {isEs ? "Fase 1 — Solo lectura" : "Phase 1 — Read-only"}
            </span>{" "}
            {isEs
              ? "Este panel no modifica ninguna receta ni ingrediente. Cuando confirmes los resultados, avanzamos a Fase 2 (modo sombra en background)."
              : "This panel does not modify any recipe or ingredient. Once you sign off, we move to Phase 2 (background shadow mode)."}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
