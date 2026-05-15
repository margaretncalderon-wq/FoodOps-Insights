import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useLanguage } from "../contexts/LanguageContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Calculator, Loader2, AlertTriangle, ChefHat, Package, Info } from "lucide-react";
import { API_BASE as API } from "../utils/api";

/**
 * EventProductionPlan — P1-A modal.
 *
 * READ-ONLY computation: pick an event, see the aggregated ingredient list
 * required to cook its menu/proposal recipes for the booked guest count,
 * including shortages vs current available inventory. Does NOT write anything.
 */
export default function EventProductionPlan({ open, onOpenChange, events = [] }) {
  const { language } = useLanguage();
  const [eventId, setEventId] = useState("");
  const [guestOverride, setGuestOverride] = useState("");
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setPlan(null);
      setEventId("");
      setGuestOverride("");
    }
  }, [open]);

  const handleCompute = async () => {
    if (!eventId) {
      toast.error(language === "es" ? "Selecciona un evento" : "Pick an event");
      return;
    }
    setLoading(true);
    try {
      const body = { event_id: eventId };
      if (guestOverride && Number(guestOverride) > 0) {
        body.guest_count_override = Number(guestOverride);
      }
      const res = await axios.post(`${API}/api/production/event-plan`, body, { withCredentials: true });
      setPlan(res.data);
    } catch (e) {
      const msg = e?.response?.data?.detail || (language === "es" ? "Error al calcular plan" : "Failed to compute plan");
      toast.error(typeof msg === "string" ? msg : "Error");
      setPlan(null);
    } finally {
      setLoading(false);
    }
  };

  const t = plan?.totals || {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="event-plan-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-primary" />
            {language === "es" ? "Plan de Producción por Evento" : "Production Plan per Event"}
            <Badge variant="outline" className="text-[10px] font-normal">
              {language === "es" ? "Solo vista" : "Read-only"}
            </Badge>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Info className="w-3 h-3" />
            {language === "es"
              ? "Calcula los ingredientes y costos requeridos para cocinar todas las recetas del evento. No modifica inventario."
              : "Computes ingredients & cost needed to cook every recipe in the event. Does not touch inventory."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-2 items-end">
          <div>
            <Label className="text-xs">{language === "es" ? "Evento" : "Event"}</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger data-testid="event-plan-event-select">
                <SelectValue placeholder={language === "es" ? "Elige un evento..." : "Pick an event..."} />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {events.map((e) => (
                  <SelectItem key={e.event_id} value={e.event_id}>
                    {e.name}{e.guest_count ? ` — ${e.guest_count} ${language === "es" ? "invitados" : "guests"}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{language === "es" ? "Invitados (override)" : "Guests (override)"}</Label>
            <Input
              type="number"
              min={1}
              placeholder={language === "es" ? "auto" : "auto"}
              value={guestOverride}
              onChange={(e) => setGuestOverride(e.target.value)}
              data-testid="event-plan-guest-override"
            />
          </div>
          <Button onClick={handleCompute} disabled={loading || !eventId} data-testid="event-plan-compute-btn">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            <span className="ml-1.5">{language === "es" ? "Calcular" : "Compute"}</span>
          </Button>
        </div>

        {plan && (
          <div className="space-y-4 mt-2" data-testid="event-plan-result">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Card>
                <CardContent className="p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">{language === "es" ? "Invitados" : "Guests"}</p>
                  <p className="font-semibold text-lg" data-testid="event-plan-guests">{plan.guest_count}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">{language === "es" ? "Recetas" : "Recipes"}</p>
                  <p className="font-semibold text-lg">{t.recipes_count || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">{language === "es" ? "Costo Insumos" : "Input Cost"}</p>
                  <p className="font-semibold text-lg text-primary">${(t.total_input_cost || 0).toFixed(2)}</p>
                </CardContent>
              </Card>
              <Card className={t.shortage_count > 0 ? "border-red-300" : ""}>
                <CardContent className="p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">{language === "es" ? "Faltantes" : "Shortages"}</p>
                  <p className={`font-semibold text-lg ${t.shortage_count > 0 ? "text-red-600" : "text-green-600"}`} data-testid="event-plan-shortage-count">
                    {t.shortage_count || 0}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Planned Recipes */}
            {plan.planned_recipes?.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-1 flex items-center gap-1">
                  <ChefHat className="w-3 h-3" />
                  {language === "es" ? "Recetas planificadas" : "Planned recipes"}
                </p>
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === "es" ? "Receta" : "Recipe"}</TableHead>
                        <TableHead>{language === "es" ? "Fuente" : "Source"}</TableHead>
                        <TableHead className="text-right">{language === "es" ? "Porciones" : "Portions"}</TableHead>
                        <TableHead className="text-right">{language === "es" ? "Factor" : "Factor"}</TableHead>
                        <TableHead className="text-right">{language === "es" ? "Costo" : "Cost"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plan.planned_recipes.map((r) => (
                        <TableRow key={r.recipe_id + r.source}>
                          <TableCell className="font-medium">{r.recipe_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {r.source === "menu"
                                ? (language === "es" ? "Menú" : "Menu")
                                : (language === "es" ? "Propuesta" : "Proposal")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">{r.portions_required}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">×{r.scale_factor}</TableCell>
                          <TableCell className="text-right font-mono">${r.total_cost.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Aggregated Ingredients */}
            {plan.aggregated_ingredients?.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-1 flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  {language === "es" ? "Ingredientes agregados" : "Aggregated ingredients"}
                </p>
                <div className="border rounded-md max-h-72 overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead>{language === "es" ? "Ingrediente" : "Ingredient"}</TableHead>
                        <TableHead className="text-right">{language === "es" ? "Requerido" : "Required"}</TableHead>
                        <TableHead className="text-right">{language === "es" ? "Disponible" : "Available"}</TableHead>
                        <TableHead className="text-right">{language === "es" ? "Faltante" : "Shortage"}</TableHead>
                        <TableHead className="text-right">{language === "es" ? "Costo" : "Cost"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plan.aggregated_ingredients.map((ing) => (
                        <TableRow key={ing.inventory_item_id} className={ing.shortage > 0 ? "bg-red-50/40 dark:bg-red-950/10" : ""}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {ing.shortage > 0 && <AlertTriangle className="w-3 h-3 text-red-600 flex-shrink-0" />}
                              <span>{ing.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {ing.required_qty} <span className="text-muted-foreground">{ing.unit}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {ing.available} <span className="text-[10px]">{ing.unit}</span>
                          </TableCell>
                          <TableCell className={`text-right font-mono ${ing.shortage > 0 ? "text-red-600 font-semibold" : ""}`}>
                            {ing.shortage > 0 ? `${ing.shortage} ${ing.unit}` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono">${ing.total_cost.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              plan.planned_recipes?.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8 border rounded-md">
                  {language === "es"
                    ? "Este evento no tiene recetas vinculadas (sin menú emplatado ni ítems Food en propuesta)."
                    : "No recipes linked to this event (no plated menu and no Food proposal items)."}
                </div>
              )
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="event-plan-close-btn">
            {language === "es" ? "Cerrar" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
