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
        // Use the same inventory endpoint but filter for operational categories
        const invRes = await axios.get(`${API}/api/inventory/ingredients`, { withCredentials: true });
        // Operational categories (not food)
        const opsCategories = ["equipment", "linens", "decor", "furniture", "tableware", "audiovisual", 
                               "kitchen equipment", "serving equipment", "tables_chairs", "serving", 
                               "kitchen", "transport", "cleaning", "packaging", "other"];
        const items = (invRes.data || [])
          .filter(inv => {
            const category = (inv.category || "").toLowerCase();
            // Include items that are operational (not food)
            return opsCategories.some(oc => category.includes(oc.toLowerCase())) ||
                   inv.item_type === "equipment" || 
                   inv.item_type === "operational" ||
                   inv.supply_type === "equipment" ||
                   inv.supply_type === "event_supply";
          })
          .map(inv => ({
            item_id: inv.item_id || inv.ingredient_id,
            name: inv.name,
            category: inv.category || "General",
            sku: inv.sku || "",
            system_qty: inv.total_quantity || inv.quantity || 0,
            available_qty: inv.available_quantity || inv.quantity || 0,
            unit_value: inv.unit_cost || inv.purchase_price || 0,
            counted_qty: "",
            variance_qty: 0,
            variance_value: 0,
            condition: inv.condition || "Good",
            status: "pending"
          }));
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

  // Update count item
  const updateCountItem = (itemId, value) => {
    setCountItems(prev => prev.map(item => {
      if ((item.item_id || item.ingredient_id) === itemId) {
        const countedQty = value === "" ? "" : parseInt(value) || 0;
        const varianceQty = countedQty === "" ? 0 : countedQty - item.system_qty;
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
                  <TableHead>SKU</TableHead>
                  <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
                  <TableHead className="text-right">{isEs ? "En Sistema" : "System Qty"}</TableHead>
                  <TableHead className="text-center w-28">{isEs ? "Conteo" : "Count"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Diferencia" : "Variance"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Valor Unit." : "Unit Value"}</TableHead>
                  <TableHead className="text-center">{isEs ? "Estado" : "Status"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCountItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
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
                      <TableCell className="text-xs text-muted-foreground font-mono">{item.sku || "—"}</TableCell>
                      <TableCell className="text-xs">{item.category}</TableCell>
                      <TableCell className="text-right font-mono">{item.system_qty}</TableCell>
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
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {formatCurrency(item.unit_value || 0)}
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
    </div>
  );
}

export default AssetCountSection;
