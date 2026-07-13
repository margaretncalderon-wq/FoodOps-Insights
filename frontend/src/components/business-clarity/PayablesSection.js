import { useState, useEffect } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { FileText, RefreshCw, Calendar, Building2, AlertCircle, HelpCircle, Info, Target, Plus, DollarSign, CreditCard, CheckCircle, Clock, History, Download } from "lucide-react";

import { KoraLoader } from "../KoraLoader";
import { API_BASE as API } from "../../utils/api";
import { fmtNum } from "../../utils/format";
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PayablesSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [data, setData] = useState(null);
  const [events, setEvents] = useState([]);
  const [fixedCostCategories, setFixedCostCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedPayable, setSelectedPayable] = useState(null);
  const [assignmentType, setAssignmentType] = useState("event");
  const [selectedEvent, setSelectedEvent] = useState("");
  const [selectedCostCenter, setSelectedCostCenter] = useState("");
  const [selectedFixedCostCategory, setSelectedFixedCostCategory] = useState("");
  
  // New expense form states
  const [newExpenseDialogOpen, setNewExpenseDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newExpense, setNewExpense] = useState({
    vendor_id: "",
    contract_id: "",
    description: "",
    amount: "",
    invoice_number: "",
    due_date: "",
    assignment_type: "none",
    event_id: "",
    fixed_cost_category_id: "",
    cost_center_id: ""
  });
  const [supplierContracts, setSupplierContracts] = useState([]);
  
  // New vendor dialog
  const [newVendorDialogOpen, setNewVendorDialogOpen] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: "", email: "", phone: "", vendor_type: "supplier" });
  const [creatingVendor, setCreatingVendor] = useState(false);
  
  // Payment dialog states
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedForPayment, setSelectedForPayment] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    payment_date: "",
    payment_method: "transfer",
    reference: "",
    notes: ""
  });
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Export dialog
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportStartDate, setExportStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [exportEndDate, setExportEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const COST_CENTERS = [
    { value: "operations", label: "Operations", labelEs: "Operaciones" },
    { value: "kitchen", label: "Kitchen", labelEs: "Cocina" },
    { value: "service", label: "Service", labelEs: "Servicio" },
    { value: "logistics", label: "Logistics", labelEs: "Logística" },
    { value: "admin", label: "Administration", labelEs: "Administración" },
    { value: "marketing", label: "Marketing", labelEs: "Marketing" },
    { value: "other", label: "Other", labelEs: "Otros" },
  ];

  const fetchData = async () => {
    setLoading(true);
    try {
      const [payablesRes, eventsRes, categoriesRes, vendorsRes, costCentersRes, contractsRes] = await Promise.all([
        axios.get(`${API}/api/business-clarity/accounts-payable`, { withCredentials: true }),
        axios.get(`${API}/api/events`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/fixed-costs/categories`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/vendors`, { withCredentials: true }).catch(() => ({ data: { vendors: [] } })),
        axios.get(`${API}/api/business-clarity/cost-centers`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/supplier-contracts?status=Active`, { withCredentials: true }).catch(() => ({ data: [] }))
      ]);
      setData(payablesRes.data);
      setEvents(eventsRes.data || []);
      setFixedCostCategories(categoriesRes.data || []);
      setSuppliers(vendorsRes.data.vendors || []);
      setCostCenters(costCentersRes.data || []);
      setSupplierContracts(contractsRes.data || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleAssignCost = (payable) => {
    setSelectedPayable(payable);
    setAssignmentType(payable.event_id ? "event" : payable.fixed_cost_category_id ? "fixed_cost" : "cost_center");
    setSelectedEvent(payable.event_id || "");
    setSelectedCostCenter(payable.cost_center || "");
    setSelectedFixedCostCategory(payable.fixed_cost_category_id || "");
    setAssignDialogOpen(true);
  };

  const handleSaveAssignment = async () => {
    if (!selectedPayable) return;
    
    try {
      const updateData = {
        event_id: assignmentType === "event" ? selectedEvent : null,
        cost_center: assignmentType === "cost_center" ? selectedCostCenter : null,
        fixed_cost_category_id: assignmentType === "fixed_cost" ? selectedFixedCostCategory : null
      };
      
      await axios.put(
        `${API}/api/business-clarity/payables/${selectedPayable.payable_id}/assign`,
        updateData,
        { withCredentials: true }
      );
      
      toast.success(isEs ? "Costo asignado correctamente" : "Cost assigned successfully");
      setAssignDialogOpen(false);
      setSelectedPayable(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error assigning cost");
    }
  };

  const handleCreateExpense = async () => {
    if (!newExpense.vendor_id) {
      toast.error(isEs ? "Debes seleccionar un proveedor" : "You must select a vendor");
      return;
    }
    if (!newExpense.description || !newExpense.amount) {
      toast.error(isEs ? "Descripción y monto son requeridos" : "Description and amount are required");
      return;
    }
    
    // Get vendor name from selected vendor
    const selectedVendor = suppliers.find(v => v.vendor_id === newExpense.vendor_id);
    
    setSubmitting(true);
    try {
      const payload = {
        supplier_id: newExpense.vendor_id,
        supplier_name: selectedVendor?.name || null,
        contract_id: newExpense.contract_id || null,
        description: newExpense.description,
        amount: parseFloat(newExpense.amount),
        invoice_number: newExpense.invoice_number || null,
        due_date: newExpense.due_date || null,
        event_id: newExpense.assignment_type === "event" ? newExpense.event_id : null,
        fixed_cost_category_id: newExpense.assignment_type === "fixed_cost" ? newExpense.fixed_cost_category_id : null
      };
      
      await axios.post(`${API}/api/business-clarity/supplier-payables`, payload, { withCredentials: true });
      
      toast.success(isEs ? "Gasto registrado exitosamente" : "Expense recorded successfully");
      setNewExpenseDialogOpen(false);
      setNewExpense({
        vendor_id: "",
        contract_id: "",
        description: "",
        amount: "",
        invoice_number: "",
        due_date: "",
        assignment_type: "none",
        event_id: "",
        fixed_cost_category_id: "",
        cost_center_id: ""
      });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al registrar gasto" : "Error recording expense"));
    } finally {
      setSubmitting(false);
    }
  };

  // Payment functions
  const openPaymentDialog = async (payable) => {
    setSelectedForPayment(payable);
    setPaymentForm({
      amount: payable.balance_due?.toString() || "",
      payment_date: new Date().toISOString().split("T")[0],
      payment_method: "transfer",
      reference: "",
      notes: ""
    });
    setPaymentDialogOpen(true);
    
    // Load payment history
    setLoadingHistory(true);
    try {
      const res = await axios.get(`${API}/api/business-clarity/payables/${payable.payable_id}/payments`, { withCredentials: true });
      setPaymentHistory(res.data.payments || []);
    } catch (err) {
      setPaymentHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleRegisterPayment = async () => {
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      toast.error(isEs ? "Ingresa un monto válido" : "Enter a valid amount");
      return;
    }

    setProcessingPayment(true);
    try {
      await axios.post(
        `${API}/api/business-clarity/payables/${selectedForPayment.payable_id}/payments`,
        {
          amount: parseFloat(paymentForm.amount),
          payment_date: paymentForm.payment_date || null,
          payment_method: paymentForm.payment_method || null,
          reference: paymentForm.reference || null,
          notes: paymentForm.notes || null
        },
        { withCredentials: true }
      );
      
      toast.success(isEs ? "Pago registrado exitosamente" : "Payment recorded successfully");
      setPaymentDialogOpen(false);
      setSelectedForPayment(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al registrar pago" : "Error recording payment"));
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleMarkAsPaid = async (payable) => {
    try {
      await axios.post(
        `${API}/api/business-clarity/payables/${payable.payable_id}/mark-paid`,
        {},
        { withCredentials: true }
      );
      toast.success(isEs ? "Marcado como pagado" : "Marked as paid");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error" : "Error"));
    }
  };

  const handleCreateVendor = async () => {
    if (!newVendor.name.trim()) {
      toast.error(isEs ? "El nombre es requerido" : "Name is required");
      return;
    }
    
    setCreatingVendor(true);
    try {
      const res = await axios.post(
        `${API}/api/business-clarity/vendors?name=${encodeURIComponent(newVendor.name)}&vendor_type=${newVendor.vendor_type}&email=${newVendor.email || ""}&phone=${newVendor.phone || ""}`,
        {},
        { withCredentials: true }
      );
      
      toast.success(isEs ? "Proveedor creado exitosamente" : "Vendor created successfully");
      setNewVendorDialogOpen(false);
      setNewVendor({ name: "", email: "", phone: "", vendor_type: "supplier" });
      
      // Refresh vendors and auto-select the new one
      await fetchData();
      setNewExpense({ ...newExpense, vendor_id: res.data.vendor_id });
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al crear proveedor" : "Error creating vendor"));
    } finally {
      setCreatingVendor(false);
    }
  };

  const PAYMENT_METHODS = [
    { value: "transfer", label: "Bank Transfer", labelEs: "Transferencia" },
    { value: "cash", label: "Cash", labelEs: "Efectivo" },
    { value: "check", label: "Check", labelEs: "Cheque" },
    { value: "card", label: "Card", labelEs: "Tarjeta" },
    { value: "other", label: "Other", labelEs: "Otro" }
  ];

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  const unassignedRecords = (data?.records || []).filter(r => !r.event_id && !r.cost_center && !r.fixed_cost_category_id);
  const unassignedTotal = unassignedRecords.reduce((sum, r) => sum + (r.balance_due || 0), 0);

  const getCategoryName = (categoryId) => {
    const cat = fixedCostCategories.find(c => c.category_id === categoryId);
    return cat?.name || categoryId;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{isEs ? "Cuentas por Pagar" : "Accounts Payable"}</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setExportDialogOpen(true)}>
            <Download className="w-4 h-4 mr-2" />
            {isEs ? "Exportar" : "Export"}
          </Button>
          <Button onClick={() => setNewExpenseDialogOpen(true)} data-testid="new-expense-btn">
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Nuevo Gasto" : "New Expense"}
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="gap-1">
                  <Info className="w-3 h-3" />
                  {isEs ? "Fuga de Margen" : "Margin Leakage"}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>{isEs 
                ? "Los costos sin evento asignado afectan el margen global pero no aparecen en la rentabilidad de eventos específicos." 
                : "Costs without an assigned event affect global margin but don't appear in specific event profitability."}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Total Pendiente" : "Total Pending"}</p><p className="text-xl font-bold text-orange-600">{formatCurrency(data?.summary?.total_pending)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Total Pagado" : "Total Paid"}</p><p className="text-xl font-bold text-green-600">{formatCurrency(data?.summary?.total_paid)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Facturas Pendientes" : "Pending Invoices"}</p><p className="text-xl font-bold">{data?.summary?.pending_count || 0}</p></CardContent></Card>
        <Card className={unassignedTotal > 0 ? "border-purple-200 bg-purple-50/50" : ""}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-1">
              <p className="text-xs text-muted-foreground">{isEs ? "Sin Asignar (Overhead)" : "Unassigned (Overhead)"}</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger><AlertCircle className="w-3 h-3 text-purple-500" /></TooltipTrigger>
                  <TooltipContent><p>{isEs ? "Afecta margen global, no eventos" : "Affects global margin, not events"}</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className={`text-xl font-bold ${unassignedTotal > 0 ? "text-purple-600" : "text-muted-foreground"}`}>{formatCurrency(unassignedTotal)}</p>
            {unassignedTotal > 0 && <p className="text-xs text-purple-500 mt-1">{unassignedRecords.length} {isEs ? "registros" : "records"}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Proveedor" : "Supplier"}</TableHead>
                <TableHead>{isEs ? "Descripción" : "Description"}</TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    {isEs ? "Asignación" : "Assignment"}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger><HelpCircle className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>{isEs ? "Asigna a un evento, centro de costo, o categoría de costo fijo" : "Assign to an event, cost center, or fixed cost category"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableHead>
                <TableHead className="text-right">{isEs ? "Monto" : "Amount"}</TableHead>
                <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                <TableHead>{isEs ? "Acciones" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.records || []).map((rec) => {
                const isUnassigned = !rec.event_id && !rec.cost_center && !rec.fixed_cost_category_id;
                const hasFixedCostCategory = rec.fixed_cost_category_id && !rec.event_id;
                const hasCostCenter = rec.cost_center && !rec.event_id && !rec.fixed_cost_category_id;
                return (
                  <TableRow key={rec.payable_id} className={isUnassigned ? "bg-purple-50/30" : ""}>
                    <TableCell>{rec.supplier_name || "-"}</TableCell>
                    <TableCell>{rec.description || "-"}</TableCell>
                    <TableCell>
                      {rec.event_id ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="text-xs">{rec.event_name}</Badge>
                          <span className="text-xs text-muted-foreground">{isEs ? "→ Margen Evento" : "→ Event Margin"}</span>
                        </div>
                      ) : hasFixedCostCategory ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-xs">
                            <Target className="w-3 h-3 mr-1" />
                            {getCategoryName(rec.fixed_cost_category_id)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{isEs ? "→ Presupuesto" : "→ Budget"}</span>
                        </div>
                      ) : hasCostCenter ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                            {COST_CENTERS.find(c => c.value === rec.cost_center)?.[isEs ? "labelEs" : "label"] || rec.cost_center}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{isEs ? "→ Centro de Costo" : "→ Cost Center"}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-xs">{isEs ? "Sin Asignar" : "Unassigned"}</Badge>
                          <span className="text-xs text-purple-600">{isEs ? "⚠️ Fuga de margen" : "⚠️ Margin leakage"}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(rec.amount)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(rec.balance_due)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleAssignCost(rec)} 
                          title={isEs ? "Asignar costo" : "Assign cost"}
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                        {rec.status !== "paid" && rec.balance_due > 0 && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => openPaymentDialog(rec)}
                              title={isEs ? "Registrar pago" : "Record payment"}
                              className="text-green-600 hover:text-green-700"
                              data-testid={`payment-btn-${rec.payable_id}`}
                            >
                              <DollarSign className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleMarkAsPaid(rec)}
                              title={isEs ? "Marcar como pagado" : "Mark as paid"}
                              className="text-blue-600 hover:text-blue-700"
                              data-testid={`mark-paid-btn-${rec.payable_id}`}
                            >
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        <Badge 
                          variant={rec.status === "paid" ? "default" : rec.status === "partial" ? "secondary" : "outline"}
                          className={rec.status === "paid" ? "bg-green-500" : rec.status === "partial" ? "bg-amber-100 text-amber-700" : ""}
                        >
                          {rec.status === "paid" 
                            ? (isEs ? "Pagado" : "Paid") 
                            : rec.status === "partial" 
                              ? (isEs ? "Parcial" : "Partial")
                              : (isEs ? "Pendiente" : "Pending")}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(data?.records || []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{isEs ? "Sin registros" : "No records"}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Margin Leakage Warning */}
      {unassignedTotal > 0 && (
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <p className="font-medium text-purple-800">{isEs ? "Fuga de Margen Detectada" : "Margin Leakage Detected"}</p>
                <p className="text-sm text-purple-600 mt-1">
                  {isEs 
                    ? `Hay ${formatCurrency(unassignedTotal)} en costos no asignados. Asigna a: Evento (afecta margen), Categoría de Costo Fijo (para presupuesto), o Centro de Costo (overhead).`
                    : `There's ${formatCurrency(unassignedTotal)} in unassigned costs. Assign to: Event (affects margin), Fixed Cost Category (for budget), or Cost Center (overhead).`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assign Cost Dialog - Enhanced with Fixed Cost Categories */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEs ? "Asignar Costo" : "Assign Cost"}</DialogTitle>
            <DialogDescription>
              {selectedPayable && <span className="font-medium">{selectedPayable.supplier_name}: {formatCurrency(selectedPayable.amount)}</span>}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Assignment Type Toggle - Now with 3 options */}
            <div className="grid grid-cols-3 gap-2">
              <Button variant={assignmentType === "event" ? "default" : "outline"} className="flex-1" onClick={() => setAssignmentType("event")}>
                <Calendar className="w-4 h-4 mr-1" />
                {isEs ? "Evento" : "Event"}
              </Button>
              <Button variant={assignmentType === "fixed_cost" ? "default" : "outline"} className="flex-1" onClick={() => setAssignmentType("fixed_cost")}>
                <Target className="w-4 h-4 mr-1" />
                {isEs ? "Costo Fijo" : "Fixed Cost"}
              </Button>
              <Button variant={assignmentType === "cost_center" ? "default" : "outline"} className="flex-1" onClick={() => setAssignmentType("cost_center")}>
                <Building2 className="w-4 h-4 mr-1" />
                {isEs ? "Centro" : "Center"}
              </Button>
            </div>

            {/* Event Selection */}
            {assignmentType === "event" && (
              <div>
                <Label>{isEs ? "Seleccionar Evento" : "Select Event"}</Label>
                <Select value={selectedEvent} onValueChange={setSelectedEvent}>
                  <SelectTrigger><SelectValue placeholder={isEs ? "Selecciona un evento..." : "Select an event..."} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin evento" : "No event"}</SelectItem>
                    {events.map(e => <SelectItem key={e.event_id} value={e.event_id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">{isEs ? "Este costo afectará el margen del evento" : "This cost will affect the event's margin"}</p>
              </div>
            )}

            {/* Fixed Cost Category Selection - NEW */}
            {assignmentType === "fixed_cost" && (
              <div>
                <Label>{isEs ? "Categoría de Costo Fijo" : "Fixed Cost Category"}</Label>
                <Select value={selectedFixedCostCategory} onValueChange={setSelectedFixedCostCategory}>
                  <SelectTrigger><SelectValue placeholder={isEs ? "Selecciona categoría..." : "Select category..."} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin categoría" : "No category"}</SelectItem>
                    {fixedCostCategories.filter(c => c.active).map(c => (
                      <SelectItem key={c.category_id} value={c.category_id}>
                        <div className="flex items-center gap-2">
                          <Target className="w-3 h-3" />
                          {c.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-emerald-600 mt-1">
                  {isEs ? "✓ Se incluirá en el análisis Presupuesto vs Real" : "✓ Will be included in Budget vs Actual analysis"}
                </p>
              </div>
            )}

            {/* Cost Center Selection */}
            {assignmentType === "cost_center" && (
              <div>
                <Label>{isEs ? "Centro de Costo" : "Cost Center"}</Label>
                <Select value={selectedCostCenter} onValueChange={setSelectedCostCenter}>
                  <SelectTrigger><SelectValue placeholder={isEs ? "Selecciona centro..." : "Select center..."} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin asignar" : "Unassigned"}</SelectItem>
                    {COST_CENTERS.map(cc => <SelectItem key={cc.value} value={cc.value}>{isEs ? cc.labelEs : cc.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">{isEs ? "Overhead clasificado (reportes globales)" : "Classified overhead (global reports)"}</p>
              </div>
            )}

            {/* Impact Explanation */}
            <Card className="bg-slate-50">
              <CardContent className="pt-3 pb-3">
                <p className="text-xs text-muted-foreground">
                  {assignmentType === "event" 
                    ? (isEs ? "📊 El costo se incluirá en el cálculo de rentabilidad del evento." : "📊 Cost included in event profitability calculation.")
                    : assignmentType === "fixed_cost"
                      ? (isEs ? "📊 El costo se comparará contra el presupuesto de la categoría." : "📊 Cost will be compared against the category budget.")
                      : (isEs ? "📊 El costo se clasifica como overhead general." : "📊 Cost is classified as general overhead.")
                  }
                </p>
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleSaveAssignment}>{isEs ? "Guardar" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Expense Dialog */}
      <Dialog open={newExpenseDialogOpen} onOpenChange={setNewExpenseDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEs ? "Registrar Nuevo Gasto" : "Record New Expense"}</DialogTitle>
            <DialogDescription>
              {isEs ? "Agrega un gasto o factura de proveedor" : "Add a supplier expense or invoice"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Vendor Selection - REQUIRED */}
            <div className="space-y-2">
              <Label>{isEs ? "Proveedor" : "Vendor"} *</Label>
              <div className="flex gap-2">
                <Select 
                  value={newExpense.vendor_id} 
                  onValueChange={(v) => setNewExpense({ ...newExpense, vendor_id: v })}
                >
                  <SelectTrigger data-testid="expense-vendor-select" className="flex-1">
                    <SelectValue placeholder={isEs ? "Selecciona proveedor..." : "Select vendor..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.length === 0 ? (
                      <SelectItem value="no-vendors" disabled>
                        {isEs ? "No hay proveedores. Crea uno primero." : "No vendors. Create one first."}
                      </SelectItem>
                    ) : (
                      suppliers.map(vendor => (
                        <SelectItem key={vendor.vendor_id} value={vendor.vendor_id}>
                          <div className="flex items-center gap-2">
                            <span>{vendor.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {vendor.source === "partners" ? "Partner" : "Supplier"}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="icon"
                  onClick={() => setNewVendorDialogOpen(true)}
                  title={isEs ? "Crear nuevo proveedor" : "Create new vendor"}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {isEs 
                  ? "Proveedores unificados de Partners y Suppliers" 
                  : "Unified vendors from Partners and Suppliers"}
              </p>
            </div>

            {/* Contract selector — only show when vendor is picked AND has active contracts */}
            {(() => {
              const filtered = supplierContracts.filter((c) => c.supplier_id === newExpense.vendor_id);
              if (!newExpense.vendor_id || filtered.length === 0) return null;
              return (
                <div className="space-y-2" data-testid="contract-link-block">
                  <Label>{isEs ? "Enlazar a Contrato (opcional)" : "Link to Contract (optional)"}</Label>
                  <Select
                    value={newExpense.contract_id || "__none__"}
                    onValueChange={(v) => setNewExpense({ ...newExpense, contract_id: v === "__none__" ? "" : v })}
                  >
                    <SelectTrigger data-testid="expense-contract-select">
                      <SelectValue placeholder={isEs ? "Sin contrato" : "No contract"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— {isEs ? "Sin contrato" : "No contract"} —</SelectItem>
                      {filtered.map((c) => (
                        <SelectItem key={c.contract_id} value={c.contract_id}>
                          {c.contract_number} · {c.title}
                          {c.balance_remaining != null ? ` (${isEs ? "restante" : "remaining"}: ${c.balance_remaining.toLocaleString("es", { style: "currency", currency: c.currency || "USD" })})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {isEs
                      ? "Este gasto sumará al 'Facturado' del contrato elegido."
                      : "This expense will add to the selected contract's 'Invoiced' rollup."}
                  </p>
                </div>
              );
            })()}
            
            {/* Description */}
            <div className="space-y-2">
              <Label>{isEs ? "Descripción" : "Description"} *</Label>
              <Textarea
                placeholder={isEs ? "Describe el gasto..." : "Describe the expense..."}
                value={newExpense.description}
                onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                data-testid="expense-description-input"
              />
            </div>
            
            {/* Amount and Invoice Number */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isEs ? "Monto" : "Amount"} *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newExpense.amount}
                  onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                  data-testid="expense-amount-input"
                />
              </div>
              <div className="space-y-2">
                <Label>{isEs ? "No. Factura" : "Invoice #"}</Label>
                <Input
                  placeholder={isEs ? "Ej: FAC-001" : "e.g. INV-001"}
                  value={newExpense.invoice_number}
                  onChange={(e) => setNewExpense({ ...newExpense, invoice_number: e.target.value })}
                  data-testid="expense-invoice-input"
                />
              </div>
            </div>
            
            {/* Due Date */}
            <div className="space-y-2">
              <Label>{isEs ? "Fecha de Vencimiento" : "Due Date"}</Label>
              <Input
                type="date"
                value={newExpense.due_date}
                onChange={(e) => setNewExpense({ ...newExpense, due_date: e.target.value })}
                data-testid="expense-due-date-input"
              />
            </div>
            
            {/* Assignment Type */}
            <div className="space-y-2">
              <Label>{isEs ? "Asignar a" : "Assign to"}</Label>
              <Select 
                value={newExpense.assignment_type} 
                onValueChange={(v) => setNewExpense({ ...newExpense, assignment_type: v, event_id: "", fixed_cost_category_id: "" })}
              >
                <SelectTrigger data-testid="expense-assignment-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Sin asignar (Overhead)" : "Unassigned (Overhead)"}</SelectItem>
                  <SelectItem value="event">{isEs ? "Evento" : "Event"}</SelectItem>
                  <SelectItem value="fixed_cost">{isEs ? "Categoría de Costo Fijo" : "Fixed Cost Category"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Event Selection */}
            {newExpense.assignment_type === "event" && (
              <div className="space-y-2">
                <Label>{isEs ? "Evento" : "Event"}</Label>
                <Select 
                  value={newExpense.event_id} 
                  onValueChange={(v) => setNewExpense({ ...newExpense, event_id: v })}
                >
                  <SelectTrigger data-testid="expense-event-select">
                    <SelectValue placeholder={isEs ? "Selecciona evento..." : "Select event..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {events.map(ev => (
                      <SelectItem key={ev.event_id} value={ev.event_id}>
                        {ev.name || ev.event_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {/* Fixed Cost Category Selection */}
            {newExpense.assignment_type === "fixed_cost" && (
              <div className="space-y-2">
                <Label>{isEs ? "Categoría de Costo Fijo" : "Fixed Cost Category"}</Label>
                <Select 
                  value={newExpense.fixed_cost_category_id} 
                  onValueChange={(v) => setNewExpense({ ...newExpense, fixed_cost_category_id: v })}
                >
                  <SelectTrigger data-testid="expense-fixed-cost-select">
                    <SelectValue placeholder={isEs ? "Selecciona categoría..." : "Select category..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {fixedCostCategories.map(cat => (
                      <SelectItem key={cat.category_id} value={cat.category_id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {/* Info Card */}
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-3 pb-3">
                <p className="text-xs text-blue-700">
                  {newExpense.assignment_type === "event" 
                    ? (isEs ? "📊 Este gasto se incluirá en el cálculo de rentabilidad del evento seleccionado." : "📊 This expense will be included in the selected event's profitability calculation.")
                    : newExpense.assignment_type === "fixed_cost"
                      ? (isEs ? "📊 Este gasto se comparará contra el presupuesto de la categoría seleccionada." : "📊 This expense will be compared against the selected category's budget.")
                      : (isEs ? "📊 Este gasto será clasificado como overhead general y afectará el margen global." : "📊 This expense will be classified as general overhead and will affect global margin.")
                  }
                </p>
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewExpenseDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreateExpense} disabled={submitting} data-testid="save-expense-btn">
              {submitting ? (
                <>
                  <KoraLoader size={16} className="mr-2" />
                  {isEs ? "Guardando..." : "Saving..."}
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  {isEs ? "Registrar Gasto" : "Record Expense"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Registration Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              {isEs ? "Registrar Pago" : "Record Payment"}
            </DialogTitle>
            <DialogDescription>
              {selectedForPayment?.description} - {selectedForPayment?.supplier_name || (isEs ? "Sin proveedor" : "No supplier")}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Summary Card */}
            <Card className="bg-slate-50">
              <CardContent className="pt-4 pb-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">{isEs ? "Total" : "Total"}</p>
                    <p className="font-bold">{formatCurrency(selectedForPayment?.amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{isEs ? "Pagado" : "Paid"}</p>
                    <p className="font-bold text-green-600">{formatCurrency(selectedForPayment?.paid_amount || 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{isEs ? "Saldo" : "Balance"}</p>
                    <p className="font-bold text-orange-600">{formatCurrency(selectedForPayment?.balance_due)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Payment Amount */}
            <div className="space-y-2">
              <Label>{isEs ? "Monto del Pago" : "Payment Amount"} *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                data-testid="payment-amount-input"
              />
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => setPaymentForm({ ...paymentForm, amount: selectedForPayment?.balance_due?.toString() || "0" })}
                >
                  {isEs ? "Pago Total" : "Full Payment"}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => setPaymentForm({ ...paymentForm, amount: fmtNum(((selectedForPayment?.balance_due || 0) / 2)) })}
                >
                  50%
                </Button>
              </div>
            </div>
            
            {/* Payment Date and Method */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isEs ? "Fecha de Pago" : "Payment Date"}</Label>
                <Input
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                  data-testid="payment-date-input"
                />
              </div>
              <div className="space-y-2">
                <Label>{isEs ? "Método" : "Method"}</Label>
                <Select 
                  value={paymentForm.payment_method} 
                  onValueChange={(v) => setPaymentForm({ ...paymentForm, payment_method: v })}
                >
                  <SelectTrigger data-testid="payment-method-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => (
                      <SelectItem key={m.value} value={m.value}>
                        {isEs ? m.labelEs : m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Reference */}
            <div className="space-y-2">
              <Label>{isEs ? "Referencia / No. Cheque" : "Reference / Check #"}</Label>
              <Input
                placeholder={isEs ? "Ej: TRF-12345" : "e.g. TRF-12345"}
                value={paymentForm.reference}
                onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                data-testid="payment-reference-input"
              />
            </div>
            
            {/* Notes */}
            <div className="space-y-2">
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Textarea
                placeholder={isEs ? "Notas adicionales..." : "Additional notes..."}
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                rows={2}
              />
            </div>
            
            {/* Payment History */}
            {paymentHistory.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <History className="w-4 h-4" />
                  {isEs ? "Historial de Pagos" : "Payment History"}
                </Label>
                <div className="border rounded-lg max-h-32 overflow-y-auto">
                  {loadingHistory ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      <KoraLoader size={16} className="inline mr-2" />
                      {isEs ? "Cargando..." : "Loading..."}
                    </div>
                  ) : (
                    <div className="divide-y">
                      {paymentHistory.map((pmt, idx) => (
                        <div key={idx} className="p-2 text-sm flex justify-between items-center">
                          <div>
                            <span className="font-medium">{formatCurrency(pmt.amount)}</span>
                            <span className="text-muted-foreground ml-2">
                              {pmt.payment_method && `(${PAYMENT_METHODS.find(m => m.value === pmt.payment_method)?.[isEs ? "labelEs" : "label"] || pmt.payment_method})`}
                            </span>
                          </div>
                          <span className="text-muted-foreground text-xs">{pmt.payment_date}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button 
              onClick={handleRegisterPayment} 
              disabled={processingPayment}
              className="bg-green-600 hover:bg-green-700"
              data-testid="confirm-payment-btn"
            >
              {processingPayment ? (
                <>
                  <KoraLoader size={16} className="mr-2" />
                  {isEs ? "Procesando..." : "Processing..."}
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  {isEs ? "Registrar Pago" : "Record Payment"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Vendor Dialog */}
      <Dialog open={newVendorDialogOpen} onOpenChange={setNewVendorDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEs ? "Crear Nuevo Proveedor" : "Create New Vendor"}</DialogTitle>
            <DialogDescription>
              {isEs ? "El proveedor se guardará en el catálogo de Partners" : "The vendor will be saved in the Partners catalog"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{isEs ? "Nombre" : "Name"} *</Label>
              <Input
                placeholder={isEs ? "Nombre del proveedor" : "Vendor name"}
                value={newVendor.name}
                onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
                data-testid="new-vendor-name-input"
              />
            </div>
            
            <div className="space-y-2">
              <Label>{isEs ? "Tipo" : "Type"}</Label>
              <Select 
                value={newVendor.vendor_type} 
                onValueChange={(v) => setNewVendor({ ...newVendor, vendor_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supplier">{isEs ? "Proveedor" : "Supplier"}</SelectItem>
                  <SelectItem value="agency">{isEs ? "Agencia" : "Agency"}</SelectItem>
                  <SelectItem value="freelancer">Freelancer</SelectItem>
                  <SelectItem value="contractor">{isEs ? "Contratista" : "Contractor"}</SelectItem>
                  <SelectItem value="utility">{isEs ? "Servicio Público" : "Utility"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={newVendor.email}
                  onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{isEs ? "Teléfono" : "Phone"}</Label>
                <Input
                  placeholder="+1 555 123 4567"
                  value={newVendor.phone}
                  onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewVendorDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button 
              onClick={handleCreateVendor} 
              disabled={creatingVendor}
              data-testid="save-new-vendor-btn"
            >
              {creatingVendor ? (
                <>
                  <KoraLoader size={16} className="mr-2" />
                  {isEs ? "Creando..." : "Creating..."}
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  {isEs ? "Crear Proveedor" : "Create Vendor"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              {isEs ? "Exportar Gastos a Excel" : "Export Expenses to Excel"}
            </DialogTitle>
            <DialogDescription>
              {isEs ? "Selecciona el rango de fechas para exportar" : "Select the date range to export"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isEs ? "Fecha Inicio" : "Start Date"}</Label>
                <Input
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{isEs ? "Fecha Fin" : "End Date"}</Label>
                <Input
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const d = new Date();
                  d.setDate(1);
                  setExportStartDate(d.toISOString().split('T')[0]);
                  setExportEndDate(new Date().toISOString().split('T')[0]);
                }}
              >
                {isEs ? "Este Mes" : "This Month"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const d = new Date();
                  d.setMonth(d.getMonth() - 1, 1);
                  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
                  setExportStartDate(d.toISOString().split('T')[0]);
                  setExportEndDate(end.toISOString().split('T')[0]);
                }}
              >
                {isEs ? "Mes Anterior" : "Last Month"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const d = new Date();
                  d.setMonth(0, 1);
                  setExportStartDate(d.toISOString().split('T')[0]);
                  setExportEndDate(new Date().toISOString().split('T')[0]);
                }}
              >
                {isEs ? "Este Año" : "This Year"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button
              onClick={() => {
                window.open(`${API}/api/exports/expenses?start_date=${exportStartDate}&end_date=${exportEndDate}`, '_blank');
                setExportDialogOpen(false);
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              {isEs ? "Descargar Excel" : "Download Excel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
