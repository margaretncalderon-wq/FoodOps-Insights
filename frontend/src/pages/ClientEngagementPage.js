import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { Layout } from "../components/Layout";
import axios from "axios";

// UI Components
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { RefreshCw, Users, FileText, CalendarDays, 
  UserPlus, Inbox, Clock, MessageSquare, UserCircle, ChevronDown, Zap, BarChart3 } from "lucide-react";

import { API_BASE as API } from "../utils/api";

// Lazy load CRM sections
const LeadOutreachSection = lazy(() => import("../components/crm/LeadOutreachSection"));
const LeadInboundSection = lazy(() => import("../components/crm/LeadInboundSection"));
const FollowUpsSection = lazy(() => import("../components/crm/FollowUpsSection"));
const CommsLogSection = lazy(() => import("../components/crm/CommsLogSection"));
const OwnerAssignmentSection = lazy(() => import("../components/crm/OwnerAssignmentSection"));
const SalesReportSection = lazy(() => import("../components/crm/SalesReportSection"));
const ClientsSection = lazy(() => import("../components/crm/ClientsSection"));

// Lazy load Automation
const AutomationSection = lazy(() => import("../components/automation/AutomationSection"));

// Lazy load other pages
const EventsPageContent = lazy(() => import("./EventsPage").then(mod => ({ default: (props) => <mod.default embedded={true} {...props} /> })));
const EngagementCalendar = lazy(() => import("./EngagementCalendar").then(mod => ({ default: (props) => <mod.default embedded={true} {...props} /> })));

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
  const isEs = language === "es";
  const location = useLocation();
  const navigate = useNavigate();
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

  // Check if current path is in CRM section
  const isCrmActive = location.pathname.includes("/client-engagement/crm");
  
  // Get current CRM sub-tab label
  const getCrmLabel = () => {
    const path = location.pathname;
    if (path.includes("outreach")) return "Outreach";
    if (path.includes("inbound")) return "Inbound";
    if (path.includes("follow-ups")) return isEs ? "Seguimientos" : "Follow-ups";
    if (path.includes("comms")) return isEs ? "Comunicaciones" : "Comms";
    if (path.includes("owners")) return isEs ? "Responsables" : "Owners";
    if (path.includes("clients")) return isEs ? "Clientes" : "Clients";
    return null; // No sub-section active
  };

  // CRM dropdown items
  const crmItems = [
    { path: "/client-engagement/crm/outreach", label: "Outreach", icon: UserPlus, badge: stats.outreach_leads },
    { path: "/client-engagement/crm/inbound", label: "Inbound", icon: Inbox, badge: stats.inbound_leads },
    { path: "/client-engagement/crm/follow-ups", label: isEs ? "Seguimientos" : "Follow-ups", icon: Clock, badge: stats.follow_ups_due },
    { path: "/client-engagement/crm/comms", label: isEs ? "Comunicaciones" : "Comms", icon: MessageSquare },
    { path: "/client-engagement/crm/owners", label: isEs ? "Responsables" : "Owners", icon: UserCircle },
    { path: "/client-engagement/crm/clients", label: isEs ? "Clientes" : "Clients", icon: Users, badge: stats.active_clients },
  ];

  // Calculate total CRM badges
  const totalCrmBadge = (stats.outreach_leads || 0) + (stats.inbound_leads || 0) + (stats.follow_ups_due || 0);

  return (
    <Layout>
      <div className="space-y-6" data-testid="client-engagement-page">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Client Engagement</h1>
            <p className="text-sm text-muted-foreground">
              {isEs ? "Leads, propuestas y gestión de clientes" : "Leads, proposals & client management"}
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="border-b">
          <nav className="flex gap-1 pb-px">
            {/* Calendar Tab */}
            <NavLink
              to="/client-engagement/calendar"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                }`
              }
            >
              <CalendarDays className="w-4 h-4" />
              {isEs ? "Calendario" : "Calendar"}
            </NavLink>

            {/* Proposals Tab */}
            <NavLink
              to="/client-engagement/proposals"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                }`
              }
            >
              <FileText className="w-4 h-4" />
              {isEs ? "Propuestas" : "Proposals"}
            </NavLink>

            {/* CRM Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isCrmActive
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  {getCrmLabel() ? `CRM: ${getCrmLabel()}` : "CRM"}
                  {totalCrmBadge > 0 && (
                    <Badge variant="secondary" className="text-xs ml-1">
                      {totalCrmBadge}
                    </Badge>
                  )}
                  <ChevronDown className="w-3 h-3 ml-1" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {crmItems.map((item) => (
                  <DropdownMenuItem
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`flex items-center justify-between cursor-pointer ${
                      location.pathname === item.path ? "bg-blue-50 text-blue-600" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </div>
                    {item.badge !== undefined && item.badge > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {item.badge}
                      </Badge>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Automation Tab */}
            <NavLink
              to="/client-engagement/automation"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-amber-500 text-amber-600"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                }`
              }
            >
              <Zap className="w-4 h-4" />
              {isEs ? "Automatización" : "Automation"}
            </NavLink>
          </nav>
        </div>

        {/* Content */}
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            {/* Default redirect to Calendar */}
            <Route index element={<Navigate to="calendar" replace />} />
            
            {/* Engagement Calendar - Primary View */}
            <Route path="calendar" element={<EngagementCalendar />} />
            
            {/* Proposals & Agreements (Events) */}
            <Route path="proposals" element={<EventsPageContent />} />
            
            {/* Backward compatibility: /events redirects to /proposals */}
            <Route path="events" element={<Navigate to="/client-engagement/proposals" replace />} />
            
            {/* CRM Routes */}
            <Route path="crm" element={<Navigate to="crm/outreach" replace />} />
            <Route path="crm/outreach" element={<LeadOutreachSection />} />
            <Route path="crm/inbound" element={<LeadInboundSection />} />
            <Route path="crm/follow-ups" element={<FollowUpsSection />} />
            <Route path="crm/comms" element={<CommsLogView />} />
            <Route path="crm/owners" element={<OwnerAssignmentSection />} />
            <Route path="crm/clients" element={<ClientsSection />} />
            
            {/* Backward compatibility: /crm-outreach redirects to /crm/outreach */}
            <Route path="crm-outreach" element={<Navigate to="/client-engagement/crm/outreach" replace />} />
            
            {/* Automation */}
            <Route path="automation" element={<AutomationSection />} />
            
            {/* Fallback - redirect to calendar */}
            <Route path="*" element={<Navigate to="/client-engagement/calendar" replace />} />
          </Routes>
        </Suspense>
      </div>
    </Layout>
  );
}
