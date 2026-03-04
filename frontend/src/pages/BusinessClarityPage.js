import { useEffect, useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Layout } from "../components/Layout";

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
  CloseReconciliationSection,
  MarketingROISection
} from "../components/business-clarity";

// Icons
import {
  FileText, TrendingUp, TrendingDown, PieChart, Banknote,
  UserCircle, Landmark, FileBarChart, Target, Lock,
  Briefcase, BarChart3
} from "lucide-react";
import { Badge } from "../components/ui/badge";

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
  const location = useLocation();
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    // Get current user role
    axios.get(`${API}/api/auth/me`, { withCredentials: true })
      .then(res => setUserRole(res.data?.role || "viewer"))
      .catch(() => setUserRole("viewer"));
  }, []);

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

  // Navigation tabs - flat structure
  const navTabs = [
    { path: "/business-clarity/dashboard", label: isEs ? "Dashboard" : "Dashboard", icon: PieChart },
    { path: "/business-clarity/invoices", label: isEs ? "Facturas" : "Invoices", icon: FileText },
    { path: "/business-clarity/payments", label: isEs ? "Pagos" : "Payments", icon: Banknote },
    { path: "/business-clarity/statements", label: isEs ? "Estados" : "Statements", icon: UserCircle },
    { path: "/business-clarity/receivables", label: "AR", icon: TrendingUp },
    { path: "/business-clarity/payables", label: "AP", icon: TrendingDown },
    { path: "/business-clarity/fixed-costs", label: isEs ? "Costos Fijos" : "Fixed Costs", icon: Target },
    { path: "/business-clarity/marketing-roi", label: isEs ? "Marketing ROI" : "Marketing ROI", icon: BarChart3 },
    { path: "/business-clarity/close", label: isEs ? "Cierre" : "Close", icon: Lock },
    { path: "/business-clarity/reports", label: isEs ? "Reportes" : "Reports", icon: FileBarChart },
  ];

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
    <Layout>
      <div className="space-y-6" data-testid="business-clarity-page">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Business Clarity</h1>
            <p className="text-sm text-muted-foreground">
              {isEs ? "Finanzas, facturas y reportes" : "Finance, invoices & reports"}
            </p>
          </div>
          {userRole && (
            <Badge variant="outline" className="ml-auto text-xs capitalize">{userRole}</Badge>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="border-b">
          <nav className="flex gap-1 overflow-x-auto pb-px">
            {navTabs.map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? "border-emerald-600 text-emerald-600"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                  }`
                }
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Content */}
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardSection />} />
          <Route path="invoices" element={<InvoicesSection />} />
          <Route path="payments" element={<PaymentsSection />} />
          <Route path="statements" element={<StatementsSection />} />
          <Route path="receivables" element={<ReceivablesSection />} />
          <Route path="payables" element={<PayablesSection />} />
          <Route path="fixed-costs" element={<FixedCostsSection />} />
          <Route path="marketing-roi" element={<MarketingROISection />} />
          <Route path="close" element={<CloseReconciliationSection />} />
          <Route path="reports" element={<ReportsSection />} />
        </Routes>
      </div>
    </Layout>
  );
}
