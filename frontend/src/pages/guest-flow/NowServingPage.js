import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Users } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function NowServingPage() {
  const { activationId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API}/api/guest-flow/public/now-serving/${activationId}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 5000);
    return () => clearInterval(intervalRef.current);
  }, [activationId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500 text-lg">Activacion no encontrada</p>
      </div>
    );
  }

  const isPaused = data.queue_status === "paused";
  const isClosed = data.queue_status === "closed";
  const isInactive = data.queue_status === "inactive";

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col" data-testid="now-serving-page">
      {/* Header */}
      <div className="text-center pt-8 pb-4 border-b border-zinc-900">
        {data.logo_url && <img src={data.logo_url} alt="Logo" className="h-12 object-contain mx-auto mb-3" data-testid="event-logo" />}
        <p className="text-zinc-500 text-xs uppercase tracking-widest">{data.activation_name}</p>
        {isPaused && <p className="text-amber-400 text-sm mt-1 font-medium">Cola pausada</p>}
        {isClosed && <p className="text-red-400 text-sm mt-1 font-medium">Cola cerrada</p>}
        {isInactive && <p className="text-zinc-500 text-sm mt-1">Cola inactiva</p>}
      </div>

      {/* Main Display */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <p className="text-zinc-500 text-sm uppercase tracking-widest mb-4">Ahora Sirviendo</p>
        <div className={`text-[10rem] leading-none font-bold tracking-tighter ${data.now_serving_number > 0 ? "text-white" : "text-zinc-800"}`} data-testid="now-serving-number">
          {data.now_serving_number > 0 ? `#${data.now_serving_number}` : "--"}
        </div>
        {data.now_serving_entry && (
          <p className="text-zinc-400 text-2xl mt-4 font-light">{data.now_serving_entry.first_name}</p>
        )}
      </div>

      {/* Upcoming */}
      {data.upcoming && data.upcoming.length > 0 && (
        <div className="border-t border-zinc-900 px-8 py-6">
          <p className="text-zinc-600 text-xs uppercase tracking-widest mb-4 text-center">Siguientes</p>
          <div className="flex justify-center gap-6 flex-wrap">
            {data.upcoming.map((u, i) => (
              <div key={u.queue_number} className={`text-center ${i === 0 ? "opacity-100" : "opacity-40"}`}>
                <p className={`text-3xl font-bold ${i === 0 ? "text-amber-400" : "text-zinc-500"}`}>#{u.queue_number}</p>
                <p className="text-zinc-600 text-xs mt-1">{u.first_name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center py-4 border-t border-zinc-900 flex items-center justify-center gap-4">
        <div className="flex items-center gap-1 text-zinc-600 text-sm">
          <Users className="w-4 h-4" />
          <span>{data.total_waiting} en espera</span>
        </div>
        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
        <p className="text-zinc-700 text-[10px] tracking-wide">KORA OS</p>
      </div>
    </div>
  );
}
