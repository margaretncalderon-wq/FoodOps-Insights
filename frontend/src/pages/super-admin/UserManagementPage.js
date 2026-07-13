import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Switch } from "../../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { toast } from "sonner";
import { Users, UserPlus, Search, Edit2, Trash2, Shield, Eye, EyeOff, Key, Building2, Mail } from "lucide-react";

import { KoraLoader } from "../../components/KoraLoader";
import { API_BASE as API } from "../../utils/api";

export default function UserManagementPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterOrg, setFilterOrg] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [showAssignOrgModal, setShowAssignOrgModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [userMemberships, setUserMemberships] = useState([]);
  
  // New org form
  const [newOrg, setNewOrg] = useState({ name: "", industry_template: "general" });
  
  // Assign org form
  const [assignOrgId, setAssignOrgId] = useState("");
  const [assignOrgRole, setAssignOrgRole] = useState("viewer");
  
  // New user form
  const [newUser, setNewUser] = useState({
    email: "",
    name: "",
    password: "",
    company_id: "",
    role: "user",
    is_super_admin: false
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [usersRes, orgsRes] = await Promise.all([
        axios.get(`${API}/api/super-admin/users`, { withCredentials: true }),
        axios.get(`${API}/api/super-admin/organizations`, { withCredentials: true })
      ]);
      setUsers(usersRes.data);
      setOrganizations(orgsRes.data.organizations || []);
    } catch (error) {
      toast.error(isEs ? "Error al cargar datos" : "Error loading data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.name || !newUser.password) {
      toast.error(isEs ? "Completa todos los campos" : "Fill all fields");
      return;
    }
    
    setSaving(true);
    try {
      await axios.post(`${API}/api/super-admin/users`, newUser, { withCredentials: true });
      toast.success(isEs ? "Usuario creado" : "User created");
      setShowCreateModal(false);
      setNewUser({ email: "", name: "", password: "", company_id: "", role: "user", is_super_admin: false });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    
    setSaving(true);
    try {
      await axios.patch(`${API}/api/super-admin/users/${selectedUser.user_id}`, {
        name: selectedUser.name,
        role: selectedUser.role,
        is_super_admin: selectedUser.is_super_admin,
        is_active: selectedUser.is_active,
        company_id: selectedUser.company_id
      }, { withCredentials: true });
      toast.success(isEs ? "Usuario actualizado" : "User updated");
      setShowEditModal(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePermissions = async () => {
    if (!selectedUser) return;
    
    setSaving(true);
    try {
      await axios.patch(`${API}/api/super-admin/users/${selectedUser.user_id}/permissions`, {
        permissions: selectedUser.permissions || {}
      }, { withCredentials: true });
      toast.success(isEs ? "Permisos actualizados" : "Permissions updated");
      setShowPermissionsModal(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm(isEs ? "¿Eliminar este usuario?" : "Delete this user?")) return;
    
    try {
      await axios.delete(`${API}/api/super-admin/users/${userId}`, { withCredentials: true });
      toast.success(isEs ? "Usuario eliminado" : "User deleted");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error");
    }
  };

  const handleCreateOrg = async () => {
    if (!newOrg.name) {
      toast.error(isEs ? "El nombre es requerido" : "Name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await axios.post(`${API}/api/super-admin/organizations`, newOrg, { withCredentials: true });
      toast.success(isEs ? "Organización creada" : "Organization created");
      setShowCreateOrgModal(false);
      setNewOrg({ name: "", industry_template: "general" });
      await fetchData();
      // If triggered from create user, set the new org
      if (res.data?.company_id) {
        setNewUser(prev => ({ ...prev, company_id: res.data.company_id }));
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };

  const fetchUserMemberships = async (userId) => {
    try {
      const res = await axios.get(`${API}/api/super-admin/users/${userId}/memberships`, { withCredentials: true });
      setUserMemberships(res.data || []);
    } catch (error) {
      setUserMemberships([]);
    }
  };

  const handleAssignOrg = async () => {
    if (!assignOrgId || !selectedUser) return;
    setSaving(true);
    try {
      await axios.post(`${API}/api/super-admin/organizations/${assignOrgId}/members`, {
        email: selectedUser.email,
        name: selectedUser.name,
        role: assignOrgRole,
        password: "temp"
      }, { withCredentials: true });
      toast.success(isEs ? "Organización asignada" : "Organization assigned");
      setAssignOrgId("");
      setAssignOrgRole("viewer");
      await fetchUserMemberships(selectedUser.user_id);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMembership = async (membershipId, companyId) => {
    if (!confirm(isEs ? "¿Remover de esta organización?" : "Remove from this organization?")) return;
    try {
      await axios.delete(`${API}/api/super-admin/organizations/${companyId}/members/${membershipId}`, { withCredentials: true });
      toast.success(isEs ? "Removido" : "Removed");
      if (selectedUser) await fetchUserMemberships(selectedUser.user_id);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error");
    }
  };

  const handleResetPassword = async (userId) => {
    const newPassword = prompt(isEs ? "Nueva contraseña:" : "New password:");
    if (!newPassword) return;
    
    try {
      await axios.post(`${API}/api/super-admin/users/${userId}/reset-password`, 
        { new_password: newPassword }, 
        { withCredentials: true }
      );
      toast.success(isEs ? "Contraseña actualizada" : "Password updated");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error");
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          user.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOrg = filterOrg === "all" || user.company_id === filterOrg;
    const matchesRole = filterRole === "all" || user.role === filterRole;
    return matchesSearch && matchesOrg && matchesRole;
  });

  const getOrgName = (companyId) => {
    if (!companyId) return "Sin organización";
    const org = organizations.find(o => o.organization?.company_id === companyId);
    return org?.organization?.name || companyId;
  };

  const getRoleBadge = (role, isSuperAdmin) => {
    if (isSuperAdmin) return <Badge className="bg-red-500">Super Admin</Badge>;
    switch (role) {
      case "admin": return <Badge className="bg-blue-500">Admin</Badge>;
      case "owner": return <Badge className="bg-purple-500">Owner</Badge>;
      case "finance": return <Badge className="bg-green-500">Finance</Badge>;
      default: return <Badge variant="secondary">User</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <KoraLoader size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6" />
            {isEs ? "Gestión de Usuarios" : "User Management"}
          </h1>
          <p className="text-muted-foreground">
            {isEs ? "Administra usuarios, roles y permisos" : "Manage users, roles and permissions"}
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          {isEs ? "Nuevo Usuario" : "New User"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{users.length}</div>
            <div className="text-sm text-muted-foreground">{isEs ? "Total Usuarios" : "Total Users"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{users.filter(u => u.is_super_admin).length}</div>
            <div className="text-sm text-muted-foreground">Super Admins</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{users.filter(u => u.role === "admin").length}</div>
            <div className="text-sm text-muted-foreground">Admins</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{organizations.length}</div>
            <div className="text-sm text-muted-foreground">{isEs ? "Organizaciones" : "Organizations"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={isEs ? "Buscar por nombre o email..." : "Search by name or email..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterOrg} onValueChange={setFilterOrg}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder={isEs ? "Organización" : "Organization"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEs ? "Todas" : "All"}</SelectItem>
                {organizations.map(org => (
                  <SelectItem key={org.organization?.company_id} value={org.organization?.company_id}>
                    {org.organization?.name || org.organization?.company_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="finance">Finance</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Usuario" : "User"}</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>{isEs ? "Organización" : "Organization"}</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">{isEs ? "Acciones" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map(user => (
                <TableRow key={user.user_id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium">
                          {user.name?.charAt(0)?.toUpperCase() || "?"}
                        </span>
                      </div>
                      <span className="font-medium">{user.name || "Sin nombre"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      <span className="text-sm">{getOrgName(user.company_id)}</span>
                    </div>
                  </TableCell>
                  <TableCell>{getRoleBadge(user.role, user.is_super_admin)}</TableCell>
                  <TableCell>
                    <Badge variant={user.is_active !== false ? "default" : "secondary"}>
                      {user.is_active !== false ? (isEs ? "Activo" : "Active") : (isEs ? "Inactivo" : "Inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedUser({...user, permissions: user.permissions || {}});
                          setShowPermissionsModal(true);
                        }}
                        title={isEs ? "Permisos" : "Permissions"}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleResetPassword(user.user_id)}
                        title={isEs ? "Cambiar contraseña" : "Reset password"}
                      >
                        <Key className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const u = {...user};
                          setSelectedUser(u);
                          fetchUserMemberships(user.user_id);
                          setShowEditModal(true);
                        }}
                        title={isEs ? "Editar" : "Edit"}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteUser(user.user_id)}
                        className="text-destructive hover:text-destructive"
                        title={isEs ? "Eliminar" : "Delete"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create User Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Crear Nuevo Usuario" : "Create New User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={newUser.name}
                onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                placeholder="Juan Pérez"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                placeholder="juan@empresa.com"
              />
            </div>
            <div className="space-y-2">
              <Label>{isEs ? "Contraseña" : "Password"}</Label>
              <Input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label>{isEs ? "Organización" : "Organization"}</Label>
              <Select value={newUser.company_id} onValueChange={(v) => {
                if (v === "new_org") {
                  setShowCreateOrgModal(true);
                } else {
                  setNewUser({...newUser, company_id: v});
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_org">{isEs ? "+ Crear nueva organización" : "+ Create new organization"}</SelectItem>
                  {organizations.map(org => (
                    <SelectItem key={org.organization?.company_id} value={org.organization?.company_id}>
                      {org.organization?.name || org.organization?.company_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={newUser.role} onValueChange={(v) => setNewUser({...newUser, role: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={newUser.is_super_admin}
                onCheckedChange={(v) => setNewUser({...newUser, is_super_admin: v})}
              />
              <Label>Super Admin</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreateUser} disabled={saving}>
              {saving ? <KoraLoader size={16} /> : (isEs ? "Crear" : "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEs ? "Editar Usuario" : "Edit User"}</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input
                    value={selectedUser.name || ""}
                    onChange={(e) => setSelectedUser({...selectedUser, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={selectedUser.email} disabled className="bg-muted" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{isEs ? "Organización Principal" : "Primary Organization"}</Label>
                  <Select 
                    value={selectedUser.company_id || ""} 
                    onValueChange={(v) => setSelectedUser({...selectedUser, company_id: v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={isEs ? "Sin organización" : "No organization"} />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map(org => (
                        <SelectItem key={org.organization?.company_id} value={org.organization?.company_id}>
                          {org.organization?.name || org.organization?.company_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Rol</Label>
                  <Select value={selectedUser.role} onValueChange={(v) => setSelectedUser({...selectedUser, role: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="finance">Finance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={selectedUser.is_super_admin}
                    onCheckedChange={(v) => setSelectedUser({...selectedUser, is_super_admin: v})}
                  />
                  <Label>Super Admin</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={selectedUser.is_active !== false}
                    onCheckedChange={(v) => setSelectedUser({...selectedUser, is_active: v})}
                  />
                  <Label>{isEs ? "Activo" : "Active"}</Label>
                </div>
              </div>

              {/* Memberships Section */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-semibold">{isEs ? "Organizaciones del usuario" : "User Organizations"}</Label>
                  <Button 
                    size="sm" variant="outline" 
                    onClick={() => setShowAssignOrgModal(true)}
                    data-testid="assign-org-btn"
                  >
                    <Building2 className="w-3 h-3 mr-1" />
                    {isEs ? "Asignar Org" : "Assign Org"}
                  </Button>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {/* Show primary org */}
                  {selectedUser.company_id && (
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/5 border">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">{getOrgName(selectedUser.company_id)}</span>
                      </div>
                      <Badge className="bg-primary">Principal</Badge>
                    </div>
                  )}
                  {/* Show memberships */}
                  {userMemberships.filter(m => m.company_id !== selectedUser.company_id).map(m => (
                    <div key={m.membership_id} className="flex items-center justify-between px-3 py-2 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{getOrgName(m.company_id)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{m.role}</Badge>
                        <Button 
                          size="icon" variant="ghost" className="h-6 w-6 text-destructive" 
                          onClick={() => handleRemoveMembership(m.membership_id, m.company_id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {userMemberships.filter(m => m.company_id !== selectedUser.company_id).length === 0 && !selectedUser.company_id && (
                    <p className="text-sm text-muted-foreground text-center py-2">{isEs ? "Sin organizaciones" : "No organizations"}</p>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleUpdateUser} disabled={saving}>
              {saving ? <KoraLoader size={16} /> : (isEs ? "Guardar" : "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Modal */}
      <Dialog open={showPermissionsModal} onOpenChange={setShowPermissionsModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEs ? "Permisos de Usuario" : "User Permissions"}</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground mb-4">
                {isEs ? "Configura qué módulos puede ver y usar" : "Configure which modules can be viewed and used"}
                <span className="font-medium ml-1">{selectedUser.name}</span>
              </div>
              
              <div className="space-y-3">
                {[
                  { key: "system_pulse", label: "System Pulse" },
                  { key: "client_engagement", label: "Client Engagement" },
                  { key: "execution_hub", label: "Execution Hub" },
                  { key: "partners", label: "Partners" },
                  { key: "business_clarity", label: "Business Clarity" },
                  { key: "people_ops", label: "People Ops" },
                  { key: "event_orchestration", label: "Event Orchestration" },
                  { key: "program_orchestration", label: "Program Orchestration" },
                  { key: "culinary_intelligence", label: "Culinary Intelligence" },
                  { key: "resource_management", label: "Resource Management" },
                  { key: "venues", label: "Venues" },
                  { key: "demand_generation", label: "Demand Generation" },
                  { key: "settings", label: isEs ? "Configuración" : "Settings" }
                ].map(module => (
                  <div key={module.key} className="flex items-center justify-between p-3 border rounded-lg">
                    <span>{module.label}</span>
                    <Switch
                      checked={selectedUser.permissions?.[module.key] !== false}
                      onCheckedChange={(v) => setSelectedUser({
                        ...selectedUser,
                        permissions: { ...selectedUser.permissions, [module.key]: v }
                      })}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPermissionsModal(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleUpdatePermissions} disabled={saving}>
              {saving ? <KoraLoader size={16} /> : (isEs ? "Guardar" : "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Organization Modal */}
      <Dialog open={showCreateOrgModal} onOpenChange={setShowCreateOrgModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Crear Nueva Organización" : "Create New Organization"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isEs ? "Nombre" : "Name"}</Label>
              <Input
                value={newOrg.name}
                onChange={(e) => setNewOrg({...newOrg, name: e.target.value})}
                placeholder={isEs ? "Nombre de la empresa" : "Company name"}
                data-testid="new-org-name"
              />
            </div>
            <div className="space-y-2">
              <Label>{isEs ? "Industria" : "Industry"}</Label>
              <Select value={newOrg.industry_template} onValueChange={(v) => setNewOrg({...newOrg, industry_template: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="events_hospitality">Eventos & Hospitalidad</SelectItem>
                  <SelectItem value="professional_services">Servicios Profesionales</SelectItem>
                  <SelectItem value="marketing_agency">Agencia de Marketing</SelectItem>
                  <SelectItem value="ecommerce">E-Commerce</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateOrgModal(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreateOrg} disabled={saving}>
              {saving ? <KoraLoader size={16} /> : (isEs ? "Crear" : "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Organization Modal */}
      <Dialog open={showAssignOrgModal} onOpenChange={setShowAssignOrgModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Asignar Organización" : "Assign Organization"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {isEs ? "Agregar" : "Add"} <strong>{selectedUser?.name}</strong> {isEs ? "a una organización" : "to an organization"}
            </div>
            <div className="space-y-2">
              <Label>{isEs ? "Organización" : "Organization"}</Label>
              <Select value={assignOrgId} onValueChange={setAssignOrgId}>
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map(org => (
                    <SelectItem key={org.organization?.company_id} value={org.organization?.company_id}>
                      {org.organization?.name || org.organization?.company_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={assignOrgRole} onValueChange={setAssignOrgRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">{isEs ? "Visor" : "Viewer"}</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="social_contributor">Social Contributor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignOrgModal(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleAssignOrg} disabled={saving || !assignOrgId}>
              {saving ? <KoraLoader size={16} /> : (isEs ? "Asignar" : "Assign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
