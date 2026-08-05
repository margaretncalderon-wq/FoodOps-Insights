import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTerminology } from "../../hooks/useTerminology";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Plus, RefreshCw, Calendar, FileText, ShoppingCart, Receipt, CreditCard, Check, ChevronsUpDown } from "lucide-react";
import { PaymentReceiptModal } from "./PaymentReceiptModal";

import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";
import { KoraLoader } from "../KoraLoader";
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PaymentsSection() {
  const { language } = useLanguage();
  const { term } = useTerminology();
  const isEs = language === "es";
  
  // Data states
  const [payments, setPayments] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  
  // New payment flow states
  const [step, setStep] = useState(1); // 1: Select client, 2: Select items, 3: Payment details
  const [selectedClient, setSelectedClient] = useState("");
  const [clientInvoices, setClientInvoices] = useState([]);
  const [clientOrders, setClientOrders] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]); // {type: 'invoice'|'order', id: string, amount: number, balance: number}
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    payment_method: "transfer",
    payment_date: new Date().toISOString().split('T')[0],
    reference: "",
    notes: ""
  });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("invoices");

  const fetchPayments = useCallback(async () => {
    try {
      const [payRes, clientRes] = await Promise.all([
        axios.get(`${API}/api/business-clarity/payments`, { withCredentials: true }),
        axios.get(`${API}/api/crm/clients`, { withCredentials: true }),
      ]);
      setPayments(payRes.data);
      setClients(clientRes.data);
    } catch (err) { 
      console.error(err); 
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  // Fetch client's pending invoices and orders when client is selected
  const fetchClientItems = async (clientId) => {
    if (!clientId) {
      setClientInvoices([]);
      setClientOrders([]);
      return;
    }
    
    try {
      const [invRes, ordersRes] = await Promise.all([
        axios.get(`${API}/api/business-clarity/invoices?client_id=${clientId}`, { withCredentials: true }),
        axios.get(`${API}/api/events?client_id=${clientId}`, { withCredentials: true }).catch(() => ({ data: [] }))
      ]);
      
      // Filter invoices with pending balance
      const pendingInvoices = (invRes.data || []).filter(inv => 
        (inv.balance_due || inv.total || 0) > 0 && inv.status !== "paid"
      );
      setClientInvoices(pendingInvoices);
      
      // Filter orders/events that might need deposits
      const eventsData = Array.isArray(ordersRes.data) ? ordersRes.data : ordersRes.data?.events || [];
      const pendingOrders = eventsData.filter(e => 
        e.status !== "cancelled" && (e.total_value || e.budget || 0) > (e.deposit_paid || 0)
      );
      setClientOrders(pendingOrders);
      
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error cargando datos del cliente" : "Error loading client data");
    }
  };

  const handleClientChange = async (clientId) => {
    if (!clientId) return;
    
    setSelectedClient(clientId);
    setSelectedItems([]);
    
    // Fetch client data first, then advance to step 2
    await fetchClientItems(clientId);
    setStep(2);
  };

  const handleToggleItem = (type, item) => {
    const itemId = type === 'invoice' ? item.invoice_id : item.event_id;
    const balance = type === 'invoice' 
      ? (item.balance_due || item.total || 0)
      : ((item.total_value || item.budget || 0) - (item.deposit_paid || 0));
    
    setSelectedItems(prev => {
      const exists = prev.find(i => i.id === itemId && i.type === type);
      if (exists) {
        return prev.filter(i => !(i.id === itemId && i.type === type));
      } else {
        return [...prev, { type, id: itemId, item, balance, amount: balance }];
      }
    });
  };

  const handleAmountChange = (itemId, type, newAmount) => {
    setSelectedItems(prev => prev.map(i => 
      i.id === itemId && i.type === type 
        ? { ...i, amount: Math.min(parseFloat(newAmount) || 0, i.balance) }
        : i
    ));
  };

  const totalToPay = selectedItems.reduce((sum, item) => sum + (item.amount || 0), 0);

  const handleCreatePayment = async () => {
    if (selectedItems.length === 0) {
      return toast.error(isEs ? "Seleccione al menos una factura o pedido" : "Select at least one invoice or order");
    }
    
    if (totalToPay <= 0) {
      return toast.error(isEs ? "El monto debe ser mayor a 0" : "Amount must be greater than 0");
    }
    
    setSaving(true);
    try {
      // Create payment with applications in one request
      const response = await axios.post(`${API}/api/business-clarity/payments/with-receipt`, {
        client_id: selectedClient,
        amount: totalToPay,
        payment_method: paymentForm.payment_method,
        payment_date: paymentForm.payment_date,
        reference: paymentForm.reference,
        notes: paymentForm.notes,
        applications: selectedItems.map(item => ({
          type: item.type,
          id: item.id,
          amount: item.amount
        }))
      }, { withCredentials: true });
      
      toast.success(isEs ? "Pago registrado y recibo generado" : "Payment recorded and receipt generated");
      
      // Show the receipt
      if (response.data?.payment) {
        setSelectedPayment(response.data.payment);
        setReceiptModalOpen(true);
      }
      
      // Reset form
      setPaymentDialogOpen(false);
      resetForm();
      fetchPayments();
      
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al registrar pago" : "Error recording payment"));
    }
    setSaving(false);
  };

  const resetForm = () => {
    setStep(1);
    setSelectedClient("");
    setSelectedItems([]);
    setClientInvoices([]);
    setClientOrders([]);
    setPaymentForm({
      amount: 0,
      payment_method: "transfer",
      payment_date: new Date().toISOString().split('T')[0],
      reference: "",
      notes: ""
    });
    setActiveTab("invoices");
  };

  const openPaymentDialog = () => {
    resetForm();
    setPaymentDialogOpen(true);
  };

  const getPaymentMethodLabel = (method) => {
    const methods = {
      cash: isEs ? "Efectivo" : "Cash",
      transfer: isEs ? "Transferencia" : "Transfer",
      bank_transfer: isEs ? "Transferencia Bancaria" : "Bank Transfer",
      card: isEs ? "Tarjeta" : "Card",
      check: isEs ? "Cheque" : "Check",
      paypal: "PayPal",
      zelle: "Zelle",
      other: isEs ? "Otro" : "Other"
    };
    return methods[method] || method;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><KoraLoader size={48} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{isEs ? "Pagos y Recibos" : "Payments & Receipts"}</h2>
        <Button size="sm" onClick={openPaymentDialog} className="gap-2 bg-green-600 hover:bg-green-700">
          <CreditCard className="w-4 h-4" />
          {isEs ? "Registrar Pago" : "Record Payment"}
        </Button>
      </div>

      {/* Payments List */}
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Recibo" : "Receipt"}</TableHead>
                <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                <TableHead>{isEs ? "Cliente" : "Client"}</TableHead>
                <TableHead>{isEs ? "Método" : "Method"}</TableHead>
                <TableHead className="text-right">{isEs ? "Monto" : "Amount"}</TableHead>
                <TableHead>{isEs ? "Aplicado a" : "Applied to"}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map(pay => (
                <TableRow key={pay.payment_id}>
                  <TableCell className="font-mono text-sm">{pay.receipt_number || pay.payment_id?.slice(-8)}</TableCell>
                  <TableCell>{formatDateOnly(pay.payment_date, language)}</TableCell>
                  <TableCell>{pay.client_name || "-"}</TableCell>
                  <TableCell><Badge variant="outline">{getPaymentMethodLabel(pay.payment_method)}</Badge></TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(pay.amount)}</TableCell>
                  <TableCell>
                    {pay.applied_amount > 0 ? (
                      <Badge variant="default" className="bg-green-600">
                        {formatCurrency(pay.applied_amount)} {isEs ? "aplicado" : "applied"}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{isEs ? "Sin aplicar" : "Not applied"}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      title={isEs ? "Ver Recibo" : "View Receipt"}
                      onClick={() => { 
                        setSelectedPayment(pay); 
                        setReceiptModalOpen(true); 
                      }}
                    >
                      <Receipt className="w-4 h-4 text-blue-600" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {payments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay pagos registrados" : "No payments recorded"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Record Payment Dialog - Step by Step */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              {isEs ? "Registrar Pago" : "Record Payment"}
            </DialogTitle>
            <DialogDescription>
              {step === 1 && (isEs ? "Paso 1: Seleccione el cliente" : "Step 1: Select the client")}
              {step === 2 && (isEs ? "Paso 2: Seleccione facturas o pedidos a pagar" : "Step 2: Select invoices or orders to pay")}
              {step === 3 && (isEs ? "Paso 3: Complete los datos del pago" : "Step 3: Complete payment details")}
            </DialogDescription>
          </DialogHeader>

          {/* Step 1: Select Client */}
          {step === 1 && (
            <div className="space-y-4 py-4">
              <div>
                <Label>{isEs ? "Cliente" : "Client"} *</Label>
                <Popover open={clientPickerOpen} onOpenChange={setClientPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={clientPickerOpen}
                      className="mt-1 w-full justify-between font-normal"
                      data-testid="payment-client-picker"
                    >
                      <span className="truncate">
                        {selectedClient
                          ? (clients.find(c => c.client_id === selectedClient)?.display_name || (isEs ? "Cliente seleccionado" : "Selected client"))
                          : (isEs ? "Buscar cliente…" : "Search client…")}
                      </span>
                      <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[420px] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder={isEs ? "Escribir para buscar…" : "Type to search…"}
                        data-testid="payment-client-search-input"
                      />
                      <CommandList>
                        <CommandEmpty>{isEs ? "Sin resultados" : "No results"}</CommandEmpty>
                        <CommandGroup>
                          {clients.map(c => (
                            <CommandItem
                              key={c.client_id}
                              value={`${c.display_name || ""} ${c.company_name || ""} ${c.email || ""} ${c.rnc || ""}`}
                              onSelect={() => { handleClientChange(c.client_id); setClientPickerOpen(false); }}
                              data-testid={`payment-client-option-${c.client_id}`}
                            >
                              <Check className={`mr-2 h-4 w-4 ${selectedClient === c.client_id ? "opacity-100" : "opacity-0"}`} />
                              <div className="flex flex-col min-w-0">
                                <span className="truncate">{c.display_name || c.company_name || c.name}</span>
                                {(c.company_name && c.display_name !== c.company_name) && (
                                  <span className="text-[11px] text-muted-foreground truncate">{c.company_name}</span>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* Step 2: Select Items to Pay */}
          {step === 2 && (
            <div className="space-y-4 py-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="invoices" className="gap-2">
                    <FileText className="w-4 h-4" />
                    {isEs ? "Facturas" : "Invoices"}
                    {clientInvoices.length > 0 && <Badge variant="secondary">{clientInvoices.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="orders" className="gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    {isEs ? "Pedidos / Depósitos" : "Orders / Deposits"}
                    {clientOrders.length > 0 && <Badge variant="secondary">{clientOrders.length}</Badge>}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="invoices" className="mt-4">
                  {clientInvoices.length > 0 ? (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10"></TableHead>
                            <TableHead>{isEs ? "Factura" : "Invoice"}</TableHead>
                            <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                            <TableHead className="text-right">{isEs ? "Total" : "Total"}</TableHead>
                            <TableHead className="text-right">{isEs ? "Pendiente" : "Pending"}</TableHead>
                            <TableHead className="text-right w-32">{isEs ? "A Pagar" : "To Pay"}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {clientInvoices.map(inv => {
                            const isSelected = selectedItems.some(i => i.id === inv.invoice_id && i.type === 'invoice');
                            const selectedItem = selectedItems.find(i => i.id === inv.invoice_id && i.type === 'invoice');
                            const balance = inv.balance_due || inv.total || 0;
                            
                            return (
                              <TableRow key={inv.invoice_id} className={isSelected ? "bg-green-50" : ""}>
                                <TableCell>
                                  <Checkbox 
                                    checked={isSelected}
                                    onCheckedChange={() => handleToggleItem('invoice', inv)}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {inv.issue_date ? formatDateOnly(inv.issue_date, language) : "-"}
                                </TableCell>
                                <TableCell className="text-right">{formatCurrency(inv.total)}</TableCell>
                                <TableCell className="text-right font-medium text-amber-600">
                                  {formatCurrency(balance)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {isSelected && (
                                    <Input 
                                      type="number" 
                                      step="0.01"
                                      className="w-28 text-right"
                                      value={selectedItem?.amount || ""}
                                      onChange={(e) => handleAmountChange(inv.invoice_id, 'invoice', e.target.value)}
                                      max={balance}
                                    />
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg">
                      {isEs ? "No hay facturas pendientes" : "No pending invoices"}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="orders" className="mt-4">
                  {clientOrders.length > 0 ? (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10"></TableHead>
                            <TableHead>{isEs ? `Pedido / ${term("events", "entity_singular")}` : `Order / ${term("events", "entity_singular")}`}</TableHead>
                            <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                            <TableHead className="text-right">{isEs ? "Total" : "Total"}</TableHead>
                            <TableHead className="text-right">{isEs ? "Pendiente" : "Pending"}</TableHead>
                            <TableHead className="text-right w-32">{isEs ? "Depósito" : "Deposit"}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {clientOrders.map(ord => {
                            const isSelected = selectedItems.some(i => i.id === ord.event_id && i.type === 'order');
                            const selectedItem = selectedItems.find(i => i.id === ord.event_id && i.type === 'order');
                            const totalValue = ord.total_value || ord.budget || 0;
                            const paidDeposit = ord.deposit_paid || 0;
                            const pending = totalValue - paidDeposit;
                            
                            return (
                              <TableRow key={ord.event_id} className={isSelected ? "bg-green-50" : ""}>
                                <TableCell>
                                  <Checkbox 
                                    checked={isSelected}
                                    onCheckedChange={() => handleToggleItem('order', ord)}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">
                                  {ord.name || ord.event_name || `#${ord.event_id?.slice(-6)}`}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {ord.date ? formatDateOnly(ord.date, language) : "-"}
                                </TableCell>
                                <TableCell className="text-right">{formatCurrency(totalValue)}</TableCell>
                                <TableCell className="text-right font-medium text-amber-600">
                                  {formatCurrency(pending)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {isSelected && (
                                    <Input 
                                      type="number" 
                                      step="0.01"
                                      className="w-28 text-right"
                                      value={selectedItem?.amount || ""}
                                      onChange={(e) => handleAmountChange(ord.event_id, 'order', e.target.value)}
                                      max={pending}
                                    />
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg">
                      {isEs ? "No hay pedidos pendientes" : "No pending orders"}
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              {/* Summary */}
              {selectedItems.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-green-800">
                        {selectedItems.length} {isEs ? "item(s) seleccionado(s)" : "item(s) selected"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-green-600">{isEs ? "Total a pagar" : "Total to pay"}</p>
                      <p className="text-2xl font-bold text-green-700">{formatCurrency(totalToPay)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Payment Details */}
          {step === 3 && (
            <div className="space-y-4 py-4">
              {/* Summary of what's being paid */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">{isEs ? "Aplicando pago a:" : "Applying payment to:"}</p>
                {selectedItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span>
                      {item.type === 'invoice' 
                        ? `${isEs ? "Factura" : "Invoice"} ${item.item?.invoice_number}`
                        : `${isEs ? "Pedido" : "Order"} ${item.item?.name || item.item?.event_name}`
                      }
                    </span>
                    <span className="font-medium">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold pt-2 border-t">
                  <span>{isEs ? "Total" : "Total"}</span>
                  <span className="text-green-600">{formatCurrency(totalToPay)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {isEs ? "Fecha del Pago" : "Payment Date"} *
                  </Label>
                  <Input 
                    type="date" 
                    value={paymentForm.payment_date} 
                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{isEs ? "Método de Pago" : "Payment Method"} *</Label>
                  <Select value={paymentForm.payment_method} onValueChange={(v) => setPaymentForm({ ...paymentForm, payment_method: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">{isEs ? "Efectivo" : "Cash"}</SelectItem>
                      <SelectItem value="transfer">{isEs ? "Transferencia Bancaria" : "Bank Transfer"}</SelectItem>
                      <SelectItem value="card">{isEs ? "Tarjeta de Crédito/Débito" : "Credit/Debit Card"}</SelectItem>
                      <SelectItem value="check">{isEs ? "Cheque" : "Check"}</SelectItem>
                      <SelectItem value="zelle">Zelle</SelectItem>
                      <SelectItem value="paypal">PayPal</SelectItem>
                      <SelectItem value="other">{isEs ? "Otro" : "Other"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>{isEs ? "Referencia / No. Transacción" : "Reference / Transaction No."}</Label>
                <Input 
                  value={paymentForm.reference} 
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                  placeholder={isEs ? "Ej: Transferencia #12345" : "E.g: Transfer #12345"}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>{isEs ? "Notas" : "Notes"}</Label>
                <Input 
                  value={paymentForm.notes} 
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  placeholder={isEs ? "Notas adicionales..." : "Additional notes..."}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between">
            <div>
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep(step - 1)}>
                  {isEs ? "Atrás" : "Back"}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
                {isEs ? "Cancelar" : "Cancel"}
              </Button>
              {step === 2 && selectedItems.length > 0 && (
                <Button onClick={() => setStep(3)} className="bg-green-600 hover:bg-green-700">
                  {isEs ? "Continuar" : "Continue"}
                </Button>
              )}
              {step === 3 && (
                <Button onClick={handleCreatePayment} disabled={saving} className="bg-green-600 hover:bg-green-700">
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Receipt className="w-4 h-4 mr-2" />}
                  {isEs ? "Crear Pago y Recibo" : "Create Payment & Receipt"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Receipt Modal */}
      <PaymentReceiptModal 
        open={receiptModalOpen} 
        onClose={() => setReceiptModalOpen(false)} 
        payment={selectedPayment}
      />
    </div>
  );
}
