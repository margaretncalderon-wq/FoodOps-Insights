import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import { ArrowLeft, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PRESETS = [
  { key: "restaurant", label: "Restaurante", food: 30, prime: 60, margin: 65, chef: 20, oh: 15,
    desc: "Restaurante casual — food cost 30%, prime 60%, margen 65%." },
  { key: "fine_dining", label: "Fine Dining", food: 25, prime: 55, margin: 70, chef: 30, oh: 20,
    desc: "Restaurante alto rango — mano de obra premium, overhead alto." },
  { key: "catering", label: "Catering / Eventos", food: 28, prime: 55, margin: 65, chef: 25, oh: 18,
    desc: "Eventos y banquetes — mano de obra por servicio, overhead intermedio." },
  { key: "quick_service", label: "Quick Service", food: 33, prime: 62, margin: 60, chef: 15, oh: 12,
    desc: "Fast casual / QSR — food cost mayor, labor menor." },
  { key: "buffet", label: "Buffet", food: 35, prime: 60, margin: 55, chef: 18, oh: 15,
    desc: "Buffet libre — food cost mayor por desperdicio, margen menor." },
];

export default function RecipeCostingSettingsPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState({
    chef_hourly_rate: 20,
    recipe_overhead_percent: 15,
    recipe_target_food_cost_percent: 30,
    recipe_target_prime_cost_percent: 55,
    recipe_target_gross_margin_percent: 65,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    axios.get(`${API}/settings/company`, { withCredentials: true }).then((res) => {
      if (!alive) return;
      const c = res.data || {};
      setConfig({
        chef_hourly_rate: Number(c.chef_hourly_rate ?? 20),
        recipe_overhead_percent: Number(c.recipe_overhead_percent ?? 15),
        recipe_target_food_cost_percent: Number(c.recipe_target_food_cost_percent ?? 30),
        recipe_target_prime_cost_percent: Number(c.recipe_target_prime_cost_percent ?? 55),
        recipe_target_gross_margin_percent: Number(c.recipe_target_gross_margin_percent ?? 65),
      });
    }).catch((err) => {
      console.error("Load config failed", err);
      toast.error("No se pudo cargar la configuración");
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const applyPreset = (preset) => {
    setConfig({
      chef_hourly_rate: preset.chef,
      recipe_overhead_percent: preset.oh,
      recipe_target_food_cost_percent: preset.food,
      recipe_target_prime_cost_percent: preset.prime,
      recipe_target_gross_margin_percent: preset.margin,
    });
    toast.info(`Preset "${preset.label}" cargado. Recuerda guardar.`);
  };

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/settings/company`, config, { withCredentials: true });
      toast.success("Configuración guardada");
    } catch (err) {
      console.error(err);
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const updateNumber = (key) => (e) => setConfig({ ...config, [key]: parseFloat(e.target.value) || 0 });

  if (loading) return <div className="p-8">Cargando configuración…</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6" data-testid="recipe-costing-settings-page">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} data-testid="back-button">
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Configuración de Costeo de Recetas</h1>
          <p className="text-sm text-muted-foreground">
            Parámetros de labor, overhead y estrategias de precio a nivel de empresa. Aplican a todas las recetas.
          </p>
        </div>
      </div>

      {/* Industry presets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Presets de Industria</CardTitle>
          <CardDescription>
            Elige un tipo de operación para cargar los 5 parámetros con valores estándar de la industria.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset)}
                className="text-left p-3 rounded-lg border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50 transition-colors"
                data-testid={`preset-${preset.key}`}
              >
                <p className="font-semibold text-slate-800">{preset.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{preset.desc}</p>
                <div className="text-[10px] text-slate-500 mt-1 space-x-2">
                  <span>Food {preset.food}%</span>
                  <span>Prime {preset.prime}%</span>
                  <span>Margen {preset.margin}%</span>
                  <span>Chef ${preset.chef}/hr</span>
                  <span>OH {preset.oh}%</span>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Parameters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Parámetros</CardTitle>
          <CardDescription>Ajusta manualmente cualquier valor. Se guarda a nivel de empresa.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="chef">Tarifa Chef ($/hora)</Label>
              <Input id="chef" type="number" min="0" step="0.5" value={config.chef_hourly_rate}
                onChange={updateNumber("chef_hourly_rate")} data-testid="chef-hourly-input" />
              <p className="text-[11px] text-muted-foreground mt-1">
                Costo por hora de mano de obra. Se multiplica por los minutos de prep + cocción.
              </p>
            </div>
            <div>
              <Label htmlFor="oh">Overhead (%)</Label>
              <Input id="oh" type="number" min="0" step="1" value={config.recipe_overhead_percent}
                onChange={updateNumber("recipe_overhead_percent")} data-testid="overhead-input" />
              <p className="text-[11px] text-muted-foreground mt-1">
                % sobre el food cost para cubrir renta, servicios, seguros, sueldos administrativos.
              </p>
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-sm font-semibold mb-2">Objetivos por método de precio</p>
            <p className="text-xs text-muted-foreground mb-3">
              El sistema calcula 3 precios sugeridos usando estos targets. El editor de recetas muestra el <b>Método Food Cost</b> por defecto.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="food">A) Food Cost objetivo (%)</Label>
                <Input id="food" type="number" min="0" max="100" step="1" value={config.recipe_target_food_cost_percent}
                  onChange={updateNumber("recipe_target_food_cost_percent")} data-testid="target-food-pct-input" />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Método principal: precio = food ÷ target%. Ej: 30% típico restaurante.
                </p>
              </div>
              <div>
                <Label htmlFor="prime">B) Prime Cost objetivo (%)</Label>
                <Input id="prime" type="number" min="0" max="100" step="1" value={config.recipe_target_prime_cost_percent}
                  onChange={updateNumber("recipe_target_prime_cost_percent")} data-testid="target-prime-pct-input" />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Método alternativo: (food+labor) ÷ target%. Ej: 55% fine dining.
                </p>
              </div>
              <div>
                <Label htmlFor="margin">C) Margen Bruto objetivo (%)</Label>
                <Input id="margin" type="number" min="0" max="100" step="1" value={config.recipe_target_gross_margin_percent}
                  onChange={updateNumber("recipe_target_gross_margin_percent")} data-testid="target-margin-pct-input" />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Método catering: total ÷ (1 − margen%). Ej: 65% eventos.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} data-testid="save-config-button">
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}
