import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useLanguage } from "../contexts/LanguageContext";
import { Calendar, Users, ChefHat, FileText, CheckCircle, ArrowRight } from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Client CRM",
    titleEs: "CRM de Clientes",
    description: "Track leads, manage pipeline, and automate follow-ups",
    descriptionEs: "Rastrea prospectos, gestiona pipeline y automatiza seguimientos",
  },
  {
    icon: Calendar,
    title: "Event Management",
    titleEs: "Gestión de Eventos",
    description: "Detailed views, timelines, tasks and complete event coordination",
    descriptionEs: "Vistas detalladas, cronogramas, tareas y coordinación completa",
  },
  {
    icon: ChefHat,
    title: "Recipe Costing",
    titleEs: "Costeo de Recetas",
    description: "AI-powered quantity analysis with real-time ingredient pricing",
    descriptionEs: "Análisis de cantidades con IA y precios de ingredientes en tiempo real",
  },
  {
    icon: FileText,
    title: "Documents",
    titleEs: "Documentos",
    description: "BEO, quotes, kitchen sheets, and digital signatures",
    descriptionEs: "BEO, cotizaciones, hojas de cocina y firmas digitales",
  },
];

export default function LandingPage() {
  const { language, changeLanguage } = useLanguage();
  const isEs = language === "es";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <span className="font-heading text-xl font-bold text-white">E</span>
            </div>
            <div>
              <h1 className="font-heading text-lg font-semibold text-foreground">Evoke</h1>
              <p className="text-xs text-muted-foreground">OS</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => changeLanguage(isEs ? "en" : "es")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {isEs ? "EN" : "ES"}
            </button>
            <Link to="/login">
              <Button variant="ghost" data-testid="login-nav-btn">
                {isEs ? "Iniciar Sesión" : "Login"}
              </Button>
            </Link>
            <Link to="/register">
              <Button className="rounded-full px-6" data-testid="get-started-btn">
                {isEs ? "Comenzar" : "Get Started"}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="animate-fadeIn">
              <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
                {isEs
                  ? "Gestión de Eventos y Catering Simplificada"
                  : "Event & Catering Management Made Simple"}
              </h1>
              <p className="mt-6 text-lg text-muted-foreground max-w-xl">
                {isEs
                  ? "Optimiza la planificación de eventos, costeo de recetas, CRM y facturación — todo en una plataforma potente y personalizable."
                  : "Streamline event planning, recipe costing, CRM, and invoicing — all in one powerful, customizable platform."}
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link to="/register">
                  <Button size="lg" className="rounded-full px-8 gap-2" data-testid="hero-cta-btn">
                    {isEs ? "Comenzar Gratis" : "Start Free"}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link to="/login">
                  <Button size="lg" variant="outline" className="rounded-full px-8">
                    {isEs ? "Ver Demo" : "View Demo"}
                  </Button>
                </Link>
              </div>
              <div className="mt-8 flex items-center gap-6 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-success" />
                  {isEs ? "Sin tarjeta requerida" : "No credit card required"}
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-success" />
                  {isEs ? "Soporte multilingüe" : "Multilingual support"}
                </span>
              </div>
            </div>
            <div className="relative animate-fadeIn" style={{ animationDelay: "0.2s" }}>
              <img
                src="https://images.unsplash.com/photo-1768777270907-235286662f98?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"
                alt="Elegant wedding reception"
                className="rounded-2xl shadow-soft w-full"
              />
              <div className="absolute -bottom-6 -left-6 bg-white rounded-xl p-4 shadow-card border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-success" />
                  </div>
                  <div>
                    <p className="text-2xl font-heading font-bold">150+</p>
                    <p className="text-xs text-muted-foreground">
                      {isEs ? "Eventos este mes" : "Events this month"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-foreground">
              {isEs ? "Todo lo que necesitas" : "Everything you need"}
            </h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              {isEs
                ? "Una plataforma completa para gestionar tu negocio de eventos y catering"
                : "A complete platform to manage your event and catering business"}
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="bg-white rounded-xl p-6 border border-border hover:shadow-card transition-all duration-300 animate-fadeIn"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-primary" strokeWidth={1.5} />
                  </div>
                  <h3 className="font-heading text-lg font-semibold mb-2">
                    {isEs ? feature.titleEs : feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {isEs ? feature.descriptionEs : feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-foreground">
            {isEs
              ? "¿Listo para transformar tu negocio?"
              : "Ready to transform your business?"}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {isEs
              ? "Únete a cientos de profesionales de eventos que confían en Kora OS"
              : "Join hundreds of event professionals who trust Kora OS"}
          </p>
          <div className="mt-8">
            <Link to="/register">
              <Button size="lg" className="rounded-full px-10 gap-2" data-testid="cta-btn">
                {isEs ? "Crear Cuenta Gratis" : "Create Free Account"}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="font-heading text-sm font-bold text-white">K</span>
            </div>
            <span className="text-sm text-muted-foreground">
              © 2024 Kora OS
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">
              {isEs ? "Privacidad" : "Privacy"}
            </a>
            <a href="#" className="hover:text-foreground transition-colors">
              {isEs ? "Términos" : "Terms"}
            </a>
            <a href="#" className="hover:text-foreground transition-colors">
              {isEs ? "Contacto" : "Contact"}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
