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
  FileText, Clock, TrendingUp, AlertCircle
} from "lucide-react";

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
