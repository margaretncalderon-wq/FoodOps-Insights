import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Progress } from "../ui/progress";
import {
  TrendingUp, TrendingDown, RefreshCw, Users, Target, Zap,
  DollarSign, BarChart3, ArrowUpRight, ArrowDownRight, Building2
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function MarketingROISection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API}/api/business-clarity/marketing-roi`;
      const params = new URLSearchParams();
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      if (params.toString()) url += `?${params.toString()}`;
      
      const res = await axios.get(url, { withCredentials: true });
      setData(res.data);
    } catch (err) {
      console.error("Error fetching marketing ROI:", err);
    }
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const summary = data?.summary || {};
  const costCenter = data?.cost_center || {};
  const activations = data?.activation_breakdown || [];
  const recentLeads = data?.recent_attributed_leads || [];

  const roiColor = summary.roi_percentage >= 0 ? "text-emerald-600" : "text-red-600";
  const roiIcon = summary.roi_percentage >= 0 ? ArrowUpRight : ArrowDownRight;
  const ROIIcon = roiIcon;

  return (
    <div className="space-y-6" data-testid="marketing-roi-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-purple-600" />
            {isEs ? "ROI de Marketing Interno" : "Internal Marketing ROI"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs 
              ? "Rastrea la inversión en marketing propio y su retorno"
              : "Track internal marketing investment and returns"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {isEs ? "Actualizar" : "Refresh"}
        </Button>
      </div>

      {/* Date Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{isEs ? "Desde:" : "From:"}</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{isEs ? "Hasta:" : "To:"}</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
              />
            </div>
            {(startDate || endDate) && (
              <Button variant="ghost" size="sm" onClick={() => { setStartDate(""); setEndDate(""); }}>
                {isEs ? "Limpiar" : "Clear"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Investment */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <DollarSign className="w-4 h-4" />
              {isEs ? "Inversión Total" : "Total Investment"}
            </div>
            <p className="text-2xl font-bold mt-1">{formatCurrency(summary.total_cost)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {isEs ? "Activaciones + Eventos" : "Activations + Events"}
            </p>
          </CardContent>
        </Card>

        {/* ROI */}
        <Card className={summary.roi_percentage >= 0 ? "border-emerald-200 bg-emerald-50/30" : "border-red-200 bg-red-50/30"}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <TrendingUp className="w-4 h-4" />
              ROI
            </div>
            <div className="flex items-center gap-2 mt-1">
              <p className={`text-2xl font-bold ${roiColor}`}>
                {summary.roi_percentage > 0 ? "+" : ""}{summary.roi_percentage?.toFixed(1)}%
              </p>
              <ROIIcon className={`w-5 h-5 ${roiColor}`} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isEs ? "Retorno sobre inversión" : "Return on investment"}
            </p>
          </CardContent>
        </Card>

        {/* Leads Generated */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="w-4 h-4" />
              {isEs ? "Leads Generados" : "Leads Generated"}
            </div>
            <p className="text-2xl font-bold mt-1">{summary.total_leads_generated || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {isEs ? "Costo/Lead:" : "Cost/Lead:"} {formatCurrency(summary.cost_per_lead)}
            </p>
          </CardContent>
        </Card>

        {/* Conversions */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Target className="w-4 h-4" />
              {isEs ? "Conversiones" : "Conversions"}
            </div>
            <p className="text-2xl font-bold mt-1">{summary.total_conversions || 0}</p>
            <div className="flex items-center gap-2 mt-1">
              <Progress 
                value={summary.conversion_rate || 0} 
                className="h-1.5 flex-1" 
              />
              <span className="text-xs text-muted-foreground">{summary.conversion_rate?.toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue & Cost Center */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Revenue Generated */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              {isEs ? "Ingresos Generados" : "Revenue Generated"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">
              {formatCurrency(summary.revenue_from_conversions)}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {isEs 
                ? `De ${summary.total_conversions || 0} conversiones`
                : `From ${summary.total_conversions || 0} conversions`}
            </p>
            <div className="mt-3 pt-3 border-t space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{isEs ? "Costo/Conversión:" : "Cost/Conversion:"}</span>
                <span className="font-medium">{formatCurrency(summary.cost_per_conversion)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cost Center Info */}
        <Card className="border-purple-200 bg-purple-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-purple-600" />
              Cost Center
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium text-purple-900">{costCenter.name || "Marketing Interno"}</p>
            <div className="mt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{isEs ? "Eventos Internos:" : "Internal Events:"}</span>
                <span className="font-medium">{costCenter.total_events || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{isEs ? "Costo Eventos:" : "Events Cost:"}</span>
                <span className="font-medium">{formatCurrency(summary.total_internal_events_cost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{isEs ? "Costo Activaciones:" : "Activations Cost:"}</span>
                <span className="font-medium">{formatCurrency(summary.total_investment)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activation Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            {isEs ? "Rendimiento por Activación" : "Performance by Activation"}
          </CardTitle>
          <CardDescription>
            {isEs 
              ? "Análisis detallado de cada activación de marketing"
              : "Detailed analysis of each marketing activation"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activations.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {isEs ? "No hay activaciones registradas" : "No activations recorded"}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Activación" : "Activation"}</TableHead>
                  <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Presupuesto" : "Budget"}</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">{isEs ? "Conv." : "Conv."}</TableHead>
                  <TableHead className="text-right">{isEs ? "Tasa" : "Rate"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Ingresos" : "Revenue"}</TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activations.map((act) => (
                  <TableRow key={act.activation_id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{act.name}</p>
                        {act.campaign_name && (
                          <p className="text-xs text-muted-foreground">{act.campaign_name}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {act.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(act.budget)}</TableCell>
                    <TableCell className="text-right">{act.leads_generated}</TableCell>
                    <TableCell className="text-right">{act.conversions}</TableCell>
                    <TableCell className="text-right">{act.conversion_rate?.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">{formatCurrency(act.revenue_generated)}</TableCell>
                    <TableCell className="text-right">
                      <span className={act.roi >= 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                        {act.roi > 0 ? "+" : ""}{act.roi?.toFixed(1)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Attributed Leads */}
      {recentLeads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              {isEs ? "Leads Atribuidos Recientes" : "Recent Attributed Leads"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                  <TableHead>{isEs ? "Fuente" : "Source"}</TableHead>
                  <TableHead>{isEs ? "Activación" : "Activation"}</TableHead>
                  <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                  <TableHead>{isEs ? "Convertido" : "Converted"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLeads.map((lead) => (
                  <TableRow key={lead.lead_id}>
                    <TableCell className="font-medium">{lead.lead_name}</TableCell>
                    <TableCell>{lead.source}</TableCell>
                    <TableCell>{lead.activation_name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={lead.status === "Converted" ? "default" : "outline"} className="text-xs">
                        {lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {lead.converted ? (
                        <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                          {isEs ? "Sí" : "Yes"}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tips */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="py-4">
          <p className="text-sm text-blue-800">
            <strong>{isEs ? "Tip:" : "Tip:"}</strong>{" "}
            {isEs 
              ? "Para atribuir leads a activaciones, asegúrate de que el campo 'Fuente' del lead coincida con el nombre de la activación, o vincula directamente el lead a una activación desde el formulario de lead."
              : "To attribute leads to activations, ensure the lead's 'Source' field matches the activation name, or directly link the lead to an activation from the lead form."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
