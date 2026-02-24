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
  Edit2, Loader2, Users, UserPlus, X, ShieldCheck, Share2
} from "lucide-react";

import { API_BASE as API } from "../../utils/api"; // Dynamic API URL
import ShareEntityDialog from "../../components/collaboration/ShareEntityDialog";

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

const ACCESS_LEVELS = [
  { value: "view", label: "View Only", labelEs: "Solo Ver" },
  { value: "edit", label: "View & Edit", labelEs: "Ver y Editar" },
];

export default function CampaignsPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [selectedCampaignForAccess, setSelectedCampaignForAccess] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all"); // "all" | "owned" | "shared"
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [selectedCampaignForShare, setSelectedCampaignForShare] = useState(null);
  
  // Role-based access
  const [userRole, setUserRole] = useState(null);
  const [hasFullAccess, setHasFullAccess] = useState(true);
  
  // Access management
  const [campaignAccess, setCampaignAccess] = useState([]);
  const [marketingPartners, setMarketingPartners] = useState([]);
  const [newAccessUserId, setNewAccessUserId] = useState("");
  const [newAccessLevel, setNewAccessLevel] = useState("edit");
  
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
  }, [filterStatus, filterType, scopeFilter]);

  const fetchCampaigns = async () => {
    try {
      // Build URL with scope filter
      let url = `${API}/api/demand-studio/campaigns`;
      const params = [];
      if (filterStatus !== "all") params.push(`status=${filterStatus}`);
      if (filterType !== "all") params.push(`campaign_type=${filterType}`);
      if (scopeFilter !== "all") params.push(`scope=${scopeFilter}`);
      if (params.length) url += `?${params.join("&")}`;
      
      const response = await axios.get(url, { withCredentials: true });
      setCampaigns(response.data || []);
      setHasFullAccess(true);
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

  // Access Management Functions
  const openAccessDialog = async (campaign) => {
    setSelectedCampaignForAccess(campaign);
    setAccessDialogOpen(true);
    
    try {
      const [accessRes, partnersRes] = await Promise.all([
        axios.get(`${API}/api/demand-studio/campaigns/${campaign.campaign_id}/access`, { withCredentials: true }),
        axios.get(`${API}/api/demand-studio/marketing-partners`, { withCredentials: true })
      ]);
      setCampaignAccess(accessRes.data);
      setMarketingPartners(partnersRes.data);
    } catch (error) {
      console.error("Error fetching access data:", error);
    }
  };

  const grantAccess = async () => {
    if (!newAccessUserId || !selectedCampaignForAccess) return;
    
    try {
      await axios.post(`${API}/api/demand-studio/campaigns/${selectedCampaignForAccess.campaign_id}/access`, {
        campaign_id: selectedCampaignForAccess.campaign_id,
        user_id: newAccessUserId,
        access_level: newAccessLevel
      }, { withCredentials: true });
      
      // Refresh access list
      const accessRes = await axios.get(`${API}/api/demand-studio/campaigns/${selectedCampaignForAccess.campaign_id}/access`, { withCredentials: true });
      setCampaignAccess(accessRes.data);
      setNewAccessUserId("");
    } catch (error) {
      console.error("Error granting access:", error);
    }
  };

  const revokeAccess = async (userId) => {
    if (!selectedCampaignForAccess) return;
    
    try {
      await axios.delete(`${API}/api/demand-studio/campaigns/${selectedCampaignForAccess.campaign_id}/access/${userId}`, { withCredentials: true });
      
      // Refresh access list
      const accessRes = await axios.get(`${API}/api/demand-studio/campaigns/${selectedCampaignForAccess.campaign_id}/access`, { withCredentials: true });
      setCampaignAccess(accessRes.data);
    } catch (error) {
      console.error("Error revoking access:", error);
    }
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

  // Check if user can manage this campaign
  const canManage = userRole === "owner" || userRole === "admin";
  const canCreate = canManage; // Only owner/admin can create
  const canEdit = canManage || userRole === "marketing_partner"; // marketing_partner can edit assigned

  // Filter campaigns client-side for status/type
  const filteredCampaigns = campaigns.filter(c => {
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    if (filterType !== "all" && c.campaign_type !== filterType) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="campaigns-page">
      {/* Marketing Partner Banner */}
      {userRole === "marketing_partner" && (
        <Card className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-purple-200 dark:border-purple-800">
          <CardContent className="p-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-600" />
            <span className="text-sm text-purple-700 dark:text-purple-300">
              {isEs 
                ? "Mostrando solo campañas asignadas. Datos financieros ocultos." 
                : "Showing assigned campaigns only. Financial data hidden."}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Filters & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2 flex-wrap">
          {/* Scope Filter - Collaboration */}
          <Select value={scopeFilter} onValueChange={setScopeFilter}>
            <SelectTrigger className="w-[180px]" data-testid="filter-scope">
              <Users className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEs ? "Todas las Campañas" : "All Campaigns"}</SelectItem>
              <SelectItem value="owned">{isEs ? "Mis Campañas" : "My Campaigns"}</SelectItem>
              <SelectItem value="shared">{isEs ? "Compartidas Conmigo" : "Shared With Me"}</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]" data-testid="filter-status">
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
            <SelectTrigger className="w-[160px]" data-testid="filter-type">
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
        
        {canCreate && (
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="new-campaign-button">
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Nueva Campaña" : "New Campaign"}
          </Button>
        )}
      </div>

      {/* Campaigns Grid */}
      {filteredCampaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {userRole === "marketing_partner"
                ? (isEs ? "No tienes campañas asignadas. Contacta a tu administrador." : "You have no assigned campaigns. Contact your admin.")
                : (isEs ? "No hay campañas. Crea una para comenzar." : "No campaigns yet. Create one to get started.")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCampaigns.map(campaign => (
            <Card key={campaign.campaign_id} className="hover:shadow-md transition-shadow" data-testid={`campaign-card-${campaign.campaign_id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{campaign.name}</CardTitle>
                    <div className="flex gap-2 flex-wrap">
                      {getTypeBadge(campaign.campaign_type)}
                      {getStatusBadge(campaign.status)}
                      {campaign._access_type === "shared" && (
                        <Badge variant="outline" className="bg-purple-500/20 text-purple-600 border-purple-500/30">
                          <Users className="w-3 h-3 mr-1" />
                          {campaign._shared_from || (isEs ? "Compartido" : "Shared")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {canManage && campaign._access_type !== "shared" && (
                      <Button variant="ghost" size="icon" onClick={() => openAccessDialog(campaign)} title={isEs ? "Gestionar Acceso" : "Manage Access"}>
                        <Users className="w-4 h-4 text-purple-500" />
                      </Button>
                    )}
                    {canEdit && campaign._access_type !== "shared" && (
                      <Button variant="ghost" size="icon" onClick={() => openEdit(campaign)} data-testid={`edit-campaign-${campaign.campaign_id}`}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    )}
                    {campaign._access_type === "shared" && campaign._permission_level === "edit" && (
                      <Button variant="ghost" size="icon" onClick={() => openEdit(campaign)} data-testid={`edit-campaign-${campaign.campaign_id}`}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    )}
                    {canManage && campaign._access_type !== "shared" && (
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(campaign.campaign_id)} data-testid={`delete-campaign-${campaign.campaign_id}`}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {campaign.objective && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{campaign.objective}</p>
                )}
                
                {/* Financial Data - Hidden for marketing_partner */}
                {hasFullAccess && (
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
                )}

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
                    {campaign.start_date} - {campaign.end_date || (isEs ? "En curso" : "Ongoing")}
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
                data-testid="campaign-name-input"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Tipo" : "Type"}</label>
                <Select 
                  value={formData.campaign_type} 
                  onValueChange={(v) => setFormData({ ...formData, campaign_type: v })}
                >
                  <SelectTrigger data-testid="campaign-type-select">
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
                  <SelectTrigger data-testid="campaign-status-select">
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
            
            {/* Budget - Only for non-marketing_partner */}
            {(canManage || !editingCampaign) && (
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
            )}
            
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
            <Button onClick={handleSave} disabled={!formData.name} data-testid="save-campaign-button">
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Access Management Dialog */}
      <Dialog open={accessDialogOpen} onOpenChange={setAccessDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-500" />
              {isEs ? "Gestionar Acceso" : "Manage Access"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isEs 
                ? `Asigna Marketing Partners a "${selectedCampaignForAccess?.name}"` 
                : `Assign Marketing Partners to "${selectedCampaignForAccess?.name}"`}
            </p>
            
            {/* Add New Access */}
            <div className="flex gap-2">
              <Select value={newAccessUserId} onValueChange={setNewAccessUserId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={isEs ? "Seleccionar usuario..." : "Select user..."} />
                </SelectTrigger>
                <SelectContent>
                  {marketingPartners
                    .filter(p => !campaignAccess.find(a => a.user_id === p.user_id))
                    .map(partner => (
                      <SelectItem key={partner.user_id} value={partner.user_id}>
                        {partner.name || partner.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              
              <Select value={newAccessLevel} onValueChange={setNewAccessLevel}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_LEVELS.map(level => (
                    <SelectItem key={level.value} value={level.value}>
                      {isEs ? level.labelEs : level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button onClick={grantAccess} disabled={!newAccessUserId}>
                <UserPlus className="w-4 h-4" />
              </Button>
            </div>
            
            {marketingPartners.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {isEs 
                  ? "No hay Marketing Partners. Crea uno desde Configuración > Equipo." 
                  : "No Marketing Partners. Create one from Settings > Team."}
              </p>
            )}
            
            {/* Current Access List */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {isEs ? "Usuarios con acceso" : "Users with access"}
              </label>
              
              {campaignAccess.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {isEs ? "No hay usuarios asignados" : "No users assigned"}
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {campaignAccess.map(access => (
                    <div 
                      key={access.user_id} 
                      className="flex items-center justify-between p-2 bg-muted rounded-lg"
                    >
                      <div>
                        <p className="text-sm font-medium">{access.user_name || access.user_email}</p>
                        <p className="text-xs text-muted-foreground">{access.user_email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {ACCESS_LEVELS.find(l => l.value === access.access_level)?.[isEs ? 'labelEs' : 'label'] || access.access_level}
                        </Badge>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => revokeAccess(access.user_id)}
                          className="h-8 w-8"
                        >
                          <X className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAccessDialogOpen(false)}>
              {isEs ? "Cerrar" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
