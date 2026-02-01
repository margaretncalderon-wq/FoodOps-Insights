import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { 
  Plus, Search, Phone, Mail, Building2, RefreshCw, User, 
  MoreHorizontal, CheckCircle, Eye, Clock, CalendarPlus,
  ArrowRight, UserCheck, Filter
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "../ui/dropdown-menu";

const API = process.env.REACT_APP_BACKEND_URL;

const OUTREACH_STATUSES = [
  { value: "New", labelEn: "New", labelEs: "Nuevo", color: "bg-blue-100 text-blue-700" },
  { value: "Contacted", labelEn: "Contacted", labelEs: "Contactado", color: "bg-yellow-100 text-yellow-700" },
  { value: "NoResponse", labelEn: "No Response", labelEs: "Sin Respuesta", color: "bg-gray-100 text-gray-700" },
  { value: "Engaged", labelEn: "Engaged", labelEs: "Interesado", color: "bg-green-100 text-green-700" }
];

export default function LeadOutreachSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [form, setForm] = useState({
    lead_name: "",
    email: "",
    phone: "",
    company_name: "",
    message: "",
    owner_id: ""
  });
  const [followUpForm, setFollowUpForm] = useState({
    next_follow_up_date: "",
    follow_up_type: "Call"
  });

  const fetchLeads = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/crm/outreach`, { withCredentials: true });
      setLeads(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      // Get unique owners from existing data
      const ownerIds = new Set();
      leads.forEach(l => l.owner_id && ownerIds.add(l.owner_id));
      setUsers(Array.from(ownerIds).map(id => ({ user_id: id, name: id.replace("user_", "User ") })));
    } catch (err) {
      console.error(err);
    }
  }, [leads]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);
  useEffect(() => { fetchUsers(); }, [leads, fetchUsers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        event_type: "other",
        lead_type: "outreach"
      };
      // Handle owner assignment during creation
      if (form.owner_id) {
        payload.owner_id = form.owner_id;
      }
      
      const res = await axios.post(`${API}/api/crm/outreach`, payload, { withCredentials: true });
      
      // If owner was assigned, update it
      if (form.owner_id && res.data.lead_id) {
        await axios.put(`${API}/api/crm/assign/lead/${res.data.lead_id}?owner_id=${form.owner_id}`, {}, { withCredentials: true });
      }
      
      toast.success(isEs ? "Lead de outreach creado" : "Outreach lead created");
      fetchLeads();
      setDialogOpen(false);
      setForm({ lead_name: "", email: "", phone: "", company_name: "", message: "", owner_id: "" });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
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
        navigate(`/clients/${clientRes.data.client_id}`);
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

  const openConvert = (lead) => {
    setSelectedLead(lead);
    setConvertOpen(true);
  };

  // Filter leads
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.lead_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         lead.company_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || lead.outreach_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status) => {
    const s = OUTREACH_STATUSES.find(st => st.value === status) || OUTREACH_STATUSES[0];
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
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          {isEs ? "Nuevo Outreach" : "New Outreach"}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {OUTREACH_STATUSES.map(status => {
          const count = leads.filter(l => l.outreach_status === status.value).length;
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
                <TableHead>Email</TableHead>
                <TableHead>{isEs ? "Teléfono" : "Phone"}</TableHead>
                <TableHead>{isEs ? "Empresa" : "Company"}</TableHead>
                <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                <TableHead>{isEs ? "Seguimiento" : "Follow-up"}</TableHead>
                <TableHead>{isEs ? "Owner" : "Owner"}</TableHead>
                <TableHead>{isEs ? "Acciones" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay leads de outreach" : "No outreach leads"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => (
                  <TableRow key={lead.lead_id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        {lead.lead_name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {lead.email && (
                        <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-blue-600 hover:underline text-sm">
                          <Mail className="w-3 h-3" />
                          {lead.email}
                        </a>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-sm">
                          <Phone className="w-3 h-3" />
                          {lead.phone}
                        </a>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.company_name && (
                        <span className="flex items-center gap-1 text-sm">
                          <Building2 className="w-3 h-3" />
                          {lead.company_name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(lead.outreach_status || "New")}</TableCell>
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
                          {lead.owner_id.replace("user_", "").slice(0, 8)}
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

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Nuevo Lead de Outreach" : "New Outreach Lead"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"} *</Label>
              <Input
                value={form.lead_name}
                onChange={(e) => setForm({ ...form, lead_name: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
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
              <Label>{isEs ? "Empresa" : "Company"}</Label>
              <Input
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              />
            </div>
            <div>
              <Label>{isEs ? "Asignar a" : "Assign to"}</Label>
              <Select value={form.owner_id} onValueChange={(v) => setForm({ ...form, owner_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar owner" : "Select owner"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{isEs ? "Sin asignar" : "Unassigned"}</SelectItem>
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
              <Button type="submit">{isEs ? "Crear" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedLead?.lead_name}
              {selectedLead && getStatusBadge(selectedLead.outreach_status || "New")}
            </DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedLead.email || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Teléfono" : "Phone"}</p>
                  <p className="font-medium">{selectedLead.phone || "-"}</p>
                </div>
              </div>

              {selectedLead.company_name && (
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Empresa" : "Company"}</p>
                  <p className="font-medium flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    {selectedLead.company_name}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Último Contacto" : "Last Contact"}</p>
                  <p className="font-medium">
                    {selectedLead.last_contact_date 
                      ? new Date(selectedLead.last_contact_date).toLocaleDateString()
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Owner</p>
                  <p className="font-medium">
                    {selectedLead.owner_id 
                      ? selectedLead.owner_id.replace("user_", "").slice(0, 8)
                      : (isEs ? "Sin asignar" : "Unassigned")}
                  </p>
                </div>
              </div>

              {selectedLead.message && (
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Notas" : "Notes"}</p>
                  <p className="mt-1 p-3 bg-muted rounded-md text-sm">{selectedLead.message}</p>
                </div>
              )}

              {/* Follow-up info */}
              {selectedLead.next_follow_up_date ? (
                <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-sm font-medium text-yellow-800 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {isEs ? "Seguimiento programado" : "Follow-up scheduled"}
                  </p>
                  <p className="text-sm text-yellow-700 mt-1">
                    {selectedLead.follow_up_type} - {new Date(selectedLead.next_follow_up_date).toLocaleDateString()}
                  </p>
                </div>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => { setDetailOpen(false); openFollowUp(selectedLead); }}>
                  <CalendarPlus className="w-4 h-4 mr-2" />
                  {isEs ? "Programar Seguimiento" : "Schedule Follow-up"}
                </Button>
              )}

              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-3">
                  {isEs ? "Creado" : "Created"}: {new Date(selectedLead.created_at).toLocaleString()}
                </p>
                <Button className="w-full" onClick={() => openConvert(selectedLead)}>
                  <ArrowRight className="w-4 h-4 mr-2" />
                  {isEs ? "Convertir a Cliente" : "Convert to Client"}
                </Button>
              </div>
            </div>
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
            <div className="grid grid-cols-2 gap-4">
              <Card 
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleConvert(true)}
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
