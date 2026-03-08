import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  Plus, Pencil, Trash2, Search, RefreshCw, Truck, Loader2,
  Phone, Mail, MapPin, Building2
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export function SuppliersSection({ showHeader = true, compact = false }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [form, setForm] = useState({
    name: "",
    rnc: "",
    contact_name: "",
    email: "",
    phone: "",
    address: "",
    category: "General",
    payment_terms: "net30",
    notes: "",
    // Additional fields like Partners
    legal_name: "",
    website: "",
    whatsapp: "",
    country: "",
    city: "",
    minimum_order: 0,
    lead_time: "",
    is_preferred: false,
    status: "Active"
  });

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/suppliers`, { withCredentials: true });
      setSuppliers(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const handleOpenDialog = (supplier = null) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setForm({
        name: supplier.name || "",
        rnc: supplier.rnc || "",
        contact_name: supplier.contact_name || "",
        email: supplier.email || "",
        phone: supplier.phone || "",
        address: supplier.address || "",
        category: supplier.category || "General",
        payment_terms: supplier.payment_terms || "net30",
        notes: supplier.notes || "",
        legal_name: supplier.legal_name || "",
        website: supplier.website || "",
        whatsapp: supplier.whatsapp || "",
        country: supplier.country || "",
        city: supplier.city || "",
        minimum_order: supplier.minimum_order || 0,
        lead_time: supplier.lead_time || "",
        is_preferred: supplier.is_preferred || false,
        status: supplier.status || "Active"
      });
    } else {
      setEditingSupplier(null);
      setForm({
        name: "",
        rnc: "",
        contact_name: "",
        email: "",
        phone: "",
        address: "",
        category: "General",
        payment_terms: "net30",
        notes: "",
        legal_name: "",
        website: "",
        whatsapp: "",
        country: "",
        city: "",
        minimum_order: 0,
        lead_time: "",
        is_preferred: false,
        status: "Active"
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(isEs ? "El nombre es requerido" : "Name is required");
      return;
    }
    setSaving(true);
    try {
      if (editingSupplier) {
        await axios.put(`${API}/api/suppliers/${editingSupplier.supplier_id}`, form, { withCredentials: true });
        toast.success(isEs ? "Proveedor actualizado" : "Supplier updated");
      } else {
        await axios.post(`${API}/api/suppliers`, form, { withCredentials: true });
        toast.success(isEs ? "Proveedor creado" : "Supplier created");
      }
      setDialogOpen(false);
      fetchSuppliers();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
    setSaving(false);
  };

  const handleDelete = async (supplierId) => {
    if (!window.confirm(isEs ? "¿Eliminar este proveedor?" : "Delete this supplier?")) return;
    try {
      await axios.delete(`${API}/api/suppliers/${supplierId}`, { withCredentials: true });
      toast.success(isEs ? "Proveedor eliminado" : "Supplier deleted");
      fetchSuppliers();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase()) ||
    s.rnc?.includes(search)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Truck className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-semibold">{isEs ? "Proveedores" : "Suppliers"}</h2>
            <Badge variant="secondary">{suppliers.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchSuppliers}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button onClick={() => handleOpenDialog()} data-testid="new-supplier-btn">
              <Plus className="w-4 h-4 mr-2" />
              {isEs ? "Nuevo Proveedor" : "New Supplier"}
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={isEs ? "Buscar proveedores..." : "Search suppliers..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Suppliers List */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                <TableHead>RNC</TableHead>
                <TableHead>{isEs ? "Contacto" : "Contact"}</TableHead>
                <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
                <TableHead>{isEs ? "Teléfono" : "Phone"}</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSuppliers.map(supplier => (
                <TableRow key={supplier.supplier_id}>
                  <TableCell>
                    <div className="font-medium">{supplier.name}</div>
                    {supplier.email && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {supplier.email}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{supplier.rnc || "-"}</TableCell>
                  <TableCell>{supplier.contact_name || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{supplier.category || "General"}</Badge>
                  </TableCell>
                  <TableCell>{supplier.phone || "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(supplier)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(supplier.supplier_id)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredSuppliers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay proveedores" : "No suppliers found"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              {editingSupplier 
                ? (isEs ? "Editar Proveedor" : "Edit Supplier")
                : (isEs ? "Nuevo Proveedor" : "New Supplier")
              }
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isEs ? "Nombre Comercial" : "Business Name"} *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({...form, name: e.target.value})}
                  placeholder={isEs ? "Nombre del proveedor" : "Supplier name"}
                />
              </div>
              <div className="space-y-2">
                <Label>{isEs ? "Razón Social" : "Legal Name"}</Label>
                <Input
                  value={form.legal_name}
                  onChange={(e) => setForm({...form, legal_name: e.target.value})}
                  placeholder={isEs ? "Nombre legal" : "Legal name"}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>RNC / {isEs ? "Cédula" : "Tax ID"}</Label>
                <Input
                  value={form.rnc}
                  onChange={(e) => setForm({...form, rnc: e.target.value})}
                  placeholder="000-00000-0"
                />
              </div>
              <div className="space-y-2">
                <Label>{isEs ? "Categoría" : "Category"}</Label>
                <Select value={form.category} onValueChange={(v) => setForm({...form, category: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General">General</SelectItem>
                    <SelectItem value="Alimentos">{isEs ? "Alimentos" : "Food"}</SelectItem>
                    <SelectItem value="Bebidas">{isEs ? "Bebidas" : "Beverages"}</SelectItem>
                    <SelectItem value="Equipos">{isEs ? "Equipos" : "Equipment"}</SelectItem>
                    <SelectItem value="Servicios">{isEs ? "Servicios" : "Services"}</SelectItem>
                    <SelectItem value="Decoración">{isEs ? "Decoración" : "Decor"}</SelectItem>
                    <SelectItem value="Transporte">{isEs ? "Transporte" : "Transport"}</SelectItem>
                    <SelectItem value="Audiovisual">Audiovisual</SelectItem>
                    <SelectItem value="Mobiliario">{isEs ? "Mobiliario" : "Furniture"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Contact Info */}
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">{isEs ? "Información de Contacto" : "Contact Information"}</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{isEs ? "Contacto Principal" : "Primary Contact"}</Label>
                  <Input
                    value={form.contact_name}
                    onChange={(e) => setForm({...form, contact_name: e.target.value})}
                    placeholder={isEs ? "Nombre del contacto" : "Contact name"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({...form, email: e.target.value})}
                    placeholder="email@proveedor.com"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div className="space-y-2">
                  <Label>{isEs ? "Teléfono" : "Phone"}</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({...form, phone: e.target.value})}
                    placeholder="809-555-1234"
                  />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp</Label>
                  <Input
                    value={form.whatsapp}
                    onChange={(e) => setForm({...form, whatsapp: e.target.value})}
                    placeholder="809-555-1234"
                  />
                </div>
              </div>
              <div className="space-y-2 mt-3">
                <Label>{isEs ? "Sitio Web" : "Website"}</Label>
                <Input
                  value={form.website}
                  onChange={(e) => setForm({...form, website: e.target.value})}
                  placeholder="https://www.proveedor.com"
                />
              </div>
            </div>

            {/* Location */}
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">{isEs ? "Ubicación" : "Location"}</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{isEs ? "País" : "Country"}</Label>
                  <Input
                    value={form.country}
                    onChange={(e) => setForm({...form, country: e.target.value})}
                    placeholder={isEs ? "República Dominicana" : "Country"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{isEs ? "Ciudad" : "City"}</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => setForm({...form, city: e.target.value})}
                    placeholder={isEs ? "Santo Domingo" : "City"}
                  />
                </div>
              </div>
              <div className="space-y-2 mt-3">
                <Label>{isEs ? "Dirección" : "Address"}</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({...form, address: e.target.value})}
                  placeholder={isEs ? "Dirección completa" : "Full address"}
                />
              </div>
            </div>

            {/* Business Terms */}
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">{isEs ? "Términos Comerciales" : "Business Terms"}</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{isEs ? "Términos de Pago" : "Payment Terms"}</Label>
                  <Select value={form.payment_terms} onValueChange={(v) => setForm({...form, payment_terms: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">{isEs ? "Inmediato" : "Immediate"}</SelectItem>
                      <SelectItem value="net15">Net 15</SelectItem>
                      <SelectItem value="net30">Net 30</SelectItem>
                      <SelectItem value="net45">Net 45</SelectItem>
                      <SelectItem value="net60">Net 60</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isEs ? "Orden Mínima" : "Minimum Order"}</Label>
                  <Input
                    type="number"
                    value={form.minimum_order}
                    onChange={(e) => setForm({...form, minimum_order: parseFloat(e.target.value) || 0})}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{isEs ? "Tiempo de Entrega" : "Lead Time"}</Label>
                  <Input
                    value={form.lead_time}
                    onChange={(e) => setForm({...form, lead_time: e.target.value})}
                    placeholder={isEs ? "24 horas" : "24 hours"}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div className="space-y-2">
                  <Label>{isEs ? "Estado" : "Status"}</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({...form, status: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">{isEs ? "Activo" : "Active"}</SelectItem>
                      <SelectItem value="Inactive">{isEs ? "Inactivo" : "Inactive"}</SelectItem>
                      <SelectItem value="Pending">{isEs ? "Pendiente" : "Pending"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <input
                    type="checkbox"
                    checked={form.is_preferred}
                    onChange={(e) => setForm({...form, is_preferred: e.target.checked})}
                    className="w-4 h-4"
                  />
                  <Label className="mb-0">{isEs ? "Proveedor Preferido" : "Preferred Supplier"}</Label>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({...form, notes: e.target.value})}
                rows={2}
                placeholder={isEs ? "Notas adicionales..." : "Additional notes..."}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
