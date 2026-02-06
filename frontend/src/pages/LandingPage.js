import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useLanguage } from "../contexts/LanguageContext";
import { 
  Users, Briefcase, Calendar, ChefHat, Package, Megaphone, Building2,
  ArrowRight, Check, Globe, Play, Zap, Target, TrendingUp
} from "lucide-react";

// Module highlights - only the most important 4 features per module
const moduleHighlights = [
  {
    id: "demand",
    icon: Megaphone,
    color: "from-pink-500 to-rose-500",
    bgColor: "bg-pink-500/10",
    title: "Demand Studio",
    subtitle: "Marketing & Growth",
    subtitleEs: "Marketing y Crecimiento",
    features: [
      { en: "Campaign management (online & offline)", es: "Gestión de campañas (online y offline)" },
      { en: "Social media planning", es: "Planificación de redes sociales" },
      { en: "Spend tracking & ROI", es: "Control de gastos y ROI" },
      { en: "Lead attribution", es: "Atribución de leads" }
    ]
  },
  {
    id: "client",
    icon: Users,
    color: "from-blue-500 to-cyan-500",
    bgColor: "bg-blue-500/10",
    title: "Client Engagement",
    subtitle: "Sales & CRM",
    subtitleEs: "Ventas y CRM",
    features: [
      { en: "Pipeline & lead tracking", es: "Pipeline y seguimiento de leads" },
      { en: "Proposals & contracts", es: "Propuestas y contratos" },
      { en: "Client communication log", es: "Registro de comunicaciones" },
      { en: "Client portal access", es: "Portal de clientes" }
    ]
  },
  {
    id: "event",
    icon: Calendar,
    color: "from-purple-500 to-violet-500",
    bgColor: "bg-purple-500/10",
    title: "Event Orchestration",
    subtitle: "Events & Production",
    subtitleEs: "Eventos y Producción",
    features: [
      { en: "Event blueprints & templates", es: "Plantillas de eventos" },
      { en: "Run of show timeline", es: "Timeline de eventos" },
      { en: "Team & role assignments", es: "Asignación de equipos" },
      { en: "Production documents", es: "Documentos de producción" }
    ]
  },
  {
    id: "culinary",
    icon: ChefHat,
    color: "from-orange-500 to-amber-500",
    bgColor: "bg-orange-500/10",
    title: "Culinary Intelligence",
    subtitle: "Food Operations",
    subtitleEs: "Operaciones Culinarias",
    features: [
      { en: "Recipe costing & margins", es: "Costeo de recetas y márgenes" },
      { en: "Production planning", es: "Planificación de producción" },
      { en: "Inventory management", es: "Gestión de inventario" },
      { en: "Vendor ordering", es: "Órdenes a proveedores" }
    ]
  },
  {
    id: "finance",
    icon: Briefcase,
    color: "from-emerald-500 to-teal-500",
    bgColor: "bg-emerald-500/10",
    title: "Business Clarity",
    subtitle: "Finance & Leadership",
    subtitleEs: "Finanzas y Liderazgo",
    features: [
      { en: "Invoices & payments", es: "Facturas y pagos" },
      { en: "Budget tracking", es: "Control de presupuesto" },
      { en: "Executive dashboard", es: "Dashboard ejecutivo" },
      { en: "Profit signals & alerts", es: "Alertas de rentabilidad" }
    ]
  },
  {
    id: "operations",
    icon: Package,
    color: "from-slate-500 to-gray-600",
    bgColor: "bg-slate-500/10",
    title: "Operations Supplies",
    subtitle: "Assets & Inventory",
    subtitleEs: "Activos e Inventario",
    features: [
      { en: "Equipment tracking", es: "Control de equipos" },
      { en: "Reserved vs available stock", es: "Stock reservado vs disponible" },
      { en: "Maintenance schedules", es: "Programación de mantenimiento" },
      { en: "Rental management", es: "Gestión de alquileres" }
    ]
  }
];

// Integrations
const integrations = [
  { name: "Gmail", logo: "https://upload.wikimedia.org/wikipedia/commons/7/7e/Gmail_icon_%282020%29.svg" },
  { name: "Google Calendar", logo: "https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" },
  { name: "QuickBooks", logo: "https://upload.wikimedia.org/wikipedia/commons/1/1f/Quickbooks_green_logo.svg" },
  { name: "Meta", logo: "https://upload.wikimedia.org/wikipedia/commons/0/05/Facebook_Logo_%282019%29.png" },
  { name: "Outlook", logo: "https://upload.wikimedia.org/wikipedia/commons/d/df/Microsoft_Office_Outlook_%282018%E2%80%93present%29.svg" }
];

// Pricing plans (condensed)
const pricingPlans = [
  {
    name: "Insight",
    price: "Free",
    priceEs: "Gratis",
    tagline: "See your system before you run it.",
    taglineEs: "Ve tu sistema antes de operarlo.",
    features: ["System Pulse (read-only)", "Up to 6 clients", "2 users"],
    featuresEs: ["System Pulse (solo lectura)", "Hasta 6 clientes", "2 usuarios"],
    cta: "Start Free",
    ctaEs: "Comenzar Gratis",
    highlight: false
  },
  {
    name: "Foundation",
    price: "$49",
    period: "/mo",
    periodEs: "/mes",
    tagline: "Run day-to-day with structure.",
    taglineEs: "Opera el día a día con estructura.",
    features: ["All core modules", "CRM + pipelines", "Up to 5 users", "Add-ons available"],
    featuresEs: ["Todos los módulos core", "CRM + pipelines", "Hasta 5 usuarios", "Add-ons disponibles"],
    cta: "Get Started",
    ctaEs: "Comenzar",
    highlight: true
  },
  {
    name: "Scale",
    price: "$99",
    period: "/mo",
    periodEs: "/mes",
    tagline: "Scale across teams and locations.",
    taglineEs: "Escala entre equipos y ubicaciones.",
    features: ["Everything in Foundation", "Multi-location", "Up to 15 users", "Priority support"],
    featuresEs: ["Todo en Foundation", "Multi-ubicación", "Hasta 15 usuarios", "Soporte prioritario"],
    cta: "Contact Sales",
    ctaEs: "Contactar",
    highlight: false
  }
];

export default function LandingPage() {
  const { language, changeLanguage } = useLanguage();
  const isEs = language === "es";
  const [activeModule, setActiveModule] = useState("demand");

  const activeModuleData = moduleHighlights.find(m => m.id === activeModule);

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#2A2F3A] flex items-center justify-center">
              <img src="/favicon.png" alt="Kora" className="w-8 h-8" />
            </div>
            <span className="font-heading text-lg font-semibold text-[#1F2937]">Kora OS</span>
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

      {/* Hero Section with Video */}
      <section className="pt-24 pb-8 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Hero Text - Compact */}
          <div className="text-center max-w-3xl mx-auto mb-8">
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1F2937] leading-tight">
              {isEs
                ? "El sistema para operaciones complejas."
                : "The system for complex operations."}
            </h1>
            <p className="mt-4 text-lg text-[#6B7280]">
              {isEs
                ? "Clientes, eventos, inventario, marketing y finanzas. Todo conectado."
                : "Clients, events, inventory, marketing, and finance. All connected."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/register">
                <Button size="lg" className="rounded-full px-8 gap-2 bg-[#AED768] hover:bg-[#9BC75A] text-[#1F2937] font-semibold" data-testid="hero-cta-btn">
                  {isEs ? "Probar Gratis" : "Try Free"}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Video/Demo Section */}
          <div className="relative max-w-5xl mx-auto">
            <div className="relative bg-[#2A2F3A] rounded-2xl overflow-hidden shadow-2xl aspect-video group cursor-pointer">
              {/* Video Placeholder with Platform Preview */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#2A2F3A] to-[#1F2937]">
                {/* Simulated dashboard preview */}
                <div className="absolute inset-4 bg-[#F7F8FA] rounded-xl opacity-90 overflow-hidden">
                  <div className="h-full flex">
                    {/* Sidebar mock */}
                    <div className="w-16 bg-[#2A2F3A] flex flex-col items-center py-4 gap-4">
                      <div className="w-8 h-8 bg-[#AED768] rounded-lg" />
                      <div className="w-8 h-8 bg-white/20 rounded-lg" />
                      <div className="w-8 h-8 bg-white/20 rounded-lg" />
                      <div className="w-8 h-8 bg-white/20 rounded-lg" />
                    </div>
                    {/* Main content mock */}
                    <div className="flex-1 p-4">
                      <div className="h-8 w-48 bg-[#E5E7EB] rounded mb-4" />
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="h-20 bg-white rounded-lg shadow-sm border border-[#E5E7EB]" />
                        <div className="h-20 bg-white rounded-lg shadow-sm border border-[#E5E7EB]" />
                        <div className="h-20 bg-white rounded-lg shadow-sm border border-[#E5E7EB]" />
                      </div>
                      <div className="h-32 bg-white rounded-lg shadow-sm border border-[#E5E7EB]" />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Play Button Overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                  <Play className="w-8 h-8 text-[#2A2F3A] ml-1" fill="currentColor" />
                </div>
              </div>
              
              {/* Video Label */}
              <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-full">
                {isEs ? "Ver la plataforma en acción" : "See the platform in action"} • 2:30
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Module Highlights Section */}
      <section className="py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-heading text-2xl sm:text-3xl font-bold text-[#1F2937]">
              {isEs ? "Todo lo que tu operación necesita" : "Everything your operation needs"}
            </h2>
            <p className="mt-2 text-[#6B7280]">
              {isEs ? "Módulos especializados que trabajan juntos" : "Specialized modules that work together"}
            </p>
          </div>

          {/* Module Tabs */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {moduleHighlights.map((module) => {
              const Icon = module.icon;
              return (
                <button
                  key={module.id}
                  onClick={() => setActiveModule(module.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all ${
                    activeModule === module.id
                      ? "bg-[#2A2F3A] text-white shadow-lg"
                      : "bg-white text-[#6B7280] hover:bg-[#E5E7EB] border border-[#E5E7EB]"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{module.title}</span>
                </button>
              );
            })}
          </div>

          {/* Active Module Card */}
          {activeModuleData && (
            <div className="bg-white rounded-2xl shadow-lg border border-[#E5E7EB] overflow-hidden">
              <div className="grid lg:grid-cols-2">
                {/* Left - Info */}
                <div className="p-8 lg:p-10">
                  <div className={`w-12 h-12 rounded-xl ${activeModuleData.bgColor} flex items-center justify-center mb-4`}>
                    <activeModuleData.icon className={`w-6 h-6 bg-gradient-to-r ${activeModuleData.color} bg-clip-text`} style={{color: activeModuleData.color.includes('pink') ? '#EC4899' : activeModuleData.color.includes('blue') ? '#3B82F6' : activeModuleData.color.includes('purple') ? '#8B5CF6' : activeModuleData.color.includes('orange') ? '#F97316' : activeModuleData.color.includes('emerald') ? '#10B981' : '#64748B'}} />
                  </div>
                  <h3 className="font-heading text-2xl font-bold text-[#1F2937] mb-1">
                    {activeModuleData.title}
                  </h3>
                  <p className="text-[#AED768] font-medium mb-6">
                    {isEs ? activeModuleData.subtitleEs : activeModuleData.subtitle}
                  </p>
                  <ul className="space-y-3">
                    {activeModuleData.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-3 text-[#4B5563]">
                        <div className="w-5 h-5 rounded-full bg-[#AED768]/20 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-[#AED768]" />
                        </div>
                        {isEs ? feature.es : feature.en}
                      </li>
                    ))}
                  </ul>
                </div>
                
                {/* Right - Visual */}
                <div className={`bg-gradient-to-br ${activeModuleData.color} p-8 lg:p-10 flex items-center justify-center min-h-[300px]`}>
                  <div className="bg-white/95 rounded-xl shadow-xl p-6 w-full max-w-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <activeModuleData.icon className="w-6 h-6 text-[#2A2F3A]" />
                      <span className="font-semibold text-[#1F2937]">{activeModuleData.title}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 bg-[#E5E7EB] rounded-full w-full" />
                      <div className="h-3 bg-[#E5E7EB] rounded-full w-3/4" />
                      <div className="h-3 bg-[#AED768] rounded-full w-1/2" />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="h-16 bg-[#F7F8FA] rounded-lg" />
                      <div className="h-16 bg-[#F7F8FA] rounded-lg" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Quick Stats / Social Proof */}
      <section className="py-12 px-6 bg-[#2A2F3A]">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: "500+", label: isEs ? "Eventos gestionados" : "Events managed" },
              { value: "98%", label: isEs ? "Satisfacción" : "Satisfaction" },
              { value: "50%", label: isEs ? "Ahorro de tiempo" : "Time saved" },
              { value: "24/7", label: isEs ? "Soporte" : "Support" }
            ].map((stat, idx) => (
              <div key={idx}>
                <p className="text-3xl font-bold text-[#AED768]">{stat.value}</p>
                <p className="text-white/70 text-sm mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations - Compact */}
      <section className="py-12 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-[#6B7280] mb-6">
            {isEs ? "Se integra con las herramientas que ya usas" : "Integrates with tools you already use"}
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            {integrations.map((integration) => (
              <div key={integration.name} className="w-12 h-12 bg-white rounded-xl shadow-sm border border-[#E5E7EB] flex items-center justify-center p-2.5">
                <img src={integration.logo} alt={integration.name} className="w-full h-full object-contain" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing - Compact */}
      <section className="py-16 px-6 bg-white" id="pricing">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-heading text-2xl sm:text-3xl font-bold text-[#1F2937]">
              {isEs ? "Precios simples, sin sorpresas" : "Simple pricing, no surprises"}
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {pricingPlans.map((plan) => (
              <div 
                key={plan.name}
                className={`rounded-2xl p-6 ${
                  plan.highlight 
                    ? "bg-[#2A2F3A] text-white ring-2 ring-[#AED768] scale-105" 
                    : "bg-[#F7F8FA] border border-[#E5E7EB]"
                }`}
              >
                <h3 className={`font-heading text-lg font-bold ${plan.highlight ? "text-white" : "text-[#1F2937]"}`}>
                  {plan.name}
                </h3>
                <div className="mt-2 mb-4">
                  <span className={`text-3xl font-bold ${plan.highlight ? "text-[#AED768]" : "text-[#1F2937]"}`}>
                    {isEs ? plan.priceEs || plan.price : plan.price}
                  </span>
                  {plan.period && (
                    <span className={plan.highlight ? "text-white/60" : "text-[#6B7280]"}>
                      {isEs ? plan.periodEs : plan.period}
                    </span>
                  )}
                </div>
                <p className={`text-sm mb-4 ${plan.highlight ? "text-white/70" : "text-[#6B7280]"}`}>
                  {isEs ? plan.taglineEs : plan.tagline}
                </p>
                <ul className="space-y-2 mb-6">
                  {(isEs ? plan.featuresEs : plan.features).map((feature, idx) => (
                    <li key={idx} className={`flex items-center gap-2 text-sm ${plan.highlight ? "text-white/80" : "text-[#4B5563]"}`}>
                      <Check className={`w-4 h-4 flex-shrink-0 ${plan.highlight ? "text-[#AED768]" : "text-[#AED768]"}`} />
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

      {/* Final CTA */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-[#1F2937] mb-4">
            {isEs ? "¿Listo para simplificar tu operación?" : "Ready to simplify your operation?"}
          </h2>
          <p className="text-[#6B7280] mb-6">
            {isEs ? "Empieza gratis. Sin tarjeta de crédito." : "Start free. No credit card required."}
          </p>
          <Link to="/register">
            <Button size="lg" className="rounded-full px-10 gap-2 bg-[#AED768] hover:bg-[#9BC75A] text-[#1F2937] font-semibold">
              {isEs ? "Comenzar Ahora" : "Get Started Now"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer - Compact */}
      <footer className="py-8 px-6 bg-[#2A2F3A] text-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center">
                <img src="/favicon.png" alt="Kora" className="w-6 h-6" />
              </div>
              <span className="font-heading text-sm font-semibold">Kora OS</span>
              <span className="text-white/40 text-sm">© 2026</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-white/60">
              <a href="#pricing" className="hover:text-white transition-colors">{isEs ? "Precios" : "Pricing"}</a>
              <a href="#" className="hover:text-white transition-colors">{isEs ? "Privacidad" : "Privacy"}</a>
              <a href="#" className="hover:text-white transition-colors">{isEs ? "Términos" : "Terms"}</a>
              <button
                onClick={() => changeLanguage(isEs ? "en" : "es")}
                className="flex items-center gap-1 hover:text-white transition-colors"
              >
                <Globe className="w-3 h-3" />
                {isEs ? "EN" : "ES"}
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
