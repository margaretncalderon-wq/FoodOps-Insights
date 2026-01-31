import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function RegisterPage() {
  const { register, loginWithGoogle, loading } = useAuth();
  const { t, language, changeLanguage } = useLanguage();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    company_name: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await register(formData);
      toast.success(language === "es" ? "¡Cuenta creada!" : "Account created!");
      navigate("/dashboard");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Registration failed");
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Side - Image */}
      <div className="hidden lg:block lg:w-1/2 relative">
        <img
          src="https://images.unsplash.com/photo-1761110840708-9d6814876068?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"
          alt="Wedding table details"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-primary/20" />
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <Link to="/" className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <span className="font-heading text-xl font-bold text-white">E</span>
              </div>
              <span className="font-heading text-xl font-semibold">Evoke OS</span>
            </Link>
            <h1 className="font-heading text-3xl font-bold text-foreground">{t("createAccount")}</h1>
            <p className="text-muted-foreground mt-2">
              {language === "es"
                ? "Comienza a gestionar tus eventos hoy"
                : "Start managing your events today"}
            </p>
          </div>

          <div className="space-y-6">
            {/* Google Register */}
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 gap-3"
              onClick={loginWithGoogle}
              data-testid="google-register-btn"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {t("continueWithGoogle")}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  {t("orContinueWith")}
                </span>
              </div>
            </div>

            {/* Registration Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t("name")}</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder={language === "es" ? "Tu nombre" : "Your name"}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  data-testid="register-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_name">{t("companyName")}</Label>
                <Input
                  id="company_name"
                  type="text"
                  placeholder={language === "es" ? "Nombre de tu empresa" : "Your company name"}
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  data-testid="register-company-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t("email")}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  data-testid="register-email-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("password")}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={6}
                  data-testid="register-password-input"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 rounded-full"
                disabled={loading}
                data-testid="register-submit-btn"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  t("register")
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              {language === "es" ? "¿Ya tienes cuenta?" : "Already have an account?"}{" "}
              <Link to="/login" className="text-primary hover:underline font-medium">
                {t("login")}
              </Link>
            </p>
          </div>

          <div className="mt-8 text-center">
            <button
              onClick={() => changeLanguage(language === "en" ? "es" : "en")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {language === "en" ? "🇪🇸 Español" : "🇺🇸 English"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
