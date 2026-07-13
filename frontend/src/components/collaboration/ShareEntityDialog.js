// components/collaboration/ShareEntityDialog.js
// Dialog for sharing a Project or Campaign with another organization

import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { Share2, Mail, AlertCircle } from "lucide-react";
import { KoraLoader } from "../KoraLoader";
import { useLanguage } from "../../contexts/LanguageContext";

const API = process.env.REACT_APP_BACKEND_URL;

const PERMISSION_LEVELS = [
  { value: "view", labelEn: "View Only", labelEs: "Solo Ver" },
  { value: "comment", labelEn: "Comment", labelEs: "Comentar" },
  { value: "create", labelEn: "Create Items", labelEs: "Crear Elementos" },
  { value: "edit", labelEn: "Full Edit", labelEs: "Edición Completa" },
];

const SCOPE_OPTIONS = [
  { value: "tasks", labelEn: "Tasks", labelEs: "Tareas" },
  { value: "assets", labelEn: "Assets", labelEs: "Recursos" },
  { value: "deliverables", labelEn: "Deliverables", labelEs: "Entregables" },
  { value: "posts", labelEn: "Social Posts", labelEs: "Publicaciones" },
  { value: "comments", labelEn: "Comments", labelEs: "Comentarios" },
];

export default function ShareEntityDialog({ 
  open, 
  onOpenChange, 
  entityType, // "project" | "campaign"
  entityId,
  entityName,
  onShareComplete 
}) {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(false);
  const [targetEmail, setTargetEmail] = useState("");
  const [permissionLevel, setPermissionLevel] = useState("create");
  const [scope, setScope] = useState(["tasks", "assets", "deliverables", "posts", "comments"]);
  const [message, setMessage] = useState("");

  const handleScopeToggle = (scopeItem) => {
    if (scope.includes(scopeItem)) {
      setScope(scope.filter(s => s !== scopeItem));
    } else {
      setScope([...scope, scopeItem]);
    }
  };

  const handleShare = async () => {
    if (!targetEmail) {
      toast.error(isEs ? "Ingresa un email" : "Enter an email");
      return;
    }
    if (scope.length === 0) {
      toast.error(isEs ? "Selecciona al menos un alcance" : "Select at least one scope");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/api/share/entity`, {
        target_email: targetEmail,
        entity_type: entityType,
        entity_id: entityId,
        permission_level: permissionLevel,
        scope: scope,
        message: message || null
      }, { withCredentials: true });

      toast.success(
        isEs 
          ? `${entityType === "project" ? "Proyecto" : "Campaña"} compartido exitosamente` 
          : `${entityType === "project" ? "Project" : "Campaign"} shared successfully`
      );
      
      // Reset form
      setTargetEmail("");
      setMessage("");
      setPermissionLevel("create");
      setScope(["tasks", "assets", "deliverables", "posts", "comments"]);
      
      onOpenChange(false);
      if (onShareComplete) onShareComplete(response.data);
    } catch (error) {
      const errorMsg = error.response?.data?.detail || "Error sharing";
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            {isEs ? "Compartir con Otra Organización" : "Share with Another Organization"}
          </DialogTitle>
          <DialogDescription>
            {isEs 
              ? `Compartir "${entityName}" permitirá a otra organización colaborar en este ${entityType === "project" ? "proyecto" : "campaña"}.`
              : `Sharing "${entityName}" will allow another organization to collaborate on this ${entityType}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Target Email */}
          <div className="space-y-2">
            <Label htmlFor="target-email" className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              {isEs ? "Email del Administrador" : "Admin Email"}
            </Label>
            <Input
              id="target-email"
              type="email"
              placeholder={isEs ? "admin@agencia.com" : "admin@agency.com"}
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
              data-testid="share-target-email"
            />
            <p className="text-xs text-muted-foreground">
              {isEs 
                ? "Ingresa el email de un administrador de la organización colaboradora"
                : "Enter the email of an admin from the collaborating organization"}
            </p>
          </div>

          {/* Permission Level */}
          <div className="space-y-2">
            <Label>{isEs ? "Nivel de Permiso" : "Permission Level"}</Label>
            <Select value={permissionLevel} onValueChange={setPermissionLevel}>
              <SelectTrigger data-testid="share-permission-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERMISSION_LEVELS.map(p => (
                  <SelectItem key={p.value} value={p.value}>
                    {isEs ? p.labelEs : p.labelEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scope */}
          <div className="space-y-2">
            <Label>{isEs ? "Alcance de Acceso" : "Access Scope"}</Label>
            <div className="grid grid-cols-2 gap-2">
              {SCOPE_OPTIONS.map(s => (
                <div key={s.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`scope-${s.value}`}
                    checked={scope.includes(s.value)}
                    onCheckedChange={() => handleScopeToggle(s.value)}
                  />
                  <label htmlFor={`scope-${s.value}`} className="text-sm cursor-pointer">
                    {isEs ? s.labelEs : s.labelEn}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Optional Message */}
          <div className="space-y-2">
            <Label>{isEs ? "Mensaje (opcional)" : "Message (optional)"}</Label>
            <Textarea
              placeholder={isEs ? "Agregar un mensaje..." : "Add a message..."}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
            />
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              {isEs 
                ? "La organización colaboradora podrá ver y modificar elementos según los permisos otorgados. Puedes revocar el acceso en cualquier momento."
                : "The collaborating organization will be able to view and modify items based on granted permissions. You can revoke access at any time."}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {isEs ? "Cancelar" : "Cancel"}
          </Button>
          <Button onClick={handleShare} disabled={loading} data-testid="confirm-share-button">
            {loading && <KoraLoader size={16} className="mr-2" />}
            {isEs ? "Compartir" : "Share"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
