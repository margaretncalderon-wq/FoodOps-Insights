import { useState, useEffect } from "react";
import { Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { useLanguage } from "../contexts/LanguageContext";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Users, FileText, CalendarDays, ChevronRight } from "lucide-react";

// Import existing modules as components
import CRMPageNew from "./CRMPageNew";
import EventsPage from "./EventsPage";
import CalendarPage from "./CalendarPage";

const SECTIONS = [
  { 
    id: "crm", 
    path: "crm",
    icon: Users, 
    labelEn: "CRM", 
    labelEs: "CRM",
    descEn: "Relationship Management",
    descEs: "Gestión de Relaciones"
  },
  { 
    id: "proposals", 
    path: "proposals",
    icon: FileText, 
    labelEn: "Proposals & Agreements", 
    labelEs: "Propuestas & Acuerdos",
    descEn: "Sales & Contracts",
    descEs: "Ventas & Contratos"
  },
  { 
    id: "calendar", 
    path: "calendar",
    icon: CalendarDays, 
    labelEn: "Engagement Calendar", 
    labelEs: "Calendario de Engagement",
    descEn: "Client Commitments",
    descEs: "Compromisos con Clientes"
  },
];

// Wrapper to remove Layout from embedded pages
const EmbeddedCRM = () => {
  return <CRMPageNew embedded={true} />;
};

const EmbeddedProposals = () => {
  return <EventsPage embedded={true} />;
};

const EmbeddedCalendar = () => {
  return <CalendarPage embedded={true} />;
};

export default function ClientEngagementPage() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const location = useLocation();
  const navigate = useNavigate();
  
  // Determine active section from path
  const getActiveSection = () => {
    const path = location.pathname;
    if (path.includes("/client-engagement/proposals") || path.includes("/client-engagement/events")) return "proposals";
    if (path.includes("/client-engagement/calendar")) return "calendar";
    if (path.includes("/client-engagement/crm")) return "crm";
    return "crm"; // default
  };
  
  const [activeSection, setActiveSection] = useState(getActiveSection());

  useEffect(() => {
    setActiveSection(getActiveSection());
  }, [location.pathname]);

  const handleSectionChange = (sectionId) => {
    setActiveSection(sectionId);
    const section = SECTIONS.find(s => s.id === sectionId);
    if (section) {
      navigate(`/client-engagement/${section.path}`);
    }
  };

  // Check if we're on a detail page (like /client-engagement/proposals/event_xxx)
  const isDetailPage = location.pathname.split('/').length > 3 && 
    !['crm', 'proposals', 'calendar'].some(s => location.pathname.endsWith(s));

  return (
    <Layout>
      <div className="space-y-6" data-testid="client-engagement-page">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <span>{isEs ? "Módulo" : "Module"}</span>
              <ChevronRight className="w-4 h-4" />
              <span className="text-foreground font-medium">Client Engagement</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold font-heading">
              🧩 Client Engagement
            </h1>
            <p className="text-muted-foreground mt-1">
              {isEs 
                ? "Donde la intención del cliente se define, acuerda y prepara para ejecución"
                : "Where client intent becomes defined, agreed upon, and ready for execution"}
            </p>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        {!isDetailPage && (
          <div className="border-b">
            <Tabs value={activeSection} onValueChange={handleSectionChange}>
              <TabsList className="bg-transparent h-auto p-0 gap-0">
                {SECTIONS.map((section) => {
                  const Icon = section.icon;
                  const isActive = activeSection === section.id;
                  return (
                    <TabsTrigger
                      key={section.id}
                      value={section.id}
                      className={`
                        relative px-6 py-4 rounded-none border-b-2 transition-all
                        ${isActive 
                          ? "border-primary text-primary bg-primary/5" 
                          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        }
                      `}
                      data-testid={`engagement-tab-${section.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                        <div className="text-left">
                          <div className="font-medium">
                            {isEs ? section.labelEs : section.labelEn}
                          </div>
                          <div className="text-xs text-muted-foreground hidden md:block">
                            {isEs ? section.descEs : section.descEn}
                          </div>
                        </div>
                      </div>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </div>
        )}

        {/* Content Area - Routes */}
        <div className="min-h-[60vh]">
          <Routes>
            {/* CRM Routes */}
            <Route path="crm/*" element={<EmbeddedCRM />} />
            
            {/* Proposals & Agreements (Events) Routes */}
            <Route path="proposals/*" element={<EmbeddedProposals />} />
            <Route path="proposals" element={<EmbeddedProposals />} />
            
            {/* Engagement Calendar Routes */}
            <Route path="calendar/*" element={<EmbeddedCalendar />} />
            <Route path="calendar" element={<EmbeddedCalendar />} />
            
            {/* Default redirect to CRM */}
            <Route path="" element={<EmbeddedCRM />} />
            <Route path="*" element={<EmbeddedCRM />} />
          </Routes>
        </div>
      </div>
    </Layout>
  );
}
