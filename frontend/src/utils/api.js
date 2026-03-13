// Centralized API URL configuration
// Dynamically determines API URL based on current domain
import axios from "axios";

export const getApiBaseUrl = () => {
  // Always use environment variable first, fallback to current origin
  return process.env.REACT_APP_BACKEND_URL || window.location.origin;
};

export const API_BASE = getApiBaseUrl();
export const API = `${API_BASE}/api`;

// Shared token storage for axios interceptor
let _authToken = null;
export const setAuthToken = (token) => { 
  _authToken = token;
  // Also sync to localStorage
  try {
    if (token) {
      localStorage.setItem("kora_auth_token", token);
    }
  } catch (e) { /* ignore */ }
};
export const getAuthToken = () => {
  // Try memory first, then localStorage
  if (_authToken) return _authToken;
  try {
    return localStorage.getItem("kora_auth_token");
  } catch (e) {
    return null;
  }
};

// Global axios interceptor - adds Authorization header to all requests
axios.interceptors.request.use((config) => {
  config.withCredentials = true;
  const token = getAuthToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle 401 globally and redirect to login
// ONLY redirect if user HAD a token (was authenticated) and it expired
let isRedirectingToLogin = false;
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !isRedirectingToLogin &&
      !error.config?.url?.includes("/auth/login") &&
      !error.config?.url?.includes("/auth/me") &&
      !error.config?.url?.includes("/auth/refresh") &&
      !error.config?.url?.includes("/auth/register")
    ) {
      // Only redirect if user was previously authenticated
      const hadToken = !!_authToken || !!localStorage.getItem("kora_auth_token");
      if (hadToken) {
        isRedirectingToLogin = true;
        try {
          localStorage.removeItem("kora_auth_token");
          localStorage.removeItem("kora_auth_user");
        } catch (e) { /* ignore */ }
        _authToken = null;
        setTimeout(() => {
          if (window.location.pathname !== "/login" && window.location.pathname !== "/register") {
            window.location.href = "/login?expired=1";
          }
          isRedirectingToLogin = false;
        }, 100);
      }
    }
    return Promise.reject(error);
  }
);

// Simple in-memory cache for API responses
const apiCache = new Map();
const CACHE_TTL = 30000; // 30 seconds default TTL

export const getCachedData = (key) => {
  const cached = apiCache.get(key);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.data;
  }
  return null;
};

export const setCachedData = (key, data, ttl = CACHE_TTL) => {
  apiCache.set(key, { data, timestamp: Date.now(), ttl });
};

export const clearCache = (keyPattern) => {
  if (keyPattern) {
    for (const key of apiCache.keys()) {
      if (key.includes(keyPattern)) {
        apiCache.delete(key);
      }
    }
  } else {
    apiCache.clear();
  }
};
