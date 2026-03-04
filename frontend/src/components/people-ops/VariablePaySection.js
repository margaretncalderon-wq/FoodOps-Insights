import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Label } from "../ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  DollarSign, Plus, RefreshCw, Clock, Percent, Zap, 
  Calendar, Users, Eye, Send, CheckCircle, Play, ArrowLeft,
  FileText, Download
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

export function VariablePaySection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const navigate = useNavigate();
  
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedRun, setSelectedRun] = useState(null);
  const [runEntries, setRunEntries] = useState([]);
  const [loadingRun, setLoadingRun] = useState(false);
  
  // New run form
  const [newRun, setNewRun] = useState({
    run_name: "",
    pay_type: "overtime",
    period_start: "",
    period_end: "",
    payment_date: "",
    notes: ""
  });

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/settings/variable-pay-runs`, { withCredentials: true });
      setRuns(res.data || []);
    } catch (err) {
      console.error("Error fetching runs:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  const handleCreateRun = async () => {
    setCreating(true);
    try {
      const res = await axios.post(
        `${API}/api/settings/variable-pay-runs`,
        newRun,
        { withCredentials: true }
      );
      fetchRuns();
      setShowCreateDialog(false);
      setNewRun({
        run_name: "",
        pay_type: "overtime",
        period_start: "",
        period_end: "",
        payment_date: "",
        notes: ""
      });
      alert(isEs 
        ? `Pago variable creado con ${res.data.entries_created} entradas` 
        : `Variable pay run created with ${res.data.entries_created} entries`);
    } catch (err) {
      console.error("Error creating run:", err);
      alert(err.response?.data?.detail || "Error creating variable pay run");
    }
    setCreating(false);
  };

  const handleViewRun = async (run) => {
    setLoadingRun(true);
    try {
      const res = await axios.get(
        `${API}/api/settings/variable-pay-runs/${run.run_id}`,
        { withCredentials: true }
      );
      setSelectedRun(res.data.run);
      setRunEntries(res.data.entries || []);
    } catch (err) {
      console.error("Error fetching run details:", err);
      alert(err.response?.data?.detail || "Error loading run details");
    }
    setLoadingRun(false);
  };

  const handleAction = async (runId, action) => {
    try {
      await axios.post(
        `${API}/api/settings/variable-pay-runs/${runId}/${action}`,
        {},
        { withCredentials: true }
      );
      fetchRuns();
      if (selectedRun?.run_id === runId) {
        handleViewRun({ run_id: runId });
      }
    } catch (err) {
      console.error(`Error ${action}:`, err);
      alert(err.response?.data?.detail || `Error: ${action}`);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      draft: "bg-gray-100 text-gray-700",
      pending_approval: "bg-amber-100 text-amber-700",
      approved: "bg-blue-100 text-blue-700",
      completed: "bg-emerald-100 text-emerald-700"
    };
    const labels = {
      draft: isEs ? "Borrador" : "Draft",
      pending_approval: isEs ? "Pendiente" : "Pending",
      approved: isEs ? "Aprobado" : "Approved",
      completed: isEs ? "Completado" : "Completed"
    };
    return <Badge className={styles[status] || "bg-gray-100"}>{labels[status] || status}</Badge>;
  };

  const getPayTypeLabel = (type) => {
    const labels = {
      overtime: isEs ? "Horas Extras" : "Overtime",
      commission: isEs ? "Comisiones" : "Commissions",
      bonus: isEs ? "Bonos" : "Bonuses",
      incentive: isEs ? "Incentivos" : "Incentives",
      mixed: isEs ? "Mixto" : "Mixed"
    };
    return labels[type] || type;
  };

  // Run Detail View
  if (selectedRun) {
    return (
      <div className="space-y-6" data-testid="variable-pay-detail">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setSelectedRun(null)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h2 className="text-lg font-semibold">{selectedRun.run_name}</h2>
              <p className="text-sm text-muted-foreground">
                {getPayTypeLabel(selectedRun.pay_type)} • {selectedRun.payment_date}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(selectedRun.status)}
            
            {selectedRun.status === "draft" && (
              <Button onClick={() => handleAction(selectedRun.run_id, "submit")}>
                <Send className="w-4 h-4 mr-2" />
                {isEs ? "Enviar a Aprobación" : "Submit for Approval"}
              </Button>
            )}
            {selectedRun.status === "pending_approval" && (
              <Button onClick={() => handleAction(selectedRun.run_id, "approve")}>
                <CheckCircle className="w-4 h-4 mr-2" />
                {isEs ? "Aprobar" : "Approve"}
              </Button>
            )}
            {selectedRun.status === "approved" && (
              <Button onClick={() => handleAction(selectedRun.run_id, "process")}>
                <Play className="w-4 h-4 mr-2" />
                {isEs ? "Procesar Pagos" : "Process Payments"}
              </Button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-violet-600">{selectedRun.total_employees}</p>
              <p className="text-xs text-muted-foreground">{isEs ? "Empleados" : "Employees"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">${selectedRun.total_gross?.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{isEs ? "Total Bruto" : "Gross Total"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-red-600">-${selectedRun.total_deductions?.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{isEs ? "Deducciones" : "Deductions"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-emerald-600">${selectedRun.total_net?.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{isEs ? "Total Neto" : "Net Total"}</p>
            </CardContent>
          </Card>
        </div>

        {/* Entries Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isEs ? "Detalle de Pagos" : "Payment Details"}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingRun ? (
              <div className="flex items-center justify-center py-10">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : runEntries.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">
                {isEs ? "No hay entradas en este período" : "No entries in this run"}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Empleado" : "Employee"}</TableHead>
                    <TableHead>{isEs ? "Departamento" : "Department"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Hrs Extra" : "Overtime"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Comisión" : "Commission"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Bono" : "Bonus"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Bruto" : "Gross"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Deducciones" : "Deductions"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Neto" : "Net"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runEntries.map((entry) => (
                    <TableRow key={entry.entry_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{entry.employee_name}</p>
                          <p className="text-xs text-muted-foreground">{entry.employee_number}</p>
                        </div>
                      </TableCell>
                      <TableCell>{entry.department || "-"}</TableCell>
                      <TableCell className="text-right">
                        {entry.overtime_amount > 0 ? (
                          <div>
                            <p>${entry.overtime_amount?.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">
                              {entry.overtime_hours_35 + entry.overtime_hours_100}h
                            </p>
                          </div>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {entry.commission_amount > 0 ? `$${entry.commission_amount?.toLocaleString()}` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {entry.bonus_amount > 0 ? `$${entry.bonus_amount?.toLocaleString()}` : "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">${entry.gross_amount?.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-red-600">-${entry.total_deductions?.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-600">${entry.net_amount?.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main List View
  return (
    <div className="space-y-6" data-testid="variable-pay-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            {isEs ? "Pagos Variables" : "Variable Pay"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs 
              ? "Procesa horas extras, comisiones, bonos e incentivos aprobados" 
              : "Process approved overtime, commissions, bonuses and incentives"}
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="create-variable-pay-btn">
          <Plus className="w-4 h-4 mr-2" />
          {isEs ? "Nuevo Pago Variable" : "New Variable Pay Run"}
        </Button>
      </div>

      {/* Info Banner */}
      <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 flex items-center gap-2">
        <Clock className="w-4 h-4 text-blue-600 flex-shrink-0" />
        <p className="text-sm text-blue-800">
          {isEs 
            ? "Los pagos variables permiten procesar horas extras aprobadas, comisiones y bonos en ciclos separados de la nómina regular." 
            : "Variable pay allows processing approved overtime, commissions and bonuses in cycles separate from regular payroll."}
        </p>
      </div>

      {/* Runs Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : runs.length === 0 ? (
            <div className="text-center py-10">
              <DollarSign className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                {isEs ? "No hay pagos variables registrados" : "No variable pay runs recorded"}
              </p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                {isEs ? "Crear Primer Pago Variable" : "Create First Variable Pay Run"}
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                  <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                  <TableHead>{isEs ? "Fecha Pago" : "Payment Date"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Empleados" : "Employees"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Total Neto" : "Net Total"}</TableHead>
                  <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Acciones" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.run_id}>
                    <TableCell className="font-medium">{run.run_name}</TableCell>
                    <TableCell>{getPayTypeLabel(run.pay_type)}</TableCell>
                    <TableCell>{run.payment_date || "-"}</TableCell>
                    <TableCell className="text-right">{run.total_employees}</TableCell>
                    <TableCell className="text-right font-medium">${run.total_net?.toLocaleString()}</TableCell>
                    <TableCell>{getStatusBadge(run.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleViewRun(run)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEs ? "Nuevo Pago Variable" : "New Variable Pay Run"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>{isEs ? "Nombre del Período" : "Period Name"}</Label>
              <Input
                value={newRun.run_name}
                onChange={(e) => setNewRun({ ...newRun, run_name: e.target.value })}
                placeholder={isEs ? "Ej: Horas Extras Marzo 2026" : "Ex: Overtime March 2026"}
              />
            </div>

            <div>
              <Label>{isEs ? "Tipo de Pago" : "Pay Type"}</Label>
              <Select 
                value={newRun.pay_type} 
                onValueChange={(v) => setNewRun({ ...newRun, pay_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="overtime">{isEs ? "Horas Extras" : "Overtime"}</SelectItem>
                  <SelectItem value="commission">{isEs ? "Comisiones" : "Commissions"}</SelectItem>
                  <SelectItem value="bonus">{isEs ? "Bonos" : "Bonuses"}</SelectItem>
                  <SelectItem value="incentive">{isEs ? "Incentivos" : "Incentives"}</SelectItem>
                  <SelectItem value="mixed">{isEs ? "Mixto (Todos)" : "Mixed (All)"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{isEs ? "Fecha Inicio" : "Start Date"}</Label>
                <Input
                  type="date"
                  value={newRun.period_start}
                  onChange={(e) => setNewRun({ ...newRun, period_start: e.target.value })}
                />
              </div>
              <div>
                <Label>{isEs ? "Fecha Fin" : "End Date"}</Label>
                <Input
                  type="date"
                  value={newRun.period_end}
                  onChange={(e) => setNewRun({ ...newRun, period_end: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>{isEs ? "Fecha de Pago" : "Payment Date"}</Label>
              <Input
                type="date"
                value={newRun.payment_date}
                onChange={(e) => setNewRun({ ...newRun, payment_date: e.target.value })}
              />
            </div>

            <div>
              <Label>{isEs ? "Notas (Opcional)" : "Notes (Optional)"}</Label>
              <Input
                value={newRun.notes}
                onChange={(e) => setNewRun({ ...newRun, notes: e.target.value })}
                placeholder={isEs ? "Notas adicionales..." : "Additional notes..."}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreateRun} disabled={creating || !newRun.run_name}>
              {creating && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              {isEs ? "Crear y Generar Entradas" : "Create & Generate Entries"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
