import { useEffect } from "react";
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
  UserCircle, Landmark, FileBarChart, ArrowLeft, Target, Lock
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function BusinessClarityPage() {
  const { language } = useLanguage();
  const isEs = language === "es";

  const sidebarNavItems = [
    { path: "/business-clarity/dashboard", label: isEs ? "Panel Ejecutivo" : "Executive Dashboard", icon: PieChart },
    { path: "/business-clarity/invoices", label: isEs ? "Facturas" : "Invoices", icon: FileText },
    { path: "/business-clarity/payments", label: isEs ? "Pagos Recibidos" : "Received Payments", icon: Banknote },
    { path: "/business-clarity/statements", label: isEs ? "Estados de Cuenta" : "Account Statements", icon: UserCircle },
    { path: "/business-clarity/receivables", label: isEs ? "Cuentas por Cobrar" : "Accounts Receivable", icon: TrendingUp },
    { path: "/business-clarity/payables", label: isEs ? "Cuentas por Pagar" : "Accounts Payable", icon: TrendingDown },
    { path: "/business-clarity/fixed-costs", label: isEs ? "Costos Fijos & Budget" : "Fixed Costs & Budget", icon: Target },
    { path: "/business-clarity/close", label: isEs ? "Cierre & Reconciliación" : "Close & Reconciliation", icon: Lock },
    { path: "/business-clarity/reports", label: isEs ? "Reportes Ejecutivos" : "Executive Reports", icon: FileBarChart },
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
    <div className="flex h-[calc(100vh-4rem)]" data-testid="business-clarity-page">
      {/* Sidebar Navigation */}
      <div className="w-64 border-r bg-muted/30 p-4 flex flex-col">
        <NavLink 
          to="/dashboard" 
          className="flex items-center gap-2 mb-4 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {isEs ? "Volver a System Pulse" : "Back to System Pulse"}
        </NavLink>
        
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Landmark className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-bold">Business Clarity</h2>
          </div>
          <p className="text-xs text-muted-foreground pl-8">
            {isEs 
              ? "Donde las finanzas dejan de ser números y se convierten en decisiones" 
              : "Where finances move from numbers to decisions"}
          </p>
        </div>

        <nav className="space-y-1 flex-1">
          {sidebarNavItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm ${
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "hover:bg-muted"
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
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
          <Route path="reports" element={<ReportsSection />} />
        </Routes>
      </div>
    </div>
  );
}
