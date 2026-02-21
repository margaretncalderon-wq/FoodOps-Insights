import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { 
  Shield, Plus, Edit, Trash2, RefreshCw, Lock, Eye, 
  PenLine, Settings2, Users, Calendar, Utensils, Landmark
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

// Available permissions grouped by module
const PERMISSION_GROUPS = [
  {
    module: "events",
    icon: Calendar,
    permissions: [
      { key: "events.view", label: "View Events", labelEs: "Ver Eventos" },
      { key: "events.create", label: "Create Events", labelEs: "Crear Eventos" },
      { key: "events.edit", label: "Edit Events", labelEs: "Editar Eventos" },
      { key: "events.delete", label: "Delete Events", labelEs: "Eliminar Eventos" },
    ]
  },
  {
    module: "crm",
    icon: Users,
    permissions: [
      { key: "crm.view", label: "View Clients", labelEs: "Ver Clientes" },
      { key: "crm.create", label: "Create Clients", labelEs: "Crear Clientes" },
      { key: "crm.edit", label: "Edit Clients", labelEs: "Editar Clientes" },
      { key: "crm.delete", label: "Delete Clients", labelEs: "Eliminar Clientes" },
    ]
  },
  {
    module: "culinary",
    icon: Utensils,
    permissions: [
      { key: "culinary.view", label: "View Culinary Intelligence", labelEs: "Ver Inteligencia Culinaria" },
      { key: "culinary.manage", label: "Manage Recipes & Inventory", labelEs: "Gestionar Recetas e Inventario" },
      { key: "culinary.purchases", label: "Manage Purchases", labelEs: "Gestionar Compras" },
    ]
  },
  {
    module: "finance",
    icon: Landmark,
    permissions: [
      { key: "finance.view", label: "View Business Clarity", labelEs: "Ver Business Clarity" },
      { key: "finance.invoices", label: "Manage Invoices", labelEs: "Gestionar Facturas" },
      { key: "finance.payments", label: "Record Payments", labelEs: "Registrar Pagos" },
      { key: "finance.reports", label: "View Reports", labelEs: "Ver Reportes" },
    ]
  },
  {
    module: "settings",
    icon: Settings2,
    permissions: [
      { key: "settings.view", label: "View Settings", labelEs: "Ver Configuración" },
      { key: "settings.manage", label: "Manage Settings", labelEs: "Gestionar Configuración" },
      { key: "settings.users", label: "Manage Users", labelEs: "Gestionar Usuarios" },
    ]
  },
];

const DEFAULT_ROLES = [
  { 
    role_id: "admin", 
    name: "Administrator", 
    name_es: "Administrador",
    description: "Full access to all features",
    description_es: "Acceso completo a todas las funciones",
    permissions: PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.key)),
    is_system: true
  },
  { 
    role_id: "finance", 
    name: "Finance", 
    name_es: "Finanzas",
    description: "Access to Business Clarity and financial reports",
    description_es: "Acceso a Business Clarity y reportes financieros",
    permissions: ["events.view", "crm.view", "finance.view", "finance.invoices", "finance.payments", "finance.reports"],
    is_system: true
  },
  { 
    role_id: "operations", 
    name: "Operations", 
    name_es: "Operaciones",
    description: "Access to Events and Culinary Intelligence",
    description_es: "Acceso a Eventos e Inteligencia Culinaria",
    permissions: ["events.view", "events.create", "events.edit", "crm.view", "culinary.view", "culinary.manage", "culinary.purchases"],
    is_system: true
  },
];

export default function RolesSettingsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleForm, setRoleForm] = useState({
    name: "",
    name_es: "",
    description: "",
    description_es: "",
    permissions: []
  });

  const fetchRoles = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/settings/roles`, { withCredentials: true });
      // Merge with default roles if empty
      const data = res.data.length > 0 ? res.data : DEFAULT_ROLES;
      setRoles(data);
    } catch (err) {
      // Use default roles on error
      setRoles(DEFAULT_ROLES);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  const handleSaveRole = async () => {
    if (!roleForm.name) {
      return toast.error(isEs ? "Ingrese un nombre" : "Enter a name");
    }
    try {
      if (editingRole) {
        // Both system and custom roles can be updated
        await axios.put(`${API}/api/settings/roles/${editingRole.role_id}`, roleForm, { withCredentials: true });
        toast.success(isEs ? "Rol actualizado" : "Role updated");
      } else {
        await axios.post(`${API}/api/settings/roles`, roleForm, { withCredentials: true });
        toast.success(isEs ? "Rol creado" : "Role created");
      }
      setDialogOpen(false);
      setEditingRole(null);
      setRoleForm({ name: "", name_es: "", description: "", description_es: "", permissions: [] });
      fetchRoles();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleDeleteRole = async (roleId) => {
    const role = roles.find(r => r.role_id === roleId);
    if (role?.is_system) return toast.error(isEs ? "No se puede eliminar un rol del sistema" : "Cannot delete system role");
    if (!window.confirm(isEs ? "¿Eliminar rol?" : "Delete role?")) return;
    try {
      await axios.delete(`${API}/api/settings/roles/${roleId}`, { withCredentials: true });
      toast.success(isEs ? "Rol eliminado" : "Role deleted");
      fetchRoles();
    } catch (err) {
      toast.error("Error");
    }
  };

  const handleEditRole = (role) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      name_es: role.name_es || "",
      description: role.description || "",
      description_es: role.description_es || "",
      permissions: role.permissions || []
    });
    setDialogOpen(true);
  };

  const togglePermission = (permKey) => {
    setRoleForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permKey)
        ? prev.permissions.filter(p => p !== permKey)
        : [...prev.permissions, permKey]
    }));
  };

  const toggleAllInGroup = (group) => {
    const groupPerms = group.permissions.map(p => p.key);
    const allSelected = groupPerms.every(p => roleForm.permissions.includes(p));
    setRoleForm(prev => ({
      ...prev,
      permissions: allSelected
        ? prev.permissions.filter(p => !groupPerms.includes(p))
        : [...new Set([...prev.permissions, ...groupPerms])]
    }));
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="roles-settings">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5" />
            {isEs ? "Roles y Permisos" : "Roles & Permissions"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Define qué puede hacer cada rol en el sistema" : "Define what each role can do in the system"}
          </p>
        </div>
        <Button onClick={() => { setEditingRole(null); setRoleForm({ name: "", name_es: "", description: "", description_es: "", permissions: [] }); setDialogOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" />
          {isEs ? "Nuevo Rol" : "New Role"}
        </Button>
      </div>

      {/* Roles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map((role) => (
          <Card key={role.role_id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{isEs ? role.name_es || role.name : role.name}</CardTitle>
                    {role.is_system && (
                      <Badge variant="secondary" className="text-xs mt-1">
                        <Lock className="w-3 h-3 mr-1" />
                        {isEs ? "Sistema" : "System"}
                      </Badge>
                    )}
                  </div>
                </div>
                {!role.is_system && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEditRole(role)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteRole(role.role_id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                )}
                {role.is_system && (
                  <Button variant="ghost" size="icon" onClick={() => handleEditRole(role)} title={isEs ? "Editar permisos" : "Edit permissions"}>
                    <Edit className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                {isEs ? role.description_es || role.description : role.description}
              </p>
              <div className="flex flex-wrap gap-1">
                {(role.permissions || []).slice(0, 4).map((perm) => (
                  <Badge key={perm} variant="outline" className="text-xs">
                    {perm.split(".")[1]}
                  </Badge>
                ))}
                {(role.permissions || []).length > 4 && (
                  <Badge variant="outline" className="text-xs">
                    +{role.permissions.length - 4}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Role Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRole 
                ? (isEs ? "Editar Rol" : "Edit Role")
                : (isEs ? "Nuevo Rol" : "New Role")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Nombre (EN)" : "Name (EN)"} *</Label>
                <Input
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  disabled={editingRole?.is_system}
                />
                {editingRole?.is_system && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {isEs ? "El nombre de roles del sistema no se puede cambiar" : "System role names cannot be changed"}
                  </p>
                )}
              </div>
              <div>
                <Label>{isEs ? "Nombre (ES)" : "Name (ES)"}</Label>
                <Input
                  value={roleForm.name_es}
                  onChange={(e) => setRoleForm({ ...roleForm, name_es: e.target.value })}
                  disabled={editingRole?.is_system}
                />
              </div>
              <div className="col-span-2">
                <Label>{isEs ? "Descripción" : "Description"}</Label>
                <Input
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                />
              </div>
            </div>

            {/* Permissions */}
            <div>
              <Label className="text-base font-semibold">{isEs ? "Permisos" : "Permissions"}</Label>
              <div className="mt-4 space-y-4">
                {PERMISSION_GROUPS.map((group) => {
                  const Icon = group.icon;
                  const groupPerms = group.permissions.map(p => p.key);
                  const allSelected = groupPerms.every(p => roleForm.permissions.includes(p));
                  const someSelected = groupPerms.some(p => roleForm.permissions.includes(p));
                  
                  return (
                    <Card key={group.module} className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium capitalize">{group.module}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleAllInGroup(group)}
                          disabled={editingRole?.is_system}
                        >
                          {allSelected ? (isEs ? "Quitar todos" : "Remove all") : (isEs ? "Seleccionar todos" : "Select all")}
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {group.permissions.map((perm) => (
                          <div key={perm.key} className="flex items-center gap-2">
                            <Checkbox
                              checked={roleForm.permissions.includes(perm.key)}
                              onCheckedChange={() => togglePermission(perm.key)}
                            />
                            <span className="text-sm">{isEs ? perm.labelEs : perm.label}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            {!editingRole?.is_system && (
              <Button onClick={handleSaveRole}>
                {isEs ? "Guardar" : "Save"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
