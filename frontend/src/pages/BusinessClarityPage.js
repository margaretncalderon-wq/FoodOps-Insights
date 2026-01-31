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

// Icons
import {
  DollarSign, CreditCard, FileText, Users, TrendingUp, TrendingDown,
  AlertTriangle, Clock, CheckCircle, Plus, Download, RefreshCw, 
  Wallet, PieChart, Calendar, Banknote, UserCircle, Landmark, 
  FileBarChart, BarChart3, Building2, ArrowLeft
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ==================== DASHBOARD SECTION ====================
function DashboardSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/business-clarity/dashboard`, { withCredentials: true });
      setData(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  const agingData = data?.aging_buckets || {};
  const totalAging = Object.values(agingData).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{isEs ? "Panel Ejecutivo" : "Executive Dashboard"}</h2>
        <Button variant="outline" size="sm" onClick={fetchData}><RefreshCw className="w-4 h-4 mr-2" />{isEs ? "Actualizar" : "Refresh"}</Button>
      </div>

      {/* KPI Cards */}
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

// ==================== ACCOUNTS PAYABLE SECTION ====================
function AccountsPayableSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/api/business-clarity/accounts-payable`, { withCredentials: true })
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{isEs ? "Cuentas por Pagar" : "Accounts Payable"}</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Total Pendiente" : "Total Pending"}</p><p className="text-xl font-bold text-orange-600">{formatCurrency(data?.summary?.total_pending)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Total Pagado" : "Total Paid"}</p><p className="text-xl font-bold text-green-600">{formatCurrency(data?.summary?.total_paid)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Pendientes" : "Pending"}</p><p className="text-xl font-bold">{data?.summary?.pending_count || 0}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>{isEs ? "Proveedor" : "Supplier"}</TableHead><TableHead>{isEs ? "Descripción" : "Description"}</TableHead><TableHead>{isEs ? "Evento" : "Event"}</TableHead><TableHead className="text-right">{isEs ? "Monto" : "Amount"}</TableHead><TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead><TableHead>{isEs ? "Estado" : "Status"}</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data?.records || []).map((rec) => (
                <TableRow key={rec.payable_id}>
                  <TableCell>{rec.supplier_name || "-"}</TableCell>
                  <TableCell>{rec.description || "-"}</TableCell>
                  <TableCell>{rec.event_name || "-"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(rec.amount)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(rec.balance_due)}</TableCell>
                  <TableCell><Badge variant={rec.status === "paid" ? "default" : "outline"}>{rec.status === "paid" ? (isEs ? "Pagado" : "Paid") : (isEs ? "Pendiente" : "Pending")}</Badge></TableCell>
                </TableRow>
              ))}
              {(data?.records || []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{isEs ? "Sin registros" : "No records"}</TableCell></TableRow>}
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

  useEffect(() => {
    setLoading(true);
    const endpoints = { snapshot: "/api/business-clarity/reports/financial-snapshot", clients: "/api/business-clarity/reports/client-revenue", suppliers: "/api/business-clarity/reports/supplier-spend", events: "/api/business-clarity/reports/event-profitability" };
    axios.get(`${API}${endpoints[activeReport]}`, { withCredentials: true })
      .then(res => setReportData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeReport]);

  const reports = [
    { key: "snapshot", label: isEs ? "Resumen" : "Snapshot", icon: PieChart },
    { key: "clients", label: isEs ? "Por Cliente" : "By Client", icon: Users },
    { key: "suppliers", label: isEs ? "Por Proveedor" : "By Supplier", icon: Building2 },
    { key: "events", label: isEs ? "Por Evento" : "By Event", icon: Calendar },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">{isEs ? "Reportes" : "Reports"}</h2>
        <div className="flex gap-1">
          {reports.map(({ key, label, icon: Icon }) => (
            <Button key={key} variant={activeReport === key ? "default" : "ghost"} size="sm" onClick={() => setActiveReport(key)} className="gap-2"><Icon className="w-4 h-4" />{label}</Button>
          ))}
        </div>
      </div>

      {loading ? <Card><CardContent className="py-12 text-center"><RefreshCw className="w-8 h-8 animate-spin mx-auto" /></CardContent></Card> : (
        <>
          {activeReport === "snapshot" && reportData && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Facturado" : "Invoiced"}</p><p className="text-xl font-bold">{formatCurrency(reportData.revenue?.total_invoiced)}</p></CardContent></Card>
              <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Cobrado" : "Collected"}</p><p className="text-xl font-bold text-green-600">{formatCurrency(reportData.revenue?.total_collected)}</p></CardContent></Card>
              <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Gastos" : "Expenses"}</p><p className="text-xl font-bold text-red-600">{formatCurrency(reportData.expenses?.total)}</p></CardContent></Card>
              <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Utilidad" : "Profit"}</p><p className="text-xl font-bold text-blue-600">{formatCurrency(reportData.profit?.gross)}</p><p className="text-xs text-muted-foreground">{reportData.profit?.margin}%</p></CardContent></Card>
            </div>
          )}
          {activeReport === "clients" && reportData && (
            <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>{isEs ? "Cliente" : "Client"}</TableHead><TableHead className="text-right">{isEs ? "Facturado" : "Invoiced"}</TableHead><TableHead className="text-right">{isEs ? "Cobrado" : "Collected"}</TableHead><TableHead className="text-right">{isEs ? "Pendiente" : "Outstanding"}</TableHead></TableRow></TableHeader><TableBody>{(reportData.records || []).map(r => <TableRow key={r.client_id}><TableCell>{r.client_name}</TableCell><TableCell className="text-right">{formatCurrency(r.total_invoiced)}</TableCell><TableCell className="text-right text-green-600">{formatCurrency(r.total_paid)}</TableCell><TableCell className="text-right">{formatCurrency(r.total_outstanding)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
          )}
          {activeReport === "suppliers" && reportData && (
            <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>{isEs ? "Proveedor" : "Supplier"}</TableHead><TableHead className="text-right">{isEs ? "Total" : "Total"}</TableHead><TableHead className="text-right">{isEs ? "Pagado" : "Paid"}</TableHead><TableHead className="text-right">{isEs ? "Pendiente" : "Pending"}</TableHead></TableRow></TableHeader><TableBody>{(reportData.records || []).map((r,i) => <TableRow key={i}><TableCell>{r.supplier_name}</TableCell><TableCell className="text-right">{formatCurrency(r.total_amount)}</TableCell><TableCell className="text-right text-green-600">{formatCurrency(r.paid_amount)}</TableCell><TableCell className="text-right text-orange-600">{formatCurrency(r.pending_amount)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
          )}
          {activeReport === "events" && reportData && (
            <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>{isEs ? "Evento" : "Event"}</TableHead><TableHead className="text-right">{isEs ? "Ingresos" : "Revenue"}</TableHead><TableHead className="text-right">{isEs ? "Costos" : "Costs"}</TableHead><TableHead className="text-right">{isEs ? "Utilidad" : "Profit"}</TableHead><TableHead className="text-right">{isEs ? "Margen" : "Margin"}</TableHead></TableRow></TableHeader><TableBody>{(reportData.records || []).map(r => <TableRow key={r.event_id}><TableCell>{r.event_name}</TableCell><TableCell className="text-right">{formatCurrency(r.revenue)}</TableCell><TableCell className="text-right text-red-600">{formatCurrency(r.costs)}</TableCell><TableCell className={`text-right font-medium ${r.profit >= 0 ? "text-green-600" : "text-red-600"}`}>{formatCurrency(r.profit)}</TableCell><TableCell className="text-right">{r.margin_percent}%</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}

// ==================== NAVIGATION ITEMS ====================
const navItems = [
  { path: "dashboard", label: "Dashboard", labelEs: "Dashboard", icon: PieChart },
  { path: "invoices", label: "Invoices", labelEs: "Facturas", icon: FileText },
  { path: "payments", label: "Payments", labelEs: "Pagos", icon: Banknote },
  { path: "statements", label: "Statements", labelEs: "Estados de Cuenta", icon: UserCircle },
  { path: "receivables", label: "Receivables", labelEs: "Por Cobrar", icon: TrendingUp },
  { path: "payables", label: "Payables", labelEs: "Por Pagar", icon: TrendingDown },
  { path: "reports", label: "Reports", labelEs: "Reportes", icon: FileBarChart },
];

// ==================== MAIN PAGE ====================
export default function BusinessClarityPage() {
  const { language } = useLanguage();
  const isEs = language === "es";

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
    <Layout>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Sidebar - Same style as Culinary Intelligence */}
        <div className="w-56 border-r bg-muted/30 p-4 flex flex-col">
          <NavLink 
            to="/dashboard" 
            className="flex items-center gap-2 mb-4 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {isEs ? "← Volver al Dashboard" : "← Back to Dashboard"}
          </NavLink>
          
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Landmark className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-bold">Business Clarity</h2>
            </div>
            <p className="text-xs text-muted-foreground pl-8">
              {isEs ? "Claridad para decidir" : "Clarity for decisions"}
            </p>
          </div>
          
          <nav className="space-y-1 flex-1">
            {navItems.map(item => (
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
                <span>{isEs ? item.labelEs : item.label}</span>
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
            <Route path="statements" element={<AccountStatementsSection />} />
            <Route path="receivables" element={<AccountsReceivableSection />} />
            <Route path="payables" element={<AccountsPayableSection />} />
            <Route path="reports" element={<ReportsSection />} />
          </Routes>
        </div>
      </div>
    </Layout>
  );
}
