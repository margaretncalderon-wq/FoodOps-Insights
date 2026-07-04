import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { Badge } from "../../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../ui/dialog";
import { Plus, Trash2, Calendar, History } from "lucide-react";
import { API_BASE as API } from "../../../utils/api";
import ScheduleCalendar from "../ScheduleCalendar";

const DAYS = [
  { key: "monday", labelEs: "Lun", labelEn: "Mon" },
  { key: "tuesday", labelEs: "Mar", labelEn: "Tue" },
  { key: "wednesday", labelEs: "Mié", labelEn: "Wed" },
  { key: "thursday", labelEs: "Jue", labelEn: "Thu" },
  { key: "friday", labelEs: "Vie", labelEn: "Fri" },
  { key: "saturday", labelEs: "Sáb", labelEn: "Sat" },
  { key: "sunday", labelEs: "Dom", labelEn: "Sun" },
];

const emptyPattern = () => DAYS.reduce((acc, d) => {
  acc[d.key] = { work_hours: 0, start: "", end: "", break_min: 0 };
  return acc;
}, {});

export default function ScheduleTab({ employeeId, isEs = true }) {
  const [schedules, setSchedules] = useState([]);
  const [current, setCurrent] = useState(null);
  const [daysOff, setDaysOff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dayOffDialogOpen, setDayOffDialogOpen] = useState(false);
  const [dayOffForm, setDayOffForm] = useState({ date: new Date().toISOString().slice(0, 10), reason: "", category: "personal" });

  const [form, setForm] = useState({
    effective_from: new Date().toISOString().slice(0, 10),
    weekly_pattern: emptyPattern(),
    weekly_hours_threshold: 44,
    notes: "",
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const yearAgo = new Date(); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      const [scRes, currRes, dofRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/schedules/employee/${employeeId}`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/schedules/employee/${employeeId}/current`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/days-off/employee/${employeeId}?start_date=${yearAgo.toISOString().slice(0, 10)}&end_date=2099-12-31`, { withCredentials: true }),
      ]);
      setSchedules(scRes.data || []);
      setCurrent(currRes.data);
      setDaysOff(dofRes.data || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNewDialog = () => {
    // Always start from a normalized full-7-days pattern, then overlay current if exists.
    // This guarantees ALL day keys are present, so number inputs never see undefined.
    const basePattern = emptyPattern();
    const merged = { ...basePattern };
    if (current?.weekly_pattern) {
      for (const dayKey of Object.keys(basePattern)) {
        const cur = current.weekly_pattern[dayKey];
        if (cur) {
          merged[dayKey] = {
            work_hours: Number(cur.work_hours ?? 0),
            start: cur.start || "",
            end: cur.end || "",
            break_min: Number(cur.break_min ?? 0),
          };
        }
      }
    }
    setForm({
      effective_from: new Date().toISOString().slice(0, 10),
      weekly_pattern: merged,
      weekly_hours_threshold: Number(current?.weekly_hours_threshold ?? 44),
      notes: "",
    });
    setDialogOpen(true);
  };

  const updateDay = (dayKey, field, value) => {
    setForm((prev) => ({
      ...prev,
      weekly_pattern: {
        ...prev.weekly_pattern,
        [dayKey]: { ...prev.weekly_pattern[dayKey], [field]: value },
      },
    }));
  };

  const totalWeekly = DAYS.reduce((sum, d) => sum + Number(form.weekly_pattern[d.key]?.work_hours || 0), 0);

  const saveSchedule = async () => {
    try {
      await axios.post(`${API}/api/people-ops/schedules/employee/${employeeId}`, form, { withCredentials: true });
      toast.success(isEs ? "Horario guardado" : "Schedule saved");
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message);
    }
  };

  const saveDayOff = async () => {
    try {
      await axios.post(`${API}/api/people-ops/days-off/employee/${employeeId}`, dayOffForm, { withCredentials: true });
      toast.success(isEs ? "Día libre agregado" : "Day off added");
      setDayOffDialogOpen(false);
      setDayOffForm({ date: new Date().toISOString().slice(0, 10), reason: "", category: "personal" });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message);
    }
  };

  const deleteDayOff = async (id) => {
    if (!window.confirm(isEs ? "¿Eliminar día libre?" : "Delete day off?")) return;
    try {
      await axios.delete(`${API}/api/people-ops/days-off/${id}`, { withCredentials: true });
      fetchData();
    } catch (err) { console.error(err); }
  };

  if (loading) return <div className="p-4 text-sm text-muted-foreground">{isEs ? "Cargando…" : "Loading…"}</div>;

  return (
    <div className="space-y-4" data-testid="schedule-tab">
      {/* Individual calendar view */}
      <ScheduleCalendar employeeId={employeeId} isEs={isEs} />

      {/* Current schedule */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                {isEs ? "Horario actual" : "Current Schedule"}
              </CardTitle>
              {current && (
                <CardDescription className="text-xs">
                  {isEs ? "Vigente desde" : "Effective from"}: {current.effective_from}
                  {" · "}
                  {isEs ? "Umbral semanal:" : "Weekly threshold:"} {current.weekly_hours_threshold}h
                </CardDescription>
              )}
            </div>
            <Button onClick={openNewDialog} data-testid="new-schedule-btn">
              <Plus className="w-4 h-4 mr-1" />
              {current ? (isEs ? "Actualizar horario" : "Update schedule") : (isEs ? "Configurar horario" : "Configure schedule")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!current ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {isEs ? "Sin horario configurado." : "No schedule configured yet."}
            </p>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {DAYS.map((d) => {
                const day = current.weekly_pattern[d.key] || {};
                const off = !Number(day.work_hours);
                return (
                  <div key={d.key} className={`p-2 rounded border text-center ${off ? "bg-slate-100" : "bg-emerald-50 border-emerald-200"}`}>
                    <p className="text-[10px] uppercase font-semibold text-slate-500">{isEs ? d.labelEs : d.labelEn}</p>
                    <p className={`text-lg font-bold ${off ? "text-slate-400" : "text-emerald-700"}`}>{off ? "OFF" : `${day.work_hours}h`}</p>
                    {!off && day.start && day.end && (
                      <p className="text-[9px] text-muted-foreground">{day.start}—{day.end}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {current && (
            <p className="text-xs text-right text-muted-foreground mt-2">
              {isEs ? "Total semanal:" : "Weekly total:"} <span className="font-semibold">{current.weekly_hours_total}h</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Specific days off */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-600" />
              {isEs ? "Días libres específicos" : "Specific days off"}
              <Badge variant="outline" className="text-[10px]">{daysOff.length}</Badge>
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setDayOffDialogOpen(true)} data-testid="new-day-off-btn">
              <Plus className="w-4 h-4 mr-1" />{isEs ? "Agregar" : "Add"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {daysOff.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{isEs ? "Sin días libres registrados." : "No days off yet."}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                  <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
                  <TableHead>{isEs ? "Motivo" : "Reason"}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {daysOff.map((d) => (
                  <TableRow key={d.day_off_id}>
                    <TableCell className="font-mono text-xs">{d.date}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{d.category}</Badge></TableCell>
                    <TableCell className="text-xs">{d.reason || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteDayOff(d.day_off_id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-5 h-5 text-slate-600" />
            {isEs ? "Historial de horarios" : "Schedule history"}
            <Badge variant="outline" className="text-[10px]">{schedules.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <p className="text-xs text-muted-foreground">{isEs ? "Sin versiones aún." : "No versions yet."}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Vigencia" : "Effective"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Total semanal" : "Weekly total"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Umbral" : "Threshold"}</TableHead>
                  <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                  <TableHead>{isEs ? "Notas" : "Notes"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s) => (
                  <TableRow key={s.schedule_id} data-testid={`sched-row-${s.schedule_id}`}>
                    <TableCell className="text-xs font-mono">
                      {s.effective_from} → {s.effective_to || (isEs ? "actual" : "current")}
                    </TableCell>
                    <TableCell className="text-right text-xs">{s.weekly_hours_total}h</TableCell>
                    <TableCell className="text-right text-xs">{s.weekly_hours_threshold}h</TableCell>
                    <TableCell>
                      <Badge className={s.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}>
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Schedule editor dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{current ? (isEs ? "Actualizar horario base" : "Update base schedule") : (isEs ? "Nuevo horario base" : "New base schedule")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>{isEs ? "Vigente desde" : "Effective from"}</Label>
                <Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} data-testid="sched-effective-from" />
              </div>
              <div>
                <Label>{isEs ? "Umbral semanal (h)" : "Weekly threshold (h)"}</Label>
                <Input type="number" step="0.5" value={form.weekly_hours_threshold} onChange={(e) => setForm({ ...form, weekly_hours_threshold: parseFloat(e.target.value) || 44 })} data-testid="sched-threshold" />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {isEs ? "Horas semanales antes de OT. USA=40, RD=44." : "Weekly hours before OT. US=40, DR=44."}
                </p>
              </div>
            </div>

            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-2 py-2 text-xs uppercase">{isEs ? "Día" : "Day"}</th>
                    <th className="text-left px-2 py-2 text-xs uppercase">{isEs ? "Horas" : "Hours"}</th>
                    <th className="text-left px-2 py-2 text-xs uppercase">{isEs ? "Inicio" : "Start"}</th>
                    <th className="text-left px-2 py-2 text-xs uppercase">{isEs ? "Fin" : "End"}</th>
                    <th className="text-left px-2 py-2 text-xs uppercase">{isEs ? "Descanso (min)" : "Break (min)"}</th>
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((d) => {
                    const day = form.weekly_pattern[d.key];
                    return (
                      <tr key={d.key} className="border-t">
                        <td className="px-2 py-1 text-xs font-semibold">{isEs ? d.labelEs : d.labelEn}</td>
                        <td className="px-2 py-1"><Input type="number" min="0" step="0.5" value={day.work_hours} onChange={(e) => updateDay(d.key, "work_hours", parseFloat(e.target.value) || 0)} className="h-7 text-xs" data-testid={`sched-${d.key}-hours`} /></td>
                        <td className="px-2 py-1"><Input type="time" value={day.start || ""} onChange={(e) => updateDay(d.key, "start", e.target.value)} className="h-7 text-xs" /></td>
                        <td className="px-2 py-1"><Input type="time" value={day.end || ""} onChange={(e) => updateDay(d.key, "end", e.target.value)} className="h-7 text-xs" /></td>
                        <td className="px-2 py-1"><Input type="number" min="0" step="5" value={day.break_min} onChange={(e) => updateDay(d.key, "break_min", parseInt(e.target.value) || 0)} className="h-7 text-xs w-20" /></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t font-semibold">
                  <tr>
                    <td className="px-2 py-2 text-xs">{isEs ? "Total semanal" : "Weekly total"}</td>
                    <td className="px-2 py-2 text-xs" data-testid="sched-total-weekly">{totalWeekly.toFixed(2)}h</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div>
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder={isEs ? "Ej. Horario temporada alta, rotativo" : "e.g. Peak season, rotative"} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={saveSchedule} data-testid="sched-save-btn">{isEs ? "Guardar" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Day-off dialog */}
      <Dialog open={dayOffDialogOpen} onOpenChange={setDayOffDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEs ? "Agregar día libre" : "Add day off"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{isEs ? "Fecha" : "Date"}</Label>
              <Input type="date" value={dayOffForm.date} onChange={(e) => setDayOffForm({ ...dayOffForm, date: e.target.value })} data-testid="dayoff-date" />
            </div>
            <div>
              <Label>{isEs ? "Categoría" : "Category"}</Label>
              <select className="w-full border rounded-md h-9 px-2 text-sm" value={dayOffForm.category} onChange={(e) => setDayOffForm({ ...dayOffForm, category: e.target.value })} data-testid="dayoff-category">
                <option value="personal">{isEs ? "Personal" : "Personal"}</option>
                <option value="comp">{isEs ? "Compensatorio" : "Compensatory"}</option>
                <option value="other">{isEs ? "Otro" : "Other"}</option>
              </select>
            </div>
            <div>
              <Label>{isEs ? "Motivo" : "Reason"}</Label>
              <Input value={dayOffForm.reason} onChange={(e) => setDayOffForm({ ...dayOffForm, reason: e.target.value })} data-testid="dayoff-reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDayOffDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={saveDayOff} data-testid="dayoff-save-btn">{isEs ? "Guardar" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
