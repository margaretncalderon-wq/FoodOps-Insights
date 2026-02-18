// components/automation/WorkflowBuilder.js - Visual Workflow Builder (Dubsado-style)
import { useState, useEffect } from "react";
import { useLanguage } from "../../contexts/LanguageContext";

// UI Components
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Switch } from "../ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";

// Icons
import {
  Zap, Plus, Trash2, ChevronDown, ChevronRight, GripVertical,
  Clock, Bell, Mail, Tag, UserPlus, CheckCircle2, ArrowDown,
  Settings, Play, AlertCircle, Calendar, FileText, Users,
  Filter, Timer, GitBranch, X, Save, Eye
} from "lucide-react";

// ============== TRIGGER TYPES ==============
const TRIGGER_TYPES = [
  { 
    id: "lead_created", 
    label: { en: "Lead Created", es: "Lead Creado" },
    icon: UserPlus,
    color: "bg-blue-500",
    description: { en: "When a new lead is added", es: "Cuando se agrega un nuevo lead" },
    fields: []
  },
  { 
    id: "lead_status_changed", 
    label: { en: "Lead Status Changed", es: "Estado de Lead Cambió" },
    icon: Users,
    color: "bg-purple-500",
    description: { en: "When lead moves to a different stage", es: "Cuando el lead pasa a otra etapa" },
    fields: [
      { id: "from_status", label: { en: "From Status", es: "Desde Estado" }, type: "select", options: ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] },
      { id: "to_status", label: { en: "To Status", es: "A Estado" }, type: "select", options: ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] }
    ]
  },
  { 
    id: "event_created", 
    label: { en: "Event Created", es: "Evento Creado" },
    icon: Calendar,
    color: "bg-green-500",
    description: { en: "When a new event is created", es: "Cuando se crea un nuevo evento" },
    fields: []
  },
  { 
    id: "event_date_approaching", 
    label: { en: "Event Date Approaching", es: "Fecha de Evento Próxima" },
    icon: Clock,
    color: "bg-amber-500",
    description: { en: "X days before event date", es: "X días antes de la fecha del evento" },
    fields: [
      { id: "days_before", label: { en: "Days Before", es: "Días Antes" }, type: "number", default: 7 }
    ]
  },
  { 
    id: "proposal_amount_threshold", 
    label: { en: "Proposal Amount Threshold", es: "Umbral de Monto" },
    icon: FileText,
    color: "bg-emerald-500",
    description: { en: "When proposal exceeds amount", es: "Cuando la propuesta excede el monto" },
    fields: [
      { id: "amount", label: { en: "Amount ($)", es: "Monto ($)" }, type: "number", default: 5000 },
      { id: "operator", label: { en: "Operator", es: "Operador" }, type: "select", options: ["greater_than", "less_than", "equals"] }
    ]
  },
  { 
    id: "client_inactive_days", 
    label: { en: "Client Inactive", es: "Cliente Inactivo" },
    icon: AlertCircle,
    color: "bg-red-500",
    description: { en: "When client has no activity for X days", es: "Cuando el cliente no tiene actividad por X días" },
    fields: [
      { id: "days", label: { en: "Days Inactive", es: "Días Inactivo" }, type: "number", default: 30 }
    ]
  },
  { 
    id: "follow_up_overdue", 
    label: { en: "Follow-up Overdue", es: "Seguimiento Vencido" },
    icon: Clock,
    color: "bg-orange-500",
    description: { en: "When a follow-up is past due", es: "Cuando un seguimiento está vencido" },
    fields: []
  },
];

// ============== ACTION TYPES ==============
const ACTION_TYPES = [
  {
    id: "send_notification",
    label: { en: "Send Notification", es: "Enviar Notificación" },
    icon: Bell,
    color: "bg-blue-500",
    fields: [
      { id: "message", label: { en: "Message", es: "Mensaje" }, type: "textarea", placeholder: "Use {{lead_name}}, {{event_name}}, etc." },
      { id: "recipients", label: { en: "Recipients", es: "Destinatarios" }, type: "multiselect", options: ["owner", "admin", "team"] }
    ]
  },
  {
    id: "send_email",
    label: { en: "Send Email", es: "Enviar Email" },
    icon: Mail,
    color: "bg-cyan-500",
    fields: [
      { id: "to", label: { en: "To", es: "Para" }, type: "select", options: ["lead_email", "client_email", "owner", "custom"] },
      { id: "subject", label: { en: "Subject", es: "Asunto" }, type: "text" },
      { id: "body", label: { en: "Body", es: "Cuerpo" }, type: "textarea" }
    ]
  },
  {
    id: "create_task",
    label: { en: "Create Task", es: "Crear Tarea" },
    icon: CheckCircle2,
    color: "bg-green-500",
    fields: [
      { id: "title", label: { en: "Task Title", es: "Título de Tarea" }, type: "text", placeholder: "Follow up with {{lead_name}}" },
      { id: "assignee", label: { en: "Assign To", es: "Asignar A" }, type: "select", options: ["owner", "admin", "unassigned"] },
      { id: "due_days", label: { en: "Due In (days)", es: "Vence En (días)" }, type: "number", default: 3 }
    ]
  },
  {
    id: "create_follow_up",
    label: { en: "Create Follow-up", es: "Crear Seguimiento" },
    icon: Clock,
    color: "bg-amber-500",
    fields: [
      { id: "title", label: { en: "Follow-up Title", es: "Título de Seguimiento" }, type: "text" },
      { id: "days", label: { en: "Schedule In (days)", es: "Programar En (días)" }, type: "number", default: 3 }
    ]
  },
  {
    id: "add_tag",
    label: { en: "Add Tag", es: "Agregar Etiqueta" },
    icon: Tag,
    color: "bg-purple-500",
    fields: [
      { id: "tag", label: { en: "Tag Name", es: "Nombre de Etiqueta" }, type: "text", placeholder: "VIP, Hot Lead, etc." }
    ]
  },
  {
    id: "update_field",
    label: { en: "Update Field", es: "Actualizar Campo" },
    icon: Settings,
    color: "bg-slate-500",
    fields: [
      { id: "field", label: { en: "Field", es: "Campo" }, type: "select", options: ["status", "priority", "owner", "category"] },
      { id: "value", label: { en: "New Value", es: "Nuevo Valor" }, type: "text" }
    ]
  },
  {
    id: "wait",
    label: { en: "Wait / Delay", es: "Esperar / Retraso" },
    icon: Timer,
    color: "bg-gray-500",
    fields: [
      { id: "delay_value", label: { en: "Wait", es: "Esperar" }, type: "number", default: 1 },
      { id: "delay_unit", label: { en: "Unit", es: "Unidad" }, type: "select", options: ["minutes", "hours", "days"] }
    ]
  },
];

// ============== CONDITION BLOCK ==============
function ConditionBlock({ condition, onChange, onRemove, isEs }) {
  const fields = ["lead_name", "event_name", "amount", "status", "priority", "owner", "tags"];
  const operators = [
    { id: "equals", label: { en: "equals", es: "es igual a" } },
    { id: "not_equals", label: { en: "not equals", es: "no es igual a" } },
    { id: "contains", label: { en: "contains", es: "contiene" } },
    { id: "greater_than", label: { en: "greater than", es: "mayor que" } },
    { id: "less_than", label: { en: "less than", es: "menor que" } },
    { id: "is_empty", label: { en: "is empty", es: "está vacío" } },
    { id: "is_not_empty", label: { en: "is not empty", es: "no está vacío" } },
  ];

  return (
    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-dashed">
      <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <Select value={condition.field || ""} onValueChange={(v) => onChange({ ...condition, field: v })}>
        <SelectTrigger className="w-32 h-8">
          <SelectValue placeholder={isEs ? "Campo" : "Field"} />
        </SelectTrigger>
        <SelectContent>
          {fields.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={condition.operator || ""} onValueChange={(v) => onChange({ ...condition, operator: v })}>
        <SelectTrigger className="w-32 h-8">
          <SelectValue placeholder={isEs ? "Operador" : "Operator"} />
        </SelectTrigger>
        <SelectContent>
          {operators.map(op => <SelectItem key={op.id} value={op.id}>{isEs ? op.label.es : op.label.en}</SelectItem>)}
        </SelectContent>
      </Select>
      {!["is_empty", "is_not_empty"].includes(condition.operator) && (
        <Input
          value={condition.value || ""}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder={isEs ? "Valor" : "Value"}
          className="w-32 h-8"
        />
      )}
      <Button variant="ghost" size="sm" onClick={onRemove} className="h-8 w-8 p-0">
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ============== TRIGGER BLOCK ==============
function TriggerBlock({ trigger, onEdit, isEs }) {
  const triggerType = TRIGGER_TYPES.find(t => t.id === trigger?.type);
  const Icon = triggerType?.icon || Zap;
  
  return (
    <div 
      className={`relative p-4 rounded-xl border-2 border-dashed cursor-pointer hover:border-primary transition-colors ${
        trigger?.type ? 'bg-gradient-to-br from-primary/5 to-primary/10 border-primary/30' : 'border-muted-foreground/30'
      }`}
      onClick={onEdit}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${triggerType?.color || 'bg-muted'} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">
            {trigger?.type 
              ? (isEs ? triggerType?.label.es : triggerType?.label.en)
              : (isEs ? "Seleccionar Trigger" : "Select Trigger")
            }
          </p>
          <p className="text-xs text-muted-foreground">
            {trigger?.type 
              ? (isEs ? triggerType?.description.es : triggerType?.description.en)
              : (isEs ? "¿Qué inicia este workflow?" : "What starts this workflow?")
            }
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </div>
    </div>
  );
}

// ============== ACTION BLOCK ==============
function ActionBlock({ action, index, onEdit, onRemove, isEs }) {
  const actionType = ACTION_TYPES.find(a => a.id === action?.type);
  const Icon = actionType?.icon || Zap;
  
  return (
    <div className="relative">
      {/* Connector Line */}
      <div className="absolute left-6 -top-4 w-0.5 h-4 bg-border" />
      
      <div 
        className="p-4 rounded-xl border bg-card hover:shadow-md transition-shadow cursor-pointer group"
        onClick={onEdit}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
            <div className={`w-10 h-10 rounded-lg ${actionType?.color || 'bg-muted'} flex items-center justify-center`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">
              {isEs ? actionType?.label.es : actionType?.label.en}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {action?.config?.message || action?.config?.title || action?.config?.tag || 
               (action?.type === "wait" ? `${action?.config?.delay_value} ${action?.config?.delay_unit}` : "")}
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="opacity-0 group-hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============== ADD ACTION BUTTON ==============
function AddActionButton({ onClick, isEs }) {
  return (
    <div className="relative">
      <div className="absolute left-6 -top-4 w-0.5 h-4 bg-border" />
      <Button
        variant="outline"
        className="w-full border-dashed h-14"
        onClick={onClick}
      >
        <Plus className="w-4 h-4 mr-2" />
        {isEs ? "Agregar Acción" : "Add Action"}
      </Button>
    </div>
  );
}

// ============== MAIN WORKFLOW BUILDER ==============
export default function WorkflowBuilder({ 
  rule, 
  onSave, 
  onCancel,
  isNew = false 
}) {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [workflow, setWorkflow] = useState({
    name: rule?.name || "",
    description: rule?.description || "",
    trigger: rule?.trigger || { type: "", config: {}, conditions: [] },
    actions: rule?.actions || [],
    status: rule?.status || "draft"
  });
  
  const [editingTrigger, setEditingTrigger] = useState(false);
  const [editingAction, setEditingAction] = useState(null); // index or "new"
  const [previewMode, setPreviewMode] = useState(false);

  // ============== TRIGGER EDITOR ==============
  const TriggerEditor = () => {
    const [localTrigger, setLocalTrigger] = useState(workflow.trigger);
    const selectedType = TRIGGER_TYPES.find(t => t.id === localTrigger.type);

    return (
      <Dialog open={editingTrigger} onOpenChange={setEditingTrigger}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              {isEs ? "Configurar Trigger" : "Configure Trigger"}
            </DialogTitle>
            <DialogDescription>
              {isEs ? "¿Qué evento inicia este workflow?" : "What event starts this workflow?"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Trigger Type Selection */}
            <div className="grid grid-cols-2 gap-2">
              {TRIGGER_TYPES.map(type => {
                const Icon = type.icon;
                const isSelected = localTrigger.type === type.id;
                return (
                  <button
                    key={type.id}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      isSelected 
                        ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                        : 'hover:border-primary/50'
                    }`}
                    onClick={() => setLocalTrigger({ ...localTrigger, type: type.id, config: {} })}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-6 h-6 rounded ${type.color} flex items-center justify-center`}>
                        <Icon className="w-3 h-3 text-white" />
                      </div>
                      <span className="font-medium text-sm">{isEs ? type.label.es : type.label.en}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{isEs ? type.description.es : type.description.en}</p>
                  </button>
                );
              })}
            </div>
            
            {/* Trigger Fields */}
            {selectedType?.fields.length > 0 && (
              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium">{isEs ? "Configuración" : "Configuration"}</p>
                {selectedType.fields.map(field => (
                  <div key={field.id}>
                    <Label className="text-xs">{isEs ? field.label.es : field.label.en}</Label>
                    {field.type === "number" ? (
                      <Input
                        type="number"
                        value={localTrigger.config?.[field.id] || field.default || ""}
                        onChange={(e) => setLocalTrigger({
                          ...localTrigger,
                          config: { ...localTrigger.config, [field.id]: parseInt(e.target.value) }
                        })}
                        className="h-9"
                      />
                    ) : field.type === "select" ? (
                      <Select
                        value={localTrigger.config?.[field.id] || ""}
                        onValueChange={(v) => setLocalTrigger({
                          ...localTrigger,
                          config: { ...localTrigger.config, [field.id]: v }
                        })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options.map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={localTrigger.config?.[field.id] || ""}
                        onChange={(e) => setLocalTrigger({
                          ...localTrigger,
                          config: { ...localTrigger.config, [field.id]: e.target.value }
                        })}
                        className="h-9"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {/* Conditions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{isEs ? "Condiciones (opcional)" : "Conditions (optional)"}</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocalTrigger({
                    ...localTrigger,
                    conditions: [...(localTrigger.conditions || []), { field: "", operator: "", value: "" }]
                  })}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  {isEs ? "Agregar" : "Add"}
                </Button>
              </div>
              {(localTrigger.conditions || []).map((cond, idx) => (
                <ConditionBlock
                  key={idx}
                  condition={cond}
                  onChange={(updated) => {
                    const newConds = [...localTrigger.conditions];
                    newConds[idx] = updated;
                    setLocalTrigger({ ...localTrigger, conditions: newConds });
                  }}
                  onRemove={() => {
                    const newConds = localTrigger.conditions.filter((_, i) => i !== idx);
                    setLocalTrigger({ ...localTrigger, conditions: newConds });
                  }}
                  isEs={isEs}
                />
              ))}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTrigger(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={() => {
              setWorkflow({ ...workflow, trigger: localTrigger });
              setEditingTrigger(false);
            }}>
              {isEs ? "Guardar Trigger" : "Save Trigger"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  // ============== ACTION EDITOR ==============
  const ActionEditor = () => {
    const isNewAction = editingAction === "new";
    const actionIndex = isNewAction ? -1 : editingAction;
    const [localAction, setLocalAction] = useState(
      isNewAction ? { type: "", config: {} } : workflow.actions[actionIndex] || { type: "", config: {} }
    );
    const selectedType = ACTION_TYPES.find(a => a.id === localAction.type);

    const handleSave = () => {
      if (isNewAction) {
        setWorkflow({ ...workflow, actions: [...workflow.actions, localAction] });
      } else {
        const newActions = [...workflow.actions];
        newActions[actionIndex] = localAction;
        setWorkflow({ ...workflow, actions: newActions });
      }
      setEditingAction(null);
    };

    return (
      <Dialog open={editingAction !== null} onOpenChange={() => setEditingAction(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="w-5 h-5 text-green-500" />
              {isNewAction 
                ? (isEs ? "Agregar Acción" : "Add Action")
                : (isEs ? "Editar Acción" : "Edit Action")
              }
            </DialogTitle>
            <DialogDescription>
              {isEs ? "¿Qué debe suceder?" : "What should happen?"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Action Type Selection */}
            <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
              {ACTION_TYPES.map(type => {
                const Icon = type.icon;
                const isSelected = localAction.type === type.id;
                return (
                  <button
                    key={type.id}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      isSelected 
                        ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                        : 'hover:border-primary/50'
                    }`}
                    onClick={() => setLocalAction({ type: type.id, config: {} })}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded ${type.color} flex items-center justify-center`}>
                        <Icon className="w-3 h-3 text-white" />
                      </div>
                      <span className="font-medium text-sm">{isEs ? type.label.es : type.label.en}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            
            {/* Action Fields */}
            {selectedType?.fields.length > 0 && (
              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium">{isEs ? "Configuración" : "Configuration"}</p>
                {selectedType.fields.map(field => (
                  <div key={field.id}>
                    <Label className="text-xs">{isEs ? field.label.es : field.label.en}</Label>
                    {field.type === "textarea" ? (
                      <Textarea
                        value={localAction.config?.[field.id] || ""}
                        onChange={(e) => setLocalAction({
                          ...localAction,
                          config: { ...localAction.config, [field.id]: e.target.value }
                        })}
                        placeholder={field.placeholder}
                        rows={3}
                      />
                    ) : field.type === "number" ? (
                      <Input
                        type="number"
                        value={localAction.config?.[field.id] || field.default || ""}
                        onChange={(e) => setLocalAction({
                          ...localAction,
                          config: { ...localAction.config, [field.id]: parseInt(e.target.value) }
                        })}
                        className="h-9"
                      />
                    ) : field.type === "select" ? (
                      <Select
                        value={localAction.config?.[field.id] || ""}
                        onValueChange={(v) => setLocalAction({
                          ...localAction,
                          config: { ...localAction.config, [field.id]: v }
                        })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options.map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : field.type === "multiselect" ? (
                      <div className="flex gap-2 flex-wrap">
                        {field.options.map(opt => {
                          const isChecked = (localAction.config?.[field.id] || []).includes(opt);
                          return (
                            <Badge
                              key={opt}
                              variant={isChecked ? "default" : "outline"}
                              className="cursor-pointer"
                              onClick={() => {
                                const current = localAction.config?.[field.id] || [];
                                const updated = isChecked 
                                  ? current.filter(x => x !== opt)
                                  : [...current, opt];
                                setLocalAction({
                                  ...localAction,
                                  config: { ...localAction.config, [field.id]: updated }
                                });
                              }}
                            >
                              {opt}
                            </Badge>
                          );
                        })}
                      </div>
                    ) : (
                      <Input
                        value={localAction.config?.[field.id] || ""}
                        onChange={(e) => setLocalAction({
                          ...localAction,
                          config: { ...localAction.config, [field.id]: e.target.value }
                        })}
                        placeholder={field.placeholder}
                        className="h-9"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAction(null)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSave} disabled={!localAction.type}>
              {isEs ? "Guardar Acción" : "Save Action"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  const handleSaveWorkflow = () => {
    if (!workflow.name) {
      alert(isEs ? "El nombre es requerido" : "Name is required");
      return;
    }
    if (!workflow.trigger?.type) {
      alert(isEs ? "Selecciona un trigger" : "Select a trigger");
      return;
    }
    if (workflow.actions.length === 0) {
      alert(isEs ? "Agrega al menos una acción" : "Add at least one action");
      return;
    }
    onSave(workflow);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="w-4 h-4" />
          </Button>
          <div>
            <Input
              value={workflow.name}
              onChange={(e) => setWorkflow({ ...workflow, name: e.target.value })}
              placeholder={isEs ? "Nombre del workflow" : "Workflow name"}
              className="font-semibold text-lg border-0 p-0 h-auto focus-visible:ring-0"
            />
            <Input
              value={workflow.description}
              onChange={(e) => setWorkflow({ ...workflow, description: e.target.value })}
              placeholder={isEs ? "Descripción (opcional)" : "Description (optional)"}
              className="text-sm text-muted-foreground border-0 p-0 h-auto focus-visible:ring-0"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewMode(!previewMode)}>
            <Eye className="w-4 h-4 mr-2" />
            {isEs ? "Vista Previa" : "Preview"}
          </Button>
          <Button onClick={handleSaveWorkflow}>
            <Save className="w-4 h-4 mr-2" />
            {isEs ? "Guardar" : "Save"}
          </Button>
        </div>
      </div>

      {/* Workflow Canvas */}
      <div className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-lg mx-auto space-y-4">
          {/* Trigger */}
          <div className="text-center mb-2">
            <Badge variant="outline" className="text-xs">
              <Zap className="w-3 h-3 mr-1" />
              {isEs ? "CUANDO" : "WHEN"}
            </Badge>
          </div>
          <TriggerBlock 
            trigger={workflow.trigger} 
            onEdit={() => setEditingTrigger(true)}
            isEs={isEs}
          />
          
          {/* Arrow */}
          {workflow.trigger?.type && (
            <div className="flex justify-center">
              <ArrowDown className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
          
          {/* Actions */}
          {workflow.trigger?.type && (
            <>
              <div className="text-center mb-2">
                <Badge variant="outline" className="text-xs">
                  <Play className="w-3 h-3 mr-1" />
                  {isEs ? "ENTONCES" : "THEN"}
                </Badge>
              </div>
              
              <div className="space-y-4">
                {workflow.actions.map((action, idx) => (
                  <ActionBlock
                    key={idx}
                    action={action}
                    index={idx}
                    onEdit={() => setEditingAction(idx)}
                    onRemove={() => {
                      const newActions = workflow.actions.filter((_, i) => i !== idx);
                      setWorkflow({ ...workflow, actions: newActions });
                    }}
                    isEs={isEs}
                  />
                ))}
                
                <AddActionButton 
                  onClick={() => setEditingAction("new")}
                  isEs={isEs}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <TriggerEditor />
      <ActionEditor />
    </div>
  );
}
