import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  Wallet, Package, Receipt, TrendingUp, TrendingDown,
  Download, RefreshCw, ArrowUpRight, ArrowDownRight,
  DollarSign, FileText, Layers
} from "lucide-react";
import { toast } from "sonner";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => 
  `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const REPORT_TYPES = [
  { id: "income-expense", icon: Wallet, color: "violet" },
  { id: "inventory-valuation", icon: Package, color: "blue" },
  { id: "transactions", icon: Receipt, color: "green" },
  { id: "purchases", icon: FileText, color: "orange" }
];

export function AdminReportsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [activeReport, setActiveReport] = useState("income-expense");
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const reportLabels = {
    "income-expense": { es: "Ingresos y Gastos", en: "Income & Expense" },
    "inventory-valuation": { es: "Inventario Valorizado", en: "Inventory Valuation" },
    "transactions": { es: "Transacciones", en: "Transactions" },
    "purchases": { es: "Compras", en: "Purchases" }
  };

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API}/api/business-clarity/reports/admin/${activeReport}`;
      if (activeReport !== "inventory-valuation") {
        url += `?start_date=${startDate}&end_date=${endDate}`;
      }
      
      const res = await axios.get(url, { withCredentials: true });
      setReportData(res.data);
    } catch (err) {
      console.error("Error fetching report:", err);
      toast.error(isEs ? "Error al cargar reporte" : "Error loading report");
    }
    setLoading(false);
  }, [activeReport, startDate, endDate, isEs]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const exportToCSV = () => {
    if (!reportData) return;
    
    let headers = [];
    let rows = [];
    const reportName = reportLabels[activeReport][isEs ? "es" : "en"];
    
    if (activeReport === "income-expense") {
      headers = [isEs ? "Categoría" : "Category", isEs ? "Tipo" : "Type", "Total", isEs ? "Cantidad" : "Count"];
      const incomeRows = (reportData.income_categories || []).map(c => [c.category, "Ingreso", c.total, c.count]);
      const expenseRows = (reportData.expense_categories || []).map(c => [c.category, "Gasto", c.total, c.count]);
      rows = [...incomeRows, ...expenseRows];
    } else if (activeReport === "inventory-valuation") {
      headers = [isEs ? "Ítem" : "Item", isEs ? "Categoría" : "Category", isEs ? "Cantidad" : "Quantity", isEs ? "Costo Unit." : "Unit Cost", isEs ? "Valor Total" : "Total Value"];
      rows = (reportData.items || []).map(i => [i.item_name, i.category, i.quantity, i.unit_cost, i.total_value]);
    } else if (activeReport === "transactions") {
      headers = [isEs ? "Fecha" : "Date", isEs ? "Tipo" : "Type", isEs ? "Descripción" : "Description", isEs ? "Método" : "Method", isEs ? "Monto" : "Amount"];
      rows = (reportData.transactions || []).map(t => [t.date, t.type_label, t.description, t.method, t.direction === "in" ? t.amount : -t.amount]);
    } else if (activeReport === "purchases") {
      headers = [isEs ? "Proveedor" : "Supplier", "Total", isEs ? "Pagado" : "Paid", isEs ? "Pendiente" : "Pending", isEs ? "Facturas" : "Invoices"];
      rows = (reportData.by_supplier || []).map(s => [s.supplier_name, s.total_amount, s.paid_amount, s.pending_amount, s.invoice_count]);
    }
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${reportName.replace(/\s/g, "_")}_${startDate}_${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(isEs ? "Reporte exportado" : "Report exported");
  };

  const renderIncomeExpenseReport = () => (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <span className="text-sm text-muted-foreground">{isEs ? "Total Ingresos" : "Total Income"}</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(reportData?.summary?.total_income)}</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-red-600" />
              <span className="text-sm text-muted-foreground">{isEs ? "Total Gastos" : "Total Expense"}</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(reportData?.summary?.total_expense)}</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-muted-foreground">{isEs ? "Resultado Neto" : "Net Result"}</span>
            </div>
            <p className={`text-2xl font-bold ${(reportData?.summary?.net_result || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatCurrency(reportData?.summary?.net_result)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Income Categories */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-600" />
            {isEs ? "Ingresos por Categoría" : "Income by Category"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">{isEs ? "Cantidad" : "Count"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(reportData?.income_categories || []).map((c, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{c.category}</TableCell>
                  <TableCell className="text-right text-green-600 font-semibold">{formatCurrency(c.total)}</TableCell>
                  <TableCell className="text-right">{c.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Expense Categories */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-600" />
            {isEs ? "Gastos por Categoría" : "Expense by Category"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">{isEs ? "Cantidad" : "Count"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(reportData?.expense_categories || []).map((c, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{c.category}</TableCell>
                  <TableCell className="text-right text-red-600 font-semibold">{formatCurrency(c.total)}</TableCell>
                  <TableCell className="text-right">{c.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  const renderInventoryValuationReport = () => (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-muted-foreground">{isEs ? "Valor Total" : "Total Value"}</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(reportData?.summary?.total_value)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{isEs ? "Total Ítems" : "Total Items"}</span>
            </div>
            <p className="text-2xl font-bold">{reportData?.summary?.total_items || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{isEs ? "Total Unidades" : "Total Units"}</span>
            </div>
            <p className="text-2xl font-bold">{reportData?.summary?.total_units?.toLocaleString() || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* By Category */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isEs ? "Valor por Categoría" : "Value by Category"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(reportData?.by_category || []).map((c, idx) => (
              <div key={idx} className="p-3 border rounded-lg">
                <p className="text-sm text-muted-foreground">{c.category}</p>
                <p className="font-semibold">{formatCurrency(c.total_value)}</p>
                <p className="text-xs text-muted-foreground">{c.item_count} {isEs ? "ítems" : "items"}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Items Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isEs ? "Detalle de Inventario" : "Inventory Detail"}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Ítem" : "Item"}</TableHead>
                <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
                <TableHead className="text-right">{isEs ? "Cantidad" : "Quantity"}</TableHead>
                <TableHead className="text-right">{isEs ? "Costo Unit." : "Unit Cost"}</TableHead>
                <TableHead className="text-right">{isEs ? "Valor Total" : "Total Value"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(reportData?.items || []).slice(0, 50).map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{item.item_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.category}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{item.quantity} {item.unit}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.unit_cost)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(item.total_value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  const renderTransactionsReport = () => (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{isEs ? "Ingresos" : "Income"}</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(reportData?.summary?.total_income)}</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{isEs ? "Egresos" : "Expense"}</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(reportData?.summary?.total_expense)}</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{isEs ? "Flujo Neto" : "Net Flow"}</p>
            <p className={`text-xl font-bold ${(reportData?.summary?.net_flow || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatCurrency(reportData?.summary?.net_flow)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{isEs ? "Transacciones" : "Transactions"}</p>
            <p className="text-xl font-bold">{reportData?.summary?.transaction_count || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isEs ? "Movimientos" : "Transactions"}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                <TableHead>{isEs ? "Descripción" : "Description"}</TableHead>
                <TableHead>{isEs ? "Método" : "Method"}</TableHead>
                <TableHead className="text-right">{isEs ? "Monto" : "Amount"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(reportData?.transactions || []).map((t, idx) => (
                <TableRow key={idx}>
                  <TableCell>{t.date}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {t.direction === "in" ? (
                        <ArrowDownRight className="w-4 h-4 text-green-500" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-red-500" />
                      )}
                      {t.type_label}
                    </div>
                  </TableCell>
                  <TableCell>{t.description}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{t.method}</Badge>
                  </TableCell>
                  <TableCell className={`text-right font-medium ${t.direction === "in" ? "text-green-600" : "text-red-600"}`}>
                    {t.direction === "in" ? "+" : "-"}{formatCurrency(t.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  const renderPurchasesReport = () => (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{isEs ? "Total Compras" : "Total Purchases"}</p>
            <p className="text-xl font-bold">{formatCurrency(reportData?.summary?.total_purchases)}</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{isEs ? "Pagado" : "Paid"}</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(reportData?.summary?.total_paid)}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{isEs ? "Pendiente" : "Pending"}</p>
            <p className="text-xl font-bold text-amber-600">{formatCurrency(reportData?.summary?.total_pending)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{isEs ? "Proveedores" : "Suppliers"}</p>
            <p className="text-xl font-bold">{reportData?.summary?.supplier_count || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* By Supplier */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isEs ? "Compras por Proveedor" : "Purchases by Supplier"}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Proveedor" : "Supplier"}</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">{isEs ? "Pagado" : "Paid"}</TableHead>
                <TableHead className="text-right">{isEs ? "Pendiente" : "Pending"}</TableHead>
                <TableHead className="text-right">{isEs ? "Facturas" : "Invoices"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(reportData?.by_supplier || []).map((s, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{s.supplier_name}</TableCell>
                  <TableCell className="text-right">{formatCurrency(s.total_amount)}</TableCell>
                  <TableCell className="text-right text-green-600">{formatCurrency(s.paid_amount)}</TableCell>
                  <TableCell className="text-right text-amber-600">{formatCurrency(s.pending_amount)}</TableCell>
                  <TableCell className="text-right">{s.invoice_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Purchases */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isEs ? "Compras Recientes" : "Recent Purchases"}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Factura" : "Invoice"}</TableHead>
                <TableHead>{isEs ? "Proveedor" : "Supplier"}</TableHead>
                <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                <TableHead>{isEs ? "Vencimiento" : "Due Date"}</TableHead>
                <TableHead className="text-right">{isEs ? "Monto" : "Amount"}</TableHead>
                <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(reportData?.recent_purchases || []).slice(0, 20).map((p, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{p.invoice_number || "-"}</TableCell>
                  <TableCell>{p.supplier_name}</TableCell>
                  <TableCell>{p.date}</TableCell>
                  <TableCell>{p.due_date || "-"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.amount)}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  const renderActiveReport = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!reportData) {
      return (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {isEs ? "No hay datos para el período seleccionado" : "No data for selected period"}
            </p>
          </CardContent>
        </Card>
      );
    }

    switch (activeReport) {
      case "income-expense": return renderIncomeExpenseReport();
      case "inventory-valuation": return renderInventoryValuationReport();
      case "transactions": return renderTransactionsReport();
      case "purchases": return renderPurchasesReport();
      default: return null;
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-reports-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            {isEs ? "Reportes Administrativos" : "Administrative Reports"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Reportes de gestión financiera y operativa" : "Financial and operational management reports"}
          </p>
        </div>
        <Button variant="outline" onClick={exportToCSV} disabled={!reportData}>
          <Download className="w-4 h-4 mr-2" />
          {isEs ? "Exportar CSV" : "Export CSV"}
        </Button>
      </div>

      {/* Date Range (not for inventory) */}
      {activeReport !== "inventory-valuation" && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <Label>{isEs ? "Fecha Inicio" : "Start Date"}</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-40"
                />
              </div>
              <div>
                <Label>{isEs ? "Fecha Fin" : "End Date"}</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-40"
                />
              </div>
              <Button onClick={fetchReport} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                {isEs ? "Actualizar" : "Refresh"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report Type Tabs */}
      <div className="flex gap-2 flex-wrap">
        {REPORT_TYPES.map(rt => {
          const Icon = rt.icon;
          const isActive = activeReport === rt.id;
          return (
            <Button
              key={rt.id}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveReport(rt.id)}
            >
              <Icon className="w-4 h-4 mr-2" />
              {reportLabels[rt.id][isEs ? "es" : "en"]}
            </Button>
          );
        })}
      </div>

      {/* Report Content */}
      {renderActiveReport()}
    </div>
  );
}
