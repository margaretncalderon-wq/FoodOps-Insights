// components/people-ops/MonthEndClosingSection.js
// Personnel month-end closing — replicates the user's "Cierre de Mes" Google Sheet.
// Three panels: Incentivos (per-person %), Extras (auto OT from month), Totales.

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  Calendar, Plus, Trash2, Lock, Unlock, RefreshCw, CheckCircle, AlertTriangle,
  TrendingUp, Users, Clock, FileSpreadsheet, ChevronRight
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const formatCurrency = (n) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", minimumFractionDigits: 2 }).format(n || 0);

export function MonthEndClosingSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const months = isEs ? MONTHS_ES : MONTHS_EN;
  
  const [allowed, setAllowed] = useState(null);  // null = loading
  const [closings, setClosings] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Active detail dialog
  const [activeClosing, setActiveClosing] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  
  // New closing dialog
  const [createOpen, setCreateOpen] = useState(false);
  const today = new Date();
  const [newClosing, setNewClosing] = useState({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    revenue_total: 0,
    incentive_pool_pct: 19,
  });
  
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, listRes, empRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/month-end/access/can-view`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/month-end`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/people-ops/employees`, { withCredentials: true }).catch(() => ({ data: [] })),
      ]);
      setAllowed(!!accRes.data?.allowed);
      setClosings(listRes.data || []);
      setEmployees((empRes.data || []).filter(e => e.status === "active"));
    } catch (err) {
      setAllowed(false);
    }
    setLoading(false);
  }, []);
  
  useEffect(() => { fetchAll(); }, [fetchAll]);
  
  const openDetail = async (closing) => {
    setDetailLoading(true);
    try {
      const res = await axios.get(`${API}/api/people-ops/month-end/${closing.closing_id}`, { withCredentials: true });
      setActiveClosing(res.data);
    } catch (err) {
      alert(err.response?.data?.detail || "Error fetching closing");
    }
    setDetailLoading(false);
  };
  
  const handleCreate = async () => {
    try {
      const res = await axios.post(
        `${API}/api/people-ops/month-end`,
        { ...newClosing, distribution: [] },
        { withCredentials: true }
      );
      setCreateOpen(false);
      await fetchAll();
      openDetail(res.data);
    } catch (err) {
      alert(err.response?.data?.detail || "Error creating closing");
    }
  };
  
  const handleDelete = async (closing_id) => {
    if (!window.confirm(isEs ? "¿Eliminar este cierre (borrador)?" : "Delete this draft closing?")) return;
    try {
      await axios.delete(`${API}/api/people-ops/month-end/${closing_id}`, { withCredentials: true });
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.detail || "Error deleting");
    }
  };
  
  // -------- Access guard --------
  if (allowed === null || loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 animate-spin text-violet-600" />
      </div>
    );
  }
  
  if (!allowed) {
    return (
      <Card data-testid="month-end-no-access">
        <CardContent className="py-12 text-center">
          <Lock className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium">{isEs ? "Acceso restringido" : "Restricted access"}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {isEs ? "Solo Admin, RRHH y Managers pueden ver el Cierre de Mes." : "Only Admin, HR and Managers can access Month-End Closing."}
          </p>
        </CardContent>
      </Card>
    );
  }
  
  // -------- Main listing --------
  return (
    <div className="space-y-6" data-testid="month-end-section">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-violet-600" />
            {isEs ? "Cierre de Mes — Personal" : "Personnel Month-End Closing"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isEs ? "Incentivos por % del pool + horas extras del mes + totales por persona." : "Incentives by % of pool + monthly overtime + per-person totals."}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="new-closing-btn">
          <Plus className="w-4 h-4 mr-2" />
          {isEs ? "Nuevo Cierre" : "New Closing"}
        </Button>
      </div>
      
      {closings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="font-medium">{isEs ? "Aún no hay cierres" : "No closings yet"}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {isEs ? "Crea el primer cierre del mes para comenzar." : "Create the first month-end closing to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Mes" : "Month"}</TableHead>
                  <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Ventas" : "Revenue"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Pool %" : "Pool %"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Pool $" : "Pool $"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Acciones" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closings.map(c => (
                  <TableRow key={c.closing_id} data-testid={`closing-row-${c.closing_id}`}>
                    <TableCell className="font-medium">{months[c.month - 1]} {c.year}</TableCell>
                    <TableCell>
                      {c.status === "closed" ? (
                        <Badge className="bg-emerald-100 text-emerald-700"><Lock className="w-3 h-3 mr-1" />{isEs ? "Cerrado" : "Closed"}</Badge>
                      ) : (
                        <Badge variant="outline"><Unlock className="w-3 h-3 mr-1" />{isEs ? "Borrador" : "Draft"}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(c.revenue_total)}</TableCell>
                    <TableCell className="text-right">{c.incentive_pool_pct}%</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency((c.revenue_total || 0) * (c.incentive_pool_pct || 0) / 100)}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => openDetail(c)} data-testid={`open-${c.closing_id}`}>
                        {isEs ? "Abrir" : "Open"}
                        <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                      {c.status === "draft" && (
                        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleDelete(c.closing_id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      
      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEs ? "Nuevo Cierre de Mes" : "New Month-End Closing"}</DialogTitle>
            <DialogDescription>
              {isEs ? "Selecciona el mes y configura las ventas + % del pool de incentivos." : "Select the month and set revenue + incentive pool %."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{isEs ? "Mes" : "Month"}</label>
                <Select value={String(newClosing.month)} onValueChange={(v) => setNewClosing({ ...newClosing, month: Number(v) })}>
                  <SelectTrigger data-testid="new-closing-month"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {months.map((m, idx) => (<SelectItem key={idx+1} value={String(idx+1)}>{m}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Año" : "Year"}</label>
                <Input
                  type="number"
                  data-testid="new-closing-year"
                  value={newClosing.year}
                  onChange={(e) => setNewClosing({ ...newClosing, year: Number(e.target.value) || today.getFullYear() })}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Ventas del Mes" : "Monthly Revenue"}</label>
              <Input
                type="number" step="0.01"
                data-testid="new-closing-revenue"
                value={newClosing.revenue_total}
                onChange={(e) => setNewClosing({ ...newClosing, revenue_total: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "% del Pool de Incentivos" : "Incentive Pool %"}</label>
              <Input
                type="number" step="0.01" min="0" max="100"
                data-testid="new-closing-pool-pct"
                value={newClosing.incentive_pool_pct}
                onChange={(e) => setNewClosing({ ...newClosing, incentive_pool_pct: parseFloat(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {isEs ? "Ej: 19% → " : "E.g.: 19% → "}
                {formatCurrency((newClosing.revenue_total || 0) * (newClosing.incentive_pool_pct || 0) / 100)}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleCreate} data-testid="create-closing-confirm">
              <Plus className="w-4 h-4 mr-2" />
              {isEs ? "Crear" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Detail Dialog */}
      {activeClosing && (
        <MonthEndDetail
          closing={activeClosing}
          employees={employees}
          isEs={isEs}
          loading={detailLoading}
          onClose={() => setActiveClosing(null)}
          onRefresh={async () => {
            await fetchAll();
            const res = await axios.get(`${API}/api/people-ops/month-end/${activeClosing.closing_id}`, { withCredentials: true });
            setActiveClosing(res.data);
          }}
        />
      )}
    </div>
  );
}


// ============================================================
//   MonthEndDetail — 3-panel view inside a wide dialog
// ============================================================
function MonthEndDetail({ closing, employees, isEs, loading, onClose, onRefresh }) {
  const isClosed = closing.status === "closed";
  const breakdown = closing.breakdown || {};
  
  const [revenue, setRevenue] = useState(closing.revenue_total || 0);
  const [poolPct, setPoolPct] = useState(closing.incentive_pool_pct || 0);
  const [distribution, setDistribution] = useState(closing.distribution || []);
  const [saving, setSaving] = useState(false);
  
  // Re-sync when closing changes
  useEffect(() => {
    setRevenue(closing.revenue_total || 0);
    setPoolPct(closing.incentive_pool_pct || 0);
    setDistribution(closing.distribution || []);
  }, [closing.closing_id, closing.updated_at]);
  
  const pool = (revenue || 0) * (poolPct || 0) / 100;
  const pctSum = distribution.reduce((s, d) => s + (parseFloat(d.pct) || 0), 0);
  const pctSumOK = Math.abs(pctSum - 100) < 0.01 || pctSum === 0;
  
  // ---- Live preview of grand totals (no need to Save first)
  // Server breakdown reflects last saved state; we overlay current edits to give instant feedback.
  const liveIncentiveTotal = distribution.reduce((s, d) => s + (pool * (parseFloat(d.pct) || 0) / 100), 0);
  const liveExtrasTotal = breakdown.totals?.extras || 0;  // extras come from OT and don't depend on edits
  const liveGrandTotal = liveIncentiveTotal + liveExtrasTotal;
  
  const empById = Object.fromEntries(employees.map(e => [e.employee_id, e]));
  const availableEmployees = employees.filter(e => !distribution.some(d => d.employee_id === e.employee_id));
  
  const addRow = (employee_id) => {
    if (!employee_id) return;
    setDistribution([...distribution, { employee_id, pct: 0 }]);
  };
  
  const updateRow = (idx, patch) => {
    const next = [...distribution];
    next[idx] = { ...next[idx], ...patch };
    setDistribution(next);
  };
  
  const removeRow = (idx) => {
    const next = [...distribution];
    next.splice(idx, 1);
    setDistribution(next);
  };
  
  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(
        `${API}/api/people-ops/month-end/${closing.closing_id}`,
        { revenue_total: revenue, incentive_pool_pct: poolPct, distribution },
        { withCredentials: true }
      );
      await onRefresh();
    } catch (err) {
      alert(err.response?.data?.detail || "Error saving");
    }
    setSaving(false);
  };
  
  const handleClose = async () => {
    if (!window.confirm(isEs ? "¿Cerrar este período? No podrás editarlo después." : "Close this period? You won't be able to edit it.")) return;
    setSaving(true);
    try {
      await axios.post(`${API}/api/people-ops/month-end/${closing.closing_id}/close`, {}, { withCredentials: true });
      await onRefresh();
    } catch (err) {
      alert(err.response?.data?.detail || "Error closing");
    }
    setSaving(false);
  };
  
  const handleReopen = async () => {
    if (!window.confirm(isEs ? "¿Reabrir período cerrado?" : "Reopen closed period?")) return;
    setSaving(true);
    try {
      await axios.post(`${API}/api/people-ops/month-end/${closing.closing_id}/reopen`, {}, { withCredentials: true });
      await onRefresh();
    } catch (err) {
      alert(err.response?.data?.detail || "Error reopening");
    }
    setSaving(false);
  };
  
  const monthLabel = (isEs ? MONTHS_ES : MONTHS_EN)[closing.month - 1] + " " + closing.year;
  
  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto" data-testid="month-end-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-violet-600" />
            {isEs ? "Cierre" : "Closing"} — {monthLabel}
            {isClosed ? (
              <Badge className="bg-emerald-100 text-emerald-700 ml-2"><Lock className="w-3 h-3 mr-1" />{isEs ? "Cerrado" : "Closed"}</Badge>
            ) : (
              <Badge variant="outline" className="ml-2"><Unlock className="w-3 h-3 mr-1" />{isEs ? "Borrador" : "Draft"}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {isEs ? "Edita el % del pool, distribuye incentivos por empleado y revisa los extras del mes." : "Edit pool %, distribute incentives by employee, and review the month's extras."}
          </DialogDescription>
        </DialogHeader>
        
        {loading ? (
          <div className="py-12 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 py-2">
            {/* ===== Panel 1: Incentivos ===== */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  {isEs ? "Incentivos" : "Incentives"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">{isEs ? "Ventas del Mes" : "Monthly Revenue"}</label>
                    <Input
                      type="number" step="0.01"
                      value={revenue}
                      onChange={(e) => setRevenue(parseFloat(e.target.value) || 0)}
                      disabled={isClosed}
                      data-testid="detail-revenue"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{isEs ? "% Pool" : "Pool %"}</label>
                    <Input
                      type="number" step="0.01" min="0" max="100"
                      value={poolPct}
                      onChange={(e) => setPoolPct(parseFloat(e.target.value) || 0)}
                      disabled={isClosed}
                      data-testid="detail-pool-pct"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{isEs ? "Pool $" : "Pool $"}</label>
                    <div className="h-10 flex items-center px-3 rounded-md border bg-violet-50 font-bold text-violet-900">
                      {formatCurrency(pool)}
                    </div>
                  </div>
                </div>
                
                {!pctSumOK && (
                  <div className="p-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {isEs ? `Los porcentajes suman ${pctSum.toFixed(2)}%, deberían sumar 100%.` : `Percentages sum to ${pctSum.toFixed(2)}%, should equal 100%.`}
                  </div>
                )}
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isEs ? "Empleado" : "Employee"}</TableHead>
                      <TableHead className="text-right w-24">%</TableHead>
                      <TableHead className="text-right">{isEs ? "Monto" : "Amount"}</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {distribution.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">
                          {isEs ? "Agrega empleados para distribuir el pool" : "Add employees to distribute the pool"}
                        </TableCell>
                      </TableRow>
                    )}
                    {distribution.map((row, idx) => {
                      const emp = empById[row.employee_id];
                      const amount = pool * (parseFloat(row.pct) || 0) / 100;
                      return (
                        <TableRow key={idx} data-testid={`incentive-row-${idx}`}>
                          <TableCell className="font-medium">{emp?.full_name || row.employee_id}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number" step="0.01" min="0" max="100"
                              className="h-8 text-right w-20 ml-auto"
                              value={row.pct || 0}
                              onChange={(e) => updateRow(idx, { pct: parseFloat(e.target.value) || 0 })}
                              disabled={isClosed}
                            />
                          </TableCell>
                          <TableCell className="text-right text-emerald-600 font-medium">
                            {formatCurrency(amount)}
                          </TableCell>
                          <TableCell>
                            {!isClosed && (
                              <Button variant="ghost" size="sm" onClick={() => removeRow(idx)} className="text-red-600">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                
                {!isClosed && availableEmployees.length > 0 && (
                  <Select value="" onValueChange={(v) => addRow(v)}>
                    <SelectTrigger data-testid="add-incentive-employee">
                      <SelectValue placeholder={isEs ? "+ Agregar empleado" : "+ Add employee"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableEmployees.map(e => (
                        <SelectItem key={e.employee_id} value={e.employee_id}>{e.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </CardContent>
            </Card>
            
            {/* ===== Panel 2: Totales (summary) ===== */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-violet-600" />
                  {isEs ? "Totales" : "Totals"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 rounded-md bg-violet-50 border border-violet-100">
                  <p className="text-xs text-violet-700">{isEs ? "Incentivos Totales" : "Total Incentives"}</p>
                  <p className="text-xl font-bold text-violet-900">{formatCurrency(liveIncentiveTotal)}</p>
                </div>
                <div className="p-3 rounded-md bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-700">{isEs ? "Horas Extras Totales" : "Total Overtime"}</p>
                  <p className="text-xl font-bold text-blue-900">{formatCurrency(liveExtrasTotal)}</p>
                </div>
                <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200">
                  <p className="text-xs text-emerald-700">{isEs ? "Gran Total" : "Grand Total"}</p>
                  <p className="text-2xl font-bold text-emerald-900" data-testid="grand-total">
                    {formatCurrency(liveGrandTotal)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground border-t pt-2">
                  {isEs ? "Rango:" : "Range:"} <strong>{breakdown.start_date} → {breakdown.end_date}</strong>
                </p>
              </CardContent>
            </Card>
            
            {/* ===== Panel 3: Extras (full row span) ===== */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  {isEs ? "Extras (Horas Extras del Mes)" : "Extras (Monthly Overtime)"}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {isEs ? "Se traen automáticamente las horas extras aprobadas/procesadas dentro del rango del mes." : "Approved/processed overtime requests within the month range are pulled automatically."}
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isEs ? "Empleado" : "Employee"}</TableHead>
                      <TableHead className="text-right">{isEs ? "% Pool" : "Pool %"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Incentivo" : "Incentive"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Horas OT" : "OT Hours"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Extras" : "Extras"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Total" : "Total"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(breakdown.rows || []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                          {isEs ? "Sin datos. Agrega incentivos o registra horas extras." : "No data. Add incentives or log overtime."}
                        </TableCell>
                      </TableRow>
                    )}
                    {(breakdown.rows || []).map((r, idx) => (
                      <TableRow key={r.employee_id || idx} data-testid={`breakdown-row-${r.employee_id}`}>
                        <TableCell className="font-medium">{r.employee_name}</TableCell>
                        <TableCell className="text-right">{r.pct || 0}%</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.incentive_amount)}</TableCell>
                        <TableCell className="text-right">{r.hours_total || 0}h</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.extras_amount)}</TableCell>
                        <TableCell className="text-right font-bold text-emerald-700">{formatCurrency(r.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
        
        <DialogFooter className="border-t pt-3">
          <Button variant="outline" onClick={onClose}>{isEs ? "Cerrar" : "Close"}</Button>
          {!isClosed && (
            <>
              <Button onClick={handleSave} disabled={saving} data-testid="save-closing-btn">
                {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isEs ? "Guardar" : "Save"}
              </Button>
              <Button onClick={handleClose} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700" data-testid="lock-closing-btn">
                <Lock className="w-4 h-4 mr-2" />
                {isEs ? "Cerrar Período" : "Lock Period"}
              </Button>
            </>
          )}
          {isClosed && (
            <Button variant="outline" onClick={handleReopen} disabled={saving} data-testid="reopen-closing-btn">
              <Unlock className="w-4 h-4 mr-2" />
              {isEs ? "Reabrir" : "Reopen"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
