import { useState, useEffect, useCallback } from "react";
import { API } from "../utils/api";
import axios from "axios";
import { useLanguage } from "../contexts/LanguageContext";
import { useTerminology } from "../hooks/useTerminology";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
import { Plus, CreditCard, RefreshCw, DollarSign, CheckCircle, AlertTriangle, Banknote, ExternalLink } from "lucide-react";
import { formatDateOnly } from "../utils/dates";
import { fmtNum } from "../utils/format";


const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function EventPayments({ eventId, event, client }) {
  const { language } = useLanguage();
  const { term } = useTerminology();
  const isEs = language === "es";
  
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  
  const [paymentForm, setPaymentForm] = useState({
    amount: 0, payment_method: "transfer", reference: "", notes: ""
  });
  const [applicationAmounts, setApplicationAmounts] = useState({});

  const fetchData = useCallback(async () => {
    if (!event?.client_id) {
      setLoading(false);
      return;
    }
    try {
      const [invRes, payRes] = await Promise.all([
        axios.get(`${API}/business-clarity/invoices?event_id=${eventId}`, { withCredentials: true }),
        axios.get(`${API}/business-clarity/payments?client_id=${event.client_id}`, { withCredentials: true }),
      ]);
      setInvoices(invRes.data);
      setPayments(payRes.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [eventId, event?.client_id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Calculate totals
  const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0);
  const totalBalance = invoices.reduce((sum, inv) => sum + (inv.balance_due || 0), 0);

  // Create Payment
  const handleCreatePayment = async () => {
    if (paymentForm.amount <= 0) {
      toast.error(isEs ? "Ingrese un monto válido" : "Enter a valid amount");
      return;
    }
    try {
      const data = {
        client_id: event.client_id,
        amount: paymentForm.amount,
        payment_method: paymentForm.payment_method,
        reference: paymentForm.reference,
        notes: paymentForm.notes || `${isEs ? `Pago para ${term("events", "entity_singular").toLowerCase()}` : `Payment for ${term("events", "entity_singular").toLowerCase()}`}: ${event.name}`
      };
      const res = await axios.post(`${API}/business-clarity/payments`, data, { withCredentials: true });
      toast.success(isEs ? "Pago registrado" : "Payment recorded");
      setPaymentDialogOpen(false);
      setPaymentForm({ amount: 0, payment_method: "transfer", reference: "", notes: "" });
      
      // Auto-apply to event invoices if there are any
      if (invoices.filter(i => i.status !== "paid").length > 0) {
        setSelectedPayment({ ...res.data, unapplied_amount: res.data.amount });
        setApplyDialogOpen(true);
      } else {
        fetchData();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al crear pago" : "Failed to create payment"));
    }
  };

  // Apply Payment
  const handleApplyPayment = async () => {
    if (!selectedPayment) return;
    const applications = Object.entries(applicationAmounts)
      .filter(([_, amt]) => parseFloat(amt) > 0)
      .map(([invoice_id, amount_applied]) => ({ invoice_id, amount_applied: parseFloat(amount_applied) }));
    
    if (applications.length === 0) {
      toast.error(isEs ? "Ingrese montos a aplicar" : "Enter amounts to apply");
      return;
    }
    
    try {
      await axios.post(`${API}/business-clarity/payments/${selectedPayment.payment_id}/apply`, 
        { payment_id: selectedPayment.payment_id, applications }, 
        { withCredentials: true }
      );
      toast.success(isEs ? "Pago aplicado exitosamente" : "Payment applied successfully");
      setApplyDialogOpen(false);
      setSelectedPayment(null);
      setApplicationAmounts({});
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al aplicar pago" : "Failed to apply payment"));
    }
  };

  // Pay with Stripe
  const handlePayWithStripe = async () => {
    const unpaidInvoices = invoices.filter(i => i.status !== "paid").map(i => i.invoice_id);
    if (unpaidInvoices.length === 0) {
      toast.error(isEs ? "No hay facturas pendientes" : "No pending invoices");
      return;
    }
    try {
      const res = await axios.post(`${API}/business-clarity/checkout/session`, {
        invoice_ids: unpaidInvoices,
        origin_url: window.location.origin
      }, { withCredentials: true });
      if (res.data.url) window.location.href = res.data.url;
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al crear sesión de pago" : "Failed to create payment session"));
    }
  };

  // Open apply dialog for existing payment - Auto-fill amounts
  const openApplyDialog = (payment) => {
    setSelectedPayment(payment);
    
    // Auto-fill: Apply available amount to unpaid invoices proportionally
    const available = payment.unapplied_amount || payment.amount || 0;
    const unpaidInvoices = invoices.filter(i => i.status !== "paid" && (i.balance_due || 0) > 0);
    
    const autoAmounts = {};
    let remaining = available;
    
    for (const inv of unpaidInvoices) {
      if (remaining <= 0) break;
      const toApply = Math.min(remaining, inv.balance_due || 0);
      if (toApply > 0) {
        autoAmounts[inv.invoice_id] = fmtNum(toApply);
        remaining -= toApply;
      }
    }
    
    setApplicationAmounts(autoAmounts);
    setApplyDialogOpen(true);
  };

  const getStatusBadge = (status) => {
    const styles = { open: "bg-blue-100 text-blue-700", partially_paid: "bg-yellow-100 text-yellow-700", paid: "bg-green-100 text-green-700" };
    const labels = { open: isEs ? "Pendiente" : "Open", partially_paid: isEs ? "Parcial" : "Partial", paid: isEs ? "Pagado" : "Paid" };
    return <Badge className={styles[status] || styles.open}>{labels[status] || status}</Badge>;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-48"><RefreshCw className="w-6 h-6 animate-spin" /></div>;
  }

  if (!event?.client_id) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
          {isEs ? `Este ${term("events", "entity_singular").toLowerCase()} no tiene cliente asignado. Asigne un cliente para gestionar pagos.` : `This ${term("events", "entity_singular").toLowerCase()} has no client assigned. Assign a client to manage payments.`}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Total Facturado" : "Total Invoiced"}</p>
                <p className="text-2xl font-bold">{formatCurrency(totalInvoiced)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Total Cobrado" : "Total Collected"}</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Saldo Pendiente" : "Balance Due"}</p>
                <p className={`text-2xl font-bold ${totalBalance > 0 ? "text-red-600" : "text-green-600"}`}>
                  {formatCurrency(totalBalance)}
                </p>
              </div>
              {totalBalance > 0 ? <AlertTriangle className="w-8 h-8 text-red-500" /> : <CheckCircle className="w-8 h-8 text-green-500" />}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "% Cobrado" : "% Collected"}</p>
                <p className="text-2xl font-bold">
                  {totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0}%
                </p>
              </div>
              <Banknote className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button onClick={() => setPaymentDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          {isEs ? "Registrar Pago" : "Record Payment"}
        </Button>
        {totalBalance > 0 && (
          <Button variant="outline" onClick={handlePayWithStripe} className="gap-2">
            <CreditCard className="w-4 h-4" />
            {isEs ? "Pagar con Tarjeta" : "Pay with Card"}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={fetchData}>
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => window.open("/business-clarity/invoices", "_blank")} className="gap-2 ml-auto">
          <ExternalLink className="w-4 h-4" />
          Business Clarity
        </Button>
      </div>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isEs ? `Facturas del ${term("events", "entity_singular")}` : `${term("events", "entity_singular")} Invoices`}</CardTitle>
          <CardDescription>
            {invoices.length === 0 
              ? (isEs ? "No hay facturas. Cree una desde el tab 'Generate'." : "No invoices. Create one from the 'Generate' tab.")
              : `${invoices.length} ${isEs ? "factura(s)" : "invoice(s)"}`
            }
          </CardDescription>
        </CardHeader>
        {invoices.length > 0 && (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Factura #" : "Invoice #"}</TableHead>
                  <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                  <TableHead>{isEs ? "Vencimiento" : "Due"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Total" : "Total"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Pagado" : "Paid"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                  <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.invoice_id}>
                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>{formatDateOnly(inv.issue_date, language)}</TableCell>
                    <TableCell>{formatDateOnly(inv.due_date, language)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(inv.total)}</TableCell>
                    <TableCell className="text-right text-green-600">{formatCurrency(inv.paid_amount)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(inv.balance_due)}</TableCell>
                    <TableCell>{getStatusBadge(inv.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      {/* Payments Table */}
      {payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isEs ? "Pagos del Cliente" : "Client Payments"}</CardTitle>
            <CardDescription>{isEs ? "Pagos recibidos de" : "Payments received from"} {client?.display_name || event?.client_id}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
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
                    <TableCell>{formatDateOnly(pay.payment_date, language)}</TableCell>
                    <TableCell><Badge variant="outline">{pay.payment_method}</Badge></TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(pay.amount)}</TableCell>
                    <TableCell className="text-right text-green-600">{formatCurrency(pay.applied_amount)}</TableCell>
                    <TableCell className="text-right text-blue-600">{formatCurrency(pay.unapplied_amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{pay.reference || "-"}</TableCell>
                    <TableCell>
                      {pay.unapplied_amount > 0 && invoices.filter(i => i.status !== "paid").length > 0 && (
                        <Button variant="outline" size="sm" onClick={() => openApplyDialog(pay)}>
                          {isEs ? "Aplicar" : "Apply"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Registrar Pago" : "Record Payment"}</DialogTitle>
            <DialogDescription>
              {isEs ? "Cliente" : "Client"}: {client?.display_name || event?.client_id}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Monto" : "Amount"} *</Label>
              <Input 
                type="number" 
                step="0.01" 
                value={paymentForm.amount || ""} 
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })}
                placeholder={totalBalance > 0 ? formatCurrency(totalBalance) : "0.00"}
              />
              {totalBalance > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {isEs ? "Saldo pendiente" : "Balance due"}: {formatCurrency(totalBalance)}
                </p>
              )}
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
              <Label>{isEs ? "Referencia / No. Transacción" : "Reference / Transaction #"}</Label>
              <Input value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
            </div>
            <div>
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Textarea value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleCreatePayment}>{isEs ? "Registrar Pago" : "Record Payment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Payment Dialog */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEs ? "Aplicar Pago a Facturas" : "Apply Payment to Invoices"}</DialogTitle>
            <DialogDescription className="flex items-center justify-between">
              <span>
                {isEs ? "Disponible para aplicar" : "Available to apply"}: <strong className="text-green-600">{formatCurrency(selectedPayment?.unapplied_amount)}</strong>
              </span>
              <span className="text-sm">
                {isEs ? "Total a aplicar" : "Total to apply"}: <strong className={Object.values(applicationAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0) > 0 ? "text-primary" : "text-muted-foreground"}>
                  {formatCurrency(Object.values(applicationAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0))}
                </strong>
              </span>
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
                {invoices.filter(i => i.status !== "paid").map(inv => (
                  <TableRow key={inv.invoice_id}>
                    <TableCell>{inv.invoice_number}</TableCell>
                    <TableCell>{formatDateOnly(inv.due_date, language)}</TableCell>
                    <TableCell className="text-right font-medium text-red-600">{formatCurrency(inv.balance_due)}</TableCell>
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
