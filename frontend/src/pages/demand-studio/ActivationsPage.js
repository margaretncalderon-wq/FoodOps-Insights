import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "../../components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { 
  Plus, Zap, Calendar, MapPin, DollarSign, 
  Trash2, Edit2, Loader2, Link2, Unlink, CalendarDays,
  Users, ExternalLink, CheckCircle, Clock, Building2
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const ACTIVATION_TYPES = [
  { value: "event", label: "Event", labelEs: "Evento" },
  { value: "promo", label: "Promotion", labelEs: "Promoción" },
  { value: "partnership", label: "Partnership", labelEs: "Alianza" },
  { value: "sampling", label: "Sampling", labelEs: "Degustación" },
  { value: "popup", label: "Pop-up", labelEs: "Pop-up" },
  { value: "webinar", label: "Webinar", labelEs: "Webinar" },
  { value: "other", label: "Other", labelEs: "Otro" },
];

const ACTIVATION_STATUSES = [
  { value: "planned", label: "Planned", labelEs: "Planificado", color: "bg-blue-100 text-blue-800" },
  { value: "active", label: "Active", labelEs: "Activo", color: "bg-green-100 text-green-800" },
  { value: "completed", label: "Completed", labelEs: "Completado", color: "bg-gray-100 text-gray-800" },
  { value: "cancelled", label: "Cancelled", labelEs: "Cancelado", color: "bg-red-100 text-red-800" },
];

export default function ActivationsPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const navigate = useNavigate();
  const [activations, setActivations] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingActivation, setEditingActivation] = useState(null);
  
  // Link Event Dialog
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkableEvents, setLinkableEvents] = useState([]);
  const [selectedActivationForLink, setSelectedActivationForLink] = useState(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [linking, setLinking] = useState(false);
  
  // Event Details Drawer
  const [eventDrawerOpen, setEventDrawerOpen] = useState(false);
  const [selectedEventDetails, setSelectedEventDetails] = useState(null);
  const [loadingEventDetails, setLoadingEventDetails] = useState(false);
  
  // Create Internal Event
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [newEventData, setNewEventData] = useState({
    name: "",
    event_date: "",
    budget: 0,
    notes: ""
  });
  
  const [formData, setFormData] = useState({
    name: "",
    activation_type: "event",
    campaign_id: "",
    start_date: "",
    end_date: "",
    location: "",
    budget: 0,
    status: "planned",
    notes: ""
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [activationsRes, campaignsRes] = await Promise.all([
        axios.get(`${API}/api/demand-studio/activations`, { withCredentials: true }),
        axios.get(`${API}/api/demand-studio/campaigns`, { withCredentials: true })
      ]);
      setActivations(activationsRes.data);
      setCampaigns(campaignsRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const payload = { ...formData };
      if (!payload.campaign_id) delete payload.campaign_id;
      
      if (editingActivation) {
        await axios.put(`${API}/api/demand-studio/activations/${editingActivation.activation_id}`, payload, { withCredentials: true });
      } else {
        await axios.post(`${API}/api/demand-studio/activations`, payload, { withCredentials: true });
      }
      setDialogOpen(false);
      setEditingActivation(null);
      resetForm();
      fetchData();
    } catch (error) {
      console.error("Error saving activation:", error);
    }
  };

  const handleDelete = async (activationId) => {
    if (!window.confirm(isEs ? "¿Eliminar esta activación?" : "Delete this activation?")) return;
    try {
      await axios.delete(`${API}/api/demand-studio/activations/${activationId}`, { withCredentials: true });
      fetchData();
    } catch (error) {
      console.error("Error deleting activation:", error);
    }
  };

  // ---- Link Event Functions ----
  const openLinkDialog = async (activation) => {
    setSelectedActivationForLink(activation);
    setLinkDialogOpen(true);
    setLoadingEvents(true);
    setShowCreateEvent(false); // Reset create mode
    setNewEventData({ name: "", event_date: "", budget: 0, notes: "" });
    
    try {
      const res = await axios.get(
        `${API}/api/demand-studio/activations/${activation.activation_id}/linkable-events`,
        { withCredentials: true }
      );
      setLinkableEvents(res.data);
    } catch (error) {
      console.error("Error fetching linkable events:", error);
      setLinkableEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleLinkEvent = async (eventId) => {
    if (!selectedActivationForLink) return;
    setLinking(true);
    
    try {
      await axios.post(
        `${API}/api/demand-studio/activations/${selectedActivationForLink.activation_id}/link-event/${eventId}`,
        {},
        { withCredentials: true }
      );
      setLinkDialogOpen(false);
      setSelectedActivationForLink(null);
      fetchData();
    } catch (error) {
      console.error("Error linking event:", error);
      alert(isEs ? "Error al vincular evento" : "Error linking event");
    } finally {
      setLinking(false);
    }
  };

  const handleUnlinkEvent = async (activationId) => {
    if (!window.confirm(isEs ? "¿Desvincular este evento?" : "Unlink this event?")) return;
    
    try {
      await axios.delete(
        `${API}/api/demand-studio/activations/${activationId}/unlink-event`,
        { withCredentials: true }
      );
      setEventDrawerOpen(false);
      setSelectedEventDetails(null);
      fetchData();
    } catch (error) {
      console.error("Error unlinking event:", error);
    }
  };

  // Create Internal Event
  const handleCreateInternalEvent = async () => {
    if (!selectedActivationForLink || !newEventData.name) return;
    setCreatingEvent(true);
    
    try {
      await axios.post(
        `${API}/api/demand-studio/activations/${selectedActivationForLink.activation_id}/create-internal-event`,
        {
          name: newEventData.name,
          event_date: newEventData.event_date || null,
          budget: newEventData.budget || 0,
          notes: newEventData.notes || ""
        },
        { withCredentials: true }
      );
      
      // Reset and close
      setNewEventData({ name: "", event_date: "", budget: 0, notes: "" });
      setShowCreateEvent(false);
      setLinkDialogOpen(false);
      setSelectedActivationForLink(null);
      fetchData();
    } catch (error) {
      console.error("Error creating internal event:", error);
      alert(isEs ? "Error al crear evento interno" : "Error creating internal event");
    } finally {
      setCreatingEvent(false);
    }
  };

  // Open Event Details Drawer
  const openEventDrawer = async (activationId) => {
    setEventDrawerOpen(true);
    setLoadingEventDetails(true);
    
    try {
      const res = await axios.get(
        `${API}/api/demand-studio/activations/${activationId}/linked-event-details`,
        { withCredentials: true }
      );
      setSelectedEventDetails({ ...res.data, activationId });
    } catch (error) {
      console.error("Error fetching event details:", error);
      setSelectedEventDetails(null);
    } finally {
      setLoadingEventDetails(false);
    }
  };

  // Navigate to event based on confirmation status
  const navigateToEvent = (event) => {
    if (event.is_confirmed) {
      // Go to Event Orchestration
      navigate(`/event-orchestration/${event.event_id}`);
    } else {
      // Go to Event Details page (works for all events)
      navigate(`/events/${event.event_id}`);
    }
  };

  const formatEventDate = (dateStr) => {
    if (!dateStr) return isEs ? "Sin fecha" : "No date";
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const openEdit = (activation) => {
    setEditingActivation(activation);
    setFormData({
      name: activation.name,
      activation_type: activation.activation_type,
      campaign_id: activation.campaign_id || "",
      start_date: activation.start_date || "",
      end_date: activation.end_date || "",
      location: activation.location || "",
      budget: activation.budget || 0,
      status: activation.status,
      notes: activation.notes || ""
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      activation_type: "event",
      campaign_id: "",
      start_date: "",
      end_date: "",
      location: "",
      budget: 0,
      status: "planned",
      notes: ""
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
  };

  const getStatusBadge = (status) => {
    const s = ACTIVATION_STATUSES.find(st => st.value === status);
    return s ? (
      <Badge className={s.color}>{isEs ? s.labelEs : s.label}</Badge>
    ) : <Badge>{status}</Badge>;
  };

  const getTypeBadge = (type) => {
    const t = ACTIVATION_TYPES.find(at => at.value === type);
    return t ? (
      <Badge variant="outline">{isEs ? t.labelEs : t.label}</Badge>
    ) : <Badge variant="outline">{type}</Badge>;
  };

  const getCampaignName = (campaignId) => {
    const campaign = campaigns.find(c => c.campaign_id === campaignId);
    return campaign ? campaign.name : "-";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="activations-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {isEs ? "Activaciones de Marketing" : "Marketing Activations"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Eventos, promociones y actividades de campo" : "Events, promotions, and field activities"}
          </p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          {isEs ? "Nueva Activación" : "New Activation"}
        </Button>
      </div>

      {/* Activations Grid */}
      {activations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Zap className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {isEs ? "No hay activaciones. Crea una para comenzar." : "No activations yet. Create one to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activations.map(activation => (
            <Card key={activation.activation_id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{activation.name}</CardTitle>
                    <div className="flex gap-2">
                      {getTypeBadge(activation.activation_type)}
                      {getStatusBadge(activation.status)}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(activation)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(activation.activation_id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {activation.campaign_id && (
                  <p className="text-sm text-muted-foreground">
                    {isEs ? "Campaña:" : "Campaign:"} {getCampaignName(activation.campaign_id)}
                  </p>
                )}
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">{isEs ? "Presupuesto" : "Budget"}</p>
                    <p className="font-semibold">{formatCurrency(activation.budget)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{isEs ? "Gastado" : "Spent"}</p>
                    <p className="font-semibold">{formatCurrency(activation.actual_spend)}</p>
                  </div>
                </div>

                {activation.location && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    {activation.location}
                  </div>
                )}

                {activation.start_date && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {activation.start_date} - {activation.end_date || isEs ? "En curso" : "Ongoing"}
                  </div>
                )}

                {/* Linked Event Section */}
                {activation.linked_event_id ? (
                  <div 
                    className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg cursor-pointer hover:bg-primary/10 transition-colors"
                    onClick={() => openEventDrawer(activation.activation_id)}
                    data-testid={`linked-event-${activation.activation_id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium text-primary">
                          {isEs ? "Evento Vinculado" : "Linked Event"}
                        </span>
                      </div>
                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <div className="mt-2 text-sm">
                      <p className="font-medium">{activation.linked_event?.name || activation.linked_event_name}</p>
                      {activation.linked_event?.client_name && (
                        <p className="text-muted-foreground text-xs">
                          {isEs ? "Cliente:" : "Client:"} {activation.linked_event.client_name}
                        </p>
                      )}
                      <p className="text-muted-foreground text-xs mt-1">
                        {isEs ? "Clic para ver detalles" : "Click to view details"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full mt-2"
                    onClick={() => openLinkDialog(activation)}
                  >
                    <Link2 className="w-4 h-4 mr-2" />
                    {isEs ? "Vincular a Evento" : "Link to Event"}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Link Event Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isEs ? "Vincular a Evento" : "Link to Event"}
            </DialogTitle>
          </DialogHeader>
          
          {selectedActivationForLink && (
            <p className="text-sm text-muted-foreground">
              {isEs ? "Vinculando:" : "Linking:"} <strong>{selectedActivationForLink.name}</strong>
            </p>
          )}

          {/* Toggle between link existing or create new */}
          {!showCreateEvent ? (
            <>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {loadingEvents ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : linkableEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {isEs ? "No hay eventos disponibles para vincular" : "No events available to link"}
                  </p>
                ) : (
                  linkableEvents.map(event => (
                    <div 
                      key={event.event_id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        event.is_currently_linked 
                          ? "bg-primary/10 border-primary" 
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => !linking && handleLinkEvent(event.event_id)}
                      data-testid={`linkable-event-${event.event_id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{event.name}</p>
                            {event.is_confirmed ? (
                              <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                {isEs ? "Confirmado" : "Confirmed"}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                                <Clock className="w-3 h-3 mr-1" />
                                {isEs ? "En proceso" : "In Progress"}
                              </Badge>
                            )}
                          </div>
                          {event.client_name && (
                            <p className="text-xs text-muted-foreground">{event.client_name}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatEventDate(event.event_date)}
                            {event.venue && ` • ${event.venue}`}
                          </p>
                        </div>
                        {event.is_currently_linked && (
                          <Badge variant="outline" className="text-xs ml-2">
                            {isEs ? "Actual" : "Current"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Create Internal Event Button */}
              <div className="pt-3 border-t">
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    setNewEventData({
                      name: selectedActivationForLink?.name || "",
                      event_date: selectedActivationForLink?.start_date || "",
                      budget: selectedActivationForLink?.budget || 0,
                      notes: ""
                    });
                    setShowCreateEvent(true);
                  }}
                  data-testid="create-internal-event-btn"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {isEs ? "Crear Evento Interno (Cost Center)" : "Create Internal Event (Cost Center)"}
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  {isEs 
                    ? "Para activaciones de marketing propio sin cliente externo" 
                    : "For internal marketing activations without external client"}
                </p>
              </div>
            </>
          ) : (
            /* Create Internal Event Form */
            <div className="space-y-4">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-sm text-purple-800">
                  <strong>{isEs ? "Cost Center:" : "Cost Center:"}</strong>{" "}
                  {isEs 
                    ? "Este evento se creará como inversión interna de marketing" 
                    : "This event will be created as internal marketing investment"}
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium">{isEs ? "Nombre del Evento" : "Event Name"} *</label>
                <Input
                  value={newEventData.name}
                  onChange={(e) => setNewEventData({ ...newEventData, name: e.target.value })}
                  placeholder={isEs ? "Ej: Lanzamiento Campaña Q1" : "E.g.: Q1 Campaign Launch"}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">{isEs ? "Fecha" : "Date"}</label>
                  <Input
                    type="date"
                    value={newEventData.event_date}
                    onChange={(e) => setNewEventData({ ...newEventData, event_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{isEs ? "Presupuesto" : "Budget"}</label>
                  <Input
                    type="number"
                    value={newEventData.budget}
                    onChange={(e) => setNewEventData({ ...newEventData, budget: parseFloat(e.target.value) || 0 })}
                    min="0"
                    step="100"
                  />
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium">{isEs ? "Notas" : "Notes"}</label>
                <Input
                  value={newEventData.notes}
                  onChange={(e) => setNewEventData({ ...newEventData, notes: e.target.value })}
                  placeholder={isEs ? "Notas adicionales..." : "Additional notes..."}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {showCreateEvent ? (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => setShowCreateEvent(false)}
                  disabled={creatingEvent}
                >
                  {isEs ? "Volver" : "Back"}
                </Button>
                <Button 
                  onClick={handleCreateInternalEvent}
                  disabled={!newEventData.name || creatingEvent}
                >
                  {creatingEvent ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  {isEs ? "Crear y Vincular" : "Create & Link"}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
                {isEs ? "Cancelar" : "Cancel"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingActivation 
                ? (isEs ? "Editar Activación" : "Edit Activation")
                : (isEs ? "Nueva Activación" : "New Activation")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Nombre" : "Name"} *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={isEs ? "Nombre de la activación" : "Activation name"}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Tipo" : "Type"}</label>
                <Select 
                  value={formData.activation_type} 
                  onValueChange={(v) => setFormData({ ...formData, activation_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVATION_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{isEs ? t.labelEs : t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Estado" : "Status"}</label>
                <Select 
                  value={formData.status} 
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVATION_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{isEs ? s.labelEs : s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Campaña" : "Campaign"}</label>
              <Select 
                value={formData.campaign_id || "none"} 
                onValueChange={(v) => setFormData({ ...formData, campaign_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar campaña" : "Select campaign"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Sin campaña" : "No campaign"}</SelectItem>
                  {campaigns.map(c => (
                    <SelectItem key={c.campaign_id} value={c.campaign_id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Ubicación" : "Location"}</label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder={isEs ? "Lugar del evento" : "Event location"}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha Inicio" : "Start Date"}</label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha Fin" : "End Date"}</label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Presupuesto" : "Budget"}</label>
              <Input
                type="number"
                value={formData.budget}
                onChange={(e) => setFormData({ ...formData, budget: parseFloat(e.target.value) || 0 })}
                min="0"
                step="100"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">{isEs ? "Notas" : "Notes"}</label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder={isEs ? "Notas adicionales" : "Additional notes"}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSave} disabled={!formData.name}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Event Details Drawer */}
      <Sheet open={eventDrawerOpen} onOpenChange={setEventDrawerOpen}>
        <SheetContent className="sm:max-w-lg" data-testid="event-details-drawer">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              {isEs ? "Detalles del Evento" : "Event Details"}
            </SheetTitle>
            <SheetDescription>
              {isEs ? "Información del evento vinculado a esta activación" : "Information about the event linked to this activation"}
            </SheetDescription>
          </SheetHeader>

          {loadingEventDetails ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedEventDetails ? (
            <div className="mt-6 space-y-6">
              {/* Event Name & Status */}
              <div>
                <h3 className="text-lg font-semibold">{selectedEventDetails.name}</h3>
                <div className="flex items-center gap-2 mt-2">
                  {selectedEventDetails.is_confirmed ? (
                    <Badge className="bg-emerald-100 text-emerald-700">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      {isEs ? "Confirmado" : "Confirmed"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                      <Clock className="w-3 h-3 mr-1" />
                      {isEs ? "Pendiente de confirmación" : "Pending Confirmation"}
                    </Badge>
                  )}
                  {selectedEventDetails.stage && (
                    <Badge variant="secondary">{selectedEventDetails.stage}</Badge>
                  )}
                </div>
              </div>

              {/* Event Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                {selectedEventDetails.client_name && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Building2 className="w-4 h-4" />
                      {isEs ? "Cliente" : "Client"}
                    </p>
                    <p className="font-medium">{selectedEventDetails.client_name}</p>
                  </div>
                )}
                
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {isEs ? "Fecha" : "Date"}
                  </p>
                  <p className="font-medium">
                    {selectedEventDetails.event_date 
                      ? formatEventDate(selectedEventDetails.event_date)
                      : (isEs ? "Por definir" : "TBD")}
                  </p>
                </div>

                {selectedEventDetails.guest_count && (
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {isEs ? "Invitados" : "Guests"}
                    </p>
                    <p className="font-medium">{selectedEventDetails.guest_count}</p>
                  </div>
                )}

                {selectedEventDetails.venue && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {isEs ? "Ubicación" : "Venue"}
                    </p>
                    <p className="font-medium">{selectedEventDetails.venue}</p>
                  </div>
                )}

                {selectedEventDetails.total_price && (
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <DollarSign className="w-4 h-4" />
                      {isEs ? "Precio Total" : "Total Price"}
                    </p>
                    <p className="font-medium">{formatCurrency(selectedEventDetails.total_price)}</p>
                  </div>
                )}
              </div>

              {/* Info Banner */}
              <div className={`p-3 rounded-lg border ${
                selectedEventDetails.is_confirmed 
                  ? "bg-emerald-50 border-emerald-200" 
                  : "bg-amber-50 border-amber-200"
              }`}>
                <p className="text-sm">
                  {selectedEventDetails.is_confirmed 
                    ? (isEs 
                        ? "Este evento está confirmado y disponible en Event Orchestration para planificación detallada." 
                        : "This event is confirmed and available in Event Orchestration for detailed planning.")
                    : (isEs 
                        ? "Este evento aún está en proceso de confirmación. Puedes verlo en el Pipeline de Client Engagement." 
                        : "This event is still being confirmed. You can view it in the Client Engagement Pipeline.")}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 pt-4 border-t">
                <Button 
                  className="w-full"
                  onClick={() => {
                    setEventDrawerOpen(false);
                    navigateToEvent(selectedEventDetails);
                  }}
                  data-testid="view-event-btn"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {selectedEventDetails.is_confirmed 
                    ? (isEs ? "Ver en Event Orchestration" : "View in Event Orchestration")
                    : (isEs ? "Ver Detalles del Evento" : "View Event Details")}
                </Button>
                
                <Button 
                  variant="outline"
                  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => handleUnlinkEvent(selectedEventDetails.activationId)}
                  data-testid="unlink-event-btn"
                >
                  <Unlink className="w-4 h-4 mr-2" />
                  {isEs ? "Desvincular Evento" : "Unlink Event"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              {isEs ? "No se pudo cargar la información del evento" : "Could not load event information"}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
