import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const { login, loginWithGoogle, loading } = useAuth();
  const { t, language, changeLanguage } = useLanguage();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: "", password: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(formData.email, formData.password);
      toast.success(language === "es" ? "¡Bienvenido!" : "Welcome back!");
      // Use both navigate and fallback to ensure redirect works
      navigate("/dashboard");
      // Fallback: if navigate doesn't work within 500ms, force redirect
      setTimeout(() => {
        if (window.location.pathname === "/login") {
          window.location.href = "/dashboard";
        }
      }, 500);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Login failed");
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex">
      {/* Left Side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <Link to="/" className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#2A2F3A] flex items-center justify-center">
                <img src="/favicon.png" alt="Kora" className="w-8 h-8" />
              </div>
              <span className="font-heading text-xl font-semibold text-[#1F2937]">Kora OS</span>
            </Link>
            <h1 className="font-heading text-3xl font-bold text-[#1F2937]">{t("welcomeBack")}</h1>
            <p className="text-[#6B7280] mt-2">
              {language === "es"
                ? "Ingresa tus credenciales para acceder"
                : "Enter your credentials to access your account"}
            </p>
          </div>

          <Card className="border-0 shadow-none bg-transparent">
            <CardContent className="p-0 space-y-6">
              {/* Google Login */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-12 gap-3 bg-white border-[#E5E7EB] hover:bg-[#F7F8FA] text-[#1F2937]"
                onClick={loginWithGoogle}
                data-testid="google-login-btn"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {t("continueWithGoogle")}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-[#E5E7EB]" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-[#F7F8FA] px-2 text-[#6B7280]">
                    {t("orContinueWith")}
                  </span>
                </div>
              </div>

              {/* Email/Password Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[#1F2937]">{t("email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    className="bg-white border-[#E5E7EB]"
                    data-testid="login-email-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-[#1F2937]">{t("password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    className="bg-white border-[#E5E7EB]"
                    data-testid="login-password-input"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-12 rounded-full bg-[#2A2F3A] hover:bg-[#3A4049] text-white"
                  disabled={loading}
                  data-testid="login-submit-btn"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    t("login")
                  )}
                </Button>
              </form>

              <p className="text-center text-sm text-[#6B7280]">
                {language === "es" ? "¿No tienes cuenta?" : "Don't have an account?"}{" "}
                <Link to="/register" className="text-[#AED768] hover:underline font-medium">
                  {t("register")}
                </Link>
              </p>
            </CardContent>
          </Card>

          <div className="mt-8 text-center">
            <button
              onClick={() => changeLanguage(language === "en" ? "es" : "en")}
              className="text-sm text-[#6B7280] hover:text-[#1F2937] transition-colors"
            >
              {language === "en" ? "🇪🇸 Español" : "🇺🇸 English"}
            </button>
          </div>
        </div>
      </div>

      {/* Right Side - Image */}
      <div className="hidden lg:block lg:w-1/2 relative">
        <img
          src="https://images.unsplash.com/photo-1746021535489-00edc5efb203?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"
          alt="Event workspace"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-[#2A2F3A]/30" />
      </div>
    </div>
  );
}
