import { useNavigate, useLocation, Routes, Route } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { Layout } from "../components/Layout";
import { Badge } from "../components/ui/badge";
import { 
  Package, ShoppingCart, Truck, Boxes, FileText, Image, Archive
} from "lucide-react";

// Import all operations components
import { InventorySection } from "../components/operations/InventorySection";
import { PurchasingSection } from "../components/operations/PurchasingSection";
import { CheckInOutSection } from "../components/operations/CheckInOutSection";
import { AssetCountSection } from "../components/operations/AssetCountSection";
import { AgreementsSection } from "../components/operations/AgreementsSection";
import { GallerySection } from "../components/operations/GallerySection";

export default function OperationsSuppliesPage() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  
  const tabs = [
    { id: "inventory", path: "/ops-supplies/inventory", label: language === "es" ? "Inventario" : "Inventory", icon: Package },
    { id: "purchasing", path: "/ops-supplies/purchasing", label: language === "es" ? "Compras" : "Purchasing", icon: ShoppingCart },
    { id: "checkin", path: "/ops-supplies/checkin", label: language === "es" ? "Conduces" : "Delivery Notes", icon: Truck },
    { id: "asset-count", path: "/ops-supplies/asset-count", label: language === "es" ? "Conteo de Activos" : "Asset Count", icon: Boxes },
    { id: "agreements", path: "/ops-supplies/agreements", label: language === "es" ? "Contratos" : "Agreements", icon: FileText },
    { id: "gallery", path: "/ops-supplies/gallery", label: language === "es" ? "Galería" : "Gallery", icon: Image },
    { id: "maintenance", path: "/ops-supplies/maintenance", label: language === "es" ? "Mantenimiento" : "Maintenance", icon: Archive, disabled: true, badge: "v2" },
  ];

  const currentTab = tabs.find(t => location.pathname.startsWith(t.path))?.id || "inventory";

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Operations Supplies</h1>
            <p className="text-sm text-muted-foreground">
              {language === "es" 
                ? "Equipo, desechables y suministros para eventos" 
                : "Equipment, disposables, and event supplies"}
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
          <Route path="/asset-count" element={<AssetCountSection />} />
          <Route path="/agreements" element={<AgreementsSection />} />
          <Route path="/gallery" element={<GallerySection />} />
          <Route path="/maintenance" element={<div className="text-center py-12 text-muted-foreground">Coming in v2</div>} />
        </Routes>
      </div>
    </Layout>
  );
}
