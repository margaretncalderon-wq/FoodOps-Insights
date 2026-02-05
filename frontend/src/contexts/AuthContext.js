import { createContext, useContext, useState, useCallback } from "react";
import axios from "axios";
import { API } from "../utils/api";

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
  const [loading, setLoading] = useState(false);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/auth/me`, {
        withCredentials: true,
      });
      setUser(response.data);
      return response.data;
    } catch (error) {
      setUser(null);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const response = await axios.post(
        `${API}/auth/login`,
        { email, password },
        { withCredentials: true }
      );
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
      setUser(response.data);
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
    }
  };

  const loginWithGoogle = async () => {
    try {
      // Get the Google auth URL from backend
      const response = await axios.get(`${API}/auth/google/login`, {
        headers: {
          'Origin': window.location.origin
        }
      });
      // Redirect to Google
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
        loading,
        login,
        register,
        logout,
        checkAuth,
        exchangeSession,
        loginWithGoogle,
        handleGoogleCallback,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
