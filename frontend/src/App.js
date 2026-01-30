import { useEffect, useState, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

// Pages
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import Dashboard from "./pages/Dashboard";
import CRMPage from "./pages/CRMPage";
import ClientDetails from "./pages/ClientDetails";
import EventsPage from "./pages/EventsPage";
import EventDetails from "./pages/EventDetails";
import CalendarPage from "./pages/CalendarPage";
import RecipesPage from "./pages/RecipesPage";
import RecipeBuilder from "./pages/RecipeBuilder";
import InventoryPage from "./pages/InventoryPage";
import DocumentPreview from "./pages/DocumentPreview";
import SettingsPage from "./pages/SettingsPage";
import ClientPortal from "./pages/ClientPortal";

import "./App.css";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const hasProcessed = useRef(false);
  const { exchangeSession } = useAuth();

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = location.hash;
    const sessionIdMatch = hash.match(/session_id=([^&]+)/);
    
    if (sessionIdMatch) {
      const sessionId = sessionIdMatch[1];
      exchangeSession(sessionId)
        .then((user) => {
          navigate("/dashboard", { replace: true, state: { user } });
        })
        .catch((err) => {
          console.error("Session exchange failed:", err);
          navigate("/login", { replace: true });
        });
    } else {
      navigate("/login", { replace: true });
    }
  }, []);

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

  // Check URL fragment for session_id BEFORE rendering routes
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/portal/:documentId" element={<ClientPortal />} />
      
      {/* Protected Routes */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/crm" element={<ProtectedRoute><CRMPage /></ProtectedRoute>} />
      <Route path="/crm/:clientId" element={<ProtectedRoute><ClientDetails /></ProtectedRoute>} />
      <Route path="/events" element={<ProtectedRoute><EventsPage /></ProtectedRoute>} />
      <Route path="/events/:eventId" element={<ProtectedRoute><EventDetails /></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
      <Route path="/recipes" element={<ProtectedRoute><RecipesPage /></ProtectedRoute>} />
      <Route path="/recipes/new" element={<ProtectedRoute><RecipeBuilder /></ProtectedRoute>} />
      <Route path="/recipes/:recipeId" element={<ProtectedRoute><RecipeBuilder /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />
      <Route path="/documents/:documentId" element={<ProtectedRoute><DocumentPreview /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      
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
