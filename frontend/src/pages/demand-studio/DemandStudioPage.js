import { useState, useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import axios from "axios";
import { Layout } from "../../components/Layout";
import { useLanguage } from "../../contexts/LanguageContext";
import { 
  Megaphone, LayoutDashboard, Target, Zap, Mail, 
  Receipt, BarChart3, Settings, ChevronRight, Hash, FileText,
  Building2, ChevronDown, Check, Loader2
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";

const API = process.env.REACT_APP_BACKEND_URL;

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
  
  // Organization state
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [loadingOrgs, setLoadingOrgs] = useState(true);

  // Fetch user's organizations
  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        const res = await axios.get(`${API}/api/user/organizations`, { withCredentials: true });
        const orgs = res.data || [];
        setOrganizations(orgs);
        
        // Restore from localStorage or default to first owned org
        const savedOrgId = localStorage.getItem("demandStudio_selectedOrgId");
        if (savedOrgId && orgs.find(o => o.org_id === savedOrgId)) {
          const org = orgs.find(o => o.org_id === savedOrgId);
          setSelectedOrgId(savedOrgId);
          setSelectedOrg(org);
        } else if (orgs.length > 0) {
          const ownedOrg = orgs.find(o => o.is_own) || orgs[0];
          setSelectedOrgId(ownedOrg.org_id);
          setSelectedOrg(ownedOrg);
        }
      } catch (error) {
        console.error("Error fetching organizations:", error);
      } finally {
        setLoadingOrgs(false);
      }
    };
    fetchOrganizations();
  }, []);

  // Handle org change
  const handleOrgChange = (orgId) => {
    const org = organizations.find(o => o.org_id === orgId);
    if (org) {
      setSelectedOrgId(orgId);
      setSelectedOrg(org);
      localStorage.setItem("demandStudio_selectedOrgId", orgId);
      // No reload needed - child components will react to context change
    }
  };

  // Separate owned and shared orgs
  const ownedOrgs = organizations.filter(o => o.is_own);
  const sharedOrgs = organizations.filter(o => !o.is_own);

  return (
    <Layout>
      <div className="space-y-6" data-testid="demand-studio-page">
        {/* Header with Organization Selector */}
        <div className="flex items-center justify-between flex-wrap gap-4">
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
          
          {/* Organization Selector */}
          {organizations.length > 0 && (
            <div className="flex items-center gap-2" data-testid="org-selector-container">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {isEs ? "Viendo:" : "Viewing:"}
              </span>
              {loadingOrgs ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Select value={selectedOrgId || ""} onValueChange={handleOrgChange}>
                  <SelectTrigger className="w-56" data-testid="org-selector-trigger">
                    <SelectValue>
                      {selectedOrg ? (
                        <div className="flex items-center gap-2">
                          <span className="truncate">{selectedOrg.name}</span>
                          {!selectedOrg.is_own && (
                            <Badge variant="secondary" className="text-[10px]">
                              {selectedOrg.role === "editor" ? (isEs ? "Editor" : "Editor") : 
                               selectedOrg.role === "viewer" ? (isEs ? "Ver" : "View") : 
                               selectedOrg.role}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        isEs ? "Selecciona empresa" : "Select company"
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {/* Owned organizations */}
                    {ownedOrgs.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          {isEs ? "Mis Empresas" : "My Companies"}
                        </div>
                        {ownedOrgs.map(org => (
                          <SelectItem key={org.org_id} value={org.org_id} data-testid={`org-option-${org.org_id}`}>
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4" />
                              <span>{org.name}</span>
                              {selectedOrgId === org.org_id && (
                                <Check className="w-3 h-3 text-primary ml-auto" />
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </>
                    )}
                    
                    {/* Shared organizations */}
                    {sharedOrgs.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
                          {isEs ? "Compartidas Conmigo" : "Shared With Me"}
                        </div>
                        {sharedOrgs.map(org => (
                          <SelectItem key={org.org_id} value={org.org_id} data-testid={`org-option-shared-${org.org_id}`}>
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-blue-500" />
                              <span>{org.name}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {org.role === "editor" ? (isEs ? "Editor" : "Editor") : 
                                 org.role === "admin" ? "Admin" :
                                 (isEs ? "Ver" : "View")}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
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

        {/* Content - Pass org context to children */}
        <Outlet context={{ selectedOrgId, selectedOrg, isOwnOrg: selectedOrg?.is_own }} />
      </div>
    </Layout>
  );
}
