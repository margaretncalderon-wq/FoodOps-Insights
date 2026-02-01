import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { Layout } from "../components/Layout";
import axios from "axios";
import { Card, CardContent } from "../components/ui/card";
import { 
  UserPlus, Inbox, Clock, MessageSquare, UserCircle, Users, RefreshCw
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

// Lazy load sections
const LeadOutreachSection = lazy(() => import("../components/crm/LeadOutreachSection"));
const LeadInboundSection = lazy(() => import("../components/crm/LeadInboundSection"));
const FollowUpsSection = lazy(() => import("../components/crm/FollowUpsSection"));
const CommsLogSection = lazy(() => import("../components/crm/CommsLogSection"));
const OwnerAssignmentSection = lazy(() => import("../components/crm/OwnerAssignmentSection"));
const ClientsSection = lazy(() => import("../components/crm/ClientsSection"));

// Standalone Comms Log view wrapper
function CommsLogView() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [entities, setEntities] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchEntities = useCallback(async () => {
    try {
      const [leadsRes, clientsRes] = await Promise.all([
        axios.get(`${API}/api/leads`, { withCredentials: true }),
        axios.get(`${API}/api/crm/clients`, { withCredentials: true })
      ]);
      const combined = [
        ...leadsRes.data.map(l => ({ ...l, entity_type: "lead", entity_id: l.lead_id, name: l.lead_name })),
        ...clientsRes.data.map(c => ({ ...c, entity_type: "client", entity_id: c.client_id, name: c.display_name }))
      ];
      setEntities(combined);
      if (combined.length > 0 && !selected) {
        setSelected(combined[0]);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [selected]);

  useEffect(() => { fetchEntities(); }, [fetchEntities]);

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">{isEs ? "Historial de Comunicaciones" : "Communication Log"}</h2>
        <p className="text-muted-foreground text-sm">
          {isEs ? "Historial centralizado de comunicaciones" : "Centralized communication history"}
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Entity selector */}
        <Card className="md:col-span-1">
          <CardContent className="p-4">
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {entities.map((entity) => (
                <div
                  key={`${entity.entity_type}-${entity.entity_id}`}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selected?.entity_id === entity.entity_id 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setSelected(entity)}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      entity.entity_type === "lead" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                    }`}>
                      {entity.entity_type === "lead" ? "Lead" : (isEs ? "Cliente" : "Client")}
                    </span>
                  </div>
                  <p className="font-medium mt-1">{entity.name}</p>
                  <p className="text-sm opacity-70">{entity.email}</p>
                </div>
              ))}
              {entities.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  {isEs ? "Sin contactos" : "No contacts"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Comms Log */}
        <Card className="md:col-span-2">
          <CardContent className="p-4">
            {selected ? (
              <CommsLogSection 
                entityType={selected.entity_type} 
                entityId={selected.entity_id}
                entityName={selected.name}
              />
            ) : (
              <div className="text-center text-muted-foreground py-12">
                {isEs ? "Selecciona un contacto" : "Select a contact"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function CRMPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [stats, setStats] = useState({});

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/crm/stats`, { withCredentials: true });
      setStats(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const sections = [
    { 
      path: "/crm/outreach", 
      label: "Lead Outreach", 
      icon: UserPlus,
      badge: stats.outreach_leads
    },
    { 
      path: "/crm/inbound", 
      label: isEs ? "Leads Inbound" : "Inbound Leads", 
      icon: Inbox,
      badge: stats.inbound_leads
    },
    { 
      path: "/crm/follow-ups", 
      label: isEs ? "Seguimientos" : "Follow-ups", 
      icon: Clock,
      badge: stats.follow_ups_due,
      badgeColor: stats.follow_ups_due > 0 ? "bg-red-500" : ""
    },
    { 
      path: "/crm/comms", 
      label: isEs ? "Comunicaciones" : "Comms Log", 
      icon: MessageSquare
    },
    { 
      path: "/crm/owners", 
      label: isEs ? "Responsables" : "Owner Assignment", 
      icon: UserCircle
    },
    { 
      path: "/crm/clients", 
      label: isEs ? "Clientes" : "Clients", 
      icon: Users,
      badge: stats.active_clients
    }
  ];

  return (
    <Layout>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Sidebar */}
        <div className="w-64 border-r bg-muted/30 p-4 space-y-2">
          <h2 className="font-bold text-lg mb-4 px-2">CRM</h2>
          {sections.map((section) => (
            <NavLink
              key={section.path}
              to={section.path}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "hover:bg-muted"
                }`
              }
            >
              <div className="flex items-center gap-2">
                <section.icon className="w-4 h-4" />
                <span>{section.label}</span>
              </div>
              {section.badge !== undefined && section.badge > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${section.badgeColor || "bg-muted-foreground/20"}`}>
                  {section.badge}
                </span>
              )}
            </NavLink>
          ))}
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto p-6">
          <Suspense fallback={<div className="flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin" /></div>}>
            <Routes>
              <Route path="/" element={<Navigate to="/crm/outreach" replace />} />
              <Route path="outreach" element={<LeadOutreachSection />} />
              <Route path="inbound" element={<LeadInboundSection />} />
              <Route path="follow-ups" element={<FollowUpsSection />} />
              <Route path="comms" element={<CommsLogView />} />
              <Route path="owners" element={<OwnerAssignmentSection />} />
              <Route path="clients" element={<ClientsSection />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </Layout>
  );
}
