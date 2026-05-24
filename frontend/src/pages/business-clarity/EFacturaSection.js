import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useLanguage } from "../../contexts/LanguageContext";
import { API_BASE as API } from "../../utils/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { FileSignature, ShieldCheck, AlertTriangle, FileCode2, Send, History, Lock, Settings as SettingsIcon, Upload, Trash2, CheckCircle2 } from "lucide-react";

// Countries with a roadmap entry. Only DR has an active provider in Phase 0;
// the rest are placeholders so the UI shape doesn't change later.
const COUNTRIES = [
  { value: "DO", label: "República Dominicana", provider: "dgii_do", authority: "DGII" },
  { value: "MX", label: "México", provider: "sat_mx", authority: "SAT", roadmap: true },
  { value: "CO", label: "Colombia", provider: "dian_co", authority: "DIAN", roadmap: true },
  { value: "PE", label: "Perú", provider: "sunat_pe", authority: "SUNAT", roadmap: true },
  { value: "CL", label: "Chile", provider: "sii_cl", authority: "SII", roadmap: true },
  { value: "AR", label: "Argentina", provider: "afip_ar", authority: "AFIP", roadmap: true },
  { value: "EC", label: "Ecuador", provider: "sri_ec", authority: "SRI", roadmap: true },
];

const TAX_ID_LABEL = {
  DO: "RNC del emisor",
  MX: "RFC del emisor",
  CO: "NIT del emisor",
  PE: "RUC del emisor",
  CL: "RUT del emisor",
  AR: "CUIT del emisor",
  EC: "RUC del emisor",
};

export default function EFacturaSection() {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  // Phase 1A — certificate vault
  const [cert, setCert] = useState(null);          // { present, metadata?, uploaded_at?, filename? }
  const [certBusy, setCertBusy] = useState(false);
  const [certPassword, setCertPassword] = useState("");
  const fileRef = useRef(null);

  const fetchCert = async () => {
    try {
      const res = await axios.get(`${API}/api/efactura/cert`, { withCredentials: true });
      setCert(res.data);
    } catch {
      setCert({ present: false });
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/api/efactura/config`, { withCredentials: true });
        if (!cancelled) setCfg(res.data);
      } catch {
        if (!cancelled) setCfg({ enabled: false });
      }
    })();
    fetchCert();
    return () => { cancelled = true; };
  }, []);

  if (!cfg) {
    return <div className="p-8 text-sm text-muted-foreground">{isEs ? "Cargando..." : "Loading..."}</div>;
  }

  // Module disabled at tenant level — let the user know it's available but
  // not activated. They contact support / super-admin to enable.
  if (!cfg.enabled) {
    return (
      <div className="p-6 max-w-3xl">
        <Card className="border-amber-200 bg-amber-50/50" data-testid="efactura-disabled">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <Lock className="w-5 h-5" />
              {isEs ? "Facturación Electrónica · No activada" : "E-Invoicing · Not activated"}
            </CardTitle>
            <CardDescription className="text-amber-800">
              {isEs
                ? "Este módulo está disponible como add-on. Permite emitir, firmar y enviar comprobantes fiscales electrónicos a la autoridad tributaria de tu país (DGII en RD, SAT en MX, DIAN en CO, SUNAT en PE y más)."
                : "This module is available as an add-on. Emit, sign, and submit electronic tax documents to your country's authority (DGII in DR, SAT in MX, DIAN in CO, SUNAT in PE, and more)."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-amber-900 space-y-2">
              <p className="font-medium">{isEs ? "¿Qué incluye?" : "What's included?"}</p>
              <ul className="list-disc pl-5 space-y-1 text-amber-800">
                <li>{isEs ? "Generación de XML con estructura oficial por país" : "Official XML generation per country"}</li>
                <li>{isEs ? "Firma digital X.509 (XMLDSig / XAdES)" : "X.509 digital signature (XMLDSig / XAdES)"}</li>
                <li>{isEs ? "Envío en tiempo real a la autoridad + reintentos automáticos" : "Real-time submission with auto-retries"}</li>
                <li>{isEs ? "Almacenamiento seguro de certificados por organización" : "Per-org encrypted certificate storage"}</li>
                <li>{isEs ? "Representación impresa (PDF) según norma" : "Official printed representation (PDF)"}</li>
              </ul>
              <p className="mt-4 text-xs">
                {isEs
                  ? "Para activar contacta a soporte o tu administrador de organización."
                  : "Contact support or your org admin to enable."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Enabled — Phase 0 config form. No emission yet.
  const country = COUNTRIES.find((c) => c.value === cfg.country);
  const taxIdLabel = TAX_ID_LABEL[cfg.country] || (isEs ? "ID Fiscal" : "Tax ID");

  const handleSave = async (patch) => {
    setSaving(true);
    try {
      const res = await axios.put(`${API}/api/efactura/config`, patch, { withCredentials: true });
      setCfg(res.data);
      toast.success(isEs ? "Configuración guardada" : "Configuration saved");
    } catch (err) {
      toast.error(err?.response?.data?.detail || (isEs ? "Error al guardar" : "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const handleCountryChange = (value) => {
    const c = COUNTRIES.find((x) => x.value === value);
    if (c?.roadmap) {
      toast.info(isEs ? `Soporte para ${c.label} llegará en una fase posterior` : `${c.label} support coming in a later phase`);
      return;
    }
    handleSave({ country: value, provider: c?.provider });
  };

  const handleCertUpload = async (e) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error(isEs ? "Selecciona un archivo .p12 o .pfx" : "Select a .p12 or .pfx file");
      return;
    }
    if (file.size > 256 * 1024) {
      toast.error(isEs ? "Archivo demasiado grande (máx 256KB)" : "File too large (max 256KB)");
      return;
    }
    setCertBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("password", certPassword);
    try {
      await axios.post(`${API}/api/efactura/cert/upload`, fd, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(isEs ? "Certificado cargado y cifrado" : "Certificate uploaded and encrypted");
      setCertPassword("");
      if (fileRef.current) fileRef.current.value = "";
      await fetchCert();
      // refresh config (cert_uploaded_at changed)
      const res = await axios.get(`${API}/api/efactura/config`, { withCredentials: true });
      setCfg(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || (isEs ? "Error al cargar certificado" : "Certificate upload failed"));
    } finally {
      setCertBusy(false);
    }
  };

  const handleCertDelete = async () => {
    if (!window.confirm(isEs ? "¿Eliminar el certificado almacenado? Esta acción no se puede deshacer." : "Delete the stored certificate? This cannot be undone.")) return;
    setCertBusy(true);
    try {
      await axios.delete(`${API}/api/efactura/cert`, { withCredentials: true });
      toast.success(isEs ? "Certificado eliminado" : "Certificate deleted");
      await fetchCert();
      const res = await axios.get(`${API}/api/efactura/config`, { withCredentials: true });
      setCfg(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || (isEs ? "Error al eliminar" : "Delete failed"));
    } finally {
      setCertBusy(false);
    }
  };

  // Compute expiry warning (cert close to expiring → amber).
  const expiryWarning = (() => {
    if (!cert?.metadata?.valid_to) return null;
    const exp = new Date(cert.metadata.valid_to);
    const days = Math.round((exp - new Date()) / (1000 * 60 * 60 * 24));
    if (days < 0) return { tone: "rose", label: isEs ? `Vencido hace ${Math.abs(days)} días` : `Expired ${Math.abs(days)} days ago` };
    if (days < 30) return { tone: "amber", label: isEs ? `Vence en ${days} días` : `Expires in ${days} days` };
    return { tone: "emerald", label: isEs ? `Vigente · vence en ${days} días` : `Valid · expires in ${days} days` };
  })();

  return (
    <div className="p-6 max-w-5xl space-y-6" data-testid="efactura-section">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <FileSignature className="w-6 h-6 text-emerald-600" />
            {isEs ? "Facturación Electrónica" : "E-Invoicing"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isEs
              ? "Configura y opera la emisión de comprobantes fiscales electrónicos."
              : "Configure and operate electronic tax document emission."}
          </p>
        </div>
        <Badge variant={cfg.environment === "production" ? "default" : "outline"} className={cfg.environment === "production" ? "bg-emerald-600" : ""}>
          {cfg.environment === "production"
            ? (isEs ? "Producción" : "Production")
            : (isEs ? "Certificación / Pruebas" : "Certification / Test")}
        </Badge>
      </div>

      {/* Phase 0 banner */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-900">
            <p className="font-medium">{isEs ? "Fase 0 · Solo configuración" : "Phase 0 · Configuration only"}</p>
            <p className="text-blue-800 mt-1">
              {isEs
                ? "La emisión, firma y envío a la autoridad llegan en próximas fases. Por ahora puedes definir el país, RNC del emisor y rangos NCF para que todo quede listo."
                : "Emission, signing, and authority submission ship in later phases. For now, set your country, issuer Tax ID, and NCF ranges so everything is ready."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Config form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <SettingsIcon className="w-5 h-5" />
            {isEs ? "Configuración fiscal" : "Fiscal configuration"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{isEs ? "País / Autoridad" : "Country / Authority"}</Label>
              <Select value={cfg.country || ""} onValueChange={handleCountryChange} disabled={saving}>
                <SelectTrigger data-testid="efactura-country"><SelectValue placeholder={isEs ? "Selecciona país" : "Select country"} /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label} {c.roadmap ? `· (roadmap)` : `· ${c.authority}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {country && !country.roadmap && (
                <p className="text-xs text-muted-foreground">Autoridad: <strong>{country.authority}</strong> · Provider: <code className="text-[10px]">{country.provider}</code></p>
              )}
            </div>

            <div className="space-y-2">
              <Label>{isEs ? "Ambiente" : "Environment"}</Label>
              <Select value={cfg.environment || "certification"} onValueChange={(v) => handleSave({ environment: v })} disabled={saving}>
                <SelectTrigger data-testid="efactura-environment"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="certification">{isEs ? "Certificación / Pruebas" : "Certification / Test"}</SelectItem>
                  <SelectItem value="production">{isEs ? "Producción" : "Production"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="efactura-taxid">{taxIdLabel}</Label>
              <Input
                id="efactura-taxid"
                data-testid="efactura-taxid"
                defaultValue={cfg.issuer_tax_id || ""}
                placeholder={cfg.country === "DO" ? "131-XXXXX-X" : ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (cfg.issuer_tax_id || "")) handleSave({ issuer_tax_id: v || null });
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="efactura-legalname">{isEs ? "Razón social del emisor" : "Issuer legal name"}</Label>
              <Input
                id="efactura-legalname"
                data-testid="efactura-legalname"
                defaultValue={cfg.issuer_legal_name || ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (cfg.issuer_legal_name || "")) handleSave({ issuer_legal_name: v || null });
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Certificate vault (Phase 1A) + future feature placeholders */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className={`${cert?.present ? "border-emerald-200" : "border-gray-200"} md:col-span-1`} data-testid="efactura-cert-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className={`w-4 h-4 ${cert?.present ? "text-emerald-600" : "text-gray-400"}`} />
              {isEs ? "Certificado digital" : "Digital certificate"}
            </CardTitle>
            <CardDescription className="text-xs">
              {isEs ? "Archivo PFX/P12 cifrado en reposo (AES-256)." : "PFX/P12 file encrypted at rest (AES-256)."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {cert?.present ? (
              <>
                <div className="text-xs space-y-1 bg-gray-50 rounded p-2 border" data-testid="efactura-cert-meta">
                  <div><strong>CN:</strong> {cert.metadata?.common_name || "—"}</div>
                  <div className="truncate" title={cert.metadata?.issuer}><strong>{isEs ? "Emisor:" : "Issuer:"}</strong> {cert.metadata?.issuer || "—"}</div>
                  <div><strong>Serial:</strong> <code className="text-[10px]">{(cert.metadata?.serial_number || "").slice(0, 20)}…</code></div>
                  <div className="font-mono text-[10px] truncate" title={cert.metadata?.fingerprint_sha256}>
                    <strong className="font-sans">SHA-256:</strong> {cert.metadata?.fingerprint_sha256 || "—"}
                  </div>
                  {expiryWarning && (
                    <Badge className={`mt-1 bg-${expiryWarning.tone}-100 text-${expiryWarning.tone}-800 border border-${expiryWarning.tone}-200`}>
                      {expiryWarning.label}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setCertPassword(""); if (fileRef.current) fileRef.current.value = ""; }} disabled={certBusy}>
                    <Upload className="w-3.5 h-3.5 mr-1" />
                    {isEs ? "Reemplazar" : "Replace"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleCertDelete} disabled={certBusy} className="text-rose-600 hover:text-rose-700">
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    {isEs ? "Eliminar" : "Delete"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                {isEs ? "No hay certificado cargado." : "No certificate uploaded."}
              </div>
            )}

            {/* Upload form — always visible so users can replace */}
            <form onSubmit={handleCertUpload} className="space-y-2 pt-2 border-t">
              <div>
                <Label htmlFor="cert-file" className="text-xs">{isEs ? "Archivo .p12 / .pfx" : ".p12 / .pfx file"}</Label>
                <Input id="cert-file" data-testid="efactura-cert-file" ref={fileRef} type="file" accept=".p12,.pfx,application/x-pkcs12" disabled={certBusy} className="text-xs" />
              </div>
              <div>
                <Label htmlFor="cert-password" className="text-xs">{isEs ? "Contraseña del certificado" : "Certificate password"}</Label>
                <Input
                  id="cert-password"
                  data-testid="efactura-cert-password"
                  type="password"
                  value={certPassword}
                  onChange={(e) => setCertPassword(e.target.value)}
                  placeholder={isEs ? "Mínimo 1 carácter" : "At least 1 character"}
                  disabled={certBusy}
                  autoComplete="off"
                />
              </div>
              <Button type="submit" size="sm" className="w-full" disabled={certBusy} data-testid="efactura-cert-upload">
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {certBusy ? (isEs ? "Procesando..." : "Working...") : (isEs ? "Cargar certificado" : "Upload certificate")}
              </Button>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                {isEs ? "La contraseña se cifra junto al archivo y nunca sale del servidor." : "Password is encrypted with the file and never leaves the server."}
              </p>
            </form>
          </CardContent>
        </Card>

        <Card className="opacity-60 cursor-not-allowed">
          <CardContent className="p-5">
            <FileCode2 className="w-6 h-6 text-blue-600 mb-2" />
            <h3 className="font-semibold">{isEs ? "Emitir e-CF" : "Emit e-CF"}</h3>
            <p className="text-xs text-muted-foreground mt-1">{isEs ? "Genera XML firmado y envía a la autoridad. Llega en Fase 1B-1D." : "Generate signed XML and submit. Coming in Phase 1B-1D."}</p>
            <Badge variant="outline" className="mt-3 text-xs">{isEs ? "Próximamente" : "Coming soon"}</Badge>
          </CardContent>
        </Card>
        <Card className="opacity-60 cursor-not-allowed">
          <CardContent className="p-5">
            <History className="w-6 h-6 text-purple-600 mb-2" />
            <h3 className="font-semibold">{isEs ? "Historial / Estado" : "History / Status"}</h3>
            <p className="text-xs text-muted-foreground mt-1">{isEs ? "Consulta el estado de cada e-CF emitido. Llega en Fase 1D." : "Track each emitted e-CF status. Coming in Phase 1D."}</p>
            <Badge variant="outline" className="mt-3 text-xs">{isEs ? "Próximamente" : "Coming soon"}</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Test connection — placeholder */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Send className="w-4 h-4" />
              {isEs ? "Test de conexión" : "Connection test"}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">{isEs ? "Verifica que tu certificado funciona contra el ambiente seleccionado." : "Verify your certificate works against the selected environment."}</p>
          </div>
          <Button variant="outline" disabled data-testid="efactura-test-btn">
            {isEs ? "Probar (Fase 1)" : "Test (Phase 1)"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
