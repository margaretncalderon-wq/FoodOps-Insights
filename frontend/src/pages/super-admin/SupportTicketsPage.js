// pages/super-admin/SupportTicketsPage.js - Admin view for support tickets
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { API_BASE as API } from "../../utils/api";

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import { ScrollArea } from "../../components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { toast } from "sonner";

// Icons
import {
  Bug, Lightbulb, HelpCircle, FileText, RefreshCw,
  Search, Filter, Eye, CheckCircle2, Clock, AlertCircle,
  Inbox, User, Building2, Calendar, ExternalLink, Trash2
} from "lucide-react";

// Type icons
const typeIcons = {
  bug: Bug,
  feature: Lightbulb,
  question: HelpCircle,
  other: FileText
};

// Status colors
const statusColors = {
  open: "bg-blue-100 text-blue-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-800"
};

// Priority colors
const priorityColors = {
  low: "bg-gray-100 text-gray-600",
  normal: "bg-blue-100 text-blue-600",
  high: "bg-orange-100 text-orange-600",
  urgent: "bg-red-100 text-red-600"
};

export default function SupportTicketsPage() {
  const { language } = useLanguage();
  const isEs = language === "es";

  // State
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  
  // Filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Resolution form
  const [resolutionNotes, setResolutionNotes] = useState("");

  // Fetch data
  const fetchTickets = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.append("status", filterStatus);
      if (filterPriority !== "all") params.append("priority", filterPriority);
      if (filterType !== "all") params.append("type", filterType);
      
      const res = await axios.get(`${API}/api/support/admin/tickets?${params}`, { withCredentials: true });
      setTickets(res.data.tickets || []);
    } catch (error) {
      console.error("Error fetching tickets:", error);
      toast.error("Error loading tickets");
    }
  }, [filterStatus, filterPriority, filterType]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/support/admin/tickets/stats`, { withCredentials: true });
      setStats(res.data);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchTickets(), fetchStats()]);
      setLoading(false);
    };
    loadData();
  }, [fetchTickets, fetchStats]);

  // Update ticket
  const handleUpdateTicket = async (ticketId, updates) => {
    try {
      await axios.patch(
        `${API}/api/support/admin/tickets/${ticketId}`,
        updates,
        { withCredentials: true }
      );
      toast.success(isEs ? "Ticket actualizado" : "Ticket updated");
      fetchTickets();
      fetchStats();
      if (selectedTicket?.ticket_id === ticketId) {
        setSelectedTicket({ ...selectedTicket, ...updates });
      }
    } catch (error) {
      console.error("Error updating ticket:", error);
      toast.error(isEs ? "Error al actualizar" : "Error updating");
    }
  };

  // Delete ticket
  const handleDelete = async (ticketId) => {
    if (!window.confirm(isEs ? "¿Eliminar este ticket?" : "Delete this ticket?")) return;
    try {
      await axios.delete(`${API}/api/support/admin/tickets/${ticketId}`, { withCredentials: true });
      toast.success(isEs ? "Ticket eliminado" : "Ticket deleted");
      fetchTickets();
      fetchStats();
      setDetailOpen(false);
    } catch (error) {
      console.error("Error deleting ticket:", error);
    }
  };

  // Open detail
  const openDetail = (ticket) => {
    setSelectedTicket(ticket);
    setResolutionNotes(ticket.resolution_notes || "");
    setDetailOpen(true);
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString(isEs ? "es-ES" : "en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // Filter tickets by search
  const filteredTickets = tickets.filter(t => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      t.ticket_id.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      (t.user_email || "").toLowerCase().includes(q) ||
      (t.user_name || "").toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="support-tickets-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{isEs ? "Tickets de Soporte" : "Support Tickets"}</h1>
        <p className="text-muted-foreground">
          {isEs ? "Gestiona reportes de bugs y solicitudes de usuarios" : "Manage bug reports and user requests"}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Inbox className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.open || 0}</p>
                <p className="text-xs text-muted-foreground">{isEs ? "Abiertos" : "Open"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-100">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.in_progress || 0}</p>
                <p className="text-xs text-muted-foreground">{isEs ? "En Progreso" : "In Progress"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{(stats.urgent_open || 0) + (stats.high_open || 0)}</p>
                <p className="text-xs text-muted-foreground">{isEs ? "Urgentes" : "Urgent"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.resolved || 0}</p>
                <p className="text-xs text-muted-foreground">{isEs ? "Resueltos" : "Resolved"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={isEs ? "Buscar por ID, asunto, usuario..." : "Search by ID, subject, user..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
                <SelectItem value="open">{isEs ? "Abiertos" : "Open"}</SelectItem>
                <SelectItem value="in_progress">{isEs ? "En Progreso" : "In Progress"}</SelectItem>
                <SelectItem value="resolved">{isEs ? "Resueltos" : "Resolved"}</SelectItem>
                <SelectItem value="closed">{isEs ? "Cerrados" : "Closed"}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEs ? "Todas" : "All"}</SelectItem>
                <SelectItem value="urgent">{isEs ? "Urgente" : "Urgent"}</SelectItem>
                <SelectItem value="high">{isEs ? "Alta" : "High"}</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">{isEs ? "Baja" : "Low"}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="feature">{isEs ? "Sugerencia" : "Feature"}</SelectItem>
                <SelectItem value="question">{isEs ? "Pregunta" : "Question"}</SelectItem>
                <SelectItem value="other">{isEs ? "Otro" : "Other"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tickets Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">ID</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead className="w-32">{isEs ? "Usuario" : "User"}</TableHead>
                <TableHead className="w-24">{isEs ? "Tipo" : "Type"}</TableHead>
                <TableHead className="w-24">{isEs ? "Prioridad" : "Priority"}</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-36">{isEs ? "Creado" : "Created"}</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay tickets" : "No tickets found"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTickets.map((ticket) => {
                  const TypeIcon = typeIcons[ticket.type] || FileText;
                  return (
                    <TableRow key={ticket.ticket_id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(ticket)}>
                      <TableCell className="font-mono text-xs">{ticket.ticket_id}</TableCell>
                      <TableCell className="font-medium">{ticket.subject}</TableCell>
                      <TableCell className="text-sm">{ticket.user_name || ticket.user_email}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <TypeIcon className="w-3 h-3" />
                          <span className="text-xs capitalize">{ticket.type}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${priorityColors[ticket.priority]}`}>
                          {ticket.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${statusColors[ticket.status]}`}>
                          {ticket.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(ticket.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Ticket Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          {selectedTicket && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="flex items-center gap-2">
                    <span className="font-mono text-sm text-muted-foreground">{selectedTicket.ticket_id}</span>
                    {selectedTicket.subject}
                  </DialogTitle>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(selectedTicket.ticket_id)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                {/* Meta info */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{isEs ? "Usuario" : "User"}</p>
                    <p className="font-medium">{selectedTicket.user_name || "-"}</p>
                    <p className="text-xs text-muted-foreground">{selectedTicket.user_email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{isEs ? "Tipo" : "Type"}</p>
                    <p className="font-medium capitalize">{selectedTicket.type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{isEs ? "Creado" : "Created"}</p>
                    <p className="font-medium">{formatDate(selectedTicket.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">URL</p>
                    {selectedTicket.page_url ? (
                      <a href={selectedTicket.page_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" />
                        {isEs ? "Ver página" : "View page"}
                      </a>
                    ) : "-"}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{isEs ? "Descripción" : "Description"}</p>
                  <div className="p-3 bg-muted/30 rounded-lg text-sm whitespace-pre-wrap">
                    {selectedTicket.description}
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select 
                      value={selectedTicket.status} 
                      onValueChange={(v) => handleUpdateTicket(selectedTicket.ticket_id, { status: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">{isEs ? "Abierto" : "Open"}</SelectItem>
                        <SelectItem value="in_progress">{isEs ? "En Progreso" : "In Progress"}</SelectItem>
                        <SelectItem value="resolved">{isEs ? "Resuelto" : "Resolved"}</SelectItem>
                        <SelectItem value="closed">{isEs ? "Cerrado" : "Closed"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">{isEs ? "Prioridad" : "Priority"}</Label>
                    <Select 
                      value={selectedTicket.priority} 
                      onValueChange={(v) => handleUpdateTicket(selectedTicket.ticket_id, { priority: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">{isEs ? "Baja" : "Low"}</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">{isEs ? "Alta" : "High"}</SelectItem>
                        <SelectItem value="urgent">{isEs ? "Urgente" : "Urgent"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Resolution notes */}
                <div>
                  <Label className="text-xs">{isEs ? "Notas de Resolución" : "Resolution Notes"}</Label>
                  <Textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder={isEs ? "Agrega notas sobre cómo se resolvió..." : "Add notes about how it was resolved..."}
                    rows={3}
                  />
                  <Button 
                    size="sm" 
                    className="mt-2"
                    onClick={() => handleUpdateTicket(selectedTicket.ticket_id, { resolution_notes: resolutionNotes })}
                  >
                    {isEs ? "Guardar Notas" : "Save Notes"}
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailOpen(false)}>
                  {isEs ? "Cerrar" : "Close"}
                </Button>
                {selectedTicket.status !== "resolved" && (
                  <Button onClick={() => handleUpdateTicket(selectedTicket.ticket_id, { status: "resolved", resolution_notes: resolutionNotes })}>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {isEs ? "Marcar Resuelto" : "Mark Resolved"}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
