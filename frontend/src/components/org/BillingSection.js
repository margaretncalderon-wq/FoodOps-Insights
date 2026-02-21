import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from "../ui/dialog";
import { 
  CreditCard, Calendar, AlertTriangle, Check, 
  Loader2, Users, FileText, Package, CheckCircle2, Plus, X, Sparkles,
  Clock, Zap, Shield, BarChart3, Target, Activity
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

// Module key aliases (map legacy/sub-module keys to display keys)
const MODULE_KEY_ALIASES = {
  "module_event_orchestration": "module_event_suite",
  "module_venues": "module_event_suite",
};

// Resolve module key to display key
const resolveModuleKey = (key) => MODULE_KEY_ALIASES[key] || key;

// Kora Core Configuration
const KORA_CORE = {
  price: 69,
  features: [
    { icon: Activity, nameEn: "System Pulse", nameEs: "System Pulse", descEn: "Real-time dashboard", descEs: "Dashboard en tiempo real" },
    { icon: Users, nameEn: "Client Engagement", nameEs: "Client Engagement", descEn: "CRM & client management", descEs: "CRM y gestión de clientes" },
    { icon: BarChart3, nameEn: "Business Clarity", nameEs: "Business Clarity", descEn: "Reports & analytics", descEs: "Reportes y analíticas" },
    { icon: Target, nameEn: "Execution Hub", nameEs: "Execution Hub", descEn: "Task & goal tracking", descEs: "Seguimiento de tareas y metas" },
  ]
};

// Add-on Modules (7-day trial)
const MODULES = [
  { 
    key: "module_event_suite", 
    nameEn: "Event Suite", 
    nameEs: "Event Suite",
    descEn: "Event Orchestration + Venues & Locations combined",
    descEs: "Event Orchestration + Venues & Locations combinados",
    price: 39,
    icon: "🎟️"
  },
  { 
    key: "module_culinary_intelligence", 
    nameEn: "Culinary Intelligence", 
    nameEs: "Inteligencia Culinaria",
    descEn: "Recipes, food costing, menu engineering, and ingredient management",
    descEs: "Recetas, costeo de alimentos, ingeniería de menús y gestión de ingredientes",
    price: 29,
    icon: "🍽️"
  },
  { 
    key: "module_operations_supplies", 
    nameEn: "Operations Supplies", 
    nameEs: "Suministros Operativos",
    descEn: "Inventory tracking, supplier management, and purchase orders",
    descEs: "Seguimiento de inventario, gestión de proveedores y órdenes de compra",
    price: 19,
    icon: "📦"
  },
  { 
    key: "module_demand_studio", 
    nameEn: "Demand Studio", 
    nameEs: "Demand Studio",
    descEn: "Marketing campaigns, social media, and lead generation",
    descEs: "Campañas de marketing, redes sociales y generación de leads",
    price: 39,
    icon: "📣"
  },
];

export function BillingSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState(null);
  const [activeModules, setActiveModules] = useState([]);
  const [usage, setUsage] = useState(null);
  const [addModuleDialogOpen, setAddModuleDialogOpen] = useState(false);
  const [cancelModuleDialogOpen, setCancelModuleDialogOpen] = useState(false);
  const [selectedModule, setSelectedModule] = useState(null);
  const [moduleToCancel, setModuleToCancel] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);

  const fetchBillingData = useCallback(async () => {
    try {
      const [subRes, usageRes] = await Promise.all([
        axios.get(`${API}/api/payments/my-subscription`, { withCredentials: true }),
        axios.get(`${API}/api/org/usage`, { withCredentials: true })
      ]);
      setSubscription(subRes.data);
      // Resolve module key aliases and deduplicate
      const resolvedKeys = [...new Set(
        (subRes.data.active_module_keys || []).map(resolveModuleKey)
      )];
      setActiveModules(resolvedKeys);
      setUsage(usageRes.data);
    } catch (err) {
      console.error(err);
      // Fallback to old billing endpoint if new one fails
      try {
        const oldRes = await axios.get(`${API}/api/org/billing`, { withCredentials: true });
        setSubscription(oldRes.data);
      } catch (e) {
        if (e.response?.status !== 403) {
          toast.error("Failed to load billing data");
        }
      }
    }
    setLoading(false);
  }, []);

  // Poll payment status
  const pollPaymentStatus = useCallback(async (sessionId, attempts = 0) => {
    const maxAttempts = 10;
    const pollInterval = 2000;

    if (attempts >= maxAttempts) {
      setCheckingPayment(false);
      toast.error(isEs ? "Tiempo agotado verificando el pago" : "Payment verification timed out");
      return;
    }

    try {
      const response = await axios.get(
        `${API}/api/payments/status/${sessionId}`,
        { withCredentials: true }
      );

      if (response.data.payment_status === "paid" || response.data.status === "paid") {
        setCheckingPayment(false);
        setSuccessDialogOpen(true);
        fetchBillingData();
        searchParams.delete("checkout");
        searchParams.delete("session_id");
        setSearchParams(searchParams);
        return;
      } else if (response.data.status === "expired") {
        setCheckingPayment(false);
        toast.error(isEs ? "La sesión de pago expiró" : "Payment session expired");
        searchParams.delete("checkout");
        searchParams.delete("session_id");
        setSearchParams(searchParams);
        return;
      }

      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), pollInterval);
    } catch (error) {
      console.error("Error checking payment status:", error);
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), pollInterval);
    }
  }, [isEs, fetchBillingData, searchParams, setSearchParams]);

  // Check for return from Stripe
  useEffect(() => {
    const checkoutStatus = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");

    if (checkoutStatus === "success" && sessionId) {
      setCheckingPayment(true);
      pollPaymentStatus(sessionId);
    } else if (checkoutStatus === "canceled") {
      toast.info(isEs ? "Pago cancelado" : "Payment canceled");
      searchParams.delete("checkout");
      setSearchParams(searchParams);
    }
  }, [searchParams, setSearchParams, pollPaymentStatus, isEs]);

  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  const handleAddModule = async (moduleKey) => {
    setActionLoading(true);
    try {
      const response = await axios.post(
        `${API}/api/payments/add-addon-checkout`,
        {
          origin_url: window.location.origin,
          addon_key: moduleKey
        },
        { withCredentials: true }
      );

      if (response.data.checkout_url) {
        window.location.href = response.data.checkout_url;
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al iniciar el pago" : "Error initiating payment"));
      setActionLoading(false);
    }
  };

  // Handle module cancellation
  const handleCancelModule = async (module) => {
    setActionLoading(true);
    try {
      // Find the org_addon_id for this module (check aliases too)
      const aliasedKeys = Object.entries(MODULE_KEY_ALIASES)
        .filter(([_, v]) => v === module.key)
        .map(([k, _]) => k);
      const keysToCheck = [module.key, ...aliasedKeys];
      
      const orgAddon = subscription?.active_modules?.find(m => 
        keysToCheck.some(k => m.addon_id === `addon_${k}`)
      );
      
      if (!orgAddon) {
        toast.error(isEs ? "Módulo no encontrado" : "Module not found");
        setActionLoading(false);
        return;
      }
      
      await axios.delete(
        `${API}/api/addons/cancel/${orgAddon.org_addon_id}`,
        { withCredentials: true }
      );
      
      toast.success(isEs ? "Módulo desactivado exitosamente" : "Module deactivated successfully");
      setCancelModuleDialogOpen(false);
      setModuleToCancel(null);
      fetchBillingData();
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al desactivar módulo" : "Error deactivating module"));
    }
    setActionLoading(false);
  };

  const addonMonthlyCost = subscription?.monthly_cost || 0;
  const addonCostAfterTrial = subscription?.monthly_cost_after_trial || 0;
  const totalMonthlyCost = KORA_CORE.price + addonMonthlyCost;
  const totalCostAfterTrial = KORA_CORE.price + addonCostAfterTrial;
  const availableModules = MODULES.filter(m => !activeModules.includes(m.key));
  const isInTrialPeriod = addonMonthlyCost === 0 && addonCostAfterTrial > 0;
  
  // Calculate trial days remaining
  const getTrialDaysRemaining = (module) => {
    if (!subscription?.active_modules) return 7;
    // Check for both the display key and any aliased keys
    const aliasedKeys = Object.entries(MODULE_KEY_ALIASES)
      .filter(([_, v]) => v === module.key)
      .map(([k, _]) => k);
    const keysToCheck = [module.key, ...aliasedKeys];
    
    const mod = subscription.active_modules.find(m => 
      keysToCheck.some(k => m.addon_id === `addon_${k}`)
    );
    if (!mod?.purchased_at) return 7;
    const purchaseDate = new Date(mod.purchased_at);
    const now = new Date();
    const daysPassed = Math.floor((now - purchaseDate) / (1000 * 60 * 60 * 24));
    return Math.max(0, 7 - daysPassed);
  };

  // Check if module is in trial
  const isModuleInTrial = (module) => {
    if (!subscription?.active_modules) return true;
    // Check for both the display key and any aliased keys
    const aliasedKeys = Object.entries(MODULE_KEY_ALIASES)
      .filter(([_, v]) => v === module.key)
      .map(([k, _]) => k);
    const keysToCheck = [module.key, ...aliasedKeys];
    
    const mod = subscription.active_modules.find(m => 
      keysToCheck.some(k => m.addon_id === `addon_${k}`)
    );
    if (!mod) return true;
    // If price_paid is 0 and purchased recently, it's in trial
    return mod.price_paid === 0 || getTrialDaysRemaining(module) > 0;
  };

  if (loading || checkingPayment) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="w-8 h-8 animate-spin" />
        {checkingPayment && (
          <p className="text-muted-foreground">
            {isEs ? "Verificando pago..." : "Verifying payment..."}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="billing-section">
      {/* Kora Core - Subscription */}
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  Kora Core
                  <Badge className="bg-primary text-white">
                    {isEs ? "Suscripción" : "Subscription"}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {isEs 
                    ? "Tu base completa para gestionar tu negocio"
                    : "Your complete foundation to manage your business"}
                </CardDescription>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-primary">${KORA_CORE.price}</p>
              <p className="text-sm text-muted-foreground">/mes</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {KORA_CORE.features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.nameEn} className="flex items-center gap-2 p-3 rounded-lg bg-background/50">
                  <Icon className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium text-sm">{isEs ? feature.nameEs : feature.nameEn}</p>
                    <p className="text-xs text-muted-foreground">{isEs ? feature.descEs : feature.descEn}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" />
              <span className="text-sm text-amber-800 dark:text-amber-300">
                {isEs 
                  ? "7 días de prueba gratis. Cancela cuando quieras."
                  : "7-day free trial. Cancel anytime."}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add-on Modules Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-primary" />
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  {isEs ? "Módulos Add-on" : "Add-on Modules"}
                  <Badge variant="outline" className="border-amber-400 text-amber-600">
                    <Clock className="w-3 h-3 mr-1" />
                    {isEs ? "7 días gratis" : "7 days free"}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {isInTrialPeriod 
                    ? (isEs 
                        ? `${activeModules.length} módulo(s) en prueba • $0/mes (después: $${addonCostAfterTrial}/mes)`
                        : `${activeModules.length} module(s) on trial • $0/mo (after: $${addonCostAfterTrial}/mo)`)
                    : (isEs 
                        ? `${activeModules.length} módulo(s) activo(s) • +$${addonMonthlyCost}/mes`
                        : `${activeModules.length} active module(s) • +$${addonMonthlyCost}/mo`)}
                </CardDescription>
              </div>
            </div>
            <Badge className="bg-primary text-white">
              {isEs ? "Activo" : "Active"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeModules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{isEs ? "No tienes módulos add-on activos" : "You have no active add-on modules"}</p>
              <p className="text-sm mt-1">
                {isEs ? "Prueba cualquier módulo gratis por 7 días" : "Try any module free for 7 days"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {MODULES.filter(m => activeModules.includes(m.key)).map(mod => {
                const trialDays = getTrialDaysRemaining(mod);
                const inTrial = isModuleInTrial(mod);
                return (
                  <div 
                    key={mod.key}
                    className="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{mod.icon}</span>
                      <div>
                        <p className="font-medium">{isEs ? mod.nameEs : mod.nameEn}</p>
                        <p className="text-sm text-muted-foreground">${mod.price}/mes</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {inTrial && trialDays > 0 ? (
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-300">
                          <Clock className="w-3 h-3 mr-1" />
                          {trialDays} {isEs ? "días" : "days"}
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          <Check className="w-3 h-3 mr-1" />
                          {isEs ? "Pagado" : "Paid"}
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setModuleToCancel(mod);
                          setCancelModuleDialogOpen(true);
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Trial Info Banner */}
          {activeModules.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-300">
                    {isEs ? "Período de prueba" : "Trial Period"}
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    {isEs 
                      ? "Tienes 7 días para probar. Al terminar, te notificaremos para que decidas si continuar."
                      : "You have 7 days to try. When it ends, we'll notify you so you can decide whether to continue."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Monthly Cost Summary */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border">
            <div>
              <p className="text-sm text-muted-foreground">
                {isEs ? "Costo mensual total" : "Total monthly cost"}
              </p>
              <div className="flex items-baseline gap-2">
                {isInTrialPeriod ? (
                  <>
                    <p className="text-2xl font-bold text-emerald-600">$0<span className="text-sm font-normal">/mes</span></p>
                    <span className="text-xs text-muted-foreground">
                      ({isEs ? "En período de prueba" : "In trial period"})
                    </span>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold">${totalMonthlyCost}<span className="text-sm font-normal">/mes</span></p>
                    <span className="text-xs text-muted-foreground">
                      (Core ${KORA_CORE.price} + Add-ons ${addonMonthlyCost})
                    </span>
                  </>
                )}
              </div>
              {isInTrialPeriod && addonCostAfterTrial > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {isEs 
                    ? `Después del trial: $${totalCostAfterTrial}/mes (Core $${KORA_CORE.price} + Add-ons $${addonCostAfterTrial})`
                    : `After trial: $${totalCostAfterTrial}/mo (Core $${KORA_CORE.price} + Add-ons $${addonCostAfterTrial})`}
                </p>
              )}
            </div>
            <Button onClick={() => setAddModuleDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {isEs ? "Agregar Módulo" : "Add Module"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Usage Card */}
      {usage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{isEs ? "Uso del Mes" : "Monthly Usage"}</CardTitle>
            <CardDescription>
              {isEs ? `Período: ${usage.period}` : `Period: ${usage.period}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {usage.warnings?.length > 0 && (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <span className="font-medium text-amber-800 dark:text-amber-200">
                    {isEs ? "Advertencias de Uso" : "Usage Warnings"}
                  </span>
                </div>
                <ul className="space-y-1">
                  {usage.warnings.map((w, idx) => (
                    <li key={idx} className={`text-sm ${w.exceeded ? "text-red-600" : "text-amber-700 dark:text-amber-300"}`}>
                      {w.exceeded ? "🚫" : "⚠️"} {w.label}: {w.current}/{w.limit} ({w.percentage}%)
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { key: "events_created", limit: "events_per_month", label: isEs ? "Eventos" : "Events", icon: Calendar },
                { key: "active_users", limit: "active_users", label: isEs ? "Usuarios" : "Users", icon: Users },
                { key: "proposals_created", limit: "proposals_per_month", label: isEs ? "Propuestas" : "Proposals", icon: FileText },
                { key: "supplier_invoices", limit: "supplier_invoices_per_month", label: isEs ? "Facturas" : "Invoices", icon: FileText },
              ].map(({ key, limit, label, icon: Icon }) => {
                const current = usage.metrics?.[key] || 0;
                const max = usage.limits?.[limit] || 999;
                const percentage = max > 0 ? Math.min((current / max) * 100, 100) : 0;
                
                return (
                  <div key={key} className="p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                    <p className="text-lg font-bold mb-1">{current} / {max}</p>
                    <Progress 
                      value={percentage} 
                      className={`h-2 ${percentage >= 80 ? "[&>div]:bg-amber-500" : ""} ${percentage >= 100 ? "[&>div]:bg-red-500" : ""}`}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment History */}
      {subscription?.payment_history?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{isEs ? "Historial de Pagos" : "Payment History"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {subscription.payment_history.map(tx => (
                <div key={tx.transaction_id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">
                      {tx.payment_type === "subscription" ? (isEs ? "Suscripción" : "Subscription") : "Add-on"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">${tx.amount?.toFixed(2)}</span>
                    <Badge className="bg-green-500">
                      {isEs ? "Pagado" : "Paid"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Module Dialog */}
      <Dialog open={addModuleDialogOpen} onOpenChange={setAddModuleDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              {isEs ? "Agregar Módulo Add-on" : "Add Add-on Module"}
            </DialogTitle>
            <DialogDescription>
              {isEs 
                ? "Prueba cualquier módulo gratis por 7 días. Sin compromiso."
                : "Try any module free for 7 days. No commitment."}
            </DialogDescription>
          </DialogHeader>
          
          {/* Trial Badge */}
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" />
              <span className="text-sm text-amber-800 dark:text-amber-300">
                {isEs 
                  ? "7 días de prueba gratis. Te notificaremos antes de cobrar."
                  : "7-day free trial. We'll notify you before charging."}
              </span>
            </div>
          </div>
          
          <div className="space-y-3 py-4 max-h-[400px] overflow-y-auto">
            {availableModules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
                <p className="font-medium">{isEs ? "¡Tienes todos los módulos!" : "You have all modules!"}</p>
              </div>
            ) : (
              availableModules.map(mod => (
                <div 
                  key={mod.key}
                  className="flex items-center justify-between p-4 rounded-xl border hover:border-primary/50 hover:bg-primary/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{mod.icon}</span>
                    <div>
                      <p className="font-medium">{isEs ? mod.nameEs : mod.nameEn}</p>
                      <p className="text-sm text-muted-foreground">
                        {isEs ? mod.descEs : mod.descEn}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground line-through">${mod.price}/mes</span>
                      <p className="font-bold text-emerald-600">
                        {isEs ? "7 días gratis" : "7 days free"}
                      </p>
                    </div>
                    <Button 
                      size="sm" 
                      onClick={() => handleAddModule(mod.key)}
                      disabled={actionLoading}
                    >
                      {actionLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Zap className="w-4 h-4 mr-1" />
                          {isEs ? "Probar" : "Try"}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent className="text-center">
          <DialogHeader>
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-4">
                <CheckCircle2 className="w-12 h-12 text-green-600" />
              </div>
            </div>
            <DialogTitle className="text-xl">
              {isEs ? "¡Módulo Activado!" : "Module Activated!"}
            </DialogTitle>
            <DialogDescription className="text-center">
              {isEs 
                ? "Tu nuevo módulo ha sido activado exitosamente. Ya puedes usar todas sus funcionalidades."
                : "Your new module has been activated successfully. You can now use all its features."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="justify-center">
            <Button onClick={() => setSuccessDialogOpen(false)}>
              {isEs ? "Continuar" : "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
