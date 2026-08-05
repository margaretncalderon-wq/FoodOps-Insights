import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTerminology } from "../../hooks/useTerminology";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import {
  TrendingUp, TrendingDown, AlertTriangle, Clock, RefreshCw,
  Wallet, Banknote, Flame, Target, CircleDollarSign, AlertCircle, HelpCircle, Info, Lock, Unlock
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";
import { KoraLoader } from "../KoraLoader";
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DashboardSection() {
  const { language } = useLanguage();
  const { term } = useTerminology();
  const isEs = language === "es";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showProfitSignals, setShowProfitSignals] = useState(true);
  const [targetMargin, setTargetMargin] = useState(30);
  const [periodStatus, setPeriodStatus] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const now = new Date();
      const [dashRes, periodRes] = await Promise.all([
        axios.get(`${API}/api/business-clarity/dashboard?target_margin=${targetMargin}`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/period-close/${now.getFullYear()}/${now.getMonth() + 1}`, { withCredentials: true }).catch(() => null)
      ]);
      setData(dashRes.data);
      if (periodRes?.data) {
        setPeriodStatus(periodRes.data);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [targetMargin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex items-center justify-center h-64"><KoraLoader size={48} /></div>;

  const agingData = data?.aging_buckets || {};
  const totalAging = Object.values(agingData).reduce((a, b) => a + b, 0);
  const profitSignals = data?.profit_signals || {};
  const negativeMarginEvents = profitSignals.negative_margin_count || 0;
  const belowTargetEvents = profitSignals.below_target_count || 0;
  const unassignedCosts = profitSignals.unassigned_costs || 0;
  const cashGap = (profitSignals.paid_to_suppliers || 0) - (profitSignals.collected_from_clients || 0);
  
  const currentMonthName = new Date().toLocaleString(isEs ? 'es' : 'en', { month: 'long' });
  const currentYear = new Date().getFullYear();
  const isPeriodClosed = periodStatus?.status === "closed";

  return (
    <div className="space-y-6">
      {/* Period Status Banner */}
      {periodStatus && (
        <div className={`p-3 rounded-lg border flex items-center justify-between ${isPeriodClosed ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
          <div className="flex items-center gap-3">
            {isPeriodClosed ? <Lock className="w-5 h-5 text-green-600" /> : <Unlock className="w-5 h-5 text-amber-600" />}
            <div>
              <p className={`font-medium ${isPeriodClosed ? "text-green-800" : "text-amber-800"}`}>
                {currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1)} {currentYear} — {isPeriodClosed ? (isEs ? "Cerrado" : "Closed") : (isEs ? "Abierto" : "Open")}
              </p>
              <p className={`text-xs ${isPeriodClosed ? "text-green-600" : "text-amber-600"}`}>
                {isPeriodClosed 
                  ? (isEs ? `Cerrado el ${formatDateOnly(periodStatus.closed_at, language)}` : `Closed on ${formatDateOnly(periodStatus.closed_at, language)}`)
                  : (isEs ? "Los datos mostrados son en tiempo real (período abierto)" : "Data shown is live (open period)")
                }
              </p>
            </div>
          </div>
          <Badge variant={isPeriodClosed ? "default" : "outline"} className={isPeriodClosed ? "bg-green-600" : ""}>
            {isPeriodClosed ? <><Lock className="w-3 h-3 mr-1" />{isEs ? "Datos Bloqueados" : "Locked Data"}</> : <>{isEs ? "Datos en Vivo" : "Live Data"}</>}
          </Badge>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{isEs ? "Panel Ejecutivo" : "Executive Dashboard"}</h2>
        <div className="flex items-center gap-2">
          <Button variant={showProfitSignals ? "default" : "outline"} size="sm" onClick={() => setShowProfitSignals(!showProfitSignals)} className="gap-2">
            <Flame className="w-4 h-4" />
            {isEs ? "Señales de Rentabilidad" : "Profit Signals"}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}><RefreshCw className="w-4 h-4 mr-2" />{isEs ? "Actualizar" : "Refresh"}</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200 dark:from-green-950 dark:to-green-900 dark:border-green-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">{isEs ? "Por Cobrar" : "Receivables"}</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">{formatCurrency(data?.total_receivables)}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
            <p className="text-xs text-green-600 dark:text-green-400 mt-2">{data?.open_invoices_count || 0} {isEs ? "facturas" : "invoices"}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200 dark:from-red-950 dark:to-red-900 dark:border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">{isEs ? "Vencido" : "Overdue"}</p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">{formatCurrency(data?.total_overdue)}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200 dark:from-orange-950 dark:to-orange-900 dark:border-orange-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">{isEs ? "Por Pagar" : "Payables"}</p>
                <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{formatCurrency(data?.total_payables)}</p>
              </div>
              <TrendingDown className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 dark:from-blue-950 dark:to-blue-900 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">{isEs ? "Flujo Neto" : "Net Flow"}</p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{formatCurrency((data?.total_receivables || 0) - (data?.total_payables || 0))}</p>
              </div>
              <Wallet className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Profit Signals */}
      {showProfitSignals && (
        <Card className="border-amber-200 bg-amber-50/30 dark:bg-amber-950/20 dark:border-amber-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-600" />
                {isEs ? "Señales de Rentabilidad" : "Profit Signals"}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger><HelpCircle className="w-4 h-4 text-muted-foreground" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>{isEs ? "Indicadores de decisión: ¿Dónde hay fuga de margen?" : "Decision indicators: Where is margin leaking?"}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{isEs ? "Margen objetivo:" : "Target margin:"}</span>
                <Select value={targetMargin.toString()} onValueChange={(v) => setTargetMargin(parseInt(v))}>
                  <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[20, 25, 30, 35, 40, 45, 50].map(v => <SelectItem key={v} value={v.toString()}>{v}%</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <CardDescription>{isEs ? "¿Dónde necesitas mirar ahora mismo?" : "Where do you need to look right now?"}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className={`p-4 rounded-lg border ${negativeMarginEvents > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className={`w-4 h-4 ${negativeMarginEvents > 0 ? "text-red-600" : "text-muted-foreground"}`} />
                  <span className="text-xs font-medium text-muted-foreground">{isEs ? `${term("events", "entity_plural")} con Margen Negativo` : `Negative Margin ${term("events", "entity_plural")}`}</span>
                </div>
                <p className={`text-2xl font-bold ${negativeMarginEvents > 0 ? "text-red-600" : "text-muted-foreground"}`}>{negativeMarginEvents}</p>
              </div>

              <div className={`p-4 rounded-lg border ${belowTargetEvents > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Target className={`w-4 h-4 ${belowTargetEvents > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
                  <span className="text-xs font-medium text-muted-foreground">{isEs ? `Bajo Margen Objetivo (<${targetMargin}%)` : `Below Target (<${targetMargin}%)`}</span>
                </div>
                <p className={`text-2xl font-bold ${belowTargetEvents > 0 ? "text-amber-600" : "text-muted-foreground"}`}>{belowTargetEvents}</p>
              </div>

              <div className={`p-4 rounded-lg border ${unassignedCosts > 0 ? "bg-purple-50 border-purple-200" : "bg-white border-gray-200"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <CircleDollarSign className={`w-4 h-4 ${unassignedCosts > 0 ? "text-purple-600" : "text-muted-foreground"}`} />
                  <span className="text-xs font-medium text-muted-foreground">{isEs ? "Costos Sin Asignar" : "Unassigned Costs"}</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger><Info className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-medium mb-1">{isEs ? "Fuga de Margen" : "Margin Leakage"}</p>
                        <p className="text-xs">{isEs ? "Costos no asignados a eventos distorsionan la rentabilidad real." : "Costs not assigned to events distort real profitability."}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className={`text-2xl font-bold ${unassignedCosts > 0 ? "text-purple-600" : "text-muted-foreground"}`}>{formatCurrency(unassignedCosts)}</p>
              </div>

              <div className={`p-4 rounded-lg border ${Math.abs(cashGap) > 1000 ? "bg-blue-50 border-blue-200" : "bg-white border-gray-200"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Wallet className={`w-4 h-4 ${cashGap < 0 ? "text-red-600" : cashGap > 0 ? "text-green-600" : "text-muted-foreground"}`} />
                  <span className="text-xs font-medium text-muted-foreground">{isEs ? "Brecha Pagado vs Cobrado" : "Paid vs Collected Gap"}</span>
                </div>
                <p className={`text-2xl font-bold ${cashGap < 0 ? "text-red-600" : cashGap > 0 ? "text-green-600" : "text-muted-foreground"}`}>{formatCurrency(Math.abs(cashGap))}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {cashGap < 0 ? (isEs ? "Pagaste más de lo cobrado" : "Paid more than collected") : cashGap > 0 ? (isEs ? "Cobraste más de lo pagado" : "Collected more than paid") : (isEs ? "Equilibrado" : "Balanced")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aging Analysis */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" />{isEs ? "Antigüedad de Cartera" : "Aging Analysis"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4">
            {[
              { key: "current", label: isEs ? "Al Día" : "Current", color: "bg-green-500" },
              { key: "1_30", label: "1-30", color: "bg-yellow-500" },
              { key: "31_60", label: "31-60", color: "bg-orange-500" },
              { key: "61_90", label: "61-90", color: "bg-red-400" },
              { key: "90_plus", label: "90+", color: "bg-red-600" },
            ].map(({ key, label, color }) => {
              const amount = agingData[key] || 0;
              const percent = totalAging > 0 ? (amount / totalAging) * 100 : 0;
              return (
                <div key={key} className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">{label}</div>
                  <div className="text-sm font-semibold">{formatCurrency(amount)}</div>
                  <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                    <div className={`${color} h-1.5 rounded-full`} style={{ width: `${percent}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Payments */}
      {data?.recent_payments?.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Banknote className="w-4 h-4" />{isEs ? "Pagos Recientes" : "Recent Payments"}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                  <TableHead>{isEs ? "Monto" : "Amount"}</TableHead>
                  <TableHead>{isEs ? "Método" : "Method"}</TableHead>
                  <TableHead>{isEs ? "Referencia" : "Reference"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent_payments.slice(0, 5).map((pay) => (
                  <TableRow key={pay.payment_id}>
                    <TableCell className="text-sm">{formatDateOnly(pay.payment_date, language)}</TableCell>
                    <TableCell className="font-medium text-green-600">{formatCurrency(pay.amount)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{pay.payment_method}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{pay.reference || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
