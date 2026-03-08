import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Building2, DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  BarChart3, Calendar, ChevronRight, RefreshCw
} from "lucide-react";
import { toast } from "sonner";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const MONTHS = [
  { value: 1, label: "January", labelEs: "Enero" },
  { value: 2, label: "February", labelEs: "Febrero" },
  { value: 3, label: "March", labelEs: "Marzo" },
  { value: 4, label: "April", labelEs: "Abril" },
  { value: 5, label: "May", labelEs: "Mayo" },
  { value: 6, label: "June", labelEs: "Junio" },
  { value: 7, label: "July", labelEs: "Julio" },
  { value: 8, label: "August", labelEs: "Agosto" },
  { value: 9, label: "September", labelEs: "Septiembre" },
  { value: 10, label: "October", labelEs: "Octubre" },
  { value: 11, label: "November", labelEs: "Noviembre" },
  { value: 12, label: "December", labelEs: "Diciembre" },
];

export function CostCenterBudgetsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [selectedCC, setSelectedCC] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    budget_type: "monthly",
    year: new Date().getFullYear(),
    period: new Date().getMonth() + 1,
    amount: ""
  });

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${API}/api/business-clarity/cost-centers/summary?year=${year}&month=${month}`,
        { withCredentials: true }
      );
      setSummary(res.data);
    } catch (error) {
      toast.error(isEs ? "Error al cargar datos" : "Error loading data");
    } finally {
      setLoading(false);
    }
  }, [year, month, isEs]);

  const fetchDetail = useCallback(async (ccId) => {
    setDetailLoading(true);
    try {
      const res = await axios.get(
        `${API}/api/business-clarity/cost-centers/${ccId}/budget-detail?year=${year}`,
        { withCredentials: true }
      );
      setDetailData(res.data);
    } catch (error) {
      toast.error(isEs ? "Error al cargar detalle" : "Error loading detail");
    } finally {
      setDetailLoading(false);
    }
  }, [year, isEs]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (selectedCC) {
      fetchDetail(selectedCC.cost_center_id);
    }
  }, [selectedCC, fetchDetail]);

  const handleSelectCC = (cc) => {
    setSelectedCC(cc);
  };

  const handleEditBudget = (cc) => {
    setSelectedCC(cc);
    setEditForm({
      budget_type: "monthly",
      year: year,
      period: month,
      amount: cc.budget || ""
    });
    setEditDialogOpen(true);
  };

  const handleSaveBudget = async () => {
    if (!selectedCC) return;
    try {
      await axios.put(
        `${API}/api/business-clarity/cost-centers/${selectedCC.cost_center_id}/budget`,
        editForm,
        { withCredentials: true }
      );
      toast.success(isEs ? "Presupuesto actualizado" : "Budget updated");
      setEditDialogOpen(false);
      fetchSummary();
      if (selectedCC) fetchDetail(selectedCC.cost_center_id);
    } catch (error) {
      toast.error(isEs ? "Error al guardar" : "Error saving");
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      ok: "bg-green-100 text-green-700",
      warning: "bg-yellow-100 text-yellow-700",
      over: "bg-red-100 text-red-700"
    };
    const labels = {
      ok: isEs ? "Normal" : "OK",
      warning: isEs ? "Alerta" : "Warning",
      over: isEs ? "Excedido" : "Over"
    };
    return <Badge className={styles[status] || styles.ok}>{labels[status] || status}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="cost-center-budgets-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            {isEs ? "Presupuestos por Centro de Costo" : "Cost Center Budgets"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs ? "Análisis de presupuesto vs gasto real" : "Budget vs actual spending analysis"}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m) => (
                <SelectItem key={m.value} value={String(m.value)}>
                  {isEs ? m.labelEs : m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button variant="outline" size="sm" onClick={fetchSummary}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">{isEs ? "Presupuesto Total" : "Total Budget"}</div>
              <div className="text-2xl font-bold text-blue-600">{formatCurrency(summary.totals?.budget)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">{isEs ? "Gasto Real" : "Actual Spend"}</div>
              <div className="text-2xl font-bold">{formatCurrency(summary.totals?.actual)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">{isEs ? "Variación" : "Variance"}</div>
              <div className={`text-2xl font-bold ${summary.totals?.variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(summary.totals?.variance)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">{isEs ? "Utilización" : "Utilization"}</div>
              <div className="text-2xl font-bold">{summary.totals?.utilization_percent || 0}%</div>
              <Progress value={Math.min(summary.totals?.utilization_percent || 0, 100)} className="mt-2" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-2 gap-6">
        {/* Cost Centers List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{isEs ? "Centros de Costo" : "Cost Centers"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Centro" : "Center"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Presupuesto" : "Budget"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Real" : "Actual"}</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary?.cost_centers?.map((cc) => (
                  <TableRow 
                    key={cc.cost_center_id}
                    className={`cursor-pointer hover:bg-muted/50 ${selectedCC?.cost_center_id === cc.cost_center_id ? "bg-muted" : ""}`}
                    onClick={() => handleSelectCC(cc)}
                  >
                    <TableCell>
                      <div className="font-medium">{cc.name}</div>
                      {cc.code && <div className="text-xs text-muted-foreground">{cc.code}</div>}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(cc.budget)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(cc.actual)}</TableCell>
                    <TableCell className="text-right">{cc.utilization_percent}%</TableCell>
                    <TableCell>{getStatusBadge(cc.status)}</TableCell>
                  </TableRow>
                ))}
                {(!summary?.cost_centers || summary.cost_centers.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {isEs ? "No hay centros de costo" : "No cost centers found"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Detail Panel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span>{selectedCC ? selectedCC.name : (isEs ? "Seleccione un centro" : "Select a center")}</span>
              {selectedCC && (
                <Button variant="outline" size="sm" onClick={() => handleEditBudget(selectedCC)}>
                  {isEs ? "Editar Presupuesto" : "Edit Budget"}
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedCC ? (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>{isEs ? "Seleccione un centro de costo para ver el detalle" : "Select a cost center to view details"}</p>
              </div>
            ) : detailLoading ? (
              <div className="flex justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
            ) : detailData ? (
              <div className="space-y-4">
                {/* YTD Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <div className="text-xs text-blue-600">{isEs ? "YTD Presupuesto" : "YTD Budget"}</div>
                    <div className="text-lg font-bold">{formatCurrency(detailData.ytd_summary?.budget)}</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="text-xs text-gray-600">{isEs ? "YTD Real" : "YTD Actual"}</div>
                    <div className="text-lg font-bold">{formatCurrency(detailData.ytd_summary?.actual)}</div>
                  </div>
                  <div className={`p-3 rounded-lg ${detailData.ytd_summary?.variance >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                    <div className={`text-xs ${detailData.ytd_summary?.variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {isEs ? "Variación" : "Variance"}
                    </div>
                    <div className="text-lg font-bold flex items-center gap-1">
                      {detailData.ytd_summary?.variance >= 0 ? (
                        <TrendingDown className="w-4 h-4 text-green-600" />
                      ) : (
                        <TrendingUp className="w-4 h-4 text-red-600" />
                      )}
                      {formatCurrency(Math.abs(detailData.ytd_summary?.variance || 0))}
                    </div>
                  </div>
                </div>
                
                {/* Monthly Breakdown */}
                <div>
                  <h4 className="text-sm font-medium mb-2">{isEs ? "Desglose Mensual" : "Monthly Breakdown"}</h4>
                  <div className="max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{isEs ? "Mes" : "Month"}</TableHead>
                          <TableHead className="text-right">{isEs ? "Presup." : "Budget"}</TableHead>
                          <TableHead className="text-right">{isEs ? "Real" : "Actual"}</TableHead>
                          <TableHead className="text-right">{isEs ? "Var." : "Var."}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailData.monthly_data?.map((m) => (
                          <TableRow key={m.month_key} className={m.month === month ? "bg-blue-50" : ""}>
                            <TableCell className="py-1">
                              {isEs ? MONTHS[m.month - 1]?.labelEs : MONTHS[m.month - 1]?.label}
                            </TableCell>
                            <TableCell className="text-right py-1">{formatCurrency(m.budget)}</TableCell>
                            <TableCell className="text-right py-1">{formatCurrency(m.actual)}</TableCell>
                            <TableCell className={`text-right py-1 ${m.variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {formatCurrency(m.variance)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Edit Budget Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEs ? "Editar Presupuesto" : "Edit Budget"} - {selectedCC?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{isEs ? "Tipo" : "Type"}</Label>
              <Select 
                value={editForm.budget_type} 
                onValueChange={(v) => setEditForm({...editForm, budget_type: v})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">{isEs ? "Anual" : "Annual"}</SelectItem>
                  <SelectItem value="monthly">{isEs ? "Mensual" : "Monthly"}</SelectItem>
                  <SelectItem value="quarterly">{isEs ? "Trimestral" : "Quarterly"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{isEs ? "Año" : "Year"}</Label>
                <Select 
                  value={String(editForm.year)} 
                  onValueChange={(v) => setEditForm({...editForm, year: parseInt(v)})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026, 2027].map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {editForm.budget_type === "monthly" && (
                <div>
                  <Label>{isEs ? "Mes" : "Month"}</Label>
                  <Select 
                    value={String(editForm.period)} 
                    onValueChange={(v) => setEditForm({...editForm, period: parseInt(v)})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m) => (
                        <SelectItem key={m.value} value={String(m.value)}>
                          {isEs ? m.labelEs : m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {editForm.budget_type === "quarterly" && (
                <div>
                  <Label>{isEs ? "Trimestre" : "Quarter"}</Label>
                  <Select 
                    value={String(editForm.period)} 
                    onValueChange={(v) => setEditForm({...editForm, period: parseInt(v)})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Q1</SelectItem>
                      <SelectItem value="2">Q2</SelectItem>
                      <SelectItem value="3">Q3</SelectItem>
                      <SelectItem value="4">Q4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            
            <div>
              <Label>{isEs ? "Monto" : "Amount"}</Label>
              <Input
                type="number"
                value={editForm.amount}
                onChange={(e) => setEditForm({...editForm, amount: parseFloat(e.target.value) || 0})}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveBudget}>
              {isEs ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
