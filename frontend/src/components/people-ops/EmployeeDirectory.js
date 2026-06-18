import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { formatDateOnly } from "../../utils/dates";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  Users, UserPlus, Search, Filter, Mail, Phone, Building2,
  Briefcase, Calendar, RefreshCw, MoreHorizontal, ChevronRight
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const CONTRACT_TYPES = {
  full_time: { label: "Full Time", labelEs: "Tiempo Completo", color: "bg-emerald-100 text-emerald-700" },
  part_time: { label: "Part Time", labelEs: "Medio Tiempo", color: "bg-blue-100 text-blue-700" },
  contract: { label: "Contract", labelEs: "Contrato", color: "bg-amber-100 text-amber-700" },
  freelance: { label: "Freelance", labelEs: "Freelance", color: "bg-purple-100 text-purple-700" },
  intern: { label: "Intern", labelEs: "Pasante", color: "bg-gray-100 text-gray-700" }
};

const STATUS_COLORS = {
  active: "bg-emerald-100 text-emerald-700",
  on_leave: "bg-amber-100 text-amber-700",
  suspended: "bg-red-100 text-red-700",
  terminated: "bg-gray-100 text-gray-700"
};

export function EmployeeDirectory() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const navigate = useNavigate();
  
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [departments, setDepartments] = useState([]);
  const [orgDepartments, setOrgDepartments] = useState([]); // From Org Structure
  const [jobPostings, setJobPostings] = useState([]); // Job roles catalog
  const [managers, setManagers] = useState([]); // Employees who are managers
  const [costCenters, setCostCenters] = useState([]);
  const [stats, setStats] = useState(null);
  
  // New Employee Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    job_title: "",
    job_role_id: "",
    department: "",
    department_id: "",
    cost_center_id: "",
    manager_id: "",
    is_manager: false,
    hire_date: new Date().toISOString().split("T")[0],
    contract_type: "full_time",
    base_salary: 0,
    payment_frequency: "biweekly"
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, deptRes, orgDeptRes, ccRes, statsRes, posRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/employees?status=${statusFilter}${departmentFilter ? `&department=${departmentFilter}` : ''}`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/reference/departments`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/departments`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/cost-centers`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/employees/stats/summary`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/positions`, { withCredentials: true }).catch(() => ({ data: [] }))
      ]);
      setEmployees(empRes.data);
      setDepartments(deptRes.data);
      setOrgDepartments(orgDeptRes.data || []);
      setCostCenters(ccRes.data);
      setStats(statsRes.data);
      setJobPostings(posRes.data || []);
      
      // Filter managers from employees
      const mgrs = empRes.data.filter(e => e.is_manager && e.status === "active");
      setManagers(mgrs);
    } catch (err) {
      console.error("Error fetching employees:", err);
    }
    setLoading(false);
  }, [statusFilter, departmentFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredEmployees = employees.filter(emp => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      emp.full_name?.toLowerCase().includes(search) ||
      emp.email?.toLowerCase().includes(search) ||
      emp.job_title?.toLowerCase().includes(search) ||
      emp.department?.toLowerCase().includes(search)
    );
  });

  const handleCreateEmployee = async () => {
    if (!formData.first_name || !formData.last_name || !formData.email) {
      alert(isEs ? "Completa los campos requeridos" : "Complete required fields");
      return;
    }
    
    // Get job title from position if selected
    let jobTitle = formData.job_title;
    if (formData.job_role_id && !jobTitle) {
      const pos = jobPostings.find(j => j.position_id === formData.job_role_id);
      jobTitle = pos?.title || "";
    }
    
    // Get department name if selected
    let deptName = formData.department;
    if (formData.department_id && !deptName) {
      const dept = orgDepartments.find(d => d.department_id === formData.department_id);
      deptName = dept?.name || "";
    }
    
    const payload = {
      ...formData,
      job_title: jobTitle,
      department: deptName,
      position_id: formData.job_role_id || undefined
    };
    
    setSaving(true);
    try {
      const res = await axios.post(
        `${API}/api/people-ops/employees`,
        payload,
        { withCredentials: true }
      );
      setDialogOpen(false);
      setFormData({
        first_name: "", last_name: "", email: "", phone: "",
        job_title: "", job_role_id: "", department: "", department_id: "",
        cost_center_id: "", manager_id: "", is_manager: false,
        hire_date: new Date().toISOString().split("T")[0],
        contract_type: "full_time", base_salary: 0, payment_frequency: "biweekly"
      });
      // Navigate to new employee profile
      navigate(`/people-ops/employee/${res.data.employee_id}`);
    } catch (err) {
      console.error("Error creating employee:", err);
      alert(err.response?.data?.detail || "Error creating employee");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Users className="w-4 h-4" />
                {isEs ? "Total Empleados" : "Total Employees"}
              </div>
              <p className="text-2xl font-bold mt-1">{stats.total_employees || 0}</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-emerald-50/30">
            <CardContent className="pt-4">
              <div className="text-sm text-emerald-600">{isEs ? "Activos" : "Active"}</div>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{stats.active || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">{isEs ? "En Licencia" : "On Leave"}</div>
              <p className="text-2xl font-bold mt-1">{stats.on_leave || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">{isEs ? "Departamentos" : "Departments"}</div>
              <p className="text-2xl font-bold mt-1">{stats.by_department?.length || 0}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters & Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-1 gap-3 items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={isEs ? "Buscar empleados..." : "Search employees..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{isEs ? "Activos" : "Active"}</SelectItem>
              <SelectItem value="on_leave">{isEs ? "En Licencia" : "On Leave"}</SelectItem>
              <SelectItem value="terminated">{isEs ? "Terminados" : "Terminated"}</SelectItem>
            </SelectContent>
          </Select>
          {departments.length > 0 && (
            <Select value={departmentFilter || "all"} onValueChange={(v) => setDepartmentFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={isEs ? "Departamento" : "Department"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
                {departments.map(dept => (
                  <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={() => setDialogOpen(true)} data-testid="add-employee-btn">
            <UserPlus className="w-4 h-4 mr-2" />
            {isEs ? "Nuevo Empleado" : "New Employee"}
          </Button>
        </div>
      </div>

      {/* Employee Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{isEs ? "No hay empleados" : "No employees found"}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Empleado" : "Employee"}</TableHead>
                  <TableHead>{isEs ? "Puesto" : "Position"}</TableHead>
                  <TableHead>{isEs ? "Departamento" : "Department"}</TableHead>
                  <TableHead>{isEs ? "Contrato" : "Contract"}</TableHead>
                  <TableHead>{isEs ? "Fecha Ingreso" : "Hire Date"}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map((emp) => (
                  <TableRow 
                    key={emp.employee_id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/people-ops/employee/${emp.employee_id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                          <span className="text-sm font-medium text-violet-700">
                            {emp.first_name?.[0]}{emp.last_name?.[0]}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{emp.full_name}</p>
                          <p className="text-xs text-muted-foreground">{emp.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{emp.job_title}</TableCell>
                    <TableCell>
                      {emp.department && (
                        <Badge variant="outline" className="text-xs">
                          {emp.department}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${CONTRACT_TYPES[emp.contract_type]?.color || ''}`}>
                        {isEs 
                          ? CONTRACT_TYPES[emp.contract_type]?.labelEs 
                          : CONTRACT_TYPES[emp.contract_type]?.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {emp.hire_date ? formatDateOnly(emp.hire_date, language) : "-"}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Employee Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {isEs ? "Nuevo Empleado" : "New Employee"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
            {/* Personal Info */}
            <div>
              <label className="text-sm font-medium">{isEs ? "Nombre *" : "First Name *"}</label>
              <Input
                data-testid="employee-first-name"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Apellido *" : "Last Name *"}</label>
              <Input
                data-testid="employee-last-name"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Email *</label>
              <Input
                data-testid="employee-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Teléfono" : "Phone"}</label>
              <Input
                data-testid="employee-phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            {/* Employment Info */}
            <div className="col-span-2 border-t pt-4 mt-2">
              <p className="text-sm font-medium text-muted-foreground mb-3">
                {isEs ? "Información Laboral" : "Employment Info"}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Puesto *" : "Job Role *"}</label>
              <Select 
                value={formData.job_role_id || "none"} 
                onValueChange={(v) => {
                  const pos = jobPostings.find(j => j.position_id === v);
                  setFormData({ 
                    ...formData, 
                    job_role_id: v === "none" ? "" : v,
                    job_title: pos?.title || formData.job_title,
                    department_id: pos?.department_id || formData.department_id
                  });
                }}
              >
                <SelectTrigger data-testid="employee-job-role">
                  <SelectValue placeholder={isEs ? "Seleccionar puesto..." : "Select role..."} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Seleccionar..." : "Select..."}</SelectItem>
                  {jobPostings.map(pos => (
                    <SelectItem key={pos.position_id} value={pos.position_id}>
                      {pos.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {isEs ? "Crear puestos en Estructura Organizacional > Posiciones" : "Create roles in Org Chart > Positions"}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Departamento *" : "Department *"}</label>
              <Select 
                value={formData.department_id || "none"} 
                onValueChange={(v) => {
                  const dept = orgDepartments.find(d => d.department_id === v);
                  setFormData({ 
                    ...formData, 
                    department_id: v === "none" ? "" : v,
                    department: dept?.name || formData.department
                  });
                }}
              >
                <SelectTrigger data-testid="employee-department">
                  <SelectValue placeholder={isEs ? "Seleccionar departamento..." : "Select department..."} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Seleccionar..." : "Select..."}</SelectItem>
                  {orgDepartments.filter(d => d.is_active !== false).map(dept => (
                    <SelectItem key={dept.department_id} value={dept.department_id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {isEs ? "Crear en Settings > Org Structure" : "Create in Settings > Org Structure"}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Cost Center</label>
              <Select 
                value={formData.cost_center_id || "none"} 
                onValueChange={(v) => setFormData({ ...formData, cost_center_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Sin asignar" : "Unassigned"}</SelectItem>
                  {costCenters.filter(cc => cc.is_active !== false).map(cc => (
                    <SelectItem key={cc.cost_center_id} value={cc.cost_center_id}>
                      {cc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Reporta a" : "Reports To"}</label>
              <Select 
                value={formData.manager_id || "none"} 
                onValueChange={(v) => setFormData({ ...formData, manager_id: v === "none" ? "" : v })}
              >
                <SelectTrigger data-testid="employee-manager">
                  <SelectValue placeholder={isEs ? "Seleccionar manager..." : "Select manager..."} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Sin manager" : "No manager"}</SelectItem>
                  {managers.map(mgr => (
                    <SelectItem key={mgr.employee_id} value={mgr.employee_id}>
                      {mgr.full_name} - {mgr.job_title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Fecha de Ingreso *" : "Hire Date *"}</label>
              <Input
                type="date"
                value={formData.hire_date}
                onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Tipo de Contrato" : "Contract Type"}</label>
              <Select 
                value={formData.contract_type} 
                onValueChange={(v) => setFormData({ ...formData, contract_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">{isEs ? "Tiempo Completo" : "Full Time"}</SelectItem>
                  <SelectItem value="part_time">{isEs ? "Medio Tiempo" : "Part Time"}</SelectItem>
                  <SelectItem value="contract">{isEs ? "Contrato" : "Contract"}</SelectItem>
                  <SelectItem value="freelance">Freelance</SelectItem>
                  <SelectItem value="intern">{isEs ? "Pasante" : "Intern"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Manager Checkbox */}
            <div className="col-span-2 flex items-center gap-3 p-3 bg-violet-50 rounded-lg border border-violet-100">
              <input
                type="checkbox"
                id="is_manager"
                checked={formData.is_manager}
                onChange={(e) => setFormData({ ...formData, is_manager: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              <label htmlFor="is_manager" className="text-sm">
                <span className="font-medium">{isEs ? "Es Manager" : "Is Manager"}</span>
                <span className="text-muted-foreground ml-2">
                  {isEs ? "(Aparecerá en el organigrama como supervisor)" : "(Will appear in org chart as supervisor)"}
                </span>
              </label>
            </div>

            {/* Compensation */}
            <div className="col-span-2 border-t pt-4 mt-2">
              <p className="text-sm font-medium text-muted-foreground mb-3">
                {isEs ? "Compensación" : "Compensation"}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Salario Base" : "Base Salary"}</label>
              <Input
                type="number"
                value={formData.base_salary}
                onChange={(e) => setFormData({ ...formData, base_salary: parseFloat(e.target.value) || 0 })}
                min="0"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Frecuencia de Pago" : "Payment Frequency"}</label>
              <Select 
                value={formData.payment_frequency} 
                onValueChange={(v) => setFormData({ ...formData, payment_frequency: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="biweekly">{isEs ? "Quincenal" : "Biweekly"}</SelectItem>
                  <SelectItem value="monthly">{isEs ? "Mensual" : "Monthly"}</SelectItem>
                  <SelectItem value="weekly">{isEs ? "Semanal" : "Weekly"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreateEmployee} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
              {isEs ? "Crear Empleado" : "Create Employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
