import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
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
import { Switch } from "../ui/switch";
import { Progress } from "../ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  Search, Phone, Mail, Building2, RefreshCw, User, Calendar, 
  Eye, TrendingUp, Edit, Trash2, UserPlus, CreditCard, Plus,
  MessageCircle, ExternalLink, Users, FileText, Link2, Copy
} from "lucide-react";
import CommsLogSection from "./CommsLogSection";
import CommunicationsTimeline from "./CommunicationsTimeline";

import { API_BASE as API } from "../../utils/api";

const CLIENT_SOURCES = ["Website", "Instagram", "QR", "Referral", "Direct", "Other"];
const CLIENT_INDUSTRIES = [
  { value: "technology", labelEn: "Technology", labelEs: "Tecnología" },
  { value: "healthcare", labelEn: "Healthcare", labelEs: "Salud" },
  { value: "finance", labelEn: "Finance & Banking", labelEs: "Finanzas y Banca" },
  { value: "retail", labelEn: "Retail & E-commerce", labelEs: "Retail y E-commerce" },
  { value: "manufacturing", labelEn: "Manufacturing", labelEs: "Manufactura" },
  { value: "real_estate", labelEn: "Real Estate", labelEs: "Bienes Raíces" },
  { value: "hospitality", labelEn: "Hospitality & Tourism", labelEs: "Hospitalidad y Turismo" },
  { value: "education", labelEn: "Education", labelEs: "Educación" },
  { value: "media", labelEn: "Media & Entertainment", labelEs: "Medios y Entretenimiento" },
  { value: "nonprofit", labelEn: "Non-Profit", labelEs: "Sin Fines de Lucro" },
  { value: "government", labelEn: "Government", labelEs: "Gobierno" },
  { value: "legal", labelEn: "Legal Services", labelEs: "Servicios Legales" },
  { value: "consulting", labelEn: "Consulting", labelEs: "Consultoría" },
  { value: "construction", labelEn: "Construction", labelEs: "Construcción" },
  { value: "automotive", labelEn: "Automotive", labelEs: "Automotriz" },
  { value: "food_beverage", labelEn: "Food & Beverage", labelEs: "Alimentos y Bebidas" },
  { value: "other", labelEn: "Other", labelEs: "Otro" }
];
const PAYMENT_TERMS = [
  { value: "immediate", label: "Inmediato" },
  { value: "net_7", label: "Net 7" },
  { value: "net_15", label: "Net 15" },
  { value: "net_30", label: "Net 30" },
  { value: "custom", label: "Personalizado" }
];

export default function ClientsSection() {
  const { language } = useLanguage();
  const { term, industryKey, isLoading: terminologyLoading } = useTerminology();
  const isEs = language === "es";
  
  // Dynamic terminology - will update when config loads
  const clientLabel = term("events", "client");
  const clientsLabel = term("events", "clients");
  
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterIndustry, setFilterIndustry] = useState("all");
  const [selectedClient, setSelectedClient] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [editForm, setEditForm] = useState({
    display_name: "",
    email: "",
    phone: "",
    whatsapp: "",
    address: "",
    rnc: "",
    client_type: "Individual",
    source: "Direct",
    notes: "",
    tags: [],
    has_credit: false,
    credit_limit: 0,
    payment_terms: "immediate",
    // Business profile fields
    website: "",
    industry: "",
    description: "",
    social_linkedin: "",
    social_instagram: ""
  });
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    phone: "",
    whatsapp: "",
    role: "",
    is_primary: false
  });

  const fetchClients = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/crm/clients-with-events`, { withCredentials: true });
      setClients(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { 
    fetchClients(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stats by type
  const corporateClients = clients.filter(c => c.client_type === "Company");
  const individualClients = clients.filter(c => c.client_type === "Individual");
  const totalLifetimeValue = clients.reduce((sum, c) => sum + (c.lifetime_value || 0), 0);
  const totalEvents = clients.reduce((sum, c) => sum + (c.events_count || 0), 0);

  // Get unique industries from clients
  const industries = [...new Set(clients.map(c => c.industry).filter(Boolean))];

  const filteredClients = clients.filter(client => {
    const matchesSearch = client.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.rnc?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.industry?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "all" || 
      (filterType === "corporate" && client.client_type === "Company") ||
      (filterType === "individual" && client.client_type === "Individual");
    const matchesIndustry = filterIndustry === "all" || client.industry === filterIndustry;
    return matchesSearch && matchesType && matchesIndustry;
  });

  const viewClient = (client) => {
    setSelectedClient(client);
    setDetailOpen(true);
  };

  const openEdit = (client, e) => {
    if (e) e.stopPropagation();
    setSelectedClient(client);
    setEditForm({
      display_name: client.display_name || "",
      email: client.email || "",
      phone: client.phone || "",
      whatsapp: client.whatsapp || "",
      address: client.address || "",
      rnc: client.rnc || "",
      client_type: client.client_type || "Individual",
      source: client.source || "Direct",
      notes: client.notes || "",
      tags: client.tags || [],
      has_credit: client.has_credit || false,
      credit_limit: client.credit_limit || 0,
      payment_terms: client.payment_terms || "immediate",
      // Business profile fields
      website: client.website || "",
      industry: client.industry || "",
      description: client.description || "",
      social_linkedin: client.social_linkedin || "",
      social_instagram: client.social_instagram || ""
    });
    setEditOpen(true);
  };

  const openCreate = () => {
    setEditForm({
      display_name: "",
      email: "",
      phone: "",
      whatsapp: "",
      address: "",
      rnc: "",
      client_type: "Individual",
      source: "Direct",
      notes: "",
      tags: [],
      has_credit: false,
      credit_limit: 0,
      payment_terms: "immediate",
      // Business profile fields
      website: "",
      industry: "",
      description: "",
      social_linkedin: "",
      social_instagram: ""
    });
    setCreateOpen(true);
  };

  const handleSave = async () => {
    try {
      await axios.put(`${API}/api/crm/clients/${selectedClient.client_id}`, editForm, { withCredentials: true });
      toast.success(isEs ? `${clientLabel} actualizado` : `${clientLabel} updated`);
      setEditOpen(false);
      fetchClients();
      if (detailOpen) {
        setSelectedClient({ ...selectedClient, ...editForm });
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleCreate = async () => {
    if (!editForm.display_name) {
      toast.error(isEs ? "El nombre es requerido" : "Name is required");
      return;
    }
    try {
      await axios.post(`${API}/api/crm/clients`, editForm, { withCredentials: true });
      toast.success(isEs ? `${clientLabel} creado` : `${clientLabel} created`);
      setCreateOpen(false);
      fetchClients();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API}/api/crm/clients/${selectedClient.client_id}`, { withCredentials: true });
      toast.success(isEs ? `${clientLabel} eliminado` : `${clientLabel} deleted`);
      setDeleteConfirmOpen(false);
      setDetailOpen(false);
      setEditOpen(false);
      fetchClients();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  // Contact management
  const openAddContact = () => {
    setEditingContact(null);
    setContactForm({ name: "", email: "", phone: "", whatsapp: "", role: "", is_primary: false });
    setContactDialogOpen(true);
  };

  const openEditContact = (contact) => {
    setEditingContact(contact);
    setContactForm({
      name: contact.name || "",
      email: contact.email || "",
      phone: contact.phone || "",
      whatsapp: contact.whatsapp || "",
      role: contact.role || "",
      is_primary: contact.is_primary || false
    });
    setContactDialogOpen(true);
  };

  const handleSaveContact = async () => {
    if (!contactForm.name) {
      toast.error(isEs ? "El nombre es requerido" : "Name is required");
      return;
    }
    try {
      const payload = { ...contactForm, client_id: selectedClient.client_id };
      if (editingContact) {
        await axios.put(`${API}/api/contacts/${editingContact.contact_id}`, payload, { withCredentials: true });
        toast.success(isEs ? "Contacto actualizado" : "Contact updated");
      } else {
        await axios.post(`${API}/api/contacts`, payload, { withCredentials: true });
        toast.success(isEs ? "Contacto agregado" : "Contact added");
      }
      setContactDialogOpen(false);
      fetchClients();
      // Refresh selected client
      const updatedClients = await axios.get(`${API}/api/crm/clients-with-events`, { withCredentials: true });
      const updatedClient = updatedClients.data.find(c => c.client_id === selectedClient.client_id);
      if (updatedClient) setSelectedClient(updatedClient);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleDeleteContact = async (contactId) => {
    try {
      await axios.delete(`${API}/api/contacts/${contactId}`, { withCredentials: true });
      toast.success(isEs ? "Contacto eliminado" : "Contact deleted");
      fetchClients();
      const updatedClients = await axios.get(`${API}/api/crm/clients-with-events`, { withCredentials: true });
      const updatedClient = updatedClients.data.find(c => c.client_id === selectedClient.client_id);
      if (updatedClient) setSelectedClient(updatedClient);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount || 0);
  };

  const getWhatsAppLink = (number) => {
    if (!number) return null;
    const cleaned = number.replace(/\D/g, '');
    return `https://wa.me/${cleaned}`;
  };

  const getMailtoLink = (email) => {
    if (!email) return null;
    return `mailto:${email}`;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="clients-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{clientsLabel}</h2>
          <p className="text-muted-foreground text-sm">
            {isEs ? `Gestiona tu cartera de ${clientsLabel.toLowerCase()}` : `Manage your ${clientsLabel.toLowerCase()} portfolio`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchClients}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {isEs ? "Actualizar" : "Refresh"}
          </Button>
          <Button onClick={openCreate} data-testid="create-client-btn">
            <UserPlus className="w-4 h-4 mr-2" />
            {isEs ? `Nuevo ${clientLabel}` : `New ${clientLabel}`}
          </Button>
        </div>
      </div>

      {/* Stats by Type */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm">{isEs ? `Total ${clientsLabel}` : `Total ${clientsLabel}`}</span>
            </div>
            <div className="text-3xl font-bold">{clients.length}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setFilterType(filterType === "corporate" ? "all" : "corporate")}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-5 h-5 text-blue-600" />
              <span className="text-sm">{isEs ? "Corporativos" : "Corporate"}</span>
            </div>
            <div className="text-3xl font-bold text-blue-600">{corporateClients.length}</div>
            {filterType === "corporate" && <Badge className="mt-1 bg-blue-100 text-blue-700">Filtrado</Badge>}
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setFilterType(filterType === "individual" ? "all" : "individual")}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <User className="w-5 h-5 text-purple-600" />
              <span className="text-sm">{isEs ? "Directos" : "Direct"}</span>
            </div>
            <div className="text-3xl font-bold text-purple-600">{individualClients.length}</div>
            {filterType === "individual" && <Badge className="mt-1 bg-purple-100 text-purple-700">Filtrado</Badge>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <span className="text-sm">{isEs ? "Valor Lifetime" : "Lifetime Value"}</span>
            </div>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalLifetimeValue)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={isEs ? "Buscar por nombre, email o RNC..." : "Search by name, email or RNC..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="client-search-input"
          />
        </div>
        {filterType !== "all" && (
          <Button variant="outline" onClick={() => setFilterType("all")} size="sm">
            {isEs ? "Limpiar filtro" : "Clear filter"}
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{clientLabel}</TableHead>
                <TableHead>RNC</TableHead>
                <TableHead>{isEs ? "Contacto" : "Contact"}</TableHead>
                <TableHead>{isEs ? "Crédito" : "Credit"}</TableHead>
                <TableHead>{isEs ? "Eventos" : "Events"}</TableHead>
                <TableHead>{isEs ? "Valor Lifetime" : "Lifetime Value"}</TableHead>
                <TableHead className="text-right">{isEs ? "Acciones" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {isEs ? `No hay ${clientsLabel.toLowerCase()}` : `No ${clientsLabel.toLowerCase()}`}
                  </TableCell>
                </TableRow>
              ) : (
                filteredClients.map((client) => (
                  <TableRow key={client.client_id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell onClick={() => viewClient(client)}>
                      <div className="flex items-center gap-2">
                        {client.client_type === "Company" ? (
                          <Building2 className="w-4 h-4 text-blue-600" />
                        ) : (
                          <User className="w-4 h-4 text-purple-600" />
                        )}
                        <div>
                          <span className="font-medium">{client.display_name}</span>
                          {client.contacts?.length > 0 && (
                            <span className="text-xs text-muted-foreground ml-2">
                              ({client.contacts.length} {isEs ? "contactos" : "contacts"})
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell onClick={() => viewClient(client)}>
                      <span className="text-sm font-mono">{client.rnc || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {client.whatsapp && (
                          <a href={getWhatsAppLink(client.whatsapp)} target="_blank" rel="noopener noreferrer" 
                             className="text-green-600 hover:text-green-700" title="WhatsApp">
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                        {client.email && (
                          <a href={getMailtoLink(client.email)} className="text-blue-600 hover:text-blue-700" title="Email">
                            <Mail className="w-4 h-4" />
                          </a>
                        )}
                        {client.phone && (
                          <a href={`tel:${client.phone}`} className="text-muted-foreground hover:text-foreground" title={isEs ? "Llamar" : "Call"}>
                            <Phone className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell onClick={() => viewClient(client)}>
                      {client.has_credit ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <CreditCard className="w-3 h-3 text-green-600" />
                            <span className="text-xs">{formatCurrency(client.credit_limit)}</span>
                          </div>
                          <Progress value={client.credit_percentage || 0} className="h-1" />
                          <span className="text-xs text-muted-foreground">{client.credit_percentage || 0}% {isEs ? "usado" : "used"}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell onClick={() => viewClient(client)}>
                      <Badge variant="outline">{client.events_count || 0}</Badge>
                    </TableCell>
                    <TableCell className="font-medium text-green-600" onClick={() => viewClient(client)}>
                      {formatCurrency(client.lifetime_value)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={(e) => {
                            e.stopPropagation();
                            const portalUrl = `${window.location.origin}/portal/client/${client.client_id}`;
                            window.open(portalUrl, '_blank');
                          }}
                          title={isEs ? "Portal Cliente" : "Client Portal"}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => viewClient(client)} title={isEs ? "Ver" : "View"}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={(e) => openEdit(client, e)} title={isEs ? "Editar" : "Edit"} data-testid={`edit-client-${client.client_id}`}>
                          <Edit className="w-4 h-4" />
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

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedClient?.client_type === "Company" ? (
                  <Building2 className="w-5 h-5 text-blue-600" />
                ) : (
                  <User className="w-5 h-5 text-purple-600" />
                )}
                {selectedClient?.display_name}
                {selectedClient?.rnc && (
                  <Badge variant="outline" className="font-mono text-xs">RNC: {selectedClient.rnc}</Badge>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => openEdit(selectedClient)} data-testid="edit-client-detail-btn">
                <Edit className="w-4 h-4 mr-2" />
                {isEs ? "Editar" : "Edit"}
              </Button>
            </DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="info">{isEs ? "Información" : "Info"}</TabsTrigger>
                <TabsTrigger value="contacts">{isEs ? "Contactos" : "Contacts"}</TabsTrigger>
                <TabsTrigger value="events">{isEs ? "Eventos" : "Events"}</TabsTrigger>
                <TabsTrigger value="comms">{isEs ? "Comunicaciones" : "Comms"}</TabsTrigger>
              </TabsList>

              {/* Info Tab */}
              <TabsContent value="info" className="space-y-6">
                {/* Contact Links */}
                <div className="flex flex-wrap gap-3">
                  {selectedClient.whatsapp && (
                    <a href={getWhatsAppLink(selectedClient.whatsapp)} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="text-green-600 border-green-200 hover:bg-green-50">
                        <MessageCircle className="w-4 h-4 mr-2" />
                        WhatsApp
                        <ExternalLink className="w-3 h-3 ml-2" />
                      </Button>
                    </a>
                  )}
                  {selectedClient.email && (
                    <a href={getMailtoLink(selectedClient.email)}>
                      <Button variant="outline" size="sm" className="text-blue-600 border-blue-200 hover:bg-blue-50">
                        <Mail className="w-4 h-4 mr-2" />
                        Email
                        <ExternalLink className="w-3 h-3 ml-2" />
                      </Button>
                    </a>
                  )}
                  {selectedClient.phone && (
                    <a href={`tel:${selectedClient.phone}`}>
                      <Button variant="outline" size="sm">
                        <Phone className="w-4 h-4 mr-2" />
                        {isEs ? "Llamar" : "Call"}
                      </Button>
                    </a>
                  )}
                </div>

                {/* Client Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{selectedClient.email || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{isEs ? "Teléfono" : "Phone"}</p>
                    <p className="font-medium">{selectedClient.phone || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">WhatsApp</p>
                    <p className="font-medium">{selectedClient.whatsapp || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">RNC</p>
                    <p className="font-medium font-mono">{selectedClient.rnc || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{isEs ? "Dirección" : "Address"}</p>
                    <p className="font-medium">{selectedClient.address || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{isEs ? "Fuente" : "Source"}</p>
                    <Badge variant="outline">{selectedClient.source}</Badge>
                  </div>
                </div>

                {/* Credit Info */}
                {selectedClient.has_credit && (
                  <Card className="bg-green-50 border-green-200">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <CreditCard className="w-5 h-5 text-green-600" />
                        <span className="font-semibold text-green-800">{isEs ? "Información de Crédito" : "Credit Info"}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm text-green-700">{isEs ? "Límite" : "Limit"}</p>
                          <p className="text-xl font-bold text-green-800">{formatCurrency(selectedClient.credit_limit)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-green-700">{isEs ? "Utilizado" : "Used"}</p>
                          <p className="text-xl font-bold text-green-800">{formatCurrency(selectedClient.credit_used || 0)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-green-700">{isEs ? "Disponible" : "Available"}</p>
                          <p className="text-xl font-bold text-green-800">
                            {formatCurrency((selectedClient.credit_limit || 0) - (selectedClient.credit_used || 0))}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span>{isEs ? "Uso de crédito" : "Credit usage"}</span>
                          <span className={selectedClient.credit_percentage > 80 ? "text-red-600 font-medium" : ""}>
                            {selectedClient.credit_percentage || 0}%
                          </span>
                        </div>
                        <Progress 
                          value={selectedClient.credit_percentage || 0} 
                          className={`h-2 ${selectedClient.credit_percentage > 80 ? "[&>div]:bg-red-500" : ""}`}
                        />
                      </div>
                      <div className="mt-3">
                        <p className="text-sm text-green-700">{isEs ? "Términos de pago" : "Payment Terms"}</p>
                        <Badge className="bg-green-200 text-green-800">
                          {PAYMENT_TERMS.find(t => t.value === selectedClient.payment_terms)?.label || selectedClient.payment_terms}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Notes */}
                {selectedClient.notes && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">{isEs ? "Notas" : "Notes"}</p>
                    <p className="text-sm bg-muted p-3 rounded-lg">{selectedClient.notes}</p>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold">{selectedClient.events_count || 0}</div>
                      <p className="text-sm text-muted-foreground">{isEs ? "Eventos" : "Events"}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold text-green-600">{formatCurrency(selectedClient.lifetime_value)}</div>
                      <p className="text-sm text-muted-foreground">{isEs ? "Valor Total" : "Total Value"}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-lg font-medium">
                        {selectedClient.last_event_date 
                          ? new Date(selectedClient.last_event_date).toLocaleDateString()
                          : "-"}
                      </div>
                      <p className="text-sm text-muted-foreground">{isEs ? "Último Evento" : "Last Event"}</p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Contacts Tab */}
              <TabsContent value="contacts" className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-semibold">{isEs ? "Contactos" : "Contacts"}</h4>
                  <Button size="sm" onClick={openAddContact}>
                    <Plus className="w-4 h-4 mr-2" />
                    {isEs ? "Agregar Contacto" : "Add Contact"}
                  </Button>
                </div>
                {selectedClient.contacts?.length > 0 ? (
                  <div className="space-y-3">
                    {selectedClient.contacts.map((contact) => (
                      <Card key={contact.contact_id}>
                        <CardContent className="py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                <User className="w-5 h-5 text-muted-foreground" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{contact.name}</p>
                                  {contact.is_primary && (
                                    <Badge className="text-xs bg-blue-100 text-blue-700">{isEs ? "Principal" : "Primary"}</Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">{contact.role || "-"}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {contact.whatsapp && (
                                <a href={getWhatsAppLink(contact.whatsapp)} target="_blank" rel="noopener noreferrer">
                                  <Button variant="ghost" size="icon" className="text-green-600">
                                    <MessageCircle className="w-4 h-4" />
                                  </Button>
                                </a>
                              )}
                              {contact.email && (
                                <a href={getMailtoLink(contact.email)}>
                                  <Button variant="ghost" size="icon" className="text-blue-600">
                                    <Mail className="w-4 h-4" />
                                  </Button>
                                </a>
                              )}
                              {contact.phone && (
                                <a href={`tel:${contact.phone}`}>
                                  <Button variant="ghost" size="icon">
                                    <Phone className="w-4 h-4" />
                                  </Button>
                                </a>
                              )}
                              <Button variant="ghost" size="icon" onClick={() => openEditContact(contact)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDeleteContact(contact.contact_id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>{isEs ? "No hay contactos" : "No contacts"}</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={openAddContact}>
                      <Plus className="w-4 h-4 mr-2" />
                      {isEs ? "Agregar primer contacto" : "Add first contact"}
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Events Tab */}
              <TabsContent value="events" className="space-y-4">
                <h4 className="font-semibold flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {isEs ? "Historial de Eventos" : "Event History"}
                </h4>
                {selectedClient.events?.length > 0 ? (
                  <div className="space-y-2">
                    {selectedClient.events.map((event) => (
                      <Card key={event.event_id}>
                        <CardContent className="py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="font-medium">{event.name}</p>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span>
                                  {event.event_date ? new Date(event.event_date).toLocaleDateString() : "TBD"}
                                </span>
                                {event.event_type && (
                                  <Badge variant="outline" className="text-xs">{event.event_type}</Badge>
                                )}
                                {(event.ordered_by || event.contact_person) && (
                                  <span className="flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    {event.ordered_by || event.contact_person}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={
                                event.stage === "Won" ? "bg-green-100 text-green-700" :
                                event.stage === "Closed" ? "bg-gray-100 text-gray-700" :
                                "bg-blue-100 text-blue-700"
                              }>
                                {event.stage}
                              </Badge>
                              <Link to={`/events/${event.event_id}`}>
                                <Button variant="ghost" size="sm">
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </Link>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>{isEs ? "No hay eventos" : "No events"}</p>
                  </div>
                )}
              </TabsContent>

              {/* Comms Tab */}
              <TabsContent value="comms">
                <CommunicationsTimeline 
                  entityType="client" 
                  entityId={selectedClient.client_id}
                  entityName={selectedClient.display_name}
                  maxVisible={10}
                />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEs ? "Editar Cliente" : "Edit Client"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>{isEs ? "Nombre" : "Name"} *</Label>
                <Input
                  value={editForm.display_name}
                  onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                  data-testid="client-name-input"
                />
              </div>
              <div>
                <Label>{isEs ? "Tipo" : "Type"}</Label>
                <Select value={editForm.client_type} onValueChange={(v) => setEditForm({ ...editForm, client_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Individual">{isEs ? "Directo" : "Direct"}</SelectItem>
                    <SelectItem value="Company">{isEs ? "Corporativo" : "Corporate"}</SelectItem>
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
              <Label>{isEs ? "Dirección" : "Address"}</Label>
              <Input
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              />
            </div>
            <div>
              <Label>{isEs ? "Fuente" : "Source"}</Label>
              <Select value={editForm.source} onValueChange={(v) => setEditForm({ ...editForm, source: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_SOURCES.map(src => (
                    <SelectItem key={src} value={src}>{src}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Credit Section */}
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  <Label className="font-medium">{isEs ? "Crédito" : "Credit"}</Label>
                </div>
                <Switch
                  checked={editForm.has_credit}
                  onCheckedChange={(v) => setEditForm({ ...editForm, has_credit: v })}
                />
              </div>
              {editForm.has_credit && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{isEs ? "Límite de Crédito" : "Credit Limit"}</Label>
                    <Input
                      type="number"
                      value={editForm.credit_limit}
                      onChange={(e) => setEditForm({ ...editForm, credit_limit: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label>{isEs ? "Términos de Pago" : "Payment Terms"}</Label>
                    <Select value={editForm.payment_terms} onValueChange={(v) => setEditForm({ ...editForm, payment_terms: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_TERMS.map(term => (
                          <SelectItem key={term.value} value={term.value}>{term.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Business Profile Section */}
            <div className="space-y-4 pt-4 border-t">
              <h4 className="font-medium text-sm text-muted-foreground">
                {isEs ? "Perfil de Negocio" : "Business Profile"}
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{isEs ? "Página Web" : "Website"}</Label>
                  <Input
                    type="url"
                    placeholder="https://..."
                    value={editForm.website || ""}
                    onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{isEs ? "Industria" : "Industry"}</Label>
                  <Select value={editForm.industry || ""} onValueChange={(v) => setEditForm({ ...editForm, industry: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {CLIENT_INDUSTRIES.map(ind => (
                        <SelectItem key={ind.value} value={ind.value}>
                          {isEs ? ind.labelEs : ind.labelEn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{isEs ? "Descripción del Negocio" : "Business Description"}</Label>
                <Textarea
                  placeholder={isEs ? "¿A qué se dedica este cliente?" : "What does this client do?"}
                  value={editForm.description || ""}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>LinkedIn</Label>
                  <Input
                    placeholder="https://linkedin.com/..."
                    value={editForm.social_linkedin || ""}
                    onChange={(e) => setEditForm({ ...editForm, social_linkedin: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Instagram</Label>
                  <Input
                    placeholder="@username"
                    value={editForm.social_instagram || ""}
                    onChange={(e) => setEditForm({ ...editForm, social_instagram: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="flex justify-between">
            <Button variant="destructive" size="sm" onClick={() => setDeleteConfirmOpen(true)}>
              <Trash2 className="w-4 h-4 mr-2" />
              {isEs ? "Eliminar" : "Delete"}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                {isEs ? "Cancelar" : "Cancel"}
              </Button>
              <Button onClick={handleSave} data-testid="save-client-btn">
                {isEs ? "Guardar" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEs ? "Nuevo Cliente" : "New Client"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>{isEs ? "Nombre" : "Name"} *</Label>
                <Input
                  value={editForm.display_name}
                  onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                />
              </div>
              <div>
                <Label>{isEs ? "Tipo" : "Type"}</Label>
                <Select value={editForm.client_type} onValueChange={(v) => setEditForm({ ...editForm, client_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Individual">{isEs ? "Directo" : "Direct"}</SelectItem>
                    <SelectItem value="Company">{isEs ? "Corporativo" : "Corporate"}</SelectItem>
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
              <Label>{isEs ? "Dirección" : "Address"}</Label>
              <Input
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              />
            </div>
            <div>
              <Label>{isEs ? "Fuente" : "Source"}</Label>
              <Select value={editForm.source} onValueChange={(v) => setEditForm({ ...editForm, source: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_SOURCES.map(src => (
                    <SelectItem key={src} value={src}>{src}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Credit Section */}
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  <Label className="font-medium">{isEs ? "Crédito" : "Credit"}</Label>
                </div>
                <Switch
                  checked={editForm.has_credit}
                  onCheckedChange={(v) => setEditForm({ ...editForm, has_credit: v })}
                />
              </div>
              {editForm.has_credit && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{isEs ? "Límite de Crédito" : "Credit Limit"}</Label>
                    <Input
                      type="number"
                      value={editForm.credit_limit}
                      onChange={(e) => setEditForm({ ...editForm, credit_limit: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label>{isEs ? "Términos de Pago" : "Payment Terms"}</Label>
                    <Select value={editForm.payment_terms} onValueChange={(v) => setEditForm({ ...editForm, payment_terms: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_TERMS.map(term => (
                          <SelectItem key={term.value} value={term.value}>{term.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Business Profile Section */}
            <div className="space-y-4 pt-4 border-t">
              <h4 className="font-medium text-sm text-muted-foreground">
                {isEs ? "Perfil de Negocio" : "Business Profile"}
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{isEs ? "Página Web" : "Website"}</Label>
                  <Input
                    type="url"
                    placeholder="https://..."
                    value={editForm.website || ""}
                    onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{isEs ? "Industria" : "Industry"}</Label>
                  <Select value={editForm.industry || ""} onValueChange={(v) => setEditForm({ ...editForm, industry: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {CLIENT_INDUSTRIES.map(ind => (
                        <SelectItem key={ind.value} value={ind.value}>
                          {isEs ? ind.labelEs : ind.labelEn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{isEs ? "Descripción del Negocio" : "Business Description"}</Label>
                <Textarea
                  placeholder={isEs ? "¿A qué se dedica este cliente?" : "What does this client do?"}
                  value={editForm.description || ""}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>LinkedIn</Label>
                  <Input
                    placeholder="https://linkedin.com/..."
                    value={editForm.social_linkedin || ""}
                    onChange={(e) => setEditForm({ ...editForm, social_linkedin: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Instagram</Label>
                  <Input
                    placeholder="@username"
                    value={editForm.social_instagram || ""}
                    onChange={(e) => setEditForm({ ...editForm, social_instagram: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreate} data-testid="create-client-submit-btn">
              {isEs ? "Crear" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contact Dialog */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingContact ? (isEs ? "Editar Contacto" : "Edit Contact") : (isEs ? "Nuevo Contacto" : "New Contact")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"} *</Label>
              <Input
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label>{isEs ? "Cargo/Rol" : "Role"}</Label>
              <Input
                value={contactForm.role}
                onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
                placeholder={isEs ? "Ej: Gerente de Compras" : "E.g.: Purchasing Manager"}
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
            <div className="flex items-center gap-2">
              <Switch
                checked={contactForm.is_primary}
                onCheckedChange={(v) => setContactForm({ ...contactForm, is_primary: v })}
              />
              <Label>{isEs ? "Contacto principal" : "Primary contact"}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveContact}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">{isEs ? "Confirmar Eliminación" : "Confirm Delete"}</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            {isEs 
              ? `¿Estás seguro de que deseas eliminar a "${selectedClient?.display_name}"? Esta acción no se puede deshacer.`
              : `Are you sure you want to delete "${selectedClient?.display_name}"? This action cannot be undone.`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {isEs ? "Eliminar" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
