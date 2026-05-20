/**
 * Date-only helpers — avoid timezone shifts for calendar/event dates.
 *
 * Why? Calling `new Date('2026-06-24T04:00:00.000Z').toLocaleDateString()` in a
 * UTC+X timezone may render the previous day; doing the reverse with
 * `.toISOString()` may push the date forward when the user is in UTC-X.
 *
 * Strategy: store and display dates as "YYYY-MM-DD" (calendar date, no time).
 * When converting to/from JS Date objects, use **local noon** to avoid any
 * timezone rollover.
 */

/** Convert a `Date` (or string) to "YYYY-MM-DD" in the user's local calendar. */
export function toDateOnly(value) {
  if (!value) return null;
  // For strings, prefer extracting the calendar date directly from "YYYY-MM-DD…"
  // so an ISO with UTC time (e.g. "2026-05-20T00:00:00Z") doesn't get shifted
  // into the previous day by `new Date()` when the user is in a UTC-X timezone.
  if (typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse a date input safely:
 *   - "YYYY-MM-DD"        → local Date at noon (avoids TZ rollover)
 *   - ISO with time/Z     → extract YYYY-MM-DD from UTC parts, then local noon
 *   - Date object         → returned as-is
 *
 * Returns null for invalid input.
 */
export function parseDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value);
  // Match YYYY-MM-DD (with optional time component)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [, y, mo, d] = m;
    return new Date(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10), 12, 0, 0, 0);
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Format a date-only value for display in the user's locale.
 * Accepts `Date`, ISO string, or "YYYY-MM-DD". Returns localized date string.
 */
export function formatDateOnly(value, language = "es", options = {}) {
  const d = parseDateOnly(value);
  if (!d) return "";
  const locale = language === "es" ? "es-DO" : "en-US";
  return d.toLocaleDateString(locale, options);
}

/** Sort comparator using YYYY-MM-DD strings (string compare = chronological). */
export function compareDateOnly(a, b) {
  const da = toDateOnly(a) || "";
  const db = toDateOnly(b) || "";
  return da.localeCompare(db);
}
