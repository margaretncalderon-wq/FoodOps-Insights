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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { 
  Search, Phone, Mail, Building2, RefreshCw, User, Calendar, 
  Globe, Instagram, MessageSquare, UserPlus, Eye, ArrowRight,
  Clock, Star, CalendarPlus, UserCheck
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

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
  const isEs = language === "es";
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedLead, setSelectedLead] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpForm, setFollowUpForm] = useState({
    next_follow_up_date: "",
    follow_up_type: "Call"
  });

  const fetchLeads = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/crm/inbound`, { withCredentials: true });
      setLeads(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Filter leads
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.lead_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         lead.company_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Stats
  const newLeads = leads.filter(l => l.status === "New").length;
  const contactedLeads = leads.filter(l => l.status === "Contacted").length;
  const convertedLeads = leads.filter(l => l.status === "Converted").length;

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
      // Convert lead to client
      const clientRes = await axios.post(`${API}/api/leads/${selectedLead.lead_id}/convert`, {
        create_event: createEvent
      }, { withCredentials: true });
      
      toast.success(isEs ? "Lead convertido exitosamente" : "Lead converted successfully");
      setConvertOpen(false);
      fetchLeads();
      
      // Navigate to the new event if created
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

  // Check if lead is new (created in last 24 hours)
  const isNewLead = (lead) => {
    if (!lead.created_at) return false;
    const created = new Date(lead.created_at);
    const now = new Date();
    const diff = now - created;
    return diff < 24 * 60 * 60 * 1000; // 24 hours
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="lead-inbound-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{isEs ? "Leads Inbound" : "Inbound Leads"}</h2>
          <p className="text-muted-foreground text-sm">
            {isEs ? "Contactos recibidos vía formularios, email y redes" : "Contacts received via forms, email and social"}
          </p>
        </div>
        <Button variant="outline" onClick={fetchLeads}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {isEs ? "Actualizar" : "Refresh"}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={newLeads > 0 ? "border-blue-300 bg-blue-50" : ""}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Star className={`w-5 h-5 ${newLeads > 0 ? "text-blue-600" : "text-muted-foreground"}`} />
              <span className="text-sm">{isEs ? "Nuevos" : "New"}</span>
            </div>
            <div className="text-3xl font-bold">{newLeads}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Phone className="w-5 h-5 text-yellow-600" />
              <span className="text-sm">{isEs ? "Contactados" : "Contacted"}</span>
            </div>
            <div className="text-3xl font-bold">{contactedLeads}</div>
          </CardContent>
        </Card>
        <Card>
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
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Fuente" : "Source"}</TableHead>
                <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>{isEs ? "Tipo Evento" : "Event Type"}</TableHead>
                <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                <TableHead>{isEs ? "Seguimiento" : "Follow-up"}</TableHead>
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
                    <TableCell className="text-sm">{lead.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{lead.event_type}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(lead.status)}</TableCell>
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
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => viewLead(lead)} title={isEs ? "Ver" : "View"}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openFollowUp(lead)} title={isEs ? "Seguimiento" : "Follow-up"}>
                          <CalendarPlus className="w-4 h-4" />
                        </Button>
                        {lead.status !== "Converted" && (
                          <Button variant="ghost" size="icon" onClick={() => openConvert(lead)} title={isEs ? "Convertir" : "Convert"}>
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

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedLead?.lead_name}
              {selectedLead && isNewLead(selectedLead) && (
                <Badge className="bg-blue-500 text-white">NEW</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Fuente" : "Source"}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {getSourceIcon(selectedLead.source)}
                    <span>{selectedLead.source}</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Estado" : "Status"}</p>
                  <div className="mt-1">{getStatusBadge(selectedLead.status)}</div>
                </div>
              </div>
              
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

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Tipo de Evento" : "Event Type"}</p>
                  <p className="font-medium">{selectedLead.event_type}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Fecha Evento" : "Event Date"}</p>
                  <p className="font-medium">{selectedLead.event_date || "TBD"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Invitados" : "Guests"}</p>
                  <p className="font-medium">{selectedLead.estimated_guest_count || "-"}</p>
                </div>
              </div>

              {selectedLead.message && (
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Mensaje" : "Message"}</p>
                  <p className="mt-1 p-3 bg-muted rounded-md text-sm">{selectedLead.message}</p>
                </div>
              )}

              {/* Follow-up info */}
              {selectedLead.next_follow_up_date && (
                <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-sm font-medium text-yellow-800 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {isEs ? "Seguimiento programado" : "Follow-up scheduled"}
                  </p>
                  <p className="text-sm text-yellow-700 mt-1">
                    {selectedLead.follow_up_type} - {new Date(selectedLead.next_follow_up_date).toLocaleDateString()}
                  </p>
                </div>
              )}

              <div className="pt-4 border-t flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                  {isEs ? "Recibido" : "Received"}: {new Date(selectedLead.created_at).toLocaleString()}
                </div>
                {selectedLead.status !== "Converted" && (
                  <Button onClick={() => { setDetailOpen(false); openConvert(selectedLead); }}>
                    <ArrowRight className="w-4 h-4 mr-2" />
                    {isEs ? "Convertir" : "Convert"}
                  </Button>
                )}
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
