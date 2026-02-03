import { useState, useEffect } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Progress } from "../../components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "../../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "../../components/ui/select";
import {
  DollarSign, TrendingUp, TrendingDown, Users, CreditCard, FileText,
  BarChart3, ArrowUp, ArrowDown, Calendar, Building2, Plus, Edit, Trash2,
  Receipt, Wallet, PiggyBank, Calculator, ClipboardList, Loader2
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function SuperAdminClarity() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  
  const [overview, setOverview] = useState(null);
  const [payments, setPayments] = useState([]);
  const [fixedCosts, setFixedCosts] = useState([]);
  const [showCostDialog, setShowCostDialog] = useState(false);
  const [editingCost, setEditingCost] = useState(null);
  const [costForm, setCostForm] = useState({
    name: "",
    amount: "",
    category: "infrastructure",
    frequency: "monthly",
    notes: ""
  });

  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [overviewRes, paymentsRes, costsRes] = await Promise.all([
        axios.get(`${API}/api/super-admin/bi/overview`, { withCredentials: true }),
        axios.get(`${API}/api/super-admin/bi/payments?period=${period}`, { withCredentials: true }),
        axios.get(`${API}/api/super-admin/clarity/fixed-costs`, { withCredentials: true }).catch(() => ({ data: { costs: [] } })),
      ]);
      
      setOverview(overviewRes.data);
      setPayments(paymentsRes.data);
      setFixedCosts(costsRes.data?.costs || [
        { cost_id: "1", name: "AWS Hosting", amount: 500, category: "infrastructure", frequency: "monthly" },
        { cost_id: "2", name: "MongoDB Atlas", amount: 200, category: "infrastructure", frequency: "monthly" },
        { cost_id: "3", name: "Stripe Fees", amount: 150, category: "payments", frequency: "monthly" },
        { cost_id: "4", name: isEs ? "Dominio" : "Domain", amount: 15, category: "infrastructure", frequency: "yearly" },
      ]);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleSaveCost = async () => {
    if (!costForm.name || !costForm.amount) {
      toast.error(isEs ? "Completa los campos requeridos" : "Fill required fields");
      return;
    }
    
    const newCost = {
      cost_id: editingCost?.cost_id || `cost_${Date.now()}`,
      ...costForm,
      amount: parseFloat(costForm.amount)
    };
    
    if (editingCost) {
      setFixedCosts(fixedCosts.map(c => c.cost_id === editingCost.cost_id ? newCost : c));
      toast.success(isEs ? "Gasto actualizado" : "Cost updated");
    } else {
      setFixedCosts([...fixedCosts, newCost]);
      toast.success(isEs ? "Gasto agregado" : "Cost added");
    }
    
    setShowCostDialog(false);
    resetCostForm();
  };

  const handleEditCost = (cost) => {
    setEditingCost(cost);
    setCostForm({
      name: cost.name,
      amount: cost.amount.toString(),
      category: cost.category,
      frequency: cost.frequency,
      notes: cost.notes || ""
    });
    setShowCostDialog(true);
  };

  const handleDeleteCost = (costId) => {
    if (!confirm(isEs ? "¿Eliminar este gasto?" : "Delete this cost?")) return;
    setFixedCosts(fixedCosts.filter(c => c.cost_id !== costId));
    toast.success(isEs ? "Gasto eliminado" : "Cost deleted");
  };

  const resetCostForm = () => {
    setEditingCost(null);
    setCostForm({ name: "", amount: "", category: "infrastructure", frequency: "monthly", notes: "" });
  };

  const totalFixedCosts = fixedCosts.reduce((sum, cost) => {
    if (cost.frequency === "yearly") return sum + (cost.amount / 12);
    return sum + cost.amount;
  }, 0);

  const netIncome = (overview?.mrr || 0) - totalFixedCosts;

  const categoryLabels = {
    infrastructure: isEs ? "Infraestructura" : "Infrastructure",
    payments: isEs ? "Pagos" : "Payments",
    marketing: "Marketing",
    personnel: isEs ? "Personal" : "Personnel",
    other: isEs ? "Otros" : "Other"
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="clarity-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Business Clarity</h1>
          <p className="text-muted-foreground">
            {isEs ? "Finanzas y métricas de Evoke OS" : "Evoke OS Finances & Metrics"}
          </p>
        </div>
        <Input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="w-40"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard">
            {isEs ? "Dashboard Ejecutivo" : "Executive Dashboard"}
          </TabsTrigger>
          <TabsTrigger value="subscriptions">
            {isEs ? "Suscripciones" : "Subscriptions"}
          </TabsTrigger>
          <TabsTrigger value="payments">
            {isEs ? "Pagos Recibidos" : "Received Payments"}
          </TabsTrigger>
          <TabsTrigger value="costs">
            {isEs ? "Costos Fijos" : "Fixed Costs"}
          </TabsTrigger>
          <TabsTrigger value="reports">
            {isEs ? "Reportes" : "Reports"}
          </TabsTrigger>
        </TabsList>

        {/* Executive Dashboard */}
        <TabsContent value="dashboard" className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-green-500/5 border-green-500/20">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">MRR</p>
                    <p className="text-3xl font-bold text-green-500">${overview?.mrr?.toLocaleString() || 0}</p>
                    <p className="text-xs text-muted-foreground">
                      {isEs ? "Ingresos Recurrentes Mensuales" : "Monthly Recurring Revenue"}
                    </p>
                  </div>
                  <DollarSign className="w-10 h-10 text-green-500/30" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-blue-500/5 border-blue-500/20">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">ARR</p>
                    <p className="text-3xl font-bold text-blue-500">${overview?.arr?.toLocaleString() || 0}</p>
                    <p className="text-xs text-muted-foreground">
                      {isEs ? "Ingresos Recurrentes Anuales" : "Annual Recurring Revenue"}
                    </p>
                  </div>
                  <TrendingUp className="w-10 h-10 text-blue-500/30" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-purple-500/5 border-purple-500/20">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {isEs ? "Clientes Pagos" : "Paying Customers"}
                    </p>
                    <p className="text-3xl font-bold text-purple-500">{overview?.paying_customers || 0}</p>
                    <p className="text-xs text-muted-foreground">
                      {isEs ? `De ${overview?.total_organizations || 0} totales` : `Of ${overview?.total_organizations || 0} total`}
                    </p>
                  </div>
                  <Users className="w-10 h-10 text-purple-500/30" />
                </div>
              </CardContent>
            </Card>

            <Card className={`${netIncome >= 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {isEs ? "Utilidad Neta" : "Net Income"}
                    </p>
                    <p className={`text-3xl font-bold ${netIncome >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      ${netIncome.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      MRR - {isEs ? "Costos Fijos" : "Fixed Costs"}
                    </p>
                  </div>
                  {netIncome >= 0 ? (
                    <ArrowUp className="w-10 h-10 text-emerald-500/30" />
                  ) : (
                    <ArrowDown className="w-10 h-10 text-red-500/30" />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Revenue vs Costs */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{isEs ? "Ingresos vs Costos" : "Revenue vs Costs"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-muted-foreground">{isEs ? "Ingresos (MRR)" : "Revenue (MRR)"}</span>
                    <span className="text-green-500 font-bold">${overview?.mrr?.toLocaleString() || 0}</span>
                  </div>
                  <Progress value={100} className="h-3" />
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-muted-foreground">{isEs ? "Costos Fijos" : "Fixed Costs"}</span>
                    <span className="text-red-500 font-bold">${totalFixedCosts.toLocaleString()}</span>
                  </div>
                  <Progress 
                    value={overview?.mrr ? (totalFixedCosts / overview.mrr * 100) : 0} 
                    className="h-3" 
                  />
                </div>
                <div className="pt-4 border-t">
                  <div className="flex justify-between">
                    <span className="font-medium">{isEs ? "Margen Operativo" : "Operating Margin"}</span>
                    <span className={`font-bold ${netIncome >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {overview?.mrr ? ((netIncome / overview.mrr) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{isEs ? "Métricas Clave" : "Key Metrics"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Churn</span>
                  <Badge variant="destructive">{overview?.churned_this_month || 0}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    {isEs ? "Ingresos Este Mes" : "Revenue This Month"}
                  </span>
                  <span className="font-bold text-green-500">${overview?.revenue_this_month?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">ARPU</span>
                  <span className="font-bold">
                    ${overview?.paying_customers ? (overview.mrr / overview.paying_customers).toFixed(0) : 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">LTV (12mo)</span>
                  <span className="font-bold text-blue-500">
                    ${overview?.paying_customers ? ((overview.mrr / overview.paying_customers) * 12).toFixed(0) : 0}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Subscriptions Tab */}
        <TabsContent value="subscriptions" className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold">{overview?.total_organizations || 0}</p>
                <p className="text-sm text-muted-foreground">
                  {isEs ? "Total Suscriptores" : "Total Subscribers"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-green-500">{overview?.paying_customers || 0}</p>
                <p className="text-sm text-muted-foreground">
                  {isEs ? "Clientes Pagos" : "Paying Customers"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-muted-foreground">
                  {(overview?.total_organizations || 0) - (overview?.paying_customers || 0)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isEs ? "Plan Gratuito" : "Free Plan"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{isEs ? "Distribución por Plan" : "Distribution by Plan"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { name: "Starter", price: "$0", count: (overview?.total_organizations || 0) - (overview?.paying_customers || 0), color: "bg-slate-500" },
                { name: "Professional", price: "$49", count: overview?.paying_customers || 0, color: "bg-blue-500" },
                { name: "Enterprise", price: "$149", count: 0, color: "bg-purple-500" }
              ].map(plan => (
                <div key={plan.name} className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded ${plan.color}`} />
                    <span>{plan.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{plan.count}</p>
                    <p className="text-xs text-muted-foreground">{plan.price}/{isEs ? "mes" : "mo"}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold text-green-500">
                  ${payments?.summary?.total_revenue?.toLocaleString() || 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isEs ? "Total Recaudado" : "Total Collected"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold">{payments?.summary?.total_transactions || 0}</p>
                <p className="text-xs text-muted-foreground">
                  {isEs ? "Transacciones" : "Transactions"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold text-green-500">{payments?.summary?.by_status?.paid || 0}</p>
                <p className="text-xs text-muted-foreground">{isEs ? "Pagados" : "Paid"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-2xl font-bold text-red-500">{payments?.summary?.by_status?.failed || 0}</p>
                <p className="text-xs text-muted-foreground">{isEs ? "Fallidos" : "Failed"}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{isEs ? "Transacciones Recientes" : "Recent Transactions"}</CardTitle>
              <CardDescription>{isEs ? "Período" : "Period"}: {payments?.period}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {payments?.transactions?.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    {isEs ? "Sin transacciones en este período" : "No transactions in this period"}
                  </p>
                ) : (
                  payments?.transactions?.map(txn => (
                    <div key={txn.transaction_id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="font-medium">{txn.description}</p>
                        <p className="text-xs text-muted-foreground">{txn.created_at?.slice(0, 10)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold">${txn.amount}</span>
                        <Badge variant={txn.payment_status === "paid" ? "default" : "destructive"}>
                          {txn.payment_status === "paid" ? (isEs ? "Pagado" : "Paid") : 
                           txn.payment_status === "failed" ? (isEs ? "Fallido" : "Failed") : 
                           (isEs ? "Pendiente" : "Pending")}
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
          <div className="flex items-center justify-between">
            <div className="grid grid-cols-3 gap-4 flex-1 mr-4">
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-2xl font-bold text-red-500">${totalFixedCosts.toFixed(0)}</p>
                  <p className="text-xs text-muted-foreground">
                    {isEs ? "Costos Mensuales" : "Monthly Costs"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-2xl font-bold">${(totalFixedCosts * 12).toFixed(0)}</p>
                  <p className="text-xs text-muted-foreground">
                    {isEs ? "Costos Anuales" : "Annual Costs"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-2xl font-bold">{fixedCosts.length}</p>
                  <p className="text-xs text-muted-foreground">
                    {isEs ? "Conceptos" : "Items"}
                  </p>
                </CardContent>
              </Card>
            </div>
            <Button onClick={() => { resetCostForm(); setShowCostDialog(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              {isEs ? "Agregar Gasto" : "Add Cost"}
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PiggyBank className="w-5 h-5" />
                {isEs ? "Costos Fijos y Presupuesto" : "Fixed Costs & Budget"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {fixedCosts.map(cost => (
                  <div key={cost.cost_id} className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <p className="font-medium">{cost.name}</p>
                      <p className="text-xs text-muted-foreground">{categoryLabels[cost.category] || cost.category}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-bold">${cost.amount}</p>
                        <p className="text-xs text-muted-foreground">
                          {cost.frequency === "monthly" ? (isEs ? "/mes" : "/mo") : (isEs ? "/año" : "/year")}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleEditCost(cost)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDeleteCost(cost.cost_id)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{isEs ? "Total Mensual" : "Monthly Total"}</span>
                  <span className="text-xl font-bold text-red-500">${totalFixedCosts.toFixed(0)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { icon: BarChart3, color: "text-blue-500", label: isEs ? "Dashboard Ejecutivo" : "Executive Dashboard", desc: isEs ? "Resumen general" : "General summary" },
              { icon: Receipt, color: "text-green-500", label: isEs ? "Estado de Cuenta" : "Account Statement", desc: isEs ? "Movimientos del período" : "Period movements" },
              { icon: Wallet, color: "text-purple-500", label: isEs ? "Cuentas por Cobrar" : "Accounts Receivable", desc: isEs ? "Suscripciones pendientes" : "Pending subscriptions" },
              { icon: CreditCard, color: "text-red-500", label: isEs ? "Cuentas por Pagar" : "Accounts Payable", desc: isEs ? "Proveedores y servicios" : "Vendors & services" },
              { icon: Calculator, color: "text-amber-500", label: isEs ? "Presupuesto" : "Budget", desc: isEs ? "Plan vs Real" : "Plan vs Actual" },
              { icon: ClipboardList, color: "text-cyan-500", label: isEs ? "Reportes Ejecutivos" : "Executive Reports", desc: isEs ? "Exportar informes" : "Export reports" },
            ].map((item, idx) => (
              <Card key={idx} className="hover:bg-muted/50 cursor-pointer transition-colors">
                <CardContent className="pt-6 text-center">
                  <item.icon className={`w-12 h-12 mx-auto mb-3 ${item.color}`} />
                  <p className="font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Cost Dialog */}
      <Dialog open={showCostDialog} onOpenChange={setShowCostDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCost 
                ? (isEs ? "Editar Gasto" : "Edit Cost") 
                : (isEs ? "Agregar Gasto" : "Add Cost")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Nombre" : "Name"} *</Label>
              <Input
                value={costForm.name}
                onChange={(e) => setCostForm({ ...costForm, name: e.target.value })}
                placeholder={isEs ? "Ej: AWS Hosting" : "Ex: AWS Hosting"}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Monto" : "Amount"} ($) *</Label>
                <Input
                  type="number"
                  value={costForm.amount}
                  onChange={(e) => setCostForm({ ...costForm, amount: e.target.value })}
                />
              </div>
              <div>
                <Label>{isEs ? "Frecuencia" : "Frequency"}</Label>
                <Select value={costForm.frequency} onValueChange={(v) => setCostForm({ ...costForm, frequency: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">{isEs ? "Mensual" : "Monthly"}</SelectItem>
                    <SelectItem value="yearly">{isEs ? "Anual" : "Yearly"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{isEs ? "Categoría" : "Category"}</Label>
              <Select value={costForm.category} onValueChange={(v) => setCostForm({ ...costForm, category: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="infrastructure">{isEs ? "Infraestructura" : "Infrastructure"}</SelectItem>
                  <SelectItem value="payments">{isEs ? "Pagos" : "Payments"}</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="personnel">{isEs ? "Personal" : "Personnel"}</SelectItem>
                  <SelectItem value="other">{isEs ? "Otros" : "Other"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Input
                value={costForm.notes}
                onChange={(e) => setCostForm({ ...costForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCostDialog(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveCost}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
