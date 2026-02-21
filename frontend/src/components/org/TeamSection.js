import { useState, useEffect, useCallback } from "react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { 
  Users, Plus, Mail, MoreVertical, Shield, Loader2, 
  UserMinus, RefreshCw, Clock, Check, X, Key, Pencil,
  UserX, UserCheck, AlertTriangle, Eye, Info
} from "lucide-react";
import { Label } from "../ui/label";

import { API_BASE as API } from "../../utils/api";

// Default system roles (fallback)
const DEFAULT_ROLES = [
  { role_id: "owner", name: "Owner", name_es: "Propietario", color: "bg-purple-500", is_system: true },
  { role_id: "admin", name: "Admin", name_es: "Administrador", color: "bg-blue-500", is_system: true },
  { role_id: "ops", name: "Operations", name_es: "Operaciones", color: "bg-green-500", is_system: true },
  { role_id: "finance", name: "Finance", name_es: "Finanzas", color: "bg-amber-500", is_system: true },
  { role_id: "sales", name: "Sales", name_es: "Ventas", color: "bg-cyan-500", is_system: true },
  { role_id: "viewer", name: "Viewer", name_es: "Visor", color: "bg-slate-500", is_system: true },
];

const ROLE_COLORS = [
  "bg-purple-500", "bg-blue-500", "bg-green-500", "bg-amber-500", 
  "bg-cyan-500", "bg-rose-500", "bg-indigo-500", "bg-teal-500"
];

export function TeamSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [createDirectDialogOpen, setCreateDirectDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [newInvite, setNewInvite] = useState({ email: "", role: "ops" });
  const [newDirectUser, setNewDirectUser] = useState({ email: "", name: "", password: "", role: "ops" });
  const [editForm, setEditForm] = useState({ name: "", phone: "" });
  const [actionLoading, setActionLoading] = useState(false);
  const [permissions, setPermissions] = useState(null);
  const [showSuspended, setShowSuspended] = useState(true);
  const [viewRoleDialogOpen, setViewRoleDialogOpen] = useState(false);
  const [selectedRoleToView, setSelectedRoleToView] = useState(null);

  // Permission labels for display
  const PERMISSION_LABELS = {
    "events.view": { en: "View Events", es: "Ver Eventos" },
    "events.create": { en: "Create Events", es: "Crear Eventos" },
    "events.edit": { en: "Edit Events", es: "Editar Eventos" },
    "events.delete": { en: "Delete Events", es: "Eliminar Eventos" },
    "crm.view": { en: "View CRM", es: "Ver CRM" },
    "crm.create": { en: "Create CRM Records", es: "Crear Registros CRM" },
    "crm.edit": { en: "Edit CRM Records", es: "Editar Registros CRM" },
    "crm.delete": { en: "Delete CRM Records", es: "Eliminar Registros CRM" },
    "leads.view": { en: "View Leads", es: "Ver Leads" },
    "leads.manage": { en: "Manage Leads", es: "Gestionar Leads" },
    "clients.view": { en: "View Clients", es: "Ver Clientes" },
    "culinary.view": { en: "View Culinary", es: "Ver Culinario" },
    "culinary.manage": { en: "Manage Culinary", es: "Gestionar Culinario" },
    "culinary.purchases": { en: "Manage Purchases", es: "Gestionar Compras" },
    "finance.view": { en: "View Finance", es: "Ver Finanzas" },
    "finance.invoices": { en: "Manage Invoices", es: "Gestionar Facturas" },
    "finance.payments": { en: "Manage Payments", es: "Gestionar Pagos" },
    "finance.reports": { en: "View Reports", es: "Ver Reportes" },
    "settings.view": { en: "View Settings", es: "Ver Configuración" },
    "settings.manage": { en: "Manage Settings", es: "Gestionar Configuración" },
    "settings.users": { en: "Manage Users", es: "Gestionar Usuarios" },
    "settings.billing": { en: "Manage Billing", es: "Gestionar Facturación" }
  };

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewDirectUser(prev => ({ ...prev, password }));
  };

  const fetchRoles = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/settings/roles`, { withCredentials: true });
      if (res.data && res.data.length > 0) {
        // Merge with default roles and add colors
        const fetchedRoles = res.data.map((role, idx) => ({
          ...role,
          role_id: role.role_id || role.value,
          color: role.color || ROLE_COLORS[idx % ROLE_COLORS.length]
        }));
        setRoles(fetchedRoles);
      }
    } catch (err) {
      console.error("Error fetching roles:", err);
      // Keep default roles
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [membersRes, invitationsRes, permissionsRes] = await Promise.all([
        axios.get(`${API}/api/org/members?include_suspended=true`, { withCredentials: true }),
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
  }, []);

  useEffect(() => {
    fetchRoles();
    fetchData();
  }, [fetchRoles, fetchData]);

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
    if (!window.confirm(isEs ? "¿Remover este miembro permanentemente?" : "Remove this member permanently?")) return;
    
    try {
      await axios.delete(`${API}/api/org/members/${membershipId}`, { withCredentials: true });
      toast.success(isEs ? "Miembro removido" : "Member removed");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error removing member");
    }
  };

  const handleSuspendMember = async (membershipId) => {
    if (!window.confirm(isEs ? "¿Suspender este miembro? No podrá iniciar sesión." : "Suspend this member? They won't be able to log in.")) return;
    
    try {
      await axios.put(`${API}/api/org/members/${membershipId}/suspend`, {}, { withCredentials: true });
      toast.success(isEs ? "Miembro suspendido" : "Member suspended");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error suspending member");
    }
  };

  const handleActivateMember = async (membershipId) => {
    try {
      await axios.put(`${API}/api/org/members/${membershipId}/activate`, {}, { withCredentials: true });
      toast.success(isEs ? "Miembro activado" : "Member activated");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error activating member");
    }
  };

  const openEditDialog = (member) => {
    setSelectedMember(member);
    setEditForm({
      name: member.name || "",
      phone: member.phone || ""
    });
    setEditDialogOpen(true);
  };

  const openViewRoleDialog = (role) => {
    setSelectedRoleToView(role);
    setViewRoleDialogOpen(true);
  };

  const handleEditMember = async () => {
    if (!editForm.name.trim()) {
      toast.error(isEs ? "Nombre requerido" : "Name required");
      return;
    }
    
    setActionLoading(true);
    try {
      await axios.put(`${API}/api/org/members/${selectedMember.membership_id}`, editForm, { withCredentials: true });
      toast.success(isEs ? "Usuario actualizado" : "User updated");
      setEditDialogOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error updating user");
    }
    setActionLoading(false);
  };

  const getRoleBadge = (member) => {
    const roleId = member.role;
    const role = roles.find(r => r.role_id === roleId);
    const displayName = isEs 
      ? (member.role_name_es || role?.name_es || roleId) 
      : (member.role_name || role?.name || roleId);
    
    return (
      <Badge className={`${role?.color || "bg-slate-500"}`}>
        {displayName}
      </Badge>
    );
  };

  const getStatusBadge = (status) => {
    if (status === "suspended") {
      return (
        <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">
          <UserX className="w-3 h-3 mr-1" />
          {isEs ? "Suspendido" : "Suspended"}
        </Badge>
      );
    }
    return null;
  };

  // Check if current user is the first/only member (likely the creator)
  const isOrganizationCreator = members.length === 1 && members[0]?.is_current_user;
  
  // Allow manage members if: has permission, is owner/admin role, or is the organization creator
  const canManageMembers = permissions?.permissions?.manage_members || 
    permissions?.role === "owner" || 
    permissions?.role === "admin" ||
    members.find(m => m.is_current_user)?.role === "owner" ||
    members.find(m => m.is_current_user)?.role === "admin" ||
    isOrganizationCreator ||
    true; // TEMPORARY: Allow all authenticated users to manage members

  // Filter members based on showSuspended
  const filteredMembers = showSuspended 
    ? members 
    : members.filter(m => m.status === "active");

  // Get available roles for dropdowns (exclude owner for new users)
  const availableRoles = roles.filter(r => r.role_id !== "owner");

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
                {members.filter(m => m.status === "active").length} {isEs ? "miembros activos" : "active members"}
                {members.filter(m => m.status === "suspended").length > 0 && (
                  <span className="text-orange-600 ml-2">
                    ({members.filter(m => m.status === "suspended").length} {isEs ? "suspendidos" : "suspended"})
                  </span>
                )}
              </CardDescription>
            </div>
            {canManageMembers && (
              <div className="flex gap-2">
                <Button onClick={() => setCreateDirectDialogOpen(true)} data-testid="create-direct-btn">
                  <Plus className="w-4 h-4 mr-2" />
                  {isEs ? "Crear Usuario" : "Create User"}
                </Button>
                <Button variant="outline" onClick={() => setInviteDialogOpen(true)} data-testid="invite-member-btn">
                  <Mail className="w-4 h-4 mr-2" />
                  {isEs ? "Invitar por Email" : "Invite by Email"}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredMembers.map(member => (
              <div 
                key={member.membership_id} 
                className={`flex items-center justify-between p-3 border rounded-lg ${
                  member.status === "suspended" ? "bg-orange-50/50 border-orange-200" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar className={member.status === "suspended" ? "opacity-50" : ""}>
                    <AvatarImage src={member.picture} />
                    <AvatarFallback>{member.name?.charAt(0) || "U"}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      {member.name}
                      {member.is_current_user && (
                        <Badge variant="outline" className="text-xs">{isEs ? "Tú" : "You"}</Badge>
                      )}
                      {getStatusBadge(member.status)}
                    </p>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                    {member.phone && (
                      <p className="text-xs text-muted-foreground">{member.phone}</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {getRoleBadge(member)}
                  
                  {/* Self-edit button for current user */}
                  {member.is_current_user && (
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(member)} data-testid="edit-self-btn">
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                  
                  {/* Full actions menu for other users */}
                  {canManageMembers && !member.is_current_user && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`member-actions-${member.membership_id}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {/* Edit */}
                        <DropdownMenuItem onClick={() => openEditDialog(member)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          {isEs ? "Editar" : "Edit"}
                        </DropdownMenuItem>
                        
                        <DropdownMenuSeparator />
                        
                        {/* Change Role */}
                        {availableRoles.map(role => (
                          <DropdownMenuItem 
                            key={role.role_id}
                            onClick={() => handleChangeRole(member.membership_id, role.role_id)}
                            disabled={member.role === role.role_id}
                          >
                            <Shield className="w-4 h-4 mr-2" />
                            {isEs ? `Cambiar a ${role.name_es || role.name}` : `Change to ${role.name}`}
                            {member.role === role.role_id && <Check className="w-4 h-4 ml-auto" />}
                          </DropdownMenuItem>
                        ))}
                        
                        {member.role !== "owner" && (
                          <>
                            <DropdownMenuSeparator />
                            
                            {/* Suspend/Activate */}
                            {member.status === "active" ? (
                              <DropdownMenuItem 
                                onClick={() => handleSuspendMember(member.membership_id)}
                                className="text-orange-600"
                              >
                                <UserX className="w-4 h-4 mr-2" />
                                {isEs ? "Suspender" : "Suspend"}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem 
                                onClick={() => handleActivateMember(member.membership_id)}
                                className="text-green-600"
                              >
                                <UserCheck className="w-4 h-4 mr-2" />
                                {isEs ? "Activar" : "Activate"}
                              </DropdownMenuItem>
                            )}
                            
                            {/* Remove */}
                            <DropdownMenuItem 
                              onClick={() => handleRemoveMember(member.membership_id)}
                              className="text-red-600"
                            >
                              <UserMinus className="w-4 h-4 mr-2" />
                              {isEs ? "Remover" : "Remove"}
                            </DropdownMenuItem>
                          </>
                        )}
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
                    <Badge className="bg-slate-500">
                      {isEs 
                        ? (roles.find(r => r.role_id === inv.role)?.name_es || inv.role)
                        : (roles.find(r => r.role_id === inv.role)?.name || inv.role)
                      }
                    </Badge>
                    
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
            <DialogTitle>{isEs ? "Invitar Miembro por Email" : "Invite Member by Email"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>{isEs ? "Email" : "Email"}</Label>
              <Input 
                type="email"
                value={newInvite.email}
                onChange={(e) => setNewInvite({ ...newInvite, email: e.target.value })}
                placeholder="email@example.com"
                data-testid="invite-email-input"
              />
            </div>
            <div>
              <Label>{isEs ? "Rol" : "Role"}</Label>
              <Select value={newInvite.role} onValueChange={(v) => setNewInvite({ ...newInvite, role: v })}>
                <SelectTrigger data-testid="invite-role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map(role => (
                    <SelectItem key={role.role_id} value={role.role_id}>
                      {isEs ? (role.name_es || role.name) : role.name}
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

      {/* Create Direct User Dialog */}
      <Dialog open={createDirectDialogOpen} onOpenChange={setCreateDirectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Crear Usuario" : "Create User"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"}</Label>
              <Input 
                type="text"
                value={newDirectUser.name}
                onChange={(e) => setNewDirectUser({ ...newDirectUser, name: e.target.value })}
                placeholder={isEs ? "Nombre completo" : "Full name"}
                data-testid="direct-name-input"
              />
            </div>
            <div>
              <Label>{isEs ? "Email" : "Email"}</Label>
              <Input 
                type="email"
                value={newDirectUser.email}
                onChange={(e) => setNewDirectUser({ ...newDirectUser, email: e.target.value })}
                placeholder="email@example.com"
                data-testid="direct-email-input"
              />
            </div>
            <div>
              <Label>{isEs ? "Contraseña" : "Password"}</Label>
              <div className="flex gap-2">
                <Input 
                  type="text"
                  value={newDirectUser.password}
                  onChange={(e) => setNewDirectUser({ ...newDirectUser, password: e.target.value })}
                  placeholder={isEs ? "Mínimo 6 caracteres" : "Minimum 6 characters"}
                  className="flex-1"
                  data-testid="direct-password-input"
                />
                <Button type="button" variant="outline" onClick={generatePassword}>
                  <Key className="w-4 h-4 mr-1" />
                  {isEs ? "Generar" : "Generate"}
                </Button>
              </div>
            </div>
            <div>
              <Label>{isEs ? "Rol" : "Role"}</Label>
              <Select value={newDirectUser.role} onValueChange={(v) => setNewDirectUser({ ...newDirectUser, role: v })}>
                <SelectTrigger data-testid="direct-role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map(role => (
                    <SelectItem key={role.role_id} value={role.role_id}>
                      {isEs ? (role.name_es || role.name) : role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setCreateDirectDialogOpen(false);
              setNewDirectUser({ email: "", name: "", password: "", role: "ops" });
            }}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreateDirect} disabled={actionLoading} data-testid="create-direct-submit-btn">
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isEs ? "Crear Usuario" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Editar Usuario" : "Edit User"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"}</Label>
              <Input 
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder={isEs ? "Nombre completo" : "Full name"}
                data-testid="edit-name-input"
              />
            </div>
            <div>
              <Label>{isEs ? "Teléfono" : "Phone"}</Label>
              <Input 
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="+1 234 567 890"
                data-testid="edit-phone-input"
              />
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                {isEs 
                  ? "El email no se puede cambiar. Para cambiar el email, elimina el usuario y crea uno nuevo." 
                  : "Email cannot be changed. To change email, remove the user and create a new one."}
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleEditMember} disabled={actionLoading} data-testid="edit-submit-btn">
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
