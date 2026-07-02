import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "../../ui/table";
import {
  CreditCard, RefreshCw, DollarSign, Clock, CheckCircle,
  History, Archive
} from "lucide-react";

import { API_BASE as API } from "../../../utils/api";
import { LoanPaymentsDialog } from "../LoanPaymentsDialog";

const formatCurrency = (amount) =>
  `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const LOAN_TYPES = {
  personal_loan: { label: "Personal", labelEn: "Personal", color: "bg-blue-100 text-blue-700" },
  salary_advance: { label: "Adelanto", labelEn: "Advance", color: "bg-emerald-100 text-emerald-700" },
  emergency_loan: { label: "Emergencia", labelEn: "Emergency", color: "bg-red-100 text-red-700" },
  education_loan: { label: "Educativo", labelEn: "Education", color: "bg-purple-100 text-purple-700" }
};

const STATUS_CONFIG = {
  pending: { label: "Pendiente", labelEn: "Pending", color: "bg-amber-100 text-amber-700" },
  approved: { label: "Aprobado", labelEn: "Approved", color: "bg-blue-100 text-blue-700" },
  active: { label: "Activo", labelEn: "Active", color: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rechazado", labelEn: "Rejected", color: "bg-red-100 text-red-700" },
  paid_off: { label: "Pagado", labelEn: "Paid Off", color: "bg-gray-100 text-gray-700" },
  paid: { label: "Pagado", labelEn: "Paid Off", color: "bg-gray-100 text-gray-700" },
  cancelled: { label: "Cancelado", labelEn: "Cancelled", color: "bg-gray-100 text-gray-700" }
};

export function LoansTab({ employeeId }) {
  const { language } = useLanguage();
  const isEs = language === "es";

  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState(null);

  const fetchData = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const res = await axios.get(
        `${API}/api/people-ops/loans?employee_id=${employeeId}&limit=100`,
        { withCredentials: true }
      );
      setLoans(res.data || []);
    } catch (err) {
      console.error("Error fetching loans:", err);
    }
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openHistory = (loanId) => {
    setSelectedLoanId(loanId);
    setDialogOpen(true);
  };

  const activeLoans = loans.filter(l => l.status === "active");
  const outstanding = activeLoans.reduce((sum, l) => sum + (l.remaining_balance || 0), 0);
  const totalPaidHistorically = loans.reduce((sum, l) => sum + (l.total_paid || 0), 0);
  const paidOffCount = loans.filter(l => l.status === "paid_off" || l.status === "paid").length;

  return (
    <div className="space-y-6" data-testid="loans-tab">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-emerald-700 text-sm">
              <CheckCircle className="w-4 h-4" />
              {isEs ? "Activos" : "Active"}
            </div>
            <p className="text-2xl font-bold mt-1">{activeLoans.length}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-blue-700 text-sm">
              <DollarSign className="w-4 h-4" />
              {isEs ? "Saldo Pendiente" : "Outstanding"}
            </div>
            <p className="text-xl font-bold mt-1 text-blue-700">{formatCurrency(outstanding)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <History className="w-4 h-4" />
              {isEs ? "Total Pagado" : "Total Paid"}
            </div>
            <p className="text-xl font-bold mt-1">{formatCurrency(totalPaidHistorically)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Clock className="w-4 h-4" />
              {isEs ? "Pagados" : "Paid Off"}
            </div>
            <p className="text-2xl font-bold mt-1">{paidOffCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Loans Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            {isEs ? "Préstamos del Empleado" : "Employee Loans"}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : loans.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{isEs ? "Este empleado no tiene préstamos" : "This employee has no loans"}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                  <TableHead>{isEs ? "Período" : "Period"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Aprobado" : "Approved"}</TableHead>
                  <TableHead className="text-center">{isEs ? "Cuotas" : "Installments"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                  <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Acciones" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.map((loan) => {
                  const typeConfig = LOAN_TYPES[loan.loan_type] || LOAN_TYPES.personal_loan;
                  const statusConfig = STATUS_CONFIG[loan.status] || {};
                  return (
                    <TableRow key={loan.loan_id} data-testid={`emp-loan-${loan.loan_id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={typeConfig.color}>
                            {isEs ? typeConfig.label : typeConfig.labelEn}
                          </Badge>
                          {loan.is_legacy && (
                            <Badge className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0">
                              <Archive className="w-3 h-3 mr-1" />
                              {isEs ? "Histórico" : "Legacy"}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {loan.start_date || "?"} → {loan.end_date || "?"}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(loan.approved_amount || loan.requested_amount)}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {loan.installments_paid || 0} / {loan.installments}
                      </TableCell>
                      <TableCell className="text-right font-medium text-blue-600">
                        {formatCurrency(loan.remaining_balance)}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusConfig.color}>
                          {isEs ? statusConfig.label : statusConfig.labelEn}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openHistory(loan.loan_id)}
                          data-testid={`view-history-${loan.loan_id}`}
                        >
                          <History className="w-3.5 h-3.5 mr-1" />
                          {isEs ? "Ver Historial" : "View History"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <LoanPaymentsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        loanId={selectedLoanId}
      />
    </div>
  );
}
