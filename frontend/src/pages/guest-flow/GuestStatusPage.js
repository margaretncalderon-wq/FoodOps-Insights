import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Clock, CheckCircle, XCircle, Bell, Users } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const STATUS_CONFIG = {
  waiting: { label: "En espera", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", icon: Clock },
  almost_up: { label: "Casi tu turno!", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", icon: Bell },
  now_serving: { label: "Es tu turno!", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: CheckCircle },
  completed: { label: "Completado", color: "text-zinc-400", bg: "bg-zinc-800", border: "border-zinc-700", icon: CheckCircle },
  canceled: { label: "Cancelado", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", icon: XCircle },
};

export default function GuestStatusPage() {
  const { entryId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API}/api/guest-flow/public/status/${entryId}`);
      if (!res.ok) throw new Error("No encontrado");
      const d = await res.json();
      setData(d);
      setError(null);
    } catch {
      setError("No se pudo cargar tu estado");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 8000);
    return () => clearInterval(intervalRef.current);
  }, [entryId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
        <div className="text-center">
          <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-zinc-300">{error}</p>
        </div>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[data.status] || STATUS_CONFIG.waiting;
  const StatusIcon = cfg.icon;
  const isActive = ["waiting", "almost_up"].includes(data.status);
  const isServing = data.status === "now_serving";
  const logoUrl = data.logo_url;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col" data-testid="guest-status-page">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6">
          {/* Logo */}
          {logoUrl && <img src={logoUrl} alt="Logo" className="h-14 object-contain mx-auto" data-testid="event-logo" />}

          {/* Queue Number */}
          <div className="text-center">
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Tu numero</p>
            <h1 className={`text-6xl font-bold tracking-tight ${isServing ? "text-emerald-400" : "text-white"}`} data-testid="queue-number">
              #{data.queue_number}
            </h1>
            <p className="text-zinc-500 text-sm mt-2">{data.activation_name}</p>
          </div>

          {/* Status Badge */}
          <div className={`${cfg.bg} ${cfg.border} border rounded-2xl p-5 text-center`} data-testid="status-badge">
            <StatusIcon className={`w-8 h-8 ${cfg.color} mx-auto mb-2 ${isServing ? "animate-bounce" : ""}`} />
            <p className={`text-lg font-semibold ${cfg.color}`}>{cfg.label}</p>
            {isServing && (
              <p className="text-zinc-400 text-sm mt-1">Acercate ahora a la activacion</p>
            )}
          </div>

          {/* Stats */}
          {isActive && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 text-sm">Personas delante</span>
                <span className="font-semibold text-lg" data-testid="people-ahead">{data.people_ahead}</span>
              </div>
              <div className="w-full h-px bg-zinc-800" />
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 text-sm">Espera estimada</span>
                <span className="font-semibold text-lg" data-testid="estimated-wait">~{data.estimated_wait_minutes} min</span>
              </div>
              <div className="w-full h-px bg-zinc-800" />
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 text-sm">Ahora sirviendo</span>
                <span className="font-semibold text-lg">#{data.now_serving || "-"}</span>
              </div>
            </div>
          )}

          {/* Completed/Canceled message */}
          {data.status === "completed" && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-center">
              <p className="text-zinc-300">Gracias por tu visita!</p>
              <p className="text-zinc-500 text-sm mt-1">Esperamos que hayas disfrutado la experiencia</p>
            </div>
          )}
          {data.status === "canceled" && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-center">
              <p className="text-zinc-300">Tu turno fue cancelado</p>
              <p className="text-zinc-500 text-sm mt-1">Puedes volver a registrarte si lo deseas</p>
            </div>
          )}

          {/* Refresh indicator */}
          {isActive && (
            <p className="text-zinc-700 text-xs text-center flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              Actualizacion automatica
            </p>
          )}
        </div>
      </div>

      <div className="text-center py-4">
        <p className="text-zinc-700 text-[10px] tracking-wide">POWERED BY KORA OS</p>
      </div>
    </div>
  );
}
