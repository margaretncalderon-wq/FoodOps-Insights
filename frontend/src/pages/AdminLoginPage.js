import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { toast } from "sonner";
import { Loader2, Shield } from "lucide-react";

export default function AdminLoginPage() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({ email: "", password: "" });

  // Get the redirect path from location state, default to /super-admin
  const from = location.state?.from || "/super-admin";

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await login(formData.email, formData.password);
      if (response?.user?.is_super_admin) {
        toast.success("¡Bienvenido al Panel de Administración!");
        navigate(from, { replace: true });
      } else {
        toast.error("No tienes permisos de administrador");
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Credenciales inválidas");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#192332] flex items-center justify-center mx-auto mb-4 overflow-hidden ring-2 ring-red-500/40">
            <img src="/kora-icon.png" alt="Kora OS" className="w-full h-full object-contain" />
          </div>
          <h1 className="font-heading text-3xl font-bold text-white">Kora OS</h1>
          <p className="text-slate-400 mt-2 flex items-center justify-center gap-2">
            <Shield className="w-4 h-4 text-red-500" />
            Panel de Administración
          </p>
        </div>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-6 space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-white">Iniciar Sesión</h2>
              <p className="text-slate-400 text-sm mt-1">
                Acceso exclusivo para administradores
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@kora.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                  data-testid="admin-login-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                  data-testid="admin-login-password"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 bg-red-600 hover:bg-red-700 text-white"
                disabled={loading}
                data-testid="admin-login-submit"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Acceder"
                )}
              </Button>
            </form>

            <p className="text-center text-xs text-slate-500">
              Este acceso está protegido y monitoreado
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
