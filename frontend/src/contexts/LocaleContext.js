import { useState, useEffect, useCallback, createContext, useContext } from "react";
import axios from "axios";
import { API_BASE as API } from "../utils/api";
import { fmtNum } from "../utils/format";

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const [locale, setLocale] = useState({
    currency: "DOP",
    timezone: "America/Santo_Domingo",
    language: "es",
  });
  const [currencies, setCurrencies] = useState([]);
  const [timezones, setTimezones] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const fetchLocale = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/org-config/locale`, { withCredentials: true });
      setLocale({
        currency: res.data.currency || "DOP",
        timezone: res.data.timezone || "America/Santo_Domingo",
        language: res.data.language || "es",
      });
      setCurrencies(res.data.supported_currencies || []);
      setTimezones(res.data.supported_timezones || []);
    } catch { /* not logged in yet */ }
    setLoaded(true);
  }, []);

  useEffect(() => { fetchLocale(); }, [fetchLocale]);

  const updateLocale = useCallback(async (updates) => {
    try {
      const res = await axios.put(`${API}/api/org-config/locale`, updates, { withCredentials: true });
      setLocale({
        currency: res.data.currency || locale.currency,
        timezone: res.data.timezone || locale.timezone,
        language: res.data.language || locale.language,
      });
      return true;
    } catch {
      return false;
    }
  }, [locale]);

  const formatCurrency = useCallback((amount) => {
    if (amount == null || isNaN(amount)) return "-";
    const currInfo = currencies.find(c => c.code === locale.currency);
    const loc = currInfo?.locale || "en-US";
    try {
      return new Intl.NumberFormat(loc, { style: "currency", currency: locale.currency }).format(amount);
    } catch {
      return `${locale.currency} ${fmtNum((amount))}`;
    }
  }, [locale.currency, currencies]);

  const formatDate = useCallback((dateStr) => {
    if (!dateStr) return "-";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(locale.language === "es" ? "es-DO" : "en-US", {
        timeZone: locale.timezone,
        year: "numeric", month: "short", day: "numeric",
      });
    } catch {
      return dateStr;
    }
  }, [locale.timezone, locale.language]);

  const formatDateTime = useCallback((dateStr) => {
    if (!dateStr) return "-";
    try {
      const date = new Date(dateStr);
      return date.toLocaleString(locale.language === "es" ? "es-DO" : "en-US", {
        timeZone: locale.timezone,
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  }, [locale.timezone, locale.language]);

  return (
    <LocaleContext.Provider value={{ locale, currencies, timezones, loaded, updateLocale, formatCurrency, formatDate, formatDateTime, refetch: fetchLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) return {
    locale: { currency: "DOP", timezone: "America/Santo_Domingo", language: "es" },
    currencies: [], timezones: [],
    formatCurrency: (a) => `$${a}`,
    formatDate: (d) => d,
    formatDateTime: (d) => d,
    updateLocale: async () => false,
    refetch: () => {},
  };
  return context;
}
