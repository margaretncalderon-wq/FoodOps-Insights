import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from "../ui/dialog";
import { 
  CreditCard, Crown, Zap, Rocket, Calendar, AlertTriangle, Check, 
  ExternalLink, Loader2, TrendingUp, Users, FileText, Package, CheckCircle2
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export function BillingSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [billingData, setBillingData] = useState(null);
  const [usage, setUsage] = useState(null);
  const [plans, setPlans] = useState([]);
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedBillingCycle, setSelectedBillingCycle] = useState("monthly");
  const [checkingPayment, setCheckingPayment] = useState(false);

  const fetchBillingData = useCallback(async () => {
    try {
      const [billingRes, usageRes, plansRes] = await Promise.all([
        axios.get(`${API}/api/org/billing`, { withCredentials: true }),
        axios.get(`${API}/api/org/usage`, { withCredentials: true }),
        axios.get(`${API}/api/org/plans`, { withCredentials: true })
      ]);
      setBillingData(billingRes.data);
      setUsage(usageRes.data);
      setPlans(plansRes.data);
    } catch (err) {
      console.error(err);
      if (err.response?.status !== 403) {
        toast.error("Failed to load billing data");
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
        `${API}/api/org/billing/checkout/status/${sessionId}`,
        { withCredentials: true }
      );

      if (response.data.payment_status === "paid" || response.data.status === "complete") {
        setCheckingPayment(false);
        setSuccessDialogOpen(true);
        fetchBillingData();
        // Clean URL
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

      // Continue polling
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

  const handleUpgrade = async (planId) => {
    const selectedPlan = plans.find(p => p.plan_id === planId);
    const price = selectedBillingCycle === "yearly" ? selectedPlan?.price_yearly : selectedPlan?.price_monthly;
    
    // If free plan, upgrade directly without payment
    if (!price || price <= 0) {
      setActionLoading(true);
      try {
        await axios.post(`${API}/api/org/subscription/upgrade/${planId}`, {}, { withCredentials: true });
        toast.success(isEs ? "Plan actualizado" : "Plan upgraded");
        setUpgradeDialogOpen(false);
        fetchBillingData();
      } catch (err) {
        toast.error(err.response?.data?.detail || "Error upgrading plan");
      }
      setActionLoading(false);
      return;
    }

    // Paid plan - use Stripe checkout
    setActionLoading(true);
    try {
      const response = await axios.post(
        `${API}/api/org/billing/checkout`,
        {
          plan_id: planId,
          billing_cycle: selectedBillingCycle,
          origin_url: window.location.origin
        },
        { withCredentials: true }
      );

      // Redirect to Stripe checkout
      if (response.data.checkout_url) {
        window.location.href = response.data.checkout_url;
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || (isEs ? "Error al iniciar el pago" : "Error initiating payment"));
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      await axios.post(`${API}/api/org/subscription/cancel`, {}, { withCredentials: true });
      toast.success(isEs ? "Suscripción cancelada" : "Subscription canceled");
      setCancelDialogOpen(false);
      fetchBillingData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error canceling subscription");
    }
    setActionLoading(false);
  };

  const handleReactivate = async () => {
    setActionLoading(true);
    try {
      await axios.post(`${API}/api/org/subscription/reactivate`, {}, { withCredentials: true });
      toast.success(isEs ? "Suscripción reactivada" : "Subscription reactivated");
      fetchBillingData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error reactivating subscription");
    }
    setActionLoading(false);
  };

  const getPlanIcon = (planName) => {
    switch(planName) {
      case "starter": return <Rocket className="w-5 h-5" />;
      case "professional": return <Zap className="w-5 h-5 text-amber-500" />;
      case "enterprise": return <Crown className="w-5 h-5 text-purple-500" />;
      default: return <Package className="w-5 h-5" />;
    }
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case "active": return <Badge className="bg-green-500">{isEs ? "Activo" : "Active"}</Badge>;
      case "trialing": return <Badge className="bg-blue-500">{isEs ? "Trial" : "Trial"}</Badge>;
      case "past_due": return <Badge className="bg-red-500">{isEs ? "Pago Pendiente" : "Past Due"}</Badge>;
      case "canceled": return <Badge variant="secondary">{isEs ? "Cancelado" : "Canceled"}</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
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

  const { subscription, plan, payment_method, invoices, next_invoice_date } = billingData || {};
  const currentPlanIndex = plans.findIndex(p => p.plan_id === plan?.plan_id);

  return (
    <div className="space-y-6" data-testid="billing-section">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {plan && getPlanIcon(plan.name)}
              <div>
                <CardTitle className="text-lg">
                  {isEs ? "Plan Actual" : "Current Plan"}: {plan ? (isEs ? plan.display_name_es : plan.display_name_en) : "No Plan"}
                </CardTitle>
                <CardDescription>
                  {plan ? (isEs ? plan.description_es : plan.description_en) : ""}
                </CardDescription>
              </div>
            </div>
            {subscription && getStatusBadge(subscription.status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {subscription && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">{isEs ? "Precio" : "Price"}</p>
                <p className="text-lg font-bold">
                  ${subscription.billing_cycle === "yearly" ? (plan?.price_yearly / 12).toFixed(0) : plan?.price_monthly}/mo
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">{isEs ? "Ciclo" : "Cycle"}</p>
                <p className="text-lg font-bold capitalize">{subscription.billing_cycle === "yearly" ? (isEs ? "Anual" : "Yearly") : (isEs ? "Mensual" : "Monthly")}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">{isEs ? "Próxima Renovación" : "Next Renewal"}</p>
                <p className="text-lg font-bold">
                  {next_invoice_date ? new Date(next_invoice_date).toLocaleDateString() : "-"}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">{isEs ? "Estado" : "Status"}</p>
                <p className="text-lg font-bold capitalize">
                  {subscription.cancel_at_period_end 
                    ? (isEs ? "Cancela al final" : "Cancels at end")
                    : subscription.status}
                </p>
              </div>
            </div>
          )}

          {subscription?.cancel_at_period_end && (
            <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800">
                    {isEs ? "Suscripción cancelada" : "Subscription canceled"}
                  </p>
                  <p className="text-sm text-amber-600">
                    {isEs 
                      ? `Tu acceso termina el ${new Date(subscription.current_period_end).toLocaleDateString()}`
                      : `Your access ends on ${new Date(subscription.current_period_end).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={handleReactivate} disabled={actionLoading}>
                {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {isEs ? "Reactivar" : "Reactivate"}
              </Button>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={() => setUpgradeDialogOpen(true)}>
              <TrendingUp className="w-4 h-4 mr-2" />
              {isEs ? "Cambiar Plan" : "Change Plan"}
            </Button>
            {subscription && !subscription.cancel_at_period_end && plan?.price_monthly > 0 && (
              <Button variant="outline" onClick={() => setCancelDialogOpen(true)}>
                {isEs ? "Cancelar Suscripción" : "Cancel Subscription"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Usage */}
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
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <span className="font-medium text-amber-800">{isEs ? "Advertencias de Uso" : "Usage Warnings"}</span>
                </div>
                <ul className="space-y-1">
                  {usage.warnings.map((w, idx) => (
                    <li key={idx} className={`text-sm ${w.exceeded ? "text-red-600" : "text-amber-700"}`}>
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

      {/* Payment Method */}
      {payment_method && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{isEs ? "Método de Pago" : "Payment Method"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <CreditCard className="w-8 h-8 text-muted-foreground" />
                <div>
                  <p className="font-medium capitalize">{payment_method.brand} •••• {payment_method.last4}</p>
                  <p className="text-sm text-muted-foreground">
                    {isEs ? "Expira" : "Expires"} {payment_method.exp_month}/{payment_method.exp_year}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm">
                {isEs ? "Actualizar" : "Update"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Billing History */}
      {invoices?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{isEs ? "Historial de Facturación" : "Billing History"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {invoices.map(inv => (
                <div key={inv.invoice_id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{inv.description}</p>
                    <p className="text-sm text-muted-foreground">{inv.date}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">${inv.amount}</span>
                    <Badge className={inv.status === "paid" ? "bg-green-500" : "bg-amber-500"}>
                      {inv.status === "paid" ? (isEs ? "Pagado" : "Paid") : inv.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upgrade Dialog */}
      <Dialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{isEs ? "Cambiar Plan" : "Change Plan"}</DialogTitle>
            <DialogDescription>
              {isEs ? "Selecciona el plan que mejor se adapte a tus necesidades" : "Select the plan that best fits your needs"}
            </DialogDescription>
          </DialogHeader>

          {/* Billing Cycle Selection */}
          <div className="flex justify-center mb-4">
            <RadioGroup
              value={selectedBillingCycle}
              onValueChange={setSelectedBillingCycle}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="monthly" id="monthly" />
                <Label htmlFor="monthly">{isEs ? "Mensual" : "Monthly"}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="yearly" id="yearly" />
                <Label htmlFor="yearly" className="flex items-center gap-2">
                  {isEs ? "Anual" : "Yearly"}
                  <Badge className="bg-green-500 text-xs">{isEs ? "Ahorra 17%" : "Save 17%"}</Badge>
                </Label>
              </div>
            </RadioGroup>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
            {plans.map((p, idx) => {
              const isCurrent = p.plan_id === plan?.plan_id;
              const displayPrice = selectedBillingCycle === "yearly" 
                ? (p.price_yearly / 12).toFixed(0) 
                : p.price_monthly;
              const isUpgrade = idx > currentPlanIndex;
              const isPaid = selectedBillingCycle === "yearly" ? p.price_yearly > 0 : p.price_monthly > 0;
              
              return (
                <div 
                  key={p.plan_id}
                  className={`relative p-4 rounded-xl border-2 ${
                    isCurrent ? "border-primary bg-primary/5" : "border-slate-200"
                  } ${p.highlight ? "ring-2 ring-amber-400" : ""}`}
                >
                  {isCurrent && (
                    <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary">
                      {isEs ? "Actual" : "Current"}
                    </Badge>
                  )}
                  
                  <div className="text-center mb-4">
                    {getPlanIcon(p.name)}
                    <h3 className="font-bold mt-2">{isEs ? p.display_name_es : p.display_name_en}</h3>
                    <p className="text-2xl font-bold mt-2">
                      ${displayPrice}
                      <span className="text-sm font-normal">/mo</span>
                    </p>
                    {selectedBillingCycle === "yearly" && p.price_yearly > 0 && (
                      <p className="text-xs text-muted-foreground">
                        ${p.price_yearly} {isEs ? "facturado anualmente" : "billed annually"}
                      </p>
                    )}
                  </div>
                  
                  <ul className="space-y-2 text-sm mb-4">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      {p.limits.events_per_month} {isEs ? "eventos/mes" : "events/mo"}
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      {p.limits.active_users} {isEs ? "usuarios" : "users"}
                    </li>
                  </ul>
                  
                  <Button 
                    className="w-full" 
                    variant={isCurrent ? "outline" : "default"}
                    disabled={isCurrent || actionLoading}
                    onClick={() => handleUpgrade(p.plan_id)}
                  >
                    {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {isCurrent 
                      ? (isEs ? "Plan Actual" : "Current Plan")
                      : isPaid && isUpgrade
                        ? (isEs ? "Pagar y Mejorar" : "Pay & Upgrade")
                        : isUpgrade 
                          ? (isEs ? "Mejorar" : "Upgrade")
                          : (isEs ? "Cambiar" : "Switch")}
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEs ? "Cancelar Suscripción" : "Cancel Subscription"}</DialogTitle>
            <DialogDescription>
              {isEs 
                ? "¿Estás seguro de que quieres cancelar? Tu acceso continuará hasta el final del período actual."
                : "Are you sure you want to cancel? Your access will continue until the end of the current period."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              {isEs ? "No, mantener" : "No, keep it"}
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isEs ? "Sí, cancelar" : "Yes, cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
