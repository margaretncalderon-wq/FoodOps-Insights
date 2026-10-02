/**
 * Stage Color Palettes
 * -----------------------------------------------------------------------------
 * Pre-declared Tailwind class names so JIT picks them up. Each palette ships
 * the five classes any surface needs:
 *   bg      (card/chip background, 100 shade)
 *   border  (card border, 300 shade)
 *   text    (label text, 700 shade; falls to 500 for muted palettes)
 *   dot     (legend bullets, 500 shade)
 *   stripe  (calendar strip + pipeline header, 500 shade)
 *
 * Includes the "Archived" muted gray variant since users shouldn't be forced
 * to pick a bright color for the archived stage.
 */

export const COLOR_PALETTES = {
  slate: {
    label: "Slate",
    bg: "bg-slate-100", border: "border-slate-300", text: "text-slate-700",
    dot: "bg-slate-500", stripe: "bg-slate-500", header: "bg-slate-500",
    chip: "bg-slate-100 text-slate-800 border-slate-200",
  },
  gray: {
    label: "Gray",
    bg: "bg-gray-100", border: "border-gray-300", text: "text-gray-700",
    dot: "bg-gray-500", stripe: "bg-gray-500", header: "bg-gray-500",
    chip: "bg-gray-100 text-gray-800 border-gray-200",
  },
  zinc: {
    label: "Zinc",
    bg: "bg-zinc-100", border: "border-zinc-300", text: "text-zinc-700",
    dot: "bg-zinc-500", stripe: "bg-zinc-500", header: "bg-zinc-500",
    chip: "bg-zinc-100 text-zinc-800 border-zinc-200",
  },
  neutral: {
    label: "Neutral",
    bg: "bg-neutral-100", border: "border-neutral-300", text: "text-neutral-700",
    dot: "bg-neutral-500", stripe: "bg-neutral-500", header: "bg-neutral-500",
    chip: "bg-neutral-100 text-neutral-800 border-neutral-200",
  },
  stone: {
    label: "Stone",
    bg: "bg-stone-100", border: "border-stone-300", text: "text-stone-700",
    dot: "bg-stone-500", stripe: "bg-stone-500", header: "bg-stone-500",
    chip: "bg-stone-100 text-stone-800 border-stone-200",
  },
  red: {
    label: "Red",
    bg: "bg-red-100", border: "border-red-300", text: "text-red-700",
    dot: "bg-red-500", stripe: "bg-red-500", header: "bg-red-500",
    chip: "bg-red-100 text-red-800 border-red-200",
  },
  orange: {
    label: "Orange",
    bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-700",
    dot: "bg-orange-500", stripe: "bg-orange-500", header: "bg-orange-500",
    chip: "bg-orange-100 text-orange-800 border-orange-200",
  },
  amber: {
    label: "Amber",
    bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-700",
    dot: "bg-amber-500", stripe: "bg-amber-500", header: "bg-amber-500",
    chip: "bg-amber-100 text-amber-800 border-amber-200",
  },
  yellow: {
    label: "Yellow",
    bg: "bg-yellow-100", border: "border-yellow-300", text: "text-yellow-700",
    dot: "bg-yellow-500", stripe: "bg-yellow-500", header: "bg-yellow-500",
    chip: "bg-yellow-100 text-yellow-800 border-yellow-200",
  },
  lime: {
    label: "Lime",
    bg: "bg-lime-100", border: "border-lime-300", text: "text-lime-700",
    dot: "bg-lime-500", stripe: "bg-lime-500", header: "bg-lime-500",
    chip: "bg-lime-100 text-lime-800 border-lime-200",
  },
  green: {
    label: "Green",
    bg: "bg-green-100", border: "border-green-300", text: "text-green-700",
    dot: "bg-green-500", stripe: "bg-green-500", header: "bg-green-500",
    chip: "bg-green-100 text-green-800 border-green-200",
  },
  emerald: {
    label: "Emerald",
    bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-700",
    dot: "bg-emerald-500", stripe: "bg-emerald-500", header: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  teal: {
    label: "Teal",
    bg: "bg-teal-100", border: "border-teal-300", text: "text-teal-700",
    dot: "bg-teal-500", stripe: "bg-teal-500", header: "bg-teal-500",
    chip: "bg-teal-100 text-teal-800 border-teal-200",
  },
  cyan: {
    label: "Cyan",
    bg: "bg-cyan-100", border: "border-cyan-300", text: "text-cyan-700",
    dot: "bg-cyan-500", stripe: "bg-cyan-500", header: "bg-cyan-500",
    chip: "bg-cyan-100 text-cyan-800 border-cyan-200",
  },
  sky: {
    label: "Sky",
    bg: "bg-sky-100", border: "border-sky-300", text: "text-sky-700",
    dot: "bg-sky-500", stripe: "bg-sky-500", header: "bg-sky-500",
    chip: "bg-sky-100 text-sky-800 border-sky-200",
  },
  blue: {
    label: "Blue",
    bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-700",
    dot: "bg-blue-500", stripe: "bg-blue-500", header: "bg-blue-500",
    chip: "bg-blue-100 text-blue-800 border-blue-200",
  },
  indigo: {
    label: "Indigo",
    bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-700",
    dot: "bg-indigo-500", stripe: "bg-indigo-500", header: "bg-indigo-500",
    chip: "bg-indigo-100 text-indigo-800 border-indigo-200",
  },
  violet: {
    label: "Violet",
    bg: "bg-violet-100", border: "border-violet-300", text: "text-violet-700",
    dot: "bg-violet-500", stripe: "bg-violet-500", header: "bg-violet-500",
    chip: "bg-violet-100 text-violet-800 border-violet-200",
  },
  purple: {
    label: "Purple",
    bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-700",
    dot: "bg-purple-500", stripe: "bg-purple-500", header: "bg-purple-500",
    chip: "bg-purple-100 text-purple-800 border-purple-200",
  },
  fuchsia: {
    label: "Fuchsia",
    bg: "bg-fuchsia-100", border: "border-fuchsia-300", text: "text-fuchsia-700",
    dot: "bg-fuchsia-500", stripe: "bg-fuchsia-500", header: "bg-fuchsia-500",
    chip: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
  },
  pink: {
    label: "Pink",
    bg: "bg-pink-100", border: "border-pink-300", text: "text-pink-700",
    dot: "bg-pink-500", stripe: "bg-pink-500", header: "bg-pink-500",
    chip: "bg-pink-100 text-pink-800 border-pink-200",
  },
  rose: {
    label: "Rose",
    bg: "bg-rose-100", border: "border-rose-300", text: "text-rose-700",
    dot: "bg-rose-500", stripe: "bg-rose-500", header: "bg-rose-500",
    chip: "bg-rose-100 text-rose-800 border-rose-200",
  },
};

export const PALETTE_KEYS = Object.keys(COLOR_PALETTES);

// Resolve a palette-name string to the pre-declared classes. Falls back to
// slate so unknown palettes never render invisible chips.
export function resolvePalette(name) {
  return COLOR_PALETTES[name] || COLOR_PALETTES.slate;
}

// Default palettes for the 8 engagement stages (set in Fase B1+B2).
export const DEFAULT_STAGE_PALETTES = {
  "Inquiry Received": "slate",
  "Context Captured": "blue",
  "Scope Drafted": "amber",
  "Definition In Review": "orange",
  "Sent to Client": "cyan",
  "Confirmed by Client": "violet",
  "Committed": "emerald",
  "Archived": "gray",
};

// Default palettes for the 4 commercial statuses (fixed set).
export const DEFAULT_STATUS_PALETTES = {
  "Draft": "slate",
  "Sent": "cyan",
  "Accepted": "emerald",
  "Rejected": "rose",
};

// Default ES/EN labels.
export const DEFAULT_STAGE_LABELS = {
  "Inquiry Received":   { en: "Inquiry Received",     es: "Consulta Recibida" },
  "Context Captured":   { en: "Context Captured",     es: "Contexto Capturado" },
  "Scope Drafted":      { en: "Scope Drafted",        es: "Alcance Definido" },
  "Definition In Review": { en: "Definition In Review", es: "Definición en Revisión" },
  "Sent to Client":     { en: "Sent to Client",       es: "Enviada al Cliente" },
  "Confirmed by Client": { en: "Confirmed by Client", es: "Confirmada por Cliente" },
  "Committed":          { en: "Committed",            es: "Comprometido" },
  "Archived":           { en: "Archived",             es: "Perdida" },
};

export const DEFAULT_STATUS_LABELS = {
  "Draft":    { en: "Draft",    es: "Borrador" },
  "Sent":     { en: "Sent",     es: "Enviada" },
  "Accepted": { en: "Accepted", es: "Aceptada" },
  "Rejected": { en: "Rejected", es: "Rechazada" },
};
