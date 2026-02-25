// components/BugReportButton.js - Minimal bug report button
import { useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import axios from "axios";
import { API_BASE as API } from "../utils/api";

import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { toast } from "sonner";
import { Bug, Send, Loader2 } from "lucide-react";

export default function BugReportButton({ variant = "ghost", size = "icon", className = "" }) {
  const { language } = useLanguage();
  const isEs = language === "es";

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    type: "bug",
    subject: "",
    description: "",
    priority: "normal"
  });

  const handleSubmit = async () => {
    if (!form.subject.trim() || !form.description.trim()) {
      toast.error(isEs ? "Por favor completa todos los campos" : "Please fill all fields");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        page_url: window.location.href,
        browser_info: navigator.userAgent
      };
      
      const res = await axios.post(`${API}/api/support/tickets`, payload, { withCredentials: true });
      
      toast.success(
        isEs 
          ? `Ticket ${res.data.ticket_id} creado. ¡Gracias por tu feedback!`
          : `Ticket ${res.data.ticket_id} created. Thanks for your feedback!`
      );
      setOpen(false);
      setForm({ type: "bug", subject: "", description: "", priority: "normal" });
    } catch (error) {
      console.error("Error creating ticket:", error);
      toast.error(isEs ? "Error al enviar el reporte" : "Error submitting report");
    }
    setSubmitting(false);
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        title={isEs ? "Reportar Bug" : "Report Bug"}
      >
        <Bug className="w-4 h-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="w-5 h-5" />
              {isEs ? "Reportar Problema" : "Report Issue"}
            </DialogTitle>
            <DialogDescription>
              {isEs 
                ? "Ayúdanos a mejorar reportando bugs o sugiriendo mejoras"
                : "Help us improve by reporting bugs or suggesting features"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{isEs ? "Tipo" : "Type"}</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bug">🐛 Bug</SelectItem>
                    <SelectItem value="feature">💡 {isEs ? "Sugerencia" : "Feature"}</SelectItem>
                    <SelectItem value="question">❓ {isEs ? "Pregunta" : "Question"}</SelectItem>
                    <SelectItem value="other">📝 {isEs ? "Otro" : "Other"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{isEs ? "Prioridad" : "Priority"}</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{isEs ? "Baja" : "Low"}</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">{isEs ? "Alta" : "High"}</SelectItem>
                    <SelectItem value="urgent">{isEs ? "Urgente" : "Urgent"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">{isEs ? "Asunto" : "Subject"}</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder={isEs ? "Resumen breve del problema" : "Brief summary of the issue"}
                className="h-9"
              />
            </div>

            <div>
              <Label className="text-xs">{isEs ? "Descripción" : "Description"}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={isEs 
                  ? "¿Qué pasó? ¿Qué esperabas que pasara? Pasos para reproducir..."
                  : "What happened? What did you expect? Steps to reproduce..."}
                rows={4}
              />
            </div>

            <p className="text-[10px] text-muted-foreground">
              {isEs 
                ? "Se incluirá automáticamente la URL actual y info del navegador"
                : "Current URL and browser info will be automatically included"}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  {isEs ? "Enviar" : "Submit"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
