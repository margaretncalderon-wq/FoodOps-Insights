import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, BarChart3, 
  DollarSign, Building2, ArrowUpRight, ArrowDownRight, Activity
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, Cell, ComposedChart, Area
} from "recharts";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const formatCurrencyK = (amount) => {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return formatCurrency(amount);
};

// Color palette for cost centers
const COLORS = [
  "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", 
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"
];

const getTrendIcon = (trend) => {
  if (trend > 5) return <TrendingUp className="w-4 h-4 text-red-500" />;
  if (trend < -5) return <TrendingDown className="w-4 h-4 text-green-500" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
};

const getTrendBadge = (trend, isEs) => {
  if (trend > 10) return <Badge className="bg-red-100 text-red-700">{isEs ? "Aumentando" : "Increasing"}</Badge>;
  if (trend < -10) return <Badge className="bg-green-100 text-green-700">{isEs ? "Reduciendo" : "Decreasing"}</Badge>;
  return <Badge variant="secondary">{isEs ? "Estable" : "Stable"}</Badge>;
};

export function AccountingDashboard() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState("6");
  
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/business-clarity/accounting/trends?months=${months}`, { withCredentials: true });
      setData(res.data);
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error al cargar datos" : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [isEs, months]);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  // Prepare chart data
  const monthlyChartData = data?.monthly_totals?.map((m, idx) => ({
    month: m.month.split("-")[1] + "/" + m.month.split("-")[0].slice(2),
    total: m.total,
    monthFull: m.month
  })) || [];
  
  // Prepare stacked bar data by cost center
  const stackedData = data?.months?.map((month, idx) => {
    const row = { month: month.split("-")[1] + "/" + month.split("-")[0].slice(2) };
    data.trends?.forEach((cc, ccIdx) => {
      const monthData = cc.data?.find(d => d.month === month);
      row[cc.name || "Sin asignar"] = monthData?.amount || 0;
    });
    return row;
  }) || [];
  
  // Get top cost centers for the legend
  const topCCs = data?.trends?.slice(0, 7) || [];
  
  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
          <p className="font-medium mb-2">{label}</p>
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <span style={{ color: entry.color }}>{entry.name}</span>
              <span className="font-medium">{formatCurrency(entry.value)}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Activity className="w-6 h-6" />
            {isEs ? "Dashboard de Contabilización" : "Accounting Dashboard"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs 
              ? "Tendencias de gastos por centro de costo"
              : "Spending trends by cost center"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={months} onValueChange={setMonths}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">{isEs ? "3 meses" : "3 months"}</SelectItem>
              <SelectItem value="6">{isEs ? "6 meses" : "6 months"}</SelectItem>
              <SelectItem value="12">{isEs ? "12 meses" : "12 months"}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {isEs ? "Actualizar" : "Refresh"}
          </Button>
        </div>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-violet-50 to-violet-100 border-violet-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-violet-600">{isEs ? "Este Mes" : "This Month"}</p>
                <p className="text-2xl font-bold text-violet-800">
                  {formatCurrencyK(data?.summary?.current_month || 0)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-violet-400" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600">{isEs ? "Mes Anterior" : "Previous Month"}</p>
                <p className="text-2xl font-bold text-blue-800">
                  {formatCurrencyK(data?.summary?.previous_month || 0)}
                </p>
              </div>
              <BarChart3 className="w-8 h-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        
        <Card className={`bg-gradient-to-br ${(data?.summary?.mom_change || 0) > 0 
          ? "from-red-50 to-red-100 border-red-200" 
          : "from-green-50 to-green-100 border-green-200"}`}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${(data?.summary?.mom_change || 0) > 0 ? "text-red-600" : "text-green-600"}`}>
                  {isEs ? "Cambio MoM" : "MoM Change"}
                </p>
                <p className={`text-2xl font-bold flex items-center gap-1 ${(data?.summary?.mom_change || 0) > 0 ? "text-red-800" : "text-green-800"}`}>
                  {(data?.summary?.mom_change || 0) > 0 ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                  {Math.abs(data?.summary?.mom_change || 0)}%
                </p>
              </div>
              {(data?.summary?.mom_change || 0) > 0 
                ? <TrendingUp className="w-8 h-8 text-red-400" />
                : <TrendingDown className="w-8 h-8 text-green-400" />}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-amber-600">{isEs ? "Centros de Costo" : "Cost Centers"}</p>
                <p className="text-2xl font-bold text-amber-800">
                  {data?.summary?.total_cost_centers || 0}
                </p>
              </div>
              <Building2 className="w-8 h-8 text-amber-400" />
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Main Chart - Stacked Bar by Cost Center */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            {isEs ? "Gastos por Centro de Costo" : "Spending by Cost Center"}
          </CardTitle>
          <CardDescription>
            {isEs ? "Distribución mensual de gastos" : "Monthly spending distribution"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stackedData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={stackedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis tickFormatter={formatCurrencyK} className="text-xs" />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                {topCCs.map((cc, idx) => (
                  <Bar 
                    key={cc.name || "unassigned"} 
                    dataKey={cc.name || "Sin asignar"} 
                    stackId="a" 
                    fill={COLORS[idx % COLORS.length]}
                    radius={idx === topCCs.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[350px] flex items-center justify-center text-muted-foreground">
              {isEs ? "Sin datos para mostrar" : "No data to display"}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Trend Line Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            {isEs ? "Tendencia Total de Gastos" : "Total Spending Trend"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={monthlyChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis tickFormatter={formatCurrencyK} className="text-xs" />
                <Tooltip 
                  formatter={(value) => [formatCurrency(value), isEs ? "Total" : "Total"]}
                  labelFormatter={(label) => `${isEs ? "Mes" : "Month"}: ${label}`}
                />
                <Line 
                  type="monotone" 
                  dataKey="total" 
                  stroke="#8b5cf6" 
                  strokeWidth={3}
                  dot={{ fill: "#8b5cf6", strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              {isEs ? "Sin datos para mostrar" : "No data to display"}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Cost Center Trend Cards */}
      <div>
        <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          {isEs ? "Tendencia por Centro de Costo" : "Trend by Cost Center"}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(data?.trends || []).filter(t => t.cost_center_id).slice(0, 6).map((cc, idx) => {
            const lastAmount = cc.data?.[cc.data.length - 1]?.amount || 0;
            const overBudget = cc.monthly_budget > 0 && lastAmount > cc.monthly_budget;
            
            return (
              <Card key={cc.cost_center_id} className={`${overBudget ? "border-red-200 bg-red-50/30" : ""}`}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                        />
                        <span className="font-medium">{cc.code || cc.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{cc.name}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {getTrendIcon(cc.trend_pct)}
                      <span className={`text-sm font-medium ${
                        cc.trend_pct > 5 ? "text-red-600" : 
                        cc.trend_pct < -5 ? "text-green-600" : "text-gray-500"
                      }`}>
                        {cc.trend_pct > 0 ? "+" : ""}{cc.trend_pct}%
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{isEs ? "Último mes" : "Last month"}</span>
                      <span className="font-medium">{formatCurrency(lastAmount)}</span>
                    </div>
                    {cc.monthly_budget > 0 && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{isEs ? "Presupuesto" : "Budget"}</span>
                          <span>{formatCurrency(cc.monthly_budget)}</span>
                        </div>
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${overBudget ? "bg-red-500" : "bg-green-500"}`}
                            style={{ width: `${Math.min((lastAmount / cc.monthly_budget) * 100, 100)}%` }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* Mini sparkline */}
                  <div className="mt-3 h-12">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={cc.data || []}>
                        <Line 
                          type="monotone" 
                          dataKey="amount" 
                          stroke={COLORS[idx % COLORS.length]} 
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
