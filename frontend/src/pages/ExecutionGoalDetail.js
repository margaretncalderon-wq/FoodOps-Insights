import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "../utils/api";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import RichTextEditor from "../components/ui/RichTextEditor";
import NoteAttachments from "../components/ui/NoteAttachments";
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
import { Target, ArrowLeft, Plus, MoreVertical, CheckCircle2, AlertTriangle, Clock, Users, Calendar, Trash2, Edit, MessageSquare, Link2, FileText, GitBranch, Zap, CircleDot, Archive, ChevronDown, ChevronUp, Send, Share2, UserPlus, X } from "lucide-react";
import { KoraLoader } from "../components/KoraLoader";
import { toast } from "sonner";
import ShareEntityDialog from "../components/collaboration/ShareEntityDialog";
import SharedWith from "../components/collaboration/SharedWith";
import { formatDateOnly } from "../utils/dates";

const statusConfig = {
  planning: { labelKey: "planning", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: CircleDot },
  in_progress: { labelKey: "inProgress", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Zap },
  blocked: { labelKey: "blocked", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: AlertTriangle },
  live: { labelKey: "live", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: CheckCircle2 },
  archived: { labelKey: "archived", color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: Archive },
};

const taskStatusConfig = {
  pending: { labelKey: "pending", color: "bg-gray-500/20 text-gray-400" },
  in_progress: { labelKey: "inProgress", color: "bg-yellow-500/20 text-yellow-400" },
  completed: { labelKey: "completed", color: "bg-green-500/20 text-green-400" },
  blocked: { labelKey: "blocked", color: "bg-red-500/20 text-red-400" },
};

const impactConfig = {
  cost: { labelKey: "cost", color: "bg-emerald-500/20 text-emerald-400" },
  quality: { labelKey: "quality", color: "bg-purple-500/20 text-purple-400" },
  speed: { labelKey: "speed", color: "bg-orange-500/20 text-orange-400" },
  risk: { labelKey: "risk", color: "bg-red-500/20 text-red-400" },
};

export default function ExecutionGoalDetail() {
  const { goalId } = useParams();
  const navigate = useNavigate();
  const { language, t } = useLanguage();

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
  const [noteAttachments, setNoteAttachments] = useState([]);
  const [addingNote, setAddingNote] = useState(false);
  
  // Task note
  const [taskNoteContent, setTaskNoteContent] = useState({});
  const [taskNoteAttachments, setTaskNoteAttachments] = useState({});
  const [expandedTask, setExpandedTask] = useState(null);
  
  // Share dialog
  const [showShareDialog, setShowShareDialog] = useState(false);
  
  // Team Access dialog (internal users)
  const [showAccessDialog, setShowAccessDialog] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [goalAccess, setGoalAccess] = useState([]);
  const [newAccessEmail, setNewAccessEmail] = useState("");
  const [newAccessRole, setNewAccessRole] = useState("team_member");
  const [grantingAccess, setGrantingAccess] = useState(false);
  
  // Note editing
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteContent, setEditNoteContent] = useState("");
  const [editNoteAttachments, setEditNoteAttachments] = useState([]);

  const ACCESS_ROLES = [
    { value: "team_member", label: "Team Member", labelEs: "Miembro del Equipo" },
    { value: "collaborator", label: "Collaborator", labelEs: "Colaborador" },
    { value: "viewer", label: "Viewer", labelEs: "Observador" },
  ];

  const fetchGoal = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/execution-hub/goals/${goalId}`, { withCredentials: true });
      setGoal(res.data);
    } catch (error) {
      console.error("Error fetching goal:", error);
      toast.error(t("errorLoadingGoal"));
      navigate("/execution-hub");
    } finally {
      setLoading(false);
    }
  }, [goalId, t, navigate]);

  useEffect(() => {
    fetchGoal();
  }, [fetchGoal]);

  // Fetch team members when access dialog opens
  const fetchTeamAndAccess = useCallback(async () => {
    try {
      const [teamRes, goalRes] = await Promise.all([
        axios.get(`${API}/settings/team`, { withCredentials: true }),
        axios.get(`${API}/execution-hub/goals/${goalId}`, { withCredentials: true })
      ]);
      setTeamMembers(teamRes.data || []);
      setGoalAccess(goalRes.data?.access_list || []);
    } catch (error) {
      console.error("Error fetching team/access:", error);
    }
  }, [goalId]);

  useEffect(() => {
    if (showAccessDialog) {
      fetchTeamAndAccess();
    }
  }, [showAccessDialog, fetchTeamAndAccess]);

  const handleGrantAccess = async () => {
    if (!newAccessEmail) return;
    setGrantingAccess(true);
    try {
      await axios.post(
        `${API}/execution-hub/goals/${goalId}/access`,
        { user_email: newAccessEmail, role: newAccessRole, is_external: false },
        { withCredentials: true }
      );
      toast.success(language === "es" ? "Acceso otorgado" : "Access granted");
      setNewAccessEmail("");
      fetchTeamAndAccess();
      fetchGoal();
    } catch (error) {
      const msg = error.response?.data?.detail || (language === "es" ? "Error al otorgar acceso" : "Error granting access");
      toast.error(msg);
    } finally {
      setGrantingAccess(false);
    }
  };

  const handleRevokeAccess = async (accessId) => {
    try {
      await axios.delete(`${API}/execution-hub/goals/${goalId}/access/${accessId}`, { withCredentials: true });
      toast.success(language === "es" ? "Acceso revocado" : "Access revoked");
      fetchTeamAndAccess();
      fetchGoal();
    } catch (error) {
      toast.error(language === "es" ? "Error al revocar acceso" : "Error revoking access");
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      await axios.put(`${API}/execution-hub/goals/${goalId}`, { status: newStatus }, { withCredentials: true });
      toast.success(t("statusUpdated"));
      fetchGoal();
    } catch (error) {
      toast.error(t("errorUpdating"));
    }
  };

  const handleDeleteGoal = async () => {
    if (!window.confirm(t("confirmDeleteGoal"))) {
      return;
    }
    try {
      await axios.delete(`${API}/execution-hub/goals/${goalId}`, { withCredentials: true });
      toast.success(t("goalDeleted"));
      navigate("/execution-hub");
    } catch (error) {
      toast.error(t("errorDeleting"));
    }
  };

  const handleCreateTask = async () => {
    if (!newTask.title) return;
    setCreatingTask(true);
    try {
      const payload = {
        title: newTask.title,
        description: newTask.description || null,
        due_date: newTask.due_date || null,
      };
      await axios.post(`${API}/execution-hub/goals/${goalId}/tasks`, payload, { withCredentials: true });
      toast.success(t("taskCreated"));
      setShowTaskDialog(false);
      setNewTask({ title: "", description: "", due_date: "" });
      fetchGoal();
    } catch (error) {
      toast.error(t("errorCreatingTask"));
    } finally {
      setCreatingTask(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId, newStatus) => {
    try {
      await axios.put(`${API}/execution-hub/tasks/${taskId}`, { status: newStatus }, { withCredentials: true });
      toast.success(t("taskUpdated"));
      fetchGoal();
    } catch (error) {
      toast.error(t("errorUpdating"));
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm(language === "es" ? "¿Eliminar esta tarea?" : "Delete this task?")) return;
    try {
      await axios.delete(`${API}/execution-hub/tasks/${taskId}`, { withCredentials: true });
      toast.success(language === "es" ? "Tarea eliminada" : "Task deleted");
      fetchGoal();
    } catch (error) {
      toast.error(language === "es" ? "Error al eliminar tarea" : "Error deleting task");
    }
  };

  const handleAddTaskNote = async (taskId) => {
    const content = taskNoteContent[taskId];
    const attachments = taskNoteAttachments[taskId] || [];
    const stripped = (content || '').replace(/<[^>]*>/g, '').trim();
    if (!stripped && attachments.length === 0) return;
    
    try {
      await axios.post(`${API}/execution-hub/tasks/${taskId}/notes`, { 
        content: content || "",
        attachments 
      }, { withCredentials: true });
      toast.success(t("noteAdded"));
      setTaskNoteContent({ ...taskNoteContent, [taskId]: "" });
      setTaskNoteAttachments({ ...taskNoteAttachments, [taskId]: [] });
      fetchGoal();
    } catch (error) {
      toast.error(t("errorAddingNote"));
    }
  };

  const handleCreateDecision = async () => {
    if (!newDecision.decision) return;
    setCreatingDecision(true);
    try {
      await axios.post(`${API}/execution-hub/goals/${goalId}/decisions`, newDecision, { withCredentials: true });
      toast.success(t("decisionRecorded"));
      setShowDecisionDialog(false);
      setNewDecision({ decision: "", rationale: "" });
      fetchGoal();
    } catch (error) {
      toast.error(t("errorRecordingDecision"));
    } finally {
      setCreatingDecision(false);
    }
  };

  const handleCreateDependency = async () => {
    if (!newDependency.title) return;
    setCreatingDependency(true);
    try {
      await axios.post(`${API}/execution-hub/goals/${goalId}/dependencies`, newDependency, { withCredentials: true });
      toast.success(t("dependencyAdded"));
      setShowDependencyDialog(false);
      setNewDependency({ title: "", description: "" });
      fetchGoal();
    } catch (error) {
      toast.error(t("errorAddingDependency"));
    } finally {
      setCreatingDependency(false);
    }
  };

  // Edit/Delete Goal Notes
  const startEditNote = (note, type = "goal") => {
    setEditingNoteId(`${type}_${note.note_id}`);
    setEditNoteContent(note.content || "");
    setEditNoteAttachments(note.attachments || []);
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditNoteContent("");
    setEditNoteAttachments([]);
  };

  const handleUpdateGoalNote = async (noteId) => {
    try {
      await axios.put(`${API}/execution-hub/goals/${goalId}/notes/${noteId}`, {
        content: editNoteContent,
        attachments: editNoteAttachments
      }, { withCredentials: true });
      toast.success(language === "es" ? "Nota actualizada" : "Note updated");
      cancelEditNote();
      fetchGoal();
    } catch (error) {
      toast.error(language === "es" ? "Error al actualizar nota" : "Error updating note");
    }
  };

  const handleDeleteGoalNote = async (noteId) => {
    if (!window.confirm(language === "es" ? "¿Eliminar esta nota?" : "Delete this note?")) return;
    try {
      await axios.delete(`${API}/execution-hub/goals/${goalId}/notes/${noteId}`, { withCredentials: true });
      toast.success(language === "es" ? "Nota eliminada" : "Note deleted");
      fetchGoal();
    } catch (error) {
      toast.error(language === "es" ? "Error al eliminar nota" : "Error deleting note");
    }
  };

  const handleUpdateTaskNote = async (taskId, noteId) => {
    try {
      await axios.put(`${API}/execution-hub/tasks/${taskId}/notes/${noteId}`, {
        content: editNoteContent,
        attachments: editNoteAttachments
      }, { withCredentials: true });
      toast.success(language === "es" ? "Nota actualizada" : "Note updated");
      cancelEditNote();
      fetchGoal();
    } catch (error) {
      toast.error(language === "es" ? "Error al actualizar nota" : "Error updating note");
    }
  };

  const handleDeleteTaskNote = async (taskId, noteId) => {
    if (!window.confirm(language === "es" ? "¿Eliminar esta nota?" : "Delete this note?")) return;
    try {
      await axios.delete(`${API}/execution-hub/tasks/${taskId}/notes/${noteId}`, { withCredentials: true });
      toast.success(language === "es" ? "Nota eliminada" : "Note deleted");
      fetchGoal();
    } catch (error) {
      toast.error(language === "es" ? "Error al eliminar nota" : "Error deleting note");
    }
  };


  const handleUpdateDependencyStatus = async (depId, newStatus) => {
    try {
      await axios.put(`${API}/execution-hub/dependencies/${depId}`, { status: newStatus }, { withCredentials: true });
      toast.success(t("dependencyUpdated"));
      fetchGoal();
    } catch (error) {
      toast.error(t("errorUpdating"));
    }
  };

  const handleAddGoalNote = async () => {
    const stripped = noteContent.replace(/<[^>]*>/g, '').trim();
    if (!stripped && noteAttachments.length === 0) return;
    setAddingNote(true);
    try {
      await axios.post(`${API}/execution-hub/goals/${goalId}/notes`, { 
        content: noteContent,
        attachments: noteAttachments
      }, { withCredentials: true });
      toast.success(t("noteAdded"));
      setNoteContent("");
      setNoteAttachments([]);
      fetchGoal();
    } catch (error) {
      toast.error(t("errorAddingNote"));
    } finally {
      setAddingNote(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <KoraLoader size={32} />
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
                  {t(status.labelKey)}
                </Badge>
                {goal.impact_areas?.map(area => (
                  <Badge key={area} variant="outline" className={`${impactConfig[area]?.color} text-xs border-0`}>
                    {t(impactConfig[area]?.labelKey)}
                  </Badge>
                ))}
              </div>
              <h1 className="text-2xl font-bold text-foreground break-words">{goal.title}</h1>
              <p className="text-muted-foreground mt-1 break-words">{goal.objective}</p>
              <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {goal.owner_name}
                </span>
                {goal.target_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {formatDateOnly(goal.target_date, language)}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Team Access Button - Only for owned projects */}
            {!goal._access_type || goal._access_type === "owner" ? (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowAccessDialog(true)}
                className="text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
                data-testid="team-access-btn"
              >
                <Users className="w-4 h-4 mr-2" />
                {language === "es" ? "Equipo" : "Team"}
              </Button>
            ) : null}
            
            {/* Share Button - Only for owned projects */}
            {!goal._access_type || goal._access_type === "owner" ? (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowShareDialog(true)}
                className="text-purple-400 border-purple-500/30 hover:bg-purple-500/10"
                data-testid="share-goal-btn"
              >
                <Share2 className="w-4 h-4 mr-2" />
                {language === "es" ? "Compartir" : "Share"}
              </Button>
            ) : null}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  {t("changeStatus")}
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
                    {t(config.labelKey)}
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
                  {t("deleteGoal")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Shared With Section - Only visible to owner */}
        <SharedWith 
          entityType="project"
          entityId={goalId}
          entityName={goal.title}
          isOwner={!goal._access_type || goal._access_type === "owner"}
          onShareRevoked={fetchGoal}
        />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50">
            <TabsTrigger value="tasks" className="data-[state=active]:bg-card">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {t("tasks")} ({goal.tasks?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="decisions" className="data-[state=active]:bg-card">
              <FileText className="w-4 h-4 mr-2" />
              {t("decisions")} ({goal.decisions?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="dependencies" className="data-[state=active]:bg-card">
              <GitBranch className="w-4 h-4 mr-2" />
              {t("dependencies")} ({goal.dependencies?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="notes" className="data-[state=active]:bg-card">
              <MessageSquare className="w-4 h-4 mr-2" />
              {t("notes")} ({goal.notes?.length || 0})
            </TabsTrigger>
          </TabsList>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="mt-4">
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">
                  {t("tasks")}
                </CardTitle>
                <Button 
                  size="sm" 
                  onClick={() => setShowTaskDialog(true)}
                  className="bg-[#AED768] hover:bg-[#9dc856] text-[#1F2937]"
                  data-testid="add-task-btn"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {t("add")}
                </Button>
              </CardHeader>
              <CardContent>
                {goal.tasks?.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    {t("noTasksYet")}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {goal.tasks?.map((task) => {
                      const taskStatus = taskStatusConfig[task.status] || taskStatusConfig.pending;
                      const isExpanded = expandedTask === task.task_id;
                      
                      return (
                        <div key={task.task_id} className="border border-border rounded-lg p-3 overflow-hidden">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h4 className="font-medium text-foreground break-words">{task.title}</h4>
                                <Badge className={`${taskStatus.color} text-xs shrink-0`}>
                                  {t(taskStatus.labelKey)}
                                </Badge>
                              </div>
                              {task.description && (
                                <div className="text-sm text-muted-foreground break-words overflow-hidden" dangerouslySetInnerHTML={{ __html: task.description }} />
                              )}
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                {task.due_date && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {formatDateOnly(task.due_date, language)}
                                  </span>
                                )}
                                {task.assignees?.length > 0 && (
                                  <span className="flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    {task.assignees.map(a => a.name).join(", ")}
                                  </span>
                                )}
                                <span>
                                  {task.notes?.length || 0} {t("notes")}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Select 
                                value={task.status} 
                                onValueChange={(v) => handleUpdateTaskStatus(task.task_id, v)}
                              >
                                <SelectTrigger className="w-32 h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">{t("pending")}</SelectItem>
                                  <SelectItem value="in_progress">{t("inProgress")}</SelectItem>
                                  <SelectItem value="completed">{t("completed")}</SelectItem>
                                  <SelectItem value="blocked">{t("blocked")}</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.task_id); }}
                                data-testid={`delete-task-${task.task_id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
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
                              <h5 className="text-sm font-medium mb-2">{t("taskNotes")}</h5>
                              {task.notes?.length > 0 ? (
                                <div className="space-y-2 mb-3">
                                  {task.notes.map((note) => (
                                    <div key={note.note_id} className="bg-muted/50 rounded p-2 text-sm overflow-hidden">
                                      {editingNoteId === `task_${note.note_id}` ? (
                                        <div className="space-y-2">
                                          <RichTextEditor
                                            value={editNoteContent}
                                            onChange={setEditNoteContent}
                                            placeholder={language === "es" ? "Editar nota..." : "Edit note..."}
                                            minHeight="50px"
                                            showAttachments={false}
                                          />
                                          <NoteAttachments
                                            attachments={editNoteAttachments}
                                            onAttachmentsChange={setEditNoteAttachments}
                                          />
                                          <div className="flex justify-end gap-2">
                                            <Button size="sm" variant="ghost" onClick={cancelEditNote}>{language === "es" ? "Cancelar" : "Cancel"}</Button>
                                            <Button size="sm" onClick={() => handleUpdateTaskNote(task.task_id, note.note_id)}>{language === "es" ? "Guardar" : "Save"}</Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="text-foreground break-words overflow-hidden" dangerouslySetInnerHTML={{ __html: note.content }} />
                                          {note.attachments?.length > 0 && (
                                            <div className="mt-1.5">
                                              <NoteAttachments attachments={note.attachments} readOnly />
                                            </div>
                                          )}
                                          <div className="flex items-center justify-between mt-1">
                                            <p className="text-xs text-muted-foreground">
                                              {note.user_name} • {new Date(note.created_at).toLocaleString()}
                                              {note.edited_at && <span className="ml-1">({language === "es" ? "editado" : "edited"})</span>}
                                            </p>
                                            <div className="flex items-center gap-1">
                                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => startEditNote(note, "task")}>
                                                <Edit className="w-3 h-3" />
                                              </Button>
                                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive" onClick={() => handleDeleteTaskNote(task.task_id, note.note_id)}>
                                                <Trash2 className="w-3 h-3" />
                                              </Button>
                                            </div>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground mb-3">
                                  {t("noNotesYet")}
                                </p>
                              )}
                              <RichTextEditor
                                value={taskNoteContent[task.task_id] || ""}
                                onChange={(val) => setTaskNoteContent({ ...taskNoteContent, [task.task_id]: val })}
                                placeholder={language === "es" ? "Agregar nota a la tarea..." : "Add task note..."}
                                minHeight="60px"
                                showAttachments={false}
                              />
                              <div className="mt-2">
                                <NoteAttachments
                                  attachments={taskNoteAttachments[task.task_id] || []}
                                  onAttachmentsChange={(atts) => setTaskNoteAttachments({ ...taskNoteAttachments, [task.task_id]: atts })}
                                />
                              </div>
                              <div className="flex justify-end mt-2">
                                <Button 
                                  size="sm"
                                  onClick={() => handleAddTaskNote(task.task_id)}
                                  disabled={!(taskNoteContent[task.task_id] || '').replace(/<[^>]*>/g, '').trim() && !(taskNoteAttachments[task.task_id]?.length > 0)}
                                >
                                  <Send className="w-4 h-4 mr-1" />
                                  {language === "es" ? "Enviar" : "Send"}
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
                  {t("decisionLog")}
                </CardTitle>
                <Button 
                  size="sm" 
                  onClick={() => setShowDecisionDialog(true)}
                  className="bg-[#AED768] hover:bg-[#9dc856] text-[#1F2937]"
                  data-testid="add-decision-btn"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {t("record")}
                </Button>
              </CardHeader>
              <CardContent>
                {goal.decisions?.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    {t("noDecisionsRecorded")}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {goal.decisions?.map((dec) => (
                      <div key={dec.decision_id} className="border-l-2 border-[#AED768] pl-4 overflow-hidden">
                        <p className="font-medium text-foreground break-words">{dec.decision}</p>
                        {dec.rationale && (
                          <p className="text-sm text-muted-foreground mt-1 break-words">
                            <span className="font-medium">{t("rationale")}:</span> {dec.rationale}
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
                  {t("dependencies")}
                </CardTitle>
                <Button 
                  size="sm" 
                  onClick={() => setShowDependencyDialog(true)}
                  className="bg-[#AED768] hover:bg-[#9dc856] text-[#1F2937]"
                  data-testid="add-dependency-btn"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {t("add")}
                </Button>
              </CardHeader>
              <CardContent>
                {goal.dependencies?.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    {t("noDependencies")}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {goal.dependencies?.map((dep) => (
                      <div key={dep.dependency_id} className="flex items-center justify-between gap-3 border border-border rounded-lg p-3">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-medium text-foreground break-words">{dep.title}</h4>
                          {dep.description && (
                            <p className="text-sm text-muted-foreground break-words">{dep.description}</p>
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
                            <SelectItem value="pending">{t("pending")}</SelectItem>
                            <SelectItem value="resolved">{t("resolved")}</SelectItem>
                            <SelectItem value="blocked">{t("blocked")}</SelectItem>
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
                  {t("goalNotes")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <RichTextEditor
                    value={noteContent}
                    onChange={setNoteContent}
                    placeholder={language === "es" ? "Agregar nota..." : "Add note..."}
                    minHeight="80px"
                    showAttachments={false}
                  />
                  <div className="mt-2">
                    <NoteAttachments
                      attachments={noteAttachments}
                      onAttachmentsChange={setNoteAttachments}
                    />
                  </div>
                  <div className="flex justify-end mt-2">
                    <Button 
                      onClick={handleAddGoalNote}
                      disabled={(!noteContent.replace(/<[^>]*>/g, '').trim() && noteAttachments.length === 0) || addingNote}
                      className="bg-[#AED768] hover:bg-[#9dc856] text-[#1F2937]"
                      size="sm"
                    >
                      {addingNote ? <KoraLoader size={16} className="mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                      {language === "es" ? "Enviar" : "Send"}
                    </Button>
                  </div>
                </div>
                
                {goal.notes?.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    {t("noNotesYet")}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {goal.notes?.map((note) => (
                      <div key={note.note_id} className="bg-muted/50 rounded-lg p-3 overflow-hidden">
                        {editingNoteId === `goal_${note.note_id}` ? (
                          <div className="space-y-2">
                            <RichTextEditor
                              value={editNoteContent}
                              onChange={setEditNoteContent}
                              placeholder={language === "es" ? "Editar nota..." : "Edit note..."}
                              minHeight="60px"
                              showAttachments={false}
                            />
                            <NoteAttachments
                              attachments={editNoteAttachments}
                              onAttachmentsChange={setEditNoteAttachments}
                            />
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="ghost" onClick={cancelEditNote}>{language === "es" ? "Cancelar" : "Cancel"}</Button>
                              <Button size="sm" onClick={() => handleUpdateGoalNote(note.note_id)}>{language === "es" ? "Guardar" : "Save"}</Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="text-foreground text-sm break-words overflow-wrap-anywhere" dangerouslySetInnerHTML={{ __html: note.content }} />
                            {note.attachments?.length > 0 && (
                              <div className="mt-2">
                                <NoteAttachments attachments={note.attachments} readOnly />
                              </div>
                            )}
                            <div className="flex items-center justify-between mt-2">
                              <p className="text-xs text-muted-foreground">
                                {note.user_name} • {new Date(note.created_at).toLocaleString()}
                                {note.edited_at && <span className="ml-1">({language === "es" ? "editado" : "edited"})</span>}
                              </p>
                              <div className="flex items-center gap-1">
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => startEditNote(note, "goal")} data-testid={`edit-goal-note-${note.note_id}`}>
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => handleDeleteGoalNote(note.note_id)} data-testid={`delete-goal-note-${note.note_id}`}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </>
                        )}
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
              <DialogTitle>{t("newTask")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t("goalTitle")} *</label>
                <Input
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder={t("taskTitle")}
                  data-testid="task-title-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t("taskDescription")}</label>
                <RichTextEditor
                  value={newTask.description}
                  onChange={(val) => setNewTask({ ...newTask, description: val })}
                  placeholder={language === "es" ? "Descripción opcional (usa checklists, resaltado, etc.)" : "Optional description (use checklists, highlights, etc.)"}
                  minHeight="100px"
                  showAttachments={false}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t("dueDate")}</label>
                <Input
                  type="date"
                  value={newTask.due_date}
                  onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTaskDialog(false)}>
                {t("cancel")}
              </Button>
              <Button 
                onClick={handleCreateTask}
                disabled={creatingTask || !newTask.title}
                className="bg-[#AED768] hover:bg-[#9dc856] text-[#1F2937]"
              >
                {creatingTask && <KoraLoader size={16} className="mr-2" />}
                {t("createTask")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Decision Dialog */}
        <Dialog open={showDecisionDialog} onOpenChange={setShowDecisionDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("recordDecision")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t("decisionContent")} *</label>
                <Textarea
                  value={newDecision.decision}
                  onChange={(e) => setNewDecision({ ...newDecision, decision: e.target.value })}
                  placeholder={language === "es" ? "¿Qué se decidió?" : "What was decided?"}
                  rows={2}
                  data-testid="decision-content-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t("rationale")}</label>
                <Textarea
                  value={newDecision.rationale}
                  onChange={(e) => setNewDecision({ ...newDecision, rationale: e.target.value })}
                  placeholder={language === "es" ? "¿Por qué se tomó esta decisión?" : "Why was this decision made?"}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDecisionDialog(false)}>
                {t("cancel")}
              </Button>
              <Button 
                onClick={handleCreateDecision}
                disabled={creatingDecision || !newDecision.decision}
                className="bg-[#AED768] hover:bg-[#9dc856] text-[#1F2937]"
              >
                {creatingDecision && <KoraLoader size={16} className="mr-2" />}
                {t("record")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Dependency Dialog */}
        <Dialog open={showDependencyDialog} onOpenChange={setShowDependencyDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("newDependency")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t("goalTitle")} *</label>
                <Input
                  value={newDependency.title}
                  onChange={(e) => setNewDependency({ ...newDependency, title: e.target.value })}
                  placeholder={language === "es" ? "¿Qué se necesita?" : "What is needed?"}
                  data-testid="dependency-title-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t("taskDescription")}</label>
                <Textarea
                  value={newDependency.description}
                  onChange={(e) => setNewDependency({ ...newDependency, description: e.target.value })}
                  placeholder={language === "es" ? "Detalles adicionales" : "Additional details"}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDependencyDialog(false)}>
                {t("cancel")}
              </Button>
              <Button 
                onClick={handleCreateDependency}
                disabled={creatingDependency || !newDependency.title}
                className="bg-[#AED768] hover:bg-[#9dc856] text-[#1F2937]"
              >
                {creatingDependency && <KoraLoader size={16} className="mr-2" />}
                {t("add")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Share Entity Dialog */}
        <ShareEntityDialog
          open={showShareDialog}
          onOpenChange={setShowShareDialog}
          entityType="project"
          entityId={goalId}
          entityName={goal.title}
          onShareComplete={fetchGoal}
        />

        {/* Team Access Dialog (Internal Users) */}
        <Dialog open={showAccessDialog} onOpenChange={setShowAccessDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" />
                {language === "es" ? "Gestionar Equipo" : "Manage Team Access"}
              </DialogTitle>
              <DialogDescription>
                {language === "es" 
                  ? `Asigna miembros de tu equipo a "${goal.title}"`
                  : `Assign team members to "${goal.title}"`}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Add New Access */}
              <div className="flex gap-2">
                <Select value={newAccessEmail} onValueChange={setNewAccessEmail}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={language === "es" ? "Seleccionar usuario..." : "Select user..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers
                      .filter(m => !goalAccess.find(a => a.user_email === m.email))
                      .map(member => (
                        <SelectItem key={member.user_id} value={member.email}>
                          {member.name || member.email}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                
                <Select value={newAccessRole} onValueChange={setNewAccessRole}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCESS_ROLES.map(role => (
                      <SelectItem key={role.value} value={role.value}>
                        {language === "es" ? role.labelEs : role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Button 
                  onClick={handleGrantAccess} 
                  disabled={!newAccessEmail || grantingAccess}
                  size="icon"
                  data-testid="grant-access-btn"
                >
                  {grantingAccess ? <KoraLoader size={16} /> : <UserPlus className="w-4 h-4" />}
                </Button>
              </div>
              
              {teamMembers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {language === "es" 
                    ? "No hay miembros en tu equipo. Agrega usuarios desde Configuración > Equipo." 
                    : "No team members found. Add users from Settings > Team."}
                </p>
              )}
              
              {/* Current Access List */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {language === "es" ? "Usuarios con acceso" : "Users with access"}
                </label>
                
                {goalAccess.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    {language === "es" ? "No hay usuarios asignados" : "No users assigned"}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {goalAccess.map(access => (
                      <div 
                        key={access.access_id} 
                        className="flex items-center justify-between p-2 bg-muted rounded-lg"
                      >
                        <div>
                          <p className="text-sm font-medium">{access.user_name || access.user_email}</p>
                          <p className="text-xs text-muted-foreground">{access.user_email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {ACCESS_ROLES.find(r => r.value === access.role)?.[language === "es" ? 'labelEs' : 'label'] || access.role}
                          </Badge>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleRevokeAccess(access.access_id)}
                            className="h-8 w-8"
                            data-testid={`revoke-access-${access.access_id}`}
                          >
                            <X className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAccessDialog(false)}>
                {language === "es" ? "Cerrar" : "Close"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
