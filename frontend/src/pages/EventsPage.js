import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Calendar } from "../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Switch } from "../components/ui/switch";
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
import { format } from "date-fns";
import { Plus, Search, Calendar as CalendarIcon, CalendarDays, MapPin, Users, DollarSign, MoreHorizontal, Trash2, Edit, Copy, List } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EVENT_TYPES = ["wedding", "corporate", "birthday", "social", "other"];
const EVENT_STATUSES = ["planning", "confirmed", "inProgress", "completed", "cancelled"];
const PIPELINE_STAGES = ["Lead", "Contacted", "Proposal", "Negotiation", "Won", "Lost"];

export default function EventsPage() {
  const { t, language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [pipeline, setPipeline] = useState({});
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(searchParams.get("new") === "true");
  const [editingEvent, setEditingEvent] = useState(null);
  const [viewMode, setViewMode] = useState(searchParams.get("view") || "list"); // list, calendar, pipeline
  const [formData, setFormData] = useState({
    client_id: "",
    name: "",
    event_type: "wedding",
    event_date: null,
    event_date_tbd: false,
    end_date: null,
    is_booking: false,
    venue: "",
    guest_count: 0,
    budget: 0,
    notes: "",
    status: "planning",
    stage: "Lead",
    expected_value: "",
    next_followup_date: null,
    next_step: "",
  });

  useEffect(() => {
    fetchEvents();
    fetchClients();
    if (viewMode === "pipeline") {
      fetchPipeline();
    }
  }, [viewMode]);

  const fetchEvents = async () => {
    try {
      const response = await axios.get(`${API}/events`, { withCredentials: true });
      setEvents(response.data);
    } catch (error) {
      console.error("Failed to fetch events:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPipeline = async () => {
    try {
      const response = await axios.get(`${API}/events/pipeline`, { withCredentials: true });
      setPipeline(response.data);
    } catch (error) {
      console.error("Failed to fetch pipeline:", error);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await axios.get(`${API}/crm/clients`, { withCredentials: true });
      setClients(response.data);
    } catch (error) {
      console.error("Failed to fetch clients:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        event_date: formData.event_date_tbd ? null : (formData.event_date ? formData.event_date.toISOString() : null),
        end_date: formData.is_booking && formData.end_date ? formData.end_date.toISOString() : null,
        next_followup_date: formData.next_followup_date ? formData.next_followup_date.toISOString() : null,
        guest_count: parseInt(formData.guest_count) || 0,
        budget: parseFloat(formData.budget) || 0,
        expected_value: formData.expected_value ? parseFloat(formData.expected_value) : null,
      };
      
      if (editingEvent) {
        await axios.put(`${API}/events/${editingEvent.event_id}`, payload, { withCredentials: true });
        toast.success(language === "es" ? "Evento actualizado" : "Event updated");
      } else {
        await axios.post(`${API}/events`, payload, { withCredentials: true });
        toast.success(language === "es" ? "Evento creado" : "Event created");
      }
      fetchEvents();
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save event");
    }
  };

  const handleDelete = async (eventId) => {
    if (!confirm(language === "es" ? "¿Eliminar evento?" : "Delete event?")) return;
    try {
      await axios.delete(`${API}/events/${eventId}`, { withCredentials: true });
      toast.success(language === "es" ? "Evento eliminado" : "Event deleted");
      fetchEvents();
    } catch (error) {
      toast.error("Failed to delete event");
    }
  };

  const handleDuplicate = async (eventId) => {
    try {
      await axios.post(`${API}/events/${eventId}/duplicate`, {}, { withCredentials: true });
      toast.success(language === "es" ? "Evento duplicado" : "Event duplicated");
      fetchEvents();
    } catch (error) {
      toast.error("Failed to duplicate event");
    }
  };

  const handleEdit = (event) => {
    setEditingEvent(event);
    setFormData({
      client_id: event.client_id,
      name: event.name,
      event_type: event.event_type,
      event_date: new Date(event.event_date),
      end_date: event.end_date ? new Date(event.end_date) : null,
      is_booking: event.is_booking || false,
      venue: event.venue || "",
      guest_count: event.guest_count,
      budget: event.budget,
      notes: event.notes || "",
      status: event.status,
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingEvent(null);
    setFormData({
      client_id: "",
      name: "",
      event_type: "wedding",
      event_date: new Date(),
      end_date: null,
      is_booking: false,
      venue: "",
      guest_count: 0,
      budget: 0,
      notes: "",
      status: "planning",
    });
  };

  const filteredEvents = events.filter((event) =>
    event.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.venue?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const statusColors = {
    planning: "bg-info/10 text-info",
    confirmed: "bg-success/10 text-success",
    inProgress: "bg-warning/10 text-warning",
    completed: "bg-primary/10 text-primary",
    cancelled: "bg-destructive/10 text-destructive",
  };

  const getDuration = (event) => {
    if (!event.is_booking || !event.end_date) return null;
    const start = new Date(event.event_date);
    const end = new Date(event.end_date);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return `${days} ${language === "es" ? "días" : "days"}`;
  };

  return (
    <Layout>
      <div className="space-y-6" data-testid="events-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">{t("events")}</h1>
            <p className="text-muted-foreground mt-1">
              {language === "es" ? "Gestiona tus eventos y reservas" : "Manage your events and bookings"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/calendar">
              <Button variant="outline" className="gap-2">
                <CalendarDays className="w-4 h-4" />
                {t("calendar")}
              </Button>
            </Link>
            <Dialog open={dialogOpen} onOpenChange={(open) => { 
              setDialogOpen(open); 
              if (!open) resetForm(); 
            }}>
              <DialogTrigger asChild>
                <Button className="rounded-full gap-2" data-testid="add-event-btn" onClick={() => { if (!editingEvent) resetForm(); }}>
                  <Plus className="w-4 h-4" />
                  {t("addEvent")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-heading">
                    {editingEvent ? t("edit") : t("addEvent")}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("clients")} *</Label>
                    <Select
                      value={formData.client_id}
                      onValueChange={(value) => setFormData({ ...formData, client_id: value })}
                    >
                      <SelectTrigger data-testid="event-client-select">
                        <SelectValue placeholder={language === "es" ? "Seleccionar cliente" : "Select client"} />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((client) => (
                          <SelectItem key={client.client_id} value={client.client_id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("name")} *</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      data-testid="event-name-input"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("eventType")}</Label>
                      <Select
                        value={formData.event_type}
                        onValueChange={(value) => setFormData({ ...formData, event_type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EVENT_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type.charAt(0).toUpperCase() + type.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("status")}</Label>
                      <Select
                        value={formData.status}
                        onValueChange={(value) => setFormData({ ...formData, status: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EVENT_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {t(status)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Multi-day booking toggle */}
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <Label className="font-medium">{language === "es" ? "Reserva Multi-día" : "Multi-day Booking"}</Label>
                      <p className="text-xs text-muted-foreground">
                        {language === "es" ? "Evento con múltiples días" : "Event spanning multiple days"}
                      </p>
                    </div>
                    <Switch
                      id="multiday-toggle"
                      checked={formData.is_booking === true}
                      onCheckedChange={(checked) => {
                        const newEndDate = checked 
                          ? new Date(formData.event_date.getTime() + 86400000) 
                          : null;
                        setFormData({
                          ...formData,
                          is_booking: checked,
                          end_date: newEndDate
                        });
                      }}
                    />
                  </div>

                  {/* Date fields */}
                  {formData.is_booking ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{language === "es" ? "Fecha Inicio" : "Start Date"}</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {format(formData.event_date, "PPP")}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={formData.event_date}
                              onSelect={(date) => {
                                if (date) {
                                  const updates = { ...formData, event_date: date };
                                  if (formData.end_date && date > formData.end_date) {
                                    updates.end_date = new Date(date.getTime() + 86400000);
                                  }
                                  setFormData(updates);
                                }
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        <Label>{language === "es" ? "Fecha Fin" : "End Date"}</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {formData.end_date ? format(formData.end_date, "PPP") : (language === "es" ? "Seleccionar" : "Select")}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={formData.end_date}
                              onSelect={(date) => date && setFormData({ ...formData, end_date: date })}
                              disabled={(date) => date < formData.event_date}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>{t("eventDate")}</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {format(formData.event_date, "PPP")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={formData.event_date}
                            onSelect={(date) => date && setFormData({ ...formData, event_date: date })}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>{t("venue")}</Label>
                    <Input
                      value={formData.venue}
                      onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("guestCount")}</Label>
                      <Input
                        type="number"
                        value={formData.guest_count}
                        onChange={(e) => setFormData({ ...formData, guest_count: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("budget")}</Label>
                      <Input
                        type="number"
                        value={formData.budget}
                        onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("notes")}</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      {t("cancel")}
                    </Button>
                    <Button type="submit" data-testid="save-event-btn">
                      {t("save")}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="event-search-input"
          />
        </div>

        {/* Events Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((event) => (
            <Card
              key={event.event_id}
              className="hover:shadow-card transition-all duration-300 group"
              data-testid={`event-card-${event.event_id}`}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Badge className={statusColors[event.status]}>{t(event.status)}</Badge>
                    {event.is_booking && (
                      <Badge variant="outline" className="text-xs">
                        {language === "es" ? "Reserva" : "Booking"}
                      </Badge>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(event)}>
                        <Edit className="w-4 h-4 mr-2" />
                        {t("edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(event.event_id)}>
                        <Copy className="w-4 h-4 mr-2" />
                        {t("duplicate")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDelete(event.event_id)} className="text-destructive">
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t("delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <Link to={`/events/${event.event_id}`}>
                  <h3 className="font-heading text-xl font-semibold mb-2 hover:text-primary transition-colors">
                    {event.client_info?.client_type === "corporate" && event.client_info?.company_name 
                      ? `${event.client_info.company_name} - ${event.name}`
                      : event.name}
                  </h3>
                </Link>
                <p className="text-sm text-muted-foreground mb-4 capitalize">{event.event_type}</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CalendarIcon className="w-4 h-4" />
                    <span>
                      {new Date(event.event_date).toLocaleDateString(language === "es" ? "es-ES" : "en-US")}
                      {event.is_booking && event.end_date && (
                        <> - {new Date(event.end_date).toLocaleDateString(language === "es" ? "es-ES" : "en-US")}</>
                      )}
                    </span>
                  </div>
                  {getDuration(event) && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CalendarDays className="w-4 h-4" />
                      {getDuration(event)}
                    </div>
                  )}
                  {event.venue && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      {event.venue}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="w-4 h-4" />
                    {event.guest_count} {language === "es" ? "invitados" : "guests"}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <DollarSign className="w-4 h-4" />
                    ${event.budget.toLocaleString()}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredEvents.length === 0 && (
            <div className="col-span-full text-center py-12">
              <CalendarIcon className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">{t("noResults")}</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
