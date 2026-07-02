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
  Wallet, Plus, RefreshCw, CheckCircle, XCircle, Clock,
  CreditCard, DollarSign, AlertCircle, History, Archive, Trash2
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => 
  `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const LOAN_TYPES = {
  personal_loan: { label: "Préstamo Personal", labelEn: "Personal Loan", color: "bg-blue-100 text-blue-700" },
  salary_advance: { label: "Adelanto de Salario", labelEn: "Salary Advance", color: "bg-emerald-100 text-emerald-700" },
  emergency_loan: { label: "Préstamo de Emergencia", labelEn: "Emergency Loan", color: "bg-red-100 text-red-700" },
  education_loan: { label: "Préstamo Educativo", labelEn: "Education Loan", color: "bg-purple-100 text-purple-700" }
};

const STATUS_CONFIG = {
  pending: { label: "Pendiente", labelEn: "Pending", color: "bg-amber-100 text-amber-700" },
  approved: { label: "Aprobado", labelEn: "Approved", color: "bg-blue-100 text-blue-700" },
  active: { label: "Activo", labelEn: "Active", color: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rechazado", labelEn: "Rejected", color: "bg-red-100 text-red-700" },
  paid_off: { label: "Pagado", labelEn: "Paid Off", color: "bg-gray-100 text-gray-700" },
  cancelled: { label: "Cancelado", labelEn: "Cancelled", color: "bg-gray-100 text-gray-700" }
};

export function LoansSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loans, setLoans] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Manual payment dialog
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: "", payment_type: "cash", payment_date: new Date().toISOString().slice(0,10), notes: "" });
  const [payingLoan, setPayingLoan] = useState(null);
  
  // Legacy (historical) loan dialog
  const today = new Date().toISOString().slice(0, 10);
  const emptyLegacy = {
    employee_id: "",
    loan_type: "personal_loan",
    original_amount: "",
    installments: 12,
    installment_amount: "",
    start_date: "",
    end_date: "",
    reason: "",
    notes: "",
    historical_payments: []
  };
  const [legacyDialogOpen, setLegacyDialogOpen] = useState(false);
  const [legacyForm, setLegacyForm] = useState(emptyLegacy);
  
  const addLegacyPayment = () => {
    setLegacyForm(f => ({
      ...f,
      historical_payments: [...f.historical_payments, { payment_date: today, amount: "", notes: "" }]
    }));
  };
  const updateLegacyPayment = (idx, patch) => {
    setLegacyForm(f => ({
      ...f,
      historical_payments: f.historical_payments.map((p, i) => (i === idx ? { ...p, ...patch } : p))
    }));
  };
  const removeLegacyPayment = (idx) => {
    setLegacyForm(f => ({
      ...f,
      historical_payments: f.historical_payments.filter((_, i) => i !== idx)
    }));
  };
  
  const legacyOriginal = parseFloat(legacyForm.original_amount) || 0;
  const legacyTotalPaid = legacyForm.historical_payments.reduce(
    (sum, p) => sum + (parseFloat(p.amount) || 0),
    0
  );
  const legacyRemaining = Math.max(0, legacyOriginal - legacyTotalPaid);
  const legacyOver = legacyTotalPaid > legacyOriginal + 0.01;
  
  const submitLegacyLoan = async () => {
    if (!legacyForm.employee_id) { alert(isEs ? "Selecciona un empleado" : "Select an employee"); return; }
    if (legacyOriginal <= 0) { alert(isEs ? "Monto original inválido" : "Invalid original amount"); return; }
    if ((parseFloat(legacyForm.installment_amount) || 0) <= 0) { alert(isEs ? "Cuota por período inválida" : "Invalid installment amount"); return; }
    if (!legacyForm.start_date || !legacyForm.end_date) { alert(isEs ? "Fecha de inicio y fin son requeridas" : "Start and end dates are required"); return; }
    if (legacyForm.end_date < legacyForm.start_date) { alert(isEs ? "La fecha de fin debe ser posterior al inicio" : "End date must be after start date"); return; }
    if (legacyOver) { alert(isEs ? "Los pagos históricos exceden el monto original" : "Historical payments exceed original amount"); return; }
    // Validate each payment
    for (const p of legacyForm.historical_payments) {
      if (!p.payment_date) { alert(isEs ? "Cada pago histórico requiere fecha" : "Every historical payment needs a date"); return; }
      if (!(parseFloat(p.amount) > 0)) { alert(isEs ? "Cada pago histórico requiere monto > 0" : "Every historical payment needs amount > 0"); return; }
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/people-ops/loans/legacy`, {
        employee_id: legacyForm.employee_id,
        loan_type: legacyForm.loan_type,
        original_amount: legacyOriginal,
        installments: parseInt(legacyForm.installments) || 0,
        installment_amount: parseFloat(legacyForm.installment_amount) || 0,
        start_date: legacyForm.start_date,
        end_date: legacyForm.end_date,
        reason: legacyForm.reason || (isEs ? "Préstamo histórico (previo al sistema)" : "Historical loan (pre-system)"),
        notes: legacyForm.notes || null,
        historical_payments: legacyForm.historical_payments.map(p => ({
          payment_date: p.payment_date,
          amount: parseFloat(p.amount),
          notes: p.notes || null
        }))
      }, { withCredentials: true });
      setLegacyDialogOpen(false);
      setLegacyForm(emptyLegacy);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || (isEs ? "Error al registrar préstamo histórico" : "Error registering legacy loan"));
    }
    setSubmitting(false);
  };
  
  const openManualPayment = (loan) => {
    setPayingLoan(loan);
    setPaymentForm({
      amount: String(loan.installment_amount || ""),
      payment_type: "cash",
      payment_date: new Date().toISOString().slice(0,10),
      notes: ""
    });
    setPaymentDialogOpen(true);
  };
  
  const submitManualPayment = async () => {
    const amt = parseFloat(paymentForm.amount);
    if (!amt || amt <= 0) { alert(isEs ? "Ingresa un monto válido" : "Enter a valid amount"); return; }
    setSubmitting(true);
    try {
      await axios.post(
        `${API}/api/people-ops/loans/${payingLoan.loan_id}/payment`,
        {
          amount: amt,
          payment_type: paymentForm.payment_type,
          payment_date: paymentForm.payment_date,
          notes: paymentForm.notes || null
        },
        { withCredentials: true }
      );
      setPaymentDialogOpen(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || (isEs ? "Error al registrar el pago" : "Error recording payment"));
    }
    setSubmitting(false);
  };
  
  const [newLoan, setNewLoan] = useState({
    employee_id: "",
    loan_type: "personal_loan",
    requested_amount: "",
    installments: 6,
    reason: ""
  });

  const [approveData, setApproveData] = useState({
    approved_amount: "",
    installments: 6,
    start_date: ""
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [loansRes, empRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/loans?limit=50`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/employees?status=active`, { withCredentials: true })
      ]);
      setLoans(loansRes.data);
      setEmployees(empRes.data);
    } catch (err) {
      console.error("Error fetching loans:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateLoan = async () => {
    if (!newLoan.employee_id || !newLoan.requested_amount) {
      alert(isEs ? "Completa todos los campos requeridos" : "Complete all required fields");
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/people-ops/loans`, {
        ...newLoan,
        requested_amount: parseFloat(newLoan.requested_amount)
      }, { withCredentials: true });
      setDialogOpen(false);
      setNewLoan({ employee_id: "", loan_type: "personal_loan", requested_amount: "", installments: 6, reason: "" });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error creating loan request");
    }
    setSubmitting(false);
  };

  const handleOpenApprove = (loan) => {
    setSelectedLoan(loan);
    setApproveData({
      approved_amount: loan.requested_amount,
      installments: loan.installments,
      start_date: new Date().toISOString().split("T")[0]
    });
    setApproveDialogOpen(true);
  };

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await axios.post(
        `${API}/api/people-ops/loans/${selectedLoan.loan_id}/approve`,
        {
          approved_amount: parseFloat(approveData.approved_amount),
          installments: approveData.installments,
          start_date: approveData.start_date
        },
        { withCredentials: true }
      );
      setApproveDialogOpen(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error approving loan");
    }
    setSubmitting(false);
  };

  const handleReject = async (loanId) => {
    const reason = prompt(isEs ? "Motivo del rechazo:" : "Rejection reason:");
    if (reason === null) return;
    try {
      await axios.post(`${API}/api/people-ops/loans/${loanId}/reject`, { reason }, { withCredentials: true });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const pendingCount = loans.filter(l => l.status === "pending").length;
  const activeLoans = loans.filter(l => l.status === "active");
  const totalOutstanding = activeLoans.reduce((sum, l) => sum + (l.remaining_balance || 0), 0);

  return (
    <div className="space-y-6" data-testid="loans-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            {isEs ? "Préstamos y Adelantos" : "Loans & Advances"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Gestión de préstamos y adelantos de salario" : "Manage loans and salary advances"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}><RefreshCw className="w-4 h-4" /></Button>
          <Button
            variant="outline"
            onClick={() => { setLegacyForm(emptyLegacy); setLegacyDialogOpen(true); }}
            data-testid="new-legacy-loan-btn"
            className="border-purple-300 text-purple-700 hover:bg-purple-50"
          >
            <Archive className="w-4 h-4 mr-2" />
            {isEs ? "Registrar Histórico" : "Register Legacy"}
          </Button>
          <Button onClick={() => setDialogOpen(true)} data-testid="new-loan-btn">
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Nueva Solicitud" : "New Request"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={pendingCount > 0 ? "border-amber-300 bg-amber-50/30" : ""}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <Clock className="w-4 h-4" />
              {isEs ? "Pendientes" : "Pending"}
            </div>
            <p className="text-3xl font-bold mt-1">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-emerald-600 text-sm">
              <CheckCircle className="w-4 h-4" />
              {isEs ? "Préstamos Activos" : "Active Loans"}
            </div>
            <p className="text-3xl font-bold mt-1">{activeLoans.length}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-blue-600 text-sm">
              <DollarSign className="w-4 h-4" />
              {isEs ? "Saldo Pendiente Total" : "Total Outstanding"}
            </div>
            <p className="text-2xl font-bold mt-1 text-blue-700">{formatCurrency(totalOutstanding)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <History className="w-4 h-4" />
              {isEs ? "Pagados" : "Paid Off"}
            </div>
            <p className="text-3xl font-bold mt-1">
              {loans.filter(l => l.status === "paid_off").length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Loans Table */}
      <Card>
        <CardContent className="p-0">
          {loans.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{isEs ? "No hay préstamos" : "No loans"}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Empleado" : "Employee"}</TableHead>
                  <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Solicitado" : "Requested"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Aprobado" : "Approved"}</TableHead>
                  <TableHead className="text-center">{isEs ? "Cuotas" : "Installments"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                  <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                  <TableHead>{isEs ? "Acciones" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.map((loan) => {
                  const typeConfig = LOAN_TYPES[loan.loan_type] || LOAN_TYPES.personal_loan;
                  return (
                    <TableRow key={loan.loan_id} data-testid={`loan-${loan.loan_id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{loan.employee_name}</span>
                          {loan.is_legacy && (
                            <Badge className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0" title={`${loan.start_date || "?"} → ${loan.end_date || "?"}`}>
                              <Archive className="w-3 h-3 mr-1" />
                              {isEs ? "Histórico" : "Legacy"}
                            </Badge>
                          )}
                        </div>
                        {(loan.start_date || loan.end_date) && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {loan.start_date || "?"} → {loan.end_date || "?"}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={typeConfig.color}>
                          {isEs ? typeConfig.label : typeConfig.labelEn}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(loan.requested_amount)}</TableCell>
                      <TableCell className="text-right">
                        {loan.approved_amount > 0 ? formatCurrency(loan.approved_amount) : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {loan.status === "active" ? (
                          <span>{loan.installments_paid} / {loan.installments}</span>
                        ) : (
                          loan.installments
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {loan.status === "active" ? (
                          <span className="text-blue-600">{formatCurrency(loan.remaining_balance)}</span>
                        ) : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_CONFIG[loan.status]?.color}>
                          {isEs ? STATUS_CONFIG[loan.status]?.label : STATUS_CONFIG[loan.status]?.labelEn}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {loan.status === "pending" && (
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleOpenApprove(loan)}
                              className="text-emerald-600"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleReject(loan.loan_id)}
                              className="text-red-600"
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                        {loan.status === "active" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openManualPayment(loan)}
                            className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                            data-testid={`manual-payment-${loan.loan_id}`}
                          >
                            <DollarSign className="w-3.5 h-3.5 mr-1" />
                            {isEs ? "Pago Manual" : "Manual Payment"}
                          </Button>
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

      {/* New Loan Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEs ? "Nueva Solicitud de Préstamo" : "New Loan Request"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Empleado *" : "Employee *"}</label>
              <Select value={newLoan.employee_id} onValueChange={(v) => setNewLoan({ ...newLoan, employee_id: v })}>
                <SelectTrigger>
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
              <label className="text-sm font-medium">{isEs ? "Tipo de Préstamo *" : "Loan Type *"}</label>
              <Select value={newLoan.loan_type} onValueChange={(v) => setNewLoan({ ...newLoan, loan_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LOAN_TYPES).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{isEs ? config.label : config.labelEn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Monto Solicitado *" : "Requested Amount *"}</label>
                <Input
                  type="number"
                  value={newLoan.requested_amount}
                  onChange={(e) => setNewLoan({ ...newLoan, requested_amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Cuotas" : "Installments"}</label>
                <Select 
                  value={newLoan.installments.toString()} 
                  onValueChange={(v) => setNewLoan({ ...newLoan, installments: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 6, 8, 10, 12, 18, 24].map((n) => (
                      <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {newLoan.requested_amount && (
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">{isEs ? "Cuota estimada por período:" : "Estimated installment per period:"}</p>
                <p className="text-xl font-bold">
                  {formatCurrency(parseFloat(newLoan.requested_amount) / newLoan.installments)}
                </p>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">{isEs ? "Motivo *" : "Reason *"}</label>
              <Textarea
                value={newLoan.reason}
                onChange={(e) => setNewLoan({ ...newLoan, reason: e.target.value })}
                placeholder={isEs ? "Describa el motivo del préstamo..." : "Describe the reason for the loan..."}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleCreateLoan} disabled={submitting}>
              {submitting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              {isEs ? "Solicitar" : "Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEs ? "Aprobar Préstamo" : "Approve Loan"}</DialogTitle>
          </DialogHeader>

          {selectedLoan && (
            <div className="space-y-4 py-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">{isEs ? "Empleado" : "Employee"}</p>
                <p className="font-medium">{selectedLoan.employee_name}</p>
                <p className="text-sm text-muted-foreground mt-2">{isEs ? "Solicitado" : "Requested"}</p>
                <p className="font-bold">{formatCurrency(selectedLoan.requested_amount)}</p>
              </div>

              <div>
                <label className="text-sm font-medium">{isEs ? "Monto a Aprobar" : "Amount to Approve"}</label>
                <Input
                  type="number"
                  value={approveData.approved_amount}
                  onChange={(e) => setApproveData({ ...approveData, approved_amount: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">{isEs ? "Cuotas" : "Installments"}</label>
                  <Select 
                    value={approveData.installments.toString()} 
                    onValueChange={(v) => setApproveData({ ...approveData, installments: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 6, 8, 10, 12, 18, 24].map((n) => (
                        <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">{isEs ? "Inicio Descuentos" : "Start Deductions"}</label>
                  <Input
                    type="date"
                    value={approveData.start_date}
                    onChange={(e) => setApproveData({ ...approveData, start_date: e.target.value })}
                  />
                </div>
              </div>

              {approveData.approved_amount && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <p className="text-sm text-emerald-600">{isEs ? "Cuota por período:" : "Installment per period:"}</p>
                  <p className="text-xl font-bold text-emerald-700">
                    {formatCurrency(parseFloat(approveData.approved_amount) / approveData.installments)}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleApprove} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
              {submitting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              {isEs ? "Aprobar" : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEs ? "Registrar Pago Manual" : "Record Manual Payment"}</DialogTitle>
          </DialogHeader>
          {payingLoan && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg bg-muted/40 border">
                <p className="text-xs text-muted-foreground">{isEs ? "Empleado" : "Employee"}</p>
                <p className="font-medium">{payingLoan.employee_name}</p>
                <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{isEs ? "Cuota" : "Installment"}</p>
                    <p className="font-semibold">{formatCurrency(payingLoan.installment_amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{isEs ? "Saldo actual" : "Current balance"}</p>
                    <p className="font-semibold text-blue-600">{formatCurrency(payingLoan.remaining_balance)}</p>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium">{isEs ? "Monto del Pago *" : "Payment Amount *"}</label>
                <Input
                  type="number" min="0" step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})}
                  data-testid="manual-payment-amount"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {isEs ? "Se ajustará al saldo si excede." : "Will be capped to remaining balance."}
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha del Pago" : "Payment Date"}</label>
                <Input
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm({...paymentForm, payment_date: e.target.value})}
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">{isEs ? "Método de Pago" : "Payment Method"}</label>
                <Select value={paymentForm.payment_type} onValueChange={(v) => setPaymentForm({...paymentForm, payment_type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{isEs ? "Efectivo" : "Cash"}</SelectItem>
                    <SelectItem value="transfer">{isEs ? "Transferencia" : "Bank Transfer"}</SelectItem>
                    <SelectItem value="check">{isEs ? "Cheque" : "Check"}</SelectItem>
                    <SelectItem value="other">{isEs ? "Otro" : "Other"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium">{isEs ? "Notas" : "Notes"}</label>
                <Textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({...paymentForm, notes: e.target.value})}
                  placeholder={isEs ? "Referencia, comentarios..." : "Reference, comments..."}
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={submitManualPayment} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700" data-testid="submit-manual-payment">
              {submitting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <DollarSign className="w-4 h-4 mr-2" />}
              {isEs ? "Registrar Pago" : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Legacy Loan Dialog */}
      <Dialog open={legacyDialogOpen} onOpenChange={setLegacyDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="w-5 h-5 text-purple-600" />
              {isEs ? "Registrar Préstamo Histórico" : "Register Legacy Loan"}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {isEs
                ? "Para préstamos que existían antes del sistema. Se creará en estado ACTIVO con los pagos previos ya aplicados."
                : "For loans that existed before the system. Will be created in ACTIVE state with historical payments already applied."}
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Empleado *" : "Employee *"}</label>
                <Select
                  value={legacyForm.employee_id}
                  onValueChange={(v) => setLegacyForm({ ...legacyForm, employee_id: v })}
                >
                  <SelectTrigger data-testid="legacy-employee-select"><SelectValue placeholder={isEs ? "Selecciona empleado" : "Select employee"} /></SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.employee_id} value={emp.employee_id}>
                        {emp.full_name} — {emp.position || "-"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Tipo de Préstamo" : "Loan Type"}</label>
                <Select
                  value={legacyForm.loan_type}
                  onValueChange={(v) => setLegacyForm({ ...legacyForm, loan_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(LOAN_TYPES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{isEs ? v.label : v.labelEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Monto Original *" : "Original Amount *"}</label>
                <Input
                  type="number" min="0" step="0.01"
                  value={legacyForm.original_amount}
                  onChange={(e) => setLegacyForm({ ...legacyForm, original_amount: e.target.value })}
                  placeholder="60000"
                  data-testid="legacy-original-amount"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Cuotas Totales *" : "Total Installments *"}</label>
                <Input
                  type="number" min="1"
                  value={legacyForm.installments}
                  onChange={(e) => setLegacyForm({ ...legacyForm, installments: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Cuota por Período *" : "Per-Period Installment *"}</label>
                <Input
                  type="number" min="0" step="0.01"
                  value={legacyForm.installment_amount}
                  onChange={(e) => setLegacyForm({ ...legacyForm, installment_amount: e.target.value })}
                  placeholder={legacyOriginal && legacyForm.installments ? String((legacyOriginal / (parseInt(legacyForm.installments) || 1)).toFixed(2)) : "5000"}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha de Inicio (histórica) *" : "Start Date (historical) *"}</label>
                <Input
                  type="date"
                  value={legacyForm.start_date}
                  onChange={(e) => setLegacyForm({ ...legacyForm, start_date: e.target.value })}
                  data-testid="legacy-start-date"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha de Fin Esperada *" : "Expected End Date *"}</label>
                <Input
                  type="date"
                  value={legacyForm.end_date}
                  onChange={(e) => setLegacyForm({ ...legacyForm, end_date: e.target.value })}
                  data-testid="legacy-end-date"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">{isEs ? "Motivo / Referencia" : "Reason / Reference"}</label>
              <Input
                value={legacyForm.reason}
                onChange={(e) => setLegacyForm({ ...legacyForm, reason: e.target.value })}
                placeholder={isEs ? "Ej: Préstamo aprobado en Feb 2025 antes del sistema" : "e.g., Loan approved Feb 2025 pre-system"}
              />
            </div>

            {/* Historical Payments */}
            <div className="border rounded-lg p-3 bg-purple-50/40">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <History className="w-4 h-4 text-purple-600" />
                  {isEs ? "Pagos Históricos (previos al sistema)" : "Historical Payments (pre-system)"}
                </h4>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addLegacyPayment}
                  data-testid="add-legacy-payment"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  {isEs ? "Agregar Pago" : "Add Payment"}
                </Button>
              </div>

              {legacyForm.historical_payments.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  {isEs ? "Sin pagos históricos. Agrega uno por cada cuota ya pagada antes del sistema." : "No historical payments. Add one per installment already paid before the system."}
                </p>
              ) : (
                <div className="space-y-2">
                  {legacyForm.historical_payments.map((p, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded border" data-testid={`legacy-payment-row-${idx}`}>
                      <div className="col-span-4">
                        <Input
                          type="date"
                          value={p.payment_date}
                          onChange={(e) => updateLegacyPayment(idx, { payment_date: e.target.value })}
                          className="h-8"
                        />
                      </div>
                      <div className="col-span-3">
                        <Input
                          type="number" min="0" step="0.01"
                          value={p.amount}
                          onChange={(e) => updateLegacyPayment(idx, { amount: e.target.value })}
                          placeholder="Monto"
                          className="h-8"
                        />
                      </div>
                      <div className="col-span-4">
                        <Input
                          value={p.notes}
                          onChange={(e) => updateLegacyPayment(idx, { notes: e.target.value })}
                          placeholder={isEs ? "Notas (opcional)" : "Notes (optional)"}
                          className="h-8"
                        />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                          onClick={() => removeLegacyPayment(idx)}
                          data-testid={`remove-legacy-payment-${idx}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Live summary */}
              <div className={`mt-3 grid grid-cols-3 gap-3 p-3 rounded-lg border ${legacyOver ? "border-red-300 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
                <div>
                  <p className="text-xs text-muted-foreground">{isEs ? "Total Pagado" : "Total Paid"}</p>
                  <p className={`font-bold ${legacyOver ? "text-red-700" : "text-emerald-700"}`} data-testid="legacy-total-paid">
                    {formatCurrency(legacyTotalPaid)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{isEs ? "Cuotas Pagadas" : "Installments Paid"}</p>
                  <p className="font-bold">
                    {legacyForm.historical_payments.length} / {legacyForm.installments || 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{isEs ? "Saldo Restante" : "Remaining Balance"}</p>
                  <p className="font-bold text-blue-700" data-testid="legacy-remaining-balance">
                    {formatCurrency(legacyRemaining)}
                  </p>
                </div>
              </div>
              {legacyOver && (
                <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {isEs ? "La suma de pagos excede el monto original." : "Sum of payments exceeds original amount."}
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">{isEs ? "Notas Adicionales" : "Additional Notes"}</label>
              <Textarea
                value={legacyForm.notes}
                onChange={(e) => setLegacyForm({ ...legacyForm, notes: e.target.value })}
                rows={2}
                placeholder={isEs ? "Cualquier información adicional..." : "Any additional information..."}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLegacyDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button
              onClick={submitLegacyLoan}
              disabled={submitting || legacyOver}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="submit-legacy-loan"
            >
              {submitting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Archive className="w-4 h-4 mr-2" />}
              {isEs ? "Registrar Préstamo Histórico" : "Register Legacy Loan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
