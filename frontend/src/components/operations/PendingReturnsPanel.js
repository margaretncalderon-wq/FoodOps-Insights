import { useEffect, useState } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { AlertTriangle, Clock, CalendarClock, PackageCheck, ChevronDown, ChevronUp, RefreshCw, Truck, Building2, AlertOctagon } from "lucide-react";
import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";

/**
 * Compact-yet-actionable dashboard for equipment that hasn't come back:
 *  - Delivery Notes still checked-out (grouped by urgency).
 *  - Supplier rentals whose return deadline is looming/overdue.
 *
 * Props:
 *   onOpenNote(note)  – parent handles opening the Check-In dialog.
 *   compact           – shrinks to a small summary chip.
 */
export function PendingReturnsPanel({ onOpenNote, compact = false, refreshKey = 0 }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const t = (es, en) => (isEs ? es : en);

  const [data, setData] = useState(null);
  const [overReserved, setOverReserved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(!compact);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [res, oreRes] = await Promise.allSettled([
        axios.get(`${API}/api/delivery-notes/pending-returns`, { withCredentials: true }),
        axios.get(`${API}/api/inventory/over-reserved`, { withCredentials: true }),
      ]);
      setData(res.status === "fulfilled" ? (res.value.data || null) : null);
      setOverReserved(oreRes.status === "fulfilled" ? (oreRes.value.data || null) : null);
    } catch (e) {
      console.warn("PendingReturnsPanel load failed", e?.message);
      setData(null);
      setOverReserved(null);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [refreshKey]);

  const summary = data?.summary || {};
  const notes = data?.delivery_notes || { overdue: [], due_soon: [], upcoming: [], no_date: [] };
  const rentals = data?.rentals || { overdue: [], due_soon: [], upcoming: [], no_date: [] };

  const totalOverdue = (summary.notes_overdue || 0) + (summary.rentals_overdue || 0);
  const totalDueSoon = (summary.notes_due_soon || 0) + (summary.rentals_due_soon || 0);
  const totalUpcoming = (summary.notes_upcoming || 0) + (summary.rentals_upcoming || 0);
  const totalNoDate = summary.notes_no_date || 0;
  const totalPending = summary.total_pending || 0;
  const overReservedCount = overReserved?.count || 0;

  // Empty state (nothing pending AND no over-reservations)
  if (!loading && totalPending === 0 && overReservedCount === 0) {
    return (
      <Card data-testid="pending-returns-empty" className="border-emerald-200 bg-emerald-50/40">
        <CardContent className="py-4 flex items-center gap-3">
          <PackageCheck className="w-6 h-6 text-emerald-600 shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-emerald-900">
              {t("Todo en orden", "All clear")}
            </p>
            <p className="text-sm text-emerald-800/80">
              {t("No hay retornos pendientes ni alquileres por vencer.",
                 "No pending returns and no rentals coming due.")}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchData} data-testid="pending-returns-refresh-empty">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Choose accent color based on worst bucket (over-reserved is always red)
  const accent = (overReservedCount > 0 || totalOverdue > 0)
    ? { border: "border-red-300", bg: "bg-red-50/60", text: "text-red-900", icon: "text-red-600" }
    : totalDueSoon > 0
    ? { border: "border-amber-300", bg: "bg-amber-50/60", text: "text-amber-900", icon: "text-amber-600" }
    : { border: "border-slate-200", bg: "bg-slate-50/60", text: "text-slate-900", icon: "text-slate-600" };

  return (
    <Card
      className={`${accent.border} ${accent.bg}`}
      data-testid="pending-returns-panel"
    >
      <CardContent className="py-4 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-white shadow-sm">
              <AlertTriangle className={`w-5 h-5 ${accent.icon}`} />
            </div>
            <div className="min-w-0">
              <p className={`font-semibold ${accent.text}`}>
                {t("Retornos pendientes", "Pending returns")}
              </p>
              <p className="text-sm text-slate-600">
                {loading
                  ? t("Cargando…", "Loading…")
                  : overReservedCount > 0
                  ? t(
                      `${overReservedCount} sobre-reservados · ${totalOverdue} vencidos · ${totalDueSoon} próximos`,
                      `${overReservedCount} over-reserved · ${totalOverdue} overdue · ${totalDueSoon} due soon`
                    )
                  : t(
                      `${totalPending} en total · ${totalOverdue} vencidos · ${totalDueSoon} próximos`,
                      `${totalPending} total · ${totalOverdue} overdue · ${totalDueSoon} due soon`
                    )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={fetchData} data-testid="pending-returns-refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              data-testid="pending-returns-toggle"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2">
          {overReservedCount > 0 && (
            <Chip
              testId="pr-chip-over-reserved"
              icon={<AlertOctagon className="w-3 h-3" />}
              label={t("Sobre-reservado", "Over-reserved")}
              count={overReservedCount}
              tone="red"
            />
          )}
          <Chip
            testId="pr-chip-overdue"
            icon={<AlertTriangle className="w-3 h-3" />}
            label={t("Vencidos", "Overdue")}
            count={totalOverdue}
            tone="red"
          />
          <Chip
            testId="pr-chip-due-soon"
            icon={<Clock className="w-3 h-3" />}
            label={t("Próximos (≤2d)", "Due soon (≤2d)")}
            count={totalDueSoon}
            tone="amber"
          />
          <Chip
            testId="pr-chip-upcoming"
            icon={<CalendarClock className="w-3 h-3" />}
            label={t("En rango", "Upcoming")}
            count={totalUpcoming}
            tone="slate"
          />
          {totalNoDate > 0 && (
            <Chip
              testId="pr-chip-no-date"
              icon={<CalendarClock className="w-3 h-3" />}
              label={t("Sin fecha", "No date")}
              count={totalNoDate}
              tone="slate"
            />
          )}
        </div>

        {/* Expanded detail lists */}
        {expanded && !loading && (
          <div className="space-y-4 pt-1">
            {/* Over-reserved section (Sprint E) */}
            {overReservedCount > 0 && (
              <div data-testid="pr-over-reserved-section" className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-red-700">
                  <AlertOctagon className="w-4 h-4" />
                  <span>{t("Sobre-reservados (excede stock)", "Over-reserved (exceeds stock)")}</span>
                </div>
                <div className="space-y-1.5">
                  {(overReserved.items || []).slice(0, 6).map((o) => (
                    <div
                      key={o.inventory_item_id}
                      data-testid={`pr-over-${o.inventory_item_id}`}
                      className="rounded-md bg-white/70 px-3 py-2 border border-red-100"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium truncate">{o.name}</span>
                        <span className="text-xs font-mono text-red-700">
                          {o.reserved} / {o.stock} {o.unit}{" "}
                          <span className="ml-1 text-red-900 font-semibold">
                            (-{o.shortfall})
                          </span>
                        </span>
                      </div>
                      {o.reservations?.length > 0 && (
                        <div className="text-xs text-slate-500 mt-0.5 truncate">
                          {t("En eventos:", "On events:")}{" "}
                          {o.reservations.slice(0, 3).map((r) => r.event_name).join(", ")}
                          {o.reservations.length > 3 && ` +${o.reservations.length - 3}`}
                        </div>
                      )}
                    </div>
                  ))}
                  {overReserved.items.length > 6 && (
                    <p className="text-xs text-slate-500 pl-1">
                      + {overReserved.items.length - 6} más
                    </p>
                  )}
                </div>
              </div>
            )}
            {/* Delivery Notes section */}
            <Section
              testIdPrefix="pr-notes"
              icon={<Truck className="w-4 h-4" />}
              title={t("Conduces sin check-in", "Delivery notes not checked-in")}
              buckets={notes}
              renderItem={(n) => (
                <NoteRow key={n.note_id} note={n} onOpenNote={onOpenNote} isEs={isEs} />
              )}
            />
            {/* Rentals section */}
            {(rentals.overdue.length + rentals.due_soon.length + rentals.upcoming.length) > 0 && (
              <Section
                testIdPrefix="pr-rentals"
                icon={<Building2 className="w-4 h-4" />}
                title={t("Alquileres a proveedor", "Supplier rentals")}
                buckets={rentals}
                renderItem={(r) => (
                  <RentalRow key={r.ingredient_id} rental={r} isEs={isEs} />
                )}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Sub-components ----------

function Chip({ icon, label, count, tone = "slate", testId }) {
  const tones = {
    red: "bg-red-100 text-red-800 border-red-200",
    amber: "bg-amber-100 text-amber-800 border-amber-200",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
  };
  return (
    <Badge
      variant="outline"
      className={`gap-1 border ${tones[tone] || tones.slate}`}
      data-testid={testId}
    >
      {icon}
      <span>{label}</span>
      <span className="font-mono font-semibold ml-1">{count}</span>
    </Badge>
  );
}

function Section({ title, icon, buckets, renderItem, testIdPrefix }) {
  const ordered = [
    { key: "overdue", items: buckets.overdue || [], accent: "text-red-700" },
    { key: "due_soon", items: buckets.due_soon || [], accent: "text-amber-700" },
    { key: "upcoming", items: buckets.upcoming || [], accent: "text-slate-600" },
    { key: "no_date", items: buckets.no_date || [], accent: "text-slate-500" },
  ].filter((g) => g.items.length > 0);

  if (ordered.length === 0) return null;

  return (
    <div data-testid={`${testIdPrefix}-section`} className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
        {icon}
        <span>{title}</span>
      </div>
      <div className="space-y-1.5">
        {ordered.map((g) => (
          <div key={g.key} data-testid={`${testIdPrefix}-bucket-${g.key}`} className="space-y-1">
            {g.items.slice(0, 8).map(renderItem)}
            {g.items.length > 8 && (
              <p className="text-xs text-slate-500 pl-1">
                + {g.items.length - 8} más
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function urgencyClass(daysDiff) {
  if (daysDiff === null || daysDiff === undefined) return "text-slate-500";
  if (daysDiff < 0) return "text-red-700 font-semibold";
  if (daysDiff <= 2) return "text-amber-700 font-semibold";
  return "text-slate-600";
}

function daysLabel(daysDiff, isEs) {
  if (daysDiff === null || daysDiff === undefined) {
    return isEs ? "sin fecha" : "no date";
  }
  if (daysDiff < 0) return isEs ? `hace ${-daysDiff}d` : `${-daysDiff}d overdue`;
  if (daysDiff === 0) return isEs ? "hoy" : "today";
  return isEs ? `en ${daysDiff}d` : `in ${daysDiff}d`;
}

function NoteRow({ note, onOpenNote, isEs }) {
  return (
    <div
      data-testid={`pr-note-${note.note_id}`}
      className="flex items-center justify-between gap-3 rounded-md bg-white/70 px-3 py-2 border border-slate-100 hover:border-slate-300 transition"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-500">{note.note_number}</span>
          <span className="font-medium truncate">{note.event_name || (isEs ? "Evento" : "Event")}</span>
        </div>
        <div className="text-xs text-slate-500 flex flex-wrap gap-2 mt-0.5">
          <span>{note.pending_items_count} {isEs ? "equipo(s)" : "item(s)"}</span>
          <span>·</span>
          <span className={urgencyClass(note.days_diff)}>
            {note.expected_return_date
              ? `${isEs ? "Retorno" : "Return"}: ${formatDateOnly(note.expected_return_date, isEs ? "es" : "en")} (${daysLabel(note.days_diff, isEs)})`
              : daysLabel(null, isEs)}
          </span>
        </div>
      </div>
      {onOpenNote && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onOpenNote(note)}
          data-testid={`pr-note-checkin-${note.note_id}`}
        >
          {isEs ? "Check-in" : "Check-in"}
        </Button>
      )}
    </div>
  );
}

function RentalRow({ rental, isEs }) {
  return (
    <div
      data-testid={`pr-rental-${rental.ingredient_id}`}
      className="flex items-center justify-between gap-3 rounded-md bg-white/70 px-3 py-2 border border-slate-100"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{rental.name}</span>
          {rental.rental_supplier_name && (
            <span className="text-xs text-slate-500 truncate">· {rental.rental_supplier_name}</span>
          )}
        </div>
        <div className="text-xs text-slate-500 flex flex-wrap gap-2 mt-0.5">
          <span>{rental.stock_quantity} {rental.unit || ""}</span>
          <span>·</span>
          <span className={urgencyClass(rental.days_diff)}>
            {rental.rental_return_deadline
              ? `${isEs ? "Devolver" : "Return"}: ${formatDateOnly(rental.rental_return_deadline, isEs ? "es" : "en")} (${daysLabel(rental.days_diff, isEs)})`
              : daysLabel(null, isEs)}
          </span>
        </div>
      </div>
    </div>
  );
}
