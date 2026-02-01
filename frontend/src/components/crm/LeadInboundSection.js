import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { 
  Search, Phone, Mail, Building2, RefreshCw, User, Calendar, 
  Globe, Instagram, MessageSquare, UserPlus, Eye
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

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

export default function LeadInboundSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLead, setSelectedLead] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

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

  const filteredLeads = leads.filter(lead => 
    lead.lead_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSourceIcon = (source) => {
    const Icon = SOURCE_ICONS[source] || SOURCE_ICONS.Other;
    return <Icon className="w-4 h-4" />;
  };

  const getStatusBadge = (status) => {
    const colors = {
      New: "bg-blue-100 text-blue-700",
      Contacted: "bg-yellow-100 text-yellow-700",
      Converted: "bg-green-100 text-green-700",
      Discarded: "bg-gray-100 text-gray-700"
    };
    return <Badge className={colors[status] || colors.New}>{status}</Badge>;
  };

  const viewLead = (lead) => {
    setSelectedLead(lead);
    setDetailOpen(true);
  };

  // Group by source
  const groupedBySource = leads.reduce((acc, lead) => {
    const source = lead.source || "Other";
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});

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

      {/* Stats by Source */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(groupedBySource).map(([source, count]) => (
          <Card key={source}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                {getSourceIcon(source)}
                <span className="text-sm font-medium">{source}</span>
              </div>
              <div className="text-2xl font-bold">{count}</div>
            </CardContent>
          </Card>
        ))}
        {Object.keys(groupedBySource).length === 0 && (
          <Card>
            <CardContent className="pt-4 text-center text-muted-foreground">
              {isEs ? "Sin leads" : "No leads"}
            </CardContent>
          </Card>
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
                <TableHead>Email</TableHead>
                <TableHead>{isEs ? "Teléfono" : "Phone"}</TableHead>
                <TableHead>{isEs ? "Tipo Evento" : "Event Type"}</TableHead>
                <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                <TableHead>{isEs ? "Recibido" : "Received"}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay leads inbound" : "No inbound leads"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => (
                  <TableRow key={lead.lead_id} className="cursor-pointer hover:bg-muted/50" onClick={() => viewLead(lead)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getSourceIcon(lead.source)}
                        <span className="text-sm">{lead.source}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{lead.lead_name}</TableCell>
                    <TableCell>
                      {lead.email && (
                        <span className="flex items-center gap-1 text-sm">
                          <Mail className="w-3 h-3" />
                          {lead.email}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.phone && (
                        <span className="flex items-center gap-1 text-sm">
                          <Phone className="w-3 h-3" />
                          {lead.phone}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{lead.event_type}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(lead.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.created_at 
                        ? new Date(lead.created_at).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); viewLead(lead); }}>
                        <Eye className="w-4 h-4" />
                      </Button>
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
            <DialogTitle>{selectedLead?.lead_name}</DialogTitle>
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Tipo de Evento" : "Event Type"}</p>
                  <p className="font-medium">{selectedLead.event_type}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Fecha Evento" : "Event Date"}</p>
                  <p className="font-medium">{selectedLead.event_date || "TBD"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Invitados Est." : "Est. Guests"}</p>
                  <p className="font-medium">{selectedLead.estimated_guest_count || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Presupuesto" : "Budget"}</p>
                  <p className="font-medium">{selectedLead.budget_range || "-"}</p>
                </div>
              </div>

              {selectedLead.message && (
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Mensaje" : "Message"}</p>
                  <p className="mt-1 p-3 bg-muted rounded-md text-sm">{selectedLead.message}</p>
                </div>
              )}

              <div className="pt-4 border-t text-sm text-muted-foreground">
                <p>{isEs ? "Recibido" : "Received"}: {new Date(selectedLead.created_at).toLocaleString()}</p>
                {selectedLead.form_name && <p>{isEs ? "Formulario" : "Form"}: {selectedLead.form_name}</p>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
