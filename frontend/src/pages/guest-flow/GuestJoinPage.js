import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Users, CheckCircle, AlertCircle } from "lucide-react";

import { KoraLoader } from "../../components/KoraLoader";
const API = process.env.REACT_APP_BACKEND_URL;

export default function GuestJoinPage() {
  const { activationId } = useParams();
  const [activation, setActivation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ guest_name: "", whatsapp_number: "", group_size: 1 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/guest-flow/public/activation/${activationId}`)
      .then(r => r.json())
      .then(data => { setActivation(data); setLoading(false); })
      .catch(() => { setError("No se encontro la activacion"); setLoading(false); });
  }, [activationId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.guest_name || !form.whatsapp_number) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/guest-flow/public/join/${activationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Error al unirse"); setSubmitting(false); return; }
      setResult(data);
    } catch {
      setError("Error de conexion");
    }
    setSubmitting(false);
  };

  const logoUrl = activation?.logo_url;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <KoraLoader size={32} />
      </div>
    );
  }

  // Confirmation screen
  if (result) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col" data-testid="guest-join-confirmation">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
          {logoUrl && <img src={logoUrl} alt="Logo" className="h-14 object-contain mb-6" data-testid="event-logo" />}
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">#{result.queue_number}</h1>
          <p className="text-zinc-400 mb-8">{result.duplicate ? "Ya estabas en la cola" : "Te has unido a la cola"}</p>

          <div className="w-full max-w-sm space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
              <div className="flex justify-between">
                <span className="text-zinc-500 text-sm">Posicion</span>
                <span className="font-semibold">{result.position || 1}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 text-sm">Personas delante</span>
                <span className="font-semibold">{result.people_ahead || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 text-sm">Espera estimada</span>
                <span className="font-semibold">{result.estimated_wait || 0} min</span>
              </div>
            </div>

            <Button
              className="w-full h-12 bg-white text-black hover:bg-zinc-200 rounded-xl font-semibold"
              onClick={() => window.location.href = `/guest/status/${result.entry_id}`}
              data-testid="view-status-btn"
            >
              Ver estado en vivo
            </Button>
          </div>

          <p className="text-zinc-600 text-xs mt-8 text-center max-w-xs">
            Puedes seguir disfrutando del evento mientras esperas.
          </p>
        </div>
        <div className="text-center py-4">
          <p className="text-zinc-700 text-[10px] tracking-wide">POWERED BY KORA OS</p>
        </div>
      </div>
    );
  }

  // Join form
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col" data-testid="guest-join-page">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="text-center mb-10">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-16 object-contain mx-auto mb-5" data-testid="event-logo" />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                <Users className="w-6 h-6 text-zinc-300" />
              </div>
            )}
            <h1 className="text-2xl font-bold tracking-tight mb-1">
              {activation?.activation_name || "Activacion"}
            </h1>
            <p className="text-zinc-500 text-sm">Unete a la cola virtual</p>
            {activation?.total_in_queue > 0 && (
              <p className="text-zinc-400 text-xs mt-2">
                {activation.total_in_queue} {activation.total_in_queue === 1 ? "persona" : "personas"} en espera
              </p>
            )}
          </div>

          {activation?.queue_status !== "active" ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
              <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
              <p className="text-zinc-300 font-medium">La cola no esta activa</p>
              <p className="text-zinc-500 text-sm mt-1">
                {activation?.queue_status === "paused" ? "La cola esta pausada. Intenta mas tarde." : "Esta activacion aun no ha iniciado."}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label className="text-zinc-400 text-sm">Nombre completo</Label>
                <Input
                  value={form.guest_name}
                  onChange={e => setForm({ ...form, guest_name: e.target.value })}
                  placeholder="Tu nombre"
                  className="h-12 bg-zinc-900 border-zinc-800 rounded-xl text-white placeholder:text-zinc-600"
                  required
                  data-testid="guest-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 text-sm">WhatsApp</Label>
                <Input
                  value={form.whatsapp_number}
                  onChange={e => setForm({ ...form, whatsapp_number: e.target.value })}
                  placeholder="809-555-1234"
                  type="tel"
                  className="h-12 bg-zinc-900 border-zinc-800 rounded-xl text-white placeholder:text-zinc-600"
                  required
                  data-testid="guest-whatsapp-input"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 text-sm">Tamano del grupo (opcional)</Label>
                <Input
                  type="number" min={1} max={20}
                  value={form.group_size}
                  onChange={e => setForm({ ...form, group_size: parseInt(e.target.value) || 1 })}
                  className="h-12 bg-zinc-900 border-zinc-800 rounded-xl text-white"
                  data-testid="guest-group-input"
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full h-12 bg-white text-black hover:bg-zinc-200 rounded-xl font-semibold"
                disabled={submitting || !form.guest_name || !form.whatsapp_number}
                data-testid="guest-join-submit"
              >
                {submitting ? <KoraLoader size={20} /> : "Unirme a la cola"}
              </Button>
            </form>
          )}
        </div>
      </div>

      <div className="text-center py-4">
        <p className="text-zinc-700 text-[10px] tracking-wide">POWERED BY KORA OS</p>
      </div>
    </div>
  );
}
