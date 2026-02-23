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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  Search, Phone, Mail, Building2, RefreshCw, User, Calendar, 
  Globe, Instagram, MessageSquare, UserPlus, Eye, ArrowRight,
  Clock, Star, CalendarPlus, UserCheck, Users, FileText,
  MessageCircle, ExternalLink, DollarSign, Info
} from "lucide-react";
import CommunicationsTimeline from "./CommunicationsTimeline";

import { API_BASE as API } from "../../utils/api";

const SOURCE_ICONS = {
  Website: Globe,
  Instagram: Instagram,
  QR: MessageSquare,
  Referral: UserPlus,
  Email: Mail,
  Social: Instagram,
  Other: User
};

const STATUS_FILTERS = [
  { value: "all", labelEn: "All", labelEs: "Todos" },
  { value: "New", labelEn: "New", labelEs: "Nuevo" },
  { value: "Contacted", labelEn: "Contacted", labelEs: "Contactado" },
  { value: "Converted", labelEn: "Converted", labelEs: "Convertido" }
];

export default function LeadInboundSection() {
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
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [selectedLead, setSelectedLead] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
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
      const res = await axios.get(`${API}/api/crm/inbound`, { withCredentials: true });
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
    
    try {
      const teamRes = await axios.get(`${API}/api/settings/team`, { withCredentials: true });
      if (teamRes.data && Array.isArray(teamRes.data) && teamRes.data.length > 0) {
        setUsers(teamRes.data.map(member => ({
          user_id: member.user_id,
          name: member.name || member.email || member.user_id.replace("user_", "User ")
        })));
      }
    } catch (err) {
      console.error("Error loading team:", err);
    }
  }, []);

  useEffect(() => { 
    fetchLeads(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter leads - with null safety
  const filteredLeads = leads.filter(lead => {
    const leadName = lead.lead_name || lead.name || "";
    const email = lead.email || "";
    const companyName = lead.company_name || lead.company || "";
    
    const matchesSearch = leadName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         companyName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || (lead.status || "").toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  // Stats - case-insensitive comparison
  const newLeads = leads.filter(l => l.status?.toLowerCase() === "new").length;
  const contactedLeads = leads.filter(l => l.status?.toLowerCase() === "contacted").length;
  const convertedLeads = leads.filter(l => l.status?.toLowerCase() === "converted").length;

  const getSourceIcon = (source) => {
    const Icon = SOURCE_ICONS[source] || SOURCE_ICONS.Other;
    return <Icon className="w-4 h-4" />;
  };

  const getStatusBadge = (status) => {
    const colors = {
      New: "bg-blue-100 text-blue-700 border-blue-300",
      Contacted: "bg-yellow-100 text-yellow-700 border-yellow-300",
      Converted: "bg-green-100 text-green-700 border-green-300",
      Discarded: "bg-gray-100 text-gray-700 border-gray-300"
    };
    return <Badge className={colors[status] || colors.New}>{status}</Badge>;
  };

  const viewLead = (lead) => {
    setSelectedLead(lead);
    setDetailOpen(true);
  };

  const openConvert = (lead) => {
    setSelectedLead(lead);
    setConvertOpen(true);
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

  const getWhatsAppLink = (number) => {
    if (!number) return null;
    const cleaned = number.replace(/\D/g, '');
    return `https://wa.me/${cleaned}`;
  };

  // Check if lead is new (created in last 24 hours)
  const isNewLead = (lead) => {
    if (!lead.created_at) return false;
    const created = new Date(lead.created_at);
    const now = new Date();
    const diff = now - created;
    return diff < 24 * 60 * 60 * 1000;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="lead-inbound-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{isEs ? "Leads Inbound" : "Inbound Leads"}</h2>
          <p className="text-muted-foreground text-sm">
            {isEs ? "Solicitudes recibidas vía formularios y redes" : "Requests received via forms and social"}
          </p>
        </div>
        <Button variant="outline" onClick={fetchLeads}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {isEs ? "Actualizar" : "Refresh"}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card 
          className={`cursor-pointer ${newLeads > 0 ? "border-blue-300 bg-blue-50" : ""} ${statusFilter === "New" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setStatusFilter(statusFilter === "New" ? "all" : "New")}
        >
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Star className={`w-5 h-5 ${newLeads > 0 ? "text-blue-600" : "text-muted-foreground"}`} />
              <span className="text-sm">{isEs ? "Nuevos" : "New"}</span>
            </div>
            <div className="text-3xl font-bold">{newLeads}</div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer ${statusFilter === "Contacted" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setStatusFilter(statusFilter === "Contacted" ? "all" : "Contacted")}
        >
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Phone className="w-5 h-5 text-yellow-600" />
              <span className="text-sm">{isEs ? "Contactados" : "Contacted"}</span>
            </div>
            <div className="text-3xl font-bold">{contactedLeads}</div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer ${statusFilter === "Converted" ? "ring-2 ring-primary" : ""}`}
          onClick={() => setStatusFilter(statusFilter === "Converted" ? "all" : "Converted")}
        >
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <UserCheck className="w-5 h-5 text-green-600" />
              <span className="text-sm">{isEs ? "Convertidos" : "Converted"}</span>
            </div>
            <div className="text-3xl font-bold">{convertedLeads}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <User className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm">Total</span>
            </div>
            <div className="text-3xl font-bold">{leads.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
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
            <SelectValue placeholder={isEs ? "Estado" : "Status"} />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map(status => (
              <SelectItem key={status.value} value={status.value}>
                {isEs ? status.labelEs : status.labelEn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {statusFilter !== "all" && (
          <Button variant="outline" onClick={() => setStatusFilter("all")} size="sm">
            {isEs ? "Limpiar" : "Clear"}
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Fuente" : "Source"}</TableHead>
                <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                <TableHead>{isEs ? "Contacto" : "Contact"}</TableHead>
                <TableHead>{isEs ? "Tipo Evento" : "Event Type"}</TableHead>
                <TableHead>{isEs ? "Invitados" : "Guests"}</TableHead>
                <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                <TableHead>{isEs ? "Acciones" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay leads inbound" : "No inbound leads"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => (
                  <TableRow 
                    key={lead.lead_id} 
                    className={`cursor-pointer hover:bg-muted/50 ${isNewLead(lead) ? "bg-blue-50/50" : ""}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getSourceIcon(lead.source)}
                        <span className="text-sm">{lead.source}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {lead.lead_name}
                        {isNewLead(lead) && (
                          <Badge className="bg-blue-500 text-white text-xs">NEW</Badge>
                        )}
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
                      <Badge variant="outline">{lead.event_type}</Badge>
                    </TableCell>
                    <TableCell>
                      {lead.estimated_guest_count ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Users className="w-3 h-3" />
                          {lead.estimated_guest_count}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(lead.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => viewLead(lead)} title={isEs ? "Ver" : "View"}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openFollowUp(lead)} title={isEs ? "Seguimiento" : "Follow-up"}>
                          <CalendarPlus className="w-4 h-4" />
                        </Button>
                        {lead.status !== "Converted" && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => openConvert(lead)} 
                            title={isEs ? "Convertir" : "Convert"}
                            data-testid={`convert-inbound-${lead.lead_id}`}
                          >
                            <ArrowRight className="w-4 h-4 text-green-600" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Dialog - Enhanced with Tabs */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedLead?.lead_name}
              {selectedLead && isNewLead(selectedLead) && (
                <Badge className="bg-blue-500 text-white">NEW</Badge>
              )}
              {selectedLead && getStatusBadge(selectedLead.status)}
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

                {/* Source & Form Info */}
                <Card className="bg-muted/50">
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-3 h-3" />
                      <span className="font-medium text-xs">{isEs ? "Datos del Formulario" : "Form Data"}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">{isEs ? "Fuente" : "Source"}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {getSourceIcon(selectedLead.source)}
                          <span className="font-medium">{selectedLead.source}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{isEs ? "Recibido" : "Received"}</p>
                        <p className="font-medium">{new Date(selectedLead.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Contact Info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Email</p>
                    <p className="font-medium truncate">{selectedLead.email || "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">{isEs ? "Teléfono" : "Phone"}</p>
                    <p className="font-medium">{selectedLead.phone || "-"}</p>
                  </div>
                  {selectedLead.whatsapp && (
                    <div>
                      <p className="text-muted-foreground text-xs">WhatsApp</p>
                      <p className="font-medium">{selectedLead.whatsapp}</p>
                    </div>
                  )}
                  {selectedLead.company_name && (
                    <div>
                      <p className="text-muted-foreground text-xs">{isEs ? "Empresa" : "Company"}</p>
                      <p className="font-medium flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {selectedLead.company_name}
                      </p>
                    </div>
                  )}
                </div>

                {/* Event Request Details - Only show if event data exists */}
                {(selectedLead.event_type || selectedLead.event_date || selectedLead.estimated_guest_count) && (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-3 h-3 text-primary" />
                        <span className="font-medium text-xs">{isEs ? "Solicitud de Evento" : "Event Request"}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        {selectedLead.event_type && (
                          <div>
                            <p className="text-muted-foreground">{isEs ? "Tipo" : "Type"}</p>
                            <p className="font-medium">{selectedLead.event_type}</p>
                          </div>
                        )}
                        {selectedLead.event_date && (
                          <div>
                            <p className="text-muted-foreground">{isEs ? "Fecha" : "Date"}</p>
                            <p className="font-medium">{selectedLead.event_date}</p>
                          </div>
                        )}
                        {selectedLead.estimated_guest_count && (
                          <div>
                            <p className="text-muted-foreground">{isEs ? "Invitados" : "Guests"}</p>
                            <p className="font-medium flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {selectedLead.estimated_guest_count}
                            </p>
                          </div>
                        )}
                      </div>
                      {selectedLead.budget_range && (
                        <div className="mt-2 text-xs">
                          <p className="text-muted-foreground">{isEs ? "Presupuesto" : "Budget"}</p>
                          <p className="font-medium flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            {selectedLead.budget_range}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Message */}
                {selectedLead.message && (
                  <div className="text-sm">
                    <p className="text-muted-foreground text-xs">{isEs ? "Mensaje del Cliente" : "Client Message"}</p>
                    <p className="mt-1 p-2 bg-muted rounded text-xs whitespace-pre-wrap">{selectedLead.message}</p>
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

                {/* Convert Button */}
                {selectedLead.status !== "Converted" && (
                  <div className="pt-3 border-t">
                    <Button 
                      className="w-full" 
                      size="sm"
                      onClick={() => { setDetailOpen(false); openConvert(selectedLead); }}
                      data-testid="convert-inbound-detail-btn"
                    >
                      <ArrowRight className="w-3 h-3 mr-2" />
                      {isEs ? "Convertir a Cliente" : "Convert to Client"}
                    </Button>
                  </div>
                )}

                {/* Already Converted */}
                {selectedLead.status === "Converted" && (
                  <div className="p-2 bg-green-50 rounded border border-green-200">
                    <p className="text-xs font-medium text-green-800 flex items-center gap-2">
                      <UserCheck className="w-3 h-3" />
                      {isEs ? "Lead convertido" : "Lead converted"}
                    </p>
                    {selectedLead.converted_client_id && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2 h-7 text-xs"
                        onClick={() => navigate(`/crm/clients`)}
                      >
                        {isEs ? "Ver Cliente" : "View Client"}
                      </Button>
                    )}
                  </div>
                )}
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
            
            {/* Preview of data to transfer */}
            {selectedLead && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium mb-2">{isEs ? "Datos del formulario a transferir:" : "Form data to transfer:"}</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• {isEs ? "Nombre" : "Name"}: {selectedLead.lead_name}</li>
                  <li>• Email: {selectedLead.email}</li>
                  {selectedLead.phone && <li>• {isEs ? "Teléfono" : "Phone"}: {selectedLead.phone}</li>}
                  {selectedLead.whatsapp && <li>• WhatsApp: {selectedLead.whatsapp}</li>}
                  {selectedLead.company_name && <li>• {isEs ? "Empresa" : "Company"}: {selectedLead.company_name}</li>}
                  {selectedLead.event_type && <li>• {isEs ? "Tipo Evento" : "Event Type"}: {selectedLead.event_type}</li>}
                  {selectedLead.event_date && <li>• {isEs ? "Fecha" : "Date"}: {selectedLead.event_date}</li>}
                  {selectedLead.estimated_guest_count && <li>• {isEs ? "Invitados" : "Guests"}: {selectedLead.estimated_guest_count}</li>}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Card 
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleConvert(true)}
                data-testid="convert-inbound-with-event"
              >
                <CardContent className="pt-6 text-center">
                  <CalendarPlus className="w-12 h-12 mx-auto mb-4 text-primary" />
                  <h3 className="font-semibold">{isEs ? "Crear Cliente + Evento" : "Create Client + Event"}</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    {isEs 
                      ? "Crea el cliente y abre un nuevo evento con los datos del formulario"
                      : "Create client and open a new event with form data"}
                  </p>
                </CardContent>
              </Card>
              <Card 
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleConvert(false)}
                data-testid="convert-inbound-client-only"
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
    </div>
  );
}
