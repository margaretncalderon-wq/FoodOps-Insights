import { useEffect, useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import axios from "axios";
import { Layout } from "../components/Layout";

// Section Components
import { EmployeeDirectory } from "../components/people-ops/EmployeeDirectory";
import { EmployeeProfile } from "../components/people-ops/EmployeeProfile";
import { PayrollSection } from "../components/people-ops/PayrollSection";
import { PayrollPeriodView } from "../components/people-ops/PayrollPeriodView";
import { PayrollConfigSection } from "../components/people-ops/PayrollConfigSection";
import { TimeOffSection } from "../components/people-ops/TimeOffSection";
import { OvertimeSection } from "../components/people-ops/OvertimeSection";
import { LoansSection } from "../components/people-ops/LoansSection";
import { OffboardingSection } from "../components/people-ops/OffboardingSection";
import { VariablePaySection } from "../components/people-ops/VariablePaySection";
import { BenefitsInKindSection } from "../components/people-ops/BenefitsInKindSection";
import { RegulatoryReportsSection } from "../components/people-ops/RegulatoryReportsSection";

// Icons
import {
  Users, UserCircle, Wallet, Clock,
  FileText, Lock, UserPlus, Settings,
  Calendar, CreditCard, UserMinus, DollarSign, Gift, FileSpreadsheet
} from "lucide-react";
import { Badge } from "../components/ui/badge";

import { API_BASE as API } from "../utils/api";

// Role-based permissions for People Ops
const PERMISSIONS = {
  full_access: {
    roles: ["owner", "admin", "hr"],
    pages: ["directory", "employee", "cost-centers", "payroll", "config"]
  },
  manager_access: {
    roles: ["manager"],
    pages: ["directory", "employee"]
  },
  self_service: {
    roles: ["viewer", "editor", "ops", "finance"],
    pages: ["my-profile"]
  }
};

export default function PeopleOpsPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const location = useLocation();
  const [userRole, setUserRole] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    // Get current user role
    axios.get(`${API}/api/auth/me`, { withCredentials: true })
      .then(res => setUserRole(res.data?.role || "viewer"))
      .catch(() => setUserRole("viewer"));
    
    // Get employee stats
    axios.get(`${API}/api/people-ops/employees/stats/summary`, { withCredentials: true })
      .then(res => setStats(res.data))
      .catch(() => {});
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

  const hasFullAccess = userRole && ["owner", "admin", "hr"].includes(userRole);

  // Navigation tabs
  const navTabs = [
    { 
      path: "/people-ops/directory", 
      label: isEs ? "Directorio" : "Directory", 
      icon: Users,
      requiresAccess: "directory"
    },
    { 
      path: "/people-ops/payroll", 
      label: isEs ? "Nómina" : "Payroll", 
      icon: Wallet,
      requiresAccess: "payroll"
    },
    { 
      path: "/people-ops/variable-pay", 
      label: isEs ? "Pago Variable" : "Variable Pay", 
      icon: DollarSign,
      requiresAccess: "payroll"
    },
    { 
      path: "/people-ops/time-off", 
      label: isEs ? "Ausencias" : "Time Off", 
      icon: Calendar,
      requiresAccess: "payroll"
    },
    { 
      path: "/people-ops/overtime", 
      label: isEs ? "Hrs Extra" : "Overtime", 
      icon: Clock,
      requiresAccess: "payroll"
    },
    { 
      path: "/people-ops/loans", 
      label: isEs ? "Préstamos" : "Loans", 
      icon: CreditCard,
      requiresAccess: "payroll"
    },
    { 
      path: "/people-ops/offboarding", 
      label: isEs ? "Salidas" : "Offboarding", 
      icon: UserMinus,
      requiresAccess: "payroll"
    },
    { 
      path: "/people-ops/benefits", 
      label: isEs ? "Beneficios" : "Benefits", 
      icon: Gift,
      requiresAccess: "payroll"
    },
    { 
      path: "/people-ops/reports", 
      label: isEs ? "Reportes" : "Reports", 
      icon: FileSpreadsheet,
      requiresAccess: "payroll"
    },
    { 
      path: "/people-ops/payroll-config", 
      label: isEs ? "Config" : "Config", 
      icon: Settings,
      requiresAccess: "config"
    },
  ];

  // Filter tabs based on access
  const visibleTabs = navTabs.filter(tab => 
    !tab.requiresAccess || hasAccessToPage(tab.requiresAccess)
  );

  return (
    <Layout>
      <div className="space-y-6" data-testid="people-ops-page">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">People Ops</h1>
              <p className="text-sm text-muted-foreground">
                {isEs ? "Gestión de equipo y nómina" : "Team management & payroll"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {stats && hasFullAccess && (
              <div className="flex items-center gap-4 text-sm">
                <div className="text-center">
                  <p className="text-2xl font-bold text-violet-600">{stats.active || 0}</p>
                  <p className="text-xs text-muted-foreground">{isEs ? "Activos" : "Active"}</p>
                </div>
                {stats.total_monthly_payroll && (
                  <div className="text-center border-l pl-4">
                    <p className="text-lg font-bold">${(stats.total_monthly_payroll || 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{isEs ? "Nómina Mensual" : "Monthly Payroll"}</p>
                  </div>
                )}
              </div>
            )}
            {userRole && (
              <Badge variant="outline" className="text-xs capitalize">{userRole}</Badge>
            )}
          </div>
        </div>

        {/* Access Restriction Banner */}
        {!hasFullAccess && userRole && (
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-600" />
            <p className="text-sm text-amber-800">
              {isEs 
                ? "Acceso limitado. Contacta a RRHH para ver más información."
                : "Limited access. Contact HR to view more information."}
            </p>
          </div>
        )}

        {/* Navigation Tabs */}
        {visibleTabs.length > 0 && (
          <div className="border-b">
            <nav className="flex gap-1 overflow-x-auto pb-px">
              {visibleTabs.map((tab) => (
                <NavLink
                  key={tab.path}
                  to={tab.path}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      isActive
                        ? "border-violet-600 text-violet-600"
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
        )}

        {/* Content */}
        <Routes>
          <Route index element={<Navigate to="directory" replace />} />
          <Route path="directory" element={<EmployeeDirectory />} />
          <Route path="employee/:employeeId" element={<EmployeeProfile />} />
          <Route path="payroll" element={<PayrollSection />} />
          <Route path="payroll/:periodId" element={<PayrollPeriodView />} />
          <Route path="payroll-config" element={<PayrollConfigSection />} />
          <Route path="variable-pay" element={<VariablePaySection />} />
          <Route path="time-off" element={<TimeOffSection />} />
          <Route path="overtime" element={<OvertimeSection />} />
          <Route path="loans" element={<LoansSection />} />
          <Route path="offboarding" element={<OffboardingSection />} />
          <Route path="benefits" element={<BenefitsInKindSection />} />
          <Route path="reports" element={<RegulatoryReportsSection />} />
        </Routes>
      </div>
    </Layout>
  );
}
