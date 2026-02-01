import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import axios from "axios";

// UI Components
import { Badge } from "../components/ui/badge";
import { RefreshCw, Users, FileText, CalendarDays, ArrowUpDown, 
  UserPlus, Inbox, Clock, MessageSquare, UserCircle, Puzzle } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

// Lazy load CRM sections
const LeadOutreachSection = lazy(() => import("../components/crm/LeadOutreachSection"));
const LeadInboundSection = lazy(() => import("../components/crm/LeadInboundSection"));
const FollowUpsSection = lazy(() => import("../components/crm/FollowUpsSection"));
const CommsLogSection = lazy(() => import("../components/crm/CommsLogSection"));
const OwnerAssignmentSection = lazy(() => import("../components/crm/OwnerAssignmentSection"));
const ClientsSection = lazy(() => import("../components/crm/ClientsSection"));

// Lazy load other pages
const EventsPageContent = lazy(() => import("./EventsPage").then(mod => ({ default: (props) => <mod.default embedded={true} {...props} /> })));
const CalendarPageContent = lazy(() => import("./CalendarPage").then(mod => ({ default: (props) => <mod.default embedded={true} {...props} /> })));

// Comms Log View wrapper for standalone view
function CommsLogView() {
  return <CommsLogSection standalone={true} />;
}

// Loading spinner component
const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-64">
    <RefreshCw className="w-8 h-8 animate-spin" />
  </div>
);

export default function ClientEngagementPage() {
  const { language } = useLanguage();
  const location = useLocation();
  const [stats, setStats] = useState({});

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/crm/stats`, { withCredentials: true });
      setStats(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => { 
    fetchStats(); 
  }, [fetchStats]);

  // Determine active section based on current path
  const getActiveSection = () => {
    const path = location.pathname;
    if (path.includes("/client-engagement/proposals") || path.includes("/client-engagement/events")) return "proposals";
    if (path.includes("/client-engagement/crm")) return "crm";
    return "calendar"; // Default to calendar
  };

  const activeSection = getActiveSection();

  // Navigation items organized by section
  const navSections = [
    {
      id: "calendar",
      title: language === "es" ? "Calendario de Engagement" : "Engagement Calendar",
      subtitle: language === "es" ? "Vista de Compromisos" : "Commitments Overview",
      icon: CalendarDays,
      items: [
        { path: "/client-engagement/calendar", label: language === "es" ? "Ver Calendario" : "View Calendar", icon: CalendarDays },
      ]
    },
    {
      id: "proposals",
      title: language === "es" ? "Propuestas & Acuerdos" : "Proposals & Agreements",
      subtitle: language === "es" ? "Ventas & Contratos" : "Sales & Contracts",
      icon: FileText,
      items: [
        { path: "/client-engagement/proposals", label: language === "es" ? "Ver Propuestas" : "View Proposals", icon: FileText },
      ]
    },
    {
      id: "crm",
      title: "CRM",
      subtitle: language === "es" ? "Gestión de Relaciones" : "Relationship Management",
      icon: Users,
      items: [
        { path: "/client-engagement/crm/outreach", label: "Lead Outreach", icon: UserPlus, badge: stats.outreach_leads },
        { path: "/client-engagement/crm/inbound", label: language === "es" ? "Leads Inbound" : "Inbound Leads", icon: Inbox, badge: stats.inbound_leads },
        { path: "/client-engagement/crm/follow-ups", label: language === "es" ? "Seguimientos" : "Follow-ups", icon: Clock, badge: stats.follow_ups_due, badgeColor: stats.follow_ups_due > 0 ? "bg-red-500 text-white" : "" },
        { path: "/client-engagement/crm/comms", label: language === "es" ? "Comunicaciones" : "Comms Log", icon: MessageSquare },
        { path: "/client-engagement/crm/owners", label: language === "es" ? "Responsables" : "Owner Assignment", icon: UserCircle },
        { path: "/client-engagement/crm/clients", label: language === "es" ? "Clientes" : "Clients", icon: Users, badge: stats.active_clients },
      ]
    },
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)]" data-testid="client-engagement-page">
      {/* Sidebar Navigation */}
      <div className="w-64 border-r bg-muted/30 p-4 flex flex-col overflow-y-auto">
        {/* Back to Dashboard */}
        <NavLink 
          to="/dashboard" 
          className="flex items-center gap-2 mb-4 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowUpDown className="w-4 h-4 rotate-90" />
          {language === "es" ? "← Volver al Dashboard" : "← Back to Dashboard"}
        </NavLink>
        
        {/* Module Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Puzzle className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-bold">Client Engagement</h2>
          </div>
          <p className="text-xs text-muted-foreground pl-8">
            {language === "es" 
              ? "Donde la intención del cliente se define y acuerda" 
              : "Where client intent becomes defined and agreed"}
          </p>
        </div>

        {/* Navigation Sections */}
        <nav className="space-y-6 flex-1">
          {navSections.map(section => (
            <div key={section.id}>
              {/* Section Header */}
              <div className={`flex items-center gap-2 px-3 py-2 mb-1 rounded-md ${
                activeSection === section.id ? "bg-primary/10" : ""
              }`}>
                <section.icon className={`w-4 h-4 ${activeSection === section.id ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <p className={`text-sm font-semibold ${activeSection === section.id ? "text-primary" : ""}`}>
                    {section.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{section.subtitle}</p>
                </div>
              </div>
              
              {/* Section Items */}
              <div className="space-y-1 ml-2">
                {section.items.map(item => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/client-engagement/proposals" || item.path === "/client-engagement/calendar"}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-sm ${
                        isActive 
                          ? "bg-primary text-primary-foreground" 
                          : "hover:bg-muted"
                      }`
                    }
                  >
                    <div className="flex items-center gap-2">
                      <item.icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </div>
                    {item.badge !== undefined && item.badge > 0 && (
                      <Badge className={`text-xs ${item.badgeColor || "bg-muted-foreground/20 text-foreground"}`}>
                        {item.badge}
                      </Badge>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            {/* Default redirect to Calendar */}
            <Route index element={<Navigate to="calendar" replace />} />
            
            {/* Engagement Calendar - Primary View */}
            <Route path="calendar/*" element={<CalendarPageContent />} />
            <Route path="calendar" element={<CalendarPageContent />} />
            
            {/* Proposals & Agreements (Events) */}
            <Route path="proposals/*" element={<EventsPageContent />} />
            <Route path="proposals" element={<EventsPageContent />} />
            
            {/* CRM Routes */}
            <Route path="crm" element={<Navigate to="crm/outreach" replace />} />
            <Route path="crm/outreach" element={<LeadOutreachSection />} />
            <Route path="crm/inbound" element={<LeadInboundSection />} />
            <Route path="crm/follow-ups" element={<FollowUpsSection />} />
            <Route path="crm/comms" element={<CommsLogView />} />
            <Route path="crm/owners" element={<OwnerAssignmentSection />} />
            <Route path="crm/clients" element={<ClientsSection />} />
            
            {/* Fallback */}
            <Route path="*" element={<Navigate to="calendar" replace />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}
