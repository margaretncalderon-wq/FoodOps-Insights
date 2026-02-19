import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../../contexts/LanguageContext";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Checkbox } from "../../components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Textarea } from "../../components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "../../components/ui/dropdown-menu";
import { toast } from "sonner";
import { 
  Users, UserPlus, Sparkles, Building2, Mail, Calendar, 
  Loader2, Copy, CheckCircle, Gift, Star, Megaphone,
  MoreHorizontal, CreditCard, RefreshCw, ExternalLink, CalendarPlus
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

const INDUSTRY_OPTIONS = [
  { value: "events", labelEn: "Events & Hospitality", labelEs: "Eventos y Hospitalidad" },
  { value: "agency", labelEn: "Agency & Creative", labelEs: "Agencia y Creativos" },
  { value: "consulting", labelEn: "Professional Services", labelEs: "Servicios Profesionales" },
  { value: "generic", labelEn: "General Services", labelEs: "Servicios Generales" },
];

const ACCOUNT_TYPES = [
  { value: "demo", labelEn: "Demo Account", labelEs: "Cuenta Demo", icon: Gift, color: "bg-blue-500" },
  { value: "influencer", labelEn: "Influencer Account", labelEs: "Cuenta Influencer", icon: Star, color: "bg-purple-500" },
  { value: "partner", labelEn: "Partner Account", labelEs: "Cuenta Partner", icon: Megaphone, color: "bg-green-500" },
];

const AVAILABLE_MODULES = [
  { key: "module_event_orchestration", name: "Program Orchestration", nameEs: "Program Orchestration" },
  { key: "module_culinary_intelligence", name: "Culinary Intelligence", nameEs: "Inteligencia Culinaria" },
  { key: "module_operations_supplies", name: "Resource Management", nameEs: "Gestión de Recursos" },
  { key: "module_venues", name: "Venues & Locations", nameEs: "Venues & Ubicaciones" },
  { key: "module_demand_studio", name: "Demand Generation", nameEs: "Demand Generation" },
];

// Default modules by industry
const DEFAULT_MODULES_BY_INDUSTRY = {
  events: ["module_event_orchestration", "module_culinary_intelligence", "module_operations_supplies", "module_venues", "module_demand_studio"],
  agency: ["module_event_orchestration", "module_demand_studio"],
  consulting: ["module_event_orchestration", "module_demand_studio"],
  generic: ["module_event_orchestration", "module_operations_supplies", "module_demand_studio"],
};

export default function DemoAccountsPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  
  // Conversion form state
  const [convertForm, setConvertForm] = useState({
    conversion_type: "manual",
    extend_days: 30,
    notes: ""
  });
  const [extendDays, setExtendDays] = useState(30);
  
  // Form state
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    password: "",
    organization_name: "",
    industry_type: "events",
    account_type: "demo",
    modules_to_activate: [],
    trial_days: 365,
    notes: ""
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  // Update selected modules when industry changes
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      modules_to_activate: DEFAULT_MODULES_BY_INDUSTRY[prev.industry_type] || []
    }));
  }, [formData.industry_type]);

  const fetchAccounts = async () => {
    try {
      const response = await axios.get(`${API}/api/super-admin/demo-accounts`, { withCredentials: true });
      setAccounts(response.data.accounts || []);
    } catch (error) {
      console.error("Error fetching demo accounts:", error);
      toast.error(isEs ? "Error al cargar cuentas" : "Error loading accounts");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!formData.email || !formData.name || !formData.password || !formData.organization_name) {
      toast.error(isEs ? "Completa todos los campos requeridos" : "Fill all required fields");
      return;
    }
    
    setSaving(true);
    try {
      const response = await axios.post(`${API}/api/super-admin/demo-accounts`, formData, { withCredentials: true });
      toast.success(isEs ? "Cuenta creada exitosamente" : "Account created successfully");
      setShowCreateModal(false);
      resetForm();
      fetchAccounts();
      
      // Show credentials
      const account = response.data.account;
      toast.info(
        <div className="space-y-1">
          <div className="font-medium">{isEs ? "Credenciales:" : "Credentials:"}</div>
          <div>Email: {account.email}</div>
          <div>Password: {formData.password}</div>
        </div>,
        { duration: 10000 }
      );
    } catch (error) {
      const msg = error.response?.data?.detail || (isEs ? "Error al crear cuenta" : "Error creating account");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      email: "",
      name: "",
      password: "",
      organization_name: "",
      industry_type: "events",
      account_type: "demo",
      modules_to_activate: DEFAULT_MODULES_BY_INDUSTRY["events"],
      trial_days: 365,
      notes: ""
    });
  };

  const copyCredentials = (email, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(email);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success(isEs ? "Copiado!" : "Copied!");
  };

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, password }));
  };

  const getAccountTypeBadge = (type) => {
    const config = ACCOUNT_TYPES.find(t => t.value === type) || ACCOUNT_TYPES[0];
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} text-white`}>
        <Icon className="w-3 h-3 mr-1" />
        {isEs ? config.labelEs : config.labelEn}
      </Badge>
    );
  };

  const toggleModule = (moduleKey) => {
    setFormData(prev => ({
      ...prev,
      modules_to_activate: prev.modules_to_activate.includes(moduleKey)
        ? prev.modules_to_activate.filter(m => m !== moduleKey)
        : [...prev.modules_to_activate, moduleKey]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-500" />
            {isEs ? "Cuentas Demo & Influencers" : "Demo & Influencer Accounts"}
          </h1>
          <p className="text-muted-foreground">
            {isEs 
              ? "Crea cuentas con acceso completo sin costo para demos, influencers y partners" 
              : "Create accounts with full access at no cost for demos, influencers and partners"}
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="bg-gradient-to-r from-purple-500 to-pink-500">
          <UserPlus className="w-4 h-4 mr-2" />
          {isEs ? "Nueva Cuenta" : "New Account"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{accounts.length}</div>
            <div className="text-sm text-muted-foreground">{isEs ? "Total Cuentas" : "Total Accounts"}</div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">
              {accounts.filter(a => a.account_type === "demo").length}
            </div>
            <div className="text-sm text-muted-foreground">Demo</div>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-purple-600">
              {accounts.filter(a => a.account_type === "influencer").length}
            </div>
            <div className="text-sm text-muted-foreground">Influencers</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">
              {accounts.filter(a => a.account_type === "partner").length}
            </div>
            <div className="text-sm text-muted-foreground">Partners</div>
          </CardContent>
        </Card>
      </div>

      {/* Accounts Table */}
      <Card>
        <CardHeader>
          <CardTitle>{isEs ? "Cuentas Creadas" : "Created Accounts"}</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{isEs ? "No hay cuentas creadas aún" : "No accounts created yet"}</p>
              <Button 
                variant="outline" 
                className="mt-4" 
                onClick={() => setShowCreateModal(true)}
              >
                {isEs ? "Crear primera cuenta" : "Create first account"}
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isEs ? "Organización" : "Organization"}</TableHead>
                  <TableHead>{isEs ? "Usuario" : "User"}</TableHead>
                  <TableHead>{isEs ? "Tipo" : "Type"}</TableHead>
                  <TableHead>{isEs ? "Módulos" : "Modules"}</TableHead>
                  <TableHead>{isEs ? "Expira" : "Expires"}</TableHead>
                  <TableHead>{isEs ? "Acciones" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.company_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{account.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{account.owner?.name}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {account.owner?.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getAccountTypeBadge(account.account_type)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {account.active_modules_count} {isEs ? "módulos" : "modules"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {account.trial_ends_at ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="w-3 h-3" />
                          {new Date(account.trial_ends_at).toLocaleDateString()}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyCredentials(account.owner?.email, account.owner?.email)}
                      >
                        {copiedId === account.owner?.email ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Account Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              {isEs ? "Crear Cuenta Demo/Influencer" : "Create Demo/Influencer Account"}
            </DialogTitle>
            <DialogDescription>
              {isEs 
                ? "Esta cuenta tendrá acceso completo sin costo durante el período especificado" 
                : "This account will have full access at no cost for the specified period"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Account Type */}
            <div className="space-y-2">
              <Label>{isEs ? "Tipo de Cuenta" : "Account Type"}</Label>
              <div className="grid grid-cols-3 gap-2">
                {ACCOUNT_TYPES.map((type) => {
                  const Icon = type.icon;
                  const isSelected = formData.account_type === type.value;
                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, account_type: type.value }))}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        isSelected 
                          ? `border-primary ${type.color} text-white` 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Icon className="w-5 h-5 mx-auto mb-1" />
                      <div className="text-xs font-medium">
                        {isEs ? type.labelEs.split(' ')[1] : type.labelEn.split(' ')[0]}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Organization Name */}
            <div className="space-y-2">
              <Label>{isEs ? "Nombre de Organización" : "Organization Name"} *</Label>
              <Input
                value={formData.organization_name}
                onChange={(e) => setFormData(prev => ({ ...prev, organization_name: e.target.value }))}
                placeholder={isEs ? "Mi Empresa Demo" : "My Demo Company"}
              />
            </div>

            {/* Industry */}
            <div className="space-y-2">
              <Label>{isEs ? "Industria" : "Industry"}</Label>
              <Select 
                value={formData.industry_type} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, industry_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {isEs ? opt.labelEs : opt.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* User Details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isEs ? "Nombre del Usuario" : "User Name"} *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Juan Pérez"
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="juan@empresa.com"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label>{isEs ? "Contraseña" : "Password"} *</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="••••••••"
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={generatePassword}>
                  {isEs ? "Generar" : "Generate"}
                </Button>
              </div>
            </div>

            {/* Modules */}
            <div className="space-y-2">
              <Label>{isEs ? "Módulos a Activar" : "Modules to Activate"}</Label>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_MODULES.map((mod) => (
                  <label 
                    key={mod.key}
                    className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={formData.modules_to_activate.includes(mod.key)}
                      onCheckedChange={() => toggleModule(mod.key)}
                    />
                    <span className="text-sm">{isEs ? mod.nameEs : mod.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Trial Days */}
            <div className="space-y-2">
              <Label>{isEs ? "Días de Prueba" : "Trial Days"}</Label>
              <Select 
                value={String(formData.trial_days)} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, trial_days: parseInt(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 {isEs ? "días" : "days"}</SelectItem>
                  <SelectItem value="90">90 {isEs ? "días" : "days"}</SelectItem>
                  <SelectItem value="180">180 {isEs ? "días" : "days"}</SelectItem>
                  <SelectItem value="365">1 {isEs ? "año" : "year"}</SelectItem>
                  <SelectItem value="730">2 {isEs ? "años" : "years"}</SelectItem>
                  <SelectItem value="3650">10 {isEs ? "años (sin límite)" : "years (unlimited)"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>{isEs ? "Notas (interno)" : "Notes (internal)"}</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder={isEs ? "Notas sobre esta cuenta..." : "Notes about this account..."}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              {isEs ? "Cancelar" : "Cancel"}
            </Button>
            <Button 
              onClick={handleCreateAccount} 
              disabled={saving}
              className="bg-gradient-to-r from-purple-500 to-pink-500"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {isEs ? "Crear Cuenta" : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
