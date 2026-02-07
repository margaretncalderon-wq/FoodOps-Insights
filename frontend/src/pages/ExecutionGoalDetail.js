import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE as API } from "../utils/api";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Target,
  ArrowLeft,
  Plus,
  MoreVertical,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  Calendar,
  Loader2,
  Trash2,
  Edit,
  MessageSquare,
  Link2,
  FileText,
  GitBranch,
  Zap,
  CircleDot,
  Archive,
  ChevronDown,
  ChevronUp,
  Send,
} from "lucide-react";
import { toast } from "sonner";

const statusConfig = {
  planning: { label: "Planificación", labelEn: "Planning", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: CircleDot },
  in_progress: { label: "En Progreso", labelEn: "In Progress", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Zap },
  blocked: { label: "Bloqueado", labelEn: "Blocked", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: AlertTriangle },
  live: { label: "Activo", labelEn: "Live", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: CheckCircle2 },
  archived: { label: "Archivado", labelEn: "Archived", color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: Archive },
};

const taskStatusConfig = {
  pending: { label: "Pendiente", labelEn: "Pending", color: "bg-gray-500/20 text-gray-400" },
  in_progress: { label: "En Progreso", labelEn: "In Progress", color: "bg-yellow-500/20 text-yellow-400" },
  completed: { label: "Completado", labelEn: "Completed", color: "bg-green-500/20 text-green-400" },
  blocked: { label: "Bloqueado", labelEn: "Blocked", color: "bg-red-500/20 text-red-400" },
};

const impactConfig = {
  cost: { label: "Costo", labelEn: "Cost", color: "bg-emerald-500/20 text-emerald-400" },
  quality: { label: "Calidad", labelEn: "Quality", color: "bg-purple-500/20 text-purple-400" },
  speed: { label: "Velocidad", labelEn: "Speed", color: "bg-orange-500/20 text-orange-400" },
  risk: { label: "Riesgo", labelEn: "Risk", color: "bg-red-500/20 text-red-400" },
};

export default function ExecutionGoalDetail() {
  const { goalId } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isEs = language === "es";

  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState(null);
  const [activeTab, setActiveTab] = useState("tasks");
  
  // Task dialogs
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "", due_date: "" });
  const [creatingTask, setCreatingTask] = useState(false);
  
  // Decision dialog
  const [showDecisionDialog, setShowDecisionDialog] = useState(false);
  const [newDecision, setNewDecision] = useState({ decision: "", rationale: "" });
  const [creatingDecision, setCreatingDecision] = useState(false);
  
  // Dependency dialog
  const [showDependencyDialog, setShowDependencyDialog] = useState(false);
  const [newDependency, setNewDependency] = useState({ title: "", description: "" });
  const [creatingDependency, setCreatingDependency] = useState(false);
  
  // Note input
  const [noteContent, setNoteContent] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  
  // Task note
  const [taskNoteContent, setTaskNoteContent] = useState({});
  const [expandedTask, setExpandedTask] = useState(null);

  const fetchGoal = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/execution-hub/goals/${goalId}`, { withCredentials: true });
      setGoal(res.data);
    } catch (error) {
      console.error("Error fetching goal:", error);
      toast.error(isEs ? "Error al cargar la meta" : "Error loading goal");
      navigate("/execution-hub");
    } finally {
      setLoading(false);
    }
  }, [goalId, isEs, navigate]);

  useEffect(() => {
    fetchGoal();
  }, [fetchGoal]);

  const handleStatusChange = async (newStatus) => {
    try {
      await axios.put(`${API}/execution-hub/goals/${goalId}`, { status: newStatus }, { withCredentials: true });
      toast.success(isEs ? "Estado actualizado" : "Status updated");
      fetchGoal();
    } catch (error) {
      toast.error(isEs ? "Error al actualizar" : "Error updating");
    }
  };

  const handleDeleteGoal = async () => {
    if (!window.confirm(isEs ? "¿Estás seguro de eliminar esta meta?" : "Are you sure you want to delete this goal?")) {
      return;
    }
    try {
      await axios.delete(`${API}/execution-hub/goals/${goalId}`, { withCredentials: true });
      toast.success(isEs ? "Meta eliminada" : "Goal deleted");
      navigate("/execution-hub");
    } catch (error) {
      toast.error(isEs ? "Error al eliminar" : "Error deleting");
    }
  };

  const handleCreateTask = async () => {
    if (!newTask.title) return;
    setCreatingTask(true);
    try {
      await axios.post(`${API}/execution-hub/goals/${goalId}/tasks`, newTask, { withCredentials: true });
      toast.success(isEs ? "Tarea creada" : "Task created");
      setShowTaskDialog(false);
      setNewTask({ title: "", description: "", due_date: "" });
      fetchGoal();
    } catch (error) {
      toast.error(isEs ? "Error al crear tarea" : "Error creating task");
    } finally {
      setCreatingTask(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId, newStatus) => {
    try {
      await axios.put(`${API}/execution-hub/tasks/${taskId}`, { status: newStatus }, { withCredentials: true });
      toast.success(isEs ? "Tarea actualizada" : "Task updated");
      fetchGoal();
    } catch (error) {
      toast.error(isEs ? "Error al actualizar" : "Error updating");
    }
  };

  const handleAddTaskNote = async (taskId) => {
    const content = taskNoteContent[taskId];
    if (!content?.trim()) return;
    
    try {
      await axios.post(`${API}/execution-hub/tasks/${taskId}/notes`, { content }, { withCredentials: true });
      toast.success(isEs ? "Nota agregada" : "Note added");
      setTaskNoteContent({ ...taskNoteContent, [taskId]: "" });
      fetchGoal();
    } catch (error) {
      toast.error(isEs ? "Error al agregar nota" : "Error adding note");
    }
  };

  const handleCreateDecision = async () => {
    if (!newDecision.decision) return;
    setCreatingDecision(true);
    try {
      await axios.post(`${API}/execution-hub/goals/${goalId}/decisions`, newDecision, { withCredentials: true });
      toast.success(isEs ? "Decisión registrada" : "Decision recorded");
      setShowDecisionDialog(false);
      setNewDecision({ decision: "", rationale: "" });
      fetchGoal();
    } catch (error) {
      toast.error(isEs ? "Error al registrar decisión" : "Error recording decision");
    } finally {
      setCreatingDecision(false);
    }
  };

  const handleCreateDependency = async () => {
    if (!newDependency.title) return;
    setCreatingDependency(true);
    try {
      await axios.post(`${API}/execution-hub/goals/${goalId}/dependencies`, newDependency, { withCredentials: true });
      toast.success(isEs ? "Dependencia agregada" : "Dependency added");
      setShowDependencyDialog(false);
      setNewDependency({ title: "", description: "" });
      fetchGoal();
    } catch (error) {
      toast.error(isEs ? "Error al agregar dependencia" : "Error adding dependency");
    } finally {
      setCreatingDependency(false);
    }
  };

  const handleUpdateDependencyStatus = async (depId, newStatus) => {
    try {
      await axios.put(`${API}/execution-hub/dependencies/${depId}`, { status: newStatus }, { withCredentials: true });
      toast.success(isEs ? "Dependencia actualizada" : "Dependency updated");
      fetchGoal();
    } catch (error) {
      toast.error(isEs ? "Error al actualizar" : "Error updating");
    }
  };

  const handleAddGoalNote = async () => {
    if (!noteContent.trim()) return;
    setAddingNote(true);
    try {
      await axios.post(`${API}/execution-hub/goals/${goalId}/notes`, { content: noteContent }, { withCredentials: true });
      toast.success(isEs ? "Nota agregada" : "Note added");
      setNoteContent("");
      fetchGoal();
    } catch (error) {
      toast.error(isEs ? "Error al agregar nota" : "Error adding note");
    } finally {
      setAddingNote(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-[#AED768]" />
        </div>
      </Layout>
    );
  }

  if (!goal) return null;

  const status = statusConfig[goal.status] || statusConfig.planning;
  const StatusIcon = status.icon;

  return (
    <Layout>
      <div className="space-y-6" data-testid="goal-detail-page">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/execution-hub")}
              className="mt-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge className={`${status.color} border`}>
                  <StatusIcon className="w-3 h-3 mr-1" />
                  {isEs ? status.label : status.labelEn}
                </Badge>
                {goal.impact_areas?.map(area => (
                  <Badge key={area} variant="outline" className={`${impactConfig[area]?.color} text-xs border-0`}>
                    {isEs ? impactConfig[area]?.label : impactConfig[area]?.labelEn}
                  </Badge>
                ))}
              </div>
              <h1 className="text-2xl font-bold text-foreground">{goal.title}</h1>
              <p className="text-muted-foreground mt-1">{goal.objective}</p>
              <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {goal.owner_name}
                </span>
                {goal.target_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {new Date(goal.target_date).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  {isEs ? "Cambiar Estado" : "Change Status"}
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {Object.entries(statusConfig).map(([key, config]) => (
                  <DropdownMenuItem 
                    key={key}
                    onClick={() => handleStatusChange(key)}
                    disabled={goal.status === key}
                  >
                    <config.icon className="w-4 h-4 mr-2" />
                    {isEs ? config.label : config.labelEn}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDeleteGoal} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  {isEs ? "Eliminar Meta" : "Delete Goal"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50">
            <TabsTrigger value="tasks" className="data-[state=active]:bg-card">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {isEs ? "Tareas" : "Tasks"} ({goal.tasks?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="decisions" className="data-[state=active]:bg-card">
              <FileText className="w-4 h-4 mr-2" />
              {isEs ? "Decisiones" : "Decisions"} ({goal.decisions?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="dependencies" className="data-[state=active]:bg-card">
              <GitBranch className="w-4 h-4 mr-2" />
              {isEs ? "Dependencias" : "Dependencies"} ({goal.dependencies?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="notes" className="data-[state=active]:bg-card">
              <MessageSquare className="w-4 h-4 mr-2" />
              {isEs ? "Notas" : "Notes"} ({goal.notes?.length || 0})
            </TabsTrigger>
          </TabsList>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">
                  {isEs ? "Tareas" : "Tasks"}
                </CardTitle>
                <Button 
                  size="sm" 
                  onClick={() => setShowTaskDialog(true)}
                  className="bg-[#AED768] hover:bg-[#9dc856] text-[#1F2937]"
                  data-testid="add-task-btn"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {isEs ? "Agregar" : "Add"}
                </Button>
              </CardHeader>
              <CardContent>
                {goal.tasks?.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    {isEs ? "No hay tareas aún" : "No tasks yet"}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {goal.tasks?.map((task) => {
                      const taskStatus = taskStatusConfig[task.status] || taskStatusConfig.pending;
                      const isExpanded = expandedTask === task.task_id;
                      
                      return (
                        <div key={task.task_id} className="border border-border rounded-lg p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium text-foreground">{task.title}</h4>
                                <Badge className={`${taskStatus.color} text-xs`}>
                                  {isEs ? taskStatus.label : taskStatus.labelEn}
                                </Badge>
                              </div>
                              {task.description && (
                                <p className="text-sm text-muted-foreground">{task.description}</p>
                              )}
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                {task.due_date && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(task.due_date).toLocaleDateString()}
                                  </span>
                                )}
                                {task.assignees?.length > 0 && (
                                  <span className="flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    {task.assignees.map(a => a.name).join(", ")}
                                  </span>
                                )}
                                <span>
                                  {task.notes?.length || 0} {isEs ? "notas" : "notes"}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Select 
                                value={task.status} 
                                onValueChange={(v) => handleUpdateTaskStatus(task.task_id, v)}
                              >
                                <SelectTrigger className="w-32 h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">{isEs ? "Pendiente" : "Pending"}</SelectItem>
                                  <SelectItem value="in_progress">{isEs ? "En Progreso" : "In Progress"}</SelectItem>
                                  <SelectItem value="completed">{isEs ? "Completado" : "Completed"}</SelectItem>
                                  <SelectItem value="blocked">{isEs ? "Bloqueado" : "Blocked"}</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setExpandedTask(isExpanded ? null : task.task_id)}
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </Button>
                            </div>
                          </div>
                          
                          {isExpanded && (
                            <div className="mt-4 pt-4 border-t border-border">
                              <h5 className="text-sm font-medium mb-2">{isEs ? "Notas de la tarea" : "Task Notes"}</h5>
                              {task.notes?.length > 0 ? (
                                <div className="space-y-2 mb-3">
                                  {task.notes.map((note) => (
                                    <div key={note.note_id} className="bg-muted/50 rounded p-2 text-sm">
                                      <p className="text-foreground">{note.content}</p>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {note.user_name} • {new Date(note.created_at).toLocaleString()}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground mb-3">
                                  {isEs ? "Sin notas aún" : "No notes yet"}
                                </p>
                              )}
                              <div className="flex gap-2">
                                <Input
                                  value={taskNoteContent[task.task_id] || ""}
                                  onChange={(e) => setTaskNoteContent({ ...taskNoteContent, [task.task_id]: e.target.value })}
                                  placeholder={isEs ? "Agregar nota..." : "Add note..."}
                                  className="flex-1"
                                />
                                <Button 
                                  size="sm"
                                  onClick={() => handleAddTaskNote(task.task_id)}
                                  disabled={!taskNoteContent[task.task_id]?.trim()}
                                >
                                  <Send className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Decisions Tab */}
          <TabsContent value="decisions" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">
                  {isEs ? "Registro de Decisiones" : "Decision Log"}
                </CardTitle>
                <Button 
                  size="sm" 
                  onClick={() => setShowDecisionDialog(true)}
                  className="bg-[#AED768] hover:bg-[#9dc856] text-[#1F2937]"
                  data-testid="add-decision-btn"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {isEs ? "Registrar" : "Record"}
                </Button>
              </CardHeader>
              <CardContent>
                {goal.decisions?.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    {isEs ? "No hay decisiones registradas" : "No decisions recorded"}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {goal.decisions?.map((dec) => (
                      <div key={dec.decision_id} className="border-l-2 border-[#AED768] pl-4">
                        <p className="font-medium text-foreground">{dec.decision}</p>
                        {dec.rationale && (
                          <p className="text-sm text-muted-foreground mt-1">
                            <span className="font-medium">{isEs ? "Razón:" : "Rationale:"}</span> {dec.rationale}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          {dec.decided_by_name} • {new Date(dec.date).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Dependencies Tab */}
          <TabsContent value="dependencies" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">
                  {isEs ? "Dependencias" : "Dependencies"}
                </CardTitle>
                <Button 
                  size="sm" 
                  onClick={() => setShowDependencyDialog(true)}
                  className="bg-[#AED768] hover:bg-[#9dc856] text-[#1F2937]"
                  data-testid="add-dependency-btn"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {isEs ? "Agregar" : "Add"}
                </Button>
              </CardHeader>
              <CardContent>
                {goal.dependencies?.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    {isEs ? "No hay dependencias" : "No dependencies"}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {goal.dependencies?.map((dep) => (
                      <div key={dep.dependency_id} className="flex items-center justify-between border border-border rounded-lg p-3">
                        <div>
                          <h4 className="font-medium text-foreground">{dep.title}</h4>
                          {dep.description && (
                            <p className="text-sm text-muted-foreground">{dep.description}</p>
                          )}
                        </div>
                        <Select 
                          value={dep.status} 
                          onValueChange={(v) => handleUpdateDependencyStatus(dep.dependency_id, v)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">{isEs ? "Pendiente" : "Pending"}</SelectItem>
                            <SelectItem value="resolved">{isEs ? "Resuelto" : "Resolved"}</SelectItem>
                            <SelectItem value="blocked">{isEs ? "Bloqueado" : "Blocked"}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">
                  {isEs ? "Notas de la Meta" : "Goal Notes"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-4">
                  <Textarea
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder={isEs ? "Agregar una nota..." : "Add a note..."}
                    rows={2}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleAddGoalNote}
                    disabled={!noteContent.trim() || addingNote}
                    className="bg-[#AED768] hover:bg-[#9dc856] text-[#1F2937]"
                  >
                    {addingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
                
                {goal.notes?.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    {isEs ? "No hay notas aún" : "No notes yet"}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {goal.notes?.map((note) => (
                      <div key={note.note_id} className="bg-muted/50 rounded-lg p-3">
                        <p className="text-foreground">{note.content}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {note.user_name} • {new Date(note.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Create Task Dialog */}
        <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEs ? "Nueva Tarea" : "New Task"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">{isEs ? "Título" : "Title"} *</label>
                <Input
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder={isEs ? "Título de la tarea" : "Task title"}
                  data-testid="task-title-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">{isEs ? "Descripción" : "Description"}</label>
                <Textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder={isEs ? "Descripción opcional" : "Optional description"}
                  rows={2}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">{isEs ? "Fecha Límite" : "Due Date"}</label>
                <Input
                  type="date"
                  value={newTask.due_date}
                  onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTaskDialog(false)}>
                {isEs ? "Cancelar" : "Cancel"}
              </Button>
              <Button 
                onClick={handleCreateTask}
                disabled={creatingTask || !newTask.title}
                className="bg-[#AED768] hover:bg-[#9dc856] text-[#1F2937]"
              >
                {creatingTask && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {isEs ? "Crear Tarea" : "Create Task"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Decision Dialog */}
        <Dialog open={showDecisionDialog} onOpenChange={setShowDecisionDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEs ? "Registrar Decisión" : "Record Decision"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">{isEs ? "Decisión" : "Decision"} *</label>
                <Textarea
                  value={newDecision.decision}
                  onChange={(e) => setNewDecision({ ...newDecision, decision: e.target.value })}
                  placeholder={isEs ? "¿Qué se decidió?" : "What was decided?"}
                  rows={2}
                  data-testid="decision-content-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">{isEs ? "Razón" : "Rationale"}</label>
                <Textarea
                  value={newDecision.rationale}
                  onChange={(e) => setNewDecision({ ...newDecision, rationale: e.target.value })}
                  placeholder={isEs ? "¿Por qué se tomó esta decisión?" : "Why was this decision made?"}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDecisionDialog(false)}>
                {isEs ? "Cancelar" : "Cancel"}
              </Button>
              <Button 
                onClick={handleCreateDecision}
                disabled={creatingDecision || !newDecision.decision}
                className="bg-[#AED768] hover:bg-[#9dc856] text-[#1F2937]"
              >
                {creatingDecision && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {isEs ? "Registrar" : "Record"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Dependency Dialog */}
        <Dialog open={showDependencyDialog} onOpenChange={setShowDependencyDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEs ? "Nueva Dependencia" : "New Dependency"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">{isEs ? "Título" : "Title"} *</label>
                <Input
                  value={newDependency.title}
                  onChange={(e) => setNewDependency({ ...newDependency, title: e.target.value })}
                  placeholder={isEs ? "¿Qué se necesita?" : "What is needed?"}
                  data-testid="dependency-title-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">{isEs ? "Descripción" : "Description"}</label>
                <Textarea
                  value={newDependency.description}
                  onChange={(e) => setNewDependency({ ...newDependency, description: e.target.value })}
                  placeholder={isEs ? "Detalles adicionales" : "Additional details"}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDependencyDialog(false)}>
                {isEs ? "Cancelar" : "Cancel"}
              </Button>
              <Button 
                onClick={handleCreateDependency}
                disabled={creatingDependency || !newDependency.title}
                className="bg-[#AED768] hover:bg-[#9dc856] text-[#1F2937]"
              >
                {creatingDependency && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {isEs ? "Agregar" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
