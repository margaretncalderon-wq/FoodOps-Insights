import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
import { Progress } from "../ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  UserPlus, Search, RefreshCw, MoreHorizontal,
  CheckCircle2, Clock, FileText, Users, Calendar,
  Laptop, Key, BookOpen, Shield, Plus, ClipboardList,
  ChevronRight, AlertCircle, Check
} from "lucide-react";
import { toast } from "sonner";

import { API_BASE as API } from "../../utils/api";

const ONBOARDING_STATUS = {
  not_started: { label: "Not Started", labelEs: "No Iniciado", color: "bg-slate-100 text-slate-700" },
  in_progress: { label: "In Progress", labelEs: "En Progreso", color: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed", labelEs: "Completado", color: "bg-green-100 text-green-700" },
  blocked: { label: "Blocked", labelEs: "Bloqueado", color: "bg-red-100 text-red-700" }
};

const TASK_CATEGORIES = {
  documentation: { label: "Documentation", labelEs: "Documentación", icon: FileText, color: "text-blue-600" },
  equipment: { label: "Equipment", labelEs: "Equipamiento", icon: Laptop, color: "text-purple-600" },
  access: { label: "System Access", labelEs: "Accesos", icon: Key, color: "text-amber-600" },
  training: { label: "Training", labelEs: "Capacitación", icon: BookOpen, color: "text-green-600" },
  compliance: { label: "Compliance", labelEs: "Cumplimiento", icon: Shield, color: "text-red-600" },
  other: { label: "Other", labelEs: "Otros", icon: ClipboardList, color: "text-gray-600" }
};

// Default onboarding checklist template
const DEFAULT_CHECKLIST = [
  { category: "documentation", task: "Contract signed", taskEs: "Contrato firmado" },
  { category: "documentation", task: "Tax forms completed", taskEs: "Formularios fiscales completados" },
  { category: "documentation", task: "Emergency contact provided", taskEs: "Contacto de emergencia proporcionado" },
  { category: "documentation", task: "Bank account for payroll", taskEs: "Cuenta bancaria para nómina" },
  { category: "equipment", task: "Laptop/Computer assigned", taskEs: "Laptop/Computadora asignada" },
  { category: "equipment", task: "Phone/Extension configured", taskEs: "Teléfono/Extensión configurado" },
  { category: "equipment", task: "Uniform/Dress code items", taskEs: "Uniforme/Artículos de vestimenta" },
  { category: "access", task: "Email account created", taskEs: "Cuenta de email creada" },
  { category: "access", task: "System credentials provided", taskEs: "Credenciales de sistema proporcionadas" },
  { category: "access", task: "Building access card", taskEs: "Tarjeta de acceso al edificio" },
  { category: "training", task: "Company orientation", taskEs: "Orientación de la empresa" },
  { category: "training", task: "Role-specific training", taskEs: "Capacitación específica del rol" },
  { category: "training", task: "Safety training", taskEs: "Capacitación de seguridad" },
  { category: "compliance", task: "NDA signed", taskEs: "NDA firmado" },
  { category: "compliance", task: "Policy handbook reviewed", taskEs: "Manual de políticas revisado" }
];

export function OnboardingSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [onboardings, setOnboardings] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("in_progress");
  
  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedOnboarding, setSelectedOnboarding] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Create form
  const [createForm, setCreateForm] = useState({
    employee_id: "",
    start_date: new Date().toISOString().split("T")[0],
    target_completion_date: "",
    notes: ""
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [onbRes, empRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/onboarding?status=${statusFilter}`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/employees?status=active`, { withCredentials: true })
      ]);
      setOnboardings(onbRes.data || []);
      setEmployees(empRes.data || []);
    } catch (err) {
      console.error("Error fetching onboarding data:", err);
      setOnboardings([]);
      setEmployees([]);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateOnboarding = async () => {
    if (!createForm.employee_id) {
      toast.error(isEs ? "Selecciona un empleado" : "Select an employee");
      return;
    }
    setSaving(true);
    try {
      // Create onboarding with default checklist
      const checklist = DEFAULT_CHECKLIST.map((item, idx) => ({
        id: `task_${idx}`,
        category: item.category,
        task: isEs ? item.taskEs : item.task,
        completed: false,
        completed_at: null,
        completed_by: null
      }));
      
      await axios.post(`${API}/api/people-ops/onboarding`, {
        ...createForm,
        checklist,
        status: "not_started"
      }, { withCredentials: true });
      
      toast.success(isEs ? "Onboarding creado" : "Onboarding created");
      setCreateDialogOpen(false);
      setCreateForm({
        employee_id: "",
        start_date: new Date().toISOString().split("T")[0],
        target_completion_date: "",
        notes: ""
      });
      fetchData();
    } catch (err) {
      toast.error(isEs ? "Error al crear onboarding" : "Error creating onboarding");
    }
    setSaving(false);
  };

  const handleToggleTask = async (onboardingId, taskId, completed) => {
    try {
      await axios.patch(
        `${API}/api/people-ops/onboarding/${onboardingId}/task/${taskId}`,
        { completed },
        { withCredentials: true }
      );
      
      // Update local state
      setOnboardings(prev => prev.map(onb => {
        if (onb.id === onboardingId) {
          const updatedChecklist = onb.checklist.map(task => 
            task.id === taskId 
              ? { ...task, completed, completed_at: completed ? new Date().toISOString() : null }
              : task
          );
          return { ...onb, checklist: updatedChecklist };
        }
        return onb;
      }));
      
      // Also update selected onboarding if viewing detail
      if (selectedOnboarding?.id === onboardingId) {
        setSelectedOnboarding(prev => ({
          ...prev,
          checklist: prev.checklist.map(task =>
            task.id === taskId
              ? { ...task, completed, completed_at: completed ? new Date().toISOString() : null }
              : task
          )
        }));
      }
    } catch (err) {
      toast.error(isEs ? "Error al actualizar" : "Error updating");
    }
  };

  const handleUpdateStatus = async (onboardingId, newStatus) => {
    try {
      await axios.patch(
        `${API}/api/people-ops/onboarding/${onboardingId}/status`,
        { status: newStatus },
        { withCredentials: true }
      );
      toast.success(isEs ? "Estado actualizado" : "Status updated");
      fetchData();
      setDetailDialogOpen(false);
    } catch (err) {
      toast.error(isEs ? "Error al actualizar" : "Error updating");
    }
  };

  const getProgress = (checklist) => {
    if (!checklist || checklist.length === 0) return 0;
    const completed = checklist.filter(t => t.completed).length;
    return Math.round((completed / checklist.length) * 100);
  };

  const getEmployeeName = (employeeId) => {
    const emp = employees.find(e => e.id === employeeId);
    return emp ? `${emp.first_name} ${emp.last_name}` : "Unknown";
  };

  const filteredOnboardings = onboardings.filter(onb => {
    const empName = getEmployeeName(onb.employee_id).toLowerCase();
    return empName.includes(searchTerm.toLowerCase());
  });

  // Stats
  const stats = {
    total: onboardings.length,
    inProgress: onboardings.filter(o => o.status === "in_progress").length,
    completed: onboardings.filter(o => o.status === "completed").length,
    blocked: onboardings.filter(o => o.status === "blocked").length
  };

  return (
    <div className="space-y-6" data-testid="onboarding-section">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-slate-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Total Onboardings" : "Total Onboardings"}</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Users className="w-8 h-8 text-slate-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "En Progreso" : "In Progress"}</p>
                <p className="text-2xl font-bold">{stats.inProgress}</p>
              </div>
              <Clock className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Completados" : "Completed"}</p>
                <p className="text-2xl font-bold">{stats.completed}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Bloqueados" : "Blocked"}</p>
                <p className="text-2xl font-bold">{stats.blocked}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]" data-testid="status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
              <SelectItem value="not_started">{isEs ? "No Iniciado" : "Not Started"}</SelectItem>
              <SelectItem value="in_progress">{isEs ? "En Progreso" : "In Progress"}</SelectItem>
              <SelectItem value="completed">{isEs ? "Completado" : "Completed"}</SelectItem>
              <SelectItem value="blocked">{isEs ? "Bloqueado" : "Blocked"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={isEs ? "Buscar empleado..." : "Search employee..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-[200px]"
              data-testid="search-input"
            />
          </div>
          <Button onClick={fetchData} variant="outline" size="icon" data-testid="refresh-btn">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="new-onboarding-btn">
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Nuevo Onboarding" : "New Onboarding"}
          </Button>
        </div>
      </div>

      {/* Onboarding Cards */}
      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredOnboardings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">{isEs ? "No hay onboardings" : "No onboardings found"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOnboardings.map((onb) => {
            const progress = getProgress(onb.checklist);
            const statusInfo = ONBOARDING_STATUS[onb.status] || ONBOARDING_STATUS.not_started;
            const employee = employees.find(e => e.id === onb.employee_id);
            
            return (
              <Card 
                key={onb.id} 
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  setSelectedOnboarding(onb);
                  setDetailDialogOpen(true);
                }}
                data-testid={`onboarding-card-${onb.id}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">
                        {employee ? `${employee.first_name} ${employee.last_name}` : "Unknown"}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {employee?.job_title || (isEs ? "Sin puesto" : "No position")}
                      </p>
                    </div>
                    <Badge className={statusInfo.color}>
                      {isEs ? statusInfo.labelEs : statusInfo.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">{isEs ? "Progreso" : "Progress"}</span>
                        <span className="font-medium">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {isEs ? "Inicio" : "Start"}: {onb.start_date ? new Date(onb.start_date).toLocaleDateString() : "-"}
                      </div>
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        {onb.checklist?.filter(t => t.completed).length || 0}/{onb.checklist?.length || 0}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Onboarding Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEs ? "Nuevo Onboarding" : "New Onboarding"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{isEs ? "Empleado" : "Employee"} *</label>
              <Select 
                value={createForm.employee_id} 
                onValueChange={(v) => setCreateForm({ ...createForm, employee_id: v })}
              >
                <SelectTrigger data-testid="employee-select">
                  <SelectValue placeholder={isEs ? "Seleccionar empleado" : "Select employee"} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name} - {emp.job_title || "N/A"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Fecha de Inicio" : "Start Date"}</label>
                <Input
                  type="date"
                  value={createForm.start_date}
                  onChange={(e) => setCreateForm({ ...createForm, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Fecha Meta" : "Target Date"}</label>
                <Input
                  type="date"
                  value={createForm.target_completion_date}
                  onChange={(e) => setCreateForm({ ...createForm, target_completion_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{isEs ? "Notas" : "Notes"}</label>
              <Textarea
                value={createForm.notes}
                onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreateOnboarding} disabled={saving} data-testid="create-onboarding-btn">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              {isEs ? "Crear" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Onboarding Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedOnboarding && (
            <>
              <DialogHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <DialogTitle className="text-xl">
                      {getEmployeeName(selectedOnboarding.employee_id)}
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {isEs ? "Progreso del Onboarding" : "Onboarding Progress"}
                    </p>
                  </div>
                  <Badge className={ONBOARDING_STATUS[selectedOnboarding.status]?.color}>
                    {isEs 
                      ? ONBOARDING_STATUS[selectedOnboarding.status]?.labelEs 
                      : ONBOARDING_STATUS[selectedOnboarding.status]?.label
                    }
                  </Badge>
                </div>
              </DialogHeader>
              
              <div className="py-4">
                {/* Progress Overview */}
                <div className="mb-6">
                  <div className="flex justify-between text-sm mb-2">
                    <span>{isEs ? "Progreso General" : "Overall Progress"}</span>
                    <span className="font-medium">{getProgress(selectedOnboarding.checklist)}%</span>
                  </div>
                  <Progress value={getProgress(selectedOnboarding.checklist)} className="h-3" />
                </div>

                {/* Checklist by Category */}
                <div className="space-y-4">
                  {Object.entries(TASK_CATEGORIES).map(([catKey, catInfo]) => {
                    const categoryTasks = selectedOnboarding.checklist?.filter(t => t.category === catKey) || [];
                    if (categoryTasks.length === 0) return null;
                    
                    const Icon = catInfo.icon;
                    const completedCount = categoryTasks.filter(t => t.completed).length;
                    
                    return (
                      <div key={catKey} className="border rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Icon className={`w-5 h-5 ${catInfo.color}`} />
                          <h4 className="font-medium">{isEs ? catInfo.labelEs : catInfo.label}</h4>
                          <Badge variant="secondary" className="ml-auto">
                            {completedCount}/{categoryTasks.length}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          {categoryTasks.map((task) => (
                            <div 
                              key={task.id} 
                              className="flex items-center gap-3 p-2 rounded hover:bg-muted/50"
                            >
                              <Checkbox
                                checked={task.completed}
                                onCheckedChange={(checked) => 
                                  handleToggleTask(selectedOnboarding.id, task.id, checked)
                                }
                                data-testid={`task-checkbox-${task.id}`}
                              />
                              <span className={task.completed ? "line-through text-muted-foreground" : ""}>
                                {task.task}
                              </span>
                              {task.completed && (
                                <Check className="w-4 h-4 text-green-600 ml-auto" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                {selectedOnboarding.status !== "completed" && (
                  <Button 
                    variant="outline" 
                    onClick={() => handleUpdateStatus(selectedOnboarding.id, "blocked")}
                    className="text-red-600"
                  >
                    <AlertCircle className="w-4 h-4 mr-2" />
                    {isEs ? "Marcar Bloqueado" : "Mark Blocked"}
                  </Button>
                )}
                {selectedOnboarding.status === "not_started" && (
                  <Button 
                    variant="outline" 
                    onClick={() => handleUpdateStatus(selectedOnboarding.id, "in_progress")}
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    {isEs ? "Iniciar" : "Start"}
                  </Button>
                )}
                {selectedOnboarding.status !== "completed" && getProgress(selectedOnboarding.checklist) === 100 && (
                  <Button 
                    onClick={() => handleUpdateStatus(selectedOnboarding.id, "completed")}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {isEs ? "Completar Onboarding" : "Complete Onboarding"}
                  </Button>
                )}
                <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
                  {isEs ? "Cerrar" : "Close"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
