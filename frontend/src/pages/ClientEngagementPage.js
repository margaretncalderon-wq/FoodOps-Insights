import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { Layout } from "../components/Layout";
import axios from "axios";

// UI Components
import { Badge } from "../components/ui/badge";
import { RefreshCw, Users, FileText, CalendarDays, 
  UserPlus, Inbox, Clock, MessageSquare, UserCircle } from "lucide-react";

import { API_BASE as API } from "../utils/api";

// Lazy load CRM sections
const LeadOutreachSection = lazy(() => import("../components/crm/LeadOutreachSection"));
const LeadInboundSection = lazy(() => import("../components/crm/LeadInboundSection"));
const FollowUpsSection = lazy(() => import("../components/crm/FollowUpsSection"));
const CommsLogSection = lazy(() => import("../components/crm/CommsLogSection"));
const OwnerAssignmentSection = lazy(() => import("../components/crm/OwnerAssignmentSection"));
const ClientsSection = lazy(() => import("../components/crm/ClientsSection"));

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

  // Navigation tabs - flat structure
  const navTabs = [
    { path: "/client-engagement/calendar", label: isEs ? "Calendario" : "Calendar", icon: CalendarDays },
    { path: "/client-engagement/proposals", label: isEs ? "Propuestas" : "Proposals", icon: FileText },
    { path: "/client-engagement/crm/outreach", label: "Outreach", icon: UserPlus, badge: stats.outreach_leads },
    { path: "/client-engagement/crm/inbound", label: "Inbound", icon: Inbox, badge: stats.inbound_leads },
    { path: "/client-engagement/crm/follow-ups", label: isEs ? "Seguimientos" : "Follow-ups", icon: Clock, badge: stats.follow_ups_due },
    { path: "/client-engagement/crm/comms", label: isEs ? "Comunicaciones" : "Comms", icon: MessageSquare },
    { path: "/client-engagement/crm/owners", label: isEs ? "Responsables" : "Owners", icon: UserCircle },
    { path: "/client-engagement/crm/clients", label: isEs ? "Clientes" : "Clients", icon: Users, badge: stats.active_clients },
  ];

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
          <nav className="flex gap-1 overflow-x-auto pb-px">
            {navTabs.map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                  }`
                }
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <Badge variant="secondary" className="text-xs ml-1">
                    {tab.badge}
                  </Badge>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Content */}
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            {/* Default redirect to Calendar */}
            <Route index element={<Navigate to="calendar" replace />} />
            
            {/* Engagement Calendar - Primary View */}
            <Route path="calendar/*" element={<EngagementCalendar />} />
            <Route path="calendar" element={<EngagementCalendar />} />
            
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
    </Layout>
  );
}
