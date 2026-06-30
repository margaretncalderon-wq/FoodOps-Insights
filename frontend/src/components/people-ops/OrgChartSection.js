import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Users, Building2, ChevronDown, ChevronRight, RefreshCw, User,
  Plus, Pencil, Trash2, Briefcase, Layers, UserPlus, AlertCircle,
  Link2, Eye
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

const LEVEL_COLORS = {
  executive: "border-red-300 bg-red-50",
  director: "border-orange-300 bg-orange-50",
  manager: "border-amber-300 bg-amber-50",
  lead: "border-blue-300 bg-blue-50",
  senior: "border-indigo-300 bg-indigo-50",
  mid: "border-slate-300 bg-slate-50",
  junior: "border-gray-300 bg-gray-50",
  intern: "border-gray-200 bg-gray-50/50",
};

export function OrgChartSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [orgData, setOrgData] = useState({ departments: [], positions: [], employees: [], vacancies: [], unassigned_employees: [] });
  const [activeTab, setActiveTab] = useState("visual");
  const [expandedDepts, setExpandedDepts] = useState({});

  // Department dialog
  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [deptForm, setDeptForm] = useState({ name: "", code: "", description: "" });

  // Position dialog
  const [posDialogOpen, setPosDialogOpen] = useState(false);
  const [editingPos, setEditingPos] = useState(null);
  const [posForm, setPosForm] = useState({ title: "", department_id: "", level: "", description: "", reports_to_position_id: "" });

  // Assign employee dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignPosition, setAssignPosition] = useState(null);
  const [assignEmployeeId, setAssignEmployeeId] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/people-ops/org-chart`, { withCredentials: true });
      setOrgData(res.data);
      // Expand all departments by default
      const exp = {};
      (res.data.departments || []).forEach(d => { exp[d.department_id] = true; });
      setExpandedDepts(prev => ({ ...exp, ...prev }));
    } catch (err) {
      console.error("Error fetching org chart:", err);
      toast.error(isEs ? "Error cargando organigrama" : "Error loading org chart");
    }
    setLoading(false);
  }, [isEs]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleDept = (deptId) => {
    setExpandedDepts(prev => ({ ...prev, [deptId]: !prev[deptId] }));
  };

  // Department CRUD
  const openDeptDialog = (dept = null) => {
    if (dept) {
      setEditingDept(dept);
      setDeptForm({ name: dept.name || "", code: dept.code || "", description: dept.description || "" });
    } else {
      setEditingDept(null);
      setDeptForm({ name: "", code: "", description: "" });
    }
    setDeptDialogOpen(true);
  };

  const handleSaveDept = async () => {
    try {
      if (editingDept) {
        await axios.put(`${API}/api/people-ops/departments/${editingDept.department_id}`, deptForm, { withCredentials: true });
        toast.success(isEs ? "Departamento actualizado" : "Department updated");
      } else {
        await axios.post(`${API}/api/people-ops/departments`, deptForm, { withCredentials: true });
        toast.success(isEs ? "Departamento creado" : "Department created");
      }
      setDeptDialogOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleDeleteDept = async (dept) => {
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
  const openPosDialog = (pos = null, deptId = null) => {
    if (pos) {
      setEditingPos(pos);
      setPosForm({ title: pos.title || "", department_id: pos.department_id || "", level: pos.level || "", description: pos.description || "", reports_to_position_id: pos.reports_to_position_id || "" });
    } else {
      setEditingPos(null);
      setPosForm({ title: "", department_id: deptId || "", level: "", description: "", reports_to_position_id: "" });
    }
    setPosDialogOpen(true);
  };

  const handleSavePos = async () => {
    try {
      if (editingPos) {
        await axios.put(`${API}/api/people-ops/positions/${editingPos.position_id}`, posForm, { withCredentials: true });
        toast.success(isEs ? "Posicion actualizada" : "Position updated");
      } else {
        await axios.post(`${API}/api/people-ops/positions`, posForm, { withCredentials: true });
        toast.success(isEs ? "Posicion creada" : "Position created");
      }
      setPosDialogOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleDeletePos = async (pos) => {
    if (!confirm(isEs ? `Eliminar posicion "${pos.title}"?` : `Delete position "${pos.title}"?`)) return;
    try {
      await axios.delete(`${API}/api/people-ops/positions/${pos.position_id}`, { withCredentials: true });
      toast.success(isEs ? "Posicion eliminada" : "Position deleted");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  // Assign employee to position
  const openAssignDialog = (pos) => {
    setAssignPosition(pos);
    setAssignEmployeeId("");
    setAssignDialogOpen(true);
  };

  const handleAssignEmployee = async () => {
    if (!assignEmployeeId || !assignPosition) return;
    try {
      await axios.patch(
        `${API}/api/people-ops/employees/${assignEmployeeId}/assign-position`,
        { position_id: assignPosition.position_id },
        { withCredentials: true }
      );
      toast.success(isEs ? "Empleado asignado" : "Employee assigned");
      setAssignDialogOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const { departments, positions, unassigned_employees } = orgData;
  const totalPositions = positions.length;
  const filledPositions = positions.filter(p => p.employees?.length > 0).length;
  const vacantPositions = totalPositions - filledPositions;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6" data-testid="org-chart-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {departments.length} {isEs ? "departamentos" : "departments"} &middot; {totalPositions} {isEs ? "posiciones" : "positions"} &middot; {orgData.employees.length} {isEs ? "empleados" : "employees"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}><RefreshCw className="w-4 h-4" /></Button>
          <Button size="sm" onClick={() => openDeptDialog()} data-testid="add-dept-btn">
            <Plus className="w-4 h-4 mr-1" /> {isEs ? "Departamento" : "Department"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => openPosDialog()} data-testid="add-position-btn">
            <Plus className="w-4 h-4 mr-1" /> {isEs ? "Posicion" : "Position"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-3 pb-3">
          <div className="flex items-center gap-2 mb-1"><Building2 className="w-4 h-4 text-blue-500" /><span className="text-xs text-muted-foreground">{isEs ? "Departamentos" : "Departments"}</span></div>
          <div className="text-xl font-bold">{departments.length}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-3 pb-3">
          <div className="flex items-center gap-2 mb-1"><Briefcase className="w-4 h-4 text-indigo-500" /><span className="text-xs text-muted-foreground">{isEs ? "Posiciones" : "Positions"}</span></div>
          <div className="text-xl font-bold">{totalPositions}</div>
        </CardContent></Card>
        <Card className="border-green-200 bg-green-50/30"><CardContent className="pt-3 pb-3">
          <div className="flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-green-600" /><span className="text-xs text-green-700">{isEs ? "Ocupadas" : "Filled"}</span></div>
          <div className="text-xl font-bold text-green-700">{filledPositions}</div>
        </CardContent></Card>
        <Card className={vacantPositions > 0 ? "border-amber-200 bg-amber-50/30" : ""}><CardContent className="pt-3 pb-3">
          <div className="flex items-center gap-2 mb-1"><AlertCircle className="w-4 h-4 text-amber-500" /><span className="text-xs text-amber-700">{isEs ? "Vacantes" : "Vacant"}</span></div>
          <div className="text-xl font-bold text-amber-700">{vacantPositions}</div>
        </CardContent></Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="visual" className="gap-1"><Layers className="w-3.5 h-3.5" /> {isEs ? "Organigrama" : "Org Chart"}</TabsTrigger>
          <TabsTrigger value="departments" className="gap-1"><Building2 className="w-3.5 h-3.5" /> {isEs ? "Departamentos" : "Departments"}</TabsTrigger>
          <TabsTrigger value="positions" className="gap-1"><Briefcase className="w-3.5 h-3.5" /> {isEs ? "Posiciones" : "Positions"}</TabsTrigger>
        </TabsList>

        {/* === VISUAL ORG CHART === */}
        <TabsContent value="visual" className="space-y-4">
          {departments.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{isEs ? "No hay departamentos" : "No departments"}</p>
              <Button className="mt-3" size="sm" onClick={() => openDeptDialog()}>
                <Plus className="w-4 h-4 mr-1" /> {isEs ? "Crear Departamento" : "Create Department"}
              </Button>
            </CardContent></Card>
          ) : (
            <div className="space-y-4">
              {departments.map(dept => {
                const deptPositions = positions.filter(p => p.department_id === dept.department_id);
                // Use backend-enriched employee list (employees with department_id OR via position)
                const deptAllEmployees = dept.employees || [];
                const deptEmployeeCount = deptAllEmployees.length;
                // Employees in this dept that AREN'T attached to a position (so we can show them as "directos")
                const positionedIds = new Set(deptPositions.flatMap(p => (p.employees || []).map(e => e.employee_id)));
                const unassignedInDept = deptAllEmployees.filter(e => !positionedIds.has(e.employee_id));
                const deptVacantCount = deptPositions.filter(p => p.is_vacant).length;
                const isExpanded = expandedDepts[dept.department_id] !== false;

                return (
                  <Card key={dept.department_id} className="overflow-hidden" data-testid={`dept-card-${dept.department_id}`}>
                    {/* Department Header */}
                    <div
                      className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors border-b"
                      onClick={() => toggleDept(dept.department_id)}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100 text-blue-700`}>
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{dept.name}</h3>
                          {dept.code && <Badge variant="outline" className="text-[10px]">{dept.code}</Badge>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{deptPositions.length} {isEs ? "posiciones" : "positions"}</span>
                          <span>{deptEmployeeCount} {isEs ? "empleados" : "employees"}</span>
                          {deptVacantCount > 0 && (
                            <span className="text-amber-600 font-medium">{deptVacantCount} {isEs ? "vacantes" : "vacant"}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); openPosDialog(null, dept.department_id); }} title={isEs ? "Agregar posicion" : "Add position"}>
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); openDeptDialog(dept); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={e => { e.stopPropagation(); handleDeleteDept(dept); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </div>

                    {/* Positions Grid */}
                    {isExpanded && (
                      <CardContent className="p-4 space-y-4">
                        {/* Direct employees (no position assigned but belong to this dept) */}
                        {unassignedInDept.length > 0 && (
                          <div className="border rounded-lg p-3 bg-slate-50/60">
                            <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5" />
                              {isEs ? `Empleados directos (${unassignedInDept.length})` : `Direct employees (${unassignedInDept.length})`}
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {unassignedInDept.map(emp => (
                                <div
                                  key={emp.employee_id}
                                  className="flex items-center gap-2 p-2 rounded-md bg-white border cursor-pointer hover:border-violet-300 transition-colors"
                                  onClick={() => navigate(`/people-ops/employee/${emp.employee_id}`)}
                                  data-testid={`emp-direct-${emp.employee_id}`}
                                >
                                  <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[10px] font-medium text-violet-700">
                                      {emp.first_name?.[0]}{emp.last_name?.[0]}
                                    </span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium truncate">{emp.full_name}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">{emp.job_title || emp.email}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {deptPositions.length === 0 ? (
                          unassignedInDept.length === 0 && (
                            <div className="text-center py-6 text-muted-foreground text-sm">
                              <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30" />
                              <p>{isEs ? "Sin posiciones definidas" : "No positions defined"}</p>
                              <Button variant="link" size="sm" className="mt-1" onClick={() => openPosDialog(null, dept.department_id)}>
                                <Plus className="w-3 h-3 mr-1" /> {isEs ? "Agregar" : "Add"}
                              </Button>
                            </div>
                          )
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {deptPositions.map(pos => {
                              const levelColor = LEVEL_COLORS[pos.level] || "border-gray-200 bg-gray-50";
                              const hasEmployees = pos.employees && pos.employees.length > 0;
                              const reportsTo = positions.find(p => p.position_id === pos.reports_to_position_id);

                              return (
                                <div
                                  key={pos.position_id}
                                  className={`rounded-lg border-2 p-3 transition-all ${levelColor} ${!hasEmployees ? 'border-dashed' : ''}`}
                                  data-testid={`position-card-${pos.position_id}`}
                                >
                                  {/* Position Header */}
                                  <div className="flex items-start justify-between mb-2">
                                    <div>
                                      <h4 className="font-medium text-sm">{pos.title}</h4>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        {pos.level && (
                                          <Badge variant="outline" className="text-[10px] py-0">
                                            {POSITION_LEVELS.find(l => l.value === pos.level)?.[isEs ? 'label' : 'labelEn'] || pos.level}
                                          </Badge>
                                        )}
                                        {reportsTo && (
                                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                            <Link2 className="w-2.5 h-2.5" /> {reportsTo.title}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-0.5">
                                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openPosDialog(pos)}>
                                        <Pencil className="w-3 h-3" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => handleDeletePos(pos)}>
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Employees in this position */}
                                  {hasEmployees ? (
                                    <div className="space-y-1.5">
                                      {pos.employees.map(emp => (
                                        <div
                                          key={emp.employee_id}
                                          className="flex items-center gap-2 p-1.5 rounded-md bg-white/70 border cursor-pointer hover:bg-white transition-colors"
                                          onClick={() => navigate(`/people-ops/employee/${emp.employee_id}`)}
                                          data-testid={`emp-in-pos-${emp.employee_id}`}
                                        >
                                          <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                                            <span className="text-[10px] font-medium text-violet-700">
                                              {emp.first_name?.[0]}{emp.last_name?.[0]}
                                            </span>
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium truncate">{emp.full_name}</p>
                                            <p className="text-[10px] text-muted-foreground truncate">{emp.email}</p>
                                          </div>
                                          <Badge variant="outline" className="text-[10px] py-0 flex-shrink-0">
                                            {emp.status === "active" ? (isEs ? "Activo" : "Active") : emp.status}
                                          </Badge>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    /* Vacant Position */
                                    <div className="text-center py-2">
                                      <div className="inline-flex items-center gap-1.5 text-amber-600 text-xs font-medium mb-2">
                                        <AlertCircle className="w-3.5 h-3.5" />
                                        {isEs ? "Posicion vacante" : "Vacant position"}
                                      </div>
                                      {pos.has_open_vacancy && (
                                        <p className="text-[10px] text-blue-600 mb-1">{isEs ? "Vacante abierta en reclutamiento" : "Open in recruitment"}</p>
                                      )}
                                      <div className="flex items-center justify-center gap-1">
                                        <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" onClick={() => openAssignDialog(pos)} data-testid={`assign-to-${pos.position_id}`}>
                                          <UserPlus className="w-3 h-3 mr-1" />
                                          {isEs ? "Asignar" : "Assign"}
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}

              {/* Unassigned Employees */}
              {unassigned_employees.length > 0 && (
                <Card className="border-amber-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                      {isEs ? `Empleados sin posicion asignada (${unassigned_employees.length})` : `Unassigned employees (${unassigned_employees.length})`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {unassigned_employees.map(emp => (
                        <div
                          key={emp.employee_id}
                          className="flex items-center gap-2 p-2 rounded-md border border-dashed border-amber-300 bg-amber-50/50 cursor-pointer hover:bg-amber-50 transition-colors"
                          onClick={() => navigate(`/people-ops/employee/${emp.employee_id}`)}
                        >
                          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-medium text-amber-700">{emp.first_name?.[0]}{emp.last_name?.[0]}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{emp.full_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{emp.job_title || emp.department || emp.email}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* === DEPARTMENTS TAB === */}
        <TabsContent value="departments" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => openDeptDialog()}>
              <Plus className="w-4 h-4 mr-1" /> {isEs ? "Nuevo Departamento" : "New Department"}
            </Button>
          </div>
          {departments.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>{isEs ? "No hay departamentos" : "No departments"}</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {departments.map(dept => {
                const deptPositions = positions.filter(p => p.department_id === dept.department_id);
                const deptEmpCount = deptPositions.reduce((s, p) => s + (p.employees?.length || 0), 0);
                return (
                  <Card key={dept.department_id} className="hover:border-primary/30 transition-colors">
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center"><Building2 className="w-5 h-5 text-blue-700" /></div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2"><h4 className="font-medium">{dept.name}</h4>{dept.code && <Badge variant="outline" className="text-[10px]">{dept.code}</Badge>}</div>
                        <p className="text-xs text-muted-foreground mt-0.5">{dept.description || ""}</p>
                        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{deptPositions.length} {isEs ? "posiciones" : "positions"}</span>
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{deptEmpCount} {isEs ? "empleados" : "employees"}</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDeptDialog(dept)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDeleteDept(dept)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* === POSITIONS TAB === */}
        <TabsContent value="positions" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => openPosDialog()} data-testid="add-position-btn-tab">
              <Plus className="w-4 h-4 mr-1" /> {isEs ? "Nueva Posicion" : "New Position"}
            </Button>
          </div>
          {positions.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>{isEs ? "No hay posiciones" : "No positions"}</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {departments.map(dept => {
                const deptPositions = positions.filter(p => p.department_id === dept.department_id);
                if (deptPositions.length === 0) return null;
                return (
                  <div key={dept.department_id}>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" /> {dept.name}
                    </h4>
                    <div className="space-y-1.5 ml-4 mb-4">
                      {deptPositions.map(pos => (
                        <Card key={pos.position_id} className={`${pos.is_vacant ? 'border-dashed border-amber-300' : ''}`}>
                          <CardContent className="flex items-center gap-3 p-3">
                            <Briefcase className={`w-4 h-4 ${pos.is_vacant ? 'text-amber-500' : 'text-indigo-500'}`} />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{pos.title}</span>
                                {pos.level && <Badge variant="outline" className="text-[10px] py-0">{pos.level}</Badge>}
                              </div>
                              {pos.employees?.length > 0 && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {pos.employees.map(e => e.full_name).join(", ")}
                                </p>
                              )}
                              {pos.is_vacant && <p className="text-xs text-amber-600 mt-0.5">{isEs ? "Vacante" : "Vacant"}</p>}
                            </div>
                            <div className="flex gap-1">
                              {pos.is_vacant && (
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openAssignDialog(pos)}>
                                  <UserPlus className="w-3 h-3 mr-1" /> {isEs ? "Asignar" : "Assign"}
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPosDialog(pos)}><Pencil className="w-3 h-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDeletePos(pos)}><Trash2 className="w-3 h-3" /></Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Department Dialog */}
      <Dialog open={deptDialogOpen} onOpenChange={setDeptDialogOpen}>
        <DialogContent data-testid="dept-dialog">
          <DialogHeader><DialogTitle>{editingDept ? (isEs ? "Editar Departamento" : "Edit Department") : (isEs ? "Nuevo Departamento" : "New Department")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{isEs ? "Nombre" : "Name"}</Label><Input value={deptForm.name} onChange={e => setDeptForm({ ...deptForm, name: e.target.value })} data-testid="dept-name-input" /></div>
            <div><Label>{isEs ? "Codigo" : "Code"}</Label><Input value={deptForm.code} onChange={e => setDeptForm({ ...deptForm, code: e.target.value })} placeholder="e.g. MKT, DEV, HR" /></div>
            <div><Label>{isEs ? "Descripcion" : "Description"}</Label><Textarea value={deptForm.description} onChange={e => setDeptForm({ ...deptForm, description: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeptDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleSaveDept} disabled={!deptForm.name} data-testid="save-dept-btn">{editingDept ? (isEs ? "Actualizar" : "Update") : (isEs ? "Crear" : "Create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Position Dialog */}
      <Dialog open={posDialogOpen} onOpenChange={setPosDialogOpen}>
        <DialogContent data-testid="pos-dialog">
          <DialogHeader><DialogTitle>{editingPos ? (isEs ? "Editar Posicion" : "Edit Position") : (isEs ? "Nueva Posicion" : "New Position")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{isEs ? "Titulo" : "Title"}</Label><Input value={posForm.title} onChange={e => setPosForm({ ...posForm, title: e.target.value })} data-testid="pos-title-input" /></div>
            <div>
              <Label>{isEs ? "Departamento" : "Department"}</Label>
              <Select value={posForm.department_id || "none"} onValueChange={v => setPosForm({ ...posForm, department_id: v === "none" ? "" : v })}>
                <SelectTrigger data-testid="pos-dept-select"><SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Seleccionar..." : "Select..."}</SelectItem>
                  {departments.map(d => <SelectItem key={d.department_id} value={d.department_id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isEs ? "Nivel" : "Level"}</Label>
              <Select value={posForm.level || "none"} onValueChange={v => setPosForm({ ...posForm, level: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Seleccionar..." : "Select..."}</SelectItem>
                  {POSITION_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{isEs ? l.label : l.labelEn}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isEs ? "Reporta a" : "Reports To"}</Label>
              <Select value={posForm.reports_to_position_id || "none"} onValueChange={v => setPosForm({ ...posForm, reports_to_position_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Ninguno" : "None"}</SelectItem>
                  {positions.filter(p => p.position_id !== editingPos?.position_id).map(p => <SelectItem key={p.position_id} value={p.position_id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>{isEs ? "Descripcion" : "Description"}</Label><Textarea value={posForm.description} onChange={e => setPosForm({ ...posForm, description: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPosDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleSavePos} disabled={!posForm.title} data-testid="save-pos-btn">{editingPos ? (isEs ? "Actualizar" : "Update") : (isEs ? "Crear" : "Create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Employee Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent data-testid="assign-dialog">
          <DialogHeader>
            <DialogTitle>{isEs ? "Asignar Empleado a Posicion" : "Assign Employee to Position"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {assignPosition && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm font-medium">{assignPosition.title}</p>
                <p className="text-xs text-muted-foreground">{departments.find(d => d.department_id === assignPosition.department_id)?.name || ""}</p>
              </div>
            )}
            <div>
              <Label>{isEs ? "Empleado" : "Employee"}</Label>
              <Select value={assignEmployeeId || "none"} onValueChange={v => setAssignEmployeeId(v === "none" ? "" : v)}>
                <SelectTrigger data-testid="assign-employee-select"><SelectValue placeholder={isEs ? "Seleccionar empleado..." : "Select employee..."} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Seleccionar..." : "Select..."}</SelectItem>
                  {/* Show unassigned employees first, then all */}
                  {unassigned_employees.length > 0 && (
                    <>
                      {unassigned_employees.map(emp => (
                        <SelectItem key={emp.employee_id} value={emp.employee_id}>
                          {emp.full_name} ({isEs ? "sin posicion" : "unassigned"})
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {orgData.employees.filter(e => !unassigned_employees.find(u => u.employee_id === e.employee_id)).map(emp => (
                    <SelectItem key={emp.employee_id} value={emp.employee_id}>
                      {emp.full_name} — {emp.job_title || ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleAssignEmployee} disabled={!assignEmployeeId} data-testid="confirm-assign-btn">
              <UserPlus className="w-4 h-4 mr-1" />
              {isEs ? "Asignar" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
