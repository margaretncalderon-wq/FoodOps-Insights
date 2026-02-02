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
  BarChart3, PieChart, ArrowUp, ArrowDown, Calendar, Building2,
  Package, AlertCircle, CheckCircle2, Clock, Loader2
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function BIPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  
  const [overview, setOverview] = useState(null);
  const [payments, setPayments] = useState(null);
  const [supplierInvoices, setSupplierInvoices] = useState(null);
  const [abcAnalysis, setAbcAnalysis] = useState(null);
  const [revenueTrend, setRevenueTrend] = useState(null);

  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [overviewRes, paymentsRes, invoicesRes, abcRes, trendRes] = await Promise.all([
        axios.get(`${API}/api/super-admin/bi/overview`, { withCredentials: true }),
        axios.get(`${API}/api/super-admin/bi/payments?period=${period}`, { withCredentials: true }),
        axios.get(`${API}/api/super-admin/bi/supplier-invoices?period=${period}`, { withCredentials: true }),
        axios.get(`${API}/api/super-admin/bi/abc-analysis`, { withCredentials: true }),
        axios.get(`${API}/api/super-admin/bi/revenue-trend?months=6`, { withCredentials: true })
      ]);
      
      setOverview(overviewRes.data);
      setPayments(paymentsRes.data);
      setSupplierInvoices(invoicesRes.data);
      setAbcAnalysis(abcRes.data);
      setRevenueTrend(trendRes.data);
    } catch (err) {
      console.error(err);
      toast.error("Error loading BI data");
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6" data-testid="bi-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Business Intelligence</h1>
          <p className="text-slate-400">Métricas financieras y análisis de la plataforma</p>
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
        <TabsList className="bg-slate-800">
          <TabsTrigger value="overview">Resumen</TabsTrigger>
          <TabsTrigger value="payments">Pagos</TabsTrigger>
          <TabsTrigger value="suppliers">Proveedores</TabsTrigger>
          <TabsTrigger value="abc">ABC Analysis</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-green-600 to-green-700 border-0">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100 text-sm">MRR</p>
                    <p className="text-3xl font-bold">${overview?.mrr?.toLocaleString() || 0}</p>
                    <p className="text-green-200 text-xs">Monthly Recurring Revenue</p>
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
                    <p className="text-blue-200 text-xs">Annual Recurring Revenue</p>
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

            <Card className="bg-gradient-to-br from-amber-600 to-amber-700 border-0">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-amber-100 text-sm">Ingresos Este Mes</p>
                    <p className="text-3xl font-bold">${overview?.revenue_this_month?.toLocaleString() || 0}</p>
                    <p className="text-amber-200 text-xs">Período: {overview?.period}</p>
                  </div>
                  <CreditCard className="w-10 h-10 text-amber-300/50" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Revenue Trend Chart */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle>Tendencia de Ingresos (6 meses)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-48">
                {revenueTrend?.trends?.map((item, idx) => {
                  const maxRevenue = Math.max(...revenueTrend.trends.map(t => t.revenue)) || 1;
                  const height = (item.revenue / maxRevenue) * 100;
                  
                  return (
                    <div key={item.period} className="flex-1 flex flex-col items-center gap-2">
                      <span className="text-xs text-green-400">${item.revenue}</span>
                      <div 
                        className="w-full bg-gradient-to-t from-green-600 to-green-400 rounded-t"
                        style={{ height: `${Math.max(height, 5)}%` }}
                      />
                      <span className="text-xs text-slate-400">{item.period.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Churn & New Orgs */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-red-500/20">
                    <TrendingDown className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{overview?.churned_this_month || 0}</p>
                    <p className="text-slate-400">Cancelaciones este mes</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-green-500/20">
                    <Building2 className="w-6 h-6 text-green-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">
                      {revenueTrend?.trends?.[revenueTrend.trends.length - 1]?.new_organizations || 0}
                    </p>
                    <p className="text-slate-400">Nuevas organizaciones</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-6">
          {/* Summary Cards */}
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

          {/* Transactions List */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle>Transacciones de Suscripción</CardTitle>
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
                          {txn.payment_status}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Supplier Invoices Tab */}
        <TabsContent value="suppliers" className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-blue-400">
                  ${supplierInvoices?.summary?.total_invoiced?.toLocaleString() || 0}
                </p>
                <p className="text-xs text-slate-400">Total Facturado</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{supplierInvoices?.summary?.invoice_count || 0}</p>
                <p className="text-xs text-slate-400">Facturas</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-purple-400">
                  ${supplierInvoices?.summary?.total_pos?.toLocaleString() || 0}
                </p>
                <p className="text-xs text-slate-400">Total en POs</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{supplierInvoices?.summary?.po_count || 0}</p>
                <p className="text-xs text-slate-400">Órdenes de Compra</p>
              </CardContent>
            </Card>
          </div>

          {/* Status Breakdown */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg">Facturas por Estado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(supplierInvoices?.summary?.invoices_by_status || {}).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <span className="capitalize">{status}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg">POs por Estado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(supplierInvoices?.summary?.pos_by_status || {}).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <span className="capitalize">{status}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent POs */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle>Órdenes de Compra Recientes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {supplierInvoices?.purchase_orders?.length === 0 ? (
                  <p className="text-center py-8 text-slate-400">Sin órdenes de compra en este período</p>
                ) : (
                  supplierInvoices?.purchase_orders?.slice(0, 20).map(po => (
                    <div key={po.po_number} className="flex items-center justify-between p-3 rounded bg-slate-700/50">
                      <div>
                        <p className="font-medium">{po.po_number}</p>
                        <p className="text-xs text-slate-400">{po.supplier_name}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold">${po.total?.toLocaleString()}</span>
                        <Badge variant="outline">{po.status}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABC Analysis Tab */}
        <TabsContent value="abc" className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-green-600/20 to-green-700/20 border-green-500/30">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <Badge className="bg-green-500 text-lg px-3">A</Badge>
                  <span className="text-xs text-green-400">Top 80% ingresos</span>
                </div>
                <p className="text-3xl font-bold">{abcAnalysis?.summary?.classes?.A?.count || 0}</p>
                <p className="text-green-400">${abcAnalysis?.summary?.classes?.A?.value?.toLocaleString() || 0}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-yellow-600/20 to-yellow-700/20 border-yellow-500/30">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <Badge className="bg-yellow-500 text-lg px-3">B</Badge>
                  <span className="text-xs text-yellow-400">Siguiente 15%</span>
                </div>
                <p className="text-3xl font-bold">{abcAnalysis?.summary?.classes?.B?.count || 0}</p>
                <p className="text-yellow-400">${abcAnalysis?.summary?.classes?.B?.value?.toLocaleString() || 0}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-red-600/20 to-red-700/20 border-red-500/30">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <Badge className="bg-red-500 text-lg px-3">C</Badge>
                  <span className="text-xs text-red-400">Último 5%</span>
                </div>
                <p className="text-3xl font-bold">{abcAnalysis?.summary?.classes?.C?.count || 0}</p>
                <p className="text-red-400">${abcAnalysis?.summary?.classes?.C?.value?.toLocaleString() || 0}</p>
              </CardContent>
            </Card>
          </div>

          {/* Organizations List */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle>Organizaciones por Valor</CardTitle>
              <CardDescription>
                Valor anual total: ${abcAnalysis?.summary?.total_annual_value?.toLocaleString() || 0}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {abcAnalysis?.organizations?.map((org, idx) => (
                  <div key={org.company_id} className="flex items-center justify-between p-3 rounded bg-slate-700/50">
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500 w-6 text-right">{idx + 1}</span>
                      <Badge className={
                        org.abc_class === "A" ? "bg-green-500" :
                        org.abc_class === "B" ? "bg-yellow-500" :
                        "bg-red-500"
                      }>
                        {org.abc_class}
                      </Badge>
                      <div>
                        <p className="font-medium">{org.name}</p>
                        <p className="text-xs text-slate-400">
                          {org.plan} • {org.users_count} usuarios • {org.events_count} eventos
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">${org.annual_value?.toLocaleString()}/año</p>
                      <p className="text-xs text-slate-400">{org.cumulative_percentage}% acumulado</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
