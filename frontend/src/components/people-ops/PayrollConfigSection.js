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
  Percent, Calendar, Building2
} from "lucide-react";

import { API_BASE as API } from "../../utils/api";

export function PayrollConfigSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/people-ops/payroll/config`, { withCredentials: true });
      setConfig(res.data);
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.post(
        `${API}/api/people-ops/payroll/config`,
        config,
        { withCredentials: true }
      );
      setHasChanges(false);
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
          disabled={!hasChanges || saving}
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
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">
                  {isEs ? "Tasa Normal (35%)" : "Normal Rate (35%)"}
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={config?.overtime_rate_35 || 1.35}
                  onChange={(e) => handleChange("overtime_rate_35", parseFloat(e.target.value) || 1.35)}
                />
                <p className="text-xs text-muted-foreground mt-1">{isEs ? "Multiplicador: 1.35x" : "Multiplier: 1.35x"}</p>
              </div>
              <div>
                <label className="text-sm font-medium">
                  {isEs ? "Tasa Nocturna/Feriado (100%)" : "Night/Holiday Rate (100%)"}
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={config?.overtime_rate_100 || 2.0}
                  onChange={(e) => handleChange("overtime_rate_100", parseFloat(e.target.value) || 2.0)}
                />
                <p className="text-xs text-muted-foreground mt-1">{isEs ? "Multiplicador: 2.0x" : "Multiplier: 2.0x"}</p>
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
    </div>
  );
}
