import { useEffect, useState, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

// Pages
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import RegisterPage from "./pages/RegisterPage";
import GoogleCallbackPage from "./pages/GoogleCallbackPage";
import Dashboard from "./pages/Dashboard";
import CRMPage from "./pages/CRMPageNew";
import ClientDetails from "./pages/ClientDetails";
import EventsPage from "./pages/EventsPage";
import EventDetails from "./pages/EventDetails";
import CalendarPage from "./pages/CalendarPage";
import RecipesPage from "./pages/RecipesPage";
import RecipeBuilder from "./pages/RecipeBuilder";
import InventoryPage from "./pages/InventoryPage";
import FoodOpsPage from "./pages/FoodOpsPage";
import DocumentPreview from "./pages/DocumentPreview";
import SettingsPage from "./pages/SettingsPage";
import ClientPortal from "./pages/ClientPortal";
import LeadFormPage from "./pages/LeadFormPage";
import BusinessClarityPage from "./pages/BusinessClarityPage";
import EventOrchestrationPage from "./pages/EventOrchestrationPage";
import ClientEngagementPage from "./pages/ClientEngagementPage";
import OperationsSuppliesPage from "./pages/OperationsSuppliesPage";
import ImportExportPage from "./pages/ImportExportPage";
import OnboardingPage from "./pages/onboarding/OnboardingPage";
import DemandStudioPage from "./pages/demand-studio/DemandStudioPage";
import DemandStudioOverview from "./pages/demand-studio/DemandStudioOverview";
import CampaignsPage from "./pages/demand-studio/CampaignsPage";
import SocialMediaPage from "./pages/demand-studio/SocialMediaPage";
import ActivationsPage from "./pages/demand-studio/ActivationsPage";
import EmailMarketingPage from "./pages/demand-studio/EmailMarketingPage";
import SpendLedgerPage from "./pages/demand-studio/SpendLedgerPage";
import InsightsPage from "./pages/demand-studio/InsightsPage";
import DemandStudioSettings from "./pages/demand-studio/DemandStudioSettings";
import {
  SuperAdminLayout,
  SuperAdminOverview,
  OrganizationsListPage,
  OrganizationDetailPage,
  GlobalAuditPage,
  CRMPage as SuperAdminCRMPage,
  BIPage,
  SuperAdminClarity,
  SuperAdminSettings
} from "./pages/super-admin";
import UserManagementPage from "./pages/super-admin/UserManagementPage";

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
