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
  Clock, Plus, RefreshCw, CheckCircle, XCircle,  AlertCircle, DollarSign, Calendar, Sun, Moon,
  Download, Mail, BarChart3, Edit, Trash2
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { useCurrencyFormatter } from "../../hooks/useCurrencyFormatter";
import OvertimePeriodDialog from "./OvertimePeriodDialog";

// Helper functions for weekly entry
const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  return d.toISOString().split('T')[0];
};

const getWeekDays = (weekStart) => {
  const days = [];
  const start = new Date(weekStart);
  const dayNames = {
    es: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
    en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  };
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push({
      dayName: dayNames.es[i],
      date: `${d.getDate()}/${d.getMonth() + 1}`,
      fullDate: d.toISOString().split('T')[0]
    });
  }
  return days;
};

const STATUS_CONFIG = {
  pending: { label: "Pendiente", labelEn: "Pending", color: "bg-amber-100 text-amber-700" },
  approved: { label: "Aprobada", labelEn: "Approved", color: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rechazada", labelEn: "Rejected", color: "bg-red-100 text-red-700" },
  processed: { label: "Procesada", labelEn: "Processed", color: "bg-blue-100 text-blue-700" }
};

export function OvertimeSection() {
  const { language } = useLanguage();
  const { formatCurrency } = useCurrencyFormatter();
  const isEs = language === "es";
  
  const [requests, setRequests] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [companyPeriodType, setCompanyPeriodType] = useState("biweekly");
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [legacyDialogOpen, setLegacyDialogOpen] = useState(false);
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false);
  const [expandedPeriodId, setExpandedPeriodId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Report (period filter + aggregate summary)
  const [reportPeriod, setReportPeriod] = useState("biweekly");  // weekly | biweekly | monthly
  const [reportRefDate, setReportRefDate] = useState(new Date().toISOString().split("T")[0]);
  const [report, setReport] = useState(null);
  
  // Email schedule dialog
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailSchedule, setEmailSchedule] = useState({
    enabled: false, frequency: "biweekly", recipients: [],
  });
  
  const [newRequest, setNewRequest] = useState({
    employee_id: "",
    date: new Date().toISOString().split("T")[0],
    hours_35: 0,
    hours_night: 0,
    hours_holiday: 0,
    hours_100: 0,
    reason: "",
    entryMode: "single",
    weekStart: getWeekStart(new Date()),
    weeklyHours: Array(7).fill({ hours_35: 0, hours_night: 0, hours_holiday: 0, hours_100: 0 })
  });

  // Filter requests list by the selected report period (using start/end from backend)
  const filteredRequests = (() => {
    if (!report?.start_date || !report?.end_date) return requests;
    return requests.filter(r => {
      const d = r.date;
      return d >= report.start_date && d <= report.end_date;
    });
  })();
  
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, empRes, periodsRes, configRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/overtime/requests?limit=50`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/employees?status=active`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/overtime/periods?limit=100`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/overtime/period-config`, { withCredentials: true }),
      ]);
      setRequests(reqRes.data);
      setEmployees(empRes.data);
      setPeriods(periodsRes.data || []);
      setCompanyPeriodType(configRes.data?.company_default || "biweekly");
    } catch (err) {
      console.error("Error fetching overtime data:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  
  // Fetch period report
  const fetchReport = useCallback(async () => {
    try {
      const res = await axios.get(
        `${API}/api/people-ops/overtime/report?period=${reportPeriod}&date=${reportRefDate}`,
        { withCredentials: true }
      );
      setReport(res.data);
    } catch (err) {
      setReport(null);
    }
  }, [reportPeriod, reportRefDate]);
  
  useEffect(() => { fetchReport(); }, [fetchReport, requests]);
  
  // Fetch email schedule once
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/api/people-ops/overtime/email-schedule`, { withCredentials: true });
        setEmailSchedule({
          enabled: !!res.data.enabled,
          frequency: res.data.frequency || "biweekly",
          recipients: res.data.recipients || [],
        });
      } catch (err) {
        // Silent: schedule may not exist yet
        console.debug("OT email schedule fetch:", err?.response?.status);
      }
    })();
  }, []);
  
  // Export handler
  const handleExport = async (format) => {
    try {
      const res = await axios.get(
        `${API}/api/people-ops/overtime/report/export?period=${reportPeriod}&date=${reportRefDate}&format=${format}`,
        { withCredentials: true, responseType: "blob" }
      );
      const url = window.URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      const ext = format === "xlsx" ? "xlsx" : "csv";
      link.download = `OT_Report_${reportRefDate}.${ext}`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.detail || "Export failed");
    }
  };
  
  const saveEmailSchedule = async () => {
    try {
      await axios.put(`${API}/api/people-ops/overtime/email-schedule`, emailSchedule, { withCredentials: true });
      setEmailDialogOpen(false);
      alert(isEs ? "Configuración guardada" : "Settings saved");
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };

  const handleCreateRequest = async () => {
    if (!newRequest.employee_id) {
      alert(isEs ? "Selecciona un empleado" : "Select an employee");
      return;
    }
    
    if (!newRequest.reason) {
      alert(isEs ? "Ingresa el motivo de las horas extras" : "Enter the reason for overtime");
      return;
    }
    
    setSubmitting(true);
    try {
      if (newRequest.entryMode === "weekly") {
        // Weekly mode - create multiple requests
        const validDays = newRequest.weeklyHours.filter(d => d && (d.hours_35 > 0 || (d.hours_night||0) > 0 || (d.hours_holiday||0) > 0 || d.hours_100 > 0));
        
        if (validDays.length === 0) {
          alert(isEs ? "Ingresa al menos una hora extra" : "Enter at least one overtime hour");
          setSubmitting(false);
          return;
        }
        
        let totalEstimated = 0;
        for (const day of validDays) {
          const response = await axios.post(`${API}/api/people-ops/overtime/requests`, {
            employee_id: newRequest.employee_id,
            date: day.date,
            hours_35: day.hours_35 || 0,
            hours_night: day.hours_night || 0,
            hours_holiday: day.hours_holiday || 0,
            hours_100: day.hours_100 || 0,
            reason: newRequest.reason
          }, { withCredentials: true });
          totalEstimated += response.data.estimated_amount || 0;
        }
        
        alert(isEs 
          ? `${validDays.length} solicitud(es) creada(s). Monto estimado total: ${formatCurrency(totalEstimated)}`
          : `${validDays.length} request(s) created. Total estimated: ${formatCurrency(totalEstimated)}`
        );
      } else {
        // Single day mode
        const hasAnyHours = (parseFloat(newRequest.hours_35)||0) > 0 || (parseFloat(newRequest.hours_night)||0) > 0 || (parseFloat(newRequest.hours_holiday)||0) > 0 || (parseFloat(newRequest.hours_100)||0) > 0;
        if (!hasAnyHours) {
          alert(isEs ? "Ingresa al menos un tipo de hora extra" : "Enter at least one overtime type");
          setSubmitting(false);
          return;
        }
        
        const response = await axios.post(`${API}/api/people-ops/overtime/requests`, {
          employee_id: newRequest.employee_id,
          date: newRequest.date,
          hours_35: parseFloat(newRequest.hours_35) || 0,
          hours_night: parseFloat(newRequest.hours_night) || 0,
          hours_holiday: parseFloat(newRequest.hours_holiday) || 0,
          hours_100: parseFloat(newRequest.hours_100) || 0,
          reason: newRequest.reason
        }, { withCredentials: true });
        
        if (response.data.estimated_amount) {
          alert(isEs 
            ? `Solicitud creada. Monto estimado: ${formatCurrency(response.data.estimated_amount)}`
            : `Request created. Estimated amount: ${formatCurrency(response.data.estimated_amount)}`
          );
        }
      }
      
      setLegacyDialogOpen(false);
      setNewRequest({
        employee_id: "",
        date: new Date().toISOString().split("T")[0],
        hours_35: 0,
        hours_night: 0,
        hours_holiday: 0,
        hours_100: 0,
        reason: "",
        entryMode: "single",
        weekStart: getWeekStart(new Date()),
        weeklyHours: Array(7).fill({ hours_35: 0, hours_night: 0, hours_holiday: 0, hours_100: 0 })
      });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error creating request");
    }
    setSubmitting(false);
  };

  const handleApprove = async (overtimeId) => {
    try {
      await axios.post(`${API}/api/people-ops/overtime/requests/${overtimeId}/approve`, {}, { withCredentials: true });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };

  const handleReject = async (overtimeId) => {
    const reason = prompt(isEs ? "Motivo del rechazo:" : "Rejection reason:");
    if (reason === null) return;
    try {
      await axios.post(`${API}/api/people-ops/overtime/requests/${overtimeId}/reject`, { reason }, { withCredentials: true });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };

  // Edit / Delete overtime request
  const [editingOt, setEditingOt] = useState(null);
  const [editOtData, setEditOtData] = useState({});

  const openEditOt = (req) => {
    setEditingOt(req);
    setEditOtData({
      date: req.date || "",
      hours_35: req.hours_35 || 0,
      hours_night: req.hours_night || 0,
      hours_holiday: req.hours_holiday || 0,
      hours_100: req.hours_100 || 0,
      reason: req.reason || "",
      notes: req.notes || ""
    });
  };

  const saveEditOt = async () => {
    try {
      await axios.put(
        `${API}/api/people-ops/overtime/requests/${editingOt.overtime_id}`,
        editOtData,
        { withCredentials: true }
      );
      setEditingOt(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || (isEs ? "Error al guardar" : "Error saving"));
    }
  };

  const handleDeleteOt = async (req) => {
    if (!window.confirm(isEs
      ? `¿Eliminar horas extras de ${req.employee_name} (${req.date})?`
      : `Delete overtime for ${req.employee_name} (${req.date})?`)) return;
    try {
      await axios.delete(`${API}/api/people-ops/overtime/requests/${req.overtime_id}`, { withCredentials: true });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || (isEs ? "Error al eliminar" : "Error deleting"));
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const pendingCount = requests.filter(r => r.status === "pending").length;
  const approvedThisMonth = requests.filter(r => r.status === "approved" || r.status === "processed");
  const totalHoursThisMonth = approvedThisMonth.reduce((sum, r) => sum + (r.total_hours || 0), 0);
  const totalAmountThisMonth = approvedThisMonth.reduce((sum, r) => sum + (r.estimated_amount || 0), 0);

  return (
    <div className="space-y-6" data-testid="overtime-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5" />
            {isEs ? "Horas Extras" : "Overtime"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Registro y aprobación de horas extras" : "Overtime registration and approval"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}><RefreshCw className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setEmailDialogOpen(true)} data-testid="email-schedule-btn">
            <Mail className="w-4 h-4 mr-1" />
            {isEs ? "Email" : "Email"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setLegacyDialogOpen(true)} data-testid="new-overtime-legacy-btn" title={isEs ? "Modo antiguo (1 día)" : "Legacy (single day)"}>
            <Clock className="w-4 h-4 mr-1" />
            {isEs ? "Día suelto" : "Single day"}
          </Button>
          <Button onClick={() => setPeriodDialogOpen(true)} data-testid="new-overtime-period-btn">
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Nuevo Período" : "New Period"}
          </Button>
        </div>
      </div>

      {/* Períodos de Horas Extras (nuevo flujo) */}
      <Card data-testid="ot-periods-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                {isEs ? "Períodos de Horas Extras" : "Overtime Periods"}
                <Badge variant="outline" className="text-[10px]">{periods.length}</Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                {isEs
                  ? `Empresa: default ${companyPeriodType === "weekly" ? "Semanal" : companyPeriodType === "biweekly" ? "Quincenal" : "Mensual"}`
                  : `Company default: ${companyPeriodType}`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {periods.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {isEs ? "Sin períodos aún. Crea uno con el botón \"Nuevo Período\"." : "No periods yet. Create one with \"New Period\"."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Empleado" : "Employee"}</TableHead>
                  <TableHead>{isEs ? "Período" : "Period"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Horas totales" : "Total hours"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Estimado" : "Estimated"}</TableHead>
                  <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Acciones" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((p) => {
                  const isExpanded = expandedPeriodId === p.overtime_period_id;
                  const statusColor = p.status === "approved" ? "bg-emerald-100 text-emerald-700"
                    : p.status === "rejected" ? "bg-red-100 text-red-700"
                    : p.status === "paid" ? "bg-blue-100 text-blue-700"
                    : "bg-amber-100 text-amber-700";
                  return (
                    <>
                      <TableRow key={p.overtime_period_id} data-testid={`period-row-${p.overtime_period_id}`}>
                        <TableCell className="font-medium">{p.employee_name}</TableCell>
                        <TableCell>
                          <span className="text-xs font-mono">{p.start_date} → {p.end_date}</span>
                          <span className="text-[10px] text-muted-foreground ml-1">({p.period_type})</span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{p.totals?.total_hours ?? 0}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(p.estimated_amount || 0)}</TableCell>
                        <TableCell><Badge className={statusColor}>{p.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setExpandedPeriodId(isExpanded ? null : p.overtime_period_id)} data-testid={`toggle-period-detail-${p.overtime_period_id}`}>
                              {isExpanded ? (isEs ? "Ocultar" : "Hide") : (isEs ? "Ver detalle" : "Details")}
                            </Button>
                            {p.status === "pending" && (
                              <>
                                <Button size="sm" variant="ghost" className="text-emerald-600 hover:text-emerald-800"
                                  onClick={async () => {
                                    try {
                                      await axios.post(`${API}/api/people-ops/overtime/periods/${p.overtime_period_id}/approve`, {}, { withCredentials: true });
                                      fetchData();
                                    } catch (err) { console.error(err); }
                                  }}
                                  data-testid={`approve-period-${p.overtime_period_id}`}
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-800"
                                  onClick={async () => {
                                    const reason = window.prompt(isEs ? "Motivo del rechazo:" : "Rejection reason:", "");
                                    if (reason === null) return;
                                    try {
                                      await axios.post(`${API}/api/people-ops/overtime/periods/${p.overtime_period_id}/reject`, { reason }, { withCredentials: true });
                                      fetchData();
                                    } catch (err) { console.error(err); }
                                  }}
                                  data-testid={`reject-period-${p.overtime_period_id}`}
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {p.status !== "paid" && (
                              <Button size="sm" variant="ghost" className="text-red-600"
                                onClick={async () => {
                                  if (!window.confirm(isEs ? "¿Eliminar este período?" : "Delete this period?")) return;
                                  try {
                                    await axios.delete(`${API}/api/people-ops/overtime/periods/${p.overtime_period_id}`, { withCredentials: true });
                                    fetchData();
                                  } catch (err) { console.error(err); }
                                }}
                                data-testid={`delete-period-${p.overtime_period_id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-slate-50 p-3">
                            <div className="text-xs font-semibold uppercase text-slate-600 mb-2">
                              {isEs ? "Detalle por día" : "Daily detail"}
                            </div>
                            {(p.daily_entries && p.daily_entries.length > 0) ? (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b text-slate-500">
                                    <th className="text-left py-1">{isEs ? "Fecha" : "Date"}</th>
                                    <th className="text-right py-1">Normal</th>
                                    <th className="text-right py-1">Nocturna</th>
                                    <th className="text-right py-1">Feriado</th>
                                    <th className="text-right py-1">Extra 100%</th>
                                    <th className="text-left py-1 pl-4">Notas</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.daily_entries.map((e, idx) => (
                                    <tr key={idx} className="border-b border-slate-200">
                                      <td className="py-1 font-mono">{e.date}</td>
                                      <td className="text-right py-1">{e.hours_35 || 0}</td>
                                      <td className="text-right py-1">{e.hours_night || 0}</td>
                                      <td className="text-right py-1">{e.hours_holiday || 0}</td>
                                      <td className="text-right py-1">{e.hours_100 || 0}</td>
                                      <td className="py-1 pl-4 text-slate-500">{e.notes || "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : <p className="text-xs text-muted-foreground">{isEs ? "Sin detalles" : "No details"}</p>}
                            {p.reason && <p className="text-xs mt-2"><b>{isEs ? "Motivo:" : "Reason:"}</b> {p.reason}</p>}
                            {p.notes && <p className="text-xs"><b>{isEs ? "Notas:" : "Notes:"}</b> {p.notes}</p>}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Period dialog (new flow) */}
      <OvertimePeriodDialog
        open={periodDialogOpen}
        onClose={() => setPeriodDialogOpen(false)}
        onSaved={fetchData}
        employees={employees}
        defaultPeriodType={companyPeriodType}
        isEs={isEs}
      />
      
      {/* Period Report — filters + summary */}
      <Card data-testid="ot-report-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-violet-600" />
              <CardTitle className="text-base">
                {isEs ? "Reporte por Período" : "Period Report"}
                {report?.label ? ` — ${report.label}` : ""}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={reportPeriod} onValueChange={setReportPeriod}>
                <SelectTrigger className="w-36" data-testid="report-period-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">{isEs ? "Semanal" : "Weekly"}</SelectItem>
                  <SelectItem value="biweekly">{isEs ? "Quincenal" : "Biweekly"}</SelectItem>
                  <SelectItem value="monthly">{isEs ? "Mensual" : "Monthly"}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                className="w-40"
                value={reportRefDate}
                onChange={(e) => setReportRefDate(e.target.value)}
                data-testid="report-ref-date"
              />
              <Button variant="outline" size="sm" onClick={() => handleExport("csv")} data-testid="export-csv-btn">
                <Download className="w-4 h-4 mr-1" />CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")} data-testid="export-xlsx-btn">
                <Download className="w-4 h-4 mr-1" />Excel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {report && report.rows && report.rows.length > 0 ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="p-3 rounded-md bg-violet-50 border border-violet-100">
                  <p className="text-xs text-violet-700">{isEs ? "Empleados" : "Employees"}</p>
                  <p className="text-2xl font-bold text-violet-900">{report.totals.employees}</p>
                </div>
                <div className="p-3 rounded-md bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-700">{isEs ? "Total Horas" : "Total Hours"}</p>
                  <p className="text-2xl font-bold text-blue-900">{report.totals.total_hours}h</p>
                </div>
                <div className="p-3 rounded-md bg-amber-50 border border-amber-100">
                  <p className="text-xs text-amber-700">{isEs ? "Solicitudes" : "Requests"}</p>
                  <p className="text-2xl font-bold text-amber-900">{report.totals.ot_count}</p>
                </div>
                <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200">
                  <p className="text-xs text-emerald-700">{isEs ? "Monto Estimado" : "Estimated Amount"}</p>
                  <p className="text-2xl font-bold text-emerald-900">{formatCurrency(report.totals.estimated_amount)}</p>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Empleado" : "Employee"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Salario" : "Salary"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Hora Normal" : "Hourly"}</TableHead>
                    <TableHead className="text-center">35%</TableHead>
                    <TableHead className="text-center">15%</TableHead>
                    <TableHead className="text-center">F/D</TableHead>
                    <TableHead className="text-center">100%</TableHead>
                    <TableHead className="text-right">{isEs ? "Total Hrs" : "Total Hrs"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Monto" : "Amount"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((r) => (
                    <TableRow key={r.employee_id} data-testid={`report-row-${r.employee_id}`}>
                      <TableCell className="font-medium">{r.employee_name}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatCurrency(r.base_salary || 0)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatCurrency(r.hourly_rate || 0)}</TableCell>
                      <TableCell className="text-center">{r.hours_35 || "-"}</TableCell>
                      <TableCell className="text-center">{r.hours_night || "-"}</TableCell>
                      <TableCell className="text-center">{r.hours_holiday || "-"}</TableCell>
                      <TableCell className="text-center">{r.hours_100 || "-"}</TableCell>
                      <TableCell className="text-right font-medium">{r.total_hours}h</TableCell>
                      <TableCell className="text-right font-bold text-emerald-700">{formatCurrency(r.estimated_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              {isEs ? "Sin horas extras registradas en este período" : "No overtime logged in this period"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={pendingCount > 0 ? "border-amber-300 bg-amber-50/30" : ""}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <Clock className="w-4 h-4" />
              {isEs ? "Pendientes de Aprobación" : "Pending Approval"}
            </div>
            <p className="text-3xl font-bold mt-1">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <CheckCircle className="w-4 h-4" />
              {isEs ? "Aprobadas (Mes)" : "Approved (Month)"}
            </div>
            <p className="text-3xl font-bold mt-1">{approvedThisMonth.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-blue-600 text-sm">
              <Clock className="w-4 h-4" />
              {isEs ? "Total Horas (Mes)" : "Total Hours (Month)"}
            </div>
            <p className="text-3xl font-bold mt-1 text-blue-600">{totalHoursThisMonth.toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-emerald-600 text-sm">
              <DollarSign className="w-4 h-4" />
              {isEs ? "Costo Estimado (Mes)" : "Est. Cost (Month)"}
            </div>
            <p className="text-2xl font-bold mt-1 text-emerald-700">{formatCurrency(totalAmountThisMonth)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Info Banner */}
      <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">{isEs ? "Tasas de Horas Extras (Código de Trabajo RD)" : "Overtime Rates (RD Labor Code)"}</p>
          <div className="flex gap-6 mt-1 text-xs">
            <span className="flex items-center gap-1">
              <Sun className="w-3 h-3" />
              {isEs ? "Normal (35%): 1.35x del salario hora" : "Normal (35%): 1.35x hourly rate"}
            </span>
            <span className="flex items-center gap-1">
              <Moon className="w-3 h-3" />
              {isEs ? "Nocturna/Feriado (100%): 2.0x del salario hora" : "Night/Holiday (100%): 2.0x hourly rate"}
            </span>
          </div>
        </div>
      </div>

      {/* Requests Table */}
      <Card>
        <CardContent className="p-0">
          {/* Period filter badge */}
          {report?.label && (
            <div className="px-4 py-2 border-b bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
              <span>
                {isEs ? "Filtrado por:" : "Filtered by:"} <strong>{report.label}</strong> ({report.start_date} → {report.end_date})
              </span>
              <span>{filteredRequests.length} {isEs ? "registros" : "records"}</span>
            </div>
          )}
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{isEs ? "No hay registros de horas extras en el período seleccionado" : "No overtime records in selected period"}</p>
              {requests.length > 0 && (
                <p className="text-xs mt-1">{isEs ? `Hay ${requests.length} registros en otros períodos. Cambia el filtro arriba.` : `${requests.length} records exist in other periods. Change the filter above.`}</p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Empleado" : "Employee"}</TableHead>
                  <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Sun className="w-3 h-3" />
                      35%
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Moon className="w-3 h-3 text-indigo-500" />
                      15%
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Moon className="w-3 h-3 text-rose-500" />
                      F/D
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Moon className="w-3 h-3" />
                      100%
                    </div>
                  </TableHead>
                  <TableHead className="text-center">{isEs ? "Total Hrs" : "Total Hrs"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Monto Est." : "Est. Amount"}</TableHead>
                  <TableHead>{isEs ? "Motivo" : "Reason"}</TableHead>
                  <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                  <TableHead>{isEs ? "Acciones" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((req) => (
                  <TableRow key={req.overtime_id} data-testid={`overtime-${req.overtime_id}`}>
                    <TableCell className="font-medium">{req.employee_name}</TableCell>
                    <TableCell>{req.date}</TableCell>
                    <TableCell className="text-center">
                      {req.hours_35 > 0 ? (
                        <Badge variant="outline" className="bg-amber-50">{req.hours_35}h</Badge>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {(req.hours_night || 0) > 0 ? (
                        <Badge variant="outline" className="bg-indigo-50">{req.hours_night}h</Badge>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {(req.hours_holiday || 0) > 0 ? (
                        <Badge variant="outline" className="bg-rose-50">{req.hours_holiday}h</Badge>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {req.hours_100 > 0 ? (
                        <Badge variant="outline" className="bg-purple-50">{req.hours_100}h</Badge>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="text-center font-medium">{req.total_hours}h</TableCell>
                    <TableCell className="text-right font-medium text-emerald-600">
                      {formatCurrency(req.estimated_amount)}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate" title={req.reason}>
                      {req.reason}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_CONFIG[req.status]?.color}>
                        {isEs ? STATUS_CONFIG[req.status]?.label : STATUS_CONFIG[req.status]?.labelEn}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 items-center">
                        {req.status === "pending" && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleApprove(req.overtime_id)}
                              className="text-emerald-600"
                              data-testid={`approve-overtime-${req.overtime_id}`}
                            >
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleReject(req.overtime_id)}
                              className="text-red-600"
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        {req.status === "approved" && (
                          <Badge variant="outline" className="text-xs">
                            {isEs ? "Listo para nómina" : "Ready for payroll"}
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditOt(req)}
                          className="text-blue-600 hover:bg-blue-50 h-7 w-7 p-0"
                          title={isEs ? "Editar" : "Edit"}
                          data-testid={`edit-overtime-${req.overtime_id}`}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteOt(req)}
                          className="text-red-600 hover:bg-red-50 h-7 w-7 p-0"
                          title={isEs ? "Eliminar" : "Delete"}
                          data-testid={`delete-overtime-${req.overtime_id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Overtime Dialog */}
      <Dialog open={legacyDialogOpen} onOpenChange={setLegacyDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEs ? "Registrar Horas Extras" : "Log Overtime Hours"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Empleado *" : "Employee *"}</label>
              <Select value={newRequest.employee_id} onValueChange={(v) => setNewRequest({ ...newRequest, employee_id: v })}>
                <SelectTrigger data-testid="overtime-employee-select">
                  <SelectValue placeholder={isEs ? "Seleccionar empleado" : "Select employee"} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.employee_id} value={emp.employee_id}>{emp.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Inline salary + hourly rate info for selected employee */}
              {newRequest.employee_id && (() => {
                const emp = employees.find(e => e.employee_id === newRequest.employee_id);
                if (!emp) return null;
                const base = parseFloat(emp.base_salary) || 0;
                const freq = emp.payment_frequency || "biweekly";
                const monthly = freq === "monthly" ? base : (freq === "biweekly" ? base * 2 : base * 4);
                const hoursPerMonth = report?.totals ? 192 : 192;  // fallback constant; rate read from config server-side
                const hourly = monthly / hoursPerMonth;
                return (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2 rounded bg-muted/40 border" data-testid="emp-salary-info">
                      <p className="text-muted-foreground">{isEs ? "Salario base" : "Base salary"}</p>
                      <p className="font-semibold">{formatCurrency(base)} <span className="text-muted-foreground font-normal">/{freq}</span></p>
                    </div>
                    <div className="p-2 rounded bg-muted/40 border">
                      <p className="text-muted-foreground">{isEs ? "Salario mensual eq." : "Monthly eq."}</p>
                      <p className="font-semibold">{formatCurrency(monthly)}</p>
                    </div>
                    <div className="p-2 rounded bg-violet-50 border border-violet-200">
                      <p className="text-violet-700">{isEs ? "Hora normal" : "Hourly rate"}</p>
                      <p className="font-semibold text-violet-900" data-testid="emp-hourly-rate">{formatCurrency(hourly)}</p>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Entry Mode Selection */}
            <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
              <span className="text-sm font-medium">{isEs ? "Modo de Entrada:" : "Entry Mode:"}</span>
              <div className="flex gap-2">
                <Button 
                  variant={newRequest.entryMode !== "weekly" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setNewRequest({ ...newRequest, entryMode: "single" })}
                >
                  {isEs ? "Día Individual" : "Single Day"}
                </Button>
                <Button 
                  variant={newRequest.entryMode === "weekly" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setNewRequest({ ...newRequest, entryMode: "weekly", weekStart: getWeekStart(new Date()) })}
                >
                  {isEs ? "Semana Completa" : "Full Week"}
                </Button>
              </div>
            </div>

            {/* Single Day Entry */}
            {newRequest.entryMode !== "weekly" && (
              <>
                <div>
                  <label className="text-sm font-medium">{isEs ? "Fecha *" : "Date *"}</label>
                  <Input
                    type="date"
                    value={newRequest.date}
                    onChange={(e) => setNewRequest({ ...newRequest, date: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Sun className="w-4 h-4 text-amber-500" />
                      {isEs ? "Hora Normal (35%)" : "Normal OT (35%)"}
                    </label>
                    <Input
                      data-testid="ot-input-35"
                      type="number" step="0.5" min="0" max="12"
                      value={newRequest.hours_35}
                      onChange={(e) => setNewRequest({ ...newRequest, hours_35: e.target.value })}
                      placeholder="0"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {isEs ? "Lun-Vie después de horario" : "Mon-Fri after hours"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Moon className="w-4 h-4 text-indigo-500" />
                      {isEs ? "Trabajo Nocturno (15%)" : "Night Shift (15%)"}
                    </label>
                    <Input
                      data-testid="ot-input-night"
                      type="number" step="0.5" min="0" max="12"
                      value={newRequest.hours_night}
                      onChange={(e) => setNewRequest({ ...newRequest, hours_night: e.target.value })}
                      placeholder="0"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {isEs ? "Entre 9pm – 7am" : "Between 9pm – 7am"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Moon className="w-4 h-4 text-rose-500" />
                      {isEs ? "Feriado / Domingo (100%)" : "Holiday/Sunday (100%)"}
                    </label>
                    <Input
                      data-testid="ot-input-holiday"
                      type="number" step="0.5" min="0" max="12"
                      value={newRequest.hours_holiday}
                      onChange={(e) => setNewRequest({ ...newRequest, hours_holiday: e.target.value })}
                      placeholder="0"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {isEs ? "Domingo o feriado nacional" : "Sunday or national holiday"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Moon className="w-4 h-4 text-purple-500" />
                      {isEs ? "Hora Extra 100% (>68h)" : "Extra 100% (>68h)"}
                    </label>
                    <Input
                      data-testid="ot-input-100"
                      type="number" step="0.5" min="0" max="12"
                      value={newRequest.hours_100}
                      onChange={(e) => setNewRequest({ ...newRequest, hours_100: e.target.value })}
                      placeholder="0"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {isEs ? "Excede 68 hrs/semana" : "Above 68 hrs/week"}
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Weekly Entry */}
            {newRequest.entryMode === "weekly" && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">{isEs ? "Semana del" : "Week of"}</label>
                  <Input
                    type="date"
                    value={newRequest.weekStart}
                    onChange={(e) => setNewRequest({ ...newRequest, weekStart: e.target.value })}
                  />
                </div>
                
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-2 text-left">{isEs ? "Día" : "Day"}</th>
                        <th className="p-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Sun className="w-3 h-3 text-amber-500" />
                            35%
                          </div>
                        </th>
                        <th className="p-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Moon className="w-3 h-3 text-purple-500" />
                            100%
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {getWeekDays(newRequest.weekStart).map((day, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                          <td className="p-2">
                            <div>
                              <span className="font-medium">{day.dayName}</span>
                              <span className="text-muted-foreground ml-2 text-xs">{day.date}</span>
                            </div>
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              step="0.5"
                              min="0"
                              max="12"
                              className="w-20 h-8 text-center mx-auto"
                              value={newRequest.weeklyHours?.[idx]?.hours_35 || ""}
                              onChange={(e) => {
                                const weeklyHours = [...(newRequest.weeklyHours || Array(7).fill({ hours_35: 0, hours_100: 0 }))];
                                weeklyHours[idx] = { ...weeklyHours[idx], hours_35: parseFloat(e.target.value) || 0, date: day.fullDate };
                                setNewRequest({ ...newRequest, weeklyHours });
                              }}
                              placeholder="0"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              step="0.5"
                              min="0"
                              max="12"
                              className="w-20 h-8 text-center mx-auto"
                              value={newRequest.weeklyHours?.[idx]?.hours_100 || ""}
                              onChange={(e) => {
                                const weeklyHours = [...(newRequest.weeklyHours || Array(7).fill({ hours_35: 0, hours_100: 0 }))];
                                weeklyHours[idx] = { ...weeklyHours[idx], hours_100: parseFloat(e.target.value) || 0, date: day.fullDate };
                                setNewRequest({ ...newRequest, weeklyHours });
                              }}
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/50 font-medium">
                      <tr>
                        <td className="p-2">{isEs ? "Total Semana" : "Week Total"}</td>
                        <td className="p-2 text-center">
                          {(newRequest.weeklyHours || []).reduce((sum, d) => sum + (d?.hours_35 || 0), 0)}h
                        </td>
                        <td className="p-2 text-center">
                          {(newRequest.weeklyHours || []).reduce((sum, d) => sum + (d?.hours_100 || 0), 0)}h
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">{isEs ? "Motivo *" : "Reason *"}</label>
              <Textarea
                value={newRequest.reason}
                onChange={(e) => setNewRequest({ ...newRequest, reason: e.target.value })}
                placeholder={isEs ? "Describe el motivo de las horas extras..." : "Describe the reason for overtime..."}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLegacyDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreateRequest} disabled={submitting}>
              {submitting && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              {isEs ? "Registrar" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Email Schedule Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="max-w-md" data-testid="email-schedule-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-violet-600" />
              {isEs ? "Email automático del reporte" : "Auto email digest"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-muted/40 border">
              <div className="flex-1">
                <p className="text-sm font-medium">{isEs ? "Activar envío automático" : "Enable auto-send"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isEs ? "Recibe el reporte de horas extras por email automáticamente." : "Receive the OT report automatically by email."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={emailSchedule.enabled}
                onClick={() => setEmailSchedule({ ...emailSchedule, enabled: !emailSchedule.enabled })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${emailSchedule.enabled ? "bg-violet-600" : "bg-muted"}`}
                data-testid="email-enabled-toggle"
              >
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${emailSchedule.enabled ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Frecuencia" : "Frequency"}</label>
              <Select value={emailSchedule.frequency} onValueChange={(v) => setEmailSchedule({ ...emailSchedule, frequency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">{isEs ? "Semanal (cada lunes 8:30am)" : "Weekly (every Mon 8:30am)"}</SelectItem>
                  <SelectItem value="biweekly">{isEs ? "Quincenal (Lun 1 y 3 del mes)" : "Biweekly (Mon weeks 1 & 3)"}</SelectItem>
                  <SelectItem value="monthly">{isEs ? "Mensual (primer Lun del mes)" : "Monthly (first Mon of month)"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">
                {isEs ? "Destinatarios" : "Recipients"}
                <span className="text-xs text-muted-foreground ml-2">{isEs ? "(separados por coma. Si vacío, se envía a admins)" : "(comma-separated. Empty = company admins)"}</span>
              </label>
              <Input
                placeholder="hr@empresa.com, admin@empresa.com"
                value={emailSchedule.recipients.join(", ")}
                onChange={(e) => setEmailSchedule({ ...emailSchedule, recipients: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                data-testid="email-recipients"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={saveEmailSchedule} data-testid="save-email-schedule">{isEs ? "Guardar" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Overtime Dialog */}
      <Dialog open={!!editingOt} onOpenChange={(o) => !o && setEditingOt(null)}>
        <DialogContent className="max-w-lg" data-testid="edit-overtime-dialog">
          <DialogHeader>
            <DialogTitle>{isEs ? "Editar Horas Extras" : "Edit Overtime"}</DialogTitle>
          </DialogHeader>
          {editingOt && (
            <div className="space-y-3 py-2">
              <div className="p-3 rounded-lg bg-muted/40 text-sm">
                <p className="font-medium">{editingOt.employee_name}</p>
                <p className="text-xs text-muted-foreground">{isEs ? "Estimado" : "Estimated"}: {formatCurrency(editingOt.estimated_amount)}</p>
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha" : "Date"}</label>
                <Input
                  type="date"
                  value={editOtData.date}
                  onChange={(e) => setEditOtData({ ...editOtData, date: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">{isEs ? "Horas Normales (35%)" : "Normal (35%)"}</label>
                  <Input
                    type="number" min="0" step="0.5"
                    value={editOtData.hours_35}
                    onChange={(e) => setEditOtData({ ...editOtData, hours_35: parseFloat(e.target.value) || 0 })}
                    data-testid="edit-ot-hours-35"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{isEs ? "Nocturnas (15%)" : "Night (15%)"}</label>
                  <Input
                    type="number" min="0" step="0.5"
                    value={editOtData.hours_night}
                    onChange={(e) => setEditOtData({ ...editOtData, hours_night: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{isEs ? "Feriado (100%)" : "Holiday (100%)"}</label>
                  <Input
                    type="number" min="0" step="0.5"
                    value={editOtData.hours_holiday}
                    onChange={(e) => setEditOtData({ ...editOtData, hours_holiday: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{isEs ? "Día Libre (100%)" : "Day Off (100%)"}</label>
                  <Input
                    type="number" min="0" step="0.5"
                    value={editOtData.hours_100}
                    onChange={(e) => setEditOtData({ ...editOtData, hours_100: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Motivo" : "Reason"}</label>
                <Input
                  value={editOtData.reason}
                  onChange={(e) => setEditOtData({ ...editOtData, reason: e.target.value })}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {isEs ? "El monto estimado se recalculará automáticamente al guardar." : "Estimated amount will be recalculated automatically on save."}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOt(null)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={saveEditOt} data-testid="save-edit-overtime">{isEs ? "Guardar" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
