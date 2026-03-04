import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import {
  Users, Wallet, TrendingUp, TrendingDown, Calendar,
  RefreshCw, ArrowRight, Clock, AlertCircle, DollarSign,
  BarChart3, PiggyBank
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => 
  `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PayrollCostSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const navigate = useNavigate();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/business-clarity/payroll-summary`, { withCredentials: true });
      setData(res.data);
    } catch (err) {
      console.error("Error fetching payroll summary:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>{isEs ? "No se pudo cargar la información de nómina" : "Could not load payroll information"}</p>
      </div>
    );
  }

  const { ytd, current_month, monthly_trend, pending_payrolls, avg_monthly_cost, active_employees, estimated_monthly_employer_cost } = data;
  
  // Find max for chart scaling
  const maxTrendValue = Math.max(...monthly_trend.map(m => m.cost), 1);

  return (
    <div className="space-y-6" data-testid="payroll-cost-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5 text-violet-600" />
            {isEs ? "Costo de Personal" : "Personnel Cost"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Resumen de nómina y costo de empleador" : "Payroll summary and employer cost"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={() => navigate("/people-ops/payroll")}>
            {isEs ? "Ver Nómina" : "View Payroll"}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Active Employees */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="w-4 h-4" />
              {isEs ? "Empleados Activos" : "Active Employees"}
            </div>
            <p className="text-3xl font-bold mt-1">{active_employees}</p>
          </CardContent>
        </Card>

        {/* Monthly Employer Cost */}
        <Card className="border-violet-200 bg-violet-50/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-violet-600 text-sm">
              <Wallet className="w-4 h-4" />
              {isEs ? "Costo Mensual Empleador" : "Monthly Employer Cost"}
            </div>
            <p className="text-2xl font-bold mt-1 text-violet-700">
              {formatCurrency(avg_monthly_cost || estimated_monthly_employer_cost)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isEs ? "Incluye aportes patronales" : "Includes employer contributions"}
            </p>
          </CardContent>
        </Card>

        {/* YTD Total Paid */}
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-emerald-600 text-sm">
              <DollarSign className="w-4 h-4" />
              {isEs ? "Pagado (YTD)" : "Paid (YTD)"}
            </div>
            <p className="text-2xl font-bold mt-1 text-emerald-700">
              {formatCurrency(ytd?.net_paid)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {ytd?.periods_completed} {isEs ? "nóminas procesadas" : "payrolls processed"}
            </p>
          </CardContent>
        </Card>

        {/* YTD Employer Cost */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <PiggyBank className="w-4 h-4" />
              {isEs ? "Costo Empleador (YTD)" : "Employer Cost (YTD)"}
            </div>
            <p className="text-2xl font-bold mt-1">
              {formatCurrency(ytd?.total_employer_cost)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isEs ? "Salarios + aportes patronales" : "Salaries + employer contributions"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Payrolls Alert */}
      {pending_payrolls && pending_payrolls.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700">
              <Clock className="w-4 h-4" />
              {isEs ? "Nóminas Pendientes" : "Pending Payrolls"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pending_payrolls.map((p) => (
                <div 
                  key={p.period_id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-white border cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/people-ops/payroll/${p.period_id}`)}
                >
                  <div>
                    <p className="font-medium">{p.period_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {isEs ? "Pago:" : "Payment:"} {p.payment_date}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-bold">{formatCurrency(p.amount)}</p>
                    <Badge variant="outline" className={
                      p.status === "draft" ? "text-gray-600" :
                      p.status === "pending_approval" ? "text-amber-600" :
                      "text-blue-600"
                    }>
                      {p.status === "draft" ? (isEs ? "Borrador" : "Draft") :
                       p.status === "pending_approval" ? (isEs ? "Por Aprobar" : "Pending") :
                       (isEs ? "Aprobada" : "Approved")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly Trend Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            {isEs ? "Tendencia de Costo Mensual" : "Monthly Cost Trend"}
          </CardTitle>
          <CardDescription>
            {isEs ? "Costo total del empleador por mes (últimos 6 meses)" : "Total employer cost per month (last 6 months)"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {monthly_trend.map((month, idx) => (
              <div key={idx} className="flex items-center gap-4">
                <div className="w-12 text-sm font-medium text-muted-foreground">
                  {month.month}
                </div>
                <div className="flex-1">
                  <div className="h-8 bg-muted rounded-lg overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-violet-500 to-purple-600 rounded-lg transition-all duration-500"
                      style={{ width: `${maxTrendValue > 0 ? (month.cost / maxTrendValue) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div className="w-28 text-right font-medium">
                  {formatCurrency(month.cost)}
                </div>
              </div>
            ))}
          </div>
          
          {monthly_trend.every(m => m.cost === 0) && (
            <div className="text-center py-6 text-muted-foreground">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {isEs ? "No hay datos de nómina procesada aún" : "No processed payroll data yet"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deductions Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current Month Detail */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {isEs ? "Mes Actual" : "Current Month"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{isEs ? "Salario Bruto" : "Gross Salary"}</span>
                <span className="font-medium">{formatCurrency(current_month?.gross)}</span>
              </div>
              <div className="flex justify-between items-center text-red-600">
                <span>{isEs ? "Deducciones Empleado" : "Employee Deductions"}</span>
                <span>-{formatCurrency((current_month?.gross || 0) - (current_month?.net || 0))}</span>
              </div>
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="font-medium">{isEs ? "Neto a Pagar" : "Net Pay"}</span>
                <span className="font-bold text-emerald-600">{formatCurrency(current_month?.net)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between items-center text-violet-600">
                <span>{isEs ? "Aportes Empleador" : "Employer Contributions"}</span>
                <span>{formatCurrency((current_month?.employer_cost || 0) - (current_month?.gross || 0))}</span>
              </div>
              <div className="bg-violet-50 rounded-lg p-3 mt-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-violet-700">{isEs ? "Costo Total Empleador" : "Total Employer Cost"}</span>
                  <span className="font-bold text-violet-700">{formatCurrency(current_month?.employer_cost)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* YTD Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {isEs ? "Acumulado del Año (YTD)" : "Year to Date (YTD)"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{isEs ? "Salarios Brutos" : "Gross Salaries"}</span>
                <span className="font-medium">{formatCurrency(ytd?.gross_paid)}</span>
              </div>
              <div className="flex justify-between items-center text-red-600">
                <span>{isEs ? "Deducciones Totales" : "Total Deductions"}</span>
                <span>-{formatCurrency(ytd?.total_deductions)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="font-medium">{isEs ? "Neto Pagado" : "Net Paid"}</span>
                <span className="font-bold text-emerald-600">{formatCurrency(ytd?.net_paid)}</span>
              </div>
              <div className="bg-violet-50 rounded-lg p-3 mt-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-violet-700">{isEs ? "Costo Total Empleador" : "Total Employer Cost"}</span>
                  <span className="font-bold text-violet-700">{formatCurrency(ytd?.total_employer_cost)}</span>
                </div>
                <p className="text-xs text-violet-600 mt-1">
                  {ytd?.periods_completed} {isEs ? "períodos de nómina" : "payroll periods"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
