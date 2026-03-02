// components/demand-studio/SocialSharing.js - Share Social Media with External Agencies
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
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
  Users, Link2, Copy, Check, Plus, Trash2, Mail, Shield, Eye, Edit,
  Loader2, ExternalLink, Clock, Lock, Unlock, RefreshCw
} from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

export default function SocialSharing() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [collaborators, setCollaborators] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [shareLinks, setShareLinks] = useState([]);
  
  // Dialog states
  const [inviteOpen, setInviteOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("social_contributor");
  const [linkName, setLinkName] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [linkExpiry, setLinkExpiry] = useState("30");
  const [linkPermission, setLinkPermission] = useState("contributor");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [collabRes, linksRes] = await Promise.all([
        axios.get(`${API}/api/social-sharing/collaborators`, { withCredentials: true }),
        axios.get(`${API}/api/social-sharing/links`, { withCredentials: true })
      ]);
      
      setCollaborators(collabRes.data?.collaborators || []);
      setPendingInvites(collabRes.data?.pending_invitations || []);
      setShareLinks(linksRes.data || []);
    } catch (error) {
      console.error("Error fetching sharing data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error(isEs ? "Ingresa un email" : "Enter an email");
      return;
    }
    
    setSaving(true);
    try {
      const res = await axios.post(`${API}/api/social-sharing/collaborators/invite`, {
        email: inviteEmail,
        role: inviteRole
      }, { withCredentials: true });
      
      toast.success(res.data?.message || (isEs ? "Invitación enviada" : "Invitation sent"));
      setInviteOpen(false);
      setInviteEmail("");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || (isEs ? "Error al invitar" : "Invite error"));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCollaborator = async (membershipId) => {
    if (!confirm(isEs ? "¿Remover este colaborador?" : "Remove this collaborator?")) return;
    
    try {
      await axios.delete(`${API}/api/social-sharing/collaborators/${membershipId}`, { withCredentials: true });
      toast.success(isEs ? "Colaborador removido" : "Collaborator removed");
      fetchData();
    } catch (error) {
      toast.error(isEs ? "Error al remover" : "Remove error");
    }
  };

  const handleCreateLink = async () => {
    if (!linkName.trim()) {
      toast.error(isEs ? "Ingresa un nombre" : "Enter a name");
      return;
    }
    
    setSaving(true);
    try {
      const res = await axios.post(`${API}/api/social-sharing/links`, {
        name: linkName,
        password: linkPassword || null,
        expires_in_days: parseInt(linkExpiry) || null,
        permissions: linkPermission
      }, { withCredentials: true });
      
      toast.success(isEs ? "Link creado" : "Link created");
      setLinkOpen(false);
      setLinkName("");
      setLinkPassword("");
      
      // Copy to clipboard
      navigator.clipboard.writeText(res.data?.share_url);
      toast.success(isEs ? "Link copiado al portapapeles" : "Link copied to clipboard");
      
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || (isEs ? "Error al crear link" : "Create link error"));
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeLink = async (shareId) => {
    if (!confirm(isEs ? "¿Revocar este link?" : "Revoke this link?")) return;
    
    try {
      await axios.delete(`${API}/api/social-sharing/links/${shareId}`, { withCredentials: true });
      toast.success(isEs ? "Link revocado" : "Link revoked");
      fetchData();
    } catch (error) {
      toast.error(isEs ? "Error al revocar" : "Revoke error");
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const getRoleBadge = (role) => {
    const roles = {
      social_viewer: { label: isEs ? "Visor" : "Viewer", variant: "secondary" },
      social_contributor: { label: isEs ? "Colaborador" : "Contributor", variant: "default" },
      admin: { label: "Admin", variant: "destructive" },
      manager: { label: "Manager", variant: "outline" },
      owner: { label: "Owner", variant: "destructive" }
    };
    const r = roles[role] || { label: role, variant: "outline" };
    return <Badge variant={r.variant}>{r.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Internal Collaborators */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                {isEs ? "Colaboradores Internos" : "Internal Collaborators"}
              </CardTitle>
              <CardDescription>
                {isEs 
                  ? "Usuarios de Kora con acceso a tu Social Media"
                  : "Kora users with access to your Social Media"}
              </CardDescription>
            </div>
            <Button onClick={() => setInviteOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {isEs ? "Invitar" : "Invite"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {collaborators.length === 0 && pendingInvites.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {isEs ? "No hay colaboradores. Invita a tu equipo." : "No collaborators. Invite your team."}
            </p>
          ) : (
            <div className="space-y-3">
              {collaborators.map((collab) => (
                <div key={collab.membership_id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-medium">{collab.name?.[0]?.toUpperCase() || "?"}</span>
                    </div>
                    <div>
                      <p className="font-medium">{collab.name || collab.email}</p>
                      <p className="text-sm text-muted-foreground">{collab.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getRoleBadge(collab.role)}
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleRemoveCollaborator(collab.membership_id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              
              {pendingInvites.map((invite, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border rounded-lg border-dashed">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{invite.email}</p>
                      <p className="text-sm text-muted-foreground">{isEs ? "Invitación pendiente" : "Pending invitation"}</p>
                    </div>
                  </div>
                  <Badge variant="outline">{isEs ? "Pendiente" : "Pending"}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* External Share Links */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="w-5 h-5" />
                {isEs ? "Links Externos" : "External Links"}
              </CardTitle>
              <CardDescription>
                {isEs 
                  ? "Comparte con agencias que no tienen cuenta de Kora"
                  : "Share with agencies without a Kora account"}
              </CardDescription>
            </div>
            <Button onClick={() => setLinkOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {isEs ? "Crear Link" : "Create Link"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {shareLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {isEs ? "No hay links externos activos." : "No active external links."}
            </p>
          ) : (
            <div className="space-y-3">
              {shareLinks.map((link) => (
                <div key={link.share_id} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{link.name}</p>
                        {link.has_password ? (
                          <Lock className="w-3 h-3 text-muted-foreground" />
                        ) : (
                          <Unlock className="w-3 h-3 text-muted-foreground" />
                        )}
                        <Badge variant={link.permissions === "contributor" ? "default" : "secondary"}>
                          {link.permissions === "contributor" 
                            ? (isEs ? "Puede editar" : "Can edit") 
                            : (isEs ? "Solo ver" : "View only")}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-2">
                        <Input 
                          value={link.share_url} 
                          readOnly 
                          className="text-xs h-8 bg-muted"
                        />
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => copyToClipboard(link.share_url, link.share_id)}
                        >
                          {copied === link.share_id ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {link.access_count} {isEs ? "accesos" : "views"}
                        </span>
                        {link.expires_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {isEs ? "Expira:" : "Expires:"} {new Date(link.expires_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleRevokeLink(link.share_id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Invitar Colaborador" : "Invite Collaborator"}</DialogTitle>
            <DialogDescription>
              {isEs 
                ? "Invita a un usuario de Kora a colaborar en tu Social Media"
                : "Invite a Kora user to collaborate on your Social Media"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colaborador@agencia.com"
              />
            </div>
            <div className="space-y-2">
              <Label>{isEs ? "Permisos" : "Permissions"}</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="social_viewer">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4" />
                      {isEs ? "Visor - Solo puede ver" : "Viewer - Read only"}
                    </div>
                  </SelectItem>
                  <SelectItem value="social_contributor">
                    <div className="flex items-center gap-2">
                      <Edit className="w-4 h-4" />
                      {isEs ? "Colaborador - Puede crear borradores" : "Contributor - Can create drafts"}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleInvite} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
              {isEs ? "Enviar Invitación" : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Link Dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Crear Link Externo" : "Create External Link"}</DialogTitle>
            <DialogDescription>
              {isEs 
                ? "Crea un link para compartir con agencias sin cuenta de Kora"
                : "Create a link to share with agencies without a Kora account"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{isEs ? "Nombre (para identificar)" : "Name (for identification)"}</Label>
              <Input
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                placeholder={isEs ? "Ej: Agencia Marketing XYZ" : "E.g: Marketing Agency XYZ"}
              />
            </div>
            <div className="space-y-2">
              <Label>{isEs ? "Contraseña (opcional)" : "Password (optional)"}</Label>
              <Input
                type="password"
                value={linkPassword}
                onChange={(e) => setLinkPassword(e.target.value)}
                placeholder={isEs ? "Dejar vacío para sin contraseña" : "Leave empty for no password"}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isEs ? "Expira en" : "Expires in"}</Label>
                <Select value={linkExpiry} onValueChange={setLinkExpiry}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 {isEs ? "días" : "days"}</SelectItem>
                    <SelectItem value="30">30 {isEs ? "días" : "days"}</SelectItem>
                    <SelectItem value="90">90 {isEs ? "días" : "days"}</SelectItem>
                    <SelectItem value="365">1 {isEs ? "año" : "year"}</SelectItem>
                    <SelectItem value="never">{isEs ? "Nunca" : "Never"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isEs ? "Permisos" : "Permissions"}</Label>
                <Select value={linkPermission} onValueChange={setLinkPermission}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">{isEs ? "Solo ver" : "View only"}</SelectItem>
                    <SelectItem value="contributor">{isEs ? "Ver + Crear" : "View + Create"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreateLink} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
              {isEs ? "Crear Link" : "Create Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
