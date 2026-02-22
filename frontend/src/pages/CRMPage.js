import { useEffect, useState, useMemo } from "react";
import { API } from "../utils/api";
import { Link } from "react-router-dom";
import axios from "axios";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { useModules } from "../contexts/ModulesContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { 
  Plus, Search, User, Mail, Phone, Building2, MoreHorizontal, 
  Trash2, Edit, Eye, UserCheck, X, Calendar, Users, DollarSign,
  ArrowRight, Inbox, CheckCircle, XCircle, Filter
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";


// Helper to extract error message from Pydantic validation errors
const getErrorMessage = (error, fallback = "An error occurred") => {
  const detail = error?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map(e => e.msg || e.message || JSON.stringify(e)).join(", ");
  }
  return fallback;
};

const LEAD_SOURCES = ["Website", "Instagram", "QR", "Referral", "Other"];
const LEAD_STATUSES = ["New", "Contacted", "Converted", "Discarded"];
const EVENT_TYPES = ["wedding", "corporate", "birthday", "social", "other"];
const CLIENT_TYPES = ["Company", "Individual"];
const CLIENT_SOURCES = ["Website", "Instagram", "QR", "Referral", "Direct", "Other"];

export default function CRMPage() {
  const { t, language } = useLanguage();
  const { isProfessionalServices, getProgramOrchestrationConfig } = useModules();
  
  // Get dynamic terminology
  const poConfig = useMemo(() => getProgramOrchestrationConfig(), [getProgramOrchestrationConfig]);
  const dateLabel = isProfessionalServices 
    ? (language === "es" ? "Fecha del Proyecto" : "Project Date")
    : (language === "es" ? "Fecha del Evento" : "Event Date");
  const guestLabel = isProfessionalServices
    ? (language === "es" ? "Participantes Estimados" : "Estimated Participants")
    : (language === "es" ? "Invitados Estimados" : "Estimated Guests");
  
  const [activeTab, setActiveTab] = useState("leads");
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [leadDetailOpen, setLeadDetailOpen] = useState(false);
  const [stats, setStats] = useState({ new_leads: 0, total_clients: 0, total_leads: 0 });
  
  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  
  // Lead form
  const [leadForm, setLeadForm] = useState({
    lead_name: "",
    email: "",
    phone: "",
    company_name: "",
    event_type: "wedding",
    event_date: "",
    estimated_guest_count: "",
    budget_range: "",
    message: "",
    source: "Website"
  });
  
  // Client form
  const [clientForm, setClientForm] = useState({
    client_type: "Individual",
    display_name: "",
    email: "",
    phone: "",
    address: "",
    source: "Direct",
    tags: [],
    notes: "",
    status: "Active"
  });

  useEffect(() => {
    fetchLeads();
    fetchClients();
    fetchStats();
  }, []);

  const fetchLeads = async () => {
    try {
      const response = await axios.get(`${API}/leads`, { withCredentials: true });
      setLeads(response.data);
    } catch (error) {
      console.error("Failed to fetch leads:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await axios.get(`${API}/crm/clients`, { withCredentials: true });
      setClients(response.data);
    } catch (error) {
      console.error("Failed to fetch clients:", error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API}/crm/stats`, { withCredentials: true });
      setStats(response.data);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  const handleCreateLead = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/leads`, leadForm, { withCredentials: true });
      toast.success(language === "es" ? "Lead creado" : "Lead created");
      fetchLeads();
      fetchStats();
      setLeadDialogOpen(false);
      setLeadForm({
        lead_name: "", email: "", phone: "", company_name: "",
        event_type: "wedding", event_date: "", estimated_guest_count: "",
        budget_range: "", message: "", source: "Website"
      });
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to create lead"));
    }
  };

  const handleCreateClient = async (e) => {
    e.preventDefault();
    try {
      if (editingClient) {
        await axios.put(`${API}/crm/clients/${editingClient.client_id}`, clientForm, { withCredentials: true });
        toast.success(language === "es" ? "Cliente actualizado" : "Client updated");
      } else {
        await axios.post(`${API}/crm/clients`, clientForm, { withCredentials: true });
        toast.success(language === "es" ? "Cliente creado" : "Client created");
      }
      fetchClients();
      fetchStats();
      setClientDialogOpen(false);
      setEditingClient(null);
      setClientForm({
        client_type: "Individual", display_name: "", email: "", phone: "",
        address: "", source: "Direct", tags: [], notes: "", status: "Active"
      });
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to save client"));
    }
  };

  const handleConvertLead = async (lead) => {
    try {
      const result = await axios.post(`${API}/leads/${lead.lead_id}/convert`, {}, { withCredentials: true });
      toast.success(language === "es" ? "Lead convertido exitosamente" : "Lead converted successfully");
      fetchLeads();
      fetchClients();
      fetchStats();
      setLeadDetailOpen(false);
      // Navigate to event
      window.location.href = `/events/${result.data.event_id}`;
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to convert lead"));
    }
  };

  const handleDiscardLead = async (leadId) => {
    if (!confirm(language === "es" ? "¿Descartar este lead?" : "Discard this lead?")) return;
    try {
      await axios.post(`${API}/leads/${leadId}/discard`, {}, { withCredentials: true });
      toast.success(language === "es" ? "Lead descartado" : "Lead discarded");
      fetchLeads();
      fetchStats();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to discard lead"));
    }
  };

  const handleUpdateLeadStatus = async (leadId, newStatus) => {
    try {
      await axios.put(`${API}/leads/${leadId}`, { status: newStatus }, { withCredentials: true });
      toast.success(language === "es" ? "Estado actualizado" : "Status updated");
      fetchLeads();
      fetchStats();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to update status"));
    }
  };

  const handleDeleteClient = async (clientId) => {
    if (!confirm(language === "es" ? "¿Eliminar este cliente?" : "Delete this client?")) return;
    try {
      await axios.delete(`${API}/crm/clients/${clientId}`, { withCredentials: true });
      toast.success(language === "es" ? "Cliente eliminado" : "Client deleted");
      fetchClients();
      fetchStats();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete client"));
    }
  };

  const handleEditClient = (client) => {
    setEditingClient(client);
    setClientForm({
      client_type: client.client_type || "Individual",
      display_name: client.display_name || client.name || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      source: client.source || "Direct",
      tags: client.tags || [],
      notes: client.notes || "",
      status: client.status || "Active"
    });
    setClientDialogOpen(true);
  };

  const openLeadDetail = (lead) => {
    setSelectedLead(lead);
    setLeadDetailOpen(true);
  };

  // Filtered leads
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.lead_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          lead.company_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || lead.status?.toLowerCase() === statusFilter.toLowerCase();
    const matchesSource = sourceFilter === "all" || lead.source === sourceFilter;
    return matchesSearch && matchesStatus && matchesSource;
  });

  // Filtered clients
  const filteredClients = clients.filter(client => {
    const name = client.display_name || client.name || "";
    return name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           client.email?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const statusColors = {
    New: "bg-blue-100 text-blue-800",
    Contacted: "bg-yellow-100 text-yellow-800",
    Converted: "bg-green-100 text-green-800",
    Discarded: "bg-gray-100 text-gray-800"
  };

  const newLeadsCount = leads.filter(l => l.status === "New").length;

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">{t("loading")}</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6" data-testid="crm-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">CRM</h1>
            <p className="text-muted-foreground mt-1">
              {language === "es" ? "Gestiona leads, clientes y oportunidades" : "Manage leads, clients and opportunities"}
            </p>
          </div>
          <div className="flex gap-2">
            {activeTab === "leads" && (
              <Dialog open={leadDialogOpen} onOpenChange={setLeadDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2" data-testid="add-lead-btn">
                    <Plus className="w-4 h-4" />
                    {language === "es" ? "Nuevo Lead" : "New Lead"}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{language === "es" ? "Crear Lead Manual" : "Create Manual Lead"}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateLead} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>{language === "es" ? "Nombre completo" : "Full name"} *</Label>
                        <Input
                          value={leadForm.lead_name}
                          onChange={(e) => setLeadForm({ ...leadForm, lead_name: e.target.value })}
                          required
                          data-testid="lead-name-input"
                        />
                      </div>
                      <div>
                        <Label>Email *</Label>
                        <Input
                          type="email"
                          value={leadForm.email}
                          onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label>{language === "es" ? "Teléfono" : "Phone"}</Label>
                        <Input
                          value={leadForm.phone}
                          onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>{language === "es" ? "Empresa" : "Company"}</Label>
                        <Input
                          value={leadForm.company_name}
                          onChange={(e) => setLeadForm({ ...leadForm, company_name: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>{language === "es" ? "Tipo de Evento" : "Event Type"}</Label>
                        <Select value={leadForm.event_type} onValueChange={(v) => setLeadForm({ ...leadForm, event_type: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {EVENT_TYPES.map(t => (
                              <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{dateLabel}</Label>
                        <Input
                          type="date"
                          value={leadForm.event_date}
                          onChange={(e) => setLeadForm({ ...leadForm, event_date: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>{guestLabel}</Label>
                        <Input
                          type="number"
                          value={leadForm.estimated_guest_count}
                          onChange={(e) => setLeadForm({ ...leadForm, estimated_guest_count: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>{language === "es" ? "Fuente" : "Source"}</Label>
                        <Select value={leadForm.source} onValueChange={(v) => setLeadForm({ ...leadForm, source: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {LEAD_SOURCES.map(s => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label>{language === "es" ? "Mensaje / Notas" : "Message / Notes"}</Label>
                        <Textarea
                          value={leadForm.message}
                          onChange={(e) => setLeadForm({ ...leadForm, message: e.target.value })}
                          rows={3}
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full">{t("save")}</Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            {activeTab === "clients" && (
              <Dialog open={clientDialogOpen} onOpenChange={(open) => { setClientDialogOpen(open); if (!open) setEditingClient(null); }}>
                <DialogTrigger asChild>
                  <Button className="gap-2" data-testid="add-client-btn">
                    <Plus className="w-4 h-4" />
                    {t("addClient")}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingClient ? t("edit") : t("addClient")}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateClient} className="space-y-4">
                    <div>
                      <Label>{language === "es" ? "Tipo" : "Type"}</Label>
                      <Select value={clientForm.client_type} onValueChange={(v) => setClientForm({ ...clientForm, client_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CLIENT_TYPES.map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{clientForm.client_type === "Company" ? (language === "es" ? "Nombre de Empresa" : "Company Name") : (language === "es" ? "Nombre" : "Name")} *</Label>
                      <Input
                        value={clientForm.display_name}
                        onChange={(e) => setClientForm({ ...clientForm, display_name: e.target.value })}
                        required
                        data-testid="client-name-input"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={clientForm.email}
                          onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>{language === "es" ? "Teléfono" : "Phone"}</Label>
                        <Input
                          value={clientForm.phone}
                          onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>{language === "es" ? "Dirección" : "Address"}</Label>
                      <Input
                        value={clientForm.address}
                        onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>{language === "es" ? "Fuente" : "Source"}</Label>
                      <Select value={clientForm.source} onValueChange={(v) => setClientForm({ ...clientForm, source: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CLIENT_SOURCES.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{language === "es" ? "Notas" : "Notes"}</Label>
                      <Textarea
                        value={clientForm.notes}
                        onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
                        rows={2}
                      />
                    </div>
                    <Button type="submit" className="w-full" data-testid="save-client-btn">{t("save")}</Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab("leads")}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === "es" ? "Nuevos Leads" : "New Leads"}</p>
                  <p className="text-2xl font-bold">{newLeadsCount}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Inbox className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === "es" ? "Total Leads" : "Total Leads"}</p>
                  <p className="text-2xl font-bold">{leads.length}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                  <Users className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab("clients")}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === "es" ? "Clientes" : "Clients"}</p>
                  <p className="text-2xl font-bold">{clients.length}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <UserCheck className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === "es" ? "Convertidos" : "Converted"}</p>
                  <p className="text-2xl font-bold">{leads.filter(l => l.status === "Converted").length}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="leads" className="gap-2">
              <Inbox className="w-4 h-4" />
              {language === "es" ? "Leads" : "Leads"}
              {newLeadsCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {newLeadsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="clients" className="gap-2">
              <Users className="w-4 h-4" />
              {language === "es" ? "Clientes" : "Clients"}
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="gap-2">
              <ArrowRight className="w-4 h-4" />
              Pipeline
            </TabsTrigger>
          </TabsList>

          {/* LEADS TAB */}
          <TabsContent value="leads" className="mt-6">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={language === "es" ? "Buscar leads..." : "Search leads..."}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === "es" ? "Todos" : "All"}</SelectItem>
                  {LEAD_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === "es" ? "Todas" : "All"}</SelectItem>
                  {LEAD_SOURCES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Leads Table */}
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === "es" ? "Nombre" : "Name"}</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>{language === "es" ? "Tipo Evento" : "Event Type"}</TableHead>
                    <TableHead>{language === "es" ? "Fecha" : "Date"}</TableHead>
                    <TableHead>{language === "es" ? "Fuente" : "Source"}</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">{language === "es" ? "Acciones" : "Actions"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead) => (
                    <TableRow key={lead.lead_id} data-testid={`lead-row-${lead.lead_id}`}>
                      <TableCell className="font-medium">
                        <div>
                          <p>{lead.lead_name}</p>
                          {lead.company_name && (
                            <p className="text-xs text-muted-foreground">{lead.company_name}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{lead.email}</TableCell>
                      <TableCell className="capitalize">{lead.event_type}</TableCell>
                      <TableCell>
                        {lead.event_date && lead.event_date !== "TBD" 
                          ? new Date(lead.event_date).toLocaleDateString() 
                          : "TBD"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{lead.source}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[lead.status] || "bg-gray-100"}>
                          {lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openLeadDetail(lead)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {lead.status !== "Converted" && lead.status !== "Discarded" && (
                            <>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-green-600 hover:text-green-700"
                                onClick={() => handleConvertLead(lead)}
                              >
                                <UserCheck className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDiscardLead(lead.lead_id)}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredLeads.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {language === "es" ? "No hay leads" : "No leads found"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* CLIENTS TAB */}
          <TabsContent value="clients" className="mt-6">
            <div className="relative max-w-sm mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={language === "es" ? "Buscar clientes..." : "Search clients..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="grid gap-4">
              {filteredClients.map((client) => (
                <Card key={client.client_id} className="hover:shadow-md transition-shadow" data-testid={`client-card-${client.client_id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center shrink-0">
                        {client.client_type === "Company" ? (
                          <Building2 className="w-5 h-5 text-secondary-foreground" />
                        ) : (
                          <span className="font-heading font-bold text-secondary-foreground">
                            {(client.display_name || client.name || "?").charAt(0)}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/crm/${client.client_id}`}
                            className="font-heading font-semibold text-foreground hover:text-primary truncate"
                          >
                            {client.display_name || client.name}
                          </Link>
                          <Badge variant="outline" className="text-xs">
                            {client.client_type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          {client.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" /> {client.email}
                            </span>
                          )}
                          {client.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {client.phone}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{client.source}</Badge>
                        <Badge className={client.status === "Active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                          {client.status}
                        </Badge>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditClient(client)}>
                            <Edit className="w-4 h-4 mr-2" />
                            {t("edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteClient(client.client_id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredClients.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    {t("noResults")}
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* PIPELINE TAB */}
          <TabsContent value="pipeline" className="mt-6">
            <Link to="/events?view=pipeline">
              <Button variant="outline" className="mb-4">
                {language === "es" ? "Ver Pipeline de Eventos" : "View Events Pipeline"}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <p className="text-muted-foreground">
              {language === "es" 
                ? "El pipeline de ventas vive en Eventos. Cada evento tiene su propia etapa (Lead, Contactado, Propuesta, Negociación, Ganado, Perdido)."
                : "The sales pipeline lives in Events. Each event has its own stage (Lead, Contacted, Proposal, Negotiation, Won, Lost)."}
            </p>
          </TabsContent>
        </Tabs>

        {/* Lead Detail Dialog */}
        <Dialog open={leadDetailOpen} onOpenChange={setLeadDetailOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{language === "es" ? "Detalle del Lead" : "Lead Detail"}</DialogTitle>
            </DialogHeader>
            {selectedLead && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">{language === "es" ? "Nombre" : "Name"}</Label>
                    <p className="font-medium">{selectedLead.lead_name}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Email</Label>
                    <p className="font-medium">{selectedLead.email}</p>
                  </div>
                  {selectedLead.phone && (
                    <div>
                      <Label className="text-muted-foreground">{language === "es" ? "Teléfono" : "Phone"}</Label>
                      <p className="font-medium">{selectedLead.phone}</p>
                    </div>
                  )}
                  {selectedLead.company_name && (
                    <div>
                      <Label className="text-muted-foreground">{language === "es" ? "Empresa" : "Company"}</Label>
                      <p className="font-medium">{selectedLead.company_name}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-muted-foreground">{isProfessionalServices ? (language === "es" ? "Tipo de Proyecto" : "Project Type") : (language === "es" ? "Tipo de Evento" : "Event Type")}</Label>
                    <p className="font-medium capitalize">{selectedLead.event_type}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{dateLabel}</Label>
                    <p className="font-medium">
                      {selectedLead.event_date && selectedLead.event_date !== "TBD"
                        ? new Date(selectedLead.event_date).toLocaleDateString()
                        : "TBD"}
                    </p>
                  </div>
                  {selectedLead.estimated_guest_count && (
                    <div>
                      <Label className="text-muted-foreground">{isProfessionalServices ? (language === "es" ? "Participantes" : "Participants") : (language === "es" ? "Invitados" : "Guests")}</Label>
                      <p className="font-medium">{selectedLead.estimated_guest_count}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-muted-foreground">{language === "es" ? "Fuente" : "Source"}</Label>
                    <Badge variant="outline">{selectedLead.source}</Badge>
                  </div>
                  {selectedLead.form_name && (
                    <div>
                      <Label className="text-muted-foreground">{language === "es" ? "Formulario" : "Form"}</Label>
                      <p className="font-medium">{selectedLead.form_name}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <Badge className={statusColors[selectedLead.status]}>{selectedLead.status}</Badge>
                  </div>
                </div>
                {selectedLead.message && (
                  <div>
                    <Label className="text-muted-foreground">{language === "es" ? "Mensaje" : "Message"}</Label>
                    <p className="mt-1 p-3 bg-muted rounded-lg text-sm">{selectedLead.message}</p>
                  </div>
                )}
                
                {selectedLead.status !== "Converted" && selectedLead.status !== "Discarded" && (
                  <div className="flex gap-3 pt-4 border-t">
                    <Button className="flex-1 gap-2" onClick={() => handleConvertLead(selectedLead)}>
                      <UserCheck className="w-4 h-4" />
                      {language === "es" ? "Convertir a Cliente" : "Convert to Client"}
                    </Button>
                    <Button 
                      variant="outline" 
                      className="text-destructive"
                      onClick={() => { handleDiscardLead(selectedLead.lead_id); setLeadDetailOpen(false); }}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      {language === "es" ? "Descartar" : "Discard"}
                    </Button>
                  </div>
                )}
                
                {selectedLead.status === "Converted" && (
                  <div className="p-4 bg-green-50 rounded-lg text-green-800 text-sm">
                    {language === "es" 
                      ? "Este lead ya fue convertido a cliente."
                      : "This lead has already been converted to a client."}
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
