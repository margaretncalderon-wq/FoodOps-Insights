/**
 * Number formatting utilities.
 *
 * Why this file exists:
 *   `(123456.789).toFixed(2)` returns "123456.79" — NO thousands separator.
 *   `Intl.NumberFormat` or `toLocaleString` add the separator correctly.
 *
 * Use `fmtNum(n)` everywhere we previously did `n.toFixed(2)` so that money
 * amounts display as "123,456.79" instead of "123456.79".
 */

/**
 * Format a number with thousands separator and fixed decimals.
 * Safely handles null / undefined / NaN by treating them as 0.
 *
 * @param {number|string|null|undefined} n - Value to format.
 * @param {number} [digits=2] - Number of decimal digits.
 * @returns {string} Formatted number, e.g. "1,234.50".
 */
export const fmtNum = (n, digits = 2) =>
  (Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export default fmtNum;
