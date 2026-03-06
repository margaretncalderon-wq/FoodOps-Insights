import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Textarea } from "../ui/textarea";
import { ScrollArea } from "../ui/scroll-area";
import {
  Plus, RefreshCw, TrendingUp, TrendingDown, Wallet, ArrowUpCircle, ArrowDownCircle,
  DollarSign, AlertTriangle, Calendar, Clock, PiggyBank, CreditCard, Loader2,
  ArrowRightLeft, Receipt
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CashFlowSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  // States
  const [loading, setLoading] = useState(true);
  const [cashFlowData, setCashFlowData] = useState(null);
  const [pettyCashData, setPettyCashData] = useState(null);
  const [allPayments, setAllPayments] = useState([]);
  const [paymentsSummary, setPaymentsSummary] = useState(null);
  
  // Petty Cash Dialog
  const [pettyCashDialogOpen, setPettyCashDialogOpen] = useState(false);
  const [pettyCashForm, setPettyCashForm] = useState({
    transaction_type: "withdrawal",
    amount: "",
    description: "",
    category: "misc",
    receipt_number: "",
    vendor_name: "",
    notes: ""
  });
  const [submitting, setSubmitting] = useState(false);
  
  // Date filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  
  const PETTY_CASH_CATEGORIES = [
    { value: "office_supplies", label: "Office Supplies", labelEs: "Papelería/Oficina" },
    { value: "transportation", label: "Transportation", labelEs: "Transporte" },
    { value: "food", label: "Food & Beverage", labelEs: "Alimentos y Bebidas" },
    { value: "cleaning", label: "Cleaning", labelEs: "Limpieza" },
    { value: "maintenance", label: "Maintenance", labelEs: "Mantenimiento" },
    { value: "misc", label: "Miscellaneous", labelEs: "Varios" }
  ];
  
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [cashFlowRes, pettyCashRes, paymentsRes] = await Promise.all([
        axios.get(`${API}/api/business-clarity/cash-flow?start_date=${startDate}&end_date=${endDate}`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/petty-cash`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/all-payments?start_date=${startDate}&end_date=${endDate}`, { withCredentials: true })
      ]);
      setCashFlowData(cashFlowRes.data);
      setPettyCashData(pettyCashRes.data);
      setAllPayments(paymentsRes.data.payments || []);
      setPaymentsSummary(paymentsRes.data.summary);
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error al cargar datos" : "Error loading data");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, isEs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePettyCashTransaction = async () => {
    if (!pettyCashForm.amount || parseFloat(pettyCashForm.amount) <= 0) {
      toast.error(isEs ? "Ingresa un monto válido" : "Enter a valid amount");
      return;
    }
    if (!pettyCashForm.description) {
      toast.error(isEs ? "Ingresa una descripción" : "Enter a description");
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API}/api/business-clarity/petty-cash/transactions`, {
        ...pettyCashForm,
        amount: parseFloat(pettyCashForm.amount)
      }, { withCredentials: true });
      
      toast.success(isEs ? "Transacción registrada" : "Transaction recorded");
      setPettyCashDialogOpen(false);
      setPettyCashForm({
        transaction_type: "withdrawal",
        amount: "",
        description: "",
        category: "misc",
        receipt_number: "",
        vendor_name: "",
        notes: ""
      });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error" : "Error"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-sm">{isEs ? "Desde" : "From"}</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm">{isEs ? "Hasta" : "To"}</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-40"
          />
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {isEs ? "Actualizar" : "Refresh"}
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <TrendingUp className="w-4 h-4" />
            {isEs ? "Flujo de Caja" : "Cash Flow"}
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2">
            <ArrowRightLeft className="w-4 h-4" />
            {isEs ? "Pagos" : "Payments"}
          </TabsTrigger>
          <TabsTrigger value="petty-cash" className="gap-2">
            <PiggyBank className="w-4 h-4" />
            {isEs ? "Caja Chica" : "Petty Cash"}
          </TabsTrigger>
        </TabsList>

        {/* Cash Flow Overview */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-700">{isEs ? "Ingresos" : "Inflows"}</p>
                    <p className="text-2xl font-bold text-green-700">
                      {formatCurrency(cashFlowData?.inflows?.total)}
                    </p>
                  </div>
                  <ArrowUpCircle className="w-10 h-10 text-green-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-red-700">{isEs ? "Egresos" : "Outflows"}</p>
                    <p className="text-2xl font-bold text-red-700">
                      {formatCurrency(cashFlowData?.outflows?.total)}
                    </p>
                  </div>
                  <ArrowDownCircle className="w-10 h-10 text-red-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card className={cashFlowData?.net_cash_flow >= 0 ? "border-blue-200 bg-blue-50" : "border-amber-200 bg-amber-50"}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{isEs ? "Flujo Neto" : "Net Flow"}</p>
                    <p className={`text-2xl font-bold ${cashFlowData?.net_cash_flow >= 0 ? "text-blue-700" : "text-amber-700"}`}>
                      {formatCurrency(cashFlowData?.net_cash_flow)}
                    </p>
                  </div>
                  {cashFlowData?.net_cash_flow >= 0 
                    ? <TrendingUp className="w-10 h-10 text-blue-500" />
                    : <TrendingDown className="w-10 h-10 text-amber-500" />
                  }
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-orange-700">{isEs ? "Por Pagar" : "Pending"}</p>
                    <p className="text-2xl font-bold text-orange-700">
                      {formatCurrency(cashFlowData?.pending_obligations?.total_pending)}
                    </p>
                  </div>
                  <Clock className="w-10 h-10 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Inflows & Outflows Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Inflows */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-green-700">
                  <ArrowUpCircle className="w-5 h-5" />
                  {isEs ? "Detalle de Ingresos" : "Inflow Details"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                  <span>{isEs ? "Pagos de Clientes" : "Client Payments"}</span>
                  <div className="text-right">
                    <p className="font-bold">{formatCurrency(cashFlowData?.inflows?.client_payments?.total)}</p>
                    <p className="text-xs text-muted-foreground">{cashFlowData?.inflows?.client_payments?.count} {isEs ? "pagos" : "payments"}</p>
                  </div>
                </div>
                <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                  <span>{isEs ? "Depósitos Caja Chica" : "Petty Cash Deposits"}</span>
                  <div className="text-right">
                    <p className="font-bold">{formatCurrency(cashFlowData?.inflows?.petty_cash_deposits?.total)}</p>
                    <p className="text-xs text-muted-foreground">{cashFlowData?.inflows?.petty_cash_deposits?.count} {isEs ? "depósitos" : "deposits"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Outflows */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-red-700">
                  <ArrowDownCircle className="w-5 h-5" />
                  {isEs ? "Detalle de Egresos" : "Outflow Details"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <span>{isEs ? "Pagos a Proveedores" : "Supplier Payments"}</span>
                  <div className="text-right">
                    <p className="font-bold">{formatCurrency(cashFlowData?.outflows?.supplier_payments?.total)}</p>
                    <p className="text-xs text-muted-foreground">{cashFlowData?.outflows?.supplier_payments?.count} {isEs ? "pagos" : "payments"}</p>
                  </div>
                </div>
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <span>{isEs ? "Retiros Caja Chica" : "Petty Cash Withdrawals"}</span>
                  <div className="text-right">
                    <p className="font-bold">{formatCurrency(cashFlowData?.outflows?.petty_cash_withdrawals?.total)}</p>
                    <p className="text-xs text-muted-foreground">{cashFlowData?.outflows?.petty_cash_withdrawals?.count} {isEs ? "retiros" : "withdrawals"}</p>
                  </div>
                </div>
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <span>{isEs ? "Nómina" : "Payroll"}</span>
                  <div className="text-right">
                    <p className="font-bold">{formatCurrency(cashFlowData?.outflows?.payroll?.total)}</p>
                    <p className="text-xs text-muted-foreground">{cashFlowData?.outflows?.payroll?.count} {isEs ? "corridas" : "runs"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pending Obligations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                {isEs ? "Proyección de Salidas de Efectivo" : "Cash Outflow Projection"}
              </CardTitle>
              <CardDescription>
                {isEs ? "Obligaciones pendientes por fecha de vencimiento" : "Pending obligations by due date"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 border rounded-lg border-red-300 bg-red-50">
                  <p className="text-sm text-red-700 font-medium">{isEs ? "Vencido" : "Overdue"}</p>
                  <p className="text-xl font-bold text-red-700">{formatCurrency(cashFlowData?.pending_obligations?.overdue?.total)}</p>
                  <p className="text-xs text-red-600">{cashFlowData?.pending_obligations?.overdue?.count} {isEs ? "items" : "items"}</p>
                </div>
                <div className="p-4 border rounded-lg border-amber-300 bg-amber-50">
                  <p className="text-sm text-amber-700 font-medium">{isEs ? "Esta Semana" : "This Week"}</p>
                  <p className="text-xl font-bold text-amber-700">{formatCurrency(cashFlowData?.pending_obligations?.due_this_week?.total)}</p>
                  <p className="text-xs text-amber-600">{cashFlowData?.pending_obligations?.due_this_week?.count} {isEs ? "items" : "items"}</p>
                </div>
                <div className="p-4 border rounded-lg border-blue-300 bg-blue-50">
                  <p className="text-sm text-blue-700 font-medium">{isEs ? "Este Mes" : "This Month"}</p>
                  <p className="text-xl font-bold text-blue-700">{formatCurrency(cashFlowData?.pending_obligations?.due_this_month?.total)}</p>
                  <p className="text-xs text-blue-600">{cashFlowData?.pending_obligations?.due_this_month?.count} {isEs ? "items" : "items"}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground font-medium">{isEs ? "Posterior" : "Later"}</p>
                  <p className="text-xl font-bold">{formatCurrency(cashFlowData?.pending_obligations?.due_later?.total)}</p>
                  <p className="text-xs text-muted-foreground">{cashFlowData?.pending_obligations?.due_later?.count} {isEs ? "items" : "items"}</p>
                </div>
              </div>
              
              {/* Overdue Items List */}
              {cashFlowData?.pending_obligations?.overdue?.items?.length > 0 && (
                <div className="mt-4 p-4 bg-red-50 rounded-lg">
                  <p className="text-sm font-medium text-red-700 mb-2">{isEs ? "Vencidos que requieren atención:" : "Overdue items requiring attention:"}</p>
                  <div className="space-y-2">
                    {cashFlowData.pending_obligations.overdue.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span>{item.supplier_name || item.description}</span>
                        <span className="font-medium">{formatCurrency(item.balance_due)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* All Payments Tab */}
        <TabsContent value="payments" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{isEs ? "Todos los Pagos" : "All Payments"}</h2>
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
                <ArrowUpCircle className="w-3 h-3 mr-1" />
                {isEs ? "Recibidos" : "Received"}: {formatCurrency(paymentsSummary?.total_received)}
              </Badge>
              <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50">
                <ArrowDownCircle className="w-3 h-3 mr-1" />
                {isEs ? "Realizados" : "Made"}: {formatCurrency(paymentsSummary?.total_made)}
              </Badge>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                    <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                    <TableHead>{isEs ? "Entidad" : "Entity"}</TableHead>
                    <TableHead>{isEs ? "Descripción" : "Description"}</TableHead>
                    <TableHead>{isEs ? "Método" : "Method"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Monto" : "Amount"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allPayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {isEs ? "No hay pagos en este período" : "No payments in this period"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    allPayments.map((pmt, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{pmt.payment_date}</TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline"
                            className={pmt.direction === "received" 
                              ? "text-green-600 border-green-300 bg-green-50" 
                              : "text-red-600 border-red-300 bg-red-50"}
                          >
                            {pmt.direction === "received" 
                              ? (isEs ? "Recibido" : "Received")
                              : (isEs ? "Realizado" : "Made")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{pmt.entity_name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{pmt.entity_type}</p>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {pmt.description || pmt.reference || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">
                            {pmt.payment_method || "-"}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-bold ${pmt.direction === "received" ? "text-green-600" : "text-red-600"}`}>
                          {pmt.direction === "received" ? "+" : "-"}{formatCurrency(pmt.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Petty Cash Tab */}
        <TabsContent value="petty-cash" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{isEs ? "Caja Chica" : "Petty Cash"}</h2>
            <Button onClick={() => setPettyCashDialogOpen(true)} data-testid="new-petty-cash-btn">
              <Plus className="w-4 h-4 mr-2" />
              {isEs ? "Nueva Transacción" : "New Transaction"}
            </Button>
          </div>

          {/* Petty Cash Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-green-200">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{isEs ? "Saldo Actual" : "Current Balance"}</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(pettyCashData?.summary?.current_balance)}
                    </p>
                  </div>
                  <Wallet className="w-10 h-10 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{isEs ? "Límite del Fondo" : "Fund Limit"}</p>
                    <p className="text-2xl font-bold">{formatCurrency(pettyCashData?.summary?.fund_limit)}</p>
                  </div>
                  <PiggyBank className="w-10 h-10 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{isEs ? "Transacciones" : "Transactions"}</p>
                    <p className="text-2xl font-bold">{pettyCashData?.summary?.transaction_count || 0}</p>
                  </div>
                  <Receipt className="w-10 h-10 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Petty Cash Transactions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{isEs ? "Transacciones Recientes" : "Recent Transactions"}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                    <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                    <TableHead>{isEs ? "Descripción" : "Description"}</TableHead>
                    <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
                    <TableHead>{isEs ? "Recibo" : "Receipt"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Monto" : "Amount"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(pettyCashData?.transactions || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {isEs ? "No hay transacciones de caja chica" : "No petty cash transactions"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    pettyCashData.transactions.map((txn, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{txn.transaction_date}</TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline"
                            className={txn.transaction_type === "deposit" 
                              ? "text-green-600 border-green-300 bg-green-50" 
                              : "text-red-600 border-red-300 bg-red-50"}
                          >
                            {txn.transaction_type === "deposit" 
                              ? (isEs ? "Depósito" : "Deposit")
                              : (isEs ? "Retiro" : "Withdrawal")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p>{txn.description}</p>
                            {txn.vendor_name && <p className="text-xs text-muted-foreground">{txn.vendor_name}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {PETTY_CASH_CATEGORIES.find(c => c.value === txn.category)?.[isEs ? "labelEs" : "label"] || txn.category}
                          </Badge>
                        </TableCell>
                        <TableCell>{txn.receipt_number || "-"}</TableCell>
                        <TableCell className={`text-right font-bold ${txn.transaction_type === "deposit" ? "text-green-600" : "text-red-600"}`}>
                          {txn.transaction_type === "deposit" ? "+" : "-"}{formatCurrency(txn.amount)}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(txn.balance_after)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Petty Cash Transaction Dialog */}
      <Dialog open={pettyCashDialogOpen} onOpenChange={setPettyCashDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PiggyBank className="w-5 h-5" />
              {isEs ? "Nueva Transacción de Caja Chica" : "New Petty Cash Transaction"}
            </DialogTitle>
            <DialogDescription>
              {isEs 
                ? `Saldo disponible: ${formatCurrency(pettyCashData?.summary?.current_balance)}`
                : `Available balance: ${formatCurrency(pettyCashData?.summary?.current_balance)}`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Transaction Type */}
            <div className="space-y-2">
              <Label>{isEs ? "Tipo de Transacción" : "Transaction Type"}</Label>
              <Select 
                value={pettyCashForm.transaction_type} 
                onValueChange={(v) => setPettyCashForm({ ...pettyCashForm, transaction_type: v })}
              >
                <SelectTrigger data-testid="petty-cash-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit">
                    <span className="flex items-center gap-2">
                      <ArrowUpCircle className="w-4 h-4 text-green-500" />
                      {isEs ? "Depósito (Reponer Fondo)" : "Deposit (Replenish Fund)"}
                    </span>
                  </SelectItem>
                  <SelectItem value="withdrawal">
                    <span className="flex items-center gap-2">
                      <ArrowDownCircle className="w-4 h-4 text-red-500" />
                      {isEs ? "Retiro (Gasto)" : "Withdrawal (Expense)"}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Amount */}
            <div className="space-y-2">
              <Label>{isEs ? "Monto" : "Amount"} *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={pettyCashForm.amount}
                onChange={(e) => setPettyCashForm({ ...pettyCashForm, amount: e.target.value })}
                data-testid="petty-cash-amount-input"
              />
            </div>
            
            {/* Description */}
            <div className="space-y-2">
              <Label>{isEs ? "Descripción" : "Description"} *</Label>
              <Input
                placeholder={isEs ? "Ej: Compra de papelería" : "e.g. Office supplies purchase"}
                value={pettyCashForm.description}
                onChange={(e) => setPettyCashForm({ ...pettyCashForm, description: e.target.value })}
                data-testid="petty-cash-description-input"
              />
            </div>
            
            {/* Category (only for withdrawals) */}
            {pettyCashForm.transaction_type === "withdrawal" && (
              <>
                <div className="space-y-2">
                  <Label>{isEs ? "Categoría" : "Category"}</Label>
                  <Select 
                    value={pettyCashForm.category} 
                    onValueChange={(v) => setPettyCashForm({ ...pettyCashForm, category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PETTY_CASH_CATEGORIES.map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {isEs ? cat.labelEs : cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{isEs ? "No. Recibo" : "Receipt #"}</Label>
                    <Input
                      placeholder="REC-001"
                      value={pettyCashForm.receipt_number}
                      onChange={(e) => setPettyCashForm({ ...pettyCashForm, receipt_number: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{isEs ? "Proveedor" : "Vendor"}</Label>
                    <Input
                      placeholder={isEs ? "Nombre del proveedor" : "Vendor name"}
                      value={pettyCashForm.vendor_name}
                      onChange={(e) => setPettyCashForm({ ...pettyCashForm, vendor_name: e.target.value })}
                    />
                  </div>
                </div>
              </>
            )}
            
            {/* Notes */}
            <div className="space-y-2">
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Textarea
                placeholder={isEs ? "Notas adicionales..." : "Additional notes..."}
                value={pettyCashForm.notes}
                onChange={(e) => setPettyCashForm({ ...pettyCashForm, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPettyCashDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button 
              onClick={handlePettyCashTransaction} 
              disabled={submitting}
              className={pettyCashForm.transaction_type === "deposit" ? "bg-green-600 hover:bg-green-700" : ""}
              data-testid="save-petty-cash-btn"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isEs ? "Guardando..." : "Saving..."}
                </>
              ) : (
                <>
                  {pettyCashForm.transaction_type === "deposit" 
                    ? <ArrowUpCircle className="w-4 h-4 mr-2" />
                    : <ArrowDownCircle className="w-4 h-4 mr-2" />
                  }
                  {isEs ? "Registrar" : "Record"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
