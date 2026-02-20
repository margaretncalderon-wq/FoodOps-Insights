import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { 
  RefreshCw, Download, TrendingUp, Users, Target, BarChart3,
  Calendar, UserCircle, ArrowUpRight, ArrowDownRight
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

export default function SalesReportSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [reportData, setReportData] = useState({ owners: [], totals: {} });
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedOwner, setSelectedOwner] = useState("all");
  const [includeUnassigned, setIncludeUnassigned] = useState(true);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append("date_from", dateFrom);
      if (dateTo) params.append("date_to", dateTo);
      if (selectedOwner && selectedOwner !== "all") params.append("owner_id", selectedOwner);
      params.append("include_unassigned", includeUnassigned.toString());
      
      const [reportRes, teamRes] = await Promise.all([
        axios.get(`${API}/api/crm/reports/owners?${params.toString()}`, { withCredentials: true }),
        axios.get(`${API}/api/crm/team-members`, { withCredentials: true })
      ]);
      
      setReportData(reportRes.data);
      setTeamMembers(teamRes.data || []);
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error cargando reporte" : "Error loading report");
    }
    setLoading(false);
  }, [dateFrom, dateTo, selectedOwner, includeUnassigned, isEs]);

  useEffect(() => { 
    fetchReport(); 
  }, [fetchReport]);

  // Export to CSV
  const handleExport = () => {
    const headers = [
      isEs ? "Vendedor" : "Owner",
      "Total",
      isEs ? "Nuevos" : "New",
      isEs ? "Trabajados" : "Worked",
      isEs ? "Contactados" : "Contacted",
      isEs ? "Sin Respuesta" : "No Response",
      isEs ? "Interesados" : "Interested",
      isEs ? "Convertidos" : "Converted",
      isEs ? "% Conversión" : "% Conversion",
      isEs ? "% Contacto" : "% Contact"
    ];
    
    const rows = reportData.owners.map(o => [
      o.owner_name || (isEs ? "Sin Asignar" : "Unassigned"),
      o.total_leads,
      o.nuevos,
      o.trabajados,
      o.contactados,
      o.sin_respuesta,
      o.interesados,
      o.convertidos,
      o.tasa_conversion,
      o.tasa_contacto
    ]);
    
    // Add totals row
    const t = reportData.totals;
    rows.push([
      "TOTAL",
      t.total_leads,
      t.nuevos,
      t.trabajados,
      t.contactados,
      t.sin_respuesta,
      t.interesados,
      t.convertidos,
      t.tasa_conversion,
      t.tasa_contacto
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sales_report_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    
    toast.success(isEs ? "Reporte exportado" : "Report exported");
  };

  const totals = reportData.totals || {};

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="sales-report-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            {isEs ? "Reporte de Ventas" : "Sales Report"}
          </h2>
          <p className="text-muted-foreground text-sm">
            {isEs ? "Rendimiento de vendedores y conversión de leads" : "Sales team performance and lead conversion"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchReport}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {isEs ? "Actualizar" : "Refresh"}
          </Button>
          <Button onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            {isEs ? "Exportar CSV" : "Export CSV"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-5 h-5 text-blue-500" />
              <span className="text-sm text-muted-foreground">{isEs ? "Total Leads" : "Total Leads"}</span>
            </div>
            <div className="text-2xl font-bold">{totals.total_leads || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-5 h-5 text-amber-500" />
              <span className="text-sm text-muted-foreground">{isEs ? "Trabajados" : "Worked"}</span>
            </div>
            <div className="text-2xl font-bold">{totals.trabajados || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <UserCircle className="w-5 h-5 text-purple-500" />
              <span className="text-sm text-muted-foreground">{isEs ? "Interesados" : "Interested"}</span>
            </div>
            <div className="text-2xl font-bold text-purple-600">{totals.interesados || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpRight className="w-5 h-5 text-green-600" />
              <span className="text-sm text-green-700">{isEs ? "Convertidos" : "Converted"}</span>
            </div>
            <div className="text-2xl font-bold text-green-700">{totals.convertidos || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-blue-700">{isEs ? "% Conversión" : "% Conversion"}</span>
            </div>
            <div className="text-2xl font-bold text-blue-700">{totals.tasa_conversion || 0}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{isEs ? "Desde" : "From"}</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[150px]"
                data-testid="date-from-filter"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{isEs ? "Hasta" : "To"}</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[150px]"
                data-testid="date-to-filter"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{isEs ? "Vendedor" : "Owner"}</Label>
              <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                <SelectTrigger className="w-[180px]" data-testid="owner-filter">
                  <SelectValue placeholder={isEs ? "Todos" : "All"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
                  {teamMembers.map(u => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="include-unassigned"
                checked={includeUnassigned}
                onCheckedChange={setIncludeUnassigned}
                data-testid="include-unassigned-toggle"
              />
              <Label htmlFor="include-unassigned" className="text-sm">
                {isEs ? "Incluir sin asignar" : "Include unassigned"}
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">{isEs ? "Vendedor" : "Owner"}</TableHead>
                <TableHead className="text-center">Total</TableHead>
                <TableHead className="text-center">{isEs ? "Nuevos" : "New"}</TableHead>
                <TableHead className="text-center">{isEs ? "Trabajados" : "Worked"}</TableHead>
                <TableHead className="text-center">{isEs ? "Contactados" : "Contacted"}</TableHead>
                <TableHead className="text-center">{isEs ? "Interesados" : "Interested"}</TableHead>
                <TableHead className="text-center">{isEs ? "Convertidos" : "Converted"}</TableHead>
                <TableHead className="text-center">{isEs ? "% Conv" : "% Conv"}</TableHead>
                <TableHead className="text-center">{isEs ? "% Contacto" : "% Contact"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportData.owners.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>{isEs ? "No hay datos para mostrar" : "No data to display"}</p>
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {reportData.owners.map((owner, idx) => (
                    <TableRow 
                      key={owner.owner_id || `unassigned-${idx}`}
                      className={!owner.owner_id ? "bg-yellow-50/50" : ""}
                      data-testid={`owner-row-${owner.owner_id || 'unassigned'}`}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <UserCircle className={`w-4 h-4 ${owner.owner_id ? 'text-primary' : 'text-yellow-500'}`} />
                          {owner.owner_name || (isEs ? "Sin Asignar" : "Unassigned")}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-medium">{owner.total_leads}</TableCell>
                      <TableCell className="text-center">{owner.nuevos}</TableCell>
                      <TableCell className="text-center">{owner.trabajados}</TableCell>
                      <TableCell className="text-center">{owner.contactados}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                          {owner.interesados}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-green-100 text-green-700">
                          {owner.convertidos}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`font-medium ${owner.tasa_conversion >= 10 ? 'text-green-600' : owner.tasa_conversion > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {owner.tasa_conversion}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`${owner.tasa_contacto >= 50 ? 'text-blue-600' : 'text-muted-foreground'}`}>
                          {owner.tasa_contacto}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals Row */}
                  <TableRow className="bg-muted/70 font-semibold border-t-2">
                    <TableCell className="font-bold">TOTAL</TableCell>
                    <TableCell className="text-center font-bold">{totals.total_leads}</TableCell>
                    <TableCell className="text-center">{totals.nuevos}</TableCell>
                    <TableCell className="text-center">{totals.trabajados}</TableCell>
                    <TableCell className="text-center">{totals.contactados}</TableCell>
                    <TableCell className="text-center">{totals.interesados}</TableCell>
                    <TableCell className="text-center font-bold text-green-700">{totals.convertidos}</TableCell>
                    <TableCell className="text-center font-bold text-blue-700">{totals.tasa_conversion}%</TableCell>
                    <TableCell className="text-center">{totals.tasa_contacto}%</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
