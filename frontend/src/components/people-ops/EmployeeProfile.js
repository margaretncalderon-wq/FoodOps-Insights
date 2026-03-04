import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
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
  Percent, Zap, CreditCard
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

const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function EmployeeProfile() {
  const { employeeId } = useParams();
  const { language } = useLanguage();
  const isEs = language === "es";
  const navigate = useNavigate();
  
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState({});
  const [salaryHistory, setSalaryHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("info");

  const fetchEmployee = useCallback(async () => {
    try {
      const [empRes, salaryRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/employees/${employeeId}`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/employees/${employeeId}/salary-history`, { withCredentials: true }).catch(() => ({ data: [] }))
      ]);
      setEmployee(empRes.data);
      setEditData(empRes.data);
      setSalaryHistory(salaryRes.data);
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
                      <label className="text-sm text-muted-foreground">{isEs ? "Puesto" : "Job Title"}</label>
                      <Input
                        value={editData.job_title || ""}
                        onChange={(e) => setEditData({ ...editData, job_title: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">{isEs ? "Departamento" : "Department"}</label>
                      <Input
                        value={editData.department || ""}
                        onChange={(e) => setEditData({ ...editData, department: e.target.value })}
                      />
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
                      <span>{employee.department || "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cost Center</span>
                      <span>{employee.cost_center_name || "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{isEs ? "Fecha Ingreso" : "Hire Date"}</span>
                      <span>{employee.hire_date ? new Date(employee.hire_date).toLocaleDateString() : "-"}</span>
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
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Compensation Tab */}
        <TabsContent value="compensation" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-emerald-200 bg-emerald-50/30">
              <CardContent className="pt-6">
                <p className="text-sm text-emerald-600">{isEs ? "Salario Base" : "Base Salary"}</p>
                <p className="text-3xl font-bold text-emerald-700">{formatCurrency(employee.base_salary)}</p>
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
                          {new Date(change.effective_date).toLocaleDateString()}
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
      </Tabs>
    </div>
  );
}
