import { useState, useEffect } from "react";
import axios from "axios";
import { API } from "../utils/api";
import { useLanguage } from "../contexts/LanguageContext";
import { formatDateOnly } from "../utils/dates";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "./ui/dialog";
import { Target, Plus, Trash2, GripVertical, Rocket, CheckCircle, Calendar } from "lucide-react";
import { KoraLoader } from "./KoraLoader";
import { toast } from "sonner";

export default function SendToExecutionModal({ 
  open, 
  onClose, 
  event, 
  industry = "events_hospitality",
  onSuccess 
}) {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalObjective, setGoalObjective] = useState("");

  // Load default tasks for industry
  useEffect(() => {
    if (open && event) {
      setGoalTitle(`Ejecutar: ${event.name}`);
      setGoalObjective(`Completar exitosamente el proyecto/evento: ${event.name}`);
      loadDefaultTasks();
    }
  }, [open, event, industry]);

  const loadDefaultTasks = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/execution-hub/default-tasks/${industry}`, { withCredentials: true });
      const defaultTasks = res.data.tasks.map((t, idx) => ({
        id: `task_${idx}`,
        title: t.title_es || t.title,
        description: "",
        order: t.order || idx + 1,
      }));
      setTasks(defaultTasks);
    } catch (error) {
      console.error("Failed to load default tasks:", error);
      // Fallback tasks
      setTasks([
        { id: "task_1", title: "Planificación inicial", description: "", order: 1 },
        { id: "task_2", title: "Preparación de recursos", description: "", order: 2 },
        { id: "task_3", title: "Ejecución", description: "", order: 3 },
        { id: "task_4", title: "Control de calidad", description: "", order: 4 },
        { id: "task_5", title: "Cierre y seguimiento", description: "", order: 5 },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTask = () => {
    const newTask = {
      id: `task_new_${Date.now()}`,
      title: "",
      description: "",
      order: tasks.length + 1,
    };
    setTasks([...tasks, newTask]);
  };

  const handleRemoveTask = (taskId) => {
    setTasks(tasks.filter(t => t.id !== taskId));
  };

  const handleTaskChange = (taskId, field, value) => {
    setTasks(tasks.map(t => 
      t.id === taskId ? { ...t, [field]: value } : t
    ));
  };

  const handleSend = async () => {
    if (!goalTitle.trim()) {
      toast.error(language === "es" ? "Ingresa un título para la meta" : "Enter a goal title");
      return;
    }
    if (tasks.filter(t => t.title.trim()).length === 0) {
      toast.error(language === "es" ? "Agrega al menos una tarea" : "Add at least one task");
      return;
    }

    setSending(true);
    try {
      const payload = {
        title: goalTitle,
        objective: goalObjective,
        tasks: tasks.filter(t => t.title.trim()).map(t => ({
          title: t.title,
          description: t.description,
        })),
        impact_areas: ["quality", "speed"],
      };

      const res = await axios.post(
        `${API}/execution-hub/from-event/${event.event_id}`,
        payload,
        { withCredentials: true }
      );

      toast.success(
        language === "es" 
          ? "¡Meta de ejecución creada exitosamente!" 
          : "Execution goal created successfully!"
      );

      if (onSuccess) {
        onSuccess(res.data);
      }
      onClose();
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(detail || (language === "es" ? "Error al crear la meta" : "Error creating goal"));
    } finally {
      setSending(false);
    }
  };

  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            {language === "es" ? "Enviar a Execution Hub" : "Send to Execution Hub"}
          </DialogTitle>
          <DialogDescription>
            {language === "es" 
              ? "Crea una meta de ejecución con tareas para gestionar este proyecto"
              : "Create an execution goal with tasks to manage this project"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <KoraLoader size={32} />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Event Info */}
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{event.name}</p>
                  <p className="text-sm text-muted-foreground">{event.event_type}</p>
                </div>
                {event.event_date && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDateOnly(event.event_date, language)}
                  </Badge>
                )}
              </div>
            </div>

            {/* Goal Title */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {language === "es" ? "Título de la Meta" : "Goal Title"}
              </label>
              <Input
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
                placeholder={language === "es" ? "ej: Ejecutar Boda García" : "e.g., Execute Garcia Wedding"}
                data-testid="goal-title-input"
              />
            </div>

            {/* Objective */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {language === "es" ? "Objetivo" : "Objective"}
              </label>
              <Textarea
                value={goalObjective}
                onChange={(e) => setGoalObjective(e.target.value)}
                placeholder={language === "es" ? "Describe el objetivo de esta meta" : "Describe the goal objective"}
                rows={2}
              />
            </div>

            {/* Tasks */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  {language === "es" ? "Tareas Iniciales" : "Initial Tasks"}
                </label>
                <Button variant="outline" size="sm" onClick={handleAddTask}>
                  <Plus className="w-4 h-4 mr-1" />
                  {language === "es" ? "Agregar" : "Add"}
                </Button>
              </div>

              <div className="space-y-2">
                {tasks.map((task, idx) => (
                  <div 
                    key={task.id} 
                    className="flex items-center gap-2 p-3 bg-background border rounded-lg group"
                  >
                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                    <span className="text-sm text-muted-foreground w-6">{idx + 1}.</span>
                    <Input
                      value={task.title}
                      onChange={(e) => handleTaskChange(task.id, "title", e.target.value)}
                      placeholder={language === "es" ? "Título de la tarea" : "Task title"}
                      className="flex-1"
                      data-testid={`task-input-${idx}`}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveTask(task.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {tasks.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {language === "es" ? "No hay tareas. Agrega al menos una." : "No tasks. Add at least one."}
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            {language === "es" ? "Cancelar" : "Cancel"}
          </Button>
          <Button 
            onClick={handleSend} 
            disabled={loading || sending}
            className="bg-primary"
            data-testid="confirm-send-to-execution-btn"
          >
            {sending ? (
              <>
                <KoraLoader size={16} className="mr-2" />
                {language === "es" ? "Creando..." : "Creating..."}
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4 mr-2" />
                {language === "es" ? "Crear Meta de Ejecución" : "Create Execution Goal"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
