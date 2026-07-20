/**
 * PriceOutliersPanel — PRIORIDAD 1 · Paso 1.2
 *
 * Panel de revisión manual de precios sospechosos. Super-admin only.
 * Lista ingredientes cuyo cost/kg está fuera de rango vs mediana de su
 * categoría. Cada fila: nombre, categoría, precio actual, mediana, y 3
 * acciones: FIX (corregir precio), IGNORE (marcar como revisado), OPEN
 * INGREDIENT (link al form). Nada se modifica sin acción manual explícita.
 */
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  Loader2, RefreshCw, ShieldAlert, Check, X, DollarSign, ArrowUpDown,
  History, RotateCcw, Download,
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const fmtUsd = (n, digits = 2) =>
  (typeof n === "number" ? n : 0).toLocaleString("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export default function PriceOutliersPanel() {
  const { language } = useLanguage();
  const { token } = useAuth();
  const isEs = language === "es";
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState("all");
  const [factor, setFactor] = useState(3);
  const [fixDrafts, setFixDrafts] = useState({});   // { ingredient_id: newPurchaseCost }
  const [saving, setSaving] = useState({});         // { ingredient_id: true }

  const fetchOutliers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ outlier_factor: String(factor) });
      if (selectedCompany && selectedCompany !== "all") {
        params.append("company_id", selectedCompany);
      }
      const { data } = await axios.get(
        `${API}/api/cost-audit/prices/outliers?${params.toString()}`, authHeaders,
      );
      setData(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load outliers");
    } finally { setLoading(false); }
  }, [token, factor, selectedCompany]);

  const fetchCompanies = useCallback(async () => {
    try {
      // Use a lightweight source: the outliers response contains company_ids,
      // but we also want a friendly name. Query platform admin endpoint.
      const { data } = await axios.get(`${API}/api/admin/companies`, authHeaders);
      setCompanies(data || []);
    } catch (e) {
      // Fallback: derive from outlier rows
      setCompanies([]);
    }
  }, [token]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);
  useEffect(() => { fetchOutliers(); }, [fetchOutliers]);

  const applyFix = async (o) => {
    const draft = fixDrafts[o.ingredient_id];
    if (draft === undefined || draft === "") {
      toast.error(isEs ? "Escribe el nuevo precio total" : "Enter the new total price");
      return;
    }
    setSaving((s) => ({ ...s, [o.ingredient_id]: true }));
    try {
      await axios.post(
        `${API}/api/cost-audit/prices/outliers/${o.ingredient_id}/fix`,
        { new_purchase_cost: Number(draft) }, authHeaders,
      );
      toast.success(isEs ? `${o.name} — precio corregido` : `${o.name} — price fixed`);
      setFixDrafts((d) => { const n = { ...d }; delete n[o.ingredient_id]; return n; });
      await fetchOutliers();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Fix failed");
    } finally { setSaving((s) => ({ ...s, [o.ingredient_id]: false })); }
  };

  const ignoreOne = async (o) => {
    setSaving((s) => ({ ...s, [o.ingredient_id]: true }));
    try {
      await axios.post(
        `${API}/api/cost-audit/prices/outliers/${o.ingredient_id}/ignore`,
        { note: "confirmed correct by super-admin" }, authHeaders,
      );
      toast.info(isEs ? `${o.name} — marcado como revisado` : `${o.name} — marked reviewed`);
      await fetchOutliers();
    } catch (e) {
      toast.error("Ignore failed");
    } finally { setSaving((s) => ({ ...s, [o.ingredient_id]: false })); }
  };

  const outliers = data?.outliers || [];

  return (
    <div className="space-y-5" data-testid="price-outliers-panel">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-slate-700"/>
                {isEs ? "Precios sospechosos por categoría" : "Suspicious prices by category"}
              </CardTitle>
              <CardDescription className="mt-1">
                {isEs
                  ? "Ingredientes con $/kg fuera de rango vs la mediana de su categoría. Solo revisión manual: nada se corrige sin tu acción."
                  : "Ingredients whose $/kg is outside their category's median range. Manual review only — nothing changes without your action."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                <SelectTrigger className="w-64" data-testid="outliers-company-select">
                  <SelectValue placeholder={isEs ? "Todas las empresas" : "All companies"}/>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isEs ? "Todas las empresas" : "All companies"}</SelectItem>
                  {companies.map(c => (
                    <SelectItem key={c.company_id} value={c.company_id}>
                      {c.name || c.company_id}
                    </SelectItem>
                  ))}
                  {/* Direct-add Ciano/Kora OS Test tenant */}
                  <SelectItem value="company_98d8b4725822">Kora OS Test (Ciano Gourmet)</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-500">×</span>
                <Input
                  type="number" step="0.5" min="1.5" max="100"
                  value={factor}
                  onChange={(e) => setFactor(Number(e.target.value) || 3)}
                  className="w-16 h-9"
                  data-testid="outliers-factor"
                />
              </div>
              <Button variant="outline" onClick={fetchOutliers} disabled={loading}
                      data-testid="outliers-refresh">
                {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCw className="w-4 h-4"/>}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label={isEs ? "Escaneados" : "Scanned"}
                      value={data?.total_ingredients_scanned || 0}
                      testId="outliers-tile-scanned"/>
            <StatTile label={isEs ? "Sospechosos" : "Outliers"}
                      value={data?.outliers_count || 0}
                      tone={(data?.outliers_count || 0) > 0 ? "warning" : "success"}
                      testId="outliers-tile-count"/>
            <StatTile label={isEs ? "Umbral factor" : "Threshold factor"}
                      value={`×${factor}`}
                      testId="outliers-tile-factor"/>
            <StatTile label={isEs ? "Categorías" : "Categories"}
                      value={data?.category_summary?.length || 0}
                      testId="outliers-tile-cats"/>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Ingrediente" : "Ingredient"}</TableHead>
                <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
                <TableHead className="text-right">{isEs ? "Precio actual" : "Current price"}</TableHead>
                <TableHead className="text-right">$/kg</TableHead>
                <TableHead className="text-right">{isEs ? "Mediana cat." : "Cat. median"}</TableHead>
                <TableHead className="text-right">ratio</TableHead>
                <TableHead>{isEs ? "Nuevo precio total" : "New total price"}</TableHead>
                <TableHead className="text-right">{isEs ? "Acciones" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outliers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-slate-500">
                    {loading
                      ? <Loader2 className="w-5 h-5 animate-spin mx-auto"/>
                      : (data?.outliers_count === 0
                          ? (isEs ? "✅ Sin sospechosos con el umbral actual" : "✅ No outliers at current threshold")
                          : (isEs ? "Sin resultados" : "No results"))}
                  </TableCell>
                </TableRow>
              )}
              {outliers.map((o) => {
                const busy = saving[o.ingredient_id];
                const draft = fixDrafts[o.ingredient_id] ?? "";
                const priceDisplay = o.purchase_cost && o.purchase_quantity_per_unit
                  ? `${fmtUsd(o.purchase_cost)} / ${o.purchase_quantity_per_unit} ${o.base_unit}`
                  : `${fmtUsd(o.cost_per_base_unit, 4)} / ${o.base_unit}`;
                const ratioTone = o.direction === "high" ? "text-rose-700" : "text-blue-700";
                return (
                  <TableRow key={o.ingredient_id}
                            data-testid={`outlier-row-${o.ingredient_id}`}
                            className={o.direction === "high" ? "bg-amber-50/30" : ""}>
                    <TableCell>
                      <div className="font-medium">{o.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{o.ingredient_id}</div>
                    </TableCell>
                    <TableCell className="text-sm">{o.category}</TableCell>
                    <TableCell className="text-right text-sm">{priceDisplay}</TableCell>
                    <TableCell className={`text-right font-mono text-sm ${ratioTone}`}>
                      {fmtUsd(o.cost_per_kg, 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-slate-500">
                      {fmtUsd(o.category_median_per_kg, 0)}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm font-semibold ${ratioTone}`}>
                      {o.ratio_vs_median}×
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" step="0.01" min="0"
                        placeholder={o.purchase_cost ? String(o.purchase_cost) : "…"}
                        value={draft}
                        disabled={busy}
                        onChange={(e) => setFixDrafts((d) => ({
                          ...d, [o.ingredient_id]: e.target.value,
                        }))}
                        className="w-28 h-8"
                        data-testid={`outlier-fix-input-${o.ingredient_id}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm" variant="default"
                          className="h-8 bg-emerald-600 hover:bg-emerald-700"
                          disabled={busy || draft === ""}
                          onClick={() => applyFix(o)}
                          data-testid={`outlier-fix-btn-${o.ingredient_id}`}
                        >
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Check className="w-3.5 h-3.5"/>}
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className="h-8 text-slate-600"
                          disabled={busy}
                          onClick={() => ignoreOne(o)}
                          data-testid={`outlier-ignore-btn-${o.ingredient_id}`}
                        >
                          <X className="w-3.5 h-3.5"/>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="p-4 text-xs text-slate-600 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 mt-0.5 text-amber-500"/>
          <div>
            {isEs
              ? "Cada corrección aplica el nuevo precio + recomputa recetas afectadas + guarda audit trail en cost_audit / ingredient_price_reviews. Ignore marca como revisado sin cambiar el precio (útil si el precio actual es correcto para un ingrediente raro)."
              : "Each fix updates the price + recomputes affected recipes + writes an audit trail. Ignore marks the row as reviewed without changing the price."}
          </div>
        </CardContent>
      </Card>

      <BulkFixHistoryTable authHeaders={authHeaders} isEs={isEs} />
    </div>
  );
}

function BulkFixHistoryTable({ authHeaders, isEs }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reverting, setReverting] = useState({});

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(
        `${API}/api/cost-audit/prices/history?action=bulk_fixed`, authHeaders,
      );
      setRows(data.rows || []);
    } catch (e) {
      toast.error("Failed to load history");
    } finally { setLoading(false); }
  }, [authHeaders]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const revert = async (id, name) => {
    if (!window.confirm(isEs
      ? `¿Revertir el precio de ${name} al valor anterior?`
      : `Revert ${name} to previous price?`)) return;
    setReverting((r) => ({ ...r, [id]: true }));
    try {
      await axios.post(
        `${API}/api/cost-audit/prices/history/${id}/revert`, {}, authHeaders,
      );
      toast.success(isEs ? `${name} — revertido` : `${name} — reverted`);
      await fetchHistory();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Revert failed");
    } finally { setReverting((r) => ({ ...r, [id]: false })); }
  };

  const downloadCsv = async () => {
    try {
      const res = await axios.get(
        `${API}/api/cost-audit/prices/history/export.csv?action=bulk_fixed`,
        { ...authHeaders, responseType: "blob" },
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url; a.download = "price_history.csv";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error("CSV download failed"); }
  };

  return (
    <Card data-testid="bulk-fix-history">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4"/>
              {isEs ? "Cambios recientes (bulk fix)" : "Recent bulk fix changes"}
            </CardTitle>
            <CardDescription>
              {isEs
                ? "Ingredientes normalizados automáticamente. Puedes revertir cualquiera individualmente."
                : "Ingredients auto-normalized. You can revert each individually."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchHistory} disabled={loading}
                    data-testid="history-refresh">
              {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCw className="w-4 h-4"/>}
            </Button>
            <Button variant="outline" size="sm" onClick={downloadCsv} data-testid="history-csv">
              <Download className="w-4 h-4 mr-2"/>CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isEs ? "#" : "#"}</TableHead>
              <TableHead>{isEs ? "Ingrediente" : "Ingredient"}</TableHead>
              <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
              <TableHead className="text-right">{isEs ? "Antes /base" : "Prev /base"}</TableHead>
              <TableHead className="text-right">{isEs ? "Nuevo /base" : "New /base"}</TableHead>
              <TableHead className="text-right">{isEs ? "Reducción" : "Reduction"}</TableHead>
              <TableHead>{isEs ? "Nota" : "Note"}</TableHead>
              <TableHead className="text-right">{isEs ? "Revert" : "Revert"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-slate-500 text-sm">
                  {loading
                    ? <Loader2 className="w-5 h-5 animate-spin mx-auto"/>
                    : (isEs ? "Sin cambios registrados" : "No changes yet")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, idx) => {
              const busy = reverting[r.ingredient_id];
              const factor = r.reduction_factor;
              return (
                <TableRow key={r.ingredient_id} data-testid={`history-row-${r.ingredient_id}`}>
                  <TableCell className="text-xs text-slate-500">{idx + 1}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-sm">{r.category || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-slate-400 line-through">
                    ${(r.prev_cost_per_unit || 0).toFixed(4)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">
                    ${(r.new_cost_per_unit || 0).toFixed(4)}
                  </TableCell>
                  <TableCell className={`text-right font-mono text-sm ${
                    factor > 2 ? "text-emerald-700 font-semibold" :
                    factor < 1 ? "text-amber-700" : "text-slate-500"
                  }`}>
                    {factor ? `${factor}×` : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">{r.note}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm" variant="outline"
                      disabled={busy}
                      onClick={() => revert(r.ingredient_id, r.name)}
                      data-testid={`revert-btn-${r.ingredient_id}`}
                      className="h-8 text-rose-700 border-rose-300 hover:bg-rose-50"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : (
                        <><RotateCcw className="w-3.5 h-3.5 mr-1"/>Revert</>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value, tone = "default", testId }) {
  const tones = {
    default: "bg-white border-slate-200",
    warning: "bg-amber-50 border-amber-200",
    success: "bg-emerald-50 border-emerald-200",
  };
  return (
    <div className={`rounded-lg border ${tones[tone]} px-4 py-3`} data-testid={testId}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
    </div>
  );
}
