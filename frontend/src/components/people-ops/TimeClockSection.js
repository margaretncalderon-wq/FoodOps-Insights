// components/people-ops/TimeClockSection.js
// Reloj checador: clock in/out + weekly summary + admin overview.

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import {
  Clock, Play, Square, Plus, RefreshCw, AlertTriangle,
  CheckCircle, Users, Edit2, Trash2
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const fmtTime = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
};
const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("es-DO"); } catch { return "—"; }
};
const fmtHours = (mins) => mins == null ? "—" : `${(mins / 60).toFixed(2)}h`;

export function TimeClockSection() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const isEs = language === "es";
  const isAdmin = user && ["owner", "admin", "hr"].includes(user.role);
  
  const [tab, setTab] = useState(isAdmin ? "admin" : "personal");
  const [current, setCurrent] = useState(null);
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualData, setManualData] = useState({ employee_id: "", clock_in: "", clock_out: "", notes: "" });
  
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const reqs = [
        axios.get(`${API}/api/people-ops/time-clock/current`, { withCredentials: true }).catch(() => ({ data: null })),
        axios.get(`${API}/api/people-ops/time-clock/entries`, { withCredentials: true }).catch(() => ({ data: [] })),
      ];
      if (isAdmin) {
        reqs.push(axios.get(`${API}/api/people-ops/time-clock/weekly-summary`, { withCredentials: true }).catch(() => ({ data: null })));
        reqs.push(axios.get(`${API}/api/people-ops/employees`, { withCredentials: true }).catch(() => ({ data: [] })));
      }
      const results = await Promise.all(reqs);
      setCurrent(results[0].data);
      setEntries(results[1].data || []);
      if (isAdmin) {
        setSummary(results[2].data);
        setEmployees((results[3].data || []).filter((e) => e.status === "active"));
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [isAdmin]);
  
  useEffect(() => { fetchAll(); }, [fetchAll]);
  
  const handleClockIn = async () => {
    try {
      await axios.post(`${API}/api/people-ops/time-clock/clock-in`, {}, { withCredentials: true });
      await fetchAll();
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };
  
  const handleClockOut = async () => {
    try {
      await axios.post(`${API}/api/people-ops/time-clock/clock-out`, {}, { withCredentials: true });
      await fetchAll();
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };
  
  const handleManualSubmit = async () => {
    try {
      await axios.post(
        `${API}/api/people-ops/time-clock/manual-entry`,
        {
          ...manualData,
          clock_in: manualData.clock_in ? new Date(manualData.clock_in).toISOString() : "",
          clock_out: manualData.clock_out ? new Date(manualData.clock_out).toISOString() : "",
        },
        { withCredentials: true }
      );
      setManualOpen(false);
      setManualData({ employee_id: "", clock_in: "", clock_out: "", notes: "" });
      await fetchAll();
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };
  
  const handleDelete = async (entry_id) => {
    if (!window.confirm(isEs ? "¿Eliminar esta entrada?" : "Delete this entry?")) return;
    try {
      await axios.delete(`${API}/api/people-ops/time-clock/entries/${entry_id}`, { withCredentials: true });
      await fetchAll();
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };
  
  const activeShift = current?.active_shift;
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    if (!activeShift) return;
    const id = setInterval(() => setNowTick(Date.now()), 60000); // tick every minute
    return () => clearInterval(id);
  }, [activeShift]);
  const liveDuration = activeShift
    ? Math.round((nowTick - new Date(activeShift.clock_in).getTime()) / 60000)
    : 0;
  
  return (
    <div className="space-y-6" data-testid="time-clock-section">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Clock className="w-5 h-5 text-violet-600" />
            {isEs ? "Reloj Checador" : "Time Clock"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isEs ? "Control de entrada/salida diaria de empleados." : "Daily clock in/out for employees."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll}><RefreshCw className="w-4 h-4" /></Button>
      </div>
      
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="personal" data-testid="tab-personal">
            {isEs ? "Mi reloj" : "My Clock"}
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="admin" data-testid="tab-admin">
              {isEs ? "Resumen Semanal" : "Weekly Summary"}
            </TabsTrigger>
          )}
        </TabsList>
        
        {/* ===== Personal Clock ===== */}
        <TabsContent value="personal" className="space-y-4">
          <Card>
            <CardContent className="py-8 text-center">
              {activeShift ? (
                <>
                  <Badge className="bg-emerald-100 text-emerald-700 mb-3"><CheckCircle className="w-3 h-3 mr-1" />{isEs ? "Activo" : "Active"}</Badge>
                  <p className="text-sm text-muted-foreground">{isEs ? "Entrada:" : "Clocked in at:"}</p>
                  <p className="text-3xl font-bold">{fmtTime(activeShift.clock_in)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {fmtDate(activeShift.clock_in)} · {Math.floor(liveDuration / 60)}h {liveDuration % 60}m
                  </p>
                  <Button onClick={handleClockOut} size="lg" className="mt-4 bg-rose-600 hover:bg-rose-700" data-testid="clock-out-btn">
                    <Square className="w-4 h-4 mr-2" />
                    {isEs ? "Marcar Salida" : "Clock Out"}
                  </Button>
                </>
              ) : (
                <>
                  <Clock className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {isEs ? "Sin turno activo" : "No active shift"}
                  </p>
                  <Button onClick={handleClockIn} size="lg" className="mt-4" data-testid="clock-in-btn">
                    <Play className="w-4 h-4 mr-2" />
                    {isEs ? "Marcar Entrada" : "Clock In"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{isEs ? "Mis últimas marcaciones" : "My recent entries"}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                    <TableHead>{isEs ? "Entrada" : "Clock In"}</TableHead>
                    <TableHead>{isEs ? "Salida" : "Clock Out"}</TableHead>
                    <TableHead className="text-right">{isEs ? "Total" : "Total"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-6"><RefreshCw className="w-4 h-4 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : entries.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">{isEs ? "Sin marcaciones aún" : "No entries yet"}</TableCell></TableRow>
                  ) : (
                    entries.slice(0, 20).map((e) => (
                      <TableRow key={e.entry_id}>
                        <TableCell>{e.work_date}</TableCell>
                        <TableCell>{fmtTime(e.clock_in)}</TableCell>
                        <TableCell>{fmtTime(e.clock_out)}</TableCell>
                        <TableCell className="text-right font-medium">{fmtHours(e.total_minutes)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* ===== Admin Weekly Summary ===== */}
        {isAdmin && (
          <TabsContent value="admin" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setManualOpen(true)} data-testid="manual-entry-btn">
                <Plus className="w-4 h-4 mr-2" />
                {isEs ? "Entrada Manual" : "Manual Entry"}
              </Button>
            </div>
            
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-md bg-violet-50 border border-violet-100">
                  <p className="text-xs text-violet-700">{isEs ? "Empleados" : "Employees"}</p>
                  <p className="text-2xl font-bold text-violet-900">{summary.totals?.employees || 0}</p>
                </div>
                <div className="p-3 rounded-md bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-700">{isEs ? "Horas totales" : "Total hours"}</p>
                  <p className="text-2xl font-bold text-blue-900">{summary.totals?.total_hours || 0}h</p>
                </div>
                <div className="p-3 rounded-md bg-amber-50 border border-amber-100">
                  <p className="text-xs text-amber-700">{isEs ? "Con OT" : "With OT"}</p>
                  <p className="text-2xl font-bold text-amber-900">{summary.totals?.employees_with_ot || 0}</p>
                </div>
                <div className="p-3 rounded-md bg-rose-50 border border-rose-200">
                  <p className="text-xs text-rose-700">{isEs ? "Excede cap legal (68h)" : "Legal cap breach (68h)"}</p>
                  <p className="text-2xl font-bold text-rose-900" data-testid="legal-cap-count">{summary.totals?.employees_breaching_legal_cap || 0}</p>
                </div>
              </div>
            )}
            
            {summary && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {isEs ? `Semana ${summary.week_start} → ${summary.week_end}` : `Week ${summary.week_start} → ${summary.week_end}`}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{isEs ? "Empleado" : "Employee"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Días" : "Days"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Horas" : "Hours"}</TableHead>
                        <TableHead className="text-right">{isEs ? "Regular" : "Regular"}</TableHead>
                        <TableHead className="text-right">{isEs ? "OT" : "OT"}</TableHead>
                        <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(summary.rows || []).length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">{isEs ? "Sin marcaciones esta semana" : "No entries this week"}</TableCell></TableRow>
                      )}
                      {(summary.rows || []).map((r) => (
                        <TableRow key={r.employee_id} data-testid={`summary-${r.employee_id}`}>
                          <TableCell className="font-medium">{r.employee_name}</TableCell>
                          <TableCell className="text-right">{r.days_worked}</TableCell>
                          <TableCell className="text-right font-medium">{r.total_hours}h</TableCell>
                          <TableCell className="text-right text-muted-foreground">{r.weekly_hours_regular}h</TableCell>
                          <TableCell className="text-right">{r.ot_hours ? <span className="text-amber-700">{r.ot_hours}h</span> : "—"}</TableCell>
                          <TableCell>
                            {r.legal_cap_breach ? (
                              <Badge className="bg-rose-100 text-rose-700"><AlertTriangle className="w-3 h-3 mr-1" />{isEs ? "Excede 68h" : ">68h"}</Badge>
                            ) : r.ot_breach ? (
                              <Badge className="bg-amber-100 text-amber-700">OT</Badge>
                            ) : (
                              <Badge variant="outline">OK</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
            
            {/* All entries for admin review */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{isEs ? "Todas las marcaciones" : "All entries"}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isEs ? "Empleado" : "Employee"}</TableHead>
                      <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                      <TableHead>{isEs ? "Entrada" : "In"}</TableHead>
                      <TableHead>{isEs ? "Salida" : "Out"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Horas" : "Hours"}</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.slice(0, 50).map((e) => (
                      <TableRow key={e.entry_id}>
                        <TableCell>{e.employee_name}</TableCell>
                        <TableCell>{e.work_date}</TableCell>
                        <TableCell>{fmtTime(e.clock_in)}</TableCell>
                        <TableCell>{fmtTime(e.clock_out)}</TableCell>
                        <TableCell className="text-right">{fmtHours(e.total_minutes)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleDelete(e.entry_id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
      
      {/* Manual Entry Dialog */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEs ? "Entrada Manual" : "Manual Entry"}</DialogTitle>
            <DialogDescription>
              {isEs ? "Agregar marcación retroactiva (cuando el empleado olvidó marcar)." : "Add a retroactive entry."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">{isEs ? "Empleado *" : "Employee *"}</label>
              <Select value={manualData.employee_id} onValueChange={(v) => setManualData({ ...manualData, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (<SelectItem key={e.employee_id} value={e.employee_id}>{e.full_name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{isEs ? "Entrada *" : "Clock In *"}</label>
                <Input type="datetime-local" value={manualData.clock_in} onChange={(e) => setManualData({ ...manualData, clock_in: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Salida *" : "Clock Out *"}</label>
                <Input type="datetime-local" value={manualData.clock_out} onChange={(e) => setManualData({ ...manualData, clock_out: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{isEs ? "Notas" : "Notes"}</label>
              <Input value={manualData.notes} onChange={(e) => setManualData({ ...manualData, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleManualSubmit}>{isEs ? "Guardar" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TimeClockSection;
