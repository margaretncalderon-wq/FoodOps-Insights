import { useState, useEffect } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Textarea } from "../ui/textarea";
import { Plus, RefreshCw, FileText, BarChart3, Target, AlertTriangle } from "lucide-react";

import { API_BASE as API } from "../../utils/api";
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Expense Categories Section (formerly Fixed Costs)
// Supports: Variable, Operating, and Investment expense types

const CATEGORY_TYPES = {
  variable: { label: "Variable", labelEs: "Variable", color: "bg-blue-100 text-blue-700", description: "Food Cost, Variable Staff, Logistics" },
  operating: { label: "Operating", labelEs: "Operativo", color: "bg-amber-100 text-amber-700", description: "Rent, Utilities, Salaries, Software" },
  investment: { label: "Investment", labelEs: "Inversión", color: "bg-violet-100 text-violet-700", description: "Marketing, R&D, Equipment, Training" }
};

export function FixedCostsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [activeTab, setActiveTab] = useState("analysis");
  const [categories, setCategories] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [costCenters, setCostCenters] = useState([]);
  const [typeFilter, setTypeFilter] = useState("all");
  
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({ 
    name: "", 
    description: "", 
    category_type: "operating",
    target_percent: "",
    active: true, 
    cost_center_id: "" 
  });
  const [budgetForm, setBudgetForm] = useState({ category_id: "", period: "MONTHLY", budget_amount: 0, start_date: "", notes: "" });
  
  const [selectedPeriod, setSelectedPeriod] = useState("MONTHLY");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [catRes, budRes, analysisRes, ccRes] = await Promise.all([
        axios.get(`${API}/api/business-clarity/fixed-costs/categories`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/fixed-costs/budgets`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/fixed-costs/analysis?period=${selectedPeriod}&year=${selectedYear}&month=${selectedMonth}`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/cost-centers`, { withCredentials: true })
      ]);
      setCategories(catRes.data || []);
      setBudgets(budRes.data || []);
      setAnalysis(analysisRes.data);
      setCostCenters(ccRes.data || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [selectedPeriod, selectedYear, selectedMonth]);

  const handleSaveCategory = async () => {
    try {
      const payload = {
        ...categoryForm,
        target_percent: categoryForm.target_percent ? parseFloat(categoryForm.target_percent) : null
      };
      
      if (editingCategory) {
        await axios.put(`${API}/api/business-clarity/fixed-costs/categories/${editingCategory.category_id}`, payload, { withCredentials: true });
        toast.success(isEs ? "Categoría actualizada" : "Category updated");
      } else {
        await axios.post(`${API}/api/business-clarity/fixed-costs/categories`, payload, { withCredentials: true });
        toast.success(isEs ? "Categoría creada" : "Category created");
      }
      setCategoryDialogOpen(false);
      setEditingCategory(null);
      setCategoryForm({ name: "", description: "", category_type: "operating", target_percent: "", active: true, cost_center_id: "" });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!window.confirm(isEs ? "¿Eliminar esta categoría?" : "Delete this category?")) return;
    try {
      await axios.delete(`${API}/api/business-clarity/fixed-costs/categories/${categoryId}`, { withCredentials: true });
      toast.success(isEs ? "Categoría eliminada" : "Category deleted");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleSaveBudget = async () => {
    try {
      await axios.post(`${API}/api/business-clarity/fixed-costs/budgets`, budgetForm, { withCredentials: true });
      toast.success(isEs ? "Presupuesto guardado" : "Budget saved");
      setBudgetDialogOpen(false);
      setBudgetForm({ category_id: "", period: "MONTHLY", budget_amount: 0, start_date: "", notes: "" });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "OVER_BUDGET":
        return <Badge className="bg-red-600">{isEs ? "Sobre Presupuesto" : "Over Budget"}</Badge>;
      case "WARNING":
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800">{isEs ? "Advertencia" : "Warning"}</Badge>;
      case "NO_BUDGET":
        return <Badge variant="outline">{isEs ? "Sin Presupuesto" : "No Budget"}</Badge>;
      default:
        return <Badge className="bg-green-600">OK</Badge>;
    }
  };

  const PERIODS = [
    { value: "MONTHLY", label: isEs ? "Mensual" : "Monthly" },
    { value: "QUARTERLY", label: isEs ? "Trimestral" : "Quarterly" },
    { value: "YEARLY", label: isEs ? "Anual" : "Yearly" },
  ];

  const MONTHS = [
    { value: 1, label: isEs ? "Enero" : "January" },
    { value: 2, label: isEs ? "Febrero" : "February" },
    { value: 3, label: isEs ? "Marzo" : "March" },
    { value: 4, label: isEs ? "Abril" : "April" },
    { value: 5, label: isEs ? "Mayo" : "May" },
    { value: 6, label: isEs ? "Junio" : "June" },
    { value: 7, label: isEs ? "Julio" : "July" },
    { value: 8, label: isEs ? "Agosto" : "August" },
    { value: 9, label: isEs ? "Septiembre" : "September" },
    { value: 10, label: isEs ? "Octubre" : "October" },
    { value: 11, label: isEs ? "Noviembre" : "November" },
    { value: 12, label: isEs ? "Diciembre" : "December" },
  ];

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Target className="w-5 h-5" />
            {isEs ? "Categorías de Gastos & Presupuestos" : "Expense Categories & Budgets"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Categoriza gastos y monitorea contra objetivos" : "Categorize expenses and track against targets"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={activeTab === "analysis" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("analysis")}>
            <BarChart3 className="w-4 h-4 mr-2" />
            {isEs ? "Análisis" : "Analysis"}
          </Button>
          <Button variant={activeTab === "setup" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("setup")}>
            <FileText className="w-4 h-4 mr-2" />
            {isEs ? "Configuración" : "Setup"}
          </Button>
        </div>
      </div>

      {analysis?.insights && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200">
            <CardContent className="pt-4">
              <p className="text-xs text-slate-600">{isEs ? "Gastos Totales (Período)" : "Total Expenses (Period)"}</p>
              <p className="text-2xl font-bold text-slate-800">{formatCurrency(analysis.insights.total_fixed_costs)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="pt-4">
              <p className="text-xs text-blue-600">{isEs ? "Promedio por Evento" : "Avg per Event"}</p>
              <p className="text-2xl font-bold text-blue-800">{formatCurrency(analysis.insights.avg_fixed_per_event)}</p>
              <p className="text-xs text-blue-500">{analysis.insights.events_in_period} {isEs ? "eventos" : "events"}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
            <CardContent className="pt-4">
              <p className="text-xs text-amber-600">{isEs ? "Break-even por Evento" : "Break-even per Event"}</p>
              <p className="text-2xl font-bold text-amber-800">{formatCurrency(analysis.insights.break_even_revenue_per_event)}</p>
              <p className="text-xs text-amber-500">{isEs ? "Ingresos mínimos" : "Min revenue"}</p>
            </CardContent>
          </Card>
          <Card className={`bg-gradient-to-br ${analysis.summary?.overall_status === "OVER_BUDGET" ? "from-red-50 to-red-100 border-red-200" : analysis.summary?.overall_status === "WARNING" ? "from-amber-50 to-amber-100 border-amber-200" : "from-green-50 to-green-100 border-green-200"}`}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{isEs ? "Varianza Total" : "Total Variance"}</p>
              <p className={`text-2xl font-bold ${(analysis.summary?.total_variance || 0) >= 0 ? "text-green-700" : "text-red-700"}`}>
                {formatCurrency(Math.abs(analysis.summary?.total_variance || 0))}
              </p>
              <p className="text-xs">{(analysis.summary?.total_variance || 0) >= 0 ? (isEs ? "bajo presupuesto" : "under budget") : (isEs ? "sobre presupuesto" : "over budget")}</p>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* By Type Summary */}
      {analysis?.by_type && (
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(CATEGORY_TYPES).map(([type, config]) => (
            <Card key={type} className="border-l-4" style={{ borderLeftColor: type === 'variable' ? '#3b82f6' : type === 'operating' ? '#f59e0b' : '#8b5cf6' }}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{isEs ? config.labelEs : config.label}</p>
                    <p className="text-xl font-bold">{formatCurrency(analysis.by_type[type]?.actual || 0)}</p>
                  </div>
                  <Badge className={config.color}>{analysis.by_type[type]?.category_count || 0}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isEs ? "Presupuesto:" : "Budget:"} {formatCurrency(analysis.by_type[type]?.budgeted || 0)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === "analysis" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex gap-4 items-center flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">{isEs ? "Período:" : "Period:"}</Label>
                  <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERIODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">{isEs ? "Año:" : "Year:"}</Label>
                  <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {selectedPeriod === "MONTHLY" && (
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">{isEs ? "Mes:" : "Month:"}</Label>
                    <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONTHS.map(m => <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={fetchData}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {isEs ? "Actualizar" : "Refresh"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{isEs ? "Presupuesto vs Real por Categoría" : "Budget vs Actual by Category"}</CardTitle>
              <CardDescription>
                {analysis?.date_range && (
                  <span>
                    {new Date(analysis.date_range.start).toLocaleDateString()} - {new Date(analysis.date_range.end).toLocaleDateString()}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Presupuestado" : "Budgeted"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Real" : "Actual"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Varianza" : "Variance"}</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(analysis?.categories || []).map(cat => (
                    <TableRow key={cat.category_id} className={cat.status === "OVER_BUDGET" ? "bg-red-50/50" : cat.status === "WARNING" ? "bg-amber-50/30" : ""}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{cat.category_name}</p>
                          {cat.description && <p className="text-xs text-muted-foreground">{cat.description}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(cat.budgeted)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(cat.actual)}</TableCell>
                      <TableCell className={`text-right font-mono ${cat.variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {cat.variance >= 0 ? "+" : ""}{formatCurrency(cat.variance)}
                      </TableCell>
                      <TableCell className={`text-right ${cat.variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {cat.variance_percent >= 0 ? "+" : ""}{cat.variance_percent}%
                      </TableCell>
                      <TableCell>{getStatusBadge(cat.status)}</TableCell>
                    </TableRow>
                  ))}
                  {(analysis?.categories || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {isEs ? "Configura categorías y presupuestos para ver el análisis" : "Set up categories and budgets to see analysis"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {analysis?.summary && (analysis?.categories || []).length > 0 && (
            <Card className="bg-slate-50 border-slate-200">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex gap-8">
                    <div>
                      <p className="text-xs text-muted-foreground">{isEs ? "Total Presupuestado" : "Total Budgeted"}</p>
                      <p className="text-lg font-bold">{formatCurrency(analysis.summary.total_budgeted)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{isEs ? "Total Real" : "Total Actual"}</p>
                      <p className="text-lg font-bold">{formatCurrency(analysis.summary.total_actual)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{isEs ? "Varianza" : "Variance"}</p>
                      <p className={`text-lg font-bold ${analysis.summary.total_variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {analysis.summary.total_variance >= 0 ? "+" : ""}{formatCurrency(analysis.summary.total_variance)} ({analysis.summary.variance_percent}%)
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(analysis.summary.overall_status)}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "setup" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{isEs ? "Categorías de Costos Fijos" : "Fixed Cost Categories"}</CardTitle>
                <Button size="sm" onClick={() => { setEditingCategory(null); setCategoryForm({ name: "", description: "", category_type: "operating", target_percent: "", active: true, cost_center_id: "" }); setCategoryDialogOpen(true); }}>
                  <Plus className="w-4 h-4 mr-1" />
                  {isEs ? "Agregar" : "Add"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                    <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                    <TableHead>{isEs ? "Meta %" : "Target %"}</TableHead>
                    <TableHead>{isEs ? "Centro de Costo" : "Cost Center"}</TableHead>
                    <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map(cat => (
                    <TableRow key={cat.category_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{cat.name}</p>
                          {cat.description && <p className="text-xs text-muted-foreground">{cat.description}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={CATEGORY_TYPES[cat.category_type || "operating"]?.color || "bg-gray-100"}>
                          {isEs ? CATEGORY_TYPES[cat.category_type || "operating"]?.labelEs : CATEGORY_TYPES[cat.category_type || "operating"]?.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {cat.target_percent ? (
                          <span className="text-sm font-medium">{cat.target_percent}%</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {cat.cost_center_name ? (
                          <Badge variant="outline" className="bg-blue-50">{cat.cost_center_name}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cat.active ? "default" : "secondary"}>
                          {cat.active ? (isEs ? "Activa" : "Active") : (isEs ? "Inactiva" : "Inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => { 
                            setEditingCategory(cat); 
                            setCategoryForm({ 
                              name: cat.name, 
                              description: cat.description || "", 
                              category_type: cat.category_type || "operating",
                              target_percent: cat.target_percent || "",
                              active: cat.active, 
                              cost_center_id: cat.cost_center_id || "" 
                            }); 
                            setCategoryDialogOpen(true); 
                          }}>
                            <FileText className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleDeleteCategory(cat.category_id)}>
                            <AlertTriangle className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {categories.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {isEs ? "Sin categorías" : "No categories"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{isEs ? "Presupuestos" : "Budgets"}</CardTitle>
                <Button size="sm" onClick={() => { setBudgetForm({ category_id: "", period: "MONTHLY", budget_amount: 0, start_date: new Date().toISOString().split("T")[0], notes: "" }); setBudgetDialogOpen(true); }}>
                  <Plus className="w-4 h-4 mr-1" />
                  {isEs ? "Agregar" : "Add"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
                    <TableHead>{isEs ? "Período" : "Period"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Monto" : "Amount"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgets.map(bud => (
                    <TableRow key={bud.budget_id}>
                      <TableCell className="font-medium">{bud.category_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{bud.period}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(bud.budget_amount)}</TableCell>
                    </TableRow>
                  ))}
                  {budgets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        {isEs ? "Sin presupuestos" : "No budgets"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? (isEs ? "Editar Categoría" : "Edit Category") : (isEs ? "Nueva Categoría de Gasto" : "New Expense Category")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"}</Label>
              <Input value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} placeholder={isEs ? "Ej: Costo de Alimentos, Nómina, Marketing" : "E.g. Food Cost, Payroll, Marketing"} />
            </div>
            <div>
              <Label>{isEs ? "Descripción" : "Description"}</Label>
              <Textarea value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} placeholder={isEs ? "Descripción opcional..." : "Optional description..."} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Tipo de Categoría" : "Category Type"}</Label>
                <Select value={categoryForm.category_type || "operating"} onValueChange={(v) => setCategoryForm({ ...categoryForm, category_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_TYPES).map(([value, config]) => (
                      <SelectItem key={value} value={value}>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${config.color}`}>
                            {isEs ? config.labelEs : config.label}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {CATEGORY_TYPES[categoryForm.category_type || "operating"]?.description}
                </p>
              </div>
              <div>
                <Label>{isEs ? "Meta % de Ingresos (opcional)" : "Target % of Revenue (optional)"}</Label>
                <div className="flex items-center gap-2">
                  <Input 
                    type="number" 
                    step="0.1" 
                    value={categoryForm.target_percent} 
                    onChange={(e) => setCategoryForm({ ...categoryForm, target_percent: e.target.value })} 
                    placeholder="30"
                    className="w-24"
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isEs ? "Ej: Food Cost debería ser 30%" : "E.g. Food Cost should be 30%"}
                </p>
              </div>
            </div>
            <div>
              <Label>{isEs ? "Centro de Costo (opcional)" : "Cost Center (optional)"}</Label>
              <Select value={categoryForm.cost_center_id || "none"} onValueChange={(v) => setCategoryForm({ ...categoryForm, cost_center_id: v === "none" ? null : v })}>
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar centro de costo..." : "Select cost center..."} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isEs ? "Sin vincular" : "Not linked"}</SelectItem>
                  {costCenters.map(cc => (
                    <SelectItem key={cc.cost_center_id} value={cc.cost_center_id}>
                      {cc.code ? `${cc.code} - ` : ""}{cc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {isEs ? "Los gastos de esta categoría se reflejarán en el centro de costo seleccionado" : "Expenses in this category will be reflected in the selected cost center"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="active" checked={categoryForm.active} onChange={(e) => setCategoryForm({ ...categoryForm, active: e.target.checked })} />
              <Label htmlFor="active">{isEs ? "Activa" : "Active"}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleSaveCategory}>{isEs ? "Guardar" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Nuevo Presupuesto" : "New Budget"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Categoría" : "Category"}</Label>
              <Select value={budgetForm.category_id} onValueChange={(v) => setBudgetForm({ ...budgetForm, category_id: v })}>
                <SelectTrigger><SelectValue placeholder={isEs ? "Selecciona categoría..." : "Select category..."} /></SelectTrigger>
                <SelectContent>
                  {categories.filter(c => c.active).map(c => (
                    <SelectItem key={c.category_id} value={c.category_id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isEs ? "Período" : "Period"}</Label>
              <Select value={budgetForm.period} onValueChange={(v) => setBudgetForm({ ...budgetForm, period: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isEs ? "Monto Presupuestado" : "Budget Amount"}</Label>
              <Input type="number" step="0.01" value={budgetForm.budget_amount} onChange={(e) => setBudgetForm({ ...budgetForm, budget_amount: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>{isEs ? "Fecha Inicio" : "Start Date"}</Label>
              <Input type="date" value={budgetForm.start_date} onChange={(e) => setBudgetForm({ ...budgetForm, start_date: e.target.value })} />
            </div>
            <div>
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Textarea value={budgetForm.notes} onChange={(e) => setBudgetForm({ ...budgetForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleSaveBudget} disabled={!budgetForm.category_id}>{isEs ? "Guardar" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
