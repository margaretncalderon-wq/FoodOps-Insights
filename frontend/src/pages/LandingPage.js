import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useLanguage } from "../contexts/LanguageContext";
import { 
  Users, Briefcase, Calendar, ChefHat, Package, Megaphone, Building2,
  ArrowRight, Check, ChevronRight, Globe, Mail, Phone
} from "lucide-react";

// Team solutions data
const teamSolutions = [
  {
    id: "client",
    icon: Users,
    iconColor: "text-blue-500",
    bgColor: "bg-blue-500/10",
    title: "Client & Revenue Teams",
    titleEs: "Equipos de Clientes e Ingresos",
    module: "Client Engagement",
    features: [
      "CRM & leads",
      "Proposals & agreements", 
      "Follow-ups & ownership",
      "Communication log",
      "Client portal (role-based visibility)"
    ],
    featuresEs: [
      "CRM y prospectos",
      "Propuestas y acuerdos",
      "Seguimientos y asignación",
      "Registro de comunicaciones",
      "Portal de clientes (visibilidad por rol)"
    ]
  },
  {
    id: "event",
    icon: Calendar,
    iconColor: "text-purple-500",
    bgColor: "bg-purple-500/10",
    title: "Event & Experience Teams",
    titleEs: "Equipos de Eventos y Experiencias",
    module: "Event Orchestration",
    features: [
      "Event blueprints",
      "Experience design",
      "Run of show",
      "Teams & roles",
      "Production assets & documents",
      "Global calendars"
    ],
    featuresEs: [
      "Plantillas de eventos",
      "Diseño de experiencias",
      "Orden del día",
      "Equipos y roles",
      "Activos de producción y documentos",
      "Calendarios globales"
    ]
  },
  {
    id: "culinary",
    icon: ChefHat,
    iconColor: "text-orange-500",
    bgColor: "bg-orange-500/10",
    title: "Culinary & Food Operations",
    titleEs: "Operaciones Culinarias",
    module: "Culinary Intelligence",
    features: [
      "Recipe architecture",
      "Costing & margins",
      "Production planning",
      "Food inventory & suppliers",
      "Vendor orders"
    ],
    featuresEs: [
      "Arquitectura de recetas",
      "Costeo y márgenes",
      "Planificación de producción",
      "Inventario y proveedores",
      "Órdenes de compra"
    ]
  },
  {
    id: "operations",
    icon: Package,
    iconColor: "text-green-500",
    bgColor: "bg-green-500/10",
    title: "Operations & Asset Teams",
    titleEs: "Equipos de Operaciones",
    module: "Operations Supplies",
    features: [
      "Equipment & rentals",
      "Disposable & event supplies",
      "Reserved vs available stock",
      "Maintenance tracking (v2)"
    ],
    featuresEs: [
      "Equipos y alquileres",
      "Suministros desechables",
      "Stock reservado vs disponible",
      "Seguimiento de mantenimiento (v2)"
    ]
  },
  {
    id: "marketing",
    icon: Megaphone,
    iconColor: "text-pink-500",
    bgColor: "bg-pink-500/10",
    title: "Marketing & Growth",
    titleEs: "Marketing y Crecimiento",
    module: "Demand Studio",
    features: [
      "Campaigns (online & offline)",
      "Social media planning",
      "Activations & branded events",
      "Email marketing",
      "Spend ledger & insights"
    ],
    featuresEs: [
      "Campañas (online y offline)",
      "Planificación de redes sociales",
      "Activaciones y eventos de marca",
      "Email marketing",
      "Registro de gastos e insights"
    ]
  },
  {
    id: "finance",
    icon: Briefcase,
    iconColor: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    title: "Finance & Leadership",
    titleEs: "Finanzas y Liderazgo",
    module: "Business Clarity",
    features: [
      "Invoices & payments",
      "Receivables & payables",
      "Budget & fixed costs",
      "Month close & reconciliation",
      "Executive dashboard",
      "Profit Signals (early warnings)"
    ],
    featuresEs: [
      "Facturas y pagos",
      "Cuentas por cobrar y pagar",
      "Presupuesto y costos fijos",
      "Cierre mensual y conciliación",
      "Dashboard ejecutivo",
      "Señales de rentabilidad (alertas)"
    ]
  },
  {
    id: "venues",
    icon: Building2,
    iconColor: "text-gray-400",
    bgColor: "bg-gray-100",
    title: "Venues & Spaces",
    titleEs: "Venues y Espacios",
    module: "Venue Management",
    comingSoon: true,
    features: [
      "Venue calendars",
      "Concurrent events",
      "Internal operations",
      "Billing & financial tracking"
    ],
    featuresEs: [
      "Calendarios de venues",
      "Eventos concurrentes",
      "Operaciones internas",
      "Facturación y seguimiento financiero"
    ]
  }
];

// Integrations
const integrations = [
  { name: "Gmail", logo: "https://upload.wikimedia.org/wikipedia/commons/7/7e/Gmail_icon_%282020%29.svg" },
  { name: "Google Calendar", logo: "https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" },
  { name: "Google Contacts", logo: "https://upload.wikimedia.org/wikipedia/commons/9/93/Google_Contacts_icon.svg" },
  { name: "Outlook", logo: "https://upload.wikimedia.org/wikipedia/commons/d/df/Microsoft_Office_Outlook_%282018%E2%80%93present%29.svg" },
  { name: "Meta Leads", logo: "https://upload.wikimedia.org/wikipedia/commons/0/05/Facebook_Logo_%282019%29.png" },
  { name: "QuickBooks", logo: "https://upload.wikimedia.org/wikipedia/commons/1/1f/Quickbooks_green_logo.svg" },
  { name: "Chrome", logo: "https://upload.wikimedia.org/wikipedia/commons/e/e1/Google_Chrome_icon_%28February_2022%29.svg" }
];

// Pricing plans
const pricingPlans = [
  {
    name: "Insight",
    nameEs: "Insight",
    price: "Free",
    priceEs: "Gratis",
    tagline: "See your system before you run it.",
    taglineEs: "Ve tu sistema antes de operarlo.",
    features: [
      "System Pulse (read-only)",
      "Client Engagement (up to 6 clients)",
      "1 location",
      "2 users",
      "No automations",
      "No add-ons"
    ],
    featuresEs: [
      "System Pulse (solo lectura)",
      "Client Engagement (hasta 6 clientes)",
      "1 ubicación",
      "2 usuarios",
      "Sin automatizaciones",
      "Sin add-ons"
    ],
    cta: "Start Free",
    ctaEs: "Comenzar Gratis",
    highlight: false
  },
  {
    name: "Foundation",
    nameEs: "Foundation",
    price: "$49",
    priceEs: "$49",
    period: "/month",
    periodEs: "/mes",
    yearly: "$490/year (2 months free)",
    yearlyEs: "$490/año (2 meses gratis)",
    tagline: "Run day-to-day operations with structure and control.",
    taglineEs: "Opera el día a día con estructura y control.",
    features: [
      "System Pulse",
      "Client Engagement (CRM + pipelines)",
      "Business Clarity",
      "Operations Supplies",
      "Org setup, roles & permissions",
      "Up to 5 users",
      "Add-ons available"
    ],
    featuresEs: [
      "System Pulse",
      "Client Engagement (CRM + pipelines)",
      "Business Clarity",
      "Operations Supplies",
      "Configuración de org, roles y permisos",
      "Hasta 5 usuarios",
      "Add-ons disponibles"
    ],
    cta: "Get Started",
    ctaEs: "Comenzar",
    highlight: true
  },
  {
    name: "Scale",
    nameEs: "Scale",
    price: "$99",
    priceEs: "$99",
    period: "/month",
    periodEs: "/mes",
    yearly: "$990/year",
    yearlyEs: "$990/año",
    tagline: "Scale across teams, locations, and complexity.",
    taglineEs: "Escala entre equipos, ubicaciones y complejidad.",
    features: [
      "Everything in Foundation",
      "Advanced permissions",
      "External collaborators",
      "Multi-location operations",
      "Priority support",
      "Up to 15 users"
    ],
    featuresEs: [
      "Todo en Foundation",
      "Permisos avanzados",
      "Colaboradores externos",
      "Operaciones multi-ubicación",
      "Soporte prioritario",
      "Hasta 15 usuarios"
    ],
    cta: "Contact Sales",
    ctaEs: "Contactar Ventas",
    highlight: false
  }
];

// Add-ons
const addOns = [
  { name: "Culinary Intelligence", nameEs: "Culinary Intelligence", icon: ChefHat },
  { name: "Demand Studio", nameEs: "Demand Studio", icon: Megaphone },
  { name: "Event Orchestration", nameEs: "Event Orchestration", icon: Calendar }
];

export default function LandingPage() {
  const { language, changeLanguage } = useLanguage();
  const isEs = language === "es";
  const [activeTeam, setActiveTeam] = useState("client");

  const activeTeamData = teamSolutions.find(t => t.id === activeTeam);

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#2A2F3A] flex items-center justify-center">
              <img src="/favicon.png" alt="Kora" className="w-8 h-8" />
            </div>
            <div>
              <h1 className="font-heading text-lg font-semibold text-[#1F2937]">Kora OS</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => changeLanguage(isEs ? "en" : "es")}
              className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#1F2937] transition-colors"
            >
              <Globe className="w-4 h-4" />
              {isEs ? "EN" : "ES"}
            </button>
            <Link to="/login">
              <Button variant="ghost" className="text-[#1F2937]" data-testid="login-nav-btn">
                {isEs ? "Iniciar Sesión" : "Login"}
              </Button>
            </Link>
            <Link to="/register">
              <Button className="rounded-full px-6 bg-[#2A2F3A] hover:bg-[#3A4049] text-white" data-testid="get-started-btn">
                {isEs ? "Comenzar" : "Get Started"}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1F2937] leading-tight max-w-4xl mx-auto">
            {isEs
              ? "El sistema operativo para negocios de eventos y hospitalidad"
              : "The operating system for event & hospitality businesses"}
          </h1>
          <p className="mt-6 text-lg text-[#6B7280] max-w-2xl mx-auto">
            {isEs
              ? "Conecta clientes, eventos, cocina, operaciones, marketing y finanzas en una sola plataforma. Comienza simple. Escala cuando lo necesites."
              : "Connect clients, events, kitchen, operations, marketing, and finance in one platform. Start simple. Scale when you need to."}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link to="/register">
              <Button size="lg" className="rounded-full px-8 gap-2 bg-[#AED768] hover:bg-[#9BC75A] text-[#1F2937] font-semibold" data-testid="hero-cta-btn">
                {isEs ? "Comenzar Gratis" : "Start Free"}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="rounded-full px-8 border-[#E5E7EB] text-[#1F2937]">
                {isEs ? "Ver Demo" : "View Demo"}
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-sm text-[#6B7280]">
            {isEs ? "Sin tarjeta de crédito requerida" : "No credit card required"}
          </p>
        </div>
      </section>

      {/* Solutions Section */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-[#1F2937]">
              {isEs 
                ? "Soluciones para cada equipo. Impulsadas por una plataforma."
                : "Solutions for every team. Powered by one platform."}
            </h2>
          </div>

          {/* Team Tabs */}
          <div className="flex flex-wrap justify-center gap-2 mb-12">
            {teamSolutions.map((team) => {
              const Icon = team.icon;
              return (
                <button
                  key={team.id}
                  onClick={() => setActiveTeam(team.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    activeTeam === team.id
                      ? "bg-[#2A2F3A] text-white"
                      : "bg-[#F7F8FA] text-[#6B7280] hover:bg-[#E5E7EB]"
                  } ${team.comingSoon ? "opacity-60" : ""}`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{isEs ? team.titleEs.split(" ")[0] : team.title.split(" ")[0]}</span>
                  {team.comingSoon && <span className="text-xs bg-yellow-400/20 text-yellow-700 px-2 py-0.5 rounded-full">Soon</span>}
                </button>
              );
            })}
          </div>

          {/* Active Team Content */}
          {activeTeamData && (
            <div className="bg-[#F7F8FA] rounded-2xl p-8 lg:p-12">
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div>
                  <div className={`w-14 h-14 rounded-xl ${activeTeamData.bgColor} flex items-center justify-center mb-6`}>
                    <activeTeamData.icon className={`w-7 h-7 ${activeTeamData.iconColor}`} />
                  </div>
                  <h3 className="font-heading text-2xl font-bold text-[#1F2937] mb-2">
                    {isEs ? activeTeamData.titleEs : activeTeamData.title}
                  </h3>
                  <p className="text-[#AED768] font-semibold mb-6">{activeTeamData.module}</p>
                  {activeTeamData.comingSoon && (
                    <span className="inline-block bg-yellow-100 text-yellow-800 text-sm font-medium px-3 py-1 rounded-full mb-4">
                      {isEs ? "Próximamente" : "Coming Soon"}
                    </span>
                  )}
                  <ul className="space-y-3">
                    {(isEs ? activeTeamData.featuresEs : activeTeamData.features).map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-[#4B5563]">
                        <Check className="w-5 h-5 text-[#AED768] flex-shrink-0 mt-0.5" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-lg border border-[#E5E7EB]">
                  <div className="aspect-video bg-[#F7F8FA] rounded-lg flex items-center justify-center">
                    <span className="text-[#9CA3AF] text-sm">{activeTeamData.module} Screenshot</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Integrations Section */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-[#1F2937] mb-4">
              {isEs 
                ? "Conecta las herramientas que ya usas"
                : "Connect the tools you already use"}
            </h2>
            <p className="text-[#6B7280] max-w-2xl mx-auto">
              {isEs
                ? "Kora OS trabaja con tu stack actual para que puedas moverte rápido hoy y consolidar cuando estés listo. Sin migraciones forzadas."
                : "Kora OS works with your current stack so you can move fast today and consolidate when you're ready. No forced migrations."}
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-8 mb-8">
            {integrations.map((integration) => (
              <div key={integration.name} className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 bg-white rounded-xl shadow-sm border border-[#E5E7EB] flex items-center justify-center p-3">
                  <img src={integration.logo} alt={integration.name} className="w-full h-full object-contain" />
                </div>
                <span className="text-xs text-[#6B7280]">{integration.name}</span>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-[#6B7280] max-w-xl mx-auto">
            {isEs
              ? "Email, calendario, prospectos y datos contables se conectan directamente a Client Engagement, Business Clarity y System Pulse."
              : "Email, calendar, leads, and accounting data connect directly into Client Engagement, Business Clarity, and System Pulse."}
          </p>
        </div>
      </section>

      {/* Real Screens Section */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-[#1F2937]">
              {isEs ? "Sistema real, pantallas reales" : "Built for real operations — not demos"}
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "System Pulse", titleEs: "System Pulse", desc: "Real-time operational overview", descEs: "Vista operacional en tiempo real" },
              { title: "Client CRM", titleEs: "CRM de Clientes", desc: "Lead tracking and pipeline", descEs: "Seguimiento de prospectos y pipeline" },
              { title: "Event Blueprint", titleEs: "Plantilla de Evento", desc: "Complete event planning", descEs: "Planificación completa de eventos" },
              { title: "Culinary Dashboard", titleEs: "Dashboard Culinario", desc: "Recipe costing and margins", descEs: "Costeo de recetas y márgenes" },
              { title: "Business Clarity", titleEs: "Business Clarity", desc: "Financial health at a glance", descEs: "Salud financiera de un vistazo" },
              { title: "Demand Studio", titleEs: "Demand Studio", desc: "Marketing campaigns and spend", descEs: "Campañas de marketing y gastos" }
            ].map((screen, idx) => (
              <div key={idx} className="bg-[#F7F8FA] rounded-xl overflow-hidden border border-[#E5E7EB]">
                <div className="aspect-video bg-[#E5E7EB] flex items-center justify-center">
                  <span className="text-[#9CA3AF] text-sm">{isEs ? screen.titleEs : screen.title}</span>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-[#1F2937]">{isEs ? screen.titleEs : screen.title}</h3>
                  <p className="text-sm text-[#6B7280]">{isEs ? screen.descEs : screen.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 px-6" id="pricing">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-[#1F2937] mb-4">
              {isEs ? "Elige el plan adecuado para tu operación" : "Pick the right plan for how you operate"}
            </h2>
            <p className="text-[#6B7280]">
              {isEs 
                ? "Todos los planes comienzan con prueba gratuita. Cambia o cancela en cualquier momento."
                : "All plans start with a free trial. Change or cancel anytime."}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {pricingPlans.map((plan) => (
              <div 
                key={plan.name}
                className={`rounded-2xl p-6 ${
                  plan.highlight 
                    ? "bg-[#2A2F3A] text-white ring-2 ring-[#AED768]" 
                    : "bg-white border border-[#E5E7EB]"
                }`}
              >
                <div className="mb-6">
                  <h3 className={`font-heading text-xl font-bold ${plan.highlight ? "text-white" : "text-[#1F2937]"}`}>
                    {isEs ? plan.nameEs : plan.name}
                  </h3>
                  <div className="mt-2">
                    <span className={`text-4xl font-bold ${plan.highlight ? "text-[#AED768]" : "text-[#1F2937]"}`}>
                      {isEs ? plan.priceEs : plan.price}
                    </span>
                    {plan.period && (
                      <span className={plan.highlight ? "text-white/70" : "text-[#6B7280]"}>
                        {isEs ? plan.periodEs : plan.period}
                      </span>
                    )}
                  </div>
                  {plan.yearly && (
                    <p className={`text-sm mt-1 ${plan.highlight ? "text-white/60" : "text-[#6B7280]"}`}>
                      {isEs ? plan.yearlyEs : plan.yearly}
                    </p>
                  )}
                  <p className={`text-sm mt-3 ${plan.highlight ? "text-white/80" : "text-[#6B7280]"}`}>
                    {isEs ? plan.taglineEs : plan.tagline}
                  </p>
                </div>

                <ul className="space-y-3 mb-6">
                  {(isEs ? plan.featuresEs : plan.features).map((feature, idx) => (
                    <li key={idx} className={`flex items-start gap-2 text-sm ${plan.highlight ? "text-white/90" : "text-[#4B5563]"}`}>
                      <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${plan.highlight ? "text-[#AED768]" : "text-[#AED768]"}`} />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link to="/register">
                  <Button 
                    className={`w-full rounded-full ${
                      plan.highlight 
                        ? "bg-[#AED768] hover:bg-[#9BC75A] text-[#1F2937]" 
                        : "bg-[#2A2F3A] hover:bg-[#3A4049] text-white"
                    }`}
                  >
                    {isEs ? plan.ctaEs : plan.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Add-ons Section */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-[#1F2937] mb-4">
              {isEs ? "Agrega inteligencia cuando la necesites" : "Add intelligence when you need it"}
            </h2>
            <p className="text-[#6B7280] max-w-2xl mx-auto">
              {isEs
                ? "Kora se mantiene simple por defecto. La inteligencia especializada se activa solo cuando tu operación lo requiere."
                : "Kora stays lean by default. Specialized intelligence activates only when your operation requires it."}
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            {addOns.map((addon) => {
              const Icon = addon.icon;
              return (
                <div key={addon.name} className="flex items-center gap-3 bg-[#F7F8FA] px-6 py-4 rounded-xl border border-[#E5E7EB]">
                  <Icon className="w-5 h-5 text-[#AED768]" />
                  <span className="font-medium text-[#1F2937]">{isEs ? addon.nameEs : addon.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why Kora Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-[#1F2937] mb-8">
            {isEs ? "¿Por qué Kora OS?" : "Why Kora OS?"}
          </h2>

          <div className="grid sm:grid-cols-2 gap-6 text-left mb-12">
            {[
              { en: "Built for real operations — not just tracking", es: "Construido para operaciones reales — no solo seguimiento" },
              { en: "Scales without forcing complexity", es: "Escala sin forzar complejidad" },
              { en: "Clear pricing, modular growth", es: "Precios claros, crecimiento modular" },
              { en: "One system instead of scattered tools", es: "Un sistema en lugar de herramientas dispersas" }
            ].map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 bg-white p-4 rounded-xl border border-[#E5E7EB]">
                <Check className="w-5 h-5 text-[#AED768] flex-shrink-0 mt-0.5" />
                <span className="text-[#4B5563]">{isEs ? item.es : item.en}</span>
              </div>
            ))}
          </div>

          <div className="bg-[#2A2F3A] rounded-2xl p-8 text-white">
            <p className="text-lg mb-2">{isEs ? "Comienza con el sistema." : "Start with the system."}</p>
            <p className="text-lg mb-2">{isEs ? "Agrega inteligencia cuando la necesites." : "Add intelligence when needed."}</p>
            <p className="text-[#AED768] font-semibold">{isEs ? "La complejidad es opcional." : "Complexity is optional."}</p>
          </div>

          <div className="mt-12">
            <Link to="/register">
              <Button size="lg" className="rounded-full px-10 gap-2 bg-[#AED768] hover:bg-[#9BC75A] text-[#1F2937] font-semibold">
                {isEs ? "Comenzar Gratis" : "Start Free Today"}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 bg-[#2A2F3A] text-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center">
                  <img src="/favicon.png" alt="Kora" className="w-8 h-8" />
                </div>
                <span className="font-heading text-lg font-semibold">Kora OS</span>
              </div>
              <p className="text-white/60 text-sm">
                {isEs 
                  ? "El sistema operativo para negocios de eventos y hospitalidad."
                  : "The operating system for event & hospitality businesses."}
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">{isEs ? "Producto" : "Product"}</h4>
              <ul className="space-y-2 text-white/60 text-sm">
                <li><a href="#pricing" className="hover:text-white transition-colors">{isEs ? "Precios" : "Pricing"}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{isEs ? "Integraciones" : "Integrations"}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{isEs ? "Changelog" : "Changelog"}</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">{isEs ? "Compañía" : "Company"}</h4>
              <ul className="space-y-2 text-white/60 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">{isEs ? "Sobre nosotros" : "About"}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{isEs ? "Blog" : "Blog"}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{isEs ? "Contacto" : "Contact"}</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">{isEs ? "Legal" : "Legal"}</h4>
              <ul className="space-y-2 text-white/60 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">{isEs ? "Privacidad" : "Privacy"}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{isEs ? "Términos" : "Terms"}</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-white/40 text-sm">© 2026 Kora OS. All rights reserved.</p>
            <button
              onClick={() => changeLanguage(isEs ? "en" : "es")}
              className="flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors"
            >
              <Globe className="w-4 h-4" />
              {isEs ? "English" : "Español"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
