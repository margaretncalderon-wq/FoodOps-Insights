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
  MessageCircle, ExternalLink, DollarSign, Info, Trash2, AlertTriangle, ArrowUpDown, MoreHorizontal, Plus, MapPin
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
  const [sortBy, setSortBy] = useState("alpha_asc");
  const [groupBy, setGroupBy] = useState("none");
  const [selectedLead, setSelectedLead] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertMode, setConvertMode] = useState(null);
  const [eventsList, setEventsList] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
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

  const handleMoveToOutreach = async (lead) => {
    try {
      await axios.put(`${API}/api/leads/${lead.lead_id}`, { lead_type: "outreach" }, { withCredentials: true });
      toast.success(isEs ? "Lead movido a Outreach" : "Lead moved to Outreach");
      fetchLeads();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };


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
          name: member.name || [member.first_name, member.last_name].filter(Boolean).join(" ") || member.email?.split('@')[0] || `User ${member.user_id.slice(-6)}`
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
          name: member.name || [member.first_name, member.last_name].filter(Boolean).join(" ") || member.email?.split('@')[0] || `User ${member.user_id.slice(-6)}`
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
      const sortNameA = ((a.lead_name && a.lead_name.trim()) ? a.lead_name : (a.company_name || a.lead_name || "")).toLowerCase();
      const sortNameB = ((b.lead_name && b.lead_name.trim()) ? b.lead_name : (b.company_name || b.lead_name || "")).toLowerCase();
      const dateA = new Date(a.created_at || 0);
      const dateB = new Date(b.created_at || 0);
      
      switch (sortBy) {
        case "alpha_asc": return sortNameA.localeCompare(sortNameB);
        case "alpha_desc": return sortNameB.localeCompare(sortNameA);
        case "date_asc": return dateA - dateB;
        case "date_desc": 
        default: return dateB - dateA;
      }
    });

  // Group leads
  const groupedLeads = useMemo(() => {
    if (groupBy === "none") return null;
    const groups = {};
    sortedAndFilteredLeads.forEach(lead => {
      let key;
      if (groupBy === "company") {
        key = (lead.company_name || lead.company || "").trim() || (isEs ? "Sin Empresa" : "No Company");
      } else if (groupBy === "status") {
        key = (lead.status || "New");
      } else if (groupBy === "city") {
        key = (lead.city || "").trim() || (isEs ? "Sin Ciudad" : "No City");
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(lead);
    });
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (groupBy === "status") {
        const order = { "New": 0, "Contacted": 1, "Converted": 2 };
        return (order[a] ?? 99) - (order[b] ?? 99);
      }
      return a.localeCompare(b);
    });
    return sortedKeys.map(key => ({ key, leads: groups[key] }));
  }, [sortedAndFilteredLeads, groupBy, isEs]);

  // Normalize string for comparison - removes accents, special chars, common suffixes
  const normalizeForComparison = useCallback((str) => {
    if (!str) return "";
    return str
      .toLowerCase()
      .trim()
      // Remove accents
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      // Remove common company suffixes
      .replace(/\b(s\.?a\.?|s\.?r\.?l\.?|inc\.?|llc\.?|corp\.?|ltd\.?|co\.?|cia\.?)\b/gi, "")
      // Remove special characters except spaces
      .replace(/[^a-z0-9\s]/g, "")
      // Remove extra spaces
      .replace(/\s+/g, " ")
      .trim();
  }, []);

  // Calculate similarity between two strings (0-1)
  const calculateSimilarity = useCallback((str1, str2) => {
    const s1 = normalizeForComparison(str1);
    const s2 = normalizeForComparison(str2);
    
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1;
    
    // Check if one contains the other
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;
    
    // Simple similarity for short strings
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 1;
    if (shorter.length / longer.length < 0.5) return 0;
    
    // Count matching characters in order
    let matches = 0;
    let j = 0;
    for (let i = 0; i < longer.length && j < shorter.length; i++) {
      if (longer[i] === shorter[j]) {
        matches++;
        j++;
      }
    }
    
    return matches / longer.length;
  }, [normalizeForComparison]);

  // Detect potential duplicates with fuzzy matching
  const duplicateInfo = useMemo(() => {
    const exactCompanyCount = {};
    const exactNameCount = {};
    const exactEmailCount = {};
    const similarGroups = [];
    
    leads.forEach(lead => {
      const company = (lead.company_name || "").toLowerCase().trim();
      const name = (lead.lead_name || lead.name || "").toLowerCase().trim();
      const email = (lead.email || "").toLowerCase().trim();
      
      if (company) exactCompanyCount[company] = (exactCompanyCount[company] || 0) + 1;
      if (name) exactNameCount[name] = (exactNameCount[name] || 0) + 1;
      if (email) exactEmailCount[email] = (exactEmailCount[email] || 0) + 1;
    });
    
    // Find similar names/companies (fuzzy matching)
    const processedPairs = new Set();
    
    leads.forEach((lead1, i) => {
      const name1 = lead1.company_name || lead1.lead_name || lead1.name || "";
      if (!name1) return;
      
      leads.forEach((lead2, j) => {
        if (i >= j) return;
        
        const name2 = lead2.company_name || lead2.lead_name || lead2.name || "";
        if (!name2) return;
        
        const pairKey = [lead1.lead_id, lead2.lead_id].sort().join("-");
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);
        
        const similarity = calculateSimilarity(name1, name2);
        
        if (similarity >= 0.7) {
          similarGroups.push({
            lead1: lead1.lead_id,
            lead2: lead2.lead_id,
            name1,
            name2,
            similarity: Math.round(similarity * 100)
          });
        }
      });
    });
    
    return {
      companies: Object.keys(exactCompanyCount).filter(c => exactCompanyCount[c] > 1),
      names: Object.keys(exactNameCount).filter(n => exactNameCount[n] > 1),
      emails: Object.keys(exactEmailCount).filter(e => exactEmailCount[e] > 1),
      companyCount: exactCompanyCount,
      nameCount: exactNameCount,
      emailCount: exactEmailCount,
      similarGroups
    };
  }, [leads, calculateSimilarity]);

  const getDuplicateReasons = (lead) => {
    const reasons = [];
    const company = (lead.company_name || "").toLowerCase().trim();
    const name = (lead.lead_name || lead.name || "").toLowerCase().trim();
    const email = (lead.email || "").toLowerCase().trim();
    
    if (company && duplicateInfo.companies.includes(company)) {
      reasons.push(`${isEs ? "Empresa exacta" : "Exact company"} (${duplicateInfo.companyCount[company]}x)`);
    }
    if (name && duplicateInfo.names.includes(name)) {
      reasons.push(`${isEs ? "Nombre exacto" : "Exact name"} (${duplicateInfo.nameCount[name]}x)`);
    }
    if (email && duplicateInfo.emails.includes(email)) {
      reasons.push(`Email (${duplicateInfo.emailCount[email]}x)`);
    }
    
    // Similar matches (fuzzy)
    const similarMatch = duplicateInfo.similarGroups.find(
      g => g.lead1 === lead.lead_id || g.lead2 === lead.lead_id
    );
    if (similarMatch && reasons.length === 0) {
      const otherName = similarMatch.lead1 === lead.lead_id ? similarMatch.name2 : similarMatch.name1;
      reasons.push(`${isEs ? "Similar a" : "Similar to"} "${otherName}" (${similarMatch.similarity}%)`);
    }
    
    return reasons;
  };

  const isDuplicate = (lead) => {
    return getDuplicateReasons(lead).length > 0;
  };

  const totalDuplicates = duplicateInfo.companies.length + duplicateInfo.names.length + duplicateInfo.emails.length + duplicateInfo.similarGroups.length;

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

  const fetchEventsList = async () => {
    try {
      const res = await axios.get(`${API}/api/crm/events-list`, { withCredentials: true });
      setEventsList(res.data.events || []);
    } catch { setEventsList([]); }
  };

  const openConvert = (lead) => {
    setSelectedLead(lead);
    setConvertMode(null);
    setSelectedEventId("");
    fetchEventsList();
    setConvertOpen(true);
  };

  const handleConvert = async (mode) => {
    if (!selectedLead) return;
    const body = {};
    if (mode === "new_event") body.create_event = true;
    else if (mode === "existing_event" && selectedEventId) body.existing_event_id = selectedEventId;

    try {
      const clientRes = await axios.post(`${API}/api/leads/${selectedLead.lead_id}/convert`, body, { withCredentials: true });
      toast.success(isEs ? "Lead convertido exitosamente" : "Lead converted successfully");
      setConvertOpen(false);
      setConvertMode(null);
      setSelectedEventId("");
      setDetailOpen(false);
      fetchLeads();
      
      if (mode === "new_event" && clientRes.data.event_id) {
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

  // Source badge helper
  const getSourceBadge = (source) => {
    const s = (source || "").trim();
    if (!s) return <span className="text-muted-foreground text-xs">-</span>;
    const colors = {
      "LinkedIn": "bg-blue-100 text-blue-800",
      "Instagram": "bg-pink-100 text-pink-800",
      "Facebook": "bg-indigo-100 text-indigo-800",
      "Google": "bg-red-100 text-red-800",
      "Website": "bg-green-100 text-green-800",
      "Referido": "bg-amber-100 text-amber-800",
      "Cold Call": "bg-slate-100 text-slate-800",
      "Email": "bg-cyan-100 text-cyan-800",
      "Meta Ads": "bg-blue-100 text-blue-800",
      "Outreach": "bg-violet-100 text-violet-800",
      "WhatsApp": "bg-emerald-100 text-emerald-800",
      "Evento": "bg-orange-100 text-orange-800",
      "Importación": "bg-gray-100 text-gray-700",
    };
    return <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${colors[s] || "bg-gray-100 text-gray-700"}`}>{s}</Badge>;
  };

  // Render a single inbound lead row
  const renderInboundRow = (lead) => {
    const hasCompany = lead.company_name && lead.company_name.trim();
    const contactName = lead.lead_name || lead.name || "";
    const companyName = lead.company_name || "";
    const isCompanyOnly = (!contactName.trim() || contactName.toLowerCase().trim() === companyName.toLowerCase().trim()) && hasCompany;
    const isPersonOnly = contactName.trim() && !hasCompany;
    const dupeReasons = getDuplicateReasons(lead);

    return (
      <TableRow 
        key={lead.lead_id} 
        className={`cursor-pointer hover:bg-muted/50 ${isNewLead(lead) ? "bg-blue-50/30" : ""} ${dupeReasons.length > 0 ? "bg-yellow-50/50 dark:bg-yellow-900/10" : ""}`}
      >
        {/* Combined Lead column */}
        <TableCell className="font-medium">
          <div className="flex items-start gap-2">
            {dupeReasons.length > 0 && (
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 flex-shrink-0 mt-0.5" 
                title={`${isEs ? "Duplicado" : "Duplicate"}: ${dupeReasons.join(", ")}`} />
            )}
            {isCompanyOnly ? (
              <Building2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            ) : (
              <User className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {isCompanyOnly ? (
                  <span className="truncate font-semibold">{companyName}</span>
                ) : (
                  <span className="truncate">{contactName || "-"}</span>
                )}
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${isCompanyOnly ? "bg-blue-50 text-blue-700 border-blue-200" : isPersonOnly ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}>
                  {isCompanyOnly ? "B2B" : isPersonOnly ? (isEs ? "Directo" : "Direct") : "B2B"}
                </Badge>
                {isNewLead(lead) && (
                  <Badge className="bg-blue-500 text-white text-[10px] px-1 py-0 shrink-0">NEW</Badge>
                )}
              </div>
              {!isCompanyOnly && hasCompany && (
                <span className="text-xs text-muted-foreground truncate block">{companyName}</span>
              )}
              {lead.city && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <MapPin className="w-2.5 h-2.5" />{lead.city}
                </span>
              )}
              <div className="flex items-center gap-1.5 mt-0.5">
                {lead.email && (
                  <a href={`mailto:${lead.email}`} className="text-blue-500 hover:text-blue-700" title={lead.email}>
                    <Mail className="w-3 h-3" />
                  </a>
                )}
                {lead.phone && (
                  <a href={`tel:${lead.phone}`} className="text-muted-foreground hover:text-foreground" title={lead.phone}>
                    <Phone className="w-3 h-3" />
                  </a>
                )}
                {lead.whatsapp && (
                  <a href={getWhatsAppLink(lead.whatsapp)} target="_blank" rel="noopener noreferrer" 
                     className="text-green-500 hover:text-green-700" title="WhatsApp">
                    <MessageCircle className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </TableCell>
        <TableCell>{getSourceBadge(lead.source)}</TableCell>
        <TableCell>
          {lead.event_type ? <Badge variant="outline" className="text-[10px]">{lead.event_type}</Badge> : <span className="text-muted-foreground">-</span>}
        </TableCell>
        <TableCell>
          {lead.estimated_guest_count ? (
            <div className="flex items-center gap-1 text-xs">
              <Users className="w-3 h-3" />
              {lead.estimated_guest_count}
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">-</span>
          )}
        </TableCell>
        <TableCell>{getStatusBadge(lead.status)}</TableCell>
        <TableCell>
          {lead.owner_id ? (
            <Badge variant="outline" className="text-[10px]">
              {lead.owner_name || users.find(u => u.user_id === lead.owner_id)?.name || lead.owner_id.replace("user_", "").slice(0, 8)}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">-</span>
          )}
        </TableCell>
        <TableCell>
          <div className="flex gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => viewLead(lead)} title={isEs ? "Ver" : "View"}>
              <Eye className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openAssign(lead)} title={isEs ? "Asignar" : "Assign"}>
              <UserPlus className="w-3.5 h-3.5" />
            </Button>
            {lead.status !== "Converted" && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openConvert(lead)} 
                title={isEs ? "Convertir" : "Convert"} data-testid={`convert-inbound-${lead.lead_id}`}>
                <ArrowRight className="w-3.5 h-3.5 text-green-600" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleMoveToOutreach(lead)}>
                  <ArrowRight className="w-4 h-4 mr-2 text-orange-600" />
                  {isEs ? "Mover a Outreach" : "Move to Outreach"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => openFollowUp(lead)}>
                  <CalendarPlus className="w-4 h-4 mr-2" />
                  {isEs ? "Seguimiento" : "Follow-up"}
                </DropdownMenuItem>
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
  };

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
            <SelectItem value="alpha_asc">{isEs ? "A-Z (Nombre)" : "A-Z (Name)"}</SelectItem>
            <SelectItem value="alpha_desc">{isEs ? "Z-A (Nombre)" : "Z-A (Name)"}</SelectItem>
            <SelectItem value="date_desc">{isEs ? "Más reciente" : "Newest first"}</SelectItem>
            <SelectItem value="date_asc">{isEs ? "Más antiguo" : "Oldest first"}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={groupBy} onValueChange={setGroupBy}>
          <SelectTrigger className="w-[180px]" data-testid="inbound-group-by">
            <Users className="w-4 h-4 mr-2" />
            <SelectValue placeholder={isEs ? "Agrupar" : "Group by"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{isEs ? "Sin agrupar" : "No grouping"}</SelectItem>
            <SelectItem value="company">{isEs ? "Por Empresa" : "By Company"}</SelectItem>
            <SelectItem value="status">{isEs ? "Por Estado" : "By Status"}</SelectItem>
            <SelectItem value="city">{isEs ? "Por Ciudad" : "By City"}</SelectItem>
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
        <CardContent className="p-0" style={{ overflowX: 'auto' }}>
          <Table className="crm-table" style={{ minWidth: '1000px', tableLayout: 'fixed' }}>
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: '260px' }}>{isEs ? "Lead" : "Lead"}</TableHead>
                <TableHead style={{ width: '90px' }}>{isEs ? "Fuente" : "Source"}</TableHead>
                <TableHead style={{ width: '100px' }}>{isEs ? "Tipo Evento" : "Event Type"}</TableHead>
                <TableHead style={{ width: '70px' }}>{isEs ? "Invitados" : "Guests"}</TableHead>
                <TableHead style={{ width: '80px' }}>{isEs ? "Estado" : "Status"}</TableHead>
                <TableHead style={{ width: '80px' }}>Owner</TableHead>
                <TableHead style={{ width: '100px' }}>{isEs ? "Acciones" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAndFilteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay leads inbound" : "No inbound leads"}
                  </TableCell>
                </TableRow>
              ) : groupedLeads ? (
                groupedLeads.map(group => (
                  <>
                    <TableRow key={`group-${group.key}`} className="bg-muted/60 hover:bg-muted/80">
                      <TableCell colSpan={7} className="py-2">
                        <div className="flex items-center gap-2 font-semibold text-sm">
                          {groupBy === "company" ? (
                            <Building2 className="w-4 h-4 text-blue-600" />
                          ) : groupBy === "city" ? (
                            <MapPin className="w-4 h-4 text-rose-500" />
                          ) : (
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 
                              group.key === "New" ? "#22c55e" : 
                              group.key === "Contacted" ? "#3b82f6" : 
                              group.key === "Converted" ? "#8b5cf6" : "#6b7280" 
                            }} />
                          )}
                          <span>{group.key}</span>
                          <Badge variant="secondary" className="text-xs ml-1">{group.leads.length}</Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                    {group.leads.map(lead => renderInboundRow(lead))}
                  </>
                ))
              ) : (
                sortedAndFilteredLeads.map(lead => renderInboundRow(lead))
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
      <Dialog open={convertOpen} onOpenChange={(open) => { setConvertOpen(open); if (!open) { setConvertMode(null); setSelectedEventId(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEs ? "Convertir Lead a Cliente" : "Convert Lead to Client"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isEs 
                ? `Selecciona cómo convertir "${selectedLead?.lead_name || selectedLead?.company_name}":`
                : `Select how to convert "${selectedLead?.lead_name || selectedLead?.company_name}":`}
            </p>
            {selectedLead && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <ul className="space-y-1 text-muted-foreground">
                  <li>• {selectedLead.lead_name}</li>
                  {selectedLead.email && <li>• {selectedLead.email}</li>}
                  {selectedLead.company_name && <li>• {selectedLead.company_name}</li>}
                  {selectedLead.event_type && <li>• {isEs ? "Tipo" : "Type"}: {selectedLead.event_type}</li>}
                </ul>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3">
              <Card 
                className={`cursor-pointer transition-colors ${convertMode === "client_only" ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/50"}`}
                onClick={() => setConvertMode("client_only")}
                data-testid="convert-inbound-client-only"
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <UserCheck className="w-8 h-8 text-muted-foreground shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sm">{isEs ? "Solo Cliente" : "Client Only"}</h3>
                    <p className="text-xs text-muted-foreground">{isEs ? "Sin evento asociado" : "No associated event"}</p>
                  </div>
                </CardContent>
              </Card>
              <Card 
                className={`cursor-pointer transition-colors ${convertMode === "existing_event" ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/50"}`}
                onClick={() => setConvertMode("existing_event")}
                data-testid="convert-inbound-existing-event"
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <ArrowRight className="w-8 h-8 text-blue-500 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sm">{isEs ? "Cliente + Evento Existente" : "Client + Existing Event"}</h3>
                    <p className="text-xs text-muted-foreground">{isEs ? "Vincular a un evento o activación existente" : "Link to existing event or activation"}</p>
                  </div>
                </CardContent>
              </Card>
              <Card 
                className={`cursor-pointer transition-colors ${convertMode === "new_event" ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/50"}`}
                onClick={() => setConvertMode("new_event")}
                data-testid="convert-inbound-with-event"
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <CalendarPlus className="w-8 h-8 text-primary shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sm">{isEs ? "Cliente + Evento Nuevo" : "Client + New Event"}</h3>
                    <p className="text-xs text-muted-foreground">{isEs ? "Crear un nuevo evento automáticamente" : "Create a new event automatically"}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
            {convertMode === "existing_event" && (
              <div>
                <Label className="mb-1 block">{isEs ? "Seleccionar Evento" : "Select Event"}</Label>
                <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                  <SelectTrigger data-testid="convert-inbound-event-selector">
                    <SelectValue placeholder={isEs ? "Buscar evento..." : "Search event..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {eventsList.map(ev => (
                      <SelectItem key={ev.event_id} value={ev.event_id}>
                        {ev.name} {ev.event_date ? `(${ev.event_date.split("T")[0]})` : ""}
                      </SelectItem>
                    ))}
                    {eventsList.length === 0 && (
                      <SelectItem value="__none" disabled>{isEs ? "No hay eventos" : "No events"}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConvertOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button 
              onClick={() => handleConvert(convertMode)}
              disabled={!convertMode || (convertMode === "existing_event" && !selectedEventId)}
              data-testid="convert-inbound-confirm-btn"
            >
              {isEs ? "Convertir" : "Convert"}
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
