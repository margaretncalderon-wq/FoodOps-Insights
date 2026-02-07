// Centralized API URL configuration
// Dynamically determines API URL based on current domain

export const getApiBaseUrl = () => {
  const currentHost = window.location.origin;
  
  // If on custom domain (ourkora.com), use same origin for API
  if (currentHost.includes('ourkora.com')) {
    return currentHost;
  }
  
  // If on admin subdomain
  if (currentHost.includes('admin.ourkora.com')) {
    return 'https://ourkora.com';
  }
  
  // Otherwise use environment variable (for preview/development)
  return process.env.REACT_APP_BACKEND_URL || currentHost;
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
