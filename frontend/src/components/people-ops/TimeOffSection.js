import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "../ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "../ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "../ui/table";
import {
  Calendar, Clock, Plus, RefreshCw, CheckCircle, XCircle,
  AlertCircle, User, CalendarDays, Palmtree, HeartPulse, Baby, RotateCcw, AlertOctagon, History
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const TIME_OFF_TYPES = {
  vacation: { label: "Vacaciones", labelEn: "Vacation", icon: Palmtree, color: "bg-emerald-100 text-emerald-700" },
  sick_leave: { label: "Licencia Médica", labelEn: "Sick Leave", icon: HeartPulse, color: "bg-red-100 text-red-700" },
  personal_leave: { label: "Permiso Personal", labelEn: "Personal Leave", icon: User, color: "bg-blue-100 text-blue-700" },
  maternity: { label: "Maternidad", labelEn: "Maternity", icon: Baby, color: "bg-pink-100 text-pink-700" },
  paternity: { label: "Paternidad", labelEn: "Paternity", icon: Baby, color: "bg-cyan-100 text-cyan-700" },
  bereavement: { label: "Duelo", labelEn: "Bereavement", icon: Calendar, color: "bg-gray-100 text-gray-700" },
  unpaid_leave: { label: "Sin Sueldo", labelEn: "Unpaid Leave", icon: Calendar, color: "bg-amber-100 text-amber-700" }
};

const STATUS_CONFIG = {
  pending: { label: "Pendiente", labelEn: "Pending", color: "bg-amber-100 text-amber-700" },
  approved: { label: "Aprobada", labelEn: "Approved", color: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rechazada", labelEn: "Rejected", color: "bg-red-100 text-red-700" },
  cancelled: { label: "Cancelada", labelEn: "Cancelled", color: "bg-gray-100 text-gray-700" }
};

export function TimeOffSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [activeTab, setActiveTab] = useState("requests");
  const [requests, setRequests] = useState([]);
  const [balances, setBalances] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recalcingAll, setRecalcingAll] = useState(false);
  
  // Balances filters
  const [balanceFilter, setBalanceFilter] = useState("all"); // all | override | low | anniversary_soon
  const [balanceSearch, setBalanceSearch] = useState("");
  
  const [newRequest, setNewRequest] = useState({
    employee_id: "",
    time_off_type: "vacation",
    start_date: "",
    end_date: "",
    total_days: 1,
    reason: ""
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, balRes, empRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/time-off/requests?limit=50`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/time-off/balances`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/employees?status=active`, { withCredentials: true })
      ]);
      setRequests(reqRes.data);
      setBalances(balRes.data);
      setEmployees(empRes.data);
    } catch (err) {
      console.error("Error fetching time off data:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  
  const handleRecalcAll = async () => {
    if (!window.confirm(isEs
      ? "¿Recalcular vacaciones por antigüedad para TODOS los empleados activos? (Los empleados con ajuste manual serán omitidos)"
      : "Recalculate vacation days by tenure for ALL active employees? (Employees with manual override will be skipped)")) return;
    setRecalcingAll(true);
    try {
      const res = await axios.post(`${API}/api/people-ops/time-off/recalculate-all`, {}, { withCredentials: true });
      alert(isEs
        ? `Actualizados: ${res.data.updated}. Omitidos (ajuste manual): ${res.data.skipped_manual_override}`
        : `Updated: ${res.data.updated}. Skipped (manual override): ${res.data.skipped_manual_override}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || (isEs ? "Error" : "Error"));
    }
    setRecalcingAll(false);
  };
  
  const handleAnniversaryReset = async (employeeId, employeeName) => {
    if (!window.confirm(isEs
      ? `¿Ejecutar reinicio de aniversario para ${employeeName}? Los días disponibles actuales se acumularán (carry-over ilimitado) y se sumarán a los nuevos días del año.`
      : `Trigger anniversary reset for ${employeeName}? Current available days will carry over (unlimited) and be added to the new year's entitlement.`)) return;
    try {
      const res = await axios.post(`${API}/api/people-ops/time-off/reset-anniversary/${employeeId}`, {}, { withCredentials: true });
      alert(isEs
        ? `Listo. Carry-over: ${res.data.carryover_in} · Nuevos días: ${res.data.new_entitled} · Total disponible: ${res.data.new_available}`
        : `Done. Carry-over: ${res.data.carryover_in} · New days: ${res.data.new_entitled} · Total available: ${res.data.new_available}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || (isEs ? "Error" : "Error"));
    }
  };
  
  const filteredBalances = balances.filter(b => {
    if (balanceSearch && !b.employee_name?.toLowerCase().includes(balanceSearch.toLowerCase())) return false;
    if (balanceFilter === "override" && !b.manual_override) return false;
    if (balanceFilter === "low" && b.vacation_available > 5) return false;
    if (balanceFilter === "anniversary_soon" && (b.days_until_anniversary === null || b.days_until_anniversary > 30)) return false;
    return true;
  });

  const calculateDays = (start, end) => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffTime = endDate - startDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, diffDays);
  };

  const handleDateChange = (field, value) => {
    const updated = { ...newRequest, [field]: value };
    if (updated.start_date && updated.end_date) {
      updated.total_days = calculateDays(updated.start_date, updated.end_date);
    }
    setNewRequest(updated);
  };

  const handleCreateRequest = async () => {
    if (!newRequest.employee_id || !newRequest.start_date || !newRequest.end_date) {
      alert(isEs ? "Completa todos los campos requeridos" : "Complete all required fields");
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/people-ops/time-off/requests`, newRequest, { withCredentials: true });
      setDialogOpen(false);
      setNewRequest({ employee_id: "", time_off_type: "vacation", start_date: "", end_date: "", total_days: 1, reason: "" });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error creating request");
    }
    setSubmitting(false);
  };

  const handleApprove = async (requestId) => {
    try {
      await axios.post(`${API}/api/people-ops/time-off/requests/${requestId}/approve`, {}, { withCredentials: true });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };

  const handleReject = async (requestId) => {
    const reason = prompt(isEs ? "Motivo del rechazo:" : "Rejection reason:");
    if (reason === null) return;
    try {
      await axios.post(`${API}/api/people-ops/time-off/requests/${requestId}/reject`, { reason }, { withCredentials: true });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <div className="space-y-6" data-testid="time-off-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {isEs ? "Tiempo y Ausencias" : "Time Off"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Gestión de vacaciones, licencias y permisos" : "Manage vacations, leaves and time off"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}><RefreshCw className="w-4 h-4" /></Button>
          <Button onClick={() => setDialogOpen(true)} data-testid="new-time-off-btn">
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Nueva Solicitud" : "New Request"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              {isEs ? "Aprobadas (Este Mes)" : "Approved (This Month)"}
            </div>
            <p className="text-3xl font-bold mt-1">
              {requests.filter(r => r.status === "approved").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <CalendarDays className="w-4 h-4" />
              {isEs ? "Días Solicitados (Mes)" : "Days Requested (Month)"}
            </div>
            <p className="text-3xl font-bold mt-1">
              {requests.filter(r => r.status === "approved").reduce((sum, r) => sum + (r.total_days || 0), 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="requests">
            {isEs ? "Solicitudes" : "Requests"}
            {pendingCount > 0 && <Badge className="ml-2 bg-amber-500">{pendingCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="balances">{isEs ? "Balances" : "Balances"}</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {requests.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>{isEs ? "No hay solicitudes" : "No requests"}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isEs ? "Empleado" : "Employee"}</TableHead>
                      <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                      <TableHead>{isEs ? "Fechas" : "Dates"}</TableHead>
                      <TableHead className="text-center">{isEs ? "Días" : "Days"}</TableHead>
                      <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                      <TableHead>{isEs ? "Acciones" : "Actions"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((req) => {
                      const typeConfig = TIME_OFF_TYPES[req.time_off_type] || TIME_OFF_TYPES.vacation;
                      const TypeIcon = typeConfig.icon;
                      return (
                        <TableRow key={req.request_id} data-testid={`request-${req.request_id}`}>
                          <TableCell className="font-medium">{req.employee_name}</TableCell>
                          <TableCell>
                            <Badge className={`${typeConfig.color} flex items-center gap-1 w-fit`}>
                              <TypeIcon className="w-3 h-3" />
                              {isEs ? typeConfig.label : typeConfig.labelEn}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {req.start_date} → {req.end_date}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{req.total_days}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={STATUS_CONFIG[req.status]?.color}>
                              {isEs ? STATUS_CONFIG[req.status]?.label : STATUS_CONFIG[req.status]?.labelEn}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {req.status === "pending" && (
                              <div className="flex gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleApprove(req.request_id)}
                                  className="text-emerald-600"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleReject(req.request_id)}
                                  className="text-red-600"
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balances" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">{isEs ? "Balance de Vacaciones" : "Vacation Balances"}</CardTitle>
                  <CardDescription>
                    {isEs
                      ? "Días por empleado · Reinicio automático en aniversario con carry-over ilimitado"
                      : "Days per employee · Auto-reset on anniversary with unlimited carry-over"}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    placeholder={isEs ? "Buscar empleado..." : "Search employee..."}
                    value={balanceSearch}
                    onChange={(e) => setBalanceSearch(e.target.value)}
                    className="w-48 h-9"
                    data-testid="balance-search"
                  />
                  <Select value={balanceFilter} onValueChange={setBalanceFilter}>
                    <SelectTrigger className="w-56 h-9" data-testid="balance-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
                      <SelectItem value="override">{isEs ? "Con ajuste manual" : "Manual override"}</SelectItem>
                      <SelectItem value="low">{isEs ? "Bajos disponibles (≤5)" : "Low available (≤5)"}</SelectItem>
                      <SelectItem value="anniversary_soon">{isEs ? "Aniversario ≤30 días" : "Anniversary ≤30 days"}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRecalcAll}
                    disabled={recalcingAll}
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                    data-testid="recalc-all-btn"
                  >
                    {recalcingAll ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
                    {isEs ? "Recalcular todos" : "Recalc all"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Empleado" : "Employee"}</TableHead>
                    <TableHead className="text-center">{isEs ? "Antigüedad" : "Tenure"}</TableHead>
                    <TableHead>{isEs ? "Próx. Aniversario" : "Next Anniv."}</TableHead>
                    <TableHead className="text-center">{isEs ? "Asignados" : "Entitled"}</TableHead>
                    <TableHead className="text-center">{isEs ? "Usados" : "Used"}</TableHead>
                    <TableHead className="text-center">{isEs ? "Pendientes" : "Pending"}</TableHead>
                    <TableHead className="text-center">{isEs ? "Disponibles" : "Available"}</TableHead>
                    <TableHead className="text-center">{isEs ? "Acciones" : "Actions"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBalances.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                        {isEs ? "Sin resultados" : "No results"}
                      </TableCell>
                    </TableRow>
                  ) : filteredBalances.map((b) => (
                    <TableRow key={b.employee_id} data-testid={`balance-row-${b.employee_id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{b.employee_name}</span>
                          {b.manual_override && (
                            <Badge className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0" title={isEs ? "Ajuste manual" : "Manual override"}>
                              <AlertOctagon className="w-3 h-3 mr-1" />
                              {isEs ? "Manual" : "Manual"}
                            </Badge>
                          )}
                        </div>
                        {b.hire_date && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {isEs ? "Ingreso" : "Hired"}: {b.hire_date}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {b.years_of_service ? `${b.years_of_service.toFixed(1)}` : "-"}
                        <span className="text-muted-foreground text-[10px]"> {isEs ? "años" : "yrs"}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {b.next_anniversary || "-"}
                        {b.days_until_anniversary !== null && b.days_until_anniversary <= 30 && (
                          <span className="ml-1 text-amber-600 font-medium">({b.days_until_anniversary}d)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{b.vacation_entitled}</TableCell>
                      <TableCell className="text-center text-red-600">{b.vacation_used}</TableCell>
                      <TableCell className="text-center text-amber-600">{b.vacation_pending}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={b.vacation_available > 5 ? "outline" : "destructive"}>
                          {b.vacation_available}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-blue-600 hover:bg-blue-50"
                          onClick={() => handleAnniversaryReset(b.employee_id, b.employee_name)}
                          title={isEs ? "Ejecutar reinicio de aniversario ahora (carry-over ilimitado)" : "Trigger anniversary reset now (unlimited carry-over)"}
                          data-testid={`reset-anniv-${b.employee_id}`}
                        >
                          <History className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* New Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEs ? "Nueva Solicitud de Tiempo Libre" : "New Time Off Request"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Empleado *" : "Employee *"}</label>
              <Select value={newRequest.employee_id} onValueChange={(v) => setNewRequest({ ...newRequest, employee_id: v })}>
                <SelectTrigger data-testid="employee-select">
                  <SelectValue placeholder={isEs ? "Seleccionar empleado" : "Select employee"} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.employee_id} value={emp.employee_id}>{emp.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">{isEs ? "Tipo *" : "Type *"}</label>
              <Select value={newRequest.time_off_type} onValueChange={(v) => setNewRequest({ ...newRequest, time_off_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIME_OFF_TYPES).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{isEs ? config.label : config.labelEn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha Inicio *" : "Start Date *"}</label>
                <Input type="date" value={newRequest.start_date} onChange={(e) => handleDateChange("start_date", e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha Fin *" : "End Date *"}</label>
                <Input type="date" value={newRequest.end_date} onChange={(e) => handleDateChange("end_date", e.target.value)} />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <span className="text-sm text-muted-foreground">{isEs ? "Total días:" : "Total days:"}</span>
              <span className="ml-2 text-xl font-bold">{newRequest.total_days}</span>
            </div>

            <div>
              <label className="text-sm font-medium">{isEs ? "Motivo (opcional)" : "Reason (optional)"}</label>
              <Input value={newRequest.reason} onChange={(e) => setNewRequest({ ...newRequest, reason: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleCreateRequest} disabled={submitting}>
              {submitting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              {isEs ? "Crear Solicitud" : "Create Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
