import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  FileText, Download, RefreshCw, Calendar, Building2,
  FileSpreadsheet, CheckCircle, AlertCircle, Clock, Eye
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const formatCurrency = (amount) => 
  `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Report types configuration
const REPORT_TYPES = [
  {
    id: "dgt3",
    name: "DGT-3",
    description: "Declaración de Personal Fijo",
    descriptionEn: "Fixed Personnel Declaration",
    entity: "Ministerio de Trabajo",
    frequency: "Trimestral",
    frequencyEn: "Quarterly",
    icon: FileText
  },
  {
    id: "tss",
    name: "TSS",
    description: "Tesorería de la Seguridad Social",
    descriptionEn: "Social Security Treasury",
    entity: "TSS",
    frequency: "Mensual",
    frequencyEn: "Monthly",
    icon: Building2
  },
  {
    id: "dgii_ir17",
    name: "IR-17",
    description: "Declaración Jurada de Retenciones",
    descriptionEn: "Withholding Tax Declaration",
    entity: "DGII",
    frequency: "Mensual",
    frequencyEn: "Monthly",
    icon: FileSpreadsheet
  },
  {
    id: "dgii_606",
    name: "606",
    description: "Compras de Bienes y Servicios",
    descriptionEn: "Purchases of Goods and Services",
    entity: "DGII",
    frequency: "Mensual",
    frequencyEn: "Monthly",
    icon: FileSpreadsheet
  }
];

const MONTHS = [
  { value: "01", label: "Enero", labelEn: "January" },
  { value: "02", label: "Febrero", labelEn: "February" },
  { value: "03", label: "Marzo", labelEn: "March" },
  { value: "04", label: "Abril", labelEn: "April" },
  { value: "05", label: "Mayo", labelEn: "May" },
  { value: "06", label: "Junio", labelEn: "June" },
  { value: "07", label: "Julio", labelEn: "July" },
  { value: "08", label: "Agosto", labelEn: "August" },
  { value: "09", label: "Septiembre", labelEn: "September" },
  { value: "10", label: "Octubre", labelEn: "October" },
  { value: "11", label: "Noviembre", labelEn: "November" },
  { value: "12", label: "Diciembre", labelEn: "December" }
];

const QUARTERS = [
  { value: "Q1", label: "Q1 (Ene-Mar)", labelEn: "Q1 (Jan-Mar)" },
  { value: "Q2", label: "Q2 (Abr-Jun)", labelEn: "Q2 (Apr-Jun)" },
  { value: "Q3", label: "Q3 (Jul-Sep)", labelEn: "Q3 (Jul-Sep)" },
  { value: "Q4", label: "Q4 (Oct-Dic)", labelEn: "Q4 (Oct-Dec)" }
];

export function RegulatoryReportsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [generatedReports, setGeneratedReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  
  // Form state
  const [selectedReport, setSelectedReport] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedPeriod, setSelectedPeriod] = useState("");

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  const fetchGeneratedReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/people-ops/regulatory-reports`, { withCredentials: true });
      setGeneratedReports(res.data || []);
    } catch (err) {
      console.error("Error fetching reports:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchGeneratedReports(); }, [fetchGeneratedReports]);

  const handleGenerateReport = async () => {
    if (!selectedReport || !selectedYear || !selectedPeriod) return;
    
    setGenerating(true);
    try {
      const res = await axios.post(`${API}/api/people-ops/regulatory-reports/generate`, {
        report_type: selectedReport,
        year: parseInt(selectedYear),
        period: selectedPeriod
      }, { withCredentials: true });
      
      setPreviewData(res.data);
      setShowPreview(true);
      setShowDialog(false);
      fetchGeneratedReports();
    } catch (err) {
      console.error("Error generating report:", err);
      alert(err.response?.data?.detail || "Error generating report");
    }
    setGenerating(false);
  };

  const handleDownloadReport = async (reportId, format = "xlsx") => {
    try {
      const res = await axios.get(
        `${API}/api/people-ops/regulatory-reports/${reportId}/download?format=${format}`,
        { withCredentials: true, responseType: 'blob' }
      );
      
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report_${reportId}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Error downloading report:", err);
      alert(err.response?.data?.detail || "Error downloading report");
    }
  };

  const getReportTypeConfig = (typeId) => {
    return REPORT_TYPES.find(rt => rt.id === typeId) || REPORT_TYPES[0];
  };

  const isQuarterly = selectedReport === "dgt3";

  return (
    <div className="space-y-6" data-testid="regulatory-reports-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {isEs ? "Reportes Regulatorios" : "Regulatory Reports"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs 
              ? "Genera reportes para DGT-3, TSS, DGII según regulaciones de RD" 
              : "Generate reports for DGT-3, TSS, DGII per DR regulations"}
          </p>
        </div>
        <Button onClick={() => setShowDialog(true)} data-testid="generate-report-btn">
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          {isEs ? "Generar Reporte" : "Generate Report"}
        </Button>
      </div>

      {/* Report Type Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {REPORT_TYPES.map(rt => {
          const Icon = rt.icon;
          return (
            <Card 
              key={rt.id}
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => {
                setSelectedReport(rt.id);
                setSelectedPeriod("");
                setShowDialog(true);
              }}
            >
              <CardContent className="pt-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="font-semibold">{rt.name}</p>
                    <p className="text-xs text-muted-foreground">{rt.entity}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {isEs ? rt.description : rt.descriptionEn}
                </p>
                <Badge variant="outline" className="text-xs">
                  {isEs ? rt.frequency : rt.frequencyEn}
                </Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Generated Reports History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isEs ? "Reportes Generados" : "Generated Reports"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : generatedReports.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{isEs ? "No hay reportes generados" : "No reports generated"}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                  <TableHead>{isEs ? "Período" : "Period"}</TableHead>
                  <TableHead>{isEs ? "Generado" : "Generated"}</TableHead>
                  <TableHead>{isEs ? "Empleados" : "Employees"}</TableHead>
                  <TableHead>{isEs ? "Total" : "Total"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Acciones" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {generatedReports.map((report) => {
                  const config = getReportTypeConfig(report.report_type);
                  return (
                    <TableRow key={report.report_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-violet-100 text-violet-700">{config.name}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>{report.period} {report.year}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(report.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>{report.employee_count}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(report.total_amount)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setPreviewData(report);
                              setShowPreview(true);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDownloadReport(report.report_id, "xlsx")}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Generate Report Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEs ? "Generar Reporte Regulatorio" : "Generate Regulatory Report"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>{isEs ? "Tipo de Reporte" : "Report Type"}</Label>
              <Select value={selectedReport} onValueChange={(v) => { setSelectedReport(v); setSelectedPeriod(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map(rt => (
                    <SelectItem key={rt.id} value={rt.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{rt.name}</span>
                        <span className="text-muted-foreground">- {isEs ? rt.description : rt.descriptionEn}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{isEs ? "Año" : "Year"}</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{isEs ? (isQuarterly ? "Trimestre" : "Mes") : (isQuarterly ? "Quarter" : "Month")}</Label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder={isEs ? "Seleccionar..." : "Select..."} />
                </SelectTrigger>
                <SelectContent>
                  {isQuarterly 
                    ? QUARTERS.map(q => (
                        <SelectItem key={q.value} value={q.value}>
                          {isEs ? q.label : q.labelEn}
                        </SelectItem>
                      ))
                    : MONTHS.map(m => (
                        <SelectItem key={m.value} value={m.value}>
                          {isEs ? m.label : m.labelEn}
                        </SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>

            {selectedReport && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-sm text-blue-800">
                  {selectedReport === "dgt3" && (isEs 
                    ? "El DGT-3 incluye: Empleados activos, salarios, AFP, ARS y otros beneficios."
                    : "DGT-3 includes: Active employees, salaries, AFP, ARS and other benefits.")}
                  {selectedReport === "tss" && (isEs 
                    ? "El reporte TSS incluye: Aportes AFP y ARS del empleado y empleador."
                    : "TSS report includes: AFP and ARS contributions from employee and employer.")}
                  {selectedReport === "dgii_ir17" && (isEs 
                    ? "El IR-17 incluye: ISR retenido a empleados durante el período."
                    : "IR-17 includes: ISR withheld from employees during the period.")}
                  {selectedReport === "dgii_606" && (isEs 
                    ? "El 606 incluye: Compras y gastos del período con sus retenciones."
                    : "606 includes: Purchases and expenses for the period with withholdings.")}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button 
              onClick={handleGenerateReport} 
              disabled={generating || !selectedReport || !selectedPeriod}
            >
              {generating && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              {isEs ? "Generar" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {previewData && `${getReportTypeConfig(previewData.report_type).name} - ${previewData.period} ${previewData.year}`}
            </DialogTitle>
          </DialogHeader>
          
          {previewData && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-2xl font-bold text-violet-600">{previewData.employee_count}</p>
                    <p className="text-xs text-muted-foreground">{isEs ? "Empleados" : "Employees"}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-2xl font-bold">{formatCurrency(previewData.total_salaries)}</p>
                    <p className="text-xs text-muted-foreground">{isEs ? "Total Salarios" : "Total Salaries"}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-2xl font-bold text-emerald-600">{formatCurrency(previewData.total_amount)}</p>
                    <p className="text-xs text-muted-foreground">{isEs ? "Total Aportes/Retenciones" : "Total Contributions"}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Detail Table */}
              {previewData.entries && previewData.entries.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isEs ? "Cédula" : "ID"}</TableHead>
                      <TableHead>{isEs ? "Nombre" : "Name"}</TableHead>
                      <TableHead className="text-right">{isEs ? "Salario" : "Salary"}</TableHead>
                      <TableHead className="text-right">AFP</TableHead>
                      <TableHead className="text-right">ARS</TableHead>
                      {previewData.report_type.includes("dgii") && (
                        <TableHead className="text-right">ISR</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.entries.slice(0, 20).map((entry, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm">{entry.national_id || "-"}</TableCell>
                        <TableCell>{entry.employee_name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(entry.salary)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(entry.afp_total)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(entry.ars_total)}</TableCell>
                        {previewData.report_type.includes("dgii") && (
                          <TableCell className="text-right">{formatCurrency(entry.isr)}</TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              {isEs ? "Cerrar" : "Close"}
            </Button>
            {previewData?.report_id && (
              <Button onClick={() => handleDownloadReport(previewData.report_id, "xlsx")}>
                <Download className="w-4 h-4 mr-2" />
                {isEs ? "Descargar Excel" : "Download Excel"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
