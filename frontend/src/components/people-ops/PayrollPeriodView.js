import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  ArrowLeft, Wallet, Users, DollarSign, RefreshCw,
  CheckCircle, Clock, FileText, Download, Send,
  Edit2, Save, X, Printer, Ban, RotateCcw
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => 
  `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_CONFIG = {
  draft: { 
    label: "Borrador", labelEn: "Draft", 
    icon: FileText, 
    color: "bg-gray-100 text-gray-700",
    canEdit: true
  },
  pending_approval: { 
    label: "Pendiente Aprobación", labelEn: "Pending Approval", 
    icon: Clock, 
    color: "bg-amber-100 text-amber-700",
    canEdit: true
  },
  approved: { 
    label: "Aprobada", labelEn: "Approved", 
    icon: CheckCircle, 
    color: "bg-blue-100 text-blue-700",
    canEdit: false
  },
  processing: { 
    label: "Procesando", labelEn: "Processing", 
    icon: RefreshCw, 
    color: "bg-purple-100 text-purple-700",
    canEdit: false
  },
  completed: { 
    label: "Completada", labelEn: "Completed", 
    icon: CheckCircle, 
    color: "bg-emerald-100 text-emerald-700",
    canEdit: false
  },
  cancelled: { 
    label: "Cancelada", labelEn: "Cancelled", 
    icon: Ban, 
    color: "bg-red-100 text-red-700",
    canEdit: false
  }
};

export function PayrollPeriodView() {
  const { periodId } = useParams();
  const { language } = useLanguage();
  const isEs = language === "es";
  const navigate = useNavigate();
  
  const [period, setPeriod] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Edit mode
  const [editingEntry, setEditingEntry] = useState(null);
  const [editData, setEditData] = useState({});
  
  // Payslip dialog
  const [payslipData, setPayslipData] = useState(null);
  const [payslipDialogOpen, setPayslipDialogOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${API}/api/people-ops/payroll/periods/${periodId}`,
        { withCredentials: true }
      );
      setPeriod(res.data.period);
      setEntries(res.data.entries);
    } catch (err) {
      console.error("Error fetching period:", err);
    }
    setLoading(false);
  }, [periodId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAction = async (action) => {
    setActionLoading(true);
    try {
      await axios.post(
        `${API}/api/people-ops/payroll/periods/${periodId}/${action}`,
        {},
        { withCredentials: true }
      );
      fetchData();
    } catch (err) {
      console.error(`Error ${action}:`, err);
      alert(err.response?.data?.detail || `Error: ${action}`);
    }
    setActionLoading(false);
  };

  const handleEditEntry = (entry) => {
    setEditingEntry(entry.entry_id);
    setEditData({
      overtime_hours_35: entry.overtime_hours_35 || 0,
      overtime_hours_100: entry.overtime_hours_100 || 0,
      bonus: entry.bonus || 0,
      commission: entry.commission || 0,
      other_earnings: entry.other_earnings || 0,
      loan_deduction: entry.loan_deduction || 0,
      other_deductions: entry.other_deductions || 0,
      notes: entry.notes || ""
    });
  };

  const handleSaveEntry = async () => {
    try {
      await axios.put(
        `${API}/api/people-ops/payroll/entries/${editingEntry}`,
        editData,
        { withCredentials: true }
      );
      setEditingEntry(null);
      fetchData();
    } catch (err) {
      console.error("Error saving entry:", err);
      alert(err.response?.data?.detail || "Error saving entry");
    }
  };

  const handleViewPayslip = async (entry) => {
    try {
      const res = await axios.get(
        `${API}/api/people-ops/payroll/entries/${entry.entry_id}/payslip`,
        { withCredentials: true }
      );
      setPayslipData(res.data);
      setPayslipDialogOpen(true);
    } catch (err) {
      console.error("Error fetching payslip:", err);
    }
  };

  const handleDownloadBankFile = async () => {
    try {
      const res = await axios.get(
        `${API}/api/people-ops/payroll/periods/${periodId}/bank-file`,
        { withCredentials: true, responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `nomina_${periodId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Error downloading bank file:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!period) {
    return (
      <div className="text-center py-20">
        <Wallet className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-muted-foreground">{isEs ? "Período no encontrado" : "Period not found"}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/people-ops/payroll")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {isEs ? "Volver" : "Go Back"}
        </Button>
      </div>
    );
  }

  const canEdit = STATUS_CONFIG[period.status]?.canEdit;
  const StatusIcon = STATUS_CONFIG[period.status]?.icon || FileText;

  return (
    <div className="space-y-6" data-testid="payroll-period-view">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/people-ops/payroll")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{period.period_name}</h1>
              <Badge className={`flex items-center gap-1 ${STATUS_CONFIG[period.status]?.color}`}>
                <StatusIcon className="w-3 h-3" />
                {isEs ? STATUS_CONFIG[period.status]?.label : STATUS_CONFIG[period.status]?.labelEn}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {period.start_date} → {period.end_date} | {isEs ? "Pago:" : "Payment:"} {period.payment_date}
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          
          {period.status === "draft" && (
            <Button 
              onClick={() => handleAction("submit")} 
              disabled={actionLoading}
              data-testid="submit-payroll-btn"
            >
              <Send className="w-4 h-4 mr-2" />
              {isEs ? "Enviar a Aprobación" : "Submit for Approval"}
            </Button>
          )}
          
          {period.status === "pending_approval" && (
            <>
              <Button 
                variant="outline" 
                onClick={() => handleAction("revert")} 
                disabled={actionLoading}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                {isEs ? "Revertir" : "Revert"}
              </Button>
              <Button 
                onClick={() => handleAction("approve")} 
                disabled={actionLoading}
                className="bg-emerald-600 hover:bg-emerald-700"
                data-testid="approve-payroll-btn"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {isEs ? "Aprobar" : "Approve"}
              </Button>
            </>
          )}
          
          {period.status === "approved" && (
            <>
              <Button variant="outline" onClick={handleDownloadBankFile}>
                <Download className="w-4 h-4 mr-2" />
                {isEs ? "Archivo Banco" : "Bank File"}
              </Button>
              <Button 
                onClick={() => handleAction("process")} 
                disabled={actionLoading}
                className="bg-violet-600 hover:bg-violet-700"
                data-testid="process-payroll-btn"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {isEs ? "Procesar Pago" : "Process Payment"}
              </Button>
            </>
          )}
          
          {period.status === "completed" && (
            <Button variant="outline" onClick={handleDownloadBankFile}>
              <Download className="w-4 h-4 mr-2" />
              {isEs ? "Archivo Banco" : "Bank File"}
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="w-4 h-4" />
              {isEs ? "Empleados" : "Employees"}
            </div>
            <p className="text-2xl font-bold mt-1">{period.total_employees}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{isEs ? "Total Bruto" : "Total Gross"}</div>
            <p className="text-xl font-bold mt-1">{formatCurrency(period.total_gross)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{isEs ? "Deducciones" : "Deductions"}</div>
            <p className="text-xl font-bold mt-1 text-red-600">{formatCurrency(period.total_deductions)}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="pt-4">
            <div className="text-sm text-emerald-600">{isEs ? "Total Neto" : "Total Net"}</div>
            <p className="text-xl font-bold mt-1 text-emerald-700">{formatCurrency(period.total_net)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{isEs ? "Costo Empleador" : "Employer Cost"}</div>
            <p className="text-xl font-bold mt-1">{formatCurrency(period.total_employer_cost)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Info Banner for editable states */}
      {canEdit && (
        <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 flex items-center gap-2">
          <Edit2 className="w-4 h-4 text-blue-600" />
          <p className="text-sm text-blue-800">
            {isEs 
              ? "Puedes editar horas extras, bonos y deducciones haciendo clic en el ícono de edición de cada empleado." 
              : "You can edit overtime, bonuses and deductions by clicking the edit icon for each employee."}
          </p>
        </div>
      )}

      {/* Entries Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {isEs ? "Detalle por Empleado" : "Employee Detail"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background">{isEs ? "Empleado" : "Employee"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Salario Base" : "Base Salary"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Horas Extra" : "Overtime"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Bonos" : "Bonuses"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Bruto" : "Gross"}</TableHead>
                  <TableHead className="text-right">AFP</TableHead>
                  <TableHead className="text-right">ARS</TableHead>
                  <TableHead className="text-right">ISR</TableHead>
                  <TableHead className="text-right">{isEs ? "Otros Ded." : "Other Ded."}</TableHead>
                  <TableHead className="text-right font-semibold">{isEs ? "Neto" : "Net"}</TableHead>
                  <TableHead className="text-center">{isEs ? "Acciones" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.entry_id} data-testid={`entry-${entry.entry_id}`}>
                    <TableCell className="sticky left-0 bg-background">
                      <div>
                        <p className="font-medium">{entry.employee_name}</p>
                        <p className="text-xs text-muted-foreground">{entry.department || "-"}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(entry.base_salary)}</TableCell>
                    <TableCell className="text-right">
                      {editingEntry === entry.entry_id ? (
                        <div className="flex gap-1">
                          <Input
                            type="number"
                            className="w-16 h-8 text-xs"
                            value={editData.overtime_hours_35}
                            onChange={(e) => setEditData({ ...editData, overtime_hours_35: parseFloat(e.target.value) || 0 })}
                            placeholder="35%"
                          />
                          <Input
                            type="number"
                            className="w-16 h-8 text-xs"
                            value={editData.overtime_hours_100}
                            onChange={(e) => setEditData({ ...editData, overtime_hours_100: parseFloat(e.target.value) || 0 })}
                            placeholder="100%"
                          />
                        </div>
                      ) : (
                        <span className={entry.overtime_amount_35 + entry.overtime_amount_100 > 0 ? "text-blue-600" : ""}>
                          {formatCurrency(entry.overtime_amount_35 + entry.overtime_amount_100)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingEntry === entry.entry_id ? (
                        <Input
                          type="number"
                          className="w-20 h-8 text-xs"
                          value={editData.bonus}
                          onChange={(e) => setEditData({ ...editData, bonus: parseFloat(e.target.value) || 0 })}
                        />
                      ) : (
                        <span className={entry.bonus > 0 ? "text-emerald-600" : ""}>
                          {formatCurrency(entry.bonus + entry.commission)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(entry.gross_salary)}</TableCell>
                    <TableCell className="text-right text-red-600">{formatCurrency(entry.afp_employee)}</TableCell>
                    <TableCell className="text-right text-red-600">{formatCurrency(entry.ars_employee)}</TableCell>
                    <TableCell className="text-right text-red-600">{formatCurrency(entry.isr)}</TableCell>
                    <TableCell className="text-right">
                      {editingEntry === entry.entry_id ? (
                        <Input
                          type="number"
                          className="w-20 h-8 text-xs"
                          value={editData.loan_deduction + editData.other_deductions}
                          onChange={(e) => setEditData({ ...editData, other_deductions: parseFloat(e.target.value) || 0 })}
                        />
                      ) : (
                        <span className={entry.loan_deduction + entry.other_deductions > 0 ? "text-red-600" : ""}>
                          {formatCurrency(entry.loan_deduction + entry.other_deductions)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-emerald-600">
                      {formatCurrency(entry.net_salary)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {canEdit && (
                          editingEntry === entry.entry_id ? (
                            <>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setEditingEntry(null)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={handleSaveEntry}
                                className="text-emerald-600"
                              >
                                <Save className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleEditEntry(entry)}
                              data-testid={`edit-entry-${entry.entry_id}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          )
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleViewPayslip(entry)}
                          data-testid={`view-payslip-${entry.entry_id}`}
                        >
                          <Printer className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Payslip Dialog */}
      <Dialog open={payslipDialogOpen} onOpenChange={setPayslipDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {isEs ? "Recibo de Pago" : "Payslip"}
            </DialogTitle>
          </DialogHeader>
          
          {payslipData && (
            <div className="space-y-4 print:space-y-2" id="payslip-content">
              {/* Company Header */}
              <div className="text-center border-b pb-4">
                <h2 className="text-xl font-bold">{payslipData.company_name || "Company"}</h2>
                {payslipData.company_rnc && (
                  <p className="text-sm text-muted-foreground">RNC: {payslipData.company_rnc}</p>
                )}
                <p className="text-lg font-medium mt-2">{isEs ? "RECIBO DE PAGO" : "PAYSLIP"}</p>
                <p className="text-sm">{payslipData.period?.period_name}</p>
              </div>
              
              {/* Employee Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">{isEs ? "Empleado" : "Employee"}</p>
                  <p className="font-medium">{payslipData.entry?.employee_name}</p>
                  <p className="text-xs">{payslipData.entry?.employee_number}</p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground">{isEs ? "Cédula" : "ID"}</p>
                  <p className="font-medium">{payslipData.employee_national_id || "-"}</p>
                </div>
              </div>
              
              {/* Earnings */}
              <div className="border rounded-lg p-3">
                <h3 className="font-semibold mb-2">{isEs ? "Ingresos" : "Earnings"}</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>{isEs ? "Salario Base" : "Base Salary"}</span>
                    <span>{formatCurrency(payslipData.entry?.base_salary)}</span>
                  </div>
                  {payslipData.entry?.overtime_amount_35 > 0 && (
                    <div className="flex justify-between text-blue-600">
                      <span>{isEs ? "Horas Extra (35%)" : "Overtime (35%)"}</span>
                      <span>{formatCurrency(payslipData.entry?.overtime_amount_35)}</span>
                    </div>
                  )}
                  {payslipData.entry?.overtime_amount_100 > 0 && (
                    <div className="flex justify-between text-blue-600">
                      <span>{isEs ? "Horas Extra (100%)" : "Overtime (100%)"}</span>
                      <span>{formatCurrency(payslipData.entry?.overtime_amount_100)}</span>
                    </div>
                  )}
                  {payslipData.entry?.bonus > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>{isEs ? "Bonificación" : "Bonus"}</span>
                      <span>{formatCurrency(payslipData.entry?.bonus)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t pt-1 mt-2">
                    <span>{isEs ? "Total Bruto" : "Gross Total"}</span>
                    <span>{formatCurrency(payslipData.entry?.gross_salary)}</span>
                  </div>
                </div>
              </div>
              
              {/* Deductions */}
              <div className="border rounded-lg p-3">
                <h3 className="font-semibold mb-2">{isEs ? "Deducciones" : "Deductions"}</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>AFP ({payslipData.afp_provider || "-"})</span>
                    <span className="text-red-600">-{formatCurrency(payslipData.entry?.afp_employee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ARS ({payslipData.ars_provider || "-"})</span>
                    <span className="text-red-600">-{formatCurrency(payslipData.entry?.ars_employee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ISR</span>
                    <span className="text-red-600">-{formatCurrency(payslipData.entry?.isr)}</span>
                  </div>
                  {payslipData.entry?.loan_deduction > 0 && (
                    <div className="flex justify-between">
                      <span>{isEs ? "Préstamo" : "Loan"}</span>
                      <span className="text-red-600">-{formatCurrency(payslipData.entry?.loan_deduction)}</span>
                    </div>
                  )}
                  {payslipData.entry?.other_deductions > 0 && (
                    <div className="flex justify-between">
                      <span>{isEs ? "Otras Deducciones" : "Other Deductions"}</span>
                      <span className="text-red-600">-{formatCurrency(payslipData.entry?.other_deductions)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t pt-1 mt-2">
                    <span>{isEs ? "Total Deducciones" : "Total Deductions"}</span>
                    <span className="text-red-600">-{formatCurrency(payslipData.entry?.total_deductions)}</span>
                  </div>
                </div>
              </div>
              
              {/* Net Pay */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                <p className="text-sm text-emerald-600">{isEs ? "PAGO NETO" : "NET PAY"}</p>
                <p className="text-3xl font-bold text-emerald-700">{formatCurrency(payslipData.entry?.net_salary)}</p>
              </div>
              
              {/* Payment Info */}
              <div className="text-sm text-muted-foreground text-center">
                <p>{isEs ? "Fecha de pago:" : "Payment date:"} {payslipData.period?.payment_date}</p>
                {payslipData.entry?.bank_name && (
                  <p>{payslipData.entry?.bank_name} - ****{payslipData.entry?.bank_account?.slice(-4)}</p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayslipDialogOpen(false)}>
              {isEs ? "Cerrar" : "Close"}
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" />
              {isEs ? "Imprimir" : "Print"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
