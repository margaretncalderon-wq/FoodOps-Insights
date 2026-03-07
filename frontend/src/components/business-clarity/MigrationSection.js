import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
import { Progress } from "../ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
  Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle,
  RefreshCw, Database, ShoppingCart, Package, Wallet, Receipt,
  CreditCard, Building2, DollarSign, ArrowRight, FileText,
  Calendar, Clock, Trash2, Eye, Plus, X, Check, Users
} from "lucide-react";
import { toast } from "sonner";

import { API_BASE as API } from "../../utils/api";

// Migration data types configuration - ORDER MATTERS for recommended import sequence
const MIGRATION_TYPES = {
  clients: {
    id: "clients",
    label: "Clients",
    labelEs: "Clientes",
    icon: Users,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    description: "Import client directory (recommended first)",
    descriptionEs: "Importar directorio de clientes (recomendado primero)",
    source: "Tripleseat / Alegra / Excel",
    fields: ["rnc", "name", "contact_name", "email", "phone", "address"],
    order: 1
  },
  vendors: {
    id: "vendors",
    label: "Vendors",
    labelEs: "Proveedores",
    icon: Building2,
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
    description: "Import vendor directory (recommended second)",
    descriptionEs: "Importar directorio de proveedores (recomendado segundo)",
    source: "Alegra / Excel",
    fields: ["rnc", "name", "contact_name", "email", "phone", "address", "category"],
    order: 2
  },
  sales: {
    id: "sales",
    label: "Sales",
    labelEs: "Ventas",
    icon: ShoppingCart,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    description: "Import sales transactions with ITBIS",
    descriptionEs: "Importar transacciones de venta con ITBIS",
    source: "Tripleseat / Alegra",
    fields: ["date", "client_rnc", "client_name", "description", "subtotal", "itbis", "total", "ncf", "status"],
    order: 3
  },
  purchases: {
    id: "purchases",
    label: "Purchases",
    labelEs: "Compras",
    icon: Receipt,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    description: "Import purchase transactions with ITBIS",
    descriptionEs: "Importar transacciones de compra con ITBIS",
    source: "Alegra",
    fields: ["date", "vendor_rnc", "vendor_name", "description", "subtotal", "itbis", "total", "ncf", "status"],
    order: 4
  },
  inventory: {
    id: "inventory",
    label: "Initial Inventory",
    labelEs: "Inventario Inicial",
    icon: Package,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    description: "Import initial inventory quantities and costs",
    descriptionEs: "Importar cantidades y costos de inventario inicial",
    source: "Excel / Notion",
    fields: ["sku", "name", "category", "quantity", "unit_cost", "total_value"],
    order: 5
  },
  fixed_expenses: {
    id: "fixed_expenses",
    label: "Fixed Expenses",
    labelEs: "Gastos Fijos",
    icon: Building2,
    color: "text-violet-600",
    bgColor: "bg-violet-50",
    description: "Import recurring fixed expenses (rent, payroll, etc.)",
    descriptionEs: "Importar gastos fijos recurrentes (renta, nómina, etc.)",
    source: "Alegra / Excel",
    fields: ["date", "category", "description", "amount", "frequency", "vendor"],
    order: 6
  },
  variable_expenses: {
    id: "variable_expenses",
    label: "Variable Expenses",
    labelEs: "Gastos Variables",
    icon: Wallet,
    color: "text-rose-600",
    bgColor: "bg-rose-50",
    description: "Import variable operational expenses",
    descriptionEs: "Importar gastos operativos variables",
    source: "Alegra / Excel",
    fields: ["date", "category", "description", "amount", "vendor", "event_id"],
    order: 7
  },
  bank_balances: {
    id: "bank_balances",
    label: "Bank Balances",
    labelEs: "Saldos Bancarios",
    icon: DollarSign,
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    description: "Import initial bank account balances",
    descriptionEs: "Importar saldos iniciales de cuentas bancarias",
    source: "Manual / Bank Statement",
    fields: ["account_name", "bank", "account_number", "balance", "as_of_date"],
    order: 8
  },
  accounts_receivable: {
    id: "accounts_receivable",
    label: "Accounts Receivable",
    labelEs: "Cuentas por Cobrar",
    icon: CreditCard,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    description: "Import pending customer balances",
    descriptionEs: "Importar saldos pendientes de clientes",
    source: "Tripleseat / Alegra",
    fields: ["client_rnc", "client_name", "invoice_number", "date", "due_date", "amount", "balance"],
    order: 9
  },
  accounts_payable: {
    id: "accounts_payable",
    label: "Accounts Payable",
    labelEs: "Cuentas por Pagar",
    icon: Receipt,
    color: "text-red-600",
    bgColor: "bg-red-50",
    description: "Import pending vendor balances",
    descriptionEs: "Importar saldos pendientes con proveedores",
    source: "Alegra",
    fields: ["vendor_rnc", "vendor_name", "invoice_number", "date", "due_date", "amount", "balance"],
    order: 10
  }
};

// Template field definitions
const FIELD_TEMPLATES = {
  clients: [
    { field: "rnc", label: "RNC/Cédula", labelEn: "RNC/ID", required: false, type: "text", example: "101234567" },
    { field: "name", label: "Nombre/Razón Social", labelEn: "Name/Company", required: true, type: "text", example: "Empresa ABC, SRL" },
    { field: "contact_name", label: "Contacto", labelEn: "Contact Name", required: false, type: "text", example: "Juan Pérez" },
    { field: "email", label: "Email", labelEn: "Email", required: false, type: "text", example: "contacto@empresa.com" },
    { field: "phone", label: "Teléfono", labelEn: "Phone", required: false, type: "text", example: "809-555-1234" },
    { field: "address", label: "Dirección", labelEn: "Address", required: false, type: "text", example: "Calle Principal #123" }
  ],
  vendors: [
    { field: "rnc", label: "RNC", labelEn: "RNC", required: false, type: "text", example: "101234567" },
    { field: "name", label: "Nombre/Razón Social", labelEn: "Name/Company", required: true, type: "text", example: "Distribuidora XYZ" },
    { field: "contact_name", label: "Contacto", labelEn: "Contact Name", required: false, type: "text", example: "María García" },
    { field: "email", label: "Email", labelEn: "Email", required: false, type: "text", example: "ventas@proveedor.com" },
    { field: "phone", label: "Teléfono", labelEn: "Phone", required: false, type: "text", example: "809-555-5678" },
    { field: "address", label: "Dirección", labelEn: "Address", required: false, type: "text", example: "Av. Industrial #456" },
    { field: "category", label: "Categoría", labelEn: "Category", required: false, type: "text", example: "Alimentos/Bebidas/Equipos" }
  ],
  sales: [
    { field: "date", label: "Fecha", labelEn: "Date", required: true, type: "date", example: "2025-01-15" },
    { field: "client_rnc", label: "RNC Cliente", labelEn: "Client RNC", required: false, type: "text", example: "101234567" },
    { field: "client_name", label: "Nombre Cliente", labelEn: "Client Name", required: true, type: "text", example: "Empresa ABC" },
    { field: "description", label: "Descripción", labelEn: "Description", required: false, type: "text", example: "Evento corporativo" },
    { field: "subtotal", label: "Subtotal", labelEn: "Subtotal", required: true, type: "number", example: "50000" },
    { field: "itbis", label: "ITBIS", labelEn: "ITBIS", required: true, type: "number", example: "9000" },
    { field: "total", label: "Total", labelEn: "Total", required: true, type: "number", example: "59000" },
    { field: "ncf", label: "NCF", labelEn: "NCF", required: false, type: "text", example: "B0100000001" },
    { field: "status", label: "Estado", labelEn: "Status", required: false, type: "text", example: "paid/pending" }
  ],
  purchases: [
    { field: "date", label: "Fecha", labelEn: "Date", required: true, type: "date", example: "2025-01-15" },
    { field: "vendor_rnc", label: "RNC Proveedor", labelEn: "Vendor RNC", required: false, type: "text", example: "101234567" },
    { field: "vendor_name", label: "Nombre Proveedor", labelEn: "Vendor Name", required: true, type: "text", example: "Distribuidora XYZ" },
    { field: "description", label: "Descripción", labelEn: "Description", required: false, type: "text", example: "Insumos de cocina" },
    { field: "subtotal", label: "Subtotal", labelEn: "Subtotal", required: true, type: "number", example: "25000" },
    { field: "itbis", label: "ITBIS", labelEn: "ITBIS", required: true, type: "number", example: "4500" },
    { field: "total", label: "Total", labelEn: "Total", required: true, type: "number", example: "29500" },
    { field: "ncf", label: "NCF Proveedor", labelEn: "Vendor NCF", required: false, type: "text", example: "B0100000001" },
    { field: "status", label: "Estado", labelEn: "Status", required: false, type: "text", example: "paid/pending" }
  ],
  inventory: [
    { field: "sku", label: "SKU/Código", labelEn: "SKU/Code", required: false, type: "text", example: "INV-001" },
    { field: "name", label: "Nombre", labelEn: "Name", required: true, type: "text", example: "Aceite de Oliva" },
    { field: "category", label: "Categoría", labelEn: "Category", required: false, type: "text", example: "Aceites" },
    { field: "quantity", label: "Cantidad", labelEn: "Quantity", required: true, type: "number", example: "50" },
    { field: "unit", label: "Unidad", labelEn: "Unit", required: false, type: "text", example: "Litros" },
    { field: "unit_cost", label: "Costo Unitario", labelEn: "Unit Cost", required: true, type: "number", example: "450" },
    { field: "total_value", label: "Valor Total", labelEn: "Total Value", required: false, type: "number", example: "22500" }
  ],
  fixed_expenses: [
    { field: "date", label: "Fecha", labelEn: "Date", required: true, type: "date", example: "2025-01-01" },
    { field: "category", label: "Categoría", labelEn: "Category", required: true, type: "text", example: "Renta/Nómina/Servicios" },
    { field: "description", label: "Descripción", labelEn: "Description", required: true, type: "text", example: "Renta local principal" },
    { field: "amount", label: "Monto", labelEn: "Amount", required: true, type: "number", example: "85000" },
    { field: "frequency", label: "Frecuencia", labelEn: "Frequency", required: false, type: "text", example: "monthly" },
    { field: "vendor", label: "Proveedor", labelEn: "Vendor", required: false, type: "text", example: "Inmobiliaria ABC" }
  ],
  variable_expenses: [
    { field: "date", label: "Fecha", labelEn: "Date", required: true, type: "date", example: "2025-01-15" },
    { field: "category", label: "Categoría", labelEn: "Category", required: true, type: "text", example: "Transporte/Suministros" },
    { field: "description", label: "Descripción", labelEn: "Description", required: true, type: "text", example: "Transporte evento X" },
    { field: "amount", label: "Monto", labelEn: "Amount", required: true, type: "number", example: "5000" },
    { field: "vendor", label: "Proveedor", labelEn: "Vendor", required: false, type: "text", example: "Transportes ABC" },
    { field: "event_id", label: "ID Evento", labelEn: "Event ID", required: false, type: "text", example: "EVT-2025-001" }
  ],
  bank_balances: [
    { field: "account_name", label: "Nombre Cuenta", labelEn: "Account Name", required: true, type: "text", example: "Cuenta Operativa" },
    { field: "bank", label: "Banco", labelEn: "Bank", required: true, type: "text", example: "Banco Popular" },
    { field: "account_number", label: "No. Cuenta", labelEn: "Account Number", required: false, type: "text", example: "****1234" },
    { field: "balance", label: "Saldo", labelEn: "Balance", required: true, type: "number", example: "500000" },
    { field: "as_of_date", label: "Fecha Corte", labelEn: "As Of Date", required: true, type: "date", example: "2025-01-01" }
  ],
  accounts_receivable: [
    { field: "client_rnc", label: "RNC Cliente", labelEn: "Client RNC", required: false, type: "text", example: "101234567" },
    { field: "client_name", label: "Nombre Cliente", labelEn: "Client Name", required: true, type: "text", example: "Empresa ABC" },
    { field: "invoice_number", label: "No. Factura", labelEn: "Invoice Number", required: false, type: "text", example: "FAC-2025-001" },
    { field: "date", label: "Fecha Factura", labelEn: "Invoice Date", required: true, type: "date", example: "2025-01-15" },
    { field: "due_date", label: "Fecha Vencimiento", labelEn: "Due Date", required: false, type: "date", example: "2025-02-15" },
    { field: "amount", label: "Monto Original", labelEn: "Original Amount", required: true, type: "number", example: "50000" },
    { field: "balance", label: "Saldo Pendiente", labelEn: "Pending Balance", required: true, type: "number", example: "25000" }
  ],
  accounts_payable: [
    { field: "vendor_rnc", label: "RNC Proveedor", labelEn: "Vendor RNC", required: false, type: "text", example: "101234567" },
    { field: "vendor_name", label: "Nombre Proveedor", labelEn: "Vendor Name", required: true, type: "text", example: "Distribuidora XYZ" },
    { field: "invoice_number", label: "No. Factura", labelEn: "Invoice Number", required: false, type: "text", example: "PROV-2025-001" },
    { field: "date", label: "Fecha Factura", labelEn: "Invoice Date", required: true, type: "date", example: "2025-01-15" },
    { field: "due_date", label: "Fecha Vencimiento", labelEn: "Due Date", required: false, type: "date", example: "2025-02-15" },
    { field: "amount", label: "Monto Original", labelEn: "Original Amount", required: true, type: "number", example: "30000" },
    { field: "balance", label: "Saldo Pendiente", labelEn: "Pending Balance", required: true, type: "number", example: "30000" }
  ]
};

export function MigrationSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedType, setSelectedType] = useState(null);
  const [migrationHistory, setMigrationHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  
  // Import dialog state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importMode, setImportMode] = useState("file"); // file or manual
  const [importData, setImportData] = useState([]);
  const [importFile, setImportFile] = useState(null);
  const [importPeriod, setImportPeriod] = useState({
    month: new Date().getMonth(),
    year: new Date().getFullYear()
  });
  
  // Manual entry state
  const [manualEntries, setManualEntries] = useState([{}]);

  const fetchMigrationHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/migration/history`, { withCredentials: true });
      setMigrationHistory(res.data || []);
    } catch (err) {
      console.error("Error fetching migration history:", err);
      setMigrationHistory([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMigrationHistory();
  }, [fetchMigrationHistory]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setImportFile(file);
    
    // Parse CSV/Excel file
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", selectedType);
    
    try {
      const res = await axios.post(`${API}/api/migration/parse`, formData, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" }
      });
      setImportData(res.data.rows || []);
      toast.success(isEs ? `${res.data.rows?.length || 0} filas encontradas` : `${res.data.rows?.length || 0} rows found`);
    } catch (err) {
      toast.error(isEs ? "Error al procesar archivo" : "Error processing file");
    }
  };

  const handleImport = async () => {
    if (!selectedType) return;
    
    const dataToImport = importMode === "file" ? importData : manualEntries.filter(e => Object.keys(e).length > 0);
    
    if (dataToImport.length === 0) {
      toast.error(isEs ? "No hay datos para importar" : "No data to import");
      return;
    }
    
    setImporting(true);
    try {
      const res = await axios.post(`${API}/api/migration/import`, {
        type: selectedType,
        data: dataToImport,
        period: importPeriod
      }, { withCredentials: true });
      
      toast.success(isEs 
        ? `${res.data.imported} registros importados exitosamente` 
        : `${res.data.imported} records imported successfully`
      );
      
      setImportDialogOpen(false);
      resetImportState();
      fetchMigrationHistory();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al importar" : "Import error"));
    }
    setImporting(false);
  };

  const resetImportState = () => {
    setImportData([]);
    setImportFile(null);
    setManualEntries([{}]);
    setImportMode("file");
  };

  const openImportDialog = (typeId) => {
    setSelectedType(typeId);
    resetImportState();
    setImportDialogOpen(true);
  };

  const downloadTemplate = (typeId) => {
    const fields = FIELD_TEMPLATES[typeId];
    if (!fields) return;
    
    // Create CSV content
    const headers = fields.map(f => isEs ? f.label : f.labelEn).join(",");
    const example = fields.map(f => f.example).join(",");
    const csv = `${headers}\n${example}`;
    
    // Download
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plantilla_${typeId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success(isEs ? "Plantilla descargada" : "Template downloaded");
  };

  const addManualEntry = () => {
    setManualEntries([...manualEntries, {}]);
  };

  const removeManualEntry = (index) => {
    setManualEntries(manualEntries.filter((_, i) => i !== index));
  };

  const updateManualEntry = (index, field, value) => {
    const updated = [...manualEntries];
    updated[index] = { ...updated[index], [field]: value };
    setManualEntries(updated);
  };

  // Calculate stats
  const stats = {
    totalImported: migrationHistory.reduce((sum, h) => sum + (h.records_imported || 0), 0),
    lastImport: migrationHistory[0]?.created_at,
    typesImported: [...new Set(migrationHistory.map(h => h.type))].length
  };

  const getTypeStats = (typeId) => {
    const typeHistory = migrationHistory.filter(h => h.type === typeId);
    return {
      count: typeHistory.reduce((sum, h) => sum + (h.records_imported || 0), 0),
      lastImport: typeHistory[0]?.created_at
    };
  };

  const months = [
    { value: 0, label: isEs ? "Enero" : "January" },
    { value: 1, label: isEs ? "Febrero" : "February" },
    { value: 2, label: isEs ? "Marzo" : "March" },
    { value: 3, label: isEs ? "Abril" : "April" },
    { value: 4, label: isEs ? "Mayo" : "May" },
    { value: 5, label: isEs ? "Junio" : "June" },
    { value: 6, label: isEs ? "Julio" : "July" },
    { value: 7, label: isEs ? "Agosto" : "August" },
    { value: 8, label: isEs ? "Septiembre" : "September" },
    { value: 9, label: isEs ? "Octubre" : "October" },
    { value: 10, label: isEs ? "Noviembre" : "November" },
    { value: 11, label: isEs ? "Diciembre" : "December" }
  ];

  return (
    <div className="space-y-6" data-testid="migration-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{isEs ? "Migración de Datos" : "Data Migration"}</h2>
          <p className="text-muted-foreground">
            {isEs 
              ? "Importa datos históricos desde Tripleseat, Alegra y otras fuentes"
              : "Import historical data from Tripleseat, Alegra and other sources"
            }
          </p>
        </div>
        <Button variant="outline" onClick={fetchMigrationHistory}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {isEs ? "Actualizar" : "Refresh"}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Registros Importados" : "Records Imported"}</p>
                <p className="text-2xl font-bold">{stats.totalImported.toLocaleString()}</p>
              </div>
              <Database className="w-8 h-8 text-emerald-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Tipos de Datos" : "Data Types"}</p>
                <p className="text-2xl font-bold">{stats.typesImported} / {Object.keys(MIGRATION_TYPES).length}</p>
              </div>
              <FileSpreadsheet className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isEs ? "Última Importación" : "Last Import"}</p>
                <p className="text-lg font-medium">
                  {stats.lastImport 
                    ? new Date(stats.lastImport).toLocaleDateString()
                    : (isEs ? "Nunca" : "Never")
                  }
                </p>
              </div>
              <Clock className="w-8 h-8 text-violet-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">
            <Database className="w-4 h-4 mr-2" />
            {isEs ? "Tipos de Datos" : "Data Types"}
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <Clock className="w-4 h-4 mr-2" />
            {isEs ? "Historial" : "History"}
          </TabsTrigger>
        </TabsList>

        {/* Data Types Overview */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.values(MIGRATION_TYPES)
              .sort((a, b) => (a.order || 99) - (b.order || 99))
              .map((type) => {
              const Icon = type.icon;
              const typeStats = getTypeStats(type.id);
              return (
                <Card 
                  key={type.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  data-testid={`migration-type-${type.id}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className={`p-2 rounded-lg ${type.bgColor}`}>
                        <Icon className={`w-5 h-5 ${type.color}`} />
                      </div>
                      <div className="flex items-center gap-1">
                        {type.order && type.order <= 2 && (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                            {type.order === 1 ? "1ro" : "2do"}
                          </Badge>
                        )}
                        {typeStats.count > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {typeStats.count.toLocaleString()}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <CardTitle className="text-base mt-2">
                      {isEs ? type.labelEs : type.label}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {isEs ? type.descriptionEs : type.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground mb-3">
                      {isEs ? "Fuente" : "Source"}: {type.source}
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="flex-1"
                        onClick={() => downloadTemplate(type.id)}
                      >
                        <Download className="w-3 h-3 mr-1" />
                        {isEs ? "Plantilla" : "Template"}
                      </Button>
                      <Button 
                        size="sm" 
                        className="flex-1"
                        onClick={() => openImportDialog(type.id)}
                      >
                        <Upload className="w-3 h-3 mr-1" />
                        {isEs ? "Importar" : "Import"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Import History */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{isEs ? "Historial de Importaciones" : "Import History"}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : migrationHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>{isEs ? "No hay importaciones registradas" : "No imports recorded"}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isEs ? "Fecha" : "Date"}</TableHead>
                      <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                      <TableHead>{isEs ? "Período" : "Period"}</TableHead>
                      <TableHead>{isEs ? "Registros" : "Records"}</TableHead>
                      <TableHead>{isEs ? "Estado" : "Status"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {migrationHistory.map((item) => {
                      const typeInfo = MIGRATION_TYPES[item.type];
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            {new Date(item.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {typeInfo && <typeInfo.icon className={`w-4 h-4 ${typeInfo.color}`} />}
                              {isEs ? typeInfo?.labelEs : typeInfo?.label || item.type}
                            </div>
                          </TableCell>
                          <TableCell>
                            {months[item.period_month]?.label} {item.period_year}
                          </TableCell>
                          <TableCell>{item.records_imported?.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={item.status === "completed" ? "default" : "destructive"}>
                              {item.status === "completed" 
                                ? (isEs ? "Completado" : "Completed")
                                : (isEs ? "Error" : "Error")
                              }
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              {isEs ? "Importar" : "Import"} {selectedType && (isEs ? MIGRATION_TYPES[selectedType]?.labelEs : MIGRATION_TYPES[selectedType]?.label)}
            </DialogTitle>
            <DialogDescription>
              {isEs 
                ? "Selecciona el período e importa los datos desde archivo o ingreso manual"
                : "Select the period and import data from file or manual entry"
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Period Selection */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Mes" : "Month"}</label>
                <Select 
                  value={importPeriod.month.toString()} 
                  onValueChange={(v) => setImportPeriod({ ...importPeriod, month: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (
                      <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{isEs ? "Año" : "Year"}</label>
                <Select 
                  value={importPeriod.year.toString()} 
                  onValueChange={(v) => setImportPeriod({ ...importPeriod, year: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2025, 2024, 2023].map((y) => (
                      <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Import Mode Toggle */}
            <div className="flex gap-2">
              <Button 
                variant={importMode === "file" ? "default" : "outline"}
                onClick={() => setImportMode("file")}
                className="flex-1"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                {isEs ? "Desde Archivo" : "From File"}
              </Button>
              <Button 
                variant={importMode === "manual" ? "default" : "outline"}
                onClick={() => setImportMode("manual")}
                className="flex-1"
              >
                <Plus className="w-4 h-4 mr-2" />
                {isEs ? "Entrada Manual" : "Manual Entry"}
              </Button>
            </div>

            {/* File Upload Mode */}
            {importMode === "file" && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => downloadTemplate(selectedType)}>
                    <Download className="w-4 h-4 mr-2" />
                    {isEs ? "Descargar Plantilla" : "Download Template"}
                  </Button>
                </div>
                
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg font-medium">
                      {importFile 
                        ? importFile.name 
                        : (isEs ? "Click para subir archivo" : "Click to upload file")
                      }
                    </p>
                    <p className="text-sm text-muted-foreground">CSV, Excel (.xlsx, .xls)</p>
                  </label>
                </div>

                {importData.length > 0 && (
                  <div className="border rounded-lg p-4">
                    <p className="font-medium mb-2">
                      {isEs ? "Vista Previa" : "Preview"} ({importData.length} {isEs ? "filas" : "rows"})
                    </p>
                    <div className="max-h-48 overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {Object.keys(importData[0] || {}).map((key) => (
                              <TableHead key={key} className="text-xs">{key}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {importData.slice(0, 5).map((row, idx) => (
                            <TableRow key={idx}>
                              {Object.values(row).map((val, vidx) => (
                                <TableCell key={vidx} className="text-xs">{val}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Manual Entry Mode */}
            {importMode === "manual" && selectedType && (
              <div className="space-y-4">
                <div className="max-h-96 overflow-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {FIELD_TEMPLATES[selectedType]?.map((field) => (
                          <TableHead key={field.field} className="text-xs whitespace-nowrap">
                            {isEs ? field.label : field.labelEn}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                          </TableHead>
                        ))}
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {manualEntries.map((entry, idx) => (
                        <TableRow key={idx}>
                          {FIELD_TEMPLATES[selectedType]?.map((field) => (
                            <TableCell key={field.field} className="p-1">
                              <Input
                                type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                                value={entry[field.field] || ""}
                                onChange={(e) => updateManualEntry(idx, field.field, e.target.value)}
                                placeholder={field.example}
                                className="text-xs h-8"
                              />
                            </TableCell>
                          ))}
                          <TableCell className="p-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeManualEntry(idx)}
                              disabled={manualEntries.length === 1}
                              className="h-8 w-8"
                            >
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button variant="outline" onClick={addManualEntry} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  {isEs ? "Agregar Fila" : "Add Row"}
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button 
              onClick={handleImport} 
              disabled={importing || (importMode === "file" ? importData.length === 0 : manualEntries.every(e => Object.keys(e).length === 0))}
              data-testid="import-btn"
            >
              {importing ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              {isEs ? "Importar Datos" : "Import Data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
