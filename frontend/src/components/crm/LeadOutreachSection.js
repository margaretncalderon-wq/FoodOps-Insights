import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTerminology } from "../../hooks/useTerminology";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  Plus, Search, Phone, Mail, Building2, RefreshCw, User, 
  MoreHorizontal, CheckCircle, Eye, Clock, CalendarPlus,
  ArrowRight, UserCheck, Filter, MessageCircle, ExternalLink, Info, Edit
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "../ui/dropdown-menu";
import CommunicationsTimeline from "./CommunicationsTimeline";

import { API_BASE as API } from "../../utils/api";

// Cities by country
const CITIES_BY_COUNTRY = {
  "República Dominicana": [
    "Santo Domingo", "Santiago", "San Pedro de Macorís", "La Romana", "San Cristóbal",
    "Puerto Plata", "San Francisco de Macorís", "Higüey", "La Vega", "Moca",
    "Bonao", "Azua", "Baní", "Barahona", "Mao", "Cotuí", "Nagua", "Samaná",
    "Punta Cana", "Bávaro", "Boca Chica", "Juan Dolio", "Cabarete", "Sosúa"
  ],
  "Estados Unidos": [
    "Miami", "New York", "Los Angeles", "Houston", "Chicago", "Phoenix", "Orlando", "Tampa"
  ],
  "Puerto Rico": ["San Juan", "Ponce", "Mayagüez", "Bayamón", "Carolina"],
  "España": ["Madrid", "Barcelona", "Valencia", "Sevilla", "Málaga", "Bilbao"],
  "México": ["Ciudad de México", "Guadalajara", "Monterrey", "Cancún", "Tijuana"],
  "Colombia": ["Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena"],
  "Panamá": ["Ciudad de Panamá", "Colón", "David"],
  "Venezuela": ["Caracas", "Maracaibo", "Valencia", "Barquisimeto"]
};

// Helper to get cities based on country
const getCitiesForCountry = (country) => {
  if (!country) return CITIES_BY_COUNTRY["República Dominicana"];
  return CITIES_BY_COUNTRY[country] || [];
};

const COUNTRIES = [
  "República Dominicana", "Estados Unidos", "Puerto Rico", "España", "México",
  "Colombia", "Venezuela", "Panamá", "Costa Rica", "Guatemala", "Honduras",
  "El Salvador", "Nicaragua", "Cuba", "Haití", "Argentina", "Chile", "Perú",
  "Ecuador", "Brasil", "Canadá", "Francia", "Alemania", "Italia", "Reino Unido"
];

const OUTREACH_STATUSES = [
  { value: "New", labelEn: "New", labelEs: "Nuevo", color: "bg-blue-100 text-blue-700" },
  { value: "Contacted", labelEn: "Contacted", labelEs: "Contactado", color: "bg-yellow-100 text-yellow-700" },
  { value: "NoResponse", labelEn: "No Response", labelEs: "Sin Respuesta", color: "bg-gray-100 text-gray-700" },
  { value: "Engaged", labelEn: "Engaged", labelEs: "Interesado", color: "bg-green-100 text-green-700" }
];

const CLIENT_TYPES = [
  { value: "Individual", labelEn: "Direct", labelEs: "Directo" },
  { value: "Company", labelEn: "Corporate", labelEs: "Corporativo" }
];

export default function LeadOutreachSection() {
  const { language } = useLanguage();
  const { term } = useTerminology();
  const isEs = language === "es";
  const navigate = useNavigate();
  
  // Dynamic terminology
  const leadLabel = term("events", "lead");
  const leadsLabel = term("events", "leads");
  const clientLabel = term("events", "client");
  
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [form, setForm] = useState({
    lead_name: "",
    email: "",
    phone: "",
    whatsapp: "",
    company_name: "",
    client_type: "Individual",
    rnc: "",
    address: "",
    city: "",
    country: "República Dominicana",
    message: "",
    owner_id: "",
    event_type: ""
  });
  const [editForm, setEditForm] = useState({
    lead_name: "",
    email: "",
    phone: "",
    whatsapp: "",
    company_name: "",
    client_type: "Individual",
    rnc: "",
    address: "",
    city: "",
    country: "",
    message: "",
    owner_id: "",
    event_type: ""
  });
  const [followUpForm, setFollowUpForm] = useState({
    next_follow_up_date: "",
    follow_up_type: "Call"
  });

  // Helper to clean "nan" string values from lead data
  const cleanNanValues = useCallback((lead) => {
    if (!lead) return lead;
    const cleaned = { ...lead };
    const fieldsToClean = ['lead_name', 'name', 'email', 'phone', 'whatsapp', 'company_name', 'company', 'address', 'rnc', 'notes', 'message'];
    fieldsToClean.forEach(field => {
      if (cleaned[field] && typeof cleaned[field] === 'string') {
        const val = cleaned[field].toLowerCase();
        if (val === 'nan' || val === 'none' || val === 'null') {
          cleaned[field] = '';
        }
      }
    });
    return cleaned;
  }, []);

  const fetchLeads = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/crm/outreach`, { withCredentials: true });
      // Clean nan values from all leads
      const cleanedLeads = res.data.map(lead => cleanNanValues(lead));
      setLeads(cleanedLeads);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [cleanNanValues]);

  const fetchUsers = useCallback(async () => {
    try {
      // Try to fetch team members from the organization
      const res = await axios.get(`${API}/api/org/members`, { withCredentials: true });
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        setUsers(res.data.map(member => ({
          user_id: member.user_id,
          name: member.name || member.email || member.user_id.replace("user_", "User ")
        })));
        return;
      }
    } catch (err) {
      console.error("Error loading org members:", err);
    }
    
    // Fallback: try settings/team endpoint
    try {
      const teamRes = await axios.get(`${API}/api/settings/team`, { withCredentials: true });
      if (teamRes.data && Array.isArray(teamRes.data) && teamRes.data.length > 0) {
        setUsers(teamRes.data.map(member => ({
          user_id: member.user_id,
          name: member.name || member.email || member.user_id.replace("user_", "User ")
        })));
        return;
      }
    } catch (err) {
      console.error("Error loading team:", err);
    }
    
    // Last fallback: extract from leads
    const ownerIds = new Set();
    leads.forEach(l => l.owner_id && ownerIds.add(l.owner_id));
    if (ownerIds.size > 0) {
      setUsers(Array.from(ownerIds).map(id => ({ user_id: id, name: id.replace("user_", "User ") })));
    }
  }, [leads]);

  useEffect(() => { 
    fetchLeads(); 
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  useEffect(() => { 
    if (users.length === 0) {
      fetchUsers(); 
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads]);

  const resetForm = () => {
    setForm({
      lead_name: "",
      email: "",
      phone: "",
      whatsapp: "",
      company_name: "",
      client_type: "Individual",
      rnc: "",
      address: "",
      message: "",
      owner_id: "",
      event_type: "corporate"
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.lead_name || !form.email) {
      toast.error(isEs ? "Nombre y email son requeridos" : "Name and email are required");
      return;
    }
    try {
      const payload = {
        ...form,
        lead_type: "outreach",
        source: "Outreach",
        owner_id: form.owner_id === "unassigned" ? null : form.owner_id
      };
      
      const res = await axios.post(`${API}/api/crm/outreach`, payload, { withCredentials: true });
      
      if (form.owner_id && form.owner_id !== "unassigned" && res.data.lead_id) {
        await axios.put(`${API}/api/crm/assign/lead/${res.data.lead_id}?owner_id=${form.owner_id}`, {}, { withCredentials: true });
      }
      
      toast.success(isEs ? "Lead de outreach creado" : "Outreach lead created");
      fetchLeads();
      setDialogOpen(false);
      resetForm();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error al crear lead");
    }
  };

  const handleStatusChange = async (leadId, status) => {
    try {
      await axios.put(`${API}/api/crm/outreach/${leadId}/status?outreach_status=${status}`, {}, { withCredentials: true });
      toast.success(isEs ? "Estado actualizado" : "Status updated");
      fetchLeads();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleConvert = async (createEvent = true) => {
    if (!selectedLead) return;
    try {
      const clientRes = await axios.post(`${API}/api/leads/${selectedLead.lead_id}/convert`, {
        create_event: createEvent
      }, { withCredentials: true });
      
      toast.success(isEs ? "Lead convertido exitosamente" : "Lead converted successfully");
      setConvertOpen(false);
      setDetailOpen(false);
      fetchLeads();
      
      if (createEvent && clientRes.data.event_id) {
        navigate(`/events/${clientRes.data.event_id}`);
      } else if (clientRes.data.client_id) {
        navigate(`/crm/clients`);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error converting lead");
    }
  };

  const openFollowUp = (lead) => {
    setSelectedLead(lead);
    setFollowUpForm({
      next_follow_up_date: lead.next_follow_up_date || "",
      follow_up_type: lead.follow_up_type || "Call"
    });
    setFollowUpOpen(true);
  };

  const handleSetFollowUp = async () => {
    if (!selectedLead) return;
    try {
      const params = new URLSearchParams();
      if (followUpForm.next_follow_up_date) params.append("next_follow_up_date", followUpForm.next_follow_up_date);
      if (followUpForm.follow_up_type) params.append("follow_up_type", followUpForm.follow_up_type);
      
      await axios.put(
        `${API}/api/crm/follow-ups/lead/${selectedLead.lead_id}?${params.toString()}`,
        {},
        { withCredentials: true }
      );
      toast.success(isEs ? "Seguimiento programado" : "Follow-up scheduled");
      setFollowUpOpen(false);
      fetchLeads();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const viewLead = (lead) => {
    setSelectedLead(lead);
    setDetailOpen(true);
  };

  const openEdit = (lead) => {
    setSelectedLead(lead);
    setEditForm({
      lead_name: lead.lead_name || lead.name || "",
      email: lead.email || "",
      phone: lead.phone || "",
      whatsapp: lead.whatsapp || "",
      company_name: lead.company_name || lead.company || "",
      client_type: lead.client_type || "Individual",
      rnc: lead.rnc || "",
      address: lead.address || "",
      city: lead.city || "",
      country: lead.country || "",
      message: lead.message || lead.notes || "",
      owner_id: lead.owner_id || "",
      event_type: lead.event_type || ""
    });
    setEditOpen(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!selectedLead) return;
    
    try {
      await axios.put(`${API}/api/leads/${selectedLead.lead_id}`, {
        lead_name: editForm.lead_name,
        name: editForm.lead_name,
        email: editForm.email,
        phone: editForm.phone,
        whatsapp: editForm.whatsapp,
        company_name: editForm.company_name,
        company: editForm.company_name,
        city: editForm.city,
        country: editForm.country,
        client_type: editForm.client_type,
        rnc: editForm.rnc,
        address: editForm.address,
        message: editForm.message,
        notes: editForm.message,
        owner_id: editForm.owner_id || null,
        event_type: editForm.event_type
      }, { withCredentials: true });
      
      toast.success(isEs ? "Lead actualizado" : "Lead updated");
      setEditOpen(false);
      setDetailOpen(false);
      fetchLeads();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error al actualizar");
    }
  };

  const openConvert = (lead) => {
    setSelectedLead(lead);
    setConvertOpen(true);
  };

  const getWhatsAppLink = (number) => {
    if (!number) return null;
    const cleaned = number.replace(/\D/g, '');
    return `https://wa.me/${cleaned}`;
  };

  // Helper to get the effective status - prioritize outreach_status, fallback to status
  const getEffectiveStatus = (lead) => {
    if (!lead) return "New";
    return lead.outreach_status || lead.status || "New";
  };

  const filteredLeads = leads.filter(lead => {
    const leadName = lead.lead_name || lead.name || "";
    const email = lead.email || "";
    const companyName = lead.company_name || lead.company || "";
    
    const matchesSearch = leadName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         companyName.toLowerCase().includes(searchTerm.toLowerCase());
    const effectiveStatus = getEffectiveStatus(lead);
    const matchesStatus = statusFilter === "all" || effectiveStatus.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status) => {
    const normalizedStatus = status?.toLowerCase();
    const s = OUTREACH_STATUSES.find(st => st.value.toLowerCase() === normalizedStatus) || OUTREACH_STATUSES[0];
    return <Badge className={s.color}>{isEs ? s.labelEs : s.labelEn}</Badge>;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="lead-outreach-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{isEs ? "Lead Outreach" : "Lead Outreach"}</h2>
          <p className="text-muted-foreground text-sm">
            {isEs ? "Contactos proactivos iniciados por el equipo" : "Proactive contacts initiated by the team"}
          </p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="new-outreach-btn">
          <Plus className="w-4 h-4 mr-2" />
          {isEs ? "Nuevo Outreach" : "New Outreach"}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {OUTREACH_STATUSES.map(status => {
          const count = leads.filter(l => getEffectiveStatus(l).toLowerCase() === status.value.toLowerCase()).length;
          return (
            <Card 
              key={status.value} 
              className={`cursor-pointer transition-all ${statusFilter === status.value ? "ring-2 ring-primary" : ""}`}
              onClick={() => setStatusFilter(statusFilter === status.value ? "all" : status.value)}
            >
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{isEs ? status.labelEs : status.labelEn}</p>
                    <div className="text-2xl font-bold">{count}</div>
                  </div>
                  {statusFilter === status.value && (
                    <Filter className="w-4 h-4 text-primary" />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Search & Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={isEs ? "Buscar leads..." : "Search leads..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={isEs ? "Filtrar por estado" : "Filter by status"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isEs ? "Todos los estados" : "All statuses"}</SelectItem>
            {OUTREACH_STATUSES.map(status => (
              <SelectItem key={status.value} value={status.value}>
                {isEs ? status.labelEs : status.labelEn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                <TableHead>{isEs ? "Contacto" : "Contact"}</TableHead>
                <TableHead>{isEs ? "Empresa" : "Company"}</TableHead>
                <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                <TableHead>{isEs ? "Seguimiento" : "Follow-up"}</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>{isEs ? "Acciones" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay leads de outreach" : "No outreach leads"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => (
                  <TableRow key={lead.lead_id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {lead.client_type === "Company" ? (
                          <Building2 className="w-4 h-4 text-blue-600" />
                        ) : (
                          <User className="w-4 h-4 text-purple-600" />
                        )}
                        {lead.lead_name || lead.name || lead.company_name || "-"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {lead.whatsapp && (
                          <a href={getWhatsAppLink(lead.whatsapp)} target="_blank" rel="noopener noreferrer" 
                             className="text-green-600 hover:text-green-700" title="WhatsApp">
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                        {lead.email && (
                          <a href={`mailto:${lead.email}`} className="text-blue-600 hover:text-blue-700" title="Email">
                            <Mail className="w-4 h-4" />
                          </a>
                        )}
                        {lead.phone && (
                          <a href={`tel:${lead.phone}`} className="text-muted-foreground hover:text-foreground" title={isEs ? "Llamar" : "Call"}>
                            <Phone className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {lead.company_name && (
                        <span className="flex items-center gap-1 text-sm">
                          <Building2 className="w-3 h-3" />
                          {lead.company_name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(getEffectiveStatus(lead))}</TableCell>
                    <TableCell>
                      {lead.next_follow_up_date ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="w-3 h-3" />
                          {new Date(lead.next_follow_up_date).toLocaleDateString()}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.owner_id ? (
                        <Badge variant="outline" className="text-xs">
                          {users.find(u => u.user_id === lead.owner_id)?.name || lead.owner_id.replace("user_", "").slice(0, 8)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => viewLead(lead)} title={isEs ? "Ver" : "View"}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(lead)}>
                              <Edit className="w-4 h-4 mr-2" />
                              {isEs ? "Editar" : "Edit"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {OUTREACH_STATUSES.map(status => (
                              <DropdownMenuItem 
                                key={status.value}
                                onClick={() => handleStatusChange(lead.lead_id, status.value)}
                              >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                {isEs ? `Marcar ${status.labelEs}` : `Mark ${status.labelEn}`}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openFollowUp(lead)}>
                              <CalendarPlus className="w-4 h-4 mr-2" />
                              {isEs ? "Programar Seguimiento" : "Schedule Follow-up"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openConvert(lead)} className="text-green-600">
                              <ArrowRight className="w-4 h-4 mr-2" />
                              {isEs ? "Convertir a Cliente" : "Convert to Client"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Dialog - Enhanced with Client-compatible fields */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEs ? "Nuevo Lead de Outreach" : "New Outreach Lead"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>{isEs ? "Nombre" : "Name"} *</Label>
                <Input
                  value={form.lead_name}
                  onChange={(e) => setForm({ ...form, lead_name: e.target.value })}
                  required
                  data-testid="outreach-name-input"
                />
              </div>
              <div>
                <Label>{isEs ? "Tipo" : "Type"}</Label>
                <Select value={form.client_type} onValueChange={(v) => setForm({ ...form, client_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENT_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {isEs ? type.labelEs : type.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>RNC</Label>
                <Input
                  value={form.rnc}
                  onChange={(e) => setForm({ ...form, rnc: e.target.value })}
                  placeholder="000-00000-0"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  data-testid="outreach-email-input"
                />
              </div>
              <div>
                <Label>{isEs ? "Teléfono" : "Phone"}</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>WhatsApp</Label>
              <Input
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                placeholder="+1 809 555 1234"
              />
            </div>

            <div>
              <Label>{isEs ? "Empresa" : "Company"}</Label>
              <Input
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              />
            </div>

            <div>
              <Label>{isEs ? "Dirección" : "Address"}</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Ciudad" : "City"}</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder={isEs ? "Santo Domingo" : "City name"}
                  list="city-list-new"
                />
                <datalist id="city-list-new">
                  {getCitiesForCountry(form.country).filter(c => 
                    c.toLowerCase().includes((form.city || "").toLowerCase())
                  ).map(city => (
                    <option key={city} value={city} />
                  ))}
                </datalist>
              </div>
              <div>
                <Label>{isEs ? "País" : "Country"}</Label>
                <Input
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  placeholder={isEs ? "República Dominicana" : "Country"}
                  list="country-list-new"
                />
                <datalist id="country-list-new">
                  {COUNTRIES.filter(c => c.toLowerCase().includes((form.country || "").toLowerCase())).map(country => (
                    <option key={country} value={country} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <Label>{isEs ? "Asignar a" : "Assign to"}</Label>
              <Select value={form.owner_id || "unassigned"} onValueChange={(v) => setForm({ ...form, owner_id: v === "unassigned" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar owner" : "Select owner"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">{isEs ? "Sin asignar" : "Unassigned"}</SelectItem>
                  {users.map(user => (
                    <SelectItem key={user.user_id} value={user.user_id}>{user.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {isEs ? "Cancelar" : "Cancel"}
              </Button>
              <Button type="submit" data-testid="create-outreach-submit-btn">{isEs ? "Crear" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog - Enhanced */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedLead?.client_type === "Company" ? (
                <Building2 className="w-5 h-5 text-blue-600" />
              ) : (
                <User className="w-5 h-5 text-purple-600" />
              )}
              {selectedLead?.lead_name}
              {selectedLead && getStatusBadge(getEffectiveStatus(selectedLead))}
            </DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="info" className="text-xs">
                  <Info className="w-3 h-3 mr-1" /> Info
                </TabsTrigger>
                <TabsTrigger value="comms" className="text-xs">
                  <MessageCircle className="w-3 h-3 mr-1" /> Comms
                </TabsTrigger>
              </TabsList>

              {/* Info Tab */}
              <TabsContent value="info" className="space-y-4 mt-0">
                {/* Quick Contact Links */}
                <div className="flex flex-wrap gap-2">
                  {selectedLead.whatsapp && (
                    <a href={getWhatsAppLink(selectedLead.whatsapp)} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="text-green-600 border-green-200 hover:bg-green-50">
                        <MessageCircle className="w-4 h-4 mr-2" />
                        WhatsApp
                        <ExternalLink className="w-3 h-3 ml-2" />
                      </Button>
                    </a>
                  )}
                  {selectedLead.email && (
                    <a href={`mailto:${selectedLead.email}`}>
                      <Button variant="outline" size="sm" className="text-blue-600 border-blue-200 hover:bg-blue-50">
                        <Mail className="w-4 h-4 mr-2" />
                        Email
                        <ExternalLink className="w-3 h-3 ml-2" />
                      </Button>
                    </a>
                  )}
                  {selectedLead.phone && (
                    <a href={`tel:${selectedLead.phone}`}>
                      <Button variant="outline" size="sm">
                        <Phone className="w-4 h-4 mr-2" />
                        {isEs ? "Llamar" : "Call"}
                      </Button>
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Email</p>
                    <p className="font-medium truncate">{selectedLead.email || "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">{isEs ? "Teléfono" : "Phone"}</p>
                    <p className="font-medium">{selectedLead.phone || "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">WhatsApp</p>
                    <p className="font-medium">{selectedLead.whatsapp || "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">RNC</p>
                    <p className="font-medium font-mono">{selectedLead.rnc || "-"}</p>
                  </div>
                </div>

                {selectedLead.company_name && (
                  <div className="text-sm">
                    <p className="text-muted-foreground text-xs">{isEs ? "Empresa" : "Company"}</p>
                    <p className="font-medium flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      {selectedLead.company_name}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">{isEs ? "Último Contacto" : "Last Contact"}</p>
                    <p className="font-medium">
                      {selectedLead.last_contact_date 
                        ? new Date(selectedLead.last_contact_date).toLocaleDateString()
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Owner</p>
                    <p className="font-medium">
                      {selectedLead.owner_id 
                        ? users.find(u => u.user_id === selectedLead.owner_id)?.name || selectedLead.owner_id.replace("user_", "").slice(0, 8)
                        : (isEs ? "Sin asignar" : "Unassigned")}
                    </p>
                  </div>
                </div>

                {/* Address/Location info */}
                {(selectedLead.address || selectedLead.city) && (
                  <div className="text-sm">
                    <p className="text-muted-foreground text-xs">{isEs ? "Ubicación" : "Location"}</p>
                    <p className="font-medium">
                      {[selectedLead.address, selectedLead.city, selectedLead.country].filter(Boolean).join(", ") || "-"}
                    </p>
                  </div>
                )}

                {selectedLead.message && (
                  <div className="text-sm">
                    <p className="text-muted-foreground text-xs">{isEs ? "Notas" : "Notes"}</p>
                    <p className="mt-1 p-2 bg-muted rounded text-xs">{selectedLead.message}</p>
                  </div>
                )}

                {/* Follow-up info */}
                {selectedLead.next_follow_up_date ? (
                  <div className="p-2 bg-yellow-50 rounded border border-yellow-200 text-sm">
                    <p className="font-medium text-yellow-800 flex items-center gap-2 text-xs">
                      <Clock className="w-3 h-3" />
                      {isEs ? "Seguimiento programado" : "Follow-up scheduled"}
                    </p>
                    <p className="text-yellow-700 text-xs mt-1">
                      {selectedLead.follow_up_type} - {new Date(selectedLead.next_follow_up_date).toLocaleDateString()}
                    </p>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => { setDetailOpen(false); openFollowUp(selectedLead); }}>
                    <CalendarPlus className="w-3 h-3 mr-2" />
                    {isEs ? "Programar Seguimiento" : "Schedule Follow-up"}
                  </Button>
                )}

                <div className="pt-3 border-t space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {isEs ? "Creado" : "Created"}: {new Date(selectedLead.created_at).toLocaleString()}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setDetailOpen(false); openEdit(selectedLead); }} data-testid="edit-lead-btn">
                      <Edit className="w-3 h-3 mr-2" />
                      {isEs ? "Editar" : "Edit"}
                    </Button>
                    <Button size="sm" onClick={() => openConvert(selectedLead)} data-testid="convert-outreach-btn">
                      <ArrowRight className="w-3 h-3 mr-2" />
                      {isEs ? "Convertir" : "Convert"}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Comms Tab */}
              <TabsContent value="comms" className="mt-0">
                <CommunicationsTimeline 
                  entityType="lead" 
                  entityId={selectedLead.lead_id}
                  entityName={selectedLead.lead_name || selectedLead.company_name || "Lead"}
                  maxVisible={10}
                />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Convert Dialog */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Convertir Lead" : "Convert Lead"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              {isEs 
                ? `¿Cómo deseas convertir a "${selectedLead?.lead_name}"?`
                : `How would you like to convert "${selectedLead?.lead_name}"?`}
            </p>
            {selectedLead && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium mb-2">{isEs ? "Datos a transferir:" : "Data to transfer:"}</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• {isEs ? "Nombre" : "Name"}: {selectedLead.lead_name}</li>
                  <li>• Email: {selectedLead.email}</li>
                  {selectedLead.phone && <li>• {isEs ? "Teléfono" : "Phone"}: {selectedLead.phone}</li>}
                  {selectedLead.whatsapp && <li>• WhatsApp: {selectedLead.whatsapp}</li>}
                  {selectedLead.rnc && <li>• RNC: {selectedLead.rnc}</li>}
                  {selectedLead.company_name && <li>• {isEs ? "Empresa" : "Company"}: {selectedLead.company_name}</li>}
                  {selectedLead.address && <li>• {isEs ? "Dirección" : "Address"}: {selectedLead.address}</li>}
                </ul>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Card 
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleConvert(true)}
                data-testid="convert-with-event"
              >
                <CardContent className="pt-6 text-center">
                  <CalendarPlus className="w-12 h-12 mx-auto mb-4 text-primary" />
                  <h3 className="font-semibold">{isEs ? "Crear Cliente + Evento" : "Create Client + Event"}</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    {isEs 
                      ? "Crea el cliente y abre un nuevo evento"
                      : "Create client and open a new event"}
                  </p>
                </CardContent>
              </Card>
              <Card 
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleConvert(false)}
                data-testid="convert-client-only"
              >
                <CardContent className="pt-6 text-center">
                  <UserCheck className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-semibold">{isEs ? "Solo Cliente" : "Client Only"}</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    {isEs 
                      ? "Crea solo el cliente sin evento"
                      : "Create client without event"}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Follow-up Dialog */}
      <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Programar Seguimiento" : "Schedule Follow-up"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Fecha" : "Date"}</Label>
              <Input
                type="date"
                value={followUpForm.next_follow_up_date}
                onChange={(e) => setFollowUpForm({ ...followUpForm, next_follow_up_date: e.target.value })}
              />
            </div>
            <div>
              <Label>{isEs ? "Tipo" : "Type"}</Label>
              <Select 
                value={followUpForm.follow_up_type} 
                onValueChange={(v) => setFollowUpForm({ ...followUpForm, follow_up_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Call">{isEs ? "Llamada" : "Call"}</SelectItem>
                  <SelectItem value="Email">Email</SelectItem>
                  <SelectItem value="Meeting">{isEs ? "Reunión" : "Meeting"}</SelectItem>
                  <SelectItem value="CheckIn">{isEs ? "Seguimiento" : "Check-in"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFollowUpOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSetFollowUp}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEs ? "Editar Lead" : "Edit Lead"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>{isEs ? "Nombre" : "Name"} *</Label>
                <Input
                  value={editForm.lead_name}
                  onChange={(e) => setEditForm({ ...editForm, lead_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>{isEs ? "Tipo" : "Type"}</Label>
                <Select value={editForm.client_type} onValueChange={(v) => setEditForm({ ...editForm, client_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENT_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {isEs ? type.labelEs : type.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>RNC</Label>
                <Input
                  value={editForm.rnc}
                  onChange={(e) => setEditForm({ ...editForm, rnc: e.target.value })}
                  placeholder="000-00000-0"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
              <div>
                <Label>{isEs ? "Teléfono" : "Phone"}</Label>
                <Input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>WhatsApp</Label>
              <Input
                value={editForm.whatsapp}
                onChange={(e) => setEditForm({ ...editForm, whatsapp: e.target.value })}
                placeholder="+1 809 555 1234"
              />
            </div>

            <div>
              <Label>{isEs ? "Empresa" : "Company"}</Label>
              <Input
                value={editForm.company_name}
                onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
              />
            </div>

            <div>
              <Label>{isEs ? "Dirección" : "Address"}</Label>
              <Input
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Ciudad" : "City"}</Label>
                <div className="relative">
                  <Input
                    value={editForm.city}
                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                    placeholder={isEs ? "Santo Domingo" : "City name"}
                    list="city-list"
                  />
                  <datalist id="city-list">
                    {getCitiesForCountry(editForm.country).filter(c => c.toLowerCase().includes((editForm.city || "").toLowerCase())).map(city => (
                      <option key={city} value={city} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div>
                <Label>{isEs ? "País" : "Country"}</Label>
                <div className="relative">
                  <Input
                    value={editForm.country}
                    onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                    placeholder={isEs ? "República Dominicana" : "Country"}
                    list="country-list"
                  />
                  <datalist id="country-list">
                    {COUNTRIES.filter(c => c.toLowerCase().includes((editForm.country || "").toLowerCase())).map(country => (
                      <option key={country} value={country} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            <div>
              <Label>{isEs ? "Asignar a" : "Assign to"}</Label>
              <Select value={editForm.owner_id || "unassigned"} onValueChange={(v) => setEditForm({ ...editForm, owner_id: v === "unassigned" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar owner" : "Select owner"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">{isEs ? "Sin asignar" : "Unassigned"}</SelectItem>
                  {users.map(user => (
                    <SelectItem key={user.user_id} value={user.user_id}>{user.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Textarea
                value={editForm.message}
                onChange={(e) => setEditForm({ ...editForm, message: e.target.value })}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                {isEs ? "Cancelar" : "Cancel"}
              </Button>
              <Button type="submit">{isEs ? "Guardar" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
