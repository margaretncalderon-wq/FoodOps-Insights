// React hook: convert an amount between two currencies using cached daily rates.
// Returns { converted, rate, loading, error } and refreshes if from/to/amount change.
//
// Usage:
//   const { converted, rate } = useFxConvert(amount, employee.currency, companyCurrency);
//   {converted != null && employee.currency !== companyCurrency && (
//      <Badge>≈ {formatCurrency(converted)}</Badge>
//   )}

import { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE as API } from "../utils/api";

export function useFxConvert(amount, fromCurrency, toCurrency) {
  const [result, setResult] = useState({ converted: null, rate: null, asOf: null, loading: false, error: null });
  
  useEffect(() => {
    if (!fromCurrency || !toCurrency || amount == null) {
      setResult({ converted: null, rate: null, asOf: null, loading: false, error: null });
      return;
    }
    const from = String(fromCurrency).toUpperCase();
    const to = String(toCurrency).toUpperCase();
    
    if (from === to) {
      setResult({ converted: Number(amount), rate: 1, asOf: null, loading: false, error: null });
      return;
    }
    
    let cancelled = false;
    setResult((s) => ({ ...s, loading: true, error: null }));
    
    (async () => {
      try {
        const res = await axios.get(
          `${API}/api/fx/convert?amount=${amount}&from=${from}&to=${to}`,
          { withCredentials: true }
        );
        if (cancelled) return;
        setResult({
          converted: res.data.converted,
          rate: res.data.rate,
          asOf: res.data.as_of,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setResult({
          converted: null,
          rate: null,
          asOf: null,
          loading: false,
          error: err.response?.data?.detail || "FX unavailable",
        });
      }
    })();
    
    return () => { cancelled = true; };
  }, [amount, fromCurrency, toCurrency]);
  
  return result;
}

export default useFxConvert;
