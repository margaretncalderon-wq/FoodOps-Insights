import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Users, Building2, ChevronDown, ChevronRight, RefreshCw, User,
  Plus, Pencil, Trash2, Briefcase, Layers
} from "lucide-react";
import { toast } from "sonner";

import { API_BASE as API } from "../../utils/api";

const POSITION_LEVELS = [
  { value: "executive", label: "Ejecutivo", labelEn: "Executive" },
  { value: "director", label: "Director", labelEn: "Director" },
  { value: "manager", label: "Gerente", labelEn: "Manager" },
  { value: "lead", label: "Lead", labelEn: "Lead" },
  { value: "senior", label: "Senior", labelEn: "Senior" },
  { value: "mid", label: "Mid-Level", labelEn: "Mid-Level" },
  { value: "junior", label: "Junior", labelEn: "Junior" },
  { value: "intern", label: "Pasante", labelEn: "Intern" },
];

export function OrgChartSection() {
  const { language } = useLanguage();
  const isEs = language === "es";

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [activeTab, setActiveTab] = useState("departments");
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  // Department dialog
  const [deptDialog, setDeptDialog] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [deptForm, setDeptForm] = useState({ name: "", code: "", description: "", head_user_id: "", parent_department_id: "" });

  // Position dialog
  const [posDialog, setPosDialog] = useState(false);
  const [editingPos, setEditingPos] = useState(null);
  const [posForm, setPosForm] = useState({ title: "", department_id: "", level: "", description: "", reports_to_position_id: "" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, deptRes, posRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/employees`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/departments`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/positions`, { withCredentials: true }),
      ]);
      setEmployees(empRes.data.filter(e => e.status !== "terminated"));
      setDepartments(Array.isArray(deptRes.data) ? deptRes.data : []);
      setPositions(Array.isArray(posRes.data) ? posRes.data : []);
    } catch {
      toast.error(isEs ? "Error al cargar datos" : "Error loading data");
    }
    setLoading(false);
  }, [isEs]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Department CRUD
  const openDeptDialog = (dept = null) => {
    if (dept) {
      setEditingDept(dept);
      setDeptForm({ name: dept.name || "", code: dept.code || "", description: dept.description || "", head_user_id: dept.head_user_id || "", parent_department_id: dept.parent_department_id || "" });
    } else {
      setEditingDept(null);
      setDeptForm({ name: "", code: "", description: "", head_user_id: "", parent_department_id: "" });
    }
    setDeptDialog(true);
  };

  const saveDept = async () => {
    if (!deptForm.name.trim()) return;
    try {
      if (editingDept) {
        await axios.put(`${API}/api/people-ops/departments/${editingDept.department_id}`, deptForm, { withCredentials: true });
        toast.success(isEs ? "Departamento actualizado" : "Department updated");
      } else {
        await axios.post(`${API}/api/people-ops/departments`, deptForm, { withCredentials: true });
        toast.success(isEs ? "Departamento creado" : "Department created");
      }
      setDeptDialog(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const deleteDept = async (dept) => {
    if (!confirm(isEs ? `Eliminar departamento "${dept.name}"?` : `Delete department "${dept.name}"?`)) return;
    try {
      await axios.delete(`${API}/api/people-ops/departments/${dept.department_id}`, { withCredentials: true });
      toast.success(isEs ? "Departamento eliminado" : "Department deleted");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  // Position CRUD
  const openPosDialog = (pos = null) => {
    if (pos) {
      setEditingPos(pos);
      setPosForm({ title: pos.title || "", department_id: pos.department_id || "", level: pos.level || "", description: pos.description || "", reports_to_position_id: pos.reports_to_position_id || "" });
    } else {
      setEditingPos(null);
      setPosForm({ title: "", department_id: "", level: "", description: "", reports_to_position_id: "" });
    }
    setPosDialog(true);
  };

  const savePos = async () => {
    if (!posForm.title.trim()) return;
    try {
      if (editingPos) {
        await axios.put(`${API}/api/people-ops/positions/${editingPos.position_id}`, posForm, { withCredentials: true });
        toast.success(isEs ? "Posicion actualizada" : "Position updated");
      } else {
        await axios.post(`${API}/api/people-ops/positions`, posForm, { withCredentials: true });
        toast.success(isEs ? "Posicion creada" : "Position created");
      }
      setPosDialog(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const deletePos = async (pos) => {
    if (!confirm(isEs ? `Eliminar posicion "${pos.title}"?` : `Delete position "${pos.title}"?`)) return;
    try {
      await axios.delete(`${API}/api/people-ops/positions/${pos.position_id}`, { withCredentials: true });
      toast.success(isEs ? "Posicion eliminada" : "Position deleted");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const toggleNode = (id) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="org-chart-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            {isEs ? "Estructura Organizacional" : "Organization Structure"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {departments.length} {isEs ? "departamentos" : "departments"} &middot; {positions.length} {isEs ? "posiciones" : "positions"} &middot; {employees.length} {isEs ? "empleados" : "employees"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{departments.filter(d => d.is_active).length}</div>
              <div className="text-xs text-muted-foreground">{isEs ? "Departamentos" : "Departments"}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{positions.length}</div>
              <div className="text-xs text-muted-foreground">{isEs ? "Posiciones" : "Positions"}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{employees.length}</div>
              <div className="text-xs text-muted-foreground">{isEs ? "Empleados" : "Employees"}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="departments" className="gap-1" data-testid="tab-departments">
            <Building2 className="w-3.5 h-3.5" /> {isEs ? "Departamentos" : "Departments"}
          </TabsTrigger>
          <TabsTrigger value="positions" className="gap-1" data-testid="tab-positions">
            <Briefcase className="w-3.5 h-3.5" /> {isEs ? "Posiciones" : "Positions"}
          </TabsTrigger>
          <TabsTrigger value="chart" className="gap-1" data-testid="tab-chart">
            <Layers className="w-3.5 h-3.5" /> {isEs ? "Organigrama" : "Org Chart"}
          </TabsTrigger>
        </TabsList>

        {/* Departments Tab */}
        <TabsContent value="departments" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => openDeptDialog()} data-testid="add-department-btn">
              <Plus className="w-4 h-4 mr-1" /> {isEs ? "Nuevo Departamento" : "New Department"}
            </Button>
          </div>

          {departments.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-muted-foreground">{isEs ? "No hay departamentos creados" : "No departments created"}</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => openDeptDialog()} data-testid="empty-add-dept-btn">
                  <Plus className="w-4 h-4 mr-1" /> {isEs ? "Crear primer departamento" : "Create first department"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="departments-list">
              {departments.filter(d => d.is_active !== false).map(dept => {
                const deptPositions = positions.filter(p => p.department_id === dept.department_id);
                const deptEmployees = employees.filter(e => e.department_id === dept.department_id);
                const parentDept = departments.find(d => d.department_id === dept.parent_department_id);

                return (
                  <Card key={dept.department_id} data-testid={`dept-card-${dept.department_id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{dept.name}</h4>
                            {dept.code && <Badge variant="outline" className="text-[10px]">{dept.code}</Badge>}
                          </div>
                          {dept.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{dept.description}</p>}
                          {parentDept && (
                            <p className="text-xs text-blue-600 mt-1">{isEs ? "Reporta a" : "Reports to"}: {parentDept.name}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{deptEmployees.length} {isEs ? "empleados" : "employees"}</span>
                            <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{deptPositions.length} {isEs ? "posiciones" : "positions"}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openDeptDialog(dept)} data-testid={`edit-dept-${dept.department_id}`}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => deleteDept(dept)} data-testid={`delete-dept-${dept.department_id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Positions Tab */}
        <TabsContent value="positions" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => openPosDialog()} data-testid="add-position-btn">
              <Plus className="w-4 h-4 mr-1" /> {isEs ? "Nueva Posicion" : "New Position"}
            </Button>
          </div>

          {positions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Briefcase className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-muted-foreground">{isEs ? "No hay posiciones definidas" : "No positions defined"}</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => openPosDialog()} data-testid="empty-add-pos-btn">
                  <Plus className="w-4 h-4 mr-1" /> {isEs ? "Crear primera posicion" : "Create first position"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2" data-testid="positions-list">
              {departments.filter(d => d.is_active !== false).map(dept => {
                const deptPositions = positions.filter(p => p.department_id === dept.department_id);
                if (deptPositions.length === 0) return null;
                return (
                  <div key={dept.department_id}>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5" /> {dept.name}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                      {deptPositions.map(pos => {
                        const lvl = POSITION_LEVELS.find(l => l.value === pos.level);
                        return (
                          <Card key={pos.position_id} data-testid={`pos-card-${pos.position_id}`}>
                            <CardContent className="p-3 flex items-center justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{pos.title}</span>
                                  {lvl && <Badge variant="outline" className="text-[10px]">{isEs ? lvl.label : lvl.labelEn}</Badge>}
                                </div>
                                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                  <span><Users className="w-3 h-3 inline mr-0.5" />{pos.employee_count || 0}</span>
                                  {pos.description && <span className="truncate max-w-[150px]">{pos.description}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openPosDialog(pos)} data-testid={`edit-pos-${pos.position_id}`}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => deletePos(pos)} data-testid={`delete-pos-${pos.position_id}`}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {/* Unassigned positions */}
              {positions.filter(p => !p.department_id).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    {isEs ? "Sin departamento" : "Unassigned"}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {positions.filter(p => !p.department_id).map(pos => {
                      const lvl = POSITION_LEVELS.find(l => l.value === pos.level);
                      return (
                        <Card key={pos.position_id}>
                          <CardContent className="p-3 flex items-center justify-between">
                            <div>
                              <span className="font-medium text-sm">{pos.title}</span>
                              {lvl && <Badge variant="outline" className="text-[10px] ml-2">{isEs ? lvl.label : lvl.labelEn}</Badge>}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openPosDialog(pos)}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => deletePos(pos)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Org Chart Tab */}
        <TabsContent value="chart" className="space-y-4">
          {departments.filter(d => d.is_active !== false).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Layers className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-muted-foreground">{isEs ? "Crea departamentos y posiciones primero" : "Create departments and positions first"}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {departments.filter(d => d.is_active !== false).map(dept => {
                const deptEmployees = employees.filter(e => e.department_id === dept.department_id);
                const deptPositions = positions.filter(p => p.department_id === dept.department_id);
                const isExpanded = expandedNodes.has(dept.department_id);

                return (
                  <Card key={dept.department_id} className="overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-3 cursor-pointer" onClick={() => toggleNode(dept.department_id)}>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        {dept.name}
                        {dept.code && <span className="text-xs text-muted-foreground">({dept.code})</span>}
                        {isExpanded ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronRight className="w-4 h-4 ml-auto" />}
                      </CardTitle>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{deptEmployees.length} {isEs ? "empleados" : "employees"}</span>
                        <span>{deptPositions.length} {isEs ? "posiciones" : "positions"}</span>
                      </div>
                    </CardHeader>
                    {isExpanded && (
                      <CardContent className="p-3">
                        {deptPositions.length > 0 && (
                          <div className="mb-3">
                            <p className="text-xs font-medium text-muted-foreground mb-1">{isEs ? "Posiciones" : "Positions"}</p>
                            <div className="space-y-1">
                              {deptPositions.map(pos => {
                                const lvl = POSITION_LEVELS.find(l => l.value === pos.level);
                                return (
                                  <div key={pos.position_id} className="flex items-center gap-2 text-sm py-1 px-2 bg-violet-50 rounded">
                                    <Briefcase className="w-3 h-3 text-violet-500" />
                                    <span>{pos.title}</span>
                                    {lvl && <Badge variant="outline" className="text-[9px]">{isEs ? lvl.label : lvl.labelEn}</Badge>}
                                    <span className="text-xs text-muted-foreground ml-auto">{pos.employee_count || 0}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {deptEmployees.length > 0 ? (
                          <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {deptEmployees.map(emp => (
                              <div key={emp.employee_id} className="flex items-center gap-2 py-1">
                                <Avatar className="w-6 h-6">
                                  <AvatarImage src={emp.profile_photo} />
                                  <AvatarFallback className="text-xs">{emp.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm truncate">{emp.full_name}</div>
                                  <div className="text-xs text-muted-foreground truncate">{emp.job_title}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-3">{isEs ? "Sin empleados" : "No employees"}</p>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Department Dialog */}
      <Dialog open={deptDialog} onOpenChange={setDeptDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDept ? (isEs ? "Editar Departamento" : "Edit Department") : (isEs ? "Nuevo Departamento" : "New Department")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Nombre" : "Name"}</Label>
                <Input value={deptForm.name} onChange={e => setDeptForm({ ...deptForm, name: e.target.value })} placeholder={isEs ? "Ej: Operaciones" : "E.g.: Operations"} data-testid="dept-name-input" />
              </div>
              <div>
                <Label>{isEs ? "Codigo" : "Code"}</Label>
                <Input value={deptForm.code} onChange={e => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })} placeholder="OPS" maxLength={5} data-testid="dept-code-input" />
              </div>
            </div>
            <div>
              <Label>{isEs ? "Descripcion" : "Description"}</Label>
              <Textarea value={deptForm.description} onChange={e => setDeptForm({ ...deptForm, description: e.target.value })} rows={2} data-testid="dept-desc-input" />
            </div>
            {departments.length > 0 && (
              <div>
                <Label>{isEs ? "Departamento padre" : "Parent Department"}</Label>
                <Select value={deptForm.parent_department_id || "none"} onValueChange={v => setDeptForm({ ...deptForm, parent_department_id: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="dept-parent-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Ninguno (raiz)" : "None (root)"}</SelectItem>
                    {departments.filter(d => d.department_id !== editingDept?.department_id && d.is_active !== false).map(d => (
                      <SelectItem key={d.department_id} value={d.department_id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeptDialog(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={saveDept} disabled={!deptForm.name.trim()} data-testid="save-dept-btn">{editingDept ? (isEs ? "Guardar" : "Save") : (isEs ? "Crear" : "Create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Position Dialog */}
      <Dialog open={posDialog} onOpenChange={setPosDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPos ? (isEs ? "Editar Posicion" : "Edit Position") : (isEs ? "Nueva Posicion" : "New Position")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Titulo" : "Title"}</Label>
              <Input value={posForm.title} onChange={e => setPosForm({ ...posForm, title: e.target.value })} placeholder={isEs ? "Ej: Gerente de Operaciones" : "E.g.: Operations Manager"} data-testid="pos-title-input" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Departamento" : "Department"}</Label>
                <Select value={posForm.department_id || "none"} onValueChange={v => setPosForm({ ...posForm, department_id: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="pos-dept-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin asignar" : "Unassigned"}</SelectItem>
                    {departments.filter(d => d.is_active !== false).map(d => (
                      <SelectItem key={d.department_id} value={d.department_id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isEs ? "Nivel" : "Level"}</Label>
                <Select value={posForm.level || "none"} onValueChange={v => setPosForm({ ...posForm, level: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="pos-level-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin definir" : "Not defined"}</SelectItem>
                    {POSITION_LEVELS.map(l => (
                      <SelectItem key={l.value} value={l.value}>{isEs ? l.label : l.labelEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{isEs ? "Descripcion" : "Description"}</Label>
              <Textarea value={posForm.description} onChange={e => setPosForm({ ...posForm, description: e.target.value })} rows={2} data-testid="pos-desc-input" />
            </div>
            {positions.length > 0 && (
              <div>
                <Label>{isEs ? "Reporta a (posicion)" : "Reports to (position)"}</Label>
                <Select value={posForm.reports_to_position_id || "none"} onValueChange={v => setPosForm({ ...posForm, reports_to_position_id: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="pos-reports-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Ninguna" : "None"}</SelectItem>
                    {positions.filter(p => p.position_id !== editingPos?.position_id).map(p => (
                      <SelectItem key={p.position_id} value={p.position_id}>{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPosDialog(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={savePos} disabled={!posForm.title.trim()} data-testid="save-pos-btn">{editingPos ? (isEs ? "Guardar" : "Save") : (isEs ? "Crear" : "Create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
