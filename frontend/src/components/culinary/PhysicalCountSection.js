import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  ClipboardList, Search, Check, RefreshCw, Download, AlertTriangle,
  CheckCircle2, Package, Calendar
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";
import { fmtNum } from "../../utils/format";
const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PhysicalCountSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [physicalCount, setPhysicalCount] = useState(null);
  const [countItems, setCountItems] = useState([]);
  const [countFilter, setCountFilter] = useState("all");
  const [countSearch, setCountSearch] = useState("");
  
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

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
      const res = await axios.get(
        `${API}/api/business-clarity/period-close/${selectedYear}/${selectedMonth}/physical-count`,
        { withCredentials: true }
      );
      setPhysicalCount(res.data);
      setCountItems(res.data?.items || []);
    } catch (err) {
      console.error(err);
      // Initialize with empty if no count exists
      setPhysicalCount(null);
      // Load FOOD inventory items only for counting (exclude operational supplies)
      try {
        const invRes = await axios.get(`${API}/api/food-ops/inventory`, { withCredentials: true });
        // Filter to only include food-related categories
        const foodCategories = ["Proteins", "Produce", "Dairy", "Dry Goods", "Beverages", "Spices", "Frozen", "Bakery", "Seafood", "Grains", "Oils", "Sauces", "General"];
        const items = (invRes.data || [])
          .filter(inv => {
            // Include items that are food-related (not equipment or operational supplies)
            const category = (inv.category || "").toLowerCase();
            const isFood = foodCategories.some(fc => category.includes(fc.toLowerCase())) || 
                          !["equipment", "linens", "decor", "furniture", "tableware", "audiovisual", "kitchen equipment", "serving equipment"].some(ec => category.toLowerCase().includes(ec));
            return isFood && inv.item_type !== "equipment" && inv.item_type !== "operational";
          })
          .map(inv => ({
            ingredient_id: inv.ingredient_id,
            name: inv.name,
            category: inv.category || "General",
            unit: inv.unit,
            system_qty: inv.quantity || 0,
            unit_cost: inv.unit_cost || 0,
            counted_qty: "",
            variance_qty: 0,
            variance_value: 0,
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
  const updateCountItem = (ingredientId, value) => {
    setCountItems(prev => prev.map(item => {
      if (item.ingredient_id === ingredientId) {
        const countedQty = value === "" ? "" : parseFloat(value) || 0;
        const varianceQty = countedQty === "" ? 0 : countedQty - item.system_qty;
        const varianceValue = varianceQty * (item.unit_cost || 0);
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
      item.category?.toLowerCase().includes(countSearch.toLowerCase());
    
    const matchesFilter = countFilter === "all" ||
      (countFilter === "pending" && item.status === "pending") ||
      (countFilter === "counted" && item.status === "counted") ||
      (countFilter === "variance" && item.status === "counted" && Math.abs(item.variance_qty || 0) > 0.01);
    
    return matchesSearch && matchesFilter;
  });

  // Calculate summary
  const summary = {
    total_items: countItems.length,
    items_counted: countItems.filter(i => i.status === "counted").length,
    items_pending: countItems.filter(i => i.status === "pending").length,
    items_with_variance: countItems.filter(i => i.status === "counted" && Math.abs(i.variance_qty || 0) > 0.01).length,
    total_variance_value: countItems.reduce((sum, i) => sum + (i.variance_value || 0), 0),
    completion_percent: countItems.length > 0 
      ? Math.round((countItems.filter(i => i.status === "counted").length / countItems.length) * 100) 
      : 0
  };

  // Save count
  const handleSaveCount = async () => {
    try {
      await axios.post(
        `${API}/api/business-clarity/period-close/${selectedYear}/${selectedMonth}/physical-count`,
        { items: countItems, count_date: new Date().toISOString().split('T')[0] },
        { withCredentials: true }
      );
      toast.success(isEs ? "Conteo guardado" : "Count saved");
      fetchData();
    } catch (err) {
      toast.error(isEs ? "Error al guardar" : "Failed to save");
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ["Item", "Category", "Unit", "System Qty", "Counted Qty", "Variance", "Variance Value", "Status"];
    const rows = countItems.map(item => [
      item.name,
      item.category,
      item.unit,
      item.system_qty,
      item.counted_qty || "",
      item.variance_qty || 0,
      item.variance_value || 0,
      item.status
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `physical_count_${selectedYear}_${selectedMonth}.csv`;
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
            <ClipboardList className="w-5 h-5" />
            {isEs ? "Conteo Físico de Inventario" : "Physical Inventory Count"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs 
              ? "Verificación mensual del inventario físico vs sistema" 
              : "Monthly verification of physical inventory vs system"}
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <Package className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-2xl font-bold">{summary.total_items}</p>
            <p className="text-xs text-muted-foreground">{isEs ? "Total Items" : "Total Items"}</p>
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
            <p className="text-2xl font-bold text-red-700">{summary.items_with_variance}</p>
            <p className="text-xs text-red-600">{isEs ? "Con Varianza" : "With Variance"}</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/50">
          <CardContent className="pt-4 text-center">
            <p className="text-lg font-bold text-purple-700">{formatCurrency(summary.total_variance_value)}</p>
            <p className="text-xs text-purple-600">{isEs ? "Valor Varianza" : "Variance Value"}</p>
            <Badge className="mt-1" variant={summary.completion_percent === 100 ? "default" : "outline"}>
              {summary.completion_percent}% {isEs ? "completo" : "complete"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={isEs ? "Buscar item..." : "Search item..."}
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
            <SelectItem value="variance">{isEs ? "Con Varianza" : "With Variance"}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportToCSV}>
          <Download className="w-4 h-4 mr-2" />
          CSV
        </Button>
        <Button size="sm" onClick={handleSaveCount} className="bg-green-600 hover:bg-green-700">
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
                  <TableHead>{isEs ? "Item" : "Item"}</TableHead>
                  <TableHead>{isEs ? "Categoría" : "Category"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Cantidad Sistema" : "System Qty"}</TableHead>
                  <TableHead className="text-center w-36">{isEs ? "Conteo Físico" : "Physical Count"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Varianza" : "Variance"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Valor Varianza" : "Variance Value"}</TableHead>
                  <TableHead className="text-center">{isEs ? "Estado" : "Status"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCountItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {isEs ? "No hay items para mostrar" : "No items to display"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCountItems.map(item => (
                    <TableRow 
                      key={item.ingredient_id}
                      className={
                        item.status === "counted" && Math.abs(item.variance_qty || 0) > 0.01 
                          ? "bg-red-50/50" 
                          : item.status === "counted" 
                            ? "bg-green-50/30" 
                            : ""
                      }
                    >
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.category}</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtNum(item.system_qty)} {item.unit}
                      </TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          step="0.01"
                          className="w-28 h-8 text-center mx-auto"
                          value={item.counted_qty}
                          onChange={(e) => updateCountItem(item.ingredient_id, e.target.value)}
                          placeholder="—"
                        />
                      </TableCell>
                      <TableCell className={`text-right font-mono ${
                        (item.variance_qty || 0) < 0 ? "text-red-600" : 
                        (item.variance_qty || 0) > 0 ? "text-green-600" : ""
                      }`}>
                        {item.counted_qty !== "" && item.counted_qty !== null 
                          ? `${(item.variance_qty || 0) > 0 ? "+" : ""}${fmtNum(item.variance_qty) || "0.00"}`
                          : "—"
                        }
                      </TableCell>
                      <TableCell className={`text-right font-mono ${
                        (item.variance_value || 0) < 0 ? "text-red-600" : 
                        (item.variance_value || 0) > 0 ? "text-amber-600" : ""
                      }`}>
                        {item.counted_qty !== "" && item.counted_qty !== null 
                          ? formatCurrency(item.variance_value || 0)
                          : "—"
                        }
                      </TableCell>
                      <TableCell className="text-center">
                        {item.status === "counted" ? (
                          <Badge className="bg-green-600">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            {isEs ? "Contado" : "Counted"}
                          </Badge>
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
      <Card className="bg-blue-50/50 border-blue-200">
        <CardContent className="pt-4">
          <h4 className="font-medium text-blue-800 mb-2">
            {isEs ? "📋 Instrucciones para el Conteo" : "📋 Counting Instructions"}
          </h4>
          <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
            <li>{isEs ? "Cuente todos los items físicamente en el almacén" : "Physically count all items in the warehouse"}</li>
            <li>{isEs ? "Ingrese la cantidad contada en la columna 'Conteo Físico'" : "Enter the counted quantity in the 'Physical Count' column"}</li>
            <li>{isEs ? "Las varianzas se calculan automáticamente" : "Variances are calculated automatically"}</li>
            <li>{isEs ? "Guarde el conteo al finalizar - se enviará a Business Clarity para reconciliación" : "Save the count when finished - it will be sent to Business Clarity for reconciliation"}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default PhysicalCountSection;
