import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Textarea } from "./ui/textarea";

const TOKEN_RE = /(^|\s)@([A-Za-z0-9._-]*)$/;

// Textarea with @mention autocomplete. Inserts "@handle " for the picked teammate.
export const MentionTextarea = forwardRef(function MentionTextarea({ value, onChange, users = [], onKeyDown, ...props }, ref) {
  const innerRef = useRef(null);
  const [query, setQuery] = useState(null);
  const [active, setActive] = useState(0);
  useImperativeHandle(ref, () => innerRef.current);

  const matches = query === null ? [] : users
    .filter((u) => `${u.name} ${u.handle}`.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 6);

  const detect = (text, caret) => {
    const m = text.slice(0, caret).match(TOKEN_RE);
    setQuery(m ? m[2] : null);
    setActive(0);
  };

  const pick = (u) => {
    const el = innerRef.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@([A-Za-z0-9._-]*)$/, `@${u.handle} `);
    const next = before + value.slice(caret);
    onChange({ target: { value: next } });
    setQuery(null);
    setTimeout(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); }, 0);
  };

  const handleKeyDown = (e) => {
    if (matches.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % matches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[active]); return; }
      if (e.key === "Escape") { e.preventDefault(); setQuery(null); return; }
    }
    if (onKeyDown) onKeyDown(e);
  };

  return (
    <div className="relative">
      <Textarea
        ref={innerRef}
        value={value}
        onChange={(e) => { onChange(e); detect(e.target.value, e.target.selectionStart); }}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        {...props}
      />
      {matches.length > 0 && (
        <div
          className="absolute left-2 top-full mt-1 z-50 w-72 rounded-lg border bg-popover shadow-lg overflow-hidden"
          data-testid="mention-suggestions"
        >
          {matches.map((u, i) => (
            <button
              key={u.user_id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(u); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${i === active ? "bg-accent" : "hover:bg-accent/60"}`}
              data-testid={`mention-option-${u.handle}`}
            >
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                {(u.name || u.handle).charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block truncate font-medium">{u.name}</span>
                <span className="block truncate text-xs text-muted-foreground">@{u.handle}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
