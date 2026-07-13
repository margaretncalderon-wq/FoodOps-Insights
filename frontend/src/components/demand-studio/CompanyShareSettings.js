// components/demand-studio/CompanyShareSettings.js - Granular Permission Configuration
import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
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
import { Users, Building2, Mail, Shield, Eye, Edit, UserPlus, Hash, Target, Receipt, BarChart3, FileText, Zap, Check, X } from "lucide-react";
import { KoraLoader } from "../KoraLoader";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

// Available sections to share
const SHAREABLE_SECTIONS = [
  { id: "social_media", label: "Social Media", labelEs: "Social Media", icon: Hash },
  { id: "campaigns", label: "Campaigns", labelEs: "Campañas", icon: Target },
  { id: "spend_ledger", label: "Spend Ledger", labelEs: "Libro de Gastos", icon: Receipt },
  { id: "email_marketing", label: "Email Marketing", labelEs: "Email Marketing", icon: Mail },
  { id: "notes", label: "Notes", labelEs: "Notas", icon: FileText },
  { id: "insights", label: "Insights", labelEs: "Insights", icon: BarChart3 },
  { id: "activations", label: "Activations", labelEs: "Activaciones", icon: Zap },
];

const PERMISSION_LEVELS = [
  { value: "admin", label: "Admin", labelEs: "Admin", description: "Full access", descriptionEs: "Acceso completo" },
  { value: "editor", label: "Editor", labelEs: "Editor", description: "Create & edit", descriptionEs: "Crear y editar" },
  { value: "viewer", label: "Viewer", labelEs: "Solo ver", description: "View only", descriptionEs: "Solo lectura" },
];

export default function CompanyShareSettings({ open, onOpenChange, existingMembership = null }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Section permissions state
  const [permissions, setPermissions] = useState({
    social_media: { enabled: true, role: "editor" },
    campaigns: { enabled: true, role: "editor" },
    spend_ledger: { enabled: false, role: "viewer" },
    email_marketing: { enabled: false, role: "viewer" },
    notes: { enabled: true, role: "editor" },
    insights: { enabled: true, role: "viewer" },
    activations: { enabled: false, role: "viewer" },
  });

  // Load existing permissions if editing
  useEffect(() => {
    if (existingMembership?.permissions) {
      setPermissions(existingMembership.permissions);
      setEmail(existingMembership.email || "");
    }
  }, [existingMembership]);

  const toggleSection = (sectionId) => {
    setPermissions(prev => ({
      ...prev,
      [sectionId]: {
        ...prev[sectionId],
        enabled: !prev[sectionId].enabled
      }
    }));
  };

  const setRole = (sectionId, role) => {
    setPermissions(prev => ({
      ...prev,
      [sectionId]: {
        ...prev[sectionId],
        role
      }
    }));
  };

  const handleSave = async () => {
    if (!email.trim() && !existingMembership) {
      toast.error(isEs ? "Ingresa un email" : "Enter an email");
      return;
    }
    
    setSaving(true);
    try {
      const endpoint = existingMembership 
        ? `${API}/api/company-sharing/members/${existingMembership.membership_id}`
        : `${API}/api/company-sharing/invite`;
      
      const method = existingMembership ? "patch" : "post";
      
      await axios[method](endpoint, {
        email: email.toLowerCase(),
        permissions
      }, { withCredentials: true });
      
      toast.success(isEs 
        ? (existingMembership ? "Permisos actualizados" : "Invitación enviada")
        : (existingMembership ? "Permissions updated" : "Invitation sent")
      );
      
      onOpenChange(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };

  // Count enabled sections
  const enabledCount = Object.values(permissions).filter(p => p.enabled).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            {existingMembership 
              ? (isEs ? "Editar Permisos" : "Edit Permissions")
              : (isEs ? "Compartir Empresa" : "Share Company")
            }
          </DialogTitle>
          <DialogDescription>
            {isEs 
              ? "Configura qué secciones puede ver y con qué permisos"
              : "Configure which sections they can access and with what permissions"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Email input (only for new invites) */}
          {!existingMembership && (
            <div>
              <Label htmlFor="email">{isEs ? "Email del colaborador" : "Collaborator email"}</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="email"
                  type="email"
                  placeholder="colaborador@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1"
                  data-testid="share-email-input"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {isEs 
                  ? "Si el usuario no tiene cuenta, recibirá una invitación"
                  : "If user doesn't have an account, they'll receive an invitation"
                }
              </p>
            </div>
          )}

          {/* Existing user info */}
          {existingMembership && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{existingMembership.name || existingMembership.email}</p>
                <p className="text-sm text-muted-foreground">{existingMembership.email}</p>
              </div>
            </div>
          )}

          {/* Section permissions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label>{isEs ? "Secciones a compartir" : "Sections to share"}</Label>
              <Badge variant="secondary">
                {enabledCount} / {SHAREABLE_SECTIONS.length}
              </Badge>
            </div>
            
            <div className="space-y-3">
              {SHAREABLE_SECTIONS.map((section) => {
                const perm = permissions[section.id];
                const Icon = section.icon;
                
                return (
                  <div 
                    key={section.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      perm.enabled ? "bg-primary/5 border-primary/20" : "bg-muted/30"
                    }`}
                    data-testid={`section-${section.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={perm.enabled}
                        onCheckedChange={() => toggleSection(section.id)}
                        data-testid={`toggle-${section.id}`}
                      />
                      <Icon className={`w-4 h-4 ${perm.enabled ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={perm.enabled ? "font-medium" : "text-muted-foreground"}>
                        {isEs ? section.labelEs : section.label}
                      </span>
                    </div>
                    
                    {perm.enabled && (
                      <Select value={perm.role} onValueChange={(val) => setRole(section.id, val)}>
                        <SelectTrigger className="w-32" data-testid={`role-${section.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PERMISSION_LEVELS.map((level) => (
                            <SelectItem key={level.value} value={level.value}>
                              <div className="flex items-center gap-2">
                                {level.value === "admin" && <Shield className="w-3 h-3" />}
                                {level.value === "editor" && <Edit className="w-3 h-3" />}
                                {level.value === "viewer" && <Eye className="w-3 h-3" />}
                                {isEs ? level.labelEs : level.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick presets */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">
              {isEs ? "Presets rápidos" : "Quick presets"}
            </Label>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  const newPerms = {};
                  SHAREABLE_SECTIONS.forEach(s => {
                    newPerms[s.id] = { enabled: true, role: "admin" };
                  });
                  setPermissions(newPerms);
                }}
              >
                {isEs ? "Acceso Completo" : "Full Access"}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setPermissions({
                    social_media: { enabled: true, role: "editor" },
                    campaigns: { enabled: true, role: "editor" },
                    spend_ledger: { enabled: false, role: "viewer" },
                    email_marketing: { enabled: false, role: "viewer" },
                    notes: { enabled: true, role: "editor" },
                    insights: { enabled: true, role: "viewer" },
                    activations: { enabled: false, role: "viewer" },
                  });
                }}
              >
                {isEs ? "Agencia Social" : "Social Agency"}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  const newPerms = {};
                  SHAREABLE_SECTIONS.forEach(s => {
                    newPerms[s.id] = { enabled: true, role: "viewer" };
                  });
                  setPermissions(newPerms);
                }}
              >
                {isEs ? "Solo Lectura" : "View Only"}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isEs ? "Cancelar" : "Cancel"}
          </Button>
          <Button onClick={handleSave} disabled={saving} data-testid="save-permissions-btn">
            {saving && <KoraLoader size={16} className="mr-2" />}
            {existingMembership 
              ? (isEs ? "Guardar Cambios" : "Save Changes")
              : (isEs ? "Enviar Invitación" : "Send Invitation")
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
