// components/automation/AutomationSection.js - Automation Engine UI
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useLanguage } from "../../contexts/LanguageContext";
import { API_BASE as API } from "../../utils/api";

// UI Components
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

// Icons
import {
  Zap, Plus, Play, Pause, Trash2, History,
  ChevronRight, MoreVertical, Loader2, CheckCircle2,
  AlertCircle, Clock, Sparkles, Edit
} from "lucide-react";

// Workflow Builder
import WorkflowBuilder from "./WorkflowBuilder";

// Trigger type labels
const TRIGGER_LABELS = {
  lead_created: { en: "Lead Created", es: "Lead Creado", icon: "👤" },
  lead_status_changed: { en: "Lead Status Changed", es: "Estado de Lead Cambió", icon: "🔄" },
  lead_assigned: { en: "Lead Assigned", es: "Lead Asignado", icon: "👥" },
  client_created: { en: "Client Created", es: "Cliente Creado", icon: "🏢" },
  client_inactive_days: { en: "Client Inactive", es: "Cliente Inactivo", icon: "⏰" },
  event_created: { en: "Event Created", es: "Evento Creado", icon: "📅" },
  event_status_changed: { en: "Event Status Changed", es: "Estado de Evento Cambió", icon: "📊" },
  event_date_approaching: { en: "Event Approaching", es: "Evento Próximo", icon: "🗓️" },
  proposal_created: { en: "Proposal Created", es: "Propuesta Creada", icon: "📄" },
  proposal_amount_threshold: { en: "Proposal Amount Threshold", es: "Umbral de Monto", icon: "💰" },
  follow_up_overdue: { en: "Follow-up Overdue", es: "Seguimiento Vencido", icon: "⚠️" },
  scheduled: { en: "Scheduled", es: "Programado", icon: "🕐" },
};

export default function AutomationSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [rules, setRules] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("rules");
  
  // Dialog states
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderRule, setBuilderRule] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, templatesRes, logsRes, statsRes] = await Promise.all([
        axios.get(`${API}/api/automation/rules`, { withCredentials: true }),
        axios.get(`${API}/api/automation/templates`, { withCredentials: true }),
        axios.get(`${API}/api/automation/logs?limit=20`, { withCredentials: true }),
        axios.get(`${API}/api/automation/stats`, { withCredentials: true })
      ]);
      
      setRules(rulesRes.data.rules || []);
      setTemplates(templatesRes.data.templates || []);
      setLogs(logsRes.data.logs || []);
      setStats(statsRes.data);
    } catch (err) {
      console.error("Error fetching automation data:", err);
      toast.error(isEs ? "Error cargando datos" : "Error loading data");
    }
    setLoading(false);
  }, [isEs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleRule = async (ruleId) => {
    try {
      const res = await axios.post(`${API}/api/automation/rules/${ruleId}/toggle`, {}, { withCredentials: true });
      toast.success(res.data.status === "active" 
        ? (isEs ? "Regla activada" : "Rule activated")
        : (isEs ? "Regla pausada" : "Rule paused")
      );
      fetchData();
    } catch (err) {
      toast.error(isEs ? "Error al cambiar estado" : "Error toggling rule");
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!confirm(isEs ? "¿Eliminar esta regla?" : "Delete this rule?")) return;
    
    try {
      await axios.delete(`${API}/api/automation/rules/${ruleId}`, { withCredentials: true });
      toast.success(isEs ? "Regla eliminada" : "Rule deleted");
      fetchData();
    } catch (err) {
      toast.error(isEs ? "Error al eliminar" : "Error deleting rule");
    }
  };

  const handleCreateFromTemplate = async (template) => {
    try {
      const res = await axios.post(
        `${API}/api/automation/templates/${template.template_id}/create`,
        { name: `${template.name} (Copy)` },
        { withCredentials: true }
      );
      toast.success(isEs ? "Regla creada desde plantilla" : "Rule created from template");
      setTemplateDialogOpen(false);
      // Open the builder to edit the created rule
      setBuilderRule(res.data);
      setShowBuilder(true);
      fetchData();
    } catch (err) {
      toast.error(isEs ? "Error creando regla" : "Error creating rule");
    }
  };

  const handleSaveWorkflow = async (workflow) => {
    try {
      if (builderRule?.rule_id) {
        // Update existing rule
        await axios.put(
          `${API}/api/automation/rules/${builderRule.rule_id}`,
          {
            name: workflow.name,
            description: workflow.description,
            trigger: workflow.trigger,
            actions: workflow.actions,
            status: workflow.status
          },
          { withCredentials: true }
        );
        toast.success(isEs ? "Workflow actualizado" : "Workflow updated");
      } else {
        // Create new rule
        await axios.post(
          `${API}/api/automation/rules`,
          {
            name: workflow.name,
            description: workflow.description,
            trigger: workflow.trigger,
            actions: workflow.actions,
            status: "draft"
          },
          { withCredentials: true }
        );
        toast.success(isEs ? "Workflow creado" : "Workflow created");
      }
      setShowBuilder(false);
      setBuilderRule(null);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error guardando workflow" : "Error saving workflow");
    }
  };

  const handleEditRule = (rule) => {
    setBuilderRule(rule);
    setShowBuilder(true);
  };

  const handleNewWorkflow = () => {
    setBuilderRule(null);
    setShowBuilder(true);
  };

  const getStatusBadge = (status) => {
    const variants = {
      active: { variant: "default", className: "bg-green-500", label: isEs ? "Activa" : "Active" },
      paused: { variant: "secondary", className: "bg-amber-500", label: isEs ? "Pausada" : "Paused" },
      draft: { variant: "outline", className: "", label: isEs ? "Borrador" : "Draft" }
    };
    const config = variants[status] || variants.draft;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="automation-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            {isEs ? "Automatización" : "Automation"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs 
              ? "Crea reglas para automatizar tareas repetitivas"
              : "Create rules to automate repetitive tasks"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTemplateDialogOpen(true)}>
            <Sparkles className="w-4 h-4 mr-2" />
            {isEs ? "Plantillas" : "Templates"}
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Nueva Regla" : "New Rule"}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{stats.rules?.active || 0}</p>
                  <p className="text-xs text-muted-foreground">{isEs ? "Reglas Activas" : "Active Rules"}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Play className="w-5 h-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{stats.rules?.paused || 0}</p>
                  <p className="text-xs text-muted-foreground">{isEs ? "Pausadas" : "Paused"}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <Pause className="w-5 h-5 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{stats.executions?.today || 0}</p>
                  <p className="text-xs text-muted-foreground">{isEs ? "Ejecuciones Hoy" : "Executions Today"}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{stats.executions?.success_rate || 100}%</p>
                  <p className="text-xs text-muted-foreground">{isEs ? "Tasa de Éxito" : "Success Rate"}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="rules">
            <Zap className="w-4 h-4 mr-2" />
            {isEs ? "Reglas" : "Rules"}
            <Badge variant="secondary" className="ml-2">{rules.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="logs">
            <History className="w-4 h-4 mr-2" />
            {isEs ? "Historial" : "History"}
          </TabsTrigger>
        </TabsList>

        {/* Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          {rules.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Zap className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">
                  {isEs ? "Sin reglas de automatización" : "No automation rules"}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {isEs 
                    ? "Crea tu primera regla para automatizar procesos"
                    : "Create your first rule to automate processes"}
                </p>
                <div className="flex justify-center gap-2">
                  <Button variant="outline" onClick={() => setTemplateDialogOpen(true)}>
                    <Sparkles className="w-4 h-4 mr-2" />
                    {isEs ? "Usar Plantilla" : "Use Template"}
                  </Button>
                  <Button onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    {isEs ? "Crear Regla" : "Create Rule"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => {
                const TriggerIcon = TRIGGER_LABELS[rule.trigger?.type]?.icon || Zap;
                return (
                  <Card key={rule.rule_id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            rule.status === "active" ? "bg-green-100" : "bg-muted"
                          }`}>
                            <TriggerIcon className={`w-5 h-5 ${
                              rule.status === "active" ? "text-green-600" : "text-muted-foreground"
                            }`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{rule.name}</h3>
                              {getStatusBadge(rule.status)}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {isEs 
                                ? TRIGGER_LABELS[rule.trigger?.type]?.es 
                                : TRIGGER_LABELS[rule.trigger?.type]?.en}
                              <ChevronRight className="w-3 h-3 inline mx-1" />
                              {rule.actions?.length || 0} {isEs ? "acciones" : "actions"}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {rule.trigger_count || 0} {isEs ? "ejecuciones" : "runs"}
                          </span>
                          
                          <Switch
                            checked={rule.status === "active"}
                            onCheckedChange={() => handleToggleRule(rule.rule_id)}
                          />
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditingRule(rule)}>
                                <Edit className="w-4 h-4 mr-2" />
                                {isEs ? "Editar" : "Edit"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDeleteRule(rule.rule_id)} className="text-red-600">
                                <Trash2 className="w-4 h-4 mr-2" />
                                {isEs ? "Eliminar" : "Delete"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          {logs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">
                  {isEs ? "Sin historial de ejecuciones" : "No execution history"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isEs 
                    ? "Las ejecuciones de tus reglas aparecerán aquí"
                    : "Your rule executions will appear here"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <Card key={log.log_id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {log.status === "success" ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-red-500" />
                        )}
                        <div>
                          <p className="font-medium text-sm">{log.rule_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {log.actions_executed?.length || 0} {isEs ? "acciones ejecutadas" : "actions executed"}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.executed_at).toLocaleString()}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Templates Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              {isEs ? "Plantillas de Automatización" : "Automation Templates"}
            </DialogTitle>
            <DialogDescription>
              {isEs 
                ? "Selecciona una plantilla para crear rápidamente una regla"
                : "Select a template to quickly create a rule"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
            {templates.map((template) => (
              <Card 
                key={template.template_id}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleCreateFromTemplate(template)}
              >
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-1">
                    {isEs ? template.name_es : template.name}
                  </h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    {isEs ? template.description_es : template.description}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline">{template.trigger?.type}</Badge>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-muted-foreground">
                      {template.actions?.length} {isEs ? "acciones" : "actions"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Rule Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Nueva Regla" : "New Rule"}</DialogTitle>
            <DialogDescription>
              {isEs 
                ? "Define cuándo y qué debe suceder automáticamente"
                : "Define when and what should happen automatically"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={isEs ? "Ej: Notificar nuevo lead" : "E.g.: Notify new lead"}
              />
            </div>
            
            <div>
              <Label>{isEs ? "Descripción (opcional)" : "Description (optional)"}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={isEs ? "¿Qué hace esta regla?" : "What does this rule do?"}
                rows={2}
              />
            </div>
            
            <div>
              <Label>{isEs ? "Disparador (Trigger)" : "Trigger"}</Label>
              <Select
                value={formData.trigger_type}
                onValueChange={(v) => setFormData({ ...formData, trigger_type: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Selecciona un disparador" : "Select a trigger"} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIGGER_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {isEs ? label.es : label.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {(formData.trigger_type === "client_inactive_days" || formData.trigger_type === "event_date_approaching") && (
              <div>
                <Label>{isEs ? "Días" : "Days"}</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.trigger_days}
                  onChange={(e) => setFormData({ ...formData, trigger_days: parseInt(e.target.value) || 30 })}
                />
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreateRule}>
              <Plus className="w-4 h-4 mr-2" />
              {isEs ? "Crear Regla" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
