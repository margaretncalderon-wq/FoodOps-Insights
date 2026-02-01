import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
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
  DollarSign, Eye, TrendingUp, Edit, Plus, Trash2, UserPlus
} from "lucide-react";
import CommsLogSection from "./CommsLogSection";

const API = process.env.REACT_APP_BACKEND_URL;

const CLIENT_SOURCES = ["Website", "Instagram", "QR", "Referral", "Direct", "Other"];

export default function ClientsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    display_name: "",
    email: "",
    phone: "",
    address: "",
    client_type: "Individual",
    source: "Direct",
    notes: "",
    tags: []
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

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const filteredClients = clients.filter(client => 
    client.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      address: client.address || "",
      client_type: client.client_type || "Individual",
      source: client.source || "Direct",
      notes: client.notes || "",
      tags: client.tags || []
    });
    setEditOpen(true);
  };

  const openCreate = () => {
    setEditForm({
      display_name: "",
      email: "",
      phone: "",
      address: "",
      client_type: "Individual",
      source: "Direct",
      notes: "",
      tags: []
    });
    setCreateOpen(true);
  };

  const handleSave = async () => {
    try {
      await axios.put(`${API}/api/crm/clients/${selectedClient.client_id}`, editForm, { withCredentials: true });
      toast.success(isEs ? "Cliente actualizado" : "Client updated");
      setEditOpen(false);
      fetchClients();
      // Update selectedClient if detail view is open
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
      toast.success(isEs ? "Cliente creado" : "Client created");
      setCreateOpen(false);
      fetchClients();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API}/api/crm/clients/${selectedClient.client_id}`, { withCredentials: true });
      toast.success(isEs ? "Cliente eliminado" : "Client deleted");
      setDeleteConfirmOpen(false);
      setDetailOpen(false);
      setEditOpen(false);
      fetchClients();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount || 0);
  };

  // Calculate totals
  const totalLifetimeValue = clients.reduce((sum, c) => sum + (c.lifetime_value || 0), 0);
  const totalEvents = clients.reduce((sum, c) => sum + (c.events_count || 0), 0);

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  // Reusable form component
  const ClientForm = ({ isCreate = false }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>{isEs ? "Nombre" : "Name"} *</Label>
          <Input
            value={editForm.display_name}
            onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
            placeholder={isEs ? "Nombre del cliente" : "Client name"}
            data-testid="client-name-input"
          />
        </div>
        <div>
          <Label>{isEs ? "Tipo" : "Type"}</Label>
          <Select value={editForm.client_type} onValueChange={(v) => setEditForm({ ...editForm, client_type: v })}>
            <SelectTrigger data-testid="client-type-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Individual">{isEs ? "Individual" : "Individual"}</SelectItem>
              <SelectItem value="Company">{isEs ? "Empresa" : "Company"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{isEs ? "Fuente" : "Source"}</Label>
          <Select value={editForm.source} onValueChange={(v) => setEditForm({ ...editForm, source: v })}>
            <SelectTrigger data-testid="client-source-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIENT_SOURCES.map(src => (
                <SelectItem key={src} value={src}>{src}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Email</Label>
          <Input
            type="email"
            value={editForm.email}
            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            placeholder="email@example.com"
            data-testid="client-email-input"
          />
        </div>
        <div>
          <Label>{isEs ? "Teléfono" : "Phone"}</Label>
          <Input
            value={editForm.phone}
            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
            placeholder="+52 555 123 4567"
            data-testid="client-phone-input"
          />
        </div>
      </div>
      <div>
        <Label>{isEs ? "Dirección" : "Address"}</Label>
        <Input
          value={editForm.address}
          onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
          placeholder={isEs ? "Calle, Ciudad, Estado" : "Street, City, State"}
          data-testid="client-address-input"
        />
      </div>
      <div>
        <Label>{isEs ? "Notas" : "Notes"}</Label>
        <Textarea
          value={editForm.notes}
          onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
          rows={3}
          placeholder={isEs ? "Notas adicionales..." : "Additional notes..."}
          data-testid="client-notes-input"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6" data-testid="clients-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{isEs ? "Clientes" : "Clients"}</h2>
          <p className="text-muted-foreground text-sm">
            {isEs ? "Gestiona tu cartera de clientes" : "Manage your client portfolio"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchClients}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {isEs ? "Actualizar" : "Refresh"}
          </Button>
          <Button onClick={openCreate} data-testid="create-client-btn">
            <UserPlus className="w-4 h-4 mr-2" />
            {isEs ? "Nuevo Cliente" : "New Client"}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={isEs ? "Buscar clientes..." : "Search clients..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
          data-testid="client-search-input"
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
                <TableHead className="text-right">{isEs ? "Acciones" : "Actions"}</TableHead>
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
                  <TableRow key={client.client_id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell onClick={() => viewClient(client)}>
                      <div className="flex items-center gap-2">
                        {client.client_type === "Company" ? (
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <User className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{client.display_name}</span>
                      </div>
                    </TableCell>
                    <TableCell onClick={() => viewClient(client)}>
                      {client.email && (
                        <span className="flex items-center gap-1 text-sm">
                          <Mail className="w-3 h-3" />
                          {client.email}
                        </span>
                      )}
                    </TableCell>
                    <TableCell onClick={() => viewClient(client)}>
                      {client.phone && (
                        <span className="flex items-center gap-1 text-sm">
                          <Phone className="w-3 h-3" />
                          {client.phone}
                        </span>
                      )}
                    </TableCell>
                    <TableCell onClick={() => viewClient(client)}>
                      <Badge variant="outline">{client.events_count || 0}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground" onClick={() => viewClient(client)}>
                      {client.last_event_date 
                        ? new Date(client.last_event_date).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell className="font-medium text-green-600" onClick={() => viewClient(client)}>
                      {formatCurrency(client.lifetime_value)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedClient?.client_type === "Company" ? (
                  <Building2 className="w-5 h-5" />
                ) : (
                  <User className="w-5 h-5" />
                )}
                {selectedClient?.display_name}
              </div>
              <Button variant="outline" size="sm" onClick={() => openEdit(selectedClient)} data-testid="edit-client-detail-btn">
                <Edit className="w-4 h-4 mr-2" />
                {isEs ? "Editar" : "Edit"}
              </Button>
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

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEs ? "Editar Cliente" : "Edit Client"}</DialogTitle>
          </DialogHeader>
          <ClientForm />
          <DialogFooter className="flex justify-between">
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => setDeleteConfirmOpen(true)}
              data-testid="delete-client-btn"
            >
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEs ? "Nuevo Cliente" : "New Client"}</DialogTitle>
          </DialogHeader>
          <ClientForm isCreate />
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
            <Button variant="destructive" onClick={handleDelete} data-testid="confirm-delete-client-btn">
              {isEs ? "Eliminar" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
