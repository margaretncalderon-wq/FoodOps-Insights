import { useState, useEffect } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "../../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "../../components/ui/select";
import {
  Users, Phone, Mail, Building2, Search, Plus,
  Calendar, Clock, MessageSquare, Edit, Trash2,
  TrendingUp, AlertCircle, Loader2, DollarSign, Target
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function CRMPage() {
  const { language } = useLanguage();
  const isEs = language === "es";

  const STATUS_CONFIG = {
    new: { label: isEs ? "Nuevo" : "New", color: "bg-slate-500" },
    contacted: { label: isEs ? "Contactado" : "Contacted", color: "bg-blue-500" },
    qualified: { label: isEs ? "Calificado" : "Qualified", color: "bg-purple-500" },
    demo: { label: "Demo", color: "bg-cyan-500" },
    proposal: { label: isEs ? "Propuesta" : "Proposal", color: "bg-orange-500" },
    negotiation: { label: isEs ? "Negociación" : "Negotiation", color: "bg-amber-500" },
    won: { label: isEs ? "Ganado" : "Won", color: "bg-green-500" },
    lost: { label: isEs ? "Perdido" : "Lost", color: "bg-red-500" }
  };

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
    company_name: "", contact_name: "", email: "", phone: "",
    industry: "", company_size: "", source: "website", status: "new",
    notes: "", estimated_mrr: "", next_follow_up: "", plan_interest: "professional"
  });

  useEffect(() => { fetchData(); }, []);

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
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const handleSaveProspect = async () => {
    try {
      const payload = { ...formData, estimated_mrr: formData.estimated_mrr ? parseFloat(formData.estimated_mrr) : null };
      if (selectedProspect) {
        await axios.put(`${API}/api/super-admin/crm/prospects/${selectedProspect.prospect_id}`, payload, { withCredentials: true });
        toast.success(isEs ? "Prospecto actualizado" : "Prospect updated");
      } else {
        await axios.post(`${API}/api/super-admin/crm/prospects`, payload, { withCredentials: true });
        toast.success(isEs ? "Prospecto creado" : "Prospect created");
      }
      setShowProspectDialog(false);
      resetForm();
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Error"); }
  };

  const handleDeleteProspect = async (id) => {
    if (!confirm(isEs ? "¿Eliminar?" : "Delete?")) return;
    try {
      await axios.delete(`${API}/api/super-admin/crm/prospects/${id}`, { withCredentials: true });
      toast.success(isEs ? "Eliminado" : "Deleted");
      fetchData();
    } catch (err) { toast.error("Error"); }
  };

  const handleViewProspect = async (prospect) => {
    setSelectedProspect(prospect);
    try {
      const res = await axios.get(`${API}/api/super-admin/crm/prospects/${prospect.prospect_id}`, { withCredentials: true });
      setSelectedProspect(res.data.prospect);
      setProspectLogs(res.data.logs || []);
      setShowDetailDialog(true);
    } catch (err) { toast.error("Error"); }
  };

  const handleAddLog = async () => {
    if (!newLog.content.trim()) return;
    try {
      await axios.post(`${API}/api/super-admin/crm/prospects/${selectedProspect.prospect_id}/activity`, newLog, { withCredentials: true });
      toast.success(isEs ? "Agregado" : "Added");
      setNewLog({ type: "note", content: "" });
      const res = await axios.get(`${API}/api/super-admin/crm/prospects/${selectedProspect.prospect_id}`, { withCredentials: true });
      setProspectLogs(res.data.logs || []);
    } catch (err) { toast.error("Error"); }
  };

  const handleEditProspect = (prospect) => {
    setSelectedProspect(prospect);
    setFormData({
      company_name: prospect.company_name || "", contact_name: prospect.contact_name || "",
      email: prospect.email || "", phone: prospect.phone || "", industry: prospect.industry || "",
      company_size: prospect.company_size || "", source: prospect.source || "website",
      status: prospect.status || "new", notes: prospect.notes || "",
      estimated_mrr: prospect.estimated_mrr?.toString() || "", next_follow_up: prospect.next_follow_up || "",
      plan_interest: prospect.plan_interest || "professional"
    });
    setShowProspectDialog(true);
  };

  const resetForm = () => {
    setSelectedProspect(null);
    setFormData({ company_name: "", contact_name: "", email: "", phone: "", industry: "", company_size: "", source: "website", status: "new", notes: "", estimated_mrr: "", next_follow_up: "", plan_interest: "professional" });
  };

  const filteredProspects = prospects.filter(p => {
    const matchesSearch = !searchQuery || p.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.contact_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === "all" || p.status === activeTab;
    return matchesSearch && matchesTab;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{isEs ? "Pipeline de Ventas" : "Sales Pipeline"}</h1>
          <p className="text-muted-foreground">{isEs ? "Prospectos interesados en Kora OS" : "Prospects interested in Kora OS"}</p>
        </div>
        <Button onClick={() => { resetForm(); setShowProspectDialog(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          {isEs ? "Nuevo Prospecto" : "New Prospect"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center"><Users className="w-5 h-5 text-blue-500" /></div><div><p className="text-2xl font-bold">{stats?.total || 0}</p><p className="text-xs text-muted-foreground">{isEs ? "Total" : "Total"}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-green-500" /></div><div><p className="text-2xl font-bold">${stats?.pipeline_value?.toLocaleString() || 0}</p><p className="text-xs text-muted-foreground">Pipeline MRR</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center"><Target className="w-5 h-5 text-purple-500" /></div><div><p className="text-2xl font-bold">{stats?.win_rate || 0}%</p><p className="text-xs text-muted-foreground">Win Rate</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-green-500" /></div><div><p className="text-2xl font-bold">{stats?.won_this_month || 0}</p><p className="text-xs text-muted-foreground">{isEs ? "Ganados" : "Won"}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center"><AlertCircle className="w-5 h-5 text-amber-500" /></div><div><p className="text-2xl font-bold">{followUps.overdue?.length || 0}</p><p className="text-xs text-muted-foreground">{isEs ? "Vencidos" : "Overdue"}</p></div></div></CardContent></Card>
      </div>

      {/* Alert */}
      {(followUps.overdue?.length > 0 || followUps.today?.length > 0) && (
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-500" />
              <div>
                <p className="font-medium">{isEs ? "Follow-ups Pendientes" : "Pending Follow-ups"}</p>
                <p className="text-sm text-muted-foreground">{followUps.overdue?.length || 0} {isEs ? "vencidos" : "overdue"}, {followUps.today?.length || 0} {isEs ? "para hoy" : "today"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList>
                    <TabsTrigger value="all">{isEs ? "Todos" : "All"}</TabsTrigger>
                    <TabsTrigger value="new">{isEs ? "Nuevos" : "New"}</TabsTrigger>
                    <TabsTrigger value="demo">Demo</TabsTrigger>
                    <TabsTrigger value="proposal">{isEs ? "Propuesta" : "Proposal"}</TabsTrigger>
                    <TabsTrigger value="won">{isEs ? "Ganados" : "Won"}</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder={isEs ? "Buscar..." : "Search..."} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 w-64" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredProspects.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>{isEs ? "No hay prospectos" : "No prospects"}</p>
                  </div>
                ) : (
                  filteredProspects.map(p => (
                    <div key={p.prospect_id} className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => handleViewProspect(p)}>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"><Building2 className="w-5 h-5" /></div>
                        <div>
                          <p className="font-medium">{p.company_name}</p>
                          <p className="text-sm text-muted-foreground">{p.contact_name} • {p.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {p.estimated_mrr && <span className="text-green-500 font-medium">${p.estimated_mrr}/mo</span>}
                        <Badge className={STATUS_CONFIG[p.status]?.color}>{STATUS_CONFIG[p.status]?.label}</Badge>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleEditProspect(p); }}><Edit className="w-4 h-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDeleteProspect(p.prospect_id); }}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Pipeline</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><div className={`w-3 h-3 rounded-full ${config.color}`} /><span className="text-sm">{config.label}</span></div>
                  <span className="font-medium">{stats?.by_status?.[key]?.count || 0}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Calendar className="w-5 h-5" />{isEs ? "Follow-ups Hoy" : "Today's Follow-ups"}</CardTitle></CardHeader>
            <CardContent>
              {followUps.today?.length === 0 ? <p className="text-sm text-muted-foreground">{isEs ? "Sin follow-ups" : "No follow-ups"}</p> : (
                <div className="space-y-2">{followUps.today?.slice(0, 5).map(p => (
                  <div key={p.prospect_id} className="p-2 rounded border cursor-pointer hover:bg-muted/50" onClick={() => handleViewProspect(p)}>
                    <p className="text-sm font-medium">{p.company_name}</p><p className="text-xs text-muted-foreground">{p.contact_name}</p>
                  </div>
                ))}</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showProspectDialog} onOpenChange={setShowProspectDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selectedProspect ? (isEs ? "Editar Prospecto" : "Edit Prospect") : (isEs ? "Nuevo Prospecto" : "New Prospect")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{isEs ? "Empresa" : "Company"} *</Label><Input value={formData.company_name} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} /></div>
              <div><Label>{isEs ? "Contacto" : "Contact"} *</Label><Input value={formData.contact_name} onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Email *</Label><Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} /></div>
              <div><Label>{isEs ? "Teléfono" : "Phone"}</Label><Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{isEs ? "Estado" : "Status"}</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUS_CONFIG).map(([key, config]) => <SelectItem key={key} value={key}>{config.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>MRR ($)</Label><Input type="number" value={formData.estimated_mrr} onChange={(e) => setFormData({ ...formData, estimated_mrr: e.target.value })} /></div>
            </div>
            <div><Label>Follow-up</Label><Input type="date" value={formData.next_follow_up} onChange={(e) => setFormData({ ...formData, next_follow_up: e.target.value })} /></div>
            <div><Label>{isEs ? "Notas" : "Notes"}</Label><Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProspectDialog(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleSaveProspect}>{isEs ? "Guardar" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-3"><Building2 className="w-6 h-6" />{selectedProspect?.company_name}</DialogTitle></DialogHeader>
          {selectedProspect && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground"><Users className="w-4 h-4" /><span>{selectedProspect.contact_name}</span></div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Mail className="w-4 h-4" /><span>{selectedProspect.email}</span></div>
                  {selectedProspect.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="w-4 h-4" /><span>{selectedProspect.phone}</span></div>}
                </div>
                <div className="space-y-2">
                  <Badge className={STATUS_CONFIG[selectedProspect.status]?.color}>{STATUS_CONFIG[selectedProspect.status]?.label}</Badge>
                  {selectedProspect.estimated_mrr && <p className="text-lg font-bold text-green-500">${selectedProspect.estimated_mrr}/mo</p>}
                </div>
              </div>
              {selectedProspect.notes && <div className="p-3 rounded-lg border"><p className="text-sm">{selectedProspect.notes}</p></div>}
              <div>
                <h3 className="font-medium mb-3 flex items-center gap-2"><MessageSquare className="w-5 h-5" />{isEs ? "Historial" : "History"}</h3>
                <div className="flex gap-2 mb-4">
                  <Select value={newLog.type} onValueChange={(v) => setNewLog({ ...newLog, type: v })}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="note">{isEs ? "Nota" : "Note"}</SelectItem>
                      <SelectItem value="call">{isEs ? "Llamada" : "Call"}</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="demo">Demo</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder={isEs ? "Agregar actividad..." : "Add activity..."} value={newLog.content} onChange={(e) => setNewLog({ ...newLog, content: e.target.value })} className="flex-1" />
                  <Button onClick={handleAddLog}>{isEs ? "Agregar" : "Add"}</Button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {prospectLogs.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">{isEs ? "Sin registros" : "No records"}</p> : (
                    prospectLogs.map(log => (
                      <div key={log.log_id} className="p-3 rounded-lg border">
                        <div className="flex items-center gap-2 mb-1"><Badge variant="outline" className="text-xs capitalize">{log.type}</Badge><span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span></div>
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
