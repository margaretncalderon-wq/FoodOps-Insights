// components/crm/CompaniesSection.js - Company management with contacts
import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { 
  Plus, Search, Building2, RefreshCw, User, ChevronDown, ChevronRight,
  MoreHorizontal, Eye, Edit, Trash2, Phone, Mail, MessageCircle,
  Users, FileText, Globe, Linkedin, Instagram, MapPin, CreditCard
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "../ui/dropdown-menu";

import { API_BASE as API } from "../../utils/api";

const STATUS_COLORS = {
  Lead: "bg-blue-100 text-blue-700 border-blue-300",
  Active: "bg-green-100 text-green-700 border-green-300",
  Client: "bg-purple-100 text-purple-700 border-purple-300",
  Inactive: "bg-gray-100 text-gray-700 border-gray-300"
};

const INDUSTRIES = [
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
  { value: "beauty", labelEn: "Beauty & Wellness", labelEs: "Belleza y Bienestar" },
  { value: "logistics", labelEn: "Logistics & Transport", labelEs: "Logística y Transporte" },
  { value: "agriculture", labelEn: "Agriculture", labelEs: "Agricultura" },
  { value: "other", labelEn: "Other", labelEs: "Otro" }
];

export default function CompaniesSection() {
  const { language } = useLanguage();
  const isEs = language === "es";

  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedCompany, setExpandedCompany] = useState(null);
  
  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [companyContacts, setCompanyContacts] = useState([]);
  const [showCustomIndustry, setShowCustomIndustry] = useState(false);
  
  // Forms
  const [companyForm, setCompanyForm] = useState({
    name: "",
    industry: "",
    customIndustry: "",
    website: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    country: "",
    rnc: "",
    description: "",
    notes: ""
  });
  
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    phone: "",
    whatsapp: "",
    role_title: "",
    department: "",
    is_primary: false,
    is_decision_maker: false
  });

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/companies`, { withCredentials: true });
      setCompanies(res.data);
    } catch (err) {
      console.error("Error fetching companies:", err);
      toast.error(isEs ? "Error al cargar empresas" : "Error loading companies");
    }
    setLoading(false);
  }, [isEs]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const fetchCompanyDetail = async (companyId) => {
    try {
      const res = await axios.get(`${API}/api/companies/${companyId}`, { withCredentials: true });
      setSelectedCompany(res.data);
      setCompanyContacts(res.data.contacts || []);
      return res.data;
    } catch (err) {
      console.error("Error fetching company:", err);
    }
  };

  const handleCreateCompany = async () => {
    if (!companyForm.name.trim()) {
      toast.error(isEs ? "Nombre es requerido" : "Name is required");
      return;
    }
    try {
      // Use custom industry if "other" is selected
      const payload = {
        ...companyForm,
        industry: companyForm.industry === "other" ? companyForm.customIndustry : companyForm.industry
      };
      delete payload.customIndustry;
      
      await axios.post(`${API}/api/companies`, payload, { withCredentials: true });
      toast.success(isEs ? "Empresa creada" : "Company created");
      setCreateOpen(false);
      resetCompanyForm();
      fetchCompanies();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleUpdateCompany = async () => {
    if (!selectedCompany) return;
    try {
      const payload = {
        ...companyForm,
        industry: companyForm.industry === "other" ? companyForm.customIndustry : companyForm.industry
      };
      delete payload.customIndustry;
      
      await axios.put(`${API}/api/companies/${selectedCompany.company_entity_id}`, payload, { withCredentials: true });
      toast.success(isEs ? "Empresa actualizada" : "Company updated");
      setEditOpen(false);
      setShowCustomIndustry(false);
      fetchCompanies();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleDeleteCompany = async () => {
    if (!selectedCompany) return;
    try {
      await axios.delete(`${API}/api/companies/${selectedCompany.company_entity_id}`, { withCredentials: true });
      toast.success(isEs ? "Empresa eliminada" : "Company deleted");
      setDeleteOpen(false);
      setSelectedCompany(null);
      fetchCompanies();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleAddContact = async () => {
    if (!selectedCompany || !contactForm.name.trim()) {
      toast.error(isEs ? "Nombre es requerido" : "Name is required");
      return;
    }
    try {
      await axios.post(
        `${API}/api/companies/${selectedCompany.company_entity_id}/contacts`,
        contactForm,
        { withCredentials: true }
      );
      toast.success(isEs ? "Contacto agregado" : "Contact added");
      setContactOpen(false);
      resetContactForm();
      fetchCompanyDetail(selectedCompany.company_entity_id);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleDeleteContact = async (contactId) => {
    if (!selectedCompany) return;
    try {
      await axios.delete(
        `${API}/api/companies/${selectedCompany.company_entity_id}/contacts/${contactId}`,
        { withCredentials: true }
      );
      toast.success(isEs ? "Contacto eliminado" : "Contact deleted");
      fetchCompanyDetail(selectedCompany.company_entity_id);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const resetCompanyForm = () => {
    setCompanyForm({
      name: "", industry: "", customIndustry: "", website: "", phone: "", email: "",
      address: "", city: "", country: "", rnc: "", description: "", notes: ""
    });
    setShowCustomIndustry(false);
  };

  const resetContactForm = () => {
    setContactForm({
      name: "", email: "", phone: "", whatsapp: "", role_title: "",
      department: "", is_primary: false, is_decision_maker: false
    });
  };

  const openEdit = (company) => {
    setSelectedCompany(company);
    // Check if industry is custom (not in predefined list)
    const isCustomIndustry = company.industry && !INDUSTRIES.find(i => i.value === company.industry);
    setShowCustomIndustry(isCustomIndustry);
    setCompanyForm({
      name: company.name || "",
      industry: isCustomIndustry ? "other" : (company.industry || ""),
      customIndustry: isCustomIndustry ? company.industry : "",
      website: company.website || "",
      phone: company.phone || "",
      email: company.email || "",
      address: company.address || "",
      city: company.city || "",
      country: company.country || "",
      rnc: company.rnc || "",
      description: company.description || "",
      notes: company.notes || ""
    });
    setEditOpen(true);
  };

  const openDetail = async (company) => {
    await fetchCompanyDetail(company.company_entity_id);
    setDetailOpen(true);
  };

  const openDelete = (company) => {
    setSelectedCompany(company);
    setDeleteOpen(true);
  };

  const toggleExpand = async (companyId) => {
    if (expandedCompany === companyId) {
      setExpandedCompany(null);
    } else {
      setExpandedCompany(companyId);
      await fetchCompanyDetail(companyId);
    }
  };

  const filteredCompanies = companies.filter(company => {
    const matchesSearch = 
      (company.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (company.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (company.industry || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || company.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Stats
  const totalCompanies = companies.length;
  const activeCompanies = companies.filter(c => c.status === "Active" || c.status === "Client").length;
  const leadCompanies = companies.filter(c => c.status === "Lead").length;
  const totalContacts = companies.reduce((sum, c) => sum + (c.contacts_count || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="companies-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{isEs ? "Empresas" : "Companies"}</h2>
          <p className="text-muted-foreground text-sm">
            {isEs ? "Gestión de cuentas B2B con contactos" : "B2B account management with contacts"}
          </p>
        </div>
        <Button onClick={() => { resetCompanyForm(); setCreateOpen(true); }} data-testid="new-company-btn">
          <Plus className="w-4 h-4 mr-2" />
          {isEs ? "Nueva Empresa" : "New Company"}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{totalCompanies}</p>
                <p className="text-xs text-muted-foreground">{isEs ? "Total Empresas" : "Total Companies"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{activeCompanies}</p>
                <p className="text-xs text-muted-foreground">{isEs ? "Activas/Clientes" : "Active/Clients"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">{leadCompanies}</p>
                <p className="text-xs text-muted-foreground">Leads</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <User className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">{totalContacts}</p>
                <p className="text-xs text-muted-foreground">{isEs ? "Total Contactos" : "Total Contacts"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={isEs ? "Buscar empresas..." : "Search companies..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={isEs ? "Filtrar estado" : "Filter status"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
            <SelectItem value="Lead">Lead</SelectItem>
            <SelectItem value="Active">{isEs ? "Activa" : "Active"}</SelectItem>
            <SelectItem value="Client">{isEs ? "Cliente" : "Client"}</SelectItem>
            <SelectItem value="Inactive">{isEs ? "Inactiva" : "Inactive"}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Companies List */}
      <div className="space-y-2">
        {filteredCompanies.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {isEs ? "No hay empresas" : "No companies"}
            </CardContent>
          </Card>
        ) : (
          filteredCompanies.map((company) => (
            <Collapsible 
              key={company.company_entity_id} 
              open={expandedCompany === company.company_entity_id}
              onOpenChange={() => toggleExpand(company.company_entity_id)}
            >
              <Card className="overflow-hidden">
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        {expandedCompany === company.company_entity_id ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                        <Building2 className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">{company.name}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {company.industry && (
                            <span>{INDUSTRIES.find(i => i.value === company.industry)?.[isEs ? 'labelEs' : 'labelEn'] || company.industry}</span>
                          )}
                          {company.city && <span>• {company.city}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-sm">
                        <p className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {company.contacts_count || 0} {isEs ? "contactos" : "contacts"}
                        </p>
                      </div>
                      <Badge className={STATUS_COLORS[company.status] || STATUS_COLORS.Lead}>
                        {company.status}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openDetail(company); }}>
                            <Eye className="w-4 h-4 mr-2" />
                            {isEs ? "Ver Detalles" : "View Details"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(company); }}>
                            <Edit className="w-4 h-4 mr-2" />
                            {isEs ? "Editar" : "Edit"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={(e) => { e.stopPropagation(); openDelete(company); }}
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {isEs ? "Eliminar" : "Delete"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t p-4 bg-muted/30">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium">{isEs ? "Contactos" : "Contacts"}</h4>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          setSelectedCompany(company);
                          resetContactForm();
                          setContactOpen(true);
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        {isEs ? "Agregar" : "Add"}
                      </Button>
                    </div>
                    {companyContacts.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {isEs ? "No hay contactos. Agrega el primer contacto." : "No contacts. Add the first contact."}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {companyContacts.map((contact) => (
                          <div 
                            key={contact.contact_id}
                            className="flex items-center justify-between bg-background rounded-lg p-3 border"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm">{contact.name}</p>
                                  {contact.is_primary && (
                                    <Badge variant="outline" className="text-xs">Primary</Badge>
                                  )}
                                  {contact.is_decision_maker && (
                                    <Badge variant="outline" className="text-xs bg-purple-50">DM</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {contact.role_title || contact.role || contact.department || "-"}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {contact.phone && (
                                <a href={`tel:${contact.phone}`} className="text-muted-foreground hover:text-foreground">
                                  <Phone className="w-4 h-4" />
                                </a>
                              )}
                              {contact.email && (
                                <a href={`mailto:${contact.email}`} className="text-muted-foreground hover:text-foreground">
                                  <Mail className="w-4 h-4" />
                                </a>
                              )}
                              {contact.whatsapp && (
                                <a 
                                  href={`https://wa.me/${contact.whatsapp.replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-green-600 hover:text-green-700"
                                >
                                  <MessageCircle className="w-4 h-4" />
                                </a>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600"
                                onClick={() => handleDeleteContact(contact.contact_id)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))
        )}
      </div>

      {/* Create Company Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEs ? "Nueva Empresa" : "New Company"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>{isEs ? "Nombre de la Empresa" : "Company Name"} *</Label>
                <Input
                  value={companyForm.name}
                  onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <Label>{isEs ? "Industria" : "Industry"}</Label>
                <Select value={companyForm.industry} onValueChange={(v) => setCompanyForm({ ...companyForm, industry: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map(ind => (
                      <SelectItem key={ind.value} value={ind.value}>
                        {isEs ? ind.labelEs : ind.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>RNC</Label>
                <Input
                  value={companyForm.rnc}
                  onChange={(e) => setCompanyForm({ ...companyForm, rnc: e.target.value })}
                  placeholder="000-00000-0"
                />
              </div>
              <div>
                <Label>{isEs ? "Teléfono" : "Phone"}</Label>
                <Input
                  value={companyForm.phone}
                  onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                  placeholder="+1 809 000 0000"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={companyForm.email}
                  onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                  placeholder="info@empresa.com"
                />
              </div>
              <div>
                <Label>Website</Label>
                <Input
                  value={companyForm.website}
                  onChange={(e) => setCompanyForm({ ...companyForm, website: e.target.value })}
                  placeholder="https://empresa.com"
                />
              </div>
              <div>
                <Label>{isEs ? "Ciudad" : "City"}</Label>
                <Input
                  value={companyForm.city}
                  onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })}
                  placeholder="Santo Domingo"
                />
              </div>
              <div className="col-span-2">
                <Label>{isEs ? "Dirección" : "Address"}</Label>
                <Input
                  value={companyForm.address}
                  onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                  placeholder={isEs ? "Calle Principal #123" : "123 Main Street"}
                />
              </div>
              <div className="col-span-2">
                <Label>{isEs ? "Notas" : "Notes"}</Label>
                <Textarea
                  value={companyForm.notes}
                  onChange={(e) => setCompanyForm({ ...companyForm, notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreateCompany}>
              {isEs ? "Crear Empresa" : "Create Company"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Company Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEs ? "Editar Empresa" : "Edit Company"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>{isEs ? "Nombre de la Empresa" : "Company Name"} *</Label>
                <Input
                  value={companyForm.name}
                  onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                />
              </div>
              <div>
                <Label>{isEs ? "Industria" : "Industry"}</Label>
                <Select value={companyForm.industry} onValueChange={(v) => setCompanyForm({ ...companyForm, industry: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map(ind => (
                      <SelectItem key={ind.value} value={ind.value}>
                        {isEs ? ind.labelEs : ind.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>RNC</Label>
                <Input
                  value={companyForm.rnc}
                  onChange={(e) => setCompanyForm({ ...companyForm, rnc: e.target.value })}
                />
              </div>
              <div>
                <Label>{isEs ? "Teléfono" : "Phone"}</Label>
                <Input
                  value={companyForm.phone}
                  onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={companyForm.email}
                  onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Website</Label>
                <Input
                  value={companyForm.website}
                  onChange={(e) => setCompanyForm({ ...companyForm, website: e.target.value })}
                />
              </div>
              <div>
                <Label>{isEs ? "Ciudad" : "City"}</Label>
                <Input
                  value={companyForm.city}
                  onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label>{isEs ? "Dirección" : "Address"}</Label>
                <Input
                  value={companyForm.address}
                  onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label>{isEs ? "Notas" : "Notes"}</Label>
                <Textarea
                  value={companyForm.notes}
                  onChange={(e) => setCompanyForm({ ...companyForm, notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleUpdateCompany}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Contact Dialog */}
      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEs ? "Agregar Contacto" : "Add Contact"}</DialogTitle>
            <DialogDescription>
              {selectedCompany?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"} *</Label>
              <Input
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                placeholder="Juan Pérez"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Cargo" : "Role/Title"}</Label>
                <Input
                  value={contactForm.role_title}
                  onChange={(e) => setContactForm({ ...contactForm, role_title: e.target.value })}
                  placeholder={isEs ? "Director Comercial" : "Sales Director"}
                />
              </div>
              <div>
                <Label>{isEs ? "Departamento" : "Department"}</Label>
                <Input
                  value={contactForm.department}
                  onChange={(e) => setContactForm({ ...contactForm, department: e.target.value })}
                  placeholder={isEs ? "Ventas" : "Sales"}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  placeholder="juan@empresa.com"
                />
              </div>
              <div>
                <Label>{isEs ? "Teléfono" : "Phone"}</Label>
                <Input
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                  placeholder="+1 809 000 0000"
                />
              </div>
            </div>
            <div>
              <Label>WhatsApp</Label>
              <Input
                value={contactForm.whatsapp}
                onChange={(e) => setContactForm({ ...contactForm, whatsapp: e.target.value })}
                placeholder="+1 809 000 0000"
              />
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={contactForm.is_primary}
                  onChange={(e) => setContactForm({ ...contactForm, is_primary: e.target.checked })}
                />
                {isEs ? "Contacto Principal" : "Primary Contact"}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={contactForm.is_decision_maker}
                  onChange={(e) => setContactForm({ ...contactForm, is_decision_maker: e.target.checked })}
                />
                {isEs ? "Toma Decisiones" : "Decision Maker"}
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleAddContact}>
              {isEs ? "Agregar" : "Add"}
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
              {isEs ? "Eliminar Empresa" : "Delete Company"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-800 dark:text-red-200">
                {isEs 
                  ? `¿Estás seguro de eliminar "${selectedCompany?.name}"?`
                  : `Are you sure you want to delete "${selectedCompany?.name}"?`
                }
              </p>
              {(selectedCompany?.contacts_count || 0) > 0 && (
                <p className="text-xs text-red-600 dark:text-red-300 mt-2">
                  {isEs 
                    ? `Esta empresa tiene ${selectedCompany?.contacts_count} contactos. Debes eliminarlos primero.`
                    : `This company has ${selectedCompany?.contacts_count} contacts. You must remove them first.`
                  }
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteCompany}
              disabled={(selectedCompany?.contacts_count || 0) > 0}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {isEs ? "Eliminar" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
