import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
  Building2, Plus, Edit2, Trash2, RefreshCw, Download,
  DollarSign, Users, CheckCircle, AlertCircle, Calendar, BarChart3
} from "lucide-react";
import { toast } from "sonner";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const MONTHS = [
  { value: 1, label: "January", labelEs: "Enero" },
  { value: 2, label: "February", labelEs: "Febrero" },
  { value: 3, label: "March", labelEs: "Marzo" },
  { value: 4, label: "April", labelEs: "Abril" },
  { value: 5, label: "May", labelEs: "Mayo" },
  { value: 6, label: "June", labelEs: "Junio" },
  { value: 7, label: "July", labelEs: "Julio" },
  { value: 8, label: "August", labelEs: "Agosto" },
  { value: 9, label: "September", labelEs: "Septiembre" },
  { value: 10, label: "October", labelEs: "Octubre" },
  { value: 11, label: "November", labelEs: "Noviembre" },
  { value: 12, label: "December", labelEs: "Diciembre" },
];

const QUARTERS = [
  { value: 1, label: "Q1 (Jan-Mar)", labelEs: "T1 (Ene-Mar)" },
  { value: 2, label: "Q2 (Apr-Jun)", labelEs: "T2 (Abr-Jun)" },
  { value: 3, label: "Q3 (Jul-Sep)", labelEs: "T3 (Jul-Sep)" },
  { value: 4, label: "Q4 (Oct-Dec)", labelEs: "T4 (Oct-Dic)" },
];

export function CostCentersSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [costCenters, setCostCenters] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [editingCC, setEditingCC] = useState(null);
  const [selectedCCForBudget, setSelectedCCForBudget] = useState(null);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    annual_budget: ""
  });

  const [budgetForm, setBudgetForm] = useState({
    budget_type: "annual",
    year: new Date().getFullYear(),
    period: 1,
    amount: ""
  });

  const [budgetData, setBudgetData] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ccRes, templatesRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/cost-centers`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/cost-centers/templates`, { withCredentials: true })
      ]);
      setCostCenters(ccRes.data);
      setTemplates(templatesRes.data);
    } catch (err) {
      console.error("Error fetching cost centers:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreateDialog = (template = null) => {
    if (template) {
      setFormData({
        name: template.name,
        code: template.code,
        description: template.description,
        annual_budget: ""
      });
    } else {
      setFormData({ name: "", code: "", description: "", annual_budget: "" });
    }
    setEditingCC(null);
    setDialogOpen(true);
  };

  const openEditDialog = (cc) => {
    setFormData({
      name: cc.name,
      code: cc.code || "",
      description: cc.description || "",
      annual_budget: cc.annual_budget || ""
    });
    setEditingCC(cc);
    setDialogOpen(true);
  };

  const openBudgetDialog = async (cc) => {
    setSelectedCCForBudget(cc);
    setBudgetForm({
      budget_type: "annual",
      year: new Date().getFullYear(),
      period: 1,
      amount: cc.annual_budget || ""
    });
    
    // Fetch budget data
    try {
      const res = await axios.get(
        `${API}/api/people-ops/cost-centers/${cc.cost_center_id}/budgets?year=${new Date().getFullYear()}`,
        { withCredentials: true }
      );
      setBudgetData(res.data);
    } catch (err) {
      setBudgetData(null);
    }
    
    setBudgetDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast.error(isEs ? "El nombre es requerido" : "Name is required");
      return;
    }
    
    setSaving(true);
    try {
      const payload = {
        ...formData,
        annual_budget: formData.annual_budget ? parseFloat(formData.annual_budget) : null
      };
      
      if (editingCC) {
        await axios.put(
          `${API}/api/people-ops/cost-centers/${editingCC.cost_center_id}`,
          payload,
          { withCredentials: true }
        );
        toast.success(isEs ? "Cost center actualizado" : "Cost center updated");
      } else {
        await axios.post(
          `${API}/api/people-ops/cost-centers`,
          payload,
          { withCredentials: true }
        );
        toast.success(isEs ? "Cost center creado" : "Cost center created");
      }
      
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      console.error("Error saving cost center:", err);
      toast.error(err.response?.data?.detail || "Error saving cost center");
    }
    setSaving(false);
  };

  const handleSaveBudget = async () => {
    if (!budgetForm.amount || isNaN(parseFloat(budgetForm.amount))) {
      toast.error(isEs ? "Ingrese un monto válido" : "Enter a valid amount");
      return;
    }
    
    setSaving(true);
    try {
      await axios.put(
        `${API}/api/people-ops/cost-centers/${selectedCCForBudget.cost_center_id}/budget`,
        {
          budget_type: budgetForm.budget_type,
          year: budgetForm.year,
          period: budgetForm.budget_type !== "annual" ? budgetForm.period : null,
          amount: parseFloat(budgetForm.amount)
        },
        { withCredentials: true }
      );
      
      toast.success(isEs ? "Presupuesto actualizado" : "Budget updated");
      
      // Refresh budget data
      const res = await axios.get(
        `${API}/api/people-ops/cost-centers/${selectedCCForBudget.cost_center_id}/budgets?year=${budgetForm.year}`,
        { withCredentials: true }
      );
      setBudgetData(res.data);
      fetchData();
    } catch (err) {
      console.error("Error saving budget:", err);
      toast.error(err.response?.data?.detail || "Error saving budget");
    }
    setSaving(false);
  };

  const handleDelete = async (cc) => {
    if (!window.confirm(isEs 
      ? `¿Eliminar cost center "${cc.name}"?` 
      : `Delete cost center "${cc.name}"?`
    )) return;
    
    try {
      await axios.delete(
        `${API}/api/people-ops/cost-centers/${cc.cost_center_id}`,
        { withCredentials: true }
      );
      toast.success(isEs ? "Cost center eliminado" : "Cost center deleted");
      fetchData();
    } catch (err) {
      console.error("Error deleting cost center:", err);
      toast.error(err.response?.data?.detail || "Error deleting cost center");
    }
  };

  const initializeTemplates = async () => {
    try {
      const res = await axios.post(
        `${API}/api/people-ops/cost-centers/initialize-templates`,
        {},
        { withCredentials: true }
      );
      fetchData();
      toast.success(isEs 
        ? `Se crearon ${res.data.created?.length || 0} cost centers` 
        : `Created ${res.data.created?.length || 0} cost centers`
      );
    } catch (err) {
      console.error("Error initializing templates:", err);
    }
  };

  // Calculate totals
  const totalBudget = costCenters.reduce((sum, cc) => sum + (cc.annual_budget || 0), 0);
  const totalSpend = costCenters.reduce((sum, cc) => sum + (cc.current_spend || 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Building2 className="w-4 h-4" />
              {isEs ? "Total Cost Centers" : "Total Cost Centers"}
            </div>
            <p className="text-2xl font-bold mt-1">{costCenters.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <DollarSign className="w-4 h-4" />
              {isEs ? "Presupuesto Total" : "Total Budget"}
            </div>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totalBudget)}</p>
            <p className="text-xs text-muted-foreground">{isEs ? "Anual" : "Annual"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <BarChart3 className="w-4 h-4" />
              {isEs ? "Gasto Actual" : "Current Spend"}
            </div>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totalSpend)}</p>
            {totalBudget > 0 && (
              <Progress value={(totalSpend / totalBudget) * 100} className="h-1.5 mt-2" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{isEs ? "Cost Centers" : "Cost Centers"}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          {costCenters.length === 0 && (
            <Button variant="outline" onClick={initializeTemplates}>
              <Download className="w-4 h-4 mr-2" />
              {isEs ? "Cargar Plantillas" : "Load Templates"}
            </Button>
          )}
          <Button onClick={() => openCreateDialog()} data-testid="add-cost-center-btn">
            <Plus className="w-4 h-4 mr-2" />
            {isEs ? "Nuevo Cost Center" : "New Cost Center"}
          </Button>
        </div>
      </div>

      {/* Template Suggestions */}
      {costCenters.length === 0 && templates.length > 0 && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">{isEs ? "Plantillas Sugeridas" : "Suggested Templates"}</CardTitle>
            <CardDescription>
              {isEs 
                ? "Haz clic en una plantilla para crear el cost center, o crea uno personalizado"
                : "Click a template to create the cost center, or create a custom one"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {templates.map((template, idx) => (
                <Button 
                  key={idx} 
                  variant="outline" 
                  size="sm"
                  onClick={() => openCreateDialog(template)}
                >
                  {template.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cost Centers Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : costCenters.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{isEs ? "No hay cost centers configurados" : "No cost centers configured"}</p>
              <p className="text-sm mt-1">
                {isEs ? "Crea uno nuevo o carga las plantillas predefinidas" : "Create a new one or load predefined templates"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                  <TableHead>{isEs ? "Código" : "Code"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Presupuesto Anual" : "Annual Budget"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Gasto Actual" : "Current Spend"}</TableHead>
                  <TableHead>{isEs ? "Utilización" : "Utilization"}</TableHead>
                  <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costCenters.map((cc) => {
                  const utilization = cc.annual_budget > 0 
                    ? (cc.current_spend / cc.annual_budget) * 100 
                    : 0;
                  const isOverBudget = utilization > 100;
                  
                  return (
                    <TableRow key={cc.cost_center_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{cc.name}</p>
                          {cc.description && (
                            <p className="text-xs text-muted-foreground">{cc.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {cc.code && (
                          <Badge variant="outline" className="font-mono">{cc.code}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {cc.annual_budget ? formatCurrency(cc.annual_budget) : "-"}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(cc.current_spend)}</TableCell>
                      <TableCell>
                        {cc.annual_budget > 0 ? (
                          <div className="flex items-center gap-2">
                            <Progress 
                              value={Math.min(utilization, 100)} 
                              className={`h-2 w-20 ${isOverBudget ? '[&>div]:bg-red-500' : ''}`}
                            />
                            <span className={`text-sm ${isOverBudget ? 'text-red-600 font-medium' : ''}`}>
                              {utilization.toFixed(0)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cc.is_active ? "default" : "secondary"}>
                          {cc.is_active ? (isEs ? "Activo" : "Active") : (isEs ? "Inactivo" : "Inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openBudgetDialog(cc)} title={isEs ? "Editar Presupuesto" : "Edit Budget"}>
                            <Calendar className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(cc)}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleDelete(cc)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCC 
                ? (isEs ? "Editar Cost Center" : "Edit Cost Center")
                : (isEs ? "Nuevo Cost Center" : "New Cost Center")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>{isEs ? "Nombre *" : "Name *"}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={isEs ? "Ej: Marketing, IT, Operaciones..." : "E.g.: Marketing, IT, Operations..."}
              />
            </div>
            <div>
              <Label>{isEs ? "Código" : "Code"}</Label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder={isEs ? "Ej: MKT, IT, OPS..." : "E.g.: MKT, IT, OPS..."}
                maxLength={10}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {isEs ? "Código corto para reportes contables" : "Short code for accounting reports"}
              </p>
            </div>
            <div>
              <Label>{isEs ? "Descripción" : "Description"}</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={isEs ? "Descripción opcional..." : "Optional description..."}
              />
            </div>
            <div>
              <Label>{isEs ? "Presupuesto Anual" : "Annual Budget"}</Label>
              <Input
                type="number"
                value={formData.annual_budget}
                onChange={(e) => setFormData({ ...formData, annual_budget: e.target.value })}
                placeholder="0.00"
                min="0"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {isEs ? "Puedes editar presupuestos detallados después de crear" : "You can edit detailed budgets after creating"}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              {editingCC ? (isEs ? "Guardar" : "Save") : (isEs ? "Crear" : "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Budget Edit Dialog */}
      <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              {isEs ? "Editar Presupuesto" : "Edit Budget"}: {selectedCCForBudget?.name}
            </DialogTitle>
            <DialogDescription>
              {isEs 
                ? "Configura el presupuesto por año, trimestre o mes" 
                : "Configure budget by year, quarter, or month"}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={budgetForm.budget_type} onValueChange={(v) => setBudgetForm({ ...budgetForm, budget_type: v, amount: "" })}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="annual">{isEs ? "Anual" : "Annual"}</TabsTrigger>
              <TabsTrigger value="quarterly">{isEs ? "Trimestral" : "Quarterly"}</TabsTrigger>
              <TabsTrigger value="monthly">{isEs ? "Mensual" : "Monthly"}</TabsTrigger>
            </TabsList>

            <div className="mt-4 space-y-4">
              {/* Year Selector */}
              <div>
                <Label>{isEs ? "Año" : "Year"}</Label>
                <Select 
                  value={budgetForm.year.toString()} 
                  onValueChange={(v) => setBudgetForm({ ...budgetForm, year: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026, 2027].map(y => (
                      <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Period Selector (for quarterly/monthly) */}
              <TabsContent value="quarterly" className="mt-0">
                <div>
                  <Label>{isEs ? "Trimestre" : "Quarter"}</Label>
                  <Select 
                    value={budgetForm.period.toString()} 
                    onValueChange={(v) => setBudgetForm({ ...budgetForm, period: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUARTERS.map(q => (
                        <SelectItem key={q.value} value={q.value.toString()}>
                          {isEs ? q.labelEs : q.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="monthly" className="mt-0">
                <div>
                  <Label>{isEs ? "Mes" : "Month"}</Label>
                  <Select 
                    value={budgetForm.period.toString()} 
                    onValueChange={(v) => setBudgetForm({ ...budgetForm, period: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map(m => (
                        <SelectItem key={m.value} value={m.value.toString()}>
                          {isEs ? m.labelEs : m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              {/* Amount Input */}
              <div>
                <Label>{isEs ? "Monto del Presupuesto" : "Budget Amount"}</Label>
                <Input
                  type="number"
                  value={budgetForm.amount}
                  onChange={(e) => setBudgetForm({ ...budgetForm, amount: e.target.value })}
                  placeholder="0.00"
                  min="0"
                />
              </div>

              {/* Current Budget Info */}
              {budgetData && (
                <div className="p-3 bg-muted/50 rounded-lg text-sm">
                  <p className="font-medium mb-2">{isEs ? "Presupuesto Actual" : "Current Budget"} ({budgetData.year}):</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-muted-foreground">{isEs ? "Anual:" : "Annual:"}</span>
                      <span className="ml-2 font-medium">{formatCurrency(budgetData.annual_budget)}</span>
                    </div>
                    {budgetData.quarterly_budgets && Object.keys(budgetData.quarterly_budgets).length > 0 && (
                      <>
                        {Object.entries(budgetData.quarterly_budgets).sort().map(([key, val]) => (
                          <div key={key}>
                            <span className="text-muted-foreground">{key}:</span>
                            <span className="ml-2">{formatCurrency(val)}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setBudgetDialogOpen(false)}>
              {isEs ? "Cerrar" : "Close"}
            </Button>
            <Button onClick={handleSaveBudget} disabled={saving}>
              {saving && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              {isEs ? "Guardar Presupuesto" : "Save Budget"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
