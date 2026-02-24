import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { 
  Plus, Mail, Send, Eye, Trash2, Edit2, Loader2,
  Users, MousePointerClick, MailOpen, Workflow, FileText
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import EmailSequencesSection from "../../components/demand-studio/EmailSequencesSection";

const EMAIL_STATUSES = [
  { value: "draft", label: "Draft", labelEs: "Borrador", color: "bg-gray-100 text-gray-800" },
  { value: "scheduled", label: "Scheduled", labelEs: "Programado", color: "bg-blue-100 text-blue-800" },
  { value: "sent", label: "Sent", labelEs: "Enviado", color: "bg-green-100 text-green-800" },
  { value: "completed", label: "Completed", labelEs: "Completado", color: "bg-purple-100 text-purple-800" },
];

export default function EmailMarketingPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [emails, setEmails] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmail, setEditingEmail] = useState(null);
  
  const [formData, setFormData] = useState({
    name: "",
    campaign_id: "",
    segment: "",
    list_size: 0,
    send_date: "",
    status: "draft",
    cost: 0,
    notes: ""
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [emailsRes, campaignsRes] = await Promise.all([
        axios.get(`${API}/api/demand-studio/emails`, { withCredentials: true }),
        axios.get(`${API}/api/demand-studio/campaigns`, { withCredentials: true })
      ]);
      setEmails(emailsRes.data);
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
      
      if (editingEmail) {
        await axios.put(`${API}/api/demand-studio/emails/${editingEmail.email_id}`, payload, { withCredentials: true });
      } else {
        await axios.post(`${API}/api/demand-studio/emails`, payload, { withCredentials: true });
      }
      setDialogOpen(false);
      setEditingEmail(null);
      resetForm();
      fetchData();
    } catch (error) {
      console.error("Error saving email:", error);
    }
  };

  const handleDelete = async (emailId) => {
    if (!window.confirm(isEs ? "¿Eliminar este email?" : "Delete this email?")) return;
    try {
      await axios.delete(`${API}/api/demand-studio/emails/${emailId}`, { withCredentials: true });
      fetchData();
    } catch (error) {
      console.error("Error deleting email:", error);
    }
  };

  const handleUpdateStats = async (emailId, updates) => {
    try {
      await axios.put(`${API}/api/demand-studio/emails/${emailId}`, updates, { withCredentials: true });
      fetchData();
    } catch (error) {
      console.error("Error updating stats:", error);
    }
  };

  const openEdit = (email) => {
    setEditingEmail(email);
    setFormData({
      name: email.name,
      campaign_id: email.campaign_id || "",
      segment: email.segment || "",
      list_size: email.list_size || 0,
      send_date: email.send_date || "",
      status: email.status,
      cost: email.cost || 0,
      notes: email.notes || ""
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      campaign_id: "",
      segment: "",
      list_size: 0,
      send_date: "",
      status: "draft",
      cost: 0,
      notes: ""
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
  };

  const formatPercent = (part, whole) => {
    if (!whole) return "0%";
    return ((part / whole) * 100).toFixed(1) + "%";
  };

  const getStatusBadge = (status) => {
    const s = EMAIL_STATUSES.find(st => st.value === status);
    return s ? (
      <Badge className={s.color}>{isEs ? s.labelEs : s.label}</Badge>
    ) : <Badge>{status}</Badge>;
  };

  const getCampaignName = (campaignId) => {
    const campaign = campaigns.find(c => c.campaign_id === campaignId);
    return campaign ? campaign.name : "-";
  };

  // Summary stats
  const totalSent = emails.reduce((sum, e) => sum + (e.sent_count || 0), 0);
  const totalOpens = emails.reduce((sum, e) => sum + (e.open_count || 0), 0);
  const totalClicks = emails.reduce((sum, e) => sum + (e.click_count || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="email-marketing-page">
      {/* Tabs for Email Campaigns vs Sequences */}
      <Tabs defaultValue="campaigns" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="campaigns" className="gap-2">
            <Mail className="w-4 h-4" />
            {isEs ? "Campañas" : "Campaigns"}
          </TabsTrigger>
          <TabsTrigger value="sequences" className="gap-2">
            <Workflow className="w-4 h-4" />
            {isEs ? "Secuencias" : "Sequences"}
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <FileText className="w-4 h-4" />
            {isEs ? "Plantillas" : "Templates"}
          </TabsTrigger>
        </TabsList>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns">
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{emails.length}</p>
                <p className="text-xs text-muted-foreground">{isEs ? "Campañas Email" : "Email Campaigns"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Send className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalSent.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{isEs ? "Emails Enviados" : "Emails Sent"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <MailOpen className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatPercent(totalOpens, totalSent)}</p>
                <p className="text-xs text-muted-foreground">{isEs ? "Tasa Apertura" : "Open Rate"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <MousePointerClick className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatPercent(totalClicks, totalSent)}</p>
                <p className="text-xs text-muted-foreground">{isEs ? "Tasa Clics" : "Click Rate"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Email Marketing</h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Seguimiento de campañas de email" : "Track email campaign performance"}
          </p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          {isEs ? "Nueva Campaña Email" : "New Email Campaign"}
        </Button>
      </div>

      {/* Email Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                <TableHead>{isEs ? "Campaña" : "Campaign"}</TableHead>
                <TableHead>{isEs ? "Segmento" : "Segment"}</TableHead>
                <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                <TableHead className="text-right">{isEs ? "Lista" : "List"}</TableHead>
                <TableHead className="text-right">{isEs ? "Enviados" : "Sent"}</TableHead>
                <TableHead className="text-right">{isEs ? "Aperturas" : "Opens"}</TableHead>
                <TableHead className="text-right">{isEs ? "Clics" : "Clicks"}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay campañas de email" : "No email campaigns"}
                  </TableCell>
                </TableRow>
              ) : (
                emails.map(email => (
                  <TableRow key={email.email_id}>
                    <TableCell className="font-medium">{email.name}</TableCell>
                    <TableCell>{getCampaignName(email.campaign_id)}</TableCell>
                    <TableCell>{email.segment || "-"}</TableCell>
                    <TableCell>{getStatusBadge(email.status)}</TableCell>
                    <TableCell className="text-right">{email.list_size?.toLocaleString() || 0}</TableCell>
                    <TableCell className="text-right">{email.sent_count?.toLocaleString() || 0}</TableCell>
                    <TableCell className="text-right">
                      {email.open_count?.toLocaleString() || 0}
                      <span className="text-muted-foreground text-xs ml-1">
                        ({formatPercent(email.open_count, email.sent_count)})
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {email.click_count?.toLocaleString() || 0}
                      <span className="text-muted-foreground text-xs ml-1">
                        ({formatPercent(email.click_count, email.sent_count)})
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(email)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(email.email_id)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingEmail 
                ? (isEs ? "Editar Campaña Email" : "Edit Email Campaign")
                : (isEs ? "Nueva Campaña Email" : "New Email Campaign")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Nombre" : "Name"} *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={isEs ? "Nombre del email" : "Email name"}
              />
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
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Segmento" : "Segment"}</label>
                <Input
                  value={formData.segment}
                  onChange={(e) => setFormData({ ...formData, segment: e.target.value })}
                  placeholder={isEs ? "Segmento de audiencia" : "Audience segment"}
                />
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
                    {EMAIL_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{isEs ? s.labelEs : s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Tamaño Lista" : "List Size"}</label>
                <Input
                  type="number"
                  value={formData.list_size}
                  onChange={(e) => setFormData({ ...formData, list_size: parseInt(e.target.value) || 0 })}
                  min="0"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha Envío" : "Send Date"}</label>
                <Input
                  type="date"
                  value={formData.send_date}
                  onChange={(e) => setFormData({ ...formData, send_date: e.target.value })}
                />
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Costo" : "Cost"}</label>
              <Input
                type="number"
                value={formData.cost}
                onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })}
                min="0"
                step="0.01"
              />
            </div>
            
            {editingEmail && (
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <label className="text-sm font-medium">{isEs ? "Enviados" : "Sent"}</label>
                  <Input
                    type="number"
                    defaultValue={editingEmail.sent_count || 0}
                    onChange={(e) => handleUpdateStats(editingEmail.email_id, { sent_count: parseInt(e.target.value) || 0 })}
                    min="0"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{isEs ? "Aperturas" : "Opens"}</label>
                  <Input
                    type="number"
                    defaultValue={editingEmail.open_count || 0}
                    onChange={(e) => handleUpdateStats(editingEmail.email_id, { open_count: parseInt(e.target.value) || 0 })}
                    min="0"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{isEs ? "Clics" : "Clicks"}</label>
                  <Input
                    type="number"
                    defaultValue={editingEmail.click_count || 0}
                    onChange={(e) => handleUpdateStats(editingEmail.email_id, { click_count: parseInt(e.target.value) || 0 })}
                    min="0"
                  />
                </div>
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
            <Button onClick={handleSave} disabled={!formData.name}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
