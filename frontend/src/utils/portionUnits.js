/**
 * Format helpers for portion units across the Culinary Intelligence module.
 *
 * Generic placeholder units (unit, serving, portion, plate, bowl, tray, piece)
 * are noisy when shown next to a number ("10 unit"). For these we return an
 * empty string so the UI shows just the number (or omits the unit entirely).
 * Real measurement units (oz, ml, g, kg, lb, L) are returned as-is.
 */

const GENERIC_UNITS = new Set([
  "",
  "unit",
  "units",
  "unidad",
  "unidades",
  "serving",
  "servings",
  "porcion",
  "porción",
  "porciones",
  "portion",
  "portions",
  "plate",
  "plates",
  "bowl",
  "bowls",
  "tray",
  "trays",
  "piece",
  "pieces",
]);

/** Returns the unit string if it is a real measurement; empty string otherwise. */
export function meaningfulUnit(unit) {
  if (unit == null) return "";
  return GENERIC_UNITS.has(String(unit).toLowerCase().trim()) ? "" : String(unit);
}

/** Format `qty unit`. If unit is generic, returns just the qty. */
export function formatQtyUnit(qty, unit) {
  const u = meaningfulUnit(unit);
  if (qty == null) return u;
  return u ? `${qty} ${u}` : String(qty);
}

/** Format `price / unit`. If unit is generic, returns just `/ porción`. */
export function formatPerUnit(unit, lang = "es") {
  const u = meaningfulUnit(unit);
  if (u) return `/ ${u}`;
  return lang === "es" ? "/ porción" : "/ portion";
}
