import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import {
  TrendingUp, TrendingDown, RefreshCw, DollarSign, 
  Receipt, Users, Package, Building2, ArrowUpRight, ArrowDownRight,
  Wallet, PieChart as PieChartIcon, AlertTriangle, AlertCircle, Bell,
  ArrowUpCircle, ArrowDownCircle, Banknote, Scale
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, ComposedChart
} from "recharts";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const formatCurrencyK = (amount) => {
  if (Math.abs(amount) >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return formatCurrency(amount);
};

const COST_COLORS = {
  payroll: "#8b5cf6",
  purchases: "#3b82f6", 
  expenses: "#f59e0b",
  inventory_cost: "#10b981"
};

const COST_LABELS = {
  payroll: { es: "Nómina", en: "Payroll" },
  purchases: { es: "Compras", en: "Purchases" },
  expenses: { es: "Gastos", en: "Expenses" },
  inventory_cost: { es: "Inventario", en: "Inventory" }
};

const COST_ICONS = {
  payroll: Users,
  purchases: Receipt,
  expenses: DollarSign,
  inventory_cost: Package
};

export function ProfitLossDashboard() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [plData, setPlData] = useState(null);
  const [costCenterData, setCostCenterData] = useState(null);
  const [budgetAlerts, setBudgetAlerts] = useState(null);
  const [cashFlowData, setCashFlowData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString());
  
  // Calculate date range for cash flow based on selected month/year
  const getDateRange = () => {
    const year = parseInt(selectedYear);
    const month = parseInt(selectedMonth);
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { startDate, endDate };
  };
  
  const fetchData = useCallback(async () => {
    setLoading(true);
    const { startDate, endDate } = getDateRange();
    try {
      const [plRes, ccRes, alertsRes, cashFlowRes] = await Promise.all([
        axios.get(`${API}/api/business-clarity/reports/profit-loss?year=${selectedYear}&month=${selectedMonth}`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/reports/cost-center-actual?year=${selectedYear}&month=${selectedMonth}`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/reports/budget-alerts?year=${selectedYear}&month=${selectedMonth}`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/cash-flow?start_date=${startDate}&end_date=${endDate}`, { withCredentials: true })
      ]);
      setPlData(plRes.data);
      setCostCenterData(ccRes.data);
      setBudgetAlerts(alertsRes.data);
      setCashFlowData(cashFlowRes.data);
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error al cargar datos" : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [isEs, selectedYear, selectedMonth]);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  // Prepare pie chart data for costs breakdown
  const costsBreakdown = plData ? [
    { name: isEs ? "Nómina" : "Payroll", value: plData.payroll || 0, key: "payroll" },
    { name: isEs ? "Compras" : "Purchases", value: plData.purchases || 0, key: "purchases" },
    { name: isEs ? "Gastos" : "Expenses", value: plData.expenses || 0, key: "expenses" },
    { name: isEs ? "Inventario" : "Inventory", value: plData.inventory_cost || 0, key: "inventory_cost" }
  ].filter(item => item.value > 0) : [];
  
  // Prepare bar chart data for cost centers
  const costCenterChartData = (costCenterData?.cost_centers || [])
    .filter(cc => cc.cost_center_id)
    .slice(0, 8)
    .map(cc => ({
      name: cc.cost_center_name?.length > 15 
        ? cc.cost_center_name.substring(0, 15) + "..." 
        : cc.cost_center_name,
      actual: cc.total_amount,
      budget: cc.budget || 0,
      fullName: cc.cost_center_name
    }));
  
  const isProfit = (plData?.gross_profit || 0) >= 0;
  
  const months = [
    { value: "1", label: isEs ? "Enero" : "January" },
    { value: "2", label: isEs ? "Febrero" : "February" },
    { value: "3", label: isEs ? "Marzo" : "March" },
    { value: "4", label: isEs ? "Abril" : "April" },
    { value: "5", label: isEs ? "Mayo" : "May" },
    { value: "6", label: isEs ? "Junio" : "June" },
    { value: "7", label: isEs ? "Julio" : "July" },
    { value: "8", label: isEs ? "Agosto" : "August" },
    { value: "9", label: isEs ? "Septiembre" : "September" },
    { value: "10", label: isEs ? "Octubre" : "October" },
    { value: "11", label: isEs ? "Noviembre" : "November" },
    { value: "12", label: isEs ? "Diciembre" : "December" }
  ];
  
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const item = payload[0]?.payload;
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
          <p className="font-medium mb-2">{item?.fullName || label}</p>
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <span style={{ color: entry.color }}>
                {entry.name === "actual" ? (isEs ? "Real" : "Actual") : (isEs ? "Presupuesto" : "Budget")}
              </span>
              <span className="font-medium">{formatCurrency(entry.value)}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6" data-testid="profit-loss-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Wallet className="w-6 h-6" />
            {isEs ? "Estado de Resultados (P&L)" : "Profit & Loss Statement"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs 
              ? "Resumen financiero de ingresos y gastos"
              : "Financial summary of revenue and expenses"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2026">2026</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2024">2024</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      
      {/* Budget Alerts Section */}
      {budgetAlerts?.alerts?.length > 0 && (
        <div className="space-y-3" data-testid="budget-alerts-section">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-600" />
            <h3 className="font-medium">
              {isEs ? "Alertas de Presupuesto" : "Budget Alerts"}
              <Badge variant="outline" className="ml-2">
                {budgetAlerts.alerts.length}
              </Badge>
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {budgetAlerts.alerts.map((alert, idx) => (
              <Alert 
                key={idx}
                variant={alert.severity === "exceeded" ? "destructive" : "default"}
                className={`
                  ${alert.severity === "exceeded" ? "border-red-500 bg-red-50" : ""}
                  ${alert.severity === "critical" ? "border-orange-500 bg-orange-50" : ""}
                  ${alert.severity === "warning" ? "border-yellow-500 bg-yellow-50" : ""}
                `}
                data-testid={`budget-alert-${alert.cost_center_id}`}
              >
                {alert.severity === "exceeded" && <AlertCircle className="h-4 w-4 text-red-600" />}
                {alert.severity === "critical" && <AlertTriangle className="h-4 w-4 text-orange-600" />}
                {alert.severity === "warning" && <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                <AlertTitle className="text-sm font-medium">
                  {alert.cost_center_name}
                  <Badge 
                    className={`ml-2 text-xs ${
                      alert.severity === "exceeded" ? "bg-red-600" :
                      alert.severity === "critical" ? "bg-orange-500" : "bg-yellow-500"
                    }`}
                  >
                    {alert.utilization_percent}%
                  </Badge>
                </AlertTitle>
                <AlertDescription className="text-xs mt-1">
                  <span className="font-medium">{formatCurrencyK(alert.actual)}</span>
                  {" / "}
                  <span className="text-muted-foreground">{formatCurrencyK(alert.budget)}</span>
                  <span className={`ml-2 ${alert.variance < 0 ? "text-red-600" : "text-green-600"}`}>
                    ({alert.variance >= 0 ? "+" : ""}{formatCurrencyK(alert.variance)} {isEs ? "restante" : "remaining"})
                  </span>
                </AlertDescription>
              </Alert>
            ))}
          </div>
        </div>
      )}
      
      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Revenue */}
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-emerald-600 font-medium">
                  {isEs ? "Ingresos" : "Revenue"}
                </p>
                <p className="text-2xl font-bold text-emerald-800">
                  {formatCurrencyK(plData?.revenue || 0)}
                </p>
                <p className="text-xs text-emerald-600 mt-1">
                  {plData?.transactions_count || 0} {isEs ? "transacciones" : "transactions"}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-emerald-200 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-emerald-700" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Total Costs */}
        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 font-medium">
                  {isEs ? "Costos Totales" : "Total Costs"}
                </p>
                <p className="text-2xl font-bold text-red-800">
                  {formatCurrencyK(plData?.total_costs || 0)}
                </p>
                <p className="text-xs text-red-600 mt-1">
                  {isEs ? "Nómina + Compras + Gastos" : "Payroll + Purchases + Expenses"}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-red-200 flex items-center justify-center">
                <TrendingDown className="w-6 h-6 text-red-700" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Gross Profit */}
        <Card className={`bg-gradient-to-br ${isProfit 
          ? "from-blue-50 to-blue-100 border-blue-200" 
          : "from-amber-50 to-amber-100 border-amber-200"}`}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${isProfit ? "text-blue-600" : "text-amber-600"}`}>
                  {isEs ? "Utilidad Bruta" : "Gross Profit"}
                </p>
                <p className={`text-2xl font-bold flex items-center gap-1 ${isProfit ? "text-blue-800" : "text-amber-800"}`}>
                  {isProfit ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                  {formatCurrencyK(Math.abs(plData?.gross_profit || 0))}
                </p>
                <Badge className={`mt-1 ${isProfit ? "bg-blue-200 text-blue-800" : "bg-amber-200 text-amber-800"}`}>
                  {isProfit ? (isEs ? "Ganancia" : "Profit") : (isEs ? "Pérdida" : "Loss")}
                </Badge>
              </div>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isProfit ? "bg-blue-200" : "bg-amber-200"}`}>
                <DollarSign className={`w-6 h-6 ${isProfit ? "text-blue-700" : "text-amber-700"}`} />
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Margin */}
        <Card className="bg-gradient-to-br from-violet-50 to-violet-100 border-violet-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-violet-600 font-medium">
                  {isEs ? "Margen Bruto" : "Gross Margin"}
                </p>
                <p className="text-2xl font-bold text-violet-800">
                  {plData?.revenue > 0 
                    ? `${((plData.gross_profit / plData.revenue) * 100).toFixed(1)}%`
                    : "N/A"}
                </p>
                <p className="text-xs text-violet-600 mt-1">
                  {isEs ? "Utilidad / Ingresos" : "Profit / Revenue"}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-violet-200 flex items-center justify-center">
                <PieChartIcon className="w-6 h-6 text-violet-700" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Cash Flow Integration Section */}
      <Card className="border-2 border-cyan-200" data-testid="cash-flow-integration">
        <CardHeader className="pb-2 bg-gradient-to-r from-cyan-50 to-blue-50">
          <CardTitle className="text-lg flex items-center gap-2">
            <Scale className="w-5 h-5 text-cyan-600" />
            {isEs ? "P&L vs Flujo de Caja" : "P&L vs Cash Flow"}
          </CardTitle>
          <CardDescription>
            {isEs 
              ? "Comparación entre resultados contables y movimiento real de efectivo"
              : "Comparison between accounting results and actual cash movement"}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* P&L Summary (Accrual Basis) */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="w-5 h-5 text-blue-600" />
                <h4 className="font-medium">{isEs ? "P&L (Base Devengado)" : "P&L (Accrual Basis)"}</h4>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-lg">
                  <span className="text-sm text-emerald-700">{isEs ? "Ingresos Reconocidos" : "Recognized Revenue"}</span>
                  <span className="font-bold text-emerald-800">{formatCurrency(plData?.revenue || 0)}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <span className="text-sm text-red-700">{isEs ? "Costos Reconocidos" : "Recognized Costs"}</span>
                  <span className="font-bold text-red-800">{formatCurrency(plData?.total_costs || 0)}</span>
                </div>
                <div className={`flex justify-between items-center p-3 rounded-lg ${
                  (plData?.gross_profit || 0) >= 0 ? "bg-blue-50" : "bg-amber-50"
                }`}>
                  <span className={`text-sm ${(plData?.gross_profit || 0) >= 0 ? "text-blue-700" : "text-amber-700"}`}>
                    {isEs ? "Utilidad Bruta" : "Gross Profit"}
                  </span>
                  <span className={`font-bold ${(plData?.gross_profit || 0) >= 0 ? "text-blue-800" : "text-amber-800"}`}>
                    {formatCurrency(plData?.gross_profit || 0)}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Cash Flow Summary (Cash Basis) */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <Banknote className="w-5 h-5 text-cyan-600" />
                <h4 className="font-medium">{isEs ? "Flujo de Caja (Base Efectivo)" : "Cash Flow (Cash Basis)"}</h4>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <ArrowUpCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm text-emerald-700">{isEs ? "Efectivo Recibido" : "Cash Received"}</span>
                  </div>
                  <span className="font-bold text-emerald-800">{formatCurrency(cashFlowData?.inflows?.total || 0)}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <ArrowDownCircle className="w-4 h-4 text-red-600" />
                    <span className="text-sm text-red-700">{isEs ? "Efectivo Pagado" : "Cash Paid"}</span>
                  </div>
                  <span className="font-bold text-red-800">{formatCurrency(cashFlowData?.outflows?.total || 0)}</span>
                </div>
                <div className={`flex justify-between items-center p-3 rounded-lg ${
                  (cashFlowData?.net_cash_flow || 0) >= 0 ? "bg-cyan-50" : "bg-amber-50"
                }`}>
                  <span className={`text-sm ${(cashFlowData?.net_cash_flow || 0) >= 0 ? "text-cyan-700" : "text-amber-700"}`}>
                    {isEs ? "Flujo Neto" : "Net Cash Flow"}
                  </span>
                  <span className={`font-bold ${(cashFlowData?.net_cash_flow || 0) >= 0 ? "text-cyan-800" : "text-amber-800"}`}>
                    {formatCurrency(cashFlowData?.net_cash_flow || 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Variance Analysis */}
          {cashFlowData && plData && (
            <div className="mt-6 pt-4 border-t">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                {isEs ? "Análisis de Variación" : "Variance Analysis"}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Inflows vs Revenue */}
                <Card className="bg-slate-50">
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground mb-1">
                      {isEs ? "Efectivo vs Ingresos" : "Cash vs Revenue"}
                    </p>
                    <p className={`text-lg font-bold ${
                      (cashFlowData?.inflows?.total || 0) >= (plData?.revenue || 0) ? "text-emerald-600" : "text-amber-600"
                    }`}>
                      {formatCurrency((cashFlowData?.inflows?.total || 0) - (plData?.revenue || 0))}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(cashFlowData?.inflows?.total || 0) >= (plData?.revenue || 0)
                        ? (isEs ? "Cobranza adelantada" : "Collections ahead")
                        : (isEs ? "Por cobrar pendiente" : "Pending receivables")}
                    </p>
                  </CardContent>
                </Card>
                
                {/* Outflows vs Costs */}
                <Card className="bg-slate-50">
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground mb-1">
                      {isEs ? "Pagos vs Costos" : "Payments vs Costs"}
                    </p>
                    <p className={`text-lg font-bold ${
                      (cashFlowData?.outflows?.total || 0) <= (plData?.total_costs || 0) ? "text-emerald-600" : "text-amber-600"
                    }`}>
                      {formatCurrency((plData?.total_costs || 0) - (cashFlowData?.outflows?.total || 0))}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(cashFlowData?.outflows?.total || 0) <= (plData?.total_costs || 0)
                        ? (isEs ? "Costos por pagar" : "Costs pending payment")
                        : (isEs ? "Pagos adelantados" : "Advance payments")}
                    </p>
                  </CardContent>
                </Card>
                
                {/* Net Comparison */}
                <Card className="bg-slate-50">
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground mb-1">
                      {isEs ? "Diferencia P&L vs Cash" : "P&L vs Cash Difference"}
                    </p>
                    <p className={`text-lg font-bold ${
                      (cashFlowData?.net_cash_flow || 0) >= (plData?.gross_profit || 0) ? "text-emerald-600" : "text-amber-600"
                    }`}>
                      {formatCurrency((cashFlowData?.net_cash_flow || 0) - (plData?.gross_profit || 0))}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(cashFlowData?.net_cash_flow || 0) >= (plData?.gross_profit || 0)
                        ? (isEs ? "Mejor posición de caja" : "Better cash position")
                        : (isEs ? "Efectivo por recibir" : "Cash yet to receive")}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
          
          {/* Pending Obligations Highlight */}
          {cashFlowData?.pending_obligations && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="text-muted-foreground font-medium">{isEs ? "Obligaciones Pendientes:" : "Pending Obligations:"}</span>
                {cashFlowData.pending_obligations.overdue?.total > 0 && (
                  <Badge variant="destructive">
                    {isEs ? "Vencido" : "Overdue"}: {formatCurrency(cashFlowData.pending_obligations.overdue.total)}
                  </Badge>
                )}
                {cashFlowData.pending_obligations.due_this_week?.total > 0 && (
                  <Badge variant="outline" className="border-amber-500 text-amber-700">
                    {isEs ? "Esta semana" : "This week"}: {formatCurrency(cashFlowData.pending_obligations.due_this_week.total)}
                  </Badge>
                )}
                {cashFlowData.pending_obligations.due_this_month?.total > 0 && (
                  <Badge variant="outline">
                    {isEs ? "Este mes" : "This month"}: {formatCurrency(cashFlowData.pending_obligations.due_this_month.total)}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Costs Breakdown Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChartIcon className="w-5 h-5" />
              {isEs ? "Desglose de Costos" : "Costs Breakdown"}
            </CardTitle>
            <CardDescription>
              {isEs ? "Distribución de gastos por categoría" : "Expense distribution by category"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {costsBreakdown.length > 0 ? (
              <div className="flex items-center">
                <ResponsiveContainer width="60%" height={250}>
                  <PieChart>
                    <Pie
                      data={costsBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {costsBreakdown.map((entry, index) => (
                        <Cell key={entry.key} fill={COST_COLORS[entry.key]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="w-[40%] space-y-3">
                  {costsBreakdown.map((item) => {
                    const Icon = COST_ICONS[item.key];
                    const percentage = plData?.total_costs > 0 
                      ? ((item.value / plData.total_costs) * 100).toFixed(1)
                      : 0;
                    return (
                      <div key={item.key} className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: COST_COLORS[item.key] }}
                        />
                        <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrencyK(item.value)} ({percentage}%)
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                {isEs ? "Sin datos de costos" : "No cost data"}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Cost Center Comparison */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              {isEs ? "Gasto por Centro de Costo" : "Spending by Cost Center"}
            </CardTitle>
            <CardDescription>
              {isEs ? "Real vs Presupuesto" : "Actual vs Budget"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {costCenterChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={costCenterChartData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" tickFormatter={formatCurrencyK} />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="actual" name={isEs ? "Real" : "Actual"} fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="budget" name={isEs ? "Presupuesto" : "Budget"} fill="#e2e8f0" radius={[0, 4, 4, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                {isEs ? "Sin datos de centros de costo" : "No cost center data"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Cost Type Detail Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(COST_LABELS).map(([key, labels]) => {
          const value = plData?.[key] || 0;
          const Icon = COST_ICONS[key];
          const percentage = plData?.total_costs > 0 
            ? ((value / plData.total_costs) * 100).toFixed(0)
            : 0;
          
          return (
            <Card key={key} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${COST_COLORS[key]}20` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: COST_COLORS[key] }} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {isEs ? labels.es : labels.en}
                    </p>
                    <p className="text-lg font-bold">{formatCurrencyK(value)}</p>
                    <p className="text-xs text-muted-foreground">{percentage}% {isEs ? "del total" : "of total"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      {/* Totals Summary */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">{isEs ? "Total Presupuestado" : "Total Budgeted"}</p>
              <p className="text-xl font-bold">{formatCurrencyK(costCenterData?.totals?.total_budget || 0)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">{isEs ? "Total Real" : "Total Actual"}</p>
              <p className="text-xl font-bold">{formatCurrencyK(costCenterData?.totals?.total_actual || 0)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">{isEs ? "Variación" : "Variance"}</p>
              <p className={`text-xl font-bold ${
                (costCenterData?.totals?.total_budget - costCenterData?.totals?.total_actual) >= 0
                  ? "text-green-600" : "text-red-600"
              }`}>
                {formatCurrencyK((costCenterData?.totals?.total_budget || 0) - (costCenterData?.totals?.total_actual || 0))}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">{isEs ? "Centros de Costo" : "Cost Centers"}</p>
              <p className="text-xl font-bold">{costCenterData?.cost_centers?.length || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
