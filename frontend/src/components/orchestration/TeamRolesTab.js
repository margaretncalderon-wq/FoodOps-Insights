import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { 
  Save, RefreshCw, Users, Plus, Trash2, UserCircle,
  Edit, Lock, DollarSign, AlertCircle
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { KoraLoader } from "../KoraLoader";

const COMMON_OPERATIONAL_ROLES = [
  { value: "coordinator", label: "Event Coordinator", labelEs: "Coordinador de Evento" },
  { value: "setup_crew", label: "Setup Crew", labelEs: "Equipo de Montaje" },
  { value: "breakdown_crew", label: "Breakdown Crew", labelEs: "Equipo de Desmontaje" },
  { value: "runner", label: "Runner/Assistant", labelEs: "Asistente/Runner" },
  { value: "supervisor", label: "On-site Supervisor", labelEs: "Supervisor en Sitio" },
];

export default function TeamRolesTab({ eventId, isLocked = false }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [team, setTeam] = useState({
    synced_roles: [],
    operational_roles: [],
    roles: [],
    coordinator_notes: "",
    is_locked: false
  });
  const [roleDialog, setRoleDialog] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [newRole, setNewRole] = useState({
    role_name: "",
    quantity: 1,
    assignees: [],
    responsibilities: "",
    capacity_notes: "",
    contact_info: "",
    is_billable: false
  });
  const [newAssignee, setNewAssignee] = useState("");

  const fetchTeam = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/orchestration/team/${eventId}`, { withCredentials: true });
      setTeam(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  const handleSave = async () => {
    if (isLocked || team.is_locked) {
      toast.error(isEs ? "Evento cerrado. No se puede modificar." : "Event is closed. Cannot modify.");
      return;
    }
    setSaving(true);
    try {
      await axios.put(`${API}/api/orchestration/team/${eventId}`, { 
        event_id: eventId, 
        roles: team.operational_roles,
        coordinator_notes: team.coordinator_notes 
      }, { withCredentials: true });
      toast.success(isEs ? "Equipo guardado" : "Team saved");
      fetchTeam(); // Refresh to get updated data
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al guardar" : "Failed to save"));
    }
    setSaving(false);
  };

  const addOperationalRole = () => {
    if (!newRole.role_name) return;
    const role = {
      ...newRole,
      role_id: `op_role_${Date.now()}`,
      is_synced: false,
      is_billable: false
    };
    setTeam({ 
      ...team, 
      operational_roles: [...team.operational_roles, role],
      roles: [...team.roles, role]
    });
    setNewRole({
      role_name: "",
      quantity: 1,
      assignees: [],
      responsibilities: "",
      capacity_notes: "",
      contact_info: "",
      is_billable: false
    });
    setRoleDialog(false);
  };

  const updateRole = () => {
    if (!editingRole) return;
    
    // Only update operational roles (synced roles are read-only for quantity)
    if (!editingRole.is_synced) {
      setTeam({
        ...team,
        operational_roles: team.operational_roles.map(r => r.role_id === editingRole.role_id ? editingRole : r),
        roles: team.roles.map(r => r.role_id === editingRole.role_id ? editingRole : r)
      });
    } else {
      // For synced roles, only update assignees and notes
      const updatedSynced = team.synced_roles.map(r => 
        r.role_id === editingRole.role_id ? { ...r, assignees: editingRole.assignees } : r
      );
      setTeam({
        ...team,
        synced_roles: updatedSynced,
        roles: [...updatedSynced, ...team.operational_roles]
      });
    }
    setEditingRole(null);
    setRoleDialog(false);
  };

  const removeRole = (roleId) => {
    // Only allow removing operational roles
    const role = team.operational_roles.find(r => r.role_id === roleId);
    if (!role) {
      toast.error(isEs ? "No se pueden eliminar roles del contrato" : "Cannot remove contract roles");
      return;
    }
    setTeam({ 
      ...team, 
      operational_roles: team.operational_roles.filter(r => r.role_id !== roleId),
      roles: team.roles.filter(r => r.role_id !== roleId)
    });
  };

  const openEditRole = (role) => {
    setEditingRole({ ...role });
    setRoleDialog(true);
  };

  const openNewRole = () => {
    setEditingRole(null);
    setNewRole({
      role_name: "",
      quantity: 1,
      assignees: [],
      responsibilities: "",
      capacity_notes: "",
      contact_info: "",
      is_billable: false
    });
    setRoleDialog(false);
    setTimeout(() => setRoleDialog(true), 10);
  };

  const addAssigneeToRole = () => {
    if (!newAssignee.trim()) return;
    if (editingRole) {
      setEditingRole({
        ...editingRole,
        assignees: [...(editingRole.assignees || []), newAssignee.trim()]
      });
    } else {
      setNewRole({
        ...newRole,
        assignees: [...(newRole.assignees || []), newAssignee.trim()]
      });
    }
    setNewAssignee("");
  };

  const removeAssigneeFromRole = (index) => {
    if (editingRole) {
      setEditingRole({
        ...editingRole,
        assignees: editingRole.assignees.filter((_, i) => i !== index)
      });
    } else {
      setNewRole({
        ...newRole,
        assignees: newRole.assignees.filter((_, i) => i !== index)
      });
    }
  };

  const getTotalStaff = () => team.roles.reduce((sum, r) => sum + (r.quantity || 0), 0);
  const getAssignedStaff = () => team.roles.reduce((sum, r) => sum + (r.assignees?.length || 0), 0);
  const getSyncedCount = () => team.synced_roles?.length || 0;
  const getOperationalCount = () => team.operational_roles?.length || 0;

  const effectiveLocked = isLocked || team.is_locked;

  if (loading) return <div className="flex items-center justify-center h-64"><KoraLoader size={48} /></div>;

  return (
    <div className="space-y-6" data-testid="team-roles-tab">
      {/* Locked Banner */}
      {effectiveLocked && (
        <Card className="border-gray-300 bg-gray-50">
          <CardContent className="py-3">
            <p className="text-sm text-gray-600 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              {isEs 
                ? "Evento cerrado. Los roles no se pueden modificar." 
                : "Event closed. Roles cannot be modified."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Info Banner */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="py-3">
          <p className="text-sm text-blue-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {isEs 
              ? "Los roles del contrato (Service items) se sincronizan automáticamente. Solo puedes agregar roles operacionales no facturables." 
              : "Contract roles (Service items) are auto-synced. You can only add non-billable operational roles."}
          </p>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Roles del Contrato" : "Contract Roles"}</p>
                <p className="text-2xl font-bold">{getSyncedCount()}</p>
              </div>
              <Lock className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Roles Operacionales" : "Operational Roles"}</p>
                <p className="text-2xl font-bold">{getOperationalCount()}</p>
              </div>
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Personal Requerido" : "Staff Required"}</p>
                <p className="text-2xl font-bold">{getTotalStaff()}</p>
              </div>
              <UserCircle className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Personal Asignado" : "Staff Assigned"}</p>
                <p className="text-2xl font-bold">{getAssignedStaff()} / {getTotalStaff()}</p>
              </div>
              <Badge className={getAssignedStaff() >= getTotalStaff() ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}>
                {getAssignedStaff() >= getTotalStaff() 
                  ? (isEs ? "Completo" : "Complete")
                  : (isEs ? "Pendiente" : "Pending")}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contract Roles (Synced - Read Only) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                {isEs ? "Roles del Contrato" : "Contract Roles"}
              </CardTitle>
              <CardDescription>
                {isEs ? "Sincronizados desde Service items del contrato (solo lectura)" : "Synced from contract Service items (read-only)"}
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-green-600 border-green-600">
              <DollarSign className="w-3 h-3 mr-1" />
              {isEs ? "Facturable" : "Billable"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {team.synced_roles?.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Lock className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{isEs ? "No hay Service items en el contrato" : "No Service items in contract"}</p>
              <p className="text-sm mt-1">
                {isEs ? "Agrega services en el módulo de Ventas/Propuestas" : "Add services in Sales/Proposals module"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {team.synced_roles?.map((role) => (
                <Card key={role.role_id} className="border-green-200 bg-green-50/30">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {role.role_name}
                          <Badge variant="outline" className="text-xs">
                            <Lock className="w-3 h-3 mr-1" />
                            {isEs ? "Contrato" : "Contract"}
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          <span className="font-medium">{role.quantity}</span> {isEs ? "requerido(s)" : "required"} • 
                          <span className="font-medium"> {role.assignees?.length || 0}</span> {isEs ? "asignado(s)" : "assigned"}
                        </CardDescription>
                      </div>
                      {!effectiveLocked && (
                        <Button variant="ghost" size="icon" onClick={() => openEditRole(role)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {role.unit_price > 0 && (
                      <p className="text-sm text-green-700 mb-2">
                        ${role.unit_price?.toLocaleString()} x {role.quantity} = ${role.total_price?.toLocaleString()}
                      </p>
                    )}
                    {role.assignees?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {role.assignees.map((a, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{a}</Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Operational Roles (Non-Billable) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{isEs ? "Roles Operacionales" : "Operational Roles"}</CardTitle>
              <CardDescription>
                {isEs ? "Roles adicionales no facturables para ejecución" : "Additional non-billable roles for execution"}
              </CardDescription>
            </div>
            {!effectiveLocked && (
              <Button variant="outline" onClick={openNewRole}>
                <Plus className="w-4 h-4 mr-2" />
                {isEs ? "Agregar Rol" : "Add Role"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Quick Add Common Operational Roles */}
          {!effectiveLocked && (
            <div className="mb-4 pb-4 border-b">
              <p className="text-sm text-muted-foreground mb-2">{isEs ? "Agregar rápido:" : "Quick add:"}</p>
              <div className="flex flex-wrap gap-2">
                {COMMON_OPERATIONAL_ROLES.map((role) => {
                  const exists = team.operational_roles.some(r => r.role_name?.toLowerCase() === (isEs ? role.labelEs : role.label).toLowerCase());
                  return (
                    <Button
                      key={role.value}
                      variant={exists ? "secondary" : "outline"}
                      size="sm"
                      disabled={exists}
                      onClick={() => {
                        const newRoleData = {
                          role_id: `op_role_${Date.now()}`,
                          role_name: isEs ? role.labelEs : role.label,
                          quantity: 1,
                          assignees: [],
                          responsibilities: "",
                          capacity_notes: "",
                          contact_info: "",
                          is_synced: false,
                          is_billable: false
                        };
                        setTeam({ 
                          ...team, 
                          operational_roles: [...team.operational_roles, newRoleData],
                          roles: [...team.roles, newRoleData]
                        });
                      }}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      {isEs ? role.labelEs : role.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {team.operational_roles?.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{isEs ? "No hay roles operacionales" : "No operational roles"}</p>
              <p className="text-sm mt-1">
                {isEs ? "Agrega roles de coordinación o soporte no facturables" : "Add non-billable coordination or support roles"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {team.operational_roles?.map((role) => (
                <Card key={role.role_id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {role.role_name}
                          <Badge variant="outline" className="text-xs text-gray-500">
                            {isEs ? "No facturable" : "Not billable"}
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          {role.quantity} {isEs ? "requerido(s)" : "required"} • {role.assignees?.length || 0} {isEs ? "asignado(s)" : "assigned"}
                        </CardDescription>
                      </div>
                      {!effectiveLocked && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditRole(role)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => removeRole(role.role_id)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {role.responsibilities && (
                      <p className="text-sm text-muted-foreground mb-2">{role.responsibilities}</p>
                    )}
                    {role.assignees?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {role.assignees.map((a, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{a}</Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Coordinator Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isEs ? "Notas del Coordinador" : "Coordinator Notes"}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder={isEs ? "Notas generales sobre el equipo..." : "General notes about the team..."}
            value={team.coordinator_notes || ""}
            onChange={(e) => setTeam({ ...team, coordinator_notes: e.target.value })}
            rows={3}
            disabled={effectiveLocked}
          />
        </CardContent>
      </Card>

      {/* Save Button */}
      {!effectiveLocked && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? (isEs ? "Guardando..." : "Saving...") : (isEs ? "Guardar Equipo" : "Save Team")}
          </Button>
        </div>
      )}

      {/* Role Dialog */}
      <Dialog open={roleDialog} onOpenChange={setRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRole 
                ? (editingRole.is_synced 
                    ? (isEs ? "Asignar Personal" : "Assign Staff")
                    : (isEs ? "Editar Rol" : "Edit Role"))
                : (isEs ? "Nuevo Rol Operacional" : "New Operational Role")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Role Name - disabled for synced roles */}
            <div>
              <Label>{isEs ? "Nombre del Rol" : "Role Name"}</Label>
              <Input
                value={editingRole ? editingRole.role_name : newRole.role_name}
                onChange={(e) => editingRole 
                  ? setEditingRole({ ...editingRole, role_name: e.target.value })
                  : setNewRole({ ...newRole, role_name: e.target.value })}
                disabled={editingRole?.is_synced}
              />
            </div>
            
            {/* Quantity - disabled for synced roles */}
            <div>
              <Label>{isEs ? "Cantidad" : "Quantity"}</Label>
              <Input
                type="number"
                min="1"
                value={editingRole ? editingRole.quantity : newRole.quantity}
                onChange={(e) => editingRole 
                  ? setEditingRole({ ...editingRole, quantity: parseInt(e.target.value) || 1 })
                  : setNewRole({ ...newRole, quantity: parseInt(e.target.value) || 1 })}
                disabled={editingRole?.is_synced}
              />
              {editingRole?.is_synced && (
                <p className="text-xs text-muted-foreground mt-1">
                  {isEs ? "La cantidad viene del contrato" : "Quantity comes from contract"}
                </p>
              )}
            </div>
            
            {/* Assignees */}
            <div>
              <Label>{isEs ? "Personal Asignado" : "Assigned Staff"}</Label>
              <div className="flex gap-2 mb-2">
                <Input
                  placeholder={isEs ? "Nombre del personal..." : "Staff name..."}
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && addAssigneeToRole()}
                />
                <Button type="button" onClick={addAssigneeToRole} variant="outline">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {(editingRole ? editingRole.assignees : newRole.assignees)?.map((a, i) => (
                  <Badge key={i} variant="secondary" className="text-xs cursor-pointer" onClick={() => removeAssigneeFromRole(i)}>
                    {a} ×
                  </Badge>
                ))}
              </div>
            </div>
            
            {/* Responsibilities - only for non-synced roles */}
            {(!editingRole || !editingRole.is_synced) && (
              <div>
                <Label>{isEs ? "Responsabilidades" : "Responsibilities"}</Label>
                <Textarea
                  value={editingRole ? editingRole.responsibilities : newRole.responsibilities}
                  onChange={(e) => editingRole 
                    ? setEditingRole({ ...editingRole, responsibilities: e.target.value })
                    : setNewRole({ ...newRole, responsibilities: e.target.value })}
                  rows={2}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={editingRole ? updateRole : addOperationalRole}>
              {editingRole ? (isEs ? "Guardar" : "Save") : (isEs ? "Agregar" : "Add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
