import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Plus, RefreshCw } from "lucide-react";

import { API_BASE as API } from "../../utils/api";
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PaymentsSection() {
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
