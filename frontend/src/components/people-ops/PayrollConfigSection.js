import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../../contexts/LanguageContext";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Settings, Save, RefreshCw, Info, Calculator,
  Percent, Calendar, Building2, Clock, DollarSign, Zap, CreditCard, CheckCircle
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

export function PayrollConfigSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  // Separate state for payroll config and variable pay config
  const [config, setConfig] = useState(null);
  const [variablePayConfig, setVariablePayConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [hasVariablePayChanges, setHasVariablePayChanges] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch both configs in parallel
      const [payrollRes, variablePayRes] = await Promise.all([
        axios.get(`${API}/api/people-ops/payroll/config`, { withCredentials: true }),
        axios.get(`${API}/api/settings/variable-pay-config`, { withCredentials: true })
      ]);
      setConfig(payrollRes.data);
      setVariablePayConfig(variablePayRes.data);
    } catch (err) {
      console.error("Error fetching config:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleChange = (field, value) => {
    setConfig({ ...config, [field]: value });
    setHasChanges(true);
  };

  const handleVariablePayChange = (field, value) => {
    setVariablePayConfig({ ...variablePayConfig, [field]: value });
    setHasVariablePayChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save both configs if they have changes
      const promises = [];
      
      if (hasChanges) {
        promises.push(
          axios.post(`${API}/api/people-ops/payroll/config`, config, { withCredentials: true })
        );
      }
      
      if (hasVariablePayChanges) {
        promises.push(
          axios.post(`${API}/api/settings/variable-pay-config`, variablePayConfig, { withCredentials: true })
        );
      }
      
      await Promise.all(promises);
      setHasChanges(false);
      setHasVariablePayChanges(false);
      alert(isEs ? "Configuración guardada" : "Configuration saved");
    } catch (err) {
      console.error("Error saving config:", err);
      alert(err.response?.data?.detail || "Error saving configuration");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="payroll-config-section">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings className="w-5 h-5" />
            {isEs ? "Configuración de Nómina" : "Payroll Configuration"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEs 
              ? "Define las tasas de deducciones y configuración de pago" 
              : "Define deduction rates and payment configuration"}
          </p>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={(!hasChanges && !hasVariablePayChanges) || saving}
          data-testid="save-config-btn"
        >
          {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {isEs ? "Guardar Cambios" : "Save Changes"}
        </Button>
      </div>

      {/* Info Banner */}
      <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 flex items-center gap-2">
        <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
        <p className="text-sm text-blue-800">
          {isEs 
            ? "Las tasas se basan en la legislación laboral de República Dominicana (2024). Ajusta según sea necesario." 
            : "Rates are based on Dominican Republic labor law (2024). Adjust as needed."}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Payment Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {isEs ? "Calendario de Pago" : "Payment Schedule"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Frecuencia de Pago" : "Payment Frequency"}</label>
              <Select 
                value={config?.payment_frequency || "biweekly"} 
                onValueChange={(v) => handleChange("payment_frequency", v)}
              >
                <SelectTrigger data-testid="payment-frequency-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">{isEs ? "Semanal" : "Weekly"}</SelectItem>
                  <SelectItem value="biweekly">{isEs ? "Quincenal" : "Biweekly"}</SelectItem>
                  <SelectItem value="monthly">{isEs ? "Mensual" : "Monthly"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Día de Pago 1" : "Payment Day 1"}</label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={config?.payment_day_1 || 15}
                  onChange={(e) => handleChange("payment_day_1", parseInt(e.target.value) || 15)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {isEs ? "Primer pago del mes" : "First payment of month"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">{isEs ? "Día de Pago 2" : "Payment Day 2"}</label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={config?.payment_day_2 || 30}
                  onChange={(e) => handleChange("payment_day_2", parseInt(e.target.value) || 30)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {isEs ? "Segundo pago (quincenal)" : "Second payment (biweekly)"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* TSS - AFP */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              AFP {isEs ? "(Pensión)" : "(Pension)"}
            </CardTitle>
            <CardDescription>
              {isEs ? "Administradoras de Fondos de Pensiones" : "Pension Fund Administrators"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium flex items-center gap-1">
                  {isEs ? "Aporte Empleado" : "Employee Rate"}
                  <Percent className="w-3 h-3" />
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={config?.afp_employee_rate || 2.87}
                  onChange={(e) => handleChange("afp_employee_rate", parseFloat(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground mt-1">{isEs ? "Legal: 2.87%" : "Legal: 2.87%"}</p>
              </div>
              <div>
                <label className="text-sm font-medium flex items-center gap-1">
                  {isEs ? "Aporte Empleador" : "Employer Rate"}
                  <Percent className="w-3 h-3" />
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={config?.afp_employer_rate || 7.10}
                  onChange={(e) => handleChange("afp_employer_rate", parseFloat(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground mt-1">{isEs ? "Legal: 7.10%" : "Legal: 7.10%"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* TSS - ARS */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              ARS {isEs ? "(Salud)" : "(Health)"}
            </CardTitle>
            <CardDescription>
              {isEs ? "Administradoras de Riesgos de Salud" : "Health Risk Administrators"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium flex items-center gap-1">
                  {isEs ? "Aporte Empleado" : "Employee Rate"}
                  <Percent className="w-3 h-3" />
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={config?.ars_employee_rate || 3.04}
                  onChange={(e) => handleChange("ars_employee_rate", parseFloat(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground mt-1">{isEs ? "Legal: 3.04%" : "Legal: 3.04%"}</p>
              </div>
              <div>
                <label className="text-sm font-medium flex items-center gap-1">
                  {isEs ? "Aporte Empleador" : "Employer Rate"}
                  <Percent className="w-3 h-3" />
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={config?.ars_employer_rate || 7.09}
                  onChange={(e) => handleChange("ars_employer_rate", parseFloat(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground mt-1">{isEs ? "Legal: 7.09%" : "Legal: 7.09%"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Other Contributions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="w-4 h-4" />
              {isEs ? "Otras Contribuciones" : "Other Contributions"}
            </CardTitle>
            <CardDescription>
              {isEs ? "Aportes adicionales del empleador" : "Additional employer contributions"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium flex items-center gap-1">
                  SRL {isEs ? "(Riesgos Lab.)" : "(Work Risk)"}
                  <Percent className="w-3 h-3" />
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={config?.srl_rate || 1.20}
                  onChange={(e) => handleChange("srl_rate", parseFloat(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground mt-1">{isEs ? "Solo empleador: 1.20%" : "Employer only: 1.20%"}</p>
              </div>
              <div>
                <label className="text-sm font-medium flex items-center gap-1">
                  INFOTEP
                  <Percent className="w-3 h-3" />
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={config?.infotep_rate || 1.0}
                  onChange={(e) => handleChange("infotep_rate", parseFloat(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground mt-1">{isEs ? "Solo empleador: 1.0%" : "Employer only: 1.0%"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ISR */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="w-4 h-4" />
              ISR {isEs ? "(Impuesto sobre la Renta)" : "(Income Tax)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{isEs ? "Calcular ISR" : "Calculate ISR"}</p>
                <p className="text-sm text-muted-foreground">
                  {isEs ? "Aplicar retención automática según escala" : "Apply automatic withholding by scale"}
                </p>
              </div>
              <Switch
                checked={config?.isr_enabled !== false}
                onCheckedChange={(v) => handleChange("isr_enabled", v)}
              />
            </div>
            
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <p className="font-medium mb-2">{isEs ? "Escala ISR 2024 (RD)" : "ISR Scale 2024 (RD)"}</p>
              <div className="space-y-1 text-xs">
                <p>RD$0 - RD$416,220 → 0%</p>
                <p>RD$416,220.01 - RD$624,329 → 15%</p>
                <p>RD$624,329.01 - RD$867,123 → 20%</p>
                <p>RD$867,123.01+ → 25%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overtime Rates */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="w-4 h-4" />
              {isEs ? "Horas Extras" : "Overtime Rates"}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {isEs ? "Multiplicadores aplicados al valor hora normal. Configurables por país." : "Multipliers applied to the regular hourly rate. Country-configurable."}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Country selector */}
            <div>
              <label className="text-sm font-medium">
                {isEs ? "País (ISO-2)" : "Country (ISO-2)"}
              </label>
              <Input
                maxLength={2}
                value={config?.country_code || ""}
                onChange={(e) => handleChange("country_code", e.target.value.toUpperCase())}
                placeholder="DO, MX, CO, US, ES…"
                data-testid="config-country-code"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {isEs ? "Define defaults legales. DO=Rep. Dominicana, MX=México, CO=Colombia." : "Sets legal defaults. DO=Dominican Rep, MX=Mexico, CO=Colombia."}
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">
                  {isEs ? "Hora Normal (35%)" : "Normal OT (35%)"}
                </label>
                <Input
                  type="number" step="0.01"
                  value={config?.overtime_rate_35 || 1.35}
                  onChange={(e) => handleChange("overtime_rate_35", parseFloat(e.target.value) || 1.35)}
                  data-testid="rate-35"
                />
                <p className="text-xs text-muted-foreground mt-1">{isEs ? "Recargo después de la jornada normal" : "After regular shift"}</p>
              </div>
              <div>
                <label className="text-sm font-medium">
                  {isEs ? "Trabajo Nocturno (15%)" : "Night Shift (15%)"}
                </label>
                <Input
                  type="number" step="0.01"
                  value={config?.overtime_rate_night || 1.15}
                  onChange={(e) => handleChange("overtime_rate_night", parseFloat(e.target.value) || 1.15)}
                  data-testid="rate-night"
                />
                <p className="text-xs text-muted-foreground mt-1">{isEs ? "Horario 9pm – 7am" : "9pm – 7am shifts"}</p>
              </div>
              <div>
                <label className="text-sm font-medium">
                  {isEs ? "Feriado / Domingo (100%)" : "Holiday / Sunday (100%)"}
                </label>
                <Input
                  type="number" step="0.01"
                  value={config?.overtime_rate_holiday || 2.0}
                  onChange={(e) => handleChange("overtime_rate_holiday", parseFloat(e.target.value) || 2.0)}
                  data-testid="rate-holiday"
                />
                <p className="text-xs text-muted-foreground mt-1">{isEs ? "Domingos y feriados nacionales" : "Sundays and national holidays"}</p>
              </div>
              <div>
                <label className="text-sm font-medium">
                  {isEs ? "Hora Extra 100% (>68h)" : "Overtime 100% (>68h)"}
                </label>
                <Input
                  type="number" step="0.01"
                  value={config?.overtime_rate_100 || 2.0}
                  onChange={(e) => handleChange("overtime_rate_100", parseFloat(e.target.value) || 2.0)}
                  data-testid="rate-100"
                />
                <p className="text-xs text-muted-foreground mt-1">{isEs ? "Horas que exceden 68h/sem" : "Hours above 68/week"}</p>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">
                {isEs ? "Horas laborables al mes" : "Working hours per month"}
              </label>
              <Input
                type="number" step="1"
                value={config?.overtime_hours_per_month || 192}
                onChange={(e) => handleChange("overtime_hours_per_month", parseFloat(e.target.value) || 192)}
                data-testid="hours-per-month"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {isEs ? "Para calcular valor hora normal (DO: 192, MX: 192, CO: 240, US: 173)" : "To compute regular hourly rate (DO: 192, MX: 192, CO: 240, US: 173)"}
              </p>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-md border border-amber-200 bg-amber-50/60">
              <input
                type="checkbox"
                id="ot-strict-check"
                checked={config?.overtime_strict_shortfall !== false}
                onChange={(e) => handleChange("overtime_strict_shortfall", e.target.checked)}
                className="w-4 h-4 mt-0.5"
                data-testid="ot-strict-shortfall-toggle"
              />
              <div className="flex-1">
                <label htmlFor="ot-strict-check" className="text-sm font-medium cursor-pointer">
                  {isEs ? "Modo estricto: horas parciales descuentan del OT" : "Strict mode: partial workdays deduct from OT"}
                </label>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  {isEs
                    ? "Si un empleado trabaja MENOS que su horario base un día (ej. 7h de 8h), esa 1h faltante se descuenta del OT acumulado del período. Desactivar para modo lenient (solo días marcados Libre o vacaciones descuentan)."
                    : "If an employee works LESS than their base schedule (e.g. 7h of 8h), the missing 1h deducts from period OT. Turn off for lenient mode (only marked days-off / vacations deduct)."}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-md border border-indigo-200 bg-indigo-50/60">
              <input
                type="checkbox"
                id="ot-night-stack-check"
                checked={config?.overtime_night_stack_surcharges !== false}
                onChange={(e) => handleChange("overtime_night_stack_surcharges", e.target.checked)}
                className="w-4 h-4 mt-0.5"
                data-testid="ot-night-stack-toggle"
              />
              <div className="flex-1">
                <label htmlFor="ot-night-stack-check" className="text-sm font-medium cursor-pointer">
                  {isEs ? "Apilar recargos: OT nocturna = 35% + 15% = 50%" : "Stack surcharges: night OT = 35% + 15% = 50%"}
                </label>
                <p className="text-[11px] text-indigo-800 mt-0.5">
                  {isEs
                    ? "Ley RD (Art. 149 + 203): las horas OT que caen en franja nocturna (21:00-06:00) apilan recargo de extras (35%) + recargo nocturno (15%) = 50%. Desactivar para pagar solo 15% en nocturnas OT (menos común)."
                    : "DR Law (Art. 149 + 203): OT hours in the night window (21:00-06:00) stack overtime (35%) + night (15%) surcharges = 50%. Turn off to pay only 15% for night OT (less common)."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Regalia */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="w-4 h-4" />
              {isEs ? "Regalía Pascual" : "Christmas Bonus"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{isEs ? "Incluir Regalía" : "Include Bonus"}</p>
                <p className="text-sm text-muted-foreground">
                  {isEs ? "Calcular provisión mensual para regalía" : "Calculate monthly provision for bonus"}
                </p>
              </div>
              <Switch
                checked={config?.include_regalia !== false}
                onCheckedChange={(v) => handleChange("include_regalia", v)}
              />
            </div>
            
            {config?.include_regalia !== false && (
              <div>
                <label className="text-sm font-medium">{isEs ? "Meses para Cálculo" : "Months for Calculation"}</label>
                <Input
                  type="number"
                  min="1"
                  max="12"
                  value={config?.regalia_months || 12}
                  onChange={(e) => handleChange("regalia_months", parseInt(e.target.value) || 12)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {isEs ? "Por ley: 12 meses (1 salario completo)" : "By law: 12 months (1 full salary)"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Variable Pay Configuration Section */}
      <div className="mt-8 pt-8 border-t">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          {isEs ? "Pagos Variables (Configuración por Defecto)" : "Variable Pay (Default Configuration)"}
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          {isEs 
            ? "Define las fechas de pago por defecto para horas extras, comisiones, bonos e incentivos. Cada empleado puede tener configuración individual en su perfil." 
            : "Define default payment dates for overtime, commissions, bonuses and incentives. Each employee can have individual configuration in their profile."}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Overtime */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                {isEs ? "Horas Extras" : "Overtime"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Tipo de Pago" : "Payment Type"}</label>
                <Select 
                  value={variablePayConfig?.overtime_payment_type || "separate"} 
                  onValueChange={(v) => handleVariablePayChange("overtime_payment_type", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="with_payroll">{isEs ? "Con nómina regular" : "With regular payroll"}</SelectItem>
                    <SelectItem value="separate">{isEs ? "Pago separado" : "Separate payment"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {variablePayConfig?.overtime_payment_type === "separate" && (
                <div>
                  <label className="text-sm font-medium">{isEs ? "Día de Pago" : "Payment Day"}</label>
                  <Input
                    type="number"
                    min="1"
                    max="28"
                    value={variablePayConfig?.overtime_payment_day || 5}
                    onChange={(e) => handleVariablePayChange("overtime_payment_day", parseInt(e.target.value) || 5)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {isEs ? "Día del mes para pagar horas extras" : "Day of month to pay overtime"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Commissions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Percent className="w-4 h-4 text-emerald-500" />
                {isEs ? "Comisiones" : "Commissions"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Tipo de Pago" : "Payment Type"}</label>
                <Select 
                  value={variablePayConfig?.commission_payment_type || "separate"} 
                  onValueChange={(v) => handleVariablePayChange("commission_payment_type", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="with_payroll">{isEs ? "Con nómina regular" : "With regular payroll"}</SelectItem>
                    <SelectItem value="separate">{isEs ? "Pago separado" : "Separate payment"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {variablePayConfig?.commission_payment_type === "separate" && (
                <div>
                  <label className="text-sm font-medium">{isEs ? "Día de Pago" : "Payment Day"}</label>
                  <Input
                    type="number"
                    min="1"
                    max="28"
                    value={variablePayConfig?.commission_payment_day || 10}
                    onChange={(e) => handleVariablePayChange("commission_payment_day", parseInt(e.target.value) || 10)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {isEs ? "Día del mes para pagar comisiones" : "Day of month to pay commissions"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bonuses */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-500" />
                {isEs ? "Bonos" : "Bonuses"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Tipo de Pago" : "Payment Type"}</label>
                <Select 
                  value={variablePayConfig?.bonus_payment_type || "separate"} 
                  onValueChange={(v) => handleVariablePayChange("bonus_payment_type", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="with_payroll">{isEs ? "Con nómina regular" : "With regular payroll"}</SelectItem>
                    <SelectItem value="separate">{isEs ? "Pago separado" : "Separate payment"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {variablePayConfig?.bonus_payment_type === "separate" && (
                <div>
                  <label className="text-sm font-medium">{isEs ? "Día de Pago" : "Payment Day"}</label>
                  <Input
                    type="number"
                    min="1"
                    max="28"
                    value={variablePayConfig?.bonus_payment_day || 5}
                    onChange={(e) => handleVariablePayChange("bonus_payment_day", parseInt(e.target.value) || 5)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {isEs ? "Día del mes para pagar bonos" : "Day of month to pay bonuses"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Incentives */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-500" />
                {isEs ? "Incentivos" : "Incentives"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">{isEs ? "Tipo de Pago" : "Payment Type"}</label>
                <Select 
                  value={variablePayConfig?.incentive_payment_type || "separate"} 
                  onValueChange={(v) => handleVariablePayChange("incentive_payment_type", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="with_payroll">{isEs ? "Con nómina regular" : "With regular payroll"}</SelectItem>
                    <SelectItem value="separate">{isEs ? "Pago separado" : "Separate payment"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {variablePayConfig?.incentive_payment_type === "separate" && (
                <div>
                  <label className="text-sm font-medium">{isEs ? "Día de Pago" : "Payment Day"}</label>
                  <Input
                    type="number"
                    min="1"
                    max="28"
                    value={variablePayConfig?.incentive_payment_day || 5}
                    onChange={(e) => handleVariablePayChange("incentive_payment_day", parseInt(e.target.value) || 5)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {isEs ? "Día del mes para pagar incentivos" : "Day of month to pay incentives"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Benefits Configuration */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              {isEs ? "Beneficios Adicionales" : "Additional Benefits"}
            </CardTitle>
            <CardDescription>
              {isEs 
                ? "Configuración de cómo se pagan los beneficios (almuerzo, transporte, etc.)" 
                : "Configuration for how benefits are paid (lunch, transport, etc.)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">{isEs ? "Pago de Beneficios" : "Benefits Payment"}</label>
              <Select 
                value={variablePayConfig?.benefits_payment_type || "with_payroll"} 
                onValueChange={(v) => handleVariablePayChange("benefits_payment_type", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="with_payroll">{isEs ? "Incluir en nómina regular" : "Include in regular payroll"}</SelectItem>
                  <SelectItem value="separate">{isEs ? "Pago separado" : "Separate payment"}</SelectItem>
                  <SelectItem value="reimbursement">{isEs ? "Reembolso" : "Reimbursement"}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {isEs 
                  ? "Cómo se pagan almuerzo, transporte y otros beneficios" 
                  : "How lunch, transport and other benefits are paid"}
              </p>
            </div>

            {variablePayConfig?.benefits_payment_type === "separate" && (
              <div>
                <label className="text-sm font-medium">{isEs ? "Día de Pago de Beneficios" : "Benefits Payment Day"}</label>
                <Input
                  type="number"
                  min="1"
                  max="28"
                  value={variablePayConfig?.benefits_payment_day || 1}
                  onChange={(e) => handleVariablePayChange("benefits_payment_day", parseInt(e.target.value) || 1)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Card */}
        <Card className="mt-6 border-violet-200 bg-violet-50/30">
          <CardHeader>
            <CardTitle className="text-base text-violet-700">
              {isEs ? "Resumen de Fechas de Pago" : "Payment Dates Summary"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">{isEs ? "Nómina Regular" : "Regular Payroll"}</p>
                <p className="font-medium">
                  {isEs ? `Días ${config?.payment_day_1 || 15} y ${config?.payment_day_2 || 30}` : `Days ${config?.payment_day_1 || 15} & ${config?.payment_day_2 || 30}`}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">{isEs ? "Horas Extras" : "Overtime"}</p>
                <p className="font-medium">
                  {variablePayConfig?.overtime_payment_type === "with_payroll" 
                    ? (isEs ? "Con nómina" : "With payroll")
                    : (isEs ? `Día ${variablePayConfig?.overtime_payment_day || 5}` : `Day ${variablePayConfig?.overtime_payment_day || 5}`)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">{isEs ? "Comisiones" : "Commissions"}</p>
                <p className="font-medium">
                  {variablePayConfig?.commission_payment_type === "with_payroll" 
                    ? (isEs ? "Con nómina" : "With payroll")
                    : (isEs ? `Día ${variablePayConfig?.commission_payment_day || 10}` : `Day ${variablePayConfig?.commission_payment_day || 10}`)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">{isEs ? "Bonos/Incentivos" : "Bonuses/Incentives"}</p>
                <p className="font-medium">
                  {variablePayConfig?.bonus_payment_type === "with_payroll" 
                    ? (isEs ? "Con nómina" : "With payroll")
                    : (isEs ? `Día ${variablePayConfig?.bonus_payment_day || 5}` : `Day ${variablePayConfig?.bonus_payment_day || 5}`)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">{isEs ? "Beneficios" : "Benefits"}</p>
                <p className="font-medium">
                  {variablePayConfig?.benefits_payment_type === "with_payroll" 
                    ? (isEs ? "Con nómina" : "With payroll")
                    : variablePayConfig?.benefits_payment_type === "reimbursement"
                    ? (isEs ? "Reembolso" : "Reimbursement")
                    : (isEs ? `Día ${variablePayConfig?.benefits_payment_day || 1}` : `Day ${variablePayConfig?.benefits_payment_day || 1}`)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
