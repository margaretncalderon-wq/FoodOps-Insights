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
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  Plus, Search, Phone, Mail, Building2, RefreshCw, User, 
  MoreHorizontal, CheckCircle, Eye, Clock, CalendarPlus,
  ArrowRight, UserCheck, Filter, MessageCircle, ExternalLink, Info, Edit,
  LayoutList, Kanban, Trash2, AlertTriangle, ArrowUpDown, Users, UserPlus
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "../ui/dropdown-menu";
import CommunicationsTimeline from "./CommunicationsTimeline";
import CommsChannelTimeline from "./CommsChannelTimeline";
import UnifiedCommsTimeline from "./UnifiedCommsTimeline";
import LeadKanbanView from "./LeadKanbanView";

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

const LEAD_INDUSTRIES = [
  "Tecnología", "Retail", "Salud", "Educación", "Finanzas", "Construcción",
  "Manufactura", "Turismo", "Hostelería", "Restaurantes", "Alimentos y Bebidas",
  "Moda", "Automotriz", "Real Estate", "Legal", "Consultoría", "Marketing",
  "Publicidad", "Medios", "Entretenimiento", "Deportes", "Belleza", "Bienestar",
  "E-commerce", "Logística", "Agricultura", "Energía", "Telecomunicaciones",
  "Gobierno", "ONG", "Otro"
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
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date_desc"); // date_desc, date_asc, alpha_asc, alpha_desc
  const [viewMode, setViewMode] = useState("list"); // "list" or "kanban"
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [selectedLead, setSelectedLead] = useState(null);
  const [duplicateWarning, setDuplicateWarning] = useState(null); // For showing warning when creating
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
    industry: "",
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

  // Debounced fetch to avoid multiple rapid calls
  const fetchTimeoutRef = useRef(null);
  const isFetchingRef = useRef(false);

  const fetchLeads = useCallback(async (immediate = false) => {
    // Clear any pending fetch
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    
    // If already fetching and not immediate, skip
    if (isFetchingRef.current && !immediate) {
      return;
    }

    const doFetch = async () => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      
      try {
        const res = await axios.get(`${API}/api/crm/outreach`, { withCredentials: true });
        // Clean nan values from all leads
        const cleanedLeads = res.data.map(lead => cleanNanValues(lead));
        setLeads(cleanedLeads);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
        isFetchingRef.current = false;
      }
    };

    if (immediate) {
      await doFetch();
    } else {
      // Debounce by 300ms
      fetchTimeoutRef.current = setTimeout(doFetch, 300);
    }
  }, [cleanNanValues]);

  const fetchUsers = useCallback(async () => {
    try {
      // Try to fetch team members from the CRM endpoint
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
    
    // Fallback: try settings/team endpoint
    try {
      const teamRes = await axios.get(`${API}/api/settings/team`, { withCredentials: true });
      if (teamRes.data && Array.isArray(teamRes.data) && teamRes.data.length > 0) {
        setUsers(teamRes.data.map(member => ({
          user_id: member.user_id,
          name: member.name || member.email?.split('@')[0] || `User ${member.user_id.slice(-6)}`
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
      setUsers(Array.from(ownerIds).map(id => ({ user_id: id, name: `User ${id.slice(-6)}` })));
    }
  }, [leads]);

  useEffect(() => { 
    // Fetch both in parallel on mount
    Promise.all([fetchLeads(true), fetchUsers()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Normalize string for comparison - removes accents, special chars, common suffixes
  // IMPORTANT: Must be defined before checkForDuplicates which uses calculateSimilarity
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
  // IMPORTANT: Must be defined before checkForDuplicates which uses this function
  const calculateSimilarity = useCallback((str1, str2) => {
    const s1 = normalizeForComparison(str1);
    const s2 = normalizeForComparison(str2);
    
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1;
    
    // Check if one contains the other
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;
    
    // Simple Levenshtein-based similarity for short strings
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 1;
    
    // If lengths are very different, low similarity
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

  // Check for potential duplicates when creating a new lead
  const checkForDuplicates = useCallback((newName, newEmail, newCompany) => {
    const warnings = [];
    
    // Check exact email match
    if (newEmail) {
      const emailMatch = leads.find(l => 
        (l.email || "").toLowerCase().trim() === newEmail.toLowerCase().trim()
      );
      if (emailMatch) {
        warnings.push({
          type: "exact",
          field: "email",
          message: isEs 
            ? `Email ya existe: "${emailMatch.lead_name || emailMatch.name}"` 
            : `Email already exists: "${emailMatch.lead_name || emailMatch.name}"`
        });
      }
    }
    
    // Check similar names
    if (newName || newCompany) {
      const nameToCheck = newCompany || newName;
      leads.forEach(lead => {
        const existingName = lead.company_name || lead.lead_name || lead.name || "";
        if (!existingName) return;
        
        const similarity = calculateSimilarity(nameToCheck, existingName);
        if (similarity >= 0.7) {
          warnings.push({
            type: similarity === 1 ? "exact" : "similar",
            field: "name",
            similarity: Math.round(similarity * 100),
            message: isEs 
              ? `${similarity === 1 ? "Existe" : "Similar a"}: "${existingName}" (${Math.round(similarity * 100)}%)` 
              : `${similarity === 1 ? "Exists" : "Similar to"}: "${existingName}" (${Math.round(similarity * 100)}%)`
          });
        }
      });
    }
    
    return warnings;
  }, [leads, calculateSimilarity, isEs]);

  const handleCreate = async (e, forceCreate = false) => {
    e?.preventDefault();
    if (!form.lead_name || !form.email) {
      toast.error(isEs ? "Nombre y email son requeridos" : "Name and email are required");
      return;
    }
    
    // Check for duplicates unless force creating
    if (!forceCreate) {
      const warnings = checkForDuplicates(form.lead_name, form.email, form.company_name);
      if (warnings.length > 0) {
        setDuplicateWarning(warnings);
        return; // Don't create, show warning
      }
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
      setDuplicateWarning(null);
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
    setLeadContacts([]);
    fetchLeadContacts(lead.lead_id);
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
      industry: lead.industry || "",
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
        industry: editForm.industry,
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
      fetchLeads(true);
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

  // Sort and filter leads
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
      const effectiveStatus = getEffectiveStatus(lead);
      const matchesStatus = statusFilter === "all" || effectiveStatus.toLowerCase() === statusFilter.toLowerCase();
      
      // Owner filter: "all" shows all, "unassigned" shows leads without owner, otherwise filter by owner_id
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

  // Detect potential duplicates by company, name, or email with fuzzy matching
  const duplicateInfo = useMemo(() => {
    const exactCompanyCount = {};
    const exactNameCount = {};
    const exactEmailCount = {};
    const similarGroups = []; // Groups of similar entries
    
    // First pass: count exact matches
    leads.forEach(lead => {
      const company = (lead.company_name || "").toLowerCase().trim();
      const name = (lead.lead_name || lead.name || "").toLowerCase().trim();
      const email = (lead.email || "").toLowerCase().trim();
      
      if (company) exactCompanyCount[company] = (exactCompanyCount[company] || 0) + 1;
      if (name) exactNameCount[name] = (exactNameCount[name] || 0) + 1;
      if (email) exactEmailCount[email] = (exactEmailCount[email] || 0) + 1;
    });
    
    // Second pass: find similar names/companies (fuzzy matching)
    const processedPairs = new Set();
    
    leads.forEach((lead1, i) => {
      const name1 = lead1.company_name || lead1.lead_name || lead1.name || "";
      if (!name1) return;
      
      leads.forEach((lead2, j) => {
        if (i >= j) return; // Skip same and already compared
        
        const name2 = lead2.company_name || lead2.lead_name || lead2.name || "";
        if (!name2) return;
        
        const pairKey = [lead1.lead_id, lead2.lead_id].sort().join("-");
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);
        
        const similarity = calculateSimilarity(name1, name2);
        
        if (similarity >= 0.7) { // 70% similarity threshold
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
      similarGroups // New: similar but not exact matches
    };
  }, [leads, calculateSimilarity]);

  const getDuplicateReasons = (lead) => {
    const reasons = [];
    const company = (lead.company_name || "").toLowerCase().trim();
    const name = (lead.lead_name || lead.name || "").toLowerCase().trim();
    const email = (lead.email || "").toLowerCase().trim();
    
    // Exact duplicates
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
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex border rounded-lg p-1">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-3"
              onClick={() => setViewMode("list")}
            >
              <LayoutList className="w-4 h-4 mr-1" />
              {isEs ? "Lista" : "List"}
            </Button>
            <Button
              variant={viewMode === "kanban" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-3"
              onClick={() => setViewMode("kanban")}
            >
              <Kanban className="w-4 h-4 mr-1" />
              Kanban
            </Button>
          </div>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="new-outreach-btn">
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Nuevo Outreach" : "New Outreach"}
          </Button>
        </div>
      </div>

      {/* Kanban View */}
      {viewMode === "kanban" ? (
        <LeadKanbanView 
          onLeadClick={(lead) => {
            setSelectedLead(lead);
            setDetailOpen(true);
          }}
        />
      ) : (
      <>
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
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="w-[180px]" data-testid="owner-filter-select">
            <SelectValue placeholder={isEs ? "Filtrar por vendedor" : "Filter by owner"} />
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
                  {isEs ? "Empresas exactas" : "Exact companies"}: {duplicateInfo.companies.length}
                </span>
              )}
              {duplicateInfo.names.length > 0 && (
                <span className="mr-3">
                  {isEs ? "Nombres exactos" : "Exact names"}: {duplicateInfo.names.length}
                </span>
              )}
              {duplicateInfo.emails.length > 0 && (
                <span className="mr-3">
                  Emails: {duplicateInfo.emails.length}
                </span>
              )}
              {duplicateInfo.similarGroups.length > 0 && (
                <span className="text-orange-600 dark:text-orange-400 font-medium">
                  {isEs ? "Nombres similares" : "Similar names"}: {duplicateInfo.similarGroups.length}
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0" style={{ overflowX: 'auto' }}>
          <Table className="crm-table" style={{ minWidth: '900px', tableLayout: 'fixed' }}>
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: '200px' }}>{isEs ? "Nombre" : "Name"}</TableHead>
                <TableHead style={{ width: '100px' }}>{isEs ? "Contacto" : "Contact"}</TableHead>
                <TableHead style={{ width: '150px' }}>{isEs ? "Empresa" : "Company"}</TableHead>
                <TableHead style={{ width: '100px' }}>{isEs ? "Estado" : "Status"}</TableHead>
                <TableHead style={{ width: '120px' }}>{isEs ? "Seguimiento" : "Follow-up"}</TableHead>
                <TableHead style={{ width: '100px' }}>Owner</TableHead>
                <TableHead style={{ width: '130px' }}>{isEs ? "Acciones" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAndFilteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay leads de outreach" : "No outreach leads"}
                  </TableCell>
                </TableRow>
              ) : (
                sortedAndFilteredLeads.map((lead) => {
                  // Determine what to show in Name vs Company columns
                  const hasCompany = lead.company_name && lead.company_name.trim();
                  const contactName = lead.lead_name || lead.name || "";
                  const companyName = lead.company_name || "";
                  
                  // If contact name equals company name, it's probably a company entry - show company in Company column, leave Name for contact
                  const nameIsSameAsCompany = contactName.toLowerCase().trim() === companyName.toLowerCase().trim();
                  const displayName = nameIsSameAsCompany ? "-" : (contactName || "-");
                  const displayCompany = hasCompany ? companyName : "-";
                  const dupeReasons = getDuplicateReasons(lead);
                  
                  return (
                  <TableRow 
                    key={lead.lead_id} 
                    className={`cursor-pointer hover:bg-muted/50 ${dupeReasons.length > 0 ? "bg-yellow-50 dark:bg-yellow-900/10" : ""}`}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {dupeReasons.length > 0 && (
                          <AlertTriangle 
                            className="w-4 h-4 text-yellow-600 flex-shrink-0" 
                            title={`${isEs ? "Duplicado" : "Duplicate"}: ${dupeReasons.join(", ")}`} 
                          />
                        )}
                        {lead.client_type === "Company" || hasCompany ? (
                          <Building2 className="w-4 h-4 text-blue-600" />
                        ) : (
                          <User className="w-4 h-4 text-purple-600" />
                        )}
                        <span className="truncate">{displayName !== "-" ? displayName : (hasCompany ? companyName : "-")}</span>
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
                      {hasCompany && !nameIsSameAsCompany ? (
                        <span className="flex items-center gap-1 text-sm">
                          <Building2 className="w-3 h-3" />
                          {companyName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
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
                            <DropdownMenuSeparator />
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
      </>
      )}

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

            {/* Duplicate Warning */}
            {duplicateWarning && duplicateWarning.length > 0 && (
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-orange-800 dark:text-orange-200 mb-2">
                      {isEs ? "¡Posible duplicado detectado!" : "Potential duplicate detected!"}
                    </p>
                    <ul className="text-xs text-orange-700 dark:text-orange-300 space-y-1 mb-3">
                      {duplicateWarning.map((w, i) => (
                        <li key={i}>• {w.message}</li>
                      ))}
                    </ul>
                    <div className="flex gap-2">
                      <Button 
                        type="button" 
                        size="sm" 
                        variant="outline"
                        onClick={() => setDuplicateWarning(null)}
                      >
                        {isEs ? "Revisar" : "Review"}
                      </Button>
                      <Button 
                        type="button" 
                        size="sm" 
                        variant="destructive"
                        onClick={() => handleCreate(null, true)}
                      >
                        {isEs ? "Crear de todas formas" : "Create anyway"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

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
                        ? selectedLead.owner_name || users.find(u => u.user_id === selectedLead.owner_id)?.name || selectedLead.owner_id.replace("user_", "").slice(0, 8)
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

              {/* Contacts Tab */}
              <TabsContent value="contacts" className="mt-0 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {isEs ? "Personas de contacto para este lead" : "Contact people for this lead"}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setAddContactOpen(true)}>
                    <UserPlus className="w-3 h-3 mr-1" />
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
              <Label>{isEs ? "Industria" : "Industry"}</Label>
              <Select value={editForm.industry || "none"} onValueChange={(v) => setEditForm({ ...editForm, industry: v === "none" ? "" : v })}>
                <SelectTrigger data-testid="industry-select">
                  <SelectValue placeholder={isEs ? "Seleccionar industria" : "Select industry"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Sin especificar" : "Not specified"}</SelectItem>
                  {LEAD_INDUSTRIES.map(ind => (
                    <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                id="is_primary"
                checked={contactForm.is_primary}
                onChange={(e) => setContactForm({ ...contactForm, is_primary: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="is_primary" className="text-sm cursor-pointer">
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
