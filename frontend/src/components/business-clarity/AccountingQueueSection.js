import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import {
  AlertCircle, CheckCircle, Layers, RefreshCw, Filter, ArrowRight, 
  Receipt, Users, Package, DollarSign, FileText, Building2
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const getTypeIcon = (type) => {
  switch (type) {
    case "payroll": return <Users className="w-4 h-4 text-violet-500" />;
    case "purchase": return <Receipt className="w-4 h-4 text-blue-500" />;
    case "expense": return <DollarSign className="w-4 h-4 text-amber-500" />;
    case "inventory": return <Package className="w-4 h-4 text-green-500" />;
    default: return <FileText className="w-4 h-4 text-gray-500" />;
  }
};

const getTypeBadge = (type, isEs) => {
  const labels = {
    payroll: isEs ? "Nómina" : "Payroll",
    purchase: isEs ? "Compra" : "Purchase",
    expense: isEs ? "Gasto" : "Expense",
    inventory: isEs ? "Inventario" : "Inventory",
    revenue: isEs ? "Ingreso" : "Revenue"
  };
  const colors = {
    payroll: "bg-violet-100 text-violet-800",
    purchase: "bg-blue-100 text-blue-800",
    expense: "bg-amber-100 text-amber-800",
    inventory: "bg-green-100 text-green-800",
    revenue: "bg-emerald-100 text-emerald-800"
  };
  return (
    <Badge className={`${colors[type] || "bg-gray-100 text-gray-800"} gap-1`}>
      {getTypeIcon(type)}
      {labels[type] || type}
    </Badge>
  );
};

export function AccountingQueueSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [entries, setEntries] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [selectedCostCenter, setSelectedCostCenter] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [filterType, setFilterType] = useState("all");
  
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, ccRes] = await Promise.all([
        axios.get(`${API}/api/business-clarity/accounting/unassigned`, { withCredentials: true }),
        axios.get(`${API}/api/people-ops/cost-centers`, { withCredentials: true })
      ]);
      setEntries(entriesRes.data.entries || []);
      setCostCenters(ccRes.data || []);
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error al cargar datos" : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [isEs]);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  const handleAssign = async () => {
    if (!selectedEntry || !selectedCostCenter) return;
    
    setAssigning(true);
    try {
      await axios.post(
        `${API}/api/business-clarity/accounting/assign-cost-center`,
        {
          entry_id: selectedEntry.entry_id,
          cost_center_id: selectedCostCenter
        },
        { withCredentials: true }
      );
      toast.success(isEs ? "Centro de costo asignado" : "Cost center assigned");
      setSelectedEntry(null);
      setSelectedCostCenter("");
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(isEs ? "Error al asignar" : "Failed to assign");
    } finally {
      setAssigning(false);
    }
  };
  
  const filteredEntries = filterType === "all" 
    ? entries 
    : entries.filter(e => e.transaction_type === filterType);
  
  const uniqueTypes = [...new Set(entries.map(e => e.transaction_type))];
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Layers className="w-5 h-5" />
            {isEs ? "Cola de Asignación de Centro de Costo" : "Cost Center Assignment Queue"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs 
              ? "Transacciones pendientes de asignación a un centro de costo"
              : "Transactions pending cost center assignment"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {isEs ? "Actualizar" : "Refresh"}
        </Button>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={entries.length > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              {entries.length > 0 
                ? <AlertCircle className="w-5 h-5 text-amber-600" />
                : <CheckCircle className="w-5 h-5 text-green-600" />}
              <span className={`text-sm ${entries.length > 0 ? "text-amber-600" : "text-green-600"}`}>
                {isEs ? "Pendientes" : "Pending"}
              </span>
            </div>
            <p className={`text-2xl font-bold ${entries.length > 0 ? "text-amber-800" : "text-green-800"}`}>
              {entries.length}
            </p>
            <p className={`text-xs mt-1 ${entries.length > 0 ? "text-amber-600" : "text-green-600"}`}>
              {isEs ? "transacciones sin asignar" : "unassigned transactions"}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-blue-600">{isEs ? "Monto Total" : "Total Amount"}</span>
            </div>
            <p className="text-2xl font-bold text-blue-800">
              {formatCurrency(entries.reduce((sum, e) => sum + (e.amount || 0), 0))}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              {isEs ? "por clasificar" : "to classify"}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-violet-50 border-violet-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-5 h-5 text-violet-600" />
              <span className="text-sm text-violet-600">{isEs ? "Centros de Costo" : "Cost Centers"}</span>
            </div>
            <p className="text-2xl font-bold text-violet-800">{costCenters.length}</p>
            <p className="text-xs text-violet-600 mt-1">
              {isEs ? "disponibles para asignar" : "available for assignment"}
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Filter */}
      {entries.length > 0 && uniqueTypes.length > 1 && (
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEs ? "Todos" : "All"}</SelectItem>
              {uniqueTypes.map(type => (
                <SelectItem key={type} value={type}>
                  {type === "payroll" ? (isEs ? "Nómina" : "Payroll") :
                   type === "purchase" ? (isEs ? "Compras" : "Purchases") :
                   type === "expense" ? (isEs ? "Gastos" : "Expenses") :
                   type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      
      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                <TableHead>{isEs ? "Descripción" : "Description"}</TableHead>
                <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                <TableHead className="text-right">{isEs ? "Monto" : "Amount"}</TableHead>
                <TableHead className="text-right">{isEs ? "Acción" : "Action"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <CheckCircle className="w-8 h-8 text-green-500" />
                      <p>{isEs ? "No hay transacciones pendientes" : "No pending transactions"}</p>
                      <p className="text-xs">
                        {isEs 
                          ? "Todas las transacciones tienen un centro de costo asignado"
                          : "All transactions have a cost center assigned"}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredEntries.map(entry => (
                  <TableRow key={entry.entry_id} className="hover:bg-muted/50">
                    <TableCell>{getTypeBadge(entry.transaction_type, isEs)}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{entry.description}</p>
                        {entry.source_ref && (
                          <p className="text-xs text-muted-foreground">{entry.source_ref}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{entry.transaction_date}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(entry.amount)}</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setSelectedEntry(entry)}
                        data-testid={`assign-btn-${entry.entry_id}`}
                      >
                        <ArrowRight className="w-4 h-4 mr-1" />
                        {isEs ? "Asignar" : "Assign"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Info Card */}
      <Card className="bg-blue-50/50 border-blue-200">
        <CardContent className="pt-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">{isEs ? "Sobre esta cola" : "About this queue"}</p>
              <p>
                {isEs 
                  ? "Las transacciones sin centro de costo asignado aparecen aquí. Asigne un centro de costo para incluirlas en los reportes de presupuesto vs. real. Las transacciones de nómina sin CC pueden ser de períodos creados antes de la integración."
                  : "Transactions without an assigned cost center appear here. Assign a cost center to include them in budget vs actual reports. Payroll transactions without CC may be from periods created before integration."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Assignment Dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Asignar Centro de Costo" : "Assign Cost Center"}</DialogTitle>
            <DialogDescription>
              {isEs 
                ? "Seleccione el centro de costo para esta transacción"
                : "Select the cost center for this transaction"}
            </DialogDescription>
          </DialogHeader>
          
          {selectedEntry && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  {getTypeBadge(selectedEntry.transaction_type, isEs)}
                  <span className="font-bold">{formatCurrency(selectedEntry.amount)}</span>
                </div>
                <p className="text-sm">{selectedEntry.description}</p>
                <p className="text-xs text-muted-foreground">{selectedEntry.transaction_date}</p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {isEs ? "Centro de Costo" : "Cost Center"}
                </label>
                <Select value={selectedCostCenter} onValueChange={setSelectedCostCenter}>
                  <SelectTrigger data-testid="cost-center-select">
                    <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {costCenters.map(cc => (
                      <SelectItem key={cc.cost_center_id} value={cc.cost_center_id}>
                        {cc.code ? `${cc.code} - ` : ""}{cc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedEntry(null)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button 
              onClick={handleAssign} 
              disabled={!selectedCostCenter || assigning}
              data-testid="confirm-assign-btn"
            >
              {assigning ? (isEs ? "Asignando..." : "Assigning...") : (isEs ? "Asignar" : "Assign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
