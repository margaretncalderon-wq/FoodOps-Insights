import { useState, useMemo } from "react";
import axios from "axios";
import { API } from "../utils/api";
import { useLanguage } from "../contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Calculator, Loader2, ChefHat, Info } from "lucide-react";
import { toast } from "sonner";
import { fmtNum } from "../utils/format";

/**
 * Inline READ-ONLY Recipe Scaling Panel for ProposalEditor.
 *
 * Lets the user pick any recipe + target portions and shows scaled ingredients
 * and cost using GET /api/recipes/{recipe_id}/scale. Pure visualization — does
 * NOT persist to the proposal or modify recipes.
 *
 * Props:
 *   recipes: array of recipe summaries (must include recipe_id, name, yield_quantity, cost_per_portion)
 *   defaultPortions: number (e.g., event guest_count) used as initial value
 */
export default function RecipeScalingPanel({ recipes = [], defaultPortions = 0 }) {
  const { language } = useLanguage();
  const [selectedId, setSelectedId] = useState("");
  const [targetPortions, setTargetPortions] = useState(defaultPortions || 10);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const selectedRecipe = useMemo(
    () => recipes.find((r) => r.recipe_id === selectedId) || null,
    [recipes, selectedId]
  );

  const handleScale = async () => {
    if (!selectedId) {
      toast.error(language === "es" ? "Selecciona una receta" : "Pick a recipe");
      return;
    }
    if (!targetPortions || targetPortions <= 0) {
      toast.error(language === "es" ? "Porciones inválidas" : "Invalid portions");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(
        `${API}/recipes/${selectedId}/scale`,
        { target_portions: Number(targetPortions) },
        { withCredentials: true }
      );
      setResult(res.data);
    } catch (e) {
      toast.error(
        language === "es" ? "Error al escalar receta" : "Recipe scaling failed"
      );
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setSelectedId("");
  };

  return (
    <Card className="border-dashed border-primary/40" data-testid="recipe-scaling-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="w-4 h-4 text-primary" />
          {language === "es" ? "Calculadora de Escalado de Receta" : "Recipe Scaling Calculator"}
          <Badge variant="outline" className="text-[10px] font-normal">
            {language === "es" ? "Solo vista" : "Read-only"}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Info className="w-3 h-3" />
          {language === "es"
            ? "Visualiza cantidades y costos escalados sin tocar la receta original."
            : "Preview scaled quantities & cost without altering the original recipe."}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-2 items-end">
          <div>
            <Label className="text-xs">{language === "es" ? "Receta" : "Recipe"}</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger data-testid="scaling-recipe-select">
                <SelectValue
                  placeholder={language === "es" ? "Elige una receta..." : "Pick a recipe..."}
                />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {recipes.map((r) => (
                  <SelectItem key={r.recipe_id} value={r.recipe_id}>
                    {r.name}
                    {r.cost_per_portion ? ` — $${fmtNum((r.cost_per_portion))}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">
              {language === "es" ? "Porciones objetivo" : "Target portions"}
            </Label>
            <Input
              type="number"
              min={1}
              value={targetPortions}
              onChange={(e) => setTargetPortions(e.target.value)}
              data-testid="scaling-target-portions"
            />
          </div>
          <Button
            onClick={handleScale}
            disabled={loading || !selectedId}
            data-testid="scaling-calculate-btn"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            <span className="ml-1.5">{language === "es" ? "Calcular" : "Scale"}</span>
          </Button>
        </div>

        {selectedRecipe && !result && (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <ChefHat className="w-3 h-3" />
            {language === "es" ? "Rinde base" : "Base yield"}: {selectedRecipe.yield_quantity || 1}{" "}
            {selectedRecipe.yield_unit || "portion"} ·{" "}
            {language === "es" ? "Costo/porción" : "Cost/portion"}: $
            {fmtNum((selectedRecipe.cost_per_portion || 0))}
          </div>
        )}

        {result && (
          <div className="space-y-2" data-testid="scaling-result">
            <div className="grid grid-cols-3 gap-2 text-center bg-muted/40 rounded-md p-2">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">
                  {language === "es" ? "Factor" : "Factor"}
                </p>
                <p className="font-semibold text-sm" data-testid="scaling-factor">
                  ×{result.scale_factor}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">
                  {language === "es" ? "Costo total" : "Total cost"}
                </p>
                <p className="font-semibold text-sm text-primary" data-testid="scaling-total-cost">
                  ${fmtNum((result.total_cost_scaled || 0))}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">
                  {language === "es" ? "Costo/porción" : "Cost/portion"}
                </p>
                <p className="font-semibold text-sm" data-testid="scaling-cost-per-portion">
                  ${fmtNum((result.cost_per_portion_scaled || 0))}
                </p>
              </div>
            </div>

            <div className="border rounded-md max-h-56 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">
                      {language === "es" ? "Ingrediente" : "Ingredient"}
                    </th>
                    <th className="text-right px-2 py-1.5 font-medium">
                      {language === "es" ? "Cantidad" : "Qty"}
                    </th>
                    <th className="text-right px-2 py-1.5 font-medium">
                      {language === "es" ? "Costo" : "Cost"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(result.ingredients || []).map((ing, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-2 py-1">{ing.name || ing.ingredient_id}</td>
                      <td className="px-2 py-1 text-right font-mono">
                        {fmtNum((ing.quantity_scaled ?? ing.quantity_original ?? 0))}{" "}
                        <span className="text-muted-foreground">{ing.unit}</span>
                      </td>
                      <td className="px-2 py-1 text-right font-mono">
                        ${fmtNum((ing.line_cost || 0))}
                      </td>
                    </tr>
                  ))}
                  {(result.sub_recipes || []).length > 0 &&
                    result.sub_recipes.map((sub, idx) => (
                      <tr key={`sub-${idx}`} className="border-t bg-blue-50/30 dark:bg-blue-950/10">
                        <td className="px-2 py-1 italic">
                          ↳ {sub.name || sub.child_recipe_id}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">
                          {fmtNum((sub.quantity_scaled || 0))}{" "}
                          <span className="text-muted-foreground">{sub.unit}</span>
                        </td>
                        <td className="px-2 py-1 text-right text-muted-foreground">—</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={reset}
                data-testid="scaling-reset-btn"
              >
                {language === "es" ? "Limpiar" : "Reset"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
