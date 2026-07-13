import { useEffect, useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
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
import { RecruitmentSection } from "../components/people-ops/RecruitmentSection";
import { OnboardingSection } from "../components/people-ops/OnboardingSection";
import { PerformanceSection } from "../components/people-ops/PerformanceSection";
import { OrgChartSection } from "../components/people-ops/OrgChartSection";
import { MonthEndClosingSection } from "../components/people-ops/MonthEndClosingSection";
import { TimeClockSection } from "../components/people-ops/TimeClockSection";
import { useCurrencyFormatter } from "../hooks/useCurrencyFormatter";

// Icons
import {
  Users, Wallet, Clock,
  Lock, Settings, Building2,
  Calendar, CreditCard, UserMinus, DollarSign, Gift, FileSpreadsheet, ExternalLink, ChevronDown,
  UserPlus, Target, Award
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

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
  const { formatCurrency } = useCurrencyFormatter();
  const isEs = language === "es";
  const location = useLocation();
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState(null);
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState("directory");

  // Map paths to tab keys
  const pathToTab = {
    "/people-ops/directory": "directory",
    "/people-ops/payroll": "payroll",
    "/people-ops/variable-pay": "variable-pay",
    "/people-ops/payroll-config": "payroll-config",
    "/people-ops/month-end": "month-end",
    "/people-ops/time-off": "time-off",
    "/people-ops/overtime": "overtime",
    "/people-ops/time-clock": "time-clock",
    "/people-ops/loans": "loans",
    "/people-ops/benefits": "benefits",
    "/people-ops/offboarding": "offboarding",
    "/people-ops/recruitment": "recruitment",
    "/people-ops/onboarding": "onboarding",
    "/people-ops/performance": "performance"
  };

  // Sync activeTab with current route
  useEffect(() => {
    const currentPath = location.pathname;
    // Handle employee profile paths
    if (currentPath.includes("/employee/")) {
      setActiveTab("directory");
    } else if (currentPath.includes("/payroll/")) {
      setActiveTab("payroll");
    } else {
      const tab = pathToTab[currentPath] || "directory";
      setActiveTab(tab);
    }
  }, [location.pathname]);

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
  const hasPayrollAccess = hasAccessToPage("payroll");

  // Handle tab change with navigation
  const handleTabChange = (tabKey, path) => {
    setActiveTab(tabKey);
    navigate(path);
  };

  // Check if tab group contains active tab
  const isGroupActive = (tabs) => tabs.includes(activeTab);

  // Labels for each tab key — used to render the active child inline
  // next to the group label on the dropdown trigger (e.g., "Payroll · Periods").
  const tabLabels = {
    payroll: isEs ? "Períodos" : "Periods",
    "variable-pay": isEs ? "Pago Variable" : "Variable Pay",
    "payroll-config": isEs ? "Configuración" : "Config",
    "month-end": isEs ? "Cierre de Mes" : "Month-End",
    "time-off": isEs ? "Ausencias" : "Time Off",
    overtime: isEs ? "Horas Extra" : "Overtime",
    "time-clock": isEs ? "Reloj Checador" : "Time Clock",
    loans: isEs ? "Préstamos" : "Loans",
    benefits: isEs ? "Beneficios" : "Benefits",
    recruitment: isEs ? "Reclutamiento" : "Recruitment",
    onboarding: "Onboarding",
    performance: isEs ? "Desempeño" : "Performance",
  };
  const activeChildFor = (keys) => {
    const k = keys.find((x) => x === activeTab);
    return k ? tabLabels[k] : null;
  };

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
                    <p className="text-lg font-bold">{formatCurrency(stats.total_monthly_payroll)}</p>
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

        {/* Navigation with Dropdowns */}
        <div className="border-b">
          <nav className="flex gap-1 overflow-x-auto pb-px">
            {/* Directory - Direct Tab */}
            <button
              onClick={() => handleTabChange("directory", "/people-ops/directory")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === "directory"
                  ? "border-violet-600 text-violet-600"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
              }`}
              data-testid="nav-directory"
            >
              <Users className="w-4 h-4" />
              {isEs ? "Directorio" : "Directory"}
            </button>

            {/* Org Chart Tab */}
            <button
              onClick={() => handleTabChange("org-chart", "/people-ops/org-chart")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === "org-chart"
                  ? "border-violet-600 text-violet-600"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
              }`}
              data-testid="nav-org-chart"
            >
              <Building2 className="w-4 h-4" />
              {isEs ? "Organigrama" : "Org Chart"}
            </button>

            {/* Payroll Dropdown */}
            {hasPayrollAccess && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button 
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      isGroupActive(["payroll", "variable-pay", "payroll-config", "month-end"])
                        ? "border-violet-600 text-violet-600"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                    }`}
                    data-testid="nav-payroll-dropdown"
                  >
                    <Wallet className="w-4 h-4" />
                    <span>{isEs ? "Nómina" : "Payroll"}</span>
                    {activeChildFor(["payroll", "variable-pay", "payroll-config", "month-end"]) && (
                      <span className="text-xs opacity-70">· {activeChildFor(["payroll", "variable-pay", "payroll-config", "month-end"])}</span>
                    )}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem 
                    onClick={() => handleTabChange("payroll", "/people-ops/payroll")}
                    className={activeTab === "payroll" ? "bg-violet-50 text-violet-700" : ""}
                  >
                    <Wallet className="w-4 h-4 mr-2" />
                    {isEs ? "Períodos" : "Periods"}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleTabChange("variable-pay", "/people-ops/variable-pay")}
                    className={activeTab === "variable-pay" ? "bg-violet-50 text-violet-700" : ""}
                  >
                    <DollarSign className="w-4 h-4 mr-2" />
                    {isEs ? "Pago Variable" : "Variable Pay"}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleTabChange("payroll-config", "/people-ops/payroll-config")}
                    className={activeTab === "payroll-config" ? "bg-violet-50 text-violet-700" : ""}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    {isEs ? "Configuración" : "Config"}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleTabChange("month-end", "/people-ops/month-end")}
                    className={activeTab === "month-end" ? "bg-violet-50 text-violet-700" : ""}
                    data-testid="nav-month-end"
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    {isEs ? "Cierre de Mes" : "Month-End Closing"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Time & Attendance Dropdown */}
            {hasPayrollAccess && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button 
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      isGroupActive(["time-off", "overtime", "time-clock"])
                        ? "border-violet-600 text-violet-600"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                    }`}
                    data-testid="nav-time-dropdown"
                  >
                    <Clock className="w-4 h-4" />
                    <span>{isEs ? "Tiempo" : "Time"}</span>
                    {activeChildFor(["time-off", "overtime", "time-clock"]) && (
                      <span className="text-xs opacity-70">· {activeChildFor(["time-off", "overtime", "time-clock"])}</span>
                    )}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem 
                    onClick={() => handleTabChange("time-off", "/people-ops/time-off")}
                    className={activeTab === "time-off" ? "bg-violet-50 text-violet-700" : ""}
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    {isEs ? "Ausencias" : "Time Off"}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleTabChange("overtime", "/people-ops/overtime")}
                    className={activeTab === "overtime" ? "bg-violet-50 text-violet-700" : ""}
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    {isEs ? "Horas Extra" : "Overtime"}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleTabChange("time-clock", "/people-ops/time-clock")}
                    className={activeTab === "time-clock" ? "bg-violet-50 text-violet-700" : ""}
                    data-testid="nav-time-clock"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    {isEs ? "Reloj Checador" : "Time Clock"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Benefits Dropdown */}
            {hasPayrollAccess && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button 
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      isGroupActive(["loans", "benefits"])
                        ? "border-violet-600 text-violet-600"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                    }`}
                    data-testid="nav-benefits-dropdown"
                  >
                    <Gift className="w-4 h-4" />
                    <span>{isEs ? "Beneficios" : "Benefits"}</span>
                    {activeChildFor(["loans", "benefits"]) && (
                      <span className="text-xs opacity-70">· {activeChildFor(["loans", "benefits"])}</span>
                    )}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem 
                    onClick={() => handleTabChange("loans", "/people-ops/loans")}
                    className={activeTab === "loans" ? "bg-violet-50 text-violet-700" : ""}
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    {isEs ? "Préstamos" : "Loans"}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleTabChange("benefits", "/people-ops/benefits")}
                    className={activeTab === "benefits" ? "bg-violet-50 text-violet-700" : ""}
                  >
                    <Gift className="w-4 h-4 mr-2" />
                    {isEs ? "En Especie" : "In-Kind"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Offboarding - Direct Tab */}
            {hasPayrollAccess && (
              <button
                onClick={() => handleTabChange("offboarding", "/people-ops/offboarding")}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === "offboarding"
                    ? "border-violet-600 text-violet-600"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                }`}
                data-testid="nav-offboarding"
              >
                <UserMinus className="w-4 h-4" />
                {isEs ? "Salidas" : "Offboarding"}
              </button>
            )}

            {/* Talent Dropdown - Recruitment, Onboarding, Performance */}
            {hasPayrollAccess && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button 
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      isGroupActive(["recruitment", "onboarding", "performance"])
                        ? "border-violet-600 text-violet-600"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                    }`}
                    data-testid="nav-talent-dropdown"
                  >
                    <Award className="w-4 h-4" />
                    <span>{isEs ? "Talento" : "Talent"}</span>
                    {activeChildFor(["recruitment", "onboarding", "performance"]) && (
                      <span className="text-xs opacity-70">· {activeChildFor(["recruitment", "onboarding", "performance"])}</span>
                    )}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem 
                    onClick={() => handleTabChange("recruitment", "/people-ops/recruitment")}
                    className={activeTab === "recruitment" ? "bg-violet-50 text-violet-700" : ""}
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    {isEs ? "Reclutamiento" : "Recruitment"}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleTabChange("onboarding", "/people-ops/onboarding")}
                    className={activeTab === "onboarding" ? "bg-violet-50 text-violet-700" : ""}
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Onboarding
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleTabChange("performance", "/people-ops/performance")}
                    className={activeTab === "performance" ? "bg-violet-50 text-violet-700" : ""}
                  >
                    <Target className="w-4 h-4 mr-2" />
                    {isEs ? "Desempeño" : "Performance"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Reports - External Link */}
            {hasPayrollAccess && (
              <button
                onClick={() => navigate("/business-clarity/regulatory")}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-muted transition-colors whitespace-nowrap"
                data-testid="nav-reports"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {isEs ? "Reportes" : "Reports"}
                <ExternalLink className="w-3 h-3 opacity-50" />
              </button>
            )}
          </nav>
        </div>

        {/* Content */}
        <Routes>
          <Route index element={<Navigate to="directory" replace />} />
          <Route path="directory" element={<EmployeeDirectory />} />
          <Route path="org-chart" element={<OrgChartSection />} />
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
          <Route path="recruitment" element={<RecruitmentSection />} />
          <Route path="onboarding" element={<OnboardingSection />} />
          <Route path="performance" element={<PerformanceSection />} />
          <Route path="month-end" element={<MonthEndClosingSection />} />
          <Route path="time-clock" element={<TimeClockSection />} />
        </Routes>
      </div>
    </Layout>
  );
}
