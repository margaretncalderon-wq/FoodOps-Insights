import { useNavigate, useLocation, Routes, Route } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useLanguage } from "../contexts/LanguageContext";
import { useModules } from "../contexts/ModulesContext";
import { Layout } from "../components/Layout";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { API_BASE as API } from "../utils/api";
import { 
  Package, ShoppingCart, Truck, Boxes, FileText, Image, Archive,
  Briefcase, Users, Clock, FolderOpen, PackageCheck, LayoutTemplate, CalendarClock, BarChart3, Sparkles,
  ChevronDown
} from "lucide-react";

// Import all operations components
import { InventorySection } from "../components/operations/InventorySection";
import { PurchasingSection } from "../components/operations/PurchasingSection";
import { CheckInOutSection } from "../components/operations/CheckInOutSection";
import { AssetCountSection } from "../components/operations/AssetCountSection";
import { AgreementsSection } from "../components/operations/AgreementsSection";
import { GallerySection } from "../components/operations/GallerySection";
import { EventPackingSection } from "../components/operations/EventPackingSection";
import { PackingTemplatesSection } from "../components/operations/PackingTemplatesSection";
import { UpcomingCommitmentsSection } from "../components/operations/UpcomingCommitmentsSection";
import { UtilizationReportSection } from "../components/operations/UtilizationReportSection";
import { SmartRecommendationsSection } from "../components/operations/SmartRecommendationsSection";

export default function OperationsSuppliesPage() {
  const { language } = useLanguage();
  const { isEventsIndustry, isProfessionalServices, isConsulting, industryConfig } = useModules();
  const navigate = useNavigate();
  const location = useLocation();
  const isEs = language === "es";
  
  // Get module config for Resource Management based on industry
  const moduleConfig = useMemo(() => {
    const modules = industryConfig?.modules || {};
    return modules.module_operations_supplies || {};
  }, [industryConfig]);
  
  // Dynamic module name based on industry
  const moduleName = isEs 
    ? (moduleConfig.name_es || "Gestión de Recursos")
    : (moduleConfig.name_en || "Resource Management");
  
  // Dynamic description based on industry
  const moduleDescription = useMemo(() => {
    if (isEventsIndustry) {
      return isEs 
        ? "Equipo, suministros e inventario para eventos" 
        : "Equipment, supplies, and inventory for events";
    }
    // Generic/other industries
    return isEs 
      ? "Gestión de recursos, activos e inventario" 
      : "Resource, asset, and inventory management";
  }, [isEventsIndustry, isEs]);
  
  // Define tabs based on industry
  // Events/Hospitality: Full inventory, purchasing, delivery notes, asset count, agreements, gallery
  // Generic: Inventory, purchasing, asset count, agreements
  const allTabs = [
    { 
      id: "inventory", 
      path: "/ops-supplies/inventory", 
      label: isEs ? "Inventario" : "Inventory", 
      icon: Package,
      industries: ["all"] // Available to all industries
    },
    { 
      id: "purchasing", 
      path: "/ops-supplies/purchasing", 
      label: isEs ? "Compras" : "Purchasing", 
      icon: ShoppingCart,
      industries: ["all"]
    },
    { 
      id: "checkin", 
      path: "/ops-supplies/checkin", 
      label: isEs ? "Conduces" : "Delivery Notes", 
      icon: Truck,
      industries: ["all"]
    },
    { 
      id: "event-packing", 
      path: "/ops-supplies/event-packing", 
      label: isEs ? "Packing List" : "Packing List", 
      icon: PackageCheck,
      industries: ["all"]
    },
    { 
      id: "packing-templates", 
      path: "/ops-supplies/packing-templates", 
      label: isEs ? "Plantillas" : "Templates", 
      icon: LayoutTemplate,
      industries: ["all"]
    },
    { 
      id: "upcoming", 
      path: "/ops-supplies/upcoming", 
      label: isEs ? "Próximos 14d" : "Next 14d", 
      icon: CalendarClock,
      industries: ["all"]
    },
    { 
      id: "utilization", 
      path: "/ops-supplies/utilization", 
      label: isEs ? "Utilización" : "Utilization", 
      icon: BarChart3,
      industries: ["all"]
    },
    { 
      id: "recommendations", 
      path: "/ops-supplies/recommendations", 
      label: isEs ? "Recomendaciones AI" : "AI Recommendations", 
      icon: Sparkles,
      industries: ["all"]
    },
    { 
      id: "asset-count", 
      path: "/ops-supplies/asset-count", 
      label: isEs ? "Conteo de Activos" : "Asset Count", 
      icon: Boxes,
      industries: ["all"]
    },
    { 
      id: "agreements", 
      path: "/ops-supplies/agreements", 
      label: isEs ? "Contratos de Proveedores" : "Vendor Agreements", 
      icon: FileText,
      industries: ["all"]
    },
    { 
      id: "gallery", 
      path: "/ops-supplies/gallery", 
      label: isEs ? "Galería de Activos" : "Asset Gallery", 
      icon: Image,
      industries: ["all"]
    },
    { 
      id: "maintenance", 
      path: "/ops-supplies/maintenance", 
      label: isEs ? "Mantenimiento" : "Maintenance", 
      icon: Archive, 
      disabled: true, 
      badge: "v2",
      industries: ["all"]
    },
  ];
  
  // Filter tabs based on current industry
  const tabs = useMemo(() => {
    return allTabs.filter(tab => {
      if (tab.industries.includes("all")) return true;
      if (isEventsIndustry && (tab.industries.includes("events") || tab.industries.includes("events_hospitality"))) return true;
      if (tab.industries.includes("generic") && !isProfessionalServices && !isConsulting) return true;
      return false;
    });
  }, [isEventsIndustry, isProfessionalServices, isConsulting]);

  const currentTab = tabs.find(t => location.pathname.startsWith(t.path))?.id || "inventory";
  const tabById = (id) => tabs.find(t => t.id === id);

  // Group visible tabs into semantic clusters so the nav bar doesn't overflow
  // horizontally on wider tenants (11+ tabs). Only the tabs that pass the
  // industry filter are shown.
  const visibleIds = new Set(tabs.map(t => t.id));
  const groups = [
    { id: "inventory",      items: ["inventory"] },
    { id: "logistics",      label: isEs ? "Compras y Logística" : "Purchasing & Logistics", items: ["purchasing", "checkin", "event-packing"] },
    { id: "planning",       label: isEs ? "Planificación" : "Planning", items: ["packing-templates", "upcoming"] },
    { id: "insights",       label: isEs ? "Análisis" : "Insights", items: ["utilization", "recommendations"] },
    { id: "assets-admin",   label: isEs ? "Activos y Contratos" : "Assets & Contracts", items: ["asset-count", "agreements", "gallery"] },
  ].map(g => ({ ...g, items: g.items.map(id => tabById(id)).filter(Boolean).filter(t => visibleIds.has(t.id)) }))
   .filter(g => g.items.length > 0);

  // Determine which group is currently active (for highlighting)
  const activeGroupId = groups.find(g => g.items.some(t => t.id === currentTab))?.id;

  // Fetch aggregated nav-badges once for the whole page (Sprint M).
  const [navBadges, setNavBadges] = useState({});
  useEffect(() => {
    axios
      .get(`${API}/api/inventory/nav-badges`, { withCredentials: true })
      .then((r) => setNavBadges(r.data || {}))
      .catch(() => setNavBadges({}));
    // Refetch when route changes so counts update after an action
  }, [location.pathname]);

  const groupBadge = (groupId) => {
    const key = { logistics: "logistics", planning: "planning", insights: "insights", "assets-admin": "assets" }[groupId];
    return navBadges[key];
  };

  return (
    <Layout>
      <div className="space-y-6" data-testid="resource-management-page">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{moduleName}</h1>
            <p className="text-sm text-muted-foreground">
              {moduleDescription}
            </p>
          </div>
        </div>

        {/* Navigation — grouped nav to prevent overflow with 11+ tabs */}
        <div className="border-b">
          <nav className="flex gap-1 flex-wrap pb-px" data-testid="resource-nav">
            {groups.map(group => {
              // Single-item groups render as plain tab
              if (group.items.length === 1) {
                const tab = group.items[0];
                const isActive = currentTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => !tab.disabled && navigate(tab.path)}
                    disabled={tab.disabled}
                    data-testid={`tab-${tab.id}`}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      isActive 
                        ? "border-indigo-600 text-indigo-600" 
                        : tab.disabled
                          ? "border-transparent text-muted-foreground/50 cursor-not-allowed"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                    {tab.badge && (
                      <Badge variant="outline" className="text-xs ml-1">{tab.badge}</Badge>
                    )}
                  </button>
                );
              }
              // Multi-item groups render as dropdown menu
              const isActive = activeGroupId === group.id;
              const activeChild = group.items.find(t => t.id === currentTab);
              const badge = groupBadge(group.id);
              const badgeTone = badge?.tone;
              return (
                <DropdownMenu key={group.id}>
                  <DropdownMenuTrigger asChild>
                    <button
                      data-testid={`nav-group-${group.id}`}
                      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                        isActive
                          ? "border-indigo-600 text-indigo-600"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                      }`}
                    >
                      <span>{group.label}</span>
                      {activeChild && (
                        <span className="text-xs opacity-70">· {activeChild.label}</span>
                      )}
                      {badge?.total > 0 && (
                        <span
                          data-testid={`nav-badge-${group.id}`}
                          className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-semibold rounded-full ${
                            badgeTone === "red"
                              ? "bg-red-100 text-red-700 border border-red-200"
                              : "bg-amber-100 text-amber-700 border border-amber-200"
                          }`}
                          title={
                            badgeTone === "red"
                              ? (isEs ? "Requiere atención" : "Needs attention")
                              : (isEs ? "Revisar" : "Review")
                          }
                        >
                          {badge.total}
                        </span>
                      )}
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[240px]">
                    {group.items.map(tab => (
                      <DropdownMenuItem
                        key={tab.id}
                        disabled={tab.disabled}
                        onClick={() => !tab.disabled && navigate(tab.path)}
                        data-testid={`tab-${tab.id}`}
                        className={currentTab === tab.id ? "bg-indigo-50 text-indigo-700 focus:bg-indigo-50 focus:text-indigo-700" : ""}
                      >
                        <tab.icon className="w-4 h-4 mr-2" />
                        <span className="flex-1">{tab.label}</span>
                        {tab.badge && (
                          <Badge variant="outline" className="text-xs ml-2">{tab.badge}</Badge>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </nav>
        </div>

        {/* Routes */}
        <Routes>
          <Route path="/" element={<InventorySection />} />
          <Route path="/inventory" element={<InventorySection />} />
          <Route path="/purchasing" element={<PurchasingSection />} />
          <Route path="/checkin" element={<CheckInOutSection />} />
          <Route path="/event-packing" element={<EventPackingSection />} />
          <Route path="/packing-templates" element={<PackingTemplatesSection />} />
          <Route path="/upcoming" element={<UpcomingCommitmentsSection />} />
          <Route path="/utilization" element={<UtilizationReportSection />} />
          <Route path="/recommendations" element={<SmartRecommendationsSection />} />
          <Route path="/asset-count" element={<AssetCountSection />} />
          <Route path="/agreements" element={<AgreementsSection />} />
          <Route path="/gallery" element={<GallerySection />} />
          <Route path="/maintenance" element={<div className="text-center py-12 text-muted-foreground">Coming in v2</div>} />
        </Routes>
      </div>
    </Layout>
  );
}
