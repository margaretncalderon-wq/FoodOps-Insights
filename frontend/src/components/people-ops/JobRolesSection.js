import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Briefcase, Plus, Pencil, Trash2, Users, RefreshCw, AlertTriangle
} from "lucide-react";
import { toast } from "sonner";

import { API_BASE as API } from "../../utils/api";

const LEVELS = [
  { value: "intern", label: "Intern", labelEs: "Pasante" },
  { value: "junior", label: "Junior", labelEs: "Junior" },
  { value: "mid", label: "Mid-Level", labelEs: "Nivel Medio" },
  { value: "senior", label: "Senior", labelEs: "Senior" },
  { value: "lead", label: "Lead", labelEs: "Líder" },
  { value: "manager", label: "Manager", labelEs: "Gerente" },
  { value: "director", label: "Director", labelEs: "Director" },
  { value: "executive", label: "Executive", labelEs: "Ejecutivo" },
];

export function JobRolesSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [jobRoles, setJobRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState(null);
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    department_id: "",
    level: "",
    min_salary: "",
    max_salary: ""
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesRes, deptRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/job-roles`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/departments`, { withCredentials: true })
      ]);
      setJobRoles(rolesRes.data);
      setDepartments(deptRes.data);
    } catch (err) {
      console.error("Error fetching job roles:", err);
      toast.error(isEs ? "Error al cargar datos" : "Error loading data");
    }
    setLoading(false);
  }, [isEs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenDialog = (role = null) => {
    if (role) {
      setEditingRole(role);
      setFormData({
        title: role.title || "",
        description: role.description || "",
        department_id: role.department_id || "",
        level: role.level || "",
        min_salary: role.min_salary || "",
        max_salary: role.max_salary || ""
      });
    } else {
      setEditingRole(null);
      setFormData({
        title: "",
        description: "",
        department_id: "",
        level: "",
        min_salary: "",
        max_salary: ""
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast.error(isEs ? "El título es requerido" : "Title is required");
      return;
    }

    try {
      const payload = {
        ...formData,
        min_salary: formData.min_salary ? parseFloat(formData.min_salary) : null,
        max_salary: formData.max_salary ? parseFloat(formData.max_salary) : null
      };

      if (editingRole) {
        await axios.put(
          `${API}/api/people-ops/job-roles/${editingRole.job_role_id}`,
          payload,
          { withCredentials: true }
        );
        toast.success(isEs ? "Puesto actualizado" : "Job role updated");
      } else {
        await axios.post(
          `${API}/api/people-ops/job-roles`,
          payload,
          { withCredentials: true }
        );
        toast.success(isEs ? "Puesto creado" : "Job role created");
      }

      setDialogOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al guardar" : "Error saving"));
    }
  };

  const handleOpenDelete = (role) => {
    setRoleToDelete(role);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!roleToDelete) return;

    try {
      const res = await axios.delete(
        `${API}/api/people-ops/job-roles/${roleToDelete.job_role_id}`,
        { withCredentials: true }
      );

      if (res.data.soft_delete) {
        toast.success(isEs ? "Puesto desactivado" : "Job role deactivated");
      } else {
        toast.success(isEs ? "Puesto eliminado" : "Job role deleted");
      }

      setDeleteDialogOpen(false);
      setRoleToDelete(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al eliminar" : "Error deleting"));
    }
  };

  const getDepartmentName = (deptId) => {
    const dept = departments.find(d => d.department_id === deptId);
    return dept?.name || "-";
  };

  const getLevelLabel = (level) => {
    const lvl = LEVELS.find(l => l.value === level);
    return lvl ? (isEs ? lvl.labelEs : lvl.label) : level || "-";
  };

  const formatCurrency = (amount) => {
    if (!amount) return "-";
    return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="job-roles-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Briefcase className="w-5 h-5" />
            {isEs ? "Puestos de Trabajo" : "Job Roles"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Define los puestos y sus descripciones" : "Define job positions and their descriptions"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Nuevo Puesto" : "New Role"}
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{isEs ? "Total Puestos" : "Total Roles"}</div>
            <div className="text-2xl font-bold text-violet-600">{jobRoles.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{isEs ? "Con Empleados" : "With Employees"}</div>
            <div className="text-2xl font-bold">{jobRoles.filter(r => r.employee_count > 0).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{isEs ? "Vacantes" : "Vacant"}</div>
            <div className="text-2xl font-bold text-amber-600">{jobRoles.filter(r => r.employee_count === 0).length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Título" : "Title"}</TableHead>
                <TableHead>{isEs ? "Departamento" : "Department"}</TableHead>
                <TableHead>{isEs ? "Nivel" : "Level"}</TableHead>
                <TableHead>{isEs ? "Rango Salarial" : "Salary Range"}</TableHead>
                <TableHead className="text-center">{isEs ? "Empleados" : "Employees"}</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobRoles.map((role) => (
                <TableRow key={role.job_role_id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{role.title}</p>
                      {role.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{role.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getDepartmentName(role.department_id)}</TableCell>
                  <TableCell>
                    {role.level && (
                      <Badge variant="outline">{getLevelLabel(role.level)}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {role.min_salary || role.max_salary ? (
                      <span className="text-sm">
                        {formatCurrency(role.min_salary)} - {formatCurrency(role.max_salary)}
                      </span>
                    ) : "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={role.employee_count > 0 ? "default" : "secondary"}>
                      {role.employee_count || 0}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(role)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDelete(role)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {jobRoles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay puestos definidos" : "No job roles defined"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingRole
                ? (isEs ? "Editar Puesto" : "Edit Job Role")
                : (isEs ? "Nuevo Puesto" : "New Job Role")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>{isEs ? "Título *" : "Title *"}</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={isEs ? "Ej: Gerente de Ventas" : "E.g.: Sales Manager"}
              />
            </div>

            <div>
              <Label>{isEs ? "Descripción" : "Description"}</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder={isEs ? "Describe las responsabilidades del puesto..." : "Describe the role responsibilities..."}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Departamento" : "Department"}</Label>
                <Select
                  value={formData.department_id || "none"}
                  onValueChange={(v) => setFormData({ ...formData, department_id: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin asignar" : "Unassigned"}</SelectItem>
                    {departments.filter(d => d.is_active !== false).map((dept) => (
                      <SelectItem key={dept.department_id} value={dept.department_id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{isEs ? "Nivel" : "Level"}</Label>
                <Select
                  value={formData.level || "none"}
                  onValueChange={(v) => setFormData({ ...formData, level: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin nivel" : "No level"}</SelectItem>
                    {LEVELS.map((lvl) => (
                      <SelectItem key={lvl.value} value={lvl.value}>
                        {isEs ? lvl.labelEs : lvl.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Salario Mínimo" : "Min Salary"}</Label>
                <Input
                  type="number"
                  value={formData.min_salary}
                  onChange={(e) => setFormData({ ...formData, min_salary: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>{isEs ? "Salario Máximo" : "Max Salary"}</Label>
                <Input
                  type="number"
                  value={formData.max_salary}
                  onChange={(e) => setFormData({ ...formData, max_salary: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSave}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {isEs ? "Eliminar Puesto" : "Delete Job Role"}
            </DialogTitle>
          </DialogHeader>

          <div className="py-4">
            {roleToDelete?.employee_count > 0 ? (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-sm text-amber-800">
                    {isEs
                      ? `"${roleToDelete?.title}" tiene ${roleToDelete.employee_count} empleado(s) asignado(s).`
                      : `"${roleToDelete?.title}" has ${roleToDelete.employee_count} employee(s) assigned.`}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {isEs
                    ? "El puesto será desactivado en lugar de eliminado."
                    : "The role will be deactivated instead of deleted."}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {isEs
                  ? `¿Estás seguro de eliminar "${roleToDelete?.title}"?`
                  : `Are you sure you want to delete "${roleToDelete?.title}"?`}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDeleteDialogOpen(false);
              setRoleToDelete(null);
            }}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {roleToDelete?.employee_count > 0
                ? (isEs ? "Desactivar" : "Deactivate")
                : (isEs ? "Eliminar" : "Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
