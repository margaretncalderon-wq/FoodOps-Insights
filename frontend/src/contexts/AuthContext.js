import { createContext, useContext, useState, useCallback, useEffect } from "react";
import axios from "axios";
import { API } from "../utils/api";
import { setAuthToken } from "../utils/api";

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(null);
  const [loading, setLoading] = useState(true); // Start as true until auth is verified
  const [initialized, setInitialized] = useState(false);

  const setToken = useCallback((t) => {
    setTokenState(t);
    setAuthToken(t);
  }, []);

  // Initialize auth on mount - try to restore session from cookie
  useEffect(() => {
    const initAuth = async () => {
      // Small delay to ensure DOM is ready
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Retry logic for network issues
      const maxRetries = 2;
      let lastError = null;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[Auth] Retry attempt ${attempt}...`);
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
          }
          
          console.log("[Auth] Attempting to restore session...");
          const response = await axios.get(`${API}/auth/me`, {
            withCredentials: true,
            timeout: 10000,
            headers: {
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          });
          
          if (response.data && response.data.user_id) {
            console.log("[Auth] Session restored successfully:", response.data.email);
            setUser(response.data);
            return; // Success, exit the retry loop
          } else {
            throw new Error("Invalid user data received");
          }
        } catch (error) {
          lastError = error;
          if (error.response?.status === 401) {
            console.log("[Auth] No valid session found (401)");
            break; // Don't retry on 401 - session is truly invalid
          }
          // For other errors, continue retrying
          console.warn(`[Auth] Attempt ${attempt + 1} failed:`, error.message);
        }
      }
      
      // All retries failed or 401 received
      console.log("[Auth] Session restore failed, user needs to login");
      setUser(null);
      setToken(null);
    };
    
    initAuth().finally(() => {
      setLoading(false);
      setInitialized(true);
    });
  }, []);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    try {
      const headers = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await axios.get(`${API}/auth/me`, {
        withCredentials: true,
        headers,
      });
      setUser(response.data);
      setLoading(false);
      return response.data;
    } catch (error) {
      setUser(null);
      setToken(null);
      setLoading(false);
      throw error;
    }
  }, [token]);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const response = await axios.post(
        `${API}/auth/login`,
        { email, password },
        { withCredentials: true }
      );
      setToken(response.data.access_token);
      setUser(response.data.user);
      return response.data;
    } finally {
      setLoading(false);
    }
  };

  const register = async (data) => {
    setLoading(true);
    try {
      const response = await axios.post(
        `${API}/auth/register`,
        data,
        { withCredentials: true }
      );
      setToken(response.data.access_token);
      setUser(response.data.user);
      return response.data;
    } finally {
      setLoading(false);
    }
  };

  const exchangeSession = async (sessionId) => {
    setLoading(true);
    try {
      const response = await axios.post(
        `${API}/auth/session`,
        { session_id: sessionId },
        { withCredentials: true }
      );
      if (response.data.access_token) {
        setToken(response.data.access_token);
      }
      setUser(response.data.user || response.data);
      return response.data;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
      setToken(null);
    }
  };

  const loginWithGoogle = async () => {
    try {
      const redirectUri = `${window.location.origin}/auth/google/callback`;
      const response = await axios.get(`${API}/auth/google/login?redirect_uri=${encodeURIComponent(redirectUri)}`);
      window.location.href = response.data.auth_url;
    } catch (error) {
      console.error("Failed to initiate Google login:", error);
    }
  };

  const handleGoogleCallback = async (code, redirectUri) => {
    setLoading(true);
    try {
      const response = await axios.post(
        `${API}/auth/google/callback`,
        { code, redirect_uri: redirectUri },
        { withCredentials: true }
      );
      if (response.data.requires_registration) {
        return response.data;
      }
      if (response.data.access_token) {
        setToken(response.data.access_token);
      }
      setUser(response.data.user);
      return response.data;
    } finally {
      setLoading(false);
    }
  };

  const completeGoogleRegistration = async (tempToken, companyName, industryTemplate = "events_hospitality") => {
    setLoading(true);
    try {
      const response = await axios.post(
        `${API}/auth/google/complete-registration`,
        { 
          temp_token: tempToken, 
          company_name: companyName,
          industry_template: industryTemplate 
        },
        { withCredentials: true }
      );
      if (response.data.access_token) {
        setToken(response.data.access_token);
      }
      setUser(response.data.user);
      return response.data;
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        checkAuth,
        exchangeSession,
        loginWithGoogle,
        handleGoogleCallback,
        completeGoogleRegistration,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
