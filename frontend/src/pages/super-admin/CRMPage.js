import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "../../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import {
  Users, Phone, Mail, Building2, Search, 
  Calendar, Clock, MessageSquare,
  TrendingUp, AlertCircle, Loader2
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

// Uses unified Lead model status values
const STATUS_CONFIG = {
  New: { label: "Nuevo", color: "bg-blue-500" },
  Contacted: { label: "Contactado", color: "bg-yellow-500" },
  Converted: { label: "Convertido", color: "bg-green-500" },
  Discarded: { label: "Descartado", color: "bg-red-500" }
};

export default function CRMPage() {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [followUps, setFollowUps] = useState({ overdue: [], today: [], upcoming: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLead, setSelectedLead] = useState(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [leadLogs, setLeadLogs] = useState([]);
  const [newLog, setNewLog] = useState({ type: "note", content: "" });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [leadsRes, followUpsRes, statsRes] = await Promise.all([
        axios.get(`${API}/api/super-admin/crm/leads`, { withCredentials: true }),
        axios.get(`${API}/api/super-admin/crm/follow-ups`, { withCredentials: true }),
        axios.get(`${API}/api/super-admin/crm/stats`, { withCredentials: true })
      ]);
      setLeads(leadsRes.data.leads);
      setStats(statsRes.data);
      setFollowUps(followUpsRes.data);
    } catch (err) {
      console.error(err);
      toast.error("Error loading CRM data");
    }
    setLoading(false);
  };

  const handleCreateLead = async () => {
    try {
      const payload = {
        ...formData,
        estimated_value: formData.estimated_value ? parseFloat(formData.estimated_value) : null
      };
      await axios.post(`${API}/api/super-admin/crm/leads`, payload, { withCredentials: true });
      toast.success("Lead creado");
      setShowLeadDialog(false);
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error creating lead");
    }
  };

  const handleUpdateLead = async () => {
    try {
      const payload = {
        ...formData,
        estimated_value: formData.estimated_value ? parseFloat(formData.estimated_value) : null
      };
      await axios.put(`${API}/api/super-admin/crm/leads/${selectedLead.lead_id}`, payload, { withCredentials: true });
      toast.success("Lead actualizado");
      setShowLeadDialog(false);
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error updating lead");
    }
  };

  const handleDeleteLead = async (leadId) => {
    if (!window.confirm("¿Eliminar este lead?")) return;
    try {
      await axios.delete(`${API}/api/super-admin/crm/leads/${leadId}`, { withCredentials: true });
      toast.success("Lead eliminado");
      fetchData();
    } catch (err) {
      toast.error("Error deleting lead");
    }
  };

  const handleViewLead = async (lead) => {
    setSelectedLead(lead);
    try {
      const res = await axios.get(`${API}/api/super-admin/crm/leads/${lead.lead_id}`, { withCredentials: true });
      setLeadLogs(res.data.logs || []);
      setShowDetailDialog(true);
    } catch (err) {
      toast.error("Error loading lead details");
    }
  };

  const handleAddLog = async () => {
    if (!newLog.content.trim()) return;
    try {
      await axios.post(
        `${API}/api/super-admin/crm/leads/${selectedLead.lead_id}/log`,
        newLog,
        { withCredentials: true }
      );
      toast.success("Nota agregada");
      setNewLog({ type: "note", content: "" });
      // Refresh logs
      const res = await axios.get(`${API}/api/super-admin/crm/leads/${selectedLead.lead_id}`, { withCredentials: true });
      setLeadLogs(res.data.logs || []);
    } catch (err) {
      toast.error("Error adding log");
    }
  };

  const handleEditLead = (lead) => {
    setSelectedLead(lead);
    setFormData({
      company_name: lead.company_name || "",
      contact_name: lead.contact_name || "",
      email: lead.email || "",
      phone: lead.phone || "",
      source: lead.source || "outreach",
      status: lead.status || "new",
      notes: lead.notes || "",
      estimated_value: lead.estimated_value?.toString() || "",
      next_follow_up: lead.next_follow_up || ""
    });
    setShowLeadDialog(true);
  };

  const resetForm = () => {
    setSelectedLead(null);
    setFormData({
      company_name: "",
      contact_name: "",
      email: "",
      phone: "",
      source: "outreach",
      status: "new",
      notes: "",
      estimated_value: "",
      next_follow_up: ""
    });
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = !searchQuery || 
      lead.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTab = activeTab === "all" || 
      (activeTab === "inbound" && lead.source === "inbound") ||
      (activeTab === "outreach" && lead.source === "outreach");
    
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
    <div className="p-8 space-y-6" data-testid="crm-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">CRM</h1>
          <p className="text-slate-400">Gestión de leads y pipeline de ventas</p>
        </div>
        <Button onClick={() => { resetForm(); setShowLeadDialog(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Lead
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Users className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.total || 0}</p>
                <p className="text-xs text-slate-400">Total Leads</p>
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
                <p className="text-2xl font-bold">{stats?.by_source?.inbound || 0}</p>
                <p className="text-xs text-slate-400">Inbound</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Phone className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.by_source?.outreach || 0}</p>
                <p className="text-xs text-slate-400">Outreach</p>
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
        {/* Leads List */}
        <div className="lg:col-span-3">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="bg-slate-700">
                    <TabsTrigger value="all">Todos</TabsTrigger>
                    <TabsTrigger value="inbound">Inbound</TabsTrigger>
                    <TabsTrigger value="outreach">Outreach</TabsTrigger>
                  </TabsList>
                </Tabs>
                
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Buscar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-64 bg-slate-700 border-slate-600"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredLeads.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No hay leads</p>
                  </div>
                ) : (
                  filteredLeads.map(lead => (
                    <div
                      key={lead.lead_id}
                      className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors cursor-pointer"
                      onClick={() => handleViewLead(lead)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium">{lead.company_name}</p>
                          <p className="text-sm text-slate-400">{lead.contact_name} • {lead.email}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {lead.estimated_value && (
                          <span className="text-green-400 font-medium">${lead.estimated_value}</span>
                        )}
                        <Badge className={STATUS_CONFIG[lead.status]?.color || "bg-slate-500"}>
                          {STATUS_CONFIG[lead.status]?.label || lead.status}
                        </Badge>
                        <Badge variant="outline" className="text-slate-400">
                          {lead.source === "inbound" ? "Inbound" : "Outreach"}
                        </Badge>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); handleEditLead(lead); }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); handleDeleteLead(lead.lead_id); }}
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
                  <span className="font-medium">{stats?.by_status?.[key] || 0}</span>
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
                  {followUps.today?.slice(0, 5).map(lead => (
                    <div
                      key={lead.lead_id}
                      className="p-2 rounded bg-slate-700/50 cursor-pointer hover:bg-slate-700"
                      onClick={() => handleViewLead(lead)}
                    >
                      <p className="text-sm font-medium">{lead.company_name}</p>
                      <p className="text-xs text-slate-400">{lead.contact_name}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create/Edit Lead Dialog */}
      <Dialog open={showLeadDialog} onOpenChange={setShowLeadDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedLead ? "Editar Lead" : "Nuevo Lead"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Empresa</Label>
                <Input
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  className="bg-slate-700 border-slate-600"
                />
              </div>
              <div>
                <Label>Contacto</Label>
                <Input
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  className="bg-slate-700 border-slate-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
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
                <Label>Fuente</Label>
                <Select value={formData.source} onValueChange={(v) => setFormData({ ...formData, source: v })}>
                  <SelectTrigger className="bg-slate-700 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inbound">Inbound</SelectItem>
                    <SelectItem value="outreach">Outreach</SelectItem>
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
                <Label>Valor Estimado ($)</Label>
                <Input
                  type="number"
                  value={formData.estimated_value}
                  onChange={(e) => setFormData({ ...formData, estimated_value: e.target.value })}
                  className="bg-slate-700 border-slate-600"
                />
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
            <Button variant="outline" onClick={() => setShowLeadDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={selectedLead ? handleUpdateLead : handleCreateLead}>
              {selectedLead ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Building2 className="w-6 h-6" />
              {selectedLead?.company_name}
            </DialogTitle>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-6">
              {/* Lead Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Users className="w-4 h-4" />
                    <span>{selectedLead.contact_name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <Mail className="w-4 h-4" />
                    <span>{selectedLead.email}</span>
                  </div>
                  {selectedLead.phone && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Phone className="w-4 h-4" />
                      <span>{selectedLead.phone}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_CONFIG[selectedLead.status]?.color}>
                      {STATUS_CONFIG[selectedLead.status]?.label}
                    </Badge>
                    <Badge variant="outline">{selectedLead.source}</Badge>
                  </div>
                  {selectedLead.estimated_value && (
                    <p className="text-lg font-bold text-green-400">${selectedLead.estimated_value}</p>
                  )}
                  {selectedLead.next_follow_up && (
                    <p className="text-sm text-slate-400">
                      Follow-up: {selectedLead.next_follow_up}
                    </p>
                  )}
                </div>
              </div>

              {selectedLead.notes && (
                <div className="p-3 rounded bg-slate-700/50">
                  <p className="text-sm">{selectedLead.notes}</p>
                </div>
              )}

              {/* Communication Log */}
              <div>
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Historial de Comunicación
                </h3>

                {/* Add new log */}
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
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Agregar nota..."
                    value={newLog.content}
                    onChange={(e) => setNewLog({ ...newLog, content: e.target.value })}
                    className="flex-1 bg-slate-700 border-slate-600"
                  />
                  <Button onClick={handleAddLog}>Agregar</Button>
                </div>

                {/* Logs list */}
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {leadLogs.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">Sin registros</p>
                  ) : (
                    leadLogs.map(log => (
                      <div key={log.log_id} className="p-3 rounded bg-slate-700/50">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
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
