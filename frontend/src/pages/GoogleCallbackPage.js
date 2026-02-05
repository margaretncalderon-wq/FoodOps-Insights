import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Loader2, Building2, CheckCircle, Sparkles } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";

export default function GoogleCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { handleGoogleCallback, completeGoogleRegistration } = useAuth();
  const hasProcessed = useRef(false);
  
  // Registration state
  const [showRegistration, setShowRegistration] = useState(false);
  const [googleData, setGoogleData] = useState(null);
  const [tempToken, setTempToken] = useState(null);
  const [companyName, setCompanyName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      console.error("Google auth error:", error);
      toast.error("Error al autenticar con Google");
      navigate("/login", { replace: true });
      return;
    }

    if (code) {
      const redirectUri = window.location.origin + "/auth/google/callback";
      
      handleGoogleCallback(code, redirectUri)
        .then((response) => {
          if (response.requires_registration) {
            // New user - show registration form
            setGoogleData(response.google_data);
            setTempToken(response.temp_token);
            setShowRegistration(true);
          } else {
            // Existing user - proceed to dashboard
            navigate("/dashboard", { replace: true });
          }
        })
        .catch((err) => {
          console.error("Google callback failed:", err);
          toast.error("Error al procesar autenticación de Google");
          navigate("/login", { replace: true });
        });
    } else {
      navigate("/login", { replace: true });
    }
  }, [searchParams, handleGoogleCallback, navigate]);

  const handleCompleteRegistration = async (e) => {
    e.preventDefault();
    
    if (!companyName.trim()) {
      toast.error("Por favor ingresa el nombre de tu empresa");
      return;
    }

    setIsSubmitting(true);
    try {
      await completeGoogleRegistration(tempToken, companyName.trim());
      toast.success("¡Bienvenido a Kora OS!");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Registration failed:", err);
      const message = err.response?.data?.detail || "Error al completar el registro";
      toast.error(message);
      // If token expired, redirect to login
      if (message.includes("expirado") || message.includes("inválido")) {
        setTimeout(() => navigate("/login", { replace: true }), 2000);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Registration form for new Google users
  if (showRegistration && googleData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1a1f1a] via-[#0f1310] to-[#1a1f1a] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="bg-[#1e2420]/80 backdrop-blur-xl border border-[#3A4D3F]/30 rounded-2xl p-8 shadow-2xl">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-[#3A4D3F] to-[#2a3d2f] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-[#E5DCC5]" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">
                ¡Bienvenido a Kora OS!
              </h1>
              <p className="text-[#a3b18a]">
                Completa tu registro para continuar
              </p>
            </div>

            {/* Google user info */}
            <div className="bg-[#2a332c]/50 rounded-xl p-4 mb-6 flex items-center gap-4">
              {googleData.picture ? (
                <img 
                  src={googleData.picture} 
                  alt={googleData.name}
                  className="w-12 h-12 rounded-full border-2 border-[#3A4D3F]"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-[#3A4D3F] flex items-center justify-center">
                  <span className="text-[#E5DCC5] text-lg font-semibold">
                    {googleData.name?.charAt(0)?.toUpperCase()}
                  </span>
                </div>
              )}
              <div>
                <p className="text-white font-medium">{googleData.name}</p>
                <p className="text-[#a3b18a] text-sm">{googleData.email}</p>
              </div>
              <CheckCircle className="w-5 h-5 text-green-500 ml-auto" />
            </div>

            {/* Plan info */}
            <div className="bg-gradient-to-r from-[#3A4D3F]/20 to-[#2a3d2f]/20 rounded-xl p-4 mb-6 border border-[#3A4D3F]/30">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold px-2 py-1 bg-[#3A4D3F] text-[#E5DCC5] rounded-full">
                  PLAN FREE
                </span>
              </div>
              <p className="text-sm text-[#a3b18a]">
                Incluye: 2 usuarios, 10 eventos, 25 clientes
              </p>
            </div>

            {/* Registration form */}
            <form onSubmit={handleCompleteRegistration} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#E5DCC5] mb-2">
                  <Building2 className="w-4 h-4 inline mr-2" />
                  Nombre de tu empresa
                </label>
                <Input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Mi Empresa S.A."
                  className="bg-[#2a332c] border-[#3A4D3F]/50 text-white placeholder:text-[#6b7a6a] focus:border-[#3A4D3F]"
                  data-testid="company-name-input"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-[#3A4D3F] to-[#2a3d2f] hover:from-[#4a5d4f] hover:to-[#3a4d3f] text-[#E5DCC5] font-semibold py-6"
                disabled={isSubmitting}
                data-testid="complete-registration-btn"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Creando cuenta...
                  </>
                ) : (
                  "Comenzar con Plan Free"
                )}
              </Button>
            </form>

            <p className="text-center text-xs text-[#6b7a6a] mt-6">
              Al registrarte, aceptas nuestros términos de servicio y política de privacidad.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a1f1a] via-[#0f1310] to-[#1a1f1a] flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-[#3A4D3F]" />
        <p className="text-[#a3b18a]">Verificando autenticación...</p>
      </div>
    </div>
  );
}
