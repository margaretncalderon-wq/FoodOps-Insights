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
  MarketingROISection,
  PayrollCostSection,
  RegulatoryReportsSection,
  SalesReportsSection,
  AdminReportsSection,
  AccountingQueueSection,
  AccountingDashboard,
  ProfitLossDashboard,
  CashFlowSection
} from "../components/business-clarity";

// Icons
import {
  FileText, TrendingUp, TrendingDown, PieChart, Banknote,
  UserCircle, Landmark, FileBarChart, Target, Lock,
  Briefcase, BarChart3, Users, Building2, ChevronDown,
  ShoppingCart, Wallet, ArrowRightLeft, PiggyBank, Receipt,
  CreditCard, Clock, FileCheck, Calculator
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

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

  // Navigation structure - Main tabs and dropdown groups
  const mainTabs = [
    { path: "/business-clarity/dashboard", label: isEs ? "Dashboard" : "Dashboard", icon: PieChart, type: "link" },
  ];

  // Billing dropdown
  const billingMenu = [
    { path: "/business-clarity/invoices", label: isEs ? "Facturas" : "Invoices", icon: FileText },
    { path: "/business-clarity/payments", label: isEs ? "Pagos de Clientes" : "Client Payments", icon: Banknote },
    { path: "/business-clarity/statements", label: isEs ? "Estados de Cuenta" : "Statements", icon: UserCircle },
  ];

  // Receivables dropdown
  const receivablesMenu = [
    { path: "/business-clarity/receivables", label: isEs ? "Antigüedad AR" : "AR Aging", icon: TrendingUp },
    { path: "/business-clarity/receivables", label: isEs ? "Cobranzas" : "Collections", icon: CreditCard, disabled: false },
    { path: "/business-clarity/receivables", label: isEs ? "Seguimiento Pagos" : "Payment Tracking", icon: Clock, disabled: false },
  ];

  // Payables dropdown
  const payablesMenu = [
    { path: "/business-clarity/payables", label: isEs ? "Facturas Proveedores" : "Vendor Bills", icon: Receipt },
    { path: "/business-clarity/payables", label: isEs ? "Pagos a Proveedores" : "Vendor Payments", icon: Banknote },
    { path: "/business-clarity/payables", label: isEs ? "Antigüedad AP" : "AP Aging", icon: TrendingDown },
  ];

  // Financials dropdown
  const financialsMenu = [
    { path: "/business-clarity/fixed-costs", label: isEs ? "Costos Fijos" : "Fixed Costs", icon: Target },
    { path: "/business-clarity/reports", label: isEs ? "Reportes Ejecutivos" : "Executive Reports", icon: FileBarChart },
    { path: "/business-clarity/profit-loss", label: isEs ? "P&L / Resultados" : "P&L / Results", icon: Wallet },
    { path: "/business-clarity/sales-reports", label: isEs ? "Reportes de Ventas" : "Sales Reports", icon: ShoppingCart },
    { path: "/business-clarity/admin-reports", label: isEs ? "Administrativos" : "Administrative", icon: Calculator },
    { path: "/business-clarity/payroll-cost", label: isEs ? "Costo de Personal" : "Payroll Cost", icon: Users },
    { path: "/business-clarity/marketing-roi", label: "Marketing ROI", icon: BarChart3 },
    { path: "/business-clarity/regulatory", label: isEs ? "Regulatorios" : "Regulatory", icon: Building2 },
    { path: "/business-clarity/accounting-dashboard", label: isEs ? "Contabilización" : "Accounting", icon: FileCheck },
    { path: "/business-clarity/accounting-queue", label: isEs ? "Cola Contable" : "Accounting Queue", icon: Target },
  ];

  // Check if current path is in a section
  const isInBillingSection = billingMenu.some(item => location.pathname === item.path);
  const isInReceivablesSection = receivablesMenu.some(item => location.pathname === item.path);
  const isInPayablesSection = payablesMenu.some(item => location.pathname === item.path);
  const isInFinancialsSection = financialsMenu.some(item => location.pathname === item.path);

  // Dropdown component for nav sections
  const NavDropdown = ({ label, icon: Icon, items, isActive }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            isActive
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
          }`}
        >
          <Icon className="w-4 h-4" />
          {label}
          <ChevronDown className="w-3 h-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {items.map((item, idx) => (
          <DropdownMenuItem
            key={`${item.path}-${idx}`}
            onClick={() => !item.disabled && navigate(item.path)}
            className={`flex items-center gap-2 cursor-pointer ${
              location.pathname === item.path ? "bg-emerald-50 text-emerald-700" : ""
            } ${item.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

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
            {/* Dashboard - Direct Link */}
            <NavLink
              to="/business-clarity/dashboard"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-emerald-600 text-emerald-600"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                }`
              }
            >
              <PieChart className="w-4 h-4" />
              Dashboard
            </NavLink>

            {/* Billing Dropdown */}
            <NavDropdown 
              label={isEs ? "Facturación" : "Billing"} 
              icon={FileText} 
              items={billingMenu}
              isActive={isInBillingSection}
            />

            {/* Receivables Dropdown */}
            <NavDropdown 
              label={isEs ? "Cobros" : "Receivables"} 
              icon={TrendingUp} 
              items={receivablesMenu}
              isActive={isInReceivablesSection}
            />

            {/* Payables Dropdown */}
            <NavDropdown 
              label={isEs ? "Pagos" : "Payables"} 
              icon={TrendingDown} 
              items={payablesMenu}
              isActive={isInPayablesSection}
            />

            {/* Financials Dropdown */}
            <NavDropdown 
              label={isEs ? "Finanzas" : "Financials"} 
              icon={Wallet} 
              items={financialsMenu}
              isActive={isInFinancialsSection}
            />

            {/* Cash Flow - Direct Link */}
            <NavLink
              to="/business-clarity/cash-flow"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-emerald-600 text-emerald-600"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                }`
              }
            >
              <ArrowRightLeft className="w-4 h-4" />
              {isEs ? "Flujo de Caja" : "Cash Flow"}
            </NavLink>

            {/* Close - Direct Link */}
            <NavLink
              to="/business-clarity/close"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-emerald-600 text-emerald-600"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                }`
              }
            >
              <Lock className="w-4 h-4" />
              {isEs ? "Cierre" : "Close"}
            </NavLink>
          </nav>
        </div>

        {/* Content */}
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardSection />} />
          <Route path="invoices" element={<InvoicesSection />} />
          <Route path="payments" element={<PaymentsSection />} />
          <Route path="cash-flow" element={<CashFlowSection />} />
          <Route path="statements" element={<StatementsSection />} />
          <Route path="receivables" element={<ReceivablesSection />} />
          <Route path="payables" element={<PayablesSection />} />
          <Route path="fixed-costs" element={<FixedCostsSection />} />
          <Route path="payroll-cost" element={<PayrollCostSection />} />
          <Route path="marketing-roi" element={<MarketingROISection />} />
          <Route path="regulatory" element={<RegulatoryReportsSection />} />
          <Route path="sales-reports" element={<SalesReportsSection />} />
          <Route path="admin-reports" element={<AdminReportsSection />} />
          <Route path="close" element={<CloseReconciliationSection />} />
          <Route path="reports" element={<ReportsSection />} />
          <Route path="accounting-queue" element={<AccountingQueueSection />} />
          <Route path="accounting-dashboard" element={<AccountingDashboard />} />
          <Route path="profit-loss" element={<ProfitLossDashboard />} />
        </Routes>
      </div>
    </Layout>
  );
}
