import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { toast } from "sonner";
import { 
  Upload, Download, Users, Package, 
  ChefHat, Loader2, CheckCircle2, AlertCircle, FileDown,
  FileText, CalendarDays, UserPlus
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

// Filter options:
// - "culinary" = inventory, recipes only
// - "business" = clients, leads, quotes, events only  
// - undefined/null = all modules
export default function ImportExportSection({ filter }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [exportFormat, setExportFormat] = useState("csv");
  const [leadImportType, setLeadImportType] = useState("outreach");
  const [leadImportSource, setLeadImportSource] = useState("");
  const [leadSources, setLeadSources] = useState([]);

  useEffect(() => {
    const fetchSources = async () => {
      try {
        const res = await axios.get(`${API}/api/crm/lead-sources`, { withCredentials: true });
        setLeadSources(res.data || []);
      } catch { /* ignore */ }
    };
    fetchSources();
  }, []);

  const allModules = [
    { 
      id: "clients", 
      name: isEs ? "Clientes" : "Clients", 
      icon: Users,
      description: isEs ? "Nombre, email, teléfono, empresa" : "Name, email, phone, company",
      category: "business"
    },
    { 
      id: "leads", 
      name: "Leads", 
      icon: UserPlus,
      description: isEs ? "Prospectos, fuente, valor estimado, estado" : "Prospects, source, estimated value, status",
      category: "business"
    },
    { 
      id: "inventory", 
      name: isEs ? "Inventario" : "Inventory", 
      icon: Package,
      description: isEs ? "Ingredientes, costos, stock, proveedores" : "Ingredients, costs, stock, suppliers",
      category: "culinary"
    },
    { 
      id: "recipes", 
      name: isEs ? "Recetas" : "Recipes", 
      icon: ChefHat,
      description: isEs ? "Nombre, ingredientes, porciones, instrucciones" : "Name, ingredients, servings, instructions",
      category: "culinary"
    },
    { 
      id: "quotes", 
      name: isEs ? "Cotizaciones" : "Quotes", 
      icon: FileText,
      description: isEs ? "Cliente, fecha, items, totales, estado" : "Client, date, items, totals, status",
      category: "business"
    },
    { 
      id: "events", 
      name: isEs ? "Eventos" : "Events", 
      icon: CalendarDays,
      description: isEs ? "Nombre, cliente, fecha, ubicación, invitados" : "Name, client, date, location, guests",
      category: "business"
    }
  ];

  // Filter modules based on the filter prop
  const modules = filter 
    ? allModules.filter(m => m.category === filter)
    : allModules;

  const handleExport = async (type) => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${API}/api/import-export/${type}/export?format=${exportFormat}`,
        { 
          withCredentials: true,
          responseType: 'blob'
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type}.${exportFormat === 'excel' ? 'xlsx' : 'csv'}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success(isEs ? "Exportación completada" : "Export completed");
    } catch (error) {
      toast.error(isEs ? "Error al exportar" : "Export failed");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (type, file) => {
    if (!file) return;
    
    setLoading(true);
    setResults(null);
    
    const formData = new FormData();
    formData.append('file', file);
    
    // Build query params for leads import
    let queryParams = "";
    if (type === "leads") {
      const params = new URLSearchParams();
      if (leadImportType) params.append("default_lead_type", leadImportType);
      // "from_csv" means use source from CSV file, so don't send default_source
      if (leadImportSource && leadImportSource !== "from_csv") {
        params.append("default_source", leadImportSource);
      }
      queryParams = params.toString() ? `?${params.toString()}` : "";
    }
    
    try {
      const response = await axios.post(
        `${API}/api/import-export/${type}/import${queryParams}`,
        formData,
        { 
          withCredentials: true,
          headers: { 'Content-Type': 'multipart/form-data' }
        }
      );
      
      setResults({
        type,
        ...response.data
      });
      
      if (response.data.imported > 0) {
        toast.success(
          isEs 
            ? `${response.data.imported} registros importados` 
            : `${response.data.imported} records imported`
        );
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || (isEs ? "Error al importar" : "Import failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = async (type) => {
    try {
      // Add timestamp to prevent browser/CDN caching
      const cacheBuster = Date.now();
      const response = await axios.get(
        `${API}/api/import-export/templates/${type}?format=${exportFormat}&_t=${cacheBuster}`,
        { 
          responseType: 'blob',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `template_${type}.${exportFormat === 'excel' ? 'xlsx' : 'csv'}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success(isEs ? "Plantilla descargada" : "Template downloaded");
    } catch (error) {
      toast.error(isEs ? "Error al descargar plantilla" : "Failed to download template");
    }
  };

  return (
    <div className="space-y-6">
      {/* Format Selection */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Label>{isEs ? "Formato:" : "Format:"}</Label>
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="excel">Excel (.xlsx)</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              {isEs 
                ? "Para Google Sheets, usa CSV y luego importa en Sheets" 
                : "For Google Sheets, use CSV then import into Sheets"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Modules */}
      <Tabs defaultValue={modules[0]?.id || "clients"} className="space-y-4">
        <TabsList className={`grid w-full ${modules.length === 2 ? 'grid-cols-2' : modules.length === 4 ? 'grid-cols-4' : 'grid-cols-6'}`}>
          {modules.map(module => (
            <TabsTrigger key={module.id} value={module.id} className="gap-1 text-xs px-2">
              <module.icon className="w-3 h-3" />
              <span className="hidden lg:inline">{module.name}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {modules.map(module => (
          <TabsContent key={module.id} value={module.id}>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Export Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Download className="w-5 h-5 text-green-500" />
                    {isEs ? "Exportar" : "Export"} {module.name}
                  </CardTitle>
                  <CardDescription>
                    {module.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={() => handleExport(module.id)}
                    disabled={loading}
                    className="w-full"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    {isEs ? "Exportar" : "Export"} {exportFormat.toUpperCase()}
                  </Button>
                </CardContent>
              </Card>

              {/* Import Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Upload className="w-5 h-5 text-blue-500" />
                    {isEs ? "Importar" : "Import"} {module.name}
                  </CardTitle>
                  <CardDescription>
                    {isEs ? "Sube un archivo CSV o Excel" : "Upload a CSV or Excel file"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Lead-specific import options */}
                  {module.id === "leads" && (
                    <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">{isEs ? "Tipo de Lead" : "Lead Type"}</Label>
                          <Select value={leadImportType} onValueChange={setLeadImportType}>
                            <SelectTrigger className="h-8 text-xs" data-testid="import-lead-type-selector">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="outreach">Outreach</SelectItem>
                              <SelectItem value="inbound">Inbound</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">{isEs ? "Fuente" : "Source"}</Label>
                          <Select value={leadImportSource} onValueChange={setLeadImportSource}>
                            <SelectTrigger className="h-8 text-xs" data-testid="import-lead-source-selector">
                              <SelectValue placeholder={isEs ? "Fuente..." : "Source..."} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="from_csv">{isEs ? "Desde CSV" : "From CSV"}</SelectItem>
                              {leadSources.map(s => (
                                <SelectItem key={s.source_id} value={s.name}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}
                  <Input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        handleImport(module.id, e.target.files[0]);
                      }
                    }}
                    disabled={loading}
                  />
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleDownloadTemplate(module.id)}
                    className="w-full"
                  >
                    <FileDown className="w-4 h-4 mr-2" />
                    {isEs ? "Descargar Plantilla" : "Download Template"}
                  </Button>

                  {/* Results */}
                  {results && results.type === module.id && (
                    <div className="p-3 rounded-lg bg-muted space-y-2">
                      <div className="flex items-center gap-2">
                        {results.imported > 0 ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-yellow-500" />
                        )}
                        <span className="text-sm font-medium">
                          {results.imported} {isEs ? "importados" : "imported"}
                        </span>
                      </div>
                      
                      {results.errors && results.errors.length > 0 && (
                        <div className="space-y-1">
                          {results.errors.slice(0, 3).map((err, i) => (
                            <p key={i} className="text-xs text-destructive">{err}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Quick Instructions */}
      <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
        <h4 className="font-medium text-blue-700 dark:text-blue-300 mb-2">
          💡 {isEs ? "Tip para Google Sheets" : "Google Sheets Tip"}
        </h4>
        <p className="text-sm text-blue-600 dark:text-blue-400">
          {isEs 
            ? "En Google Sheets: Archivo → Descargar → Valores separados por comas (.csv)"
            : "In Google Sheets: File → Download → Comma-separated values (.csv)"}
        </p>
      </div>
    </div>
  );
}
