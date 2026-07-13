// components/demand-studio/EmailSequencesSection.js - Email Sequences (Drip Campaigns)
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { ScrollArea } from "../ui/scroll-area";
import { Plus, Mail, Play, Pause, Trash2, Edit2, Users, Clock, ChevronRight, MailPlus, Settings, Zap, ArrowRight, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

import { KoraLoader } from "../KoraLoader";
import { API_BASE as API } from "../../utils/api";

const TRIGGER_TYPES = [
  { value: "manual", label: "Manual", labelEs: "Manual", icon: Users, desc: "Enroll contacts manually" },
  { value: "new_lead", label: "New Lead", labelEs: "Nuevo Lead", icon: Zap, desc: "When a new lead is created" },
  { value: "status_change", label: "Status Change", labelEs: "Cambio de Estado", icon: RefreshCw, desc: "When lead status changes" },
  { value: "form_submit", label: "Form Submit", labelEs: "Formulario", icon: Mail, desc: "When a form is submitted" },
];

const SEQUENCE_STATUSES = {
  draft: { label: "Draft", labelEs: "Borrador", color: "bg-gray-100 text-gray-800" },
  active: { label: "Active", labelEs: "Activo", color: "bg-green-100 text-green-800" },
  paused: { label: "Paused", labelEs: "Pausado", color: "bg-yellow-100 text-yellow-800" },
};

export default function EmailSequencesSection() {
  const { language } = useLanguage();
  const isEs = language === "es";

  // State
  const [sequences, setSequences] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSequence, setSelectedSequence] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stepDialogOpen, setStepDialogOpen] = useState(false);
  const [editingSequence, setEditingSequence] = useState(null);
  const [editingStep, setEditingStep] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    trigger_type: "manual",
    trigger_config: null
  });

  const [stepForm, setStepForm] = useState({
    delay_days: 0,
    delay_hours: 0,
    subject: "",
    body_html: "",
    body_text: "",
    template_id: ""
  });

  // Fetch data
  const fetchSequences = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/demand-studio/email-sequences`, { withCredentials: true });
      setSequences(res.data || []);
    } catch (error) {
      console.error("Error fetching sequences:", error);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/demand-studio/email-templates`, { withCredentials: true });
      setTemplates(res.data || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
    }
  }, []);

  const fetchSequenceDetails = useCallback(async (sequenceId) => {
    try {
      const res = await axios.get(`${API}/api/demand-studio/email-sequences/${sequenceId}`, { withCredentials: true });
      setSelectedSequence(res.data);
    } catch (error) {
      console.error("Error fetching sequence details:", error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchSequences(), fetchTemplates()]);
      setLoading(false);
    };
    loadData();
  }, [fetchSequences, fetchTemplates]);

  // Handlers
  const handleSaveSequence = async () => {
    try {
      if (editingSequence) {
        await axios.put(
          `${API}/api/demand-studio/email-sequences/${editingSequence.sequence_id}`,
          formData,
          { withCredentials: true }
        );
      } else {
        await axios.post(`${API}/api/demand-studio/email-sequences`, formData, { withCredentials: true });
      }
      setDialogOpen(false);
      setEditingSequence(null);
      resetForm();
      fetchSequences();
    } catch (error) {
      console.error("Error saving sequence:", error);
    }
  };

  const handleDeleteSequence = async (sequenceId) => {
    if (!window.confirm(isEs ? "¿Eliminar esta secuencia y todos sus pasos?" : "Delete this sequence and all its steps?")) return;
    try {
      await axios.delete(`${API}/api/demand-studio/email-sequences/${sequenceId}`, { withCredentials: true });
      if (selectedSequence?.sequence_id === sequenceId) {
        setSelectedSequence(null);
      }
      fetchSequences();
    } catch (error) {
      console.error("Error deleting sequence:", error);
    }
  };

  const handleToggleStatus = async (sequence) => {
    const newStatus = sequence.status === "active" ? "paused" : "active";
    try {
      await axios.put(
        `${API}/api/demand-studio/email-sequences/${sequence.sequence_id}`,
        { status: newStatus },
        { withCredentials: true }
      );
      fetchSequences();
      if (selectedSequence?.sequence_id === sequence.sequence_id) {
        fetchSequenceDetails(sequence.sequence_id);
      }
    } catch (error) {
      console.error("Error toggling status:", error);
    }
  };

  const handleSaveStep = async () => {
    try {
      if (editingStep) {
        await axios.put(
          `${API}/api/demand-studio/email-sequences/${selectedSequence.sequence_id}/steps/${editingStep.step_id}`,
          stepForm,
          { withCredentials: true }
        );
      } else {
        await axios.post(
          `${API}/api/demand-studio/email-sequences/${selectedSequence.sequence_id}/steps`,
          stepForm,
          { withCredentials: true }
        );
      }
      setStepDialogOpen(false);
      setEditingStep(null);
      resetStepForm();
      fetchSequenceDetails(selectedSequence.sequence_id);
    } catch (error) {
      console.error("Error saving step:", error);
    }
  };

  const handleDeleteStep = async (stepId) => {
    if (!window.confirm(isEs ? "¿Eliminar este paso?" : "Delete this step?")) return;
    try {
      await axios.delete(
        `${API}/api/demand-studio/email-sequences/${selectedSequence.sequence_id}/steps/${stepId}`,
        { withCredentials: true }
      );
      fetchSequenceDetails(selectedSequence.sequence_id);
    } catch (error) {
      console.error("Error deleting step:", error);
    }
  };

  const openEditSequence = (sequence) => {
    setEditingSequence(sequence);
    setFormData({
      name: sequence.name,
      description: sequence.description || "",
      trigger_type: sequence.trigger_type,
      trigger_config: sequence.trigger_config
    });
    setDialogOpen(true);
  };

  const openEditStep = (step) => {
    setEditingStep(step);
    setStepForm({
      delay_days: step.delay_days || 0,
      delay_hours: step.delay_hours || 0,
      subject: step.subject || "",
      body_html: step.body_html || "",
      body_text: step.body_text || "",
      template_id: step.template_id || ""
    });
    setStepDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({ name: "", description: "", trigger_type: "manual", trigger_config: null });
  };

  const resetStepForm = () => {
    setStepForm({ delay_days: 0, delay_hours: 0, subject: "", body_html: "", body_text: "", template_id: "" });
  };

  const getStatusBadge = (status) => {
    const s = SEQUENCE_STATUSES[status];
    return s ? <Badge className={s.color}>{isEs ? s.labelEs : s.label}</Badge> : <Badge>{status}</Badge>;
  };

  const formatDelay = (days, hours) => {
    if (days === 0 && hours === 0) return isEs ? "Inmediato" : "Immediately";
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    return parts.join(" ");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <KoraLoader size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="email-sequences-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{isEs ? "Secuencias de Email" : "Email Sequences"}</h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Automatiza seguimientos con secuencias de emails" : "Automate follow-ups with drip email sequences"}
          </p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          {isEs ? "Nueva Secuencia" : "New Sequence"}
        </Button>
      </div>

      {/* Info Banner */}
      <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-100">
                {isEs ? "Pre-configuración de Secuencias" : "Sequence Pre-configuration"}
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-200">
                {isEs 
                  ? "Crea y configura tus secuencias ahora. El envío automático se activará cuando conectes un proveedor de email (Resend/SendGrid)."
                  : "Create and configure your sequences now. Automatic sending will activate when you connect an email provider (Resend/SendGrid)."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-6">
        {/* Sequences List */}
        <div className="col-span-1">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{isEs ? "Mis Secuencias" : "My Sequences"}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                {sequences.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    <Mail className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>{isEs ? "No hay secuencias" : "No sequences yet"}</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {sequences.map(seq => (
                      <div
                        key={seq.sequence_id}
                        onClick={() => fetchSequenceDetails(seq.sequence_id)}
                        className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                          selectedSequence?.sequence_id === seq.sequence_id ? "bg-muted" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm truncate">{seq.name}</span>
                          {getStatusBadge(seq.status)}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {seq.total_enrolled || 0}
                          </span>
                          <span>•</span>
                          <span className="capitalize">{seq.trigger_type}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Sequence Details */}
        <div className="col-span-2">
          {selectedSequence ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{selectedSequence.name}</CardTitle>
                    <CardDescription>{selectedSequence.description || (isEs ? "Sin descripción" : "No description")}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleToggleStatus(selectedSequence)}
                    >
                      {selectedSequence.status === "active" ? (
                        <><Pause className="w-4 h-4 mr-1" /> {isEs ? "Pausar" : "Pause"}</>
                      ) : (
                        <><Play className="w-4 h-4 mr-1" /> {isEs ? "Activar" : "Activate"}</>
                      )}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEditSequence(selectedSequence)}>
                      <Edit2 className="w-4 h-4 mr-1" /> {isEs ? "Editar" : "Edit"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDeleteSequence(selectedSequence.sequence_id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <p className="text-2xl font-bold">{selectedSequence.total_enrolled || 0}</p>
                    <p className="text-xs text-muted-foreground">{isEs ? "Inscritos" : "Enrolled"}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <p className="text-2xl font-bold">{selectedSequence.total_completed || 0}</p>
                    <p className="text-xs text-muted-foreground">{isEs ? "Completados" : "Completed"}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <p className="text-2xl font-bold">{selectedSequence.steps?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">{isEs ? "Pasos" : "Steps"}</p>
                  </div>
                </div>

                {/* Steps */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium">{isEs ? "Pasos de la Secuencia" : "Sequence Steps"}</h3>
                  <Button size="sm" onClick={() => { resetStepForm(); setStepDialogOpen(true); }}>
                    <Plus className="w-4 h-4 mr-1" /> {isEs ? "Agregar Paso" : "Add Step"}
                  </Button>
                </div>

                {!selectedSequence.steps || selectedSequence.steps.length === 0 ? (
                  <div className="text-center py-8 border rounded-lg bg-muted/20">
                    <MailPlus className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">{isEs ? "No hay pasos configurados" : "No steps configured"}</p>
                    <Button variant="link" onClick={() => { resetStepForm(); setStepDialogOpen(true); }}>
                      {isEs ? "Agregar primer paso" : "Add first step"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedSequence.steps.map((step, idx) => (
                      <div key={step.step_id} className="flex items-center gap-3">
                        {/* Step number */}
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium shrink-0">
                          {idx + 1}
                        </div>

                        {/* Delay indicator */}
                        {idx > 0 && (
                          <div className="flex items-center text-xs text-muted-foreground">
                            <Clock className="w-3 h-3 mr-1" />
                            {formatDelay(step.delay_days, step.delay_hours)}
                          </div>
                        )}
                        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />

                        {/* Step card */}
                        <Card className="flex-1">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-sm">{step.subject || (isEs ? "Sin asunto" : "No subject")}</p>
                                <p className="text-xs text-muted-foreground">
                                  {isEs ? "Enviados" : "Sent"}: {step.sent_count || 0} | 
                                  {isEs ? " Abiertos" : " Opens"}: {step.open_count || 0} | 
                                  Clicks: {step.click_count || 0}
                                </p>
                              </div>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditStep(step)}>
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteStep(step.step_id)}>
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <CardContent className="text-center py-16">
                <Mail className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-medium mb-1">
                  {isEs ? "Selecciona una secuencia" : "Select a sequence"}
                </h3>
                <p className="text-muted-foreground">
                  {isEs ? "Elige una secuencia de la lista para ver sus detalles" : "Choose a sequence from the list to view its details"}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Create/Edit Sequence Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingSequence 
                ? (isEs ? "Editar Secuencia" : "Edit Sequence")
                : (isEs ? "Nueva Secuencia" : "New Sequence")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"} *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={isEs ? "Ej: Secuencia de Bienvenida" : "E.g. Welcome Sequence"}
              />
            </div>
            
            <div>
              <Label>{isEs ? "Descripción" : "Description"}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={isEs ? "Descripción opcional" : "Optional description"}
                rows={2}
              />
            </div>

            <div>
              <Label>{isEs ? "Disparador" : "Trigger"}</Label>
              <Select 
                value={formData.trigger_type} 
                onValueChange={(v) => setFormData({ ...formData, trigger_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <t.icon className="w-4 h-4" />
                        {isEs ? t.labelEs : t.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {TRIGGER_TYPES.find(t => t.value === formData.trigger_type)?.desc}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveSequence} disabled={!formData.name}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Step Dialog */}
      <Dialog open={stepDialogOpen} onOpenChange={setStepDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingStep 
                ? (isEs ? "Editar Paso" : "Edit Step")
                : (isEs ? "Nuevo Paso" : "New Step")}
            </DialogTitle>
            <DialogDescription>
              {isEs ? "Configura el contenido y tiempo de envío de este email" : "Configure the content and timing for this email"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Esperar (días)" : "Wait (days)"}</Label>
                <Input
                  type="number"
                  min="0"
                  value={stepForm.delay_days}
                  onChange={(e) => setStepForm({ ...stepForm, delay_days: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>{isEs ? "Esperar (horas)" : "Wait (hours)"}</Label>
                <Input
                  type="number"
                  min="0"
                  max="23"
                  value={stepForm.delay_hours}
                  onChange={(e) => setStepForm({ ...stepForm, delay_hours: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div>
              <Label>{isEs ? "Asunto del Email" : "Email Subject"} *</Label>
              <Input
                value={stepForm.subject}
                onChange={(e) => setStepForm({ ...stepForm, subject: e.target.value })}
                placeholder={isEs ? "Asunto del email" : "Email subject line"}
              />
            </div>

            <div>
              <Label>{isEs ? "Plantilla" : "Template"}</Label>
              <Select 
                value={stepForm.template_id || "none"} 
                onValueChange={(v) => setStepForm({ ...stepForm, template_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar plantilla" : "Select template"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Sin plantilla" : "No template"}</SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.template_id} value={t.template_id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{isEs ? "Contenido del Email" : "Email Content"}</Label>
              <Textarea
                value={stepForm.body_text}
                onChange={(e) => setStepForm({ ...stepForm, body_text: e.target.value })}
                placeholder={isEs ? "Escribe el contenido del email..." : "Write the email content..."}
                rows={6}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {isEs ? "Variables disponibles: {{name}}, {{email}}, {{company}}" : "Available variables: {{name}}, {{email}}, {{company}}"}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStepDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveStep} disabled={!stepForm.subject}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
