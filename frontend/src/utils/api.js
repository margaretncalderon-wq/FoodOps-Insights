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
