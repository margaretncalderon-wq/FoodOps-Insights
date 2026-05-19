import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

/**
 * SortSelect — Reusable sort dropdown with optional localStorage persistence.
 *
 * Props:
 *   value: string
 *   onValueChange: (v) => void
 *   options: Array<{ value: string, label: string }>
 *   storageKey?: string  -> if set, persists the value in localStorage
 *   label?: string       -> defaults to "Sort by"
 *   triggerClassName?: string
 *   testId?: string
 *
 * Use the `applySort` helper to apply a sort to an array:
 *   import { applySort } from "../components/ui/sort-select";
 *   const sorted = applySort(items, sortBy, sorters);
 */
export function SortSelect({
  value,
  onValueChange,
  options = [],
  storageKey,
  label = "Sort by",
  triggerClassName = "w-[220px]",
  testId,
}) {
  const handleChange = (v) => {
    onValueChange?.(v);
    if (storageKey) {
      try { localStorage.setItem(storageKey, v); } catch { /* ignore */ }
    }
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}:</span>
      <Select value={value} onValueChange={handleChange}>
        <SelectTrigger className={triggerClassName} data-testid={testId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Read a persisted sort value or fall back to default. */
export function readStoredSort(storageKey, defaultValue) {
  if (!storageKey) return defaultValue;
  try {
    return localStorage.getItem(storageKey) || defaultValue;
  } catch {
    return defaultValue;
  }
}

/** Apply a named sort from a `sorters` map to a list (returns a new array). */
export function applySort(list, sortKey, sorters) {
  if (!Array.isArray(list)) return [];
  const fn = sorters?.[sortKey] || ((a, b) => 0);
  return [...list].sort(fn);
}

export default SortSelect;
