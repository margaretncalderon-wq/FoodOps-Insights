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
  Receipt, Wallet, PiggyBank, Calculator, ClipboardList, Loader2, Download
} from "lucide-react";
import jsPDF from "jspdf";
import "jspdf-autotable";

import { API_BASE as API } from "../../utils/api";

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
        axios.get(`${API}/api/super-admin/clarity/fixed-costs`, { withCredentials: true }),
      ]);
      
      setOverview(overviewRes.data);
      setPayments(paymentsRes.data);
      setFixedCosts(costsRes.data?.costs || []);
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
    
    try {
      if (editingCost) {
        // Update existing cost
        await axios.put(
          `${API}/api/super-admin/clarity/fixed-costs/${editingCost.cost_id}`,
          {
            name: costForm.name,
            amount: parseFloat(costForm.amount),
            category: costForm.category,
            frequency: costForm.frequency,
            notes: costForm.notes || null
          },
          { withCredentials: true }
        );
        toast.success(isEs ? "Gasto actualizado" : "Cost updated");
      } else {
        // Create new cost
        await axios.post(
          `${API}/api/super-admin/clarity/fixed-costs`,
          {
            name: costForm.name,
            amount: parseFloat(costForm.amount),
            category: costForm.category,
            frequency: costForm.frequency,
            notes: costForm.notes || null
          },
          { withCredentials: true }
        );
        toast.success(isEs ? "Gasto agregado" : "Cost added");
      }
      
      setShowCostDialog(false);
      resetCostForm();
      fetchData(); // Refresh data
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error al guardar el gasto" : "Error saving cost");
    }
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

  const handleDeleteCost = async (costId) => {
    if (!confirm(isEs ? "¿Eliminar este gasto?" : "Delete this cost?")) return;
    
    try {
      await axios.delete(
        `${API}/api/super-admin/clarity/fixed-costs/${costId}`,
        { withCredentials: true }
      );
      toast.success(isEs ? "Gasto eliminado" : "Cost deleted");
      fetchData(); // Refresh data
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error al eliminar el gasto" : "Error deleting cost");
    }
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

  // Export Fixed Costs to CSV
  const exportCostsToCSV = () => {
    const headers = [
      isEs ? "Nombre" : "Name",
      isEs ? "Categoría" : "Category",
      isEs ? "Monto" : "Amount",
      isEs ? "Frecuencia" : "Frequency",
      isEs ? "Monto Mensual" : "Monthly Amount",
      isEs ? "Notas" : "Notes"
    ];
    
    const rows = fixedCosts.map(cost => [
      cost.name,
      categoryLabels[cost.category] || cost.category,
      `$${cost.amount}`,
      cost.frequency === "monthly" ? (isEs ? "Mensual" : "Monthly") : (isEs ? "Anual" : "Yearly"),
      `$${cost.frequency === "monthly" ? cost.amount : (cost.amount / 12).toFixed(2)}`,
      cost.notes || ""
    ]);
    
    // Add totals row
    rows.push([]);
    rows.push([
      isEs ? "TOTAL MENSUAL" : "MONTHLY TOTAL",
      "",
      "",
      "",
      `$${totalFixedCosts.toFixed(2)}`,
      ""
    ]);
    rows.push([
      isEs ? "TOTAL ANUAL" : "ANNUAL TOTAL",
      "",
      "",
      "",
      `$${(totalFixedCosts * 12).toFixed(2)}`,
      ""
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(","))
      .join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kora_os_fixed_costs_${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(isEs ? "CSV descargado" : "CSV downloaded");
  };

  // Export Fixed Costs to PDF
  const exportCostsToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Title
    doc.setFontSize(20);
    doc.setTextColor(58, 77, 63); // Brand color
    doc.text("Kora OS", 14, 20);
    
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text(isEs ? "Reporte de Costos Fijos" : "Fixed Costs Report", 14, 30);
    
    doc.setFontSize(10);
    doc.setTextColor(128, 128, 128);
    doc.text(`${isEs ? "Período" : "Period"}: ${period}`, 14, 38);
    doc.text(`${isEs ? "Generado" : "Generated"}: ${new Date().toLocaleDateString()}`, 14, 44);
    
    // Summary Cards
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(isEs ? "Resumen Ejecutivo" : "Executive Summary", 14, 56);
    
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`${isEs ? "Total Mensual" : "Monthly Total"}: $${totalFixedCosts.toFixed(2)}`, 14, 64);
    doc.text(`${isEs ? "Total Anual" : "Annual Total"}: $${(totalFixedCosts * 12).toFixed(2)}`, 14, 70);
    doc.text(`${isEs ? "Número de Conceptos" : "Number of Items"}: ${fixedCosts.length}`, 14, 76);
    
    // Table
    const tableData = fixedCosts.map(cost => [
      cost.name,
      categoryLabels[cost.category] || cost.category,
      `$${cost.amount.toFixed(2)}`,
      cost.frequency === "monthly" ? (isEs ? "Mensual" : "Monthly") : (isEs ? "Anual" : "Yearly"),
      `$${(cost.frequency === "monthly" ? cost.amount : cost.amount / 12).toFixed(2)}`
    ]);
    
    doc.autoTable({
      startY: 85,
      head: [[
        isEs ? "Concepto" : "Item",
        isEs ? "Categoría" : "Category",
        isEs ? "Monto" : "Amount",
        isEs ? "Frecuencia" : "Frequency",
        isEs ? "Mensual" : "Monthly"
      ]],
      body: tableData,
      foot: [[
        isEs ? "TOTAL" : "TOTAL",
        "",
        "",
        "",
        `$${totalFixedCosts.toFixed(2)}`
      ]],
      theme: "striped",
      headStyles: { fillColor: [58, 77, 63], textColor: 255 },
      footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold" },
      styles: { fontSize: 9 }
    });
    
    // By Category breakdown
    const finalY = doc.lastAutoTable.finalY + 15;
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(isEs ? "Desglose por Categoría" : "Breakdown by Category", 14, finalY);
    
    const categoryData = Object.entries(
      fixedCosts.reduce((acc, cost) => {
        const cat = cost.category;
        const monthly = cost.frequency === "monthly" ? cost.amount : cost.amount / 12;
        acc[cat] = (acc[cat] || 0) + monthly;
        return acc;
      }, {})
    ).map(([cat, amount]) => [
      categoryLabels[cat] || cat,
      `$${amount.toFixed(2)}`,
      `${((amount / totalFixedCosts) * 100).toFixed(1)}%`
    ]);
    
    doc.autoTable({
      startY: finalY + 5,
      head: [[isEs ? "Categoría" : "Category", isEs ? "Monto Mensual" : "Monthly Amount", "%"]],
      body: categoryData,
      theme: "grid",
      headStyles: { fillColor: [100, 100, 100] },
      styles: { fontSize: 9 }
    });
    
    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Kora OS - Business Clarity | ${isEs ? "Página" : "Page"} ${i} ${isEs ? "de" : "of"} ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: "center" }
      );
    }
    
    doc.save(`kora_os_fixed_costs_${period}.pdf`);
    toast.success(isEs ? "PDF descargado" : "PDF downloaded");
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
            {isEs ? "Finanzas y métricas de Kora OS" : "Kora OS Finances & Metrics"}
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold">{overview?.total_organizations || 0}</p>
                <p className="text-sm text-muted-foreground">
                  {isEs ? "Total Organizaciones" : "Total Organizations"}
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
                <p className="text-3xl font-bold text-amber-500">{overview?.trialing_customers || 0}</p>
                <p className="text-sm text-muted-foreground">
                  {isEs ? "En Trial (7 días)" : "In Trial (7 days)"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-muted-foreground">
                  {(overview?.total_organizations || 0) - (overview?.paying_customers || 0) - (overview?.trialing_customers || 0)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isEs ? "Trial Expirado" : "Trial Expired"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Kora Core - Required Subscription */}
          <Card className="border-2 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                Kora Core
                <Badge className="bg-primary">{isEs ? "Suscripción Base" : "Base Subscription"}</Badge>
              </CardTitle>
              <CardDescription>
                System Pulse • Execution Hub • Client Engagement • Business Clarity • 1 Location
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5">
                <div>
                  <p className="text-2xl font-bold">$69<span className="text-sm font-normal text-muted-foreground">/mes</span></p>
                  <p className="text-sm text-muted-foreground">
                    {isEs ? "Precio actual de suscripción" : "Current subscription price"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-primary">{overview?.paying_customers || 0}</p>
                  <p className="text-sm text-muted-foreground">{isEs ? "Suscriptores activos" : "Active subscribers"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Add-on Modules */}
          <Card>
            <CardHeader>
              <CardTitle>{isEs ? "Módulos Add-on" : "Add-on Modules"}</CardTitle>
              <CardDescription>
                {isEs ? "Módulos opcionales con 7 días de prueba gratis" : "Optional modules with 7-day free trial"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { name: "Event Suite", nameEs: "Event Suite", desc: "Event Orchestration + Venues", price: 39, color: "bg-purple-500", count: overview?.module_event_suite || 0 },
                { name: "Culinary Intelligence", nameEs: "Inteligencia Culinaria", desc: isEs ? "Recetas, costeo, menús" : "Recipes, costing, menus", price: 29, color: "bg-orange-500", count: overview?.module_culinary_intelligence || 0 },
                { name: "Operations Supplies", nameEs: "Operations Supplies", desc: isEs ? "Inventario, proveedores" : "Inventory, suppliers", price: 19, color: "bg-cyan-500", count: overview?.module_operations_supplies || 0 },
                { name: "Demand Studio", nameEs: "Demand Studio", desc: "Marketing, leads", price: 39, color: "bg-pink-500", count: overview?.module_demand_studio || 0 }
              ].map(module => (
                <div key={module.name} className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded ${module.color}`} />
                    <div>
                      <span className="font-medium">{isEs ? module.nameEs : module.name}</span>
                      <p className="text-xs text-muted-foreground">{module.desc}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{module.count} {isEs ? "activos" : "active"}</p>
                    <p className="text-xs text-muted-foreground">+${module.price}/{isEs ? "mes" : "mo"}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Revenue by Module */}
          <Card>
            <CardHeader>
              <CardTitle>{isEs ? "Ingresos por Módulo" : "Revenue by Module"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Kora Core ({overview?.paying_customers || 0} × $69)</span>
                  <span className="font-bold text-green-500">${((overview?.paying_customers || 0) * 69).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Event Suite ({overview?.module_event_suite || 0} × $39)</span>
                  <span className="font-bold">${((overview?.module_event_suite || 0) * 39).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Culinary Intelligence ({overview?.module_culinary_intelligence || 0} × $29)</span>
                  <span className="font-bold">${((overview?.module_culinary_intelligence || 0) * 29).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Operations Supplies ({overview?.module_operations_supplies || 0} × $19)</span>
                  <span className="font-bold">${((overview?.module_operations_supplies || 0) * 19).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Demand Studio ({overview?.module_demand_studio || 0} × $39)</span>
                  <span className="font-bold">${((overview?.module_demand_studio || 0) * 39).toLocaleString()}</span>
                </div>
                <div className="pt-4 border-t flex items-center justify-between">
                  <span className="font-semibold">{isEs ? "MRR Total Estimado" : "Estimated Total MRR"}</span>
                  <span className="text-xl font-bold text-green-500">${overview?.mrr?.toLocaleString() || 0}</span>
                </div>
              </div>
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
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportCostsToCSV} data-testid="export-csv-btn">
                <Download className="w-4 h-4 mr-2" />
                CSV
              </Button>
              <Button variant="outline" onClick={exportCostsToPDF} data-testid="export-pdf-btn">
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>
              <Button onClick={() => { resetCostForm(); setShowCostDialog(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                {isEs ? "Agregar Gasto" : "Add Cost"}
              </Button>
            </div>
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
