import { createContext, useContext, useState, useCallback, useEffect } from "react";
import axios from "axios";
import { API } from "../utils/api";
import { setAuthToken } from "../utils/api";

const AuthContext = createContext(null);

// Storage keys
const STORAGE_KEY_TOKEN = "kora_auth_token";
const STORAGE_KEY_USER = "kora_auth_user";

// Helper to safely access localStorage
const storage = {
  getToken: () => {
    try {
      return localStorage.getItem(STORAGE_KEY_TOKEN);
    } catch {
      return null;
    }
  },
  setToken: (token) => {
    try {
      if (token) {
        localStorage.setItem(STORAGE_KEY_TOKEN, token);
      } else {
        localStorage.removeItem(STORAGE_KEY_TOKEN);
      }
    } catch {
      // Ignore storage errors
    }
  },
  getUser: () => {
    try {
      const data = localStorage.getItem(STORAGE_KEY_USER);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },
  setUser: (user) => {
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_KEY_USER);
      }
    } catch {
      // Ignore storage errors
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_USER);
    } catch {
      // Ignore storage errors
    }
  }
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  // Initialize state from localStorage for instant restore
  const [user, setUserState] = useState(() => storage.getUser());
  const [token, setTokenState] = useState(() => storage.getToken());
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Wrapper to update token in state and storage
  const setToken = useCallback((t) => {
    setTokenState(t);
    setAuthToken(t);
    storage.setToken(t);
  }, []);

  // Wrapper to update user in state and storage
  const setUser = useCallback((u) => {
    setUserState(u);
    storage.setUser(u);
  }, []);

  // Initialize auth on mount - validate session with server
  useEffect(() => {
    const initAuth = async () => {
      // Get stored token for Authorization header
      const storedToken = storage.getToken();
      
      try {
        // Build headers - include stored token if available
        const headers = {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        };
        if (storedToken) {
          headers['Authorization'] = `Bearer ${storedToken}`;
        }

        const response = await axios.get(`${API}/auth/me`, {
          withCredentials: true,
          timeout: 10000,
          headers
        });
        
        if (response.data && response.data.user_id) {
          setUser(response.data);
          // If server returns a new token, update it
          if (response.data.access_token) {
            setToken(response.data.access_token);
          }
        } else {
          throw new Error("Invalid user data");
        }
      } catch (error) {
        // Only clear storage if we get a definitive 401
        if (error.response?.status === 401) {
          setUser(null);
          setToken(null);
          storage.clear();
        }
        // For network errors, keep the cached user (optimistic)
        // The user will see their data, and API calls will fail if truly logged out
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    };
    
    initAuth();
  }, [setUser, setToken]);

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
      storage.clear();
      setLoading(false);
      throw error;
    }
  }, [token, setUser, setToken]);

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
      storage.clear();
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
