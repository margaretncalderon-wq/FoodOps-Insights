import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";

import { useLanguage } from "../contexts/LanguageContext";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "./ui/command";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Package, ArrowLeft, Layers, Loader2, Check } from "lucide-react";

import { API_BASE as API } from "../utils/api";

/**
 * PackagePicker — Load a saved Menu/Package into a proposal in one click.
 * Stage A: pick a Menu (searchable). Stage B: optionally pick a variant (Gold/Silver/Bronze).
 *
 * Props:
 *  - proposalId (string, required): the proposal to load the items into
 *  - quantityMultiplier (number, default 1): multiplied into each item's quantity
 *  - onLoaded (fn, optional): callback after bulk-add succeeds
 */
export default function PackagePicker({ proposalId, quantityMultiplier = 1, onLoaded, triggerTestId = "package-picker-trigger" }) {
  const { language } = useLanguage();
  const isEs = language === "es";

  const [open, setOpen] = useState(false);
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [posting, setPosting] = useState(false);

  // Fetch saved menus when popover opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    axios.get(`${API}/api/settings/menus`, { withCredentials: true })
      .then((res) => setMenus((res.data || []).filter((m) => m.is_active !== false)))
      .catch(() => setMenus([]))
      .finally(() => setLoading(false));
  }, [open]);

  const filteredMenus = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menus.filter((m) => {
      if (!q) return true;
      const hay = [m.name, m.name_es, m.menu_type, m.description].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [menus, query]);

  const reset = () => {
    setSelectedMenu(null);
    setQuery("");
  };

  const handleLoad = async (variantId) => {
    if (!selectedMenu) return;
    setPosting(true);
    try {
      const res = await axios.post(
        `${API}/api/proposals/${proposalId}/items/bulk-from-menu`,
        {
          menu_id: selectedMenu.menu_id,
          variant_id: variantId || null,
          quantity_multiplier: quantityMultiplier,
          section_title: selectedMenu.name,
        },
        { withCredentials: true },
      );
      const n = res.data?.items_added || 0;
      toast.success(
        isEs
          ? `${n} ítem${n === 1 ? "" : "s"} agregado${n === 1 ? "" : "s"} desde "${selectedMenu.name}"`
          : `${n} item${n === 1 ? "" : "s"} added from "${selectedMenu.name}"`,
      );
      setOpen(false);
      reset();
      onLoaded?.();
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || "Error";
      toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setPosting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between font-normal text-muted-foreground hover:text-foreground"
          data-testid={triggerTestId}
        >
          <span className="flex items-center gap-2 truncate">
            <Layers className="w-4 h-4 opacity-60" />
            {isEs ? "+ Cargar menú/paquete prearmado..." : "+ Load saved menu/package..."}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[460px] p-0" align="end" data-testid="package-picker-content">
        {!selectedMenu ? (
          // STAGE A — pick menu
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={isEs ? "Buscar menú o paquete..." : "Search menu or package..."}
              data-testid="package-picker-search"
            />
            <CommandList>
              {loading && (
                <div className="p-4 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span className="text-xs">{isEs ? "Cargando..." : "Loading..."}</span>
                </div>
              )}
              {!loading && filteredMenus.length === 0 && (
                <CommandEmpty>
                  <div className="text-center py-4 px-2">
                    <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs font-medium">
                      {isEs ? "Sin menús prearmados" : "No saved menus yet"}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {isEs
                        ? "Créalos en Ajustes → Menús para reutilizarlos en cotizaciones."
                        : "Create them in Settings → Menus to reuse on quotes."}
                    </p>
                  </div>
                </CommandEmpty>
              )}
              <CommandGroup>
                {filteredMenus.map((m) => {
                  const variantsLabel = (m.variants || []).length > 1
                    ? (isEs ? `${m.variants.length} variantes` : `${m.variants.length} variants`)
                    : null;
                  return (
                    <CommandItem
                      key={m.menu_id}
                      value={m.menu_id}
                      onSelect={() => setSelectedMenu(m)}
                      className="flex items-start gap-3 py-2 cursor-pointer"
                      data-testid={`package-picker-option-${m.menu_id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{isEs ? (m.name_es || m.name) : m.name}</p>
                          {m.menu_type && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1">{m.menu_type}</Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {(m.items || []).length} {isEs ? "ítems" : "items"}
                          {variantsLabel ? ` · ${variantsLabel}` : ""}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-mono">
                          ${(m.is_fixed_price && m.default_price ? m.default_price : m.total_price || 0).toFixed(2)}
                        </p>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
          // STAGE B — pick variant (or no variant)
          <div className="flex flex-col">
            <div className="flex items-center justify-between p-3 border-b">
              <Button variant="ghost" size="sm" onClick={reset} className="h-8 px-2" data-testid="package-picker-back">
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> {isEs ? "Atrás" : "Back"}
              </Button>
              <div className="flex-1 text-center px-2">
                <p className="text-sm font-semibold truncate">{selectedMenu.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {(selectedMenu.variants || []).length > 0
                    ? (isEs ? "Elige variante o agrega completo" : "Pick a variant or load full")
                    : (isEs ? "Confirmar carga" : "Confirm load")}
                </p>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto p-2 space-y-1.5">
              {(selectedMenu.variants || []).length > 0 ? (
                <>
                  {selectedMenu.variants.map((v) => (
                    <button
                      key={v.variant_id}
                      onClick={() => handleLoad(v.variant_id)}
                      disabled={posting}
                      className="w-full text-left p-3 rounded-md border hover:bg-muted/60 transition-colors disabled:opacity-50"
                      data-testid={`package-variant-${v.variant_id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm">{isEs ? (v.name_es || v.name) : v.name}</p>
                          {v.is_default && <Badge variant="secondary" className="text-[9px] h-4 px-1">Default</Badge>}
                        </div>
                        <span className="text-xs font-mono text-muted-foreground">
                          {v.discount_value
                            ? (v.discount_type === "percentage" ? `−${v.discount_value}%` : `−$${v.discount_value}`)
                            : isEs ? "Precio base" : "Base price"}
                        </span>
                      </div>
                      {v.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{v.description}</p>
                      )}
                    </button>
                  ))}
                  <div className="pt-2 border-t mt-2">
                    <Button
                      variant="outline" size="sm" className="w-full"
                      onClick={() => handleLoad(null)}
                      disabled={posting}
                      data-testid="package-load-base"
                    >
                      {posting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                      {isEs ? "Cargar sin variante (precio base)" : "Load base (no variant)"}
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  className="w-full"
                  onClick={() => handleLoad(null)}
                  disabled={posting}
                  data-testid="package-load-confirm"
                >
                  {posting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                  {isEs
                    ? `Cargar ${(selectedMenu.items || []).length} ítems`
                    : `Load ${(selectedMenu.items || []).length} items`}
                </Button>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
