import { useState } from "react";
import axios from "axios";
import { useLanguage } from "../contexts/LanguageContext";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { 
  Upload, Download, FileSpreadsheet, Users, Package, 
  ChefHat, Loader2, CheckCircle2, AlertCircle, FileDown,
  FileText, CalendarDays
} from "lucide-react";

import { API_BASE as API } from "../utils/api";

export default function ImportExportPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [exportFormat, setExportFormat] = useState("csv");

  const modules = [
    { 
      id: "clients", 
      name: isEs ? "Clientes" : "Clients", 
      icon: Users,
      description: isEs ? "Nombre, email, teléfono, empresa" : "Name, email, phone, company"
    },
    { 
      id: "inventory", 
      name: isEs ? "Inventario" : "Inventory", 
      icon: Package,
      description: isEs ? "Ingredientes, costos, stock, proveedores" : "Ingredients, costs, stock, suppliers"
    },
    { 
      id: "recipes", 
      name: isEs ? "Recetas" : "Recipes", 
      icon: ChefHat,
      description: isEs ? "Nombre, ingredientes, porciones, instrucciones" : "Name, ingredients, servings, instructions"
    },
    { 
      id: "quotes", 
      name: isEs ? "Cotizaciones" : "Quotes", 
      icon: FileText,
      description: isEs ? "Cliente, fecha, items, totales, estado" : "Client, date, items, totals, status"
    },
    { 
      id: "events", 
      name: isEs ? "Eventos" : "Events", 
      icon: CalendarDays,
      description: isEs ? "Nombre, cliente, fecha, ubicación, invitados" : "Name, client, date, location, guests"
    }
  ];

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
    
    try {
      const response = await axios.post(
        `${API}/api/import-export/${type}/import`,
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6" />
          {isEs ? "Importar / Exportar Datos" : "Import / Export Data"}
        </h1>
        <p className="text-muted-foreground">
          {isEs 
            ? "Importa datos desde CSV o Excel, o exporta tus datos actuales" 
            : "Import data from CSV or Excel, or export your current data"}
        </p>
      </div>

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
      <Tabs defaultValue="clients" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          {modules.map(module => (
            <TabsTrigger key={module.id} value={module.id} className="gap-2 text-xs md:text-sm">
              <module.icon className="w-4 h-4" />
              <span className="hidden md:inline">{module.name}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {modules.map(module => (
          <TabsContent key={module.id} value={module.id}>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Export Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="w-5 h-5 text-green-500" />
                    {isEs ? "Exportar" : "Export"} {module.name}
                  </CardTitle>
                  <CardDescription>
                    {isEs 
                      ? `Descarga todos tus ${module.name.toLowerCase()} en formato ${exportFormat.toUpperCase()}`
                      : `Download all your ${module.name.toLowerCase()} in ${exportFormat.toUpperCase()} format`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {module.description}
                  </p>
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => handleExport(module.id)}
                      disabled={loading}
                      className="flex-1"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Download className="w-4 h-4 mr-2" />
                      )}
                      {isEs ? "Exportar" : "Export"} {exportFormat.toUpperCase()}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Import Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="w-5 h-5 text-blue-500" />
                    {isEs ? "Importar" : "Import"} {module.name}
                  </CardTitle>
                  <CardDescription>
                    {isEs 
                      ? "Sube un archivo CSV o Excel con tus datos"
                      : "Upload a CSV or Excel file with your data"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>{isEs ? "Archivo" : "File"}</Label>
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
                  </div>
                  
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
                    <div className="p-4 rounded-lg bg-muted space-y-2">
                      <div className="flex items-center gap-2">
                        {results.imported > 0 ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-yellow-500" />
                        )}
                        <span className="font-medium">
                          {results.imported} {isEs ? "registros importados" : "records imported"}
                        </span>
                      </div>
                      
                      {results.errors && results.errors.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">
                            {isEs ? "Errores:" : "Errors:"}
                          </p>
                          {results.errors.map((err, i) => (
                            <p key={i} className="text-sm text-destructive">
                              {err}
                            </p>
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

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>{isEs ? "Instrucciones" : "Instructions"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Badge variant="outline">1</Badge>
              <h4 className="font-medium">{isEs ? "Descarga la plantilla" : "Download template"}</h4>
              <p className="text-sm text-muted-foreground">
                {isEs 
                  ? "Usa la plantilla para ver el formato correcto de los datos"
                  : "Use the template to see the correct data format"}
              </p>
            </div>
            <div className="space-y-2">
              <Badge variant="outline">2</Badge>
              <h4 className="font-medium">{isEs ? "Llena tus datos" : "Fill your data"}</h4>
              <p className="text-sm text-muted-foreground">
                {isEs 
                  ? "Agrega tus datos en Excel, CSV o Google Sheets"
                  : "Add your data in Excel, CSV or Google Sheets"}
              </p>
            </div>
            <div className="space-y-2">
              <Badge variant="outline">3</Badge>
              <h4 className="font-medium">{isEs ? "Importa el archivo" : "Import the file"}</h4>
              <p className="text-sm text-muted-foreground">
                {isEs 
                  ? "Sube el archivo y los datos se agregarán automáticamente"
                  : "Upload the file and data will be added automatically"}
              </p>
            </div>
          </div>
          
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
        </CardContent>
      </Card>
    </div>
  );
}
