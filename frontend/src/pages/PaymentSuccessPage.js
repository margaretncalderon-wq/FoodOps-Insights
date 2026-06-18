import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { Button } from "../components/ui/button";
import { Loader2, CheckCircle2, XCircle, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { fmtNum } from "../utils/format";

const API = process.env.REACT_APP_BACKEND_URL;

export default function PaymentSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { language } = useLanguage();
  const [status, setStatus] = useState("checking"); // checking, success, failed
  const [paymentData, setPaymentData] = useState(null);
  const [pollAttempts, setPollAttempts] = useState(0);

  const isEs = language === "es";
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    if (!sessionId) {
      setStatus("failed");
      return;
    }

    pollPaymentStatus();
  }, [sessionId]);

  const pollPaymentStatus = async () => {
    if (pollAttempts >= 10) {
      setStatus("failed");
      return;
    }

    try {
      const response = await fetch(`${API}/api/payments/status/${sessionId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to check payment status");
      }

      const data = await response.json();
      setPaymentData(data);

      if (data.payment_status === "paid" || data.status === "paid") {
        setStatus("success");
        toast.success(isEs ? "¡Pago exitoso!" : "Payment successful!");
      } else if (data.status === "expired" || data.status === "failed") {
        setStatus("failed");
      } else {
        // Still pending, poll again
        setPollAttempts((prev) => prev + 1);
        setTimeout(pollPaymentStatus, 2000);
      }
    } catch (error) {
      console.error("Error checking payment:", error);
      setPollAttempts((prev) => prev + 1);
      setTimeout(pollPaymentStatus, 2000);
    }
  };

  const handleContinue = () => {
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F0FDF4] to-[#ECFDF5] p-4">
      <div className="max-w-md w-full">
        {status === "checking" && (
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <Loader2 className="w-16 h-16 mx-auto text-[#2563EB] animate-spin mb-6" />
            <h1 className="text-2xl font-bold text-[#1F2937] mb-2">
              {isEs ? "Verificando pago..." : "Verifying payment..."}
            </h1>
            <p className="text-[#6B7280]">
              {isEs
                ? "Por favor espera mientras confirmamos tu pago."
                : "Please wait while we confirm your payment."}
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="relative mb-6">
              <div className="w-20 h-20 mx-auto bg-[#10B981] rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-12 h-12 text-white" />
              </div>
              <PartyPopper className="w-8 h-8 text-[#F59E0B] absolute top-0 right-1/4 animate-bounce" />
            </div>
            
            <h1 className="text-2xl font-bold text-[#1F2937] mb-2">
              {isEs ? "¡Pago Exitoso!" : "Payment Successful!"}
            </h1>
            <p className="text-[#6B7280] mb-6">
              {isEs
                ? "Tu suscripción ha sido activada. ¡Bienvenido a Kora OS!"
                : "Your subscription has been activated. Welcome to Kora OS!"}
            </p>

            {paymentData && (
              <div className="bg-[#F7F8FA] rounded-xl p-4 mb-6 text-left">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-[#6B7280]">
                    {isEs ? "Total pagado" : "Total paid"}
                  </span>
                  <span className="font-bold text-[#1F2937]">
                    ${fmtNum(paymentData.amount) || "0.00"} USD
                  </span>
                </div>
                {paymentData.modules && paymentData.modules.length > 0 && (
                  <div className="border-t border-gray-200 pt-2 mt-2">
                    <span className="text-xs text-[#6B7280] block mb-1">
                      {isEs ? "Módulos activados:" : "Activated modules:"}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {paymentData.modules.map((mod) => (
                        <span
                          key={mod}
                          className="px-2 py-1 bg-[#2563EB]/10 text-[#2563EB] text-xs rounded-full"
                        >
                          {mod.replace("module_", "").replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={handleContinue}
              className="w-full h-12 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium rounded-lg"
              data-testid="continue-to-dashboard-btn"
            >
              {isEs ? "Ir al Dashboard" : "Go to Dashboard"}
            </Button>
          </div>
        )}

        {status === "failed" && (
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-20 h-20 mx-auto bg-[#EF4444] rounded-full flex items-center justify-center mb-6">
              <XCircle className="w-12 h-12 text-white" />
            </div>
            
            <h1 className="text-2xl font-bold text-[#1F2937] mb-2">
              {isEs ? "Error en el Pago" : "Payment Failed"}
            </h1>
            <p className="text-[#6B7280] mb-6">
              {isEs
                ? "No pudimos confirmar tu pago. Tu cuenta ha sido creada pero los módulos no están activos."
                : "We couldn't confirm your payment. Your account was created but modules are not active."}
            </p>

            <div className="space-y-3">
              <Button
                onClick={() => navigate("/settings?tab=billing")}
                className="w-full h-12 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium rounded-lg"
              >
                {isEs ? "Intentar de nuevo" : "Try again"}
              </Button>
              <Button
                variant="outline"
                onClick={handleContinue}
                className="w-full h-12 border-[#E5E7EB] text-[#6B7280] hover:bg-gray-50 rounded-lg"
              >
                {isEs ? "Continuar sin pagar" : "Continue without paying"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
