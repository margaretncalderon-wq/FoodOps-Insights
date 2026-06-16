import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  Wallet, Plus, Calendar, Users, DollarSign, 
  RefreshCw, Settings, FileText, ChevronRight,
  CheckCircle, Clock, AlertCircle, Ban, Zap
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { VariablePayWidget } from "./VariablePayWidget";
import { Switch } from "../ui/switch";
import { useCurrencyFormatter } from "../../hooks/useCurrencyFormatter";

const STATUS_CONFIG = {
  draft: { 
    label: "Borrador", labelEn: "Draft", 
    icon: FileText, 
    color: "bg-gray-100 text-gray-700 border-gray-200" 
  },
  pending_approval: { 
    label: "Pendiente Aprobación", labelEn: "Pending Approval", 
    icon: Clock, 
    color: "bg-amber-100 text-amber-700 border-amber-200" 
  },
  approved: { 
    label: "Aprobada", labelEn: "Approved", 
    icon: CheckCircle, 
    color: "bg-blue-100 text-blue-700 border-blue-200" 
  },
  processing: { 
    label: "Procesando", labelEn: "Processing", 
    icon: RefreshCw, 
    color: "bg-purple-100 text-purple-700 border-purple-200" 
  },
  completed: { 
    label: "Completada", labelEn: "Completed", 
    icon: CheckCircle, 
    color: "bg-emerald-100 text-emerald-700 border-emerald-200" 
  },
  cancelled: { 
    label: "Cancelada", labelEn: "Cancelled", 
    icon: Ban, 
    color: "bg-red-100 text-red-700 border-red-200" 
  }
};

export function PayrollSection() {
  const { language } = useLanguage();
  const { formatCurrency } = useCurrencyFormatter();
  const isEs = language === "es";
  const navigate = useNavigate();
  
  const [periods, setPeriods] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // New period form
  const [newPeriod, setNewPeriod] = useState({
    period_name: "",
    period_type: "biweekly",
    payment_kind: "regular",   // "regular" | "overtime_only"
    auto_include_overtime: true,
    start_date: "",
    end_date: "",
    payment_date: "",
    notes: ""
  });
  const [otPreview, setOtPreview] = useState(null);  // pending OT summary for the date range
  const [fieldErrors, setFieldErrors] = useState({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [periodsRes, configRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/payroll/periods?limit=20`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/payroll/config`, { withCredentials: true })
      ]);
      setPeriods(periodsRes.data);
      setConfig(configRes.data);
    } catch (err) {
      console.error("Error fetching payroll data:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Helper to build a fresh period_name from current state (used as fallback on submit)
  // Output matches backend's auto-generation (Spanish prefix + English month) so the
  // placeholder is accurate regardless of UI language.
  const computePeriodName = (startDate, periodType, paymentKind) => {
    if (!startDate) return "";
    // Parse YYYY-MM-DD as LOCAL (avoid UTC shift)
    const [y, m, d] = startDate.split("-").map(Number);
    if (!y || !m || !d) return "";
    const date = new Date(y, m - 1, d);
    // Match backend strftime("%B") → English month name (capitalized)
    const month = date.toLocaleString("en", { month: "long" });
    const isOT = paymentKind === "overtime_only";
    if (periodType === "biweekly") {
      const half = d <= 15 ? "1" : "2";
      const prefix = isOT ? "Horas Extras" : "Quincena";
      return `${prefix} ${half} - ${month} ${y}`;
    } else if (periodType === "monthly") {
      const prefix = isOT ? "Horas Extras" : "Nómina";
      return `${prefix} ${month} ${y}`;
    }
    return `${month} ${y}`;
  };
  
  // Auto-fill dates based on period type (locale-safe parsing)
  const handleStartDateChange = (value) => {
    if (!value) {
      setNewPeriod({ ...newPeriod, start_date: "", end_date: "", payment_date: "", period_name: "" });
      return;
    }
    const [y, m, d] = value.split("-").map(Number);
    const startDate = new Date(y, m - 1, d);
    let endDate, paymentDate;
    
    if (newPeriod.period_type === "biweekly") {
      if (d === 1) {
        endDate = new Date(y, m - 1, 15);
        paymentDate = new Date(y, m - 1, 15);
      } else if (d === 16) {
        endDate = new Date(y, m, 0); // Last day of month
        paymentDate = new Date(y, m, 0);
      } else {
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 14);
        paymentDate = new Date(endDate);
      }
    } else if (newPeriod.period_type === "weekly") {
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      paymentDate = new Date(endDate);
    } else {
      endDate = new Date(y, m, 0); // Last day of month
      paymentDate = new Date(endDate);
    }
    
    const toISO = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    setNewPeriod({
      ...newPeriod,
      start_date: value,
      end_date: toISO(endDate),
      payment_date: toISO(paymentDate),
      period_name: computePeriodName(value, newPeriod.period_type, newPeriod.payment_kind)
    });
  };
  
  // Fetch OT preview whenever the date range opens / changes
  useEffect(() => {
    let cancelled = false;
    if (!dialogOpen || !newPeriod.start_date || !newPeriod.end_date) {
      setOtPreview(null);
      return;
    }
    (async () => {
      try {
        const res = await axios.get(
          `${API}/api/people-ops/overtime/pending-in-range?start_date=${newPeriod.start_date}&end_date=${newPeriod.end_date}`,
          { withCredentials: true }
        );
        if (!cancelled) setOtPreview(res.data);
      } catch (err) {
        if (!cancelled) setOtPreview(null);
      }
    })();
    return () => { cancelled = true; };
  }, [dialogOpen, newPeriod.start_date, newPeriod.end_date]);

  const handleCreatePeriod = async () => {
    setFieldErrors({});
    
    // Build the payload with autofill fallbacks (defensive: handles users typing manually
    // without triggering handleStartDateChange)
    const payload = { ...newPeriod };
    const errors = {};
    
    if (!payload.start_date) errors.start_date = isEs ? "Requerido" : "Required";
    if (!payload.end_date) errors.end_date = isEs ? "Requerido" : "Required";
    if (!payload.payment_date) errors.payment_date = isEs ? "Requerido" : "Required";
    
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    
    // Auto-generate period_name if blank
    if (!payload.period_name || !payload.period_name.trim()) {
      payload.period_name = computePeriodName(payload.start_date, payload.period_type, payload.payment_kind);
    }
    
    setCreating(true);
    try {
      const res = await axios.post(
        `${API}/api/people-ops/payroll/periods`,
        payload,
        { withCredentials: true }
      );
      setDialogOpen(false);
      setNewPeriod({
        period_name: "", period_type: "biweekly", payment_kind: "regular",
        auto_include_overtime: true,
        start_date: "", end_date: "", payment_date: "", notes: ""
      });
      setOtPreview(null);
      navigate(`/people-ops/payroll/${res.data.period_id}`);
    } catch (err) {
      console.error("Error creating period:", err);
      alert(err.response?.data?.detail || (isEs ? "Error al crear período" : "Error creating payroll period"));
    }
    setCreating(false);
  };

  // Calculate summary stats
  const activePeriod = periods.find(p => ["draft", "pending_approval", "approved"].includes(p.status));
  const completedThisYear = periods.filter(p => 
    p.status === "completed" && 
    new Date(p.payment_date).getFullYear() === new Date().getFullYear()
  );
  const totalPaidThisYear = completedThisYear.reduce((sum, p) => sum + (p.total_net || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="payroll-section">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-violet-200 bg-violet-50/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-violet-600 text-sm">
              <Wallet className="w-4 h-4" />
              {isEs ? "Período Activo" : "Active Period"}
            </div>
            {activePeriod ? (
              <>
                <p className="font-semibold mt-1 truncate">{activePeriod.period_name}</p>
                <Badge className={`mt-1 text-xs ${STATUS_CONFIG[activePeriod.status]?.color}`}>
                  {isEs ? STATUS_CONFIG[activePeriod.status]?.label : STATUS_CONFIG[activePeriod.status]?.labelEn}
                </Badge>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">
                {isEs ? "Sin período activo" : "No active period"}
              </p>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Calendar className="w-4 h-4" />
              {isEs ? "Nóminas este Año" : "Payrolls this Year"}
            </div>
            <p className="text-2xl font-bold mt-1">{completedThisYear.length}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <DollarSign className="w-4 h-4" />
              {isEs ? "Pagado este Año" : "Paid this Year"}
            </div>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totalPaidThisYear)}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Settings className="w-4 h-4" />
              {isEs ? "Frecuencia" : "Frequency"}
            </div>
            <p className="text-lg font-semibold mt-1">
              {config?.payment_frequency === "biweekly" ? (isEs ? "Quincenal" : "Biweekly") :
               config?.payment_frequency === "monthly" ? (isEs ? "Mensual" : "Monthly") :
               (isEs ? "Semanal" : "Weekly")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Variable Pay Widget */}
      <VariablePayWidget />

      {/* Actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {isEs ? "Historial de Nóminas" : "Payroll History"}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={() => setDialogOpen(true)} data-testid="new-payroll-btn">
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Nueva Nómina" : "New Payroll"}
          </Button>
        </div>
      </div>

      {/* Periods Table */}
      <Card>
        <CardContent className="p-0">
          {periods.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Wallet className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{isEs ? "No hay nóminas registradas" : "No payroll records"}</p>
              <Button variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {isEs ? "Crear Primera Nómina" : "Create First Payroll"}
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Período" : "Period"}</TableHead>
                  <TableHead>{isEs ? "Fecha de Pago" : "Payment Date"}</TableHead>
                  <TableHead className="text-center">{isEs ? "Empleados" : "Employees"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Total Bruto" : "Total Gross"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Total Neto" : "Total Net"}</TableHead>
                  <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((period) => {
                  const StatusIcon = STATUS_CONFIG[period.status]?.icon || FileText;
                  return (
                    <TableRow 
                      key={period.period_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/people-ops/payroll/${period.period_id}`)}
                      data-testid={`payroll-period-${period.period_id}`}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{period.period_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {period.start_date} → {period.end_date}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(period.payment_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{period.total_employees}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(period.total_gross)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-emerald-600">
                        {formatCurrency(period.total_net)}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs flex items-center gap-1 w-fit ${STATUS_CONFIG[period.status]?.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {isEs ? STATUS_CONFIG[period.status]?.label : STATUS_CONFIG[period.status]?.labelEn}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Period Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setFieldErrors({}); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEs ? "Crear Nueva Nómina" : "Create New Payroll"}
            </DialogTitle>
            <DialogDescription>
              {newPeriod.payment_kind === "overtime_only"
                ? (isEs ? "Período exclusivo para pagar horas extras aprobadas." : "OT-only period: pays approved overtime, no base salary.")
                : (isEs ? "Se generarán automáticamente las entradas para todos los empleados activos." : "Entries will be auto-generated for all active employees.")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Payment Kind */}
            <div>
              <label className="text-sm font-medium">{isEs ? "Tipo de Pago" : "Payment Kind"}</label>
              <Select
                value={newPeriod.payment_kind}
                onValueChange={(v) => setNewPeriod({ ...newPeriod, payment_kind: v, period_name: computePeriodName(newPeriod.start_date, newPeriod.period_type, v) })}
              >
                <SelectTrigger data-testid="payment-kind-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">
                    {isEs ? "Nómina regular (salario + extras)" : "Regular payroll (salary + OT)"}
                  </SelectItem>
                  <SelectItem value="overtime_only">
                    {isEs ? "Solo horas extras (período separado)" : "Overtime only (separate period)"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Frecuencia" : "Frequency"}</label>
              <Select 
                value={newPeriod.period_type} 
                onValueChange={(v) => setNewPeriod({ ...newPeriod, period_type: v, period_name: computePeriodName(newPeriod.start_date, v, newPeriod.payment_kind) })}
              >
                <SelectTrigger data-testid="period-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="biweekly">{isEs ? "Quincenal" : "Biweekly"}</SelectItem>
                  <SelectItem value="monthly">{isEs ? "Mensual" : "Monthly"}</SelectItem>
                  <SelectItem value="weekly">{isEs ? "Semanal" : "Weekly"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha Inicio *" : "Start Date *"}</label>
                <Input
                  type="date"
                  data-testid="period-start-date"
                  className={fieldErrors.start_date ? "border-red-500" : ""}
                  value={newPeriod.start_date}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                />
                {fieldErrors.start_date && <p className="text-xs text-red-600 mt-1">{fieldErrors.start_date}</p>}
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha Fin *" : "End Date *"}</label>
                <Input
                  type="date"
                  data-testid="period-end-date"
                  className={fieldErrors.end_date ? "border-red-500" : ""}
                  value={newPeriod.end_date}
                  onChange={(e) => setNewPeriod({ ...newPeriod, end_date: e.target.value })}
                />
                {fieldErrors.end_date && <p className="text-xs text-red-600 mt-1">{fieldErrors.end_date}</p>}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">{isEs ? "Fecha de Pago *" : "Payment Date *"}</label>
              <Input
                type="date"
                data-testid="period-payment-date"
                className={fieldErrors.payment_date ? "border-red-500" : ""}
                value={newPeriod.payment_date}
                onChange={(e) => setNewPeriod({ ...newPeriod, payment_date: e.target.value })}
              />
              {fieldErrors.payment_date && <p className="text-xs text-red-600 mt-1">{fieldErrors.payment_date}</p>}
            </div>

            <div>
              <label className="text-sm font-medium">
                {isEs ? "Nombre del Período" : "Period Name"}
                <span className="text-xs text-muted-foreground ml-2">{isEs ? "(opcional - se autogenera)" : "(optional - auto-generated)"}</span>
              </label>
              <Input
                data-testid="period-name-input"
                value={newPeriod.period_name}
                onChange={(e) => setNewPeriod({ ...newPeriod, period_name: e.target.value })}
                placeholder={computePeriodName(newPeriod.start_date, newPeriod.period_type, newPeriod.payment_kind) || (isEs ? "Ej: Quincena 1 - Enero 2026" : "E.g.: Payroll 1 - January 2026")}
              />
            </div>
            
            {/* OT preview + include toggle (only for regular payroll) */}
            {newPeriod.payment_kind === "regular" && otPreview && otPreview.total_ot_count > 0 && (
              <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 space-y-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-900">
                    {isEs ? `Horas extras aprobadas en este rango: ${otPreview.total_ot_count}` : `Approved overtime in range: ${otPreview.total_ot_count}`}
                  </span>
                </div>
                <p className="text-xs text-amber-800">
                  {isEs ? `Total estimado: ${formatCurrency(otPreview.total_estimated_amount)} · ${otPreview.summary_by_employee?.length || 0} empleado(s)` : `Estimated total: ${formatCurrency(otPreview.total_estimated_amount)} · ${otPreview.summary_by_employee?.length || 0} employee(s)`}
                </p>
                <div className="flex items-center justify-between pt-1 border-t border-amber-200">
                  <span className="text-xs text-amber-900">
                    {isEs ? "Incluir horas extras en esta nómina" : "Include overtime in this payroll"}
                  </span>
                  <Switch
                    checked={newPeriod.auto_include_overtime}
                    onCheckedChange={(v) => setNewPeriod({ ...newPeriod, auto_include_overtime: v })}
                    data-testid="auto-include-ot-switch"
                  />
                </div>
                {!newPeriod.auto_include_overtime && (
                  <p className="text-xs text-amber-700 italic">
                    {isEs ? "→ Estas OTs quedarán pendientes para un período separado." : "→ These OTs will remain pending for a separate period."}
                  </p>
                )}
              </div>
            )}
            
            {newPeriod.payment_kind === "overtime_only" && otPreview && (
              <div className="p-3 rounded-lg border border-violet-200 bg-violet-50">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-violet-600" />
                  <span className="text-sm font-medium text-violet-900">
                    {isEs ? "Horas extras a pagar" : "Overtime to pay"}
                  </span>
                </div>
                <p className="text-xs text-violet-800">
                  {otPreview.total_ot_count > 0
                    ? (isEs ? `${otPreview.summary_by_employee?.length || 0} empleado(s) · Total ${formatCurrency(otPreview.total_estimated_amount)}` : `${otPreview.summary_by_employee?.length || 0} employee(s) · Total ${formatCurrency(otPreview.total_estimated_amount)}`)
                    : (isEs ? "Sin horas extras aprobadas en este rango." : "No approved overtime in this range.")}
                </p>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">{isEs ? "Notas (opcional)" : "Notes (optional)"}</label>
              <Input
                value={newPeriod.notes}
                onChange={(e) => setNewPeriod({ ...newPeriod, notes: e.target.value })}
                placeholder={isEs ? "Observaciones..." : "Observations..."}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreatePeriod} disabled={creating} data-testid="create-period-btn">
              {creating ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              {isEs ? "Crear y Ver Nómina" : "Create & View Payroll"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
