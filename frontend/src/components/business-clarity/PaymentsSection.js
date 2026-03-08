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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Plus, RefreshCw, Calendar, FileText, ShoppingCart } from "lucide-react";

import { API_BASE as API } from "../../utils/api";
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PaymentsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [payments, setPayments] = useState([]);
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [applyTab, setApplyTab] = useState("invoices");
  const [paymentForm, setPaymentForm] = useState({ 
    client_id: "", 
    amount: 0, 
    payment_method: "transfer", 
    payment_date: new Date().toISOString().split('T')[0],
    reference: "", 
    notes: "" 
  });
  const [applicationAmounts, setApplicationAmounts] = useState({});
  const [orderApplicationAmounts, setOrderApplicationAmounts] = useState({});

  const fetchData = useCallback(async () => {
    try {
      const [payRes, clientRes, invRes, ordersRes] = await Promise.all([
        axios.get(`${API}/api/business-clarity/payments`, { withCredentials: true }),
        axios.get(`${API}/api/crm/clients`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/invoices`, { withCredentials: true }),
        axios.get(`${API}/api/events`, { withCredentials: true }).catch(() => ({ data: [] })),
      ]);
      setPayments(payRes.data);
      setClients(clientRes.data);
      // Filter invoices that have balance due
      setInvoices(invRes.data.filter(i => (i.balance_due || 0) > 0 || i.status !== "paid"));
      // Get orders/events that might need deposits
      const eventsData = Array.isArray(ordersRes.data) ? ordersRes.data : ordersRes.data?.events || [];
      setOrders(eventsData.filter(e => e.status !== "cancelled"));
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreatePayment = async () => {
    if (!paymentForm.client_id || paymentForm.amount <= 0) return toast.error(isEs ? "Complete los campos requeridos" : "Fill required fields");
    try {
      await axios.post(`${API}/api/business-clarity/payments`, paymentForm, { withCredentials: true });
      toast.success(isEs ? "Pago registrado exitosamente" : "Payment recorded successfully");
      setPaymentDialogOpen(false);
      setPaymentForm({ 
        client_id: "", 
        amount: 0, 
        payment_method: "transfer", 
        payment_date: new Date().toISOString().split('T')[0],
        reference: "", 
        notes: "" 
      });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleApplyPayment = async () => {
    if (!selectedPayment) return;
    
    // Combine invoice and order applications
    const invoiceApplications = Object.entries(applicationAmounts)
      .filter(([_, amt]) => parseFloat(amt) > 0)
      .map(([invoice_id, amount_applied]) => ({ 
        invoice_id, 
        amount_applied: parseFloat(amount_applied),
        type: "invoice"
      }));
    
    const orderApplications = Object.entries(orderApplicationAmounts)
      .filter(([_, amt]) => parseFloat(amt) > 0)
      .map(([event_id, amount_applied]) => ({ 
        event_id, 
        amount_applied: parseFloat(amount_applied),
        type: "deposit"
      }));
    
    const allApplications = [...invoiceApplications, ...orderApplications];
    
    if (allApplications.length === 0) return toast.error(isEs ? "Ingrese al menos un monto a aplicar" : "Enter at least one amount to apply");
    
    // Validate total doesn't exceed available
    const totalToApply = allApplications.reduce((sum, app) => sum + app.amount_applied, 0);
    if (totalToApply > (selectedPayment.unapplied_amount || 0)) {
      return toast.error(isEs ? "El monto total excede el disponible" : "Total amount exceeds available");
    }
    
    try {
      // Apply to invoices
      if (invoiceApplications.length > 0) {
        await axios.post(
          `${API}/api/business-clarity/payments/${selectedPayment.payment_id}/apply`, 
          { payment_id: selectedPayment.payment_id, applications: invoiceApplications }, 
          { withCredentials: true }
        );
      }
      
      // Apply to orders/events as deposits
      for (const orderApp of orderApplications) {
        await axios.post(
          `${API}/api/events/${orderApp.event_id}/deposit`,
          { 
            amount: orderApp.amount_applied, 
            payment_id: selectedPayment.payment_id,
            payment_method: selectedPayment.payment_method,
            reference: selectedPayment.reference
          },
          { withCredentials: true }
        ).catch(err => {
          console.error("Deposit error:", err);
          // If deposit endpoint doesn't exist, try updating payment application
        });
      }
      
      toast.success(isEs ? "Pago aplicado exitosamente" : "Payment applied successfully");
      setApplyDialogOpen(false);
      setSelectedPayment(null);
      setApplicationAmounts({});
      setOrderApplicationAmounts({});
      fetchData();
    } catch (err) { 
      toast.error(err.response?.data?.detail || (isEs ? "Error aplicando pago" : "Error applying payment")); 
    }
  };

  // Get invoices for the selected payment's client
  const getClientInvoices = () => {
    if (!selectedPayment) return [];
    // Try to match by client_id first, then by client name
    return invoices.filter(inv => {
      if (selectedPayment.client_id && inv.client_id === selectedPayment.client_id) return true;
      if (selectedPayment.client_name && inv.client_name === selectedPayment.client_name) return true;
      return false;
    });
  };

  // Get orders/events for the selected payment's client
  const getClientOrders = () => {
    if (!selectedPayment) return [];
    return orders.filter(ord => {
      if (selectedPayment.client_id && ord.client_id === selectedPayment.client_id) return true;
      if (selectedPayment.client_name && (ord.client?.name === selectedPayment.client_name || ord.client_name === selectedPayment.client_name)) return true;
      return false;
    });
  };

  const clientInvoices = getClientInvoices();
  const clientOrders = getClientOrders();

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{isEs ? "Pagos Recibidos" : "Received Payments"}</h2>
        <Button size="sm" onClick={() => setPaymentDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          {isEs ? "Registrar Pago" : "Record Payment"}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
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
              {payments.map(pay => (
                <TableRow key={pay.payment_id} className={pay.unapplied_amount > 0 ? "bg-amber-50" : ""}>
                  <TableCell>{new Date(pay.payment_date).toLocaleDateString()}</TableCell>
                  <TableCell>{pay.client_name || "-"}</TableCell>
                  <TableCell><Badge variant="outline">{pay.payment_method}</Badge></TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(pay.amount)}</TableCell>
                  <TableCell className="text-right text-green-600">{formatCurrency(pay.applied_amount)}</TableCell>
                  <TableCell className="text-right text-amber-600 font-medium">{formatCurrency(pay.unapplied_amount)}</TableCell>
                  <TableCell className="max-w-48 truncate text-sm text-muted-foreground">{pay.reference}</TableCell>
                  <TableCell>
                    {pay.unapplied_amount > 0 && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => { 
                          setSelectedPayment(pay); 
                          setApplicationAmounts({}); 
                          setOrderApplicationAmounts({});
                          setApplyTab("invoices");
                          setApplyDialogOpen(true); 
                        }}
                      >
                        {isEs ? "Aplicar" : "Apply"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {payments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay pagos registrados" : "No payments recorded"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEs ? "Registrar Pago de Cliente" : "Record Client Payment"}</DialogTitle>
            <DialogDescription>
              {isEs ? "Registre un pago recibido. Puede usar fechas pasadas." : "Record a received payment. Past dates are allowed."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Cliente" : "Client"} *</Label>
              <Select value={paymentForm.client_id} onValueChange={(v) => setPaymentForm({ ...paymentForm, client_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar cliente" : "Select client"} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.client_id} value={c.client_id}>{c.display_name || c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Monto" : "Amount"} *</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  value={paymentForm.amount || ""} 
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })} 
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {isEs ? "Fecha del Pago" : "Payment Date"} *
                </Label>
                <Input 
                  type="date" 
                  value={paymentForm.payment_date} 
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} 
                />
              </div>
            </div>
            
            <div>
              <Label>{isEs ? "Método de Pago" : "Payment Method"}</Label>
              <Select value={paymentForm.payment_method} onValueChange={(v) => setPaymentForm({ ...paymentForm, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{isEs ? "Efectivo" : "Cash"}</SelectItem>
                  <SelectItem value="transfer">{isEs ? "Transferencia Bancaria" : "Bank Transfer"}</SelectItem>
                  <SelectItem value="bank_transfer">{isEs ? "Transferencia" : "Transfer"}</SelectItem>
                  <SelectItem value="card">{isEs ? "Tarjeta de Crédito/Débito" : "Credit/Debit Card"}</SelectItem>
                  <SelectItem value="check">{isEs ? "Cheque" : "Check"}</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                  <SelectItem value="zelle">Zelle</SelectItem>
                  <SelectItem value="other">{isEs ? "Otro" : "Other"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>{isEs ? "Referencia / No. Transacción" : "Reference / Transaction No."}</Label>
              <Input 
                value={paymentForm.reference} 
                onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} 
                placeholder={isEs ? "Ej: Transferencia #12345" : "E.g: Transfer #12345"}
              />
            </div>
            
            <div>
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Input 
                value={paymentForm.notes || ""} 
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} 
                placeholder={isEs ? "Notas adicionales..." : "Additional notes..."}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreatePayment}>
              {isEs ? "Guardar Pago" : "Save Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Payment Dialog */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{isEs ? "Aplicar Pago" : "Apply Payment"}</DialogTitle>
            <DialogDescription>
              {isEs ? "Disponible para aplicar" : "Available to apply"}: <span className="font-bold text-green-600">{formatCurrency(selectedPayment?.unapplied_amount)}</span>
              {selectedPayment?.client_name && <span className="ml-2">• {selectedPayment.client_name}</span>}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs value={applyTab} onValueChange={setApplyTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="invoices" className="gap-2">
                <FileText className="w-4 h-4" />
                {isEs ? "Facturas" : "Invoices"}
                {clientInvoices.length > 0 && <Badge variant="secondary" className="ml-1">{clientInvoices.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="orders" className="gap-2">
                <ShoppingCart className="w-4 h-4" />
                {isEs ? "Pedidos / Depósitos" : "Orders / Deposits"}
                {clientOrders.length > 0 && <Badge variant="secondary" className="ml-1">{clientOrders.length}</Badge>}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="invoices" className="mt-4">
              <div className="max-h-72 overflow-y-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isEs ? "Factura" : "Invoice"}</TableHead>
                      <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                      <TableHead>{isEs ? "Vence" : "Due"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Total" : "Total"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                      <TableHead className="text-right w-32">{isEs ? "Aplicar" : "Apply"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientInvoices.map(inv => (
                      <TableRow key={inv.invoice_id}>
                        <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {inv.issue_date ? new Date(inv.issue_date).toLocaleDateString() : "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "-"}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(inv.total || inv.total_amount)}</TableCell>
                        <TableCell className="text-right font-medium text-amber-600">{formatCurrency(inv.balance_due)}</TableCell>
                        <TableCell className="text-right">
                          <Input 
                            type="number" 
                            step="0.01" 
                            className="w-28 text-right" 
                            value={applicationAmounts[inv.invoice_id] || ""} 
                            onChange={(e) => setApplicationAmounts({ ...applicationAmounts, [inv.invoice_id]: e.target.value })}
                            max={Math.min(inv.balance_due || 0, selectedPayment?.unapplied_amount || 0)}
                            placeholder="0.00"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {clientInvoices.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          {isEs ? "No hay facturas pendientes para este cliente" : "No pending invoices for this client"}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            
            <TabsContent value="orders" className="mt-4">
              <div className="max-h-72 overflow-y-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isEs ? "Pedido / Evento" : "Order / Event"}</TableHead>
                      <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                      <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Total" : "Total"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Depósito Pendiente" : "Pending Deposit"}</TableHead>
                      <TableHead className="text-right w-32">{isEs ? "Aplicar" : "Apply"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientOrders.map(ord => {
                      const totalValue = ord.total_value || ord.budget || 0;
                      const paidDeposit = ord.deposit_paid || ord.paid_amount || 0;
                      const pendingDeposit = totalValue - paidDeposit;
                      
                      return (
                        <TableRow key={ord.event_id}>
                          <TableCell className="font-medium">{ord.name || ord.event_name || `#${ord.event_id?.slice(-6)}`}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {ord.date ? new Date(ord.date).toLocaleDateString() : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={ord.status === "confirmed" ? "default" : "outline"}>
                              {ord.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(totalValue)}</TableCell>
                          <TableCell className="text-right font-medium text-amber-600">{formatCurrency(pendingDeposit > 0 ? pendingDeposit : 0)}</TableCell>
                          <TableCell className="text-right">
                            <Input 
                              type="number" 
                              step="0.01" 
                              className="w-28 text-right" 
                              value={orderApplicationAmounts[ord.event_id] || ""} 
                              onChange={(e) => setOrderApplicationAmounts({ ...orderApplicationAmounts, [ord.event_id]: e.target.value })}
                              placeholder="0.00"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {clientOrders.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          {isEs ? "No hay pedidos/eventos para este cliente" : "No orders/events for this client"}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>

          {/* Summary of what will be applied */}
          {(Object.values(applicationAmounts).some(v => parseFloat(v) > 0) || Object.values(orderApplicationAmounts).some(v => parseFloat(v) > 0)) && (
            <div className="bg-slate-50 rounded-lg p-3 mt-2">
              <p className="text-sm font-medium">{isEs ? "Resumen:" : "Summary:"}</p>
              <div className="flex justify-between text-sm mt-1">
                <span>{isEs ? "Total a aplicar:" : "Total to apply:"}</span>
                <span className="font-bold">
                  {formatCurrency(
                    Object.values(applicationAmounts).reduce((sum, v) => sum + (parseFloat(v) || 0), 0) +
                    Object.values(orderApplicationAmounts).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
                  )}
                </span>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleApplyPayment}>
              {isEs ? "Aplicar Pago" : "Apply Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
