import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  MessageCircle, ExternalLink, DollarSign, Info, Trash2, AlertTriangle, ArrowUpDown, MoreHorizontal, Plus
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "../ui/dropdown-menu";
import { Textarea } from "../ui/textarea";
import CommunicationsTimeline from "./CommunicationsTimeline";
import CommsChannelTimeline from "./CommsChannelTimeline";
import UnifiedCommsTimeline from "./UnifiedCommsTimeline";

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
  const [sortBy, setSortBy] = useState("date_desc");
  const [selectedLead, setSelectedLead] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [followUpForm, setFollowUpForm] = useState({
    next_follow_up_date: "",
    follow_up_type: "Call"
  });
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignOwnerId, setAssignOwnerId] = useState("");
  
  // Lead contacts state
  const [leadContacts, setLeadContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    phone: "",
    whatsapp: "",
    role: "",
    is_primary: false
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

  // Debounced fetch to avoid multiple rapid calls
  const fetchTimeoutRef = useRef(null);
  const isFetchingRef = useRef(false);

  const fetchLeadsDebounced = useCallback(async (immediate = false) => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    
    if (isFetchingRef.current && !immediate) return;

    const doFetch = async () => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      await fetchLeads();
      isFetchingRef.current = false;
    };

    if (immediate) {
      await doFetch();
    } else {
      fetchTimeoutRef.current = setTimeout(doFetch, 300);
    }
  }, [fetchLeads]);

  const fetchUsers = useCallback(async () => {
    try {
      // Try the CRM team-members endpoint first
      const res = await axios.get(`${API}/api/crm/team-members`, { withCredentials: true });
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        setUsers(res.data.map(member => ({
          user_id: member.user_id,
          name: member.name || member.email?.split('@')[0] || `User ${member.user_id.slice(-6)}`
        })));
        return;
      }
    } catch (err) {
      console.error("Error loading team members:", err);
    }
    
    try {
      const teamRes = await axios.get(`${API}/api/settings/team`, { withCredentials: true });
      if (teamRes.data && Array.isArray(teamRes.data) && teamRes.data.length > 0) {
        setUsers(teamRes.data.map(member => ({
          user_id: member.user_id,
          name: member.name || member.email?.split('@')[0] || `User ${member.user_id.slice(-6)}`
        })));
      }
    } catch (err) {
      console.error("Error loading team:", err);
    }
  }, []);

  useEffect(() => { 
    // Fetch both in parallel on mount
    Promise.all([fetchLeadsDebounced(true), fetchUsers()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter leads - with null safety and sorting
  const sortedAndFilteredLeads = leads
    .filter(lead => {
      const leadName = lead.lead_name || lead.name || "";
      const email = lead.email || "";
      const companyName = lead.company_name || lead.company || "";
      
      // Skip empty/blank leads
      if (!leadName.trim() && !email.trim() && !companyName.trim()) return false;
      
      const matchesSearch = leadName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           companyName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || (lead.status || "").toLowerCase() === statusFilter.toLowerCase();
      
      // Owner filter
      const matchesOwner = ownerFilter === "all" || 
                          (ownerFilter === "unassigned" && !lead.owner_id) ||
                          lead.owner_id === ownerFilter;
      
      return matchesSearch && matchesStatus && matchesOwner;
    })
    .sort((a, b) => {
      const nameA = (a.company_name || a.lead_name || "").toLowerCase();
      const nameB = (b.company_name || b.lead_name || "").toLowerCase();
      const dateA = new Date(a.created_at || 0);
      const dateB = new Date(b.created_at || 0);
      
      switch (sortBy) {
        case "alpha_asc": return nameA.localeCompare(nameB);
        case "alpha_desc": return nameB.localeCompare(nameA);
        case "date_asc": return dateA - dateB;
        case "date_desc": 
        default: return dateB - dateA;
      }
    });

  // Detect potential duplicates by company, name, or email
  const duplicateInfo = useMemo(() => {
    const companyCount = {};
    const nameCount = {};
    const emailCount = {};
    
    leads.forEach(lead => {
      const company = (lead.company_name || "").toLowerCase().trim();
      const name = (lead.lead_name || lead.name || "").toLowerCase().trim();
      const email = (lead.email || "").toLowerCase().trim();
      
      if (company) companyCount[company] = (companyCount[company] || 0) + 1;
      if (name) nameCount[name] = (nameCount[name] || 0) + 1;
      if (email) emailCount[email] = (emailCount[email] || 0) + 1;
    });
    
    return {
      companies: Object.keys(companyCount).filter(c => companyCount[c] > 1),
      names: Object.keys(nameCount).filter(n => nameCount[n] > 1),
      emails: Object.keys(emailCount).filter(e => emailCount[e] > 1),
      companyCount,
      nameCount,
      emailCount
    };
  }, [leads]);

  const getDuplicateReasons = (lead) => {
    const reasons = [];
    const company = (lead.company_name || "").toLowerCase().trim();
    const name = (lead.lead_name || lead.name || "").toLowerCase().trim();
    const email = (lead.email || "").toLowerCase().trim();
    
    if (company && duplicateInfo.companies.includes(company)) {
      reasons.push(`${isEs ? "Empresa" : "Company"} (${duplicateInfo.companyCount[company]}x)`);
    }
    if (name && duplicateInfo.names.includes(name)) {
      reasons.push(`${isEs ? "Nombre" : "Name"} (${duplicateInfo.nameCount[name]}x)`);
    }
    if (email && duplicateInfo.emails.includes(email)) {
      reasons.push(`Email (${duplicateInfo.emailCount[email]}x)`);
    }
    return reasons;
  };

  const isDuplicate = (lead) => {
    return getDuplicateReasons(lead).length > 0;
  };

  const totalDuplicates = duplicateInfo.companies.length + duplicateInfo.names.length + duplicateInfo.emails.length;

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
    setLeadContacts([]);
    fetchLeadContacts(lead.lead_id);
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

  const openAssign = (lead) => {
    setSelectedLead(lead);
    setAssignOwnerId(lead.owner_id || "");
    setAssignOpen(true);
  };

  const openDelete = (lead) => {
    setSelectedLead(lead);
    setDeleteReason("");
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedLead) return;
    try {
      await axios.delete(`${API}/api/crm/leads/${selectedLead.lead_id}`, { 
        withCredentials: true
      });
      toast.success(isEs ? "Lead eliminado" : "Lead deleted");
      fetchLeads();
      setDeleteOpen(false);
      setSelectedLead(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error al eliminar");
    }
  };

  // Lead contacts functions
  const fetchLeadContacts = async (leadId) => {
    if (!leadId) return;
    setLoadingContacts(true);
    try {
      const res = await axios.get(`${API}/api/crm/leads/${leadId}/contacts`, { withCredentials: true });
      setLeadContacts(res.data || []);
    } catch (err) {
      console.error("Error fetching contacts:", err);
      setLeadContacts([]);
    }
    setLoadingContacts(false);
  };

  const handleAddContact = async () => {
    if (!selectedLead || !contactForm.name.trim()) {
      toast.error(isEs ? "El nombre es requerido" : "Name is required");
      return;
    }
    try {
      await axios.post(`${API}/api/crm/leads/${selectedLead.lead_id}/contacts`, contactForm, { withCredentials: true });
      toast.success(isEs ? "Contacto agregado" : "Contact added");
      fetchLeadContacts(selectedLead.lead_id);
      setAddContactOpen(false);
      setContactForm({ name: "", email: "", phone: "", whatsapp: "", role: "", is_primary: false });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error al agregar contacto");
    }
  };

  const handleDeleteContact = async (contactId) => {
    if (!selectedLead || !contactId) return;
    try {
      await axios.delete(`${API}/api/crm/leads/${selectedLead.lead_id}/contacts/${contactId}`, { withCredentials: true });
      toast.success(isEs ? "Contacto eliminado" : "Contact removed");
      fetchLeadContacts(selectedLead.lead_id);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error al eliminar contacto");
    }
  };

  const handleAssign = async () => {
    if (!selectedLead) return;
    try {
      const ownerId = assignOwnerId === "unassigned" ? "" : assignOwnerId;
      await axios.put(
        `${API}/api/crm/assign/lead/${selectedLead.lead_id}?owner_id=${ownerId}`,
        {},
        { withCredentials: true }
      );
      toast.success(isEs ? "Lead asignado" : "Lead assigned");
      setAssignOpen(false);
      fetchLeads();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
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
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
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
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="w-[180px]" data-testid="inbound-owner-filter">
            <SelectValue placeholder={isEs ? "Vendedor" : "Owner"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isEs ? "Todos los vendedores" : "All owners"}</SelectItem>
            <SelectItem value="unassigned">{isEs ? "Sin asignar" : "Unassigned"}</SelectItem>
            {users.map(user => (
              <SelectItem key={user.user_id} value={user.user_id}>
                {user.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[180px]">
            <ArrowUpDown className="w-4 h-4 mr-2" />
            <SelectValue placeholder={isEs ? "Ordenar" : "Sort"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_desc">{isEs ? "Más reciente" : "Newest first"}</SelectItem>
            <SelectItem value="date_asc">{isEs ? "Más antiguo" : "Oldest first"}</SelectItem>
            <SelectItem value="alpha_asc">{isEs ? "A-Z (Empresa)" : "A-Z (Company)"}</SelectItem>
            <SelectItem value="alpha_desc">{isEs ? "Z-A (Empresa)" : "Z-A (Company)"}</SelectItem>
          </SelectContent>
        </Select>
        {(statusFilter !== "all" || ownerFilter !== "all") && (
          <Button variant="outline" onClick={() => { setStatusFilter("all"); setOwnerFilter("all"); }} size="sm">
            {isEs ? "Limpiar" : "Clear"}
          </Button>
        )}
      </div>

      {/* Duplicate Warning */}
      {totalDuplicates > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              {isEs ? "Posibles duplicados detectados" : "Potential duplicates detected"}
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              {duplicateInfo.companies.length > 0 && (
                <span className="mr-3">
                  {isEs ? "Empresas" : "Companies"}: {duplicateInfo.companies.length}
                </span>
              )}
              {duplicateInfo.names.length > 0 && (
                <span className="mr-3">
                  {isEs ? "Nombres" : "Names"}: {duplicateInfo.names.length}
                </span>
              )}
              {duplicateInfo.emails.length > 0 && (
                <span>
                  Emails: {duplicateInfo.emails.length}
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[1000px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">{isEs ? "Fuente" : "Source"}</TableHead>
                <TableHead className="w-[180px]">{isEs ? "Nombre" : "Name"}</TableHead>
                <TableHead className="w-[120px]">{isEs ? "Contacto" : "Contact"}</TableHead>
                <TableHead className="w-[120px]">{isEs ? "Tipo Evento" : "Event Type"}</TableHead>
                <TableHead className="w-[80px]">{isEs ? "Invitados" : "Guests"}</TableHead>
                <TableHead className="w-[100px]">{isEs ? "Estado" : "Status"}</TableHead>
                <TableHead className="w-[100px]">Owner</TableHead>
                <TableHead className="w-[80px]">{isEs ? "Acciones" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAndFilteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay leads inbound" : "No inbound leads"}
                  </TableCell>
                </TableRow>
              ) : (
                sortedAndFilteredLeads.map((lead) => {
                  const dupeReasons = getDuplicateReasons(lead);
                  return (
                  <TableRow 
                    key={lead.lead_id} 
                    className={`cursor-pointer hover:bg-muted/50 ${isNewLead(lead) ? "bg-blue-50/50" : ""} ${dupeReasons.length > 0 ? "bg-yellow-50 dark:bg-yellow-900/10" : ""}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {dupeReasons.length > 0 && (
                          <AlertTriangle 
                            className="w-4 h-4 text-yellow-600 flex-shrink-0" 
                            title={`${isEs ? "Duplicado" : "Duplicate"}: ${dupeReasons.join(", ")}`} 
                          />
                        )}
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
                      {lead.owner_id ? (
                        <Badge variant="outline" className="text-xs">
                          {lead.owner_name || users.find(u => u.user_id === lead.owner_id)?.name || lead.owner_id.replace("user_", "").slice(0, 8)}
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
                        <Button variant="ghost" size="icon" onClick={() => openAssign(lead)} title={isEs ? "Asignar" : "Assign"}>
                          <UserPlus className="w-4 h-4" />
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
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDelete(lead)} className="text-red-600">
                              <Trash2 className="w-4 h-4 mr-2" />
                              {isEs ? "Eliminar" : "Delete"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })
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
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="info" className="text-xs">
                  <Info className="w-3 h-3 mr-1" /> Info
                </TabsTrigger>
                <TabsTrigger value="contacts" className="text-xs">
                  <Users className="w-3 h-3 mr-1" /> {isEs ? "Contactos" : "Contacts"}
                  {leadContacts.length > 0 && (
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{leadContacts.length}</Badge>
                  )}
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

              {/* Contacts Tab */}
              <TabsContent value="contacts" className="mt-0 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {isEs ? "Personas de contacto para este lead" : "Contact people for this lead"}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setAddContactOpen(true)}>
                    <Plus className="w-3 h-3 mr-1" />
                    {isEs ? "Agregar" : "Add"}
                  </Button>
                </div>
                
                {loadingContacts ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : leadContacts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{isEs ? "No hay contactos" : "No contacts yet"}</p>
                    <p className="text-xs mt-1">{isEs ? "Agrega personas de contacto para este lead" : "Add contact people for this lead"}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {leadContacts.map((contact) => (
                      <div key={contact.contact_id} className="p-3 bg-muted/50 rounded-lg flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{contact.name}</p>
                            {contact.is_primary && (
                              <Badge variant="outline" className="text-[10px] h-4">{isEs ? "Principal" : "Primary"}</Badge>
                            )}
                            {contact.role && (
                              <Badge variant="secondary" className="text-[10px] h-4">{contact.role}</Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                            {contact.email && (
                              <a href={`mailto:${contact.email}`} className="flex items-center gap-1 hover:text-primary">
                                <Mail className="w-3 h-3" /> {contact.email}
                              </a>
                            )}
                            {contact.phone && (
                              <a href={`tel:${contact.phone}`} className="flex items-center gap-1 hover:text-primary">
                                <Phone className="w-3 h-3" /> {contact.phone}
                              </a>
                            )}
                            {contact.whatsapp && (
                              <a href={getWhatsAppLink(contact.whatsapp)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-green-600 hover:text-green-700">
                                <MessageCircle className="w-3 h-3" /> WhatsApp
                              </a>
                            )}
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteContact(contact.contact_id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Comms Tab */}
              <TabsContent value="comms" className="mt-0">
                <UnifiedCommsTimeline 
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

      {/* Assign Owner Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Asignar Lead" : "Assign Lead"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              {isEs 
                ? `Asignar "${selectedLead?.lead_name}" a un vendedor`
                : `Assign "${selectedLead?.lead_name}" to a salesperson`}
            </p>
            <div>
              <Label>{isEs ? "Vendedor" : "Owner"}</Label>
              <Select value={assignOwnerId || "unassigned"} onValueChange={setAssignOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar vendedor" : "Select owner"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">{isEs ? "Sin asignar" : "Unassigned"}</SelectItem>
                  {users.map(user => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleAssign}>
              {isEs ? "Asignar" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              {isEs ? "Eliminar Lead" : "Delete Lead"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-800 dark:text-red-200">
                {isEs 
                  ? `¿Estás seguro de que deseas eliminar "${selectedLead?.lead_name || selectedLead?.company_name || "este lead"}"?`
                  : `Are you sure you want to delete "${selectedLead?.lead_name || selectedLead?.company_name || "this lead"}"?`
                }
              </p>
              <p className="text-xs text-red-600 dark:text-red-300 mt-1">
                {isEs ? "Esta acción no se puede deshacer." : "This action cannot be undone."}
              </p>
            </div>
            <div>
              <Label className="text-sm">{isEs ? "Motivo de eliminación (opcional)" : "Reason for deletion (optional)"}</Label>
              <Textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder={isEs ? "Ej: Duplicado, datos incorrectos, etc." : "E.g.: Duplicate, incorrect data, etc."}
                rows={2}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              {isEs ? "Sí, eliminar" : "Yes, delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Contact Dialog */}
      <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              {isEs ? "Agregar Contacto" : "Add Contact"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"} *</Label>
              <Input
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                placeholder={isEs ? "Nombre completo" : "Full name"}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                />
              </div>
              <div>
                <Label>{isEs ? "Teléfono" : "Phone"}</Label>
                <Input
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>WhatsApp</Label>
              <Input
                value={contactForm.whatsapp}
                onChange={(e) => setContactForm({ ...contactForm, whatsapp: e.target.value })}
                placeholder="+1 809 555 1234"
              />
            </div>
            <div>
              <Label>{isEs ? "Rol / Cargo" : "Role / Title"}</Label>
              <Input
                value={contactForm.role}
                onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
                placeholder={isEs ? "Ej: CEO, Gerente, Asistente" : "E.g.: CEO, Manager, Assistant"}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_primary_inbound"
                checked={contactForm.is_primary}
                onChange={(e) => setContactForm({ ...contactForm, is_primary: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="is_primary_inbound" className="text-sm cursor-pointer">
                {isEs ? "Contacto principal" : "Primary contact"}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddContactOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleAddContact}>
              <UserPlus className="w-4 h-4 mr-2" />
              {isEs ? "Agregar" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
