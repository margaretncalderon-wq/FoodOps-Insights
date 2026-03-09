import { useState, useEffect, createContext, useContext } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Button } from "../../components/ui/button";
import { 
  Shield, BarChart3, Users, Building2, Settings, CreditCard,
  ChevronLeft, LogOut, Eye, X, Loader2, Landmark, Sparkles, Plug, Database, Bug, Tag
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

// Helper to detect if we're on the admin subdomain
const isAdminSubdomain = () => {
  const hostname = window.location.hostname;
  return hostname.startsWith('admin.') || hostname === 'admin.ourkora.com';
};

// Context for View-As functionality
export const ViewAsContext = createContext({
  viewAsStatus: { active: false, org_id: null, org_name: null },
  setViewAsStatus: () => {},
  exitViewAs: () => {}
});

export const useViewAs = () => useContext(ViewAsContext);

export default function SuperAdminLayout() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [stats, setStats] = useState(null);
  const [viewAsStatus, setViewAsStatus] = useState({ active: false, org_id: null, org_name: null });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    checkAccess();
    checkViewAsStatus();
  }, []);

  const checkAccess = async () => {
    try {
      const res = await axios.get(`${API}/api/super-admin/stats`, { withCredentials: true });
      setStats(res.data);
      setAuthorized(true);
      setLoading(false);
    } catch (err) {
      console.error("Super admin access check failed:", err);
      // If it's a 401/403, retry once after a short delay (cookie might not be ready)
      if (retryCount < 2 && (err.response?.status === 401 || err.response?.status === 403 || !err.response)) {
        setRetryCount(prev => prev + 1);
        setTimeout(() => {
          checkAccess();
        }, 500);
      } else {
        setAuthorized(false);
        setLoading(false);
        // Redirect to admin login
        navigate("/admin-login", { replace: true });
      }
    }
  };

  const checkViewAsStatus = async () => {
    try {
      const res = await axios.get(`${API}/api/super-admin/view-as/status`, { withCredentials: true });
      if (res.data.active) {
        setViewAsStatus({
          active: true,
          org_id: res.data.org_id,
          org_name: res.data.org_name
        });
      }
    } catch (err) {
      console.error("Failed to check view-as status:", err);
    }
  };

  const exitViewAs = async () => {
    try {
      await axios.post(`${API}/api/super-admin/exit-view-as`, {}, { withCredentials: true });
      setViewAsStatus({ active: false, org_id: null, org_name: null });
    } catch (err) {
      console.error("Failed to exit view-as mode:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Shield className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold mb-2">
            {isEs ? "Acceso Denegado" : "Access Denied"}
          </h1>
          <p className="text-muted-foreground mb-4">
            {isEs 
              ? "No tienes permiso para acceder a esta área." 
              : "You don't have permission to access this area."}
          </p>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ChevronLeft className="w-4 h-4 mr-2" />
            {isEs ? "Volver al Dashboard" : "Return to Dashboard"}
          </Button>
        </div>
      </div>
    );
  }

  const navItems = [
    { path: "/super-admin", label: isEs ? "Resumen" : "Overview", icon: BarChart3, end: true },
    { path: "/super-admin/crm", label: isEs ? "Pipeline Ventas" : "Sales Pipeline", icon: Users },
    { path: "/super-admin/demo-accounts", label: isEs ? "Cuentas Demo" : "Demo Accounts", icon: Sparkles },
    { path: "/super-admin/deals", label: isEs ? "Custom Deals" : "Custom Deals", icon: Tag },
    { path: "/super-admin/integrations", label: isEs ? "Integraciones API" : "API Integrations", icon: Plug },
    { path: "/super-admin/clarity", label: "Business Clarity", icon: Landmark },
    { path: "/super-admin/organizations", label: isEs ? "Organizaciones" : "Organizations", icon: Building2 },
    { path: "/super-admin/users", label: isEs ? "Usuarios" : "Users", icon: Users },
    { path: "/super-admin/support-tickets", label: isEs ? "Tickets Soporte" : "Support Tickets", icon: Bug },
    { path: "/super-admin/diagnostics", label: isEs ? "Diagnóstico Datos" : "Data Diagnostics", icon: Database },
    { path: "/super-admin/settings", label: isEs ? "Configuración" : "Settings", icon: Settings },
  ];

  return (
    <ViewAsContext.Provider value={{ viewAsStatus, setViewAsStatus, exitViewAs }}>
      <div className="flex h-[calc(100vh-4rem)]" data-testid="super-admin-layout">
        {/* View-As Banner */}
        {viewAsStatus.active && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-black px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              <span className="font-medium">
                {isEs ? "Viendo como:" : "Viewing as:"} <strong>{viewAsStatus.org_name}</strong> 
                ({isEs ? "Solo lectura" : "Read-only"})
              </span>
            </div>
            <Button size="sm" variant="secondary" onClick={exitViewAs}>
              <X className="w-4 h-4 mr-2" />
              {isEs ? "Salir" : "Exit"}
            </Button>
          </div>
        )}

        {/* Sidebar */}
        <div className={`w-64 border-r bg-muted/30 p-4 flex flex-col ${viewAsStatus.active ? "mt-12" : ""}`}>
          {/* Back Link - Only show if not on admin subdomain */}
          {!isAdminSubdomain() && (
            <NavLink 
              to="/dashboard" 
              className="flex items-center gap-2 mb-4 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {isEs ? "Volver al Dashboard" : "Back to Dashboard"}
            </NavLink>
          )}

          {/* Header */}
          <div className="mb-6 px-3">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-6 h-6 text-red-500" />
              <h2 className="text-xl font-bold">Kora OS</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              {isEs ? "Super Admin" : "Super Admin"}
            </p>
          </div>

          {/* Stats Quick View */}
          {stats && (
            <div className="px-3 mb-6">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-muted rounded-lg p-2">
                  <p className="text-2xl font-bold">{stats.organizations?.total || 0}</p>
                  <p className="text-xs text-muted-foreground">Orgs</p>
                </div>
                <div className="bg-muted rounded-lg p-2">
                  <p className="text-2xl font-bold">{stats.total_users || 0}</p>
                  <p className="text-xs text-muted-foreground">Users</p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive 
                      ? "bg-primary text-primary-foreground" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`
                }
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Footer */}
          <div className="pt-4 border-t">
            {isAdminSubdomain() ? (
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  // Clear auth and redirect to login
                  localStorage.removeItem('token');
                  document.cookie = 'access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                  navigate("/login");
                }}
              >
                <LogOut className="w-4 h-4 mr-2" />
                {isEs ? "Cerrar Sesión" : "Logout"}
              </Button>
            ) : (
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => navigate("/dashboard")}
              >
                <LogOut className="w-4 h-4 mr-2" />
                {isEs ? "Salir de Super Admin" : "Exit Super Admin"}
              </Button>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className={`flex-1 overflow-auto ${viewAsStatus.active ? "mt-12" : ""}`}>
          <Outlet />
        </div>
      </div>
    </ViewAsContext.Provider>
  );
}
