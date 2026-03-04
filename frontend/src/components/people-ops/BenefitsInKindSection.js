import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
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
  Gift, Plus, RefreshCw, Calendar, Users, DollarSign,
  Building2, UtensilsCrossed, Car, Phone, CheckCircle
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => 
  `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const BENEFIT_TYPES = [
  { value: "meal", label: "Almuerzo", labelEn: "Meal", icon: UtensilsCrossed },
  { value: "transport", label: "Transporte", labelEn: "Transport", icon: Car },
  { value: "phone", label: "Teléfono", labelEn: "Phone", icon: Phone },
  { value: "other", label: "Otro", labelEn: "Other", icon: Gift }
];

export function BenefitsInKindSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [employees, setEmployees] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [benefits, setBenefits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Form state
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [benefitType, setBenefitType] = useState("meal");
  const [valuePerEmployee, setValuePerEmployee] = useState("");
  const [benefitDate, setBenefitDate] = useState(new Date().toISOString().split('T')[0]);
  const [costCenterId, setCostCenterId] = useState("");
  const [description, setDescription] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, ccRes, benRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/employees?status=active`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/cost-centers`, { withCredentials: true }),
        axios.get(`${API}/api/settings/benefits-in-kind?limit=50`, { withCredentials: true })
      ]);
      setEmployees(empRes.data || []);
      setCostCenters(ccRes.data || []);
      setBenefits(benRes.data || []);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedEmployees(employees.map(e => e.employee_id));
    } else {
      setSelectedEmployees([]);
    }
  };

  const handleSelectEmployee = (empId, checked) => {
    if (checked) {
      setSelectedEmployees([...selectedEmployees, empId]);
    } else {
      setSelectedEmployees(selectedEmployees.filter(id => id !== empId));
    }
  };

  const handleSubmit = async () => {
    if (!selectedEmployees.length || !valuePerEmployee) return;
    
    setSubmitting(true);
    try {
      const costCenter = costCenters.find(cc => cc.cost_center_id === costCenterId);
      
      await axios.post(
        `${API}/api/settings/benefits-in-kind/bulk`,
        {
          employee_ids: selectedEmployees,
          benefit_type: benefitType,
          value_per_employee: parseFloat(valuePerEmployee),
          date: benefitDate,
          cost_center_id: costCenterId || null,
          cost_center_name: costCenter?.name || null,
          description: description || BENEFIT_TYPES.find(t => t.value === benefitType)?.label
        },
        { withCredentials: true }
      );
      
      setShowDialog(false);
      setSelectedEmployees([]);
      setValuePerEmployee("");
      setDescription("");
      fetchData();
      alert(isEs 
        ? `Beneficio registrado para ${selectedEmployees.length} empleados` 
        : `Benefit recorded for ${selectedEmployees.length} employees`);
    } catch (err) {
      console.error("Error recording benefits:", err);
      alert(err.response?.data?.detail || "Error recording benefits");
    }
    setSubmitting(false);
  };

  const totalValue = selectedEmployees.length * (parseFloat(valuePerEmployee) || 0);

  return (
    <div className="space-y-6" data-testid="benefits-in-kind-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Gift className="w-5 h-5" />
            {isEs ? "Beneficios en Especie" : "Benefits in Kind"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs 
              ? "Registra almuerzos, transporte y otros beneficios para empleados" 
              : "Record meals, transport and other benefits for employees"}
          </p>
        </div>
        <Button onClick={() => setShowDialog(true)} data-testid="register-benefit-btn">
          <Plus className="w-4 h-4 mr-2" />
          {isEs ? "Registrar Beneficio" : "Record Benefit"}
        </Button>
      </div>

      {/* Info Banner */}
      <div className="p-3 rounded-lg border border-pink-200 bg-pink-50 flex items-center gap-2">
        <Building2 className="w-4 h-4 text-pink-600 flex-shrink-0" />
        <p className="text-sm text-pink-800">
          {isEs 
            ? "Los beneficios se registran en el historial del empleado y como gasto del Cost Center seleccionado." 
            : "Benefits are recorded in employee history and as an expense to the selected Cost Center."}
        </p>
      </div>

      {/* Recent Benefits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isEs ? "Beneficios Recientes" : "Recent Benefits"}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : benefits.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Gift className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{isEs ? "No hay beneficios registrados" : "No benefits recorded"}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                  <TableHead>{isEs ? "Empleado" : "Employee"}</TableHead>
                  <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                  <TableHead>{isEs ? "Cost Center" : "Cost Center"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Valor" : "Value"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {benefits.slice(0, 20).map((b) => {
                  const typeConfig = BENEFIT_TYPES.find(t => t.value === b.benefit_type) || BENEFIT_TYPES[3];
                  const Icon = typeConfig.icon;
                  return (
                    <TableRow key={b.benefit_log_id}>
                      <TableCell>{b.date}</TableCell>
                      <TableCell>{b.employee_name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-pink-500" />
                          {isEs ? typeConfig.label : typeConfig.labelEn}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{b.cost_center_name || "-"}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(b.value)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Registration Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEs ? "Registrar Beneficio en Especie" : "Record Benefit in Kind"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Benefit Type & Amount Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Tipo de Beneficio" : "Benefit Type"}</Label>
                <Select value={benefitType} onValueChange={setBenefitType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BENEFIT_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {isEs ? type.label : type.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isEs ? "Valor por Empleado" : "Value per Employee"}</Label>
                <Input
                  type="number"
                  min="0"
                  step="10"
                  value={valuePerEmployee}
                  onChange={(e) => setValuePerEmployee(e.target.value)}
                  placeholder="250"
                />
              </div>
            </div>

            {/* Date & Cost Center Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Fecha" : "Date"}</Label>
                <Input
                  type="date"
                  value={benefitDate}
                  onChange={(e) => setBenefitDate(e.target.value)}
                />
              </div>
              <div>
                <Label>{isEs ? "Cost Center (Cargo)" : "Cost Center (Charge to)"}</Label>
                <Select value={costCenterId || "unassigned"} onValueChange={(v) => setCostCenterId(v === "unassigned" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">{isEs ? "Sin asignar" : "Unassigned"}</SelectItem>
                    {costCenters.map(cc => (
                      <SelectItem key={cc.cost_center_id} value={cc.cost_center_id}>
                        {cc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div>
              <Label>{isEs ? "Descripción (Opcional)" : "Description (Optional)"}</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={isEs ? "Ej: Almuerzo del día" : "Ex: Daily lunch"}
              />
            </div>

            {/* Employee Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{isEs ? "Seleccionar Empleados" : "Select Employees"}</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedEmployees.length === employees.length && employees.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">
                    {isEs ? "Seleccionar todos" : "Select all"}
                  </span>
                </div>
              </div>
              
              <div className="border rounded-lg max-h-48 overflow-y-auto">
                {employees.map(emp => (
                  <div 
                    key={emp.employee_id}
                    className="flex items-center gap-3 p-2 hover:bg-muted/50 border-b last:border-b-0"
                  >
                    <Checkbox
                      checked={selectedEmployees.includes(emp.employee_id)}
                      onCheckedChange={(checked) => handleSelectEmployee(emp.employee_id, checked)}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{emp.full_name}</p>
                      <p className="text-xs text-muted-foreground">{emp.department}</p>
                    </div>
                    {selectedEmployees.includes(emp.employee_id) && (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            {selectedEmployees.length > 0 && valuePerEmployee && (
              <div className="p-4 rounded-lg bg-pink-50 border border-pink-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-pink-700">
                      <Users className="w-4 h-4 inline mr-1" />
                      {selectedEmployees.length} {isEs ? "empleados seleccionados" : "employees selected"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">{isEs ? "Total" : "Total"}</p>
                    <p className="text-xl font-bold text-pink-700">{formatCurrency(totalValue)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={submitting || !selectedEmployees.length || !valuePerEmployee}
            >
              {submitting && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              {isEs ? "Registrar Beneficio" : "Record Benefit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
