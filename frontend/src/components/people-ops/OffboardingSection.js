import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "../ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "../ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "../ui/table";
import {
  UserMinus, Plus, RefreshCw, CheckCircle, Send, FileText,
  DollarSign, Calendar, AlertTriangle, Calculator, Clock, Trash2
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => 
  `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TERMINATION_TYPES = {
  resignation: { label: "Renuncia Voluntaria", labelEn: "Resignation", color: "bg-blue-100 text-blue-700" },
  dismissal_justified: { label: "Despido Justificado", labelEn: "Justified Dismissal", color: "bg-amber-100 text-amber-700" },
  dismissal_unjustified: { label: "Despido Injustificado", labelEn: "Unjustified Dismissal", color: "bg-red-100 text-red-700" },
  mutual_agreement: { label: "Mutuo Acuerdo", labelEn: "Mutual Agreement", color: "bg-purple-100 text-purple-700" },
  contract_end: { label: "Fin de Contrato", labelEn: "Contract End", color: "bg-gray-100 text-gray-700" },
  retirement: { label: "Jubilación", labelEn: "Retirement", color: "bg-emerald-100 text-emerald-700" }
};

const STATUS_CONFIG = {
  draft: { label: "Borrador", labelEn: "Draft", color: "bg-gray-100 text-gray-700" },
  pending_approval: { label: "Pendiente Aprobación", labelEn: "Pending Approval", color: "bg-amber-100 text-amber-700" },
  approved: { label: "Aprobado", labelEn: "Approved", color: "bg-blue-100 text-blue-700" },
  processed: { label: "Procesado", labelEn: "Processed", color: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Cancelado", labelEn: "Cancelled", color: "bg-red-100 text-red-700" }
};

export function OffboardingSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [liquidationPreview, setLiquidationPreview] = useState(null);
  
  const [newOffboarding, setNewOffboarding] = useState({
    employee_id: "",
    termination_type: "resignation",
    termination_date: "",
    last_working_day: "",
    pending_salary_days: 0,
    reason: "",
    auto_approve: true,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, empRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/offboarding?limit=50`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/employees?status=active`, { withCredentials: true })
      ]);
      setRecords(recRes.data);
      setEmployees(empRes.data);
    } catch (err) {
      console.error("Error fetching offboarding data:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateOffboarding = async () => {
    if (!newOffboarding.employee_id || !newOffboarding.termination_date || !newOffboarding.reason) {
      alert(isEs ? "Completa todos los campos requeridos" : "Complete all required fields");
      return;
    }
    
    setSubmitting(true);
    try {
      const response = await axios.post(
        `${API}/api/people-ops/offboarding`,
        {
          ...newOffboarding,
          last_working_day: newOffboarding.last_working_day || newOffboarding.termination_date,
          pending_salary_days: parseInt(newOffboarding.pending_salary_days) || 0
        },
        { withCredentials: true }
      );
      
      setLiquidationPreview(response.data);
    } catch (err) {
      alert(err.response?.data?.detail || "Error creating offboarding");
    }
    setSubmitting(false);
  };

  const handleConfirmOffboarding = () => {
    setDialogOpen(false);
    setLiquidationPreview(null);
    setNewOffboarding({
      employee_id: "", termination_type: "resignation",
      termination_date: "", last_working_day: "", pending_salary_days: 0, reason: "",
      auto_approve: true,
    });
    fetchData();
  };

  const handleViewDetail = (record) => {
    setSelectedRecord(record);
    setDetailDialogOpen(true);
  };

  const handleRecalculate = async (nextType) => {
    if (!selectedRecord?.offboarding_id) return;
    try {
      const res = await axios.post(
        `${API}/api/people-ops/offboarding/${selectedRecord.offboarding_id}/recalculate`,
        { termination_type: nextType },
        { withCredentials: true }
      );
      // Refresh selectedRecord + list
      const updated = res.data?.record;
      if (updated) setSelectedRecord(updated);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || (isEs ? "Error al recalcular" : "Recalculation error"));
    }
  };

  const handleSubmit = async (offboardingId) => {
    try {
      await axios.post(`${API}/api/people-ops/offboarding/${offboardingId}/submit`, {}, { withCredentials: true });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };

  const handleApprove = async (offboardingId) => {
    if (!confirm(isEs ? "¿Confirmar aprobación? El empleado será marcado como terminado." : "Confirm approval? Employee will be marked as terminated.")) {
      return;
    }
    try {
      await axios.post(`${API}/api/people-ops/offboarding/${offboardingId}/approve`, {}, { withCredentials: true });
      setDetailDialogOpen(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };

  const handleProcess = async (offboardingId) => {
    try {
      await axios.post(`${API}/api/people-ops/offboarding/${offboardingId}/process`, {}, { withCredentials: true });
      setDetailDialogOpen(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };

  const handleDelete = async (record) => {
    const willReactivate = ["approved", "processed"].includes(record.status);
    const msg = isEs
      ? (willReactivate
          ? `¿Eliminar esta terminación de ${record.employee_name}?\n\nEl empleado será REACTIVADO (status: active) y se removerá la fecha de terminación.`
          : `¿Eliminar esta terminación de ${record.employee_name}? Esta acción no se puede deshacer.`)
      : (willReactivate
          ? `Delete this termination for ${record.employee_name}?\n\nThe employee will be REACTIVATED (status: active) and the termination date will be removed.`
          : `Delete this termination for ${record.employee_name}? This cannot be undone.`);
    if (!window.confirm(msg)) return;
    try {
      await axios.delete(`${API}/api/people-ops/offboarding/${record.offboarding_id}`, { withCredentials: true });
      setDetailDialogOpen(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || (isEs ? "Error al eliminar" : "Error deleting"));
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const pendingCount = records.filter(r => ["draft", "pending_approval"].includes(r.status)).length;

  return (
    <div className="space-y-6" data-testid="offboarding-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <UserMinus className="w-5 h-5" />
            {isEs ? "Terminaciones / Offboarding" : "Terminations / Offboarding"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Gestión de salidas y cálculo de liquidación según CT RD" : "Manage exits and calculate severance per RD Labor Code"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}><RefreshCw className="w-4 h-4" /></Button>
          <Button onClick={() => setDialogOpen(true)} data-testid="new-offboarding-btn">
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Nueva Terminación" : "New Termination"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={pendingCount > 0 ? "border-amber-300 bg-amber-50/30" : ""}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <Clock className="w-4 h-4" />
              {isEs ? "En Proceso" : "In Progress"}
            </div>
            <p className="text-3xl font-bold mt-1">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-emerald-600 text-sm">
              <CheckCircle className="w-4 h-4" />
              {isEs ? "Procesados (Año)" : "Processed (Year)"}
            </div>
            <p className="text-3xl font-bold mt-1">
              {records.filter(r => r.status === "processed").length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-blue-600 text-sm">
              <DollarSign className="w-4 h-4" />
              {isEs ? "Total Liquidaciones (Año)" : "Total Severance (Year)"}
            </div>
            <p className="text-2xl font-bold mt-1 text-blue-700">
              {formatCurrency(records.filter(r => r.status === "processed").reduce((sum, r) => sum + (r.net_liquidation || 0), 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Info Banner */}
      <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 flex items-start gap-2">
        <Calculator className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">{isEs ? "Cálculo según Código de Trabajo RD" : "Calculation per RD Labor Code"}</p>
          <p className="text-xs mt-1">
            {isEs 
              ? "Preaviso y Cesantía solo aplican para despido injustificado. Vacaciones y regalía proporcional aplican para todos los tipos de terminación." 
              : "Notice and Severance only apply for unjustified dismissal. Vacation and proportional bonus apply to all termination types."}
          </p>
        </div>
      </div>

      {/* Records Table */}
      <Card>
        <CardContent className="p-0">
          {records.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UserMinus className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{isEs ? "No hay terminaciones registradas" : "No terminations recorded"}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Empleado" : "Employee"}</TableHead>
                  <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                  <TableHead>{isEs ? "Fecha Terminación" : "Termination Date"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Liquidación Neta" : "Net Severance"}</TableHead>
                  <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                  <TableHead>{isEs ? "Acciones" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((rec) => {
                  const typeConfig = TERMINATION_TYPES[rec.termination_type] || TERMINATION_TYPES.resignation;
                  return (
                    <TableRow key={rec.offboarding_id} data-testid={`offboarding-${rec.offboarding_id}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{rec.employee_name}</p>
                          <p className="text-xs text-muted-foreground">{rec.employee_number}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={typeConfig.color}>
                          {isEs ? typeConfig.label : typeConfig.labelEn}
                        </Badge>
                      </TableCell>
                      <TableCell>{rec.termination_date}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-600">
                        {formatCurrency(rec.net_liquidation)}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_CONFIG[rec.status]?.color}>
                          {isEs ? STATUS_CONFIG[rec.status]?.label : STATUS_CONFIG[rec.status]?.labelEn}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleViewDetail(rec)} data-testid={`view-offboarding-${rec.offboarding_id}`}>
                            <FileText className="w-4 h-4" />
                          </Button>
                          {rec.status === "draft" && (
                            <Button variant="ghost" size="sm" onClick={() => handleSubmit(rec.offboarding_id)} className="text-blue-600">
                              <Send className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(rec)}
                            className="text-red-600 hover:bg-red-50"
                            title={isEs ? "Eliminar" : "Delete"}
                            data-testid={`delete-offboarding-${rec.offboarding_id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Offboarding Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setLiquidationPreview(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEs ? "Nueva Terminación de Empleo" : "New Employment Termination"}</DialogTitle>
          </DialogHeader>

          {!liquidationPreview ? (
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Empleado *" : "Employee *"}</label>
                <Select value={newOffboarding.employee_id} onValueChange={(v) => setNewOffboarding({ ...newOffboarding, employee_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Seleccionar empleado" : "Select employee"} />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.employee_id} value={emp.employee_id}>
                        {emp.full_name} - {emp.job_title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">{isEs ? "Tipo de Terminación *" : "Termination Type *"}</label>
                <Select value={newOffboarding.termination_type} onValueChange={(v) => setNewOffboarding({ ...newOffboarding, termination_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TERMINATION_TYPES).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{isEs ? config.label : config.labelEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {newOffboarding.termination_type === "dismissal_unjustified" && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                  <AlertTriangle className="w-4 h-4 inline mr-2" />
                  {isEs 
                    ? "El despido injustificado genera obligación de pagar preaviso y cesantía según el Código de Trabajo." 
                    : "Unjustified dismissal creates obligation to pay notice and severance per Labor Code."}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">{isEs ? "Fecha de Terminación *" : "Termination Date *"}</label>
                  <Input
                    type="date"
                    value={newOffboarding.termination_date}
                    onChange={(e) => setNewOffboarding({ ...newOffboarding, termination_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{isEs ? "Último Día de Trabajo" : "Last Working Day"}</label>
                  <Input
                    type="date"
                    value={newOffboarding.last_working_day}
                    onChange={(e) => setNewOffboarding({ ...newOffboarding, last_working_day: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">{isEs ? "Días de Salario Pendiente" : "Pending Salary Days"}</label>
                <Input
                  type="number"
                  value={newOffboarding.pending_salary_days}
                  onChange={(e) => setNewOffboarding({ ...newOffboarding, pending_salary_days: e.target.value })}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {isEs ? "Días trabajados no pagados en el período actual" : "Unpaid worked days in current period"}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">{isEs ? "Motivo *" : "Reason *"}</label>
                <Textarea
                  value={newOffboarding.reason}
                  onChange={(e) => setNewOffboarding({ ...newOffboarding, reason: e.target.value })}
                  placeholder={isEs ? "Describa el motivo de la terminación..." : "Describe the reason for termination..."}
                />
              </div>

              <div className="flex items-start gap-2 p-3 rounded-md border border-amber-200 bg-amber-50/60">
                <input
                  type="checkbox"
                  id="auto-approve-check"
                  checked={!!newOffboarding.auto_approve}
                  onChange={(e) => setNewOffboarding({ ...newOffboarding, auto_approve: e.target.checked })}
                  className="w-4 h-4 mt-0.5"
                  data-testid="offboarding-auto-approve"
                />
                <div className="flex-1">
                  <label htmlFor="auto-approve-check" className="text-sm font-medium cursor-pointer">
                    {isEs ? "Terminar empleado inmediatamente" : "Terminate employee immediately"}
                  </label>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    {isEs
                      ? "Al aprobar, el empleado quedará marcado como TERMINATED y saldrá de listas activas (Directorio, CRM, Timesheet)."
                      : "On approve, employee becomes TERMINATED and disappears from active lists (Directory, CRM, Timesheet)."}
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
                <Button onClick={handleCreateOffboarding} disabled={submitting}>
                  {submitting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Calculator className="w-4 h-4 mr-2" />}
                  {isEs ? "Calcular Liquidación" : "Calculate Severance"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                <h3 className="font-semibold text-emerald-800 mb-3">{isEs ? "Resumen de Liquidación" : "Severance Summary"}</h3>
                <div className="space-y-2 text-sm">
                  {liquidationPreview.breakdown?.map((line, idx) => (
                    <p key={idx} className={line.includes("TOTAL") ? "font-bold text-lg border-t pt-2 mt-2" : ""}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 inline mr-2" />
                {isEs 
                  ? "Este cálculo es una estimación inicial. Puede editarse antes de aprobar." 
                  : "This is an initial estimate. It can be edited before approval."}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setLiquidationPreview(null)}>{isEs ? "Editar" : "Edit"}</Button>
                <Button onClick={handleConfirmOffboarding} className="bg-emerald-600 hover:bg-emerald-700">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {isEs ? "Confirmar y Crear" : "Confirm & Create"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEs ? "Detalle de Liquidación" : "Severance Detail"}</DialogTitle>
          </DialogHeader>

          {selectedRecord && (() => {
            const ttype = selectedRecord.termination_type || "resignation";
            const ttypeMeta = TERMINATION_TYPES[ttype] || TERMINATION_TYPES.resignation;
            const country = (selectedRecord.country_code || "DO").toUpperCase();
            const isUS = country === "US";
            const notAppMap = {};
            (selectedRecord.concepts_not_applicable || []).forEach((c) => {
              notAppMap[c.concept] = c.reason;
            });
            const canEdit = ["draft", "pending_approval"].includes(selectedRecord.status);
            return (
            <div className="space-y-4 py-4">
              {/* Termination Type & Country header */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={ttypeMeta.color} data-testid="offboarding-detail-type-badge">
                  {isEs ? ttypeMeta.label : ttypeMeta.labelEn}
                </Badge>
                <Badge variant="outline" className="border-slate-300" data-testid="offboarding-detail-country-badge">
                  {isEs ? "País" : "Country"}: {country}
                </Badge>
                {selectedRecord.verify_local_law && (
                  <Badge className="bg-amber-100 text-amber-700">
                    {isEs ? "Verificar ley local" : "Verify local law"}
                  </Badge>
                )}
                {canEdit && (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{isEs ? "Cambiar a:" : "Change to:"}</span>
                    <Select value={ttype} onValueChange={handleRecalculate}>
                      <SelectTrigger className="h-8 w-52" data-testid="offboarding-detail-change-type-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TERMINATION_TYPES).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{isEs ? v.label : v.labelEn}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {selectedRecord.applicable_law && (
                <p className="text-xs text-muted-foreground -mt-2 italic">{selectedRecord.applicable_law}</p>
              )}

              {/* Employee Info */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Empleado" : "Employee"}</p>
                  <p className="font-medium">{selectedRecord.employee_name}</p>
                  <p className="text-xs">{selectedRecord.employee_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Tiempo de Servicio" : "Service Time"}</p>
                  <p className="font-medium">{selectedRecord.years_of_service} {isEs ? "años" : "years"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Fecha Ingreso" : "Hire Date"}</p>
                  <p className="font-medium">{selectedRecord.hire_date}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Fecha Terminación" : "Termination Date"}</p>
                  <p className="font-medium">{selectedRecord.termination_date}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Salario Mensual" : "Monthly Salary"}</p>
                  <p className="font-medium" data-testid="offboarding-detail-base-salary">{formatCurrency(selectedRecord.base_salary)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {isEs ? "Salario Diario" : "Daily Salary"}
                    <span className="text-xs text-muted-foreground/70 ml-1">
                      ({isUS ? "÷ 21.67" : "÷ 23.83"})
                    </span>
                  </p>
                  <p className="font-medium" data-testid="offboarding-detail-daily-salary">{formatCurrency(selectedRecord.daily_salary)}</p>
                </div>
              </div>

              {/* Liquidation Breakdown */}
              <div className="space-y-2">
                <h4 className="font-medium">{isEs ? "Desglose de Liquidación" : "Severance Breakdown"}</h4>

                {/* Preaviso — always shown, with reason if not applicable */}
                {!isUS && (
                  <div
                    className={`flex justify-between p-2 rounded ${selectedRecord.preaviso_amount > 0 ? "bg-muted/30" : "bg-muted/10 text-muted-foreground"}`}
                    data-testid="offboarding-detail-preaviso-row"
                  >
                    <span>
                      {isEs ? "Preaviso" : "Notice"} ({selectedRecord.preaviso_days || 0} {isEs ? "días" : "days"})
                      {!selectedRecord.preaviso_applies && notAppMap.preaviso && (
                        <span className="block text-xs italic mt-0.5">{notAppMap.preaviso}</span>
                      )}
                    </span>
                    <span className="font-medium">{formatCurrency(selectedRecord.preaviso_amount)}</span>
                  </div>
                )}

                {/* Cesantía — always shown, with reason if not applicable */}
                {!isUS && (
                  <div
                    className={`flex justify-between p-2 rounded ${selectedRecord.cesantia_amount > 0 ? "bg-muted/30" : "bg-muted/10 text-muted-foreground"}`}
                    data-testid="offboarding-detail-cesantia-row"
                  >
                    <span>
                      {isEs ? "Cesantía" : "Severance"} ({selectedRecord.cesantia_days || 0} {isEs ? "días" : "days"})
                      {!selectedRecord.cesantia_applies && notAppMap.cesantia && (
                        <span className="block text-xs italic mt-0.5">{notAppMap.cesantia}</span>
                      )}
                    </span>
                    <span className="font-medium">{formatCurrency(selectedRecord.cesantia_amount)}</span>
                  </div>
                )}

                {/* Vacaciones / PTO */}
                <div className="flex justify-between p-2 rounded bg-muted/30" data-testid="offboarding-detail-vacation-row">
                  <span>
                    {isUS ? "PTO Payout" : (isEs ? "Vacaciones" : "Vacation")}
                    {" "}({selectedRecord.vacation_days_owed || 0} {isEs && !isUS ? "días" : "days"})
                  </span>
                  <span className="font-medium">{formatCurrency(selectedRecord.vacation_amount)}</span>
                </div>

                {/* Regalía — DO only */}
                {!isUS && (
                  <div className="flex justify-between p-2 rounded bg-muted/30" data-testid="offboarding-detail-regalia-row">
                    <span>{isEs ? "Regalía Proporcional" : "Proportional Bonus"} ({selectedRecord.regalia_months_worked || 0} {isEs ? "meses" : "months"})</span>
                    <span className="font-medium">{formatCurrency(selectedRecord.regalia_proportion)}</span>
                  </div>
                )}

                {/* Severance — US only */}
                {isUS && (
                  <div
                    className={`flex justify-between p-2 rounded ${selectedRecord.severance_amount > 0 ? "bg-muted/30" : "bg-muted/10 text-muted-foreground"}`}
                    data-testid="offboarding-detail-severance-row"
                  >
                    <span>
                      Severance ({selectedRecord.severance_weeks || 0} weeks)
                      {(selectedRecord.severance_weeks || 0) === 0 && (
                        <span className="block text-xs italic mt-0.5">Optional company policy — set severance_weeks to add.</span>
                      )}
                    </span>
                    <span className="font-medium">{formatCurrency(selectedRecord.severance_amount || 0)}</span>
                  </div>
                )}

                {selectedRecord.pending_salary_amount > 0 && (
                  <div className="flex justify-between p-2 rounded bg-muted/30" data-testid="offboarding-detail-pending-salary-row">
                    <span>{isEs ? "Salario Pendiente" : "Pending Salary"}</span>
                    <span className="font-medium">{formatCurrency(selectedRecord.pending_salary_amount)}</span>
                  </div>
                )}

                <div className="flex justify-between p-2 rounded bg-blue-50 border border-blue-100">
                  <span className="font-medium text-blue-700">{isEs ? "Subtotal Bruto" : "Gross Subtotal"}</span>
                  <span className="font-bold text-blue-700">{formatCurrency(selectedRecord.gross_liquidation)}</span>
                </div>

                {selectedRecord.total_deductions > 0 && (
                  <div className="flex justify-between p-2 rounded bg-red-50 border border-red-100">
                    <span className="text-red-700">{isEs ? "(-) Deducciones" : "(-) Deductions"}</span>
                    <span className="font-medium text-red-700">-{formatCurrency(selectedRecord.total_deductions)}</span>
                  </div>
                )}

                <div className="flex justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <span className="font-bold text-emerald-700">{isEs ? "TOTAL NETO A PAGAR" : "NET TOTAL TO PAY"}</span>
                  <span className="text-xl font-bold text-emerald-700" data-testid="offboarding-detail-net-total">{formatCurrency(selectedRecord.net_liquidation)}</span>
                </div>
              </div>
            </div>
            );
          })()}

          {selectedRecord && (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => handleDelete(selectedRecord)}
                className="text-red-600 border-red-300 hover:bg-red-50 mr-auto"
                data-testid="delete-offboarding-detail-btn"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {isEs ? "Eliminar" : "Delete"}
              </Button>
              <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>{isEs ? "Cerrar" : "Close"}</Button>

              {selectedRecord.status === "pending_approval" && (
                <Button onClick={() => handleApprove(selectedRecord.offboarding_id)} className="bg-emerald-600 hover:bg-emerald-700">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {isEs ? "Aprobar" : "Approve"}
                </Button>
              )}

              {selectedRecord.status === "approved" && (
                <Button onClick={() => handleProcess(selectedRecord.offboarding_id)} className="bg-blue-600 hover:bg-blue-700">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {isEs ? "Marcar como Procesado" : "Mark as Processed"}
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
