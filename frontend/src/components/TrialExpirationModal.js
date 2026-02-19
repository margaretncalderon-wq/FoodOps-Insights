import { useState, useEffect } from "react";
import axios from "axios";
import { useLanguage } from "../contexts/LanguageContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { 
  AlertTriangle, Clock, CreditCard, Sparkles, ArrowRight, X
} from "lucide-react";

import { API_BASE as API } from "../utils/api";

/**
 * TrialExpirationModal
 * 
 * Shows when a demo/influencer trial is expired or about to expire.
 * Offers options to upgrade to paid plan.
 */
export function TrialExpirationModal() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [trialStatus, setTrialStatus] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkTrialStatus();
  }, []);

  const checkTrialStatus = async () => {
    try {
      const response = await axios.get(`${API}/api/subscription/trial-status`, { withCredentials: true });
      const data = response.data;
      
      setTrialStatus(data);
      
      // Show modal if expired or expiring soon (and not already dismissed this session)
      if (data.show_payment_modal && !dismissed) {
        // Check if user dismissed in this session
        const dismissedKey = `trial_modal_dismissed_${data.trial_ends_at}`;
        if (!sessionStorage.getItem(dismissedKey)) {
          setIsOpen(true);
        }
      }
    } catch (error) {
      console.error("Error checking trial status:", error);
    }
  };

  const handleDismiss = () => {
    if (trialStatus?.trial_ends_at) {
      const dismissedKey = `trial_modal_dismissed_${trialStatus.trial_ends_at}`;
      sessionStorage.setItem(dismissedKey, "true");
    }
    setDismissed(true);
    setIsOpen(false);
  };

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      // Redirect to settings/billing page where they can upgrade
      window.location.href = "/settings?tab=billing";
    } catch (error) {
      console.error("Error starting upgrade:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!trialStatus || !trialStatus.show_payment_modal) {
    return null;
  }

  const isExpired = trialStatus.expired;
  const daysRemaining = trialStatus.days_remaining;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
            isExpired ? "bg-red-100" : "bg-amber-100"
          }`}>
            {isExpired ? (
              <AlertTriangle className="w-8 h-8 text-red-500" />
            ) : (
              <Clock className="w-8 h-8 text-amber-500" />
            )}
          </div>
          <DialogTitle className="text-center text-xl">
            {isExpired 
              ? (isEs ? "Tu período de prueba ha terminado" : "Your trial has ended")
              : (isEs ? "Tu prueba está por terminar" : "Your trial is ending soon")}
          </DialogTitle>
          <DialogDescription className="text-center">
            {isExpired ? (
              isEs 
                ? "Actualiza tu plan para continuar usando todas las funcionalidades de Kora OS."
                : "Upgrade your plan to continue using all Kora OS features."
            ) : (
              isEs
                ? `Te quedan ${daysRemaining} días de prueba. Actualiza ahora para no perder acceso.`
                : `You have ${daysRemaining} days left in your trial. Upgrade now to keep your access.`
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Plan Summary */}
        <div className="my-4 p-4 bg-muted rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">
              {isEs ? "Módulos activos" : "Active modules"}
            </span>
            <Badge variant="secondary">
              {trialStatus.active_modules_count}
            </Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {isEs ? "Costo mensual estimado" : "Estimated monthly cost"}
            </span>
            <span className="font-bold text-lg">
              ${trialStatus.estimated_monthly_cost}/mo
            </span>
          </div>
        </div>

        {/* Account Type Badge */}
        {trialStatus.account_type && trialStatus.account_type !== "paid" && (
          <div className="flex justify-center mb-4">
            <Badge className={`
              ${trialStatus.account_type === "demo" ? "bg-blue-500" : ""}
              ${trialStatus.account_type === "influencer" ? "bg-purple-500" : ""}
              ${trialStatus.account_type === "partner" ? "bg-green-500" : ""}
              text-white
            `}>
              <Sparkles className="w-3 h-3 mr-1" />
              {trialStatus.account_type === "demo" && (isEs ? "Cuenta Demo" : "Demo Account")}
              {trialStatus.account_type === "influencer" && (isEs ? "Cuenta Influencer" : "Influencer Account")}
              {trialStatus.account_type === "partner" && (isEs ? "Cuenta Partner" : "Partner Account")}
            </Badge>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button 
            onClick={handleUpgrade} 
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500"
          >
            <CreditCard className="w-4 h-4 mr-2" />
            {isEs ? "Actualizar Plan" : "Upgrade Plan"}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          
          {!isExpired && (
            <Button 
              variant="ghost" 
              onClick={handleDismiss}
              className="w-full text-muted-foreground"
            >
              {isEs ? "Recordarme después" : "Remind me later"}
            </Button>
          )}
          
          {isExpired && (
            <p className="text-xs text-center text-muted-foreground mt-2">
              {isEs 
                ? "Algunas funcionalidades pueden estar limitadas hasta que actualices."
                : "Some features may be limited until you upgrade."}
            </p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TrialExpirationModal;
