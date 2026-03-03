import { useState, useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Layout } from "../../components/Layout";
import { useLanguage } from "../../contexts/LanguageContext";
import { 
  Megaphone, LayoutDashboard, Target, Zap, Mail, 
  Receipt, BarChart3, Settings, ChevronRight, Hash, FileText
} from "lucide-react";

const navTabs = [
  { path: "/demand-studio", label: "Overview", labelEs: "Resumen", icon: LayoutDashboard, end: true },
  { path: "/demand-studio/campaigns", label: "Campaigns", labelEs: "Campañas", icon: Target },
  { path: "/demand-studio/social-media", label: "Social Media", labelEs: "Social Media", icon: Hash },
  { path: "/demand-studio/notes", label: "Notes", labelEs: "Notas", icon: FileText },
  { path: "/demand-studio/activations", label: "Activations", labelEs: "Activaciones", icon: Zap },
  { path: "/demand-studio/email-marketing", label: "Email Marketing", labelEs: "Email Marketing", icon: Mail },
  { path: "/demand-studio/spend-ledger", label: "Spend Ledger", labelEs: "Libro de Gastos", icon: Receipt },
  { path: "/demand-studio/insights", label: "Insights", labelEs: "Insights", icon: BarChart3 },
  { path: "/demand-studio/settings", label: "Settings", labelEs: "Configuración", icon: Settings },
];

export default function DemandStudioPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const location = useLocation();

  return (
    <Layout>
      <div className="space-y-6" data-testid="demand-studio-page">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Demand Studio</h1>
            <p className="text-sm text-muted-foreground">
              {isEs ? "Marketing & Generación de Demanda" : "Marketing & Demand Generation"}
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="border-b">
          <nav className="flex gap-1 overflow-x-auto pb-px">
            {navTabs.map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                end={tab.end}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                  }`
                }
              >
                <tab.icon className="w-4 h-4" />
                {isEs ? tab.labelEs : tab.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Content */}
        <Outlet />
      </div>
    </Layout>
  );
}
