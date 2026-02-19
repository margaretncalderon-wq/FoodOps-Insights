import { useState, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useModules } from "../contexts/ModulesContext";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Activity,
  Users,
  Calendar,
  CalendarDays,
  ChefHat,
  Package,
  Settings,
  LogOut,
  Menu,
  X,
  Globe,
  UtensilsCrossed,
  Briefcase,
  Music4,
  Puzzle,
  Megaphone,
  Target,
  Building2,
  History,
  ClipboardList,
  ClipboardCheck,
  FolderKanban,
  MapPin,
} from "lucide-react";
import { OrgSwitcher } from "./org";
import { TrialExpirationModal } from "./TrialExpirationModal";
import NotificationBell from "./notifications/NotificationBell";
import { GlobalActivityLog } from "./GlobalActivityLog";

// Icon mapping for dynamic modules
const iconMap = {
  activity: Activity,
  puzzle: Puzzle,
  music: Music4,
  utensils: UtensilsCrossed,
  package: Package,
  building: Building2,
  target: Target,
  megaphone: Megaphone,
  briefcase: Briefcase,
  settings: Settings,
  // New icons for multi-industry support
  "clipboard-list": ClipboardList,
  "clipboard-check": ClipboardCheck,
  "folder-kanban": FolderKanban,
  "map-pin": MapPin,
  "boxes": Package,
};

// Fallback nav items (used if modules API fails)
const fallbackNavItems = [
  { path: "/dashboard", icon: Activity, labelKey: "systemPulse" },
  { path: "/client-engagement", icon: Puzzle, label: "Client Engagement", labelEs: "Client Engagement" },
  { path: "/event-orchestration", icon: ClipboardList, label: "Event Orchestration", labelEs: "Event Orchestration" },
  { path: "/food-ops", icon: UtensilsCrossed, label: "Culinary Intelligence", labelEs: "Inteligencia Culinaria" },
  { path: "/ops-supplies", icon: Package, label: "Operations Supplies", labelEs: "Operations Supplies" },
  { path: "/venues", icon: Building2, labelKey: "venues" },
  { path: "/execution-hub", icon: Target, label: "Execution Hub", labelEs: "Execution Hub" },
  { path: "/demand-studio", icon: Megaphone, label: "Demand Studio", labelEs: "Demand Studio" },
  { path: "/business-clarity", icon: Briefcase, label: "Business Clarity", labelEs: "Business Clarity" },
  { path: "/settings", icon: Settings, labelKey: "settings" },
];

export const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const { t, language, changeLanguage } = useLanguage();
  const { modules, loading: modulesLoading } = useModules();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Build navigation items from enabled modules
  const navItems = useMemo(() => {
    if (!modules || modules.length === 0) {
      return fallbackNavItems;
    }

    return modules.map((module) => ({
      path: module.path,
      icon: iconMap[module.icon] || Activity,
      label: module.name_en,
      labelEs: module.name_es,
      isAddon: module.is_addon,
    }));
  }, [modules]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const isActive = (path) => location.pathname.startsWith(path);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-64 bg-[#2A2F3A] text-white z-50">
        {/* Logo */}
        <div className="p-6 border-b border-white/10">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center">
              <img src="/favicon.png" alt="Kora" className="w-8 h-8" />
            </div>
            <div>
              <h1 className="font-heading text-lg font-semibold text-white">Kora OS</h1>
              <p className="text-xs text-[#AED768]/80">Designed for clarity</p>
            </div>
          </Link>
          {/* Organization Switcher */}
          <div className="mt-4">
            <OrgSwitcher />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            const displayLabel = item.labelKey 
              ? t(item.labelKey) 
              : (language === "es" && item.labelEs ? item.labelEs : item.label);
            return (
              <Link
                key={item.path}
                to={item.path}
                data-testid={`nav-${item.labelKey || item.path.replace('/', '')}`}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                  active
                    ? "bg-[#AED768] text-[#1F2937]"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={1.5} />
                <span className="font-medium">{displayLabel}</span>
              </Link>
            );
          })}
        </nav>

        {/* Notifications & Activity Log Section */}
        <div className="p-4 border-t border-white/10">
          {/* Activity Log & Notification Bell */}
          <div className="flex justify-end gap-2 mb-3">
            <GlobalActivityLog 
              trigger={
                <Button variant="ghost" size="icon" className="text-white/70 hover:text-white hover:bg-white/10">
                  <History className="w-5 h-5" />
                </Button>
              }
            />
            <NotificationBell />
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors">
                <Avatar className="w-9 h-9">
                  <AvatarImage src={user?.picture} />
                  <AvatarFallback className="bg-[#AED768] text-[#1F2937]">
                    {user?.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium truncate text-white">{user?.name}</p>
                  <p className="text-xs text-white/60 truncate">{user?.email}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => changeLanguage(language === "en" ? "es" : "en")}>
                <Globe className="w-4 h-4 mr-2" />
                {language === "en" ? "Español" : "English"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                {t("logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-border z-50">
        <div className="flex items-center justify-between h-full px-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#2A2F3A] flex items-center justify-center">
              <img src="/favicon.png" alt="Kora" className="w-6 h-6" />
            </div>
            <span className="font-heading font-semibold text-[#1F2937]">Kora OS</span>
          </Link>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg hover:bg-muted"
              data-testid="mobile-menu-toggle"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-16 bg-white z-40 animate-slideIn">
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    active
                      ? "bg-[#AED768] text-[#1F2937]"
                      : "text-[#1F2937] hover:bg-muted"
                  }`}
                >
                  <Icon className="w-5 h-5" strokeWidth={1.5} />
                  <span className="font-medium">{item.label || t(item.labelKey)}</span>
                </Link>
              );
            })}
          </nav>
          <div className="p-4 border-t">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => changeLanguage(language === "en" ? "es" : "en")}
            >
              <Globe className="w-4 h-4 mr-2" />
              {language === "en" ? "Español" : "English"}
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              {t("logout")}
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="md:ml-64 pt-16 md:pt-0 min-h-screen">
        <div className="p-6 md:p-8 lg:p-12">{children}</div>
      </main>
    </div>
  );
};
