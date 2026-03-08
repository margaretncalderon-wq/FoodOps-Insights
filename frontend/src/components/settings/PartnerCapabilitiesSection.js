import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Plus, Pencil, Trash2, Loader2, Tag, RefreshCw, Zap } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

// Default capabilities (from backend)
const DEFAULT_CAPABILITIES = [
  { value: "catering", label: "Catering", label_es: "Catering", default: true },
  { value: "event_design", label: "Event Design", label_es: "Diseño de Eventos", default: true },
  { value: "floral_design", label: "Floral Design", label_es: "Diseño Floral", default: true },
  { value: "lighting_design", label: "Lighting Design", label_es: "Diseño de Iluminación", default: true },
  { value: "sound_engineering", label: "Sound Engineering", label_es: "Ingeniería de Sonido", default: true },
  { value: "video_production", label: "Video Production", label_es: "Producción de Video", default: true },
  { value: "photography", label: "Photography", label_es: "Fotografía", default: true },
  { value: "furniture_rental", label: "Furniture Rental", label_es: "Alquiler de Mobiliario", default: true },
  { value: "tent_structures", label: "Tent & Structures", label_es: "Carpas y Estructuras", default: true },
  { value: "stage_design", label: "Stage Design", label_es: "Diseño de Escenario", default: true },
  { value: "signage", label: "Signage", label_es: "Señalización", default: true },
  { value: "custom_fabrication", label: "Custom Fabrication", label_es: "Fabricación a Medida", default: true },
  { value: "valet_parking", label: "Valet Parking", label_es: "Valet Parking", default: true },
  { value: "security_services", label: "Security Services", label_es: "Servicios de Seguridad", default: true },
  { value: "event_staffing", label: "Event Staffing", label_es: "Personal de Eventos", default: true },
  { value: "bartending", label: "Bartending", label_es: "Bartending", default: true },
  { value: "transportation", label: "Transportation", label_es: "Transporte", default: true },
  { value: "entertainment", label: "Entertainment", label_es: "Entretenimiento", default: true },
  { value: "dj_services", label: "DJ Services", label_es: "Servicios de DJ", default: true },
  { value: "live_music", label: "Live Music", label_es: "Música en Vivo", default: true },
];

export default function PartnerCapabilitiesSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [customCapabilities, setCustomCapabilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCap, setEditingCap] = useState(null);
  const [form, setForm] = useState({ label: "", label_es: "" });
  const [showDefaults, setShowDefaults] = useState(false);

  const fetchCapabilities = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/partners/capabilities`, { withCredentials: true });
      setCustomCapabilities(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCapabilities();
  }, [fetchCapabilities]);

  const handleOpenDialog = (cap = null) => {
    if (cap) {
      setEditingCap(cap);
      setForm({ label: cap.label, label_es: cap.label_es || "" });
    } else {
      setEditingCap(null);
      setForm({ label: "", label_es: "" });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) {
      toast.error(isEs ? "El nombre es requerido" : "Name is required");
      return;
    }
    setSaving(true);
    try {
      if (editingCap) {
        await axios.put(
          `${API}/api/partners/capabilities/${editingCap.capability_id}`,
          null,
          { 
            params: { label: form.label, label_es: form.label_es || form.label },
            withCredentials: true 
          }
        );
        toast.success(isEs ? "Capability actualizada" : "Capability updated");
      } else {
        await axios.post(
          `${API}/api/partners/capabilities`,
          null,
          { 
            params: { label: form.label, label_es: form.label_es || form.label },
            withCredentials: true 
          }
        );
        toast.success(isEs ? "Capability creada" : "Capability created");
      }
      setDialogOpen(false);
      fetchCapabilities();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
    setSaving(false);
  };

  const handleDelete = async (capId) => {
    if (!window.confirm(isEs ? "¿Eliminar esta capability?" : "Delete this capability?")) return;
    try {
      await axios.delete(`${API}/api/partners/capabilities/${capId}`, { withCredentials: true });
      toast.success(isEs ? "Capability eliminada" : "Capability deleted");
      fetchCapabilities();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleToggleActive = async (cap) => {
    try {
      await axios.put(
        `${API}/api/partners/capabilities/${cap.capability_id}`,
        null,
        { 
          params: { label: cap.label, label_es: cap.label_es, is_active: !cap.is_active },
          withCredentials: true 
        }
      );
      fetchCapabilities();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                {isEs ? "Capabilities de Partners" : "Partner Capabilities"}
              </CardTitle>
              <CardDescription>
                {isEs 
                  ? "Gestiona las habilidades y servicios que pueden ofrecer tus partners"
                  : "Manage the skills and services your partners can offer"
                }
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchCapabilities}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                {isEs ? "Nueva Capability" : "New Capability"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Custom Capabilities */}
          <div className="mb-6">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4" />
              {isEs ? "Capabilities Personalizadas" : "Custom Capabilities"}
              <Badge variant="secondary">{customCapabilities.length}</Badge>
            </h4>
            {customCapabilities.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                {isEs 
                  ? "No hay capabilities personalizadas. Crea una para agregar servicios específicos de tu negocio."
                  : "No custom capabilities. Create one to add services specific to your business."
                }
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Nombre (EN)" : "Name (EN)"}</TableHead>
                    <TableHead>{isEs ? "Nombre (ES)" : "Name (ES)"}</TableHead>
                    <TableHead>{isEs ? "Activa" : "Active"}</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customCapabilities.map(cap => (
                    <TableRow key={cap.capability_id}>
                      <TableCell className="font-medium">{cap.label}</TableCell>
                      <TableCell>{cap.label_es || cap.label}</TableCell>
                      <TableCell>
                        <Switch
                          checked={cap.is_active}
                          onCheckedChange={() => handleToggleActive(cap)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(cap)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(cap.capability_id)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Default Capabilities */}
          <div>
            <Button 
              variant="ghost" 
              className="w-full justify-between mb-3"
              onClick={() => setShowDefaults(!showDefaults)}
            >
              <span className="flex items-center gap-2">
                {isEs ? "Capabilities Predeterminadas" : "Default Capabilities"}
                <Badge variant="outline">{DEFAULT_CAPABILITIES.length}</Badge>
              </span>
              <span className="text-xs text-muted-foreground">
                {showDefaults ? (isEs ? "Ocultar" : "Hide") : (isEs ? "Mostrar" : "Show")}
              </span>
            </Button>
            {showDefaults && (
              <div className="flex flex-wrap gap-2 p-4 bg-muted/30 rounded-lg">
                {DEFAULT_CAPABILITIES.map(cap => (
                  <Badge key={cap.value} variant="secondary" className="text-xs">
                    {isEs ? cap.label_es : cap.label}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCap 
                ? (isEs ? "Editar Capability" : "Edit Capability")
                : (isEs ? "Nueva Capability" : "New Capability")
              }
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{isEs ? "Nombre (Inglés)" : "Name (English)"} *</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({...form, label: e.target.value})}
                placeholder="e.g. Custom Fabrication"
              />
            </div>
            <div className="space-y-2">
              <Label>{isEs ? "Nombre (Español)" : "Name (Spanish)"}</Label>
              <Input
                value={form.label_es}
                onChange={(e) => setForm({...form, label_es: e.target.value})}
                placeholder="e.g. Fabricación Personalizada"
              />
              <p className="text-xs text-muted-foreground">
                {isEs ? "Si está vacío, se usará el nombre en inglés" : "If empty, English name will be used"}
              </p>
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
