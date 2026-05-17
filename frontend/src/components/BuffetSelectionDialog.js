import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { AlertTriangle, Check, DollarSign } from "lucide-react";

/**
 * BuffetSelectionDialog
 * - Opens when an operator adds a Plated Menu that has selection rules (min_choices / max_choices)
 *   or a base_price_per_guest > 0.
 * - Lets the operator pick the specific dishes per course, enforces min/max, and previews extras.
 *
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   menu: PlatedMenu (with courses[] containing min_choices/max_choices/extra_choice_price)
 *   guestCount: number
 *   onConfirm: ({ selected_items: {course_id: [recipe_id,...]} }) => Promise<void>
 */
export default function BuffetSelectionDialog({ open, onClose, menu, guestCount, onConfirm }) {
  const { language } = useLanguage();
  const [selected, setSelected] = useState({}); // {course_id: Set<recipe_id>}
  const [saving, setSaving] = useState(false);

  // Initialize selections with all items pre-selected up to max_choices (or min_choices if defined)
  useEffect(() => {
    if (!menu || !open) return;
    const init = {};
    for (const course of (menu.courses || [])) {
      const items = course.items || [];
      const max = course.max_choices ?? course.min_choices ?? items.length;
      const target = Math.min(max, items.length);
      init[course.course_id] = new Set(items.slice(0, target).map(i => i.recipe_id));
    }
    setSelected(init);
  }, [menu, open]);

  const toggle = (courseId, recipeId) => {
    setSelected(prev => {
      const set = new Set(prev[courseId] || []);
      if (set.has(recipeId)) set.delete(recipeId); else set.add(recipeId);
      return { ...prev, [courseId]: set };
    });
  };

  // Compute summary: per-course picks, extras, totals
  const summary = useMemo(() => {
    if (!menu) return null;
    const basePrice = parseFloat(menu.base_price_per_guest || 0);
    const guests = parseFloat(guestCount || 0) || 0;
    const perCourse = [];
    let extrasPerGuest = 0;
    let validationErrors = [];
    for (const course of (menu.courses || [])) {
      const picks = selected[course.course_id] ? selected[course.course_id].size : 0;
      const min = course.min_choices;
      const max = course.max_choices;
      const extraPrice = parseFloat(course.extra_choice_price || 0);
      const overMax = (max != null && picks > max) ? (picks - max) : 0;
      const extra = overMax * extraPrice;
      extrasPerGuest += extra;
      if (min != null && picks < min) {
        validationErrors.push(
          language === "es"
            ? `${courseLabel(course)}: elige al menos ${min} (actualmente ${picks})`
            : `${courseLabel(course)}: pick at least ${min} (currently ${picks})`
        );
      }
      perCourse.push({ course, picks, min, max, extraPrice, overMax, extra });
    }
    const totalExtras = extrasPerGuest * guests;
    const totalBase = basePrice * guests;
    const grand = totalBase + totalExtras;
    return { perCourse, extrasPerGuest, totalExtras, totalBase, grand, basePrice, guests, validationErrors };
  }, [menu, selected, guestCount, language]);

  const courseLabel = (c) => {
    const map = {
      appetizer: { en: "Appetizer", es: "Entrada" },
      salad: { en: "Salad", es: "Ensalada" },
      soup: { en: "Soup", es: "Sopa" },
      entree: { en: "Main Course", es: "Plato Principal" },
      dessert: { en: "Dessert", es: "Postre" },
    };
    const std = map[c.course_name];
    return std ? std[language] || std.en : (c.course_name || "Course");
  };

  const handleConfirm = async () => {
    if (summary?.validationErrors?.length > 0) return;
    setSaving(true);
    try {
      const payload = {};
      Object.entries(selected).forEach(([cid, set]) => {
        payload[cid] = Array.from(set);
      });
      await onConfirm({ selected_items: payload });
    } finally {
      setSaving(false);
    }
  };

  if (!menu) return null;
  const canConfirm = !saving && summary && summary.validationErrors.length === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" data-testid="buffet-selection-dialog">
        <DialogHeader>
          <DialogTitle>
            {language === "es" ? "Selecciona los platillos del menú" : "Choose dishes for the menu"}: {menu.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {(menu.courses || []).map(course => {
            const picks = selected[course.course_id] ? selected[course.course_id].size : 0;
            const min = course.min_choices;
            const max = course.max_choices;
            const overMax = (max != null && picks > max) ? (picks - max) : 0;
            const ruleText =
              (min != null || max != null)
                ? (language === "es"
                    ? `Elige ${min ?? 1}${max != null && max !== min ? `–${max}` : ""} de ${(course.items || []).length}`
                    : `Pick ${min ?? 1}${max != null && max !== min ? `–${max}` : ""} of ${(course.items || []).length}`)
                : (language === "es" ? "Sin regla de selección" : "No selection rule");

            return (
              <Card key={course.course_id} className="border-l-4 border-l-primary">
                <CardHeader className="py-2 px-3 bg-muted/30 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    {courseLabel(course)}
                    <Badge variant="outline" className="text-xs">{ruleText}</Badge>
                    {min != null && picks < min && (
                      <Badge variant="destructive" className="text-xs">
                        {language === "es" ? `Falta ${min - picks}` : `Need ${min - picks} more`}
                      </Badge>
                    )}
                    {overMax > 0 && (
                      <Badge className="text-xs bg-amber-500">
                        {language === "es" ? `+${overMax} extra` : `+${overMax} extra`}
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="text-xs text-muted-foreground">
                    {picks} {language === "es" ? "seleccionados" : "selected"}
                  </div>
                </CardHeader>
                <CardContent className="py-2 px-3 space-y-1">
                  {(course.items || []).length === 0 && (
                    <p className="text-xs text-muted-foreground">{language === "es" ? "Sin platos en este curso" : "No dishes in this course"}</p>
                  )}
                  {(course.items || []).map(item => {
                    const isPicked = selected[course.course_id]?.has(item.recipe_id);
                    return (
                      <label
                        key={item.recipe_id}
                        className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/50 ${isPicked ? "bg-primary/5" : ""}`}
                        data-testid={`buffet-item-${item.recipe_id}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Checkbox
                            checked={!!isPicked}
                            onCheckedChange={() => toggle(course.course_id, item.recipe_id)}
                          />
                          <span className="text-sm truncate">{item.recipe_name}</span>
                        </div>
                      </label>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Summary */}
        <div className="mt-3 border-t pt-3 space-y-2">
          {summary && summary.basePrice > 0 && (
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="text-center p-2 bg-muted/40 rounded">
                <div className="text-xs text-muted-foreground">{language === "es" ? "Base × invitados" : "Base × guests"}</div>
                <div className="font-semibold">${summary.totalBase.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">${summary.basePrice.toFixed(2)} × {summary.guests}</div>
              </div>
              <div className="text-center p-2 bg-amber-50 rounded border border-amber-200">
                <div className="text-xs text-amber-700">{language === "es" ? "Extras" : "Extras"}</div>
                <div className="font-semibold text-amber-700">${summary.totalExtras.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">${summary.extrasPerGuest.toFixed(2)}/{language === "es" ? "inv." : "guest"}</div>
              </div>
              <div className="text-center p-2 bg-green-50 rounded border border-green-200">
                <div className="text-xs text-green-700 flex items-center justify-center gap-1"><DollarSign className="w-3 h-3" />{language === "es" ? "Total Menú" : "Menu Total"}</div>
                <div className="font-bold text-green-700 text-lg">${summary.grand.toFixed(2)}</div>
              </div>
            </div>
          )}
          {summary?.validationErrors?.length > 0 && (
            <div className="text-xs text-red-600 flex items-start gap-2 bg-red-50 border border-red-200 rounded p-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <ul className="space-y-0.5">
                {summary.validationErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving} data-testid="buffet-cancel-btn">
            {language === "es" ? "Cancelar" : "Cancel"}
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm} data-testid="buffet-confirm-btn">
            <Check className="w-4 h-4 mr-2" />
            {language === "es" ? "Confirmar y agregar" : "Confirm & add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
