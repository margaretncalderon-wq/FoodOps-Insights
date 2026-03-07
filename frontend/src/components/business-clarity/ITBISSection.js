import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  RefreshCw, Calculator, TrendingUp, TrendingDown, DollarSign,
  FileText, Download, Calendar, AlertCircle, CheckCircle2,
  ArrowRight, Receipt, ShoppingCart
} from "lucide-react";
import { toast } from "sonner";

import { API_BASE as API } from "../../utils/api";

export function ITBISSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [itbisData, setItbisData] = useState(null);
  
  const fetchITBISData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/finance/itbis/report`, {
        params: { month, year },
        withCredentials: true
      });
      setItbisData(res.data);
    } catch (err) {
      console.error("Error fetching ITBIS data:", err);
      // Mock data for display purposes
      setItbisData({
        period: { month, year },
        sales: {
          total_gravado: 0,
          total_exento: 0,
          itbis_cobrado: 0,
          transaction_count: 0
        },
        purchases: {
          total_gravado: 0,
          total_exento: 0,
          itbis_pagado: 0,
          transaction_count: 0
        },
        balance: {
          itbis_cobrado: 0,
          itbis_pagado: 0,
          itbis_a_pagar: 0,
          credito_fiscal: 0
        },
        transactions: {
          sales: [],
          purchases: []
        }
      });
    }
    setLoading(false);
  }, [month, year]);

  useEffect(() => {
    fetchITBISData();
  }, [fetchITBISData]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const months = [
    { value: 0, label: isEs ? "Enero" : "January" },
    { value: 1, label: isEs ? "Febrero" : "February" },
    { value: 2, label: isEs ? "Marzo" : "March" },
    { value: 3, label: isEs ? "Abril" : "April" },
    { value: 4, label: isEs ? "Mayo" : "May" },
    { value: 5, label: isEs ? "Junio" : "June" },
    { value: 6, label: isEs ? "Julio" : "July" },
    { value: 7, label: isEs ? "Agosto" : "August" },
    { value: 8, label: isEs ? "Septiembre" : "September" },
    { value: 9, label: isEs ? "Octubre" : "October" },
    { value: 10, label: isEs ? "Noviembre" : "November" },
    { value: 11, label: isEs ? "Diciembre" : "December" }
  ];

  const balance = itbisData?.balance || {};
  const sales = itbisData?.sales || {};
  const purchases = itbisData?.purchases || {};
  
  const itbisAPagar = (balance.itbis_cobrado || 0) - (balance.itbis_pagado || 0);
  const hayCreditoFiscal = itbisAPagar < 0;

  return (
    <div className="space-y-6" data-testid="itbis-section">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="w-6 h-6 text-violet-600" />
            ITBIS
          </h2>
          <p className="text-muted-foreground">
            {isEs 
              ? "Impuesto a la Transferencia de Bienes Industrializados y Servicios"
              : "Tax on Industrialized Goods and Services Transfer"
            }
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2025, 2024, 2023].map((y) => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={fetchITBISData}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Main Balance Card */}
      <Card className={`border-2 ${hayCreditoFiscal ? "border-blue-500 bg-blue-50/50" : "border-amber-500 bg-amber-50/50"}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            {hayCreditoFiscal 
              ? <CheckCircle2 className="w-5 h-5 text-blue-600" />
              : <AlertCircle className="w-5 h-5 text-amber-600" />
            }
            {isEs ? "Resumen del Período" : "Period Summary"}: {months[month]?.label} {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* ITBIS Cobrado */}
            <div className="text-center p-4 bg-white rounded-lg shadow-sm">
              <div className="flex items-center justify-center gap-2 text-emerald-600 mb-2">
                <TrendingUp className="w-5 h-5" />
                <span className="text-sm font-medium">{isEs ? "ITBIS Cobrado" : "ITBIS Collected"}</span>
              </div>
              <p className="text-2xl font-bold text-emerald-700">
                {formatCurrency(balance.itbis_cobrado || sales.itbis_cobrado)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {isEs ? "De ventas gravadas" : "From taxable sales"}
              </p>
            </div>

            {/* ITBIS Pagado */}
            <div className="text-center p-4 bg-white rounded-lg shadow-sm">
              <div className="flex items-center justify-center gap-2 text-blue-600 mb-2">
                <TrendingDown className="w-5 h-5" />
                <span className="text-sm font-medium">{isEs ? "ITBIS Pagado" : "ITBIS Paid"}</span>
              </div>
              <p className="text-2xl font-bold text-blue-700">
                {formatCurrency(balance.itbis_pagado || purchases.itbis_pagado)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {isEs ? "En compras gravadas" : "On taxable purchases"}
              </p>
            </div>

            {/* Balance */}
            <div className={`text-center p-4 rounded-lg shadow-sm ${hayCreditoFiscal ? "bg-blue-100" : "bg-amber-100"}`}>
              <div className="flex items-center justify-center gap-2 mb-2">
                <DollarSign className={`w-5 h-5 ${hayCreditoFiscal ? "text-blue-600" : "text-amber-600"}`} />
                <span className={`text-sm font-medium ${hayCreditoFiscal ? "text-blue-600" : "text-amber-600"}`}>
                  {hayCreditoFiscal 
                    ? (isEs ? "Crédito Fiscal" : "Tax Credit")
                    : (isEs ? "ITBIS a Pagar" : "ITBIS to Pay")
                  }
                </span>
              </div>
              <p className={`text-3xl font-bold ${hayCreditoFiscal ? "text-blue-700" : "text-amber-700"}`}>
                {formatCurrency(Math.abs(itbisAPagar))}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {hayCreditoFiscal 
                  ? (isEs ? "A favor para próximo período" : "In favor for next period")
                  : (isEs ? "A declarar ante DGII" : "To declare to DGII")
                }
              </p>
            </div>
          </div>

          {/* Formula */}
          <div className="mt-4 p-3 bg-white rounded-lg text-center text-sm">
            <span className="text-emerald-600 font-medium">{formatCurrency(balance.itbis_cobrado || sales.itbis_cobrado)}</span>
            <span className="mx-2 text-muted-foreground">-</span>
            <span className="text-blue-600 font-medium">{formatCurrency(balance.itbis_pagado || purchases.itbis_pagado)}</span>
            <span className="mx-2 text-muted-foreground">=</span>
            <span className={`font-bold ${hayCreditoFiscal ? "text-blue-700" : "text-amber-700"}`}>
              {formatCurrency(itbisAPagar)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Detail */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-emerald-600" />
              {isEs ? "Ventas del Período" : "Period Sales"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">{isEs ? "Ventas Gravadas (18%)" : "Taxable Sales (18%)"}</span>
                <span className="font-medium">{formatCurrency(sales.total_gravado)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">{isEs ? "Ventas Exentas" : "Exempt Sales"}</span>
                <span className="font-medium">{formatCurrency(sales.total_exento)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">{isEs ? "Total Ventas" : "Total Sales"}</span>
                <span className="font-medium">{formatCurrency((sales.total_gravado || 0) + (sales.total_exento || 0))}</span>
              </div>
              <div className="flex justify-between items-center py-2 bg-emerald-50 px-2 rounded">
                <span className="text-sm font-medium text-emerald-700">{isEs ? "ITBIS Cobrado" : "ITBIS Collected"}</span>
                <span className="font-bold text-emerald-700">{formatCurrency(sales.itbis_cobrado)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 text-xs text-muted-foreground">
                <span>{isEs ? "Transacciones" : "Transactions"}</span>
                <span>{sales.transaction_count || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Purchases Detail */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="w-4 h-4 text-blue-600" />
              {isEs ? "Compras del Período" : "Period Purchases"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">{isEs ? "Compras Gravadas (18%)" : "Taxable Purchases (18%)"}</span>
                <span className="font-medium">{formatCurrency(purchases.total_gravado)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">{isEs ? "Compras Exentas" : "Exempt Purchases"}</span>
                <span className="font-medium">{formatCurrency(purchases.total_exento)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">{isEs ? "Total Compras" : "Total Purchases"}</span>
                <span className="font-medium">{formatCurrency((purchases.total_gravado || 0) + (purchases.total_exento || 0))}</span>
              </div>
              <div className="flex justify-between items-center py-2 bg-blue-50 px-2 rounded">
                <span className="text-sm font-medium text-blue-700">{isEs ? "ITBIS Pagado" : "ITBIS Paid"}</span>
                <span className="font-bold text-blue-700">{formatCurrency(purchases.itbis_pagado)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 text-xs text-muted-foreground">
                <span>{isEs ? "Transacciones" : "Transactions"}</span>
                <span>{purchases.transaction_count || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-3 justify-center">
            <Button 
              variant="outline" 
              onClick={() => {
                window.open(`${API}/api/finance/itbis/format-606?month=${month}&year=${year}`, '_blank');
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              {isEs ? "Descargar 606 (Compras)" : "Download 606 (Purchases)"}
            </Button>
            <Button 
              variant="outline"
              onClick={() => {
                window.open(`${API}/api/finance/itbis/format-607?month=${month}&year=${year}`, '_blank');
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              {isEs ? "Descargar 607 (Ventas)" : "Download 607 (Sales)"}
            </Button>
          </div>
          <p className="text-xs text-center text-muted-foreground mt-3">
            {isEs 
              ? "Formatos oficiales de DGII para declaración de ITBIS"
              : "Official DGII formats for ITBIS declaration"
            }
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
