import { useEffect, useState } from "react";
import { API } from "../utils/api";
import { useParams, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { Layout } from "../components/Layout";
import ProposalEditor from "../components/ProposalEditor";
import EventPurchaseList from "../components/EventPurchaseList";
import EventPayments from "../components/EventPayments";
import { useLanguage } from "../contexts/LanguageContext";
import { formatDateOnly, parseDateOnly } from "../utils/dates";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { toast } from "sonner";
import { 
  ArrowLeft, Calendar, CalendarDays, MapPin, Users, DollarSign, 
  Plus, FileText, CheckCircle, PenLine, Share2, Link2, 
  MoreHorizontal, Copy, ExternalLink, ClipboardList, Settings2, Lock, ShoppingCart, Banknote,
  ChevronDown, Inbox, MessageSquare, FileEdit, Eye, Handshake, Archive, Target, Rocket, UserCheck
} from "lucide-react";
import SendToExecutionModal from "../components/SendToExecutionModal";
import LostReasonDialog, { lostReasonLabel } from "../components/LostReasonDialog";


// Engagement Stages with icons and colors
const ENGAGEMENT_STAGES = [
  { value: "Inquiry Received", label: { en: "Inquiry Received", es: "Consulta Recibida" }, icon: Inbox, color: "bg-slate-100 text-slate-700" },
  { value: "Context Captured", label: { en: "Context Captured", es: "Contexto Capturado" }, icon: MessageSquare, color: "bg-blue-100 text-blue-700" },
  { value: "Scope Drafted", label: { en: "Scope Drafted", es: "Alcance Definido" }, icon: FileEdit, color: "bg-amber-100 text-amber-700" },
  { value: "Definition In Review", label: { en: "Definition In Review", es: "Definición en Revisión" }, icon: Eye, color: "bg-purple-100 text-purple-700" },
  { value: "Committed", label: { en: "Committed", es: "Comprometido" }, icon: Handshake, color: "bg-green-100 text-green-700" },
  { value: "Archived", label: { en: "Lost", es: "Perdida" }, icon: Archive, color: "bg-gray-100 text-gray-500" },
];

export default function EventDetails() {
  const { eventId } = useParams();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [client, setClient] = useState(null);
  const [allRecipes, setAllRecipes] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", due_date: "" });
  const [executionModalOpen, setExecutionModalOpen] = useState(false);
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  
  // Sales rep assignment
  const [salesReps, setSalesReps] = useState([]);
  const [assigningRep, setAssigningRep] = useState(false);

  useEffect(() => {
    fetchEvent();
    fetchAllRecipes();
    fetchSalesReps();
  }, [eventId]);

  const fetchSalesReps = async () => {
    try {
      const res = await axios.get(`${API}/people-ops/employees?status=active`, { withCredentials: true });
      // Filter employees with commission_rate or all active employees
      setSalesReps(res.data || []);
    } catch (err) {
      console.error("Error fetching sales reps:", err);
    }
  };

  const handleAssignSalesRep = async (userId) => {
    setAssigningRep(true);
    try {
      await axios.put(`${API}/events/${eventId}`, { assigned_to: userId || null }, { withCredentials: true });
      await fetchEvent();
      toast.success(language === "es" ? "Vendedor asignado" : "Sales rep assigned");
    } catch (err) {
      console.error("Error assigning sales rep:", err);
      toast.error(language === "es" ? "Error al asignar" : "Error assigning");
    }
    setAssigningRep(false);
  };

  const fetchEvent = async () => {
    try {
      const response = await axios.get(`${API}/events/${eventId}`, { withCredentials: true });
      setEvent(response.data);
      if (response.data.client_id) {
        fetchClient(response.data.client_id);
      }
      fetchDocuments();
    } catch (error) {
      console.error("Failed to fetch event:", error);
      toast.error("Event not found");
      navigate("/events");
    } finally {
      setLoading(false);
    }
  };

  const fetchClient = async (clientId) => {
    try {
      const response = await axios.get(`${API}/crm/clients/${clientId}`, { withCredentials: true });
      setClient(response.data);
    } catch (error) {
      console.error("Failed to fetch client:", error);
    }
  };

  const fetchAllRecipes = async () => {
    try {
      const response = await axios.get(`${API}/recipes`, { withCredentials: true });
      setAllRecipes(response.data);
    } catch (error) {
      console.error("Failed to fetch recipes:", error);
    }
  };

  const fetchDocuments = async () => {
    try {
      const response = await axios.get(`${API}/documents?event_id=${eventId}`, { withCredentials: true });
      setDocuments(response.data);
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/events/${eventId}/tasks`, newTask, { withCredentials: true });
      toast.success(language === "es" ? "Tarea agregada" : "Task added");
      fetchEvent();
      setTaskDialogOpen(false);
      setNewTask({ title: "", due_date: "" });
    } catch (error) {
      toast.error("Failed to add task");
    }
  };

  const handleToggleTask = async (task) => {
    try {
      await axios.put(`${API}/events/${eventId}/tasks/${task.task_id}`, {
        ...task,
        completed: !task.completed,
      }, { withCredentials: true });
      fetchEvent();
    } catch (error) {
      toast.error("Failed to update task");
    }
  };

  const handleDuplicateEvent = async () => {
    try {
      const response = await axios.post(`${API}/events/${eventId}/duplicate`, {}, { withCredentials: true });
      toast.success(language === "es" ? "Evento duplicado" : "Event duplicated");
      navigate(`/events/${response.data.event_id}`);
    } catch (error) {
      toast.error("Failed to duplicate event");
    }
  };

  const handleStageChange = async (newStage) => {
    // Intercept "Lost" transition to capture a reason. Skip the modal when
    // the event is already in Archived/Lost (idempotent re-click).
    if (newStage === "Archived" && event?.stage !== "Archived") {
      setLostDialogOpen(true);
      return;
    }
    try {
      await axios.put(`${API}/events/${eventId}`, { stage: newStage }, { withCredentials: true });
      toast.success(language === "es" ? `Etapa cambiada a ${newStage}` : `Stage changed to ${newStage}`);
      fetchEvent();
    } catch (error) {
      toast.error(language === "es" ? "Error al cambiar etapa" : "Failed to change stage");
    }
  };

  const handleMarkAsLost = async ({ reason, notes }) => {
    try {
      await axios.put(
        `${API}/events/${eventId}`,
        { stage: "Archived", lost_reason: reason, lost_reason_notes: notes },
        { withCredentials: true }
      );
      toast.success(language === "es" ? "Marcada como Perdida" : "Marked as Lost");
      fetchEvent();
    } catch (error) {
      toast.error(language === "es" ? "Error al marcar como perdida" : "Failed to mark as lost");
      throw error;
    }
  };

  const handleDocumentGenerated = (doc) => {
    setDocuments([...documents, doc]);
  };

  const copyPortalLink = (documentId) => {
    const url = `${window.location.origin}/portal/${documentId}`;
    navigator.clipboard.writeText(url);
    toast.success(language === "es" ? "Enlace copiado" : "Link copied");
  };

  // Get current stage info
  const getCurrentStage = () => {
    const stage = event?.stage || "Inquiry Received";
    return ENGAGEMENT_STAGES.find(s => s.value === stage) || ENGAGEMENT_STAGES[0];
  };

  const statusColors = {
    planning: "bg-info/10 text-info",
    confirmed: "bg-success/10 text-success",
    inProgress: "bg-warning/10 text-warning",
    completed: "bg-primary/10 text-primary",
    cancelled: "bg-destructive/10 text-destructive",
  };

  const docTypeLabels = {
    contract: { en: "Contract", es: "Contrato" },
    proposal: { en: "Proposal", es: "Propuesta" },
    invoice: { en: "Invoice", es: "Factura" },
    beo: { en: "Banquet Event Order", es: "Orden de Evento" },
    kitchen_sheet: { en: "Kitchen Sheet", es: "Hoja de Cocina" },
    packing_list: { en: "Packing/Setup List", es: "Lista de Montaje" },
    menu: { en: "Menu", es: "Menú" },
    mise_en_place: { en: "Mise en Place", es: "Mise en Place" },
  };

  const getDuration = () => {
    if (!event?.is_booking || !event?.end_date) return null;
    const start = parseDateOnly(event.event_date);
    const end = parseDateOnly(event.end_date);
    if (!start || !end) return null;
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return `${days} ${language === "es" ? "días" : "days"}`;
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
      <div className="space-y-6" data-testid="event-details-page">
        {/* Back Button */}
        <div className="flex items-center justify-between">
          <Link to="/client-engagement/proposals" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
            {language === "es" ? "Volver a Propuestas" : "Back to Proposals"}
          </Link>
          <div className="flex items-center gap-2">
            {/* Send to Execution Hub Button - Only show if stage is Committed and no goal exists */}
            {event?.stage === "Committed" && !event?.execution_goal_id && (
              <Button 
                variant="default" 
                className="gap-2 bg-green-600 hover:bg-green-700"
                onClick={() => setExecutionModalOpen(true)}
                data-testid="send-to-execution-btn"
              >
                <Rocket className="w-4 h-4" />
                {language === "es" ? "Enviar a Execution Hub" : "Send to Execution Hub"}
              </Button>
            )}
            {/* Link to Execution Goal if exists */}
            {event?.execution_goal_id && (
              <Button 
                variant="outline" 
                className="gap-2 text-green-600 border-green-200 hover:bg-green-50"
                onClick={() => navigate(`/execution-hub/${event.execution_goal_id}`)}
                data-testid="view-execution-goal-btn"
              >
                <Target className="w-4 h-4" />
                {language === "es" ? "Ver en Execution Hub" : "View in Execution Hub"}
              </Button>
            )}
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => {
                const portalUrl = `${window.location.origin}/portal/event/${eventId}`;
                window.open(portalUrl, '_blank');
              }}
            >
              <ExternalLink className="w-4 h-4" />
              {language === "es" ? "Portal Cliente" : "Client Portal"}
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => {
                const portalUrl = `${window.location.origin}/portal/event/${eventId}`;
                navigator.clipboard.writeText(portalUrl);
                toast.success(language === "es" ? "Link copiado!" : "Link copied!");
              }}
              title={language === "es" ? "Copiar link del portal" : "Copy portal link"}
            >
              <Link2 className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={handleDuplicateEvent} className="gap-2">
              <Copy className="w-4 h-4" />
              {t("duplicate")}
            </Button>
          </div>
        </div>

        {/* Header with Engagement Stage Control */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="font-heading text-3xl font-bold text-foreground">{event?.name}</h1>
              <Badge className={statusColors[event?.status]}>{t(event?.status)}</Badge>
              {event?.is_booking && (
                <Badge variant="outline">{language === "es" ? "Reserva" : "Booking"}</Badge>
              )}
            </div>
            <p className="text-muted-foreground capitalize">{event?.event_type}</p>
          </div>
          
          {/* Engagement Stage Dropdown */}
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              {language === "es" ? "Etapa Comercial" : "Engagement Stage"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className={`gap-2 ${getCurrentStage().color}`} data-testid="stage-dropdown">
                  {(() => {
                    const StageIcon = getCurrentStage().icon;
                    return <StageIcon className="w-4 h-4" />;
                  })()}
                  {getCurrentStage().label[language] || getCurrentStage().value}
                  <ChevronDown className="w-4 h-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {ENGAGEMENT_STAGES.map((stage) => {
                  const StageIcon = stage.icon;
                  return (
                    <DropdownMenuItem 
                      key={stage.value}
                      onClick={() => handleStageChange(stage.value)}
                      className={event?.stage === stage.value ? "bg-muted" : ""}
                    >
                      <StageIcon className="w-4 h-4 mr-2" />
                      {stage.label[language] || stage.value}
                      {event?.stage === stage.value && <CheckCircle className="w-4 h-4 ml-auto text-green-600" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Lost Reason banner — only when event is in Archived/Lost stage */}
        {(event?.stage === "Archived" || event?.stage === "Lost") && event?.lost_reason && (
          <Card className="border-gray-300 bg-gray-50" data-testid="lost-reason-banner">
            <CardContent className="p-4 flex items-start gap-3">
              <Archive className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-700">
                    {language === "es" ? "Motivo de pérdida:" : "Loss reason:"}
                  </span>
                  <Badge variant="outline" className="bg-white">
                    {lostReasonLabel(event.lost_reason, language)}
                  </Badge>
                  {event.lost_reason_at && (
                    <span className="text-xs text-muted-foreground">
                      · {new Date(event.lost_reason_at).toLocaleDateString(language === "es" ? "es-ES" : "en-US")}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs ml-auto"
                    onClick={() => setLostDialogOpen(true)}
                    data-testid="edit-lost-reason"
                  >
                    {language === "es" ? "Editar" : "Edit"}
                  </Button>
                </div>
                {event.lost_reason_notes && (
                  <p className="text-sm text-muted-foreground mt-1.5 whitespace-pre-wrap">
                    {event.lost_reason_notes}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Event Info Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("date")}</p>
                <p className="font-medium">
                  {formatDateOnly(event?.event_date, language)}
                  {event?.is_booking && event?.end_date && (
                    <span className="text-muted-foreground"> - {formatDateOnly(event.end_date, language)}</span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
          {getDuration() && (
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-secondary/50 flex items-center justify-center">
                  <CalendarDays className="w-6 h-6 text-secondary-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === "es" ? "Duración" : "Duration"}</p>
                  <p className="font-medium">{getDuration()}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {event?.venue && (
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-info/10 flex items-center justify-center">
                  <MapPin className="w-6 h-6 text-info" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("venue")}</p>
                  <p className="font-medium">{event.venue}</p>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("guestCount")}</p>
                <p className="font-medium">{event?.guest_count}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("budget")}</p>
                <p className="font-medium">${event?.budget?.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sales Rep Assignment */}
        <Card data-testid="sales-rep-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <UserCheck className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === "es" ? "Vendedor Asignado" : "Assigned Sales Rep"}
                  </p>
                  <p className="font-medium">
                    {event?.assigned_to 
                      ? (salesReps.find(r => r.user_id === event.assigned_to)?.full_name || event.assigned_to)
                      : (language === "es" ? "Sin asignar" : "Unassigned")}
                  </p>
                </div>
              </div>
              <Select 
                value={event?.assigned_to || "none"} 
                onValueChange={(v) => handleAssignSalesRep(v === "none" ? null : v)}
                disabled={assigningRep}
              >
                <SelectTrigger className="w-48" data-testid="sales-rep-select">
                  <SelectValue placeholder={language === "es" ? "Seleccionar..." : "Select..."} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{language === "es" ? "Sin asignar" : "Unassigned"}</SelectItem>
                  {salesReps.filter(r => r.user_id).map(rep => (
                    <SelectItem key={rep.user_id} value={rep.user_id}>
                      <div className="flex items-center gap-2">
                        <span>{rep.full_name}</span>
                        {rep.commission_rate > 0 && (
                          <Badge variant="outline" className="text-xs">{rep.commission_rate}%</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {event?.assigned_to && salesReps.find(r => r.user_id === event.assigned_to)?.commission_rate > 0 && (
              <p className="text-xs text-emerald-600 mt-2 ml-13">
                {language === "es" 
                  ? `Comisión: ${salesReps.find(r => r.user_id === event.assigned_to)?.commission_rate}% sobre venta`
                  : `Commission: ${salesReps.find(r => r.user_id === event.assigned_to)?.commission_rate}% on sale`}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Tabs - Simplified */}
        <Tabs defaultValue="order" className="space-y-6">
          <TabsList>
            <TabsTrigger value="order" className="gap-2" data-testid="tab-order">
              <ClipboardList className="w-4 h-4" />
              {language === "es" ? "Contrato y Orden" : "Contract & Order"}
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2" data-testid="tab-tasks">
              <ClipboardList className="w-4 h-4" />
              {t("tasks")}
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-2" data-testid="tab-payments">
              <Banknote className="w-4 h-4" />
              {language === "es" ? "Pagos" : "Payments"}
            </TabsTrigger>
          </TabsList>

          {/* Contract & Event Order Tab - THE MAIN DATA ENTRY */}
          <TabsContent value="order">
            <ProposalEditor 
              eventId={eventId} 
              event={event}
              onDocumentGenerated={handleDocumentGenerated}
            />
          </TabsContent>

          {/* Tasks Tab */}
          <TabsContent value="tasks">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-heading text-lg">{t("tasks")}</CardTitle>
                <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2">
                      <Plus className="w-4 h-4" />
                      {language === "es" ? "Agregar Tarea" : "Add Task"}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{language === "es" ? "Nueva Tarea" : "New Task"}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleAddTask} className="space-y-4">
                      <Input
                        placeholder={language === "es" ? "Título de la tarea" : "Task title"}
                        value={newTask.title}
                        onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                        required
                      />
                      <Input
                        type="date"
                        value={newTask.due_date}
                        onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                      />
                      <Button type="submit" className="w-full">{t("save")}</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {event?.tasks?.length > 0 ? (
                  <div className="space-y-3">
                    {event.tasks.map((task) => (
                      <div
                        key={task.task_id}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Checkbox
                          checked={task.completed}
                          onCheckedChange={() => handleToggleTask(task)}
                        />
                        <span className={task.completed ? "line-through text-muted-foreground" : ""}>
                          {task.title}
                        </span>
                        {task.due_date && (
                          <span className="text-sm text-muted-foreground ml-auto">
                            {new Date(task.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>{t("noResults")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments">
            <EventPayments eventId={eventId} event={event} client={client} />
          </TabsContent>
        </Tabs>

        {/* Client Info */}
        {client && (
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                {language === "es" ? "Cliente" : "Client"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                to={`/crm/${client.client_id}`}
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                  <span className="font-heading font-bold text-secondary-foreground">
                    {(client.display_name || client.name || "?").charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="font-medium">{client.display_name || client.name}</p>
                  <p className="text-sm text-muted-foreground">{client.email}</p>
                </div>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Send to Execution Hub Modal */}
      <SendToExecutionModal
        open={executionModalOpen}
        onClose={() => setExecutionModalOpen(false)}
        event={event}
        industry="events_hospitality"
        onSuccess={(data) => {
          // Update the event with the new execution_goal_id
          setEvent(prev => ({ ...prev, execution_goal_id: data.goal.goal_id }));
          toast.success(
            language === "es" 
              ? "¡Enviado a Execution Hub! Redirigiendo..." 
              : "Sent to Execution Hub! Redirecting..."
          );
          setTimeout(() => {
            navigate(`/execution-hub/${data.goal.goal_id}`);
          }, 1500);
        }}
      />
      <LostReasonDialog
        open={lostDialogOpen}
        onOpenChange={setLostDialogOpen}
        defaultReason={event?.lost_reason || ""}
        defaultNotes={event?.lost_reason_notes || ""}
        eventName={event?.name || ""}
        onConfirm={handleMarkAsLost}
      />
    </Layout>
  );
}
