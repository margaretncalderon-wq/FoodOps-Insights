import { useState, useEffect } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter 
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { 
  Users, Plus, Mail, MoreVertical, Shield, Loader2, 
  UserMinus, RefreshCw, Clock, Check, X
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const ROLES = [
  { value: "owner", label_en: "Owner", label_es: "Propietario", color: "bg-purple-500" },
  { value: "admin", label_en: "Admin", label_es: "Administrador", color: "bg-blue-500" },
  { value: "ops", label_en: "Operations", label_es: "Operaciones", color: "bg-green-500" },
  { value: "finance", label_en: "Finance", label_es: "Finanzas", color: "bg-amber-500" },
  { value: "viewer", label_en: "Viewer", label_es: "Visor", color: "bg-slate-500" },
];

export function TeamSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [createDirectDialogOpen, setCreateDirectDialogOpen] = useState(false);
  const [newInvite, setNewInvite] = useState({ email: "", role: "ops" });
  const [newDirectUser, setNewDirectUser] = useState({ email: "", name: "", password: "", role: "ops" });
  const [actionLoading, setActionLoading] = useState(false);
  const [permissions, setPermissions] = useState(null);

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewDirectUser(prev => ({ ...prev, password }));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [membersRes, invitationsRes, permissionsRes] = await Promise.all([
        axios.get(`${API}/api/org/members`, { withCredentials: true }),
        axios.get(`${API}/api/org/invitations`, { withCredentials: true }),
        axios.get(`${API}/api/org/permissions`, { withCredentials: true })
      ]);
      setMembers(membersRes.data || []);
      setInvitations(invitationsRes.data || []);
      setPermissions(permissionsRes.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleInvite = async () => {
    if (!newInvite.email.trim() || !newInvite.email.includes("@")) {
      toast.error(isEs ? "Email inválido" : "Invalid email");
      return;
    }
    
    setActionLoading(true);
    try {
      await axios.post(`${API}/api/org/invitations`, newInvite, { withCredentials: true });
      toast.success(isEs ? "Invitación enviada" : "Invitation sent");
      setInviteDialogOpen(false);
      setNewInvite({ email: "", role: "ops" });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error sending invitation");
    }
    setActionLoading(false);
  };

  const handleCreateDirect = async () => {
    if (!newDirectUser.email.trim() || !newDirectUser.email.includes("@")) {
      toast.error(isEs ? "Email inválido" : "Invalid email");
      return;
    }
    if (!newDirectUser.name.trim()) {
      toast.error(isEs ? "Nombre requerido" : "Name required");
      return;
    }
    if (!newDirectUser.password || newDirectUser.password.length < 6) {
      toast.error(isEs ? "Contraseña debe tener al menos 6 caracteres" : "Password must be at least 6 characters");
      return;
    }
    
    setActionLoading(true);
    try {
      await axios.post(`${API}/api/org/members/create-direct`, newDirectUser, { withCredentials: true });
      toast.success(isEs ? "Usuario creado exitosamente" : "User created successfully");
      setCreateDirectDialogOpen(false);
      setNewDirectUser({ email: "", name: "", password: "", role: "ops" });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error creating user");
    }
    setActionLoading(false);
  };

  const handleResendInvite = async (invitationId) => {
    try {
      await axios.post(`${API}/api/org/invitations/${invitationId}/resend`, {}, { withCredentials: true });
      toast.success(isEs ? "Invitación reenviada" : "Invitation resent");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error resending invitation");
    }
  };

  const handleRevokeInvite = async (invitationId) => {
    try {
      await axios.delete(`${API}/api/org/invitations/${invitationId}`, { withCredentials: true });
      toast.success(isEs ? "Invitación revocada" : "Invitation revoked");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error revoking invitation");
    }
  };

  const handleChangeRole = async (membershipId, newRole) => {
    try {
      await axios.put(`${API}/api/org/members/${membershipId}/role?role=${newRole}`, {}, { withCredentials: true });
      toast.success(isEs ? "Rol actualizado" : "Role updated");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error updating role");
    }
  };

  const handleRemoveMember = async (membershipId) => {
    if (!window.confirm(isEs ? "¿Remover este miembro?" : "Remove this member?")) return;
    
    try {
      await axios.delete(`${API}/api/org/members/${membershipId}`, { withCredentials: true });
      toast.success(isEs ? "Miembro removido" : "Member removed");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error removing member");
    }
  };

  const getRoleBadge = (roleValue) => {
    const role = ROLES.find(r => r.value === roleValue);
    return (
      <Badge className={`${role?.color || "bg-slate-500"}`}>
        {isEs ? role?.label_es : role?.label_en}
      </Badge>
    );
  };

  const canManageMembers = permissions?.permissions?.manage_members;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="team-section">
      {/* Members */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5" />
                {isEs ? "Miembros del Equipo" : "Team Members"}
              </CardTitle>
              <CardDescription>
                {members.length} {isEs ? "miembros activos" : "active members"}
              </CardDescription>
            </div>
            {canManageMembers && (
              <Button onClick={() => setInviteDialogOpen(true)} data-testid="invite-member-btn">
                <Plus className="w-4 h-4 mr-2" />
                {isEs ? "Invitar" : "Invite"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members.map(member => (
              <div 
                key={member.membership_id} 
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={member.picture} />
                    <AvatarFallback>{member.name?.charAt(0) || "U"}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      {member.name}
                      {member.is_current_user && (
                        <Badge variant="outline" className="text-xs">{isEs ? "Tú" : "You"}</Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {getRoleBadge(member.role)}
                  
                  {canManageMembers && !member.is_current_user && member.role !== "owner" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {ROLES.filter(r => r.value !== "owner").map(role => (
                          <DropdownMenuItem 
                            key={role.value}
                            onClick={() => handleChangeRole(member.membership_id, role.value)}
                            disabled={member.role === role.value}
                          >
                            <Shield className="w-4 h-4 mr-2" />
                            {isEs ? `Cambiar a ${role.label_es}` : `Change to ${role.label_en}`}
                            {member.role === role.value && <Check className="w-4 h-4 ml-2" />}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem 
                          onClick={() => handleRemoveMember(member.membership_id)}
                          className="text-red-600"
                        >
                          <UserMinus className="w-4 h-4 mr-2" />
                          {isEs ? "Remover" : "Remove"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="w-5 h-5" />
              {isEs ? "Invitaciones Pendientes" : "Pending Invitations"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {invitations.map(inv => (
                <div 
                  key={inv.invitation_id} 
                  className="flex items-center justify-between p-3 border rounded-lg bg-amber-50/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-medium">{inv.email}</p>
                      <p className="text-sm text-muted-foreground">
                        {isEs ? "Expira:" : "Expires:"} {new Date(inv.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {getRoleBadge(inv.role)}
                    
                    {canManageMembers && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => handleResendInvite(inv.invitation_id)}>
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleRevokeInvite(inv.invitation_id)}>
                          <X className="w-4 h-4 text-red-500" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Invitar Miembro" : "Invite Member"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Email" : "Email"}</label>
              <Input 
                type="email"
                value={newInvite.email}
                onChange={(e) => setNewInvite({ ...newInvite, email: e.target.value })}
                placeholder="email@example.com"
                data-testid="invite-email-input"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Rol" : "Role"}</label>
              <Select value={newInvite.role} onValueChange={(v) => setNewInvite({ ...newInvite, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter(r => r.value !== "owner").map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      {isEs ? role.label_es : role.label_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleInvite} disabled={actionLoading} data-testid="send-invite-btn">
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isEs ? "Enviar Invitación" : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
