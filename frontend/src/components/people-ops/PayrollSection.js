import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
  Wallet, Plus, Calendar, Users, DollarSign, 
  RefreshCw, Settings, FileText, ChevronRight,
  CheckCircle, Clock, AlertCircle, Ban
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => 
  `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_CONFIG = {
  draft: { 
    label: "Borrador", labelEn: "Draft", 
    icon: FileText, 
    color: "bg-gray-100 text-gray-700 border-gray-200" 
  },
  pending_approval: { 
    label: "Pendiente Aprobación", labelEn: "Pending Approval", 
    icon: Clock, 
    color: "bg-amber-100 text-amber-700 border-amber-200" 
  },
  approved: { 
    label: "Aprobada", labelEn: "Approved", 
    icon: CheckCircle, 
    color: "bg-blue-100 text-blue-700 border-blue-200" 
  },
  processing: { 
    label: "Procesando", labelEn: "Processing", 
    icon: RefreshCw, 
    color: "bg-purple-100 text-purple-700 border-purple-200" 
  },
  completed: { 
    label: "Completada", labelEn: "Completed", 
    icon: CheckCircle, 
    color: "bg-emerald-100 text-emerald-700 border-emerald-200" 
  },
  cancelled: { 
    label: "Cancelada", labelEn: "Cancelled", 
    icon: Ban, 
    color: "bg-red-100 text-red-700 border-red-200" 
  }
};

export function PayrollSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const navigate = useNavigate();
  
  const [periods, setPeriods] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // New period form
  const [newPeriod, setNewPeriod] = useState({
    period_name: "",
    period_type: "biweekly",
    start_date: "",
    end_date: "",
    payment_date: "",
    notes: ""
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [periodsRes, configRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/payroll/periods?limit=20`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/payroll/config`, { withCredentials: true })
      ]);
      setPeriods(periodsRes.data);
      setConfig(configRes.data);
    } catch (err) {
      console.error("Error fetching payroll data:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-generate period name
  const generatePeriodName = (startDate, periodType) => {
    if (!startDate) return "";
    const date = new Date(startDate);
    const month = date.toLocaleString(isEs ? "es" : "en", { month: "long" });
    const year = date.getFullYear();
    const day = date.getDate();
    
    if (periodType === "biweekly") {
      const half = day <= 15 ? "1" : "2";
      return isEs ? `Quincena ${half} - ${month} ${year}` : `Payroll ${half} - ${month} ${year}`;
    } else if (periodType === "monthly") {
      return isEs ? `Nómina ${month} ${year}` : `Payroll ${month} ${year}`;
    }
    return `${month} ${year}`;
  };

  // Auto-fill dates based on period type
  const handleStartDateChange = (value) => {
    const startDate = new Date(value);
    let endDate, paymentDate;
    
    if (newPeriod.period_type === "biweekly") {
      const day = startDate.getDate();
      if (day === 1) {
        endDate = new Date(startDate.getFullYear(), startDate.getMonth(), 15);
        paymentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 15);
      } else if (day === 16) {
        endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0); // Last day of month
        paymentDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      } else {
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 14);
        paymentDate = new Date(endDate);
      }
    } else {
      endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      paymentDate = new Date(endDate);
    }
    
    setNewPeriod({
      ...newPeriod,
      start_date: value,
      end_date: endDate.toISOString().split("T")[0],
      payment_date: paymentDate.toISOString().split("T")[0],
      period_name: generatePeriodName(value, newPeriod.period_type)
    });
  };

  const handleCreatePeriod = async () => {
    if (!newPeriod.period_name || !newPeriod.start_date || !newPeriod.end_date || !newPeriod.payment_date) {
      alert(isEs ? "Completa todos los campos requeridos" : "Complete all required fields");
      return;
    }
    
    setCreating(true);
    try {
      const res = await axios.post(
        `${API}/api/people-ops/payroll/periods`,
        newPeriod,
        { withCredentials: true }
      );
      setDialogOpen(false);
      setNewPeriod({
        period_name: "", period_type: "biweekly",
        start_date: "", end_date: "", payment_date: "", notes: ""
      });
      // Navigate to the new period
      navigate(`/people-ops/payroll/${res.data.period_id}`);
    } catch (err) {
      console.error("Error creating period:", err);
      alert(err.response?.data?.detail || "Error creating payroll period");
    }
    setCreating(false);
  };

  // Calculate summary stats
  const activePeriod = periods.find(p => ["draft", "pending_approval", "approved"].includes(p.status));
  const completedThisYear = periods.filter(p => 
    p.status === "completed" && 
    new Date(p.payment_date).getFullYear() === new Date().getFullYear()
  );
  const totalPaidThisYear = completedThisYear.reduce((sum, p) => sum + (p.total_net || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="payroll-section">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-violet-200 bg-violet-50/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-violet-600 text-sm">
              <Wallet className="w-4 h-4" />
              {isEs ? "Período Activo" : "Active Period"}
            </div>
            {activePeriod ? (
              <>
                <p className="font-semibold mt-1 truncate">{activePeriod.period_name}</p>
                <Badge className={`mt-1 text-xs ${STATUS_CONFIG[activePeriod.status]?.color}`}>
                  {isEs ? STATUS_CONFIG[activePeriod.status]?.label : STATUS_CONFIG[activePeriod.status]?.labelEn}
                </Badge>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">
                {isEs ? "Sin período activo" : "No active period"}
              </p>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Calendar className="w-4 h-4" />
              {isEs ? "Nóminas este Año" : "Payrolls this Year"}
            </div>
            <p className="text-2xl font-bold mt-1">{completedThisYear.length}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <DollarSign className="w-4 h-4" />
              {isEs ? "Pagado este Año" : "Paid this Year"}
            </div>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totalPaidThisYear)}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Settings className="w-4 h-4" />
              {isEs ? "Frecuencia" : "Frequency"}
            </div>
            <p className="text-lg font-semibold mt-1">
              {config?.payment_frequency === "biweekly" ? (isEs ? "Quincenal" : "Biweekly") :
               config?.payment_frequency === "monthly" ? (isEs ? "Mensual" : "Monthly") :
               (isEs ? "Semanal" : "Weekly")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {isEs ? "Historial de Nóminas" : "Payroll History"}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={() => setDialogOpen(true)} data-testid="new-payroll-btn">
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Nueva Nómina" : "New Payroll"}
          </Button>
        </div>
      </div>

      {/* Periods Table */}
      <Card>
        <CardContent className="p-0">
          {periods.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Wallet className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{isEs ? "No hay nóminas registradas" : "No payroll records"}</p>
              <Button variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {isEs ? "Crear Primera Nómina" : "Create First Payroll"}
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Período" : "Period"}</TableHead>
                  <TableHead>{isEs ? "Fecha de Pago" : "Payment Date"}</TableHead>
                  <TableHead className="text-center">{isEs ? "Empleados" : "Employees"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Total Bruto" : "Total Gross"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Total Neto" : "Total Net"}</TableHead>
                  <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((period) => {
                  const StatusIcon = STATUS_CONFIG[period.status]?.icon || FileText;
                  return (
                    <TableRow 
                      key={period.period_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/people-ops/payroll/${period.period_id}`)}
                      data-testid={`payroll-period-${period.period_id}`}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{period.period_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {period.start_date} → {period.end_date}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(period.payment_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{period.total_employees}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(period.total_gross)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-emerald-600">
                        {formatCurrency(period.total_net)}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs flex items-center gap-1 w-fit ${STATUS_CONFIG[period.status]?.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {isEs ? STATUS_CONFIG[period.status]?.label : STATUS_CONFIG[period.status]?.labelEn}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Period Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isEs ? "Crear Nueva Nómina" : "Create New Payroll"}
            </DialogTitle>
            <DialogDescription>
              {isEs 
                ? "Se generarán automáticamente las entradas para todos los empleados activos." 
                : "Entries will be automatically generated for all active employees."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Tipo de Período" : "Period Type"}</label>
              <Select 
                value={newPeriod.period_type} 
                onValueChange={(v) => setNewPeriod({ ...newPeriod, period_type: v })}
              >
                <SelectTrigger data-testid="period-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="biweekly">{isEs ? "Quincenal" : "Biweekly"}</SelectItem>
                  <SelectItem value="monthly">{isEs ? "Mensual" : "Monthly"}</SelectItem>
                  <SelectItem value="weekly">{isEs ? "Semanal" : "Weekly"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha Inicio *" : "Start Date *"}</label>
                <Input
                  type="date"
                  data-testid="period-start-date"
                  value={newPeriod.start_date}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Fecha Fin *" : "End Date *"}</label>
                <Input
                  type="date"
                  data-testid="period-end-date"
                  value={newPeriod.end_date}
                  onChange={(e) => setNewPeriod({ ...newPeriod, end_date: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">{isEs ? "Fecha de Pago *" : "Payment Date *"}</label>
              <Input
                type="date"
                data-testid="period-payment-date"
                value={newPeriod.payment_date}
                onChange={(e) => setNewPeriod({ ...newPeriod, payment_date: e.target.value })}
              />
            </div>

            <div>
              <label className="text-sm font-medium">{isEs ? "Nombre del Período *" : "Period Name *"}</label>
              <Input
                data-testid="period-name-input"
                value={newPeriod.period_name}
                onChange={(e) => setNewPeriod({ ...newPeriod, period_name: e.target.value })}
                placeholder={isEs ? "Ej: Quincena 1 - Enero 2026" : "E.g.: Payroll 1 - January 2026"}
              />
            </div>

            <div>
              <label className="text-sm font-medium">{isEs ? "Notas (opcional)" : "Notes (optional)"}</label>
              <Input
                value={newPeriod.notes}
                onChange={(e) => setNewPeriod({ ...newPeriod, notes: e.target.value })}
                placeholder={isEs ? "Observaciones..." : "Observations..."}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleCreatePeriod} disabled={creating} data-testid="create-period-btn">
              {creating ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              {isEs ? "Crear y Ver Nómina" : "Create & View Payroll"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
