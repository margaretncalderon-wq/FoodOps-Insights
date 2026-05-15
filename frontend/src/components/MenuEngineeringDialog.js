import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useLanguage } from "../contexts/LanguageContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { TrendingUp, Sparkles, Loader2, Info, ChevronRight } from "lucide-react";
import { API_BASE as API } from "../utils/api";

const QUADRANT_META = {
  star: {
    labelEn: "Star", labelEs: "Estrella",
    cls: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300",
    descEn: "High popularity + high profit. Promote & protect.",
    descEs: "Alta popularidad + alta utilidad. Promueve y protege.",
  },
  plowhorse: {
    labelEn: "Plowhorse", labelEs: "Caballo de tiro",
    cls: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300",
    descEn: "High popularity, low profit. Raise price or cut cost.",
    descEs: "Alta popularidad, baja utilidad. Sube precio o baja costo.",
  },
  puzzle: {
    labelEn: "Puzzle", labelEs: "Rompecabezas",
    cls: "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-300",
    descEn: "Low popularity, high profit. Push with marketing.",
    descEs: "Baja popularidad, alta utilidad. Impulsa con marketing.",
  },
  dog: {
    labelEn: "Dog", labelEs: "Perro",
    cls: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300",
    descEn: "Low popularity + low profit. Remove or redesign.",
    descEs: "Baja popularidad + baja utilidad. Elimina o rediseña.",
  },
};

/**
 * MenuEngineeringDialog — Feature 3.
 *
 * Calls GET /api/menu-engineering/analyze to classify recipes into 4 quadrants,
 * and POST /api/menu-engineering/what-if to simulate price/cost changes.
 */
export default function MenuEngineeringDialog({ open, onOpenChange }) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [windowDays, setWindowDays] = useState(90);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [whatIf, setWhatIf] = useState({ recipe_id: "", new_cost_per_portion: "", new_sell_price: "" });
  const [simulation, setSimulation] = useState(null);
  const [simulating, setSimulating] = useState(false);

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/menu-engineering/analyze`, {
        params: { days: windowDays },
        withCredentials: true,
      });
      setData(res.data);
    } catch (e) {
      toast.error(isEs ? "Error al analizar" : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [windowDays, isEs]);

  useEffect(() => {
    if (open) {
      fetchAnalysis();
      setSimulation(null);
      setWhatIf({ recipe_id: "", new_cost_per_portion: "", new_sell_price: "" });
    }
  }, [open, fetchAnalysis]);

  const selectedRecipe = useMemo(
    () => (data?.recipes || []).find((r) => r.recipe_id === whatIf.recipe_id),
    [data, whatIf.recipe_id]
  );

  const runWhatIf = async () => {
    if (!whatIf.recipe_id) return toast.error(isEs ? "Elige receta" : "Pick a recipe");
    setSimulating(true);
    try {
      const body = { recipe_id: whatIf.recipe_id, days: windowDays };
      if (whatIf.new_cost_per_portion !== "") body.new_cost_per_portion = Number(whatIf.new_cost_per_portion);
      if (whatIf.new_sell_price !== "") body.new_sell_price = Number(whatIf.new_sell_price);
      const res = await axios.post(`${API}/api/menu-engineering/what-if`, body, { withCredentials: true });
      setSimulation(res.data);
    } catch (e) {
      const msg = e?.response?.data?.detail;
      toast.error(typeof msg === "string" ? msg : (isEs ? "Error en simulación" : "Simulation failed"));
    } finally {
      setSimulating(false);
    }
  };

  const summary = data?.quadrants_summary || {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="menu-engineering-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            {isEs ? "Análisis de Ingeniería de Menú" : "Menu Engineering Analysis"}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Info className="w-3 h-3" />
            {isEs
              ? "Clasifica recetas por popularidad y utilidad. Promueve estrellas, ajusta plowhorses, impulsa puzzles, elimina dogs."
              : "Classifies recipes by popularity vs profit. Promote stars, fix plowhorses, push puzzles, remove dogs."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end justify-between gap-2 flex-wrap">
          <div>
            <Label className="text-xs">{isEs ? "Ventana (días)" : "Window (days)"}</Label>
            <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))}>
              <SelectTrigger className="w-40" data-testid="me-window-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30</SelectItem>
                <SelectItem value="60">60</SelectItem>
                <SelectItem value="90">90</SelectItem>
                <SelectItem value="180">180</SelectItem>
                <SelectItem value="365">365</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground">
            {isEs ? "Umbrales:" : "Thresholds:"} pop≥{data?.thresholds?.popularity_avg ?? 0}, profit≥${data?.thresholds?.profit_avg ?? 0}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.keys(QUADRANT_META).map((q) => (
            <Card key={q} className={`${QUADRANT_META[q].cls} border`} data-testid={`me-quadrant-${q}`}>
              <CardContent className="p-3">
                <p className="text-[10px] uppercase font-bold">{isEs ? QUADRANT_META[q].labelEs : QUADRANT_META[q].labelEn}</p>
                <p className="text-2xl font-bold">{summary[q] || 0}</p>
                <p className="text-[10px] mt-1 opacity-90">{isEs ? QUADRANT_META[q].descEs : QUADRANT_META[q].descEn}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {loading ? (
          <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : (data?.recipes || []).length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">
            {isEs ? "Sin recetas con precio de venta. Agrega precios para empezar el análisis." : "No recipes with sell price. Add prices to start the analysis."}
          </p>
        ) : (
          <div className="border rounded-md max-h-72 overflow-y-auto" data-testid="me-recipes-table">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>{isEs ? "Receta" : "Recipe"}</TableHead>
                  <TableHead>{isEs ? "Cuadrante" : "Quadrant"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Popularidad" : "Popularity"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Costo" : "Cost"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Precio" : "Price"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Utilidad" : "Profit"}</TableHead>
                  <TableHead className="text-right">{isEs ? "Margen %" : "Margin %"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recipes.map((r) => (
                  <TableRow key={r.recipe_id} data-testid={`me-recipe-row-${r.recipe_id}`}>
                    <TableCell className="font-medium">{r.recipe_name}</TableCell>
                    <TableCell>
                      <Badge className={`${QUADRANT_META[r.quadrant]?.cls} text-[10px]`}>
                        {isEs ? QUADRANT_META[r.quadrant]?.labelEs : QUADRANT_META[r.quadrant]?.labelEn}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{r.popularity_score}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">${r.cost_per_portion}</TableCell>
                    <TableCell className="text-right font-mono">${r.sell_price}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">${r.profit_per_portion}</TableCell>
                    <TableCell className="text-right font-mono">{r.profit_margin_percent}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* What-If Simulator */}
        <div className="border rounded-md p-3 bg-muted/30 mt-2" data-testid="me-what-if">
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            {isEs ? "Simulador What-If" : "What-If Simulator"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
            <div>
              <Label className="text-xs">{isEs ? "Receta" : "Recipe"}</Label>
              <Select value={whatIf.recipe_id} onValueChange={(v) => setWhatIf({ ...whatIf, recipe_id: v })}>
                <SelectTrigger data-testid="me-whatif-recipe-select">
                  <SelectValue placeholder={isEs ? "Elige..." : "Pick..."} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {(data?.recipes || []).map((r) => (
                    <SelectItem key={r.recipe_id} value={r.recipe_id}>{r.recipe_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{isEs ? "Nuevo costo" : "New cost"}</Label>
              <Input
                type="number"
                step="0.01"
                placeholder={selectedRecipe ? `$${selectedRecipe.cost_per_portion}` : "—"}
                value={whatIf.new_cost_per_portion}
                onChange={(e) => setWhatIf({ ...whatIf, new_cost_per_portion: e.target.value })}
                data-testid="me-whatif-cost"
              />
            </div>
            <div>
              <Label className="text-xs">{isEs ? "Nuevo precio" : "New price"}</Label>
              <Input
                type="number"
                step="0.01"
                placeholder={selectedRecipe ? `$${selectedRecipe.sell_price}` : "—"}
                value={whatIf.new_sell_price}
                onChange={(e) => setWhatIf({ ...whatIf, new_sell_price: e.target.value })}
                data-testid="me-whatif-price"
              />
            </div>
            <Button onClick={runWhatIf} disabled={simulating || !whatIf.recipe_id} data-testid="me-whatif-run-btn">
              {simulating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span className="ml-1.5">{isEs ? "Simular" : "Simulate"}</span>
            </Button>
          </div>
          {simulation && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-stretch" data-testid="me-whatif-result">
              <Card>
                <CardContent className="p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">{isEs ? "Actual" : "Current"}</p>
                  <p className="text-sm">${simulation.current.cost_per_portion} → ${simulation.current.sell_price}</p>
                  <p className="text-xs font-mono">Δ ${simulation.current.profit_per_portion}</p>
                  <Badge className={`${QUADRANT_META[simulation.current.quadrant]?.cls} text-[10px] mt-1`}>
                    {isEs ? QUADRANT_META[simulation.current.quadrant]?.labelEs : QUADRANT_META[simulation.current.quadrant]?.labelEn}
                  </Badge>
                </CardContent>
              </Card>
              <div className="flex items-center justify-center"><ChevronRight className="w-6 h-6 text-muted-foreground" /></div>
              <Card>
                <CardContent className="p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">{isEs ? "Simulado" : "Simulated"}</p>
                  <p className="text-sm">${simulation.simulated.cost_per_portion} → ${simulation.simulated.sell_price}</p>
                  <p className="text-xs font-mono">Δ ${simulation.simulated.profit_per_portion}</p>
                  <Badge className={`${QUADRANT_META[simulation.simulated.quadrant]?.cls} text-[10px] mt-1`}>
                    {isEs ? QUADRANT_META[simulation.simulated.quadrant]?.labelEs : QUADRANT_META[simulation.simulated.quadrant]?.labelEn}
                  </Badge>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="me-close-btn">
            {isEs ? "Cerrar" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
