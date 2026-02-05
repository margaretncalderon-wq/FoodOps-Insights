import { useEffect, useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";

// Refactored Section Components
import {
  DashboardSection,
  PayablesSection,
  InvoicesSection,
  PaymentsSection,
  StatementsSection,
  ReceivablesSection,
  ReportsSection,
  FixedCostsSection,
  CloseReconciliationSection
} from "../components/business-clarity";

// Icons
import {
  FileText, TrendingUp, TrendingDown, PieChart, Banknote,
  UserCircle, Landmark, FileBarChart, ArrowLeft, Target, Lock,
  Briefcase, BarChart3, Brain, ChevronDown, ChevronRight, Shield
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";

import { API_BASE as API } from "../utils/api"; // Dynamic API URL

// Role-based permissions for Business Clarity
const PERMISSIONS = {
  // Finance Ops - transactional pages
  finance_ops: {
    roles: ["owner", "admin", "finance", "manager", "ops"],
    pages: ["invoices", "payments", "statements", "receivables", "payables"]
  },
  // Management Control - guardrails
  management_control: {
    roles: ["owner", "admin", "finance", "manager"],
    pages: ["fixed-costs"]
  },
  // Executive Intelligence - decision + close
  executive_intelligence: {
    roles: ["owner", "admin", "finance"],
    pages: ["dashboard", "reports", "close"]
  },
  // Special permissions
  close_period: ["owner", "admin", "finance"],
  approve_variance: ["owner"],
  reopen_period: ["owner"]
};

export default function BusinessClarityPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [userRole, setUserRole] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    finance_ops: true,
    management_control: true,
    executive_intelligence: true
  });

  useEffect(() => {
    // Get current user role
    axios.get(`${API}/api/auth/me`, { withCredentials: true })
      .then(res => setUserRole(res.data?.role || "viewer"))
      .catch(() => setUserRole("viewer"));
  }, []);

  // Check if user has access to a layer
  const hasAccessToLayer = (layer) => {
    if (!userRole) return false;
    return PERMISSIONS[layer]?.roles?.includes(userRole);
  };

  // Check if user has access to a specific page
  const hasAccessToPage = (pagePath) => {
    if (!userRole) return false;
    for (const [layer, config] of Object.entries(PERMISSIONS)) {
      if (config.pages?.includes(pagePath) && config.roles?.includes(userRole)) {
        return true;
      }
    }
    return false;
  };

  // Layered navigation structure
  const navLayers = [
    {
      key: "finance_ops",
      label: isEs ? "Operaciones Financieras" : "Finance Ops",
      icon: Briefcase,
      description: isEs ? "Transacciones diarias" : "Daily transactions",
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      items: [
        { path: "invoices", label: isEs ? "Facturas" : "Invoices", icon: FileText },
        { path: "payments", label: isEs ? "Pagos Recibidos" : "Received Payments", icon: Banknote },
        { path: "statements", label: isEs ? "Estados de Cuenta" : "Account Statements", icon: UserCircle },
        { path: "receivables", label: isEs ? "Cuentas por Cobrar (AR)" : "Accounts Receivable (AR)", icon: TrendingUp },
        { path: "payables", label: isEs ? "Cuentas por Pagar (AP)" : "Accounts Payable (AP)", icon: TrendingDown },
      ]
    },
    {
      key: "management_control",
      label: isEs ? "Control de Gestión" : "Management Control",
      icon: BarChart3,
      description: isEs ? "Presupuestos y varianzas" : "Budgets & variances",
      color: "text-amber-600",
      bgColor: "bg-amber-50",
      items: [
        { path: "fixed-costs", label: isEs ? "Costos Fijos & Budget" : "Fixed Costs & Budget", icon: Target },
      ]
    },
    {
      key: "executive_intelligence",
      label: isEs ? "Inteligencia Ejecutiva" : "Executive Intelligence",
      icon: Brain,
      description: isEs ? "Decisiones y cierre" : "Decisions & close",
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      items: [
        { path: "dashboard", label: isEs ? "Panel Ejecutivo" : "Executive Dashboard", icon: PieChart },
        { path: "close", label: isEs ? "Cierre & Reconciliación" : "Close & Reconciliation", icon: Lock },
        { path: "reports", label: isEs ? "Reportes Ejecutivos" : "Executive Reports", icon: FileBarChart },
      ]
    }
  ];

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (sessionId) {
      const pollStatus = async () => {
        try {
          const res = await axios.get(`${API}/api/business-clarity/checkout/status/${sessionId}`, { withCredentials: true });
          if (res.data.payment_status === "paid") {
            toast.success(isEs ? "¡Pago exitoso!" : "Payment successful!");
            window.history.replaceState({}, document.title, window.location.pathname);
          } else if (res.data.status !== "expired") {
            setTimeout(pollStatus, 2000);
          }
        } catch (err) { console.error(err); }
      };
      pollStatus();
    }
  }, [isEs]);

  return (
    <div className="flex h-[calc(100vh-4rem)]" data-testid="business-clarity-page">
      {/* Sidebar Navigation */}
      <div className="w-72 border-r bg-muted/30 p-4 flex flex-col overflow-y-auto">
        <NavLink 
          to="/dashboard" 
          className="flex items-center gap-2 mb-4 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {isEs ? "Volver a System Pulse" : "Back to System Pulse"}
        </NavLink>
        
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Landmark className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-bold">Business Clarity</h2>
          </div>
          <p className="text-xs text-muted-foreground pl-8">
            {isEs 
              ? "Donde las finanzas se convierten en decisiones" 
              : "Where finances become decisions"}
          </p>
        </div>

        {/* Role Badge */}
        {userRole && (
          <div className="mb-4 px-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="w-3 h-3" />
              <span>{isEs ? "Tu rol:" : "Your role:"}</span>
              <Badge variant="outline" className="text-xs capitalize">{userRole}</Badge>
            </div>
          </div>
        )}

        {/* Layered Navigation */}
        <nav className="space-y-2 flex-1">
          {navLayers.map(layer => {
            const hasAccess = hasAccessToLayer(layer.key);
            const isExpanded = expandedSections[layer.key];
            
            return (
              <div key={layer.key} className={`rounded-lg ${!hasAccess ? "opacity-50" : ""}`}>
                {/* Layer Header */}
                <button
                  onClick={() => hasAccess && toggleSection(layer.key)}
                  disabled={!hasAccess}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${layer.bgColor} ${hasAccess ? "cursor-pointer hover:opacity-80" : "cursor-not-allowed"}`}
                >
                  <div className="flex items-center gap-2">
                    <layer.icon className={`w-4 h-4 ${layer.color}`} />
                    <div className="text-left">
                      <p className={`text-sm font-medium ${layer.color}`}>{layer.label}</p>
                      <p className="text-[10px] text-muted-foreground">{layer.description}</p>
                    </div>
                  </div>
                  {hasAccess ? (
                    isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Lock className="w-3 h-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{isEs ? "Acceso restringido" : "Restricted access"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </button>

                {/* Layer Items */}
                {hasAccess && isExpanded && (
                  <div className="mt-1 ml-2 space-y-0.5">
                    {layer.items.map(item => (
                      <NavLink
                        key={item.path}
                        to={`/business-clarity/${item.path}`}
                        className={({ isActive }) =>
                          `flex items-center gap-2 px-3 py-2 rounded-md transition-colors text-sm ${
                            isActive 
                              ? "bg-primary text-primary-foreground" 
                              : "hover:bg-muted text-muted-foreground hover:text-foreground"
                          }`
                        }
                      >
                        <item.icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Permission Legend */}
        <div className="mt-4 pt-4 border-t">
          <p className="text-[10px] text-muted-foreground mb-2">{isEs ? "Permisos especiales:" : "Special permissions:"}</p>
          <div className="space-y-1 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <Lock className="w-3 h-3" />
              <span>{isEs ? "Cerrar período: Finance+" : "Close period: Finance+"}</span>
            </div>
            <div className="flex items-center gap-1">
              <Shield className="w-3 h-3" />
              <span>{isEs ? "Aprobar varianza: Owner" : "Approve variance: Owner"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardSection />} />
          <Route path="invoices" element={<InvoicesSection />} />
          <Route path="payments" element={<PaymentsSection />} />
          <Route path="statements" element={<StatementsSection />} />
          <Route path="receivables" element={<ReceivablesSection />} />
          <Route path="payables" element={<PayablesSection />} />
          <Route path="fixed-costs" element={<FixedCostsSection />} />
          <Route path="close" element={<CloseReconciliationSection />} />
          <Route path="reports" element={<ReportsSection />} />
        </Routes>
      </div>
    </div>
  );
}
