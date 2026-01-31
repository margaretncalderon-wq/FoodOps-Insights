import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Layout } from "../components/Layout";
import axios from "axios";
import { toast } from "sonner";

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";

// Icons
import {
  DollarSign, CreditCard, FileText, Users, TrendingUp, TrendingDown,
  AlertTriangle, Clock, CheckCircle, XCircle, Plus, Eye, Download,
  ArrowRight, RefreshCw, Building2, Receipt, Wallet, PieChart,
  Calendar, Filter, Search, ChevronRight, AlertCircle, Banknote
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

// Dashboard Component
function Dashboard({ data, onRefresh }) {
  const { language } = useLanguage();
  const isEs = language === "es";

  const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const agingData = data?.aging_buckets || {};
  const totalAging = Object.values(agingData).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Business Clarity</h1>
          <p className="text-muted-foreground text-sm">
            {isEs ? "Claridad para decidir. No contabilidad." : "Clarity for decisions. Not accounting."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {isEs ? "Actualizar" : "Refresh"}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 font-medium">{isEs ? "Por Cobrar" : "Receivables"}</p>
                <p className="text-2xl font-bold text-green-700">{formatCurrency(data?.total_receivables)}</p>
              </div>
              <div className="p-3 bg-green-200 rounded-full">
                <TrendingUp className="w-6 h-6 text-green-700" />
              </div>
            </div>
            <p className="text-xs text-green-600 mt-2">
              {data?.open_invoices_count || 0} {isEs ? "facturas abiertas" : "open invoices"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 font-medium">{isEs ? "Vencido" : "Overdue"}</p>
                <p className="text-2xl font-bold text-red-700">{formatCurrency(data?.total_overdue)}</p>
              </div>
              <div className="p-3 bg-red-200 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-700" />
              </div>
            </div>
            <p className="text-xs text-red-600 mt-2">
              {isEs ? "Requiere atención" : "Requires attention"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600 font-medium">{isEs ? "Por Pagar" : "Payables"}</p>
                <p className="text-2xl font-bold text-orange-700">{formatCurrency(data?.total_payables)}</p>
              </div>
              <div className="p-3 bg-orange-200 rounded-full">
                <TrendingDown className="w-6 h-6 text-orange-700" />
              </div>
            </div>
            <p className="text-xs text-orange-600 mt-2">
              {isEs ? "Compromisos pendientes" : "Pending obligations"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">{isEs ? "Flujo Neto" : "Net Flow"}</p>
                <p className="text-2xl font-bold text-blue-700">
                  {formatCurrency((data?.total_receivables || 0) - (data?.total_payables || 0))}
                </p>
              </div>
              <div className="p-3 bg-blue-200 rounded-full">
                <Wallet className="w-6 h-6 text-blue-700" />
              </div>
            </div>
            <p className="text-xs text-blue-600 mt-2">
              {isEs ? "Posición actual" : "Current position"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Aging Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            {isEs ? "Análisis de Antigüedad" : "Aging Analysis"}
          </CardTitle>
          <CardDescription>
            {isEs ? "Distribución de cuentas por cobrar por días" : "Distribution of receivables by age"}
          </CardDescription>
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
                  <div className="text-sm text-muted-foreground mb-1">{label} {isEs ? "días" : "days"}</div>
                  <div className="text-lg font-semibold">{formatCurrency(amount)}</div>
                  <div className="w-full bg-muted rounded-full h-2 mt-2">
                    <div className={`${color} h-2 rounded-full`} style={{ width: `${percent}%` }} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{percent.toFixed(0)}%</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Payments */}
      {data?.recent_payments?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="w-5 h-5" />
              {isEs ? "Pagos Recientes" : "Recent Payments"}
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                    <TableCell>{new Date(pay.payment_date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium text-green-600">{formatCurrency(pay.amount)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{pay.payment_method}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{pay.reference || "-"}</TableCell>
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

// Invoices Component
function InvoicesView({ invoices, onPayWithStripe, onRefresh }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [filter, setFilter] = useState("all");

  const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const filteredInvoices = invoices.filter(inv => {
    if (filter === "all") return true;
    return inv.status === filter;
  });

  const handleSelectInvoice = (invoiceId) => {
    setSelectedInvoices(prev => 
      prev.includes(invoiceId) 
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    );
  };

  const handlePaySelected = () => {
    if (selectedInvoices.length === 0) {
      toast.error(isEs ? "Selecciona al menos una factura" : "Select at least one invoice");
      return;
    }
    onPayWithStripe(selectedInvoices);
  };

  const getStatusBadge = (status) => {
    const styles = {
      open: "bg-blue-100 text-blue-700",
      partially_paid: "bg-yellow-100 text-yellow-700",
      paid: "bg-green-100 text-green-700",
      overdue: "bg-red-100 text-red-700"
    };
    const labels = {
      open: isEs ? "Abierta" : "Open",
      partially_paid: isEs ? "Pago Parcial" : "Partially Paid",
      paid: isEs ? "Pagada" : "Paid",
      overdue: isEs ? "Vencida" : "Overdue"
    };
    return <Badge className={styles[status] || styles.open}>{labels[status] || status}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEs ? "Todas" : "All"}</SelectItem>
              <SelectItem value="open">{isEs ? "Abiertas" : "Open"}</SelectItem>
              <SelectItem value="partially_paid">{isEs ? "Parciales" : "Partial"}</SelectItem>
              <SelectItem value="paid">{isEs ? "Pagadas" : "Paid"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          {selectedInvoices.length > 0 && (
            <Button onClick={handlePaySelected} className="gap-2">
              <CreditCard className="w-4 h-4" />
              {isEs ? "Pagar Seleccionadas" : "Pay Selected"} ({selectedInvoices.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>{isEs ? "Factura #" : "Invoice #"}</TableHead>
                <TableHead>{isEs ? "Cliente" : "Client"}</TableHead>
                <TableHead>{isEs ? "Evento" : "Event"}</TableHead>
                <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                <TableHead>{isEs ? "Vence" : "Due"}</TableHead>
                <TableHead className="text-right">{isEs ? "Total" : "Total"}</TableHead>
                <TableHead className="text-right">{isEs ? "Pagado" : "Paid"}</TableHead>
                <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.map((inv) => (
                <TableRow key={inv.invoice_id}>
                  <TableCell>
                    {inv.status !== "paid" && (
                      <input
                        type="checkbox"
                        checked={selectedInvoices.includes(inv.invoice_id)}
                        onChange={() => handleSelectInvoice(inv.invoice_id)}
                        className="rounded border-gray-300"
                      />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.client_name || "-"}</TableCell>
                  <TableCell>{inv.event_name || "-"}</TableCell>
                  <TableCell>{new Date(inv.issue_date).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(inv.due_date).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">{formatCurrency(inv.total)}</TableCell>
                  <TableCell className="text-right text-green-600">{formatCurrency(inv.paid_amount)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(inv.balance_due)}</TableCell>
                  <TableCell>{getStatusBadge(inv.status)}</TableCell>
                </TableRow>
              ))}
              {filteredInvoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay facturas" : "No invoices found"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// Accounts Receivable Component
function AccountsReceivable({ data }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{isEs ? "Total Pendiente" : "Total Outstanding"}</p>
            <p className="text-2xl font-bold">{formatCurrency(data?.summary?.total_outstanding)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{isEs ? "Total Vencido" : "Total Overdue"}</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(data?.summary?.total_overdue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{isEs ? "Al Día" : "Current"}</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(data?.summary?.total_current)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{isEs ? "Facturas Vencidas" : "Overdue Invoices"}</p>
            <p className="text-2xl font-bold">{data?.summary?.overdue_count || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Aging Buckets */}
      <Card>
        <CardHeader>
          <CardTitle>{isEs ? "Antigüedad de Cuentas" : "Aging Buckets"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4 text-center">
            {[
              { key: "current", label: isEs ? "Al Día" : "Current", color: "text-green-600" },
              { key: "1_30", label: "1-30", color: "text-yellow-600" },
              { key: "31_60", label: "31-60", color: "text-orange-600" },
              { key: "61_90", label: "61-90", color: "text-red-500" },
              { key: "90_plus", label: "90+", color: "text-red-700" },
            ].map(({ key, label, color }) => (
              <div key={key}>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{formatCurrency(data?.aging_buckets?.[key])}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Cliente" : "Client"}</TableHead>
                <TableHead>{isEs ? "Factura" : "Invoice"}</TableHead>
                <TableHead>{isEs ? "Evento" : "Event"}</TableHead>
                <TableHead>{isEs ? "Vencimiento" : "Due Date"}</TableHead>
                <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                <TableHead className="text-right">{isEs ? "Días Vencido" : "Days Overdue"}</TableHead>
                <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.records || []).map((rec) => (
                <TableRow key={rec.invoice_id}>
                  <TableCell>{rec.client_name || "-"}</TableCell>
                  <TableCell className="font-medium">{rec.invoice_number}</TableCell>
                  <TableCell>{rec.event_name || "-"}</TableCell>
                  <TableCell>{rec.due_date ? new Date(rec.due_date).toLocaleDateString() : "-"}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(rec.balance_due)}</TableCell>
                  <TableCell className="text-right">
                    {rec.days_overdue > 0 ? (
                      <span className="text-red-600">{rec.days_overdue}</span>
                    ) : (
                      <span className="text-green-600">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={rec.status === "overdue" ? "destructive" : "outline"}>
                      {rec.status === "overdue" ? (isEs ? "Vencida" : "Overdue") : (isEs ? "Al Día" : "Current")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// Accounts Payable Component
function AccountsPayable({ data }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{isEs ? "Total Pendiente" : "Total Pending"}</p>
            <p className="text-2xl font-bold text-orange-600">{formatCurrency(data?.summary?.total_pending)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{isEs ? "Total Pagado" : "Total Paid"}</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(data?.summary?.total_paid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{isEs ? "Registros Pendientes" : "Pending Records"}</p>
            <p className="text-2xl font-bold">{data?.summary?.pending_count || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Records Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Proveedor" : "Supplier"}</TableHead>
                <TableHead>{isEs ? "Descripción" : "Description"}</TableHead>
                <TableHead>{isEs ? "Evento" : "Event"}</TableHead>
                <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                <TableHead className="text-right">{isEs ? "Monto" : "Amount"}</TableHead>
                <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.records || []).map((rec) => (
                <TableRow key={rec.payable_id}>
                  <TableCell>{rec.supplier_name || "-"}</TableCell>
                  <TableCell>{rec.description || "-"}</TableCell>
                  <TableCell>{rec.event_name || "-"}</TableCell>
                  <TableCell>{rec.date ? new Date(rec.date).toLocaleDateString() : "-"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(rec.amount)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(rec.balance_due)}</TableCell>
                  <TableCell>
                    <Badge variant={rec.status === "paid" ? "default" : "outline"}>
                      {rec.status === "paid" ? (isEs ? "Pagado" : "Paid") : (isEs ? "Pendiente" : "Pending")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(data?.records || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {isEs ? "No hay registros" : "No records found"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// Reports Component
function ReportsView() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [activeReport, setActiveReport] = useState("snapshot");
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);

  const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const loadReport = useCallback(async (reportType) => {
    setLoading(true);
    try {
      const endpoints = {
        snapshot: "/api/business-clarity/reports/financial-snapshot",
        clients: "/api/business-clarity/reports/client-revenue",
        suppliers: "/api/business-clarity/reports/supplier-spend",
        events: "/api/business-clarity/reports/event-profitability"
      };
      const res = await axios.get(`${API}${endpoints[reportType]}`, { withCredentials: true });
      setReportData(res.data);
    } catch (err) {
      toast.error(isEs ? "Error al cargar reporte" : "Failed to load report");
    }
    setLoading(false);
  }, [isEs]);

  useEffect(() => {
    loadReport(activeReport);
  }, [activeReport, loadReport]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[
          { key: "snapshot", label: isEs ? "Resumen Financiero" : "Financial Snapshot" },
          { key: "clients", label: isEs ? "Ingresos por Cliente" : "Client Revenue" },
          { key: "suppliers", label: isEs ? "Gastos por Proveedor" : "Supplier Spend" },
          { key: "events", label: isEs ? "Rentabilidad por Evento" : "Event Profitability" },
        ].map(({ key, label }) => (
          <Button
            key={key}
            variant={activeReport === key ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveReport(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {loading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">{isEs ? "Cargando..." : "Loading..."}</CardContent></Card>
      ) : (
        <>
          {activeReport === "snapshot" && reportData && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">{isEs ? "Total Facturado" : "Total Invoiced"}</p>
                    <p className="text-2xl font-bold">{formatCurrency(reportData.revenue?.total_invoiced)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">{isEs ? "Total Cobrado" : "Total Collected"}</p>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(reportData.revenue?.total_collected)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">{isEs ? "Total Gastos" : "Total Expenses"}</p>
                    <p className="text-2xl font-bold text-red-600">{formatCurrency(reportData.expenses?.total)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">{isEs ? "Utilidad Bruta" : "Gross Profit"}</p>
                    <p className="text-2xl font-bold text-blue-600">{formatCurrency(reportData.profit?.gross)}</p>
                    <p className="text-xs text-muted-foreground">{reportData.profit?.margin}% margin</p>
                  </CardContent>
                </Card>
              </div>
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
                      <TableHead className="text-right">{isEs ? "Facturas" : "Invoices"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(reportData.records || []).map((rec) => (
                      <TableRow key={rec.client_id}>
                        <TableCell className="font-medium">{rec.client_name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(rec.total_invoiced)}</TableCell>
                        <TableCell className="text-right text-green-600">{formatCurrency(rec.total_paid)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(rec.total_outstanding)}</TableCell>
                        <TableCell className="text-right">{rec.invoices_count}</TableCell>
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
                      <TableHead className="text-right">{isEs ? "Total Gasto" : "Total Spend"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Pagado" : "Paid"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Pendiente" : "Pending"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Transacciones" : "Transactions"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(reportData.records || []).map((rec, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{rec.supplier_name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(rec.total_amount)}</TableCell>
                        <TableCell className="text-right text-green-600">{formatCurrency(rec.paid_amount)}</TableCell>
                        <TableCell className="text-right text-orange-600">{formatCurrency(rec.pending_amount)}</TableCell>
                        <TableCell className="text-right">{rec.transactions_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {activeReport === "events" && reportData && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isEs ? "Evento" : "Event"}</TableHead>
                      <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Ingresos" : "Revenue"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Costos" : "Costs"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Utilidad" : "Profit"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Margen" : "Margin"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(reportData.records || []).map((rec) => (
                      <TableRow key={rec.event_id}>
                        <TableCell className="font-medium">{rec.event_name}</TableCell>
                        <TableCell><Badge variant="outline">{rec.status}</Badge></TableCell>
                        <TableCell className="text-right">{formatCurrency(rec.revenue)}</TableCell>
                        <TableCell className="text-right text-red-600">{formatCurrency(rec.costs)}</TableCell>
                        <TableCell className={`text-right font-medium ${rec.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(rec.profit)}
                        </TableCell>
                        <TableCell className="text-right">{rec.margin_percent}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// Main Page Component
export default function BusinessClarityPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [activeTab, setActiveTab] = useState("dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [arData, setArData] = useState(null);
  const [apData, setApData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, invRes, arRes, apRes] = await Promise.all([
        axios.get(`${API}/api/business-clarity/dashboard`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/invoices`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/accounts-receivable`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/accounts-payable`, { withCredentials: true }),
      ]);
      setDashboard(dashRes.data);
      setInvoices(invRes.data);
      setArData(arRes.data);
      setApData(apRes.data);
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error al cargar datos" : "Failed to load data");
    }
    setLoading(false);
  }, [isEs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Stripe payment
  const handlePayWithStripe = async (invoiceIds) => {
    try {
      const originUrl = window.location.origin;
      const res = await axios.post(`${API}/api/business-clarity/checkout/session`, {
        invoice_ids: invoiceIds,
        origin_url: originUrl
      }, { withCredentials: true });
      
      if (res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al crear sesión de pago" : "Failed to create payment session"));
    }
  };

  // Check for payment success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    
    if (sessionId) {
      // Poll for payment status
      const pollStatus = async () => {
        try {
          const res = await axios.get(`${API}/api/business-clarity/checkout/status/${sessionId}`, { withCredentials: true });
          if (res.data.payment_status === "paid") {
            toast.success(isEs ? "¡Pago exitoso!" : "Payment successful!");
            fetchData();
            // Clear URL params
            window.history.replaceState({}, document.title, window.location.pathname);
          } else if (res.data.status === "expired") {
            toast.error(isEs ? "Sesión expirada" : "Session expired");
          } else {
            // Keep polling
            setTimeout(pollStatus, 2000);
          }
        } catch (err) {
          console.error(err);
        }
      };
      pollStatus();
    }
  }, [fetchData, isEs]);

  if (loading && !dashboard) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="dashboard" className="gap-2">
              <PieChart className="w-4 h-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="invoices" className="gap-2">
              <FileText className="w-4 h-4" />
              {isEs ? "Facturas" : "Invoices"}
            </TabsTrigger>
            <TabsTrigger value="receivables" className="gap-2">
              <TrendingUp className="w-4 h-4" />
              {isEs ? "Por Cobrar" : "Receivables"}
            </TabsTrigger>
            <TabsTrigger value="payables" className="gap-2">
              <TrendingDown className="w-4 h-4" />
              {isEs ? "Por Pagar" : "Payables"}
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-2">
              <Receipt className="w-4 h-4" />
              {isEs ? "Reportes" : "Reports"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <Dashboard data={dashboard} onRefresh={fetchData} />
          </TabsContent>

          <TabsContent value="invoices">
            <InvoicesView invoices={invoices} onPayWithStripe={handlePayWithStripe} onRefresh={fetchData} />
          </TabsContent>

          <TabsContent value="receivables">
            <AccountsReceivable data={arData} />
          </TabsContent>

          <TabsContent value="payables">
            <AccountsPayable data={apData} />
          </TabsContent>

          <TabsContent value="reports">
            <ReportsView />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
