import { useState, useEffect } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTerminology } from "../../hooks/useTerminology";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  Users, Download, RefreshCw, Wallet, PieChart, Calendar,
  FileBarChart, BarChart3, Building2, AlertTriangle, CheckCircle, AlertCircle, Info, FileText, Lock, Unlock,
  Package, TrendingDown, DollarSign, Receipt, Layers, ChevronDown, ChevronRight
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ReportsSection() {
  const { language } = useLanguage();
  const { term } = useTerminology();
  const isEs = language === "es";
  const [activeReport, setActiveReport] = useState("snapshot");
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [targetMargin, setTargetMargin] = useState(30);
  const [showCollectedPaid, setShowCollectedPaid] = useState(false);
  const [periodStatus, setPeriodStatus] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState("current");
  const [closedPeriods, setClosedPeriods] = useState([]);
  const [expandedCC, setExpandedCC] = useState(null);
  const [ccTransactions, setCcTransactions] = useState([]);

  useEffect(() => {
    // Fetch closed periods
    axios.get(`${API}/api/business-clarity/period-close/periods?year=${new Date().getFullYear()}`, { withCredentials: true })
      .then(res => setClosedPeriods(res.data || []))
      .catch(() => {});
    
    // Fetch current period status
    const now = new Date();
    axios.get(`${API}/api/business-clarity/period-close/${now.getFullYear()}/${now.getMonth() + 1}`, { withCredentials: true })
      .then(res => setPeriodStatus(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const now = new Date();
    const endpoints = { 
      snapshot: "/api/business-clarity/reports/financial-snapshot", 
      clients: "/api/business-clarity/reports/client-revenue", 
      suppliers: "/api/business-clarity/reports/supplier-spend", 
      events: "/api/business-clarity/reports/event-profitability", 
      assets: "/api/business-clarity/reports/asset-value",
      costcenters: `/api/business-clarity/reports/by-cost-center?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
      departments: `/api/business-clarity/reports/by-department?year=${now.getFullYear()}&month=${now.getMonth() + 1}`
    };
    axios.get(`${API}${endpoints[activeReport]}`, { withCredentials: true })
      .then(res => setReportData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeReport]);

  const getHealthBadge = (event) => {
    const margin = event.margin_percent || 0;
    if (margin < 0) {
      return <Badge className="bg-red-600 text-white gap-1"><AlertCircle className="w-3 h-3" />{isEs ? "Pérdida" : "Loss"}</Badge>;
    }
    if (margin < targetMargin) {
      return <Badge variant="secondary" className="bg-amber-100 text-amber-800 gap-1"><AlertTriangle className="w-3 h-3" />{isEs ? "Riesgo" : "Risk"}</Badge>;
    }
    return <Badge className="bg-green-600 text-white gap-1"><CheckCircle className="w-3 h-3" />{isEs ? "Saludable" : "Healthy"}</Badge>;
  };

  const currentMonthName = new Date().toLocaleString(isEs ? 'es' : 'en', { month: 'long' });
  const isPeriodClosed = periodStatus?.status === "closed";

  const exportToCSV = () => {
    if (!reportData) return;
    let headers = [];
    let rows = [];
    const date = new Date().toISOString().split('T')[0];
    let filename = `report_${activeReport}_${date}.csv`;
    
    if (activeReport === "snapshot") {
      headers = ["Metric", "Value"];
      rows = [
        [isEs ? "Facturado" : "Invoiced", reportData.revenue?.total_invoiced || 0],
        [isEs ? "Costos Asignados" : "Assigned Costs", reportData.expenses?.assigned || reportData.expenses?.total || 0],
        [isEs ? "Utilidad Bruta" : "Gross Profit", reportData.profit?.gross || 0],
        [isEs ? "Margen %" : "Margin %", reportData.profit?.margin || 0],
        [isEs ? "Cobrado" : "Collected", reportData.revenue?.total_collected || 0],
        [isEs ? "Pagado" : "Paid", reportData.expenses?.paid || 0],
        [isEs ? "Flujo Neto" : "Net Cash Flow", (reportData.revenue?.total_collected || 0) - (reportData.expenses?.paid || 0)],
      ];
    } else if (activeReport === "clients") {
      headers = [isEs ? "Cliente" : "Client", isEs ? "Facturado" : "Invoiced", isEs ? "Cobrado" : "Collected", isEs ? "Pendiente" : "Outstanding"];
      rows = (reportData.records || []).map(r => [r.client_name, r.total_invoiced, r.total_paid, r.total_outstanding]);
    } else if (activeReport === "suppliers") {
      headers = [isEs ? "Proveedor" : "Supplier", "Total", isEs ? "Pagado" : "Paid", isEs ? "Pendiente" : "Pending"];
      rows = (reportData.records || []).map(r => [r.supplier_name, r.total_amount, r.paid_amount, r.pending_amount]);
    } else if (activeReport === "events") {
      headers = [term("events", "entity_singular"), isEs ? "Cliente" : "Client", isEs ? "Origen" : "Source", isEs ? "Estado" : "Health", isEs ? "Ingresos" : "Revenue", isEs ? "Costos" : "Costs", isEs ? "Utilidad" : "Profit", isEs ? "Margen %" : "Margin %"];
      rows = (reportData.records || []).map(r => {
        const health = r.margin_percent < 0 ? (isEs ? "Pérdida" : "Loss") : r.margin_percent < targetMargin ? (isEs ? "Riesgo" : "Risk") : (isEs ? "Saludable" : "Healthy");
        return [r.event_name, r.client_name || "", r.source_display || "N/A", health, r.revenue, r.costs, r.profit, r.margin_percent];
      });
    } else if (activeReport === "assets") {
      headers = [isEs ? "Métrica" : "Metric", isEs ? "Valor" : "Value"];
      rows = [
        [isEs ? "Valor Total de Activos" : "Total Asset Value", reportData.assets?.total_value || 0],
        [isEs ? "Valor de Reposición" : "Replacement Value", reportData.assets?.replacement_value || 0],
        [isEs ? "Pérdidas Totales" : "Total Losses", reportData.losses?.total_value || 0],
        [isEs ? "Gasto Operativo" : "Operational Expense", reportData.losses?.operational_expense || 0],
        [isEs ? "Facturado a Clientes" : "Billed to Clients", reportData.losses?.billed_to_clients || 0],
        [isEs ? "Tasa de Pérdida %" : "Loss Rate %", reportData.metrics?.loss_rate || 0],
        [isEs ? "Tasa de Recuperación %" : "Recovery Rate %", reportData.metrics?.recovery_rate || 0],
        [isEs ? "Pérdida Neta" : "Net Loss", reportData.metrics?.net_loss || 0],
      ];
    }
    
    const csvContent = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    toast.success(isEs ? "CSV exportado" : "CSV exported");
  };

  const exportToPDF = async () => {
    if (!reportData) return;
    try {
      const { jsPDF } = await import("jspdf");
      await import("jspdf-autotable");
      
      const doc = new jsPDF();
      const date = formatDateOnly(new Date(), language);
      const reportTitles = {
        snapshot: isEs ? "Resumen Financiero" : "Financial Snapshot",
        clients: isEs ? "Reporte por Cliente" : "Client Revenue Report",
        suppliers: isEs ? "Reporte por Proveedor" : "Supplier Spend Report",
        events: isEs ? `Reporte por ${term("events", "entity_singular")}` : `${term("events", "entity_singular")} Profitability Report`,
        assets: isEs ? "Reporte de Valor de Activos" : "Asset Value Report"
      };
      
      doc.setFontSize(18);
      doc.text(reportTitles[activeReport], 14, 22);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${isEs ? "Generado:" : "Generated:"} ${date}`, 14, 30);
      
      let startY = 40;
      
      if (activeReport === "snapshot") {
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.text(isEs ? "Utilidad Operativa (Devengado)" : "Operational Profit (Accrued)", 14, startY);
        
        doc.autoTable({
          startY: startY + 5,
          head: [[isEs ? "Métrica" : "Metric", isEs ? "Valor" : "Value"]],
          body: [
            [isEs ? "Facturado" : "Invoiced", `$${(reportData.revenue?.total_invoiced || 0).toLocaleString()}`],
            [isEs ? "Costos Asignados" : "Assigned Costs", `$${(reportData.expenses?.assigned || reportData.expenses?.total || 0).toLocaleString()}`],
            [isEs ? "Utilidad Bruta" : "Gross Profit", `$${(reportData.profit?.gross || 0).toLocaleString()}`],
            [isEs ? "Margen" : "Margin", `${reportData.profit?.margin || 0}%`],
          ],
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] }
        });
        
        doc.text(isEs ? "Posición de Caja (Realizado)" : "Cash Position (Realized)", 14, doc.lastAutoTable.finalY + 15);
        
        doc.autoTable({
          startY: doc.lastAutoTable.finalY + 20,
          head: [[isEs ? "Métrica" : "Metric", isEs ? "Valor" : "Value"]],
          body: [
            [isEs ? "Cobrado de Clientes" : "Collected from Clients", `$${(reportData.revenue?.total_collected || 0).toLocaleString()}`],
            [isEs ? "Pagado a Proveedores" : "Paid to Suppliers", `$${(reportData.expenses?.paid || 0).toLocaleString()}`],
            [isEs ? "Flujo Neto de Caja" : "Net Cash Flow", `$${((reportData.revenue?.total_collected || 0) - (reportData.expenses?.paid || 0)).toLocaleString()}`],
          ],
          theme: 'striped',
          headStyles: { fillColor: [34, 197, 94] }
        });
      } else if (activeReport === "clients") {
        doc.autoTable({
          startY: startY,
          head: [[isEs ? "Cliente" : "Client", isEs ? "Facturado" : "Invoiced", isEs ? "Cobrado" : "Collected", isEs ? "Pendiente" : "Outstanding"]],
          body: (reportData.records || []).map(r => [
            r.client_name,
            `$${(r.total_invoiced || 0).toLocaleString()}`,
            `$${(r.total_paid || 0).toLocaleString()}`,
            `$${(r.total_outstanding || 0).toLocaleString()}`
          ]),
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] }
        });
      } else if (activeReport === "suppliers") {
        doc.autoTable({
          startY: startY,
          head: [[isEs ? "Proveedor" : "Supplier", "Total", isEs ? "Pagado" : "Paid", isEs ? "Pendiente" : "Pending"]],
          body: (reportData.records || []).map(r => [
            r.supplier_name,
            `$${(r.total_amount || 0).toLocaleString()}`,
            `$${(r.paid_amount || 0).toLocaleString()}`,
            `$${(r.pending_amount || 0).toLocaleString()}`
          ]),
          theme: 'striped',
          headStyles: { fillColor: [249, 115, 22] }
        });
      } else if (activeReport === "events") {
        doc.autoTable({
          startY: startY,
          head: [[term("events", "entity_singular"), isEs ? "Estado" : "Health", isEs ? "Ingresos" : "Revenue", isEs ? "Costos" : "Costs", isEs ? "Utilidad" : "Profit", isEs ? "Margen" : "Margin"]],
          body: (reportData.records || []).map(r => {
            const health = r.margin_percent < 0 ? (isEs ? "Pérdida" : "Loss") : r.margin_percent < targetMargin ? (isEs ? "Riesgo" : "Risk") : (isEs ? "Saludable" : "Healthy");
            return [
              r.event_name,
              health,
              `$${(r.revenue || 0).toLocaleString()}`,
              `$${(r.costs || 0).toLocaleString()}`,
              `$${(r.profit || 0).toLocaleString()}`,
              `${r.margin_percent || 0}%`
            ];
          }),
          theme: 'striped',
          headStyles: { fillColor: [139, 92, 246] },
          didParseCell: function(data) {
            if (data.column.index === 1 && data.section === 'body') {
              const health = data.cell.raw;
              if (health === (isEs ? "Pérdida" : "Loss")) {
                data.cell.styles.textColor = [220, 38, 38];
              } else if (health === (isEs ? "Riesgo" : "Risk")) {
                data.cell.styles.textColor = [217, 119, 6];
              } else {
                data.cell.styles.textColor = [22, 163, 74];
              }
            }
          }
        });
      } else if (activeReport === "assets") {
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.text(isEs ? "Resumen de Activos" : "Asset Summary", 14, startY);
        
        doc.autoTable({
          startY: startY + 5,
          head: [[isEs ? "Métrica" : "Metric", isEs ? "Valor" : "Value"]],
          body: [
            [isEs ? "Valor Total de Activos" : "Total Asset Value", `$${(reportData.assets?.total_value || 0).toLocaleString()}`],
            [isEs ? "Valor de Reposición" : "Replacement Value", `$${(reportData.assets?.replacement_value || 0).toLocaleString()}`],
            [isEs ? "Cantidad de Artículos" : "Items Count", reportData.assets?.items_count || 0],
          ],
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] }
        });
        
        doc.text(isEs ? "Pérdidas de Activos" : "Asset Losses", 14, doc.lastAutoTable.finalY + 15);
        
        doc.autoTable({
          startY: doc.lastAutoTable.finalY + 20,
          head: [[isEs ? "Métrica" : "Metric", isEs ? "Valor" : "Value"]],
          body: [
            [isEs ? "Pérdidas Totales" : "Total Losses", `$${(reportData.losses?.total_value || 0).toLocaleString()}`],
            [isEs ? "Gasto Operativo" : "Operational Expense", `$${(reportData.losses?.operational_expense || 0).toLocaleString()}`],
            [isEs ? "Facturado a Clientes" : "Billed to Clients", `$${(reportData.losses?.billed_to_clients || 0).toLocaleString()}`],
            [isEs ? "Tasa de Pérdida" : "Loss Rate", `${reportData.metrics?.loss_rate || 0}%`],
            [isEs ? "Tasa de Recuperación" : "Recovery Rate", `${reportData.metrics?.recovery_rate || 0}%`],
            [isEs ? "Pérdida Neta" : "Net Loss", `$${(reportData.metrics?.net_loss || 0).toLocaleString()}`],
          ],
          theme: 'striped',
          headStyles: { fillColor: [220, 38, 38] }
        });
        
        if (reportData.losses?.recent && reportData.losses.recent.length > 0) {
          doc.text(isEs ? "Pérdidas Más Significativas" : "Top Losses", 14, doc.lastAutoTable.finalY + 15);
          
          const reasonLabels = { lost: isEs ? "Extraviado" : "Lost", damaged: isEs ? "Dañado" : "Damaged", stolen: isEs ? "Robado" : "Stolen", broken: isEs ? "Roto" : "Broken" };
          const resolutionLabels = { operational_expense: isEs ? "Gasto Op." : "Op. Expense", bill_client: isEs ? "Fact. Cliente" : "Bill Client" };
          
          doc.autoTable({
            startY: doc.lastAutoTable.finalY + 20,
            head: [[isEs ? "Artículo" : "Item", isEs ? "Cantidad" : "Qty", isEs ? "Valor" : "Value", isEs ? "Motivo" : "Reason", isEs ? "Resolución" : "Resolution"]],
            body: reportData.losses.recent.slice(0, 10).map(l => [
              l.item_name,
              l.quantity,
              `$${(l.total_value || 0).toLocaleString()}`,
              reasonLabels[l.reason] || l.reason,
              resolutionLabels[l.resolution] || l.resolution
            ]),
            theme: 'striped',
            headStyles: { fillColor: [249, 115, 22] }
          });
        }
      }
      
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`${isEs ? "Página" : "Page"} ${i} / ${pageCount}`, doc.internal.pageSize.width - 30, doc.internal.pageSize.height - 10);
      }
      
      doc.save(`report_${activeReport}_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success(isEs ? "PDF exportado" : "PDF exported");
    } catch (error) {
      console.error("PDF export error:", error);
      toast.error(isEs ? "Error al exportar PDF" : "Failed to export PDF");
    }
  };

  const reports = [
    { key: "snapshot", label: isEs ? "Resumen" : "Snapshot", icon: PieChart },
    { key: "clients", label: isEs ? "Por Cliente" : "By Client", icon: Users },
    { key: "suppliers", label: isEs ? "Por Proveedor" : "By Supplier", icon: Building2 },
    { key: "events", label: isEs ? `Por ${term("events", "entity_singular")}` : `By ${term("events", "entity_singular")}`, icon: Calendar },
    { key: "costcenters", label: isEs ? "Por Centro Costo" : "By Cost Center", icon: Layers },
    { key: "departments", label: isEs ? "Por Departamento" : "By Department", icon: Building2 },
    { key: "assets", label: isEs ? "Activos" : "Assets", icon: Package },
  ];

  const loadCCTransactions = async (ccId) => {
    try {
      const now = new Date();
      const res = await axios.get(
        `${API}/api/business-clarity/reports/cost-center/${ccId}/transactions?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
        { withCredentials: true }
      );
      setCcTransactions(res.data.transactions || []);
    } catch (err) {
      console.error(err);
      setCcTransactions([]);
    }
  };

  const toggleCCExpand = (ccId) => {
    if (expandedCC === ccId) {
      setExpandedCC(null);
      setCcTransactions([]);
    } else {
      setExpandedCC(ccId);
      loadCCTransactions(ccId);
    }
  };

  return (
    <div className="space-y-4">
      {/* Period Status Banner */}
      {periodStatus && (
        <div className={`p-3 rounded-lg border flex items-center justify-between ${isPeriodClosed ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
          <div className="flex items-center gap-3">
            {isPeriodClosed ? <Lock className="w-5 h-5 text-green-600" /> : <Unlock className="w-5 h-5 text-amber-600" />}
            <div>
              <p className={`font-medium ${isPeriodClosed ? "text-green-800" : "text-amber-800"}`}>
                {currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1)} {new Date().getFullYear()} — {isPeriodClosed ? (isEs ? "Cerrado" : "Closed") : (isEs ? "Abierto" : "Open")}
              </p>
              <p className={`text-xs ${isPeriodClosed ? "text-green-600" : "text-amber-600"}`}>
                {isPeriodClosed 
                  ? (isEs ? "Reportes basados en datos bloqueados del cierre" : "Reports based on locked close data")
                  : (isEs ? "Reportes basados en datos en tiempo real (período abierto)" : "Reports based on live data (open period)")
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {closedPeriods.length > 0 && (
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue placeholder={isEs ? "Período" : "Period"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">{isEs ? "Período Actual" : "Current Period"}</SelectItem>
                  {closedPeriods.filter(p => p.status === "closed").slice(0, 6).map(p => (
                    <SelectItem key={p.period_key} value={p.period_key}>
                      {p.period_key} <Lock className="w-3 h-3 inline ml-1" />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Badge variant={isPeriodClosed ? "default" : "outline"} className={isPeriodClosed ? "bg-green-600" : ""}>
              {isPeriodClosed ? <Lock className="w-3 h-3 mr-1" /> : null}
              {isPeriodClosed ? (isEs ? "Bloqueado" : "Locked") : (isEs ? "En Vivo" : "Live")}
            </Badge>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <h2 className="text-lg font-semibold">{isEs ? "Reportes Ejecutivos" : "Executive Reports"}</h2>
          <div className="flex gap-1">
            {reports.map(({ key, label, icon: Icon }) => (
              <Button key={key} variant={activeReport === key ? "default" : "ghost"} size="sm" onClick={() => setActiveReport(key)} className="gap-2"><Icon className="w-4 h-4" />{label}</Button>
            ))}
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportToCSV} disabled={!reportData} className="gap-2">
            <Download className="w-4 h-4" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportToPDF} disabled={!reportData} className="gap-2">
            <FileText className="w-4 h-4" />
            PDF
          </Button>
        </div>
      </div>

      {loading ? <Card><CardContent className="py-12 text-center"><RefreshCw className="w-8 h-8 animate-spin mx-auto" /></CardContent></Card> : (
        <>
          {activeReport === "snapshot" && reportData && (
            <div className="space-y-4">
              {/* P&L Summary */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    {isEs ? "Estado de Resultados (P&L)" : "Profit & Loss Statement (P&L)"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {isEs ? "Ingresos menos todos los costos operativos" : "Revenue minus all operating costs"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Revenue */}
                    <div className="flex justify-between items-center p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                      <span className="font-medium text-emerald-700">{isEs ? "Ingresos (Facturado)" : "Revenue (Invoiced)"}</span>
                      <span className="text-xl font-bold text-emerald-700">{formatCurrency(reportData.revenue?.total_invoiced)}</span>
                    </div>
                    
                    {/* Direct Costs */}
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                      <span className="text-muted-foreground">{isEs ? `(-) Costos Directos (${term("events", "entity_plural")})` : `(-) Direct Costs (${term("events", "entity_plural")})`}</span>
                      <span className="font-medium text-red-600">-{formatCurrency(reportData.expenses?.direct || reportData.expenses?.total)}</span>
                    </div>
                    
                    {/* Gross Profit */}
                    <div className="flex justify-between items-center p-3 rounded-lg bg-blue-50 border border-blue-100">
                      <div>
                        <span className="font-medium text-blue-700">{isEs ? "= Utilidad Bruta" : "= Gross Profit"}</span>
                        <span className="ml-2 text-sm text-blue-600">({reportData.profit?.margin || 0}%)</span>
                      </div>
                      <span className="text-xl font-bold text-blue-700">{formatCurrency(reportData.profit?.gross)}</span>
                    </div>
                    
                    {/* Fixed Costs */}
                    {reportData.fixed_costs?.monthly > 0 && (
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                        <span className="text-muted-foreground">{isEs ? "(-) Costos Fijos Mensuales" : "(-) Monthly Fixed Costs"}</span>
                        <span className="font-medium text-red-600">-{formatCurrency(reportData.fixed_costs?.monthly)}</span>
                      </div>
                    )}
                    
                    {/* Payroll Costs */}
                    <div className="flex justify-between items-center p-3 rounded-lg bg-violet-50 border border-violet-100">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-violet-600" />
                        <span className="text-violet-700">{isEs ? "(-) Costo de Personal" : "(-) Payroll Cost"}</span>
                        {reportData.payroll?.is_estimated && (
                          <Badge variant="outline" className="text-xs">{isEs ? "Estimado" : "Estimated"}</Badge>
                        )}
                      </div>
                      <span className="font-medium text-violet-700">-{formatCurrency(reportData.payroll?.employer_cost)}</span>
                    </div>
                    
                    {/* Operating Profit */}
                    <div className={`flex justify-between items-center p-4 rounded-lg border-2 ${
                      (reportData.profit?.operating || 0) >= 0 
                        ? "bg-emerald-50 border-emerald-300" 
                        : "bg-red-50 border-red-300"
                    }`}>
                      <div>
                        <span className={`font-bold ${(reportData.profit?.operating || 0) >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                          {isEs ? "= UTILIDAD OPERATIVA" : "= OPERATING PROFIT"}
                        </span>
                        <span className={`ml-2 text-sm ${(reportData.profit?.operating || 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          ({reportData.profit?.operating_margin || 0}%)
                        </span>
                      </div>
                      <span className={`text-2xl font-bold ${(reportData.profit?.operating || 0) >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {formatCurrency(reportData.profit?.operating)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cash Position */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wallet className="w-4 h-4" />
                    {isEs ? "Posición de Caja (Realizado)" : "Cash Position (Realized)"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {isEs ? "Dinero realmente cobrado vs pagado" : "Money actually collected vs paid"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-3 rounded-lg bg-green-50 border border-green-100">
                      <p className="text-xs text-green-600">{isEs ? "Cobrado de Clientes" : "Collected from Clients"}</p>
                      <p className="text-xl font-bold text-green-700">{formatCurrency(reportData.cash_position?.collected || reportData.revenue?.total_collected)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                      <p className="text-xs text-red-600">{isEs ? "Pagado a Proveedores" : "Paid to Suppliers"}</p>
                      <p className="text-xl font-bold text-red-700">{formatCurrency(reportData.cash_position?.paid_suppliers || reportData.expenses?.paid || 0)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-violet-50 border border-violet-100">
                      <p className="text-xs text-violet-600">{isEs ? "Pagado Nómina" : "Paid Payroll"}</p>
                      <p className="text-xl font-bold text-violet-700">{formatCurrency(reportData.cash_position?.paid_payroll || reportData.payroll?.net_paid || 0)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                      <p className="text-xs text-blue-600">{isEs ? "Flujo Neto de Caja" : "Net Cash Flow"}</p>
                      <p className={`text-xl font-bold ${(reportData.cash_position?.net_flow || 0) >= 0 ? "text-blue-700" : "text-red-700"}`}>
                        {formatCurrency(reportData.cash_position?.net_flow || ((reportData.revenue?.total_collected || 0) - (reportData.expenses?.paid || 0) - (reportData.payroll?.net_paid || 0)))}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Payroll Detail if available */}
              {reportData.payroll && (reportData.payroll.employer_cost > 0 || reportData.payroll.is_estimated) && (
                <Card className="border-violet-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="w-4 h-4 text-violet-600" />
                      {isEs ? "Detalle de Costo de Personal" : "Payroll Cost Detail"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">{isEs ? "Salarios Brutos" : "Gross Salaries"}</p>
                        <p className="text-lg font-bold">{formatCurrency(reportData.payroll?.gross_paid)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">{isEs ? "Pagado a Empleados" : "Paid to Employees"}</p>
                        <p className="text-lg font-bold text-emerald-600">{formatCurrency(reportData.payroll?.net_paid)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-violet-50 border border-violet-100">
                        <p className="text-xs text-violet-600">{isEs ? "Costo Total Empleador" : "Total Employer Cost"}</p>
                        <p className="text-lg font-bold text-violet-700">{formatCurrency(reportData.payroll?.employer_cost)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">{isEs ? "Nóminas Procesadas" : "Payrolls Processed"}</p>
                        <p className="text-lg font-bold">{reportData.payroll?.periods_count || 0}</p>
                      </div>
                    </div>
                    {reportData.payroll?.is_estimated && (
                      <div className="mt-3 p-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-700">
                        <Info className="w-3 h-3 inline mr-1" />
                        {isEs 
                          ? "Este costo es una estimación basada en los salarios de empleados activos. Procesa nóminas para ver datos reales." 
                          : "This cost is an estimate based on active employee salaries. Process payrolls to see actual data."}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card className="bg-amber-50/50 border-amber-200">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-600 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      {isEs 
                        ? "La utilidad operativa muestra lo que realmente queda después de pagar todos los costos: eventos, costos fijos y nómina. Los gastos no asignados (overhead) pueden distorsionar los márgenes mostrados."
                        : "Operating profit shows what's actually left after paying all costs: events, fixed costs and payroll. Unassigned expenses (overhead) may distort displayed margins."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeReport === "clients" && reportData && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isEs ? "Cliente" : "Client"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Facturado" : "Invoiced"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Cobrado" : "Collected"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Pendiente" : "Outstanding"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(reportData.records || []).map(r => (
                      <TableRow key={r.client_id}>
                        <TableCell>{r.client_name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.total_invoiced)}</TableCell>
                        <TableCell className="text-right text-green-600">{formatCurrency(r.total_paid)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.total_outstanding)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {activeReport === "suppliers" && reportData && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isEs ? "Proveedor" : "Supplier"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Total" : "Total"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Pagado" : "Paid"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Pendiente" : "Pending"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(reportData.records || []).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{r.supplier_name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.total_amount)}</TableCell>
                        <TableCell className="text-right text-green-600">{formatCurrency(r.paid_amount)}</TableCell>
                        <TableCell className="text-right text-orange-600">{formatCurrency(r.pending_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {activeReport === "events" && reportData && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{isEs ? "Margen objetivo:" : "Target margin:"}</span>
                  <Select value={targetMargin.toString()} onValueChange={(v) => setTargetMargin(parseInt(v))}>
                    <SelectTrigger className="w-20 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[20, 25, 30, 35, 40, 45, 50].map(v => (
                        <SelectItem key={v} value={v.toString()}>{v}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  variant={showCollectedPaid ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setShowCollectedPaid(!showCollectedPaid)}
                >
                  {isEs ? "Mostrar Cobrado/Pagado" : "Show Collected/Paid"}
                </Button>
              </div>

              <div className="flex gap-4 flex-wrap">
                {(() => {
                  const records = reportData.records || [];
                  const healthy = records.filter(r => (r.margin_percent || 0) >= targetMargin).length;
                  const risk = records.filter(r => (r.margin_percent || 0) >= 0 && (r.margin_percent || 0) < targetMargin).length;
                  const loss = records.filter(r => (r.margin_percent || 0) < 0).length;
                  return (
                    <>
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 text-green-800">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">{healthy} {isEs ? "Saludables" : "Healthy"}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 text-amber-800">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm font-medium">{risk} {isEs ? "En Riesgo" : "At Risk"}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-100 text-red-800">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">{loss} {isEs ? "Con Pérdida" : "With Loss"}</span>
                      </div>
                    </>
                  );
                })()}
              </div>

              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{term("events", "entity_singular")}</TableHead>
                        <TableHead>{isEs ? "Origen" : "Source"}</TableHead>
                        <TableHead>{isEs ? "Estado" : "Health"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Ingresos" : "Revenue"}</TableHead>
                        {showCollectedPaid && <TableHead className="text-right">{isEs ? "Cobrado" : "Collected"}</TableHead>}
                        <TableHead className="text-right">{isEs ? "Costos" : "Costs"}</TableHead>
                        {showCollectedPaid && <TableHead className="text-right">{isEs ? "Pagado" : "Paid"}</TableHead>}
                        <TableHead className="text-right">{isEs ? "Utilidad" : "Profit"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Margen" : "Margin"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(reportData.records || []).map(r => (
                        <TableRow key={r.event_id} className={r.margin_percent < 0 ? "bg-red-50/50" : r.margin_percent < targetMargin ? "bg-amber-50/30" : ""}>
                          <TableCell className="font-medium">
                            <div>{r.event_name}</div>
                            {r.client_name && <div className="text-xs text-muted-foreground">{r.client_name}</div>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {r.source_display || "N/A"}
                            </Badge>
                          </TableCell>
                          <TableCell>{getHealthBadge(r)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(r.revenue)}</TableCell>
                          {showCollectedPaid && <TableCell className="text-right text-green-600">{formatCurrency(r.collected || 0)}</TableCell>}
                          <TableCell className="text-right text-red-600">{formatCurrency(r.costs)}</TableCell>
                          {showCollectedPaid && <TableCell className="text-right text-orange-600">{formatCurrency(r.paid_costs || 0)}</TableCell>}
                          <TableCell className={`text-right font-medium ${r.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {formatCurrency(r.profit)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-medium ${r.margin_percent < 0 ? "text-red-600" : r.margin_percent < targetMargin ? "text-amber-600" : "text-green-600"}`}>
                              {r.margin_percent}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Revenue by Source Summary */}
              {reportData.by_source && Object.keys(reportData.by_source).length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{isEs ? "Resumen por Origen" : "Summary by Source"}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      {Object.entries(reportData.by_source).map(([source, data]) => (
                        <div key={source} className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-xs text-muted-foreground">{source}</p>
                          <p className="text-lg font-semibold">{data.count} {term("events", "entity_plural").toLowerCase()}</p>
                          <p className="text-sm text-green-600">{formatCurrency(data.revenue)} {isEs ? "ingresos" : "revenue"}</p>
                          <p className={`text-xs ${data.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {formatCurrency(data.profit)} {isEs ? "utilidad" : "profit"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="bg-slate-50 border-slate-200">
                <CardContent className="pt-4">
                  <h4 className="font-medium text-sm mb-2">{isEs ? "📊 Guía de Decisión" : "📊 Decision Guide"}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-green-700">{isEs ? "Saludable" : "Healthy"}</p>
                        <p className="text-muted-foreground text-xs">{isEs ? "Replicar: pricing y ejecución funcionan" : "Replicate: pricing and execution work"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-700">{isEs ? "Riesgo" : "Risk"}</p>
                        <p className="text-muted-foreground text-xs">{isEs ? "Revisar: ¿problema de precio o ejecución?" : "Review: pricing or execution issue?"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-red-700">{isEs ? "Pérdida" : "Loss"}</p>
                        <p className="text-muted-foreground text-xs">{isEs ? "Investigar: ¿evitar o corregir urgente?" : "Investigate: avoid or urgent fix?"}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeReport === "assets" && reportData && (
            <div className="space-y-4">
              {/* Asset Value Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="w-5 h-5 text-blue-600" />
                      <span className="text-sm text-blue-600">{isEs ? "Valor de Activos" : "Asset Value"}</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-800">{formatCurrency(reportData.assets?.total_value)}</p>
                    <p className="text-xs text-blue-600 mt-1">
                      {reportData.assets?.items_count || 0} {isEs ? "artículos" : "items"}
                    </p>
                  </CardContent>
                </Card>
                
                <Card className="bg-red-50 border-red-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className="w-5 h-5 text-red-600" />
                      <span className="text-sm text-red-600">{isEs ? "Pérdidas Totales" : "Total Losses"}</span>
                    </div>
                    <p className="text-2xl font-bold text-red-800">{formatCurrency(reportData.losses?.total_value)}</p>
                    <p className="text-xs text-red-600 mt-1">
                      {reportData.losses?.total_count || 0} {isEs ? "incidentes" : "incidents"}
                    </p>
                  </CardContent>
                </Card>
                
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-5 h-5 text-amber-600" />
                      <span className="text-sm text-amber-600">{isEs ? "Gasto Operativo" : "Operational Expense"}</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-800">{formatCurrency(reportData.losses?.operational_expense)}</p>
                    <p className="text-xs text-amber-600 mt-1">
                      {isEs ? "Absorbido por la empresa" : "Absorbed by company"}
                    </p>
                  </CardContent>
                </Card>
                
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Receipt className="w-5 h-5 text-green-600" />
                      <span className="text-sm text-green-600">{isEs ? "Facturado a Clientes" : "Billed to Clients"}</span>
                    </div>
                    <p className="text-2xl font-bold text-green-800">{formatCurrency(reportData.losses?.billed_to_clients)}</p>
                    <p className="text-xs text-green-600 mt-1">
                      {isEs ? "Recuperado" : "Recovered"}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Metrics Row */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    {isEs ? "Métricas de Pérdidas" : "Loss Metrics"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">{isEs ? "Tasa de Pérdida" : "Loss Rate"}</p>
                      <p className="text-xl font-bold">{reportData.metrics?.loss_rate || 0}%</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">{isEs ? "Tasa de Recuperación" : "Recovery Rate"}</p>
                      <p className="text-xl font-bold text-green-600">{reportData.metrics?.recovery_rate || 0}%</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">{isEs ? "Pérdida Neta" : "Net Loss"}</p>
                      <p className="text-xl font-bold text-red-600">{formatCurrency(reportData.metrics?.net_loss)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">{isEs ? "Promedio por Incidente" : "Avg per Incident"}</p>
                      <p className="text-xl font-bold">{formatCurrency(reportData.metrics?.avg_loss_per_incident)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Assets by Category */}
              {reportData.assets?.by_category && Object.keys(reportData.assets.by_category).length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{isEs ? "Activos por Categoría" : "Assets by Category"}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
                          <TableHead className="text-right">{isEs ? "Artículos" : "Items"}</TableHead>
                          <TableHead className="text-right">{isEs ? "Stock Total" : "Total Stock"}</TableHead>
                          <TableHead className="text-right">{isEs ? "Valor" : "Value"}</TableHead>
                          <TableHead className="text-right">{isEs ? "Valor Reposición" : "Replacement Value"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(reportData.assets.by_category).map(([category, data]) => (
                          <TableRow key={category}>
                            <TableCell className="font-medium capitalize">{category}</TableCell>
                            <TableCell className="text-right">{data.count}</TableCell>
                            <TableCell className="text-right">{data.total_stock}</TableCell>
                            <TableCell className="text-right">{formatCurrency(data.value)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{formatCurrency(data.replacement_value)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Losses by Reason */}
              {reportData.losses?.by_reason && Object.keys(reportData.losses.by_reason).length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{isEs ? "Pérdidas por Motivo" : "Losses by Reason"}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(reportData.losses.by_reason).map(([reason, data]) => {
                        const reasonLabels = {
                          lost: isEs ? "Extraviado" : "Lost",
                          damaged: isEs ? "Dañado" : "Damaged",
                          stolen: isEs ? "Robado" : "Stolen",
                          broken: isEs ? "Roto" : "Broken",
                          unknown: isEs ? "Desconocido" : "Unknown"
                        };
                        const reasonColors = {
                          lost: "bg-amber-100 text-amber-800 border-amber-200",
                          damaged: "bg-red-100 text-red-800 border-red-200",
                          stolen: "bg-purple-100 text-purple-800 border-purple-200",
                          broken: "bg-orange-100 text-orange-800 border-orange-200",
                          unknown: "bg-gray-100 text-gray-800 border-gray-200"
                        };
                        return (
                          <div key={reason} className={`p-3 rounded-lg border ${reasonColors[reason] || reasonColors.unknown}`}>
                            <p className="text-xs font-medium">{reasonLabels[reason] || reason}</p>
                            <p className="text-lg font-bold">{data.count} {isEs ? "incidentes" : "incidents"}</p>
                            <p className="text-sm">{formatCurrency(data.value)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Monthly Trend */}
              {reportData.losses?.by_month && reportData.losses.by_month.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{isEs ? "Tendencia Mensual de Pérdidas" : "Monthly Loss Trend"}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {reportData.losses.by_month.slice(-12).map((month) => (
                        <div key={month.period} className="p-2 rounded-lg bg-muted/50 min-w-[100px] text-center">
                          <p className="text-xs text-muted-foreground">{month.period}</p>
                          <p className="text-sm font-medium">{month.count} {isEs ? "pérdidas" : "losses"}</p>
                          <p className="text-xs text-red-600">{formatCurrency(month.value)}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recent/Top Losses */}
              {reportData.losses?.recent && reportData.losses.recent.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{isEs ? "Pérdidas Más Significativas" : "Top Losses"}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{isEs ? "Artículo" : "Item"}</TableHead>
                          <TableHead className="text-right">{isEs ? "Cantidad" : "Quantity"}</TableHead>
                          <TableHead className="text-right">{isEs ? "Valor" : "Value"}</TableHead>
                          <TableHead>{isEs ? "Motivo" : "Reason"}</TableHead>
                          <TableHead>{isEs ? "Resolución" : "Resolution"}</TableHead>
                          <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportData.losses.recent.map((loss) => {
                          const reasonLabels = {
                            lost: isEs ? "Extraviado" : "Lost",
                            damaged: isEs ? "Dañado" : "Damaged",
                            stolen: isEs ? "Robado" : "Stolen",
                            broken: isEs ? "Roto" : "Broken"
                          };
                          const resolutionLabels = {
                            operational_expense: isEs ? "Gasto Operativo" : "Operational Expense",
                            bill_client: isEs ? "Facturar a Cliente" : "Bill to Client"
                          };
                          return (
                            <TableRow key={loss.loss_id}>
                              <TableCell className="font-medium">{loss.item_name}</TableCell>
                              <TableCell className="text-right">{loss.quantity}</TableCell>
                              <TableCell className="text-right text-red-600">{formatCurrency(loss.total_value)}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{reasonLabels[loss.reason] || loss.reason}</Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant={loss.resolution === "bill_client" ? "default" : "secondary"}>
                                  {resolutionLabels[loss.resolution] || loss.resolution}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant={loss.status === "processed" ? "outline" : "destructive"}>
                                  {loss.status === "processed" 
                                    ? (isEs ? "Procesado" : "Processed") 
                                    : (isEs ? "Pendiente" : "Pending")}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Info Card */}
              <Card className="bg-blue-50/50 border-blue-200">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-600 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium mb-1">{isEs ? "Sobre este reporte" : "About this report"}</p>
                      <p>
                        {isEs 
                          ? "Este reporte muestra el valor de tus activos operacionales (equipos y suministros) y el seguimiento de pérdidas. Las pérdidas registradas en el conteo de inventario se reflejan aquí, separando las absorbidas como gasto operativo de las facturadas a clientes."
                          : "This report shows the value of your operational assets (equipment and supplies) and loss tracking. Losses registered during inventory counts are reflected here, separating those absorbed as operational expense from those billed to clients."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeReport === "departments" && reportData && (
            <div className="space-y-4" data-testid="department-report">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <Card className="bg-indigo-50 border-indigo-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="w-5 h-5 text-indigo-600" />
                      <span className="text-sm text-indigo-600">{isEs ? "Departamentos" : "Departments"}</span>
                    </div>
                    <p className="text-2xl font-bold text-indigo-800">{reportData.summary?.total_departments || 0}</p>
                  </CardContent>
                </Card>

                <Card className="bg-violet-50 border-violet-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-5 h-5 text-violet-600" />
                      <span className="text-sm text-violet-600">{isEs ? "Empleados" : "Employees"}</span>
                    </div>
                    <p className="text-2xl font-bold text-violet-800">{reportData.summary?.total_employees || 0}</p>
                  </CardContent>
                </Card>

                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Wallet className="w-5 h-5 text-blue-600" />
                      <span className="text-sm text-blue-600">{isEs ? "Presupuesto" : "Budget"}</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-800">{formatCurrency(reportData.summary?.total_budget)}</p>
                  </CardContent>
                </Card>

                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-5 h-5 text-amber-600" />
                      <span className="text-sm text-amber-600">{isEs ? "Gasto Real" : "Actual Spend"}</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-800">{formatCurrency(reportData.summary?.total_actual)}</p>
                    <p className="text-xs text-amber-600 mt-1">{reportData.summary?.overall_utilization || 0}% {isEs ? "utilización" : "utilization"}</p>
                  </CardContent>
                </Card>

                <Card className={`${(reportData.summary?.total_variance || 0) >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 className={`w-5 h-5 ${(reportData.summary?.total_variance || 0) >= 0 ? "text-green-600" : "text-red-600"}`} />
                      <span className={`text-sm ${(reportData.summary?.total_variance || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {isEs ? "Variación" : "Variance"}
                      </span>
                    </div>
                    <p className={`text-2xl font-bold ${(reportData.summary?.total_variance || 0) >= 0 ? "text-green-800" : "text-red-800"}`}>
                      {formatCurrency(reportData.summary?.total_variance)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Period Info */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                {isEs ? "Período:" : "Period:"} {reportData.period?.label}
              </div>

              {/* Department Table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    {isEs ? "Gasto por Departamento" : "Spend by Department"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {isEs ? "Desglose de nómina, pagos a proveedores y gastos directos" : "Breakdown of payroll, supplier payments and direct expenses"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{isEs ? "Departamento" : "Department"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Empleados" : "Employees"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Nómina" : "Payroll"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Proveedores" : "Suppliers"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Gastos" : "Expenses"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Total Real" : "Total Actual"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Presupuesto" : "Budget"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Variación" : "Variance"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Uso %" : "Use %"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(reportData.records || []).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            {isEs ? "No hay departamentos configurados. Crea departamentos en People Ops." : "No departments configured. Create departments in People Ops."}
                          </TableCell>
                        </TableRow>
                      )}
                      {(reportData.records || []).map(r => (
                        <TableRow key={r.department_id} className={r.status === "over" ? "bg-red-50/50" : ""} data-testid={`dept-row-${r.department_id}`}>
                          <TableCell>
                            <div className="font-medium">{r.department_name}</div>
                            {r.cost_centers_count > 0 && (
                              <div className="text-xs text-muted-foreground">{r.cost_centers_count} CC{r.cost_centers_count > 1 ? "s" : ""}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{r.employee_count}</TableCell>
                          <TableCell className="text-right">
                            <div>{formatCurrency(r.payroll_cost)}</div>
                            {!r.payroll_is_actual && r.payroll_cost > 0 && (
                              <span className="text-xs text-amber-600">{isEs ? "est." : "est."}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(r.payables_cost)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(r.direct_expenses)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(r.actual_spend)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(r.monthly_budget)}</TableCell>
                          <TableCell className={`text-right font-medium ${r.variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {formatCurrency(r.variance)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-muted rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-2 rounded-full ${r.utilization > 100 ? "bg-red-500" : r.utilization > 80 ? "bg-amber-500" : "bg-green-500"}`}
                                  style={{ width: `${Math.min(r.utilization, 100)}%` }}
                                />
                              </div>
                              <span className={`text-xs font-medium ${r.utilization > 100 ? "text-red-600" : r.utilization > 80 ? "text-amber-600" : "text-green-600"}`}>
                                {r.utilization}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {(reportData.records || []).length > 0 && (
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell>{isEs ? "TOTAL" : "TOTAL"}</TableCell>
                          <TableCell className="text-right">{reportData.summary?.total_employees || 0}</TableCell>
                          <TableCell className="text-right">{formatCurrency(reportData.summary?.total_payroll)}</TableCell>
                          <TableCell className="text-right">-</TableCell>
                          <TableCell className="text-right">-</TableCell>
                          <TableCell className="text-right">{formatCurrency(reportData.summary?.total_actual)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(reportData.summary?.total_budget)}</TableCell>
                          <TableCell className={`text-right ${(reportData.summary?.total_variance || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {formatCurrency(reportData.summary?.total_variance)}
                          </TableCell>
                          <TableCell className="text-right">{reportData.summary?.overall_utilization || 0}%</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card className="bg-indigo-50/50 border-indigo-200">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-indigo-600 mt-0.5" />
                    <p className="text-sm text-indigo-800">
                      {isEs
                        ? "Este reporte agrupa costos por departamento. La nómina se calcula desde las entradas de nómina o se estima desde los salarios base. Los gastos de proveedores y directos se suman desde los centros de costo vinculados a cada departamento."
                        : "This report groups costs by department. Payroll is calculated from payroll entries or estimated from base salaries. Supplier and direct expenses are aggregated from cost centers linked to each department."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeReport === "costcenters" && reportData && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Wallet className="w-5 h-5 text-blue-600" />
                      <span className="text-sm text-blue-600">{isEs ? "Presupuesto Total" : "Total Budget"}</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-800">{formatCurrency(reportData.summary?.total_budget)}</p>
                    <p className="text-xs text-blue-600 mt-1">{isEs ? "Mensual" : "Monthly"}</p>
                  </CardContent>
                </Card>
                
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-5 h-5 text-amber-600" />
                      <span className="text-sm text-amber-600">{isEs ? "Gasto Real" : "Actual Spend"}</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-800">{formatCurrency(reportData.summary?.total_actual)}</p>
                    <p className="text-xs text-amber-600 mt-1">{reportData.summary?.overall_utilization}% {isEs ? "utilización" : "utilization"}</p>
                  </CardContent>
                </Card>
                
                <Card className={`${(reportData.summary?.total_variance || 0) >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 className={`w-5 h-5 ${(reportData.summary?.total_variance || 0) >= 0 ? "text-green-600" : "text-red-600"}`} />
                      <span className={`text-sm ${(reportData.summary?.total_variance || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {isEs ? "Variación" : "Variance"}
                      </span>
                    </div>
                    <p className={`text-2xl font-bold ${(reportData.summary?.total_variance || 0) >= 0 ? "text-green-800" : "text-red-800"}`}>
                      {formatCurrency(reportData.summary?.total_variance)}
                    </p>
                    <p className={`text-xs mt-1 ${(reportData.summary?.total_variance || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {(reportData.summary?.total_variance || 0) >= 0 ? (isEs ? "Bajo presupuesto" : "Under budget") : (isEs ? "Sobre presupuesto" : "Over budget")}
                    </p>
                  </CardContent>
                </Card>
                
                <Card className="bg-violet-50 border-violet-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-5 h-5 text-violet-600" />
                      <span className="text-sm text-violet-600">{isEs ? "Nómina" : "Payroll"}</span>
                    </div>
                    <p className="text-2xl font-bold text-violet-800">{formatCurrency(reportData.summary?.total_payroll)}</p>
                    <p className="text-xs text-violet-600 mt-1">{isEs ? "Costo de personal" : "Personnel cost"}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Period Info */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  {isEs ? "Período:" : "Period:"} {reportData.period?.label}
                </div>
              </div>

              {/* Budget vs Actual Table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    {isEs ? "Presupuesto vs Real por Centro de Costo" : "Budget vs Actual by Cost Center"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {isEs ? "Click en una fila para ver transacciones detalladas" : "Click a row to see detailed transactions"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead></TableHead>
                        <TableHead>{isEs ? "Centro de Costo" : "Cost Center"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Presupuesto" : "Budget"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Gasto Real" : "Actual"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Nómina" : "Payroll"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Otros" : "Other"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Variación" : "Variance"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Utilización" : "Utilization"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(reportData.records || []).map(cc => (
                        <>
                          <TableRow 
                            key={cc.cost_center_id} 
                            className={`cursor-pointer hover:bg-muted/50 ${cc.status === "over" ? "bg-red-50/50" : ""}`}
                            onClick={() => toggleCCExpand(cc.cost_center_id)}
                          >
                            <TableCell className="w-8">
                              {expandedCC === cc.cost_center_id ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{cc.code ? `${cc.code} - ` : ""}{cc.name}</p>
                                <p className="text-xs text-muted-foreground">{cc.transactions_count} {isEs ? "transacciones" : "transactions"}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(cc.monthly_budget)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(cc.actual_spend)}</TableCell>
                            <TableCell className="text-right text-violet-600">
                              <div className="flex items-center justify-end gap-1">
                                {formatCurrency(cc.payroll_cost)}
                                {!cc.payroll_is_actual && cc.payroll_cost > 0 && (
                                  <span className="text-[10px] text-amber-500" title={isEs ? "Estimado basado en salarios" : "Estimated based on salaries"}>~</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-orange-600">{formatCurrency(cc.payables_cost + cc.direct_expenses)}</TableCell>
                            <TableCell className={`text-right font-medium ${cc.variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {cc.variance >= 0 ? "+" : ""}{formatCurrency(cc.variance)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full ${cc.utilization > 100 ? "bg-red-500" : cc.utilization > 80 ? "bg-amber-500" : "bg-green-500"}`}
                                    style={{ width: `${Math.min(cc.utilization, 100)}%` }}
                                  />
                                </div>
                                <span className={`text-xs ${cc.utilization > 100 ? "text-red-600" : cc.utilization > 80 ? "text-amber-600" : "text-green-600"}`}>
                                  {cc.utilization}%
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                          
                          {/* Expanded Transactions */}
                          {expandedCC === cc.cost_center_id && (
                            <TableRow>
                              <TableCell colSpan={8} className="bg-muted/30 p-4">
                                <div className="space-y-2">
                                  <p className="text-sm font-medium">{isEs ? "Transacciones" : "Transactions"}</p>
                                  {ccTransactions.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">{isEs ? "Sin transacciones" : "No transactions"}</p>
                                  ) : (
                                    <div className="space-y-1 max-h-60 overflow-y-auto">
                                      {ccTransactions.map((t, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-2 bg-background rounded text-sm">
                                          <div className="flex items-center gap-3">
                                            <Badge variant={t.type === "payroll" ? "secondary" : "outline"} className="text-xs">
                                              {t.type === "payroll" ? (isEs ? "Nómina" : "Payroll") : (isEs ? "Pago" : "Payable")}
                                            </Badge>
                                            <span>{t.description}</span>
                                            {t.category && <span className="text-xs text-muted-foreground">({t.category})</span>}
                                          </div>
                                          <span className="font-medium">{formatCurrency(t.amount)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                      {(reportData.records || []).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            {isEs ? "Sin centros de costo configurados" : "No cost centers configured"}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Info Card */}
              <Card className="bg-blue-50/50 border-blue-200">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-600 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium mb-1">{isEs ? "Sobre este reporte" : "About this report"}</p>
                      <p>
                        {isEs 
                          ? "Este reporte muestra el presupuesto vs gasto real por centro de costo. La nómina se registra directamente en el centro de costo del departamento de cada empleado (modelo distribuido). Los valores de nómina con ~ son estimaciones basadas en salarios base; se actualizan con datos reales al completar períodos de nómina."
                          : "This report shows budget vs actual spending by cost center. Payroll is recorded directly to each employee's department cost center (distributed model). Payroll values with ~ are estimates based on base salaries; they update with actual data when payroll periods are completed."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
