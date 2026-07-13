import { useNavigate, useLocation, Routes, Route } from "react-router-dom";
import { useMemo } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useModules } from "../contexts/ModulesContext";
import { Layout } from "../components/Layout";
import { Badge } from "../components/ui/badge";
import { 
  Package, ShoppingCart, Truck, Boxes, FileText, Image, Archive,
  Briefcase, Users, Clock, FolderOpen, PackageCheck, LayoutTemplate, CalendarClock, BarChart3, Sparkles
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

        {/* Navigation Tabs */}
        <div className="border-b">
          <nav className="flex gap-1 overflow-x-auto pb-px">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && navigate(tab.path)}
                disabled={tab.disabled}
                data-testid={`tab-${tab.id}`}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  currentTab === tab.id 
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
            ))}
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
