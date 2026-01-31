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
  Edit, Phone, Mail
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const COMMON_ROLES = [
  { value: "coordinator", label: "Event Coordinator", labelEs: "Coordinador de Evento" },
  { value: "catering_lead", label: "Catering Lead", labelEs: "Líder de Catering" },
  { value: "server", label: "Server", labelEs: "Mesero" },
  { value: "bartender", label: "Bartender", labelEs: "Bartender" },
  { value: "chef", label: "Chef", labelEs: "Chef" },
  { value: "setup_crew", label: "Setup Crew", labelEs: "Equipo de Montaje" },
  { value: "breakdown_crew", label: "Breakdown Crew", labelEs: "Equipo de Desmontaje" },
  { value: "dj", label: "DJ/Music", labelEs: "DJ/Música" },
  { value: "photographer", label: "Photographer", labelEs: "Fotógrafo" },
  { value: "florist", label: "Florist", labelEs: "Florista" },
  { value: "security", label: "Security", labelEs: "Seguridad" },
  { value: "valet", label: "Valet Parking", labelEs: "Valet Parking" },
  { value: "other", label: "Other", labelEs: "Otro" },
];

export default function TeamRolesTab({ eventId }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [team, setTeam] = useState({
    roles: [],
    coordinator_notes: ""
  });
  const [roleDialog, setRoleDialog] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [newRole, setNewRole] = useState({
    role_name: "",
    quantity: 1,
    assignees: [],
    responsibilities: "",
    capacity_notes: "",
    contact_info: ""
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
    setSaving(true);
    try {
      await axios.put(`${API}/api/orchestration/team/${eventId}`, { event_id: eventId, ...team }, { withCredentials: true });
      toast.success(isEs ? "Equipo guardado" : "Team saved");
    } catch (err) {
      toast.error(isEs ? "Error al guardar" : "Failed to save");
    }
    setSaving(false);
  };

  const addRole = () => {
    if (!newRole.role_name) return;
    const role = {
      ...newRole,
      role_id: `role_${Date.now()}`
    };
    setTeam({ ...team, roles: [...team.roles, role] });
    setNewRole({
      role_name: "",
      quantity: 1,
      assignees: [],
      responsibilities: "",
      capacity_notes: "",
      contact_info: ""
    });
    setRoleDialog(false);
  };

  const updateRole = () => {
    if (!editingRole) return;
    setTeam({
      ...team,
      roles: team.roles.map(r => r.role_id === editingRole.role_id ? editingRole : r)
    });
    setEditingRole(null);
    setRoleDialog(false);
  };

  const removeRole = (roleId) => {
    setTeam({ ...team, roles: team.roles.filter(r => r.role_id !== roleId) });
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
      contact_info: ""
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

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="team-roles-tab">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Roles Definidos" : "Roles Defined"}</p>
                <p className="text-2xl font-bold">{team.roles.length}</p>
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

      {/* Quick Add Common Roles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isEs ? "Agregar Roles Rápido" : "Quick Add Roles"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {COMMON_ROLES.map((role) => {
              const exists = team.roles.some(r => r.role_name?.toLowerCase() === (isEs ? role.labelEs : role.label).toLowerCase());
              return (
                <Button
                  key={role.value}
                  variant={exists ? "secondary" : "outline"}
                  size="sm"
                  disabled={exists}
                  onClick={() => {
                    const newRoleData = {
                      role_id: `role_${Date.now()}`,
                      role_name: isEs ? role.labelEs : role.label,
                      quantity: 1,
                      assignees: [],
                      responsibilities: "",
                      capacity_notes: "",
                      contact_info: ""
                    };
                    setTeam({ ...team, roles: [...team.roles, newRoleData] });
                  }}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  {isEs ? role.labelEs : role.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Roles List */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{isEs ? "Roles del Evento" : "Event Roles"}</h3>
        <Button variant="outline" onClick={openNewRole}>
          <Plus className="w-4 h-4 mr-2" />
          {isEs ? "Rol Personalizado" : "Custom Role"}
        </Button>
      </div>

      {team.roles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              {isEs ? "No hay roles definidos. Agrega roles para el evento." : "No roles defined. Add roles for the event."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {team.roles.map((role) => (
            <Card key={role.role_id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{role.role_name}</CardTitle>
                    <CardDescription>
                      {role.quantity} {isEs ? "requerido(s)" : "required"} • {role.assignees?.length || 0} {isEs ? "asignado(s)" : "assigned"}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditRole(role)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => removeRole(role.role_id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {role.responsibilities && (
                  <p className="text-sm text-muted-foreground mb-2">{role.responsibilities}</p>
                )}
                {(role.assignees?.length || 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {role.assignees.map((assignee, index) => (
                      <Badge key={index} variant="secondary">
                        <UserCircle className="w-3 h-3 mr-1" />
                        {assignee}
                      </Badge>
                    ))}
                  </div>
                )}
                {role.contact_info && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {role.contact_info}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Coordinator Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isEs ? "Notas del Coordinador" : "Coordinator Notes"}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={team.coordinator_notes || ""}
            onChange={(e) => setTeam({ ...team, coordinator_notes: e.target.value })}
            placeholder={isEs ? "Notas generales para la coordinación del equipo..." : "General notes for team coordination..."}
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isEs ? "Guardar Equipo" : "Save Team"}
        </Button>
      </div>

      {/* Role Dialog */}
      <Dialog open={roleDialog} onOpenChange={setRoleDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingRole 
                ? (isEs ? "Editar Rol" : "Edit Role")
                : (isEs ? "Nuevo Rol" : "New Role")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre del Rol" : "Role Name"} *</Label>
              <Input
                value={editingRole?.role_name || newRole.role_name}
                onChange={(e) => editingRole 
                  ? setEditingRole({ ...editingRole, role_name: e.target.value })
                  : setNewRole({ ...newRole, role_name: e.target.value })}
                placeholder={isEs ? "Ej: Coordinador Principal" : "E.g.: Lead Coordinator"}
              />
            </div>
            <div>
              <Label>{isEs ? "Cantidad Requerida" : "Quantity Required"}</Label>
              <Input
                type="number"
                min="1"
                value={editingRole?.quantity || newRole.quantity}
                onChange={(e) => editingRole 
                  ? setEditingRole({ ...editingRole, quantity: parseInt(e.target.value) || 1 })
                  : setNewRole({ ...newRole, quantity: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div>
              <Label>{isEs ? "Responsabilidades" : "Responsibilities"}</Label>
              <Textarea
                value={editingRole?.responsibilities || newRole.responsibilities}
                onChange={(e) => editingRole 
                  ? setEditingRole({ ...editingRole, responsibilities: e.target.value })
                  : setNewRole({ ...newRole, responsibilities: e.target.value })}
                rows={2}
              />
            </div>
            <div>
              <Label>{isEs ? "Asignados" : "Assignees"}</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  placeholder={isEs ? "Nombre de la persona" : "Person's name"}
                  onKeyDown={(e) => e.key === "Enter" && addAssigneeToRole()}
                />
                <Button variant="outline" onClick={addAssigneeToRole}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {(editingRole?.assignees || newRole.assignees || []).map((assignee, index) => (
                  <Badge key={index} variant="secondary" className="gap-1">
                    {assignee}
                    <button onClick={() => removeAssigneeFromRole(index)} className="hover:text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <Label>{isEs ? "Información de Contacto" : "Contact Info"}</Label>
              <Input
                value={editingRole?.contact_info || newRole.contact_info}
                onChange={(e) => editingRole 
                  ? setEditingRole({ ...editingRole, contact_info: e.target.value })
                  : setNewRole({ ...newRole, contact_info: e.target.value })}
                placeholder={isEs ? "Teléfono o email" : "Phone or email"}
              />
            </div>
            <div>
              <Label>{isEs ? "Notas de Capacidad" : "Capacity Notes"}</Label>
              <Input
                value={editingRole?.capacity_notes || newRole.capacity_notes}
                onChange={(e) => editingRole 
                  ? setEditingRole({ ...editingRole, capacity_notes: e.target.value })
                  : setNewRole({ ...newRole, capacity_notes: e.target.value })}
                placeholder={isEs ? "Ej: Necesita certificación de manejo de alimentos" : "E.g.: Needs food handling certification"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRoleDialog(false); setEditingRole(null); }}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={editingRole ? updateRole : addRole}>
              {editingRole 
                ? (isEs ? "Actualizar" : "Update")
                : (isEs ? "Agregar" : "Add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
