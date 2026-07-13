import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { Loader2, Check, Users, Calendar, ChefHat, Briefcase } from "lucide-react";
import { KoraLogo } from "../components/KoraLogo";
import { KoraLoader } from "../components/KoraLoader";

export default function LoginPage() {
  const { login, loginWithGoogle, loading } = useAuth();
  const { t, language, changeLanguage } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (searchParams.get("expired") === "1") {
      // Small delay to ensure toast provider is mounted
      const timer = setTimeout(() => {
        toast.error(language === "es" ? "Tu sesión ha expirado. Por favor inicia sesión de nuevo." : "Your session has expired. Please log in again.");
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchParams, language]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(formData.email, formData.password);
      toast.success(language === "es" ? "¡Bienvenido!" : "Welcome back!");
      navigate("/dashboard");
      setTimeout(() => {
        if (window.location.pathname === "/login") {
          window.location.href = "/dashboard";
        }
      }, 500);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Login failed");
    }
  };

  const isEs = language === "es";

  return (
    <div className="min-h-screen flex overflow-hidden">
      {/* Left Side - Form (White) */}
      <div className="flex-1 flex flex-col justify-center px-8 lg:px-16 xl:px-24 bg-white min-h-screen overflow-y-auto">
        <div className="w-full max-w-md mx-auto">
          {/* Logo */}
          <Link to="/" className="inline-flex items-center gap-2 mb-12">
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#192332] flex items-center justify-center">
              <img src="/kora-icon.png" alt="Kora OS" className="w-full h-full object-contain" />
            </div>
            <span className="font-heading text-lg font-semibold text-[#1F2937]">Kora OS</span>
          </Link>

          {/* Login Title */}
          <h1 className="font-heading text-3xl lg:text-4xl font-bold text-[#1F2937] mb-2">
            {isEs ? "Iniciar sesión" : "Log in"}
          </h1>
          <p className="text-[#6B7280] mb-8">
            {isEs ? "Accede a tu cuenta de Kora" : "Access your Kora account"}
          </p>

          {/* Google Login - Primary CTA */}
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 gap-3 bg-white border-[#E5E7EB] hover:bg-[#F7F8FA] text-[#1F2937] font-medium rounded-lg mb-6"
            onClick={loginWithGoogle}
            data-testid="google-login-btn"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {t("continueWithGoogle")}
          </Button>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-[#E5E7EB]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-[#9CA3AF]">
                {isEs ? "O" : "Or"}
              </span>
            </div>
          </div>

          {/* Email Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                id="email"
                type="email"
                placeholder={isEs ? "nombre@empresa.com" : "name@company.com"}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="h-12 bg-white border-[#E5E7EB] rounded-lg placeholder:text-[#9CA3AF]"
                data-testid="login-email-input"
              />
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder={isEs ? "Contraseña" : "Password"}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                className="h-12 bg-white border-[#E5E7EB] rounded-lg pr-12 placeholder:text-[#9CA3AF]"
                data-testid="login-password-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280]"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <Button
              type="submit"
              className="w-full h-12 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium"
              disabled={loading}
              data-testid="login-submit-btn"
            >
              {loading ? (
                <KoraLoader size={22} />
              ) : (
                isEs ? "Continuar" : "Continue"
              )}
            </Button>
          </form>

          {/* Terms */}
          <p className="mt-6 text-xs text-[#9CA3AF] text-center leading-relaxed">
            {isEs ? "Al continuar, aceptas nuestros " : "By proceeding, you agree to the "}
            <a href="#" className="text-[#2563EB] hover:underline">{isEs ? "Términos de Servicio" : "Terms of Service"}</a>
            {isEs ? " y " : " and "}
            <a href="#" className="text-[#2563EB] hover:underline">{isEs ? "Política de Privacidad" : "Privacy Policy"}</a>
          </p>

          {/* Don't have account - Create one */}
          <p className="mt-8 text-center text-sm text-[#6B7280]">
            {isEs ? "¿No tienes cuenta?" : "Don't have an account?"}{" "}
            <Link to="/register" className="text-[#2563EB] hover:underline font-medium">
              {isEs ? "Crear una" : "Create one"}
            </Link>
          </p>

          {/* Language Toggle */}
          <div className="mt-8 text-center">
            <button
              onClick={() => changeLanguage(language === "en" ? "es" : "en")}
              className="text-sm text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
            >
              {language === "en" ? "🇪🇸 Español" : "🇺🇸 English"}
            </button>
          </div>
        </div>
      </div>

      {/* Right Side - Kora Brand Illustration */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#2A2F3A] relative overflow-hidden items-center justify-center p-12 min-h-screen">
        {/* Background decorative elements */}
        <div className="absolute top-20 right-20 w-32 h-32 bg-[#AED768] rounded-full opacity-20" />
        <div className="absolute bottom-24 left-16 w-20 h-20 bg-[#AED768] rounded-full opacity-30" />
        <div className="absolute top-1/3 left-1/4 w-16 h-16 bg-[#AED768] rounded-full opacity-25" />
        
        {/* Main illustration card */}
        <div className="relative z-10 bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md transform rotate-[-2deg]">
          {/* Mock dashboard header */}
          <div className="flex items-center gap-3 mb-6">
            <KoraLogo size={40} className="rounded-lg" />
            <div>
              <p className="font-semibold text-[#1F2937] text-sm">Kora OS</p>
              <p className="text-xs text-[#9CA3AF]">Dashboard</p>
            </div>
          </div>

          {/* Mock task items */}
          <div className="space-y-3">
            {[
              { icon: Users, text: isEs ? "Gestión de clientes" : "Client management", color: "bg-blue-500", status: "done" },
              { icon: Calendar, text: isEs ? "Eventos del mes" : "Events this month", color: "bg-purple-500", status: "done" },
              { icon: ChefHat, text: isEs ? "Costeo de recetas" : "Recipe costing", color: "bg-orange-500", status: "progress" },
              { icon: Briefcase, text: isEs ? "Reportes financieros" : "Financial reports", color: "bg-emerald-500", status: "pending" },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-[#F7F8FA] rounded-lg">
                <div className={`w-8 h-8 ${item.color} rounded-lg flex items-center justify-center`}>
                  <item.icon className="w-4 h-4 text-white" />
                </div>
                <span className="flex-1 text-sm text-[#1F2937]">{item.text}</span>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  item.status === 'done' ? 'bg-[#AED768]' : 
                  item.status === 'progress' ? 'bg-amber-400' : 'bg-[#E5E7EB]'
                }`}>
                  {item.status === 'done' && <Check className="w-3 h-3 text-white" />}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Kora logo accent */}
        <div className="absolute top-12 left-12 flex items-center gap-3">
          <KoraLogo size={48} className="rounded-xl" />
          <span className="text-white/80 font-heading text-xl font-semibold">Kora OS</span>
        </div>

        {/* Decorative grid pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="w-full h-full" style={{
            backgroundImage: 'radial-gradient(circle, #AED768 1px, transparent 1px)',
            backgroundSize: '30px 30px'
          }} />
        </div>
      </div>
    </div>
  );
}
