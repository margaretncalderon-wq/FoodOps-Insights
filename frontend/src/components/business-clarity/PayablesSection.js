import { useState, useEffect } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Label } from "../ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import {
  FileText, RefreshCw, Calendar, Building2, AlertCircle, HelpCircle, Info, Target
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PayablesSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [data, setData] = useState(null);
  const [events, setEvents] = useState([]);
  const [fixedCostCategories, setFixedCostCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedPayable, setSelectedPayable] = useState(null);
  const [assignmentType, setAssignmentType] = useState("event");
  const [selectedEvent, setSelectedEvent] = useState("");
  const [selectedCostCenter, setSelectedCostCenter] = useState("");
  const [selectedFixedCostCategory, setSelectedFixedCostCategory] = useState("");

  const COST_CENTERS = [
    { value: "operations", label: "Operations", labelEs: "Operaciones" },
    { value: "kitchen", label: "Kitchen", labelEs: "Cocina" },
    { value: "service", label: "Service", labelEs: "Servicio" },
    { value: "logistics", label: "Logistics", labelEs: "Logística" },
    { value: "admin", label: "Administration", labelEs: "Administración" },
    { value: "marketing", label: "Marketing", labelEs: "Marketing" },
    { value: "other", label: "Other", labelEs: "Otros" },
  ];

  const fetchData = async () => {
    setLoading(true);
    try {
      const [payablesRes, eventsRes, categoriesRes] = await Promise.all([
        axios.get(`${API}/api/business-clarity/accounts-payable`, { withCredentials: true }),
        axios.get(`${API}/api/events`, { withCredentials: true }),
        axios.get(`${API}/api/business-clarity/fixed-costs/categories`, { withCredentials: true })
      ]);
      setData(payablesRes.data);
      setEvents(eventsRes.data || []);
      setFixedCostCategories(categoriesRes.data || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleAssignCost = (payable) => {
    setSelectedPayable(payable);
    setAssignmentType(payable.event_id ? "event" : payable.fixed_cost_category_id ? "fixed_cost" : "cost_center");
    setSelectedEvent(payable.event_id || "");
    setSelectedCostCenter(payable.cost_center || "");
    setSelectedFixedCostCategory(payable.fixed_cost_category_id || "");
    setAssignDialogOpen(true);
  };

  const handleSaveAssignment = async () => {
    if (!selectedPayable) return;
    
    try {
      const updateData = {
        event_id: assignmentType === "event" ? selectedEvent : null,
        cost_center: assignmentType === "cost_center" ? selectedCostCenter : null,
        fixed_cost_category_id: assignmentType === "fixed_cost" ? selectedFixedCostCategory : null
      };
      
      await axios.put(
        `${API}/api/business-clarity/payables/${selectedPayable.payable_id}/assign`,
        updateData,
        { withCredentials: true }
      );
      
      toast.success(isEs ? "Costo asignado correctamente" : "Cost assigned successfully");
      setAssignDialogOpen(false);
      setSelectedPayable(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error assigning cost");
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  const unassignedRecords = (data?.records || []).filter(r => !r.event_id && !r.cost_center && !r.fixed_cost_category_id);
  const unassignedTotal = unassignedRecords.reduce((sum, r) => sum + (r.balance_due || 0), 0);

  const getCategoryName = (categoryId) => {
    const cat = fixedCostCategories.find(c => c.category_id === categoryId);
    return cat?.name || categoryId;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{isEs ? "Cuentas por Pagar" : "Accounts Payable"}</h2>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="gap-1">
                <Info className="w-3 h-3" />
                {isEs ? "Fuga de Margen" : "Margin Leakage"}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>{isEs 
                ? "Los costos sin evento asignado afectan el margen global pero no aparecen en la rentabilidad de eventos específicos." 
                : "Costs without an assigned event affect global margin but don't appear in specific event profitability."}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Total Pendiente" : "Total Pending"}</p><p className="text-xl font-bold text-orange-600">{formatCurrency(data?.summary?.total_pending)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Total Pagado" : "Total Paid"}</p><p className="text-xl font-bold text-green-600">{formatCurrency(data?.summary?.total_paid)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{isEs ? "Facturas Pendientes" : "Pending Invoices"}</p><p className="text-xl font-bold">{data?.summary?.pending_count || 0}</p></CardContent></Card>
        <Card className={unassignedTotal > 0 ? "border-purple-200 bg-purple-50/50" : ""}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-1">
              <p className="text-xs text-muted-foreground">{isEs ? "Sin Asignar (Overhead)" : "Unassigned (Overhead)"}</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger><AlertCircle className="w-3 h-3 text-purple-500" /></TooltipTrigger>
                  <TooltipContent><p>{isEs ? "Afecta margen global, no eventos" : "Affects global margin, not events"}</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className={`text-xl font-bold ${unassignedTotal > 0 ? "text-purple-600" : "text-muted-foreground"}`}>{formatCurrency(unassignedTotal)}</p>
            {unassignedTotal > 0 && <p className="text-xs text-purple-500 mt-1">{unassignedRecords.length} {isEs ? "registros" : "records"}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Proveedor" : "Supplier"}</TableHead>
                <TableHead>{isEs ? "Descripción" : "Description"}</TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    {isEs ? "Asignación" : "Assignment"}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger><HelpCircle className="w-3 h-3 text-muted-foreground" /></TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>{isEs ? "Asigna a un evento, centro de costo, o categoría de costo fijo" : "Assign to an event, cost center, or fixed cost category"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableHead>
                <TableHead className="text-right">{isEs ? "Monto" : "Amount"}</TableHead>
                <TableHead className="text-right">{isEs ? "Saldo" : "Balance"}</TableHead>
                <TableHead>{isEs ? "Acciones" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.records || []).map((rec) => {
                const isUnassigned = !rec.event_id && !rec.cost_center && !rec.fixed_cost_category_id;
                const hasFixedCostCategory = rec.fixed_cost_category_id && !rec.event_id;
                const hasCostCenter = rec.cost_center && !rec.event_id && !rec.fixed_cost_category_id;
                return (
                  <TableRow key={rec.payable_id} className={isUnassigned ? "bg-purple-50/30" : ""}>
                    <TableCell>{rec.supplier_name || "-"}</TableCell>
                    <TableCell>{rec.description || "-"}</TableCell>
                    <TableCell>
                      {rec.event_id ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="text-xs">{rec.event_name}</Badge>
                          <span className="text-xs text-muted-foreground">{isEs ? "→ Margen Evento" : "→ Event Margin"}</span>
                        </div>
                      ) : hasFixedCostCategory ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-xs">
                            <Target className="w-3 h-3 mr-1" />
                            {getCategoryName(rec.fixed_cost_category_id)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{isEs ? "→ Presupuesto" : "→ Budget"}</span>
                        </div>
                      ) : hasCostCenter ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                            {COST_CENTERS.find(c => c.value === rec.cost_center)?.[isEs ? "labelEs" : "label"] || rec.cost_center}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{isEs ? "→ Overhead" : "→ Overhead"}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-xs">{isEs ? "Sin Asignar" : "Unassigned"}</Badge>
                          <span className="text-xs text-purple-600">{isEs ? "⚠️ Fuga de margen" : "⚠️ Margin leakage"}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(rec.amount)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(rec.balance_due)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleAssignCost(rec)} title={isEs ? "Asignar costo" : "Assign cost"}>
                          <FileText className="w-4 h-4" />
                        </Button>
                        <Badge variant={rec.status === "paid" ? "default" : "outline"}>
                          {rec.status === "paid" ? (isEs ? "Pagado" : "Paid") : (isEs ? "Pendiente" : "Pending")}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(data?.records || []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{isEs ? "Sin registros" : "No records"}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Margin Leakage Warning */}
      {unassignedTotal > 0 && (
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <p className="font-medium text-purple-800">{isEs ? "Fuga de Margen Detectada" : "Margin Leakage Detected"}</p>
                <p className="text-sm text-purple-600 mt-1">
                  {isEs 
                    ? `Hay ${formatCurrency(unassignedTotal)} en costos no asignados. Asigna a: Evento (afecta margen), Categoría de Costo Fijo (para presupuesto), o Centro de Costo (overhead).`
                    : `There's ${formatCurrency(unassignedTotal)} in unassigned costs. Assign to: Event (affects margin), Fixed Cost Category (for budget), or Cost Center (overhead).`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assign Cost Dialog - Enhanced with Fixed Cost Categories */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEs ? "Asignar Costo" : "Assign Cost"}</DialogTitle>
            <DialogDescription>
              {selectedPayable && <span className="font-medium">{selectedPayable.supplier_name}: {formatCurrency(selectedPayable.amount)}</span>}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Assignment Type Toggle - Now with 3 options */}
            <div className="grid grid-cols-3 gap-2">
              <Button variant={assignmentType === "event" ? "default" : "outline"} className="flex-1" onClick={() => setAssignmentType("event")}>
                <Calendar className="w-4 h-4 mr-1" />
                {isEs ? "Evento" : "Event"}
              </Button>
              <Button variant={assignmentType === "fixed_cost" ? "default" : "outline"} className="flex-1" onClick={() => setAssignmentType("fixed_cost")}>
                <Target className="w-4 h-4 mr-1" />
                {isEs ? "Costo Fijo" : "Fixed Cost"}
              </Button>
              <Button variant={assignmentType === "cost_center" ? "default" : "outline"} className="flex-1" onClick={() => setAssignmentType("cost_center")}>
                <Building2 className="w-4 h-4 mr-1" />
                {isEs ? "Centro" : "Center"}
              </Button>
            </div>

            {/* Event Selection */}
            {assignmentType === "event" && (
              <div>
                <Label>{isEs ? "Seleccionar Evento" : "Select Event"}</Label>
                <Select value={selectedEvent} onValueChange={setSelectedEvent}>
                  <SelectTrigger><SelectValue placeholder={isEs ? "Selecciona un evento..." : "Select an event..."} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin evento" : "No event"}</SelectItem>
                    {events.map(e => <SelectItem key={e.event_id} value={e.event_id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">{isEs ? "Este costo afectará el margen del evento" : "This cost will affect the event's margin"}</p>
              </div>
            )}

            {/* Fixed Cost Category Selection - NEW */}
            {assignmentType === "fixed_cost" && (
              <div>
                <Label>{isEs ? "Categoría de Costo Fijo" : "Fixed Cost Category"}</Label>
                <Select value={selectedFixedCostCategory} onValueChange={setSelectedFixedCostCategory}>
                  <SelectTrigger><SelectValue placeholder={isEs ? "Selecciona categoría..." : "Select category..."} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin categoría" : "No category"}</SelectItem>
                    {fixedCostCategories.filter(c => c.active).map(c => (
                      <SelectItem key={c.category_id} value={c.category_id}>
                        <div className="flex items-center gap-2">
                          <Target className="w-3 h-3" />
                          {c.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-emerald-600 mt-1">
                  {isEs ? "✓ Se incluirá en el análisis Presupuesto vs Real" : "✓ Will be included in Budget vs Actual analysis"}
                </p>
              </div>
            )}

            {/* Cost Center Selection */}
            {assignmentType === "cost_center" && (
              <div>
                <Label>{isEs ? "Centro de Costo" : "Cost Center"}</Label>
                <Select value={selectedCostCenter} onValueChange={setSelectedCostCenter}>
                  <SelectTrigger><SelectValue placeholder={isEs ? "Selecciona centro..." : "Select center..."} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "Sin asignar" : "Unassigned"}</SelectItem>
                    {COST_CENTERS.map(cc => <SelectItem key={cc.value} value={cc.value}>{isEs ? cc.labelEs : cc.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">{isEs ? "Overhead clasificado (reportes globales)" : "Classified overhead (global reports)"}</p>
              </div>
            )}

            {/* Impact Explanation */}
            <Card className="bg-slate-50">
              <CardContent className="pt-3 pb-3">
                <p className="text-xs text-muted-foreground">
                  {assignmentType === "event" 
                    ? (isEs ? "📊 El costo se incluirá en el cálculo de rentabilidad del evento." : "📊 Cost included in event profitability calculation.")
                    : assignmentType === "fixed_cost"
                      ? (isEs ? "📊 El costo se comparará contra el presupuesto de la categoría." : "📊 Cost will be compared against the category budget.")
                      : (isEs ? "📊 El costo se clasifica como overhead general." : "📊 Cost is classified as general overhead.")
                  }
                </p>
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>{isEs ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleSaveAssignment}>{isEs ? "Guardar" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
