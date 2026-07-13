// components/demand-studio/AccountSharing.js - Share Individual Social Accounts
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
import { Users, Link2, Copy, Check, Plus, Trash2, Mail, Shield, Eye, Edit, ExternalLink, Clock, Lock, Unlock, RefreshCw, Instagram, Linkedin, Youtube, Hash, AtSign } from "lucide-react";
import { KoraLoader } from "../KoraLoader";
import { toast } from "sonner";
import { formatDateOnly } from "../../utils/dates";

const API = process.env.REACT_APP_BACKEND_URL;

export default function AccountSharing({ accounts = [] }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [collaborators, setCollaborators] = useState([]);
  const [shareLinks, setShareLinks] = useState([]);
  
  // Dialog states
  const [inviteOpen, setInviteOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("contributor");
  const [linkName, setLinkName] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [linkExpiry, setLinkExpiry] = useState("30");
  const [linkPermission, setLinkPermission] = useState("contributor");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(null);

  // Get platform icon
  const getPlatformIcon = (platform) => {
    switch (platform?.toLowerCase()) {
      case 'instagram': return <Instagram className="w-4 h-4 text-pink-500" />;
      case 'linkedin': return <Linkedin className="w-4 h-4 text-blue-600" />;
      case 'youtube': return <Youtube className="w-4 h-4 text-red-500" />;
      case 'tiktok': return <Hash className="w-4 h-4" />;
      case 'facebook': return <Hash className="w-4 h-4 text-blue-500" />;
      default: return <AtSign className="w-4 h-4" />;
    }
  };

  const fetchAccountData = useCallback(async (accountId) => {
    if (!accountId) return;
    setLoading(true);
    try {
      const [collabRes, linksRes] = await Promise.all([
        axios.get(`${API}/api/account-sharing/collaborators/${accountId}`, { withCredentials: true }),
        axios.get(`${API}/api/account-sharing/links/${accountId}`, { withCredentials: true })
      ]);
      
      setCollaborators(collabRes.data?.collaborators || []);
      setShareLinks(linksRes.data || []);
    } catch (error) {
      console.error("Error fetching account sharing data:", error);
      setCollaborators([]);
      setShareLinks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      fetchAccountData(selectedAccountId);
    }
  }, [selectedAccountId, fetchAccountData]);

  // Filter only owned accounts (can only share accounts you own)
  const ownedAccounts = accounts.filter(a => a._access_type === "owned");

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !selectedAccountId) {
      toast.error(isEs ? "Ingresa un email" : "Enter an email");
      return;
    }
    
    setSaving(true);
    try {
      await axios.post(
        `${API}/api/account-sharing/share?account_id=${selectedAccountId}`,
        { email: inviteEmail, role: inviteRole },
        { withCredentials: true }
      );
      
      toast.success(isEs ? "Invitación enviada" : "Invitation sent");
      setInviteEmail("");
      setInviteOpen(false);
      fetchAccountData(selectedAccountId);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error sending invitation");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateLink = async () => {
    if (!linkName.trim() || !selectedAccountId) {
      toast.error(isEs ? "Ingresa un nombre" : "Enter a name");
      return;
    }
    
    setSaving(true);
    try {
      const res = await axios.post(
        `${API}/api/account-sharing/links`,
        {
          account_id: selectedAccountId,
          name: linkName,
          password: linkPassword || null,
          expires_in_days: parseInt(linkExpiry) || 30,
          permissions: linkPermission
        },
        { withCredentials: true }
      );
      
      toast.success(isEs ? "Link creado" : "Link created");
      setLinkName("");
      setLinkPassword("");
      setLinkOpen(false);
      fetchAccountData(selectedAccountId);
      
      // Copy to clipboard
      if (res.data?.share_url) {
        navigator.clipboard.writeText(res.data.share_url);
        toast.success(isEs ? "Link copiado al portapapeles" : "Link copied to clipboard");
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error creating link");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCollaborator = async (membershipId) => {
    try {
      await axios.delete(`${API}/api/account-sharing/collaborators/${membershipId}`, { withCredentials: true });
      toast.success(isEs ? "Acceso revocado" : "Access revoked");
      fetchAccountData(selectedAccountId);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error removing collaborator");
    }
  };

  const handleRevokeLink = async (shareId) => {
    try {
      await axios.delete(`${API}/api/account-sharing/links/${shareId}`, { withCredentials: true });
      toast.success(isEs ? "Link revocado" : "Link revoked");
      fetchAccountData(selectedAccountId);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error revoking link");
    }
  };

  const copyToClipboard = (url, id) => {
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
    toast.success(isEs ? "Copiado" : "Copied");
  };

  const selectedAccount = ownedAccounts.find(a => a.account_id === selectedAccountId);

  return (
    <div className="space-y-6" data-testid="account-sharing">
      {/* Account Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AtSign className="w-5 h-5" />
            {isEs ? "Compartir Cuentas Individuales" : "Share Individual Accounts"}
          </CardTitle>
          <CardDescription>
            {isEs 
              ? "Comparte acceso a cuentas específicas con colaboradores o agencias" 
              : "Share access to specific accounts with collaborators or agencies"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ownedAccounts.length === 0 ? (
            <div className="text-center text-muted-foreground py-6">
              {isEs ? "No tienes cuentas propias para compartir" : "You have no owned accounts to share"}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>{isEs ? "Selecciona una cuenta" : "Select an account"}</Label>
                <Select value={selectedAccountId || ""} onValueChange={setSelectedAccountId}>
                  <SelectTrigger className="w-full mt-2" data-testid="account-sharing-selector">
                    <SelectValue placeholder={isEs ? "Selecciona una cuenta..." : "Select an account..."}>
                      {selectedAccount && (
                        <div className="flex items-center gap-2">
                          {getPlatformIcon(selectedAccount.platform)}
                          <span>@{selectedAccount.handle}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {selectedAccount.platform}
                          </Badge>
                        </div>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ownedAccounts.map(acc => (
                      <SelectItem key={acc.account_id} value={acc.account_id}>
                        <div className="flex items-center gap-2">
                          {getPlatformIcon(acc.platform)}
                          <span>@{acc.handle}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {acc.platform}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedAccountId && (
                <div className="flex gap-2 pt-2">
                  <Button onClick={() => setInviteOpen(true)} size="sm" data-testid="invite-collaborator-btn">
                    <Mail className="w-4 h-4 mr-2" />
                    {isEs ? "Invitar Usuario" : "Invite User"}
                  </Button>
                  <Button variant="outline" onClick={() => setLinkOpen(true)} size="sm" data-testid="create-link-btn">
                    <Link2 className="w-4 h-4 mr-2" />
                    {isEs ? "Crear Link" : "Create Link"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Collaborators List */}
      {selectedAccountId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {isEs ? "Colaboradores" : "Collaborators"}
              {loading && <KoraLoader size={16} />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {collaborators.length === 0 ? (
              <div className="text-center text-muted-foreground py-4">
                {isEs ? "Sin colaboradores" : "No collaborators"}
              </div>
            ) : (
              <div className="space-y-3">
                {collaborators.map(collab => (
                  <div key={collab.membership_id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
                        {collab.name?.[0]?.toUpperCase() || collab.email?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{collab.name || collab.email}</p>
                        <p className="text-xs text-muted-foreground">{collab.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={collab.role === "contributor" ? "default" : "secondary"}>
                        {collab.role === "contributor" 
                          ? (isEs ? "Editor" : "Editor") 
                          : (isEs ? "Solo lectura" : "View only")}
                      </Badge>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleRemoveCollaborator(collab.membership_id)}
                        data-testid={`remove-collaborator-${collab.membership_id}`}
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
      )}

      {/* Share Links List */}
      {selectedAccountId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              {isEs ? "Links de Acceso" : "Access Links"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {shareLinks.length === 0 ? (
              <div className="text-center text-muted-foreground py-4">
                {isEs ? "Sin links activos" : "No active links"}
              </div>
            ) : (
              <div className="space-y-3">
                {shareLinks.map(link => (
                  <div key={link.share_id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{link.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px]">
                          {link.permissions === "contributor" 
                            ? (isEs ? "Editor" : "Editor") 
                            : (isEs ? "Solo lectura" : "View only")}
                        </Badge>
                        {link.has_password && (
                          <Badge variant="secondary" className="text-[10px]">
                            <Lock className="w-3 h-3 mr-1" />
                            {isEs ? "Protegido" : "Protected"}
                          </Badge>
                        )}
                        {link.expires_at && (
                          <span className="text-[10px] text-muted-foreground flex items-center">
                            <Clock className="w-3 h-3 mr-1" />
                            {formatDateOnly(link.expires_at, language)}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {link.access_count || 0} {isEs ? "accesos" : "accesses"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => copyToClipboard(link.share_url, link.share_id)}
                      >
                        {copied === link.share_id ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
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
      )}

      {/* Invite User Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEs ? "Invitar Usuario" : "Invite User"}
            </DialogTitle>
            <DialogDescription>
              {isEs 
                ? `Invita a un usuario de Kora a colaborar en @${selectedAccount?.handle}` 
                : `Invite a Kora user to collaborate on @${selectedAccount?.handle}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="email">{isEs ? "Email del usuario" : "User email"}</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@ejemplo.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="mt-2"
                data-testid="invite-email-input"
              />
            </div>
            <div>
              <Label>{isEs ? "Permisos" : "Permissions"}</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="mt-2" data-testid="invite-role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contributor">
                    <div className="flex items-center gap-2">
                      <Edit className="w-4 h-4" />
                      {isEs ? "Editor (crear/editar contenido)" : "Editor (create/edit content)"}
                    </div>
                  </SelectItem>
                  <SelectItem value="viewer">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4" />
                      {isEs ? "Solo lectura" : "View only"}
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
            <Button onClick={handleInvite} disabled={saving} data-testid="send-invite-btn">
              {saving && <KoraLoader size={16} className="mr-2" />}
              {isEs ? "Enviar Invitación" : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Link Dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEs ? "Crear Link de Acceso" : "Create Access Link"}
            </DialogTitle>
            <DialogDescription>
              {isEs 
                ? `Crea un link público para compartir @${selectedAccount?.handle}` 
                : `Create a public link to share @${selectedAccount?.handle}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="linkName">{isEs ? "Nombre del link" : "Link name"}</Label>
              <Input
                id="linkName"
                placeholder={isEs ? "Ej: Para Agencia XYZ" : "e.g. For Agency XYZ"}
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                className="mt-2"
                data-testid="link-name-input"
              />
            </div>
            <div>
              <Label htmlFor="linkPassword">
                {isEs ? "Contraseña (opcional)" : "Password (optional)"}
              </Label>
              <Input
                id="linkPassword"
                type="password"
                placeholder={isEs ? "Dejar vacío para link público" : "Leave empty for public link"}
                value={linkPassword}
                onChange={(e) => setLinkPassword(e.target.value)}
                className="mt-2"
                data-testid="link-password-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Expira en" : "Expires in"}</Label>
                <Select value={linkExpiry} onValueChange={setLinkExpiry}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 {isEs ? "días" : "days"}</SelectItem>
                    <SelectItem value="30">30 {isEs ? "días" : "days"}</SelectItem>
                    <SelectItem value="90">90 {isEs ? "días" : "days"}</SelectItem>
                    <SelectItem value="365">{isEs ? "1 año" : "1 year"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isEs ? "Permisos" : "Permissions"}</Label>
                <Select value={linkPermission} onValueChange={setLinkPermission}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contributor">{isEs ? "Editor" : "Editor"}</SelectItem>
                    <SelectItem value="viewer">{isEs ? "Solo lectura" : "View only"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreateLink} disabled={saving} data-testid="create-link-submit-btn">
              {saving && <KoraLoader size={16} className="mr-2" />}
              {isEs ? "Crear Link" : "Create Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
