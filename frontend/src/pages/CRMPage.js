import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
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
import { Plus, Search, User, Mail, Phone, Building2, MoreHorizontal, Trash2, Edit, UserPlus, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PIPELINE_STAGES = ["lead", "contacted", "proposal", "negotiation", "won", "lost"];
const CLIENT_SOURCES = ["direct", "corporate", "planner", "referral", "social_media", "website"];

export default function CRMPage() {
  const { t, language } = useLanguage();
  const [clients, setClients] = useState([]);
  const [pipeline, setPipeline] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [formData, setFormData] = useState({
    client_type: "direct",
    name: "",
    email: "",
    phone: "",
    company_name: "",
    rnc: "",
    contacts: [],
    address: "",
    notes: "",
    pipeline_stage: "lead",
    client_source: "direct",
    tags: [],
  });

  useEffect(() => {
    fetchClients();
    fetchPipeline();
  }, []);

  const fetchClients = async () => {
    try {
      const response = await axios.get(`${API}/crm/clients`, { withCredentials: true });
      setClients(response.data);
    } catch (error) {
      console.error("Failed to fetch clients:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPipeline = async () => {
    try {
      const response = await axios.get(`${API}/crm/pipeline`, { withCredentials: true });
      setPipeline(response.data);
    } catch (error) {
      console.error("Failed to fetch pipeline:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const submitData = { ...formData };
      // For corporate clients, use company_name as the display name
      if (formData.client_type === "corporate" && formData.company_name) {
        submitData.name = formData.company_name;
      }
      
      if (editingClient) {
        await axios.put(`${API}/crm/clients/${editingClient.client_id}`, submitData, {
          withCredentials: true,
        });
        toast.success(language === "es" ? "Cliente actualizado" : "Client updated");
      } else {
        await axios.post(`${API}/crm/clients`, submitData, { withCredentials: true });
        toast.success(language === "es" ? "Cliente creado" : "Client created");
      }
      fetchClients();
      fetchPipeline();
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      const detail = error.response?.data?.detail;
      // Handle validation errors array from Pydantic
      const errorMessage = Array.isArray(detail) 
        ? detail.map(e => e.msg || e.message).join(', ')
        : (typeof detail === 'string' ? detail : "Failed to save client");
      toast.error(errorMessage);
    }
  };

  const handleDelete = async (clientId) => {
    if (!confirm(language === "es" ? "¿Eliminar cliente?" : "Delete client?")) return;
    try {
      await axios.delete(`${API}/crm/clients/${clientId}`, { withCredentials: true });
      toast.success(language === "es" ? "Cliente eliminado" : "Client deleted");
      fetchClients();
      fetchPipeline();
    } catch (error) {
      toast.error("Failed to delete client");
    }
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setFormData({
      client_type: client.client_type || "direct",
      name: client.name,
      email: client.email || "",
      phone: client.phone || "",
      company_name: client.company_name || "",
      rnc: client.rnc || "",
      contacts: client.contacts || [],
      address: client.address || "",
      notes: client.notes || "",
      pipeline_stage: client.pipeline_stage,
      client_source: client.client_source || "direct",
      tags: client.tags || [],
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingClient(null);
    setFormData({
      client_type: "direct",
      name: "",
      email: "",
      phone: "",
      company_name: "",
      rnc: "",
      contacts: [],
      address: "",
      notes: "",
      pipeline_stage: "lead",
      client_source: "direct",
      tags: [],
    });
  };

  const addContact = () => {
    setFormData({
      ...formData,
      contacts: [...formData.contacts, { name: "", email: "", phone: "", role: "" }]
    });
  };

  const updateContact = (index, field, value) => {
    const newContacts = [...formData.contacts];
    newContacts[index] = { ...newContacts[index], [field]: value };
    setFormData({ ...formData, contacts: newContacts });
  };

  const removeContact = (index) => {
    setFormData({
      ...formData,
      contacts: formData.contacts.filter((_, i) => i !== index)
    });
  };

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.rnc?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stageColors = {
    lead: "bg-muted text-muted-foreground",
    contacted: "bg-info/10 text-info",
    proposal: "bg-warning/10 text-warning",
    negotiation: "bg-primary/10 text-primary",
    won: "bg-success/10 text-success",
    lost: "bg-destructive/10 text-destructive",
  };

  const sourceLabels = {
    direct: { en: "Direct", es: "Directo" },
    corporate: { en: "Corporate", es: "Corporativo" },
    planner: { en: "Planner", es: "Planificador" },
    referral: { en: "Referral", es: "Referido" },
    social_media: { en: "Social Media", es: "Redes Sociales" },
    website: { en: "Website", es: "Sitio Web" },
  };

  const getDisplayName = (client) => {
    if (client.client_type === "corporate") {
      return client.company_name || client.name;
    }
    return client.name;
  };

  const getSubtitle = (client) => {
    if (client.client_type === "corporate") {
      const primaryContact = client.contacts?.[0];
      if (primaryContact) {
        return `${primaryContact.name}${primaryContact.role ? ` (${primaryContact.role})` : ""}`;
      }
      return client.rnc ? `RNC: ${client.rnc}` : "";
    }
    return client.company_name || client.email || "";
  };

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
            <h1 className="font-heading text-3xl font-bold text-foreground">{t("crm")}</h1>
            <p className="text-muted-foreground mt-1">
              {clients.length} {language === "es" ? "clientes" : "clients"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              onClick={() => setViewMode("list")}
            >
              {language === "es" ? "Lista" : "List"}
            </Button>
            <Button
              variant={viewMode === "pipeline" ? "default" : "outline"}
              onClick={() => setViewMode("pipeline")}
            >
              Pipeline
            </Button>
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="rounded-full gap-2" data-testid="add-client-btn">
                  <Plus className="w-4 h-4" />
                  {t("addClient")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingClient 
                      ? (language === "es" ? "Editar Cliente" : "Edit Client")
                      : (language === "es" ? "Nuevo Cliente" : "New Client")}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Client Type Toggle */}
                  <div className="flex gap-2 p-1 bg-muted rounded-lg">
                    <Button
                      type="button"
                      variant={formData.client_type === "direct" ? "default" : "ghost"}
                      className="flex-1"
                      onClick={() => setFormData({ ...formData, client_type: "direct" })}
                    >
                      <User className="w-4 h-4 mr-2" />
                      {language === "es" ? "Cliente Directo" : "Direct Client"}
                    </Button>
                    <Button
                      type="button"
                      variant={formData.client_type === "corporate" ? "default" : "ghost"}
                      className="flex-1"
                      onClick={() => setFormData({ ...formData, client_type: "corporate" })}
                    >
                      <Building2 className="w-4 h-4 mr-2" />
                      {language === "es" ? "Cliente Corporativo" : "Corporate Client"}
                    </Button>
                  </div>

                  {formData.client_type === "corporate" ? (
                    /* Corporate Client Fields */
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <Label>{language === "es" ? "Nombre de Empresa" : "Company Name"} *</Label>
                          <Input
                            value={formData.company_name}
                            onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                            placeholder={language === "es" ? "Nombre de la empresa" : "Company name"}
                            required
                            data-testid="company-name-input"
                          />
                        </div>
                        <div>
                          <Label>RNC</Label>
                          <Input
                            value={formData.rnc}
                            onChange={(e) => setFormData({ ...formData, rnc: e.target.value })}
                            placeholder="000-00000-0"
                            data-testid="rnc-input"
                          />
                        </div>
                        <div>
                          <Label>{language === "es" ? "Dirección" : "Address"}</Label>
                          <Input
                            value={formData.address}
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          />
                        </div>
                      </div>

                      {/* Contact Persons */}
                      <div className="border rounded-lg p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-medium">
                            {language === "es" ? "Personas de Contacto" : "Contact Persons"}
                          </Label>
                          <Button type="button" variant="outline" size="sm" onClick={addContact}>
                            <UserPlus className="w-4 h-4 mr-1" />
                            {language === "es" ? "Agregar" : "Add"}
                          </Button>
                        </div>
                        
                        {formData.contacts.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            {language === "es" ? "No hay contactos. Agregue al menos uno." : "No contacts. Add at least one."}
                          </p>
                        )}

                        {formData.contacts.map((contact, index) => (
                          <div key={index} className="grid grid-cols-2 gap-3 p-3 bg-muted/50 rounded-lg relative">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground"
                              onClick={() => removeContact(index)}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                            <div>
                              <Label className="text-xs">{language === "es" ? "Nombre" : "Name"}</Label>
                              <Input
                                value={contact.name}
                                onChange={(e) => updateContact(index, "name", e.target.value)}
                                placeholder="Juan Pérez"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">{language === "es" ? "Cargo" : "Role"}</Label>
                              <Input
                                value={contact.role}
                                onChange={(e) => updateContact(index, "role", e.target.value)}
                                placeholder={language === "es" ? "Gerente de Eventos" : "Event Manager"}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Email</Label>
                              <Input
                                type="email"
                                value={contact.email}
                                onChange={(e) => updateContact(index, "email", e.target.value)}
                                placeholder="email@empresa.com"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">{language === "es" ? "Teléfono" : "Phone"}</Label>
                              <Input
                                value={contact.phone}
                                onChange={(e) => updateContact(index, "phone", e.target.value)}
                                placeholder="+1 809 000 0000"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    /* Direct Client Fields */
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>{language === "es" ? "Nombre del Contacto" : "Contact Name"} *</Label>
                        <Input
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder={language === "es" ? "Nombre completo" : "Full name"}
                          required
                          data-testid="client-name-input"
                        />
                      </div>
                      <div>
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          data-testid="client-email-input"
                        />
                      </div>
                      <div>
                        <Label>{language === "es" ? "Teléfono" : "Phone"}</Label>
                        <Input
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>{language === "es" ? "Dirección" : "Address"}</Label>
                        <Input
                          value={formData.address}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  {/* Common Fields */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>{language === "es" ? "Etapa" : "Stage"}</Label>
                      <Select
                        value={formData.pipeline_stage}
                        onValueChange={(v) => setFormData({ ...formData, pipeline_stage: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PIPELINE_STAGES.map((stage) => (
                            <SelectItem key={stage} value={stage}>
                              {t(stage)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{language === "es" ? "Fuente" : "Source"}</Label>
                      <Select
                        value={formData.client_source}
                        onValueChange={(v) => setFormData({ ...formData, client_source: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CLIENT_SOURCES.map((source) => (
                            <SelectItem key={source} value={source}>
                              {sourceLabels[source]?.[language] || source}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>{language === "es" ? "Notas" : "Notes"}</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={2}
                    />
                  </div>

                  <Button type="submit" className="w-full" data-testid="save-client-btn">
                    {t("save")}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder={language === "es" ? "Buscar clientes..." : "Search clients..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="search-clients-input"
          />
        </div>

        {/* Client List View */}
        {viewMode === "list" && (
          <div className="grid gap-4">
            {filteredClients.map((client) => (
              <Card key={client.client_id} className="hover:shadow-md transition-shadow" data-testid={`client-card-${client.client_id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      {client.client_type === "corporate" ? (
                        <Building2 className="w-5 h-5 text-secondary-foreground" />
                      ) : (
                        <span className="font-heading font-bold text-secondary-foreground">
                          {getDisplayName(client).charAt(0)}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/crm/${client.client_id}`}
                          className="font-heading font-semibold text-foreground hover:text-primary truncate"
                        >
                          {getDisplayName(client)}
                        </Link>
                        {client.client_type === "corporate" && (
                          <Badge variant="outline" className="text-xs">
                            {language === "es" ? "Corporativo" : "Corporate"}
                          </Badge>
                        )}
                        {client.rnc && (
                          <span className="text-xs text-muted-foreground">RNC: {client.rnc}</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {getSubtitle(client)}
                      </p>
                      {client.client_type === "corporate" && client.contacts?.length > 1 && (
                        <p className="text-xs text-muted-foreground">
                          +{client.contacts.length - 1} {language === "es" ? "contactos más" : "more contacts"}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={stageColors[client.pipeline_stage]}>
                        {t(client.pipeline_stage)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {sourceLabels[client.client_source]?.[language] || client.client_source}
                      </Badge>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(client)}>
                          <Edit className="w-4 h-4 mr-2" />
                          {t("edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(client.client_id)}
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
        )}

        {/* Pipeline View */}
        {viewMode === "pipeline" && (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {PIPELINE_STAGES.map((stage) => (
              <Card key={stage}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center justify-between">
                    {t(stage)}
                    <Badge variant="outline" className="ml-2">
                      {pipeline[stage]?.length || 0}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {pipeline[stage]?.map((client) => (
                    <Link
                      key={client.client_id}
                      to={`/crm/${client.client_id}`}
                      className="block p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <p className="font-medium text-sm truncate">{getDisplayName(client)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {getSubtitle(client)}
                      </p>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
