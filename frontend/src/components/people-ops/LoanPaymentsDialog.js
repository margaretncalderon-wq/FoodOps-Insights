import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Badge } from "../ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "../ui/table";
import {
  RefreshCw, Wallet, DollarSign, Archive, History, CheckCircle
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) =>
  amount === null || amount === undefined
    ? "-"
    : `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TYPE_META = {
  payroll_deduction: {
    label: "Nómina",
    labelEn: "Payroll",
    color: "bg-violet-100 text-violet-700",
    Icon: Wallet
  },
  historical: {
    label: "Histórico",
    labelEn: "Historical",
    color: "bg-purple-100 text-purple-700",
    Icon: Archive
  },
  manual: {
    label: "Manual",
    labelEn: "Manual",
    color: "bg-emerald-100 text-emerald-700",
    Icon: DollarSign
  },
  cash: {
    label: "Efectivo",
    labelEn: "Cash",
    color: "bg-emerald-100 text-emerald-700",
    Icon: DollarSign
  },
  transfer: {
    label: "Transferencia",
    labelEn: "Transfer",
    color: "bg-blue-100 text-blue-700",
    Icon: DollarSign
  },
  check: {
    label: "Cheque",
    labelEn: "Check",
    color: "bg-blue-100 text-blue-700",
    Icon: DollarSign
  },
  other: {
    label: "Otro",
    labelEn: "Other",
    color: "bg-slate-100 text-slate-700",
    Icon: DollarSign
  }
};

export function LoanPaymentsDialog({ open, onOpenChange, loanId }) {
  const { language } = useLanguage();
  const isEs = language === "es";

  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState(null);
  const [payments, setPayments] = useState([]);

  const fetchData = useCallback(async () => {
    if (!loanId) return;
    setLoading(true);
    try {
      const res = await axios.get(
        `${API}/api/people-ops/loans/${loanId}/payments`,
        { withCredentials: true }
      );
      setLoan(res.data.loan);
      setPayments(res.data.payments || []);
    } catch (err) {
      console.error("Error fetching loan payments:", err);
      setLoan(null);
      setPayments([]);
    }
    setLoading(false);
  }, [loanId]);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  const renderTypeBadge = (type) => {
    const meta = TYPE_META[type] || TYPE_META.other;
    const Icon = meta.Icon;
    return (
      <Badge className={`${meta.color} border-0 gap-1`}>
        <Icon className="w-3 h-3" />
        {isEs ? meta.label : meta.labelEn}
      </Badge>
    );
  };

  // Sort payments by date ascending
  const sorted = [...payments].sort((a, b) => {
    const da = (a.payment_date || a.created_at || "").toString();
    const dbb = (b.payment_date || b.created_at || "").toString();
    return da.localeCompare(dbb);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="loan-payments-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            {isEs ? "Historial de Pagos del Préstamo" : "Loan Payment History"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !loan ? (
          <div className="py-10 text-center text-muted-foreground">
            {isEs ? "No se encontró el préstamo" : "Loan not found"}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Loan summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-lg border bg-muted/30">
              <div>
                <p className="text-xs text-muted-foreground">{isEs ? "Empleado" : "Employee"}</p>
                <p className="font-medium text-sm">{loan.employee_name}</p>
                {loan.is_legacy && (
                  <Badge className="bg-purple-100 text-purple-700 mt-1 text-[10px] px-1.5 py-0">
                    <Archive className="w-3 h-3 mr-1" />
                    {isEs ? "Histórico" : "Legacy"}
                  </Badge>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{isEs ? "Monto Aprobado" : "Approved"}</p>
                <p className="font-semibold">{formatCurrency(loan.approved_amount || loan.requested_amount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{isEs ? "Total Pagado" : "Total Paid"}</p>
                <p className="font-semibold text-emerald-600">{formatCurrency(loan.total_paid)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{isEs ? "Saldo Restante" : "Remaining"}</p>
                <p className="font-semibold text-blue-600">{formatCurrency(loan.remaining_balance)}</p>
              </div>
              <div className="col-span-2 md:col-span-2">
                <p className="text-xs text-muted-foreground">{isEs ? "Cuotas" : "Installments"}</p>
                <p className="text-sm font-medium">
                  {loan.installments_paid} / {loan.installments}
                  {" "}<span className="text-muted-foreground">· {formatCurrency(loan.installment_amount)} {isEs ? "por período" : "per period"}</span>
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">{isEs ? "Período" : "Period"}</p>
                <p className="text-sm font-medium">
                  {loan.start_date || "?"} → {loan.end_date || "?"}
                </p>
              </div>
            </div>

            {/* Timeline / Payments */}
            {sorted.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {isEs ? "Aún no hay pagos registrados" : "No payments recorded yet"}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                    <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Monto" : "Amount"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Saldo Después" : "Balance After"}</TableHead>
                    <TableHead>{isEs ? "Notas" : "Notes"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((p) => (
                    <TableRow key={p.payment_id} data-testid={`payment-${p.payment_id}`}>
                      <TableCell className="text-sm">
                        {p.payment_date || (p.created_at ? String(p.created_at).slice(0, 10) : "-")}
                      </TableCell>
                      <TableCell>{renderTypeBadge(p.payment_type)}</TableCell>
                      <TableCell className="text-right font-medium text-emerald-700">
                        {formatCurrency(p.amount)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-blue-600">
                        {formatCurrency(p.balance_after)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.notes || (p.payroll_period_id ? (isEs ? `Nómina ${p.payroll_period_id.slice(-8)}` : `Payroll ${p.payroll_period_id.slice(-8)}`) : "-")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {loan.status === "paid_off" || loan.status === "paid" ? (
              <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm">
                <CheckCircle className="w-4 h-4" />
                {isEs ? "Este préstamo está totalmente pagado." : "This loan is fully paid off."}
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
