import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { 
  Users, Plus, Edit, Trash2, Mail, Shield, UserCircle, 
  CheckCircle, XCircle, RefreshCw, Search
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { KoraLoader } from "../KoraLoader";

export default function UsersSettingsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [userForm, setUserForm] = useState({
    email: "",
    name: "",
    role_id: "",
    is_active: true
  });

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        axios.get(`${API}/api/settings/users`, { withCredentials: true }),
        axios.get(`${API}/api/settings/roles`, { withCredentials: true })
      ]);
      setUsers(usersRes.data);
      setRoles(rolesRes.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveUser = async () => {
    if (!userForm.email || !userForm.name) {
      return toast.error(isEs ? "Complete los campos requeridos" : "Fill required fields");
    }
    try {
      if (editingUser) {
        await axios.put(`${API}/api/settings/users/${editingUser.user_id}`, userForm, { withCredentials: true });
        toast.success(isEs ? "Usuario actualizado" : "User updated");
      } else {
        await axios.post(`${API}/api/settings/users/invite`, userForm, { withCredentials: true });
        toast.success(isEs ? "Invitación enviada" : "Invitation sent");
      }
      setDialogOpen(false);
      setEditingUser(null);
      setUserForm({ email: "", name: "", role_id: "", is_active: true });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleDeactivateUser = async (userId) => {
    if (!window.confirm(isEs ? "¿Desactivar usuario?" : "Deactivate user?")) return;
    try {
      await axios.put(`${API}/api/settings/users/${userId}`, { is_active: false }, { withCredentials: true });
      toast.success(isEs ? "Usuario desactivado" : "User deactivated");
      fetchData();
    } catch (err) {
      toast.error("Error");
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setUserForm({
      email: user.email,
      name: user.name || "",
      role_id: user.role_id || "",
      is_active: user.is_active !== false
    });
    setDialogOpen(true);
  };

  const getRoleName = (roleId) => {
    const role = roles.find(r => r.role_id === roleId);
    return role ? (isEs ? role.name_es : role.name) : "-";
  };

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center h-64"><KoraLoader size={48} /></div>;

  return (
    <div className="space-y-6" data-testid="users-settings">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5" />
            {isEs ? "Usuarios" : "Users"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Gestiona los usuarios de tu empresa" : "Manage your company users"}
          </p>
        </div>
        <Button onClick={() => { setEditingUser(null); setUserForm({ email: "", name: "", role_id: "", is_active: true }); setDialogOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" />
          {isEs ? "Invitar Usuario" : "Invite User"}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={isEs ? "Buscar usuarios..." : "Search users..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Usuario" : "User"}</TableHead>
                <TableHead>{isEs ? "Email" : "Email"}</TableHead>
                <TableHead>{isEs ? "Rol" : "Role"}</TableHead>
                <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.user_id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <UserCircle className="w-5 h-5 text-primary" />
                      </div>
                      <span className="font-medium">{user.name || user.email.split("@")[0]}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      <Shield className="w-3 h-3" />
                      {getRoleName(user.role_id)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.is_active !== false ? (
                      <Badge className="bg-green-100 text-green-700 gap-1">
                        <CheckCircle className="w-3 h-3" />
                        {isEs ? "Activo" : "Active"}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <XCircle className="w-3 h-3" />
                        {isEs ? "Inactivo" : "Inactive"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEditUser(user)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      {user.is_active !== false && (
                        <Button variant="ghost" size="icon" onClick={() => handleDeactivateUser(user.user_id)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay usuarios" : "No users found"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingUser 
                ? (isEs ? "Editar Usuario" : "Edit User")
                : (isEs ? "Invitar Usuario" : "Invite User")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"} *</Label>
              <Input
                value={userForm.name}
                onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                placeholder={isEs ? "Nombre completo" : "Full name"}
              />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                placeholder="email@example.com"
                disabled={!!editingUser}
              />
            </div>
            <div>
              <Label>{isEs ? "Rol" : "Role"}</Label>
              <Select value={userForm.role_id || "none"} onValueChange={(v) => setUserForm({ ...userForm, role_id: v === "none" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar rol" : "Select role"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Sin rol asignado" : "No role assigned"}</SelectItem>
                  {roles.map((role) => (
                    <SelectItem key={role.role_id} value={role.role_id}>
                      {isEs ? role.name_es : role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveUser}>
              {editingUser 
                ? (isEs ? "Guardar" : "Save")
                : (isEs ? "Enviar Invitación" : "Send Invitation")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
