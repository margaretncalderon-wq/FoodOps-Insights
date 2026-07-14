import { useState, useEffect } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { RefreshCw } from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";
import { KoraLoader } from "../KoraLoader";
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ReceivablesSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/api/business-clarity/accounts-receivable`, { withCredentials: true })
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><KoraLoader size={48} /></div>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{isEs ? "Cuentas por Cobrar" : "Accounts Receivable"}</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Total Pendiente" : "Total Outstanding"}</p><p className="text-xl font-bold">{formatCurrency(data?.summary?.total_outstanding)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Vencido" : "Overdue"}</p><p className="text-xl font-bold text-red-600">{formatCurrency(data?.summary?.total_overdue)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Al Día" : "Current"}</p><p className="text-xl font-bold text-green-600">{formatCurrency(data?.summary?.total_current)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Facturas Vencidas" : "Overdue Count"}</p><p className="text-xl font-bold">{data?.summary?.overdue_count || 0}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>{isEs ? "Cliente" : "Client"}</TableHead><TableHead>{isEs ? "Factura" : "Invoice"}</TableHead><TableHead>{isEs ? "Vence" : "Due"}</TableHead><TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead><TableHead className="text-right">{isEs ? "Días" : "Days"}</TableHead><TableHead>{isEs ? "Estado" : "Status"}</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data?.records || []).map((rec) => (
                <TableRow key={rec.invoice_id}>
                  <TableCell>{rec.client_name || "-"}</TableCell>
                  <TableCell className="font-medium">{rec.invoice_number}</TableCell>
                  <TableCell>{rec.due_date ? formatDateOnly(rec.due_date, language) : "-"}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(rec.balance_due)}</TableCell>
                  <TableCell className="text-right">{rec.days_overdue > 0 ? <span className="text-red-600">{rec.days_overdue}</span> : <span className="text-green-600">0</span>}</TableCell>
                  <TableCell><Badge variant={rec.status === "overdue" ? "destructive" : "outline"}>{rec.status === "overdue" ? (isEs ? "Vencida" : "Overdue") : (isEs ? "Al Día" : "Current")}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
