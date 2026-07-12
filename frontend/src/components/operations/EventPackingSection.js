import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../ui/table";
import {
  PackageCheck, Truck, AlertTriangle, Calendar, Users, DollarSign,
  Package, CheckCircle2, RefreshCw, Info, LayoutTemplate,
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";
import { fmtNum } from "../../utils/format";

/**
 * Event Packing List — one screen to:
 *   1. Pick an event (or receive one via prop when embedded)
 *   2. See only the items reserved for that event
 *   3. Check them off as they're packed
 *   4. When 100% packed → single click generates the outbound conduce
 *
 * Props:
 *   eventId  – if provided, the event selector is hidden and this event
 *              is used directly (used when embedded inside Event Orchestration).
 *   embedded – tighter layout for embedding inside another tab.
 */
export function EventPackingSection({ eventId: eventIdProp = null, embedded = false } = {}) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const t = (es, en) => (isEs ? es : en);

  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(eventIdProp || "");
  const [packingData, setPackingData] = useState(null);
  const [loadingEvents, setLoadingEvents] = useState(!eventIdProp);
  const [loadingPacking, setLoadingPacking] = useState(false);
  const [saving, setSaving] = useState({});

  // Generate-conduce dialog
  const [conduceDialogOpen, setConduceDialogOpen] = useState(false);
  const [conduceForm, setConduceForm] = useState({
    expected_return_date: "",
    notes: "",
  });

  // Template application (Sprint F)
  const [templates, setTemplates] = useState([]);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [previewItems, setPreviewItems] = useState([]);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    // Load templates once, so the "Aplicar plantilla" button can enable itself
    axios.get(`${API}/api/packing-templates`, { withCredentials: true })
      .then((r) => setTemplates(r.data || []))
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    if (!eventIdProp) fetchEvents();
  }, [eventIdProp]);

  // Keep internal state in sync if the parent switches events.
  useEffect(() => {
    if (eventIdProp && eventIdProp !== selectedEventId) {
      setSelectedEventId(eventIdProp);
    }
  }, [eventIdProp, selectedEventId]);

  useEffect(() => {
    if (selectedEventId) fetchPacking(selectedEventId);
    else setPackingData(null);
  }, [selectedEventId]);

  const fetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const r = await axios.get(`${API}/api/events/confirmed`, { withCredentials: true });
      setEvents(r.data || []);
    } catch (e) {
      console.warn("fetchEvents failed", e?.message);
      setEvents([]);
    }
    setLoadingEvents(false);
  };

  const fetchPacking = async (eventId) => {
    setLoadingPacking(true);
    try {
      const r = await axios.get(`${API}/api/events/${eventId}/packing-list-live`, { withCredentials: true });
      setPackingData(r.data || null);
    } catch (e) {
      console.warn("fetchPacking failed", e?.message);
      toast.error(t("No se pudo cargar el packing list", "Could not load packing list"));
      setPackingData(null);
    }
    setLoadingPacking(false);
  };

  const togglePacked = async (item) => {
    const newPacked = !item.packed;
    setSaving((s) => ({ ...s, [item.inventory_item_id]: true }));
    // Optimistic UI
    setPackingData((prev) => prev && ({
      ...prev,
      items: prev.items.map((i) =>
        i.inventory_item_id === item.inventory_item_id ? { ...i, packed: newPacked } : i
      ),
      packed_items: prev.items.reduce(
        (acc, i) => acc + (i.inventory_item_id === item.inventory_item_id
          ? (newPacked ? 1 : 0)
          : (i.packed ? 1 : 0)), 0
      ),
    }));
    try {
      await axios.post(
        `${API}/api/events/${selectedEventId}/pack-item`,
        { inventory_item_id: item.inventory_item_id, packed: newPacked },
        { withCredentials: true }
      );
      // Refetch to get fresh fully_packed and packed count values
      await fetchPacking(selectedEventId);
    } catch (e) {
      toast.error(e.response?.data?.detail || t("Error al actualizar", "Update failed"));
      // Revert
      await fetchPacking(selectedEventId);
    }
    setSaving((s) => ({ ...s, [item.inventory_item_id]: false }));
  };

  const openConduceDialog = () => {
    // Default expected return: day after event end
    const eventEnd = packingData?.end_date || packingData?.event_date;
    let expected = "";
    if (eventEnd) {
      const d = new Date(String(eventEnd).slice(0, 10) + "T00:00:00");
      d.setDate(d.getDate() + 1);
      expected = d.toISOString().slice(0, 10);
    }
    setConduceForm({ expected_return_date: expected, notes: "" });
    setConduceDialogOpen(true);
  };

  const handleGenerateConduce = async () => {
    try {
      const res = await axios.post(
        `${API}/api/events/${selectedEventId}/generate-outbound-conduce`,
        {
          expected_return_date: conduceForm.expected_return_date || null,
          notes: conduceForm.notes || null,
        },
        { withCredentials: true }
      );
      toast.success(
        t(`Conduce ${res.data.note_number} generado`, `Delivery note ${res.data.note_number} created`)
      );
      setConduceDialogOpen(false);
      await fetchPacking(selectedEventId);
    } catch (e) {
      toast.error(e.response?.data?.detail || t("Error al generar conduce", "Generate failed"));
    }
  };

  const openApplyTemplate = async () => {
    setSelectedTemplateId("");
    setPreviewItems([]);
    setApplyDialogOpen(true);
  };

  const runPreview = async (templateId) => {
    if (!templateId) { setPreviewItems([]); return; }
    try {
      const r = await axios.post(
        `${API}/api/packing-templates/${templateId}/preview`,
        { event_id: selectedEventId },
        { withCredentials: true }
      );
      setPreviewItems(r.data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || t("Error en previsualización", "Preview failed"));
      setPreviewItems([]);
    }
  };

  const applyTemplate = async () => {
    if (!selectedTemplateId) return;
    setApplying(true);
    try {
      const res = await axios.post(
        `${API}/api/packing-templates/${selectedTemplateId}/apply`,
        { event_id: selectedEventId, allow_overbook: false },
        { withCredentials: true }
      );
      const reserved = res.data.reservations?.length || 0;
      const failed = res.data.failures?.length || 0;
      if (failed > 0) {
        toast.warning(
          t(
            `${reserved} reservados · ${failed} rechazados por conflicto/stock`,
            `${reserved} reserved · ${failed} rejected due to conflict/stock`
          )
        );
      } else {
        toast.success(t(`${reserved} items reservados`, `${reserved} items reserved`));
      }
      setApplyDialogOpen(false);
      await fetchPacking(selectedEventId);
    } catch (e) {
      toast.error(e.response?.data?.detail || t("Error al aplicar plantilla", "Apply failed"));
    }
    setApplying(false);
  };

  const eventCostSummary = useMemo(() => {
    if (!packingData?.items) return null;
    let owned = 0;
    let rentalPerDay = 0;
    let rentedItems = 0;
    let ownedItems = 0;
    for (const it of packingData.items) {
      const qty = Number(it.quantity_reserved || 0);
      if (it.origin === "Alquilado") {
        rentalPerDay += qty * Number(it.rental_cost_per_unit_day || 0);
        rentedItems += 1;
      } else {
        owned += qty * Number(it.cost_per_unit || 0);
        ownedItems += 1;
      }
    }
    // Rental days: event_date to end_date inclusive (fallback 1)
    let days = 1;
    if (packingData.event_date) {
      const start = new Date(String(packingData.event_date).slice(0, 10));
      const end = packingData.end_date
        ? new Date(String(packingData.end_date).slice(0, 10))
        : start;
      days = Math.max(1, Math.round((end - start) / 86400000) + 1);
    }
    const rental = rentalPerDay * days;
    return {
      owned,
      rental,
      total: owned + rental,
      rentedItems,
      ownedItems,
      days,
      rentalPerDay,
    };
  }, [packingData]);

  const selectedEvent = events.find((e) => e.event_id === selectedEventId);
  const isFullyPacked = packingData?.fully_packed;
  const conduceAlreadyGenerated = packingData?.conduce_generated;

  return (
    <div className={embedded ? "space-y-4" : "space-y-6"} data-testid="event-packing-section">
      {/* Header + event selector (hidden when embedded with fixed event) */}
      {!eventIdProp && (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PackageCheck className="w-5 h-5" />
                {t("Packing List por Evento", "Packing List by Event")}
              </CardTitle>
              <CardDescription>
                {t("Marca cada equipo como empacado y genera el conduce de salida en un clic.",
                   "Check off items as they're packed, then generate the outbound delivery note with one click.")}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchEvents} data-testid="event-packing-refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-xl">
            <Label>{t("Evento", "Event")}</Label>
            <Select
              value={selectedEventId}
              onValueChange={setSelectedEventId}
              disabled={loadingEvents}
            >
              <SelectTrigger data-testid="event-packing-select">
                <SelectValue placeholder={t("Selecciona un evento confirmado", "Select a confirmed event")} />
              </SelectTrigger>
              <SelectContent>
                {events.length === 0 && (
                  <SelectItem value="__none" disabled>
                    {loadingEvents ? t("Cargando…", "Loading…") : t("No hay eventos confirmados", "No confirmed events")}
                  </SelectItem>
                )}
                {events.map((ev) => (
                  <SelectItem key={ev.event_id} value={ev.event_id}>
                    {(ev.event_name || ev.name || "Event")} — {ev.event_date ? formatDateOnly(ev.event_date, language) : "TBD"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Detail view when event picked */}
      {selectedEventId && (
        <>
          {/* Event summary + cost widget */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <SummaryCard
              icon={<Calendar className="w-5 h-5 text-indigo-500" />}
              label={t("Fecha", "Date")}
              value={packingData?.event_date ? formatDateOnly(packingData.event_date, language) : "—"}
              sub={packingData?.end_date ? `→ ${formatDateOnly(packingData.end_date, language)}` : null}
            />
            <SummaryCard
              icon={<Users className="w-5 h-5 text-emerald-500" />}
              label={t("Invitados", "Guests")}
              value={fmtNum(packingData?.guest_count || 0)}
            />
            <SummaryCard
              icon={<Package className="w-5 h-5 text-blue-500" />}
              label={t("Progreso", "Progress")}
              value={`${packingData?.packed_items || 0} / ${packingData?.total_items || 0}`}
              sub={
                packingData?.total_items > 0
                  ? `${Math.round((packingData.packed_items / packingData.total_items) * 100)}%`
                  : null
              }
            />
            <SummaryCard
              testId="event-cost-summary"
              icon={<DollarSign className="w-5 h-5 text-amber-500" />}
              label={t("Costo de Recursos", "Resource Cost")}
              value={eventCostSummary ? `$${fmtNum(eventCostSummary.total)}` : "—"}
              sub={
                eventCostSummary && eventCostSummary.rental > 0
                  ? t(
                      `Propios $${fmtNum(eventCostSummary.owned)} · Alq. $${fmtNum(eventCostSummary.rental)} (${eventCostSummary.days}d)`,
                      `Owned $${fmtNum(eventCostSummary.owned)} · Rental $${fmtNum(eventCostSummary.rental)} (${eventCostSummary.days}d)`
                    )
                  : eventCostSummary
                    ? t("Solo items propios", "Owned items only")
                    : null
              }
            />
          </div>

          {/* Missing cost warning */}
          {packingData?.items?.some((i) => !i.cost_per_unit && i.origin !== "Alquilado") && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="py-3 flex items-start gap-2 text-sm text-amber-900">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  {t(
                    "Algunos items no tienen costo cargado — el total de recursos puede estar subestimado. Actualízalos en Inventario.",
                    "Some items have no cost — the resource total may be underestimated. Update them in Inventory."
                  )}
                </span>
              </CardContent>
            </Card>
          )}

          {/* Items list */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="w-4 h-4" />
                  {t("Items reservados", "Reserved items")}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {templates.length > 0 && !conduceAlreadyGenerated && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openApplyTemplate}
                      data-testid="btn-apply-template"
                    >
                      <LayoutTemplate className="w-4 h-4 mr-1" />
                      {t("Aplicar plantilla", "Apply template")}
                    </Button>
                  )}
                  {conduceAlreadyGenerated ? (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      <Truck className="w-3 h-3 mr-1" />
                      {t("Conduce ya generado", "Conduce already generated")}
                    </Badge>
                  ) : isFullyPacked ? (
                    <Button
                      onClick={openConduceDialog}
                      className="bg-emerald-600 hover:bg-emerald-700"
                      data-testid="btn-generate-conduce"
                    >
                      <Truck className="w-4 h-4 mr-2" />
                      {t("Generar Conduce de Salida", "Generate Outbound Delivery Note")}
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-slate-600">
                      {t("Marca todos los items para generar el conduce", "Pack all items to unlock conduce")}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingPacking ? (
                <div className="py-8 text-center text-muted-foreground">{t("Cargando…", "Loading…")}</div>
              ) : !packingData?.items?.length ? (
                <div className="py-12 text-center space-y-3">
                  <Package className="w-10 h-10 mx-auto text-slate-400" />
                  <p className="font-medium">{t("Aún no hay items reservados", "No items reserved yet")}</p>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    {t(
                      "Reserva inventario para este evento desde el menú/receta o desde Gestión de Recursos → Compras. Aquí aparecerán para empacar.",
                      "Reserve inventory for this event from the menu/recipe screen or Resource Management → Purchasing. They'll show up here to pack."
                    )}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open("/ops-supplies/purchasing", embedded ? "_blank" : "_self")}
                    data-testid="btn-open-purchasing"
                  >
                    {t("Ir a Compras / Reservar", "Go to Purchasing / Reserve")}
                  </Button>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>{t("Item", "Item")}</TableHead>
                        <TableHead className="text-right">{t("Cantidad", "Qty")}</TableHead>
                        <TableHead>{t("Origen", "Origin")}</TableHead>
                        <TableHead className="text-right">{t("Costo unitario", "Unit cost")}</TableHead>
                        <TableHead>{t("Estado", "Status")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {packingData.items.map((i) => (
                        <TableRow
                          key={i.reservation_id}
                          className={i.packed ? "bg-emerald-50/40" : ""}
                          data-testid={`packing-row-${i.inventory_item_id}`}
                        >
                          <TableCell>
                            <Checkbox
                              checked={!!i.packed}
                              disabled={!!saving[i.inventory_item_id] || conduceAlreadyGenerated}
                              onCheckedChange={() => togglePacked(i)}
                              data-testid={`packing-checkbox-${i.inventory_item_id}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {i.image_url && (
                                <img
                                  src={i.image_url}
                                  alt={i.name}
                                  className="w-8 h-8 rounded object-cover border"
                                />
                              )}
                              <span>{i.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtNum(i.quantity_reserved)} {i.unit}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={i.origin === "Alquilado"
                                ? "bg-purple-50 text-purple-700 border-purple-200"
                                : "bg-slate-50 text-slate-700"}
                            >
                              {i.origin}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {i.origin === "Alquilado" ? (
                              <span className="text-purple-700">${fmtNum(i.rental_cost_per_unit_day || 0)}/d</span>
                            ) : i.cost_per_unit > 0 ? (
                              <span>${fmtNum(i.cost_per_unit)}</span>
                            ) : (
                              <span className="text-amber-600 text-xs">
                                <AlertTriangle className="inline w-3 h-3 mr-0.5" />
                                {t("sin costo", "no cost")}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {i.packed ? (
                              <Badge className="bg-emerald-100 text-emerald-800">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                {t("Empacado", "Packed")}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-slate-600">
                                {t("Pendiente", "Pending")}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Generate Conduce Dialog */}
      <Dialog open={conduceDialogOpen} onOpenChange={setConduceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              {t("Generar Conduce de Salida", "Generate Outbound Delivery Note")}
            </DialogTitle>
            <DialogDescription>
              {t(
                `${packingData?.packed_items || 0} items empacados se moverán a "En Evento" y quedarán en el nuevo conduce.`,
                `${packingData?.packed_items || 0} packed items will move to "En Evento" and be attached to the new conduce.`
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("Fecha esperada de retorno", "Expected return date")}</Label>
              <Input
                type="date"
                value={conduceForm.expected_return_date}
                onChange={(e) => setConduceForm({ ...conduceForm, expected_return_date: e.target.value })}
                data-testid="conduce-return-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("Notas (opcional)", "Notes (optional)")}</Label>
              <Input
                value={conduceForm.notes}
                onChange={(e) => setConduceForm({ ...conduceForm, notes: e.target.value })}
                placeholder={t("Instrucciones para el equipo…", "Instructions for the crew…")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConduceDialogOpen(false)}>
              {t("Cancelar", "Cancel")}
            </Button>
            <Button onClick={handleGenerateConduce} data-testid="btn-confirm-generate-conduce">
              {t("Generar", "Generate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Apply Template Dialog (Sprint F) */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5" />
              {t("Aplicar plantilla al evento", "Apply template to event")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Escoge una plantilla y el sistema calcula las cantidades usando los invitados del evento.",
                "Pick a template; the system computes quantities using the event's guest count."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("Plantilla", "Template")}</Label>
              <Select
                value={selectedTemplateId}
                onValueChange={(v) => { setSelectedTemplateId(v); runPreview(v); }}
              >
                <SelectTrigger data-testid="template-select"><SelectValue placeholder={t("Selecciona una plantilla…", "Select a template…")} /></SelectTrigger>
                <SelectContent>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.template_id} value={tpl.template_id}>
                      {tpl.name} · {(tpl.items || []).length} {t("items", "items")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {previewItems.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Item", "Item")}</TableHead>
                      <TableHead className="text-right">{t("Sugerido", "Suggested")}</TableHead>
                      <TableHead className="text-right">{t("Disponible", "Available")}</TableHead>
                      <TableHead>{t("Estado", "Status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewItems.map((pi) => (
                      <TableRow key={pi.inventory_item_id} data-testid={`preview-row-${pi.inventory_item_id}`}>
                        <TableCell className="font-medium">{pi.item_name}</TableCell>
                        <TableCell className="text-right font-mono">{fmtNum(pi.suggested_qty)} {pi.unit}</TableCell>
                        <TableCell className="text-right font-mono">{fmtNum(pi.available)}</TableCell>
                        <TableCell>
                          {pi.inventory_item_id?.startsWith("unmatched:") ? (
                            <Badge className="bg-slate-100 text-slate-700 text-xs">
                              {t("sin vincular", "unlinked")}
                            </Badge>
                          ) : pi.would_overbook ? (
                            <Badge className="bg-amber-100 text-amber-800 text-xs">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              {t("Excede stock", "Exceeds stock")}
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800 text-xs">
                              {t("OK", "OK")}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>
              {t("Cancelar", "Cancel")}
            </Button>
            <Button
              onClick={applyTemplate}
              disabled={!selectedTemplateId || applying}
              data-testid="btn-confirm-apply-template"
            >
              {applying ? t("Aplicando…", "Applying…") : t("Aplicar y reservar", "Apply & reserve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ icon, label, value, sub, testId }) {
  return (
    <Card data-testid={testId}>
      <CardContent className="py-4 flex items-start gap-3">
        <div className="p-2 rounded-lg bg-slate-50">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-lg font-bold truncate">{value}</p>
          {sub && <p className="text-xs text-slate-500 truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default EventPackingSection;
