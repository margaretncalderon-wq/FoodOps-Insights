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
  PenLine, Settings2, Users, Calendar, Utensils, Landmark,
  UserCog, Megaphone, FileBarChart, DollarSign, Clock, Briefcase
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

// Available permissions grouped by module
const PERMISSION_GROUPS = [
  {
    module: "events",
    label: "Events",
    labelEs: "Eventos",
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
    label: "CRM",
    labelEs: "CRM",
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
    label: "Culinary Intelligence",
    labelEs: "Inteligencia Culinaria",
    icon: Utensils,
    permissions: [
      { key: "culinary.view", label: "View Culinary Intelligence", labelEs: "Ver Inteligencia Culinaria" },
      { key: "culinary.manage", label: "Manage Recipes & Inventory", labelEs: "Gestionar Recetas e Inventario" },
      { key: "culinary.purchases", label: "Manage Purchases", labelEs: "Gestionar Compras" },
    ]
  },
  {
    module: "finance",
    label: "Business Clarity",
    labelEs: "Business Clarity",
    icon: Landmark,
    permissions: [
      { key: "finance.view", label: "View Business Clarity", labelEs: "Ver Business Clarity" },
      { key: "finance.invoices", label: "Manage Invoices", labelEs: "Gestionar Facturas" },
      { key: "finance.payments", label: "Record Payments", labelEs: "Registrar Pagos" },
      { key: "finance.payables", label: "Manage Payables", labelEs: "Gestionar Cuentas por Pagar" },
      { key: "finance.fixed_costs", label: "Manage Fixed Costs", labelEs: "Gestionar Costos Fijos" },
    ]
  },
  {
    module: "reports",
    label: "Financial Reports",
    labelEs: "Reportes Financieros",
    icon: FileBarChart,
    permissions: [
      { key: "reports.executive", label: "Executive Reports", labelEs: "Reportes Ejecutivos" },
      { key: "reports.sales", label: "Sales Reports", labelEs: "Reportes de Ventas" },
      { key: "reports.pl", label: "P&L Statement", labelEs: "Estado de Resultados (P&L)" },
      { key: "reports.budget_alerts", label: "Budget Alerts", labelEs: "Alertas de Presupuesto" },
      { key: "reports.regulatory", label: "Regulatory Reports", labelEs: "Reportes Regulatorios" },
    ]
  },
  {
    module: "people_ops",
    label: "People Ops / HR",
    labelEs: "People Ops / RRHH",
    icon: UserCog,
    permissions: [
      { key: "people_ops.employees.view", label: "View Employees", labelEs: "Ver Empleados" },
      { key: "people_ops.employees.edit", label: "Edit Employees", labelEs: "Editar Empleados" },
      { key: "people_ops.payroll.view", label: "View Payroll", labelEs: "Ver Nómina" },
      { key: "people_ops.payroll.edit", label: "Edit Payroll", labelEs: "Editar Nómina" },
      { key: "people_ops.payroll.approve", label: "Approve Payroll", labelEs: "Aprobar Nómina" },
      { key: "people_ops.time_off.view", label: "View Time Off", labelEs: "Ver Vacaciones" },
      { key: "people_ops.time_off.approve", label: "Approve Time Off", labelEs: "Aprobar Vacaciones" },
      { key: "people_ops.offboarding", label: "Manage Offboarding", labelEs: "Gestionar Offboarding" },
      { key: "people_ops.cost_centers", label: "Manage Cost Centers", labelEs: "Gestionar Centros de Costo" },
    ]
  },
  {
    module: "demand_studio",
    label: "Demand Studio",
    labelEs: "Demand Studio",
    icon: Megaphone,
    permissions: [
      { key: "demand_studio.view", label: "View Demand Studio", labelEs: "Ver Demand Studio" },
      { key: "demand_studio.campaigns", label: "Manage Campaigns", labelEs: "Gestionar Campañas" },
      { key: "demand_studio.content", label: "Create Content", labelEs: "Crear Contenido" },
      { key: "demand_studio.social_metrics", label: "Social Metrics", labelEs: "Métricas Sociales" },
      { key: "demand_studio.connect_accounts", label: "Connect Social Accounts", labelEs: "Conectar Cuentas Sociales" },
    ]
  },
  {
    module: "settings",
    label: "Settings",
    labelEs: "Configuracion",
    icon: Settings2,
    permissions: [
      { key: "settings.view", label: "View Settings", labelEs: "Ver Configuracion" },
      { key: "settings.manage", label: "Manage Settings", labelEs: "Gestionar Configuracion" },
      { key: "settings.users", label: "Manage Users", labelEs: "Gestionar Usuarios" },
      { key: "settings.roles", label: "Manage Roles", labelEs: "Gestionar Roles" },
    ]
  },
  {
    module: "client_engagement",
    label: "Client Engagement",
    labelEs: "Client Engagement",
    icon: Users,
    permissions: [
      { key: "client_engagement.view", label: "View Client Engagement", labelEs: "Ver Client Engagement" },
      { key: "client_engagement.manage", label: "Manage Leads & Clients", labelEs: "Gestionar Leads y Clientes" },
      { key: "client_engagement.proposals", label: "Create Proposals", labelEs: "Crear Propuestas" },
    ]
  },
  {
    module: "execution_hub",
    label: "Execution Hub",
    labelEs: "Execution Hub",
    icon: Briefcase,
    permissions: [
      { key: "execution_hub.view", label: "View Execution Hub", labelEs: "Ver Execution Hub" },
      { key: "execution_hub.manage", label: "Manage Goals & Tasks", labelEs: "Gestionar Metas y Tareas" },
    ]
  },
  {
    module: "partners",
    label: "Partners",
    labelEs: "Partners",
    icon: Users,
    permissions: [
      { key: "partners.view", label: "View Partners", labelEs: "Ver Partners" },
      { key: "partners.manage", label: "Manage Partners", labelEs: "Gestionar Partners" },
    ]
  },
  {
    module: "business_clarity",
    label: "Business Clarity",
    labelEs: "Business Clarity",
    icon: Landmark,
    permissions: [
      { key: "business_clarity.view", label: "View Business Clarity", labelEs: "Ver Business Clarity" },
      { key: "business_clarity.manage", label: "Manage Finances", labelEs: "Gestionar Finanzas" },
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
    description: "Access to Business Clarity, financial reports and budget management",
    description_es: "Acceso a Business Clarity, reportes financieros y gestión de presupuesto",
    permissions: [
      "events.view", "crm.view", 
      "finance.view", "finance.invoices", "finance.payments", "finance.payables", "finance.fixed_costs",
      "reports.executive", "reports.sales", "reports.pl", "reports.budget_alerts", "reports.regulatory",
      "people_ops.cost_centers",
      "client_engagement.view", "business_clarity.view", "business_clarity.manage"
    ],
    is_system: true
  },
  { 
    role_id: "hr", 
    name: "Human Resources", 
    name_es: "Recursos Humanos",
    description: "Access to People Ops, employees and payroll management",
    description_es: "Acceso a People Ops, gestion de empleados y nomina",
    permissions: [
      "events.view", "crm.view",
      "people_ops.employees.view", "people_ops.employees.edit",
      "people_ops.payroll.view", "people_ops.payroll.edit",
      "people_ops.time_off.view", "people_ops.time_off.approve",
      "people_ops.offboarding",
      "reports.budget_alerts",
      "client_engagement.view", "execution_hub.view"
    ],
    is_system: true
  },
  { 
    role_id: "operations", 
    name: "Operations", 
    name_es: "Operaciones",
    description: "Access to Events, Culinary Intelligence and inventory",
    description_es: "Acceso a Eventos, Inteligencia Culinaria e inventario",
    permissions: [
      "events.view", "events.create", "events.edit", 
      "crm.view", 
      "culinary.view", "culinary.manage", "culinary.purchases",
      "client_engagement.view", "execution_hub.view", "partners.view"
    ],
    is_system: true
  },
  { 
    role_id: "marketing", 
    name: "Marketing", 
    name_es: "Marketing",
    description: "Access to Demand Studio, campaigns and social metrics",
    description_es: "Acceso a Demand Studio, campanas y metricas sociales",
    permissions: [
      "events.view", "crm.view",
      "demand_studio.view", "demand_studio.campaigns", "demand_studio.content", 
      "demand_studio.social_metrics", "demand_studio.connect_accounts",
      "client_engagement.view", "partners.view"
    ],
    is_system: true
  },
  { 
    role_id: "manager", 
    name: "Manager", 
    name_es: "Gerente",
    description: "Limited access to view team and approve time off",
    description_es: "Acceso limitado para ver equipo y aprobar vacaciones",
    permissions: [
      "events.view", "crm.view",
      "people_ops.employees.view", "people_ops.time_off.view", "people_ops.time_off.approve",
      "reports.sales"
    ],
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
                          <span className="font-medium">{isEs ? group.labelEs : group.label}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleAllInGroup(group)}
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
            <Button onClick={handleSaveRole}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
