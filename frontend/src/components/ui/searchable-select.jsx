import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, X as ClearIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/**
 * SearchableSelect — Typeable combobox built on shadcn Command + Popover.
 *
 * Props:
 *   value: string | null            -> selected option's value
 *   onValueChange: (v) => void      -> called with new value (or null when cleared)
 *   options: Array<{
 *     value: string,
 *     label: string,
 *     secondary?: string | number,  -> right-aligned hint (e.g. price)
 *     keywords?: string[]           -> extra search tokens
 *     disabled?: boolean
 *   }>
 *   placeholder?: string
 *   searchPlaceholder?: string
 *   emptyText?: string
 *   className?: string
 *   triggerClassName?: string
 *   contentClassName?: string
 *   clearable?: boolean             -> show an x button to clear
 *   disabled?: boolean
 *   testId?: string
 */
export function SearchableSelect({
  value,
  onValueChange,
  options = [],
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results.",
  className,
  triggerClassName,
  contentClassName,
  clearable = false,
  disabled = false,
  testId,
}) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => options.find((o) => o.value === value) || null,
    [options, value]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            triggerClassName,
            className
          )}
          data-testid={testId}
        >
          <span className="truncate text-left flex-1">
            {selected ? selected.label : placeholder}
          </span>
          <div className="flex items-center gap-1">
            {clearable && selected && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onValueChange?.(null);
                }}
                className="opacity-60 hover:opacity-100"
                aria-label="clear"
              >
                <ClearIcon className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("p-0 w-[--radix-popover-trigger-width] min-w-[240px]", contentClassName)}
        align="start"
      >
        <Command
          filter={(itemValue, search) => {
            // itemValue is the `value` prop of CommandItem (we set it as label+keywords joined)
            const v = String(itemValue || "").toLowerCase();
            const q = String(search || "").toLowerCase().trim();
            if (!q) return 1;
            return v.includes(q) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const searchToken = [opt.label, ...(opt.keywords || [])].join(" ").toLowerCase();
                return (
                  <CommandItem
                    key={opt.value}
                    value={searchToken}
                    disabled={opt.disabled}
                    onSelect={() => {
                      onValueChange?.(opt.value);
                      setOpen(false);
                    }}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Check
                        className={cn(
                          "h-4 w-4",
                          value === opt.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="truncate">{opt.label}</span>
                    </div>
                    {opt.secondary != null && (
                      <span className="text-xs text-muted-foreground ml-2 shrink-0">
                        {opt.secondary}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default SearchableSelect;
