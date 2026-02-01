import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { 
  Search, Phone, Mail, Building2, RefreshCw, User, Calendar, 
  DollarSign, Eye, TrendingUp
} from "lucide-react";
import CommsLogSection from "./CommsLogSection";

const API = process.env.REACT_APP_BACKEND_URL;

export default function ClientsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchClients = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/crm/clients-with-events`, { withCredentials: true });
      setClients(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const filteredClients = clients.filter(client => 
    client.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const viewClient = (client) => {
    setSelectedClient(client);
    setDetailOpen(true);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount || 0);
  };

  // Calculate totals
  const totalLifetimeValue = clients.reduce((sum, c) => sum + (c.lifetime_value || 0), 0);
  const totalEvents = clients.reduce((sum, c) => sum + (c.events_count || 0), 0);

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="clients-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{isEs ? "Clientes" : "Clients"}</h2>
          <p className="text-muted-foreground text-sm">
            {isEs ? "Clientes con historial de eventos" : "Clients with event history"}
          </p>
        </div>
        <Button variant="outline" onClick={fetchClients}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {isEs ? "Actualizar" : "Refresh"}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={isEs ? "Buscar clientes..." : "Search clients..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <User className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm">{isEs ? "Total Clientes" : "Total Clients"}</span>
            </div>
            <div className="text-3xl font-bold">{clients.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm">{isEs ? "Total Eventos" : "Total Events"}</span>
            </div>
            <div className="text-3xl font-bold">{totalEvents}</div>
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

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Cliente" : "Client"}</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>{isEs ? "Teléfono" : "Phone"}</TableHead>
                <TableHead>{isEs ? "Eventos" : "Events"}</TableHead>
                <TableHead>{isEs ? "Último Evento" : "Last Event"}</TableHead>
                <TableHead>{isEs ? "Valor Lifetime" : "Lifetime Value"}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay clientes" : "No clients"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredClients.map((client) => (
                  <TableRow key={client.client_id} className="cursor-pointer hover:bg-muted/50" onClick={() => viewClient(client)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {client.client_type === "Company" ? (
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <User className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{client.display_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {client.email && (
                        <span className="flex items-center gap-1 text-sm">
                          <Mail className="w-3 h-3" />
                          {client.email}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {client.phone && (
                        <span className="flex items-center gap-1 text-sm">
                          <Phone className="w-3 h-3" />
                          {client.phone}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{client.events_count || 0}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {client.last_event_date 
                        ? new Date(client.last_event_date).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell className="font-medium text-green-600">
                      {formatCurrency(client.lifetime_value)}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon">
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedClient?.client_type === "Company" ? (
                <Building2 className="w-5 h-5" />
              ) : (
                <User className="w-5 h-5" />
              )}
              {selectedClient?.display_name}
            </DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <div className="space-y-6">
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
                  <p className="text-sm text-muted-foreground">{isEs ? "Dirección" : "Address"}</p>
                  <p className="font-medium">{selectedClient.address || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{isEs ? "Fuente" : "Source"}</p>
                  <Badge variant="outline">{selectedClient.source}</Badge>
                </div>
              </div>

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

              {/* Event History (Read-Only) */}
              {selectedClient.events && selectedClient.events.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {isEs ? "Historial de Eventos" : "Event History"}
                  </h4>
                  <div className="space-y-2">
                    {selectedClient.events.map((event) => (
                      <Card key={event.event_id}>
                        <CardContent className="py-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{event.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {event.event_date ? new Date(event.event_date).toLocaleDateString() : "TBD"}
                              </p>
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
                </div>
              )}

              {/* Comms Log */}
              <div className="border-t pt-4">
                <CommsLogSection 
                  entityType="client" 
                  entityId={selectedClient.client_id}
                  entityName={selectedClient.display_name}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
