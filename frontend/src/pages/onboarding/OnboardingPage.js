import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { 
  Building2, Globe, CreditCard, Users, Check, ChevronRight, 
  ChevronLeft, Loader2, Crown, Zap, Rocket, Mail, Plus, X 
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "DOP", symbol: "RD$", name: "Dominican Peso" },
  { code: "MXN", symbol: "$", name: "Mexican Peso" },
];

const TIMEZONES = [
  { value: "America/Santo_Domingo", label: "Santo Domingo (AST)" },
  { value: "America/New_York", label: "New York (EST)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PST)" },
  { value: "America/Mexico_City", label: "Mexico City (CST)" },
  { value: "Europe/Madrid", label: "Madrid (CET)" },
];

const ROLES = [
  { value: "admin", label_en: "Admin", label_es: "Administrador", desc_en: "Full access to all features", desc_es: "Acceso completo a todas las funciones" },
  { value: "ops", label_en: "Operations", label_es: "Operaciones", desc_en: "Manage events and inventory", desc_es: "Gestionar eventos e inventario" },
  { value: "finance", label_en: "Finance", label_es: "Finanzas", desc_en: "Access to Business Clarity", desc_es: "Acceso a Business Clarity" },
  { value: "viewer", label_en: "Viewer", label_es: "Visor", desc_en: "Read-only access", desc_es: "Acceso solo lectura" },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState([]);
  
  // Step 1: Organization
  const [orgData, setOrgData] = useState({
    name: "",
    currency: "USD",
    timezone: "America/Santo_Domingo",
    billing_email: ""
  });
  
  // Step 2: Plan
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [billingCycle, setBillingCycle] = useState("monthly");
  
  // Step 4: Invitations
  const [invitations, setInvitations] = useState([]);
  const [newInvite, setNewInvite] = useState({ email: "", role: "ops" });

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const res = await axios.get(`${API}/api/org/plans`, { withCredentials: true });
      setPlans(res.data);
      // Auto-select starter/free plan
      const starterPlan = res.data.find(p => p.price_monthly === 0);
      if (starterPlan) setSelectedPlan(starterPlan.plan_id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateOrg = async () => {
    if (!orgData.name.trim()) {
      toast.error(isEs ? "Ingresa el nombre de tu organización" : "Enter your organization name");
      return;
    }
    
    setLoading(true);
    try {
      await axios.post(`${API}/api/org/create`, orgData, { withCredentials: true });
      toast.success(isEs ? "Organización creada" : "Organization created");
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error creating organization");
    }
    setLoading(false);
  };

  const handleSelectPlan = async () => {
    if (!selectedPlan) {
      toast.error(isEs ? "Selecciona un plan" : "Select a plan");
      return;
    }
    
    setLoading(true);
    try {
      await axios.post(`${API}/api/org/subscribe/${selectedPlan}?billing_cycle=${billingCycle}`, {}, { withCredentials: true });
      toast.success(isEs ? "Plan seleccionado" : "Plan selected");
      
      const plan = plans.find(p => p.plan_id === selectedPlan);
      if (plan && plan.price_monthly > 0) {
        setStep(3); // Go to billing setup
      } else {
        setStep(4); // Skip to invitations for free plan
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error selecting plan");
    }
    setLoading(false);
  };

  const handleBillingSetup = () => {
    // Stub: In real implementation, this would open Stripe Checkout
    toast.info(isEs ? "Configuración de pago (stub)" : "Payment setup (stub)");
    setStep(4);
  };

  const addInvitation = () => {
    if (!newInvite.email.trim() || !newInvite.email.includes("@")) {
      toast.error(isEs ? "Email inválido" : "Invalid email");
      return;
    }
    if (invitations.find(i => i.email === newInvite.email)) {
      toast.error(isEs ? "Email ya agregado" : "Email already added");
      return;
    }
    setInvitations([...invitations, { ...newInvite }]);
    setNewInvite({ email: "", role: "ops" });
  };

  const removeInvitation = (email) => {
    setInvitations(invitations.filter(i => i.email !== email));
  };

  const handleSendInvitations = async () => {
    setLoading(true);
    try {
      for (const inv of invitations) {
        await axios.post(`${API}/api/org/invitations`, inv, { withCredentials: true });
      }
      if (invitations.length > 0) {
        toast.success(isEs ? `${invitations.length} invitaciones enviadas` : `${invitations.length} invitations sent`);
      }
      setStep(5);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error sending invitations");
    }
    setLoading(false);
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/api/org/complete-onboarding`, {}, { withCredentials: true });
      toast.success(isEs ? "¡Bienvenido a Kora!" : "Welcome to Kora!");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error");
    }
    setLoading(false);
  };

  const steps = [
    { num: 1, label: isEs ? "Organización" : "Organization", icon: Building2 },
    { num: 2, label: isEs ? "Plan" : "Plan", icon: Crown },
    { num: 3, label: isEs ? "Pago" : "Billing", icon: CreditCard },
    { num: 4, label: isEs ? "Equipo" : "Team", icon: Users },
    { num: 5, label: isEs ? "Listo" : "Done", icon: Check },
  ];

  const currentPlan = plans.find(p => p.plan_id === selectedPlan);
  const skipBilling = currentPlan && currentPlan.price_monthly === 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">Kora OS</h1>
          <p className="text-muted-foreground">
            {isEs ? "Configura tu espacio de trabajo" : "Set up your workspace"}
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8 gap-2">
          {steps.map((s, idx) => {
            const isActive = step === s.num;
            const isComplete = step > s.num;
            const isSkipped = s.num === 3 && skipBilling;
            
            return (
              <div key={s.num} className="flex items-center">
                <div 
                  className={`flex items-center gap-2 px-3 py-2 rounded-full transition-all ${
                    isActive ? "bg-primary text-primary-foreground" :
                    isComplete ? "bg-green-100 text-green-700" :
                    isSkipped ? "bg-slate-100 text-slate-400" :
                    "bg-slate-100 text-slate-500"
                  }`}
                >
                  <s.icon className="w-4 h-4" />
                  <span className="text-sm font-medium hidden sm:inline">{s.label}</span>
                </div>
                {idx < steps.length - 1 && (
                  <ChevronRight className={`w-4 h-4 mx-1 ${isSkipped ? "text-slate-300" : "text-slate-400"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <Card className="shadow-lg">
          {/* Step 1: Organization */}
          {step === 1 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  {isEs ? "Crea tu Organización" : "Create your Organization"}
                </CardTitle>
                <CardDescription>
                  {isEs 
                    ? "Configura los datos básicos de tu empresa de catering"
                    : "Set up the basic information for your catering company"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>{isEs ? "Nombre de la Organización" : "Organization Name"} *</Label>
                  <Input 
                    value={orgData.name}
                    onChange={(e) => setOrgData({ ...orgData, name: e.target.value })}
                    placeholder={isEs ? "Mi Empresa de Catering" : "My Catering Company"}
                    data-testid="org-name-input"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{isEs ? "Moneda" : "Currency"}</Label>
                    <Select value={orgData.currency} onValueChange={(v) => setOrgData({ ...orgData, currency: v })}>
                      <SelectTrigger data-testid="currency-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map(c => (
                          <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code} - {c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{isEs ? "Zona Horaria" : "Timezone"}</Label>
                    <Select value={orgData.timezone} onValueChange={(v) => setOrgData({ ...orgData, timezone: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map(tz => (
                          <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>{isEs ? "Email de Facturación" : "Billing Email"}</Label>
                  <Input 
                    type="email"
                    value={orgData.billing_email}
                    onChange={(e) => setOrgData({ ...orgData, billing_email: e.target.value })}
                    placeholder="billing@company.com"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {isEs ? "Opcional - por defecto usaremos tu email" : "Optional - we'll use your email by default"}
                  </p>
                </div>

                <div className="flex justify-end pt-4">
                  <Button onClick={handleCreateOrg} disabled={loading} data-testid="create-org-btn">
                    {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {isEs ? "Continuar" : "Continue"}
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 2: Plan Selection */}
          {step === 2 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="w-5 h-5" />
                  {isEs ? "Selecciona tu Plan" : "Select your Plan"}
                </CardTitle>
                <CardDescription>
                  {isEs 
                    ? "Elige el plan que mejor se adapte a tu negocio"
                    : "Choose the plan that best fits your business"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Billing Cycle Toggle */}
                <div className="flex items-center justify-center gap-4 mb-6">
                  <button
                    onClick={() => setBillingCycle("monthly")}
                    className={`px-4 py-2 rounded-lg transition-all ${billingCycle === "monthly" ? "bg-primary text-primary-foreground" : "bg-slate-100"}`}
                  >
                    {isEs ? "Mensual" : "Monthly"}
                  </button>
                  <button
                    onClick={() => setBillingCycle("yearly")}
                    className={`px-4 py-2 rounded-lg transition-all ${billingCycle === "yearly" ? "bg-primary text-primary-foreground" : "bg-slate-100"}`}
                  >
                    {isEs ? "Anual" : "Yearly"}
                    <Badge className="ml-2 bg-green-500">-17%</Badge>
                  </button>
                </div>

                {/* Plans Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {plans.map(plan => {
                    const isSelected = selectedPlan === plan.plan_id;
                    const price = billingCycle === "yearly" ? plan.price_yearly / 12 : plan.price_monthly;
                    
                    return (
                      <div 
                        key={plan.plan_id}
                        onClick={() => setSelectedPlan(plan.plan_id)}
                        className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          isSelected ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"
                        } ${plan.highlight ? "ring-2 ring-amber-400 ring-offset-2" : ""}`}
                        data-testid={`plan-${plan.name}`}
                      >
                        {plan.highlight && (
                          <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-500">
                            {isEs ? "Popular" : "Popular"}
                          </Badge>
                        )}
                        
                        <div className="text-center mb-4">
                          {plan.name === "starter" && <Rocket className="w-8 h-8 mx-auto text-slate-500" />}
                          {plan.name === "professional" && <Zap className="w-8 h-8 mx-auto text-amber-500" />}
                          {plan.name === "enterprise" && <Crown className="w-8 h-8 mx-auto text-purple-500" />}
                          
                          <h3 className="font-bold text-lg mt-2">
                            {isEs ? plan.display_name_es : plan.display_name_en}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {isEs ? plan.description_es : plan.description_en}
                          </p>
                        </div>
                        
                        <div className="text-center mb-4">
                          <span className="text-3xl font-bold">${price.toFixed(0)}</span>
                          <span className="text-muted-foreground">/{isEs ? "mes" : "mo"}</span>
                        </div>
                        
                        <ul className="space-y-2 text-sm">
                          <li className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-green-500" />
                            {plan.limits.events_per_month} {isEs ? "eventos/mes" : "events/mo"}
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-green-500" />
                            {plan.limits.active_users} {isEs ? "usuarios" : "users"}
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-green-500" />
                            {plan.features.culinary_intelligence 
                              ? (isEs ? "Inteligencia Culinaria" : "Culinary Intelligence")
                              : (isEs ? "Business Clarity Básico" : "Basic Business Clarity")}
                          </li>
                        </ul>
                        
                        {isSelected && (
                          <div className="absolute top-2 right-2">
                            <Check className="w-5 h-5 text-primary" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    {isEs ? "Atrás" : "Back"}
                  </Button>
                  <Button onClick={handleSelectPlan} disabled={loading || !selectedPlan} data-testid="select-plan-btn">
                    {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {isEs ? "Continuar" : "Continue"}
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 3: Billing Setup (only for paid plans) */}
          {step === 3 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  {isEs ? "Configurar Pago" : "Set up Billing"}
                </CardTitle>
                <CardDescription>
                  {isEs 
                    ? "Ingresa tu método de pago para activar tu suscripción"
                    : "Enter your payment method to activate your subscription"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                  <p className="text-amber-800">
                    {isEs 
                      ? "🚧 Integración de Stripe en desarrollo. Por ahora, continúa con el trial gratuito."
                      : "🚧 Stripe integration in development. For now, continue with free trial."}
                  </p>
                </div>
                
                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    {isEs ? "Atrás" : "Back"}
                  </Button>
                  <Button onClick={handleBillingSetup}>
                    {isEs ? "Iniciar Trial" : "Start Trial"}
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 4: Team Invitations */}
          {step === 4 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  {isEs ? "Invita a tu Equipo" : "Invite your Team"}
                </CardTitle>
                <CardDescription>
                  {isEs 
                    ? "Agrega miembros de tu equipo para colaborar (opcional)"
                    : "Add team members to collaborate (optional)"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add invitation form */}
                <div className="flex gap-2">
                  <Input 
                    type="email"
                    value={newInvite.email}
                    onChange={(e) => setNewInvite({ ...newInvite, email: e.target.value })}
                    placeholder={isEs ? "email@ejemplo.com" : "email@example.com"}
                    className="flex-1"
                    data-testid="invite-email-input"
                  />
                  <Select value={newInvite.role} onValueChange={(v) => setNewInvite({ ...newInvite, role: v })}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => (
                        <SelectItem key={r.value} value={r.value}>
                          {isEs ? r.label_es : r.label_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={addInvitation} variant="outline" data-testid="add-invite-btn">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {/* Invitations list */}
                {invitations.length > 0 && (
                  <div className="space-y-2">
                    {invitations.map(inv => {
                      const role = ROLES.find(r => r.value === inv.role);
                      return (
                        <div key={inv.email} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                            <span>{inv.email}</span>
                            <Badge variant="secondary">
                              {isEs ? role?.label_es : role?.label_en}
                            </Badge>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removeInvitation(inv.email)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {invitations.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p>{isEs ? "Puedes agregar miembros ahora o después desde Configuración" : "You can add members now or later from Settings"}</p>
                  </div>
                )}

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setStep(currentPlan?.price_monthly > 0 ? 3 : 2)}>
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    {isEs ? "Atrás" : "Back"}
                  </Button>
                  <Button onClick={handleSendInvitations} disabled={loading} data-testid="send-invites-btn">
                    {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {invitations.length > 0 
                      ? (isEs ? `Enviar ${invitations.length} Invitaciones` : `Send ${invitations.length} Invitations`)
                      : (isEs ? "Continuar sin invitar" : "Continue without inviting")}
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 5: Complete */}
          {step === 5 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" />
                  {isEs ? "¡Todo Listo!" : "All Set!"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center py-8">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
                  <Check className="w-10 h-10 text-green-600" />
                </div>
                
                <h3 className="text-xl font-bold mb-2">
                  {isEs ? "Tu organización está lista" : "Your organization is ready"}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {isEs 
                    ? "Comienza a gestionar tus eventos, inventario y finanzas"
                    : "Start managing your events, inventory, and finances"}
                </p>
                
                <Button size="lg" onClick={handleComplete} disabled={loading} data-testid="complete-onboarding-btn">
                  {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {isEs ? "Ir al Dashboard" : "Go to Dashboard"}
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
