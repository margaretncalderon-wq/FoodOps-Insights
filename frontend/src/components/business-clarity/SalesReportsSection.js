import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTerminology } from "../../hooks/useTerminology";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  ShoppingCart, Users, UserCheck, Package, TrendingUp,
  FileText, Download, RefreshCw, Calendar, DollarSign,
  ArrowUpRight, ArrowDownRight, Search, Check, ChevronsUpDown
} from "lucide-react";
import { toast } from "sonner";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => 
  `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const REPORT_TYPES = [
  { id: "general", icon: ShoppingCart, color: "violet" },
  { id: "by-client", icon: Users, color: "blue" },
  { id: "by-salesperson", icon: UserCheck, color: "green" },
  { id: "by-item", icon: Package, color: "orange" },
  { id: "item-profitability", icon: TrendingUp, color: "emerald" },
  { id: "client-statement", icon: FileText, color: "slate" }
];

export function SalesReportsSection() {
  const { language } = useLanguage();
  const { term } = useTerminology();
  const isEs = language === "es";
  
  const [activeReport, setActiveReport] = useState("general");
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  // For client statement
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [showClientDialog, setShowClientDialog] = useState(false);

  const reportLabels = {
    general: { es: "Ventas Generales", en: "General Sales" },
    "by-client": { es: "Ventas por Cliente", en: "Sales by Client" },
    "by-salesperson": { es: "Ventas por Vendedor", en: "Sales by Salesperson" },
    "by-item": { es: "Ventas por Ítem", en: "Sales by Item" },
    "item-profitability": { es: "Rentabilidad por Ítem", en: "Item Profitability" },
    "client-statement": { es: "Estado de Cuenta", en: "Client Statement" }
  };

  const fetchClients = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/clients`, { withCredentials: true });
      setClients(res.data || []);
    } catch (err) {
      console.error("Error fetching clients:", err);
    }
  }, []);

  const fetchReport = useCallback(async () => {
    if (activeReport === "client-statement" && !selectedClient) {
      setReportData(null);
      return;
    }
    
    setLoading(true);
    try {
      let url = `${API}/api/business-clarity/reports/sales/${activeReport}`;
      if (activeReport === "client-statement") {
        url = `${API}/api/business-clarity/reports/sales/client-statement/${selectedClient}`;
      }
      url += `?start_date=${startDate}&end_date=${endDate}`;
      
      const res = await axios.get(url, { withCredentials: true });
      setReportData(res.data);
    } catch (err) {
      console.error("Error fetching report:", err);
      toast.error(isEs ? "Error al cargar reporte" : "Error loading report");
    }
    setLoading(false);
  }, [activeReport, startDate, endDate, selectedClient, isEs]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const exportToCSV = () => {
    if (!reportData) return;
    
    let headers = [];
    let rows = [];
    const reportName = reportLabels[activeReport][isEs ? "es" : "en"];
    
    if (activeReport === "general") {
      headers = [isEs ? "Factura" : "Invoice", isEs ? "Cliente" : "Client", isEs ? "Fecha" : "Date", "Total", isEs ? "Saldo" : "Balance", isEs ? "Estado" : "Status"];
      rows = (reportData.invoices || []).map(i => [i.invoice_number, i.client_name, i.date, i.total, i.balance_due, i.status]);
    } else if (activeReport === "by-client") {
      headers = [isEs ? "Cliente" : "Client", isEs ? "Facturado" : "Invoiced", isEs ? "Cobrado" : "Collected", isEs ? "Pendiente" : "Outstanding", isEs ? "Facturas" : "Invoices"];
      rows = (reportData.records || []).map(r => [r.client_name, r.total_invoiced, r.total_collected, r.total_outstanding, r.invoice_count]);
    } else if (activeReport === "by-salesperson") {
      headers = [isEs ? "Vendedor" : "Salesperson", isEs ? "Ingresos" : "Revenue", term("events", "entity_plural"), isEs ? "Cerrados" : "Closed", isEs ? "Tasa Cierre %" : "Close Rate %"];
      rows = (reportData.records || []).map(r => [r.salesperson_name, r.total_revenue, r.event_count, r.closed_count, r.close_rate]);
    } else if (activeReport === "by-item") {
      headers = [isEs ? "Ítem" : "Item", isEs ? "Cantidad" : "Quantity", isEs ? "Ingresos" : "Revenue", isEs ? "Precio Prom." : "Avg Price"];
      rows = (reportData.records || []).map(r => [r.item_name, r.quantity_sold, r.total_revenue, r.avg_unit_price]);
    } else if (activeReport === "item-profitability") {
      headers = [isEs ? "Ítem" : "Item", isEs ? "Cantidad" : "Qty", isEs ? "Ingresos" : "Revenue", isEs ? "Costo" : "Cost", isEs ? "Utilidad" : "Profit", isEs ? "Margen %" : "Margin %"];
      rows = (reportData.records || []).map(r => [r.item_name, r.quantity_sold, r.total_revenue, r.total_cost, r.profit, r.margin_percent]);
    } else if (activeReport === "client-statement") {
      headers = [isEs ? "Fecha" : "Date", isEs ? "Tipo" : "Type", isEs ? "Referencia" : "Reference", isEs ? "Descripción" : "Description", isEs ? "Débito" : "Debit", isEs ? "Crédito" : "Credit", isEs ? "Saldo" : "Balance"];
      rows = (reportData.transactions || []).map(t => [t.date, t.type, t.reference, t.description, t.debit, t.credit, t.balance]);
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

  const renderGeneralReport = () => (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{isEs ? "Total Facturado" : "Total Invoiced"}</p>
            <p className="text-2xl font-bold text-violet-600">{formatCurrency(reportData?.summary?.total_invoiced)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{isEs ? "Total Cobrado" : "Total Collected"}</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(reportData?.summary?.total_collected)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{isEs ? "Devoluciones" : "Returns"}</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(reportData?.summary?.total_returns)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{isEs ? "Ventas Netas" : "Net Sales"}</p>
            <p className="text-2xl font-bold">{formatCurrency(reportData?.summary?.net_sales)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isEs ? "Facturas del Período" : "Period Invoices"}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Factura" : "Invoice"}</TableHead>
                <TableHead>{isEs ? "Cliente" : "Client"}</TableHead>
                <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(reportData?.invoices || []).slice(0, 20).map((inv, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.client_name}</TableCell>
                  <TableCell>{inv.date}</TableCell>
                  <TableCell className="text-right">{formatCurrency(inv.total)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(inv.balance_due)}</TableCell>
                  <TableCell>
                    <Badge variant={inv.status === "paid" ? "default" : "secondary"}>
                      {inv.status}
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

  const renderByClientReport = () => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>{isEs ? "Ventas por Cliente" : "Sales by Client"}</span>
          <Badge variant="outline">{reportData?.total_clients || 0} {isEs ? "clientes" : "clients"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
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
            {(reportData?.records || []).map((r, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium">{r.client_name}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.total_invoiced)}</TableCell>
                <TableCell className="text-right text-green-600">{formatCurrency(r.total_collected)}</TableCell>
                <TableCell className="text-right text-amber-600">{formatCurrency(r.total_outstanding)}</TableCell>
                <TableCell className="text-right">{r.invoice_count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderBySalespersonReport = () => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>{isEs ? "Ventas por Vendedor" : "Sales by Salesperson"}</span>
          <Badge variant="outline">{reportData?.total_salespeople || 0} {isEs ? "vendedores" : "salespeople"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isEs ? "Vendedor" : "Salesperson"}</TableHead>
              <TableHead className="text-right">{isEs ? "Ingresos" : "Revenue"}</TableHead>
              <TableHead className="text-right">{term("events", "entity_plural")}</TableHead>
              <TableHead className="text-right">{isEs ? "Cerrados" : "Closed"}</TableHead>
              <TableHead className="text-right">{isEs ? "Tasa Cierre" : "Close Rate"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(reportData?.records || []).map((r, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium">{r.salesperson_name}</TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(r.total_revenue)}</TableCell>
                <TableCell className="text-right">{r.event_count}</TableCell>
                <TableCell className="text-right">{r.closed_count}</TableCell>
                <TableCell className="text-right">
                  <Badge variant={r.close_rate >= 50 ? "default" : "secondary"}>
                    {r.close_rate}%
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderByItemReport = () => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>{isEs ? "Ventas por Ítem" : "Sales by Item"}</span>
          <Badge variant="outline">{reportData?.total_items || 0} {isEs ? "ítems" : "items"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isEs ? "Ítem" : "Item"}</TableHead>
              <TableHead className="text-right">{isEs ? "Cantidad" : "Quantity"}</TableHead>
              <TableHead className="text-right">{isEs ? "Ingresos" : "Revenue"}</TableHead>
              <TableHead className="text-right">{isEs ? "Precio Prom." : "Avg Price"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(reportData?.records || []).map((r, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium">{r.item_name}</TableCell>
                <TableCell className="text-right">{r.quantity_sold}</TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(r.total_revenue)}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.avg_unit_price)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderItemProfitabilityReport = () => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>{isEs ? "Rentabilidad por Ítem" : "Item Profitability"}</span>
          <Badge variant="outline">{reportData?.total_items || 0} {isEs ? "ítems" : "items"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isEs ? "Ítem" : "Item"}</TableHead>
              <TableHead className="text-right">{isEs ? "Cantidad" : "Qty"}</TableHead>
              <TableHead className="text-right">{isEs ? "Ingresos" : "Revenue"}</TableHead>
              <TableHead className="text-right">{isEs ? "Costo" : "Cost"}</TableHead>
              <TableHead className="text-right">{isEs ? "Utilidad" : "Profit"}</TableHead>
              <TableHead className="text-right">{isEs ? "Margen" : "Margin"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(reportData?.records || []).map((r, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium">{r.item_name}</TableCell>
                <TableCell className="text-right">{r.quantity_sold}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.total_revenue)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatCurrency(r.total_cost)}</TableCell>
                <TableCell className={`text-right font-semibold ${r.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(r.profit)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={r.margin_percent >= 30 ? "default" : r.margin_percent >= 0 ? "secondary" : "destructive"}>
                    {r.margin_percent}%
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderClientStatement = () => (
    <div className="space-y-4">
      {/* Client Selector */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label>{isEs ? "Seleccionar Cliente" : "Select Client"}</Label>
              <Popover open={clientPickerOpen} onOpenChange={setClientPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={clientPickerOpen}
                    className="w-full justify-between font-normal mt-1"
                    data-testid="sales-report-client-picker"
                  >
                    <span className="truncate">
                      {selectedClient
                        ? (clients.find(c => c.client_id === selectedClient)?.name
                           || clients.find(c => c.client_id === selectedClient)?.company_name
                           || (isEs ? "Cliente seleccionado" : "Selected client"))
                        : (isEs ? "Buscar cliente…" : "Search client…")}
                    </span>
                    <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[420px] p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder={isEs ? "Escribir para buscar…" : "Type to search…"}
                      data-testid="sales-report-client-search-input"
                    />
                    <CommandList>
                      <CommandEmpty>{isEs ? "Sin resultados" : "No results"}</CommandEmpty>
                      <CommandGroup>
                        {clients.map(c => (
                          <CommandItem
                            key={c.client_id}
                            value={`${c.name || ""} ${c.company_name || ""} ${c.email || ""} ${c.rnc || ""}`}
                            onSelect={() => { setSelectedClient(c.client_id); setClientPickerOpen(false); }}
                            data-testid={`sales-report-client-option-${c.client_id}`}
                          >
                            <Check className={`mr-2 h-4 w-4 ${selectedClient === c.client_id ? "opacity-100" : "opacity-0"}`} />
                            <div className="flex flex-col min-w-0">
                              <span className="truncate">{c.name || c.company_name}</span>
                              {(c.company_name && c.name !== c.company_name) && (
                                <span className="text-[11px] text-muted-foreground truncate">{c.company_name}</span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statement */}
      {reportData?.client && (
        <>
          <Card className="bg-slate-50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{reportData.client.name}</h3>
                  <p className="text-sm text-muted-foreground">{reportData.client.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">{isEs ? "Saldo Actual" : "Current Balance"}</p>
                  <p className={`text-2xl font-bold ${reportData.closing_balance > 0 ? "text-amber-600" : "text-green-600"}`}>
                    {formatCurrency(reportData.closing_balance)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{isEs ? "Movimientos" : "Transactions"}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                    <TableHead>{isEs ? "Descripción" : "Description"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Débito" : "Debit"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Crédito" : "Credit"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(reportData.transactions || []).map((t, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{t.date}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {t.type === "invoice" ? (
                            <ArrowUpRight className="w-4 h-4 text-amber-500" />
                          ) : (
                            <ArrowDownRight className="w-4 h-4 text-green-500" />
                          )}
                          {t.description}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{t.debit > 0 ? formatCurrency(t.debit) : "-"}</TableCell>
                      <TableCell className="text-right text-green-600">{t.credit > 0 ? formatCurrency(t.credit) : "-"}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(t.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
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
              {activeReport === "client-statement" 
                ? (isEs ? "Selecciona un cliente para ver su estado de cuenta" : "Select a client to view their statement")
                : (isEs ? "No hay datos para el período seleccionado" : "No data for selected period")}
            </p>
          </CardContent>
        </Card>
      );
    }

    switch (activeReport) {
      case "general": return renderGeneralReport();
      case "by-client": return renderByClientReport();
      case "by-salesperson": return renderBySalespersonReport();
      case "by-item": return renderByItemReport();
      case "item-profitability": return renderItemProfitabilityReport();
      case "client-statement": return renderClientStatement();
      default: return null;
    }
  };

  return (
    <div className="space-y-6" data-testid="sales-reports-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            {isEs ? "Reportes de Ventas" : "Sales Reports"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Análisis detallado de ventas y facturación" : "Detailed sales and billing analysis"}
          </p>
        </div>
        <Button variant="outline" onClick={exportToCSV} disabled={!reportData}>
          <Download className="w-4 h-4 mr-2" />
          {isEs ? "Exportar CSV" : "Export CSV"}
        </Button>
      </div>

      {/* Date Range */}
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
              className={isActive ? `bg-${rt.color}-600 hover:bg-${rt.color}-700` : ""}
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
