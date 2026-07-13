import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { Loader2, Check, Building2, Briefcase, Wrench, ChevronRight, ChevronLeft, Users, Calendar, ChefHat, Package, Sparkles, Clock, Shield } from "lucide-react";

// Kora Core - Required subscription
const KORA_CORE = {
  price: 69,
  priceAnnual: 59,
  nameEn: "Kora Core",
  nameEs: "Kora Core",
  includes: [
    { en: "System Pulse", es: "System Pulse" },
    { en: "Client Engagement", es: "Client Engagement" },
    { en: "Execution Hub", es: "Execution Hub" },
    { en: "Partners", es: "Partners" },
    { en: "Business Clarity", es: "Business Clarity" },
    { en: "1 Location", es: "1 Ubicación" },
  ]
};

// Industry options with recommended add-ons
const INDUSTRIES = [
  {
    key: "events_hospitality",
    nameEn: "Events & Hospitality",
    nameEs: "Eventos y Hospitalidad",
    descEn: "Catering, weddings, corporate events, venues",
    descEs: "Catering, bodas, eventos corporativos, venues",
    icon: Building2,
    color: "bg-purple-100 text-purple-700 border-purple-300",
    selectedColor: "bg-purple-600 text-white border-purple-600",
    recommendedAddons: ["module_event_suite", "module_culinary_intelligence"],
  },
  {
    key: "professional_services",
    nameEn: "Professional Services",
    nameEs: "Servicios Profesionales",
    descEn: "Consulting, agencies, legal, accounting",
    descEs: "Consultoría, agencias, legal, contabilidad",
    icon: Briefcase,
    color: "bg-blue-100 text-blue-700 border-blue-300",
    selectedColor: "bg-blue-600 text-white border-blue-600",
    recommendedAddons: ["module_demand_studio"],
  },
  {
    key: "generic",
    nameEn: "General Services",
    nameEs: "Servicios Generales",
    descEn: "Any service-based business",
    descEs: "Cualquier negocio de servicios",
    icon: Wrench,
    color: "bg-gray-100 text-gray-700 border-gray-300",
    selectedColor: "bg-gray-700 text-white border-gray-700",
    recommendedAddons: [],
  },
];

// Available add-on modules with pricing
const ADDON_MODULES = [
  {
    key: "module_event_suite",
    nameEn: "Event Suite",
    nameEs: "Event Suite",
    descEn: "Event Orchestration + Venues + Resource Management",
    descEs: "Event Orchestration + Venues + Gestión de Recursos",
    price: 39,
    priceAnnual: 33,
    icon: "🎟️",
    isBundle: true,
    bundleModules: ["module_event_orchestration", "module_venues", "module_resource_management"],
  },
  {
    key: "module_culinary_intelligence",
    nameEn: "Culinary Intelligence",
    nameEs: "Inteligencia Culinaria",
    descEn: "Recipes, food costing, menu engineering, and ingredient management",
    descEs: "Recetas, costeo de alimentos, ingeniería de menús y gestión de ingredientes",
    price: 29,
    priceAnnual: 24,
    icon: "🍽️",
  },
  {
    key: "module_resource_management",
    nameEn: "Resource Management",
    nameEs: "Gestión de Recursos",
    descEn: "Equipment, disposables, and event supplies inventory",
    descEs: "Inventario de equipos, desechables y suministros para eventos",
    price: 19,
    priceAnnual: 16,
    icon: "📦",
  },
  {
    key: "module_demand_studio",
    nameEn: "Demand Generation",
    nameEs: "Demand Generation",
    descEn: "Marketing campaigns, social media, and lead generation",
    descEs: "Campañas de marketing, redes sociales y generación de leads",
    price: 39,
    priceAnnual: 33,
    icon: "📣",
  },
];

export default function RegisterPage() {
  const { register, loginWithGoogle, completeGoogleRegistration, loading } = useAuth();
  const { t, language, changeLanguage } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1); // 1: Industry, 2: Modules, 3: Account details
  const [isFromGoogle, setIsFromGoogle] = useState(false);
  const [googleTempToken, setGoogleTempToken] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    company_name: "",
    deal_code: "",
    industry_template: "",
    selected_modules: [], // Module keys selected by user
  });
  const [showPassword, setShowPassword] = useState(false);
  const [billingCycle, setBillingCycle] = useState("monthly"); // "monthly" or "annual"

  // Check if coming from Google OAuth
  useEffect(() => {
    const fromGoogle = searchParams.get("from") === "google";
    if (fromGoogle) {
      const googleDataStr = sessionStorage.getItem("google_registration_data");
      if (googleDataStr) {
        try {
          const googleData = JSON.parse(googleDataStr);
          setFormData(prev => ({
            ...prev,
            name: googleData.name || "",
            email: googleData.email || "",
          }));
          setGoogleTempToken(googleData.temp_token);
          setIsFromGoogle(true);
          // Clear the session storage
          sessionStorage.removeItem("google_registration_data");
        } catch (e) {
          console.error("Failed to parse Google data:", e);
        }
      }
    }
  }, [searchParams]);

  // Get recommended modules based on industry
  const getRecommendedModules = () => {
    const industry = INDUSTRIES.find(i => i.key === formData.industry_template);
    return industry?.recommendedAddons || [];
  };

  // Calculate total add-on cost
  const calculateAddonCost = () => {
    return formData.selected_modules.reduce((total, moduleKey) => {
      const module = ADDON_MODULES.find(m => m.key === moduleKey);
      return total + (module?.price || 0);
    }, 0);
  };

  const calculateAddonCostAnnual = () => {
    return formData.selected_modules.reduce((total, moduleKey) => {
      const module = ADDON_MODULES.find(m => m.key === moduleKey);
      return total + (module?.priceAnnual || 0);
    }, 0);
  };

  // Toggle module selection
  const toggleModule = (moduleKey) => {
    setFormData(prev => ({
      ...prev,
      selected_modules: prev.selected_modules.includes(moduleKey)
        ? prev.selected_modules.filter(k => k !== moduleKey)
        : [...prev.selected_modules, moduleKey]
    }));
  };

  // When industry changes, pre-select recommended modules
  const handleIndustrySelect = (industryKey) => {
    const industry = INDUSTRIES.find(i => i.key === industryKey);
    setFormData({
      ...formData,
      industry_template: industryKey,
      selected_modules: industry?.recommendedAddons || [],
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Handle Google registration vs normal registration
      if (isFromGoogle && googleTempToken) {
        // Complete Google registration with industry selection
        await completeGoogleRegistration(googleTempToken, formData.company_name, formData.industry_template, formData.deal_code || null);
        toast.success(language === "es" ? "¡Cuenta creada!" : "Account created!");
      } else {
        // Normal registration
        await register({
          ...formData,
          selected_modules: formData.selected_modules,
        });
        toast.success(language === "es" ? "¡Cuenta creada!" : "Account created!");
      }
      
      // If modules are selected, redirect to Stripe payment
      if (formData.selected_modules.length > 0) {
        try {
          const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/payments/create-subscription-checkout`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              origin_url: window.location.origin,
              selected_modules: formData.selected_modules,
              industry_template: formData.industry_template,
            }),
          });
          
          const data = await response.json();
          
          if (data.skip_payment) {
            // Free tier, go directly to dashboard
            navigate("/dashboard");
          } else if (data.checkout_url) {
            // Redirect to Stripe
            window.location.href = data.checkout_url;
          } else {
            // Fallback to dashboard
            navigate("/dashboard");
          }
        } catch (paymentError) {
          console.error("Payment setup error:", paymentError);
          // Account created, but payment failed - user can retry from settings
          toast.warning(language === "es" 
            ? "Cuenta creada. Puedes agregar módulos desde Configuración."
            : "Account created. You can add modules from Settings.");
          navigate("/dashboard");
        }
      } else {
        // No modules selected, go to dashboard
        navigate("/dashboard");
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Registration failed");
    }
  };

  const isEs = language === "es";
  const selectedIndustry = INDUSTRIES.find(i => i.key === formData.industry_template);
  const addonCost = calculateAddonCost();
  const addonCostAnnual = calculateAddonCostAnnual();
  const totalCost = KORA_CORE.price + addonCost;
  const totalCostAnnual = KORA_CORE.priceAnnual + addonCostAnnual;

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Form (White) */}
      <div className="flex-1 flex flex-col justify-center px-8 lg:px-16 xl:px-24 bg-white">
        <div className="w-full max-w-md mx-auto">
          {/* Logo */}
          <Link to="/" className="inline-flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#192332] flex items-center justify-center">
              <img src="/kora-icon.png" alt="Kora OS" className="w-full h-full object-contain" />
            </div>
            <span className="font-heading text-lg font-semibold text-[#1F2937]">Kora OS</span>
          </Link>

          {/* Step Indicator - 3 steps */}
          <div className="flex items-center gap-2 mb-6">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${step >= 1 ? 'bg-[#2563EB] text-white' : 'bg-gray-200 text-gray-500'}`}>
              1
            </div>
            <div className={`flex-1 h-1 transition-colors ${step >= 2 ? 'bg-[#2563EB]' : 'bg-gray-200'}`} />
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${step >= 2 ? 'bg-[#2563EB] text-white' : 'bg-gray-200 text-gray-500'}`}>
              2
            </div>
            <div className={`flex-1 h-1 transition-colors ${step >= 3 ? 'bg-[#2563EB]' : 'bg-gray-200'}`} />
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${step >= 3 ? 'bg-[#2563EB] text-white' : 'bg-gray-200 text-gray-500'}`}>
              3
            </div>
          </div>

          {/* Step 1: Industry Selection */}
          {step === 1 && (
            <>
              <h1 className="font-heading text-2xl lg:text-3xl font-bold text-[#1F2937] mb-2">
                {isEs ? "¿Qué tipo de negocio tienes?" : "What type of business do you have?"}
              </h1>
              <p className="text-[#6B7280] mb-6 text-sm">
                {isEs 
                  ? "Esto nos ayuda a configurar tu experiencia y sugerirte los módulos correctos."
                  : "This helps us set up your experience and suggest the right modules."}
              </p>

              <div className="space-y-3 mb-6">
                {INDUSTRIES.map((industry) => {
                  const Icon = industry.icon;
                  const isSelected = formData.industry_template === industry.key;
                  return (
                    <button
                      key={industry.key}
                      type="button"
                      onClick={() => handleIndustrySelect(industry.key)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                        isSelected ? industry.selectedColor : `${industry.color} hover:border-gray-400`
                      }`}
                      data-testid={`industry-${industry.key}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isSelected ? 'bg-white/20' : ''}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">
                              {isEs ? industry.nameEs : industry.nameEn}
                            </span>
                            {isSelected && <Check className="w-5 h-5" />}
                          </div>
                          <p className={`text-sm mt-0.5 ${isSelected ? 'text-white/80' : 'opacity-70'}`}>
                            {isEs ? industry.descEs : industry.descEn}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <Button
                type="button"
                onClick={() => setStep(2)}
                disabled={!formData.industry_template}
                className="w-full h-12 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium"
                data-testid="continue-to-modules-btn"
              >
                {isEs ? "Continuar" : "Continue"}
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>

              <p className="mt-6 text-center text-sm text-[#6B7280]">
                {isEs ? "¿Ya tienes cuenta?" : "Already have an account?"}{" "}
                <Link to="/login" className="text-[#2563EB] hover:underline font-medium">
                  {isEs ? "Iniciar sesión" : "Log in"}
                </Link>
              </p>
            </>
          )}

          {/* Step 2: Module Selection */}
          {step === 2 && (
            <>
              {/* Back button */}
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#1F2937] mb-4"
                data-testid="back-to-industry-btn"
              >
                <ChevronLeft className="w-4 h-4" />
                {isEs ? "Volver" : "Back"}
              </button>

              {/* Title */}
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-[#2563EB]" />
                <h1 className="font-heading text-xl lg:text-2xl font-bold text-[#1F2937]">
                  {isEs ? "Potencia tu negocio" : "Power up your business"}
                </h1>
              </div>
              <p className="text-[#6B7280] mb-4 text-sm">
                {isEs 
                  ? "Prueba todo gratis por 7 días. Sin compromiso."
                  : "Try everything free for 7 days. No commitment."}
              </p>

              {/* Billing Cycle Toggle */}
              <div className="flex items-center justify-center gap-2 p-2 mb-4 bg-[#F3F4F6] rounded-lg">
                <button
                  type="button"
                  onClick={() => setBillingCycle("monthly")}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    billingCycle === "monthly"
                      ? "bg-white text-[#1F2937] shadow-sm"
                      : "text-[#6B7280] hover:text-[#1F2937]"
                  }`}
                >
                  {isEs ? "Mensual" : "Monthly"}
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle("annual")}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${
                    billingCycle === "annual"
                      ? "bg-white text-[#1F2937] shadow-sm"
                      : "text-[#6B7280] hover:text-[#1F2937]"
                  }`}
                >
                  {isEs ? "Anual" : "Annual"}
                  <span className="px-1.5 py-0.5 text-xs font-semibold bg-[#10B981] text-white rounded">
                    -15%
                  </span>
                </button>
              </div>

              {/* Kora Core - Required */}
              <div className="p-4 mb-4 rounded-xl bg-gradient-to-r from-[#2563EB]/10 to-[#7C3AED]/10 border-2 border-[#2563EB]">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#2563EB] flex items-center justify-center">
                      <Shield className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#1F2937] flex items-center gap-2">
                        Kora Core
                        <span className="px-2 py-0.5 text-xs font-medium bg-[#2563EB] text-white rounded-full">
                          {isEs ? "INCLUIDO" : "INCLUDED"}
                        </span>
                      </p>
                      <p className="text-xs text-[#6B7280] mt-1">
                        {KORA_CORE.includes.map(i => isEs ? i.es : i.en).join(" • ")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[#2563EB]">
                      ${billingCycle === "annual" ? KORA_CORE.priceAnnual : KORA_CORE.price}
                      <span className="text-xs font-normal">/{isEs ? "mes" : "mo"}</span>
                    </p>
                    {billingCycle === "annual" && (
                      <p className="text-xs text-[#10B981] font-medium">
                        {isEs ? "Facturado anualmente" : "Billed annually"}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Add-ons Section */}
              <p className="text-sm font-medium text-[#1F2937] mb-3">
                {isEs ? "Módulos adicionales (opcionales)" : "Additional modules (optional)"}
              </p>

              {/* Recommended badge */}
              {getRecommendedModules().length > 0 && (
                <div className="bg-[#FEF3C7] border border-[#F59E0B] rounded-lg p-3 mb-4">
                  <p className="text-sm text-[#92400E]">
                    <span className="font-medium">💡 {isEs ? "Recomendados para tu industria:" : "Recommended for your industry:"}</span>{" "}
                    {isEs 
                      ? "Los módulos pre-seleccionados son los más populares para tu tipo de negocio."
                      : "Pre-selected modules are the most popular for your business type."}
                  </p>
                </div>
              )}

              {/* Module Cards */}
              <div className="space-y-3 mb-4 max-h-[220px] overflow-y-auto pr-1">
                {ADDON_MODULES.map((module) => {
                  const isSelected = formData.selected_modules.includes(module.key);
                  const isRecommended = getRecommendedModules().includes(module.key);
                  return (
                    <button
                      key={module.key}
                      type="button"
                      onClick={() => toggleModule(module.key)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                        isSelected 
                          ? 'border-[#2563EB] bg-[#EFF6FF] ring-1 ring-[#2563EB]' 
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                      data-testid={`module-${module.key}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
                          isSelected ? 'bg-[#2563EB] text-white' : 'bg-gray-100'
                        }`}>
                          {module.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-semibold ${isSelected ? 'text-[#1E40AF]' : 'text-[#1F2937]'}`}>
                                {isEs ? module.nameEs : module.nameEn}
                              </span>
                              {isRecommended && (
                                <span className="px-2 py-0.5 bg-[#FEF3C7] text-[#92400E] text-xs font-medium rounded-full">
                                  {isEs ? "Recomendado" : "Recommended"}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="text-right">
                                <span className={`text-xs ${isSelected ? 'text-[#3B82F6]' : 'text-[#9CA3AF]'} line-through`}>
                                  ${billingCycle === "annual" ? module.priceAnnual : module.price}/{isEs ? "mes" : "mo"}
                                </span>
                                <p className="text-xs font-medium text-amber-600">{isEs ? "7 días gratis" : "7 days free"}</p>
                              </div>
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                isSelected 
                                  ? 'bg-[#2563EB] border-[#2563EB]' 
                                  : 'border-gray-300 bg-white'
                              }`}>
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                              </div>
                            </div>
                          </div>
                          <p className={`text-sm mt-1 ${isSelected ? 'text-[#3B82F6]' : 'text-[#6B7280]'}`}>
                            {isEs ? module.descEs : module.descEn}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Pricing Summary */}
              <div className="bg-[#F7F8FA] rounded-xl p-4 mb-4">
                {/* Kora Core */}
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-[#1F2937] font-medium">Kora Core</span>
                  <span className="text-[#1F2937] font-semibold">
                    ${billingCycle === "annual" ? KORA_CORE.priceAnnual : KORA_CORE.price}/{isEs ? "mes" : "mo"}
                  </span>
                </div>
                
                {/* Add-ons */}
                {formData.selected_modules.length > 0 && (
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-[#6B7280]">
                      {formData.selected_modules.length} add-on(s)
                    </span>
                    <span className="text-[#1F2937]">
                      +${billingCycle === "annual" ? addonCostAnnual : addonCost}/{isEs ? "mes" : "mo"}
                    </span>
                  </div>
                )}
                
                {/* Total after trial */}
                <div className="border-t border-gray-200 pt-2 mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-[#1F2937]">
                      {billingCycle === "annual" 
                        ? (isEs ? "Total mensual (facturado anual)" : "Monthly total (billed annually)")
                        : (isEs ? "Total mensual" : "Monthly total")}
                    </span>
                    <span className="font-bold text-lg text-[#2563EB]">
                      ${billingCycle === "annual" ? totalCostAnnual : totalCost}/{isEs ? "mes" : "mo"}
                    </span>
                  </div>
                  
                  {billingCycle === "annual" && (
                    <div className="flex items-center justify-between text-sm mb-2 text-[#10B981]">
                      <span>{isEs ? "Ahorro anual" : "Annual savings"}</span>
                      <span className="font-semibold">${(totalCost - totalCostAnnual) * 12}/{isEs ? "año" : "yr"}</span>
                    </div>
                  )}
                  
                  {/* 7 day trial */}
                  <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="flex items-center justify-between">
                      <span className="text-amber-700 text-sm flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {isEs ? "7 días de prueba gratis" : "7-day free trial"}
                      </span>
                      <span className="font-bold text-amber-700">{isEs ? "Hoy: $0" : "Today: $0"}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex-1 h-12 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium"
                  data-testid="continue-to-account-btn"
                >
                  {isEs ? "Continuar" : "Continue"}
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          )}

          {/* Step 3: Account Details */}
          {step === 3 && (
            <>
              {/* Back button */}
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#1F2937] mb-4"
                data-testid="back-to-modules-btn"
              >
                <ChevronLeft className="w-4 h-4" />
                {isEs ? "Volver" : "Back"}
              </button>

              <h1 className="font-heading text-2xl lg:text-3xl font-bold text-[#1F2937] mb-2">
                {isFromGoogle ? (isEs ? "Completa tu registro" : "Complete your registration") : (isEs ? "Crear tu cuenta" : "Create your account")}
              </h1>
              
              {/* Google user info (if from Google) */}
              {isFromGoogle && formData.email && (
                <div className="flex items-center gap-3 p-3 bg-[#F7F8FA] rounded-lg mb-4 border border-[#E5E7EB]">
                  <div className="w-10 h-10 rounded-full bg-[#2563EB] flex items-center justify-center">
                    <span className="text-white font-semibold">{formData.name?.charAt(0)?.toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">{formData.name}</p>
                    <p className="text-sm text-[#6B7280]">{formData.email}</p>
                  </div>
                  <Check className="w-5 h-5 text-green-500 ml-auto" />
                </div>
              )}
              
              {/* Selected Industry & Modules Summary */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {selectedIndustry && (
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${selectedIndustry.color}`}>
                    <selectedIndustry.icon className="w-4 h-4" />
                    {isEs ? selectedIndustry.nameEs : selectedIndustry.nameEn}
                  </div>
                )}
                <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
                  <Clock className="w-4 h-4" />
                  {isEs ? "7 días gratis" : "7 days free"} • ${billingCycle === "annual" ? totalCostAnnual : totalCost}/{isEs ? "mes" : "mo"}
                  {billingCycle === "annual" && <span className="text-[#10B981] font-medium ml-1">(-15%)</span>}
                </div>
              </div>

              {/* Google Register - only show if NOT from Google */}
              {!isFromGoogle && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-12 gap-3 bg-white border-[#E5E7EB] hover:bg-[#F7F8FA] text-[#1F2937] font-medium rounded-lg mb-4"
                    onClick={loginWithGoogle}
                    data-testid="google-register-btn"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    {t("continueWithGoogle")}
                  </Button>

                  {/* Divider */}
                  <div className="relative mb-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-[#E5E7EB]" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-white px-3 text-[#9CA3AF]">
                        {isEs ? "O" : "Or"}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* Registration Form */}
              <form onSubmit={handleSubmit} className="space-y-3">
                {!isFromGoogle && (
                  <Input
                    type="text"
                    placeholder={isEs ? "Tu nombre completo" : "Full name"}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="h-11 bg-white border-[#E5E7EB] rounded-lg placeholder:text-[#9CA3AF]"
                    data-testid="register-name-input"
                  />
                )}
                <Input
                  type="text"
                  placeholder={isEs ? "Nombre de tu empresa" : "Company name"}
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  required
                  className="h-11 bg-white border-[#E5E7EB] rounded-lg placeholder:text-[#9CA3AF]"
                  data-testid="register-company-input"
                />
                <Input
                  type="text"
                  placeholder={isEs ? "Deal Code (opcional)" : "Deal Code (optional)"}
                  value={formData.deal_code}
                  onChange={(e) => setFormData({ ...formData, deal_code: e.target.value })}
                  className="h-11 bg-white border-[#E5E7EB] rounded-lg placeholder:text-[#9CA3AF]"
                  data-testid="register-deal-code-input"
                />
                {!isFromGoogle && (
                  <>
                    <Input
                      type="email"
                      placeholder={isEs ? "nombre@empresa.com" : "name@company.com"}
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      className="h-11 bg-white border-[#E5E7EB] rounded-lg placeholder:text-[#9CA3AF]"
                      data-testid="register-email-input"
                    />
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder={isEs ? "Contraseña (mín. 6 caracteres)" : "Password (min. 6 characters)"}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                        minLength={6}
                        className="h-11 bg-white border-[#E5E7EB] rounded-lg pr-12 placeholder:text-[#9CA3AF]"
                        data-testid="register-password-input"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280]"
                      >
                        {showPassword ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </>
                )}
                <Button
                  type="submit"
                  className="w-full h-11 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium"
                  disabled={loading}
                  data-testid="register-submit-btn"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    isFromGoogle ? (isEs ? "Completar registro" : "Complete registration") : (isEs ? "Crear cuenta" : "Create account")
                  )}
                </Button>
              </form>

              {/* Terms */}
              <p className="mt-4 text-xs text-[#9CA3AF] text-center leading-relaxed">
                {isEs ? "Al continuar, aceptas nuestros " : "By proceeding, you agree to the "}
                <a href="#" className="text-[#2563EB] hover:underline">{isEs ? "Términos de Servicio" : "Terms of Service"}</a>
                {isEs ? " y " : " and "}
                <a href="#" className="text-[#2563EB] hover:underline">{isEs ? "Política de Privacidad" : "Privacy Policy"}</a>
              </p>
            </>
          )}

          {/* Language Toggle */}
          <div className="mt-8 text-center">
            <button
              onClick={() => changeLanguage(language === "en" ? "es" : "en")}
              className="text-sm text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
            >
              {language === "en" ? "🇪🇸 Español" : "🇺🇸 English"}
            </button>
          </div>
        </div>
      </div>

      {/* Right Side - Colorful Illustration (like Monday.com) */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#00B894] relative overflow-hidden items-center justify-center p-12">
        {/* Background decorative elements */}
        <div className="absolute top-20 right-20 w-32 h-32 bg-[#55EFC4] rounded-full opacity-40" />
        <div className="absolute bottom-32 left-16 w-24 h-24 bg-[#81ECEC] rounded-full opacity-50" />
        <div className="absolute top-1/3 left-1/4 w-16 h-16 bg-[#FFEAA7] rounded-full opacity-60" />
        
        {/* Main illustration card */}
        <div className="relative z-10 bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md transform rotate-[2deg]">
          {/* Mock dashboard header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#192332] rounded-lg overflow-hidden flex items-center justify-center">
              <img src="/kora-icon.png" alt="Kora OS" className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="font-semibold text-[#1F2937] text-sm">Kora OS</p>
              <p className="text-xs text-[#9CA3AF]">{isEs ? "Tu nuevo espacio" : "Your new workspace"}</p>
            </div>
          </div>

          {/* Mock task items */}
          <div className="space-y-3">
            {[
              { icon: Users, text: isEs ? "Gestión de clientes" : "Client management", color: "bg-blue-500", status: "done" },
              { icon: Calendar, text: isEs ? "Eventos del mes" : "Events this month", color: "bg-purple-500", status: "done" },
              { icon: ChefHat, text: isEs ? "Costeo de recetas" : "Recipe costing", color: "bg-orange-500", status: "done" },
              { icon: Briefcase, text: isEs ? "Reportes financieros" : "Financial reports", color: "bg-emerald-500", status: "done" },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-[#F7F8FA] rounded-lg">
                <div className={`w-8 h-8 ${item.color} rounded-lg flex items-center justify-center`}>
                  <item.icon className="w-4 h-4 text-white" />
                </div>
                <span className="flex-1 text-sm text-[#1F2937]">{item.text}</span>
                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[#AED768]">
                  <Check className="w-3 h-3 text-white" />
                </div>
              </div>
            ))}
          </div>

          {/* Success message */}
          <div className="mt-4 p-3 bg-[#AED768]/20 rounded-lg text-center">
            <p className="text-sm font-medium text-[#2A2F3A]">
              {isEs ? "✨ Todo listo para comenzar" : "✨ All set to get started"}
            </p>
          </div>
        </div>

        {/* Floating elements */}
        <div className="absolute bottom-24 right-16">
          <div className="w-16 h-16 bg-white/30 rounded-xl backdrop-blur-sm flex items-center justify-center">
            <Check className="w-8 h-8 text-white" />
          </div>
        </div>

        {/* Decorative lines */}
        <svg className="absolute bottom-0 left-0 w-full h-24 opacity-20" viewBox="0 0 400 100">
          <path d="M0 80 Q100 20 200 60 T400 40" stroke="white" strokeWidth="2" fill="none"/>
          <path d="M0 90 Q150 30 300 70 T400 50" stroke="white" strokeWidth="1.5" fill="none"/>
        </svg>
      </div>
    </div>
  );
}
