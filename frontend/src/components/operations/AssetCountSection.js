import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import {
  ClipboardList, Search, Check, RefreshCw, Download, AlertTriangle,
  CheckCircle2, Package, Calendar, Boxes, XCircle, DollarSign, Receipt, User
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function AssetCountSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [assetCount, setAssetCount] = useState(null);
  const [countItems, setCountItems] = useState([]);
  const [countFilter, setCountFilter] = useState("all");
  const [countSearch, setCountSearch] = useState("");
  
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  // Loss registration state
  const [lossDialogOpen, setLossDialogOpen] = useState(false);
  const [selectedLossItem, setSelectedLossItem] = useState(null);
  const [lossForm, setLossForm] = useState({
    quantity: 1,
    reason: "lost", // lost, damaged, stolen
    resolution: "operational_expense", // operational_expense, bill_client
    client_id: "",
    event_id: "",
    notes: ""
  });
  const [events, setEvents] = useState([]);
  const [clients, setClients] = useState([]);

  const LOSS_REASONS = [
    { value: "lost", label: isEs ? "Perdido" : "Lost" },
    { value: "damaged", label: isEs ? "Dañado" : "Damaged" },
    { value: "stolen", label: isEs ? "Robado" : "Stolen" },
    { value: "broken", label: isEs ? "Roto" : "Broken" }
  ];

  const RESOLUTION_OPTIONS = [
    { value: "operational_expense", label: isEs ? "Gasto Operacional" : "Operational Expense", icon: DollarSign },
    { value: "bill_client", label: isEs ? "Facturar al Cliente" : "Bill to Client", icon: Receipt }
  ];

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Try to get existing count
      const res = await axios.get(
        `${API}/api/ops-supplies/asset-count/${selectedYear}/${selectedMonth}`,
        { withCredentials: true }
      );
      setAssetCount(res.data);
      setCountItems(res.data?.items || []);
    } catch (err) {
      // Initialize with empty if no count exists - load operational supplies from inventory
      setAssetCount(null);
      try {
        // Fetch both inventory and delivery notes
        const [invRes, deliveryRes] = await Promise.all([
          axios.get(`${API}/api/inventory/ingredients`, { withCredentials: true }),
          axios.get(`${API}/api/delivery-notes`, { withCredentials: true })
        ]);
        
        // Calculate items currently out (from active delivery notes)
        const itemsOut = {};
        (deliveryRes.data || []).forEach(note => {
          // Only count items from notes that are checked out but not fully returned
          if (note.status === "checked_out" || note.status === "partial_return") {
            (note.items || []).forEach(item => {
              const itemId = item.item_id;
              if (!itemsOut[itemId]) {
                itemsOut[itemId] = 0;
              }
              // Add qty_out minus qty_returned
              const outQty = (item.qty_out || 0) - (item.qty_returned || 0);
              itemsOut[itemId] += outQty;
            });
          }
        });
        
        const items = (invRes.data || [])
          .filter(inv => {
            const category = (inv.category || "").toLowerCase();
            const invType = (inv.inventory_type || "").toLowerCase();
            // Include items that are operational (not food)
            // Filter by inventory_type first (most reliable)
            if (invType === "equipment" || invType === "operational" || invType === "event_supply" || invType === "disposable") {
              return true;
            }
            // Exclude food items
            if (invType === "food") {
              return false;
            }
            // Then check categories that are typically operational
            const opsCategories = ["equipment", "linens", "decor", "furniture", "tableware", "audiovisual", 
                                   "kitchen equipment", "serving equipment", "tables_chairs", "serving", 
                                   "kitchen", "transport", "cleaning", "packaging", "containers", "bags", "cups", "other"];
            return opsCategories.some(oc => category.includes(oc.toLowerCase()));
          })
          .map(inv => {
            const itemId = inv.item_id || inv.ingredient_id;
            const totalQty = inv.stock_quantity || inv.total_quantity || inv.quantity || 0;
            const currentlyOut = itemsOut[itemId] || 0;
            const availableQty = Math.max(0, totalQty - currentlyOut);
            
            return {
              item_id: itemId,
              name: inv.name,
              category: inv.category || "General",
              sku: inv.sku || "",
              system_qty: totalQty,
              currently_out: currentlyOut,
              available_qty: availableQty,
              unit_value: inv.cost_per_unit || inv.unit_cost || inv.purchase_price || 0,
              counted_qty: "",
              variance_qty: 0,
              variance_value: 0,
              condition: inv.condition || "Good",
              status: "pending"
            };
          });
        setCountItems(items);
      } catch (e) {
        console.error(e);
      }
    }
    setLoading(false);
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Update count item - variance is calculated against available_qty (what should be in warehouse)
  const updateCountItem = (itemId, value) => {
    setCountItems(prev => prev.map(item => {
      if ((item.item_id || item.ingredient_id) === itemId) {
        const countedQty = value === "" ? "" : parseInt(value) || 0;
        // Variance = counted - available (what should be in warehouse, not total)
        const varianceQty = countedQty === "" ? 0 : countedQty - item.available_qty;
        const varianceValue = varianceQty * (item.unit_value || 0);
        return {
          ...item,
          counted_qty: value,
          variance_qty: varianceQty,
          variance_value: varianceValue,
          status: value !== "" ? "counted" : "pending"
        };
      }
      return item;
    }));
  };

  // Filter items
  const filteredCountItems = countItems.filter(item => {
    const matchesSearch = !countSearch || 
      item.name?.toLowerCase().includes(countSearch.toLowerCase()) ||
      item.category?.toLowerCase().includes(countSearch.toLowerCase()) ||
      item.sku?.toLowerCase().includes(countSearch.toLowerCase());
    
    const matchesFilter = countFilter === "all" ||
      (countFilter === "pending" && item.status === "pending") ||
      (countFilter === "counted" && item.status === "counted") ||
      (countFilter === "variance" && item.status === "counted" && item.variance_qty !== 0);
    
    return matchesSearch && matchesFilter;
  });

  // Calculate summary
  const summary = {
    total_items: countItems.length,
    items_counted: countItems.filter(i => i.status === "counted").length,
    items_pending: countItems.filter(i => i.status === "pending").length,
    items_with_variance: countItems.filter(i => i.status === "counted" && i.variance_qty !== 0).length,
    missing_items: countItems.filter(i => i.status === "counted" && i.variance_qty < 0).length,
    total_asset_value: countItems.reduce((sum, i) => sum + (i.system_qty * (i.unit_value || 0)), 0),
    total_variance_value: countItems.reduce((sum, i) => sum + (i.variance_value || 0), 0),
    completion_percent: countItems.length > 0 
      ? Math.round((countItems.filter(i => i.status === "counted").length / countItems.length) * 100) 
      : 0
  };

  // Save count
  const handleSaveCount = async () => {
    try {
      await axios.post(
        `${API}/api/ops-supplies/asset-count/${selectedYear}/${selectedMonth}`,
        { items: countItems, count_date: new Date().toISOString().split('T')[0] },
        { withCredentials: true }
      );
      toast.success(isEs ? "Conteo de activos guardado" : "Asset count saved");
      fetchData();
    } catch (err) {
      toast.error(isEs ? "Error al guardar" : "Failed to save");
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ["Item", "SKU", "Category", "System Qty", "Available", "Counted", "Variance", "Unit Value", "Variance Value", "Status"];
    const rows = countItems.map(item => [
      item.name,
      item.sku || "",
      item.category,
      item.system_qty,
      item.available_qty || item.system_qty,
      item.counted_qty || "",
      item.variance_qty || 0,
      item.unit_value || 0,
      item.variance_value || 0,
      item.status
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `asset_count_${selectedYear}_${selectedMonth}.csv`;
    link.click();
  };

  // Fetch events and clients for loss registration
  const fetchEventsAndClients = async () => {
    try {
      const [eventsRes, clientsRes] = await Promise.all([
        axios.get(`${API}/api/events`, { withCredentials: true }),
        axios.get(`${API}/api/clients`, { withCredentials: true })
      ]);
      setEvents(eventsRes.data || []);
      setClients(clientsRes.data || []);
    } catch (err) {
      console.error("Error fetching events/clients:", err);
    }
  };

  // Open loss dialog for an item
  const openLossDialog = (item) => {
    setSelectedLossItem(item);
    setLossForm({
      quantity: Math.abs(item.variance_qty) || 1,
      reason: "lost",
      resolution: "operational_expense",
      client_id: "",
      event_id: "",
      notes: ""
    });
    fetchEventsAndClients();
    setLossDialogOpen(true);
  };

  // Register asset loss
  const handleRegisterLoss = async () => {
    if (!selectedLossItem) return;
    
    try {
      await axios.post(`${API}/api/ops-supplies/asset-loss`, {
        item_id: selectedLossItem.item_id || selectedLossItem.ingredient_id,
        item_name: selectedLossItem.name,
        quantity: lossForm.quantity,
        unit_value: selectedLossItem.unit_value || 0,
        total_value: lossForm.quantity * (selectedLossItem.unit_value || 0),
        reason: lossForm.reason,
        resolution: lossForm.resolution,
        client_id: lossForm.resolution === "bill_client" ? lossForm.client_id : null,
        event_id: lossForm.event_id && lossForm.event_id !== "none" ? lossForm.event_id : null,
        notes: lossForm.notes,
        count_period: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`
      }, { withCredentials: true });
      
      toast.success(isEs ? "Pérdida registrada" : "Loss registered");
      setLossDialogOpen(false);
      setSelectedLossItem(null);
    } catch (err) {
      toast.error(isEs ? "Error al registrar pérdida" : "Failed to register loss");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Period Selector */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Boxes className="w-5 h-5" />
            {isEs ? "Conteo de Activos Operativos" : "Operational Asset Count"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs 
              ? "Verificación mensual de equipos, mobiliario y suministros" 
              : "Monthly verification of equipment, furniture & supplies"}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map(m => (
                  <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026, 2027].map(y => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <Package className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-2xl font-bold">{summary.total_items}</p>
            <p className="text-xs text-muted-foreground">{isEs ? "Total Activos" : "Total Assets"}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="pt-4 text-center">
            <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-green-600" />
            <p className="text-2xl font-bold text-green-700">{summary.items_counted}</p>
            <p className="text-xs text-green-600">{isEs ? "Contados" : "Counted"}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-4 text-center">
            <RefreshCw className="w-6 h-6 mx-auto mb-2 text-amber-600" />
            <p className="text-2xl font-bold text-amber-700">{summary.items_pending}</p>
            <p className="text-xs text-amber-600">{isEs ? "Pendientes" : "Pending"}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="pt-4 text-center">
            <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-600" />
            <p className="text-2xl font-bold text-red-700">{summary.missing_items}</p>
            <p className="text-xs text-red-600">{isEs ? "Faltantes" : "Missing"}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pt-4 text-center">
            <p className="text-lg font-bold text-blue-700">{formatCurrency(summary.total_asset_value)}</p>
            <p className="text-xs text-blue-600">{isEs ? "Valor Total" : "Total Value"}</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/50">
          <CardContent className="pt-4 text-center">
            <p className="text-lg font-bold text-purple-700">{formatCurrency(summary.total_variance_value)}</p>
            <p className="text-xs text-purple-600">{isEs ? "Var. Valor" : "Variance"}</p>
            <Badge className="mt-1" variant={summary.completion_percent === 100 ? "default" : "outline"}>
              {summary.completion_percent}%
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={isEs ? "Buscar activo..." : "Search asset..."}
            value={countSearch}
            onChange={(e) => setCountSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={countFilter} onValueChange={setCountFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
            <SelectItem value="pending">{isEs ? "Pendientes" : "Pending"}</SelectItem>
            <SelectItem value="counted">{isEs ? "Contados" : "Counted"}</SelectItem>
            <SelectItem value="variance">{isEs ? "Con Diferencia" : "With Variance"}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportToCSV}>
          <Download className="w-4 h-4 mr-2" />
          CSV
        </Button>
        <Button size="sm" onClick={handleSaveCount} className="bg-indigo-600 hover:bg-indigo-700">
          <Check className="w-4 h-4 mr-2" />
          {isEs ? "Guardar Conteo" : "Save Count"}
        </Button>
      </div>

      {/* Count Table */}
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-muted z-10">
                <TableRow>
                  <TableHead>{isEs ? "Activo" : "Asset"}</TableHead>
                  <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Total" : "Total"}</TableHead>
                  <TableHead className="text-right">{isEs ? "En Evento" : "Out"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Disponible" : "Available"}</TableHead>
                  <TableHead className="text-center w-24">{isEs ? "Conteo" : "Count"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Diferencia" : "Variance"}</TableHead>
                  <TableHead className="text-center">{isEs ? "Estado" : "Status"}</TableHead>
                  <TableHead className="text-center">{isEs ? "Acción" : "Action"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCountItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {isEs ? "No hay activos para mostrar" : "No assets to display"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCountItems.map(item => (
                    <TableRow 
                      key={item.item_id || item.ingredient_id}
                      className={
                        item.status === "counted" && item.variance_qty < 0
                          ? "bg-red-50/50" 
                          : item.status === "counted" && item.variance_qty > 0
                            ? "bg-amber-50/30"
                            : item.status === "counted" 
                              ? "bg-green-50/30" 
                              : ""
                      }
                    >
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-xs">{item.category}</TableCell>
                      <TableCell className="text-right font-mono">{item.system_qty}</TableCell>
                      <TableCell className="text-right font-mono">
                        {item.currently_out > 0 ? (
                          <span className="text-blue-600">{item.currently_out}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">{item.available_qty}</TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          className="w-20 h-8 text-center mx-auto"
                          value={item.counted_qty}
                          onChange={(e) => updateCountItem(item.item_id || item.ingredient_id, e.target.value)}
                          placeholder="—"
                        />
                      </TableCell>
                      <TableCell className={`text-right font-mono ${
                        (item.variance_qty || 0) < 0 ? "text-red-600 font-semibold" : 
                        (item.variance_qty || 0) > 0 ? "text-amber-600" : ""
                      }`}>
                        {item.counted_qty !== "" && item.counted_qty !== null 
                          ? `${(item.variance_qty || 0) > 0 ? "+" : ""}${item.variance_qty || 0}`
                          : "—"
                        }
                      </TableCell>
                      <TableCell className="text-center">
                        {item.status === "counted" ? (
                          item.variance_qty < 0 ? (
                            <Badge variant="destructive">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              {isEs ? "Faltante" : "Missing"}
                            </Badge>
                          ) : (
                            <Badge className="bg-green-600">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              OK
                            </Badge>
                          )
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-300">
                            {isEs ? "Pendiente" : "Pending"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.status === "counted" && item.variance_qty < 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 border-red-300 hover:bg-red-50"
                            onClick={() => openLossDialog(item)}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            {isEs ? "Pérdida" : "Loss"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Instructions Card */}
      <Card className="bg-indigo-50/50 border-indigo-200">
        <CardContent className="pt-4">
          <h4 className="font-medium text-indigo-800 mb-2">
            {isEs ? "📦 Instrucciones para Conteo de Activos" : "📦 Asset Count Instructions"}
          </h4>
          <ul className="text-sm text-indigo-700 space-y-1 list-disc list-inside">
            <li>{isEs ? "Cuente físicamente todos los equipos, mobiliario y suministros" : "Physically count all equipment, furniture & supplies"}</li>
            <li>{isEs ? "Verifique el estado de cada activo (daños, desgaste)" : "Check condition of each asset (damage, wear)"}</li>
            <li>{isEs ? "Los faltantes se marcan en rojo para seguimiento" : "Missing items are marked in red for follow-up"}</li>
            <li>{isEs ? "Este conteo NO afecta costos - son activos fijos con depreciación" : "This count does NOT affect costs - these are fixed assets with depreciation"}</li>
          </ul>
        </CardContent>
      </Card>

      {/* Loss Registration Dialog */}
      <Dialog open={lossDialogOpen} onOpenChange={setLossDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              {isEs ? "Registrar Pérdida de Activo" : "Register Asset Loss"}
            </DialogTitle>
          </DialogHeader>
          
          {selectedLossItem && (
            <div className="space-y-4">
              {/* Item Info */}
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">{selectedLossItem.name}</p>
                <p className="text-sm text-muted-foreground">
                  {isEs ? "Faltante:" : "Missing:"} {Math.abs(selectedLossItem.variance_qty)} {isEs ? "unidades" : "units"} 
                  ({formatCurrency(Math.abs(selectedLossItem.variance_qty) * (selectedLossItem.unit_value || 0))})
                </p>
              </div>

              {/* Quantity */}
              <div>
                <Label>{isEs ? "Cantidad a Reportar" : "Quantity to Report"}</Label>
                <Input
                  type="number"
                  min="1"
                  max={Math.abs(selectedLossItem.variance_qty)}
                  value={lossForm.quantity}
                  onChange={(e) => setLossForm({...lossForm, quantity: parseInt(e.target.value) || 1})}
                />
              </div>

              {/* Reason */}
              <div>
                <Label>{isEs ? "Razón" : "Reason"}</Label>
                <Select value={lossForm.reason} onValueChange={(v) => setLossForm({...lossForm, reason: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOSS_REASONS.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Resolution */}
              <div>
                <Label>{isEs ? "Resolución" : "Resolution"}</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {RESOLUTION_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    return (
                      <Button
                        key={opt.value}
                        type="button"
                        variant={lossForm.resolution === opt.value ? "default" : "outline"}
                        className="h-auto py-3 flex flex-col gap-1"
                        onClick={() => setLossForm({...lossForm, resolution: opt.value})}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-xs">{opt.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Client Selection (if billing) */}
              {lossForm.resolution === "bill_client" && (
                <div>
                  <Label>{isEs ? "Facturar a Cliente" : "Bill to Client"}</Label>
                  <Select value={lossForm.client_id} onValueChange={(v) => setLossForm({...lossForm, client_id: v})}>
                    <SelectTrigger><SelectValue placeholder={isEs ? "Seleccionar cliente..." : "Select client..."} /></SelectTrigger>
                    <SelectContent>
                      {clients.map(c => (
                        <SelectItem key={c.client_id} value={c.client_id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Associated Event */}
              <div>
                <Label>{isEs ? "Evento Asociado (Opcional)" : "Associated Event (Optional)"}</Label>
                <Select value={lossForm.event_id} onValueChange={(v) => setLossForm({...lossForm, event_id: v})}>
                  <SelectTrigger><SelectValue placeholder={isEs ? "Seleccionar evento..." : "Select event..."} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isEs ? "-- Sin evento --" : "-- No event --"}</SelectItem>
                    {events.slice(0, 20).map(e => (
                      <SelectItem key={e.event_id} value={e.event_id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div>
                <Label>{isEs ? "Notas" : "Notes"}</Label>
                <Input
                  value={lossForm.notes}
                  onChange={(e) => setLossForm({...lossForm, notes: e.target.value})}
                  placeholder={isEs ? "Descripción del incidente..." : "Incident description..."}
                />
              </div>

              {/* Summary */}
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm font-medium text-red-800">
                  {isEs ? "Total a registrar:" : "Total to register:"} {formatCurrency(lossForm.quantity * (selectedLossItem.unit_value || 0))}
                </p>
                <p className="text-xs text-red-600 mt-1">
                  {lossForm.resolution === "bill_client" 
                    ? (isEs ? "Se creará una factura para el cliente" : "An invoice will be created for the client")
                    : (isEs ? "Se registrará como gasto operacional" : "Will be recorded as operational expense")
                  }
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setLossDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button 
              onClick={handleRegisterLoss}
              className="bg-red-600 hover:bg-red-700"
              disabled={lossForm.resolution === "bill_client" && !lossForm.client_id}
            >
              <XCircle className="w-4 h-4 mr-2" />
              {isEs ? "Registrar Pérdida" : "Register Loss"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AssetCountSection;
