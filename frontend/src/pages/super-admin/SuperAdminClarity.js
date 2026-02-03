import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Input } from "../../components/ui/input";
import { Progress } from "../../components/ui/progress";
import {
  DollarSign, TrendingUp, TrendingDown, Users, CreditCard, FileText,
  BarChart3, ArrowUp, ArrowDown, Calendar, Building2,
  Receipt, Wallet, PiggyBank, Calculator, ClipboardList, Loader2
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function SuperAdminClarity() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  
  const [overview, setOverview] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [fixedCosts, setFixedCosts] = useState([]);

  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [overviewRes, paymentsRes, subsRes] = await Promise.all([
        axios.get(`${API}/api/super-admin/bi/overview`, { withCredentials: true }),
        axios.get(`${API}/api/super-admin/bi/payments?period=${period}`, { withCredentials: true }),
        axios.get(`${API}/api/super-admin/clarity/subscriptions`, { withCredentials: true }).catch(() => ({ data: { subscriptions: [] } })),
      ]);
      
      setOverview(overviewRes.data);
      setPayments(paymentsRes.data);
      setSubscriptions(subsRes.data?.subscriptions || []);
      
      // Mock fixed costs for now - would come from platform_fixed_costs collection
      setFixedCosts([
        { id: 1, name: "Hosting AWS", amount: 500, category: "Infraestructura", frequency: "monthly" },
        { id: 2, name: "MongoDB Atlas", amount: 200, category: "Infraestructura", frequency: "monthly" },
        { id: 3, name: "Stripe Fees (est.)", amount: 150, category: "Pagos", frequency: "monthly" },
        { id: 4, name: "Dominio", amount: 15, category: "Infraestructura", frequency: "yearly" },
      ]);
      
    } catch (err) {
      console.error(err);
      toast.error("Error cargando datos");
    }
    setLoading(false);
  };

  const totalFixedCosts = fixedCosts.reduce((sum, cost) => {
    if (cost.frequency === "yearly") return sum + (cost.amount / 12);
    return sum + cost.amount;
  }, 0);

  const netIncome = (overview?.mrr || 0) - totalFixedCosts;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="clarity-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Business Clarity</h1>
          <p className="text-slate-400">Finanzas y métricas de Evoke OS</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-40 bg-slate-700 border-slate-600"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800 flex-wrap">
          <TabsTrigger value="dashboard">Dashboard Ejecutivo</TabsTrigger>
          <TabsTrigger value="subscriptions">Suscripciones</TabsTrigger>
          <TabsTrigger value="payments">Pagos Recibidos</TabsTrigger>
          <TabsTrigger value="costs">Costos Fijos</TabsTrigger>
          <TabsTrigger value="reports">Reportes</TabsTrigger>
        </TabsList>

        {/* Executive Dashboard */}
        <TabsContent value="dashboard" className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-green-600 to-green-700 border-0">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100 text-sm">MRR</p>
                    <p className="text-3xl font-bold">${overview?.mrr?.toLocaleString() || 0}</p>
                    <p className="text-green-200 text-xs">Ingresos Recurrentes Mensuales</p>
                  </div>
                  <DollarSign className="w-10 h-10 text-green-300/50" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-600 to-blue-700 border-0">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100 text-sm">ARR</p>
                    <p className="text-3xl font-bold">${overview?.arr?.toLocaleString() || 0}</p>
                    <p className="text-blue-200 text-xs">Ingresos Recurrentes Anuales</p>
                  </div>
                  <TrendingUp className="w-10 h-10 text-blue-300/50" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-600 to-purple-700 border-0">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-100 text-sm">Clientes Pagos</p>
                    <p className="text-3xl font-bold">{overview?.paying_customers || 0}</p>
                    <p className="text-purple-200 text-xs">De {overview?.total_organizations || 0} totales</p>
                  </div>
                  <Users className="w-10 h-10 text-purple-300/50" />
                </div>
              </CardContent>
            </Card>

            <Card className={`bg-gradient-to-br ${netIncome >= 0 ? 'from-emerald-600 to-emerald-700' : 'from-red-600 to-red-700'} border-0`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white/80 text-sm">Utilidad Neta</p>
                    <p className="text-3xl font-bold">${netIncome.toLocaleString()}</p>
                    <p className="text-white/60 text-xs">MRR - Costos Fijos</p>
                  </div>
                  {netIncome >= 0 ? (
                    <ArrowUp className="w-10 h-10 text-white/50" />
                  ) : (
                    <ArrowDown className="w-10 h-10 text-white/50" />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Revenue vs Costs */}
            <Card className="bg-slate-800 border-slate-700 lg:col-span-2">
              <CardHeader>
                <CardTitle>Ingresos vs Costos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-slate-400">Ingresos (MRR)</span>
                      <span className="text-green-400 font-bold">${overview?.mrr?.toLocaleString() || 0}</span>
                    </div>
                    <Progress value={100} className="h-3 bg-slate-700" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-slate-400">Costos Fijos</span>
                      <span className="text-red-400 font-bold">${totalFixedCosts.toLocaleString()}</span>
                    </div>
                    <Progress 
                      value={overview?.mrr ? (totalFixedCosts / overview.mrr * 100) : 0} 
                      className="h-3 bg-slate-700" 
                    />
                  </div>
                  <div className="pt-4 border-t border-slate-700">
                    <div className="flex justify-between">
                      <span className="font-medium">Margen Operativo</span>
                      <span className={`font-bold ${netIncome >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {overview?.mrr ? ((netIncome / overview.mrr) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Key Metrics */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle>Métricas Clave</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Churn Este Mes</span>
                  <Badge className="bg-red-500">{overview?.churned_this_month || 0}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Ingresos Este Mes</span>
                  <span className="font-bold text-green-400">${overview?.revenue_this_month?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">ARPU</span>
                  <span className="font-bold">
                    ${overview?.paying_customers ? (overview.mrr / overview.paying_customers).toFixed(0) : 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">LTV Estimado (12mo)</span>
                  <span className="font-bold text-blue-400">
                    ${overview?.paying_customers ? ((overview.mrr / overview.paying_customers) * 12).toFixed(0) : 0}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Subscriptions Tab */}
        <TabsContent value="subscriptions" className="space-y-6">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{overview?.total_organizations || 0}</p>
                <p className="text-xs text-slate-400">Total Suscriptores</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-green-400">{overview?.paying_customers || 0}</p>
                <p className="text-xs text-slate-400">Clientes Pagos</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-slate-400">
                  {(overview?.total_organizations || 0) - (overview?.paying_customers || 0)}
                </p>
                <p className="text-xs text-slate-400">Plan Gratuito</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle>Distribución por Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded bg-slate-500" />
                    <span>Starter (Gratis)</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{(overview?.total_organizations || 0) - (overview?.paying_customers || 0)}</p>
                    <p className="text-xs text-slate-400">$0/mes</p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded bg-blue-500" />
                    <span>Professional</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-blue-400">{overview?.paying_customers || 0}</p>
                    <p className="text-xs text-slate-400">$49/mes</p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded bg-purple-500" />
                    <span>Enterprise</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-purple-400">0</p>
                    <p className="text-xs text-slate-400">$149/mes</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-green-400">
                  ${payments?.summary?.total_revenue?.toLocaleString() || 0}
                </p>
                <p className="text-xs text-slate-400">Total Recaudado</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{payments?.summary?.total_transactions || 0}</p>
                <p className="text-xs text-slate-400">Transacciones</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-green-400">{payments?.summary?.by_status?.paid || 0}</p>
                <p className="text-xs text-slate-400">Pagados</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-red-400">{payments?.summary?.by_status?.failed || 0}</p>
                <p className="text-xs text-slate-400">Fallidos</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle>Transacciones Recientes</CardTitle>
              <CardDescription>Período: {payments?.period}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {payments?.transactions?.length === 0 ? (
                  <p className="text-center py-8 text-slate-400">Sin transacciones en este período</p>
                ) : (
                  payments?.transactions?.map(txn => (
                    <div key={txn.transaction_id} className="flex items-center justify-between p-3 rounded bg-slate-700/50">
                      <div>
                        <p className="font-medium">{txn.description}</p>
                        <p className="text-xs text-slate-400">{txn.created_at?.slice(0, 10)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold">${txn.amount}</span>
                        <Badge className={
                          txn.payment_status === "paid" ? "bg-green-500" :
                          txn.payment_status === "failed" ? "bg-red-500" :
                          "bg-yellow-500"
                        }>
                          {txn.payment_status === "paid" ? "Pagado" : 
                           txn.payment_status === "failed" ? "Fallido" : "Pendiente"}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fixed Costs Tab */}
        <TabsContent value="costs" className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-red-400">${totalFixedCosts.toFixed(0)}</p>
                <p className="text-xs text-slate-400">Costos Mensuales</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">${(totalFixedCosts * 12).toFixed(0)}</p>
                <p className="text-xs text-slate-400">Costos Anuales</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{fixedCosts.length}</p>
                <p className="text-xs text-slate-400">Conceptos</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PiggyBank className="w-5 h-5" />
                Costos Fijos y Presupuesto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {fixedCosts.map(cost => (
                  <div key={cost.id} className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50">
                    <div>
                      <p className="font-medium">{cost.name}</p>
                      <p className="text-xs text-slate-400">{cost.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">${cost.amount}</p>
                      <p className="text-xs text-slate-400">
                        {cost.frequency === "monthly" ? "/mes" : "/año"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-700">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total Mensual</span>
                  <span className="text-xl font-bold text-red-400">${totalFixedCosts.toFixed(0)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card className="bg-slate-800 border-slate-700 hover:bg-slate-700/50 cursor-pointer transition-colors">
              <CardContent className="p-6 text-center">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 text-blue-400" />
                <p className="font-medium">Dashboard Ejecutivo</p>
                <p className="text-xs text-slate-400">Resumen general</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700 hover:bg-slate-700/50 cursor-pointer transition-colors">
              <CardContent className="p-6 text-center">
                <Receipt className="w-12 h-12 mx-auto mb-3 text-green-400" />
                <p className="font-medium">Estado de Cuenta</p>
                <p className="text-xs text-slate-400">Movimientos del período</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700 hover:bg-slate-700/50 cursor-pointer transition-colors">
              <CardContent className="p-6 text-center">
                <Wallet className="w-12 h-12 mx-auto mb-3 text-purple-400" />
                <p className="font-medium">Cuentas por Cobrar</p>
                <p className="text-xs text-slate-400">Suscripciones pendientes</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700 hover:bg-slate-700/50 cursor-pointer transition-colors">
              <CardContent className="p-6 text-center">
                <CreditCard className="w-12 h-12 mx-auto mb-3 text-red-400" />
                <p className="font-medium">Cuentas por Pagar</p>
                <p className="text-xs text-slate-400">Proveedores y servicios</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700 hover:bg-slate-700/50 cursor-pointer transition-colors">
              <CardContent className="p-6 text-center">
                <Calculator className="w-12 h-12 mx-auto mb-3 text-amber-400" />
                <p className="font-medium">Presupuesto</p>
                <p className="text-xs text-slate-400">Plan vs Real</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700 hover:bg-slate-700/50 cursor-pointer transition-colors">
              <CardContent className="p-6 text-center">
                <ClipboardList className="w-12 h-12 mx-auto mb-3 text-cyan-400" />
                <p className="font-medium">Reportes Ejecutivos</p>
                <p className="text-xs text-slate-400">Exportar informes</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
