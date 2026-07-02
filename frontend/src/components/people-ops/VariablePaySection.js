import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
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
  FileText, Download, Trash2, UserPlus, Edit, Undo2
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function VariablePaySection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [activeTab, setActiveTab] = useState("overtime");
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedRun, setSelectedRun] = useState(null);
  const [runEntries, setRunEntries] = useState([]);
  const [loadingRun, setLoadingRun] = useState(false);
  const [employees, setEmployees] = useState([]);
  
  // Form state
  const [newRun, setNewRun] = useState({
    run_name: "",
    pay_type: "overtime",
    period_start: "",
    period_end: "",
    payment_date: "",
    notes: "",
    pool_amount: 0,
    manual_entries: []
  });
  
  // For bonus/incentive manual entries
  const [manualEntry, setManualEntry] = useState({ employee_id: "", amount: "", notes: "" });

  const fetchRuns = useCallback(async (payType) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/settings/variable-pay-runs?pay_type=${payType}`, { withCredentials: true });
      setRuns(res.data || []);
    } catch (err) {
      console.error("Error fetching runs:", err);
    }
    setLoading(false);
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/people-ops/employees?status=active`, { withCredentials: true });
      setEmployees(res.data || []);
    } catch (err) {
      console.error("Error fetching employees:", err);
    }
  }, []);

  useEffect(() => { 
    fetchRuns(activeTab);
    fetchEmployees();
  }, [fetchRuns, fetchEmployees, activeTab]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setNewRun({ ...newRun, pay_type: tab, manual_entries: [], pool_amount: 0 });
  };

  const handleCreateRun = async () => {
    setCreating(true);
    try {
      const payload = {
        ...newRun,
        pay_type: activeTab
      };
      const res = await axios.post(
        `${API}/api/settings/variable-pay-runs`,
        payload,
        { withCredentials: true }
      );
      fetchRuns(activeTab);
      setShowCreateDialog(false);
      setNewRun({
        run_name: "",
        pay_type: activeTab,
        period_start: "",
        period_end: "",
        payment_date: "",
        notes: "",
        pool_amount: 0,
        manual_entries: []
      });
      alert(isEs 
        ? `Pago creado con ${res.data.entries_created} entradas` 
        : `Pay run created with ${res.data.entries_created} entries`);
    } catch (err) {
      console.error("Error creating run:", err);
      alert(err.response?.data?.detail || "Error creating pay run");
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
      fetchRuns(activeTab);
      if (selectedRun?.run_id === runId) {
        handleViewRun({ run_id: runId });
      }
    } catch (err) {
      console.error(`Error ${action}:`, err);
      alert(err.response?.data?.detail || `Error: ${action}`);
    }
  };

  const handleDeleteRun = async (run) => {
    if (!window.confirm(isEs
      ? `¿Eliminar el pago "${run.run_name}" y todas sus entradas? Esta acción no se puede deshacer.`
      : `Delete pay run "${run.run_name}" and all its entries? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/api/settings/variable-pay-runs/${run.run_id}`, { withCredentials: true });
      if (selectedRun?.run_id === run.run_id) setSelectedRun(null);
      fetchRuns(activeTab);
    } catch (err) {
      alert(err.response?.data?.detail || (isEs ? "Error al eliminar" : "Error deleting"));
    }
  };

  const [editingEntry, setEditingEntry] = useState(null);
  const [editEntryData, setEditEntryData] = useState({});

  const openEditEntry = (entry) => {
    setEditingEntry(entry);
    setEditEntryData({
      commission_amount: entry.commission_amount || 0,
      bonus_amount: entry.bonus_amount || 0,
      incentive_amount: entry.incentive_amount || 0,
      notes: entry.notes || ""
    });
  };

  const saveEditEntry = async () => {
    try {
      await axios.put(
        `${API}/api/settings/variable-pay-entries/${editingEntry.entry_id}`,
        editEntryData,
        { withCredentials: true }
      );
      setEditingEntry(null);
      handleViewRun({ run_id: selectedRun.run_id });
    } catch (err) {
      alert(err.response?.data?.detail || (isEs ? "Error al guardar" : "Error saving"));
    }
  };

  const handleDeleteEntry = async (entry) => {
    if (!window.confirm(isEs
      ? `¿Eliminar el pago de ${entry.employee_name} de este período?`
      : `Delete entry for ${entry.employee_name} from this run?`)) return;
    try {
      await axios.delete(`${API}/api/settings/variable-pay-entries/${entry.entry_id}`, { withCredentials: true });
      handleViewRun({ run_id: selectedRun.run_id });
    } catch (err) {
      alert(err.response?.data?.detail || (isEs ? "Error al eliminar" : "Error deleting"));
    }
  };

  const handleDownloadBankFile = async (runId) => {    try {
      const res = await axios.get(
        `${API}/api/settings/variable-pay-runs/${runId}/bank-file`,
        { withCredentials: true, responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `variable_pay_${runId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Error downloading bank file:", err);
      alert(err.response?.data?.detail || "Error downloading file");
    }
  };

  const addManualEntry = () => {
    if (!manualEntry.employee_id || !manualEntry.amount) return;
    const emp = employees.find(e => e.employee_id === manualEntry.employee_id);
    setNewRun({
      ...newRun,
      manual_entries: [
        ...newRun.manual_entries,
        { 
          ...manualEntry, 
          amount: parseFloat(manualEntry.amount),
          employee_name: emp?.full_name || ""
        }
      ]
    });
    setManualEntry({ employee_id: "", amount: "", notes: "" });
  };

  const removeManualEntry = (idx) => {
    setNewRun({
      ...newRun,
      manual_entries: newRun.manual_entries.filter((_, i) => i !== idx)
    });
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
      incentive: isEs ? "Incentivos" : "Incentives"
    };
    return labels[type] || type;
  };

  const getPayTypeIcon = (type) => {
    const icons = {
      overtime: Clock,
      commission: Percent,
      bonus: DollarSign,
      incentive: Zap
    };
    const Icon = icons[type] || DollarSign;
    return <Icon className="w-4 h-4" />;
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
              <h2 className="text-lg font-semibold flex items-center gap-2">
                {getPayTypeIcon(selectedRun.pay_type)}
                {selectedRun.run_name}
              </h2>
              <p className="text-sm text-muted-foreground">
                {getPayTypeLabel(selectedRun.pay_type)} • {selectedRun.payment_date}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(selectedRun.status)}
            
            <Button variant="outline" size="sm" onClick={() => handleDownloadBankFile(selectedRun.run_id)}>
              <Download className="w-4 h-4 mr-2" />
              CSV
            </Button>
            
            {selectedRun.status === "draft" && (
              <Button onClick={() => handleAction(selectedRun.run_id, "submit")}>
                <Send className="w-4 h-4 mr-2" />
                {isEs ? "Enviar" : "Submit"}
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
                {isEs ? "Procesar" : "Process"}
              </Button>
            )}
            {["pending_approval", "approved", "processed"].includes(selectedRun.status) && (
              <Button
                variant="outline"
                onClick={() => handleAction(selectedRun.run_id, "revert")}
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                data-testid="revert-run-btn"
              >
                <Undo2 className="w-4 h-4 mr-2" />
                {isEs ? "Revertir a Borrador" : "Revert to Draft"}
              </Button>
            )}
            {selectedRun.status !== "processed" && (
              <Button
                variant="outline"
                onClick={() => handleDeleteRun(selectedRun)}
                className="border-red-300 text-red-700 hover:bg-red-50"
                data-testid="delete-run-detail-btn"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {isEs ? "Eliminar" : "Delete"}
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
              <p className="text-2xl font-bold">{formatCurrency(selectedRun.total_gross)}</p>
              <p className="text-xs text-muted-foreground">{isEs ? "Total Bruto" : "Gross Total"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-red-600">-{formatCurrency(selectedRun.total_deductions)}</p>
              <p className="text-xs text-muted-foreground">{isEs ? "Deducciones" : "Deductions"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(selectedRun.total_net)}</p>
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
                    {selectedRun.pay_type === "overtime" && (
                      <TableHead className="text-right">{isEs ? "Horas" : "Hours"}</TableHead>
                    )}
                    {selectedRun.pay_type === "commission" && (
                      <>
                        <TableHead className="text-right">{isEs ? "Ventas" : "Sales"}</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </>
                    )}
                    {(selectedRun.pay_type === "bonus" || selectedRun.pay_type === "incentive") && (
                      <TableHead className="text-right">{isEs ? "Pool %" : "Pool %"}</TableHead>
                    )}
                    <TableHead className="text-right">{isEs ? "Bruto" : "Gross"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Deducciones" : "Deductions"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Neto" : "Net"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Acciones" : "Actions"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runEntries.map((entry) => (
                    <TableRow key={entry.entry_id} data-testid={`vp-entry-${entry.entry_id}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{entry.employee_name}</p>
                          <p className="text-xs text-muted-foreground">{entry.employee_number}</p>
                        </div>
                      </TableCell>
                      <TableCell>{entry.department || "-"}</TableCell>
                      {selectedRun.pay_type === "overtime" && (
                        <TableCell className="text-right">
                          {(entry.overtime_hours_35 || 0) + (entry.overtime_hours_100 || 0)}h
                        </TableCell>
                      )}
                      {selectedRun.pay_type === "commission" && (
                        <>
                          <TableCell className="text-right">{formatCurrency(entry.total_sales)}</TableCell>
                          <TableCell className="text-right">{entry.commission_rate}%</TableCell>
                        </>
                      )}
                      {(selectedRun.pay_type === "bonus" || selectedRun.pay_type === "incentive") && (
                        <TableCell className="text-right">{entry.pool_percentage || "-"}%</TableCell>
                      )}
                      <TableCell className="text-right font-medium">{formatCurrency(entry.gross_amount)}</TableCell>
                      <TableCell className="text-right text-red-600">-{formatCurrency(entry.total_deductions)}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-600">{formatCurrency(entry.net_amount)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {selectedRun.status !== "processed" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50"
                                onClick={() => openEditEntry(entry)}
                                title={isEs ? "Editar" : "Edit"}
                                data-testid={`edit-entry-${entry.entry_id}`}
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                                onClick={() => handleDeleteEntry(entry)}
                                title={isEs ? "Eliminar" : "Delete"}
                                data-testid={`delete-entry-${entry.entry_id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
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

  // Main View with Tabs
  return (
    <div className="space-y-6" data-testid="variable-pay-section">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            {isEs ? "Pagos Variables" : "Variable Pay"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs 
              ? "Procesa pagos de horas extras, comisiones, bonos e incentivos" 
              : "Process overtime, commission, bonus and incentive payments"}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="overtime" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            {isEs ? "Hrs Extra" : "Overtime"}
          </TabsTrigger>
          <TabsTrigger value="commission" className="flex items-center gap-2">
            <Percent className="w-4 h-4" />
            {isEs ? "Comisiones" : "Commissions"}
          </TabsTrigger>
          <TabsTrigger value="bonus" className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            {isEs ? "Bonos" : "Bonuses"}
          </TabsTrigger>
          <TabsTrigger value="incentive" className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            {isEs ? "Incentivos" : "Incentives"}
          </TabsTrigger>
        </TabsList>

        {/* Each tab content is similar - list of runs + create button */}
        {["overtime", "commission", "bonus", "incentive"].map((tabType) => (
          <TabsContent key={tabType} value={tabType} className="space-y-4">
            {/* Info Banner */}
            <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 flex items-center gap-2">
              {getPayTypeIcon(tabType)}
              <p className="text-sm text-blue-800">
                {tabType === "overtime" && (isEs 
                  ? "Calcula pagos de horas extras aprobadas en el período seleccionado." 
                  : "Calculate payments for approved overtime in the selected period.")}
                {tabType === "commission" && (isEs 
                  ? "Calcula comisiones basadas en ventas cerradas asignadas a vendedores." 
                  : "Calculate commissions based on closed sales assigned to salespeople.")}
                {tabType === "bonus" && (isEs 
                  ? "Asigna bonos manualmente a empleados individuales." 
                  : "Assign bonuses manually to individual employees.")}
                {tabType === "incentive" && (isEs 
                  ? "Distribuye incentivos usando un pool compartido según % configurado por empleado." 
                  : "Distribute incentives using a shared pool based on employee-configured %.")}
              </p>
            </div>

            {/* Create Button */}
            <div className="flex justify-end">
              <Button onClick={() => setShowCreateDialog(true)} data-testid={`create-${tabType}-btn`}>
                <Plus className="w-4 h-4 mr-2" />
                {isEs ? `Nuevo ${getPayTypeLabel(tabType)}` : `New ${getPayTypeLabel(tabType)}`}
              </Button>
            </div>

            {/* Runs List */}
            <Card>
              <CardContent className="pt-6">
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : runs.length === 0 ? (
                  <div className="text-center py-10">
                    {getPayTypeIcon(tabType)}
                    <p className="text-muted-foreground mt-2">
                      {isEs ? `No hay pagos de ${getPayTypeLabel(tabType).toLowerCase()} registrados` : `No ${getPayTypeLabel(tabType).toLowerCase()} payments recorded`}
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                        <TableHead>{isEs ? "Período" : "Period"}</TableHead>
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
                          <TableCell className="text-sm text-muted-foreground">
                            {run.period_start} - {run.period_end}
                          </TableCell>
                          <TableCell>{run.payment_date || "-"}</TableCell>
                          <TableCell className="text-right">{run.total_employees}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(run.total_net)}</TableCell>
                          <TableCell>{getStatusBadge(run.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleViewRun(run)}
                                data-testid={`view-run-${run.run_id}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              {run.status !== "processed" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:bg-red-50"
                                  onClick={() => handleDeleteRun(run)}
                                  title={isEs ? "Eliminar" : "Delete"}
                                  data-testid={`delete-run-${run.run_id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getPayTypeIcon(activeTab)}
              {isEs ? `Nuevo Pago de ${getPayTypeLabel(activeTab)}` : `New ${getPayTypeLabel(activeTab)} Payment`}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>{isEs ? "Nombre del Período" : "Period Name"}</Label>
              <Input
                value={newRun.run_name}
                onChange={(e) => setNewRun({ ...newRun, run_name: e.target.value })}
                placeholder={isEs ? `Ej: ${getPayTypeLabel(activeTab)} Marzo 2026` : `Ex: ${getPayTypeLabel(activeTab)} March 2026`}
              />
            </div>

            {/* Period dates for overtime and commission */}
            {(activeTab === "overtime" || activeTab === "commission") && (
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
            )}

            <div>
              <Label>{isEs ? "Fecha de Pago" : "Payment Date"}</Label>
              <Input
                type="date"
                value={newRun.payment_date}
                onChange={(e) => setNewRun({ ...newRun, payment_date: e.target.value })}
              />
            </div>

            {/* Pool amount for incentive */}
            {activeTab === "incentive" && (
              <div className="p-4 border rounded-lg bg-purple-50 space-y-3">
                <div>
                  <Label className="text-purple-700">{isEs ? "Monto del Pool a Distribuir" : "Pool Amount to Distribute"}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    value={newRun.pool_amount || ""}
                    onChange={(e) => setNewRun({ ...newRun, pool_amount: parseFloat(e.target.value) || 0 })}
                    placeholder="10000"
                  />
                  <p className="text-xs text-purple-600 mt-1">
                    {isEs 
                      ? "Se distribuirá según el % de cada empleado configurado en su perfil" 
                      : "Will be distributed based on each employee's % configured in their profile"}
                  </p>
                </div>
              </div>
            )}

            {/* Manual entries for bonus */}
            {activeTab === "bonus" && (
              <div className="space-y-3">
                <Label>{isEs ? "Asignar Bonos Manualmente" : "Assign Bonuses Manually"}</Label>
                
                {/* Add entry form */}
                <div className="p-3 border rounded-lg bg-blue-50 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Select 
                        value={manualEntry.employee_id} 
                        onValueChange={(v) => setManualEntry({ ...manualEntry, employee_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={isEs ? "Seleccionar empleado" : "Select employee"} />
                        </SelectTrigger>
                        <SelectContent>
                          {employees.map(emp => (
                            <SelectItem key={emp.employee_id} value={emp.employee_id}>
                              {emp.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Input
                        type="number"
                        placeholder={isEs ? "Monto" : "Amount"}
                        value={manualEntry.amount}
                        onChange={(e) => setManualEntry({ ...manualEntry, amount: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder={isEs ? "Notas (opcional)" : "Notes (optional)"}
                      value={manualEntry.notes}
                      onChange={(e) => setManualEntry({ ...manualEntry, notes: e.target.value })}
                      className="flex-1"
                    />
                    <Button type="button" size="sm" onClick={addManualEntry}>
                      <UserPlus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* List of manual entries */}
                {newRun.manual_entries.length > 0 && (
                  <div className="space-y-2">
                    {newRun.manual_entries.map((entry, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 border rounded">
                        <div>
                          <p className="font-medium text-sm">{entry.employee_name}</p>
                          <p className="text-xs text-muted-foreground">{entry.notes}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{formatCurrency(entry.amount)}</span>
                          <Button variant="ghost" size="icon" onClick={() => removeManualEntry(idx)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="text-right font-medium">
                      Total: {formatCurrency(newRun.manual_entries.reduce((sum, e) => sum + e.amount, 0))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <Label>{isEs ? "Notas (Opcional)" : "Notes (Optional)"}</Label>
              <Textarea
                value={newRun.notes}
                onChange={(e) => setNewRun({ ...newRun, notes: e.target.value })}
                placeholder={isEs ? "Notas adicionales..." : "Additional notes..."}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button 
              onClick={handleCreateRun} 
              disabled={creating || !newRun.run_name || (activeTab === "bonus" && newRun.manual_entries.length === 0 && !newRun.pool_amount)}
            >
              {creating && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              {isEs ? "Crear y Calcular" : "Create & Calculate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Entry Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={(o) => !o && setEditingEntry(null)}>
        <DialogContent className="max-w-md" data-testid="edit-entry-dialog">
          <DialogHeader>
            <DialogTitle>{isEs ? "Editar Pago Variable" : "Edit Variable Pay"}</DialogTitle>
          </DialogHeader>
          {editingEntry && (
            <div className="space-y-3 py-2">
              <div className="p-3 rounded-lg bg-muted/40 text-sm">
                <p className="font-medium">{editingEntry.employee_name}</p>
                <p className="text-xs text-muted-foreground">{editingEntry.department || "-"}</p>
              </div>
              <div>
                <Label>{isEs ? "Comisión" : "Commission"}</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={editEntryData.commission_amount}
                  onChange={(e) => setEditEntryData({ ...editEntryData, commission_amount: parseFloat(e.target.value) || 0 })}
                  data-testid="edit-commission"
                />
              </div>
              <div>
                <Label>{isEs ? "Bono" : "Bonus"}</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={editEntryData.bonus_amount}
                  onChange={(e) => setEditEntryData({ ...editEntryData, bonus_amount: parseFloat(e.target.value) || 0 })}
                  data-testid="edit-bonus"
                />
              </div>
              <div>
                <Label>{isEs ? "Incentivo" : "Incentive"}</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={editEntryData.incentive_amount}
                  onChange={(e) => setEditEntryData({ ...editEntryData, incentive_amount: parseFloat(e.target.value) || 0 })}
                  data-testid="edit-incentive"
                />
              </div>
              <div>
                <Label>{isEs ? "Notas" : "Notes"}</Label>
                <Textarea
                  value={editEntryData.notes}
                  onChange={(e) => setEditEntryData({ ...editEntryData, notes: e.target.value })}
                  rows={2}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {isEs ? "Los totales de bruto/neto se recalcularán automáticamente." : "Gross/net totals will be recalculated automatically."}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEntry(null)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={saveEditEntry} data-testid="save-edit-entry">
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
