import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";

// Refactored Components
import { PayablesSection } from "../components/business-clarity/PayablesSection";
import { InvoicesSection } from "../components/business-clarity/InvoicesSection";
import { PaymentsSection } from "../components/business-clarity/PaymentsSection";
import { StatementsSection } from "../components/business-clarity/StatementsSection";
import { ReceivablesSection } from "../components/business-clarity/ReceivablesSection";

// Icons
import {
  DollarSign, CreditCard, FileText, Users, TrendingUp, TrendingDown,
  AlertTriangle, Clock, CheckCircle, Plus, Download, RefreshCw, 
  Wallet, PieChart, Calendar, Banknote, UserCircle, Landmark, 
  FileBarChart, BarChart3, Building2, ArrowLeft, Flame, Target,
  CircleDollarSign, AlertCircle, HelpCircle, Info
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";

const API = process.env.REACT_APP_BACKEND_URL;

const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ==================== DASHBOARD SECTION ====================
function DashboardSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showProfitSignals, setShowProfitSignals] = useState(true);
  const [targetMargin, setTargetMargin] = useState(30); // Default 30%

  const fetchData = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/business-clarity/dashboard?target_margin=${targetMargin}`, { withCredentials: true });
      setData(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [targetMargin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  const agingData = data?.aging_buckets || {};
  const totalAging = Object.values(agingData).reduce((a, b) => a + b, 0);
  
  // Profit Signals calculations (read-only from existing data)
  const profitSignals = data?.profit_signals || {};
  const negativeMarginEvents = profitSignals.negative_margin_count || 0;
  const belowTargetEvents = profitSignals.below_target_count || 0;
  const unassignedCosts = profitSignals.unassigned_costs || 0;
  const cashGap = (profitSignals.paid_to_suppliers || 0) - (profitSignals.collected_from_clients || 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{isEs ? "Panel Ejecutivo" : "Executive Dashboard"}</h2>
        <div className="flex items-center gap-2">
          <Button 
            variant={showProfitSignals ? "default" : "outline"} 
            size="sm" 
            onClick={() => setShowProfitSignals(!showProfitSignals)}
            className="gap-2"
          >
            <Flame className="w-4 h-4" />
            {isEs ? "Señales de Rentabilidad" : "Profit Signals"}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}><RefreshCw className="w-4 h-4 mr-2" />{isEs ? "Actualizar" : "Refresh"}</Button>
        </div>
      </div>

      {/* KPI Cards - Row 1: Financial Position */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200 dark:from-green-950 dark:to-green-900 dark:border-green-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">{isEs ? "Por Cobrar" : "Receivables"}</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">{formatCurrency(data?.total_receivables)}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
            <p className="text-xs text-green-600 dark:text-green-400 mt-2">{data?.open_invoices_count || 0} {isEs ? "facturas" : "invoices"}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200 dark:from-red-950 dark:to-red-900 dark:border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">{isEs ? "Vencido" : "Overdue"}</p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">{formatCurrency(data?.total_overdue)}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200 dark:from-orange-950 dark:to-orange-900 dark:border-orange-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">{isEs ? "Por Pagar" : "Payables"}</p>
                <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{formatCurrency(data?.total_payables)}</p>
              </div>
              <TrendingDown className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 dark:from-blue-950 dark:to-blue-900 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">{isEs ? "Flujo Neto" : "Net Flow"}</p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{formatCurrency((data?.total_receivables || 0) - (data?.total_payables || 0))}</p>
              </div>
              <Wallet className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Profit Signals - Row 2 (Togglable) */}
      {showProfitSignals && (
        <Card className="border-amber-200 bg-amber-50/30 dark:bg-amber-950/20 dark:border-amber-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-600" />
                {isEs ? "Señales de Rentabilidad" : "Profit Signals"}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="w-4 h-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>{isEs 
                        ? "Indicadores de decisión: ¿Dónde hay fuga de margen? ¿Qué requiere atención inmediata?" 
                        : "Decision indicators: Where is margin leaking? What needs immediate attention?"}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{isEs ? "Margen objetivo:" : "Target margin:"}</span>
                <Select value={targetMargin.toString()} onValueChange={(v) => setTargetMargin(parseInt(v))}>
                  <SelectTrigger className="w-20 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[20, 25, 30, 35, 40, 45, 50].map(v => (
                      <SelectItem key={v} value={v.toString()}>{v}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <CardDescription>
              {isEs ? "¿Dónde necesitas mirar ahora mismo?" : "Where do you need to look right now?"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Negative Margin Events */}
              <div className={`p-4 rounded-lg border ${negativeMarginEvents > 0 ? "bg-red-50 border-red-200 dark:bg-red-950/50" : "bg-white border-gray-200 dark:bg-gray-900"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className={`w-4 h-4 ${negativeMarginEvents > 0 ? "text-red-600" : "text-muted-foreground"}`} />
                  <span className="text-xs font-medium text-muted-foreground">
                    {isEs ? "Eventos con Margen Negativo" : "Negative Margin Events"}
                  </span>
                </div>
                <p className={`text-2xl font-bold ${negativeMarginEvents > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                  {negativeMarginEvents}
                </p>
                {negativeMarginEvents > 0 && (
                  <p className="text-xs text-red-600 mt-1">{isEs ? "🔴 Requiere atención" : "🔴 Needs attention"}</p>
                )}
              </div>

              {/* Below Target Margin */}
              <div className={`p-4 rounded-lg border ${belowTargetEvents > 0 ? "bg-amber-50 border-amber-200 dark:bg-amber-950/50" : "bg-white border-gray-200 dark:bg-gray-900"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Target className={`w-4 h-4 ${belowTargetEvents > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
                  <span className="text-xs font-medium text-muted-foreground">
                    {isEs ? `Bajo Margen Objetivo (<${targetMargin}%)` : `Below Target (<${targetMargin}%)`}
                  </span>
                </div>
                <p className={`text-2xl font-bold ${belowTargetEvents > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                  {belowTargetEvents}
                </p>
                {belowTargetEvents > 0 && (
                  <p className="text-xs text-amber-600 mt-1">{isEs ? "⚠️ Revisar pricing" : "⚠️ Review pricing"}</p>
                )}
              </div>

              {/* Unassigned Costs */}
              <div className={`p-4 rounded-lg border ${unassignedCosts > 0 ? "bg-purple-50 border-purple-200 dark:bg-purple-950/50" : "bg-white border-gray-200 dark:bg-gray-900"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <CircleDollarSign className={`w-4 h-4 ${unassignedCosts > 0 ? "text-purple-600" : "text-muted-foreground"}`} />
                  <span className="text-xs font-medium text-muted-foreground">
                    {isEs ? "Costos Sin Asignar" : "Unassigned Costs"}
                  </span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-3 h-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-medium mb-1">{isEs ? "Fuga de Margen" : "Margin Leakage"}</p>
                        <p className="text-xs">{isEs 
                          ? "Costos no asignados a eventos distorsionan la rentabilidad real. Márgenes 'altos' pueden ser falsos." 
                          : "Costs not assigned to events distort real profitability. 'High' margins may be fake."}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className={`text-2xl font-bold ${unassignedCosts > 0 ? "text-purple-600" : "text-muted-foreground"}`}>
                  {formatCurrency(unassignedCosts)}
                </p>
                {unassignedCosts > 0 && (
                  <p className="text-xs text-purple-600 mt-1">{isEs ? "💸 Erosiona margen global" : "💸 Erodes global margin"}</p>
                )}
              </div>

              {/* Cash Gap */}
              <div className={`p-4 rounded-lg border ${Math.abs(cashGap) > 1000 ? "bg-blue-50 border-blue-200 dark:bg-blue-950/50" : "bg-white border-gray-200 dark:bg-gray-900"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Wallet className={`w-4 h-4 ${cashGap < 0 ? "text-red-600" : cashGap > 0 ? "text-green-600" : "text-muted-foreground"}`} />
                  <span className="text-xs font-medium text-muted-foreground">
                    {isEs ? "Brecha Pagado vs Cobrado" : "Paid vs Collected Gap"}
                  </span>
                </div>
                <p className={`text-2xl font-bold ${cashGap < 0 ? "text-red-600" : cashGap > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                  {formatCurrency(Math.abs(cashGap))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {cashGap < 0 
                    ? (isEs ? "📉 Pagaste más de lo cobrado" : "📉 Paid more than collected")
                    : cashGap > 0 
                      ? (isEs ? "📈 Cobraste más de lo pagado" : "📈 Collected more than paid")
                      : (isEs ? "⚖️ Equilibrado" : "⚖️ Balanced")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aging Analysis */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" />{isEs ? "Antigüedad de Cartera" : "Aging Analysis"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4">
            {[
              { key: "current", label: isEs ? "Al Día" : "Current", color: "bg-green-500" },
              { key: "1_30", label: "1-30", color: "bg-yellow-500" },
              { key: "31_60", label: "31-60", color: "bg-orange-500" },
              { key: "61_90", label: "61-90", color: "bg-red-400" },
              { key: "90_plus", label: "90+", color: "bg-red-600" },
            ].map(({ key, label, color }) => {
              const amount = agingData[key] || 0;
              const percent = totalAging > 0 ? (amount / totalAging) * 100 : 0;
              return (
                <div key={key} className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">{label}</div>
                  <div className="text-sm font-semibold">{formatCurrency(amount)}</div>
                  <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                    <div className={`${color} h-1.5 rounded-full`} style={{ width: `${percent}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Payments */}
      {data?.recent_payments?.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Banknote className="w-4 h-4" />{isEs ? "Pagos Recientes" : "Recent Payments"}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                  <TableHead>{isEs ? "Monto" : "Amount"}</TableHead>
                  <TableHead>{isEs ? "Método" : "Method"}</TableHead>
                  <TableHead>{isEs ? "Referencia" : "Reference"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent_payments.slice(0, 5).map((pay) => (
                  <TableRow key={pay.payment_id}>
                    <TableCell className="text-sm">{new Date(pay.payment_date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium text-green-600">{formatCurrency(pay.amount)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{pay.payment_method}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{pay.reference || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ==================== INVOICES SECTION ====================
function InvoicesSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [filter, setFilter] = useState("all");

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/business-clarity/invoices`, { withCredentials: true });
      setInvoices(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleSelectInvoice = (invoiceId) => {
    setSelectedInvoices(prev => prev.includes(invoiceId) ? prev.filter(id => id !== invoiceId) : [...prev, invoiceId]);
  };

  const handlePayWithStripe = async () => {
    if (selectedInvoices.length === 0) return toast.error(isEs ? "Selecciona facturas" : "Select invoices");
    try {
      const res = await axios.post(`${API}/api/business-clarity/checkout/session`, {
        invoice_ids: selectedInvoices, origin_url: window.location.origin
      }, { withCredentials: true });
      if (res.data.url) window.location.href = res.data.url;
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const getStatusBadge = (status) => {
    const styles = { open: "bg-blue-100 text-blue-700", partially_paid: "bg-yellow-100 text-yellow-700", paid: "bg-green-100 text-green-700" };
    const labels = { open: isEs ? "Abierta" : "Open", partially_paid: isEs ? "Parcial" : "Partial", paid: isEs ? "Pagada" : "Paid" };
    return <Badge className={styles[status] || styles.open}>{labels[status] || status}</Badge>;
  };

  const filteredInvoices = invoices.filter(inv => filter === "all" || inv.status === filter);

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{isEs ? "Facturas" : "Invoices"}</h2>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEs ? "Todas" : "All"}</SelectItem>
              <SelectItem value="open">{isEs ? "Abiertas" : "Open"}</SelectItem>
              <SelectItem value="partially_paid">{isEs ? "Parciales" : "Partial"}</SelectItem>
              <SelectItem value="paid">{isEs ? "Pagadas" : "Paid"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          {selectedInvoices.length > 0 && (
            <Button size="sm" onClick={handlePayWithStripe} className="gap-2">
              <CreditCard className="w-4 h-4" />{isEs ? "Pagar" : "Pay"} ({selectedInvoices.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={fetchInvoices}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>{isEs ? "Factura" : "Invoice"}</TableHead>
                <TableHead>{isEs ? "Cliente" : "Client"}</TableHead>
                <TableHead>{isEs ? "Evento" : "Event"}</TableHead>
                <TableHead>{isEs ? "Vence" : "Due"}</TableHead>
                <TableHead className="text-right">{isEs ? "Total" : "Total"}</TableHead>
                <TableHead className="text-right">{isEs ? "Pagado" : "Paid"}</TableHead>
                <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.map((inv) => (
                <TableRow key={inv.invoice_id}>
                  <TableCell>{inv.status !== "paid" && <input type="checkbox" checked={selectedInvoices.includes(inv.invoice_id)} onChange={() => handleSelectInvoice(inv.invoice_id)} className="rounded" />}</TableCell>
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.client_name || "-"}</TableCell>
                  <TableCell>{inv.event_name || "-"}</TableCell>
                  <TableCell>{new Date(inv.due_date).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">{formatCurrency(inv.total)}</TableCell>
                  <TableCell className="text-right text-green-600">{formatCurrency(inv.paid_amount)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(inv.balance_due)}</TableCell>
                  <TableCell>{getStatusBadge(inv.status)}</TableCell>
                </TableRow>
              ))}
              {filteredInvoices.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">{isEs ? "No hay facturas" : "No invoices"}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== PAYMENTS SECTION ====================
function PaymentsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [payments, setPayments] = useState([]);
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ client_id: "", amount: 0, payment_method: "transfer", reference: "", notes: "" });
  const [applicationAmounts, setApplicationAmounts] = useState({});

  const fetchData = useCallback(async () => {
    try {
      const [payRes, clientRes, invRes] = await Promise.all([
        axios.get(`${API}/api/business-clarity/payments`, { withCredentials: true }),
        axios.get(`${API}/api/crm/clients`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/invoices`, { withCredentials: true }),
      ]);
      setPayments(payRes.data);
      setClients(clientRes.data);
      setInvoices(invRes.data.filter(i => i.status !== "paid"));
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreatePayment = async () => {
    if (!paymentForm.client_id || paymentForm.amount <= 0) return toast.error(isEs ? "Complete los campos" : "Fill required fields");
    try {
      await axios.post(`${API}/api/business-clarity/payments`, paymentForm, { withCredentials: true });
      toast.success(isEs ? "Pago registrado" : "Payment recorded");
      setPaymentDialogOpen(false);
      setPaymentForm({ client_id: "", amount: 0, payment_method: "transfer", reference: "", notes: "" });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleApplyPayment = async () => {
    if (!selectedPayment) return;
    const applications = Object.entries(applicationAmounts).filter(([_, amt]) => parseFloat(amt) > 0).map(([invoice_id, amount_applied]) => ({ invoice_id, amount_applied: parseFloat(amount_applied) }));
    if (applications.length === 0) return toast.error(isEs ? "Ingrese montos" : "Enter amounts");
    try {
      await axios.post(`${API}/api/business-clarity/payments/${selectedPayment.payment_id}/apply`, { payment_id: selectedPayment.payment_id, applications }, { withCredentials: true });
      toast.success(isEs ? "Pago aplicado" : "Payment applied");
      setApplyDialogOpen(false);
      setSelectedPayment(null);
      setApplicationAmounts({});
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const clientInvoices = selectedPayment ? invoices.filter(i => i.client_id === selectedPayment.client_id) : [];

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{isEs ? "Pagos Recibidos" : "Received Payments"}</h2>
        <Button size="sm" onClick={() => setPaymentDialogOpen(true)} className="gap-2"><Plus className="w-4 h-4" />{isEs ? "Registrar Pago" : "Record Payment"}</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                <TableHead>{isEs ? "Cliente" : "Client"}</TableHead>
                <TableHead>{isEs ? "Método" : "Method"}</TableHead>
                <TableHead className="text-right">{isEs ? "Monto" : "Amount"}</TableHead>
                <TableHead className="text-right">{isEs ? "Aplicado" : "Applied"}</TableHead>
                <TableHead className="text-right">{isEs ? "Disponible" : "Available"}</TableHead>
                <TableHead>{isEs ? "Referencia" : "Reference"}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((pay) => (
                <TableRow key={pay.payment_id}>
                  <TableCell>{new Date(pay.payment_date).toLocaleDateString()}</TableCell>
                  <TableCell>{pay.client_name || "-"}</TableCell>
                  <TableCell><Badge variant="outline">{pay.payment_method}</Badge></TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(pay.amount)}</TableCell>
                  <TableCell className="text-right text-green-600">{formatCurrency(pay.applied_amount)}</TableCell>
                  <TableCell className="text-right text-blue-600">{formatCurrency(pay.unapplied_amount)}</TableCell>
                  <TableCell className="text-muted-foreground">{pay.reference || "-"}</TableCell>
                  <TableCell>{pay.unapplied_amount > 0 && <Button variant="outline" size="sm" onClick={() => { setSelectedPayment(pay); setApplicationAmounts({}); setApplyDialogOpen(true); }}>{isEs ? "Aplicar" : "Apply"}</Button>}</TableCell>
                </TableRow>
              ))}
              {payments.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{isEs ? "No hay pagos" : "No payments"}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isEs ? "Registrar Pago" : "Record Payment"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{isEs ? "Cliente" : "Client"} *</Label><Select value={paymentForm.client_id} onValueChange={(v) => setPaymentForm({ ...paymentForm, client_id: v })}><SelectTrigger><SelectValue placeholder={isEs ? "Seleccionar" : "Select"} /></SelectTrigger><SelectContent>{clients.map(c => <SelectItem key={c.client_id} value={c.client_id}>{c.display_name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>{isEs ? "Monto" : "Amount"} *</Label><Input type="number" step="0.01" value={paymentForm.amount || ""} onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })} /></div>
            <div><Label>{isEs ? "Método" : "Method"}</Label><Select value={paymentForm.payment_method} onValueChange={(v) => setPaymentForm({ ...paymentForm, payment_method: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">{isEs ? "Efectivo" : "Cash"}</SelectItem><SelectItem value="transfer">{isEs ? "Transferencia" : "Transfer"}</SelectItem><SelectItem value="card">{isEs ? "Tarjeta" : "Card"}</SelectItem><SelectItem value="check">{isEs ? "Cheque" : "Check"}</SelectItem></SelectContent></Select></div>
            <div><Label>{isEs ? "Referencia" : "Reference"}</Label><Input value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button><Button onClick={handleCreatePayment}>{isEs ? "Guardar" : "Save"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Payment Dialog */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{isEs ? "Aplicar Pago" : "Apply Payment"}</DialogTitle><DialogDescription>{isEs ? "Disponible" : "Available"}: {formatCurrency(selectedPayment?.unapplied_amount)}</DialogDescription></DialogHeader>
          <div className="max-h-60 overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead>{isEs ? "Factura" : "Invoice"}</TableHead><TableHead>{isEs ? "Vence" : "Due"}</TableHead><TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead><TableHead className="text-right">{isEs ? "Aplicar" : "Apply"}</TableHead></TableRow></TableHeader>
              <TableBody>
                {clientInvoices.map(inv => (
                  <TableRow key={inv.invoice_id}>
                    <TableCell>{inv.invoice_number}</TableCell>
                    <TableCell>{new Date(inv.due_date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">{formatCurrency(inv.balance_due)}</TableCell>
                    <TableCell className="text-right"><Input type="number" step="0.01" className="w-24 text-right" value={applicationAmounts[inv.invoice_id] || ""} onChange={(e) => setApplicationAmounts({ ...applicationAmounts, [inv.invoice_id]: e.target.value })} /></TableCell>
                  </TableRow>
                ))}
                {clientInvoices.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground">{isEs ? "Sin facturas pendientes" : "No pending invoices"}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setApplyDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button><Button onClick={handleApplyPayment}>{isEs ? "Aplicar" : "Apply"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== ACCOUNT STATEMENTS SECTION ====================
function AccountStatementsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const fetchClients = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/crm/clients`, { withCredentials: true });
      setClients(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);

  const fetchStatement = async (clientId) => {
    if (!clientId) return;
    try {
      const res = await axios.get(`${API}/api/business-clarity/clients/${clientId}/financial`, { withCredentials: true });
      setStatement(res.data);
    } catch (err) {
      toast.error(isEs ? "Error al cargar" : "Failed to load");
    }
  };

  useEffect(() => { fetchClients(); }, [fetchClients]);
  useEffect(() => { if (selectedClient) fetchStatement(selectedClient); }, [selectedClient]);

  // Download PDF
  const handleDownloadPDF = async () => {
    if (!statement) return;
    setDownloading(true);
    try {
      // Generate PDF client-side using jspdf
      const { jsPDF } = await import("jspdf");
      await import("jspdf-autotable");
      
      const doc = new jsPDF();
      const client = statement.client;
      
      // Header
      doc.setFontSize(18);
      doc.text("Estado de Cuenta / Account Statement", 14, 20);
      doc.setFontSize(12);
      doc.text(`Cliente: ${client?.display_name || "N/A"}`, 14, 30);
      doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 36);
      
      // Summary
      doc.setFontSize(10);
      doc.text(`Total Facturado: ${formatCurrency(statement.summary?.total_invoiced)}`, 14, 48);
      doc.text(`Total Pagado: ${formatCurrency(statement.summary?.total_paid)}`, 14, 54);
      doc.text(`Saldo Actual: ${formatCurrency(statement.summary?.current_balance)}`, 14, 60);
      
      // Activity table
      if (statement.activity?.length > 0) {
        doc.autoTable({
          startY: 70,
          head: [["Fecha", "Tipo", "Descripción", "Débito", "Crédito", "Saldo"]],
          body: statement.activity.map(item => [
            item.date ? new Date(item.date).toLocaleDateString() : "-",
            item.type === "invoice" ? "Factura" : "Pago",
            item.description,
            item.debit > 0 ? formatCurrency(item.debit) : "-",
            item.credit > 0 ? formatCurrency(item.credit) : "-",
            formatCurrency(item.balance)
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [59, 130, 246] }
        });
      }
      
      doc.save(`estado_cuenta_${client?.display_name?.replace(/\s+/g, "_") || "cliente"}.pdf`);
      toast.success(isEs ? "PDF descargado" : "PDF downloaded");
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error al generar PDF" : "Failed to generate PDF");
    }
    setDownloading(false);
  };

  // Download CSV
  const handleDownloadCSV = () => {
    if (!statement?.activity?.length) return;
    const headers = ["Fecha", "Tipo", "Descripcion", "Debito", "Credito", "Saldo"];
    const rows = statement.activity.map(item => [
      item.date ? new Date(item.date).toLocaleDateString() : "",
      item.type === "invoice" ? "Factura" : "Pago",
      item.description,
      item.debit || 0,
      item.credit || 0,
      item.balance
    ]);
    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `estado_cuenta_${statement.client?.display_name?.replace(/\s+/g, "_") || "cliente"}.csv`;
    a.click();
    toast.success(isEs ? "CSV descargado" : "CSV downloaded");
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{isEs ? "Estados de Cuenta" : "Account Statements"}</h2>
        <div className="flex items-center gap-2">
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-64"><SelectValue placeholder={isEs ? "Seleccionar cliente" : "Select client"} /></SelectTrigger>
            <SelectContent>{clients.map(c => <SelectItem key={c.client_id} value={c.client_id}>{c.display_name}</SelectItem>)}</SelectContent>
          </Select>
          {statement && (
            <>
              <Button variant="outline" size="sm" onClick={handleDownloadCSV} className="gap-2"><Download className="w-4 h-4" />CSV</Button>
              <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={downloading} className="gap-2"><Download className="w-4 h-4" />PDF</Button>
            </>
          )}
        </div>
      </div>

      {statement ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Total Facturado" : "Total Invoiced"}</p><p className="text-xl font-bold">{formatCurrency(statement.summary?.total_invoiced)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Total Pagado" : "Total Paid"}</p><p className="text-xl font-bold text-green-600">{formatCurrency(statement.summary?.total_paid)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Saldo Actual" : "Current Balance"}</p><p className={`text-xl font-bold ${statement.summary?.current_balance > 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(statement.summary?.current_balance)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Términos" : "Terms"}</p><p className="text-lg font-medium">{statement.client?.payment_terms || "Immediate"}</p></CardContent></Card>
          </div>

          {/* Warnings */}
          {statement.warnings?.length > 0 && (
            <Card className="border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400"><AlertTriangle className="w-4 h-4" /><span className="font-medium">{isEs ? "Alertas" : "Warnings"}</span></div>
                <ul className="mt-2 space-y-1">{statement.warnings.map((w, i) => <li key={i} className="text-sm text-red-600 dark:text-red-400">• {w}</li>)}</ul>
              </CardContent>
            </Card>
          )}

          {/* Activity */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{isEs ? "Movimientos" : "Activity"}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                    <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                    <TableHead>{isEs ? "Descripción" : "Description"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Débito" : "Debit"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Crédito" : "Credit"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(statement.activity || []).map((item, i) => (
                    <TableRow key={i}>
                      <TableCell>{item.date ? new Date(item.date).toLocaleDateString() : "-"}</TableCell>
                      <TableCell><Badge variant={item.type === "invoice" ? "default" : "secondary"}>{item.type === "invoice" ? (isEs ? "Factura" : "Invoice") : (isEs ? "Pago" : "Payment")}</Badge></TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell className="text-right">{item.debit > 0 ? formatCurrency(item.debit) : "-"}</TableCell>
                      <TableCell className="text-right text-green-600">{item.credit > 0 ? formatCurrency(item.credit) : "-"}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(item.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card><CardContent className="py-12 text-center text-muted-foreground">{isEs ? "Seleccione un cliente" : "Select a client"}</CardContent></Card>
      )}
    </div>
  );
}

// ==================== ACCOUNTS RECEIVABLE SECTION ====================
function AccountsReceivableSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/api/business-clarity/accounts-receivable`, { withCredentials: true })
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{isEs ? "Cuentas por Cobrar" : "Accounts Receivable"}</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Total Pendiente" : "Total Outstanding"}</p><p className="text-xl font-bold">{formatCurrency(data?.summary?.total_outstanding)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Vencido" : "Overdue"}</p><p className="text-xl font-bold text-red-600">{formatCurrency(data?.summary?.total_overdue)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Al Día" : "Current"}</p><p className="text-xl font-bold text-green-600">{formatCurrency(data?.summary?.total_current)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Facturas Vencidas" : "Overdue Count"}</p><p className="text-xl font-bold">{data?.summary?.overdue_count || 0}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>{isEs ? "Cliente" : "Client"}</TableHead><TableHead>{isEs ? "Factura" : "Invoice"}</TableHead><TableHead>{isEs ? "Vence" : "Due"}</TableHead><TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead><TableHead className="text-right">{isEs ? "Días" : "Days"}</TableHead><TableHead>{isEs ? "Estado" : "Status"}</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data?.records || []).map((rec) => (
                <TableRow key={rec.invoice_id}>
                  <TableCell>{rec.client_name || "-"}</TableCell>
                  <TableCell className="font-medium">{rec.invoice_number}</TableCell>
                  <TableCell>{rec.due_date ? new Date(rec.due_date).toLocaleDateString() : "-"}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(rec.balance_due)}</TableCell>
                  <TableCell className="text-right">{rec.days_overdue > 0 ? <span className="text-red-600">{rec.days_overdue}</span> : <span className="text-green-600">0</span>}</TableCell>
                  <TableCell><Badge variant={rec.status === "overdue" ? "destructive" : "outline"}>{rec.status === "overdue" ? (isEs ? "Vencida" : "Overdue") : (isEs ? "Al Día" : "Current")}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== REPORTS SECTION ====================
function ReportsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [activeReport, setActiveReport] = useState("snapshot");
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [targetMargin, setTargetMargin] = useState(30);
  const [showCollectedPaid, setShowCollectedPaid] = useState(false);

  useEffect(() => {
    setLoading(true);
    const endpoints = { snapshot: "/api/business-clarity/reports/financial-snapshot", clients: "/api/business-clarity/reports/client-revenue", suppliers: "/api/business-clarity/reports/supplier-spend", events: "/api/business-clarity/reports/event-profitability" };
    axios.get(`${API}${endpoints[activeReport]}`, { withCredentials: true })
      .then(res => setReportData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeReport]);

  // Health badge logic for events
  const getHealthBadge = (event) => {
    const margin = event.margin_percent || 0;
    if (margin < 0) {
      return <Badge className="bg-red-600 text-white gap-1"><AlertCircle className="w-3 h-3" />{isEs ? "Pérdida" : "Loss"}</Badge>;
    }
    if (margin < targetMargin) {
      return <Badge variant="secondary" className="bg-amber-100 text-amber-800 gap-1"><AlertTriangle className="w-3 h-3" />{isEs ? "Riesgo" : "Risk"}</Badge>;
    }
    return <Badge className="bg-green-600 text-white gap-1"><CheckCircle className="w-3 h-3" />{isEs ? "Saludable" : "Healthy"}</Badge>;
  };

  // Export to CSV
  const exportToCSV = () => {
    if (!reportData) return;
    
    let headers = [];
    let rows = [];
    const date = new Date().toISOString().split('T')[0];
    let filename = `report_${activeReport}_${date}.csv`;
    
    if (activeReport === "snapshot") {
      headers = ["Metric", "Value"];
      rows = [
        [isEs ? "Facturado" : "Invoiced", reportData.revenue?.total_invoiced || 0],
        [isEs ? "Costos Asignados" : "Assigned Costs", reportData.expenses?.assigned || reportData.expenses?.total || 0],
        [isEs ? "Utilidad Bruta" : "Gross Profit", reportData.profit?.gross || 0],
        [isEs ? "Margen %" : "Margin %", reportData.profit?.margin || 0],
        [isEs ? "Cobrado" : "Collected", reportData.revenue?.total_collected || 0],
        [isEs ? "Pagado" : "Paid", reportData.expenses?.paid || 0],
        [isEs ? "Flujo Neto" : "Net Cash Flow", (reportData.revenue?.total_collected || 0) - (reportData.expenses?.paid || 0)],
      ];
    } else if (activeReport === "clients") {
      headers = [isEs ? "Cliente" : "Client", isEs ? "Facturado" : "Invoiced", isEs ? "Cobrado" : "Collected", isEs ? "Pendiente" : "Outstanding"];
      rows = (reportData.records || []).map(r => [r.client_name, r.total_invoiced, r.total_paid, r.total_outstanding]);
    } else if (activeReport === "suppliers") {
      headers = [isEs ? "Proveedor" : "Supplier", "Total", isEs ? "Pagado" : "Paid", isEs ? "Pendiente" : "Pending"];
      rows = (reportData.records || []).map(r => [r.supplier_name, r.total_amount, r.paid_amount, r.pending_amount]);
    } else if (activeReport === "events") {
      headers = [isEs ? "Evento" : "Event", isEs ? "Estado" : "Health", isEs ? "Ingresos" : "Revenue", isEs ? "Costos" : "Costs", isEs ? "Utilidad" : "Profit", isEs ? "Margen %" : "Margin %"];
      rows = (reportData.records || []).map(r => {
        const health = r.margin_percent < 0 ? (isEs ? "Pérdida" : "Loss") : r.margin_percent < targetMargin ? (isEs ? "Riesgo" : "Risk") : (isEs ? "Saludable" : "Healthy");
        return [r.event_name, health, r.revenue, r.costs, r.profit, r.margin_percent];
      });
    }
    
    const csvContent = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    toast.success(isEs ? "CSV exportado" : "CSV exported");
  };

  // Export to PDF
  const exportToPDF = async () => {
    if (!reportData) return;
    
    try {
      const { jsPDF } = await import("jspdf");
      await import("jspdf-autotable");
      
      const doc = new jsPDF();
      const date = new Date().toLocaleDateString();
      const reportTitles = {
        snapshot: isEs ? "Resumen Financiero" : "Financial Snapshot",
        clients: isEs ? "Reporte por Cliente" : "Client Revenue Report",
        suppliers: isEs ? "Reporte por Proveedor" : "Supplier Spend Report",
        events: isEs ? "Reporte por Evento" : "Event Profitability Report"
      };
      
      // Header
      doc.setFontSize(18);
      doc.text(reportTitles[activeReport], 14, 22);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${isEs ? "Generado:" : "Generated:"} ${date}`, 14, 30);
      
      let startY = 40;
      
      if (activeReport === "snapshot") {
        // Summary boxes
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.text(isEs ? "Utilidad Operativa (Devengado)" : "Operational Profit (Accrued)", 14, startY);
        
        doc.autoTable({
          startY: startY + 5,
          head: [[isEs ? "Métrica" : "Metric", isEs ? "Valor" : "Value"]],
          body: [
            [isEs ? "Facturado" : "Invoiced", `$${(reportData.revenue?.total_invoiced || 0).toLocaleString()}`],
            [isEs ? "Costos Asignados" : "Assigned Costs", `$${(reportData.expenses?.assigned || reportData.expenses?.total || 0).toLocaleString()}`],
            [isEs ? "Utilidad Bruta" : "Gross Profit", `$${(reportData.profit?.gross || 0).toLocaleString()}`],
            [isEs ? "Margen" : "Margin", `${reportData.profit?.margin || 0}%`],
          ],
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] }
        });
        
        doc.text(isEs ? "Posición de Caja (Realizado)" : "Cash Position (Realized)", 14, doc.lastAutoTable.finalY + 15);
        
        doc.autoTable({
          startY: doc.lastAutoTable.finalY + 20,
          head: [[isEs ? "Métrica" : "Metric", isEs ? "Valor" : "Value"]],
          body: [
            [isEs ? "Cobrado de Clientes" : "Collected from Clients", `$${(reportData.revenue?.total_collected || 0).toLocaleString()}`],
            [isEs ? "Pagado a Proveedores" : "Paid to Suppliers", `$${(reportData.expenses?.paid || 0).toLocaleString()}`],
            [isEs ? "Flujo Neto de Caja" : "Net Cash Flow", `$${((reportData.revenue?.total_collected || 0) - (reportData.expenses?.paid || 0)).toLocaleString()}`],
          ],
          theme: 'striped',
          headStyles: { fillColor: [34, 197, 94] }
        });
      } else if (activeReport === "clients") {
        doc.autoTable({
          startY: startY,
          head: [[isEs ? "Cliente" : "Client", isEs ? "Facturado" : "Invoiced", isEs ? "Cobrado" : "Collected", isEs ? "Pendiente" : "Outstanding"]],
          body: (reportData.records || []).map(r => [
            r.client_name,
            `$${(r.total_invoiced || 0).toLocaleString()}`,
            `$${(r.total_paid || 0).toLocaleString()}`,
            `$${(r.total_outstanding || 0).toLocaleString()}`
          ]),
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] }
        });
      } else if (activeReport === "suppliers") {
        doc.autoTable({
          startY: startY,
          head: [[isEs ? "Proveedor" : "Supplier", "Total", isEs ? "Pagado" : "Paid", isEs ? "Pendiente" : "Pending"]],
          body: (reportData.records || []).map(r => [
            r.supplier_name,
            `$${(r.total_amount || 0).toLocaleString()}`,
            `$${(r.paid_amount || 0).toLocaleString()}`,
            `$${(r.pending_amount || 0).toLocaleString()}`
          ]),
          theme: 'striped',
          headStyles: { fillColor: [249, 115, 22] }
        });
      } else if (activeReport === "events") {
        doc.autoTable({
          startY: startY,
          head: [[isEs ? "Evento" : "Event", isEs ? "Estado" : "Health", isEs ? "Ingresos" : "Revenue", isEs ? "Costos" : "Costs", isEs ? "Utilidad" : "Profit", isEs ? "Margen" : "Margin"]],
          body: (reportData.records || []).map(r => {
            const health = r.margin_percent < 0 ? (isEs ? "Pérdida" : "Loss") : r.margin_percent < targetMargin ? (isEs ? "Riesgo" : "Risk") : (isEs ? "Saludable" : "Healthy");
            return [
              r.event_name,
              health,
              `$${(r.revenue || 0).toLocaleString()}`,
              `$${(r.costs || 0).toLocaleString()}`,
              `$${(r.profit || 0).toLocaleString()}`,
              `${r.margin_percent || 0}%`
            ];
          }),
          theme: 'striped',
          headStyles: { fillColor: [139, 92, 246] },
          didParseCell: function(data) {
            if (data.column.index === 1 && data.section === 'body') {
              const health = data.cell.raw;
              if (health === (isEs ? "Pérdida" : "Loss")) {
                data.cell.styles.textColor = [220, 38, 38];
              } else if (health === (isEs ? "Riesgo" : "Risk")) {
                data.cell.styles.textColor = [217, 119, 6];
              } else {
                data.cell.styles.textColor = [22, 163, 74];
              }
            }
          }
        });
      }
      
      // Footer
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`${isEs ? "Página" : "Page"} ${i} / ${pageCount}`, doc.internal.pageSize.width - 30, doc.internal.pageSize.height - 10);
      }
      
      doc.save(`report_${activeReport}_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success(isEs ? "PDF exportado" : "PDF exported");
    } catch (error) {
      console.error("PDF export error:", error);
      toast.error(isEs ? "Error al exportar PDF" : "Failed to export PDF");
    }
  };

  const reports = [
    { key: "snapshot", label: isEs ? "Resumen" : "Snapshot", icon: PieChart },
    { key: "clients", label: isEs ? "Por Cliente" : "By Client", icon: Users },
    { key: "suppliers", label: isEs ? "Por Proveedor" : "By Supplier", icon: Building2 },
    { key: "events", label: isEs ? "Por Evento" : "By Event", icon: Calendar },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <h2 className="text-lg font-semibold">{isEs ? "Reportes Ejecutivos" : "Executive Reports"}</h2>
          <div className="flex gap-1">
            {reports.map(({ key, label, icon: Icon }) => (
              <Button key={key} variant={activeReport === key ? "default" : "ghost"} size="sm" onClick={() => setActiveReport(key)} className="gap-2"><Icon className="w-4 h-4" />{label}</Button>
            ))}
          </div>
        </div>
        
        {/* Export Buttons */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportToCSV} disabled={!reportData} className="gap-2">
            <Download className="w-4 h-4" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportToPDF} disabled={!reportData} className="gap-2">
            <FileText className="w-4 h-4" />
            PDF
          </Button>
        </div>
      </div>

      {loading ? <Card><CardContent className="py-12 text-center"><RefreshCw className="w-8 h-8 animate-spin mx-auto" /></CardContent></Card> : (
        <>
          {/* SNAPSHOT REPORT - Enhanced */}
          {activeReport === "snapshot" && reportData && (
            <div className="space-y-4">
              {/* Operational Profit Section */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    {isEs ? "Utilidad Operativa (Devengado)" : "Operational Profit (Accrued)"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {isEs ? "Ingresos facturados menos costos asignados" : "Invoiced revenue minus assigned costs"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">{isEs ? "Facturado" : "Invoiced"}</p>
                      <p className="text-xl font-bold">{formatCurrency(reportData.revenue?.total_invoiced)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">{isEs ? "Costos Asignados" : "Assigned Costs"}</p>
                      <p className="text-xl font-bold text-red-600">{formatCurrency(reportData.expenses?.assigned || reportData.expenses?.total)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">{isEs ? "Utilidad Bruta" : "Gross Profit"}</p>
                      <p className="text-xl font-bold text-blue-600">{formatCurrency(reportData.profit?.gross)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">{isEs ? "Margen" : "Margin"}</p>
                      <p className="text-xl font-bold">{reportData.profit?.margin || 0}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cash Position Section */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wallet className="w-4 h-4" />
                    {isEs ? "Posición de Caja (Realizado)" : "Cash Position (Realized)"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {isEs ? "Dinero realmente cobrado vs pagado" : "Money actually collected vs paid"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-3 rounded-lg bg-green-50 border border-green-100">
                      <p className="text-xs text-green-600">{isEs ? "Cobrado de Clientes" : "Collected from Clients"}</p>
                      <p className="text-xl font-bold text-green-700">{formatCurrency(reportData.revenue?.total_collected)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                      <p className="text-xs text-red-600">{isEs ? "Pagado a Proveedores" : "Paid to Suppliers"}</p>
                      <p className="text-xl font-bold text-red-700">{formatCurrency(reportData.expenses?.paid || 0)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                      <p className="text-xs text-blue-600">{isEs ? "Flujo Neto de Caja" : "Net Cash Flow"}</p>
                      <p className="text-xl font-bold text-blue-700">
                        {formatCurrency((reportData.revenue?.total_collected || 0) - (reportData.expenses?.paid || 0))}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Clarity Note */}
              <Card className="bg-amber-50/50 border-amber-200">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-600 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      {isEs 
                        ? "La utilidad refleja costos asignados a eventos. Los gastos no asignados (overhead) pueden distorsionar los márgenes mostrados. Revisa 'Costos Sin Asignar' en el panel ejecutivo."
                        : "Profit reflects costs assigned to events. Unassigned expenses (overhead) may distort displayed margins. Check 'Unassigned Costs' in the executive dashboard."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* BY CLIENT REPORT */}
          {activeReport === "clients" && reportData && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isEs ? "Cliente" : "Client"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Facturado" : "Invoiced"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Cobrado" : "Collected"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Pendiente" : "Outstanding"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(reportData.records || []).map(r => (
                      <TableRow key={r.client_id}>
                        <TableCell>{r.client_name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.total_invoiced)}</TableCell>
                        <TableCell className="text-right text-green-600">{formatCurrency(r.total_paid)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.total_outstanding)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* BY SUPPLIER REPORT */}
          {activeReport === "suppliers" && reportData && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isEs ? "Proveedor" : "Supplier"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Total" : "Total"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Pagado" : "Paid"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Pendiente" : "Pending"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(reportData.records || []).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{r.supplier_name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.total_amount)}</TableCell>
                        <TableCell className="text-right text-green-600">{formatCurrency(r.paid_amount)}</TableCell>
                        <TableCell className="text-right text-orange-600">{formatCurrency(r.pending_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* BY EVENT REPORT - Enhanced with Health Badges */}
          {activeReport === "events" && reportData && (
            <div className="space-y-4">
              {/* Controls */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{isEs ? "Margen objetivo:" : "Target margin:"}</span>
                  <Select value={targetMargin.toString()} onValueChange={(v) => setTargetMargin(parseInt(v))}>
                    <SelectTrigger className="w-20 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[20, 25, 30, 35, 40, 45, 50].map(v => (
                        <SelectItem key={v} value={v.toString()}>{v}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  variant={showCollectedPaid ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setShowCollectedPaid(!showCollectedPaid)}
                >
                  {isEs ? "Mostrar Cobrado/Pagado" : "Show Collected/Paid"}
                </Button>
              </div>

              {/* Summary Badges */}
              <div className="flex gap-4 flex-wrap">
                {(() => {
                  const records = reportData.records || [];
                  const healthy = records.filter(r => (r.margin_percent || 0) >= targetMargin).length;
                  const risk = records.filter(r => (r.margin_percent || 0) >= 0 && (r.margin_percent || 0) < targetMargin).length;
                  const loss = records.filter(r => (r.margin_percent || 0) < 0).length;
                  return (
                    <>
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 text-green-800">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">{healthy} {isEs ? "Saludables" : "Healthy"}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 text-amber-800">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm font-medium">{risk} {isEs ? "En Riesgo" : "At Risk"}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-100 text-red-800">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">{loss} {isEs ? "Con Pérdida" : "With Loss"}</span>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Events Table */}
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{isEs ? "Evento" : "Event"}</TableHead>
                        <TableHead>{isEs ? "Estado" : "Health"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Ingresos" : "Revenue"}</TableHead>
                        {showCollectedPaid && <TableHead className="text-right">{isEs ? "Cobrado" : "Collected"}</TableHead>}
                        <TableHead className="text-right">{isEs ? "Costos" : "Costs"}</TableHead>
                        {showCollectedPaid && <TableHead className="text-right">{isEs ? "Pagado" : "Paid"}</TableHead>}
                        <TableHead className="text-right">{isEs ? "Utilidad" : "Profit"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Margen" : "Margin"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(reportData.records || []).map(r => (
                        <TableRow key={r.event_id} className={r.margin_percent < 0 ? "bg-red-50/50" : r.margin_percent < targetMargin ? "bg-amber-50/30" : ""}>
                          <TableCell className="font-medium">{r.event_name}</TableCell>
                          <TableCell>{getHealthBadge(r)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(r.revenue)}</TableCell>
                          {showCollectedPaid && <TableCell className="text-right text-green-600">{formatCurrency(r.collected || 0)}</TableCell>}
                          <TableCell className="text-right text-red-600">{formatCurrency(r.costs)}</TableCell>
                          {showCollectedPaid && <TableCell className="text-right text-orange-600">{formatCurrency(r.paid_costs || 0)}</TableCell>}
                          <TableCell className={`text-right font-medium ${r.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {formatCurrency(r.profit)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-medium ${r.margin_percent < 0 ? "text-red-600" : r.margin_percent < targetMargin ? "text-amber-600" : "text-green-600"}`}>
                              {r.margin_percent}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Decision Guide */}
              <Card className="bg-slate-50 border-slate-200">
                <CardContent className="pt-4">
                  <h4 className="font-medium text-sm mb-2">{isEs ? "📊 Guía de Decisión" : "📊 Decision Guide"}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-green-700">{isEs ? "Saludable" : "Healthy"}</p>
                        <p className="text-muted-foreground text-xs">{isEs ? "Replicar: pricing y ejecución funcionan" : "Replicate: pricing and execution work"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-700">{isEs ? "Riesgo" : "Risk"}</p>
                        <p className="text-muted-foreground text-xs">{isEs ? "Revisar: ¿problema de precio o ejecución?" : "Review: pricing or execution issue?"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-red-700">{isEs ? "Pérdida" : "Loss"}</p>
                        <p className="text-muted-foreground text-xs">{isEs ? "Investigar: ¿evitar o corregir urgente?" : "Investigate: avoid or urgent fix?"}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ==================== FIXED COSTS & BUDGET SECTION ====================
function FixedCostsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [activeTab, setActiveTab] = useState("analysis");
  const [categories, setCategories] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Form states
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "", active: true });
  const [budgetForm, setBudgetForm] = useState({ category_id: "", period: "MONTHLY", budget_amount: 0, start_date: "", notes: "" });
  
  // Period filters
  const [selectedPeriod, setSelectedPeriod] = useState("MONTHLY");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [catRes, budRes, analysisRes] = await Promise.all([
        axios.get(`${API}/api/business-clarity/fixed-costs/categories`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/fixed-costs/budgets`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/fixed-costs/analysis?period=${selectedPeriod}&year=${selectedYear}&month=${selectedMonth}`, { withCredentials: true })
      ]);
      setCategories(catRes.data || []);
      setBudgets(budRes.data || []);
      setAnalysis(analysisRes.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [selectedPeriod, selectedYear, selectedMonth]);

  const handleSaveCategory = async () => {
    try {
      if (editingCategory) {
        await axios.put(`${API}/api/business-clarity/fixed-costs/categories/${editingCategory.category_id}`, categoryForm, { withCredentials: true });
        toast.success(isEs ? "Categoría actualizada" : "Category updated");
      } else {
        await axios.post(`${API}/api/business-clarity/fixed-costs/categories`, categoryForm, { withCredentials: true });
        toast.success(isEs ? "Categoría creada" : "Category created");
      }
      setCategoryDialogOpen(false);
      setEditingCategory(null);
      setCategoryForm({ name: "", description: "", active: true });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!window.confirm(isEs ? "¿Eliminar esta categoría?" : "Delete this category?")) return;
    try {
      await axios.delete(`${API}/api/business-clarity/fixed-costs/categories/${categoryId}`, { withCredentials: true });
      toast.success(isEs ? "Categoría eliminada" : "Category deleted");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleSaveBudget = async () => {
    try {
      await axios.post(`${API}/api/business-clarity/fixed-costs/budgets`, budgetForm, { withCredentials: true });
      toast.success(isEs ? "Presupuesto guardado" : "Budget saved");
      setBudgetDialogOpen(false);
      setBudgetForm({ category_id: "", period: "MONTHLY", budget_amount: 0, start_date: "", notes: "" });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "OVER_BUDGET":
        return <Badge className="bg-red-600">{isEs ? "Sobre Presupuesto" : "Over Budget"}</Badge>;
      case "WARNING":
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800">{isEs ? "Advertencia" : "Warning"}</Badge>;
      case "NO_BUDGET":
        return <Badge variant="outline">{isEs ? "Sin Presupuesto" : "No Budget"}</Badge>;
      default:
        return <Badge className="bg-green-600">OK</Badge>;
    }
  };

  const PERIODS = [
    { value: "MONTHLY", label: isEs ? "Mensual" : "Monthly" },
    { value: "QUARTERLY", label: isEs ? "Trimestral" : "Quarterly" },
    { value: "YEARLY", label: isEs ? "Anual" : "Yearly" },
  ];

  const MONTHS = [
    { value: 1, label: isEs ? "Enero" : "January" },
    { value: 2, label: isEs ? "Febrero" : "February" },
    { value: 3, label: isEs ? "Marzo" : "March" },
    { value: 4, label: isEs ? "Abril" : "April" },
    { value: 5, label: isEs ? "Mayo" : "May" },
    { value: 6, label: isEs ? "Junio" : "June" },
    { value: 7, label: isEs ? "Julio" : "July" },
    { value: 8, label: isEs ? "Agosto" : "August" },
    { value: 9, label: isEs ? "Septiembre" : "September" },
    { value: 10, label: isEs ? "Octubre" : "October" },
    { value: 11, label: isEs ? "Noviembre" : "November" },
    { value: 12, label: isEs ? "Diciembre" : "December" },
  ];

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Target className="w-5 h-5" />
            {isEs ? "Costos Fijos & Presupuesto" : "Fixed Costs & Budget"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Control de overhead y su impacto en rentabilidad" : "Overhead control and profitability impact"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={activeTab === "analysis" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("analysis")}>
            <BarChart3 className="w-4 h-4 mr-2" />
            {isEs ? "Análisis" : "Analysis"}
          </Button>
          <Button variant={activeTab === "setup" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("setup")}>
            <FileText className="w-4 h-4 mr-2" />
            {isEs ? "Configuración" : "Setup"}
          </Button>
        </div>
      </div>

      {/* Executive Insights */}
      {analysis?.insights && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200">
            <CardContent className="pt-4">
              <p className="text-xs text-slate-600">{isEs ? "Costos Fijos (Período)" : "Fixed Costs (Period)"}</p>
              <p className="text-2xl font-bold text-slate-800">{formatCurrency(analysis.insights.total_fixed_costs)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="pt-4">
              <p className="text-xs text-blue-600">{isEs ? "Promedio por Evento" : "Avg per Event"}</p>
              <p className="text-2xl font-bold text-blue-800">{formatCurrency(analysis.insights.avg_fixed_per_event)}</p>
              <p className="text-xs text-blue-500">{analysis.insights.events_in_period} {isEs ? "eventos" : "events"}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
            <CardContent className="pt-4">
              <p className="text-xs text-amber-600">{isEs ? "Break-even por Evento" : "Break-even per Event"}</p>
              <p className="text-2xl font-bold text-amber-800">{formatCurrency(analysis.insights.break_even_revenue_per_event)}</p>
              <p className="text-xs text-amber-500">{isEs ? "Ingresos mínimos" : "Min revenue"}</p>
            </CardContent>
          </Card>
          <Card className={`bg-gradient-to-br ${analysis.summary?.overall_status === "OVER_BUDGET" ? "from-red-50 to-red-100 border-red-200" : analysis.summary?.overall_status === "WARNING" ? "from-amber-50 to-amber-100 border-amber-200" : "from-green-50 to-green-100 border-green-200"}`}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{isEs ? "Varianza Total" : "Total Variance"}</p>
              <p className={`text-2xl font-bold ${(analysis.summary?.total_variance || 0) >= 0 ? "text-green-700" : "text-red-700"}`}>
                {formatCurrency(Math.abs(analysis.summary?.total_variance || 0))}
              </p>
              <p className="text-xs">{(analysis.summary?.total_variance || 0) >= 0 ? (isEs ? "bajo presupuesto" : "under budget") : (isEs ? "sobre presupuesto" : "over budget")}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Analysis Tab */}
      {activeTab === "analysis" && (
        <div className="space-y-4">
          {/* Period Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex gap-4 items-center flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">{isEs ? "Período:" : "Period:"}</Label>
                  <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERIODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">{isEs ? "Año:" : "Year:"}</Label>
                  <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {selectedPeriod === "MONTHLY" && (
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">{isEs ? "Mes:" : "Month:"}</Label>
                    <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONTHS.map(m => <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={fetchData}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {isEs ? "Actualizar" : "Refresh"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Budget vs Actual Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{isEs ? "Presupuesto vs Real por Categoría" : "Budget vs Actual by Category"}</CardTitle>
              <CardDescription>
                {analysis?.date_range && (
                  <span>
                    {new Date(analysis.date_range.start).toLocaleDateString()} - {new Date(analysis.date_range.end).toLocaleDateString()}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Presupuestado" : "Budgeted"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Real" : "Actual"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Varianza" : "Variance"}</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(analysis?.categories || []).map(cat => (
                    <TableRow key={cat.category_id} className={cat.status === "OVER_BUDGET" ? "bg-red-50/50" : cat.status === "WARNING" ? "bg-amber-50/30" : ""}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{cat.category_name}</p>
                          {cat.description && <p className="text-xs text-muted-foreground">{cat.description}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(cat.budgeted)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(cat.actual)}</TableCell>
                      <TableCell className={`text-right font-mono ${cat.variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {cat.variance >= 0 ? "+" : ""}{formatCurrency(cat.variance)}
                      </TableCell>
                      <TableCell className={`text-right ${cat.variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {cat.variance_percent >= 0 ? "+" : ""}{cat.variance_percent}%
                      </TableCell>
                      <TableCell>{getStatusBadge(cat.status)}</TableCell>
                    </TableRow>
                  ))}
                  {(analysis?.categories || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {isEs ? "Configura categorías y presupuestos para ver el análisis" : "Set up categories and budgets to see analysis"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Summary Row */}
          {analysis?.summary && (analysis?.categories || []).length > 0 && (
            <Card className="bg-slate-50 border-slate-200">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex gap-8">
                    <div>
                      <p className="text-xs text-muted-foreground">{isEs ? "Total Presupuestado" : "Total Budgeted"}</p>
                      <p className="text-lg font-bold">{formatCurrency(analysis.summary.total_budgeted)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{isEs ? "Total Real" : "Total Actual"}</p>
                      <p className="text-lg font-bold">{formatCurrency(analysis.summary.total_actual)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{isEs ? "Varianza" : "Variance"}</p>
                      <p className={`text-lg font-bold ${analysis.summary.total_variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {analysis.summary.total_variance >= 0 ? "+" : ""}{formatCurrency(analysis.summary.total_variance)} ({analysis.summary.variance_percent}%)
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(analysis.summary.overall_status)}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Setup Tab */}
      {activeTab === "setup" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Categories */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{isEs ? "Categorías de Costos Fijos" : "Fixed Cost Categories"}</CardTitle>
                <Button size="sm" onClick={() => { setEditingCategory(null); setCategoryForm({ name: "", description: "", active: true }); setCategoryDialogOpen(true); }}>
                  <Plus className="w-4 h-4 mr-1" />
                  {isEs ? "Agregar" : "Add"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                    <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map(cat => (
                    <TableRow key={cat.category_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{cat.name}</p>
                          {cat.description && <p className="text-xs text-muted-foreground">{cat.description}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={cat.active ? "default" : "secondary"}>
                          {cat.active ? (isEs ? "Activa" : "Active") : (isEs ? "Inactiva" : "Inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => { setEditingCategory(cat); setCategoryForm({ name: cat.name, description: cat.description || "", active: cat.active }); setCategoryDialogOpen(true); }}>
                            <FileText className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleDeleteCategory(cat.category_id)}>
                            <AlertTriangle className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {categories.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        {isEs ? "Sin categorías" : "No categories"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Budgets */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{isEs ? "Presupuestos" : "Budgets"}</CardTitle>
                <Button size="sm" onClick={() => { setBudgetForm({ category_id: "", period: "MONTHLY", budget_amount: 0, start_date: new Date().toISOString().split("T")[0], notes: "" }); setBudgetDialogOpen(true); }}>
                  <Plus className="w-4 h-4 mr-1" />
                  {isEs ? "Agregar" : "Add"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
                    <TableHead>{isEs ? "Período" : "Period"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Monto" : "Amount"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgets.map(bud => (
                    <TableRow key={bud.budget_id}>
                      <TableCell className="font-medium">{bud.category_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{bud.period}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(bud.budget_amount)}</TableCell>
                    </TableRow>
                  ))}
                  {budgets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        {isEs ? "Sin presupuestos" : "No budgets"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? (isEs ? "Editar Categoría" : "Edit Category") : (isEs ? "Nueva Categoría" : "New Category")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"}</Label>
              <Input value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} placeholder={isEs ? "Ej: Alquiler, Servicios, Nómina" : "E.g. Rent, Utilities, Payroll"} />
            </div>
            <div>
              <Label>{isEs ? "Descripción" : "Description"}</Label>
              <Textarea value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} placeholder={isEs ? "Descripción opcional..." : "Optional description..."} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="active" checked={categoryForm.active} onChange={(e) => setCategoryForm({ ...categoryForm, active: e.target.checked })} />
              <Label htmlFor="active">{isEs ? "Activa" : "Active"}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleSaveCategory}>{isEs ? "Guardar" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Budget Dialog */}
      <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Nuevo Presupuesto" : "New Budget"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Categoría" : "Category"}</Label>
              <Select value={budgetForm.category_id} onValueChange={(v) => setBudgetForm({ ...budgetForm, category_id: v })}>
                <SelectTrigger><SelectValue placeholder={isEs ? "Selecciona categoría..." : "Select category..."} /></SelectTrigger>
                <SelectContent>
                  {categories.filter(c => c.active).map(c => (
                    <SelectItem key={c.category_id} value={c.category_id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isEs ? "Período" : "Period"}</Label>
              <Select value={budgetForm.period} onValueChange={(v) => setBudgetForm({ ...budgetForm, period: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isEs ? "Monto Presupuestado" : "Budget Amount"}</Label>
              <Input type="number" step="0.01" value={budgetForm.budget_amount} onChange={(e) => setBudgetForm({ ...budgetForm, budget_amount: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>{isEs ? "Fecha Inicio" : "Start Date"}</Label>
              <Input type="date" value={budgetForm.start_date} onChange={(e) => setBudgetForm({ ...budgetForm, start_date: e.target.value })} />
            </div>
            <div>
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Textarea value={budgetForm.notes} onChange={(e) => setBudgetForm({ ...budgetForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleSaveBudget} disabled={!budgetForm.category_id}>{isEs ? "Guardar" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== MAIN PAGE ====================
export default function BusinessClarityPage() {
  const { language } = useLanguage();
  const isEs = language === "es";

  // Navigation items - same structure as FoodOpsPage
  const sidebarNavItems = [
    { path: "/business-clarity/dashboard", label: isEs ? "Panel Ejecutivo" : "Executive Dashboard", icon: PieChart },
    { path: "/business-clarity/invoices", label: isEs ? "Facturas" : "Invoices", icon: FileText },
    { path: "/business-clarity/payments", label: isEs ? "Pagos Recibidos" : "Received Payments", icon: Banknote },
    { path: "/business-clarity/statements", label: isEs ? "Estados de Cuenta" : "Account Statements", icon: UserCircle },
    { path: "/business-clarity/receivables", label: isEs ? "Cuentas por Cobrar" : "Accounts Receivable", icon: TrendingUp },
    { path: "/business-clarity/payables", label: isEs ? "Cuentas por Pagar" : "Accounts Payable", icon: TrendingDown },
    { path: "/business-clarity/fixed-costs", label: isEs ? "Costos Fijos & Budget" : "Fixed Costs & Budget", icon: Target },
    { path: "/business-clarity/reports", label: isEs ? "Reportes Ejecutivos" : "Executive Reports", icon: FileBarChart },
  ];

  // Check for payment success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (sessionId) {
      const pollStatus = async () => {
        try {
          const res = await axios.get(`${API}/api/business-clarity/checkout/status/${sessionId}`, { withCredentials: true });
          if (res.data.payment_status === "paid") {
            toast.success(isEs ? "¡Pago exitoso!" : "Payment successful!");
            window.history.replaceState({}, document.title, window.location.pathname);
          } else if (res.data.status !== "expired") {
            setTimeout(pollStatus, 2000);
          }
        } catch (err) { console.error(err); }
      };
      pollStatus();
    }
  }, [isEs]);

  return (
    <div className="flex h-[calc(100vh-4rem)]" data-testid="business-clarity-page">
      {/* Sidebar Navigation - Identical structure to FoodOpsPage */}
      <div className="w-64 border-r bg-muted/30 p-4 flex flex-col">
        {/* Back to System Pulse */}
        <NavLink 
          to="/dashboard" 
          className="flex items-center gap-2 mb-4 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {isEs ? "Volver a System Pulse" : "Back to System Pulse"}
        </NavLink>
        
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Landmark className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-bold">Business Clarity</h2>
          </div>
          <p className="text-xs text-muted-foreground pl-8">
            {isEs 
              ? "Donde las finanzas dejan de ser números y se convierten en decisiones" 
              : "Where finances move from numbers to decisions"}
          </p>
        </div>

        <nav className="space-y-1 flex-1">
          {sidebarNavItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm ${
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "hover:bg-muted"
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardSection />} />
          <Route path="invoices" element={<InvoicesSection />} />
          <Route path="payments" element={<PaymentsSection />} />
          <Route path="statements" element={<StatementsSection />} />
          <Route path="receivables" element={<ReceivablesSection />} />
          <Route path="payables" element={<PayablesSection />} />
          <Route path="fixed-costs" element={<FixedCostsSection />} />
          <Route path="reports" element={<ReportsSection />} />
        </Routes>
      </div>
    </div>
  );
}
