// Centralized API URL configuration
// Dynamically determines API URL based on current domain
import axios from "axios";
import { formatPydanticDetail } from "./errorFormatter";

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

// Response interceptor - handle 401 globally.
// Strategy: when ANY protected endpoint returns 401 for an authenticated user,
//   1) attempt a silent token refresh via POST /auth/refresh
//   2) if refresh succeeds, retry the original request transparently (user sees nothing)
//   3) if refresh fails (truly expired), then redirect to /login
// This eliminates the "you got kicked to login while clicking around" UX bug.
let isRedirectingToLogin = false;
let refreshInFlight = null; // shared promise so concurrent 401s share the same refresh call

const performRefresh = () => {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = axios
    .post(`${API}/auth/refresh`, {}, { withCredentials: true })
    .then((res) => {
      const newToken = res?.data?.access_token;
      if (newToken) {
        setAuthToken(newToken);
      }
      return res?.data;
    })
    .finally(() => {
      // Allow subsequent refresh attempts once the current one settles
      refreshInFlight = null;
    });
  return refreshInFlight;
};

const isAuthEndpoint = (url = "") =>
  url.includes("/auth/login") ||
  url.includes("/auth/me") ||
  url.includes("/auth/refresh") ||
  url.includes("/auth/register") ||
  url.includes("/auth/logout");

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    // ──────────────────────────────────────────────────────────────────────
    // Normalize pydantic 422 detail BEFORE any consumer reads it.
    // The backend returns: data.detail = [{loc, msg, type, ...}, ...]
    // We rewrite it to a single human-readable string so legacy callers like
    //   toast.error(error.response?.data?.detail)
    // never display "[object Object]" or cryptic "Field required" again.
    // We stash the original array under `data.detail_raw` for advanced callers.
    // ──────────────────────────────────────────────────────────────────────
    try {
      const data = error.response?.data;
      if (data && Array.isArray(data.detail)) {
        const original = data.detail;
        const friendly = formatPydanticDetail(original);
        if (friendly) {
          data.detail_raw = original;
          data.detail = friendly;
        }
      }
    } catch (e) { /* never let formatting throw */ }

    const status = error.response?.status;
    const originalConfig = error.config || {};

    // Only handle 401 from non-auth endpoints, once per request.
    if (
      status === 401 &&
      !originalConfig._retry &&
      !isAuthEndpoint(originalConfig.url) &&
      !isRedirectingToLogin
    ) {
      const hadToken = !!_authToken || !!localStorage.getItem("kora_auth_token");
      if (hadToken) {
        try {
          // Try a silent refresh first.
          const refreshed = await performRefresh();
          // Mark and retry the original request (with new Authorization header if applicable).
          originalConfig._retry = true;
          const freshToken = refreshed?.access_token || getAuthToken();
          if (freshToken) {
            originalConfig.headers = {
              ...(originalConfig.headers || {}),
              Authorization: `Bearer ${freshToken}`,
            };
          }
          return axios(originalConfig);
        } catch (refreshErr) {
          // Refresh truly failed — user must log in again.
          isRedirectingToLogin = true;
          try {
            localStorage.removeItem("kora_auth_token");
            localStorage.removeItem("kora_auth_user");
          } catch (e) { /* ignore */ }
          _authToken = null;
          setTimeout(() => {
            if (
              window.location.pathname !== "/login" &&
              window.location.pathname !== "/register"
            ) {
              window.location.href = "/login?expired=1";
            }
            isRedirectingToLogin = false;
          }, 100);
        }
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
