import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
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
  Tag, Bell, BellRing, Calendar
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CloseReconciliationSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [periodData, setPeriodData] = useState(null);
  const [exceptions, setExceptions] = useState([]);
  const [eventAllocation, setEventAllocation] = useState(null);
  const [events, setEvents] = useState([]);
  
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [showFixModal, setShowFixModal] = useState(false);
  const [showAlertBanner, setShowAlertBanner] = useState(true);
  
  const [closeNotes, setCloseNotes] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [showAllocation, setShowAllocation] = useState(false);
  const [exceptionFilter, setExceptionFilter] = useState("all");
  
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
      const [periodRes, exceptionsRes, allocationRes, eventsRes] = await Promise.all([
        axios.get(`${API}/api/business-clarity/period-close/${selectedYear}/${selectedMonth}`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/period-close/${selectedYear}/${selectedMonth}/exceptions?filter_type=${exceptionFilter}`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/period-close/${selectedYear}/${selectedMonth}/event-allocation`, { withCredentials: true }),
        axios.get(`${API}/api/events`, { withCredentials: true }).catch(() => ({ data: [] }))
      ]);
      setPeriodData(periodRes.data);
      setExceptions(exceptionsRes.data?.exceptions || []);
      setEventAllocation(allocationRes.data);
      setEvents(Array.isArray(eventsRes.data) ? eventsRes.data : eventsRes.data?.events || []);
      
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
      await axios.post(
        `${API}/api/business-clarity/period-close/${selectedYear}/${selectedMonth}/close?notes=${encodeURIComponent(closeNotes)}`,
        {},
        { withCredentials: true }
      );
      toast.success(isEs ? "Período cerrado exitosamente" : "Period closed successfully");
      setShowCloseModal(false);
      setCloseNotes("");
      setConfirmClose(false);
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
      await axios.put(
        `${API}/api/inventory/${selectedExc.item_id}`,
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
      // Create a stock adjustment to fix negative
      await axios.post(
        `${API}/api/inventory/${selectedExc.item_id}/adjust`,
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
      // Fallback to direct update if adjust endpoint doesn't exist
      try {
        await axios.put(
          `${API}/api/inventory/${selectedExc.item_id}`,
          { stock_quantity: fixForm.adjustment_qty },
          { withCredentials: true }
        );
        toast.success(isEs ? "Stock actualizado" : "Stock updated");
        setShowFixModal(false);
        fetchPeriodData();
      } catch (err2) {
        toast.error(err2.response?.data?.detail || "Error");
      }
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
        <RefreshCw className="w-8 h-8 animate-spin" />
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
          <Button variant="outline" size="sm">
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

      {/* Inventory Valuation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-slate-600" />
              <span className="text-xs text-slate-600">{isEs ? "Inventario Inicial" : "Opening Inventory"}</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{formatCurrency(inventory.opening_value)}</p>
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
                  <p className="text-sm font-medium text-green-800">{isEs ? "COGS de Eventos (Directo)" : "Event COGS (Direct)"}</p>
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
                <span>{isEs ? "COGS Total Eventos" : "Total Event COGS"}: {formatCurrency(eventAllocation.summary.total_event_cogs)}</span>
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

      {/* Close Period Modal */}
      <Dialog open={showCloseModal} onOpenChange={setShowCloseModal}>
        <DialogContent className="max-w-lg">
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
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground">{isEs ? "Inventario Final" : "Closing Inventory"}</p>
                <p className="font-bold">{formatCurrency(inventory.closing_value)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{isEs ? "COGS Total" : "Total COGS"}</p>
                <p className="font-bold">{formatCurrency(inventory.cogs_calculated)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{isEs ? "COGS Eventos" : "Event COGS"}</p>
                <p className="font-bold text-green-600">{formatCurrency(cogs.event_cogs)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{isEs ? "COGS Overhead" : "Overhead COGS"}</p>
                <p className="font-bold text-amber-600">{formatCurrency(cogs.overhead_cogs)}</p>
              </div>
            </div>

            {reconciliation.status !== "balanced" && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">
                    {isEs ? `Brecha de reconciliación: ${formatCurrency(reconciliation.gap_amount)}` : `Reconciliation gap: ${formatCurrency(reconciliation.gap_amount)}`}
                  </span>
                </div>
              </div>
            )}

            <div>
              <Label>{isEs ? "Notas de Cierre" : "Close Notes"}</Label>
              <Textarea
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                placeholder={isEs ? "Notas opcionales sobre el cierre..." : "Optional notes about the close..."}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="confirm"
                checked={confirmClose}
                onCheckedChange={setConfirmClose}
              />
              <Label htmlFor="confirm" className="text-sm">
                {isEs ? "Confirmo que estoy listo para cerrar y bloquear este período" : "I confirm I'm ready to close and lock this period"}
              </Label>
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
