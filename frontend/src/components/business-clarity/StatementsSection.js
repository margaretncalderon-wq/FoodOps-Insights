import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Download, RefreshCw, AlertTriangle } from "lucide-react";

import { API_BASE as API } from "../../utils/api";
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function StatementsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const fetchClients = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/crm/clients`, { withCredentials: true });
      setClients(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);

  const fetchStatement = async (clientId) => {
    if (!clientId) return;
    try {
      const res = await axios.get(`${API}/api/business-clarity/clients/${clientId}/financial`, { withCredentials: true });
      setStatement(res.data);
    } catch (err) {
      toast.error(isEs ? "Error al cargar" : "Failed to load");
    }
  };

  useEffect(() => { fetchClients(); }, [fetchClients]);
  useEffect(() => { if (selectedClient) fetchStatement(selectedClient); }, [selectedClient]);

  const handleDownloadPDF = async () => {
    if (!statement) return;
    setDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      
      const doc = new jsPDF();
      const client = statement.client;
      const credit = statement.credit;
      
      // Header
      doc.setFontSize(18);
      doc.text(isEs ? "Estado de Cuenta" : "Account Statement", 14, 20);
      doc.setFontSize(12);
      doc.text(`${isEs ? "Cliente" : "Client"}: ${client?.display_name || "N/A"}`, 14, 30);
      doc.text(`${isEs ? "Fecha" : "Date"}: ${new Date().toLocaleDateString()}`, 14, 36);
      if (client?.tax_id) {
        doc.text(`RNC/ID: ${client.tax_id}`, 14, 42);
      }
      
      // Summary
      let yPos = 54;
      doc.setFontSize(10);
      doc.text(`${isEs ? "Total Facturado" : "Total Invoiced"}: ${formatCurrency(statement.summary?.total_invoiced)}`, 14, yPos);
      doc.text(`${isEs ? "Total Pagado" : "Total Paid"}: ${formatCurrency(statement.summary?.total_paid)}`, 14, yPos + 6);
      doc.text(`${isEs ? "Saldo Actual" : "Current Balance"}: ${formatCurrency(statement.summary?.current_balance)}`, 14, yPos + 12);
      doc.text(`${isEs ? "Términos" : "Terms"}: ${credit?.payment_terms || client?.payment_terms || (isEs ? "Inmediato" : "Immediate")}`, 14, yPos + 18);
      
      // Credit info if applicable
      if (credit?.has_credit && credit?.credit_limit > 0) {
        yPos += 30;
        doc.setFillColor(239, 246, 255);
        doc.rect(14, yPos, 180, 20, "F");
        doc.setFontSize(10);
        doc.setTextColor(59, 130, 246);
        doc.text(`${isEs ? "LÍNEA DE CRÉDITO" : "CREDIT LINE"}`, 16, yPos + 6);
        doc.setTextColor(0, 0, 0);
        doc.text(`${isEs ? "Límite" : "Limit"}: ${formatCurrency(credit.credit_limit)}`, 16, yPos + 13);
        doc.text(`${isEs ? "Utilizado" : "Used"}: ${formatCurrency(credit.credit_used)} (${credit.credit_used_percent?.toFixed(0) || 0}%)`, 80, yPos + 13);
        doc.text(`${isEs ? "Disponible" : "Available"}: ${formatCurrency(credit.credit_available)}`, 140, yPos + 13);
        yPos += 25;
      } else {
        yPos += 25;
      }
      
      // Activity table
      if (statement.activity?.length > 0) {
        autoTable(doc, {
          startY: yPos,
          head: [[
            isEs ? "Fecha" : "Date", 
            isEs ? "Tipo" : "Type", 
            isEs ? "Descripción" : "Description", 
            isEs ? "Débito" : "Debit", 
            isEs ? "Crédito" : "Credit", 
            isEs ? "Saldo" : "Balance"
          ]],
          body: statement.activity.map(item => [
            item.date ? new Date(item.date).toLocaleDateString() : "-",
            item.type === "invoice" ? (isEs ? "Factura" : "Invoice") : (isEs ? "Pago" : "Payment"),
            item.description || "-",
            item.debit > 0 ? formatCurrency(item.debit) : "-",
            item.credit > 0 ? formatCurrency(item.credit) : "-",
            formatCurrency(item.balance)
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [59, 130, 246] },
          columnStyles: {
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right' }
          }
        });
      }
      
      // Footer
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(`${isEs ? "Generado" : "Generated"}: ${new Date().toLocaleString()}`, 14, pageHeight - 10);
      
      doc.save(`estado_cuenta_${client?.display_name?.replace(/\s+/g, "_") || "cliente"}.pdf`);
      toast.success(isEs ? "PDF descargado" : "PDF downloaded");
    } catch (err) {
      console.error("PDF Error:", err);
      toast.error(isEs ? "Error al generar PDF" : "Failed to generate PDF");
    }
    setDownloading(false);
  };

  const handleDownloadCSV = () => {
    if (!statement?.activity?.length) return;
    const headers = ["Fecha", "Tipo", "Descripcion", "Debito", "Credito", "Saldo"];
    const rows = statement.activity.map(item => [
      item.date ? new Date(item.date).toLocaleDateString() : "",
      item.type === "invoice" ? "Factura" : "Pago",
      item.description,
      item.debit || 0,
      item.credit || 0,
      item.balance
    ]);
    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `estado_cuenta_${statement.client?.display_name?.replace(/\s+/g, "_") || "cliente"}.csv`;
    a.click();
    toast.success(isEs ? "CSV descargado" : "CSV downloaded");
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  const credit = statement?.credit;
  const hasCredit = credit?.has_credit && credit?.credit_limit > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{isEs ? "Estados de Cuenta" : "Account Statements"}</h2>
        <div className="flex items-center gap-2">
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-64"><SelectValue placeholder={isEs ? "Seleccionar cliente" : "Select client"} /></SelectTrigger>
            <SelectContent>{clients.map(c => <SelectItem key={c.client_id} value={c.client_id}>{c.display_name}</SelectItem>)}</SelectContent>
          </Select>
          {statement && (
            <>
              <Button variant="outline" size="sm" onClick={handleDownloadCSV} className="gap-2"><Download className="w-4 h-4" />CSV</Button>
              <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={downloading} className="gap-2"><Download className="w-4 h-4" />PDF</Button>
            </>
          )}
        </div>
      </div>

      {statement ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Total Facturado" : "Total Invoiced"}</p><p className="text-xl font-bold">{formatCurrency(statement.summary?.total_invoiced)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Total Pagado" : "Total Paid"}</p><p className="text-xl font-bold text-green-600">{formatCurrency(statement.summary?.total_paid)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Saldo Actual" : "Current Balance"}</p><p className={`text-xl font-bold ${statement.summary?.current_balance > 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(statement.summary?.current_balance)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Términos" : "Terms"}</p><p className="text-lg font-medium">{credit?.payment_terms || statement.client?.payment_terms || (isEs ? "Inmediato" : "Immediate")}</p></CardContent></Card>
          </div>

          {/* Credit Limit Card - Only show if client has credit */}
          {hasCredit && (
            <Card className={`border-2 ${credit.credit_used_percent >= 100 ? "border-red-300 bg-red-50" : credit.credit_used_percent >= 80 ? "border-amber-300 bg-amber-50" : "border-blue-200 bg-blue-50"}`}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">{isEs ? "Línea de Crédito" : "Credit Line"}</p>
                    <p className="text-xs text-gray-500">{credit.payment_terms || (isEs ? "Términos de pago" : "Payment terms")}</p>
                  </div>
                  <Badge variant={credit.credit_used_percent >= 100 ? "destructive" : credit.credit_used_percent >= 80 ? "warning" : "default"} className={credit.credit_used_percent < 80 ? "bg-blue-600" : ""}>
                    {credit.credit_used_percent >= 100 ? (isEs ? "Excedido" : "Exceeded") : `${credit.credit_used_percent.toFixed(0)}% ${isEs ? "utilizado" : "used"}`}
                  </Badge>
                </div>
                
                {/* Progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
                  <div 
                    className={`h-3 rounded-full transition-all ${credit.credit_used_percent >= 100 ? "bg-red-500" : credit.credit_used_percent >= 80 ? "bg-amber-500" : "bg-blue-500"}`}
                    style={{ width: `${Math.min(credit.credit_used_percent, 100)}%` }}
                  />
                </div>
                
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-gray-500">{isEs ? "Límite" : "Limit"}</p>
                    <p className="text-lg font-bold text-gray-800">{formatCurrency(credit.credit_limit)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{isEs ? "Utilizado" : "Used"}</p>
                    <p className={`text-lg font-bold ${credit.credit_used_percent >= 100 ? "text-red-600" : "text-amber-600"}`}>{formatCurrency(credit.credit_used)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{isEs ? "Disponible" : "Available"}</p>
                    <p className={`text-lg font-bold ${credit.credit_available > 0 ? "text-green-600" : "text-red-600"}`}>{formatCurrency(credit.credit_available)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Warnings */}
          {statement.warnings?.length > 0 && (
            <Card className="border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400"><AlertTriangle className="w-4 h-4" /><span className="font-medium">{isEs ? "Alertas" : "Warnings"}</span></div>
                <ul className="mt-2 space-y-1">
                  {statement.warnings.map((w, i) => (
                    <li key={i} className="text-sm text-red-600 dark:text-red-400">
                      • {typeof w === 'string' ? w : (isEs ? w.message : w.message_en)}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Activity Table */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{isEs ? "Movimientos" : "Activity"}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                    <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                    <TableHead>{isEs ? "Descripción" : "Description"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Débito" : "Debit"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Crédito" : "Credit"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(statement.activity || []).map((item, i) => (
                    <TableRow key={i}>
                      <TableCell>{item.date ? new Date(item.date).toLocaleDateString() : "-"}</TableCell>
                      <TableCell><Badge variant={item.type === "invoice" ? "default" : "secondary"}>{item.type === "invoice" ? (isEs ? "Factura" : "Invoice") : (isEs ? "Pago" : "Payment")}</Badge></TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell className="text-right">{item.debit > 0 ? formatCurrency(item.debit) : "-"}</TableCell>
                      <TableCell className="text-right text-green-600">{item.credit > 0 ? formatCurrency(item.credit) : "-"}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(item.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card><CardContent className="py-12 text-center text-muted-foreground">{isEs ? "Seleccione un cliente" : "Select a client"}</CardContent></Card>
      )}
    </div>
  );
}
