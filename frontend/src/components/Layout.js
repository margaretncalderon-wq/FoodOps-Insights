import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
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
} from "lucide-react";

const navItems = [
  { path: "/dashboard", icon: Activity, labelKey: "systemPulse" },
  { path: "/client-engagement", icon: Puzzle, label: "Client Engagement", labelEs: "Client Engagement" },
  { path: "/event-orchestration", icon: Music4, label: "Event Orchestration", labelEs: "Event Orchestration" },
  { path: "/food-ops", icon: UtensilsCrossed, label: "Culinary Intelligence", labelEs: "Inteligencia Culinaria" },
  { path: "/ops-supplies", icon: Package, label: "Operations Supplies", labelEs: "Operations Supplies" },
  { path: "/business-clarity", icon: Briefcase, label: "Business Clarity", labelEs: "Business Clarity" },
  { path: "/settings", icon: Settings, labelKey: "settings" },
];

export const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const { t, language, changeLanguage } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const isActive = (path) => location.pathname.startsWith(path);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-64 bg-primary text-primary-foreground z-50">
        {/* Logo */}
        <div className="p-6 border-b border-white/10">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <span className="font-heading text-xl font-bold">E</span>
            </div>
            <div>
              <h1 className="font-heading text-lg font-semibold">Evoke OS</h1>
              <p className="text-xs text-white/60">Events Platform</p>
            </div>
          </Link>
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
                    ? "bg-white/20 text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={1.5} />
                <span className="font-medium">{displayLabel}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-white/10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors">
                <Avatar className="w-9 h-9">
                  <AvatarImage src={user?.picture} />
                  <AvatarFallback className="bg-white/20 text-white">
                    {user?.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium truncate">{user?.name}</p>
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
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="font-heading text-white font-bold">E</span>
            </div>
            <span className="font-heading font-semibold">Evoke OS</span>
          </Link>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg hover:bg-muted"
            data-testid="mobile-menu-toggle"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
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
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted"
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
