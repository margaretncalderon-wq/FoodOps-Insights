import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useLanguage } from "../../contexts/LanguageContext";
import { useCurrencyFormatter } from "../../hooks/useCurrencyFormatter";
import {
  RefreshCw, Wallet, Users, TrendingDown, TrendingUp, AlertTriangle,
  CreditCard, Clock, Calculator, Zap, ChevronRight
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export function NextPayrollProjection({ defaultPeriodType = "biweekly" }) {
  const { language } = useLanguage();
  const { formatCurrency } = useCurrencyFormatter();
  const isEs = language === "es";
  const navigate = useNavigate();

  const [periodType, setPeriodType] = useState(defaultPeriodType);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProjection = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${API}/api/people-ops/payroll/projection?period_type=${periodType}`,
        { withCredentials: true }
      );
      setData(res.data);
    } catch (err) {
      console.error("Error fetching projection:", err);
    }
    setLoading(false);
  }, [periodType]);

  useEffect(() => {
    fetchProjection();
  }, [fetchProjection]);

  if (loading && !data) {
    return (
      <Card className="border-violet-200">
        <CardContent className="py-12 text-center">
          <RefreshCw className="w-6 h-6 mx-auto animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const t = data.totals || {};
  const pd = data.pending_deductions || {};
  const ot = data.pending_overtime || {};
  const ln = data.loans || {};
  const periodLabel = periodType === "biweekly" ? (isEs ? "Quincena" : "Biweekly") :
                      periodType === "monthly" ? (isEs ? "Mes" : "Monthly") :
                      (isEs ? "Semana" : "Weekly");

  return (
    <Card className="border-violet-200 bg-gradient-to-br from-violet-50/40 to-white" data-testid="next-payroll-projection">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calculator className="w-5 h-5 text-violet-600" />
              {isEs ? "Proyección de Próxima Nómina" : "Next Payroll Projection"}
            </CardTitle>
            <CardDescription className="mt-1">
              {isEs
                ? `Cálculo en tiempo real para una ${periodLabel.toLowerCase()} con los datos actuales.`
                : `Real-time estimate for a ${periodLabel.toLowerCase()} run based on current data.`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={periodType} onValueChange={setPeriodType}>
              <SelectTrigger className="w-[140px]" data-testid="projection-period-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="biweekly">{isEs ? "Quincena" : "Biweekly"}</SelectItem>
                <SelectItem value="monthly">{isEs ? "Mensual" : "Monthly"}</SelectItem>
                <SelectItem value="weekly">{isEs ? "Semanal" : "Weekly"}</SelectItem>
              </SelectContent>
            </Select>
            <Button size="icon" variant="outline" onClick={fetchProjection} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Main KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {/* Active employees */}
          <div className="p-3 rounded-lg border bg-white">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
              <Users className="w-3.5 h-3.5" />
              {isEs ? "Empleados activos" : "Active employees"}
            </div>
            <p className="text-2xl font-bold">{data.active_employees}</p>
            {data.overrides_in_use > 0 && (
              <p className="text-[10px] text-amber-700 mt-0.5">
                {data.overrides_in_use} {isEs ? "con overrides" : "with overrides"}
              </p>
            )}
          </div>

          {/* Gross */}
          <div className="p-3 rounded-lg border bg-white">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
              <Wallet className="w-3.5 h-3.5" />
              {isEs ? "Ingreso bruto estimado" : "Estimated gross"}
            </div>
            <p className="text-xl font-bold">{formatCurrency(t.estimated_gross || 0)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {isEs ? "Salarios" : "Salaries"} {formatCurrency(t.base_salary_period || 0)}
              {(t.pending_overtime_amount || 0) > 0 && <> + OT {formatCurrency(t.pending_overtime_amount)}</>}
            </p>
          </div>

          {/* Deductions */}
          <div className="p-3 rounded-lg border bg-white">
            <div className="flex items-center gap-1.5 text-red-600 text-xs mb-1">
              <TrendingDown className="w-3.5 h-3.5" />
              {isEs ? "Deducciones totales" : "Total deductions"}
            </div>
            <p className="text-xl font-bold text-red-600">{formatCurrency(t.total_deductions || 0)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {((t.total_deductions || 0) / (t.estimated_gross || 1) * 100).toFixed(1)}% {isEs ? "del bruto" : "of gross"}
            </p>
          </div>

          {/* Net */}
          <div className="p-3 rounded-lg border bg-emerald-50 border-emerald-200">
            <div className="flex items-center gap-1.5 text-emerald-700 text-xs mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              {isEs ? "Neto a pagar estimado" : "Estimated net to pay"}
            </div>
            <p className="text-2xl font-bold text-emerald-700">{formatCurrency(t.estimated_net || 0)}</p>
          </div>
        </div>

        {/* Deduction breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <div className="p-2 rounded border bg-white text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">AFP</p>
            <p className="font-semibold text-sm">{formatCurrency(t.afp || 0)}</p>
          </div>
          <div className="p-2 rounded border bg-white text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">ARS</p>
            <p className="font-semibold text-sm">{formatCurrency(t.ars || 0)}</p>
          </div>
          <div className="p-2 rounded border bg-white text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">ISR</p>
            <p className="font-semibold text-sm">{formatCurrency(t.isr || 0)}</p>
          </div>
          <div className="p-2 rounded border bg-white text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{isEs ? "Préstamos" : "Loans"}</p>
            <p className="font-semibold text-sm">{formatCurrency(t.loan_deductions || 0)}</p>
          </div>
          <div className="p-2 rounded border bg-white text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{isEs ? "Pendientes" : "Pending"}</p>
            <p className="font-semibold text-sm text-amber-700">{formatCurrency(t.pending_deductions || 0)}</p>
          </div>
        </div>

        {/* Pending items detail */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Pending deductions card */}
          <div className="p-3 rounded-lg border bg-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-600" />
                <p className="text-sm font-medium">{isEs ? "Descuentos pendientes" : "Pending deductions"}</p>
              </div>
              <Badge variant="outline" className="text-xs">{pd.count}</Badge>
            </div>
            <p className="text-xl font-bold text-amber-700">{formatCurrency(pd.total_amount || 0)}</p>
            <p className="text-[10px] text-muted-foreground mb-2">
              {pd.by_employee_count} {isEs ? `empleados afectados` : `employees affected`}
            </p>
            {(pd.top_5 || []).slice(0, 3).map((d) => (
              <div key={d.deduction_id} className="flex items-center justify-between text-xs py-1 border-t" data-testid={`pd-row-${d.deduction_id}`}>
                <button
                  onClick={() => navigate(`/people-ops/employee/${d.employee_id}`)}
                  className="text-left truncate text-violet-700 hover:underline flex-1"
                >
                  {d.employee_name}: {d.reason}
                </button>
                <span className="font-medium text-red-600 ml-2">{formatCurrency(d.amount)}</span>
              </div>
            ))}
            {pd.count === 0 && (
              <p className="text-xs text-muted-foreground italic mt-1">
                {isEs ? "Sin descuentos programados." : "No deductions queued."}
              </p>
            )}
          </div>

          {/* Pending overtime */}
          <div className="p-3 rounded-lg border bg-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <p className="text-sm font-medium">{isEs ? "Horas extras pendientes" : "Pending overtime"}</p>
              </div>
              <Badge variant="outline" className="text-xs">{ot.count}</Badge>
            </div>
            <p className="text-xl font-bold text-blue-700">{formatCurrency(ot.total_amount || 0)}</p>
            <p className="text-[10px] text-muted-foreground">
              {ot.total_hours?.toFixed(1) || 0} {isEs ? "horas aprobadas y sin pagar" : "approved hours unpaid"}
            </p>
            <Button
              variant="link" size="sm" className="px-0 mt-2 h-auto text-xs"
              onClick={() => navigate("/people-ops/overtime")}
            >
              {isEs ? "Ver detalle" : "View detail"} <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>

          {/* Loans */}
          <div className="p-3 rounded-lg border bg-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-600" />
                <p className="text-sm font-medium">{isEs ? "Préstamos activos" : "Active loans"}</p>
              </div>
              <Badge variant="outline" className="text-xs">{ln.count}</Badge>
            </div>
            <p className="text-xl font-bold text-purple-700">{formatCurrency(ln.next_installment_total || 0)}</p>
            <p className="text-[10px] text-muted-foreground">
              {isEs ? "Saldo total:" : "Outstanding:"} {formatCurrency(ln.outstanding_balance || 0)}
            </p>
          </div>
        </div>

        {/* Alerts */}
        {data.overrides_in_use > 0 && (
          <div className="mt-3 p-2 rounded border border-amber-300 bg-amber-50 flex items-center gap-2 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              {isEs
                ? `${data.overrides_in_use} empleado(s) tienen overrides manuales de AFP/ARS/ISR que reemplazan el cálculo legal.`
                : `${data.overrides_in_use} employee(s) have manual AFP/ARS/ISR overrides replacing the legal formula.`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default NextPayrollProjection;
