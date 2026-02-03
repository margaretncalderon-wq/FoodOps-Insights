import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "../../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import {
  Users, Phone, Mail, Building2, Search, Plus,
  Calendar, Clock, MessageSquare, Edit, Trash2,
  TrendingUp, AlertCircle, Loader2, DollarSign, Target
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

// Pipeline stages for platform sales
const STATUS_CONFIG = {
  new: { label: "Nuevo", color: "bg-slate-500" },
  contacted: { label: "Contactado", color: "bg-blue-500" },
  qualified: { label: "Calificado", color: "bg-purple-500" },
  demo: { label: "Demo", color: "bg-cyan-500" },
  proposal: { label: "Propuesta", color: "bg-orange-500" },
  negotiation: { label: "Negociación", color: "bg-amber-500" },
  won: { label: "Ganado", color: "bg-green-500" },
  lost: { label: "Perdido", color: "bg-red-500" }
};

const SOURCE_OPTIONS = [
  { value: "website", label: "Website" },
  { value: "referral", label: "Referido" },
  { value: "outbound", label: "Outbound" },
  { value: "event", label: "Evento" },
  { value: "partner", label: "Partner" }
];

const COMPANY_SIZE_OPTIONS = [
  { value: "1-10", label: "1-10 empleados" },
  { value: "11-50", label: "11-50 empleados" },
  { value: "51-200", label: "51-200 empleados" },
  { value: "200+", label: "200+ empleados" }
];

const PLAN_OPTIONS = [
  { value: "starter", label: "Starter" },
  { value: "professional", label: "Professional" },
  { value: "enterprise", label: "Enterprise" }
];

export default function CRMPage() {
  const [prospects, setProspects] = useState([]);
  const [stats, setStats] = useState(null);
  const [followUps, setFollowUps] = useState({ overdue: [], today: [], upcoming: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [showProspectDialog, setShowProspectDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [prospectLogs, setProspectLogs] = useState([]);
  const [newLog, setNewLog] = useState({ type: "note", content: "" });
  const [formData, setFormData] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    industry: "",
    company_size: "",
    source: "website",
    status: "new",
    notes: "",
    estimated_mrr: "",
    next_follow_up: "",
    interest_level: "warm",
    plan_interest: "professional"
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [prospectsRes, followUpsRes, statsRes] = await Promise.all([
        axios.get(`${API}/api/super-admin/crm/prospects`, { withCredentials: true }),
        axios.get(`${API}/api/super-admin/crm/follow-ups`, { withCredentials: true }),
        axios.get(`${API}/api/super-admin/crm/stats`, { withCredentials: true })
      ]);
      setProspects(prospectsRes.data.prospects);
      setStats(statsRes.data);
      setFollowUps(followUpsRes.data);
    } catch (err) {
      console.error(err);
      toast.error("Error loading CRM data");
    }
    setLoading(false);
  };

  const handleCreateProspect = async () => {
    try {
      const payload = {
        ...formData,
        estimated_mrr: formData.estimated_mrr ? parseFloat(formData.estimated_mrr) : null
      };
      await axios.post(`${API}/api/super-admin/crm/prospects`, payload, { withCredentials: true });
      toast.success("Prospecto creado");
      setShowProspectDialog(false);
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error creating prospect");
    }
  };

  const handleUpdateProspect = async () => {
    try {
      const payload = {
        ...formData,
        estimated_mrr: formData.estimated_mrr ? parseFloat(formData.estimated_mrr) : null
      };
      await axios.put(`${API}/api/super-admin/crm/prospects/${selectedProspect.prospect_id}`, payload, { withCredentials: true });
      toast.success("Prospecto actualizado");
      setShowProspectDialog(false);
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error updating prospect");
    }
  };

  const handleDeleteProspect = async (prospectId) => {
    if (!window.confirm("¿Eliminar este prospecto?")) return;
    try {
      await axios.delete(`${API}/api/super-admin/crm/prospects/${prospectId}`, { withCredentials: true });
      toast.success("Prospecto eliminado");
      fetchData();
    } catch (err) {
      toast.error("Error deleting prospect");
    }
  };

  const handleViewProspect = async (prospect) => {
    setSelectedProspect(prospect);
    try {
      const res = await axios.get(`${API}/api/super-admin/crm/prospects/${prospect.prospect_id}`, { withCredentials: true });
      setSelectedProspect(res.data.prospect);
      setProspectLogs(res.data.logs || []);
      setShowDetailDialog(true);
    } catch (err) {
      toast.error("Error loading prospect details");
    }
  };

  const handleAddLog = async () => {
    if (!newLog.content.trim()) return;
    try {
      await axios.post(
        `${API}/api/super-admin/crm/prospects/${selectedProspect.prospect_id}/activity`,
        newLog,
        { withCredentials: true }
      );
      toast.success("Actividad agregada");
      setNewLog({ type: "note", content: "" });
      const res = await axios.get(`${API}/api/super-admin/crm/prospects/${selectedProspect.prospect_id}`, { withCredentials: true });
      setProspectLogs(res.data.logs || []);
    } catch (err) {
      toast.error("Error adding activity");
    }
  };

  const handleEditProspect = (prospect) => {
    setSelectedProspect(prospect);
    setFormData({
      company_name: prospect.company_name || "",
      contact_name: prospect.contact_name || "",
      email: prospect.email || "",
      phone: prospect.phone || "",
      industry: prospect.industry || "",
      company_size: prospect.company_size || "",
      source: prospect.source || "website",
      status: prospect.status || "new",
      notes: prospect.notes || "",
      estimated_mrr: prospect.estimated_mrr?.toString() || "",
      next_follow_up: prospect.next_follow_up || "",
      interest_level: prospect.interest_level || "warm",
      plan_interest: prospect.plan_interest || "professional"
    });
    setShowProspectDialog(true);
  };

  const resetForm = () => {
    setSelectedProspect(null);
    setFormData({
      company_name: "",
      contact_name: "",
      email: "",
      phone: "",
      industry: "",
      company_size: "",
      source: "website",
      status: "new",
      notes: "",
      estimated_mrr: "",
      next_follow_up: "",
      interest_level: "warm",
      plan_interest: "professional"
    });
  };

  const filteredProspects = prospects.filter(prospect => {
    const matchesSearch = !searchQuery || 
      prospect.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prospect.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prospect.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTab = activeTab === "all" || prospect.status === activeTab;
    
    return matchesSearch && matchesTab;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="crm-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pipeline de Ventas</h1>
          <p className="text-slate-400">Prospectos interesados en Evoke OS</p>
        </div>
        <Button onClick={() => { resetForm(); setShowProspectDialog(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Prospecto
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Users className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.total || 0}</p>
                <p className="text-xs text-slate-400">Total Prospectos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <DollarSign className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">${stats?.pipeline_value?.toLocaleString() || 0}</p>
                <p className="text-xs text-slate-400">Pipeline MRR</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Target className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.win_rate || 0}%</p>
                <p className="text-xs text-slate-400">Win Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <TrendingUp className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.won_this_month || 0}</p>
                <p className="text-xs text-slate-400">Ganados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <AlertCircle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{followUps.overdue?.length || 0}</p>
                <p className="text-xs text-slate-400">Follow-ups Vencidos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Follow-ups Alert */}
      {(followUps.overdue?.length > 0 || followUps.today?.length > 0) && (
        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-400" />
              <div>
                <p className="font-medium text-amber-200">Follow-ups Pendientes</p>
                <p className="text-sm text-amber-300">
                  {followUps.overdue?.length || 0} vencidos, {followUps.today?.length || 0} para hoy
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Prospects List */}
        <div className="lg:col-span-3">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="bg-slate-700 flex-wrap">
                    <TabsTrigger value="all">Todos</TabsTrigger>
                    <TabsTrigger value="new">Nuevos</TabsTrigger>
                    <TabsTrigger value="demo">Demo</TabsTrigger>
                    <TabsTrigger value="proposal">Propuesta</TabsTrigger>
                    <TabsTrigger value="won">Ganados</TabsTrigger>
                  </TabsList>
                </Tabs>
                
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Buscar prospectos..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-64 bg-slate-700 border-slate-600"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredProspects.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No hay prospectos</p>
                    <Button variant="outline" className="mt-4" onClick={() => { resetForm(); setShowProspectDialog(true); }}>
                      <Plus className="w-4 h-4 mr-2" />
                      Agregar Prospecto
                    </Button>
                  </div>
                ) : (
                  filteredProspects.map(prospect => (
                    <div
                      key={prospect.prospect_id}
                      className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors cursor-pointer"
                      onClick={() => handleViewProspect(prospect)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium">{prospect.company_name}</p>
                          <p className="text-sm text-slate-400">{prospect.contact_name} • {prospect.email}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {prospect.estimated_mrr && (
                          <span className="text-green-400 font-medium">${prospect.estimated_mrr}/mo</span>
                        )}
                        <Badge className={STATUS_CONFIG[prospect.status]?.color || "bg-slate-500"}>
                          {STATUS_CONFIG[prospect.status]?.label || prospect.status}
                        </Badge>
                        {prospect.plan_interest && (
                          <Badge variant="outline" className="text-slate-400 capitalize">
                            {prospect.plan_interest}
                          </Badge>
                        )}
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); handleEditProspect(prospect); }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); handleDeleteProspect(prospect.prospect_id); }}
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pipeline Summary */}
        <div className="space-y-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg">Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${config.color}`} />
                    <span className="text-sm">{config.label}</span>
                  </div>
                  <span className="font-medium">{stats?.by_status?.[key]?.count || 0}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Today's Follow-ups */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Follow-ups Hoy
              </CardTitle>
            </CardHeader>
            <CardContent>
              {followUps.today?.length === 0 ? (
                <p className="text-sm text-slate-400">Sin follow-ups para hoy</p>
              ) : (
                <div className="space-y-2">
                  {followUps.today?.slice(0, 5).map(prospect => (
                    <div
                      key={prospect.prospect_id}
                      className="p-2 rounded bg-slate-700/50 cursor-pointer hover:bg-slate-700"
                      onClick={() => handleViewProspect(prospect)}
                    >
                      <p className="text-sm font-medium">{prospect.company_name}</p>
                      <p className="text-xs text-slate-400">{prospect.contact_name}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create/Edit Prospect Dialog */}
      <Dialog open={showProspectDialog} onOpenChange={setShowProspectDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedProspect ? "Editar Prospecto" : "Nuevo Prospecto"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Empresa *</Label>
                <Input
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  className="bg-slate-700 border-slate-600"
                />
              </div>
              <div>
                <Label>Contacto *</Label>
                <Input
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  className="bg-slate-700 border-slate-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="bg-slate-700 border-slate-600"
                />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="bg-slate-700 border-slate-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Industria</Label>
                <Input
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  placeholder="Ej: Catering, Restaurantes..."
                  className="bg-slate-700 border-slate-600"
                />
              </div>
              <div>
                <Label>Tamaño</Label>
                <Select value={formData.company_size} onValueChange={(v) => setFormData({ ...formData, company_size: v })}>
                  <SelectTrigger className="bg-slate-700 border-slate-600">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_SIZE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Fuente</Label>
                <Select value={formData.source} onValueChange={(v) => setFormData({ ...formData, source: v })}>
                  <SelectTrigger className="bg-slate-700 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Estado</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger className="bg-slate-700 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>MRR Estimado ($)</Label>
                <Input
                  type="number"
                  value={formData.estimated_mrr}
                  onChange={(e) => setFormData({ ...formData, estimated_mrr: e.target.value })}
                  placeholder="49, 149..."
                  className="bg-slate-700 border-slate-600"
                />
              </div>
              <div>
                <Label>Plan de Interés</Label>
                <Select value={formData.plan_interest} onValueChange={(v) => setFormData({ ...formData, plan_interest: v })}>
                  <SelectTrigger className="bg-slate-700 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Próximo Follow-up</Label>
              <Input
                type="date"
                value={formData.next_follow_up}
                onChange={(e) => setFormData({ ...formData, next_follow_up: e.target.value })}
                className="bg-slate-700 border-slate-600"
              />
            </div>

            <div>
              <Label>Notas</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-slate-700 border-slate-600"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProspectDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={selectedProspect ? handleUpdateProspect : handleCreateProspect}>
              {selectedProspect ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prospect Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Building2 className="w-6 h-6" />
              {selectedProspect?.company_name}
            </DialogTitle>
          </DialogHeader>

          {selectedProspect && (
            <div className="space-y-6">
              {/* Prospect Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Users className="w-4 h-4" />
                    <span>{selectedProspect.contact_name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <Mail className="w-4 h-4" />
                    <span>{selectedProspect.email}</span>
                  </div>
                  {selectedProspect.phone && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Phone className="w-4 h-4" />
                      <span>{selectedProspect.phone}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_CONFIG[selectedProspect.status]?.color}>
                      {STATUS_CONFIG[selectedProspect.status]?.label || selectedProspect.status}
                    </Badge>
                    {selectedProspect.plan_interest && (
                      <Badge variant="outline" className="capitalize">{selectedProspect.plan_interest}</Badge>
                    )}
                  </div>
                  {selectedProspect.estimated_mrr && (
                    <p className="text-lg font-bold text-green-400">${selectedProspect.estimated_mrr}/mo</p>
                  )}
                  {selectedProspect.industry && (
                    <p className="text-sm text-slate-400">Industria: {selectedProspect.industry}</p>
                  )}
                  {selectedProspect.company_size && (
                    <p className="text-sm text-slate-400">Tamaño: {selectedProspect.company_size}</p>
                  )}
                </div>
              </div>

              {selectedProspect.notes && (
                <div className="p-3 rounded bg-slate-700/50">
                  <p className="text-sm">{selectedProspect.notes}</p>
                </div>
              )}

              {/* Activity Log */}
              <div>
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Historial de Actividad
                </h3>

                <div className="flex gap-2 mb-4">
                  <Select value={newLog.type} onValueChange={(v) => setNewLog({ ...newLog, type: v })}>
                    <SelectTrigger className="w-32 bg-slate-700 border-slate-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="note">Nota</SelectItem>
                      <SelectItem value="call">Llamada</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="meeting">Reunión</SelectItem>
                      <SelectItem value="demo">Demo</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Agregar actividad..."
                    value={newLog.content}
                    onChange={(e) => setNewLog({ ...newLog, content: e.target.value })}
                    className="flex-1 bg-slate-700 border-slate-600"
                  />
                  <Button onClick={handleAddLog}>Agregar</Button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {prospectLogs.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">Sin registros de actividad</p>
                  ) : (
                    prospectLogs.map(log => (
                      <div key={log.log_id} className="p-3 rounded bg-slate-700/50">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs capitalize">
                            {log.type}
                          </Badge>
                          <span className="text-xs text-slate-400">
                            {new Date(log.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm">{log.content}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
