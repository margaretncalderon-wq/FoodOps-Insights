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
  ArrowLeft, User, Briefcase, Wallet, Calendar, Building2,
  Mail, Phone, MapPin, RefreshCw, Edit2, Save, X,
  FileText, Clock, TrendingUp, AlertCircle, DollarSign, Sun, Moon,
  Percent, Zap, CreditCard, History
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
  const [activeTab, setActiveTab] = useState("info");
  
  // Reference data for dropdowns
  const [jobPostings, setJobPostings] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [managers, setManagers] = useState([]);

  const fetchEmployee = useCallback(async () => {
    try {
      const [empRes, salaryRes, jobsRes, deptRes, ccRes, empListRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/employees/${employeeId}`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/employees/${employeeId}/salary-history`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/people-ops/recruitment/jobs`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/people-ops/departments`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/people-ops/cost-centers`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/people-ops/employees?status=active`, { withCredentials: true }).catch(() => ({ data: [] }))
      ]);
      setEmployee(empRes.data);
      setEditData(empRes.data);
      setSalaryHistory(salaryRes.data);
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
      setEmployee({ ...employee, ...editData });
      setEditing(false);
    } catch (err) {
      console.error("Error updating employee:", err);
      alert(err.response?.data?.detail || "Error updating employee");
    }
    setSaving(false);
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
                    <label className="text-sm text-muted-foreground">{isEs ? "Salario Base" : "Base Salary"} *</label>
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
                      {isEs ? "Monto en la moneda seleccionada" : "Amount in the selected currency"}
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
                  {employee.payment_frequency === "biweekly" ? (isEs ? "Quincenal" : "Biweekly") :
                   employee.payment_frequency === "monthly" ? (isEs ? "Mensual" : "Monthly") : 
                   (isEs ? "Semanal" : "Weekly")}
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
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 border rounded-lg">
                  <p className="text-sm text-muted-foreground">AFP</p>
                  <p className="font-medium">{employee.afp_provider || "No asignado"}</p>
                  <Badge variant={employee.has_pension ? "default" : "outline"} className="mt-1 text-xs">
                    {employee.has_pension ? (isEs ? "Activo" : "Active") : (isEs ? "Inactivo" : "Inactive")}
                  </Badge>
                </div>
                <div className="p-3 border rounded-lg">
                  <p className="text-sm text-muted-foreground">ARS</p>
                  <p className="font-medium">{employee.ars_provider || "No asignado"}</p>
                  <Badge variant={employee.has_health_insurance ? "default" : "outline"} className="mt-1 text-xs">
                    {employee.has_health_insurance ? (isEs ? "Activo" : "Active") : (isEs ? "Inactivo" : "Inactive")}
                  </Badge>
                </div>
                <div className="p-3 border rounded-lg">
                  <p className="text-sm text-muted-foreground">{isEs ? "Banco" : "Bank"}</p>
                  <p className="font-medium">{employee.bank_name || "-"}</p>
                </div>
                <div className="p-3 border rounded-lg">
                  <p className="text-sm text-muted-foreground">{isEs ? "Cuenta" : "Account"}</p>
                  <p className="font-medium">{employee.bank_account ? `****${employee.bank_account.slice(-4)}` : "-"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Salary History */}
          {salaryHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  {isEs ? "Historial de Salario" : "Salary History"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {salaryHistory.map((change, idx) => (
                    <div key={change.change_id || idx} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{change.reason}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDateOnly(change.effective_date, language)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(change.new_salary)}</p>
                        <p className={`text-sm ${change.change_percentage >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {change.change_percentage >= 0 ? '+' : ''}{change.change_percentage?.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

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
      </Tabs>
    </div>
  );
}
