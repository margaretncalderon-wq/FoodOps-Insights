// Inline badge that shows "≈ CompanyCurrency Amount" when the employee's salary currency
// differs from the company's. No-op otherwise.

import { useFxConvert } from "../hooks/useFxConvert";
import { useCurrencyFormatter, buildCurrencyFormatter } from "../hooks/useCurrencyFormatter";
import { RefreshCw, TrendingUp } from "lucide-react";

export function FxConvertBadge({ amount, from, className = "" }) {
  const { currency: companyCurrency } = useCurrencyFormatter();
  // Call hook unconditionally (rules of hooks); we'll bail out below if not needed.
  const { converted, rate, loading, error } = useFxConvert(amount, from, companyCurrency);
  const fmt = buildCurrencyFormatter(companyCurrency);
  
  // Skip when same currency or no amount
  if (!from || !companyCurrency || from.toUpperCase() === companyCurrency.toUpperCase()) return null;
  if (!Number.isFinite(Number(amount)) || Number(amount) === 0) return null;
  
  if (loading) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs text-muted-foreground ${className}`}>
        <RefreshCw className="w-3 h-3 animate-spin" />
        ...
      </span>
    );
  }
  if (error || converted == null) return null;
  
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs text-muted-foreground ${className}`}
      title={`Tasa: 1 ${from} = ${rate} ${companyCurrency}`}
      data-testid="fx-convert-badge"
    >
      <TrendingUp className="w-3 h-3 text-emerald-600" />
      ≈ {fmt(converted)}
    </span>
  );
}

export default FxConvertBadge;
