import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTerminology } from "../../hooks/useTerminology";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Checkbox } from "../ui/checkbox";
import {
  Lock, Unlock, RefreshCw, Download, CheckCircle2, AlertTriangle, XCircle,
  HelpCircle, Package, Calculator, Wallet, FileText, ChevronDown, ChevronUp,
  ArrowRight, Clock, DollarSign, BarChart3, AlertCircle, Eye, Edit, Wrench,
  Tag, Bell, BellRing, Calendar, ClipboardList, Search, Check
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { fmtNum } from "../../utils/format";
import { KoraLoader } from "../KoraLoader";
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CloseReconciliationSection() {
  const { language } = useLanguage();
  const { term } = useTerminology();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [periodData, setPeriodData] = useState(null);
  const [exceptions, setExceptions] = useState([]);
  const [eventAllocation, setEventAllocation] = useState(null);
  const [events, setEvents] = useState([]);
  const [physicalCount, setPhysicalCount] = useState(null);
  const [availablePeriods, setAvailablePeriods] = useState([]);
  
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [showFixModal, setShowFixModal] = useState(false);
  const [showCountModal, setShowCountModal] = useState(false);
  const [showAlertBanner, setShowAlertBanner] = useState(true);
  const [showPeriodsPanel, setShowPeriodsPanel] = useState(false);
  
  const [closeNotes, setCloseNotes] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [showAllocation, setShowAllocation] = useState(false);
  const [showPhysicalCount, setShowPhysicalCount] = useState(false);
  const [exceptionFilter, setExceptionFilter] = useState("all");
  const [manualOpeningInventory, setManualOpeningInventory] = useState("");
  
  // Physical Count State
  const [countItems, setCountItems] = useState([]);
  const [countFilter, setCountFilter] = useState("all");
  const [countSearch, setCountSearch] = useState("");
  
  // Fix Exception State
  const [selectedExc, setSelectedExc] = useState(null);
  const [fixForm, setFixForm] = useState({
    unit_cost: 0,
    assigned_event_id: "",
    categorization: "",
    adjustment_qty: 0,
    resolution_notes: ""
  });
  
  const [cashForm, setCashForm] = useState({
    opening_cash: 0,
    closing_cash: 0,
    cash_in: 0,
    cash_out: 0,
    notes: ""
  });

  const MONTHS = [
    { value: 1, label: isEs ? "Enero" : "January" },
    { value: 2, label: isEs ? "Febrero" : "February" },
    { value: 3, label: isEs ? "Marzo" : "March" },
    { value: 4, label: isEs ? "Abril" : "April" },
    { value: 5, label: isEs ? "Mayo" : "May" },
    { value: 6, label: isEs ? "Junio" : "June" },
    { value: 7, label: isEs ? "Julio" : "July" },
    { value: 8, label: isEs ? "Agosto" : "August" },
    { value: 9, label: isEs ? "Septiembre" : "September" },
    { value: 10, label: isEs ? "Octubre" : "October" },
    { value: 11, label: isEs ? "Noviembre" : "November" },
    { value: 12, label: isEs ? "Diciembre" : "December" },
  ];

  const CATEGORIZATIONS = [
    { value: "waste", label: isEs ? "Desperdicio" : "Waste" },
    { value: "shrink", label: isEs ? "Merma" : "Shrink" },
    { value: "correction", label: isEs ? "Corrección" : "Correction" },
    { value: "overhead", label: isEs ? "Overhead General" : "General Overhead" },
    { value: "samples", label: isEs ? "Muestras/Degustación" : "Samples/Tasting" },
  ];

  const fetchPeriodData = useCallback(async () => {
    setLoading(true);
    try {
      const [periodRes, exceptionsRes, allocationRes, eventsRes, countRes, periodsRes] = await Promise.all([
        axios.get(`${API}/api/business-clarity/period-close/${selectedYear}/${selectedMonth}`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/period-close/${selectedYear}/${selectedMonth}/exceptions?filter_type=${exceptionFilter}`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/period-close/${selectedYear}/${selectedMonth}/event-allocation`, { withCredentials: true }),
        axios.get(`${API}/api/events`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API}/api/business-clarity/period-close/${selectedYear}/${selectedMonth}/physical-count`, { withCredentials: true }).catch(() => ({ data: null })),
        axios.get(`${API}/api/business-clarity/period-close/available-periods`, { withCredentials: true }).catch(() => ({ data: [] }))
      ]);
      setPeriodData(periodRes.data);
      setExceptions(exceptionsRes.data?.exceptions || []);
      setEventAllocation(allocationRes.data);
      setEvents(Array.isArray(eventsRes.data) ? eventsRes.data : eventsRes.data?.events || []);
      setPhysicalCount(countRes.data);
      setAvailablePeriods(periodsRes.data || []);
      
      // Initialize manual opening from current value if editable
      if (periodRes.data?.inventory_valuation?.opening_editable) {
        setManualOpeningInventory(periodRes.data.inventory_valuation.opening_value || "");
      }
      
      // Initialize count items for editing
      if (countRes.data?.items) {
        setCountItems(countRes.data.items.map(i => ({
          ...i,
          counted_qty: i.counted_qty !== null ? i.counted_qty : ""
        })));
      }
      
      // Pre-fill cash form if exists
      if (periodRes.data?.cash_snapshot) {
        setCashForm(periodRes.data.cash_snapshot);
      }
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error cargando datos del período" : "Error loading period data");
    }
    setLoading(false);
  }, [selectedYear, selectedMonth, exceptionFilter, isEs]);

  useEffect(() => { fetchPeriodData(); }, [fetchPeriodData]);

  const handleClosePeriod = async () => {
    try {
      // Build URL with query params
      let url = `${API}/api/business-clarity/period-close/${selectedYear}/${selectedMonth}/close?notes=${encodeURIComponent(closeNotes)}`;
      
      // Add opening_inventory_override if editable and user provided value
      const inventory = periodData?.inventory_valuation || {};
      if (inventory.opening_editable && manualOpeningInventory !== "") {
        url += `&opening_inventory_override=${parseFloat(manualOpeningInventory) || 0}`;
      }
      
      await axios.post(url, {}, { withCredentials: true });
      toast.success(isEs ? "Período cerrado exitosamente" : "Period closed successfully");
      setShowCloseModal(false);
      setCloseNotes("");
      setConfirmClose(false);
      setManualOpeningInventory("");
      fetchPeriodData();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error cerrando período" : "Error closing period"));
    }
  };

  const handleReopenPeriod = async () => {
    try {
      await axios.post(
        `${API}/api/business-clarity/period-close/${selectedYear}/${selectedMonth}/reopen?reason=${encodeURIComponent(reopenReason)}`,
        {},
        { withCredentials: true }
      );
      toast.success(isEs ? "Período reabierto" : "Period reopened");
      setShowReopenModal(false);
      setReopenReason("");
      fetchPeriodData();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error reabriendo período" : "Error reopening period"));
    }
  };

  const handleSaveCashSnapshot = async () => {
    try {
      await axios.post(
        `${API}/api/business-clarity/period-close/${selectedYear}/${selectedMonth}/cash-snapshot`,
        cashForm,
        { withCredentials: true }
      );
      toast.success(isEs ? "Snapshot de caja guardado" : "Cash snapshot saved");
      setShowCashModal(false);
      fetchPeriodData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  // Export period close to CSV. Includes summary KPIs, exceptions, event
  // allocation breakdown and (when available) physical count adjustments.
  const handleExportCsv = () => {
    if (!periodData) {
      toast.error(isEs ? "Aún no hay datos para exportar" : "No data to export yet");
      return;
    }
    const monthLabel = MONTHS.find(m => m.value === selectedMonth)?.label || selectedMonth;
    const periodLabel = `${monthLabel} ${selectedYear}`;
    const lines = [];
    const fmt = (v) => {
      if (v === null || v === undefined || v === "") return "";
      // Quote strings that contain commas / quotes / newlines
      const s = String(v);
      return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const row = (...cells) => lines.push(cells.map(fmt).join(","));

    // -- HEADER
    row(isEs ? "Cierre de Mes — Resumen" : "Month-End Closing — Summary");
    row(isEs ? "Periodo" : "Period", periodLabel);
    row(isEs ? "Estado" : "Status", periodData.is_closed ? (isEs ? "Cerrado" : "Closed") : (isEs ? "Abierto" : "Open"));
    if (periodData.closed_at) row(isEs ? "Fecha cierre" : "Closed at", periodData.closed_at);
    if (periodData.closed_by_name) row(isEs ? "Cerrado por" : "Closed by", periodData.closed_by_name);
    row();

    // -- KPIs
    row(isEs ? "Métricas" : "Metrics", isEs ? "Valor" : "Value");
    const kpiKeys = [
      ["revenue", isEs ? "Ingresos" : "Revenue"],
      ["cogs", "COGS"],
      ["gross_profit", isEs ? "Utilidad Bruta" : "Gross Profit"],
      ["gross_margin_pct", isEs ? "Margen Bruto %" : "Gross Margin %"],
      ["expenses", isEs ? "Gastos Operativos" : "Operating Expenses"],
      ["operating_profit", isEs ? "Utilidad Operativa" : "Operating Profit"],
      ["operating_margin_pct", isEs ? "Margen Operativo %" : "Operating Margin %"],
      ["opening_inventory", isEs ? "Inventario Inicial" : "Opening Inventory"],
      ["closing_inventory", isEs ? "Inventario Final" : "Closing Inventory"],
      ["theoretical_food_cost", isEs ? "Food Cost Teórico" : "Theoretical Food Cost"],
      ["actual_food_cost", isEs ? "Food Cost Real" : "Actual Food Cost"],
      ["variance", isEs ? "Varianza" : "Variance"],
    ];
    for (const [k, label] of kpiKeys) {
      const v = periodData[k];
      if (v !== undefined && v !== null) row(label, typeof v === "number" ? v.toFixed(2) : v);
    }
    row();

    // -- EXCEPTIONS
    row(isEs ? "Excepciones" : "Exceptions");
    row(
      isEs ? "Tipo" : "Type",
      isEs ? "Item" : "Item",
      isEs ? "Cantidad" : "Qty",
      isEs ? "Costo Estimado" : "Estimated Cost",
      isEs ? "Estado" : "Status",
      isEs ? "Notas" : "Notes"
    );
    (exceptions || []).forEach(exc => row(
      exc.type || "",
      exc.item_name || exc.description || "",
      exc.qty ?? "",
      exc.estimated_cost ?? "",
      exc.resolved ? (isEs ? "Resuelta" : "Resolved") : (isEs ? "Pendiente" : "Pending"),
      exc.resolution_notes || ""
    ));
    row();

    // -- EVENT ALLOCATION
    if (eventAllocation && Array.isArray(eventAllocation.events)) {
      row(isEs ? `Asignación a ${term("events", "entity_plural")}` : `${term("events", "entity_singular")} Allocation`);
      row(
        isEs ? "Evento" : "Event",
        isEs ? "Fecha" : "Date",
        isEs ? "Costo Asignado" : "Allocated Cost",
        isEs ? "Ingresos" : "Revenue",
        isEs ? "Margen %" : "Margin %"
      );
      eventAllocation.events.forEach(e => row(
        e.name || e.event_name || "",
        e.event_date || "",
        (e.allocated_cost ?? 0).toFixed?.(2) || e.allocated_cost,
        (e.revenue ?? 0).toFixed?.(2) || e.revenue,
        e.margin_pct != null ? e.margin_pct.toFixed?.(2) : ""
      ));
      row();
    }

    // -- PHYSICAL COUNT
    if (physicalCount && Array.isArray(physicalCount.items) && physicalCount.items.length) {
      row(isEs ? "Conteo Físico" : "Physical Count");
      row(
        isEs ? "Item" : "Item",
        isEs ? "Stock Sistema" : "System Stock",
        isEs ? "Conteo" : "Counted",
        isEs ? "Diferencia" : "Variance",
        isEs ? "Costo" : "Cost"
      );
      physicalCount.items.forEach(it => row(
        it.name || "",
        it.system_qty ?? "",
        it.counted_qty ?? "",
        it.variance ?? "",
        (it.variance_cost ?? 0).toFixed?.(2) || it.variance_cost
      ));
    }

    // Trigger download (BOM = Excel-friendly Spanish accents)
    const csv = "\ufeff" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = window.document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute("download", `cierre_${selectedYear}_${String(selectedMonth).padStart(2, "0")}.csv`);
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    window.URL.revokeObjectURL(link.href);
    toast.success(isEs ? "Cierre exportado" : "Closing exported");
  };

  // Open Fix Modal for an exception
  const openFixModal = (exc) => {
    setSelectedExc(exc);
    setFixForm({
      unit_cost: 0,
      assigned_event_id: "",
      categorization: "",
      adjustment_qty: Math.abs(exc.qty || 0),
      resolution_notes: ""
    });
    setShowFixModal(true);
  };

  // Handle fixing missing unit cost
  const handleFixMissingCost = async () => {
    if (!selectedExc || !fixForm.unit_cost) {
      toast.error(isEs ? "Ingresa un costo unitario válido" : "Enter a valid unit cost");
      return;
    }
    try {
      await axios.patch(
        `${API}/api/inventory/ingredients/${selectedExc.item_id}`,
        { unit_cost: parseFloat(fixForm.unit_cost) },
        { withCredentials: true }
      );
      toast.success(isEs ? "Costo unitario actualizado" : "Unit cost updated");
      setShowFixModal(false);
      fetchPeriodData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  // Handle fixing negative stock
  const handleFixNegativeStock = async () => {
    if (!selectedExc) return;
    try {
      await axios.post(
        `${API}/api/inventory/ingredients/${selectedExc.item_id}/adjust`,
        { 
          adjustment_qty: fixForm.adjustment_qty,
          reason: fixForm.resolution_notes || "Period close adjustment",
          adjustment_type: "count_correction"
        },
        { withCredentials: true }
      );
      toast.success(isEs ? "Stock ajustado" : "Stock adjusted");
      setShowFixModal(false);
      fetchPeriodData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  // Handle assigning unassigned usage to event
  const handleAssignToEvent = async () => {
    if (!selectedExc || !fixForm.assigned_event_id) {
      toast.error(isEs ? "Selecciona un evento" : "Select an event");
      return;
    }
    try {
      await axios.put(
        `${API}/api/business-clarity/period-close/exceptions/${selectedExc.exception_id}`,
        { 
          assigned_event_id: fixForm.assigned_event_id,
          resolution_notes: fixForm.resolution_notes
        },
        { withCredentials: true }
      );
      toast.success(isEs ? "Asignado a evento" : "Assigned to event");
      setShowFixModal(false);
      fetchPeriodData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  // Handle categorizing as overhead
  const handleCategorizeOverhead = async () => {
    if (!selectedExc || !fixForm.categorization) {
      toast.error(isEs ? "Selecciona una categorización" : "Select a categorization");
      return;
    }
    try {
      await axios.put(
        `${API}/api/business-clarity/period-close/exceptions/${selectedExc.exception_id}`,
        { 
          categorization: fixForm.categorization,
          resolution_notes: fixForm.resolution_notes
        },
        { withCredentials: true }
      );
      toast.success(isEs ? "Categorizado como overhead" : "Categorized as overhead");
      setShowFixModal(false);
      fetchPeriodData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  // Physical Count Functions
  const updateCountItem = (ingredientId, countedQty) => {
    setCountItems(prev => prev.map(item => 
      item.ingredient_id === ingredientId 
        ? { ...item, counted_qty: countedQty }
        : item
    ));
  };

  const handleSavePhysicalCount = async () => {
    try {
      const itemsToSave = countItems
        .filter(i => i.counted_qty !== "" && i.counted_qty !== null)
        .map(i => ({
          ingredient_id: i.ingredient_id,
          counted_qty: parseFloat(i.counted_qty) || 0,
          notes: i.notes || null
        }));
      
      if (itemsToSave.length === 0) {
        toast.error(isEs ? "Ingresa al menos un conteo" : "Enter at least one count");
        return;
      }
      
      await axios.post(
        `${API}/api/business-clarity/period-close/${selectedYear}/${selectedMonth}/physical-count`,
        { items: itemsToSave },
        { withCredentials: true }
      );
      toast.success(isEs ? "Conteo físico guardado" : "Physical count saved");
      fetchPeriodData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  const handleApplyCountAdjustments = async () => {
    if (!confirm(isEs 
      ? "¿Aplicar los ajustes del conteo físico al inventario? Esta acción actualizará las cantidades de stock."
      : "Apply physical count adjustments to inventory? This will update stock quantities."
    )) return;
    
    try {
      const res = await axios.post(
        `${API}/api/business-clarity/period-close/${selectedYear}/${selectedMonth}/physical-count/apply`,
        {},
        { withCredentials: true }
      );
      toast.success(isEs 
        ? `${res.data.adjustments_made} ajustes aplicados` 
        : `${res.data.adjustments_made} adjustments applied`
      );
      fetchPeriodData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
  };

  // Filter count items
  const filteredCountItems = countItems.filter(item => {
    const matchesSearch = !countSearch || 
      item.name?.toLowerCase().includes(countSearch.toLowerCase()) ||
      item.category?.toLowerCase().includes(countSearch.toLowerCase());
    
    if (countFilter === "pending") return matchesSearch && item.status === "pending";
    if (countFilter === "counted") return matchesSearch && item.status === "counted";
    if (countFilter === "variance") return matchesSearch && Math.abs(item.variance_qty || 0) > 0.01;
    return matchesSearch;
  });

  // Check if end of month is approaching (for alerts)
  const isEndOfMonthApproaching = () => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - now.getDate();
    return daysRemaining <= 5;
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "ok": return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case "warning": return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case "block": return <XCircle className="w-4 h-4 text-red-600" />;
      default: return <CheckCircle2 className="w-4 h-4 text-green-600" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <KoraLoader size={48} />
      </div>
    );
  }

  const isClosed = periodData?.status === "closed";
  const readiness = periodData?.readiness || {};
  const inventory = periodData?.inventory_valuation || {};
  const cogs = periodData?.cogs_allocation || {};
  const reconciliation = periodData?.reconciliation || {};
  
  // Alert conditions
  const hasBlockers = periodData?.has_blockers;
  const blockingCount = exceptions.filter(e => e.severity === "block").length;
  const warningCount = exceptions.filter(e => e.severity === "warning").length;

  return (
    <div className="space-y-6">
      {/* Automatic Alert Banner */}
      {showAlertBanner && !isClosed && (hasBlockers || isEndOfMonthApproaching()) && (
        <Card className={hasBlockers ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {hasBlockers ? (
                  <BellRing className="w-5 h-5 text-red-600 animate-pulse" />
                ) : (
                  <Bell className="w-5 h-5 text-amber-600" />
                )}
                <div>
                  <p className={`font-medium ${hasBlockers ? "text-red-800" : "text-amber-800"}`}>
                    {hasBlockers 
                      ? (isEs ? "¡Atención! Hay items bloqueantes que requieren acción" : "Attention! There are blocking items that require action")
                      : (isEs ? "Recordatorio: El fin de mes se acerca" : "Reminder: End of month is approaching")
                    }
                  </p>
                  <p className={`text-sm ${hasBlockers ? "text-red-600" : "text-amber-600"}`}>
                    {hasBlockers 
                      ? (isEs 
                          ? `${blockingCount} bloqueantes, ${warningCount} advertencias pendientes` 
                          : `${blockingCount} blocking, ${warningCount} warnings pending`)
                      : (isEs 
                          ? "Revisa las excepciones pendientes antes de cerrar el período" 
                          : "Review pending exceptions before closing the period")
                    }
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setExceptionFilter("blocking")}
                  className={hasBlockers ? "border-red-300 text-red-700" : "border-amber-300 text-amber-700"}
                >
                  <Eye className="w-4 h-4 mr-1" />
                  {isEs ? "Ver Excepciones" : "View Exceptions"}
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowAlertBanner(false)}
                  className="text-muted-foreground"
                >
                  ×
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {isClosed ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
            {isEs ? "Cierre y Reconciliación" : "Close & Reconciliation"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Valuación de inventario, COGS y cierre de período" : "Inventory valuation, COGS and period close"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isClosed ? "default" : "outline"} className={isClosed ? "bg-green-600" : ""}>
            {isClosed ? (
              <><Lock className="w-3 h-3 mr-1" />{isEs ? "Cerrado" : "Closed"}</>
            ) : (
              <>{isEs ? "Abierto" : "Open"}</>
            )}
          </Badge>
          <Button variant="outline" size="sm" onClick={fetchPeriodData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {isEs ? "Actualizar" : "Refresh"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv} data-testid="export-closing-btn">
            <Download className="w-4 h-4 mr-2" />
            {isEs ? "Exportar" : "Export"}
          </Button>
        </div>
      </div>

      {/* Period Selector */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-4 items-center flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-sm">{isEs ? "Año:" : "Year:"}</Label>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">{isEs ? "Mes:" : "Month:"}</Label>
              <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m => <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowPeriodsPanel(!showPeriodsPanel)}
              className="gap-1"
            >
              <Calendar className="w-4 h-4" />
              {isEs ? "Ver Períodos" : "View Periods"}
              {availablePeriods.filter(p => p.status === "open" && p.is_retroactive).length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1">
                  {availablePeriods.filter(p => p.status === "open" && p.is_retroactive).length}
                </Badge>
              )}
            </Button>
            <div className="flex-1" />
            {isClosed ? (
              <Button variant="outline" onClick={() => setShowReopenModal(true)} className="text-amber-600 border-amber-300">
                <Unlock className="w-4 h-4 mr-2" />
                {isEs ? "Reabrir Período" : "Reopen Period"}
              </Button>
            ) : (
              <Button 
                onClick={() => setShowCloseModal(true)} 
                disabled={periodData?.has_blockers}
                className="bg-green-600 hover:bg-green-700"
              >
                <Lock className="w-4 h-4 mr-2" />
                {isEs ? "Cerrar Período" : "Close Period"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Available Periods Panel */}
      {showPeriodsPanel && availablePeriods.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {isEs ? "Períodos con Datos" : "Periods with Data"}
            </CardTitle>
            <CardDescription>
              {isEs ? "Selecciona un período para ver detalles o cerrar" : "Select a period to view details or close"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {availablePeriods.map(period => (
                <div 
                  key={period.period_key}
                  className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                    period.status === "closed" 
                      ? "bg-green-50 border-green-200" 
                      : period.status === "current"
                      ? "bg-blue-50 border-blue-300 ring-2 ring-blue-200"
                      : "bg-white border-slate-200 hover:border-amber-300"
                  } ${selectedYear === period.year && selectedMonth === period.month ? "ring-2 ring-primary" : ""}`}
                  onClick={() => {
                    setSelectedYear(period.year);
                    setSelectedMonth(period.month);
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{period.period_name}</span>
                    <Badge 
                      variant={period.status === "closed" ? "default" : "outline"}
                      className={period.status === "closed" ? "bg-green-600" : period.status === "current" ? "border-blue-400 text-blue-600" : ""}
                    >
                      {period.status === "closed" 
                        ? (isEs ? "Cerrado" : "Closed")
                        : period.status === "current"
                        ? (isEs ? "Actual" : "Current")
                        : (isEs ? "Pendiente" : "Pending")
                      }
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center p-1 bg-green-100 rounded">
                      <p className="text-green-700 font-medium">{formatCurrency(period.sales?.total || 0)}</p>
                      <p className="text-green-600">{period.sales?.count || 0} {isEs ? "ventas" : "sales"}</p>
                    </div>
                    <div className="text-center p-1 bg-blue-100 rounded">
                      <p className="text-blue-700 font-medium">{formatCurrency(period.invoices?.total || 0)}</p>
                      <p className="text-blue-600">{period.invoices?.count || 0} {isEs ? "fact." : "inv."}</p>
                    </div>
                    <div className="text-center p-1 bg-red-100 rounded">
                      <p className="text-red-700 font-medium">{formatCurrency(period.expenses?.total || 0)}</p>
                      <p className="text-red-600">{period.expenses?.count || 0} {isEs ? "gastos" : "exp."}</p>
                    </div>
                  </div>
                  {period.can_close && period.status !== "closed" && (
                    <div className="mt-2 pt-2 border-t">
                      <Button 
                        size="sm" 
                        className="w-full h-7 text-xs bg-amber-500 hover:bg-amber-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedYear(period.year);
                          setSelectedMonth(period.month);
                          setTimeout(() => setShowCloseModal(true), 100);
                        }}
                      >
                        <Lock className="w-3 h-3 mr-1" />
                        {isEs ? "Cerrar Período" : "Close Period"}
                      </Button>
                    </div>
                  )}
                  {!period.can_close && period.status !== "closed" && (
                    <p className="mt-2 text-[10px] text-amber-600 text-center">
                      {isEs ? "Cierre el período anterior primero" : "Close previous period first"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Close Readiness Checklist */}
      <Card className={periodData?.has_blockers ? "border-red-200 bg-red-50/30" : "border-green-200 bg-green-50/30"}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {isEs ? "Lista de Verificación para Cierre" : "Close Readiness Checklist"}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger><HelpCircle className="w-4 h-4 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>{isEs ? "Todos los items deben estar ✅ o ⚠️ para cerrar. Los ❌ bloquean el cierre." : "All items must be ✅ or ⚠️ to close. ❌ items block closing."}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className={`p-3 rounded-lg border ${readiness.receipts_completed?.status === "ok" ? "bg-white" : "bg-amber-50 border-amber-200"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{isEs ? "Recepciones Completas" : "Receipts Completed"}</span>
                {getStatusIcon(readiness.receipts_completed?.status)}
              </div>
              <p className="text-xs text-muted-foreground">
                {readiness.receipts_completed?.count || 0} {isEs ? "recepciones" : "receipts"}
                {readiness.receipts_completed?.issues > 0 && ` • ${readiness.receipts_completed.issues} ${isEs ? "sin costo" : "without cost"}`}
              </p>
            </div>

            <div className={`p-3 rounded-lg border ${readiness.requisitions_recorded?.status === "ok" ? "bg-white" : "bg-amber-50 border-amber-200"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{isEs ? "Requisiciones Registradas" : "Requisitions Recorded"}</span>
                {getStatusIcon(readiness.requisitions_recorded?.status)}
              </div>
              <p className="text-xs text-muted-foreground">
                {readiness.requisitions_recorded?.count || 0} {isEs ? "movimientos" : "movements"}
              </p>
            </div>

            <div className={`p-3 rounded-lg border ${readiness.missing_unit_costs?.status === "block" ? "bg-red-50 border-red-200" : "bg-white"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{isEs ? "Costos Unitarios" : "Unit Costs"}</span>
                {getStatusIcon(readiness.missing_unit_costs?.status)}
              </div>
              <p className="text-xs text-muted-foreground">
                {readiness.missing_unit_costs?.count > 0 
                  ? `${readiness.missing_unit_costs.count} ${isEs ? "items sin costo" : "items missing cost"}`
                  : (isEs ? "Todos completos" : "All complete")
                }
              </p>
            </div>

            <div className={`p-3 rounded-lg border ${readiness.negative_stock?.status === "block" ? "bg-red-50 border-red-200" : "bg-white"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{isEs ? "Stock Negativo" : "Negative Stock"}</span>
                {getStatusIcon(readiness.negative_stock?.status)}
              </div>
              <p className="text-xs text-muted-foreground">
                {readiness.negative_stock?.count > 0 
                  ? `${readiness.negative_stock.count} ${isEs ? "items con stock negativo" : "items with negative stock"}`
                  : (isEs ? "Sin problemas" : "No issues")
                }
              </p>
            </div>

            <div className={`p-3 rounded-lg border ${readiness.adjustments_reviewed?.status === "warning" ? "bg-amber-50 border-amber-200" : "bg-white"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{isEs ? "Ajustes Revisados" : "Adjustments Reviewed"}</span>
                {getStatusIcon(readiness.adjustments_reviewed?.status)}
              </div>
              <p className="text-xs text-muted-foreground">
                {readiness.adjustments_reviewed?.pending > 0 
                  ? `${readiness.adjustments_reviewed.pending} ${isEs ? "pendientes" : "pending"}`
                  : (isEs ? "Todos revisados" : "All reviewed")
                }
              </p>
            </div>

            <div className={`p-3 rounded-lg border ${readiness.unassigned_usage?.status === "warning" ? "bg-amber-50 border-amber-200" : "bg-white"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{isEs ? "Uso Sin Asignar" : "Unassigned Usage"}</span>
                {getStatusIcon(readiness.unassigned_usage?.status)}
              </div>
              <p className="text-xs text-muted-foreground">
                {readiness.unassigned_usage?.count > 0 
                  ? `${readiness.unassigned_usage.count} • ${formatCurrency(readiness.unassigned_usage.value)}`
                  : (isEs ? "Todo asignado" : "All assigned")
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Physical Inventory Check Section - READ ONLY SUMMARY */}
      <Card className={physicalCount?.is_complete ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}>
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowPhysicalCount(!showPhysicalCount)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardList className={`w-5 h-5 ${physicalCount?.is_complete ? "text-green-600" : "text-amber-600"}`} />
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {isEs ? "Verificación de Conteo Físico" : "Physical Count Verification"}
                  {physicalCount?.is_complete ? (
                    <Badge className="bg-green-600">{isEs ? "Verificado" : "Verified"}</Badge>
                  ) : physicalCount?.has_count ? (
                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                      {physicalCount?.summary?.completion_percent || 0}% {isEs ? "completado" : "complete"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      {isEs ? "Sin conteo" : "No count"}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {isEs 
                    ? "Resumen del conteo realizado en Culinary Intelligence" 
                    : "Summary of count performed in Culinary Intelligence"}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {physicalCount?.count_date && (
                <span className="text-xs text-muted-foreground">
                  {isEs ? "Último conteo:" : "Last count:"} {physicalCount.count_date}
                </span>
              )}
              {showPhysicalCount ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </CardHeader>
        
        {showPhysicalCount && (
          <CardContent className="space-y-4">
            {!physicalCount?.has_count ? (
              <div className="text-center py-8 space-y-4">
                <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">
                    {isEs 
                      ? "No hay conteo físico registrado para este período" 
                      : "No physical count recorded for this period"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {isEs 
                      ? "El equipo de almacén debe realizar el conteo en Culinary Intelligence" 
                      : "Warehouse team should perform the count in Culinary Intelligence"}
                  </p>
                </div>
                <Button variant="outline" onClick={() => window.location.href = "/food-ops/physical-count"}>
                  {isEs ? "Ir a Conteo Físico" : "Go to Physical Count"}
                </Button>
              </div>
            ) : (
              <>
                {/* Count Summary - Read Only */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="text-center p-3 bg-white rounded-lg border">
                    <p className="text-2xl font-bold">{physicalCount?.summary?.total_items || 0}</p>
                    <p className="text-xs text-muted-foreground">{isEs ? "Total Items" : "Total Items"}</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-2xl font-bold text-green-700">{physicalCount?.summary?.items_counted || 0}</p>
                    <p className="text-xs text-green-600">{isEs ? "Contados" : "Counted"}</p>
                  </div>
                  <div className="text-center p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-2xl font-bold text-amber-700">{physicalCount?.summary?.items_pending || 0}</p>
                    <p className="text-xs text-amber-600">{isEs ? "Pendientes" : "Pending"}</p>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-2xl font-bold text-red-700">{physicalCount?.summary?.items_with_variance || 0}</p>
                    <p className="text-xs text-red-600">{isEs ? "Con Varianza" : "With Variance"}</p>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-lg font-bold text-purple-700">{formatCurrency(physicalCount?.summary?.total_variance_value || 0)}</p>
                    <p className="text-xs text-purple-600">{isEs ? "Valor Varianza" : "Variance Value"}</p>
                  </div>
                </div>

                {/* Variance Items Table - Read Only (only showing items with variance) */}
                {physicalCount?.summary?.items_with_variance > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      {isEs ? "Items con Varianza" : "Items with Variance"}
                    </h4>
                    <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-muted">
                          <TableRow>
                            <TableHead>{isEs ? "Item" : "Item"}</TableHead>
                            <TableHead className="text-right">{isEs ? "Sistema" : "System"}</TableHead>
                            <TableHead className="text-right">{isEs ? "Conteo" : "Count"}</TableHead>
                            <TableHead className="text-right">{isEs ? "Varianza" : "Variance"}</TableHead>
                            <TableHead className="text-right">{isEs ? "Valor" : "Value"}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(physicalCount?.items || [])
                            .filter(item => item.status === "counted" && Math.abs(item.variance_qty || 0) > 0.01)
                            .map(item => (
                              <TableRow key={item.ingredient_id} className="bg-red-50/50">
                                <TableCell className="font-medium">{item.name}</TableCell>
                                <TableCell className="text-right font-mono">{fmtNum(item.system_qty)} {item.unit}</TableCell>
                                <TableCell className="text-right font-mono">{fmtNum(parseFloat(item.counted_qty))} {item.unit}</TableCell>
                                <TableCell className={`text-right font-mono ${(item.variance_qty || 0) < 0 ? "text-red-600" : "text-green-600"}`}>
                                  {(item.variance_qty || 0) > 0 ? "+" : ""}{fmtNum(item.variance_qty)}
                                </TableCell>
                                <TableCell className={`text-right font-mono ${(item.variance_value || 0) < 0 ? "text-red-600" : "text-amber-600"}`}>
                                  {formatCurrency(item.variance_value || 0)}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t">
                  <Button variant="outline" size="sm" onClick={() => window.location.href = "/food-ops/physical-count"}>
                    {isEs ? "Ver Conteo Completo" : "View Full Count"}
                  </Button>
                  {physicalCount?.has_count && !physicalCount?.applied && (
                    <Button size="sm" onClick={handleApplyCountAdjustments} className="bg-amber-600 hover:bg-amber-700">
                      <Check className="w-4 h-4 mr-2" />
                      {isEs ? "Aplicar Ajustes al Inventario" : "Apply Inventory Adjustments"}
                    </Button>
                  )}
                  {physicalCount?.applied && (
                    <Badge className="bg-green-600">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {isEs ? "Ajustes Aplicados" : "Adjustments Applied"}
                    </Badge>
                  )}
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* Inventory Valuation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={`bg-gradient-to-br ${inventory.opening_editable ? "from-amber-50 to-amber-100 border-amber-300" : "from-slate-50 to-slate-100 border-slate-200"}`}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className={`w-4 h-4 ${inventory.opening_editable ? "text-amber-600" : "text-slate-600"}`} />
              <span className={`text-xs ${inventory.opening_editable ? "text-amber-600" : "text-slate-600"}`}>
                {isEs ? "Inventario Inicial" : "Opening Inventory"}
              </span>
              {inventory.opening_editable && (
                <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400">
                  {isEs ? "Editable" : "Editable"}
                </Badge>
              )}
            </div>
            {inventory.opening_editable ? (
              <div className="space-y-1">
                <Input
                  type="number"
                  step="0.01"
                  value={manualOpeningInventory}
                  onChange={(e) => setManualOpeningInventory(e.target.value)}
                  placeholder="0.00"
                  className="h-8 text-lg font-bold"
                />
                <p className="text-[10px] text-amber-600">
                  {isEs ? "Sin período anterior. Ingrese valor inicial." : "No previous period. Enter opening value."}
                </p>
              </div>
            ) : (
              <p className="text-2xl font-bold text-slate-800">{formatCurrency(inventory.opening_value)}</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <ArrowRight className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-blue-600">{isEs ? "Compras Recibidas" : "Purchases Received"}</span>
            </div>
            <p className="text-2xl font-bold text-blue-800">{formatCurrency(inventory.purchases_received)}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-emerald-600" />
              <span className="text-xs text-emerald-600">{isEs ? "Inventario Final" : "Closing Inventory"}</span>
            </div>
            <p className="text-2xl font-bold text-emerald-800">{formatCurrency(inventory.closing_value)}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Calculator className="w-4 h-4 text-purple-600" />
              <span className="text-xs text-purple-600">{isEs ? "COGS (Calculado)" : "COGS (Calculated)"}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger><HelpCircle className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                  <TooltipContent><p>COGS = {isEs ? "Inicial + Compras - Final" : "Opening + Purchases - Closing"}</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-2xl font-bold text-purple-800">{formatCurrency(inventory.cogs_calculated)}</p>
          </CardContent>
        </Card>
      </div>

      {/* COGS Allocation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            {isEs ? "Asignación de COGS" : "COGS Allocation"}
          </CardTitle>
          <CardDescription>{isEs ? "Separación de COGS directo (eventos) vs overhead" : "Split between direct (event) COGS vs overhead"}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                <div>
                  <p className="text-sm font-medium text-green-800">{isEs ? `COGS de ${term("events", "entity_plural")} (Directo)` : `${term("events", "entity_singular")} COGS (Direct)`}</p>
                  <p className="text-xs text-green-600">{isEs ? "Asignado a eventos específicos" : "Assigned to specific events"}</p>
                </div>
                <p className="text-xl font-bold text-green-700">{formatCurrency(cogs.event_cogs)}</p>
              </div>

              <div className="flex justify-between items-center p-3 bg-amber-50 rounded-lg border border-amber-200">
                <div>
                  <p className="text-sm font-medium text-amber-800">{isEs ? "COGS Overhead (Sin Asignar)" : "Overhead COGS (Unassigned)"}</p>
                  <p className="text-xs text-amber-600">{isEs ? "Ajustes + uso sin evento" : "Adjustments + usage without event"}</p>
                </div>
                <p className="text-xl font-bold text-amber-700">{formatCurrency(cogs.overhead_cogs)}</p>
              </div>

              <div className="flex justify-between items-center p-3 bg-slate-100 rounded-lg border">
                <p className="text-sm font-medium">{isEs ? "Total Asignado" : "Total Allocated"}</p>
                <p className="text-xl font-bold">{formatCurrency(cogs.total_allocated)}</p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">{isEs ? "Señales de Asignación" : "Allocation Signals"}</p>
              
              <div className="flex justify-between items-center p-2 border rounded">
                <span className="text-sm">{isEs ? "Requisiciones sin asignar" : "Unassigned requisitions"}</span>
                <Badge variant={cogs.unassigned_requisitions > 0 ? "destructive" : "secondary"}>
                  {cogs.unassigned_requisitions || 0}
                </Badge>
              </div>

              <div className="flex justify-between items-center p-2 border rounded">
                <span className="text-sm">{isEs ? "Valor de ajustes" : "Adjustments value"}</span>
                <span className="font-mono text-sm">{formatCurrency(cogs.adjustments_value)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reconciliation Banner */}
      <Card className={reconciliation.status === "balanced" ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-amber-50/50"}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {reconciliation.status === "balanced" ? (
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              )}
              <div>
                <p className="font-medium">
                  {reconciliation.status === "balanced" 
                    ? (isEs ? "Reconciliación Balanceada" : "Reconciliation Balanced")
                    : (isEs ? "Brecha de Reconciliación Detectada" : "Reconciliation Gap Detected")
                  }
                </p>
                <p className="text-sm text-muted-foreground">
                  {isEs ? "COGS Calculado" : "Calculated COGS"}: {formatCurrency(reconciliation.calculated_cogs)} | 
                  {isEs ? " Asignado" : " Allocated"}: {formatCurrency(reconciliation.allocated_cogs)}
                  {reconciliation.status !== "balanced" && ` | ${isEs ? "Brecha" : "Gap"}: ${formatCurrency(reconciliation.gap_amount)}`}
                </p>
              </div>
            </div>
            {reconciliation.status !== "balanced" && (
              <Button variant="outline" size="sm">
                <Eye className="w-4 h-4 mr-2" />
                {isEs ? "Revisar Excepciones" : "Review Exceptions"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cash Management */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                {isEs ? "Gestión de Caja" : "Cash Management"}
              </CardTitle>
              <CardDescription>{isEs ? "Snapshot manual de flujo de caja" : "Manual cash flow snapshot"}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowCashModal(true)}>
              <FileText className="w-4 h-4 mr-2" />
              {periodData?.cash_snapshot ? (isEs ? "Editar" : "Edit") : (isEs ? "Agregar" : "Add")}
            </Button>
          </div>
        </CardHeader>
        {periodData?.cash_snapshot && (
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted rounded">
                <p className="text-xs text-muted-foreground">{isEs ? "Caja Inicial" : "Opening Cash"}</p>
                <p className="font-bold">{formatCurrency(periodData.cash_snapshot.opening_cash)}</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded">
                <p className="text-xs text-green-600">{isEs ? "Entradas" : "Cash In"}</p>
                <p className="font-bold text-green-700">{formatCurrency(periodData.cash_snapshot.cash_in)}</p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded">
                <p className="text-xs text-red-600">{isEs ? "Salidas" : "Cash Out"}</p>
                <p className="font-bold text-red-700">{formatCurrency(periodData.cash_snapshot.cash_out)}</p>
              </div>
              <div className="text-center p-3 bg-muted rounded">
                <p className="text-xs text-muted-foreground">{isEs ? "Caja Final" : "Closing Cash"}</p>
                <p className="font-bold">{formatCurrency(periodData.cash_snapshot.closing_cash)}</p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Event Allocation Preview */}
      <Card>
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowAllocation(!showAllocation)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              {isEs ? "Vista Previa de Asignación por Evento" : "Allocation Preview — By Event"}
            </CardTitle>
            {showAllocation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </CardHeader>
        {showAllocation && eventAllocation && (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Evento" : "Event"}</TableHead>
                  <TableHead className="text-right">{isEs ? "COGS Evento" : "Event COGS"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Ingresos" : "Revenue"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Margen" : "Margin"}</TableHead>
                  <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventAllocation.events.map(e => (
                  <TableRow key={e.event_id} className={e.margin_percent < 0 ? "bg-red-50/50" : e.margin_percent < 20 ? "bg-amber-50/30" : ""}>
                    <TableCell className="font-medium">{e.event_name}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(e.event_cogs)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(e.revenue)}</TableCell>
                    <TableCell className="text-right">
                      <span className={e.margin_percent < 0 ? "text-red-600" : e.margin_percent < 20 ? "text-amber-600" : "text-green-600"}>
                        {e.margin_percent.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={e.completeness === "complete" ? "default" : "secondary"} className={e.completeness === "complete" ? "bg-green-600" : ""}>
                        {e.completeness === "complete" ? (isEs ? "Completo" : "Complete") : (isEs ? "Incompleto" : "Incomplete")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="p-4 bg-muted/30 border-t">
              <div className="flex justify-between text-sm">
                <span>{isEs ? "Total eventos" : "Total events"}: {eventAllocation.summary.total_events}</span>
                <span>{isEs ? "Completos" : "Complete"}: {eventAllocation.summary.complete}</span>
                <span>{isEs ? `COGS Total ${term("events", "entity_plural")}` : `Total ${term("events", "entity_singular")} COGS`}: {formatCurrency(eventAllocation.summary.total_event_cogs)}</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Exceptions Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{isEs ? "Excepciones" : "Exceptions"}</CardTitle>
            <div className="flex gap-2">
              <Select value={exceptionFilter} onValueChange={setExceptionFilter}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isEs ? "Todas" : "All"}</SelectItem>
                  <SelectItem value="blocking">{isEs ? "Bloqueantes" : "Blocking"}</SelectItem>
                  <SelectItem value="warnings">{isEs ? "Advertencias" : "Warnings"}</SelectItem>
                  <SelectItem value="resolved">{isEs ? "Resueltas" : "Resolved"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                <TableHead>SKU / Item</TableHead>
                <TableHead className="text-right">{isEs ? "Cantidad" : "Qty"}</TableHead>
                <TableHead className="text-right">{isEs ? "Impacto" : "Impact"}</TableHead>
                <TableHead>{isEs ? "Fuente" : "Source"}</TableHead>
                <TableHead>{isEs ? "Acción" : "Action"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exceptions.slice(0, 15).map(exc => (
                <TableRow key={exc.exception_id} className={exc.severity === "block" ? "bg-red-50/50" : exc.severity === "warning" ? "bg-amber-50/30" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {exc.severity === "block" ? <XCircle className="w-4 h-4 text-red-600" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                      <span className="text-xs capitalize">{exc.type.replace(/_/g, " ")}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{exc.sku}</TableCell>
                  <TableCell className="text-right font-mono">{exc.qty} {exc.unit}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(exc.value_impact)}</TableCell>
                  <TableCell><Badge variant="outline">{exc.source}</Badge></TableCell>
                  <TableCell>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => openFixModal(exc)}
                      className="gap-1"
                    >
                      <Wrench className="w-3 h-3" />
                      {isEs ? "Arreglar" : "Fix"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {exceptions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                    {isEs ? "Sin excepciones pendientes" : "No pending exceptions"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Close Period Modal - Enhanced */}
      <Dialog open={showCloseModal} onOpenChange={setShowCloseModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              {isEs ? "Cerrar Período" : "Close Period"}
            </DialogTitle>
            <DialogDescription>
              {MONTHS.find(m => m.value === selectedMonth)?.label} {selectedYear}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Snapshot Summary Header */}
            <div className="p-4 bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg border">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {isEs ? "Resumen del Período a Cerrar" : "Period Close Summary"}
              </h4>
              
              {/* Inventory & COGS */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="text-center p-2 bg-white rounded border">
                  <p className="text-[10px] text-muted-foreground uppercase">{isEs ? "Inv. Inicial" : "Opening Inv"}</p>
                  <p className="font-bold text-sm">{formatCurrency(inventory.opening_value)}</p>
                </div>
                <div className="text-center p-2 bg-white rounded border">
                  <p className="text-[10px] text-muted-foreground uppercase">{isEs ? "Compras" : "Purchases"}</p>
                  <p className="font-bold text-sm text-blue-600">{formatCurrency(inventory.purchases_received)}</p>
                </div>
                <div className="text-center p-2 bg-white rounded border">
                  <p className="text-[10px] text-muted-foreground uppercase">{isEs ? "Inv. Final" : "Closing Inv"}</p>
                  <p className="font-bold text-sm text-emerald-600">{formatCurrency(inventory.closing_value)}</p>
                </div>
                <div className="text-center p-2 bg-white rounded border">
                  <p className="text-[10px] text-muted-foreground uppercase">COGS</p>
                  <p className="font-bold text-sm text-purple-600">{formatCurrency(inventory.cogs_calculated)}</p>
                </div>
              </div>

              {/* COGS Split */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-2 bg-green-50 rounded border border-green-200">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-green-700">{isEs ? `COGS ${term("events", "entity_plural")}` : `${term("events", "entity_singular")} COGS`}</span>
                    <span className="font-bold text-green-700">{formatCurrency(cogs.event_cogs)}</span>
                  </div>
                </div>
                <div className="p-2 bg-amber-50 rounded border border-amber-200">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-amber-700">{isEs ? "COGS Overhead" : "Overhead COGS"}</span>
                    <span className="font-bold text-amber-700">{formatCurrency(cogs.overhead_cogs)}</span>
                  </div>
                </div>
              </div>

              {/* AR Aging */}
              {periodData?.ar_aging && (
                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <p className="text-xs font-medium text-blue-800 mb-2">{isEs ? "Cuentas por Cobrar (AR)" : "Accounts Receivable (AR)"}</p>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-blue-600">{isEs ? "Corriente" : "Current"}</p>
                      <p className="text-xs font-bold">{formatCurrency(periodData.ar_aging.current)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-blue-600">1-30</p>
                      <p className="text-xs font-bold">{formatCurrency(periodData.ar_aging["1_30"])}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-amber-600">31-60</p>
                      <p className="text-xs font-bold">{formatCurrency(periodData.ar_aging["31_60"])}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-orange-600">61-90</p>
                      <p className="text-xs font-bold">{formatCurrency(periodData.ar_aging["61_90"])}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-red-600">90+</p>
                      <p className="text-xs font-bold">{formatCurrency(periodData.ar_aging["90_plus"])}</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-blue-200 flex justify-between">
                    <span className="text-xs text-blue-800">{isEs ? "Total AR" : "Total AR"}</span>
                    <span className="text-xs font-bold text-blue-800">{formatCurrency(periodData.ar_aging.total)}</span>
                  </div>
                </div>
              )}

              {/* Cash Snapshot if exists */}
              {periodData?.cash_snapshot && (
                <div className="p-3 bg-emerald-50 rounded border border-emerald-200 mt-3">
                  <p className="text-xs font-medium text-emerald-800 mb-2">{isEs ? "Snapshot de Caja" : "Cash Snapshot"}</p>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-emerald-600">{isEs ? "Inicial" : "Opening"}</p>
                      <p className="text-xs font-bold">{formatCurrency(periodData.cash_snapshot.opening_cash)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-green-600">{isEs ? "Entradas" : "In"}</p>
                      <p className="text-xs font-bold text-green-600">{formatCurrency(periodData.cash_snapshot.cash_in)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-red-600">{isEs ? "Salidas" : "Out"}</p>
                      <p className="text-xs font-bold text-red-600">{formatCurrency(periodData.cash_snapshot.cash_out)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-emerald-600">{isEs ? "Final" : "Closing"}</p>
                      <p className="text-xs font-bold">{formatCurrency(periodData.cash_snapshot.closing_cash)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Reconciliation Status */}
            {reconciliation.status !== "balanced" && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">
                    {isEs ? `Brecha de reconciliación: ${formatCurrency(reconciliation.gap_amount)}` : `Reconciliation gap: ${formatCurrency(reconciliation.gap_amount)}`}
                  </span>
                </div>
                <p className="text-xs text-amber-600 mt-1">
                  {isEs ? "Esta brecha se registrará en el snapshot del cierre." : "This gap will be recorded in the close snapshot."}
                </p>
              </div>
            )}

            {/* Warnings Summary */}
            {warningCount > 0 && (
              <div className="p-3 bg-slate-50 border rounded-lg">
                <p className="text-sm text-muted-foreground">
                  {isEs 
                    ? `Hay ${warningCount} advertencias pendientes. Puedes cerrar el período pero se recomienda revisarlas.`
                    : `There are ${warningCount} pending warnings. You can close the period but it's recommended to review them.`
                  }
                </p>
              </div>
            )}

            {/* Close Notes */}
            <div>
              <Label>{isEs ? "Notas de Cierre" : "Close Notes"}</Label>
              <Textarea
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                placeholder={isEs ? "Notas opcionales sobre el cierre..." : "Optional notes about the close..."}
                className="h-20"
              />
            </div>

            {/* Confirmation */}
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="confirm"
                  checked={confirmClose}
                  onCheckedChange={setConfirmClose}
                  className="mt-0.5"
                />
                <Label htmlFor="confirm" className="text-sm leading-tight">
                  {isEs 
                    ? "Confirmo que he revisado los números y estoy listo para cerrar y bloquear este período. Una vez cerrado, los datos de inventario y COGS quedarán fijos."
                    : "I confirm I have reviewed the numbers and I'm ready to close and lock this period. Once closed, inventory and COGS data will be locked."
                  }
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseModal(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleClosePeriod} disabled={!confirmClose} className="bg-green-600 hover:bg-green-700">
              <Lock className="w-4 h-4 mr-2" />
              {isEs ? "Confirmar Cierre" : "Confirm Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen Period Modal */}
      <Dialog open={showReopenModal} onOpenChange={setShowReopenModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Unlock className="w-5 h-5" />
              {isEs ? "Reabrir Período" : "Reopen Period"}
            </DialogTitle>
            <DialogDescription>
              {isEs ? "Solo el Owner puede reabrir períodos cerrados. Se requiere una razón." : "Only Owner can reopen closed periods. A reason is required."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>{isEs ? "Razón para reabrir (mínimo 10 caracteres)" : "Reason for reopening (minimum 10 characters)"}</Label>
              <Textarea
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder={isEs ? "Explica por qué necesitas reabrir este período..." : "Explain why you need to reopen this period..."}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReopenModal(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleReopenPeriod} disabled={reopenReason.length < 10} variant="destructive">
              <Unlock className="w-4 h-4 mr-2" />
              {isEs ? "Reabrir Período" : "Reopen Period"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cash Snapshot Modal */}
      <Dialog open={showCashModal} onOpenChange={setShowCashModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              {isEs ? "Snapshot de Caja" : "Cash Snapshot"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isEs ? "Caja Inicial" : "Opening Cash"}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={cashForm.opening_cash}
                  onChange={(e) => setCashForm({ ...cashForm, opening_cash: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>{isEs ? "Caja Final" : "Closing Cash"}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={cashForm.closing_cash}
                  onChange={(e) => setCashForm({ ...cashForm, closing_cash: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>{isEs ? "Entradas de Caja" : "Cash In"}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={cashForm.cash_in}
                  onChange={(e) => setCashForm({ ...cashForm, cash_in: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>{isEs ? "Salidas de Caja" : "Cash Out"}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={cashForm.cash_out}
                  onChange={(e) => setCashForm({ ...cashForm, cash_out: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div>
              <Label>{isEs ? "Notas" : "Notes"}</Label>
              <Textarea
                value={cashForm.notes}
                onChange={(e) => setCashForm({ ...cashForm, notes: e.target.value })}
                placeholder={isEs ? "Notas opcionales..." : "Optional notes..."}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCashModal(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleSaveCashSnapshot}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fix Exception Modal */}
      <Dialog open={showFixModal} onOpenChange={setShowFixModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5" />
              {isEs ? "Resolver Excepción" : "Fix Exception"}
            </DialogTitle>
            <DialogDescription>
              {selectedExc?.sku} - {selectedExc?.type?.replace(/_/g, " ")}
            </DialogDescription>
          </DialogHeader>
          
          {selectedExc && (
            <div className="space-y-4">
              {/* Summary of the exception */}
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{isEs ? "Cantidad:" : "Quantity:"}</span>
                  <span className="font-mono">{selectedExc.qty} {selectedExc.unit}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{isEs ? "Impacto:" : "Impact:"}</span>
                  <span className="font-mono">{formatCurrency(selectedExc.value_impact)}</span>
                </div>
              </div>

              {/* Fix options based on exception type */}
              {selectedExc.type === "missing_cost" && (
                <div className="space-y-3">
                  <div className="p-3 border rounded-lg bg-blue-50/50">
                    <p className="text-sm font-medium mb-2">{isEs ? "Establecer Costo Unitario" : "Set Unit Cost"}</p>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={fixForm.unit_cost || ""}
                        onChange={(e) => setFixForm({ ...fixForm, unit_cost: parseFloat(e.target.value) || 0 })}
                      />
                      <Button onClick={handleFixMissingCost} disabled={!fixForm.unit_cost}>
                        {isEs ? "Actualizar" : "Update"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {selectedExc.type === "negative_stock" && (
                <div className="space-y-3">
                  <div className="p-3 border rounded-lg bg-amber-50/50">
                    <p className="text-sm font-medium mb-2">{isEs ? "Ajustar Stock" : "Adjust Stock"}</p>
                    <p className="text-xs text-muted-foreground mb-2">
                      {isEs ? `Stock actual: ${selectedExc.qty}. Ingresa la cantidad correcta:` : `Current stock: ${selectedExc.qty}. Enter correct quantity:`}
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0"
                        value={fixForm.adjustment_qty || ""}
                        onChange={(e) => setFixForm({ ...fixForm, adjustment_qty: parseFloat(e.target.value) || 0 })}
                      />
                      <Button onClick={handleFixNegativeStock}>
                        {isEs ? "Ajustar" : "Adjust"}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label>{isEs ? "Notas del ajuste" : "Adjustment notes"}</Label>
                    <Textarea
                      value={fixForm.resolution_notes}
                      onChange={(e) => setFixForm({ ...fixForm, resolution_notes: e.target.value })}
                      placeholder={isEs ? "Razón del ajuste..." : "Reason for adjustment..."}
                    />
                  </div>
                </div>
              )}

              {selectedExc.type === "unassigned" && (
                <Tabs defaultValue="assign" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="assign">{isEs ? "Asignar a Evento" : "Assign to Event"}</TabsTrigger>
                    <TabsTrigger value="categorize">{isEs ? "Categorizar" : "Categorize"}</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="assign" className="space-y-3 mt-4">
                    <div className="p-3 border rounded-lg bg-green-50/50">
                      <p className="text-sm font-medium mb-2">{isEs ? "Seleccionar Evento" : "Select Event"}</p>
                      <Select value={fixForm.assigned_event_id} onValueChange={(v) => setFixForm({ ...fixForm, assigned_event_id: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder={isEs ? "Selecciona un evento..." : "Select an event..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {events.slice(0, 20).map(e => (
                            <SelectItem key={e.event_id} value={e.event_id}>
                              {e.event_name || e.name} {e.event_date ? `(${e.event_date})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={handleAssignToEvent} disabled={!fixForm.assigned_event_id} className="mt-2 w-full">
                        {isEs ? "Asignar" : "Assign"}
                      </Button>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="categorize" className="space-y-3 mt-4">
                    <div className="p-3 border rounded-lg bg-amber-50/50">
                      <p className="text-sm font-medium mb-2">{isEs ? "Categorizar como Overhead" : "Categorize as Overhead"}</p>
                      <Select value={fixForm.categorization} onValueChange={(v) => setFixForm({ ...fixForm, categorization: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder={isEs ? "Selecciona categoría..." : "Select category..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIZATIONS.map(c => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={handleCategorizeOverhead} disabled={!fixForm.categorization} className="mt-2 w-full">
                        {isEs ? "Categorizar" : "Categorize"}
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              )}

              <div>
                <Label>{isEs ? "Notas de Resolución" : "Resolution Notes"}</Label>
                <Textarea
                  value={fixForm.resolution_notes}
                  onChange={(e) => setFixForm({ ...fixForm, resolution_notes: e.target.value })}
                  placeholder={isEs ? "Notas opcionales..." : "Optional notes..."}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFixModal(false)}>
              {isEs ? "Cerrar" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
