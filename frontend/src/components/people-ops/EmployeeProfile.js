import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { useOrgConfig } from "../../contexts/OrgConfigContext";
import { buildCurrencyFormatter } from "../../hooks/useCurrencyFormatter";
import { formatDateOnly } from "../../utils/dates";
import { FxConvertBadge } from "../FxConvertBadge";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../ui/dialog";
import {
  ArrowLeft, User, Briefcase, Wallet, Calendar, Building2,
  Mail, Phone, MapPin, RefreshCw, Edit2, Save, X,
  FileText, Clock, TrendingUp, AlertCircle, DollarSign, Sun, Moon,
  Percent, Zap, CreditCard, History, Plus, ArrowRight, Trash2, AlertOctagon
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Switch } from "../ui/switch";

import { API_BASE as API } from "../../utils/api";
import { PaymentHistoryTab } from "./EmployeeProfilePage/PaymentHistoryTab";
import { LoansTab } from "./EmployeeProfilePage/LoansTab";

// formatCurrency now derives from companyCurrency via the hook within the component body.

export function EmployeeProfile() {
  const { employeeId } = useParams();
  const { language } = useLanguage();
  const { companyCurrency } = useOrgConfig();
  const formatCurrency = buildCurrencyFormatter(companyCurrency);
  const isEs = language === "es";
  const navigate = useNavigate();
  
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({});
  const [salaryHistory, setSalaryHistory] = useState([]);
  const [pendingDeductions, setPendingDeductions] = useState([]);
  const [activeTab, setActiveTab] = useState("info");
  
  // Reference data for dropdowns
  const [jobPostings, setJobPostings] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [managers, setManagers] = useState([]);

  const fetchEmployee = useCallback(async () => {
    try {
      const [empRes, salaryRes, jobsRes, deptRes, ccRes, empListRes, pdRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/employees/${employeeId}`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/employees/${employeeId}/salary-history`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/people-ops/recruitment/jobs`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/people-ops/departments`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/people-ops/cost-centers`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/people-ops/employees?status=active`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/people-ops/pending-deductions?employee_id=${employeeId}`, { withCredentials: true }).catch(() => ({ data: [] }))
      ]);
      setEmployee(empRes.data);
      setEditData(empRes.data);
      setSalaryHistory(salaryRes.data);
      setPendingDeductions(pdRes.data || []);
      setJobPostings(jobsRes.data || []);
      setDepartments(deptRes.data || []);
      setCostCenters(ccRes.data || []);
      // Filter managers (employees with is_manager=true, excluding current employee)
      const mgrs = (empListRes.data || []).filter(e => e.is_manager && e.employee_id !== employeeId);
      setManagers(mgrs);
    } catch (err) {
      console.error("Error fetching employee:", err);
    }
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { fetchEmployee(); }, [fetchEmployee]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(
        `${API}/api/people-ops/employees/${employeeId}`,
        editData,
        { withCredentials: true }
      );
      // Re-fetch to pull fresh salary history if base_salary changed
      await fetchEmployee();
      setEditing(false);
    } catch (err) {
      console.error("Error updating employee:", err);
      alert(err.response?.data?.detail || "Error updating employee");
    }
    setSaving(false);
  };

  // ---- Salary change dialog state
  const [salaryDialogOpen, setSalaryDialogOpen] = useState(false);
  const [salarySaving, setSalarySaving] = useState(false);
  const [salaryForm, setSalaryForm] = useState({
    new_salary: "",
    effective_date: new Date().toISOString().slice(0, 10),
    reason: "annual_review",
    notes: ""
  });

  const openSalaryDialog = () => {
    setSalaryForm({
      new_salary: "",
      effective_date: new Date().toISOString().slice(0, 10),
      reason: "annual_review",
      notes: ""
    });
    setSalaryDialogOpen(true);
  };

  const submitSalaryChange = async () => {
    const amount = parseFloat(salaryForm.new_salary);
    if (!amount || amount <= 0) {
      alert(isEs ? "Ingresa un salario válido" : "Enter a valid salary");
      return;
    }
    if (!salaryForm.effective_date) {
      alert(isEs ? "Ingresa la fecha efectiva" : "Enter the effective date");
      return;
    }
    setSalarySaving(true);
    try {
      await axios.post(
        `${API}/api/people-ops/employees/${employeeId}/salary-change`,
        {
          new_salary: amount,
          effective_date: salaryForm.effective_date,
          reason: salaryForm.reason,
          notes: salaryForm.notes || null
        },
        { withCredentials: true }
      );
      setSalaryDialogOpen(false);
      await fetchEmployee();
    } catch (err) {
      console.error("Error recording salary change:", err);
      alert(err.response?.data?.detail || (isEs ? "Error al registrar el cambio" : "Error recording change"));
    }
    setSalarySaving(false);
  };

  // ---- Pending deduction dialog state
  const [pdDialogOpen, setPdDialogOpen] = useState(false);
  const [pdSaving, setPdSaving] = useState(false);
  const [pdForm, setPdForm] = useState({ amount: "", reason: "", notes: "" });

  const openPdDialog = () => {
    setPdForm({ amount: "", reason: "", notes: "" });
    setPdDialogOpen(true);
  };

  const submitPendingDeduction = async () => {
    const amt = parseFloat(pdForm.amount);
    if (!amt || amt <= 0) {
      alert(isEs ? "Ingresa un monto válido" : "Enter a valid amount");
      return;
    }
    if (!pdForm.reason || !pdForm.reason.trim()) {
      alert(isEs ? "Ingresa una razón / etiqueta" : "Enter a reason / label");
      return;
    }
    setPdSaving(true);
    try {
      await axios.post(
        `${API}/api/people-ops/pending-deductions`,
        {
          employee_id: employeeId,
          amount: amt,
          reason: pdForm.reason.trim(),
          notes: pdForm.notes || null
        },
        { withCredentials: true }
      );
      setPdDialogOpen(false);
      await fetchEmployee();
    } catch (err) {
      console.error("Error creating pending deduction:", err);
      alert(err.response?.data?.detail || (isEs ? "Error al crear descuento" : "Error creating deduction"));
    }
    setPdSaving(false);
  };

  const deletePendingDeduction = async (deductionId) => {
    if (!window.confirm(isEs ? "¿Eliminar este descuento pendiente?" : "Delete this pending deduction?")) return;
    try {
      await axios.delete(
        `${API}/api/people-ops/pending-deductions/${deductionId}`,
        { withCredentials: true }
      );
      await fetchEmployee();
    } catch (err) {
      alert(err.response?.data?.detail || (isEs ? "Error" : "Error"));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-muted-foreground">{isEs ? "Empleado no encontrado" : "Employee not found"}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/people-ops")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {isEs ? "Volver" : "Go Back"}
        </Button>
      </div>
    );
  }

  const statusColors = {
    active: "bg-emerald-100 text-emerald-700",
    on_leave: "bg-amber-100 text-amber-700",
    suspended: "bg-red-100 text-red-700",
    terminated: "bg-gray-100 text-gray-700"
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/people-ops/directory")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center">
            <span className="text-xl font-bold text-violet-700">
              {employee.first_name?.[0]}{employee.last_name?.[0]}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{employee.full_name}</h1>
              <Badge className={statusColors[employee.status]}>
                {employee.status}
              </Badge>
            </div>
            <p className="text-muted-foreground">{employee.job_title}</p>
            {employee.employee_number && (
              <p className="text-xs text-muted-foreground">{employee.employee_number}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => { setEditing(false); setEditData(employee); }}>
                <X className="w-4 h-4 mr-2" />
                {isEs ? "Cancelar" : "Cancel"}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {isEs ? "Guardar" : "Save"}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Edit2 className="w-4 h-4 mr-2" />
              {isEs ? "Editar" : "Edit"}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="info" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            {isEs ? "Información" : "Info"}
          </TabsTrigger>
          <TabsTrigger value="compensation" className="flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            {isEs ? "Compensación" : "Compensation"}
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {isEs ? "Documentos" : "Documents"}
          </TabsTrigger>
          <TabsTrigger value="time" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            {isEs ? "Tiempo" : "Time"}
          </TabsTrigger>
          <TabsTrigger value="payment-history" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            {isEs ? "Historial Pagos" : "Payment History"}
          </TabsTrigger>
          <TabsTrigger value="loans" className="flex items-center gap-2" data-testid="tab-loans">
            <CreditCard className="w-4 h-4" />
            {isEs ? "Préstamos" : "Loans"}
          </TabsTrigger>
        </TabsList>

        {/* Info Tab */}
        <TabsContent value="info" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Personal Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="w-4 h-4" />
                  {isEs ? "Información Personal" : "Personal Information"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {editing ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-muted-foreground">{isEs ? "Nombre" : "First Name"}</label>
                        <Input
                          value={editData.first_name || ""}
                          onChange={(e) => setEditData({ ...editData, first_name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">{isEs ? "Apellido" : "Last Name"}</label>
                        <Input
                          value={editData.last_name || ""}
                          onChange={(e) => setEditData({ ...editData, last_name: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Email</label>
                      <Input
                        value={editData.email || ""}
                        onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">{isEs ? "Teléfono" : "Phone"}</label>
                      <Input
                        value={editData.phone || ""}
                        onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">{isEs ? "Cédula" : "National ID"}</label>
                      <Input
                        value={editData.national_id || ""}
                        onChange={(e) => setEditData({ ...editData, national_id: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span>{employee.email}</span>
                    </div>
                    {employee.phone && (
                      <div className="flex items-center gap-3">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span>{employee.phone}</span>
                      </div>
                    )}
                    {employee.address && (
                      <div className="flex items-center gap-3">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <span>{employee.address}{employee.city ? `, ${employee.city}` : ""}</span>
                      </div>
                    )}
                    {employee.national_id && (
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span>{isEs ? "Cédula:" : "ID:"} {employee.national_id}</span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Employment Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  {isEs ? "Información Laboral" : "Employment Info"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {editing ? (
                  <>
                    <div>
                      <label className="text-sm text-muted-foreground">{isEs ? "Puesto" : "Job Role"}</label>
                      <Input
                        data-testid="edit-job-title"
                        value={editData.job_title || ""}
                        onChange={(e) => setEditData({ ...editData, job_title: e.target.value })}
                        placeholder={isEs ? "Ej: Chef Ejecutivo, Vendedor..." : "E.g., Executive Chef, Salesperson..."}
                        className="mb-2"
                      />
                      <Select 
                        value={editData.job_role_id || "none"} 
                        onValueChange={(v) => {
                          const job = jobPostings.find(j => j.id === v);
                          setEditData({ 
                            ...editData, 
                            job_role_id: v === "none" ? "" : v,
                            job_title: job?.title || editData.job_title
                          });
                        }}
                      >
                        <SelectTrigger data-testid="edit-job-role-select">
                          <SelectValue placeholder={isEs ? "O selecciona del catálogo de Recruitment..." : "Or pick from Recruitment catalog..."} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{isEs ? "Sin asignar (usar texto arriba)" : "Unassigned (use text above)"}</SelectItem>
                          {jobPostings.map(job => (
                            <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        {isEs ? "Escribe el puesto libremente o vincúlalo a un puesto formal de Recruitment para reportes." : "Type the role freely, or link to a formal Recruitment role for reporting."}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">{isEs ? "Departamento" : "Department"}</label>
                      <Select 
                        value={editData.department_id || "none"} 
                        onValueChange={(v) => {
                          const dept = departments.find(d => d.department_id === v);
                          const localizedName = dept ? (isEs ? (dept.name_es || dept.name) : (dept.name_en || dept.name)) : "";
                          setEditData({ 
                            ...editData, 
                            department_id: v === "none" ? "" : v,
                            department: localizedName || editData.department
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={isEs ? "Seleccionar departamento..." : "Select department..."} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{isEs ? "Sin asignar" : "Unassigned"}</SelectItem>
                          {departments.filter(d => d.is_active !== false).map(dept => {
                            const display = isEs ? (dept.name_es || dept.name) : (dept.name_en || dept.name);
                            return (
                              <SelectItem key={dept.department_id} value={dept.department_id}>{display}</SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Cost Center</label>
                      <Select 
                        value={editData.cost_center_id || "none"} 
                        onValueChange={(v) => {
                          const cc = costCenters.find(c => c.cost_center_id === v);
                          setEditData({ 
                            ...editData, 
                            cost_center_id: v === "none" ? "" : v,
                            cost_center_name: cc?.name || ""
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{isEs ? "Sin asignar" : "Unassigned"}</SelectItem>
                          {costCenters.filter(cc => cc.is_active !== false).map(cc => (
                            <SelectItem key={cc.cost_center_id} value={cc.cost_center_id}>{cc.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">{isEs ? "Reporta a" : "Reports To"}</label>
                      <Select 
                        value={editData.manager_id || "none"} 
                        onValueChange={(v) => {
                          const mgr = managers.find(m => m.employee_id === v);
                          setEditData({ 
                            ...editData, 
                            manager_id: v === "none" ? "" : v,
                            manager_name: mgr?.full_name || ""
                          });
                        }}
                      >
                        <SelectTrigger>
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
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-muted-foreground">{isEs ? "Fecha de Ingreso" : "Hire Date"}</label>
                        <Input
                          type="date"
                          data-testid="edit-hire-date"
                          value={editData.hire_date || ""}
                          onChange={(e) => setEditData({ ...editData, hire_date: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">{isEs ? "Tipo de Contrato" : "Contract Type"}</label>
                        <Select
                          value={editData.contract_type || "full_time"}
                          onValueChange={(v) => setEditData({ ...editData, contract_type: v })}
                        >
                          <SelectTrigger data-testid="edit-contract-type">
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
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-violet-50 rounded-lg border border-violet-100">
                      <input
                        type="checkbox"
                        id="is_manager_edit"
                        checked={editData.is_manager || false}
                        onChange={(e) => setEditData({ ...editData, is_manager: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                      />
                      <label htmlFor="is_manager_edit" className="text-sm">
                        <span className="font-medium">{isEs ? "Es Manager" : "Is Manager"}</span>
                        <span className="text-muted-foreground ml-2">
                          {isEs ? "(Aparece en organigrama)" : "(Shows in org chart)"}
                        </span>
                      </label>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{isEs ? "Puesto" : "Position"}</span>
                      <span className="font-medium">{employee.job_title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{isEs ? "Departamento" : "Department"}</span>
                      <span>{(() => {
                        const dept = departments.find(d => d.department_id === employee.department_id);
                        if (dept) {
                          return isEs ? (dept.name_es || dept.name) : (dept.name_en || dept.name);
                        }
                        return employee.department || "-";
                      })()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cost Center</span>
                      <span>{employee.cost_center_name || "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{isEs ? "Fecha Ingreso" : "Hire Date"}</span>
                      <span>{employee.hire_date ? formatDateOnly(employee.hire_date, language) : "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{isEs ? "Contrato" : "Contract"}</span>
                      <Badge variant="outline">{employee.contract_type}</Badge>
                    </div>
                    {employee.manager_name && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{isEs ? "Reporta a" : "Reports to"}</span>
                        <span>{employee.manager_name}</span>
                      </div>
                    )}
                    {employee.is_manager && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{isEs ? "Rol" : "Role"}</span>
                        <Badge className="bg-violet-100 text-violet-700">{isEs ? "Manager" : "Manager"}</Badge>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Banking Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  {isEs ? "Información Bancaria" : "Banking Info"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {editing ? (
                  <>
                    <div>
                      <label className="text-sm text-muted-foreground">{isEs ? "Banco" : "Bank Name"}</label>
                      <Input
                        value={editData.bank_name || ""}
                        onChange={(e) => setEditData({ ...editData, bank_name: e.target.value })}
                        placeholder={isEs ? "Ej: Chase, HSBC, Santander..." : "E.g. Chase, HSBC, Santander..."}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-muted-foreground">{isEs ? "Tipo de Cuenta" : "Account Type"}</label>
                        <Select 
                          value={editData.bank_account_type || "none"} 
                          onValueChange={(v) => setEditData({ ...editData, bank_account_type: v === "none" ? "" : v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={isEs ? "Seleccionar tipo..." : "Select type..."} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{isEs ? "Sin asignar" : "Not set"}</SelectItem>
                            <SelectItem value="savings">{isEs ? "Ahorros" : "Savings"}</SelectItem>
                            <SelectItem value="checking">{isEs ? "Corriente" : "Checking"}</SelectItem>
                            <SelectItem value="payroll">{isEs ? "Nómina" : "Payroll"}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">{isEs ? "Moneda" : "Currency"}</label>
                        <Select 
                          value={editData.currency || companyCurrency || "USD"} 
                          onValueChange={(v) => setEditData({ ...editData, currency: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USD">USD - US Dollar</SelectItem>
                            <SelectItem value="EUR">EUR - Euro</SelectItem>
                            <SelectItem value="GBP">GBP - British Pound</SelectItem>
                            <SelectItem value="MXN">MXN - Mexican Peso</SelectItem>
                            <SelectItem value="DOP">DOP - Dominican Peso</SelectItem>
                            <SelectItem value="COP">COP - Colombian Peso</SelectItem>
                            <SelectItem value="ARS">ARS - Argentine Peso</SelectItem>
                            <SelectItem value="BRL">BRL - Brazilian Real</SelectItem>
                            <SelectItem value="CLP">CLP - Chilean Peso</SelectItem>
                            <SelectItem value="PEN">PEN - Peruvian Sol</SelectItem>
                            <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                            <SelectItem value="CHF">CHF - Swiss Franc</SelectItem>
                            <SelectItem value="JPY">JPY - Japanese Yen</SelectItem>
                            <SelectItem value="CNY">CNY - Chinese Yuan</SelectItem>
                            <SelectItem value="INR">INR - Indian Rupee</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">{isEs ? "Número de Cuenta" : "Account Number"}</label>
                      <Input
                        value={editData.bank_account || ""}
                        onChange={(e) => setEditData({ ...editData, bank_account: e.target.value })}
                        placeholder={isEs ? "Número de cuenta o IBAN" : "Account number or IBAN"}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">{isEs ? "Código de Ruta / SWIFT (opcional)" : "Routing / SWIFT Code (optional)"}</label>
                      <Input
                        value={editData.routing_number || ""}
                        onChange={(e) => setEditData({ ...editData, routing_number: e.target.value })}
                        placeholder={isEs ? "Código de ruta, SWIFT o BIC" : "Routing number, SWIFT or BIC"}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{isEs ? "Banco" : "Bank"}</span>
                      <span>{employee.bank_name || "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{isEs ? "Tipo de Cuenta" : "Account Type"}</span>
                      <span>
                        {employee.bank_account_type === "savings" ? (isEs ? "Ahorros" : "Savings") :
                         employee.bank_account_type === "checking" ? (isEs ? "Corriente" : "Checking") :
                         employee.bank_account_type === "payroll" ? (isEs ? "Nómina" : "Payroll") : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{isEs ? "Número de Cuenta" : "Account Number"}</span>
                      <span className="font-mono">{employee.bank_account ? `****${employee.bank_account.slice(-4)}` : "-"}</span>
                    </div>
                    {employee.routing_number && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{isEs ? "Código SWIFT/Ruta" : "SWIFT/Routing"}</span>
                        <span className="font-mono">{employee.routing_number}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{isEs ? "Moneda" : "Currency"}</span>
                      <Badge variant="outline">{employee.currency || companyCurrency || "USD"}</Badge>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Compensation Tab */}
        <TabsContent value="compensation" className="space-y-6">
          {/* Salary Configuration Card - Editable */}
          {editing && (
            <Card className="border-violet-200 bg-violet-50/30">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  {isEs ? "Configuración de Salario" : "Salary Configuration"}
                </CardTitle>
                <CardDescription>
                  {isEs
                    ? "Ingresa el salario base, frecuencia de pago y moneda del empleado."
                    : "Set the employee's base salary, payment frequency and currency."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">{isEs ? "Salario Base Mensual" : "Base Monthly Salary"} *</label>
                    <Input
                      data-testid="edit-base-salary"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={editData.base_salary ?? ""}
                      onChange={(e) => setEditData({ ...editData, base_salary: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {isEs
                        ? `Ingresa siempre el monto MENSUAL. En quincenal se divide ÷2 automáticamente${editData.base_salary ? ` (quincena: ${formatCurrency(editData.base_salary / 2)})` : ""}.`
                        : `Always enter the MONTHLY amount. Biweekly pay is auto-halved${editData.base_salary ? ` (biweekly: ${formatCurrency(editData.base_salary / 2)})` : ""}.`}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">{isEs ? "Moneda" : "Currency"}</label>
                    <Select
                      value={editData.currency || companyCurrency || "USD"}
                      onValueChange={(v) => setEditData({ ...editData, currency: v })}
                    >
                      <SelectTrigger data-testid="edit-salary-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD - US Dollar</SelectItem>
                        <SelectItem value="EUR">EUR - Euro</SelectItem>
                        <SelectItem value="GBP">GBP - British Pound</SelectItem>
                        <SelectItem value="MXN">MXN - Mexican Peso</SelectItem>
                        <SelectItem value="DOP">DOP - Dominican Peso</SelectItem>
                        <SelectItem value="COP">COP - Colombian Peso</SelectItem>
                        <SelectItem value="ARS">ARS - Argentine Peso</SelectItem>
                        <SelectItem value="BRL">BRL - Brazilian Real</SelectItem>
                        <SelectItem value="CLP">CLP - Chilean Peso</SelectItem>
                        <SelectItem value="PEN">PEN - Peruvian Sol</SelectItem>
                        <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                        <SelectItem value="CHF">CHF - Swiss Franc</SelectItem>
                        <SelectItem value="JPY">JPY - Japanese Yen</SelectItem>
                        <SelectItem value="CNY">CNY - Chinese Yuan</SelectItem>
                        <SelectItem value="INR">INR - Indian Rupee</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">{isEs ? "Frecuencia de Pago" : "Payment Frequency"}</label>
                    <Select
                      value={editData.payment_frequency || "biweekly"}
                      onValueChange={(v) => setEditData({ ...editData, payment_frequency: v })}
                    >
                      <SelectTrigger data-testid="edit-payment-frequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">{isEs ? "Semanal" : "Weekly"}</SelectItem>
                        <SelectItem value="biweekly">{isEs ? "Quincenal" : "Biweekly"}</SelectItem>
                        <SelectItem value="monthly">{isEs ? "Mensual" : "Monthly"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">{isEs ? "Horas Regulares por Semana" : "Regular Hours per Week"}</label>
                  <Input
                    data-testid="edit-weekly-hours"
                    type="number"
                    min="0"
                    max="60"
                    step="0.5"
                    value={editData.weekly_hours_regular ?? 44}
                    onChange={(e) => setEditData({ ...editData, weekly_hours_regular: e.target.value === "" ? 44 : parseFloat(e.target.value) })}
                    className="max-w-xs"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {isEs ? "Usado para calcular tarifa por hora (default RD: 44 h)" : "Used to derive hourly rate (RD default: 44 h)"}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-emerald-200 bg-emerald-50/30">
              <CardContent className="pt-6">
                <p className="text-sm text-emerald-600">{isEs ? "Salario Base" : "Base Salary"}</p>
                {(() => {
                  const empCurrency = employee.currency || companyCurrency || "USD";
                  const empFormatter = buildCurrencyFormatter(empCurrency);
                  const salaryValue = Number(employee.base_salary || 0);
                  return (
                    <>
                      <p className="text-3xl font-bold text-emerald-700" data-testid="display-base-salary">
                        {salaryValue > 0 ? empFormatter(salaryValue) : (isEs ? "Sin definir" : "Not set")}
                      </p>
                      {salaryValue > 0 && (
                        <FxConvertBadge amount={salaryValue} from={empCurrency} className="mt-1" />
                      )}
                      {salaryValue === 0 && (
                        <p className="text-xs text-amber-600 mt-1">
                          {isEs
                            ? "Haz clic en \"Editar\" arriba para configurar el salario"
                            : "Click \"Edit\" above to configure salary"}
                        </p>
                      )}
                    </>
                  );
                })()}
                <p className="text-sm text-muted-foreground mt-1">
                  {(() => {
                    const freqLabel = employee.payment_frequency === "biweekly" ? (isEs ? "Quincenal" : "Biweekly") :
                                      employee.payment_frequency === "monthly" ? (isEs ? "Mensual" : "Monthly") :
                                      (isEs ? "Semanal" : "Weekly");
                    const biweekly = (employee.base_salary || 0) / 2;
                    return isEs
                      ? `Mensual · Pagos ${freqLabel.toLowerCase()} · Quincena: ${formatCurrency(biweekly)}`
                      : `Monthly · ${freqLabel} payments · Biweekly: ${formatCurrency(biweekly)}`;
                  })()}
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{isEs ? "Vacaciones Disponibles" : "Vacation Days"}</p>
                <p className="text-2xl font-bold">{employee.vacation_days_available || 0}</p>
                <p className="text-xs text-muted-foreground">
                  {isEs ? `de ${employee.vacation_days_entitled || 14} días` : `of ${employee.vacation_days_entitled || 14} days`}
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{isEs ? "Préstamo Activo" : "Active Loan"}</p>
                <p className="text-2xl font-bold">{formatCurrency(employee.active_loan_balance)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Benefits */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{isEs ? "Beneficios y Deducciones" : "Benefits & Deductions"}</CardTitle>
              <CardDescription>
                {isEs
                  ? "Activa/desactiva las deducciones legales por empleado. Los empleados nuevos o temporales pueden estar exentos."
                  : "Toggle legal deductions per employee. New or temporary employees may be exempt."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="p-3 border rounded-lg bg-background flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">AFP · {isEs ? "Pensión" : "Pension"}</p>
                    <p className="text-sm font-medium truncate">{employee.afp_provider || (isEs ? "Sin proveedor" : "No provider")}</p>
                  </div>
                  {editing ? (
                    <Switch
                      checked={editData.has_pension !== false}
                      onCheckedChange={(v) => setEditData({ ...editData, has_pension: v })}
                      data-testid="toggle-afp"
                    />
                  ) : (
                    <Badge variant={employee.has_pension !== false ? "default" : "outline"} className={employee.has_pension === false ? "text-red-600 border-red-300" : ""}>
                      {employee.has_pension !== false ? (isEs ? "Activo" : "On") : (isEs ? "Exento" : "Off")}
                    </Badge>
                  )}
                </div>
                
                <div className="p-3 border rounded-lg bg-background flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">ARS · {isEs ? "Salud" : "Health"}</p>
                    <p className="text-sm font-medium truncate">{employee.ars_provider || (isEs ? "Sin proveedor" : "No provider")}</p>
                  </div>
                  {editing ? (
                    <Switch
                      checked={editData.has_health_insurance !== false}
                      onCheckedChange={(v) => setEditData({ ...editData, has_health_insurance: v })}
                      data-testid="toggle-ars"
                    />
                  ) : (
                    <Badge variant={employee.has_health_insurance !== false ? "default" : "outline"} className={employee.has_health_insurance === false ? "text-red-600 border-red-300" : ""}>
                      {employee.has_health_insurance !== false ? (isEs ? "Activo" : "On") : (isEs ? "Exento" : "Off")}
                    </Badge>
                  )}
                </div>
                
                <div className="p-3 border rounded-lg bg-background flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">ISR · {isEs ? "Impuesto" : "Income Tax"}</p>
                    <p className="text-sm font-medium truncate">{isEs ? "Retención mensual" : "Monthly withholding"}</p>
                  </div>
                  {editing ? (
                    <Switch
                      checked={editData.has_isr !== false}
                      onCheckedChange={(v) => setEditData({ ...editData, has_isr: v })}
                      data-testid="toggle-isr"
                    />
                  ) : (
                    <Badge variant={employee.has_isr !== false ? "default" : "outline"} className={employee.has_isr === false ? "text-red-600 border-red-300" : ""}>
                      {employee.has_isr !== false ? (isEs ? "Activo" : "On") : (isEs ? "Exento" : "Off")}
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                <div>
                  <p className="text-xs text-muted-foreground">{isEs ? "Banco" : "Bank"}</p>
                  <p className="text-sm font-medium">{employee.bank_name || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{isEs ? "Cuenta" : "Account"}</p>
                  <p className="text-sm font-medium">{employee.bank_account ? `****${employee.bank_account.slice(-4)}` : "-"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Manual Deduction Overrides */}
          <Card className="border-amber-200 bg-amber-50/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-amber-600" />
                {isEs ? "Overrides Manuales de Deducciones (Mensual)" : "Manual Deduction Overrides (Monthly)"}
              </CardTitle>
              <CardDescription>
                {isEs
                  ? "Si fijas un monto aquí, la nómina ignorará el cálculo automático (AFP/ARS/ISR). Para períodos quincenales se divide ÷2 automáticamente. Deja en blanco para usar el cálculo legal."
                  : "If you set an amount here, payroll will ignore the auto-calculation (AFP/ARS/ISR). For biweekly periods it's auto-divided by 2. Leave blank to use legal formula."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium">AFP Override (mensual)</label>
                    <Input
                      type="number" min="0" step="0.01"
                      placeholder={isEs ? "Vacío = calculado" : "Empty = calculated"}
                      value={editData.afp_override ?? ""}
                      onChange={(e) => setEditData({ ...editData, afp_override: e.target.value === "" ? null : parseFloat(e.target.value) })}
                      data-testid="edit-afp-override"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">ARS Override (mensual)</label>
                    <Input
                      type="number" min="0" step="0.01"
                      placeholder={isEs ? "Vacío = calculado" : "Empty = calculated"}
                      value={editData.ars_override ?? ""}
                      onChange={(e) => setEditData({ ...editData, ars_override: e.target.value === "" ? null : parseFloat(e.target.value) })}
                      data-testid="edit-ars-override"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">ISR Override (mensual)</label>
                    <Input
                      type="number" min="0" step="0.01"
                      placeholder={isEs ? "Vacío = calculado" : "Empty = calculated"}
                      value={editData.isr_override ?? ""}
                      onChange={(e) => setEditData({ ...editData, isr_override: e.target.value === "" ? null : parseFloat(e.target.value) })}
                      data-testid="edit-isr-override"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="p-3 border rounded-lg bg-background">
                    <p className="text-muted-foreground">AFP Override</p>
                    <p className="font-semibold">{employee.afp_override ? formatCurrency(employee.afp_override) : <span className="text-muted-foreground italic">{isEs ? "Calculado automáticamente" : "Auto-calculated"}</span>}</p>
                  </div>
                  <div className="p-3 border rounded-lg bg-background">
                    <p className="text-muted-foreground">ARS Override</p>
                    <p className="font-semibold">{employee.ars_override ? formatCurrency(employee.ars_override) : <span className="text-muted-foreground italic">{isEs ? "Calculado automáticamente" : "Auto-calculated"}</span>}</p>
                  </div>
                  <div className="p-3 border rounded-lg bg-background">
                    <p className="text-muted-foreground">ISR Override</p>
                    <p className="font-semibold">{employee.isr_override ? formatCurrency(employee.isr_override) : <span className="text-muted-foreground italic">{isEs ? "Calculado automáticamente" : "Auto-calculated"}</span>}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Deductions (queued for next payroll) */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  {isEs ? "Descuentos Pendientes para Próxima Nómina" : "Pending Deductions for Next Payroll"}
                </CardTitle>
                <CardDescription>
                  {isEs
                    ? "Estos descuentos se consumirán automáticamente al generar el próximo período de nómina regular."
                    : "These deductions will be auto-applied when the next regular payroll period is created."}
                </CardDescription>
              </div>
              <Button size="sm" onClick={openPdDialog} data-testid="add-pending-deduction-btn">
                <Plus className="w-4 h-4 mr-2" />
                {isEs ? "Agregar" : "Add"}
              </Button>
            </CardHeader>
            <CardContent>
              {pendingDeductions.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
                  <p className="text-sm">{isEs ? "Sin descuentos pendientes." : "No pending deductions."}</p>
                </div>
              ) : (
                <div className="space-y-2" data-testid="pending-deductions-list">
                  {pendingDeductions.map((pd) => (
                    <div
                      key={pd.deduction_id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30"
                      data-testid={`pending-deduction-${pd.deduction_id}`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Badge
                          variant={pd.status === "pending" ? "default" : pd.status === "applied" ? "outline" : "secondary"}
                          className={pd.status === "pending" ? "bg-amber-500" : ""}
                        >
                          {pd.status === "pending" ? (isEs ? "Pendiente" : "Pending") :
                            pd.status === "applied" ? (isEs ? "Aplicado" : "Applied") :
                            (isEs ? "Cancelado" : "Cancelled")}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{pd.reason}</p>
                          {pd.notes && <p className="text-xs text-muted-foreground truncate">{pd.notes}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="font-bold text-red-600">-{formatCurrency(pd.amount)}</p>
                        {pd.status === "pending" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deletePendingDeduction(pd.deduction_id)}
                            className="text-red-600 hover:text-red-700"
                            data-testid={`delete-pd-${pd.deduction_id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Salary History */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  {isEs ? "Historial de Salario" : "Salary History"}
                </CardTitle>
                <CardDescription>
                  {isEs
                    ? "Registro de todos los cambios de salario base de este empleado."
                    : "Audit trail of all base salary changes for this employee."}
                </CardDescription>
              </div>
              <Button size="sm" onClick={openSalaryDialog} data-testid="open-salary-change-btn">
                <Plus className="w-4 h-4 mr-2" />
                {isEs ? "Registrar Cambio" : "Record Change"}
              </Button>
            </CardHeader>
            <CardContent>
              {salaryHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  <History className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">
                    {isEs ? "Aún no hay cambios de salario registrados." : "No salary changes recorded yet."}
                  </p>
                  <p className="text-xs mt-1">
                    {isEs
                      ? "Los cambios se registran automáticamente al editar el salario base."
                      : "Changes are auto-recorded when the base salary is edited."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3" data-testid="salary-history-list">
                  {salaryHistory.map((change, idx) => {
                    const reasonLabels = {
                      promotion: isEs ? "Promoción" : "Promotion",
                      annual_review: isEs ? "Revisión Anual" : "Annual Review",
                      adjustment: isEs ? "Ajuste" : "Adjustment",
                      market_alignment: isEs ? "Ajuste de Mercado" : "Market Alignment",
                      cost_of_living: isEs ? "Costo de Vida" : "Cost of Living",
                      role_change: isEs ? "Cambio de Rol" : "Role Change",
                      other: isEs ? "Otro" : "Other"
                    };
                    const reasonLabel = reasonLabels[change.reason] || change.reason;
                    const pct = change.change_percentage || 0;
                    const isIncrease = pct >= 0;
                    return (
                      <div
                        key={change.change_id || idx}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                        data-testid={`salary-history-row-${idx}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{reasonLabel}</Badge>
                            <p className="text-sm text-muted-foreground">
                              {formatDateOnly(change.effective_date, language)}
                            </p>
                          </div>
                          {change.notes && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">{change.notes}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-sm">
                            <span className="text-muted-foreground line-through">
                              {formatCurrency(change.previous_salary)}
                            </span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span className="font-semibold">{formatCurrency(change.new_salary)}</span>
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <p className={`text-lg font-bold ${isIncrease ? 'text-emerald-600' : 'text-red-600'}`}>
                            {isIncrease ? '+' : ''}{pct.toFixed(1)}%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isIncrease
                              ? `+${formatCurrency(change.new_salary - change.previous_salary)}`
                              : formatCurrency(change.new_salary - change.previous_salary)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Variable Pay Configuration - Per Employee */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                {isEs ? "Configuración de Pagos Variables" : "Variable Pay Configuration"}
              </CardTitle>
              <CardDescription>
                {isEs 
                  ? "Define cómo se pagan las horas extras, comisiones, bonos e incentivos de este empleado" 
                  : "Define how this employee's overtime, commissions, bonuses and incentives are paid"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Overtime */}
                <div className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span className="font-medium">{isEs ? "Horas Extras" : "Overtime"}</span>
                  </div>
                  {editing ? (
                    <>
                      <Select 
                        value={editData.overtime_payment_type || "separate"} 
                        onValueChange={(v) => setEditData({ ...editData, overtime_payment_type: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="with_payroll">{isEs ? "Con nómina regular" : "With regular payroll"}</SelectItem>
                          <SelectItem value="separate">{isEs ? "Pago separado" : "Separate payment"}</SelectItem>
                        </SelectContent>
                      </Select>
                      {editData.overtime_payment_type === "separate" && (
                        <div>
                          <label className="text-xs text-muted-foreground">{isEs ? "Día de pago" : "Payment day"}</label>
                          <Input
                            type="number"
                            min="1"
                            max="28"
                            value={editData.overtime_payment_day || 5}
                            onChange={(e) => setEditData({ ...editData, overtime_payment_day: parseInt(e.target.value) || 5 })}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {employee.overtime_payment_type === "with_payroll" 
                        ? (isEs ? "Con nómina regular" : "With regular payroll")
                        : (isEs ? `Pago separado - Día ${employee.overtime_payment_day || 5}` : `Separate - Day ${employee.overtime_payment_day || 5}`)}
                    </p>
                  )}
                </div>

                {/* Commissions */}
                <div className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <Percent className="w-4 h-4 text-emerald-500" />
                    <span className="font-medium">{isEs ? "Comisiones" : "Commissions"}</span>
                  </div>
                  {editing ? (
                    <>
                      <Select 
                        value={editData.commission_payment_type || "separate"} 
                        onValueChange={(v) => setEditData({ ...editData, commission_payment_type: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="with_payroll">{isEs ? "Con nómina regular" : "With regular payroll"}</SelectItem>
                          <SelectItem value="separate">{isEs ? "Pago separado" : "Separate payment"}</SelectItem>
                          <SelectItem value="not_applicable">{isEs ? "No aplica" : "Not applicable"}</SelectItem>
                        </SelectContent>
                      </Select>
                      {editData.commission_payment_type !== "not_applicable" && (
                        <>
                          <div>
                            <label className="text-xs text-muted-foreground">{isEs ? "% de Comisión sobre ventas" : "Commission % on sales"}</label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={editData.commission_rate || ""}
                              placeholder="0"
                              onChange={(e) => setEditData({ ...editData, commission_rate: parseFloat(e.target.value) || 0 })}
                            />
                          </div>
                          {editData.commission_payment_type === "separate" && (
                            <div>
                              <label className="text-xs text-muted-foreground">{isEs ? "Día de pago" : "Payment day"}</label>
                              <Input
                                type="number"
                                min="1"
                                max="28"
                                value={editData.commission_payment_day || 10}
                                onChange={(e) => setEditData({ ...editData, commission_payment_day: parseInt(e.target.value) || 10 })}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        {employee.commission_payment_type === "with_payroll" 
                          ? (isEs ? "Con nómina regular" : "With regular payroll")
                          : employee.commission_payment_type === "not_applicable"
                          ? (isEs ? "No aplica" : "Not applicable")
                          : (isEs ? `Pago separado - Día ${employee.commission_payment_day || 10}` : `Separate - Day ${employee.commission_payment_day || 10}`)}
                      </p>
                      {employee.commission_payment_type !== "not_applicable" && employee.commission_rate > 0 && (
                        <p className="text-sm font-medium text-emerald-600">{employee.commission_rate}% {isEs ? "sobre ventas" : "on sales"}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Bonuses */}
                <div className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-blue-500" />
                    <span className="font-medium">{isEs ? "Bonos" : "Bonuses"}</span>
                  </div>
                  {editing ? (
                    <>
                      <Select 
                        value={editData.bonus_payment_type || "separate"} 
                        onValueChange={(v) => setEditData({ ...editData, bonus_payment_type: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="with_payroll">{isEs ? "Con nómina regular" : "With regular payroll"}</SelectItem>
                          <SelectItem value="separate">{isEs ? "Pago separado" : "Separate payment"}</SelectItem>
                          <SelectItem value="not_applicable">{isEs ? "No aplica" : "Not applicable"}</SelectItem>
                        </SelectContent>
                      </Select>
                      {editData.bonus_payment_type === "separate" && (
                        <div>
                          <label className="text-xs text-muted-foreground">{isEs ? "Día de pago" : "Payment day"}</label>
                          <Input
                            type="number"
                            min="1"
                            max="28"
                            value={editData.bonus_payment_day || 5}
                            onChange={(e) => setEditData({ ...editData, bonus_payment_day: parseInt(e.target.value) || 5 })}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {employee.bonus_payment_type === "with_payroll" 
                        ? (isEs ? "Con nómina regular" : "With regular payroll")
                        : employee.bonus_payment_type === "not_applicable"
                        ? (isEs ? "No aplica" : "Not applicable")
                        : (isEs ? `Pago separado - Día ${employee.bonus_payment_day || 5}` : `Separate - Day ${employee.bonus_payment_day || 5}`)}
                    </p>
                  )}
                </div>

                {/* Incentives */}
                <div className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-purple-500" />
                    <span className="font-medium">{isEs ? "Incentivos" : "Incentives"}</span>
                  </div>
                  {editing ? (
                    <>
                      <Select 
                        value={editData.incentive_payment_type || "separate"} 
                        onValueChange={(v) => setEditData({ ...editData, incentive_payment_type: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="with_payroll">{isEs ? "Con nómina regular" : "With regular payroll"}</SelectItem>
                          <SelectItem value="separate">{isEs ? "Pago separado" : "Separate payment"}</SelectItem>
                          <SelectItem value="not_applicable">{isEs ? "No aplica" : "Not applicable"}</SelectItem>
                        </SelectContent>
                      </Select>
                      {editData.incentive_payment_type !== "not_applicable" && (
                        <>
                          <div>
                            <label className="text-xs text-muted-foreground">{isEs ? "% Participación en Pool" : "Pool Share %"}</label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={editData.incentive_pool_percentage || ""}
                              placeholder="0"
                              onChange={(e) => setEditData({ ...editData, incentive_pool_percentage: parseFloat(e.target.value) || 0 })}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              {isEs ? "% que recibe cuando se distribuye un pool de incentivos" : "% received when an incentive pool is distributed"}
                            </p>
                          </div>
                          {editData.incentive_payment_type === "separate" && (
                            <div>
                              <label className="text-xs text-muted-foreground">{isEs ? "Día de pago" : "Payment day"}</label>
                              <Input
                                type="number"
                                min="1"
                                max="28"
                                value={editData.incentive_payment_day || 5}
                                onChange={(e) => setEditData({ ...editData, incentive_payment_day: parseInt(e.target.value) || 5 })}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        {employee.incentive_payment_type === "with_payroll" 
                          ? (isEs ? "Con nómina regular" : "With regular payroll")
                          : employee.incentive_payment_type === "not_applicable"
                          ? (isEs ? "No aplica" : "Not applicable")
                          : (isEs ? `Pago separado - Día ${employee.incentive_payment_day || 5}` : `Separate - Day ${employee.incentive_payment_day || 5}`)}
                      </p>
                      {employee.incentive_payment_type !== "not_applicable" && employee.incentive_pool_percentage > 0 && (
                        <p className="text-sm font-medium text-purple-600">{employee.incentive_pool_percentage}% {isEs ? "del pool" : "pool share"}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Additional Benefits */}
              <div className="mt-6 pt-6 border-t">
                <h4 className="font-medium mb-4 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  {isEs ? "Beneficios Adicionales" : "Additional Benefits"}
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Lunch Allowance */}
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm">{isEs ? "Almuerzo" : "Lunch"}</span>
                      {editing ? (
                        <Switch
                          checked={editData.has_lunch_allowance || false}
                          onCheckedChange={(v) => setEditData({ ...editData, has_lunch_allowance: v })}
                        />
                      ) : (
                        <Badge variant={employee.has_lunch_allowance ? "default" : "outline"} className="text-xs">
                          {employee.has_lunch_allowance ? (isEs ? "Sí" : "Yes") : "No"}
                        </Badge>
                      )}
                    </div>
                    {(editing ? editData.has_lunch_allowance : employee.has_lunch_allowance) && (
                      editing ? (
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={editData.lunch_allowance_amount || ""}
                          onChange={(e) => setEditData({ ...editData, lunch_allowance_amount: parseFloat(e.target.value) || 0 })}
                        />
                      ) : (
                        <p className="text-sm font-medium">{formatCurrency(employee.lunch_allowance_amount)}/mes</p>
                      )
                    )}
                  </div>

                  {/* Transport Allowance */}
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm">{isEs ? "Transporte" : "Transport"}</span>
                      {editing ? (
                        <Switch
                          checked={editData.has_transport_allowance || false}
                          onCheckedChange={(v) => setEditData({ ...editData, has_transport_allowance: v })}
                        />
                      ) : (
                        <Badge variant={employee.has_transport_allowance ? "default" : "outline"} className="text-xs">
                          {employee.has_transport_allowance ? (isEs ? "Sí" : "Yes") : "No"}
                        </Badge>
                      )}
                    </div>
                    {(editing ? editData.has_transport_allowance : employee.has_transport_allowance) && (
                      editing ? (
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={editData.transport_allowance_amount || ""}
                          onChange={(e) => setEditData({ ...editData, transport_allowance_amount: parseFloat(e.target.value) || 0 })}
                        />
                      ) : (
                        <p className="text-sm font-medium">{formatCurrency(employee.transport_allowance_amount)}/mes</p>
                      )
                    )}
                  </div>

                  {/* Phone Allowance */}
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm">{isEs ? "Teléfono" : "Phone"}</span>
                      {editing ? (
                        <Switch
                          checked={editData.has_phone_allowance || false}
                          onCheckedChange={(v) => setEditData({ ...editData, has_phone_allowance: v })}
                        />
                      ) : (
                        <Badge variant={employee.has_phone_allowance ? "default" : "outline"} className="text-xs">
                          {employee.has_phone_allowance ? (isEs ? "Sí" : "Yes") : "No"}
                        </Badge>
                      )}
                    </div>
                    {(editing ? editData.has_phone_allowance : employee.has_phone_allowance) && (
                      editing ? (
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={editData.phone_allowance_amount || ""}
                          onChange={(e) => setEditData({ ...editData, phone_allowance_amount: parseFloat(e.target.value) || 0 })}
                        />
                      ) : (
                        <p className="text-sm font-medium">{formatCurrency(employee.phone_allowance_amount)}/mes</p>
                      )
                    )}
                  </div>

                  {/* Fuel Allowance */}
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm">{isEs ? "Combustible" : "Fuel"}</span>
                      {editing ? (
                        <Switch
                          checked={editData.has_fuel_allowance || false}
                          onCheckedChange={(v) => setEditData({ ...editData, has_fuel_allowance: v })}
                        />
                      ) : (
                        <Badge variant={employee.has_fuel_allowance ? "default" : "outline"} className="text-xs">
                          {employee.has_fuel_allowance ? (isEs ? "Sí" : "Yes") : "No"}
                        </Badge>
                      )}
                    </div>
                    {(editing ? editData.has_fuel_allowance : employee.has_fuel_allowance) && (
                      editing ? (
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={editData.fuel_allowance_amount || ""}
                          onChange={(e) => setEditData({ ...editData, fuel_allowance_amount: parseFloat(e.target.value) || 0 })}
                        />
                      ) : (
                        <p className="text-sm font-medium">{formatCurrency(employee.fuel_allowance_amount)}/mes</p>
                      )
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{isEs ? "Gestión de documentos próximamente" : "Document management coming soon"}</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Time Tab */}
        <TabsContent value="time">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{isEs ? "Gestión de tiempo próximamente" : "Time management coming soon"}</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment History Tab */}
        <TabsContent value="payment-history">
          <PaymentHistoryTab employeeId={employeeId} />
        </TabsContent>

        {/* Loans Tab */}
        <TabsContent value="loans">
          <LoansTab employeeId={employeeId} />
        </TabsContent>
      </Tabs>

      {/* Salary Change Dialog */}
      <Dialog open={salaryDialogOpen} onOpenChange={setSalaryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isEs ? "Registrar Cambio de Salario" : "Record Salary Change"}
            </DialogTitle>
            <DialogDescription>
              {isEs
                ? `Salario actual: ${formatCurrency(employee?.base_salary || 0)}`
                : `Current salary: ${formatCurrency(employee?.base_salary || 0)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">
                {isEs ? "Nuevo Salario *" : "New Salary *"}
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={salaryForm.new_salary}
                onChange={(e) => setSalaryForm({ ...salaryForm, new_salary: e.target.value })}
                data-testid="salary-change-amount"
              />
              {salaryForm.new_salary && employee?.base_salary > 0 && (
                <p className={`text-xs mt-1 ${parseFloat(salaryForm.new_salary) >= employee.base_salary ? 'text-emerald-600' : 'text-red-600'}`}>
                  {(() => {
                    const pct = ((parseFloat(salaryForm.new_salary) - employee.base_salary) / employee.base_salary) * 100;
                    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% ${isEs ? 'vs salario actual' : 'vs current salary'}`;
                  })()}
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">
                {isEs ? "Fecha Efectiva *" : "Effective Date *"}
              </label>
              <Input
                type="date"
                value={salaryForm.effective_date}
                onChange={(e) => setSalaryForm({ ...salaryForm, effective_date: e.target.value })}
                data-testid="salary-change-date"
              />
            </div>

            <div>
              <label className="text-sm font-medium">
                {isEs ? "Razón *" : "Reason *"}
              </label>
              <Select
                value={salaryForm.reason}
                onValueChange={(v) => setSalaryForm({ ...salaryForm, reason: v })}
              >
                <SelectTrigger data-testid="salary-change-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual_review">{isEs ? "Revisión Anual" : "Annual Review"}</SelectItem>
                  <SelectItem value="promotion">{isEs ? "Promoción" : "Promotion"}</SelectItem>
                  <SelectItem value="role_change">{isEs ? "Cambio de Rol" : "Role Change"}</SelectItem>
                  <SelectItem value="market_alignment">{isEs ? "Ajuste de Mercado" : "Market Alignment"}</SelectItem>
                  <SelectItem value="cost_of_living">{isEs ? "Costo de Vida" : "Cost of Living"}</SelectItem>
                  <SelectItem value="adjustment">{isEs ? "Ajuste" : "Adjustment"}</SelectItem>
                  <SelectItem value="other">{isEs ? "Otro" : "Other"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">
                {isEs ? "Notas (opcional)" : "Notes (optional)"}
              </label>
              <Input
                placeholder={isEs ? "Detalles adicionales..." : "Additional details..."}
                value={salaryForm.notes}
                onChange={(e) => setSalaryForm({ ...salaryForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSalaryDialogOpen(false)} disabled={salarySaving}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={submitSalaryChange} disabled={salarySaving} data-testid="submit-salary-change-btn">
              {salarySaving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {isEs ? "Registrar" : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pending Deduction Dialog */}
      <Dialog open={pdDialogOpen} onOpenChange={setPdDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isEs ? "Agregar Descuento Pendiente" : "Add Pending Deduction"}
            </DialogTitle>
            <DialogDescription>
              {isEs
                ? "Se aplicará automáticamente al generar el próximo período de nómina regular."
                : "Will be auto-applied when the next regular payroll period is created."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">{isEs ? "Monto *" : "Amount *"}</label>
              <Input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={pdForm.amount}
                onChange={(e) => setPdForm({ ...pdForm, amount: e.target.value })}
                data-testid="pd-amount-input"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Razón / Etiqueta *" : "Reason / Label *"}</label>
              <Input
                placeholder={isEs ? "Ej. Reembolso uniforme" : "e.g. Uniform reimbursement"}
                value={pdForm.reason}
                onChange={(e) => setPdForm({ ...pdForm, reason: e.target.value })}
                data-testid="pd-reason-input"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Notas (opcional)" : "Notes (optional)"}</label>
              <Input
                placeholder={isEs ? "Detalles adicionales..." : "Additional details..."}
                value={pdForm.notes}
                onChange={(e) => setPdForm({ ...pdForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPdDialogOpen(false)} disabled={pdSaving}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={submitPendingDeduction} disabled={pdSaving} data-testid="submit-pd-btn">
              {pdSaving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {isEs ? "Agregar" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
