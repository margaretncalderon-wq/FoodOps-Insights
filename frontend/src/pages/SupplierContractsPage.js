import { useEffect, useState } from "react";
import { API } from "../utils/api";
import axios from "axios";
import { Layout } from "../components/Layout";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "../components/ui/dialog";
import { Plus, FileText, Upload, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function SupplierContractsPage() {
  const [contracts, setContracts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankForm());

  function blankForm() {
    return {
      supplier_id: "",
      title: "",
      description: "",
      start_date: "",
      end_date: "",
      total_value: 0,
      currency: "USD",
      payment_terms: "net30",
      credit_limit: 0,
      partner_id: "",
      cost_center: "",
      status: "Active",
      auto_renew: false,
      renewal_period_months: 12,
      notes: "",
    };
  }

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [cRes, sRes, pRes] = await Promise.allSettled([
      axios.get(`${API}/supplier-contracts`, { withCredentials: true }),
      axios.get(`${API}/suppliers`, { withCredentials: true }),
      axios.get(`${API}/partners`, { withCredentials: true }),
    ]);
    const pick = (r, fb = []) => (r.status === "fulfilled" ? (r.value.data ?? fb) : fb);
    setContracts(pick(cRes));
    setSuppliers(pick(sRes));
    setPartners(pick(pRes));
    setLoading(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        total_value: parseFloat(form.total_value) || 0,
        credit_limit: parseFloat(form.credit_limit) || 0,
        partner_id: form.partner_id || null,
        renewal_period_months: form.renewal_period_months ? parseInt(form.renewal_period_months, 10) : null,
      };
      if (editing) {
        await axios.put(`${API}/supplier-contracts/${editing.contract_id}`, payload, { withCredentials: true });
        toast.success("Contrato actualizado");
      } else {
        await axios.post(`${API}/supplier-contracts`, payload, { withCredentials: true });
        toast.success("Contrato creado");
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(blankForm());
      fetchAll();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error al guardar contrato");
    }
  };

  const startEdit = (c) => {
    setEditing(c);
    setForm({
      supplier_id: c.supplier_id,
      title: c.title || "",
      description: c.description || "",
      start_date: (c.start_date || "").slice(0, 10),
      end_date: (c.end_date || "").slice(0, 10),
      total_value: c.total_value || 0,
      currency: c.currency || "USD",
      payment_terms: c.payment_terms || "net30",
      credit_limit: c.credit_limit || 0,
      partner_id: c.partner_id || "",
      cost_center: c.cost_center || "",
      status: c.status || "Active",
      auto_renew: !!c.auto_renew,
      renewal_period_months: c.renewal_period_months || 12,
      notes: c.notes || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (contractId) => {
    if (!confirm("¿Cancelar este contrato? (Se marca como Cancelled, no se borra permanentemente)")) return;
    try {
      await axios.delete(`${API}/supplier-contracts/${contractId}`, { withCredentials: true });
      toast.success("Contrato cancelado");
      fetchAll();
    } catch (err) {
      toast.error("Error al cancelar contrato");
    }
  };

  const handleUploadPdf = async (contractId, file) => {
    const fd = new FormData();
    fd.append("file", file);
    try {
      await axios.post(`${API}/supplier-contracts/${contractId}/attachments`, fd, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Archivo cargado");
      fetchAll();
    } catch (err) {
      toast.error("Error al cargar archivo");
    }
  };

  const money = (n, ccy = "USD") => Number(n || 0).toLocaleString("es", { style: "currency", currency: ccy });

  const statusColor = {
    Active: "bg-green-100 text-green-800",
    Draft: "bg-slate-100 text-slate-700",
    Expired: "bg-yellow-100 text-yellow-800",
    Cancelled: "bg-red-100 text-red-800",
    Renewed: "bg-blue-100 text-blue-800",
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Contratos de Proveedor</h1>
            <p className="text-muted-foreground text-sm">Gestión de acuerdos con proveedores, términos de pago, ítems alquilados y enlace a contabilidad.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { setEditing(null); setForm(blankForm()); } }}>
            <DialogTrigger asChild>
              <Button data-testid="new-contract-btn"><Plus className="w-4 h-4 mr-2" />Nuevo Contrato</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar Contrato" : "Nuevo Contrato"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Proveedor *</Label>
                    <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                      <SelectTrigger data-testid="contract-supplier-select"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s) => <SelectItem key={s.supplier_id} value={s.supplier_id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Partner enlazado (opcional)</Label>
                    <Select value={form.partner_id || "__none__"} onValueChange={(v) => setForm({ ...form, partner_id: v === "__none__" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Ninguno" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Ninguno —</SelectItem>
                        {partners.map((p) => <SelectItem key={p.partner_id} value={p.partner_id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Título *</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required data-testid="contract-title-input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Fecha inicio *</Label>
                    <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Fecha fin</Label>
                    <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Valor total</Label>
                    <Input type="number" step="0.01" value={form.total_value} onChange={(e) => setForm({ ...form, total_value: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Moneda</Label>
                    <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="DOP">DOP</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="MXN">MXN</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Límite de crédito</Label>
                    <Input type="number" step="0.01" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Términos de pago</Label>
                    <Select value={form.payment_terms} onValueChange={(v) => setForm({ ...form, payment_terms: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Contado</SelectItem>
                        <SelectItem value="net15">Net 15</SelectItem>
                        <SelectItem value="net30">Net 30</SelectItem>
                        <SelectItem value="net60">Net 60</SelectItem>
                        <SelectItem value="credit">Crédito</SelectItem>
                        <SelectItem value="mixed">Mixto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Draft">Borrador</SelectItem>
                        <SelectItem value="Active">Activo</SelectItem>
                        <SelectItem value="Expired">Expirado</SelectItem>
                        <SelectItem value="Renewed">Renovado</SelectItem>
                        <SelectItem value="Cancelled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Notas internas</Label>
                  <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" data-testid="save-contract-btn">{editing ? "Guardar" : "Crear"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Cargando...</p>
        ) : contracts.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Aún no hay contratos. Crea el primero para empezar a enlazar facturas y pagos con proveedores.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {contracts.map((c) => (
              <Card key={c.contract_id} data-testid={`contract-card-${c.contract_id}`}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{c.contract_number}</span>
                        <Badge className={statusColor[c.status] || "bg-slate-100 text-slate-700"}>{c.status}</Badge>
                      </div>
                      <h3 className="font-semibold text-lg mt-1">{c.title}</h3>
                      <p className="text-sm text-muted-foreground">{c.supplier_name}</p>
                      {c.partner_name && (
                        <p className="text-xs text-muted-foreground">↳ Partner: {c.partner_name}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <label className="cursor-pointer">
                        <input type="file" accept="application/pdf,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadPdf(c.contract_id, f); e.target.value = ""; }} />
                        <Button variant="ghost" size="icon" asChild><span><Upload className="w-4 h-4" /></span></Button>
                      </label>
                      <Button variant="ghost" size="icon" onClick={() => startEdit(c)}><FileText className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(c.contract_id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div><div className="text-xs text-muted-foreground">Valor total</div><div className="font-medium">{money(c.total_value, c.currency)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Facturado</div><div className="font-medium">{money(c.invoiced_to_date, c.currency)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Restante</div><div className={`font-medium ${c.balance_remaining < 0 ? "text-destructive" : ""}`}>{money(c.balance_remaining, c.currency)}</div></div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                    <span>{c.start_date?.slice(0, 10)} → {c.end_date?.slice(0, 10) || "∞"}</span>
                    <span>{c.payment_terms}</span>
                  </div>
                  {c.attachments && c.attachments.length > 0 && (
                    <div className="pt-2 border-t space-y-1">
                      <div className="text-xs text-muted-foreground">Adjuntos ({c.attachments.length})</div>
                      {c.attachments.slice(0, 3).map((a) => (
                        <a key={a.attachment_id} href={a.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                          <ExternalLink className="w-3 h-3" /> {a.original_name}
                        </a>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
