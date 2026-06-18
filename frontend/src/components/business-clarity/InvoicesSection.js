import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { CreditCard, RefreshCw, Download, Pencil, Loader2 } from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function InvoicesSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [filter, setFilter] = useState("all");
  
  // Export dialog
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportStartDate, setExportStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [exportEndDate, setExportEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Date filter for list
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [saving, setSaving] = useState(false);

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

  const handleEditInvoice = (invoice) => {
    setEditingInvoice({
      ...invoice,
      issue_date: invoice.issue_date ? invoice.issue_date.split('T')[0] : "",
      due_date: invoice.due_date ? invoice.due_date.split('T')[0] : "",
      subtotal: invoice.subtotal || 0,
      tax_amount: invoice.tax_amount || 0,
      total: invoice.total || 0,
      paid_amount: invoice.paid_amount || 0,
      notes: invoice.notes || ""
    });
    setEditDialogOpen(true);
  };

  const handleSaveInvoice = async () => {
    if (!editingInvoice) return;
    setSaving(true);
    try {
      await axios.put(`${API}/api/finance/invoices/${editingInvoice.invoice_id}`, {
        issue_date: editingInvoice.issue_date || null,
        due_date: editingInvoice.due_date || null,
        subtotal: parseFloat(editingInvoice.subtotal) || 0,
        tax_amount: parseFloat(editingInvoice.tax_amount) || 0,
        total: parseFloat(editingInvoice.total) || 0,
        status: editingInvoice.status,
        notes: editingInvoice.notes
      }, { withCredentials: true });
      toast.success(isEs ? "Factura actualizada" : "Invoice updated");
      setEditDialogOpen(false);
      fetchInvoices();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error updating invoice");
    }
    setSaving(false);
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
    const styles = { open: "bg-blue-100 text-blue-700", partially_paid: "bg-yellow-100 text-yellow-700", paid: "bg-green-100 text-green-700", partial: "bg-yellow-100 text-yellow-700" };
    const labels = { open: isEs ? "Abierta" : "Open", partially_paid: isEs ? "Parcial" : "Partial", paid: isEs ? "Pagada" : "Paid", partial: isEs ? "Parcial" : "Partial" };
    return <Badge className={styles[status] || styles.open}>{labels[status] || status}</Badge>;
  };

  const filteredInvoices = invoices.filter(inv => {
    // Status filter
    if (filter !== "all" && inv.status !== filter) return false;
    
    // Date range filter (using issue_date)
    if (filterStartDate) {
      const issueDate = inv.issue_date ? new Date(inv.issue_date) : null;
      if (!issueDate || issueDate < new Date(filterStartDate)) return false;
    }
    if (filterEndDate) {
      const issueDate = inv.issue_date ? new Date(inv.issue_date) : null;
      const endDate = new Date(filterEndDate);
      endDate.setHours(23, 59, 59, 999);
      if (!issueDate || issueDate > endDate) return false;
    }
    
    return true;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-semibold">{isEs ? "Facturas" : "Invoices"}</h2>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEs ? "Todas" : "All"}</SelectItem>
              <SelectItem value="open">{isEs ? "Abiertas" : "Open"}</SelectItem>
              <SelectItem value="partial">{isEs ? "Parciales" : "Partial"}</SelectItem>
              <SelectItem value="paid">{isEs ? "Pagadas" : "Paid"}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="h-8 w-36"
              placeholder={isEs ? "Desde" : "From"}
            />
            <span className="text-muted-foreground">-</span>
            <Input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="h-8 w-36"
              placeholder={isEs ? "Hasta" : "To"}
            />
            {(filterStartDate || filterEndDate) && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterStartDate(""); setFilterEndDate(""); }}>
                ✕
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(true)}>
            <Download className="w-4 h-4 mr-1" />
            {isEs ? "Exportar" : "Export"}
          </Button>
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
                <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                <TableHead>{isEs ? "Vence" : "Due"}</TableHead>
                <TableHead className="text-right">{isEs ? "Total" : "Total"}</TableHead>
                <TableHead className="text-right">{isEs ? "Pagado" : "Paid"}</TableHead>
                <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.map((inv) => (
                <TableRow key={inv.invoice_id}>
                  <TableCell>{inv.status !== "paid" && <input type="checkbox" checked={selectedInvoices.includes(inv.invoice_id)} onChange={() => handleSelectInvoice(inv.invoice_id)} className="rounded" />}</TableCell>
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.client_name || "-"}</TableCell>
                  <TableCell className="text-sm">{inv.issue_date ? formatDateOnly(inv.issue_date, language) : "-"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{inv.due_date ? formatDateOnly(inv.due_date, language) : "-"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(inv.total)}</TableCell>
                  <TableCell className="text-right text-green-600">{formatCurrency(inv.amount_paid || inv.paid_amount)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(inv.balance_due)}</TableCell>
                  <TableCell>{getStatusBadge(inv.status)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => handleEditInvoice(inv)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredInvoices.length === 0 && <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">{isEs ? "No hay facturas" : "No invoices"}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              {isEs ? "Exportar Facturas a Excel" : "Export Invoices to Excel"}
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
                window.open(`${API}/api/exports/invoices?start_date=${exportStartDate}&end_date=${exportEndDate}`, '_blank');
                setExportDialogOpen(false);
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              {isEs ? "Descargar Excel" : "Download Excel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Invoice Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              {isEs ? "Editar Factura" : "Edit Invoice"} {editingInvoice?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          {editingInvoice && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{isEs ? "Cliente" : "Client"}</Label>
                  <Input value={editingInvoice.client_name || ""} disabled />
                </div>
                <div className="space-y-2">
                  <Label>{isEs ? "Estado" : "Status"}</Label>
                  <Select 
                    value={editingInvoice.status} 
                    onValueChange={(v) => setEditingInvoice({...editingInvoice, status: v})}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">{isEs ? "Pendiente" : "Pending"}</SelectItem>
                      <SelectItem value="open">{isEs ? "Abierta" : "Open"}</SelectItem>
                      <SelectItem value="partially_paid">{isEs ? "Parcial" : "Partial"}</SelectItem>
                      <SelectItem value="paid">{isEs ? "Pagada" : "Paid"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{isEs ? "Subtotal" : "Subtotal"}</Label>
                  <Input 
                    type="number" 
                    value={editingInvoice.subtotal} 
                    onChange={(e) => {
                      const subtotal = parseFloat(e.target.value) || 0;
                      const tax = parseFloat(editingInvoice.tax_amount) || 0;
                      setEditingInvoice({...editingInvoice, subtotal, total: subtotal + tax});
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>ITBIS</Label>
                  <Input 
                    type="number" 
                    value={editingInvoice.tax_amount} 
                    onChange={(e) => {
                      const tax = parseFloat(e.target.value) || 0;
                      const subtotal = parseFloat(editingInvoice.subtotal) || 0;
                      setEditingInvoice({...editingInvoice, tax_amount: tax, total: subtotal + tax});
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Total</Label>
                  <Input 
                    type="number" 
                    value={editingInvoice.total} 
                    onChange={(e) => setEditingInvoice({...editingInvoice, total: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{isEs ? "Monto Pagado" : "Paid Amount"}</Label>
                  <Input type="number" value={editingInvoice.paid_amount} disabled className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label>{isEs ? "Fecha Vencimiento" : "Due Date"}</Label>
                  <Input 
                    type="date" 
                    value={editingInvoice.due_date || ""} 
                    onChange={(e) => setEditingInvoice({...editingInvoice, due_date: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-amber-600 font-medium">{isEs ? "Fecha de Factura" : "Invoice Date"} *</Label>
                <Input 
                  type="date" 
                  value={editingInvoice.issue_date || ""} 
                  onChange={(e) => setEditingInvoice({...editingInvoice, issue_date: e.target.value})}
                  className="border-amber-300 focus:border-amber-500"
                />
                <p className="text-xs text-muted-foreground">
                  {isEs ? "Esta fecha se usa para los reportes mensuales de ventas" : "This date is used for monthly sales reports"}
                </p>
              </div>
              <div className="space-y-2">
                <Label>{isEs ? "Notas" : "Notes"}</Label>
                <Textarea 
                  value={editingInvoice.notes || ""} 
                  onChange={(e) => setEditingInvoice({...editingInvoice, notes: e.target.value})}
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveInvoice} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
