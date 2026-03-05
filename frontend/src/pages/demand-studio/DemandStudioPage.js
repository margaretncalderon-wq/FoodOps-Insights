import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { Layout } from "../../components/Layout";
import { useLanguage } from "../../contexts/LanguageContext";
import { 
  Megaphone, LayoutDashboard, Target, Zap, Mail, 
  Receipt, BarChart3, Settings, Hash, FileText,
  Building2, ChevronDown, Check, Loader2, Send
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Badge } from "../../components/ui/badge";

const API = process.env.REACT_APP_BACKEND_URL;

export default function DemandStudioPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const location = useLocation();
  const navigate = useNavigate();
  
  // Active tab state for navigation
  const [activeTab, setActiveTab] = useState("overview");
  
  // Organization state
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  
  // Section permissions
  const [sectionPermissions, setSectionPermissions] = useState(null);

  // Map paths to tab keys
  const pathToTab = {
    "/demand-studio": "overview",
    "/demand-studio/campaigns": "campaigns",
    "/demand-studio/activations": "activations",
    "/demand-studio/social-media": "social-media",
    "/demand-studio/email-marketing": "email-marketing",
    "/demand-studio/notes": "notes",
    "/demand-studio/spend-ledger": "spend-ledger",
    "/demand-studio/insights": "insights",
    "/demand-studio/settings": "settings"
  };

  // Section mapping for permissions
  const tabSectionMap = {
    "campaigns": "campaigns",
    "activations": "activations",
    "social-media": "social_media",
    "email-marketing": "email_marketing",
    "notes": "notes",
    "spend-ledger": "spend_ledger",
    "insights": "insights"
  };

  // Sync activeTab with current route
  useEffect(() => {
    const currentPath = location.pathname;
    const tab = pathToTab[currentPath] || "overview";
    setActiveTab(tab);
  }, [location.pathname]);

  // Check if section is visible based on permissions
  const isSectionVisible = (section) => {
    if (!section) return true;
    if (selectedOrg?.is_own || !sectionPermissions) return true;
    return sectionPermissions[section]?.enabled !== false;
  };

  // Check if section is writable
  const canWriteSection = (section) => {
    if (!section) return true;
    if (selectedOrg?.is_own || !sectionPermissions) return true;
    return sectionPermissions[section]?.can_write !== false;
  };

  // Handle tab change with navigation
  const handleTabChange = (tabKey, path) => {
    setActiveTab(tabKey);
    navigate(path);
  };

  // Check if tab group contains active tab
  const isGroupActive = (tabs) => tabs.includes(activeTab);

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

  // Fetch permissions when org changes
  useEffect(() => {
    const fetchPermissions = async () => {
      if (!selectedOrgId) return;
      
      try {
        const url = selectedOrg?.is_own 
          ? `${API}/api/demand-studio/my-permissions`
          : `${API}/api/demand-studio/my-permissions?org_id=${selectedOrgId}`;
        const res = await axios.get(url, { withCredentials: true });
        setSectionPermissions(res.data?.sections || null);
      } catch (error) {
        console.error("Error fetching permissions:", error);
        // Default to full access on error
        setSectionPermissions(null);
      }
    };
    fetchPermissions();
  }, [selectedOrgId, selectedOrg?.is_own]);

  // Handle org change
  const handleOrgChange = (orgId) => {
    const org = organizations.find(o => o.org_id === orgId);
    if (org) {
      setSelectedOrgId(orgId);
      setSelectedOrg(org);
      localStorage.setItem("demandStudio_selectedOrgId", orgId);
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

        {/* Navigation with Dropdowns - consistent with Settings and Business Clarity */}
        <div className="border-b">
          <nav className="flex gap-1 overflow-x-auto pb-px">
            {/* Overview - Direct Tab */}
            <button
              onClick={() => handleTabChange("overview", "/demand-studio")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === "overview"
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
              }`}
              data-testid="nav-overview"
            >
              <LayoutDashboard className="w-4 h-4" />
              {isEs ? "Resumen" : "Overview"}
            </button>

            {/* Planning Dropdown */}
            {(isSectionVisible("campaigns") || isSectionVisible("activations")) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button 
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      isGroupActive(["campaigns", "activations"])
                        ? "border-purple-600 text-purple-600"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                    }`}
                    data-testid="nav-planning-dropdown"
                  >
                    <Target className="w-4 h-4" />
                    {isEs ? "Planificación" : "Planning"}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {isSectionVisible("campaigns") && (
                    <DropdownMenuItem 
                      onClick={() => handleTabChange("campaigns", "/demand-studio/campaigns")}
                      className={activeTab === "campaigns" ? "bg-purple-50 text-purple-700" : ""}
                      data-testid="nav-campaigns"
                    >
                      <Target className="w-4 h-4 mr-2" />
                      {isEs ? "Campañas" : "Campaigns"}
                      {!canWriteSection("campaigns") && <span className="ml-auto text-xs text-muted-foreground">👁</span>}
                    </DropdownMenuItem>
                  )}
                  {isSectionVisible("activations") && (
                    <DropdownMenuItem 
                      onClick={() => handleTabChange("activations", "/demand-studio/activations")}
                      className={activeTab === "activations" ? "bg-purple-50 text-purple-700" : ""}
                      data-testid="nav-activations"
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      {isEs ? "Activaciones" : "Activations"}
                      {!canWriteSection("activations") && <span className="ml-auto text-xs text-muted-foreground">👁</span>}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Channels Dropdown (Social & Email) */}
            {(isSectionVisible("social_media") || isSectionVisible("email_marketing")) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button 
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      isGroupActive(["social-media", "email-marketing"])
                        ? "border-purple-600 text-purple-600"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                    }`}
                    data-testid="nav-channels-dropdown"
                  >
                    <Send className="w-4 h-4" />
                    {isEs ? "Canales" : "Channels"}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {isSectionVisible("social_media") && (
                    <DropdownMenuItem 
                      onClick={() => handleTabChange("social-media", "/demand-studio/social-media")}
                      className={activeTab === "social-media" ? "bg-purple-50 text-purple-700" : ""}
                      data-testid="nav-social-media"
                    >
                      <Hash className="w-4 h-4 mr-2" />
                      Social Media
                      {!canWriteSection("social_media") && <span className="ml-auto text-xs text-muted-foreground">👁</span>}
                    </DropdownMenuItem>
                  )}
                  {isSectionVisible("email_marketing") && (
                    <DropdownMenuItem 
                      onClick={() => handleTabChange("email-marketing", "/demand-studio/email-marketing")}
                      className={activeTab === "email-marketing" ? "bg-purple-50 text-purple-700" : ""}
                      data-testid="nav-email-marketing"
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Email Marketing
                      {!canWriteSection("email_marketing") && <span className="ml-auto text-xs text-muted-foreground">👁</span>}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Content - Notes Direct Tab */}
            {isSectionVisible("notes") && (
              <button
                onClick={() => handleTabChange("notes", "/demand-studio/notes")}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === "notes"
                    ? "border-purple-600 text-purple-600"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                }`}
                data-testid="nav-notes"
              >
                <FileText className="w-4 h-4" />
                {isEs ? "Notas" : "Notes"}
                {!canWriteSection("notes") && <span className="ml-1 text-xs text-muted-foreground">👁</span>}
              </button>
            )}

            {/* Analytics Dropdown */}
            {(isSectionVisible("spend_ledger") || isSectionVisible("insights")) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button 
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      isGroupActive(["spend-ledger", "insights"])
                        ? "border-purple-600 text-purple-600"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                    }`}
                    data-testid="nav-analytics-dropdown"
                  >
                    <BarChart3 className="w-4 h-4" />
                    {isEs ? "Análisis" : "Analytics"}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {isSectionVisible("spend_ledger") && (
                    <DropdownMenuItem 
                      onClick={() => handleTabChange("spend-ledger", "/demand-studio/spend-ledger")}
                      className={activeTab === "spend-ledger" ? "bg-purple-50 text-purple-700" : ""}
                      data-testid="nav-spend-ledger"
                    >
                      <Receipt className="w-4 h-4 mr-2" />
                      {isEs ? "Libro de Gastos" : "Spend Ledger"}
                      {!canWriteSection("spend_ledger") && <span className="ml-auto text-xs text-muted-foreground">👁</span>}
                    </DropdownMenuItem>
                  )}
                  {isSectionVisible("insights") && (
                    <DropdownMenuItem 
                      onClick={() => handleTabChange("insights", "/demand-studio/insights")}
                      className={activeTab === "insights" ? "bg-purple-50 text-purple-700" : ""}
                      data-testid="nav-insights"
                    >
                      <BarChart3 className="w-4 h-4 mr-2" />
                      Insights
                      {!canWriteSection("insights") && <span className="ml-auto text-xs text-muted-foreground">👁</span>}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Settings - Direct Tab */}
            <button
              onClick={() => handleTabChange("settings", "/demand-studio/settings")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === "settings"
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
              }`}
              data-testid="nav-settings"
            >
              <Settings className="w-4 h-4" />
              {isEs ? "Configuración" : "Settings"}
            </button>
          </nav>
        </div>

        {/* Content - Pass org context and permissions to children */}
        <Outlet context={{ 
          selectedOrgId, 
          selectedOrg, 
          isOwnOrg: selectedOrg?.is_own,
          sectionPermissions 
        }} />
      </div>
    </Layout>
  );
}
