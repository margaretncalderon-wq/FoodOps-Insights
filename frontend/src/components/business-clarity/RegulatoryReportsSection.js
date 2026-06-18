import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
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
  FileSpreadsheet, CheckCircle, AlertCircle, Clock, Eye,
  Settings, Globe, Flag
} from "lucide-react";
import { toast } from "sonner";

import { API_BASE as API } from "../../utils/api";
import { formatDateOnly } from "../../utils/dates";

const formatCurrency = (amount) => 
  `$${(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

const BIMONTHS = [
  { value: "B1", label: "Ene-Feb", labelEn: "Jan-Feb" },
  { value: "B2", label: "Mar-Abr", labelEn: "Mar-Apr" },
  { value: "B3", label: "May-Jun", labelEn: "May-Jun" },
  { value: "B4", label: "Jul-Ago", labelEn: "Jul-Aug" },
  { value: "B5", label: "Sep-Oct", labelEn: "Sep-Oct" },
  { value: "B6", label: "Nov-Dic", labelEn: "Nov-Dec" }
];

// Icon mapping for report types
const getReportIcon = (reportId) => {
  if (reportId.includes("dgt") || reportId.includes("pila")) return FileText;
  if (reportId.includes("tss") || reportId.includes("imss") || reportId.includes("eps")) return Building2;
  return FileSpreadsheet;
};

export function RegulatoryReportsSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const navigate = useNavigate();
  
  const [generatedReports, setGeneratedReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  
  // Regulatory config state
  const [regulatoryConfig, setRegulatoryConfig] = useState(null);
  const [availableCountries, setAvailableCountries] = useState([]);
  const [reportTypes, setReportTypes] = useState([]);
  const [savingConfig, setSavingConfig] = useState(false);
  
  // Form state
  const [selectedReport, setSelectedReport] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedPeriod, setSelectedPeriod] = useState("");

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  // Fetch regulatory configuration
  const fetchRegulatoryConfig = useCallback(async () => {
    try {
      const [configRes, countriesRes] = await Promise.all([
        axios.get(`${API}/api/settings/regulatory-config`, { withCredentials: true }),
        axios.get(`${API}/api/settings/available-countries`, { withCredentials: true })
      ]);
      setRegulatoryConfig(configRes.data);
      setAvailableCountries(countriesRes.data || []);
      setReportTypes(configRes.data?.available_reports || []);
    } catch (err) {
      console.error("Error fetching regulatory config:", err);
      // Default to empty config if not found
      setReportTypes([]);
    }
  }, []);

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

  useEffect(() => { 
    fetchRegulatoryConfig();
    fetchGeneratedReports(); 
  }, [fetchRegulatoryConfig, fetchGeneratedReports]);

  const handleSaveConfig = async () => {
    if (!regulatoryConfig) return;
    setSavingConfig(true);
    try {
      const res = await axios.post(`${API}/api/settings/regulatory-config`, {
        country_code: regulatoryConfig.country_code,
        auto_loan_deduction: regulatoryConfig.auto_loan_deduction,
        loan_deduction_priority: regulatoryConfig.loan_deduction_priority
      }, { withCredentials: true });
      
      setRegulatoryConfig(res.data.config);
      setReportTypes(res.data.config?.available_reports || []);
      setShowConfigDialog(false);
      toast.success(isEs ? "Configuración guardada" : "Configuration saved");
      fetchGeneratedReports();
    } catch (err) {
      console.error("Error saving config:", err);
      toast.error(err.response?.data?.detail || "Error saving configuration");
    }
    setSavingConfig(false);
  };

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
      toast.success(isEs ? "Reporte generado exitosamente" : "Report generated successfully");
    } catch (err) {
      console.error("Error generating report:", err);
      toast.error(err.response?.data?.detail || "Error generating report");
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
      toast.error(err.response?.data?.detail || "Error downloading report");
    }
  };

  const getReportTypeConfig = (typeId) => {
    return reportTypes.find(rt => rt.id === typeId) || reportTypes[0] || { name: typeId, entity: "" };
  };

  // Determine period type based on selected report frequency
  const getSelectedReportFrequency = () => {
    const report = reportTypes.find(rt => rt.id === selectedReport);
    return report?.frequency || "monthly";
  };

  const selectedFrequency = getSelectedReportFrequency();
  const isQuarterly = selectedFrequency === "quarterly";
  const isBimonthly = selectedFrequency === "bimonthly";
  const isAnnual = selectedFrequency === "annual";

  // Get frequency label
  const getFrequencyLabel = (freq) => {
    const labels = {
      monthly: isEs ? "Mensual" : "Monthly",
      quarterly: isEs ? "Trimestral" : "Quarterly",
      bimonthly: isEs ? "Bimestral" : "Bimonthly",
      annual: isEs ? "Anual" : "Annual",
      per_payroll: isEs ? "Por Nómina" : "Per Payroll"
    };
    return labels[freq] || freq;
  };

  return (
    <div className="space-y-6" data-testid="regulatory-reports-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {isEs ? "Reportes Regulatorios" : "Regulatory Reports"}
          </h2>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            {regulatoryConfig ? (
              <>
                <Flag className="w-3 h-3" />
                {isEs ? regulatoryConfig.country_name : regulatoryConfig.country_name_en}
                {" - "}
                {isEs 
                  ? `${reportTypes.length} reportes disponibles` 
                  : `${reportTypes.length} reports available`}
              </>
            ) : (
              isEs ? "Cargando configuración..." : "Loading configuration..."
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowConfigDialog(true)} data-testid="config-btn">
            <Settings className="w-4 h-4 mr-2" />
            {isEs ? "Configurar País" : "Configure Country"}
          </Button>
          <Button onClick={() => setShowDialog(true)} disabled={reportTypes.length === 0} data-testid="generate-report-btn">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            {isEs ? "Generar Reporte" : "Generate Report"}
          </Button>
        </div>
      </div>

      {/* No country configured message */}
      {reportTypes.length === 0 && !loading && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <Globe className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">
              {isEs ? "Configura tu país" : "Configure your country"}
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              {isEs 
                ? "Selecciona el país de tu organización para ver los reportes regulatorios disponibles y configurar las deducciones de nómina correspondientes."
                : "Select your organization's country to see available regulatory reports and configure corresponding payroll deductions."}
            </p>
            <Button onClick={() => setShowConfigDialog(true)}>
              <Settings className="w-4 h-4 mr-2" />
              {isEs ? "Configurar País" : "Configure Country"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Report Type Cards */}
      {reportTypes.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {reportTypes.map(rt => {
            const Icon = getReportIcon(rt.id);
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
                    {isEs ? rt.description : rt.description_en}
                </p>
                <Badge variant="outline" className="text-xs">
                  {getFrequencyLabel(rt.frequency)}
                </Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>
      )}

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
                        {formatDateOnly(report.created_at, language)}
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
                  {reportTypes.map(rt => (
                    <SelectItem key={rt.id} value={rt.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{rt.name}</span>
                        <span className="text-muted-foreground">- {isEs ? rt.description : rt.description_en}</span>
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

            {!isAnnual && (
              <div>
                <Label>
                  {isEs 
                    ? (isQuarterly ? "Trimestre" : isBimonthly ? "Bimestre" : "Mes") 
                    : (isQuarterly ? "Quarter" : isBimonthly ? "Bimonth" : "Month")}
                </Label>
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
                      : isBimonthly
                        ? BIMONTHS.map(b => (
                            <SelectItem key={b.value} value={b.value}>
                              {isEs ? b.label : b.labelEn}
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
            )}

            {isAnnual && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-sm text-amber-800">
                  {isEs 
                    ? "Este reporte es anual. Se generará para todo el año seleccionado."
                    : "This is an annual report. It will be generated for the entire selected year."}
                </p>
              </div>
            )}

            {selectedReport && !isAnnual && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-sm text-blue-800">
                  {getReportTypeConfig(selectedReport)?.description || 
                    (isEs ? "Selecciona un período para generar el reporte." : "Select a period to generate the report.")}
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
              disabled={generating || !selectedReport || (!isAnnual && !selectedPeriod)}
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

      {/* Country Configuration Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              {isEs ? "Configuración Regulatoria" : "Regulatory Configuration"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Country Selection */}
            <div className="space-y-2">
              <Label>{isEs ? "País de Operación" : "Operating Country"}</Label>
              <p className="text-xs text-muted-foreground mb-2">
                {isEs 
                  ? "Selecciona el país para cargar los reportes regulatorios y configuración de deducciones correspondientes."
                  : "Select the country to load corresponding regulatory reports and deduction configuration."}
              </p>
              <Select 
                value={regulatoryConfig?.country_code || "DO"} 
                onValueChange={(v) => setRegulatoryConfig(prev => ({ ...prev, country_code: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableCountries.map(country => (
                    <SelectItem key={country.code} value={country.code}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{isEs ? country.name : country.name_en}</span>
                        <span className="text-muted-foreground text-xs">({country.report_count} {isEs ? "reportes" : "reports"})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payroll Deduction Settings */}
            <div className="space-y-4 pt-4 border-t">
              <h4 className="font-medium flex items-center gap-2">
                <Settings className="w-4 h-4" />
                {isEs ? "Deducciones de Nómina" : "Payroll Deductions"}
              </h4>
              
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium text-sm">
                    {isEs ? "Descuento automático de préstamos" : "Automatic loan deduction"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isEs 
                      ? "Descontar cuotas de préstamos activos automáticamente de la nómina"
                      : "Automatically deduct active loan installments from payroll"}
                  </p>
                </div>
                <Switch 
                  checked={regulatoryConfig?.auto_loan_deduction ?? true}
                  onCheckedChange={(v) => setRegulatoryConfig(prev => ({ ...prev, auto_loan_deduction: v }))}
                />
              </div>

              {regulatoryConfig?.auto_loan_deduction && (
                <div className="space-y-2 pl-4">
                  <Label>{isEs ? "Prioridad de descuento" : "Deduction priority"}</Label>
                  <Select 
                    value={regulatoryConfig?.loan_deduction_priority || "installment_first"} 
                    onValueChange={(v) => setRegulatoryConfig(prev => ({ ...prev, loan_deduction_priority: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="installment_first">
                        {isEs ? "Cuota fija primero" : "Fixed installment first"}
                      </SelectItem>
                      <SelectItem value="percentage_first">
                        {isEs ? "Porcentaje del salario primero" : "Salary percentage first"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Current Country Reports Preview */}
            {regulatoryConfig?.country_code && (
              <div className="space-y-2 pt-4 border-t">
                <Label>{isEs ? "Reportes disponibles para este país" : "Available reports for this country"}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(availableCountries.find(c => c.code === regulatoryConfig.country_code) ? reportTypes : []).map(rt => (
                    <div key={rt.id} className="p-2 border rounded text-sm flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{rt.name}</Badge>
                      <span className="text-muted-foreground text-xs">{getFrequencyLabel(rt.frequency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigDialog(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleSaveConfig} disabled={savingConfig}>
              {savingConfig && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              {isEs ? "Guardar Configuración" : "Save Configuration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
