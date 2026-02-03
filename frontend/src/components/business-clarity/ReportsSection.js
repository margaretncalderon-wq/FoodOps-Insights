import { useState, useEffect } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  Users, Download, RefreshCw, Wallet, PieChart, Calendar,
  FileBarChart, BarChart3, Building2, AlertTriangle, CheckCircle, AlertCircle, Info, FileText, Lock, Unlock
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ReportsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [activeReport, setActiveReport] = useState("snapshot");
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [targetMargin, setTargetMargin] = useState(30);
  const [showCollectedPaid, setShowCollectedPaid] = useState(false);
  const [periodStatus, setPeriodStatus] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState("current");
  const [closedPeriods, setClosedPeriods] = useState([]);

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
    const endpoints = { snapshot: "/api/business-clarity/reports/financial-snapshot", clients: "/api/business-clarity/reports/client-revenue", suppliers: "/api/business-clarity/reports/supplier-spend", events: "/api/business-clarity/reports/event-profitability" };
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
      headers = [isEs ? "Evento" : "Event", isEs ? "Estado" : "Health", isEs ? "Ingresos" : "Revenue", isEs ? "Costos" : "Costs", isEs ? "Utilidad" : "Profit", isEs ? "Margen %" : "Margin %"];
      rows = (reportData.records || []).map(r => {
        const health = r.margin_percent < 0 ? (isEs ? "Pérdida" : "Loss") : r.margin_percent < targetMargin ? (isEs ? "Riesgo" : "Risk") : (isEs ? "Saludable" : "Healthy");
        return [r.event_name, health, r.revenue, r.costs, r.profit, r.margin_percent];
      });
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
      const date = new Date().toLocaleDateString();
      const reportTitles = {
        snapshot: isEs ? "Resumen Financiero" : "Financial Snapshot",
        clients: isEs ? "Reporte por Cliente" : "Client Revenue Report",
        suppliers: isEs ? "Reporte por Proveedor" : "Supplier Spend Report",
        events: isEs ? "Reporte por Evento" : "Event Profitability Report"
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
          head: [[isEs ? "Evento" : "Event", isEs ? "Estado" : "Health", isEs ? "Ingresos" : "Revenue", isEs ? "Costos" : "Costs", isEs ? "Utilidad" : "Profit", isEs ? "Margen" : "Margin"]],
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
    { key: "events", label: isEs ? "Por Evento" : "By Event", icon: Calendar },
  ];

  return (
    <div className="space-y-4">
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
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    {isEs ? "Utilidad Operativa (Devengado)" : "Operational Profit (Accrued)"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {isEs ? "Ingresos facturados menos costos asignados" : "Invoiced revenue minus assigned costs"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">{isEs ? "Facturado" : "Invoiced"}</p>
                      <p className="text-xl font-bold">{formatCurrency(reportData.revenue?.total_invoiced)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">{isEs ? "Costos Asignados" : "Assigned Costs"}</p>
                      <p className="text-xl font-bold text-red-600">{formatCurrency(reportData.expenses?.assigned || reportData.expenses?.total)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">{isEs ? "Utilidad Bruta" : "Gross Profit"}</p>
                      <p className="text-xl font-bold text-blue-600">{formatCurrency(reportData.profit?.gross)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">{isEs ? "Margen" : "Margin"}</p>
                      <p className="text-xl font-bold">{reportData.profit?.margin || 0}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-3 rounded-lg bg-green-50 border border-green-100">
                      <p className="text-xs text-green-600">{isEs ? "Cobrado de Clientes" : "Collected from Clients"}</p>
                      <p className="text-xl font-bold text-green-700">{formatCurrency(reportData.revenue?.total_collected)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                      <p className="text-xs text-red-600">{isEs ? "Pagado a Proveedores" : "Paid to Suppliers"}</p>
                      <p className="text-xl font-bold text-red-700">{formatCurrency(reportData.expenses?.paid || 0)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                      <p className="text-xs text-blue-600">{isEs ? "Flujo Neto de Caja" : "Net Cash Flow"}</p>
                      <p className="text-xl font-bold text-blue-700">
                        {formatCurrency((reportData.revenue?.total_collected || 0) - (reportData.expenses?.paid || 0))}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-amber-50/50 border-amber-200">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-600 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      {isEs 
                        ? "La utilidad refleja costos asignados a eventos. Los gastos no asignados (overhead) pueden distorsionar los márgenes mostrados. Revisa 'Costos Sin Asignar' en el panel ejecutivo."
                        : "Profit reflects costs assigned to events. Unassigned expenses (overhead) may distort displayed margins. Check 'Unassigned Costs' in the executive dashboard."}
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
                        <TableHead>{isEs ? "Evento" : "Event"}</TableHead>
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
                          <TableCell className="font-medium">{r.event_name}</TableCell>
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
        </>
      )}
    </div>
  );
}
