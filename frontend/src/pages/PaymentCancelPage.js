import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { Button } from "../components/ui/button";
import { XCircle, ArrowLeft } from "lucide-react";

export default function PaymentCancelPage() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isEs = language === "es";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#FEF2F2] to-[#FEE2E2] p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-20 h-20 mx-auto bg-[#F59E0B] rounded-full flex items-center justify-center mb-6">
          <XCircle className="w-12 h-12 text-white" />
        </div>
        
        <h1 className="text-2xl font-bold text-[#1F2937] mb-2">
          {isEs ? "Pago Cancelado" : "Payment Cancelled"}
        </h1>
        <p className="text-[#6B7280] mb-6">
          {isEs
            ? "Tu pago fue cancelado. Tu cuenta ha sido creada con el plan gratuito. Puedes agregar módulos en cualquier momento desde Configuración."
            : "Your payment was cancelled. Your account has been created with the free plan. You can add modules anytime from Settings."}
        </p>

        <div className="space-y-3">
          <Button
            onClick={() => navigate("/register")}
            className="w-full h-12 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium rounded-lg"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {isEs ? "Volver a intentar" : "Try again"}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="w-full h-12 border-[#E5E7EB] text-[#6B7280] hover:bg-gray-50 rounded-lg"
          >
            {isEs ? "Continuar con plan gratuito" : "Continue with free plan"}
          </Button>
        </div>

        <p className="mt-6 text-xs text-[#9CA3AF]">
          {isEs
            ? "¿Tienes problemas? Contáctanos en soporte@ourkora.com"
            : "Having issues? Contact us at support@ourkora.com"}
        </p>
      </div>
    </div>
  );
}
