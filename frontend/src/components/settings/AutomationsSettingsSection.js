import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { Dialog, DialogContent } from "../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  Zap, Plus, Edit, Trash2, RefreshCw, Bell, Mail, Clock,
  Calendar, AlertTriangle, FileText, Users, Play, Pause,
  DollarSign, Package, CheckSquare, LayoutTemplate, List,
  GitBranch, Sparkles
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import WorkflowBuilder from "../automation/WorkflowBuilder";

// Trigger type icons mapping
const TRIGGER_ICONS = {
  lead_created: Users,
  lead_status_changed: Users,
  event_created: Calendar,
  event_date_approaching: Clock,
  proposal_amount_threshold: FileText,
  client_inactive_days: AlertTriangle,
  follow_up_overdue: Clock,
  payment_reminder: DollarSign,
  low_stock_alert: Package,
  event_reminder: Calendar,
  task_due_date: CheckSquare,
  new_lead: Users,
  deal_won: Sparkles,
  project_started: Play,
  integration_lead_company: Users,
  integration_lead_candidate: Users,
  integration_lead_contractor: Users,
  integration_invoice_created: FileText,
};

export default function AutomationsSettingsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [workflows, setWorkflows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("workflows");
  
  // Workflow Builder State
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState(null);

  // Fetch workflows
  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/automation/rules`, { withCredentials: true });
      setWorkflows(res.data.rules || []);
    } catch (err) {
      console.error("Error fetching workflows:", err);
      setWorkflows([]);
    }
  }, []);

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/automation/templates`, { withCredentials: true });
      setTemplates(res.data.templates || []);
    } catch (err) {
      console.error("Error fetching templates:", err);
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchWorkflows(), fetchTemplates()]).finally(() => setLoading(false));
  }, [fetchWorkflows, fetchTemplates]);

  // Toggle workflow status
  const handleToggleStatus = async (workflow) => {
    try {
      await axios.post(`${API}/api/automation/rules/${workflow.rule_id}/toggle`, {}, { withCredentials: true });
      toast.success(workflow.status === "active" 
        ? (isEs ? "Workflow pausado" : "Workflow paused")
        : (isEs ? "Workflow activado" : "Workflow activated")
      );
      fetchWorkflows();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  // Delete workflow
  const handleDeleteWorkflow = async (ruleId) => {
    if (!window.confirm(isEs ? "¿Eliminar este workflow?" : "Delete this workflow?")) return;
    try {
      await axios.delete(`${API}/api/automation/rules/${ruleId}`, { withCredentials: true });
      toast.success(isEs ? "Workflow eliminado" : "Workflow deleted");
      fetchWorkflows();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  // Save workflow (create or update)
  const handleSaveWorkflow = async (workflowData) => {
    try {
      if (editingWorkflow?.rule_id) {
        // Update existing
        await axios.put(`${API}/api/automation/rules/${editingWorkflow.rule_id}`, {
          name: workflowData.name,
          description: workflowData.description,
          trigger: workflowData.trigger,
          actions: workflowData.actions,
          status: workflowData.status
        }, { withCredentials: true });
        toast.success(isEs ? "Workflow actualizado" : "Workflow updated");
      } else {
        // Create new
        await axios.post(`${API}/api/automation/rules`, {
          name: workflowData.name,
          description: workflowData.description,
          trigger: workflowData.trigger,
          actions: workflowData.actions,
          status: "draft"
        }, { withCredentials: true });
        toast.success(isEs ? "Workflow creado" : "Workflow created");
      }
      setShowBuilder(false);
      setEditingWorkflow(null);
      fetchWorkflows();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error saving workflow");
    }
  };

  // Create from template
  const handleUseTemplate = async (template) => {
    try {
      const res = await axios.post(`${API}/api/automation/templates/${template.template_id}/create`, {}, { withCredentials: true });
      toast.success(isEs ? "Workflow creado desde plantilla" : "Workflow created from template");
      fetchWorkflows();
      setActiveTab("workflows");
      // Open the newly created workflow in builder
      setEditingWorkflow(res.data);
      setShowBuilder(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  // Open builder for editing
  const handleEditWorkflow = (workflow) => {
    setEditingWorkflow(workflow);
    setShowBuilder(true);
  };

  // Open builder for new workflow
  const handleNewWorkflow = () => {
    setEditingWorkflow(null);
    setShowBuilder(true);
  };

  const getTriggerIcon = (type) => {
    const Icon = TRIGGER_ICONS[type] || Zap;
    return Icon;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // Workflow Builder Dialog
  if (showBuilder) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <WorkflowBuilder
          rule={editingWorkflow}
          onSave={handleSaveWorkflow}
          onCancel={() => {
            setShowBuilder(false);
            setEditingWorkflow(null);
          }}
          isNew={!editingWorkflow}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="automations-settings">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            {isEs ? "Workflows y Automatizaciones" : "Workflows & Automations"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs 
              ? "Crea automatizaciones visuales para tu organización" 
              : "Create visual automations for your organization"}
          </p>
        </div>
        <Button onClick={handleNewWorkflow} className="gap-2">
          <Plus className="w-4 h-4" />
          {isEs ? "Nuevo Workflow" : "New Workflow"}
        </Button>
      </div>

      {/* Tabs: Workflows / Templates */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="workflows" className="gap-2">
            <List className="w-4 h-4" />
            {isEs ? "Mis Workflows" : "My Workflows"}
            {workflows.length > 0 && (
              <Badge variant="secondary" className="ml-1">{workflows.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <LayoutTemplate className="w-4 h-4" />
            {isEs ? "Plantillas" : "Templates"}
          </TabsTrigger>
        </TabsList>

        {/* My Workflows */}
        <TabsContent value="workflows" className="space-y-4 mt-4">
          {workflows.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <GitBranch className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground mb-4">
                  {isEs 
                    ? "No tienes workflows configurados" 
                    : "You don't have any workflows configured"}
                </p>
                <div className="flex justify-center gap-2">
                  <Button onClick={handleNewWorkflow} variant="outline" className="gap-2">
                    <Plus className="w-4 h-4" />
                    {isEs ? "Crear desde cero" : "Create from scratch"}
                  </Button>
                  <Button onClick={() => setActiveTab("templates")} className="gap-2">
                    <LayoutTemplate className="w-4 h-4" />
                    {isEs ? "Usar plantilla" : "Use template"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            workflows.map((workflow) => {
              const TriggerIcon = getTriggerIcon(workflow.trigger?.type);
              const isActive = workflow.status === "active";
              
              return (
                <Card 
                  key={workflow.rule_id} 
                  className={`transition-all ${!isActive ? "opacity-60" : ""}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                          isActive ? "bg-primary/10" : "bg-muted"
                        }`}>
                          <TriggerIcon className={`w-6 h-6 ${
                            isActive ? "text-primary" : "text-muted-foreground"
                          }`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{workflow.name}</h3>
                            {isActive ? (
                              <Badge className="bg-green-100 text-green-700 gap-1">
                                <Play className="w-3 h-3" />
                                {isEs ? "Activo" : "Active"}
                              </Badge>
                            ) : workflow.status === "paused" ? (
                              <Badge variant="secondary" className="gap-1">
                                <Pause className="w-3 h-3" />
                                {isEs ? "Pausado" : "Paused"}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1">
                                {isEs ? "Borrador" : "Draft"}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {workflow.description || (isEs ? "Sin descripción" : "No description")}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="text-xs">
                              <Zap className="w-3 h-3 mr-1" />
                              {workflow.trigger?.type?.replace(/_/g, " ")}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {workflow.actions?.length || 0} {isEs ? "acciones" : "actions"}
                            </Badge>
                            {workflow.trigger_count > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {workflow.trigger_count}x {isEs ? "ejecutado" : "triggered"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={isActive}
                          onCheckedChange={() => handleToggleStatus(workflow)}
                          disabled={workflow.status === "draft"}
                        />
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleEditWorkflow(workflow)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDeleteWorkflow(workflow.rule_id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Templates */}
        <TabsContent value="templates" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((template) => {
              const TriggerIcon = getTriggerIcon(template.trigger?.type);
              
              return (
                <Card 
                  key={template.template_id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleUseTemplate(template)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <TriggerIcon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm">
                          {isEs ? template.name_es : template.name}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {isEs ? template.description_es : template.description}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {template.category}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {template.actions?.length || 0} {isEs ? "acciones" : "actions"}
                          </Badge>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="flex-shrink-0">
                        <Plus className="w-3 h-3 mr-1" />
                        {isEs ? "Usar" : "Use"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
