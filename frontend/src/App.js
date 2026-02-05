import { useEffect, useState, useRef, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Loader2 } from "lucide-react";

// App version for cache busting - increment this on major updates
const APP_VERSION = "2.0.2";

// Loading component for lazy loaded pages
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

// Clear old caches on app load
const clearOldCaches = async () => {
  try {
    const storedVersion = localStorage.getItem("kora_app_version");
    if (storedVersion !== APP_VERSION) {
      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      // Unregister service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(reg => reg.unregister()));
      }
      // Store new version
      localStorage.setItem("kora_app_version", APP_VERSION);
      // Only reload if we had an old version (not first visit)
      if (storedVersion) {
        window.location.reload(true);
      }
    }
  } catch (e) {
    console.log("Cache clear skipped:", e);
  }
};

// Run cache clear immediately
clearOldCaches();

// Core pages (loaded immediately)
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";

// Lazy loaded pages (loaded on demand)
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const GoogleCallbackPage = lazy(() => import("./pages/GoogleCallbackPage"));
const CRMPage = lazy(() => import("./pages/CRMPageNew"));
const ClientDetails = lazy(() => import("./pages/ClientDetails"));
const EventsPage = lazy(() => import("./pages/EventsPage"));
const EventDetails = lazy(() => import("./pages/EventDetails"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const RecipesPage = lazy(() => import("./pages/RecipesPage"));
const RecipeBuilder = lazy(() => import("./pages/RecipeBuilder"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const FoodOpsPage = lazy(() => import("./pages/FoodOpsPage"));
const DocumentPreview = lazy(() => import("./pages/DocumentPreview"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const LeadFormPage = lazy(() => import("./pages/LeadFormPage"));
const BusinessClarityPage = lazy(() => import("./pages/BusinessClarityPage"));
const EventOrchestrationPage = lazy(() => import("./pages/EventOrchestrationPage"));
const ClientEngagementPage = lazy(() => import("./pages/ClientEngagementPage"));
const OperationsSuppliesPage = lazy(() => import("./pages/OperationsSuppliesPage"));
const ImportExportPage = lazy(() => import("./pages/ImportExportPage"));
const OnboardingPage = lazy(() => import("./pages/onboarding/OnboardingPage"));
const DemandStudioPage = lazy(() => import("./pages/demand-studio/DemandStudioPage"));
const DemandStudioOverview = lazy(() => import("./pages/demand-studio/DemandStudioOverview"));
const CampaignsPage = lazy(() => import("./pages/demand-studio/CampaignsPage"));
const SocialMediaPage = lazy(() => import("./pages/demand-studio/SocialMediaPage"));
const ActivationsPage = lazy(() => import("./pages/demand-studio/ActivationsPage"));
const EmailMarketingPage = lazy(() => import("./pages/demand-studio/EmailMarketingPage"));
const SpendLedgerPage = lazy(() => import("./pages/demand-studio/SpendLedgerPage"));
const InsightsPage = lazy(() => import("./pages/demand-studio/InsightsPage"));
const DemandStudioSettings = lazy(() => import("./pages/demand-studio/DemandStudioSettings"));

// Super Admin pages
const SuperAdminLayout = lazy(() => import("./pages/super-admin").then(m => ({ default: m.SuperAdminLayout })));
const SuperAdminOverview = lazy(() => import("./pages/super-admin").then(m => ({ default: m.SuperAdminOverview })));
const OrganizationsListPage = lazy(() => import("./pages/super-admin").then(m => ({ default: m.OrganizationsListPage })));
const OrganizationDetailPage = lazy(() => import("./pages/super-admin").then(m => ({ default: m.OrganizationDetailPage })));
const GlobalAuditPage = lazy(() => import("./pages/super-admin").then(m => ({ default: m.GlobalAuditPage })));
const SuperAdminCRMPage = lazy(() => import("./pages/super-admin").then(m => ({ default: m.CRMPage })));
const BIPage = lazy(() => import("./pages/super-admin").then(m => ({ default: m.BIPage })));
const SuperAdminClarity = lazy(() => import("./pages/super-admin").then(m => ({ default: m.SuperAdminClarity })));
const SuperAdminSettings = lazy(() => import("./pages/super-admin").then(m => ({ default: m.SuperAdminSettings })));
const UserManagementPage = lazy(() => import("./pages/super-admin/UserManagementPage"));

import "./App.css";

// Helper to detect if we're on the admin subdomain
const isAdminSubdomain = () => {
  const hostname = window.location.hostname;
  return hostname.startsWith('admin.') || hostname === 'admin.ourkora.com';
};

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const hasProcessed = useRef(false);
  const { exchangeSession } = useAuth();

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    // Try to get session_id from hash first, then from query params
    let sessionId = null;
    
    // Check hash fragment (e.g., #session_id=xxx or #/dashboard?session_id=xxx)
    const hash = location.hash || "";
    const hashMatch = hash.match(/session_id=([^&\s#]+)/);
    if (hashMatch) {
      sessionId = hashMatch[1];
    }
    
    // Check query params as fallback
    if (!sessionId) {
      const searchParams = new URLSearchParams(location.search);
      sessionId = searchParams.get("session_id");
    }
    
    // Also check if full URL contains session_id (some redirects put it differently)
    if (!sessionId) {
      const fullUrl = window.location.href;
      const urlMatch = fullUrl.match(/session_id=([^&\s#]+)/);
      if (urlMatch) {
        sessionId = urlMatch[1];
      }
    }
    
    if (sessionId) {
      console.log("Found session_id, exchanging...");
      exchangeSession(sessionId)
        .then((user) => {
          // Clear the URL to remove session_id
          window.history.replaceState({}, document.title, "/dashboard");
          navigate("/dashboard", { replace: true, state: { user } });
        })
        .catch((err) => {
          console.error("Session exchange failed:", err);
          navigate("/login", { replace: true });
        });
    } else {
      console.log("No session_id found in URL");
      navigate("/login", { replace: true });
    }
  }, [exchangeSession, navigate, location]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Authenticating...</div>
    </div>
  );
};

const ProtectedRoute = ({ children }) => {
  const { user, loading, checkAuth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(!location.state?.user);

  useEffect(() => {
    if (location.state?.user) {
      setIsChecking(false);
      return;
    }

    const verify = async () => {
      try {
        await checkAuth();
        setIsChecking(false);
      } catch {
        navigate("/login", { replace: true });
      }
    };
    verify();
  }, []);

  if (isChecking || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user && !location.state?.user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

function AppRouter() {
  const location = useLocation();

  // Check for session_id in URL (hash, query params, or full URL)
  const hasSessionId = 
    location.hash?.includes("session_id=") || 
    location.search?.includes("session_id=") ||
    window.location.href.includes("session_id=");
    
  if (hasSessionId) {
    return <AuthCallback />;
  }

  // If on admin subdomain, show only Super Admin routes with simple login
  if (isAdminSubdomain()) {
    return (
      <Routes>
        <Route path="/login" element={<AdminLoginPage />} />
        <Route path="/super-admin" element={<ProtectedRoute><SuperAdminLayout /></ProtectedRoute>}>
          <Route index element={<SuperAdminOverview />} />
          <Route path="crm" element={<SuperAdminCRMPage />} />
          <Route path="clarity" element={<SuperAdminClarity />} />
          <Route path="organizations" element={<OrganizationsListPage />} />
          <Route path="organizations/:id" element={<OrganizationDetailPage />} />
          <Route path="users" element={<UserManagementPage />} />
          <Route path="settings" element={<SuperAdminSettings />} />
        </Route>
        {/* Redirect all other routes to Super Admin */}
        <Route path="*" element={<Navigate to="/super-admin" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
      <Route path="/portal/:documentId" element={<ClientPortal />} />
      <Route path="/forms/:formId" element={<LeadFormPage />} />
      <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
      
      {/* Protected Routes */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      
      {/* Client Engagement Module - Contains CRM, Proposals & Agreements, Calendar */}
      <Route path="/client-engagement/*" element={<ProtectedRoute><ClientEngagementPage /></ProtectedRoute>} />
      
      {/* Legacy routes redirect to Client Engagement */}
      <Route path="/crm/*" element={<ProtectedRoute><CRMPage /></ProtectedRoute>} />
      <Route path="/events" element={<ProtectedRoute><EventsPage /></ProtectedRoute>} />
      <Route path="/events/:eventId" element={<ProtectedRoute><EventDetails /></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
      
      <Route path="/clients/:clientId" element={<ProtectedRoute><ClientDetails /></ProtectedRoute>} />
      <Route path="/recipes" element={<ProtectedRoute><RecipesPage /></ProtectedRoute>} />
      <Route path="/recipes/new" element={<ProtectedRoute><RecipeBuilder /></ProtectedRoute>} />
      <Route path="/recipes/:recipeId" element={<ProtectedRoute><RecipeBuilder /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />
      <Route path="/food-ops/*" element={<ProtectedRoute><FoodOpsPage /></ProtectedRoute>} />
      <Route path="/ops-supplies/*" element={<ProtectedRoute><OperationsSuppliesPage /></ProtectedRoute>} />
      <Route path="/business-clarity/*" element={<ProtectedRoute><BusinessClarityPage /></ProtectedRoute>} />
      <Route path="/event-orchestration/*" element={<ProtectedRoute><EventOrchestrationPage /></ProtectedRoute>} />
      <Route path="/demand-studio" element={<ProtectedRoute><DemandStudioPage /></ProtectedRoute>}>
        <Route index element={<DemandStudioOverview />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="social" element={<SocialMediaPage />} />
        <Route path="activations" element={<ActivationsPage />} />
        <Route path="email-marketing" element={<EmailMarketingPage />} />
        <Route path="spend-ledger" element={<SpendLedgerPage />} />
        <Route path="insights" element={<InsightsPage />} />
        <Route path="settings" element={<DemandStudioSettings />} />
      </Route>
      <Route path="/documents/:documentId" element={<ProtectedRoute><DocumentPreview /></ProtectedRoute>} />
      <Route path="/import-export" element={<ProtectedRoute><ImportExportPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      
      {/* Super Admin Portal - Hidden from normal navigation */}
      <Route path="/super-admin" element={<ProtectedRoute><SuperAdminLayout /></ProtectedRoute>}>
        <Route index element={<SuperAdminOverview />} />
        <Route path="crm" element={<SuperAdminCRMPage />} />
        <Route path="clarity" element={<SuperAdminClarity />} />
        <Route path="organizations" element={<OrganizationsListPage />} />
        <Route path="organizations/:id" element={<OrganizationDetailPage />} />
        <Route path="users" element={<UserManagementPage />} />
        <Route path="settings" element={<SuperAdminSettings />} />
      </Route>
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LanguageProvider>
          <AppRouter />
          <Toaster position="top-right" richColors />
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
