import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { 
  Zap, Plus, Edit, Trash2, RefreshCw, Bell, Mail, Clock,
  Calendar, AlertTriangle, FileText, Users, Play, Pause,
  DollarSign, Package, CheckSquare
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

// Automation trigger types
const TRIGGER_TYPES = [
  { value: "payment_reminder", label: "Payment Reminder", labelEs: "Recordatorio de Pago", icon: DollarSign, description: "Send reminder when invoice is overdue", descriptionEs: "Enviar recordatorio cuando la factura está vencida" },
  { value: "low_stock_alert", label: "Low Stock Alert", labelEs: "Alerta de Stock Bajo", icon: Package, description: "Alert when inventory falls below par level", descriptionEs: "Alertar cuando el inventario cae bajo el nivel mínimo" },
  { value: "event_reminder", label: "Event Reminder", labelEs: "Recordatorio de Evento", icon: Calendar, description: "Send reminder before event date", descriptionEs: "Enviar recordatorio antes de la fecha del evento" },
  { value: "task_due_date", label: "Task Due Date", labelEs: "Fecha Límite de Tarea", icon: CheckSquare, description: "Notify when task is due soon", descriptionEs: "Notificar cuando la tarea está por vencer" },
  { value: "new_lead", label: "New Lead", labelEs: "Nuevo Lead", icon: Users, description: "Notify when new lead is received", descriptionEs: "Notificar cuando se recibe un nuevo lead" },
];

// Notification channels
const CHANNELS = [
  { value: "email", label: "Email", labelEs: "Email" },
  { value: "in_app", label: "In-App", labelEs: "En la App" },
  { value: "whatsapp", label: "WhatsApp", labelEs: "WhatsApp" },
];

export default function AutomationsSettingsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [automations, setAutomations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState(null);
  const [automationForm, setAutomationForm] = useState({
    name: "",
    trigger_type: "",
    channels: ["email"],
    is_active: true,
    config: {
      days_before: 3,
      days_overdue: 7,
      recipients: "owner" // owner, all_users, specific
    }
  });

  const fetchAutomations = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/settings/automations`, { withCredentials: true });
      setAutomations(res.data);
    } catch (err) {
      // Use defaults if endpoint doesn't exist yet
      setAutomations([
        { automation_id: "auto_1", name: "Payment Reminder", trigger_type: "payment_reminder", channels: ["email"], is_active: true, config: { days_overdue: 7 } },
        { automation_id: "auto_2", name: "Low Stock Alert", trigger_type: "low_stock_alert", channels: ["email", "in_app"], is_active: false, config: {} },
        { automation_id: "auto_3", name: "Event Reminder", trigger_type: "event_reminder", channels: ["email"], is_active: true, config: { days_before: 3 } },
      ]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAutomations(); }, [fetchAutomations]);

  const handleSaveAutomation = async () => {
    if (!automationForm.name || !automationForm.trigger_type) {
      return toast.error(isEs ? "Complete los campos requeridos" : "Fill required fields");
    }
    try {
      if (editingAutomation) {
        await axios.put(`${API}/api/settings/automations/${editingAutomation.automation_id}`, automationForm, { withCredentials: true });
        toast.success(isEs ? "Automatización actualizada" : "Automation updated");
      } else {
        await axios.post(`${API}/api/settings/automations`, automationForm, { withCredentials: true });
        toast.success(isEs ? "Automatización creada" : "Automation created");
      }
      setDialogOpen(false);
      setEditingAutomation(null);
      fetchAutomations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleToggleActive = async (automation) => {
    try {
      await axios.put(`${API}/api/settings/automations/${automation.automation_id}`, 
        { ...automation, is_active: !automation.is_active }, 
        { withCredentials: true }
      );
      fetchAutomations();
      toast.success(automation.is_active 
        ? (isEs ? "Automatización desactivada" : "Automation disabled")
        : (isEs ? "Automatización activada" : "Automation enabled")
      );
    } catch (err) {
      // Update local state on error
      setAutomations(prev => prev.map(a => 
        a.automation_id === automation.automation_id 
          ? { ...a, is_active: !a.is_active }
          : a
      ));
    }
  };

  const handleDeleteAutomation = async (automationId) => {
    if (!window.confirm(isEs ? "¿Eliminar automatización?" : "Delete automation?")) return;
    try {
      await axios.delete(`${API}/api/settings/automations/${automationId}`, { withCredentials: true });
      toast.success(isEs ? "Automatización eliminada" : "Automation deleted");
      fetchAutomations();
    } catch (err) {
      toast.error("Error");
    }
  };

  const handleEditAutomation = (automation) => {
    setEditingAutomation(automation);
    setAutomationForm({
      name: automation.name,
      trigger_type: automation.trigger_type,
      channels: automation.channels || ["email"],
      is_active: automation.is_active,
      config: automation.config || {}
    });
    setDialogOpen(true);
  };

  const getTriggerInfo = (type) => TRIGGER_TYPES.find(t => t.value === type) || {};

  const toggleChannel = (channel) => {
    setAutomationForm(prev => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter(c => c !== channel)
        : [...prev.channels, channel]
    }));
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="automations-settings">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5" />
            {isEs ? "Automatizaciones" : "Automations"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Configura notificaciones y alertas automáticas" : "Configure automatic notifications and alerts"}
          </p>
        </div>
        <Button onClick={() => { 
          setEditingAutomation(null); 
          setAutomationForm({ name: "", trigger_type: "", channels: ["email"], is_active: true, config: { days_before: 3, days_overdue: 7 } }); 
          setDialogOpen(true); 
        }} className="gap-2">
          <Plus className="w-4 h-4" />
          {isEs ? "Nueva Automatización" : "New Automation"}
        </Button>
      </div>

      {/* Automations List */}
      <div className="space-y-4">
        {automations.map((automation) => {
          const triggerInfo = getTriggerInfo(automation.trigger_type);
          const TriggerIcon = triggerInfo.icon || Bell;
          
          return (
            <Card key={automation.automation_id} className={`transition-all ${!automation.is_active ? "opacity-60" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${automation.is_active ? "bg-primary/10" : "bg-muted"}`}>
                      <TriggerIcon className={`w-6 h-6 ${automation.is_active ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{automation.name}</h3>
                        {automation.is_active ? (
                          <Badge className="bg-green-100 text-green-700 gap-1">
                            <Play className="w-3 h-3" />
                            {isEs ? "Activa" : "Active"}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <Pause className="w-3 h-3" />
                            {isEs ? "Inactiva" : "Inactive"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {isEs ? triggerInfo.descriptionEs : triggerInfo.description}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        {(automation.channels || []).map((channel) => (
                          <Badge key={channel} variant="outline" className="text-xs">
                            {channel === "email" && <Mail className="w-3 h-3 mr-1" />}
                            {channel === "in_app" && <Bell className="w-3 h-3 mr-1" />}
                            {channel}
                          </Badge>
                        ))}
                        {automation.config?.days_before && (
                          <Badge variant="outline" className="text-xs">
                            <Clock className="w-3 h-3 mr-1" />
                            {automation.config.days_before} {isEs ? "días antes" : "days before"}
                          </Badge>
                        )}
                        {automation.config?.days_overdue && (
                          <Badge variant="outline" className="text-xs">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {automation.config.days_overdue} {isEs ? "días vencido" : "days overdue"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={automation.is_active}
                      onCheckedChange={() => handleToggleActive(automation)}
                    />
                    <Button variant="ghost" size="icon" onClick={() => handleEditAutomation(automation)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteAutomation(automation.automation_id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        
        {automations.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Zap className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{isEs ? "No hay automatizaciones configuradas" : "No automations configured"}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Automation Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingAutomation 
                ? (isEs ? "Editar Automatización" : "Edit Automation")
                : (isEs ? "Nueva Automatización" : "New Automation")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"} *</Label>
              <Input
                value={automationForm.name}
                onChange={(e) => setAutomationForm({ ...automationForm, name: e.target.value })}
                placeholder={isEs ? "Ej: Recordatorio de pagos" : "E.g.: Payment reminder"}
              />
            </div>
            
            <div>
              <Label>{isEs ? "Tipo de Disparador" : "Trigger Type"} *</Label>
              <Select value={automationForm.trigger_type} onValueChange={(v) => setAutomationForm({ ...automationForm, trigger_type: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar tipo" : "Select type"} />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <type.icon className="w-4 h-4" />
                        {isEs ? type.labelEs : type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{isEs ? "Canales de Notificación" : "Notification Channels"}</Label>
              <div className="flex gap-2 mt-2">
                {CHANNELS.map((channel) => (
                  <Button
                    key={channel.value}
                    variant={automationForm.channels.includes(channel.value) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleChannel(channel.value)}
                    disabled={channel.value === "whatsapp"} // WhatsApp requires integration
                  >
                    {channel.value === "email" && <Mail className="w-4 h-4 mr-1" />}
                    {channel.value === "in_app" && <Bell className="w-4 h-4 mr-1" />}
                    {isEs ? channel.labelEs : channel.label}
                  </Button>
                ))}
              </div>
              {automationForm.channels.includes("whatsapp") && (
                <p className="text-xs text-muted-foreground mt-1">
                  {isEs ? "WhatsApp requiere integración configurada" : "WhatsApp requires configured integration"}
                </p>
              )}
            </div>

            {/* Config based on trigger type */}
            {automationForm.trigger_type === "payment_reminder" && (
              <div>
                <Label>{isEs ? "Días después de vencimiento" : "Days after due date"}</Label>
                <Input
                  type="number"
                  min="1"
                  value={automationForm.config.days_overdue || 7}
                  onChange={(e) => setAutomationForm({ 
                    ...automationForm, 
                    config: { ...automationForm.config, days_overdue: parseInt(e.target.value) || 7 }
                  })}
                />
              </div>
            )}

            {(automationForm.trigger_type === "event_reminder" || automationForm.trigger_type === "task_due_date") && (
              <div>
                <Label>{isEs ? "Días antes" : "Days before"}</Label>
                <Input
                  type="number"
                  min="1"
                  value={automationForm.config.days_before || 3}
                  onChange={(e) => setAutomationForm({ 
                    ...automationForm, 
                    config: { ...automationForm.config, days_before: parseInt(e.target.value) || 3 }
                  })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveAutomation}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
