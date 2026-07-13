// components/BugReportButton.js - Bug report button with screenshot upload
import { useState, useRef } from "react";
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
import { Bug, Send, Upload, X, Image, Video } from "lucide-react";

import { KoraLoader } from "./KoraLoader";
export default function BugReportButton({ variant = "ghost", size = "icon", className = "" }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const fileInputRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    type: "bug",
    subject: "",
    description: "",
    priority: "normal"
  });
  const [attachment, setAttachment] = useState(null); // { file, preview, type }

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type (images and videos)
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    
    if (!isImage && !isVideo) {
      toast.error(isEs ? "Solo imágenes o videos" : "Only images or videos allowed");
      return;
    }

    // Validate file size (max 10MB for images, 50MB for videos)
    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(isEs 
        ? `Archivo muy grande. Máximo ${isVideo ? "50MB" : "10MB"}`
        : `File too large. Max ${isVideo ? "50MB" : "10MB"}`
      );
      return;
    }

    // Create preview
    const preview = URL.createObjectURL(file);
    setAttachment({ file, preview, type: isVideo ? "video" : "image" });
  };

  const removeAttachment = () => {
    if (attachment?.preview) {
      URL.revokeObjectURL(attachment.preview);
    }
    setAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const res = await axios.post(`${API}/api/upload`, formData, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" }
      });
      return res.data.url || res.data.file_url;
    } catch (error) {
      console.error("Upload error:", error);
      // If upload endpoint doesn't exist, convert to base64
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    }
  };

  const handleSubmit = async () => {
    if (!form.subject.trim() || !form.description.trim()) {
      toast.error(isEs ? "Por favor completa todos los campos" : "Please fill all fields");
      return;
    }

    setSubmitting(true);
    try {
      let screenshotUrl = null;
      
      // Upload attachment if present
      if (attachment?.file) {
        setUploading(true);
        try {
          screenshotUrl = await uploadFile(attachment.file);
        } catch (uploadErr) {
          console.error("Upload failed:", uploadErr);
        }
        setUploading(false);
      }

      const payload = {
        ...form,
        page_url: window.location.href,
        browser_info: navigator.userAgent,
        screenshot_url: screenshotUrl
      };
      
      const res = await axios.post(`${API}/api/support/tickets`, payload, { withCredentials: true });
      
      toast.success(
        isEs 
          ? `Ticket ${res.data.ticket_id} creado. ¡Gracias por tu feedback!`
          : `Ticket ${res.data.ticket_id} created. Thanks for your feedback!`
      );
      
      // Cleanup
      removeAttachment();
      setOpen(false);
      setForm({ type: "bug", subject: "", description: "", priority: "normal" });
    } catch (error) {
      console.error("Error creating ticket:", error);
      toast.error(isEs ? "Error al enviar el reporte" : "Error submitting report");
    }
    setSubmitting(false);
  };

  const handleClose = () => {
    removeAttachment();
    setOpen(false);
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        title={isEs ? "Reportar Bug" : "Report Bug"}
        data-testid="bug-report-button"
      >
        <Bug className="w-4 h-4" />
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
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
                data-testid="bug-report-subject"
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
                rows={3}
                data-testid="bug-report-description"
              />
            </div>

            {/* Screenshot/Video Upload */}
            <div>
              <Label className="text-xs">{isEs ? "Captura de pantalla o video (opcional)" : "Screenshot or video (optional)"}</Label>
              
              {!attachment ? (
                <div 
                  className="mt-1 border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {isEs ? "Clic para subir imagen o video" : "Click to upload image or video"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {isEs ? "Máx: 10MB imagen, 50MB video" : "Max: 10MB image, 50MB video"}
                  </p>
                </div>
              ) : (
                <div className="mt-1 relative border rounded-lg overflow-hidden">
                  {attachment.type === "image" ? (
                    <img 
                      src={attachment.preview} 
                      alt="Preview" 
                      className="w-full h-32 object-cover"
                    />
                  ) : (
                    <div className="w-full h-32 bg-muted flex items-center justify-center">
                      <Video className="w-8 h-8 text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">
                        {attachment.file.name}
                      </span>
                    </div>
                  )}
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6"
                    onClick={removeAttachment}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            <p className="text-[10px] text-muted-foreground">
              {isEs 
                ? "Se incluirá automáticamente la URL actual y info del navegador"
                : "Current URL and browser info will be automatically included"}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || uploading} data-testid="bug-report-submit">
              {submitting || uploading ? (
                <>
                  <KoraLoader size={16} className="mr-2" />
                  {uploading ? (isEs ? "Subiendo..." : "Uploading...") : (isEs ? "Enviando..." : "Sending...")}
                </>
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
