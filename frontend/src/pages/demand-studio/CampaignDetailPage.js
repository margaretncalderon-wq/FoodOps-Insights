// pages/demand-studio/CampaignDetailPage.js
// Campaign detail view with multi-channel management

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  ArrowLeft, Target, Calendar, DollarSign, Users, 
  Megaphone, Mail, Share2, BarChart3, Plus, Edit2,
  Loader2, Copy, Link2, Check, Zap, Image,
  FileText, Clock, TrendingUp, ExternalLink, Trash2
} from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

const STATUS_CONFIG = {
  draft: { label: "Draft", labelEs: "Borrador", color: "bg-gray-500/20 text-gray-400" },
  active: { label: "Active", labelEs: "Activo", color: "bg-green-500/20 text-green-400" },
  paused: { label: "Paused", labelEs: "Pausado", color: "bg-yellow-500/20 text-yellow-400" },
  completed: { label: "Completed", labelEs: "Completado", color: "bg-blue-500/20 text-blue-400" },
};

const CAMPAIGN_TYPES = {
  brand: { label: "Brand Awareness", labelEs: "Reconocimiento de Marca" },
  acquisition: { label: "Acquisition", labelEs: "Adquisición" },
  retention: { label: "Retention", labelEs: "Retención" },
  reactivation: { label: "Reactivation", labelEs: "Reactivación" },
};

export default function CampaignDetailPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [copied, setCopied] = useState(false);
  
  // Related data
  const [activations, setActivations] = useState([]);
  const [socialPosts, setSocialPosts] = useState([]);
  const [spendRecords, setSpendRecords] = useState([]);
  const [linkedLeads, setLinkedLeads] = useState([]);
  
  // Dialogs
  const [showActivationDialog, setShowActivationDialog] = useState(false);
  const [showSpendDialog, setShowSpendDialog] = useState(false);
  
  // Form data
  const [newActivation, setNewActivation] = useState({
    name: "",
    type: "event",
    start_date: "",
    end_date: "",
    budget: 0,
    notes: ""
  });
  const [newSpend, setNewSpend] = useState({
    description: "",
    amount: 0,
    category: "online",
    date: new Date().toISOString().split('T')[0]
  });

  const fetchCampaign = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/demand-studio/campaigns/${campaignId}`, { withCredentials: true });
      setCampaign(res.data);
    } catch (error) {
      console.error("Error fetching campaign:", error);
      toast.error(isEs ? "Error al cargar campaña" : "Error loading campaign");
      navigate("/demand-studio/campaigns");
    } finally {
      setLoading(false);
    }
  }, [campaignId, isEs, navigate]);

  const fetchRelatedData = useCallback(async () => {
    if (!campaign) return;
    
    try {
      // Fetch activations for this campaign
      const [activationsRes, spendRes, leadsRes] = await Promise.all([
        axios.get(`${API}/api/demand-studio/activations?campaign_id=${campaignId}`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/demand-studio/spend?campaign_id=${campaignId}`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/crm/leads?campaign_id=${campaignId}`, { withCredentials: true }).catch(() => ({ data: [] }))
      ]);
      
      setActivations(activationsRes.data || []);
      setSpendRecords(spendRes.data || []);
      setLinkedLeads(Array.isArray(leadsRes.data) ? leadsRes.data : []);
    } catch (error) {
      console.error("Error fetching related data:", error);
    }
  }, [campaign, campaignId]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  useEffect(() => {
    if (campaign) {
      fetchRelatedData();
    }
  }, [campaign, fetchRelatedData]);

  const copyTrackingLink = async () => {
    if (!campaign?.campaign_code) return;
    const url = `${window.location.origin}/lead?campaign_code=${campaign.campaign_code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(isEs ? "Link copiado" : "Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error(isEs ? "Error al copiar" : "Failed to copy");
    }
  };

  const handleCreateActivation = async () => {
    if (!newActivation.name) return;
    try {
      await axios.post(`${API}/api/demand-studio/activations`, {
        ...newActivation,
        campaign_id: campaignId
      }, { withCredentials: true });
      toast.success(isEs ? "Activación creada" : "Activation created");
      setShowActivationDialog(false);
      setNewActivation({ name: "", type: "event", start_date: "", end_date: "", budget: 0, notes: "" });
      fetchRelatedData();
    } catch (error) {
      toast.error(isEs ? "Error al crear activación" : "Error creating activation");
    }
  };

  const handleCreateSpend = async () => {
    if (!newSpend.description || !newSpend.amount) return;
    try {
      await axios.post(`${API}/api/demand-studio/spend`, {
        ...newSpend,
        campaign_id: campaignId
      }, { withCredentials: true });
      toast.success(isEs ? "Gasto registrado" : "Spend recorded");
      setShowSpendDialog(false);
      setNewSpend({ description: "", amount: 0, category: "online", date: new Date().toISOString().split('T')[0] });
      fetchRelatedData();
      fetchCampaign(); // Refresh to update actual_spend
    } catch (error) {
      toast.error(isEs ? "Error al registrar gasto" : "Error recording spend");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (!campaign) {
    return null;
  }

  const statusConfig = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.draft;
  const typeConfig = CAMPAIGN_TYPES[campaign.campaign_type] || CAMPAIGN_TYPES.brand;
  const totalSpend = spendRecords.reduce((sum, s) => sum + (s.amount || 0), 0);

  return (
    <div className="space-y-6" data-testid="campaign-detail-page">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/demand-studio/campaigns")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{campaign.name}</h1>
              <Badge className={statusConfig.color}>
                {isEs ? statusConfig.labelEs : statusConfig.label}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              {isEs ? typeConfig.labelEs : typeConfig.label}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {campaign.campaign_code && (
            <Button variant="outline" size="sm" onClick={copyTrackingLink}>
              {copied ? <Check className="w-4 h-4 mr-2 text-green-500" /> : <Link2 className="w-4 h-4 mr-2" />}
              {campaign.campaign_code}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate(`/demand-studio/campaigns?edit=${campaignId}`)}>
            <Edit2 className="w-4 h-4 mr-2" />
            {isEs ? "Editar" : "Edit"}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase">{isEs ? "Presupuesto" : "Budget"}</p>
                <p className="text-xl font-bold">${campaign.budget?.toLocaleString() || 0}</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase">{isEs ? "Gastado" : "Spent"}</p>
                <p className="text-xl font-bold">${totalSpend.toLocaleString()}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-orange-500/50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Leads</p>
                <p className="text-xl font-bold">{campaign.leads_linked || linkedLeads.length || 0}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase">{isEs ? "Activaciones" : "Activations"}</p>
                <p className="text-xl font-bold">{activations.length}</p>
              </div>
              <Zap className="w-8 h-8 text-purple-500/50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase">{isEs ? "Oportunidades" : "Opportunities"}</p>
                <p className="text-xl font-bold">{campaign.opportunities_linked || 0}</p>
              </div>
              <Target className="w-8 h-8 text-pink-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="overview" className="data-[state=active]:bg-card">
            <BarChart3 className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="activations" className="data-[state=active]:bg-card">
            <Zap className="w-4 h-4 mr-2" />
            {isEs ? "Activaciones" : "Activations"} ({activations.length})
          </TabsTrigger>
          <TabsTrigger value="social" className="data-[state=active]:bg-card">
            <Share2 className="w-4 h-4 mr-2" />
            Social Media
          </TabsTrigger>
          <TabsTrigger value="spend" className="data-[state=active]:bg-card">
            <DollarSign className="w-4 h-4 mr-2" />
            Spend ({spendRecords.length})
          </TabsTrigger>
          <TabsTrigger value="leads" className="data-[state=active]:bg-card">
            <Users className="w-4 h-4 mr-2" />
            Leads ({linkedLeads.length})
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{isEs ? "Detalles" : "Details"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {campaign.objective && (
                  <div>
                    <label className="text-xs text-muted-foreground">{isEs ? "Objetivo" : "Objective"}</label>
                    <p className="text-sm">{campaign.objective}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground">{isEs ? "Inicio" : "Start"}</label>
                    <p className="text-sm">{campaign.start_date || "-"}</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{isEs ? "Fin" : "End"}</label>
                    <p className="text-sm">{campaign.end_date || "-"}</p>
                  </div>
                </div>
                {campaign.notes && (
                  <div>
                    <label className="text-xs text-muted-foreground">{isEs ? "Notas" : "Notes"}</label>
                    <p className="text-sm">{campaign.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{isEs ? "Tracking" : "Tracking"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">{isEs ? "Código de Campaña" : "Campaign Code"}</label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="bg-muted px-2 py-1 rounded text-sm">{campaign.campaign_code}</code>
                    <Button variant="ghost" size="sm" onClick={copyTrackingLink}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Tracking URL</label>
                  <p className="text-xs text-muted-foreground font-mono break-all mt-1">
                    {window.location.origin}/lead?campaign_code={campaign.campaign_code}
                  </p>
                </div>
                {campaign.channel_type && (
                  <div>
                    <label className="text-xs text-muted-foreground">{isEs ? "Tipo de Canal" : "Channel Type"}</label>
                    <Badge variant="outline" className="mt-1 capitalize">{campaign.channel_type}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Activations Tab */}
        <TabsContent value="activations" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">{isEs ? "Activaciones" : "Activations"}</CardTitle>
                <CardDescription>{isEs ? "Eventos, promociones y actividades de la campaña" : "Campaign events, promotions, and activities"}</CardDescription>
              </div>
              <Button onClick={() => setShowActivationDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {isEs ? "Nueva Activación" : "New Activation"}
              </Button>
            </CardHeader>
            <CardContent>
              {activations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Zap className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{isEs ? "No hay activaciones" : "No activations yet"}</p>
                  <p className="text-sm">{isEs ? "Crea eventos, promociones o actividades para esta campaña" : "Create events, promotions, or activities for this campaign"}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activations.map((activation) => (
                    <div key={activation.activation_id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                          <Zap className="w-5 h-5 text-purple-500" />
                        </div>
                        <div>
                          <p className="font-medium">{activation.name}</p>
                          <p className="text-sm text-muted-foreground">{activation.type} • {activation.start_date || "No date"}</p>
                        </div>
                      </div>
                      <Badge variant="outline">${activation.budget?.toLocaleString() || 0}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Social Media Tab */}
        <TabsContent value="social" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Social Media</CardTitle>
                <CardDescription>{isEs ? "Posts y contenido de redes sociales" : "Social media posts and content"}</CardDescription>
              </div>
              <Button onClick={() => navigate("/demand-studio/social-media")}>
                <ExternalLink className="w-4 h-4 mr-2" />
                {isEs ? "Ir a Social Media" : "Go to Social Media"}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Share2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{isEs ? "Gestiona contenido social desde el módulo Social Media" : "Manage social content from the Social Media module"}</p>
                <Button variant="link" onClick={() => navigate("/demand-studio/social-media")}>
                  {isEs ? "Ir a Social Media →" : "Go to Social Media →"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Spend Tab */}
        <TabsContent value="spend" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Spend Ledger</CardTitle>
                <CardDescription>{isEs ? "Registro de gastos de la campaña" : "Campaign expense records"}</CardDescription>
              </div>
              <Button onClick={() => setShowSpendDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {isEs ? "Registrar Gasto" : "Record Spend"}
              </Button>
            </CardHeader>
            <CardContent>
              {spendRecords.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{isEs ? "No hay gastos registrados" : "No spend records yet"}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {spendRecords.map((spend) => (
                    <div key={spend.spend_id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{spend.description}</p>
                        <p className="text-sm text-muted-foreground">{spend.category} • {spend.date}</p>
                      </div>
                      <span className="font-semibold">${spend.amount?.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-3 border-t mt-3">
                    <span className="font-medium">{isEs ? "Total" : "Total"}</span>
                    <span className="font-bold">${totalSpend.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leads Tab */}
        <TabsContent value="leads" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{isEs ? "Leads Vinculados" : "Linked Leads"}</CardTitle>
              <CardDescription>{isEs ? "Leads atribuidos a esta campaña" : "Leads attributed to this campaign"}</CardDescription>
            </CardHeader>
            <CardContent>
              {linkedLeads.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{isEs ? "No hay leads vinculados" : "No linked leads yet"}</p>
                  <p className="text-sm">{isEs ? "Los leads se vincularán automáticamente usando el código de campaña" : "Leads will be automatically linked using the campaign code"}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {linkedLeads.slice(0, 10).map((lead) => (
                    <div key={lead.lead_id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{lead.lead_name || lead.email}</p>
                        <p className="text-sm text-muted-foreground">{lead.source} • {lead.attribution_source || "manual"}</p>
                      </div>
                      <Badge variant="outline">{lead.status}</Badge>
                    </div>
                  ))}
                  {linkedLeads.length > 10 && (
                    <p className="text-center text-sm text-muted-foreground">
                      +{linkedLeads.length - 10} {isEs ? "más" : "more"}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* New Activation Dialog */}
      <Dialog open={showActivationDialog} onOpenChange={setShowActivationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Nueva Activación" : "New Activation"}</DialogTitle>
            <DialogDescription>{isEs ? "Crea un evento o promoción para esta campaña" : "Create an event or promotion for this campaign"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Nombre" : "Name"}</label>
              <Input 
                value={newActivation.name} 
                onChange={(e) => setNewActivation({...newActivation, name: e.target.value})}
                placeholder={isEs ? "Ej: Evento de lanzamiento" : "E.g., Launch event"}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Tipo" : "Type"}</label>
              <Select value={newActivation.type} onValueChange={(v) => setNewActivation({...newActivation, type: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="event">{isEs ? "Evento" : "Event"}</SelectItem>
                  <SelectItem value="promotion">{isEs ? "Promoción" : "Promotion"}</SelectItem>
                  <SelectItem value="webinar">Webinar</SelectItem>
                  <SelectItem value="contest">{isEs ? "Concurso" : "Contest"}</SelectItem>
                  <SelectItem value="other">{isEs ? "Otro" : "Other"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha Inicio" : "Start Date"}</label>
                <Input type="date" value={newActivation.start_date} onChange={(e) => setNewActivation({...newActivation, start_date: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha Fin" : "End Date"}</label>
                <Input type="date" value={newActivation.end_date} onChange={(e) => setNewActivation({...newActivation, end_date: e.target.value})} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Presupuesto" : "Budget"}</label>
              <Input type="number" value={newActivation.budget} onChange={(e) => setNewActivation({...newActivation, budget: parseFloat(e.target.value) || 0})} />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Notas" : "Notes"}</label>
              <Textarea value={newActivation.notes} onChange={(e) => setNewActivation({...newActivation, notes: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActivationDialog(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleCreateActivation}>{isEs ? "Crear" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Spend Dialog */}
      <Dialog open={showSpendDialog} onOpenChange={setShowSpendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Registrar Gasto" : "Record Spend"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Descripción" : "Description"}</label>
              <Input 
                value={newSpend.description} 
                onChange={(e) => setNewSpend({...newSpend, description: e.target.value})}
                placeholder={isEs ? "Ej: Facebook Ads" : "E.g., Facebook Ads"}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Monto" : "Amount"}</label>
              <Input type="number" value={newSpend.amount} onChange={(e) => setNewSpend({...newSpend, amount: parseFloat(e.target.value) || 0})} />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Categoría" : "Category"}</label>
              <Select value={newSpend.category} onValueChange={(v) => setNewSpend({...newSpend, category: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                  <SelectItem value="production">{isEs ? "Producción" : "Production"}</SelectItem>
                  <SelectItem value="other">{isEs ? "Otro" : "Other"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Fecha" : "Date"}</label>
              <Input type="date" value={newSpend.date} onChange={(e) => setNewSpend({...newSpend, date: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSpendDialog(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleCreateSpend}>{isEs ? "Registrar" : "Record"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
