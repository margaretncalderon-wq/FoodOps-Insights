import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
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
import { ArrowLeft, Calendar, CalendarDays, MapPin, Users, DollarSign, Plus, ChefHat, FileText, CheckCircle, PenLine, Share2, Link2, MoreHorizontal, Copy, ExternalLink } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Document types matching the screenshot
const DOCUMENT_TYPES = [
  { type: "contract", icon: "📄", requiresSignature: true },
  { type: "quote", icon: "📝", requiresSignature: true },
  { type: "invoice", icon: "💰", requiresSignature: false },
  { type: "beo", icon: "📋", requiresSignature: false },
  { type: "kitchen_sheet", icon: "👨‍🍳", requiresSignature: false },
  { type: "packing_list", icon: "📦", requiresSignature: false },
  { type: "menu", icon: "🍽️", requiresSignature: false },
  { type: "mise_en_place", icon: "✅", requiresSignature: false },
];

export default function EventDetails() {
  const { eventId } = useParams();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [client, setClient] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [allRecipes, setAllRecipes] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [menuDialogOpen, setMenuDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", due_date: "" });
  const [selectedRecipe, setSelectedRecipe] = useState("");

  useEffect(() => {
    fetchEvent();
    fetchAllRecipes();
  }, [eventId]);

  const fetchEvent = async () => {
    try {
      const response = await axios.get(`${API}/events/${eventId}`, { withCredentials: true });
      setEvent(response.data);
      if (response.data.client_id) {
        fetchClient(response.data.client_id);
      }
      if (response.data.menu_items?.length > 0) {
        fetchMenuRecipes(response.data.menu_items);
      }
      // Fetch documents for this event
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

  const fetchMenuRecipes = async (recipeIds) => {
    const fetchedRecipes = [];
    for (const id of recipeIds) {
      try {
        const response = await axios.get(`${API}/recipes/${id}`, { withCredentials: true });
        fetchedRecipes.push(response.data);
      } catch (error) {
        console.error("Failed to fetch recipe:", error);
      }
    }
    setRecipes(fetchedRecipes);
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

  const handleAddMenuItem = async () => {
    if (!selectedRecipe) return;
    try {
      await axios.post(`${API}/events/${eventId}/menu`, { recipe_id: selectedRecipe }, { withCredentials: true });
      toast.success(language === "es" ? "Plato agregado al menú" : "Dish added to menu");
      fetchEvent();
      setMenuDialogOpen(false);
      setSelectedRecipe("");
    } catch (error) {
      toast.error("Failed to add menu item");
    }
  };

  const handleGenerateDocument = async (docType) => {
    try {
      const response = await axios.post(`${API}/documents/generate/${eventId}/${docType}`, {}, { withCredentials: true });
      toast.success(language === "es" ? "Documento generado" : "Document generated");
      fetchDocuments();
      fetchEvent();
    } catch (error) {
      toast.error("Failed to generate document");
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

  const copyPortalLink = (documentId) => {
    const url = `${window.location.origin}/portal/${documentId}`;
    navigator.clipboard.writeText(url);
    toast.success(language === "es" ? "Enlace copiado" : "Link copied");
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
    quote: { en: "Proposal", es: "Propuesta" },
    invoice: { en: "Invoice", es: "Factura" },
    beo: { en: "Banquet Event Order", es: "Orden de Evento" },
    kitchen_sheet: { en: "Kitchen Sheet", es: "Hoja de Cocina" },
    packing_list: { en: "Packing/Setup List", es: "Lista de Montaje" },
    menu: { en: "Menu", es: "Menú" },
    mise_en_place: { en: "Mise en Place", es: "Mise en Place" },
  };

  const getDuration = () => {
    if (!event?.is_booking || !event?.end_date) return null;
    const start = new Date(event.event_date);
    const end = new Date(event.end_date);
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
          <Link to="/events" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
            {language === "es" ? "Volver a Eventos" : "Back to Events"}
          </Link>
          <Button variant="outline" onClick={handleDuplicateEvent} className="gap-2">
            <Copy className="w-4 h-4" />
            {t("duplicate")}
          </Button>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-heading text-3xl font-bold text-foreground">{event?.name}</h1>
              <Badge className={statusColors[event?.status]}>{t(event?.status)}</Badge>
              {event?.is_booking && (
                <Badge variant="outline">{language === "es" ? "Reserva" : "Booking"}</Badge>
              )}
            </div>
            <p className="text-muted-foreground capitalize">{event?.event_type}</p>
          </div>
        </div>

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
                  {new Date(event?.event_date).toLocaleDateString(language === "es" ? "es-ES" : "en-US")}
                  {event?.is_booking && event?.end_date && (
                    <span className="text-muted-foreground"> - {new Date(event.end_date).toLocaleDateString(language === "es" ? "es-ES" : "en-US")}</span>
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

        {/* Tabs */}
        <Tabs defaultValue="docs" className="space-y-6">
          <TabsList>
            <TabsTrigger value="docs" className="gap-2">
              <FileText className="w-4 h-4" />
              {t("documents")} ({documents.length})
            </TabsTrigger>
            <TabsTrigger value="tasks">{t("tasks")}</TabsTrigger>
            <TabsTrigger value="menu">{t("menu")}</TabsTrigger>
          </TabsList>

          {/* Documents Tab - Similar to Tripleseat */}
          <TabsContent value="docs">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-heading text-lg">{t("documents")}</CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="gap-2" data-testid="add-document-btn">
                      <Plus className="w-4 h-4" />
                      {language === "es" ? "Agregar documento" : "Add document"}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {DOCUMENT_TYPES.map((dt) => (
                      <DropdownMenuItem
                        key={dt.type}
                        onClick={() => handleGenerateDocument(dt.type)}
                        data-testid={`generate-${dt.type}-btn`}
                      >
                        <span className="mr-2">{dt.icon}</span>
                        {docTypeLabels[dt.type]?.[language] || dt.type}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                {documents.length > 0 ? (
                  <div className="divide-y">
                    {documents.map((doc) => {
                      const requiresSignature = DOCUMENT_TYPES.find(d => d.type === doc.document_type)?.requiresSignature;
                      const isSigned = doc.status === "signed";
                      
                      return (
                        <div
                          key={doc.document_id}
                          className="flex items-center gap-4 py-4 hover:bg-muted/30 -mx-4 px-4 transition-colors"
                          data-testid={`doc-row-${doc.document_id}`}
                        >
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                            <FileText className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <Link
                              to={`/documents/${doc.document_id}`}
                              className="font-medium hover:text-primary truncate block"
                            >
                              {doc.title}
                            </Link>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">PDF</Badge>
                              {requiresSignature && !isSigned && (
                                <span className="flex items-center gap-1 text-xs text-destructive">
                                  <PenLine className="w-3 h-3" />
                                  {t("notSigned")}
                                </span>
                              )}
                              {isSigned && (
                                <span className="flex items-center gap-1 text-xs text-success">
                                  <CheckCircle className="w-3 h-3" />
                                  {t("signed")}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyPortalLink(doc.document_id)}
                              className="gap-1"
                            >
                              <Share2 className="w-4 h-4" />
                              <span className="hidden sm:inline">Share</span>
                            </Button>
                            <Link to={`/portal/${doc.document_id}`} target="_blank">
                              <Button variant="ghost" size="sm" className="gap-1">
                                <Link2 className="w-4 h-4" />
                                <span className="hidden sm:inline">Link</span>
                              </Button>
                            </Link>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link to={`/documents/${doc.document_id}`}>
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    {language === "es" ? "Ver" : "View"}
                                  </Link>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>{t("noResults")}</p>
                    <p className="text-sm mt-2">
                      {language === "es"
                        ? "Usa el botón 'Agregar documento' para crear documentos"
                        : "Use the 'Add document' button to create documents"}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
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

          {/* Menu Tab */}
          <TabsContent value="menu">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-heading text-lg">{t("menu")}</CardTitle>
                <Dialog open={menuDialogOpen} onOpenChange={setMenuDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2">
                      <Plus className="w-4 h-4" />
                      {language === "es" ? "Agregar Plato" : "Add Dish"}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{language === "es" ? "Agregar al Menú" : "Add to Menu"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Select value={selectedRecipe} onValueChange={setSelectedRecipe}>
                        <SelectTrigger>
                          <SelectValue placeholder={language === "es" ? "Seleccionar receta" : "Select recipe"} />
                        </SelectTrigger>
                        <SelectContent>
                          {allRecipes.map((recipe) => (
                            <SelectItem key={recipe.recipe_id} value={recipe.recipe_id}>
                              {recipe.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={handleAddMenuItem} className="w-full">{t("save")}</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {recipes.length > 0 ? (
                  <div className="space-y-3">
                    {recipes.map((recipe) => (
                      <Link
                        key={recipe.recipe_id}
                        to={`/recipes/${recipe.recipe_id}`}
                        className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center">
                          <ChefHat className="w-5 h-5 text-secondary-foreground" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{recipe.name}</p>
                          <p className="text-sm text-muted-foreground">{recipe.category}</p>
                        </div>
                        <p className="text-sm font-medium">${recipe.cost_per_serving.toFixed(2)}/serving</p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <ChefHat className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>{t("noResults")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
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
                    {client.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="font-medium">{client.name}</p>
                  <p className="text-sm text-muted-foreground">{client.email}</p>
                </div>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
