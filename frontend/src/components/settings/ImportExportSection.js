import { useState } from "react";
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
  FileText, CalendarDays
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function ImportExportSection() {
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
      const response = await axios.get(
        `${API}/api/import-export/templates/${type}?format=${exportFormat}`,
        { responseType: 'blob' }
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
