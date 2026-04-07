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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Progress } from "../ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  RefreshCw, Download, TrendingUp, Users, Target, BarChart3,
  Calendar, UserCircle, ArrowUpRight, Trash2, AlertTriangle,
  Phone, Mail, MessageCircle, UserPlus, CheckCircle2, Settings2, Activity
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

export default function SalesReportSection() {
  const { language } = useLanguage();
  const isEs = language === "es";

  const [activeTab, setActiveTab] = useState("overview");
  const [reportData, setReportData] = useState({ owners: [], totals: {} });
  const [dailyData, setDailyData] = useState({ daily: [], owner_totals: [] });
  const [weeklyProgress, setWeeklyProgress] = useState({ progress: [], week_start: "", week_end: "" });
  const [salesGoals, setSalesGoals] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedOwner, setSelectedOwner] = useState("all");
  const [includeUnassigned, setIncludeUnassigned] = useState(true);

  // Goals dialog
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [goalForm, setGoalForm] = useState({
    owner_id: "",
    weekly_calls: 0,
    weekly_emails: 0,
    weekly_whatsapp: 0,
    weekly_new_leads: 0,
    weekly_conversions: 0,
    weekly_follow_ups: 0
  });

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

  const fetchDaily = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append("date_from", dateFrom);
      if (dateTo) params.append("date_to", dateTo);
      if (selectedOwner && selectedOwner !== "all") params.append("owner_id", selectedOwner);

      const res = await axios.get(`${API}/api/crm/reports/daily-activity?${params.toString()}`, { withCredentials: true });
      setDailyData(res.data);
    } catch (err) {
      console.error(err);
    }
  }, [dateFrom, dateTo, selectedOwner]);

  const fetchWeeklyProgress = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedOwner && selectedOwner !== "all") params.append("owner_id", selectedOwner);
      const res = await axios.get(`${API}/api/crm/reports/weekly-progress?${params.toString()}`, { withCredentials: true });
      setWeeklyProgress(res.data);
    } catch (err) {
      console.error(err);
    }
  }, [selectedOwner]);

  const fetchGoals = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/crm/sales-goals`, { withCredentials: true });
      setSalesGoals(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchReport();
    fetchDaily();
    fetchWeeklyProgress();
    fetchGoals();
  }, [fetchReport, fetchDaily, fetchWeeklyProgress, fetchGoals]);

  // Goals CRUD
  const handleSaveGoal = async () => {
    try {
      await axios.post(`${API}/api/crm/sales-goals`, goalForm, { withCredentials: true });
      toast.success(isEs ? "Meta guardada" : "Goal saved");
      setGoalDialogOpen(false);
      fetchGoals();
      fetchWeeklyProgress();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleDeleteGoal = async (ownerId) => {
    if (!window.confirm(isEs ? "¿Eliminar esta meta?" : "Delete this goal?")) return;
    try {
      await axios.delete(`${API}/api/crm/sales-goals/${ownerId}`, { withCredentials: true });
      toast.success(isEs ? "Meta eliminada" : "Goal deleted");
      fetchGoals();
      fetchWeeklyProgress();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const openGoalDialog = (existingGoal = null) => {
    if (existingGoal) {
      setGoalForm({
        owner_id: existingGoal.owner_id,
        weekly_calls: existingGoal.weekly_calls || 0,
        weekly_emails: existingGoal.weekly_emails || 0,
        weekly_whatsapp: existingGoal.weekly_whatsapp || 0,
        weekly_new_leads: existingGoal.weekly_new_leads || 0,
        weekly_conversions: existingGoal.weekly_conversions || 0,
        weekly_follow_ups: existingGoal.weekly_follow_ups || 0
      });
    } else {
      setGoalForm({
        owner_id: "",
        weekly_calls: 0,
        weekly_emails: 0,
        weekly_whatsapp: 0,
        weekly_new_leads: 0,
        weekly_conversions: 0,
        weekly_follow_ups: 0
      });
    }
    setGoalDialogOpen(true);
  };

  // Check if there are deleted users
  const hasDeletedUsers = reportData.owners?.some(o => o.is_deleted) || false;

  const handleCleanup = async () => {
    if (!window.confirm(isEs
      ? "¿Reasignar leads de usuarios eliminados a 'Sin Asignar'?"
      : "Reassign leads from deleted users to 'Unassigned'?")) return;
    try {
      const res = await axios.post(`${API}/api/crm/cleanup-orphaned-assignments`, null, { withCredentials: true });
      toast.success(`${res.data.message}`);
      fetchReport();
    } catch (err) {
      toast.error(isEs ? "Error al limpiar" : "Cleanup error");
    }
  };

  // Export CSV
  const handleExport = () => {
    const headers = [
      isEs ? "Vendedor" : "Owner", "Total",
      isEs ? "Nuevos" : "New", isEs ? "Trabajados" : "Worked",
      isEs ? "Contactados" : "Contacted", isEs ? "Interesados" : "Interested",
      isEs ? "Convertidos" : "Converted", "% Conv", "% Contacto"
    ];
    const rows = reportData.owners.map(o => [
      o.owner_name || "Sin Asignar", o.total_leads, o.nuevos, o.trabajados,
      o.contactados, o.interesados, o.convertidos, o.tasa_conversion, o.tasa_contacto
    ]);
    const t = reportData.totals;
    rows.push(["TOTAL", t.total_leads, t.nuevos, t.trabajados, t.contactados, t.interesados, t.convertidos, t.tasa_conversion, t.tasa_contacto]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales_report_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(isEs ? "Reporte exportado" : "Report exported");
  };

  const totals = reportData.totals || {};

  const getOwnerName = (ownerId) => {
    const m = teamMembers.find(t => t.user_id === ownerId);
    return m ? (m.name || m.email) : ownerId;
  };

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
            {isEs ? "Rendimiento, actividad diaria y metas semanales" : "Performance, daily activity & weekly goals"}
          </p>
        </div>
        <div className="flex gap-2">
          {hasDeletedUsers && (
            <Button variant="destructive" size="sm" onClick={handleCleanup}>
              <Trash2 className="w-4 h-4 mr-2" />
              {isEs ? "Limpiar" : "Cleanup"}
            </Button>
          )}
          <Button variant="outline" onClick={() => { fetchReport(); fetchDaily(); fetchWeeklyProgress(); }}>
            <RefreshCw className="w-4 h-4 mr-2" />
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            CSV
          </Button>
        </div>
      </div>

      {hasDeletedUsers && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <p className="text-sm text-amber-700">
            {isEs ? "Hay leads asignados a usuarios eliminados." : "There are leads assigned to deleted users."}
          </p>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{isEs ? "Desde" : "From"}</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-[150px]" data-testid="date-from-filter" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{isEs ? "Hasta" : "To"}</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-[150px]" data-testid="date-to-filter" />
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
                    <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="include-unassigned" checked={includeUnassigned} onCheckedChange={setIncludeUnassigned} data-testid="include-unassigned-toggle" />
              <Label htmlFor="include-unassigned" className="text-sm">{isEs ? "Sin asignar" : "Unassigned"}</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            {isEs ? "Resumen" : "Overview"}
          </TabsTrigger>
          <TabsTrigger value="daily" className="gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            {isEs ? "Actividad Diaria" : "Daily Activity"}
          </TabsTrigger>
          <TabsTrigger value="goals" className="gap-1.5">
            <Target className="w-3.5 h-3.5" />
            {isEs ? "Metas Semanales" : "Weekly Goals"}
          </TabsTrigger>
        </TabsList>

        {/* === OVERVIEW TAB === */}
        <TabsContent value="overview" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card><CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1"><Users className="w-5 h-5 text-blue-500" /><span className="text-sm text-muted-foreground">Total Leads</span></div>
              <div className="text-2xl font-bold">{totals.total_leads || 0}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1"><Target className="w-5 h-5 text-amber-500" /><span className="text-sm text-muted-foreground">{isEs ? "Trabajados" : "Worked"}</span></div>
              <div className="text-2xl font-bold">{totals.trabajados || 0}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1"><UserCircle className="w-5 h-5 text-purple-500" /><span className="text-sm text-muted-foreground">{isEs ? "Interesados" : "Interested"}</span></div>
              <div className="text-2xl font-bold text-purple-600">{totals.interesados || 0}</div>
            </CardContent></Card>
            <Card className="bg-green-50 border-green-200"><CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1"><ArrowUpRight className="w-5 h-5 text-green-600" /><span className="text-sm text-green-700">{isEs ? "Convertidos" : "Converted"}</span></div>
              <div className="text-2xl font-bold text-green-700">{totals.convertidos || 0}</div>
            </CardContent></Card>
            <Card className="bg-blue-50 border-blue-200"><CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-5 h-5 text-blue-600" /><span className="text-sm text-blue-700">% Conv</span></div>
              <div className="text-2xl font-bold text-blue-700">{totals.tasa_conversion || 0}%</div>
            </CardContent></Card>
          </div>

          {/* Owners Table */}
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
                    <TableHead className="text-center">% Conv</TableHead>
                    <TableHead className="text-center">% Contacto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.owners.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                        <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>{isEs ? "No hay datos" : "No data"}</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {reportData.owners.map((owner, idx) => (
                        <TableRow key={owner.owner_id || `u-${idx}`} className={`${!owner.owner_id ? "bg-yellow-50/50" : ""} ${owner.is_deleted ? "bg-red-50/50" : ""}`} data-testid={`owner-row-${owner.owner_id || 'unassigned'}`}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <UserCircle className={`w-4 h-4 ${owner.is_deleted ? 'text-red-500' : owner.owner_id ? 'text-primary' : 'text-yellow-500'}`} />
                              <span className={owner.is_deleted ? "text-red-600 line-through" : ""}>{owner.owner_name || (isEs ? "Sin Asignar" : "Unassigned")}</span>
                              {owner.is_deleted && <Badge variant="destructive" className="text-xs">{isEs ? "Eliminado" : "Deleted"}</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-medium">{owner.total_leads}</TableCell>
                          <TableCell className="text-center">{owner.nuevos}</TableCell>
                          <TableCell className="text-center">{owner.trabajados}</TableCell>
                          <TableCell className="text-center">{owner.contactados}</TableCell>
                          <TableCell className="text-center"><Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">{owner.interesados}</Badge></TableCell>
                          <TableCell className="text-center"><Badge className="bg-green-100 text-green-700">{owner.convertidos}</Badge></TableCell>
                          <TableCell className="text-center"><span className={`font-medium ${owner.tasa_conversion >= 10 ? 'text-green-600' : owner.tasa_conversion > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>{owner.tasa_conversion}%</span></TableCell>
                          <TableCell className="text-center"><span className={owner.tasa_contacto >= 50 ? 'text-blue-600' : 'text-muted-foreground'}>{owner.tasa_contacto}%</span></TableCell>
                        </TableRow>
                      ))}
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
        </TabsContent>

        {/* === DAILY ACTIVITY TAB === */}
        <TabsContent value="daily" className="space-y-4">
          {/* Owner Totals Cards */}
          {dailyData.owner_totals && dailyData.owner_totals.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dailyData.owner_totals.filter(o => o.owner_id).map(ot => (
                <Card key={ot.owner_id} className="border-l-4 border-l-blue-500">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <UserCircle className="w-5 h-5 text-blue-500" />
                      <span className="font-semibold">{ot.owner_name}</span>
                      <Badge variant="secondary" className="ml-auto">{ot.active_days} {isEs ? "días activos" : "active days"}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-blue-50 rounded-lg p-2">
                        <Phone className="w-3.5 h-3.5 mx-auto mb-1 text-blue-600" />
                        <div className="text-lg font-bold text-blue-700">{ot.calls}</div>
                        <div className="text-[10px] text-muted-foreground">{isEs ? "Llamadas" : "Calls"}</div>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-2">
                        <Mail className="w-3.5 h-3.5 mx-auto mb-1 text-purple-600" />
                        <div className="text-lg font-bold text-purple-700">{ot.emails}</div>
                        <div className="text-[10px] text-muted-foreground">Emails</div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-2">
                        <MessageCircle className="w-3.5 h-3.5 mx-auto mb-1 text-green-600" />
                        <div className="text-lg font-bold text-green-700">{ot.whatsapp}</div>
                        <div className="text-[10px] text-muted-foreground">WhatsApp</div>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-2">
                        <UserPlus className="w-3.5 h-3.5 mx-auto mb-1 text-amber-600" />
                        <div className="text-lg font-bold text-amber-700">{ot.new_leads}</div>
                        <div className="text-[10px] text-muted-foreground">{isEs ? "Nuevos" : "New"}</div>
                      </div>
                      <div className="bg-emerald-50 rounded-lg p-2">
                        <CheckCircle2 className="w-3.5 h-3.5 mx-auto mb-1 text-emerald-600" />
                        <div className="text-lg font-bold text-emerald-700">{ot.conversions}</div>
                        <div className="text-[10px] text-muted-foreground">{isEs ? "Conv." : "Conv."}</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2">
                        <Activity className="w-3.5 h-3.5 mx-auto mb-1 text-gray-600" />
                        <div className="text-lg font-bold text-gray-700">{ot.total_activities}</div>
                        <div className="text-[10px] text-muted-foreground">Total</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Daily Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {isEs ? "Desglose Diario" : "Daily Breakdown"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                    <TableHead>{isEs ? "Vendedor" : "Owner"}</TableHead>
                    <TableHead className="text-center"><Phone className="w-3.5 h-3.5 mx-auto" /></TableHead>
                    <TableHead className="text-center"><Mail className="w-3.5 h-3.5 mx-auto" /></TableHead>
                    <TableHead className="text-center"><MessageCircle className="w-3.5 h-3.5 mx-auto" /></TableHead>
                    <TableHead className="text-center"><UserPlus className="w-3.5 h-3.5 mx-auto" /></TableHead>
                    <TableHead className="text-center"><CheckCircle2 className="w-3.5 h-3.5 mx-auto" /></TableHead>
                    <TableHead className="text-center">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyData.daily.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>{isEs ? "No hay actividad en este período" : "No activity in this period"}</p>
                        <p className="text-xs mt-1">{isEs ? "Selecciona un rango de fechas con datos" : "Select a date range with data"}</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    dailyData.daily.map((row, idx) => (
                      <TableRow key={`${row.date}-${row.owner_id}-${idx}`} className={row.total_activities === 0 ? "opacity-50" : ""}>
                        <TableCell className="font-medium text-sm">
                          {new Date(row.date + "T12:00:00").toLocaleDateString(isEs ? "es-ES" : "en-US", { weekday: "short", month: "short", day: "numeric" })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <UserCircle className={`w-3.5 h-3.5 ${row.owner_id ? 'text-primary' : 'text-yellow-500'}`} />
                            <span className="text-sm">{row.owner_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{row.calls > 0 ? <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{row.calls}</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
                        <TableCell className="text-center">{row.emails > 0 ? <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">{row.emails}</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
                        <TableCell className="text-center">{row.whatsapp > 0 ? <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{row.whatsapp}</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
                        <TableCell className="text-center">{row.new_leads > 0 ? <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{row.new_leads}</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
                        <TableCell className="text-center">{row.conversions > 0 ? <Badge className="bg-green-100 text-green-700">{row.conversions}</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
                        <TableCell className="text-center font-semibold">{row.total_activities}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === WEEKLY GOALS TAB === */}
        <TabsContent value="goals" className="space-y-4">
          {/* Week info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {isEs ? "Semana:" : "Week:"} {weeklyProgress.week_start && new Date(weeklyProgress.week_start + "T12:00:00").toLocaleDateString(isEs ? "es-ES" : "en-US", { month: "short", day: "numeric" })} — {weeklyProgress.week_end && new Date(weeklyProgress.week_end + "T12:00:00").toLocaleDateString(isEs ? "es-ES" : "en-US", { month: "short", day: "numeric" })}
              </span>
            </div>
            <Button size="sm" onClick={() => openGoalDialog()} data-testid="add-sales-goal-btn">
              <Settings2 className="w-4 h-4 mr-1.5" />
              {isEs ? "Configurar Meta" : "Set Goal"}
            </Button>
          </div>

          {/* Goals cards */}
          {salesGoals.length === 0 && weeklyProgress.progress.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">{isEs ? "No hay metas configuradas" : "No goals configured"}</p>
                <p className="text-sm mt-1">{isEs ? "Configura metas semanales para tus vendedores" : "Set weekly goals for your salespeople"}</p>
                <Button className="mt-4" size="sm" onClick={() => openGoalDialog()}>
                  <Target className="w-4 h-4 mr-1.5" />
                  {isEs ? "Crear Primera Meta" : "Create First Goal"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {weeklyProgress.progress.map(p => {
                const goal = salesGoals.find(g => g.owner_id === p.owner_id);
                return (
                  <Card key={p.owner_id} className={`${p.overall_percentage >= 100 ? 'border-green-300 bg-green-50/30' : p.overall_percentage >= 60 ? 'border-blue-200' : ''}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <UserCircle className="w-5 h-5 text-primary" />
                          <span className="font-semibold">{p.owner_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {p.has_goals && (
                            <Badge className={p.overall_percentage >= 100 ? 'bg-green-100 text-green-700' : p.overall_percentage >= 60 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}>
                              {p.overall_percentage}%
                            </Badge>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openGoalDialog(goal)} data-testid={`edit-goal-${p.owner_id}`}>
                            <Settings2 className="w-3.5 h-3.5" />
                          </Button>
                          {goal && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => handleDeleteGoal(p.owner_id)} data-testid={`delete-goal-${p.owner_id}`}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {p.has_goals && p.metrics.length > 0 ? (
                        <div className="space-y-3">
                          {p.metrics.map(m => (
                            <div key={m.label}>
                              <div className="flex items-center justify-between text-sm mb-1">
                                <span className="text-muted-foreground">{m.label}</span>
                                <span className="font-medium">{m.actual} / {m.goal}</span>
                              </div>
                              <Progress value={Math.min(m.percentage, 100)} className="h-2" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          {isEs ? "Sin metas configuradas. Haz clic en el engranaje para agregar." : "No goals set. Click gear to add."}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              {/* Show goals for owners not in progress (no activity this week) */}
              {salesGoals.filter(g => !weeklyProgress.progress.find(p => p.owner_id === g.owner_id)).map(goal => (
                <Card key={goal.owner_id} className="opacity-70">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <UserCircle className="w-5 h-5 text-muted-foreground" />
                        <span className="font-semibold">{getOwnerName(goal.owner_id)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">0%</Badge>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openGoalDialog(goal)}>
                          <Settings2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDeleteGoal(goal.owner_id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground text-center py-2">
                      {isEs ? "Sin actividad esta semana" : "No activity this week"}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Goal Configuration Dialog */}
      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="goal-config-dialog">
          <DialogHeader>
            <DialogTitle>{isEs ? "Configurar Meta Semanal" : "Configure Weekly Goal"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Vendedor" : "Salesperson"}</Label>
              <Select value={goalForm.owner_id} onValueChange={v => setGoalForm({ ...goalForm, owner_id: v })}>
                <SelectTrigger data-testid="goal-owner-select">
                  <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map(u => (
                    <SelectItem key={u.user_id} value={u.user_id}>{u.name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="flex items-center gap-1.5 text-sm"><Phone className="w-3.5 h-3.5" /> {isEs ? "Llamadas / sem" : "Calls / week"}</Label>
                <Input type="number" min={0} value={goalForm.weekly_calls} onChange={e => setGoalForm({ ...goalForm, weekly_calls: parseInt(e.target.value) || 0 })} data-testid="goal-calls-input" />
              </div>
              <div>
                <Label className="flex items-center gap-1.5 text-sm"><Mail className="w-3.5 h-3.5" /> Emails / {isEs ? "sem" : "week"}</Label>
                <Input type="number" min={0} value={goalForm.weekly_emails} onChange={e => setGoalForm({ ...goalForm, weekly_emails: parseInt(e.target.value) || 0 })} data-testid="goal-emails-input" />
              </div>
              <div>
                <Label className="flex items-center gap-1.5 text-sm"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp / {isEs ? "sem" : "week"}</Label>
                <Input type="number" min={0} value={goalForm.weekly_whatsapp} onChange={e => setGoalForm({ ...goalForm, weekly_whatsapp: parseInt(e.target.value) || 0 })} data-testid="goal-whatsapp-input" />
              </div>
              <div>
                <Label className="flex items-center gap-1.5 text-sm"><UserPlus className="w-3.5 h-3.5" /> {isEs ? "Leads nuevos / sem" : "New leads / week"}</Label>
                <Input type="number" min={0} value={goalForm.weekly_new_leads} onChange={e => setGoalForm({ ...goalForm, weekly_new_leads: parseInt(e.target.value) || 0 })} data-testid="goal-leads-input" />
              </div>
              <div>
                <Label className="flex items-center gap-1.5 text-sm"><CheckCircle2 className="w-3.5 h-3.5" /> {isEs ? "Conversiones / sem" : "Conversions / week"}</Label>
                <Input type="number" min={0} value={goalForm.weekly_conversions} onChange={e => setGoalForm({ ...goalForm, weekly_conversions: parseInt(e.target.value) || 0 })} data-testid="goal-conversions-input" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleSaveGoal} disabled={!goalForm.owner_id} data-testid="save-goal-btn">
              {isEs ? "Guardar Meta" : "Save Goal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
