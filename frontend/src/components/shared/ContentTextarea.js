/**
 * ContentTextarea — plain-text editor with a lightweight toolbar.
 *
 * Why not a full rich-text editor? Because captions / scripts / notes are
 * saved as plain strings across the app (and pasted into IG/TikTok/Email
 * where formatting gets stripped anyway). So this component only tweaks the
 * *visual* comfort while writing:
 *
 *   • A-  and  A+   → change display font size (persisted per user via localStorage).
 *   • Reset         → back to default 14px.
 *   • Mono toggle   → monospace family (useful for scripts).
 *   • Bold / Italic → wraps the current selection with **…** / *…* markdown so
 *                     copy-paste to platforms that render markdown still works.
 *
 * The stored `value` is the raw text — no HTML, no runtime cost, no data model
 * change needed. Drop this in place of `<textarea>` or `<Textarea>` anywhere.
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Bold, Italic, Type, Minus, Plus, Code2 } from "lucide-react";

const MIN_FS = 12;
const MAX_FS = 26;
const STEP = 2;

export function ContentTextarea({
  value,
  onChange,
  placeholder = "",
  className = "",
  minHeight = 120,
  storageKey = "contentEditor",
  rows,
  disabled = false,
  "data-testid": testId,
}) {
  const ref = useRef(null);
  const [fontSize, setFontSize] = useState(14);
  const [mono, setMono] = useState(false);

  // Load persisted UI prefs (per editor slot) so users get their preferred
  // reading size back on next session.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`ce.${storageKey}`);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.fontSize === "number") setFontSize(p.fontSize);
        if (typeof p.mono === "boolean") setMono(p.mono);
      }
    } catch (_e) { /* ignore */ }
  }, [storageKey]);

  const persist = useCallback((next) => {
    try {
      localStorage.setItem(`ce.${storageKey}`, JSON.stringify({ fontSize, mono, ...next }));
    } catch (_e) { /* ignore */ }
  }, [fontSize, mono, storageKey]);

  const bump = (delta) => {
    setFontSize((prev) => {
      const next = Math.max(MIN_FS, Math.min(MAX_FS, prev + delta));
      persist({ fontSize: next });
      return next;
    });
  };
  const reset = () => {
    setFontSize(14);
    persist({ fontSize: 14 });
  };
  const toggleMono = () => {
    setMono((m) => {
      const next = !m;
      persist({ mono: next });
      return next;
    });
  };

  // Wrap current selection with the given marker (e.g. "**" for bold).
  // If nothing is selected we just insert the markers around the caret so
  // the user can type inside them immediately.
  const wrapSelection = (marker) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const before = value.slice(0, start);
    const selected = value.slice(start, end);
    const after = value.slice(end);
    const next = `${before}${marker}${selected}${marker}${after}`;
    onChange({ target: { value: next } });
    // Restore focus + place caret between markers
    requestAnimationFrame(() => {
      el.focus();
      const pos = selected
        ? start + marker.length + selected.length + marker.length
        : start + marker.length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className={`border rounded-md overflow-hidden ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b bg-slate-50 text-slate-600">
        <ToolbarButton
          onClick={() => bump(-STEP)}
          disabled={disabled || fontSize <= MIN_FS}
          title="Reducir tamaño"
          testId={testId ? `${testId}-font-smaller` : undefined}
        >
          <Minus className="w-3.5 h-3.5" />
        </ToolbarButton>
        <button
          type="button"
          onClick={reset}
          disabled={disabled}
          className="text-[11px] tabular-nums px-1.5 h-6 rounded hover:bg-slate-200 disabled:opacity-50"
          title="Tamaño por defecto"
        >
          {fontSize}px
        </button>
        <ToolbarButton
          onClick={() => bump(STEP)}
          disabled={disabled || fontSize >= MAX_FS}
          title="Aumentar tamaño"
          testId={testId ? `${testId}-font-larger` : undefined}
        >
          <Plus className="w-3.5 h-3.5" />
        </ToolbarButton>

        <span className="w-px h-4 bg-slate-300 mx-1" />

        <ToolbarButton
          onClick={() => wrapSelection("**")}
          disabled={disabled}
          title="Negrita (**texto**)"
        >
          <Bold className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => wrapSelection("*")}
          disabled={disabled}
          title="Itálica (*texto*)"
        >
          <Italic className="w-3.5 h-3.5" />
        </ToolbarButton>

        <span className="w-px h-4 bg-slate-300 mx-1" />

        <ToolbarButton
          onClick={toggleMono}
          disabled={disabled}
          active={mono}
          title="Monospace (útil para scripts)"
        >
          <Code2 className="w-3.5 h-3.5" />
        </ToolbarButton>

        <div className="ml-auto flex items-center gap-1 text-[11px] text-slate-500">
          <Type className="w-3 h-3" />
          {value ? `${value.length} ${value.length === 1 ? "char" : "chars"}` : "—"}
        </div>
      </div>

      {/* Textarea */}
      <textarea
        ref={ref}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        data-testid={testId}
        className="w-full p-3 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50 disabled:bg-slate-50"
        style={{
          minHeight,
          fontSize: `${fontSize}px`,
          lineHeight: 1.5,
          fontFamily: mono
            ? 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace'
            : "inherit",
          resize: "vertical",
        }}
      />
    </div>
  );
}


function ToolbarButton({ children, onClick, disabled, title, active, testId }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}  // don't lose textarea selection
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={`inline-flex items-center justify-center w-6 h-6 rounded transition-colors disabled:opacity-40 ${
        active
          ? "bg-slate-800 text-white"
          : "hover:bg-slate-200 text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}


export default ContentTextarea;
