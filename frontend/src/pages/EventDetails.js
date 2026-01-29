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
import { toast } from "sonner";
import { ArrowLeft, Calendar, MapPin, Users, DollarSign, Plus, ChefHat, FileText, CheckCircle } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function EventDetails() {
  const { eventId } = useParams();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [client, setClient] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [allRecipes, setAllRecipes] = useState([]);
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
      navigate(`/documents/${response.data.document_id}`);
    } catch (error) {
      toast.error("Failed to generate document");
    }
  };

  const statusColors = {
    planning: "bg-info/10 text-info",
    confirmed: "bg-success/10 text-success",
    inProgress: "bg-warning/10 text-warning",
    completed: "bg-primary/10 text-primary",
    cancelled: "bg-destructive/10 text-destructive",
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
        <Link to="/events" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          {language === "es" ? "Volver a Eventos" : "Back to Events"}
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-heading text-3xl font-bold text-foreground">{event?.name}</h1>
              <Badge className={statusColors[event?.status]}>{t(event?.status)}</Badge>
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
                </p>
              </div>
            </CardContent>
          </Card>
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
        <Tabs defaultValue="tasks" className="space-y-6">
          <TabsList>
            <TabsTrigger value="tasks">{t("tasks")}</TabsTrigger>
            <TabsTrigger value="menu">{t("menu")}</TabsTrigger>
            <TabsTrigger value="documents">{t("documents")}</TabsTrigger>
          </TabsList>

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

          {/* Documents Tab */}
          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg">{t("documents")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { type: "quote", label: t("quote") },
                    { type: "beo", label: t("beo") },
                    { type: "kitchen_sheet", label: t("kitchenSheet") },
                    { type: "packing_list", label: t("packingList") },
                    { type: "mise_en_place", label: t("miseEnPlace") },
                  ].map((doc) => (
                    <Button
                      key={doc.type}
                      variant="outline"
                      className="h-auto py-4 flex flex-col gap-2"
                      onClick={() => handleGenerateDocument(doc.type)}
                      data-testid={`generate-${doc.type}-btn`}
                    >
                      <FileText className="w-6 h-6" />
                      <span>{doc.label}</span>
                    </Button>
                  ))}
                </div>
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
