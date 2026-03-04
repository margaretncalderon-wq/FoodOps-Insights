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
  Clock, Plus, RefreshCw, CheckCircle, XCircle,
  AlertCircle, DollarSign, Calendar, Sun, Moon
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => 
  `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_CONFIG = {
  pending: { label: "Pendiente", labelEn: "Pending", color: "bg-amber-100 text-amber-700" },
  approved: { label: "Aprobada", labelEn: "Approved", color: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rechazada", labelEn: "Rejected", color: "bg-red-100 text-red-700" },
  processed: { label: "Procesada", labelEn: "Processed", color: "bg-blue-100 text-blue-700" }
};

export function OvertimeSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [requests, setRequests] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [newRequest, setNewRequest] = useState({
    employee_id: "",
    date: new Date().toISOString().split("T")[0],
    hours_35: 0,
    hours_100: 0,
    reason: ""
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, empRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/overtime/requests?limit=50`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/employees?status=active`, { withCredentials: true })
      ]);
      setRequests(reqRes.data);
      setEmployees(empRes.data);
    } catch (err) {
      console.error("Error fetching overtime data:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateRequest = async () => {
    if (!newRequest.employee_id || (!newRequest.hours_35 && !newRequest.hours_100)) {
      alert(isEs ? "Selecciona empleado e ingresa al menos un tipo de hora extra" : "Select employee and enter at least one overtime type");
      return;
    }
    
    if (!newRequest.reason) {
      alert(isEs ? "Ingresa el motivo de las horas extras" : "Enter the reason for overtime");
      return;
    }
    
    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/api/people-ops/overtime/requests`, {
        ...newRequest,
        hours_35: parseFloat(newRequest.hours_35) || 0,
        hours_100: parseFloat(newRequest.hours_100) || 0
      }, { withCredentials: true });
      
      setDialogOpen(false);
      setNewRequest({
        employee_id: "",
        date: new Date().toISOString().split("T")[0],
        hours_35: 0,
        hours_100: 0,
        reason: ""
      });
      fetchData();
      
      // Show estimated amount
      if (response.data.estimated_amount) {
        alert(isEs 
          ? `Solicitud creada. Monto estimado: ${formatCurrency(response.data.estimated_amount)}`
          : `Request created. Estimated amount: ${formatCurrency(response.data.estimated_amount)}`
        );
      }
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
          <Button onClick={() => setDialogOpen(true)} data-testid="new-overtime-btn">
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Registrar Horas" : "Log Hours"}
          </Button>
        </div>
      </div>

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
          {requests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{isEs ? "No hay registros de horas extras" : "No overtime records"}</p>
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
                {requests.map((req) => (
                  <TableRow key={req.overtime_id} data-testid={`overtime-${req.overtime_id}`}>
                    <TableCell className="font-medium">{req.employee_name}</TableCell>
                    <TableCell>{req.date}</TableCell>
                    <TableCell className="text-center">
                      {req.hours_35 > 0 ? (
                        <Badge variant="outline" className="bg-amber-50">{req.hours_35}h</Badge>
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
                      {req.status === "pending" && (
                        <div className="flex gap-1">
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
                        </div>
                      )}
                      {req.status === "approved" && (
                        <Badge variant="outline" className="text-xs">
                          {isEs ? "Listo para nómina" : "Ready for payroll"}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Overtime Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
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
            </div>

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
                  {isEs ? "Horas Normales (35%)" : "Normal Hours (35%)"}
                </label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="12"
                  value={newRequest.hours_35}
                  onChange={(e) => setNewRequest({ ...newRequest, hours_35: e.target.value })}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {isEs ? "Horas extra diurnas normales" : "Regular daytime overtime"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium flex items-center gap-1">
                  <Moon className="w-4 h-4 text-purple-500" />
                  {isEs ? "Horas Nocturnas/Feriado (100%)" : "Night/Holiday Hours (100%)"}
                </label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="12"
                  value={newRequest.hours_100}
                  onChange={(e) => setNewRequest({ ...newRequest, hours_100: e.target.value })}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {isEs ? "Nocturnas, domingos, feriados" : "Night, Sunday, holidays"}
                </p>
              </div>
            </div>

            {(parseFloat(newRequest.hours_35) > 0 || parseFloat(newRequest.hours_100) > 0) && (
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <span className="text-sm text-muted-foreground">{isEs ? "Total horas:" : "Total hours:"}</span>
                <span className="ml-2 text-xl font-bold">
                  {(parseFloat(newRequest.hours_35) || 0) + (parseFloat(newRequest.hours_100) || 0)}h
                </span>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">{isEs ? "Motivo *" : "Reason *"}</label>
              <Textarea
                value={newRequest.reason}
                onChange={(e) => setNewRequest({ ...newRequest, reason: e.target.value })}
                placeholder={isEs ? "Describa el motivo de las horas extras..." : "Describe the reason for overtime..."}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleCreateRequest} disabled={submitting}>
              {submitting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              {isEs ? "Registrar" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
