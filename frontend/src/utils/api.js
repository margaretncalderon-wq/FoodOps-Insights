// Centralized API URL configuration
// Dynamically determines API URL based on current domain

export const getApiBaseUrl = () => {
  // Always use environment variable first, fallback to current origin
  return process.env.REACT_APP_BACKEND_URL || window.location.origin;
};

export const API_BASE = getApiBaseUrl();
export const API = `${API_BASE}/api`;

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
