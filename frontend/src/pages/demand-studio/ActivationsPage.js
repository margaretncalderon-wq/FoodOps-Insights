import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { 
  Plus, Zap, Calendar, MapPin, DollarSign, 
  Trash2, Edit2, Loader2
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const ACTIVATION_TYPES = [
  { value: "event", label: "Event", labelEs: "Evento" },
  { value: "promo", label: "Promotion", labelEs: "Promoción" },
  { value: "partnership", label: "Partnership", labelEs: "Alianza" },
  { value: "sampling", label: "Sampling", labelEs: "Degustación" },
  { value: "popup", label: "Pop-up", labelEs: "Pop-up" },
  { value: "webinar", label: "Webinar", labelEs: "Webinar" },
  { value: "other", label: "Other", labelEs: "Otro" },
];

const ACTIVATION_STATUSES = [
  { value: "planned", label: "Planned", labelEs: "Planificado", color: "bg-blue-100 text-blue-800" },
  { value: "active", label: "Active", labelEs: "Activo", color: "bg-green-100 text-green-800" },
  { value: "completed", label: "Completed", labelEs: "Completado", color: "bg-gray-100 text-gray-800" },
  { value: "cancelled", label: "Cancelled", labelEs: "Cancelado", color: "bg-red-100 text-red-800" },
];

export default function ActivationsPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [activations, setActivations] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingActivation, setEditingActivation] = useState(null);
  
  const [formData, setFormData] = useState({
    name: "",
    activation_type: "event",
    campaign_id: "",
    start_date: "",
    end_date: "",
    location: "",
    budget: 0,
    status: "planned",
    notes: ""
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [activationsRes, campaignsRes] = await Promise.all([
        axios.get(`${API}/api/demand-studio/activations`, { withCredentials: true }),
        axios.get(`${API}/api/demand-studio/campaigns`, { withCredentials: true })
      ]);
      setActivations(activationsRes.data);
      setCampaigns(campaignsRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const payload = { ...formData };
      if (!payload.campaign_id) delete payload.campaign_id;
      
      if (editingActivation) {
        await axios.put(`${API}/api/demand-studio/activations/${editingActivation.activation_id}`, payload, { withCredentials: true });
      } else {
        await axios.post(`${API}/api/demand-studio/activations`, payload, { withCredentials: true });
      }
      setDialogOpen(false);
      setEditingActivation(null);
      resetForm();
      fetchData();
    } catch (error) {
      console.error("Error saving activation:", error);
    }
  };

  const handleDelete = async (activationId) => {
    if (!window.confirm(isEs ? "¿Eliminar esta activación?" : "Delete this activation?")) return;
    try {
      await axios.delete(`${API}/api/demand-studio/activations/${activationId}`, { withCredentials: true });
      fetchData();
    } catch (error) {
      console.error("Error deleting activation:", error);
    }
  };

  const openEdit = (activation) => {
    setEditingActivation(activation);
    setFormData({
      name: activation.name,
      activation_type: activation.activation_type,
      campaign_id: activation.campaign_id || "",
      start_date: activation.start_date || "",
      end_date: activation.end_date || "",
      location: activation.location || "",
      budget: activation.budget || 0,
      status: activation.status,
      notes: activation.notes || ""
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      activation_type: "event",
      campaign_id: "",
      start_date: "",
      end_date: "",
      location: "",
      budget: 0,
      status: "planned",
      notes: ""
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
  };

  const getStatusBadge = (status) => {
    const s = ACTIVATION_STATUSES.find(st => st.value === status);
    return s ? (
      <Badge className={s.color}>{isEs ? s.labelEs : s.label}</Badge>
    ) : <Badge>{status}</Badge>;
  };

  const getTypeBadge = (type) => {
    const t = ACTIVATION_TYPES.find(at => at.value === type);
    return t ? (
      <Badge variant="outline">{isEs ? t.labelEs : t.label}</Badge>
    ) : <Badge variant="outline">{type}</Badge>;
  };

  const getCampaignName = (campaignId) => {
    const campaign = campaigns.find(c => c.campaign_id === campaignId);
    return campaign ? campaign.name : "-";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="activations-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {isEs ? "Activaciones de Marketing" : "Marketing Activations"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Eventos, promociones y actividades de campo" : "Events, promotions, and field activities"}
          </p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          {isEs ? "Nueva Activación" : "New Activation"}
        </Button>
      </div>

      {/* Activations Grid */}
      {activations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Zap className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {isEs ? "No hay activaciones. Crea una para comenzar." : "No activations yet. Create one to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activations.map(activation => (
            <Card key={activation.activation_id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{activation.name}</CardTitle>
                    <div className="flex gap-2">
                      {getTypeBadge(activation.activation_type)}
                      {getStatusBadge(activation.status)}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(activation)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(activation.activation_id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {activation.campaign_id && (
                  <p className="text-sm text-muted-foreground">
                    {isEs ? "Campaña:" : "Campaign:"} {getCampaignName(activation.campaign_id)}
                  </p>
                )}
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">{isEs ? "Presupuesto" : "Budget"}</p>
                    <p className="font-semibold">{formatCurrency(activation.budget)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{isEs ? "Gastado" : "Spent"}</p>
                    <p className="font-semibold">{formatCurrency(activation.actual_spend)}</p>
                  </div>
                </div>

                {activation.location && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    {activation.location}
                  </div>
                )}

                {activation.start_date && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {activation.start_date} - {activation.end_date || isEs ? "En curso" : "Ongoing"}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingActivation 
                ? (isEs ? "Editar Activación" : "Edit Activation")
                : (isEs ? "Nueva Activación" : "New Activation")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Nombre" : "Name"} *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={isEs ? "Nombre de la activación" : "Activation name"}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Tipo" : "Type"}</label>
                <Select 
                  value={formData.activation_type} 
                  onValueChange={(v) => setFormData({ ...formData, activation_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVATION_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{isEs ? t.labelEs : t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Estado" : "Status"}</label>
                <Select 
                  value={formData.status} 
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVATION_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{isEs ? s.labelEs : s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Campaña" : "Campaign"}</label>
              <Select 
                value={formData.campaign_id || "none"} 
                onValueChange={(v) => setFormData({ ...formData, campaign_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar campaña" : "Select campaign"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Sin campaña" : "No campaign"}</SelectItem>
                  {campaigns.map(c => (
                    <SelectItem key={c.campaign_id} value={c.campaign_id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Ubicación" : "Location"}</label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder={isEs ? "Lugar del evento" : "Event location"}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha Inicio" : "Start Date"}</label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha Fin" : "End Date"}</label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Presupuesto" : "Budget"}</label>
              <Input
                type="number"
                value={formData.budget}
                onChange={(e) => setFormData({ ...formData, budget: parseFloat(e.target.value) || 0 })}
                min="0"
                step="100"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Notas" : "Notes"}</label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder={isEs ? "Notas adicionales" : "Additional notes"}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSave} disabled={!formData.name}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
