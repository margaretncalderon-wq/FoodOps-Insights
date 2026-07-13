import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "sonner";
import { Plus, Edit, Trash2, FileText, Building2, Calendar, DollarSign } from "lucide-react";

import { KoraLoader } from "../KoraLoader";
import { API_BASE as API } from "../../utils/api";
import { fmtNum } from "../../utils/format";

const AGREEMENT_TYPES = [
  { value: "rental", label: "Equipment Rental", labelEs: "Alquiler de Equipos" },
  { value: "supplier", label: "Supplier Contract", labelEs: "Contrato con Proveedor" },
  { value: "service", label: "Service Agreement", labelEs: "Acuerdo de Servicio" },
  { value: "lease", label: "Lease", labelEs: "Arrendamiento" }
];

const STATUSES = [
  { value: "active", label: "Active", labelEs: "Activo" },
  { value: "pending", label: "Pending", labelEs: "Pendiente" },
  { value: "expired", label: "Expired", labelEs: "Vencido" },
  { value: "cancelled", label: "Cancelled", labelEs: "Cancelado" }
];

export function AgreementsSection() {
  const { language } = useLanguage();
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgreement, setEditingAgreement] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState({
    title: "",
    agreement_type: "rental",
    supplier_id: "",
    start_date: "",
    end_date: "",
    terms: "",
    monthly_cost: 0,
    deposit: 0,
    status: "active",
    documents: [],
    notes: ""
  });

  const isEs = language === "es";

  useEffect(() => {
    fetchAgreements();
    fetchSuppliers();
  }, []);

  const fetchAgreements = async () => {
    try {
      const res = await axios.get(`${API}/api/ops-supplies/agreements`, { withCredentials: true });
      setAgreements(res.data || []);
    } catch (error) {
      console.error("Error fetching agreements:", error);
      setAgreements([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await axios.get(`${API}/api/suppliers`, { withCredentials: true });
      setSuppliers(res.data || []);
    } catch (error) {
      setSuppliers([]);
    }
  };

  const handleSave = async () => {
    try {
      if (editingAgreement) {
        await axios.put(`${API}/api/ops-supplies/agreements/${editingAgreement.agreement_id}`, form, { withCredentials: true });
        toast.success(isEs ? "Contrato actualizado" : "Agreement updated");
      } else {
        await axios.post(`${API}/api/ops-supplies/agreements`, form, { withCredentials: true });
        toast.success(isEs ? "Contrato creado" : "Agreement created");
      }
      fetchAgreements();
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      toast.error(isEs ? "Error al guardar" : "Error saving");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(isEs ? "¿Eliminar este contrato?" : "Delete this agreement?")) return;
    try {
      await axios.delete(`${API}/api/ops-supplies/agreements/${id}`, { withCredentials: true });
      toast.success(isEs ? "Contrato eliminado" : "Agreement deleted");
      fetchAgreements();
    } catch (error) {
      toast.error(isEs ? "Error al eliminar" : "Error deleting");
    }
  };

  const handleEdit = (agreement) => {
    setEditingAgreement(agreement);
    setForm({
      title: agreement.title || "",
      agreement_type: agreement.agreement_type || "rental",
      supplier_id: agreement.supplier_id || "",
      start_date: agreement.start_date || "",
      end_date: agreement.end_date || "",
      terms: agreement.terms || "",
      monthly_cost: agreement.monthly_cost || 0,
      deposit: agreement.deposit || 0,
      status: agreement.status || "active",
      documents: agreement.documents || [],
      notes: agreement.notes || ""
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingAgreement(null);
    setForm({
      title: "", agreement_type: "rental", supplier_id: "", start_date: "", end_date: "",
      terms: "", monthly_cost: 0, deposit: 0, status: "active", documents: [], notes: ""
    });
  };

  const getStatusBadge = (status) => {
    const colors = {
      active: "bg-green-100 text-green-800",
      pending: "bg-amber-100 text-amber-800",
      expired: "bg-red-100 text-red-800",
      cancelled: "bg-gray-100 text-gray-800"
    };
    const label = STATUSES.find(s => s.value === status)?.[isEs ? "labelEs" : "label"] || status;
    return <Badge className={colors[status] || ""}>{label}</Badge>;
  };

  if (loading) return <div className="flex justify-center p-8"><KoraLoader size={32} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">{isEs ? "Contratos y Acuerdos" : "Contracts & Agreements"}</h3>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          {isEs ? "Nuevo Contrato" : "New Agreement"}
        </Button>
      </div>

      {agreements.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{isEs ? "No hay contratos registrados" : "No agreements registered"}</p>
            <Button variant="outline" className="mt-4" onClick={() => { resetForm(); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              {isEs ? "Agregar primer contrato" : "Add first agreement"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agreements.map(agreement => (
            <Card key={agreement.agreement_id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-base">{agreement.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {AGREEMENT_TYPES.find(t => t.value === agreement.agreement_type)?.[isEs ? "labelEs" : "label"]}
                    </p>
                  </div>
                  {getStatusBadge(agreement.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {agreement.supplier_id && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span>{suppliers.find(s => s.supplier_id === agreement.supplier_id)?.name || "-"}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>{agreement.start_date} - {agreement.end_date || (isEs ? "Indefinido" : "Indefinite")}</span>
                </div>
                {agreement.monthly_cost > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span>${fmtNum(agreement.monthly_cost)}/{isEs ? "mes" : "month"}</span>
                  </div>
                )}
                <div className="flex justify-end gap-1 pt-2 border-t">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(agreement)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(agreement.agreement_id)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Agreement Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingAgreement ? (isEs ? "Editar Contrato" : "Edit Agreement") : (isEs ? "Nuevo Contrato" : "New Agreement")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>{isEs ? "Título" : "Title"}</Label>
              <Input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} placeholder={isEs ? "Nombre del contrato" : "Agreement name"} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Tipo" : "Type"}</Label>
                <Select value={form.agreement_type} onValueChange={(v) => setForm({...form, agreement_type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AGREEMENT_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>{isEs ? type.labelEs : type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isEs ? "Estado" : "Status"}</Label>
                <Select value={form.status} onValueChange={(v) => setForm({...form, status: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{isEs ? s.labelEs : s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{isEs ? "Proveedor" : "Supplier"}</Label>
              <Select value={form.supplier_id} onValueChange={(v) => setForm({...form, supplier_id: v})}>
                <SelectTrigger><SelectValue placeholder={isEs ? "Seleccionar proveedor" : "Select supplier"} /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => (
                    <SelectItem key={s.supplier_id} value={s.supplier_id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Fecha Inicio" : "Start Date"}</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({...form, start_date: e.target.value})} />
              </div>
              <div>
                <Label>{isEs ? "Fecha Fin" : "End Date"}</Label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm({...form, end_date: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Costo Mensual" : "Monthly Cost"}</Label>
                <Input type="number" step="0.01" value={form.monthly_cost} onChange={(e) => setForm({...form, monthly_cost: parseFloat(e.target.value) || 0})} />
              </div>
              <div>
                <Label>{isEs ? "Depósito" : "Deposit"}</Label>
                <Input type="number" step="0.01" value={form.deposit} onChange={(e) => setForm({...form, deposit: parseFloat(e.target.value) || 0})} />
              </div>
            </div>
            <div>
              <Label>{isEs ? "Términos" : "Terms"}</Label>
              <Input value={form.terms} onChange={(e) => setForm({...form, terms: e.target.value})} placeholder={isEs ? "Condiciones del contrato..." : "Contract terms..."} />
            </div>
            <div>
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Input value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleSave}>{isEs ? "Guardar" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
