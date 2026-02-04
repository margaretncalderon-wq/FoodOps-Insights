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
  Plus, Target, Calendar, DollarSign, Trash2, 
  Edit2, Loader2, MoreHorizontal, Eye
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const CAMPAIGN_TYPES = [
  { value: "brand", label: "Brand Awareness", labelEs: "Reconocimiento de Marca" },
  { value: "acquisition", label: "Acquisition", labelEs: "Adquisición" },
  { value: "retention", label: "Retention", labelEs: "Retención" },
  { value: "reactivation", label: "Reactivation", labelEs: "Reactivación" },
];

const CAMPAIGN_STATUSES = [
  { value: "draft", label: "Draft", labelEs: "Borrador", color: "bg-gray-100 text-gray-800" },
  { value: "active", label: "Active", labelEs: "Activa", color: "bg-green-100 text-green-800" },
  { value: "paused", label: "Paused", labelEs: "Pausada", color: "bg-yellow-100 text-yellow-800" },
  { value: "completed", label: "Completed", labelEs: "Completada", color: "bg-blue-100 text-blue-800" },
];

export default function CampaignsPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  
  const [formData, setFormData] = useState({
    name: "",
    campaign_type: "acquisition",
    objective: "",
    start_date: "",
    end_date: "",
    budget: 0,
    status: "draft",
    tags: [],
    notes: ""
  });

  useEffect(() => {
    fetchCampaigns();
  }, [filterStatus, filterType]);

  const fetchCampaigns = async () => {
    try {
      let url = `${API}/api/demand-studio/campaigns`;
      const params = [];
      if (filterStatus !== "all") params.push(`status=${filterStatus}`);
      if (filterType !== "all") params.push(`campaign_type=${filterType}`);
      if (params.length) url += `?${params.join("&")}`;
      
      const response = await axios.get(url, { withCredentials: true });
      setCampaigns(response.data);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      if (editingCampaign) {
        await axios.put(`${API}/api/demand-studio/campaigns/${editingCampaign.campaign_id}`, formData, { withCredentials: true });
      } else {
        await axios.post(`${API}/api/demand-studio/campaigns`, formData, { withCredentials: true });
      }
      setDialogOpen(false);
      setEditingCampaign(null);
      resetForm();
      fetchCampaigns();
    } catch (error) {
      console.error("Error saving campaign:", error);
    }
  };

  const handleDelete = async (campaignId) => {
    if (!window.confirm(isEs ? "¿Eliminar esta campaña?" : "Delete this campaign?")) return;
    try {
      await axios.delete(`${API}/api/demand-studio/campaigns/${campaignId}`, { withCredentials: true });
      fetchCampaigns();
    } catch (error) {
      console.error("Error deleting campaign:", error);
    }
  };

  const openEdit = (campaign) => {
    setEditingCampaign(campaign);
    setFormData({
      name: campaign.name,
      campaign_type: campaign.campaign_type,
      objective: campaign.objective || "",
      start_date: campaign.start_date || "",
      end_date: campaign.end_date || "",
      budget: campaign.budget || 0,
      status: campaign.status,
      tags: campaign.tags || [],
      notes: campaign.notes || ""
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      campaign_type: "acquisition",
      objective: "",
      start_date: "",
      end_date: "",
      budget: 0,
      status: "draft",
      tags: [],
      notes: ""
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
  };

  const getStatusBadge = (status) => {
    const s = CAMPAIGN_STATUSES.find(st => st.value === status);
    return s ? (
      <Badge className={s.color}>{isEs ? s.labelEs : s.label}</Badge>
    ) : <Badge>{status}</Badge>;
  };

  const getTypeBadge = (type) => {
    const t = CAMPAIGN_TYPES.find(ct => ct.value === type);
    return t ? (
      <Badge variant="outline">{isEs ? t.labelEs : t.label}</Badge>
    ) : <Badge variant="outline">{type}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="campaigns-page">
      {/* Filters & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={isEs ? "Estado" : "Status"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
              {CAMPAIGN_STATUSES.map(s => (
                <SelectItem key={s.value} value={s.value}>{isEs ? s.labelEs : s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={isEs ? "Tipo" : "Type"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
              {CAMPAIGN_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{isEs ? t.labelEs : t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="new-campaign-btn">
          <Plus className="w-4 h-4 mr-2" />
          {isEs ? "Nueva Campaña" : "New Campaign"}
        </Button>
      </div>

      {/* Campaigns Grid */}
      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {isEs ? "No hay campañas. Crea una para comenzar." : "No campaigns yet. Create one to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map(campaign => (
            <Card key={campaign.campaign_id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{campaign.name}</CardTitle>
                    <div className="flex gap-2">
                      {getTypeBadge(campaign.campaign_type)}
                      {getStatusBadge(campaign.status)}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(campaign)} data-testid={`edit-campaign-${campaign.campaign_id}`}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(campaign.campaign_id)} data-testid={`delete-campaign-${campaign.campaign_id}`}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {campaign.objective && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{campaign.objective}</p>
                )}
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">{isEs ? "Presupuesto" : "Budget"}</p>
                    <p className="font-semibold">{formatCurrency(campaign.budget)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{isEs ? "Gastado" : "Spent"}</p>
                    <p className="font-semibold">{formatCurrency(campaign.actual_spend)}</p>
                  </div>
                </div>

                <div className="flex gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">{isEs ? "Leads:" : "Leads:"}</span>
                    <span className="font-medium">{campaign.leads_linked || 0}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">{isEs ? "Oport.:" : "Opps:"}</span>
                    <span className="font-medium">{campaign.opportunities_linked || 0}</span>
                  </div>
                </div>

                {campaign.start_date && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {campaign.start_date} - {campaign.end_date || "Ongoing"}
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
              {editingCampaign 
                ? (isEs ? "Editar Campaña" : "Edit Campaign")
                : (isEs ? "Nueva Campaña" : "New Campaign")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Nombre" : "Name"} *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={isEs ? "Nombre de la campaña" : "Campaign name"}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Tipo" : "Type"}</label>
                <Select 
                  value={formData.campaign_type} 
                  onValueChange={(v) => setFormData({ ...formData, campaign_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPAIGN_TYPES.map(t => (
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
                    {CAMPAIGN_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{isEs ? s.labelEs : s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Objetivo" : "Objective"}</label>
              <Input
                value={formData.objective}
                onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                placeholder={isEs ? "Objetivo de la campaña" : "Campaign objective"}
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
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="cancel-campaign-btn">
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSave} disabled={!formData.name} data-testid="save-campaign-btn">
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
