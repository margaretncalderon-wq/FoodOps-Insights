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
import { 
  Users, UserPlus, Search, Edit2, Trash2, Shield, 
  Eye, EyeOff, Key, Building2, Mail, Loader2 
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

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
  const [selectedUser, setSelectedUser] = useState(null);
  const [saving, setSaving] = useState(false);
  
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
      setOrganizations(orgsRes.data);
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
      await axios.patch(`${API}/super-admin/users/${selectedUser.user_id}`, {
        name: selectedUser.name,
        role: selectedUser.role,
        is_super_admin: selectedUser.is_super_admin,
        is_active: selectedUser.is_active
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
      await axios.patch(`${API}/super-admin/users/${selectedUser.user_id}/permissions`, {
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
      await axios.delete(`${API}/super-admin/users/${userId}`, { withCredentials: true });
      toast.success(isEs ? "Usuario eliminado" : "User deleted");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error");
    }
  };

  const handleResetPassword = async (userId) => {
    const newPassword = prompt(isEs ? "Nueva contraseña:" : "New password:");
    if (!newPassword) return;
    
    try {
      await axios.post(`${API}/super-admin/users/${userId}/reset-password`, 
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
    const org = organizations.find(o => o.company_id === companyId);
    return org?.name || companyId || "Sin organización";
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
        <Loader2 className="w-8 h-8 animate-spin" />
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
                  <SelectItem key={org.company_id} value={org.company_id}>
                    {org.name}
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
                          setSelectedUser({...user});
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
              <Select value={newUser.company_id} onValueChange={(v) => setNewUser({...newUser, company_id: v})}>
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map(org => (
                    <SelectItem key={org.company_id} value={org.company_id}>
                      {org.name}
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
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEs ? "Crear" : "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Editar Usuario" : "Edit User"}</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
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
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleUpdateUser} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEs ? "Guardar" : "Save")}
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
                  { key: "dashboard", label: "Dashboard" },
                  { key: "crm", label: "CRM / Clientes" },
                  { key: "events", label: isEs ? "Eventos" : "Events" },
                  { key: "calendar", label: isEs ? "Calendario" : "Calendar" },
                  { key: "culinary", label: "Culinary Intelligence" },
                  { key: "inventory", label: isEs ? "Inventario" : "Inventory" },
                  { key: "business_clarity", label: "Business Clarity" },
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
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEs ? "Guardar" : "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
