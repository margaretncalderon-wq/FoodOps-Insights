import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import { ScrollArea } from "./ui/scroll-area";

// Icons
import { 
  Plus, Search, Edit, Trash2, Truck, FileText, Package, Check,
  X, RefreshCw, Calendar, DollarSign, Clock, Send, CheckCircle2,
  AlertTriangle, Receipt, ArrowRight, Printer
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const PO_STATUSES = [
  { value: "Draft", label: "Draft", labelEs: "Borrador", color: "bg-gray-100 text-gray-700" },
  { value: "Sent", label: "Sent", labelEs: "Enviado", color: "bg-blue-100 text-blue-700" },
  { value: "PartiallyReceived", label: "Partially Received", labelEs: "Parcial", color: "bg-yellow-100 text-yellow-700" },
  { value: "Received", label: "Received", labelEs: "Recibido", color: "bg-green-100 text-green-700" },
  { value: "Cancelled", label: "Cancelled", labelEs: "Cancelado", color: "bg-red-100 text-red-700" },
];

const PAYMENT_METHODS = [
  { value: "Cash", label: "Cash", labelEs: "Efectivo" },
  { value: "Transfer", label: "Transfer", labelEs: "Transferencia" },
  { value: "Credit", label: "Credit", labelEs: "Crédito" },
  { value: "Other", label: "Other", labelEs: "Otro" },
];

export default function PurchaseOrdersSection() {
  const { language } = useLanguage();
  const [pos, setPOs] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);
  
  // Form
  const [form, setForm] = useState({
    supplier_id: "",
    needed_by_date: "",
    payment_method: "Transfer",
    notes: "",
    lines: []
  });
  
  // Receive form
  const [receiveForm, setReceiveForm] = useState({
    lines: [],
    create_expense: true,
    invoice_number: "",
    invoice_date: "",
    invoice_url: ""
  });

  const t = useCallback((key) => {
    const translations = {
      purchaseOrders: { en: "Purchase Orders", es: "Órdenes de Compra" },
      createPO: { en: "Create PO", es: "Crear OC" },
      supplier: { en: "Supplier", es: "Proveedor" },
      status: { en: "Status", es: "Estado" },
      total: { en: "Total", es: "Total" },
      date: { en: "Date", es: "Fecha" },
      neededBy: { en: "Needed By", es: "Fecha Requerida" },
      paymentMethod: { en: "Payment Method", es: "Método de Pago" },
      notes: { en: "Notes", es: "Notas" },
      addLine: { en: "Add Item", es: "Agregar Item" },
      item: { en: "Item", es: "Artículo" },
      quantity: { en: "Quantity", es: "Cantidad" },
      unit: { en: "Unit", es: "Unidad" },
      unitCost: { en: "Unit Cost", es: "Costo Unit." },
      lineTotal: { en: "Line Total", es: "Total Línea" },
      save: { en: "Save", es: "Guardar" },
      cancel: { en: "Cancel", es: "Cancelar" },
      send: { en: "Send PO", es: "Enviar OC" },
      receive: { en: "Receive", es: "Recibir" },
      view: { en: "View", es: "Ver" },
      noPos: { en: "No purchase orders found", es: "No hay órdenes de compra" },
      qtyOrdered: { en: "Qty Ordered", es: "Cant. Pedida" },
      qtyReceived: { en: "Qty Received", es: "Cant. Recibida" },
      qtyToReceive: { en: "Qty to Receive", es: "Cant. a Recibir" },
      createExpense: { en: "Create Expense Record", es: "Crear Registro de Gasto" },
      invoiceNumber: { en: "Invoice #", es: "# Factura" },
      invoiceDate: { en: "Invoice Date", es: "Fecha Factura" },
      invoiceUrl: { en: "Invoice Link/File", es: "Link/Archivo Factura" },
      receiveItems: { en: "Receive Items", es: "Recibir Artículos" },
      selectAll: { en: "Select All", es: "Seleccionar Todo" },
      draft: { en: "Draft", es: "Borrador" },
      sent: { en: "Sent", es: "Enviado" },
      received: { en: "Received", es: "Recibido" },
      all: { en: "All", es: "Todos" },
    };
    return translations[key]?.[language] || translations[key]?.en || key;
  }, [language]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [posRes, suppliersRes, inventoryRes] = await Promise.all([
        axios.get(`${API}/api/purchase-orders`, { withCredentials: true }),
        axios.get(`${API}/api/suppliers`, { withCredentials: true }),
        axios.get(`${API}/api/inventory/ingredients`, { withCredentials: true })
      ]);
      setPOs(posRes.data);
      setSuppliers(suppliersRes.data);
      setInventory(inventoryRes.data);
    } catch (error) {
      toast.error("Error loading data");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filter POs
  const filteredPOs = pos.filter(po => {
    const matchesStatus = statusFilter === "all" || po.status === statusFilter;
    const matchesSearch = po.po_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          po.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Add line to form
  const addLine = (inventoryItem) => {
    if (form.lines.find(l => l.inventory_item_id === inventoryItem.ingredient_id)) {
      toast.error(language === "es" ? "Ya agregado" : "Already added");
      return;
    }
    setForm(prev => ({
      ...prev,
      lines: [...prev.lines, {
        inventory_item_id: inventoryItem.ingredient_id,
        item_name: inventoryItem.name,
        qty_ordered: 1,
        purchase_unit: inventoryItem.unit,
        unit_cost: inventoryItem.cost_per_unit || 0,
        notes: ""
      }]
    }));
  };

  // Update line
  const updateLine = (index, field, value) => {
    setForm(prev => ({
      ...prev,
      lines: prev.lines.map((line, i) => i === index ? { ...line, [field]: value } : line)
    }));
  };

  // Remove line
  const removeLine = (index) => {
    setForm(prev => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index)
    }));
  };

  // Create PO
  const handleCreatePO = async () => {
    if (!form.supplier_id || form.lines.length === 0) {
      toast.error(language === "es" ? "Selecciona proveedor y agrega items" : "Select supplier and add items");
      return;
    }
    
    try {
      await axios.post(`${API}/api/purchase-orders`, {
        supplier_id: form.supplier_id,
        needed_by_date: form.needed_by_date || null,
        payment_method: form.payment_method,
        notes: form.notes,
        lines: form.lines
      }, { withCredentials: true });
      
      toast.success(language === "es" ? "OC creada" : "PO created");
      setCreateDialogOpen(false);
      setForm({ supplier_id: "", needed_by_date: "", payment_method: "Transfer", notes: "", lines: [] });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error");
    }
  };

  // Send PO (change status)
  const handleSendPO = async (poId) => {
    try {
      await axios.put(`${API}/api/purchase-orders/${poId}/status?status=Sent`, {}, { withCredentials: true });
      toast.success(language === "es" ? "OC enviada" : "PO sent");
      fetchData();
    } catch (error) {
      toast.error("Error");
    }
  };

  // Open receive dialog
  const openReceiveDialog = (po) => {
    setSelectedPO(po);
    setReceiveForm({
      lines: po.lines.map(line => ({
        line_id: line.line_id,
        item_name: line.item_name,
        qty_ordered: line.qty_ordered,
        qty_received: line.qty_received || 0,
        qty_to_receive: line.qty_ordered - (line.qty_received || 0),
        unit_cost: line.unit_cost,
        selected: true
      })),
      create_expense: true,
      invoice_number: "",
      invoice_date: new Date().toISOString().split("T")[0]
    });
    setReceiveDialogOpen(true);
  };

  // Receive items
  const handleReceive = async () => {
    const selectedLines = receiveForm.lines.filter(l => l.selected && l.qty_to_receive > 0);
    if (selectedLines.length === 0) {
      toast.error(language === "es" ? "Selecciona items a recibir" : "Select items to receive");
      return;
    }
    
    try {
      await axios.post(`${API}/api/purchase-orders/${selectedPO.po_id}/receive`, 
        selectedLines.map(l => ({
          line_id: l.line_id,
          qty_received: l.qty_to_receive,
          unit_cost: l.unit_cost
        })),
        { 
          withCredentials: true,
          params: {
            create_expense: receiveForm.create_expense,
            invoice_number: receiveForm.invoice_number || null,
            invoice_date: receiveForm.invoice_date || null
          }
        }
      );
      
      toast.success(language === "es" ? "Items recibidos" : "Items received");
      setReceiveDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error");
    }
  };

  // Delete PO
  const handleDeletePO = async (poId) => {
    if (!window.confirm(language === "es" ? "¿Eliminar?" : "Delete?")) return;
    try {
      await axios.delete(`${API}/api/purchase-orders/${poId}`, { withCredentials: true });
      toast.success(language === "es" ? "Eliminado" : "Deleted");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error");
    }
  };

  // View PO
  const openViewDialog = (po) => {
    setSelectedPO(po);
    setViewDialogOpen(true);
  };

  // Print PO
  const handlePrintPO = (po) => {
    setSelectedPO(po);
    setPrintDialogOpen(true);
  };

  const executePrint = () => {
    const printContent = document.getElementById('print-po-content');
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${selectedPO?.po_number || 'Purchase Order'}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
          .company-info { font-size: 18px; font-weight: bold; }
          .po-info { text-align: right; }
          .po-number { font-size: 24px; font-weight: bold; color: #333; }
          .section { margin-bottom: 20px; }
          .section-title { font-weight: bold; color: #666; margin-bottom: 5px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
          th { background: #f5f5f5; }
          .text-right { text-align: right; }
          .total { font-size: 18px; font-weight: bold; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info">Evoke OS</div>
          <div class="po-info">
            <div class="po-number">${selectedPO?.po_number || ''}</div>
            <div>Fecha: ${selectedPO?.created_at ? new Date(selectedPO.created_at).toLocaleDateString() : ''}</div>
            ${selectedPO?.needed_by_date ? '<div>Necesario para: ' + new Date(selectedPO.needed_by_date).toLocaleDateString() + '</div>' : ''}
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Proveedor</div>
          <div>${selectedPO?.supplier_name || ''}</div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Artículo</th>
              <th class="text-right">Cantidad</th>
              <th class="text-right">Unidad</th>
              <th class="text-right">Precio Unit.</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${selectedPO?.lines?.map(line => `
              <tr>
                <td>${line.item_name}</td>
                <td class="text-right">${line.qty_ordered}</td>
                <td class="text-right">${line.purchase_unit || ''}</td>
                <td class="text-right">$${line.unit_cost?.toFixed(2) || '0.00'}</td>
                <td class="text-right">$${line.line_total?.toFixed(2) || '0.00'}</td>
              </tr>
            `).join('') || ''}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" class="text-right total">TOTAL:</td>
              <td class="text-right total">$${selectedPO?.total?.toFixed(2) || '0.00'}</td>
            </tr>
          </tfoot>
        </table>
        
        ${selectedPO?.notes ? '<div class="section"><div class="section-title">Notas</div><div>' + selectedPO.notes + '</div></div>' : ''}
        
        <div class="footer">
          <p>Método de pago: ${selectedPO?.payment_method || 'N/A'}</p>
        </div>
      </body>
      </html>
    `);
    
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const getStatusBadge = (status) => {
    const statusInfo = PO_STATUSES.find(s => s.value === status) || PO_STATUSES[0];
    return <Badge className={statusInfo.color}>{language === "es" ? statusInfo.labelEs : statusInfo.label}</Badge>;
  };

  // Calculate form subtotal
  const formSubtotal = form.lines.reduce((sum, line) => sum + (line.qty_ordered * line.unit_cost), 0);

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="purchase-orders-section">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><FileText className="h-8 w-8 text-primary" /><div><p className="text-sm text-muted-foreground">Total POs</p><p className="text-2xl font-bold">{pos.length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Clock className="h-8 w-8 text-gray-500" /><div><p className="text-sm text-muted-foreground">{t("draft")}</p><p className="text-2xl font-bold">{pos.filter(p => p.status === "Draft").length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><Send className="h-8 w-8 text-blue-500" /><div><p className="text-sm text-muted-foreground">{t("sent")}</p><p className="text-2xl font-bold">{pos.filter(p => p.status === "Sent").length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-3"><CheckCircle2 className="h-8 w-8 text-green-500" /><div><p className="text-sm text-muted-foreground">{t("received")}</p><p className="text-2xl font-bold">{pos.filter(p => p.status === "Received").length}</p></div></div></CardContent></Card>
      </div>

      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("purchaseOrders")}</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder={language === "es" ? "Buscar..." : "Search..."} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-48" /></div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                {PO_STATUSES.map(s => (<SelectItem key={s.value} value={s.value}>{language === "es" ? s.labelEs : s.label}</SelectItem>))}
              </SelectContent>
            </Select>
            <Button onClick={() => { setForm({ supplier_id: "", needed_by_date: "", payment_method: "Transfer", notes: "", lines: [] }); setCreateDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />{t("createPO")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filteredPOs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{t("noPos")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>{t("supplier")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("date")}</TableHead>
                  <TableHead className="text-right">{t("total")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPOs.map(po => (
                  <TableRow key={po.po_id}>
                    <TableCell className="font-medium">{po.po_number}</TableCell>
                    <TableCell>{po.supplier_name}</TableCell>
                    <TableCell>{getStatusBadge(po.status)}</TableCell>
                    <TableCell>{new Date(po.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right font-semibold">${po.total?.toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openViewDialog(po)} title={t("view")}>
                          <FileText className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handlePrintPO(po)} title={language === "es" ? "Imprimir" : "Print"}>
                          <Printer className="w-4 h-4" />
                        </Button>
                        {po.status === "Draft" && (
                          <Button variant="ghost" size="icon" onClick={() => handleSendPO(po.po_id)} title={t("send")}>
                            <Send className="w-4 h-4 text-blue-500" />
                          </Button>
                        )}
                        {(po.status === "Sent" || po.status === "PartiallyReceived") && (
                          <Button variant="ghost" size="icon" onClick={() => openReceiveDialog(po)} title={t("receive")}>
                            <Package className="w-4 h-4 text-green-500" />
                          </Button>
                        )}
                        {po.status === "Draft" && (
                          <Button variant="ghost" size="icon" onClick={() => handleDeletePO(po.po_id)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create PO Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("createPO")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("supplier")} *</Label>
                <Select value={form.supplier_id} onValueChange={(v) => setForm(prev => ({ ...prev, supplier_id: v }))}>
                  <SelectTrigger><SelectValue placeholder={language === "es" ? "Seleccionar..." : "Select..."} /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (<SelectItem key={s.supplier_id} value={s.supplier_id}>{s.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("neededBy")}</Label>
                <Input type="date" value={form.needed_by_date} onChange={(e) => setForm(prev => ({ ...prev, needed_by_date: e.target.value }))} />
              </div>
              <div>
                <Label>{t("paymentMethod")}</Label>
                <Select value={form.payment_method} onValueChange={(v) => setForm(prev => ({ ...prev, payment_method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => (<SelectItem key={m.value} value={m.value}>{language === "es" ? m.labelEs : m.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("notes")}</Label>
                <Input value={form.notes} onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))} />
              </div>
            </div>

            {/* Lines */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold">{language === "es" ? "Líneas" : "Lines"}</h4>
                <Select onValueChange={(v) => { const item = inventory.find(i => i.ingredient_id === v); if (item) addLine(item); }}>
                  <SelectTrigger className="w-64"><SelectValue placeholder={t("addLine")} /></SelectTrigger>
                  <SelectContent>
                    {inventory.map(item => (<SelectItem key={item.ingredient_id} value={item.ingredient_id}>{item.name} (${item.cost_per_unit?.toFixed(2)}/{item.unit})</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              {form.lines.length === 0 ? (
                <p className="text-center py-6 text-muted-foreground">{language === "es" ? "Sin líneas" : "No lines"}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("item")}</TableHead>
                      <TableHead className="w-24">{t("quantity")}</TableHead>
                      <TableHead className="w-20">{t("unit")}</TableHead>
                      <TableHead className="w-28">{t("unitCost")}</TableHead>
                      <TableHead className="w-28 text-right">{t("lineTotal")}</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.lines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{line.item_name}</TableCell>
                        <TableCell><Input type="number" min="0.01" step="0.01" className="w-20" value={line.qty_ordered} onChange={(e) => updateLine(idx, "qty_ordered", parseFloat(e.target.value) || 0)} /></TableCell>
                        <TableCell><Input className="w-16" value={line.purchase_unit} onChange={(e) => updateLine(idx, "purchase_unit", e.target.value)} /></TableCell>
                        <TableCell><Input type="number" min="0" step="0.01" className="w-24" value={line.unit_cost} onChange={(e) => updateLine(idx, "unit_cost", parseFloat(e.target.value) || 0)} /></TableCell>
                        <TableCell className="text-right font-mono">${(line.qty_ordered * line.unit_cost).toFixed(2)}</TableCell>
                        <TableCell><Button variant="ghost" size="icon" onClick={() => removeLine(idx)}><X className="w-4 h-4 text-red-500" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <div className="flex justify-end mt-4 pt-4 border-t">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">{t("total")}</p>
                  <p className="text-2xl font-bold">${formSubtotal.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleCreatePO} disabled={!form.supplier_id || form.lines.length === 0}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View PO Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {selectedPO?.po_number}
            </DialogTitle>
            <DialogDescription>
              {selectedPO?.supplier_name} • {selectedPO && new Date(selectedPO.created_at).toLocaleDateString()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t("status")}</p>
                {selectedPO && getStatusBadge(selectedPO.status)}
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">{t("total")}</p>
                <p className="text-2xl font-bold">${selectedPO?.total?.toFixed(2)}</p>
              </div>
            </div>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("item")}</TableHead>
                  <TableHead className="text-right">{t("qtyOrdered")}</TableHead>
                  <TableHead className="text-right">{t("qtyReceived")}</TableHead>
                  <TableHead className="text-right">{t("unitCost")}</TableHead>
                  <TableHead className="text-right">{t("lineTotal")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedPO?.lines?.map((line, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{line.item_name}</TableCell>
                    <TableCell className="text-right">{line.qty_ordered} {line.purchase_unit}</TableCell>
                    <TableCell className="text-right">{line.qty_received || 0}</TableCell>
                    <TableCell className="text-right">${line.unit_cost?.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">${line.line_total?.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            {selectedPO?.notes && (
              <div>
                <p className="text-sm text-muted-foreground">{t("notes")}</p>
                <p>{selectedPO.notes}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Receive Items Dialog */}
      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              {t("receiveItems")}: {selectedPO?.po_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox 
                      checked={receiveForm.lines.every(l => l.selected)}
                      onCheckedChange={(checked) => setReceiveForm(prev => ({
                        ...prev,
                        lines: prev.lines.map(l => ({ ...l, selected: checked }))
                      }))}
                    />
                  </TableHead>
                  <TableHead>{t("item")}</TableHead>
                  <TableHead className="text-right">{t("qtyOrdered")}</TableHead>
                  <TableHead className="text-right">{t("qtyReceived")}</TableHead>
                  <TableHead className="w-28">{t("qtyToReceive")}</TableHead>
                  <TableHead className="w-28">{t("unitCost")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receiveForm.lines.map((line, idx) => (
                  <TableRow key={idx} className={!line.selected ? "opacity-50" : ""}>
                    <TableCell>
                      <Checkbox 
                        checked={line.selected}
                        onCheckedChange={(checked) => setReceiveForm(prev => ({
                          ...prev,
                          lines: prev.lines.map((l, i) => i === idx ? { ...l, selected: checked } : l)
                        }))}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{line.item_name}</TableCell>
                    <TableCell className="text-right">{line.qty_ordered}</TableCell>
                    <TableCell className="text-right">{line.qty_received}</TableCell>
                    <TableCell>
                      <Input 
                        type="number" 
                        min="0" 
                        max={line.qty_ordered - line.qty_received}
                        step="0.01"
                        className="w-24"
                        value={line.qty_to_receive}
                        onChange={(e) => setReceiveForm(prev => ({
                          ...prev,
                          lines: prev.lines.map((l, i) => i === idx ? { ...l, qty_to_receive: parseFloat(e.target.value) || 0 } : l)
                        }))}
                        disabled={!line.selected}
                      />
                    </TableCell>
                    <TableCell>
                      <Input 
                        type="number" 
                        min="0"
                        step="0.01"
                        className="w-24"
                        value={line.unit_cost}
                        onChange={(e) => setReceiveForm(prev => ({
                          ...prev,
                          lines: prev.lines.map((l, i) => i === idx ? { ...l, unit_cost: parseFloat(e.target.value) || 0 } : l)
                        }))}
                        disabled={!line.selected}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="create_expense"
                  checked={receiveForm.create_expense}
                  onCheckedChange={(checked) => setReceiveForm(prev => ({ ...prev, create_expense: checked }))}
                />
                <Label htmlFor="create_expense" className="flex items-center gap-2 cursor-pointer">
                  <Receipt className="w-4 h-4" />
                  {t("createExpense")}
                </Label>
              </div>
              
              {receiveForm.create_expense && (
                <div className="grid grid-cols-2 gap-4 pl-6">
                  <div>
                    <Label>{t("invoiceNumber")}</Label>
                    <Input 
                      value={receiveForm.invoice_number}
                      onChange={(e) => setReceiveForm(prev => ({ ...prev, invoice_number: e.target.value }))}
                      placeholder="FAC-001"
                    />
                  </div>
                  <div>
                    <Label>{t("invoiceDate")}</Label>
                    <Input 
                      type="date"
                      value={receiveForm.invoice_date}
                      onChange={(e) => setReceiveForm(prev => ({ ...prev, invoice_date: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleReceive}>
              <Check className="w-4 h-4 mr-2" />
              {t("receiveItems")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print PO Dialog */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              {language === "es" ? "Imprimir Orden de Compra" : "Print Purchase Order"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Preview */}
            <div id="print-po-content" className="border rounded-lg p-6 bg-white">
              <div className="flex justify-between items-start border-b pb-4 mb-4">
                <div>
                  <p className="text-xl font-bold">Evoke OS</p>
                  <p className="text-sm text-muted-foreground">{language === "es" ? "Orden de Compra" : "Purchase Order"}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{selectedPO?.po_number}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedPO?.created_at && new Date(selectedPO.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">{language === "es" ? "Proveedor" : "Supplier"}</p>
                <p className="font-medium">{selectedPO?.supplier_name}</p>
              </div>
              
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === "es" ? "Artículo" : "Item"}</TableHead>
                    <TableHead className="text-right">{language === "es" ? "Cantidad" : "Qty"}</TableHead>
                    <TableHead className="text-right">{language === "es" ? "Precio" : "Price"}</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedPO?.lines?.map((line, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{line.item_name}</TableCell>
                      <TableCell className="text-right">{line.qty_ordered} {line.purchase_unit}</TableCell>
                      <TableCell className="text-right">${line.unit_cost?.toFixed(2)}</TableCell>
                      <TableCell className="text-right">${line.line_total?.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              <div className="flex justify-end mt-4 pt-4 border-t">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">${selectedPO?.total?.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={executePrint}>
              <Printer className="w-4 h-4 mr-2" />
              {language === "es" ? "Imprimir" : "Print"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
