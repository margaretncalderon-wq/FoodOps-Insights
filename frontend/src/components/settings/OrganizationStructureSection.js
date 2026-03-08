import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Building2, Plus, Pencil, Trash2, Users, DollarSign,
  RefreshCw, ChevronRight, Settings2, ExternalLink, BarChart3
} from "lucide-react";
import { toast } from "sonner";

import { API_BASE as API } from "../../utils/api";

export function OrganizationStructureSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState("departments");
  const [loading, setLoading] = useState(true);
  
  // Departments state
  const [departments, setDepartments] = useState([]);
  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [deptForm, setDeptForm] = useState({
    name: "",
    code: "",
    description: "",
    head_user_id: "",
    parent_department_id: "",
    display_order: 0
  });
  
  // Cost Centers state
  const [costCenters, setCostCenters] = useState([]);
  const [ccDialogOpen, setCcDialogOpen] = useState(false);
  const [editingCC, setEditingCC] = useState(null);
  const [ccForm, setCcForm] = useState({
    name: "",
    code: "",
    description: "",
    department_id: "",
    annual_budget: "",
    responsible_user_id: "",
    cc_type: ""
  });
  
  // Users for selection
  const [users, setUsers] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [deptRes, ccRes, usersRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/departments`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/cost-centers`, { withCredentials: true }),
        axios.get(`${API}/api/settings/users`, { withCredentials: true }).catch(() => ({ data: [] }))
      ]);
      setDepartments(Array.isArray(deptRes.data) ? deptRes.data : []);
      setCostCenters(Array.isArray(ccRes.data) ? ccRes.data : []);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
    } catch (error) {
      console.error("Error loading org structure:", error);
      toast.error(isEs ? "Error al cargar datos" : "Error loading data");
      setDepartments([]);
      setCostCenters([]);
    } finally {
      setLoading(false);
    }
  }, [isEs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Department handlers
  const handleOpenDeptDialog = (dept = null) => {
    if (dept) {
      setEditingDept(dept);
      setDeptForm({
        name: dept.name || "",
        code: dept.code || "",
        description: dept.description || "",
        head_user_id: dept.head_user_id || "",
        parent_department_id: dept.parent_department_id || "",
        display_order: dept.display_order || 0
      });
    } else {
      setEditingDept(null);
      setDeptForm({
        name: "",
        code: "",
        description: "",
        head_user_id: "",
        parent_department_id: "",
        display_order: departments.length
      });
    }
    setDeptDialogOpen(true);
  };

  const handleSaveDept = async () => {
    if (!deptForm.name.trim()) {
      toast.error(isEs ? "Nombre requerido" : "Name required");
      return;
    }
    
    try {
      if (editingDept) {
        await axios.put(
          `${API}/api/people-ops/departments/${editingDept.department_id}`,
          deptForm,
          { withCredentials: true }
        );
        toast.success(isEs ? "Departamento actualizado" : "Department updated");
      } else {
        await axios.post(
          `${API}/api/people-ops/departments`,
          deptForm,
          { withCredentials: true }
        );
        toast.success(isEs ? "Departamento creado" : "Department created");
      }
      setDeptDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || (isEs ? "Error al guardar" : "Error saving"));
    }
  };

  const handleDeleteDept = async (dept) => {
    if (!confirm(isEs ? "¿Eliminar este departamento?" : "Delete this department?")) return;
    
    try {
      await axios.delete(
        `${API}/api/people-ops/departments/${dept.department_id}`,
        { withCredentials: true }
      );
      toast.success(isEs ? "Departamento eliminado" : "Department deleted");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || (isEs ? "Error al eliminar" : "Error deleting"));
    }
  };

  // Cost Center handlers
  const handleOpenCCDialog = (cc = null) => {
    if (cc) {
      setEditingCC(cc);
      setCcForm({
        name: cc.name || "",
        code: cc.code || "",
        description: cc.description || "",
        department_id: cc.department_id || "",
        annual_budget: cc.annual_budget || "",
        responsible_user_id: cc.responsible_user_id || "",
        cc_type: cc.cc_type || ""
      });
    } else {
      setEditingCC(null);
      setCcForm({
        name: "",
        code: "",
        description: "",
        department_id: "",
        annual_budget: "",
        responsible_user_id: "",
        cc_type: ""
      });
    }
    setCcDialogOpen(true);
  };

  const handleSaveCC = async () => {
    if (!ccForm.name.trim()) {
      toast.error(isEs ? "Nombre requerido" : "Name required");
      return;
    }
    
    const payload = {
      ...ccForm,
      annual_budget: ccForm.annual_budget ? parseFloat(ccForm.annual_budget) : null
    };
    
    try {
      if (editingCC) {
        await axios.put(
          `${API}/api/people-ops/cost-centers/${editingCC.cost_center_id}`,
          payload,
          { withCredentials: true }
        );
        toast.success(isEs ? "Centro de costo actualizado" : "Cost center updated");
      } else {
        await axios.post(
          `${API}/api/people-ops/cost-centers`,
          payload,
          { withCredentials: true }
        );
        toast.success(isEs ? "Centro de costo creado" : "Cost center created");
      }
      setCcDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || (isEs ? "Error al guardar" : "Error saving"));
    }
  };

  const formatCurrency = (amount) => 
    `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;

  const CC_TYPES = [
    { value: "operating", label: isEs ? "Operativo" : "Operating" },
    { value: "support", label: isEs ? "Soporte" : "Support" },
    { value: "revenue", label: isEs ? "Ingresos" : "Revenue" },
    { value: "investment", label: isEs ? "Inversión" : "Investment" },
    { value: "overhead", label: "Overhead" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="org-structure-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            {isEs ? "Estructura Organizacional" : "Organization Structure"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Gestiona departamentos y centros de costo" : "Manage departments and cost centers"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate("/business-clarity/cost-center-budgets")}
            className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            {isEs ? "Gestionar Presupuestos" : "Manage Budgets"}
            <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {isEs ? "Actualizar" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{isEs ? "Departamentos" : "Departments"}</div>
            <div className="text-2xl font-bold text-blue-600">{departments.filter(d => d.is_active !== false).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{isEs ? "Centros de Costo" : "Cost Centers"}</div>
            <div className="text-2xl font-bold">{costCenters.filter(c => c.is_active !== false).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{isEs ? "Total Empleados" : "Total Employees"}</div>
            <div className="text-2xl font-bold">
              {departments.reduce((sum, d) => sum + (d.employee_count || 0), 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{isEs ? "Presupuesto Total" : "Total Budget"}</div>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(costCenters.reduce((sum, c) => sum + (c.annual_budget || 0), 0))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="departments" className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            {isEs ? "Departamentos" : "Departments"}
          </TabsTrigger>
          <TabsTrigger value="cost-centers" className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            {isEs ? "Centros de Costo" : "Cost Centers"}
          </TabsTrigger>
        </TabsList>

        {/* Departments Tab */}
        <TabsContent value="departments" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{isEs ? "Departamentos" : "Departments"}</CardTitle>
                <Button size="sm" onClick={() => handleOpenDeptDialog()}>
                  <Plus className="w-4 h-4 mr-2" />
                  {isEs ? "Nuevo" : "New"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                    <TableHead>{isEs ? "Código" : "Code"}</TableHead>
                    <TableHead>{isEs ? "Responsable" : "Head"}</TableHead>
                    <TableHead className="text-center">{isEs ? "Empleados" : "Employees"}</TableHead>
                    <TableHead className="text-center">{isEs ? "Centros Costo" : "Cost Centers"}</TableHead>
                    <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.map((dept) => (
                    <TableRow key={dept.department_id}>
                      <TableCell className="font-medium">{dept.name}</TableCell>
                      <TableCell className="text-muted-foreground">{dept.code || "-"}</TableCell>
                      <TableCell>{dept.head_name || "-"}</TableCell>
                      <TableCell className="text-center">{dept.employee_count || 0}</TableCell>
                      <TableCell className="text-center">{dept.cost_center_count || 0}</TableCell>
                      <TableCell>
                        <Badge variant={dept.is_active ? "default" : "secondary"}>
                          {dept.is_active ? (isEs ? "Activo" : "Active") : (isEs ? "Inactivo" : "Inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenDeptDialog(dept)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteDept(dept)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {departments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {isEs ? "No hay departamentos creados" : "No departments created"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cost Centers Tab */}
        <TabsContent value="cost-centers" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{isEs ? "Centros de Costo" : "Cost Centers"}</CardTitle>
                <Button size="sm" onClick={() => handleOpenCCDialog()}>
                  <Plus className="w-4 h-4 mr-2" />
                  {isEs ? "Nuevo" : "New"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                    <TableHead>{isEs ? "Código" : "Code"}</TableHead>
                    <TableHead>{isEs ? "Departamento" : "Department"}</TableHead>
                    <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Presupuesto" : "Budget"}</TableHead>
                    <TableHead>{isEs ? "Responsable" : "Owner"}</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costCenters.map((cc) => (
                    <TableRow key={cc.cost_center_id}>
                      <TableCell className="font-medium">{cc.name}</TableCell>
                      <TableCell className="text-muted-foreground">{cc.code || "-"}</TableCell>
                      <TableCell>{cc.department_name || "-"}</TableCell>
                      <TableCell>
                        {cc.cc_type && (
                          <Badge variant="outline">
                            {CC_TYPES.find(t => t.value === cc.cc_type)?.label || cc.cc_type}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(cc.annual_budget)}</TableCell>
                      <TableCell>{cc.responsible_name || "-"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleOpenCCDialog(cc)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {costCenters.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {isEs ? "No hay centros de costo" : "No cost centers"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Department Dialog */}
      <Dialog open={deptDialogOpen} onOpenChange={setDeptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingDept ? (isEs ? "Editar Departamento" : "Edit Department") : (isEs ? "Nuevo Departamento" : "New Department")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Nombre" : "Name"} *</Label>
                <Input
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({...deptForm, name: e.target.value})}
                  placeholder={isEs ? "Ej: Marketing" : "E.g., Marketing"}
                />
              </div>
              <div>
                <Label>{isEs ? "Código" : "Code"}</Label>
                <Input
                  value={deptForm.code}
                  onChange={(e) => setDeptForm({...deptForm, code: e.target.value.toUpperCase()})}
                  placeholder="MKT"
                  maxLength={10}
                />
              </div>
            </div>
            
            <div>
              <Label>{isEs ? "Descripción" : "Description"}</Label>
              <Textarea
                value={deptForm.description}
                onChange={(e) => setDeptForm({...deptForm, description: e.target.value})}
                rows={2}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Responsable" : "Department Head"}</Label>
                <Select
                  value={deptForm.head_user_id || "none"}
                  onValueChange={(v) => setDeptForm({...deptForm, head_user_id: v === "none" ? "" : v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin asignar" : "Unassigned"}</SelectItem>
                    {(users || []).map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isEs ? "Departamento Padre" : "Parent Department"}</Label>
                <Select
                  value={deptForm.parent_department_id || "none"}
                  onValueChange={(v) => setDeptForm({...deptForm, parent_department_id: v === "none" ? "" : v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Ninguno" : "None"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Ninguno" : "None"}</SelectItem>
                    {(departments || []).filter(d => d.department_id !== editingDept?.department_id).map((d) => (
                      <SelectItem key={d.department_id} value={d.department_id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeptDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveDept}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cost Center Dialog */}
      <Dialog open={ccDialogOpen} onOpenChange={setCcDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCC ? (isEs ? "Editar Centro de Costo" : "Edit Cost Center") : (isEs ? "Nuevo Centro de Costo" : "New Cost Center")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Nombre" : "Name"} *</Label>
                <Input
                  value={ccForm.name}
                  onChange={(e) => setCcForm({...ccForm, name: e.target.value})}
                />
              </div>
              <div>
                <Label>{isEs ? "Código" : "Code"}</Label>
                <Input
                  value={ccForm.code}
                  onChange={(e) => setCcForm({...ccForm, code: e.target.value.toUpperCase()})}
                  maxLength={10}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Departamento" : "Department"}</Label>
                <Select
                  value={ccForm.department_id || "none"}
                  onValueChange={(v) => setCcForm({...ccForm, department_id: v === "none" ? "" : v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin asignar" : "Unassigned"}</SelectItem>
                    {(departments || []).filter(d => d.is_active !== false).map((d) => (
                      <SelectItem key={d.department_id} value={d.department_id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isEs ? "Tipo" : "Type"}</Label>
                <Select
                  value={ccForm.cc_type || "none"}
                  onValueChange={(v) => setCcForm({...ccForm, cc_type: v === "none" ? "" : v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin tipo" : "No type"}</SelectItem>
                    {CC_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Presupuesto Anual" : "Annual Budget"}</Label>
                <Input
                  type="number"
                  value={ccForm.annual_budget}
                  onChange={(e) => setCcForm({...ccForm, annual_budget: e.target.value})}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>{isEs ? "Responsable" : "Owner"}</Label>
                <Select
                  value={ccForm.responsible_user_id || "none"}
                  onValueChange={(v) => setCcForm({...ccForm, responsible_user_id: v === "none" ? "" : v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin asignar" : "Unassigned"}</SelectItem>
                    {(users || []).map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label>{isEs ? "Descripción" : "Description"}</Label>
              <Textarea
                value={ccForm.description}
                onChange={(e) => setCcForm({...ccForm, description: e.target.value})}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCcDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveCC}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
