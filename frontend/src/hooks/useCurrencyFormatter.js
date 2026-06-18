// Shared currency formatter that respects the company's currency (from Settings → General).
// Falls back to USD when not configured.

import { useOrgConfig } from "../contexts/OrgConfigContext";
import { fmtNum } from "../utils/format";

const CURRENCY_LOCALES = {
  USD: "en-US", EUR: "es-ES", GBP: "en-GB",
  MXN: "es-MX", DOP: "es-DO", COP: "es-CO", ARS: "es-AR", BRL: "pt-BR", CLP: "es-CL", PEN: "es-PE",
  CAD: "en-CA", CHF: "de-CH", JPY: "ja-JP", CNY: "zh-CN", INR: "en-IN", PYG: "es-PY", UYU: "es-UY",
  VES: "es-VE", GTQ: "es-GT", HNL: "es-HN", NIO: "es-NI", CRC: "es-CR", PAB: "es-PA",
  BOB: "es-BO", BBD: "en-BB", BSD: "en-BS", BMD: "en-BM",
};

export function buildCurrencyFormatter(currency) {
  const code = (currency || "USD").toUpperCase();
  const locale = CURRENCY_LOCALES[code] || "en-US";
  try {
    return (n) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(n) || 0);
  } catch {
    return (n) => `${code} ${fmtNum((Number(n) || 0))}`;
  }
}

/**
 * React hook: returns a formatCurrency function bound to the company's
 * currency setting. Components must be inside an <OrgConfigProvider>.
 */
export function useCurrencyFormatter() {
  const { companyCurrency } = useOrgConfig();
  return {
    formatCurrency: buildCurrencyFormatter(companyCurrency),
    currency: companyCurrency || "USD",
  };
}

export default useCurrencyFormatter;
