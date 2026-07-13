import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import QRCode from "react-qr-code";
import { Users, Clock, CheckCircle } from "lucide-react";

import { KoraLoader } from "../../components/KoraLoader";
const API = process.env.REACT_APP_BACKEND_URL;

export default function KioskPage() {
  const { activationId } = useParams();
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);

  const fetchData = async () => {
    try {
      const [actRes, nsRes] = await Promise.all([
        fetch(`${API}/api/guest-flow/public/activation/${activationId}`),
        fetch(`${API}/api/guest-flow/public/now-serving/${activationId}`),
      ]);
      if (actRes.ok) setData(await actRes.json());
      if (nsRes.ok) setStats(await nsRes.json());
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 6000);
    return () => clearInterval(intervalRef.current);
  }, [activationId]);

  const joinUrl = `${window.location.origin}/guest/join/${activationId}`;
  const logoUrl = data?.logo_url;
  const waiting = data?.total_in_queue || 0;
  const serving = stats?.now_serving_number || 0;
  const servingName = stats?.now_serving_entry?.first_name || "";

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <KoraLoader size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col select-none cursor-none" data-testid="kiosk-page">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-10 pt-8">
        <div className="flex items-center gap-4">
          {logoUrl && <img src={logoUrl} alt="" className="h-12 object-contain" data-testid="kiosk-logo" />}
          <h1 className="text-2xl font-semibold tracking-tight opacity-80">
            {data?.activation_name || ""}
          </h1>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-emerald-400 text-sm font-medium">EN VIVO</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-10 gap-16">
        {/* QR Code */}
        <div className="flex flex-col items-center gap-6">
          <div className="bg-white p-6 rounded-3xl shadow-[0_0_80px_rgba(255,255,255,0.08)]" data-testid="kiosk-qr">
            <QRCode value={joinUrl} size={280} level="H" />
          </div>
          <div className="text-center">
            <p className="text-zinc-400 text-sm uppercase tracking-widest">Escanea para unirte</p>
          </div>
        </div>

        {/* Live Stats */}
        <div className="flex flex-col gap-6 min-w-[280px]">
          {/* Now Serving */}
          {serving > 0 ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 text-center" data-testid="kiosk-serving">
              <p className="text-emerald-400 text-xs uppercase tracking-widest mb-1">Ahora Sirviendo</p>
              <p className="text-6xl font-bold text-white">#{serving}</p>
              {servingName && <p className="text-emerald-300/60 text-lg mt-1">{servingName}</p>}
            </div>
          ) : (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 text-center">
              <p className="text-zinc-500 text-xs uppercase tracking-widest mb-1">Ahora Sirviendo</p>
              <p className="text-5xl font-bold text-zinc-700">--</p>
            </div>
          )}

          {/* Queue Counter */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5" data-testid="kiosk-stats">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                <span className="text-zinc-400 text-sm">En cola</span>
              </div>
              <span className="text-3xl font-bold text-white">{waiting}</span>
            </div>
          </div>

          {/* Completed today - optional if stats available */}
          {stats && (
            <div className="flex gap-3">
              {stats.upcoming && stats.upcoming.length > 0 && (
                <div className="flex-1 bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-3">
                  <p className="text-zinc-600 text-[10px] uppercase tracking-widest mb-2">Siguientes</p>
                  <div className="space-y-1">
                    {stats.upcoming.slice(0, 3).map((u, i) => (
                      <div key={u.queue_number} className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${i === 0 ? "text-amber-400" : "text-zinc-500"}`}>
                          #{u.queue_number}
                        </span>
                        <span className="text-zinc-600 text-xs truncate">{u.first_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom */}
      <div className="text-center py-5">
        <p className="text-zinc-800 text-[10px] tracking-widest">POWERED BY KORA OS</p>
      </div>
    </div>
  );
}
