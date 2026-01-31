import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Routes, Route, NavLink, Navigate, useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";
import { Textarea } from "../components/ui/textarea";

// Icons
import {
  DollarSign, CreditCard, FileText, Users, TrendingUp, TrendingDown,
  AlertTriangle, Clock, CheckCircle, XCircle, Plus, Eye, Download,
  ArrowRight, RefreshCw, Building2, Receipt, Wallet, PieChart,
  Calendar, Filter, Search, ChevronRight, AlertCircle, Banknote,
  BarChart3, UserCircle, Landmark, ClipboardList, FileBarChart
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

// Helper
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
      toast.error(isEs ? "Error al cargar dashboard" : "Failed to load dashboard");
    }
    setLoading(false);
  }, [isEs]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  const agingData = data?.aging_buckets || {};
  const totalAging = Object.values(agingData).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{isEs ? "Panel Ejecutivo" : "Executive Dashboard"}</h2>
          <p className="text-sm text-muted-foreground">{isEs ? "Resumen financiero en tiempo real" : "Real-time financial summary"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}><RefreshCw className="w-4 h-4 mr-2" />{isEs ? "Actualizar" : "Refresh"}</Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 font-medium">{isEs ? "Por Cobrar" : "Receivables"}</p>
                <p className="text-2xl font-bold text-green-700">{formatCurrency(data?.total_receivables)}</p>
              </div>
              <div className="p-3 bg-green-200 rounded-full"><TrendingUp className="w-6 h-6 text-green-700" /></div>
            </div>
            <p className="text-xs text-green-600 mt-2">{data?.open_invoices_count || 0} {isEs ? "facturas abiertas" : "open invoices"}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 font-medium">{isEs ? "Vencido" : "Overdue"}</p>
                <p className="text-2xl font-bold text-red-700">{formatCurrency(data?.total_overdue)}</p>
              </div>
              <div className="p-3 bg-red-200 rounded-full"><AlertTriangle className="w-6 h-6 text-red-700" /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600 font-medium">{isEs ? "Por Pagar" : "Payables"}</p>
                <p className="text-2xl font-bold text-orange-700">{formatCurrency(data?.total_payables)}</p>
              </div>
              <div className="p-3 bg-orange-200 rounded-full"><TrendingDown className="w-6 h-6 text-orange-700" /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">{isEs ? "Flujo Neto" : "Net Flow"}</p>
                <p className="text-2xl font-bold text-blue-700">{formatCurrency((data?.total_receivables || 0) - (data?.total_payables || 0))}</p>
              </div>
              <div className="p-3 bg-blue-200 rounded-full"><Wallet className="w-6 h-6 text-blue-700" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Aging Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5" />{isEs ? "Análisis de Antigüedad" : "Aging Analysis"}</CardTitle>
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
                  <div className="text-sm text-muted-foreground mb-1">{label} {isEs ? "días" : "days"}</div>
                  <div className="text-lg font-semibold">{formatCurrency(amount)}</div>
                  <div className="w-full bg-muted rounded-full h-2 mt-2">
                    <div className={`${color} h-2 rounded-full`} style={{ width: `${percent}%` }} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{percent.toFixed(0)}%</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Payments */}
      {data?.recent_payments?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Banknote className="w-5 h-5" />{isEs ? "Pagos Recientes" : "Recent Payments"}</CardTitle></CardHeader>
          <CardContent>
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
                    <TableCell>{new Date(pay.payment_date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium text-green-600">{formatCurrency(pay.amount)}</TableCell>
                    <TableCell><Badge variant="outline">{pay.payment_method}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{pay.reference || "-"}</TableCell>
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
      toast.error(isEs ? "Error al cargar facturas" : "Failed to load invoices");
    }
    setLoading(false);
  }, [isEs]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleSelectInvoice = (invoiceId) => {
    setSelectedInvoices(prev => prev.includes(invoiceId) ? prev.filter(id => id !== invoiceId) : [...prev, invoiceId]);
  };

  const handlePayWithStripe = async () => {
    if (selectedInvoices.length === 0) {
      toast.error(isEs ? "Selecciona al menos una factura" : "Select at least one invoice");
      return;
    }
    try {
      const res = await axios.post(`${API}/api/business-clarity/checkout/session`, {
        invoice_ids: selectedInvoices,
        origin_url: window.location.origin
      }, { withCredentials: true });
      if (res.data.url) window.location.href = res.data.url;
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al crear sesión de pago" : "Failed to create payment session"));
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
        <div className="flex items-center gap-4">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
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
            <Button onClick={handlePayWithStripe} className="gap-2">
              <CreditCard className="w-4 h-4" />
              {isEs ? "Pagar con Tarjeta" : "Pay with Card"} ({selectedInvoices.length})
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
                <TableHead className="w-12"></TableHead>
                <TableHead>{isEs ? "Factura #" : "Invoice #"}</TableHead>
                <TableHead>{isEs ? "Cliente" : "Client"}</TableHead>
                <TableHead>{isEs ? "Evento" : "Event"}</TableHead>
                <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
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
                  <TableCell>
                    {inv.status !== "paid" && (
                      <input type="checkbox" checked={selectedInvoices.includes(inv.invoice_id)} onChange={() => handleSelectInvoice(inv.invoice_id)} className="rounded border-gray-300" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.client_name || "-"}</TableCell>
                  <TableCell>{inv.event_name || "-"}</TableCell>
                  <TableCell>{new Date(inv.issue_date).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(inv.due_date).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">{formatCurrency(inv.total)}</TableCell>
                  <TableCell className="text-right text-green-600">{formatCurrency(inv.paid_amount)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(inv.balance_due)}</TableCell>
                  <TableCell>{getStatusBadge(inv.status)}</TableCell>
                </TableRow>
              ))}
              {filteredInvoices.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">{isEs ? "No hay facturas" : "No invoices"}</TableCell></TableRow>
              )}
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
  
  const [paymentForm, setPaymentForm] = useState({
    client_id: "", amount: 0, payment_method: "transfer", reference: "", notes: ""
  });
  const [applicationAmounts, setApplicationAmounts] = useState({});

  const fetchData = useCallback(async () => {
    try {
      const [payRes, clientRes, invRes] = await Promise.all([
        axios.get(`${API}/api/business-clarity/payments`, { withCredentials: true }),
        axios.get(`${API}/api/clients`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/invoices?status=open`, { withCredentials: true }).catch(() => ({ data: [] })),
      ]);
      setPayments(payRes.data);
      setClients(clientRes.data);
      setInvoices(invRes.data.filter(i => i.status !== "paid"));
    } catch (err) {
      toast.error(isEs ? "Error al cargar datos" : "Failed to load data");
    }
    setLoading(false);
  }, [isEs]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreatePayment = async () => {
    if (!paymentForm.client_id || paymentForm.amount <= 0) {
      toast.error(isEs ? "Complete los campos requeridos" : "Fill required fields");
      return;
    }
    try {
      await axios.post(`${API}/api/business-clarity/payments`, paymentForm, { withCredentials: true });
      toast.success(isEs ? "Pago registrado" : "Payment recorded");
      setPaymentDialogOpen(false);
      setPaymentForm({ client_id: "", amount: 0, payment_method: "transfer", reference: "", notes: "" });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al crear pago" : "Failed to create payment"));
    }
  };

  const handleApplyPayment = async () => {
    if (!selectedPayment) return;
    const applications = Object.entries(applicationAmounts)
      .filter(([_, amt]) => amt > 0)
      .map(([invoice_id, amount_applied]) => ({ invoice_id, amount_applied: parseFloat(amount_applied) }));
    
    if (applications.length === 0) {
      toast.error(isEs ? "Ingrese montos a aplicar" : "Enter amounts to apply");
      return;
    }
    
    try {
      await axios.post(`${API}/api/business-clarity/payments/${selectedPayment.payment_id}/apply`, 
        { payment_id: selectedPayment.payment_id, applications }, 
        { withCredentials: true }
      );
      toast.success(isEs ? "Pago aplicado" : "Payment applied");
      setApplyDialogOpen(false);
      setSelectedPayment(null);
      setApplicationAmounts({});
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al aplicar pago" : "Failed to apply payment"));
    }
  };

  const openApplyDialog = (payment) => {
    setSelectedPayment(payment);
    setApplicationAmounts({});
    setApplyDialogOpen(true);
  };

  const clientInvoices = selectedPayment ? invoices.filter(i => i.client_id === selectedPayment.client_id) : [];

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{isEs ? "Pagos Recibidos" : "Received Payments"}</h2>
        <Button onClick={() => setPaymentDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          {isEs ? "Registrar Pago" : "Record Payment"}
        </Button>
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
                  <TableCell>
                    {pay.unapplied_amount > 0 && (
                      <Button variant="outline" size="sm" onClick={() => openApplyDialog(pay)}>
                        {isEs ? "Aplicar" : "Apply"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {payments.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{isEs ? "No hay pagos" : "No payments"}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isEs ? "Registrar Pago" : "Record Payment"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Cliente" : "Client"} *</Label>
              <Select value={paymentForm.client_id} onValueChange={(v) => setPaymentForm({ ...paymentForm, client_id: v })}>
                <SelectTrigger><SelectValue placeholder={isEs ? "Seleccionar cliente" : "Select client"} /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.client_id} value={c.client_id}>{c.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isEs ? "Monto" : "Amount"} *</Label>
              <Input type="number" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>{isEs ? "Método de Pago" : "Payment Method"}</Label>
              <Select value={paymentForm.payment_method} onValueChange={(v) => setPaymentForm({ ...paymentForm, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{isEs ? "Efectivo" : "Cash"}</SelectItem>
                  <SelectItem value="transfer">{isEs ? "Transferencia" : "Transfer"}</SelectItem>
                  <SelectItem value="card">{isEs ? "Tarjeta" : "Card"}</SelectItem>
                  <SelectItem value="check">{isEs ? "Cheque" : "Check"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isEs ? "Referencia" : "Reference"}</Label>
              <Input value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
            </div>
            <div>
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Textarea value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleCreatePayment}>{isEs ? "Guardar" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Payment Dialog */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEs ? "Aplicar Pago a Facturas" : "Apply Payment to Invoices"}</DialogTitle>
            <DialogDescription>
              {isEs ? "Disponible para aplicar" : "Available to apply"}: {formatCurrency(selectedPayment?.unapplied_amount)}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Factura" : "Invoice"}</TableHead>
                  <TableHead>{isEs ? "Vencimiento" : "Due Date"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Aplicar" : "Apply"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientInvoices.map(inv => (
                  <TableRow key={inv.invoice_id}>
                    <TableCell>{inv.invoice_number}</TableCell>
                    <TableCell>{new Date(inv.due_date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">{formatCurrency(inv.balance_due)}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.01"
                        className="w-28 text-right"
                        placeholder="0.00"
                        value={applicationAmounts[inv.invoice_id] || ""}
                        onChange={(e) => setApplicationAmounts({ ...applicationAmounts, [inv.invoice_id]: e.target.value })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {clientInvoices.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground">{isEs ? "No hay facturas pendientes para este cliente" : "No pending invoices for this client"}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleApplyPayment}>{isEs ? "Aplicar Pago" : "Apply Payment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== CLIENT ACCOUNT STATEMENTS SECTION ====================
function AccountStatementsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchClients = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/clients`, { withCredentials: true });
      setClients(res.data);
    } catch (err) {
      toast.error(isEs ? "Error al cargar clientes" : "Failed to load clients");
    }
    setLoading(false);
  }, [isEs]);

  const fetchStatement = async (clientId) => {
    try {
      const res = await axios.get(`${API}/api/business-clarity/clients/${clientId}/financial`, { withCredentials: true });
      setStatement(res.data);
    } catch (err) {
      toast.error(isEs ? "Error al cargar estado de cuenta" : "Failed to load statement");
    }
  };

  useEffect(() => { fetchClients(); }, [fetchClients]);

  useEffect(() => {
    if (selectedClient) fetchStatement(selectedClient);
  }, [selectedClient]);

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{isEs ? "Estados de Cuenta" : "Account Statements"}</h2>
        <Select value={selectedClient || ""} onValueChange={setSelectedClient}>
          <SelectTrigger className="w-64"><SelectValue placeholder={isEs ? "Seleccionar cliente" : "Select client"} /></SelectTrigger>
          <SelectContent>
            {clients.map(c => <SelectItem key={c.client_id} value={c.client_id}>{c.display_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {statement && (
        <>
          {/* Client Info & Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{isEs ? "Total Facturado" : "Total Invoiced"}</p>
                <p className="text-2xl font-bold">{formatCurrency(statement.summary?.total_invoiced)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{isEs ? "Total Pagado" : "Total Paid"}</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(statement.summary?.total_paid)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{isEs ? "Saldo Actual" : "Current Balance"}</p>
                <p className={`text-2xl font-bold ${statement.summary?.current_balance > 0 ? "text-red-600" : "text-green-600"}`}>
                  {formatCurrency(statement.summary?.current_balance)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{isEs ? "Términos de Pago" : "Payment Terms"}</p>
                <p className="text-lg font-medium">{statement.client?.payment_terms || "Immediate"}</p>
              </CardContent>
            </Card>
          </div>

          {/* Warnings */}
          {statement.warnings?.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="w-5 h-5" />
                  <span className="font-medium">{isEs ? "Alertas" : "Warnings"}</span>
                </div>
                <ul className="mt-2 space-y-1">
                  {statement.warnings.map((w, i) => <li key={i} className="text-sm text-red-600">• {w}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Activity (Running Balance) */}
          <Card>
            <CardHeader><CardTitle>{isEs ? "Movimientos" : "Activity"}</CardTitle></CardHeader>
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
                      <TableCell>
                        <Badge variant={item.type === "invoice" ? "default" : "secondary"}>
                          {item.type === "invoice" ? (isEs ? "Factura" : "Invoice") : (isEs ? "Pago" : "Payment")}
                        </Badge>
                      </TableCell>
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
      )}

      {!selectedClient && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">{isEs ? "Seleccione un cliente para ver su estado de cuenta" : "Select a client to view their account statement"}</CardContent></Card>
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

  const fetchData = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/business-clarity/accounts-receivable`, { withCredentials: true });
      setData(res.data);
    } catch (err) {
      toast.error(isEs ? "Error al cargar datos" : "Failed to load data");
    }
    setLoading(false);
  }, [isEs]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{isEs ? "Total Pendiente" : "Total Outstanding"}</p><p className="text-2xl font-bold">{formatCurrency(data?.summary?.total_outstanding)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{isEs ? "Total Vencido" : "Total Overdue"}</p><p className="text-2xl font-bold text-red-600">{formatCurrency(data?.summary?.total_overdue)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{isEs ? "Al Día" : "Current"}</p><p className="text-2xl font-bold text-green-600">{formatCurrency(data?.summary?.total_current)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{isEs ? "Facturas Vencidas" : "Overdue Invoices"}</p><p className="text-2xl font-bold">{data?.summary?.overdue_count || 0}</p></CardContent></Card>
      </div>

      {/* Aging Buckets */}
      <Card>
        <CardHeader><CardTitle>{isEs ? "Antigüedad de Cuentas" : "Aging Buckets"}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4 text-center">
            {[
              { key: "current", label: isEs ? "Al Día" : "Current", color: "text-green-600" },
              { key: "1_30", label: "1-30", color: "text-yellow-600" },
              { key: "31_60", label: "31-60", color: "text-orange-600" },
              { key: "61_90", label: "61-90", color: "text-red-500" },
              { key: "90_plus", label: "90+", color: "text-red-700" },
            ].map(({ key, label, color }) => (
              <div key={key}><p className="text-sm text-muted-foreground">{label}</p><p className={`text-xl font-bold ${color}`}>{formatCurrency(data?.aging_buckets?.[key])}</p></div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Cliente" : "Client"}</TableHead>
                <TableHead>{isEs ? "Factura" : "Invoice"}</TableHead>
                <TableHead>{isEs ? "Evento" : "Event"}</TableHead>
                <TableHead>{isEs ? "Vencimiento" : "Due Date"}</TableHead>
                <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                <TableHead className="text-right">{isEs ? "Días" : "Days"}</TableHead>
                <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.records || []).map((rec) => (
                <TableRow key={rec.invoice_id}>
                  <TableCell>{rec.client_name || "-"}</TableCell>
                  <TableCell className="font-medium">{rec.invoice_number}</TableCell>
                  <TableCell>{rec.event_name || "-"}</TableCell>
                  <TableCell>{rec.due_date ? new Date(rec.due_date).toLocaleDateString() : "-"}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(rec.balance_due)}</TableCell>
                  <TableCell className="text-right">
                    {rec.days_overdue > 0 ? <span className="text-red-600">{rec.days_overdue}</span> : <span className="text-green-600">0</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={rec.status === "overdue" ? "destructive" : "outline"}>
                      {rec.status === "overdue" ? (isEs ? "Vencida" : "Overdue") : (isEs ? "Al Día" : "Current")}
                    </Badge>
                  </TableCell>
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

  const fetchData = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/business-clarity/accounts-payable`, { withCredentials: true });
      setData(res.data);
    } catch (err) {
      toast.error(isEs ? "Error al cargar datos" : "Failed to load data");
    }
    setLoading(false);
  }, [isEs]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{isEs ? "Total Pendiente" : "Total Pending"}</p><p className="text-2xl font-bold text-orange-600">{formatCurrency(data?.summary?.total_pending)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{isEs ? "Total Pagado" : "Total Paid"}</p><p className="text-2xl font-bold text-green-600">{formatCurrency(data?.summary?.total_paid)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{isEs ? "Registros Pendientes" : "Pending Records"}</p><p className="text-2xl font-bold">{data?.summary?.pending_count || 0}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Proveedor" : "Supplier"}</TableHead>
                <TableHead>{isEs ? "Descripción" : "Description"}</TableHead>
                <TableHead>{isEs ? "Evento" : "Event"}</TableHead>
                <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                <TableHead className="text-right">{isEs ? "Monto" : "Amount"}</TableHead>
                <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.records || []).map((rec) => (
                <TableRow key={rec.payable_id}>
                  <TableCell>{rec.supplier_name || "-"}</TableCell>
                  <TableCell>{rec.description || "-"}</TableCell>
                  <TableCell>{rec.event_name || "-"}</TableCell>
                  <TableCell>{rec.date ? new Date(rec.date).toLocaleDateString() : "-"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(rec.amount)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(rec.balance_due)}</TableCell>
                  <TableCell><Badge variant={rec.status === "paid" ? "default" : "outline"}>{rec.status === "paid" ? (isEs ? "Pagado" : "Paid") : (isEs ? "Pendiente" : "Pending")}</Badge></TableCell>
                </TableRow>
              ))}
              {(data?.records || []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{isEs ? "No hay registros" : "No records"}</TableCell></TableRow>
              )}
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

  const loadReport = useCallback(async (reportType) => {
    setLoading(true);
    try {
      const endpoints = {
        snapshot: "/api/business-clarity/reports/financial-snapshot",
        clients: "/api/business-clarity/reports/client-revenue",
        suppliers: "/api/business-clarity/reports/supplier-spend",
        events: "/api/business-clarity/reports/event-profitability"
      };
      const res = await axios.get(`${API}${endpoints[reportType]}`, { withCredentials: true });
      setReportData(res.data);
    } catch (err) {
      toast.error(isEs ? "Error al cargar reporte" : "Failed to load report");
    }
    setLoading(false);
  }, [isEs]);

  useEffect(() => { loadReport(activeReport); }, [activeReport, loadReport]);

  const reports = [
    { key: "snapshot", label: isEs ? "Resumen Financiero" : "Financial Snapshot", icon: PieChart },
    { key: "clients", label: isEs ? "Ingresos por Cliente" : "Client Revenue", icon: Users },
    { key: "suppliers", label: isEs ? "Gastos por Proveedor" : "Supplier Spend", icon: Building2 },
    { key: "events", label: isEs ? "Rentabilidad por Evento" : "Event Profitability", icon: Calendar },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {reports.map(({ key, label, icon: Icon }) => (
          <Button key={key} variant={activeReport === key ? "default" : "outline"} size="sm" onClick={() => setActiveReport(key)} className="gap-2">
            <Icon className="w-4 h-4" />{label}
          </Button>
        ))}
      </div>

      {loading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground"><RefreshCw className="w-8 h-8 animate-spin mx-auto" /></CardContent></Card>
      ) : (
        <>
          {activeReport === "snapshot" && reportData && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{isEs ? "Total Facturado" : "Total Invoiced"}</p><p className="text-2xl font-bold">{formatCurrency(reportData.revenue?.total_invoiced)}</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{isEs ? "Total Cobrado" : "Total Collected"}</p><p className="text-2xl font-bold text-green-600">{formatCurrency(reportData.revenue?.total_collected)}</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{isEs ? "Total Gastos" : "Total Expenses"}</p><p className="text-2xl font-bold text-red-600">{formatCurrency(reportData.expenses?.total)}</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{isEs ? "Utilidad Bruta" : "Gross Profit"}</p><p className="text-2xl font-bold text-blue-600">{formatCurrency(reportData.profit?.gross)}</p><p className="text-xs text-muted-foreground">{reportData.profit?.margin}% margin</p></CardContent></Card>
              </div>
            </div>
          )}

          {activeReport === "clients" && reportData && (
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>{isEs ? "Cliente" : "Client"}</TableHead><TableHead className="text-right">{isEs ? "Facturado" : "Invoiced"}</TableHead><TableHead className="text-right">{isEs ? "Cobrado" : "Collected"}</TableHead><TableHead className="text-right">{isEs ? "Pendiente" : "Outstanding"}</TableHead><TableHead className="text-right">{isEs ? "Facturas" : "Invoices"}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(reportData.records || []).map((rec) => (
                    <TableRow key={rec.client_id}><TableCell className="font-medium">{rec.client_name}</TableCell><TableCell className="text-right">{formatCurrency(rec.total_invoiced)}</TableCell><TableCell className="text-right text-green-600">{formatCurrency(rec.total_paid)}</TableCell><TableCell className="text-right">{formatCurrency(rec.total_outstanding)}</TableCell><TableCell className="text-right">{rec.invoices_count}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}

          {activeReport === "suppliers" && reportData && (
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>{isEs ? "Proveedor" : "Supplier"}</TableHead><TableHead className="text-right">{isEs ? "Total Gasto" : "Total Spend"}</TableHead><TableHead className="text-right">{isEs ? "Pagado" : "Paid"}</TableHead><TableHead className="text-right">{isEs ? "Pendiente" : "Pending"}</TableHead><TableHead className="text-right">{isEs ? "Transacciones" : "Transactions"}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(reportData.records || []).map((rec, idx) => (
                    <TableRow key={idx}><TableCell className="font-medium">{rec.supplier_name}</TableCell><TableCell className="text-right">{formatCurrency(rec.total_amount)}</TableCell><TableCell className="text-right text-green-600">{formatCurrency(rec.paid_amount)}</TableCell><TableCell className="text-right text-orange-600">{formatCurrency(rec.pending_amount)}</TableCell><TableCell className="text-right">{rec.transactions_count}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}

          {activeReport === "events" && reportData && (
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>{isEs ? "Evento" : "Event"}</TableHead><TableHead>{isEs ? "Estado" : "Status"}</TableHead><TableHead className="text-right">{isEs ? "Ingresos" : "Revenue"}</TableHead><TableHead className="text-right">{isEs ? "Costos" : "Costs"}</TableHead><TableHead className="text-right">{isEs ? "Utilidad" : "Profit"}</TableHead><TableHead className="text-right">{isEs ? "Margen" : "Margin"}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(reportData.records || []).map((rec) => (
                    <TableRow key={rec.event_id}><TableCell className="font-medium">{rec.event_name}</TableCell><TableCell><Badge variant="outline">{rec.status}</Badge></TableCell><TableCell className="text-right">{formatCurrency(rec.revenue)}</TableCell><TableCell className="text-right text-red-600">{formatCurrency(rec.costs)}</TableCell><TableCell className={`text-right font-medium ${rec.profit >= 0 ? "text-green-600" : "text-red-600"}`}>{formatCurrency(rec.profit)}</TableCell><TableCell className="text-right">{rec.margin_percent}%</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}

// ==================== MAIN PAGE ====================
const NAV_ITEMS = [
  { path: "dashboard", icon: PieChart, labelKey: "dashboard", labelEs: "Panel" },
  { path: "invoices", icon: FileText, labelKey: "invoices", labelEs: "Facturas" },
  { path: "payments", icon: Banknote, labelKey: "payments", labelEs: "Pagos" },
  { path: "statements", icon: UserCircle, labelKey: "statements", labelEs: "Estados de Cuenta" },
  { path: "receivables", icon: TrendingUp, labelKey: "receivables", labelEs: "Por Cobrar" },
  { path: "payables", icon: TrendingDown, labelKey: "payables", labelEs: "Por Pagar" },
  { path: "reports", icon: FileBarChart, labelKey: "reports", labelEs: "Reportes" },
];

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
        {/* Sidebar Navigation */}
        <aside className="w-64 border-r bg-muted/30 p-4 flex flex-col">
          <div className="mb-6">
            <h1 className="font-heading text-xl font-bold flex items-center gap-2">
              <Landmark className="w-6 h-6 text-primary" />
              Business Clarity
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {isEs ? "Claridad para decidir" : "Clarity for decisions"}
            </p>
          </div>
          
          <nav className="space-y-1 flex-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={`/business-clarity/${item.path}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`
                }
              >
                <item.icon className="w-4 h-4" />
                {isEs ? item.labelEs : item.labelKey.charAt(0).toUpperCase() + item.labelKey.slice(1)}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-auto">
          <Routes>
            <Route path="/" element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardSection />} />
            <Route path="invoices" element={<InvoicesSection />} />
            <Route path="payments" element={<PaymentsSection />} />
            <Route path="statements" element={<AccountStatementsSection />} />
            <Route path="receivables" element={<AccountsReceivableSection />} />
            <Route path="payables" element={<AccountsPayableSection />} />
            <Route path="reports" element={<ReportsSection />} />
          </Routes>
        </main>
      </div>
    </Layout>
  );
}
