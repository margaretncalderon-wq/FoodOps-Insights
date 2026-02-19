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
    title: "Event Suite",
    subtitle: "Events & Venues",
    subtitleEs: "Eventos y Venues",
    features: [
      { en: "Event blueprints & templates", es: "Plantillas de eventos" },
      { en: "Run of show timeline", es: "Timeline de eventos" },
      { en: "Venue & room management", es: "Gestión de venues y salones" },
      { en: "Production documents", es: "Documentos de producción" }
    ]
  },
  {
    id: "projects",
    icon: Target,
    color: "from-indigo-500 to-blue-500",
    bgColor: "bg-indigo-500/10",
    title: "Project Orchestration",
    subtitle: "Projects & Deliverables",
    subtitleEs: "Proyectos y Entregables",
    features: [
      { en: "Project planning & milestones", es: "Planificación y hitos" },
      { en: "Task management", es: "Gestión de tareas" },
      { en: "Team collaboration", es: "Colaboración de equipo" },
      { en: "Client deliverables", es: "Entregables al cliente" }
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
    id: "resources",
    icon: Package,
    color: "from-slate-500 to-gray-600",
    bgColor: "bg-slate-500/10",
    title: "Resource Management",
    subtitle: "Assets & Scheduling",
    subtitleEs: "Activos y Programación",
    features: [
      { en: "Equipment tracking", es: "Control de equipos" },
      { en: "Resource scheduling", es: "Programación de recursos" },
      { en: "Maintenance schedules", es: "Programación de mantenimiento" },
      { en: "Availability management", es: "Gestión de disponibilidad" }
    ]
  }
];

// Integrations - using reliable CDN icons
const integrations = [
  { name: "Google Workspace", logo: "https://www.gstatic.com/images/branding/product/2x/hh_google_g_512dp.png" },
  { name: "DocuSign", logo: "https://cdn.brandfetch.io/idS6L1qwUH/w/400/h/400/theme/dark/icon.png" },
  { name: "Meta", logo: "https://cdn.brandfetch.io/idP9n85XT2/theme/dark/symbol.svg" },
  { name: "Google Ads", logo: "https://cdn.brandfetch.io/idGBh5d47W/theme/dark/symbol.svg" },
  { name: "Stripe", logo: "https://cdn.brandfetch.io/idxAg10C0L/theme/dark/symbol.svg" },
  { name: "WhatsApp", logo: "https://cdn.brandfetch.io/idZvUjJPKC/theme/dark/symbol.svg" }
];

// Pricing plans - Updated to reflect Kora Core + Add-ons model
const pricingPlans = [
  {
    name: "Kora Core",
    price: "$69",
    period: "/mo",
    periodEs: "/mes",
    tagline: "Everything you need to run your business.",
    taglineEs: "Todo lo que necesitas para operar tu negocio.",
    features: ["CRM & Pipeline", "Client Management", "Proposals & Invoices", "Financial Dashboard", "Unlimited users", "All industries"],
    featuresEs: ["CRM y Pipeline", "Gestión de Clientes", "Propuestas y Facturas", "Dashboard Financiero", "Usuarios ilimitados", "Todas las industrias"],
    cta: "Start 7-Day Trial",
    ctaEs: "Prueba 7 Días Gratis",
    highlight: true
  }
];

// Add-on modules for Kora Core
const addonModules = [
  {
    name: "Event Suite",
    nameEs: "Suite de Eventos",
    price: "$39/mo",
    priceEs: "$39/mes",
    description: "Event Orchestration + Venues combined",
    descriptionEs: "Orquestación de Eventos + Venues combinados",
    icon: Calendar
  },
  {
    name: "Project Orchestration",
    nameEs: "Orquestación de Proyectos",
    price: "$39/mo",
    priceEs: "$39/mes",
    description: "Project planning, timelines & deliverables",
    descriptionEs: "Planificación de proyectos, timelines y entregables",
    icon: Target
  },
  {
    name: "Culinary Intelligence",
    nameEs: "Inteligencia Culinaria",
    price: "$29/mo",
    priceEs: "$29/mes",
    description: "Recipe costing & inventory management",
    descriptionEs: "Costeo de recetas y gestión de inventario",
    icon: ChefHat
  },
  {
    name: "Demand Studio",
    nameEs: "Demand Studio",
    price: "$29/mo",
    priceEs: "$29/mes",
    description: "Marketing campaigns & ROI tracking",
    descriptionEs: "Campañas de marketing y seguimiento de ROI",
    icon: Megaphone
  },
  {
    name: "Resource Management",
    nameEs: "Gestión de Recursos",
    price: "$19/mo",
    priceEs: "$19/mes",
    description: "Equipment, venues & resource scheduling",
    descriptionEs: "Equipos, venues y programación de recursos",
    icon: Package
  }
];

// Industries we serve
const industries = [
  {
    name: "Events & Hospitality",
    nameEs: "Eventos y Hospitalidad",
    description: "Catering, weddings, corporate events, venues",
    descriptionEs: "Catering, bodas, eventos corporativos, venues",
    icon: Calendar,
    color: "bg-purple-100 text-purple-600"
  },
  {
    name: "Professional Services",
    nameEs: "Servicios Profesionales",
    description: "Agencies, consulting, legal, accounting",
    descriptionEs: "Agencias, consultoría, legal, contabilidad",
    icon: Briefcase,
    color: "bg-blue-100 text-blue-600"
  },
  {
    name: "General Services",
    nameEs: "Servicios Generales",
    description: "Any service-based business",
    descriptionEs: "Cualquier negocio basado en servicios",
    icon: Building2,
    color: "bg-emerald-100 text-emerald-600"
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
                : "Clients, projects, events, inventory, marketing, and finance. All connected."}
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
          <div className="flex flex-wrap justify-center items-center gap-10">
            {/* Google Workspace */}
            <div className="opacity-60 hover:opacity-100 transition-all duration-300 hover:scale-110 cursor-pointer" title="Google Workspace">
              <svg className="w-10 h-10 grayscale hover:grayscale-0 transition-all duration-300" viewBox="0 0 24 24" fill="#4285F4">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            </div>
            {/* DocuSign */}
            <div className="opacity-60 hover:opacity-100 transition-all duration-300 hover:scale-110 cursor-pointer" title="DocuSign">
              <svg className="w-10 h-10 grayscale hover:grayscale-0 transition-all duration-300" viewBox="0 0 24 24" fill="#FFCD00">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-7.332 7.332a.75.75 0 01-1.06 0L6.106 12.16a.75.75 0 111.06-1.06l2.866 2.865 6.802-6.803a.75.75 0 011.06 1.06z"/>
              </svg>
            </div>
            {/* Meta - Infinity Logo */}
            <div className="opacity-60 hover:opacity-100 transition-all duration-300 hover:scale-110 cursor-pointer" title="Meta">
              <svg className="w-12 h-10 grayscale hover:grayscale-0 transition-all duration-300" viewBox="0 0 800 400">
                <defs>
                  <linearGradient id="metaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{stopColor:"#0081FB"}}/>
                    <stop offset="50%" style={{stopColor:"#0064E0"}}/>
                    <stop offset="100%" style={{stopColor:"#0082FB"}}/>
                  </linearGradient>
                </defs>
                <path fill="url(#metaGrad)" d="M186.8 200c0-66.3-53.7-120-120-120S-53.2 133.7-53.2 200s53.7 120 120 120c33.1 0 63.1-13.4 84.8-35.2L400 36.5l248.4 248.3c21.7 21.8 51.7 35.2 84.8 35.2 66.3 0 120-53.7 120-120s-53.7-120-120-120c-33.1 0-63.1 13.4-84.8 35.2L400 363.5 151.6 115.2C129.9 93.4 99.9 80 66.8 80c-66.3 0-120 53.7-120 120z"/>
              </svg>
            </div>
            {/* Google Ads */}
            <div className="opacity-60 hover:opacity-100 transition-all duration-300 hover:scale-110 cursor-pointer" title="Google Ads">
              <svg className="w-10 h-10 grayscale hover:grayscale-0 transition-all duration-300" viewBox="0 0 192 192">
                <path fill="#FBBC04" d="M96 0L0 166.3l27.7 16L96 48z"/>
                <path fill="#4285F4" d="M96 0l96 166.3-27.7 16L96 48z"/>
                <path fill="#34A853" d="M27.7 182.3L96 48l27.7 16-68.3 118.3z"/>
                <circle fill="#EA4335" cx="27.7" cy="166.3" r="27.7"/>
              </svg>
            </div>
            {/* Stripe */}
            <div className="opacity-60 hover:opacity-100 transition-all duration-300 hover:scale-110 cursor-pointer" title="Stripe">
              <svg className="w-10 h-10 grayscale hover:grayscale-0 transition-all duration-300" viewBox="0 0 24 24" fill="#635BFF">
                <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
              </svg>
            </div>
            {/* WhatsApp */}
            <div className="opacity-60 hover:opacity-100 transition-all duration-300 hover:scale-110 cursor-pointer" title="WhatsApp">
              <svg className="w-10 h-10 grayscale hover:grayscale-0 transition-all duration-300" viewBox="0 0 24 24" fill="#25D366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing - Updated to Core + Add-ons model */}
      <section className="py-16 px-6 bg-white" id="pricing">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-heading text-2xl sm:text-3xl font-bold text-[#1F2937]">
              {isEs ? "Un precio simple para manejar el núcleo de tu negocio" : "One simple price, to run the core of your business"}
            </h2>
            <p className="mt-2 text-[#6B7280]">
              {isEs ? "Kora Core + módulos opcionales según tu industria" : "Kora Core + optional modules for your industry"}
            </p>
          </div>

          {/* Main Pricing Card */}
          <div className="max-w-lg mx-auto mb-12">
            <div className="bg-[#2A2F3A] rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-[#AED768] text-[#1F2937] text-xs font-bold px-3 py-1 rounded-full">
                {isEs ? "7 DÍAS GRATIS" : "7 DAYS FREE"}
              </div>
              <h3 className="font-heading text-2xl font-bold mb-2">Kora Core</h3>
              <p className="text-white/70 mb-4">
                {isEs ? "Todo lo que necesitas para operar tu negocio" : "Everything you need to run your business"}
              </p>
              <div className="mb-6">
                <span className="text-5xl font-bold text-[#AED768]">$69</span>
                <span className="text-white/60 text-lg">/{isEs ? "mes" : "mo"}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  { en: "CRM & Sales Pipeline", es: "CRM y Pipeline de Ventas" },
                  { en: "Client Management", es: "Gestión de Clientes" },
                  { en: "Proposals & Invoicing", es: "Propuestas y Facturación" },
                  { en: "Financial Dashboard", es: "Dashboard Financiero" },
                  { en: "Unlimited Users", es: "Usuarios Ilimitados" },
                  { en: "Works for any industry", es: "Funciona para cualquier industria" }
                ].map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-white/90">
                    <Check className="w-5 h-5 text-[#AED768] flex-shrink-0" />
                    {isEs ? feature.es : feature.en}
                  </li>
                ))}
              </ul>
              <Link to="/register">
                <Button className="w-full h-12 rounded-full bg-[#AED768] hover:bg-[#9BC75A] text-[#1F2937] font-semibold text-lg">
                  {isEs ? "Comenzar Prueba Gratis" : "Start Free Trial"}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <p className="text-center text-white/50 text-sm mt-4">
                {isEs ? "Sin tarjeta de crédito requerida" : "No credit card required"}
              </p>
            </div>
          </div>

          {/* Add-on Modules */}
          <div className="mb-12">
            <h3 className="text-center font-heading text-xl font-bold text-[#1F2937] mb-6">
              {isEs ? "Potencia tu operación con módulos especializados" : "Power up with specialized modules"}
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {addonModules.map((addon) => {
                const Icon = addon.icon;
                return (
                  <div key={addon.name} className="bg-[#F7F8FA] rounded-xl p-5 border border-[#E5E7EB] hover:border-[#AED768] hover:shadow-md transition-all">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                        <Icon className="w-5 h-5 text-[#2A2F3A]" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-[#1F2937] text-sm">{isEs ? addon.nameEs : addon.name}</h4>
                        <p className="text-[#AED768] text-sm font-bold">{isEs ? addon.priceEs : addon.price}</p>
                      </div>
                    </div>
                    <p className="text-[#6B7280] text-xs">{isEs ? addon.descriptionEs : addon.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Industries */}
          <div className="bg-[#F7F8FA] rounded-2xl p-8">
            <h3 className="text-center font-heading text-xl font-bold text-[#1F2937] mb-6">
              {isEs ? "Diseñado para tu industria" : "Designed for your industry"}
            </h3>
            <div className="grid sm:grid-cols-3 gap-4">
              {industries.map((industry) => {
                const Icon = industry.icon;
                return (
                  <div key={industry.name} className="bg-white rounded-xl p-5 border border-[#E5E7EB] text-center">
                    <div className={`w-12 h-12 ${industry.color} rounded-xl flex items-center justify-center mx-auto mb-3`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <h4 className="font-semibold text-[#1F2937] mb-1">{isEs ? industry.nameEs : industry.name}</h4>
                    <p className="text-[#6B7280] text-sm">{isEs ? industry.descriptionEs : industry.description}</p>
                  </div>
                );
              })}
            </div>
            <p className="text-center text-[#6B7280] text-sm mt-6">
              {isEs 
                ? "Selecciona tu industria al registrarte y Kora se adapta automáticamente con la terminología y flujos correctos."
                : "Select your industry when you sign up and Kora automatically adapts with the right terminology and workflows."}
            </p>
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
