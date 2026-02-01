import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { 
  Plus, Search, Phone, Mail, Building2, RefreshCw,
  MessageSquare, User, Calendar, MoreHorizontal, CheckCircle
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";

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
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    lead_name: "",
    email: "",
    phone: "",
    company_name: "",
    message: ""
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

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/api/crm/outreach`, {
        ...form,
        event_type: "other",
        lead_type: "outreach"
      }, { withCredentials: true });
      toast.success(isEs ? "Lead de outreach creado" : "Outreach lead created");
      fetchLeads();
      setDialogOpen(false);
      setForm({ lead_name: "", email: "", phone: "", company_name: "", message: "" });
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

  const filteredLeads = leads.filter(lead => 
    lead.lead_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={isEs ? "Buscar leads..." : "Search leads..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {OUTREACH_STATUSES.map(status => {
          const count = leads.filter(l => l.outreach_status === status.value).length;
          return (
            <Card key={status.value}>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{count}</div>
                <p className="text-sm text-muted-foreground">{isEs ? status.labelEs : status.labelEn}</p>
              </CardContent>
            </Card>
          );
        })}
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
                <TableHead>{isEs ? "Último Contacto" : "Last Contact"}</TableHead>
                <TableHead></TableHead>
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
                  <TableRow key={lead.lead_id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        {lead.lead_name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {lead.email && (
                        <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                          <Mail className="w-3 h-3" />
                          {lead.email}
                        </a>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {lead.phone}
                        </a>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.company_name && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {lead.company_name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(lead.outreach_status || "New")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.last_contact_date 
                        ? new Date(lead.last_contact_date).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell>
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
                        </DropdownMenuContent>
                      </DropdownMenu>
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
            <div>
              <Label>{isEs ? "Empresa" : "Company"}</Label>
              <Input
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              />
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
    </div>
  );
}
