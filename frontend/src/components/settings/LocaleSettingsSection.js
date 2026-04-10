import { useState } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useLocale } from "../../contexts/LocaleContext";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Globe, DollarSign, Clock, Check } from "lucide-react";
import { toast } from "sonner";

export default function LocaleSettingsSection() {
  const { language, changeLanguage } = useLanguage();
  const { locale, currencies, timezones, updateLocale } = useLocale();
  const isEs = language === "es";
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    currency: locale.currency,
    timezone: locale.timezone,
    language: locale.language,
  });

  const handleSave = async () => {
    setSaving(true);
    const ok = await updateLocale(form);
    if (ok) {
      if (form.language !== language) changeLanguage(form.language);
      toast.success(isEs ? "Configuración regional guardada" : "Locale settings saved");
    } else {
      toast.error(isEs ? "Error al guardar" : "Error saving");
    }
    setSaving(false);
  };

  const hasChanges = form.currency !== locale.currency || form.timezone !== locale.timezone || form.language !== locale.language;

  return (
    <div className="space-y-6" data-testid="locale-settings-section">
      <div>
        <h2 className="text-lg font-semibold">{isEs ? "Configuración Regional" : "Locale Settings"}</h2>
        <p className="text-sm text-muted-foreground">
          {isEs ? "Idioma, moneda y zona horaria de la organización" : "Organization language, currency and timezone"}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Language */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe className="w-4 h-4" />
              {isEs ? "Idioma" : "Language"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
              <SelectTrigger data-testid="locale-language-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Currency */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              {isEs ? "Moneda" : "Currency"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger data-testid="locale-currency-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map(c => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.symbol} {c.code} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              {isEs ? "Se usará en propuestas, facturas y reportes" : "Used in proposals, invoices and reports"}
            </p>
          </CardContent>
        </Card>

        {/* Timezone */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {isEs ? "Zona Horaria" : "Timezone"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
              <SelectTrigger data-testid="locale-timezone-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timezones.map(tz => (
                  <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {hasChanges && (
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving} data-testid="locale-save-btn">
            <Check className="w-4 h-4 mr-2" />
            {saving ? (isEs ? "Guardando..." : "Saving...") : (isEs ? "Guardar Cambios" : "Save Changes")}
          </Button>
          <Button variant="outline" onClick={() => setForm({ currency: locale.currency, timezone: locale.timezone, language: locale.language })}>
            {isEs ? "Cancelar" : "Cancel"}
          </Button>
        </div>
      )}

      {/* Current summary */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">{locale.language === "es" ? "Español" : "English"}</Badge>
        <Badge variant="outline">{locale.currency}</Badge>
        <Badge variant="outline">{locale.timezone.replace(/_/g, " ")}</Badge>
      </div>
    </div>
  );
}
