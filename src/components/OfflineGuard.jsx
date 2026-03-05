import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";

const PING_TIMEOUT_MS = 5000;

async function checkConnectivity() {
  // Fast fail if the browser already knows it's offline
  if (!navigator.onLine) return false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    // Lightweight HEAD-style query — just checks reachability, no data transferred
    const { error } = await supabase
      .from("games")
      .select("id", { count: "exact", head: true })
      .abortSignal(controller.signal);
    clearTimeout(timeoutId);
    return !error;
  } catch {
    return false;
  }
}

export default function OfflineGuard({ children }) {
  const [isOnline, setIsOnline] = useState(true);
  const [checking, setChecking] = useState(false);

  const verify = useCallback(async () => {
    setChecking(true);
    const ok = await checkConnectivity();
    setIsOnline(ok);
    setChecking(false);
  }, []);

  useEffect(() => {
    verify();

    const handleOnline  = () => verify();
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [verify]);

  return (
    <>
      {children}

      {/* Offline overlay — rendered on top of everything when disconnected */}
      {!isOnline && (
        <div
          className="fixed inset-0 z-9999 flex flex-col items-center justify-center px-6"
          style={{
            background: "rgba(2, 6, 23, 0.92)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            touchAction: "none",
          }}
        >
          <div className="flex flex-col items-center gap-5 max-w-xs text-center">
            {/* WiFi-off icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-16 h-16 text-red-500"
              aria-hidden="true"
            >
              <line x1="2" y1="2" x2="22" y2="22" />
              <path d="M8.5 16.5a5 5 0 0 1 7 0" />
              <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
              <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
              <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
              <path d="M5 12.55a10 10 0 0 1 5.17-2.39" />
              <circle cx="12" cy="20" r="1" fill="currentColor" />
            </svg>

            <h1 className="offline-neon-title text-red-500 font-black text-2xl tracking-[0.25em] uppercase">
              CONEXIÓN PERDIDA
            </h1>

            <p className="text-slate-400 text-sm leading-relaxed">
              Se requiere conexión a la red para sincronizar tus puntuaciones en el ranking.
            </p>

            <button
              onClick={verify}
              disabled={checking}
              className="mt-2 px-8 py-3 rounded-xl font-bold tracking-widest text-sm uppercase transition-all
                         bg-red-600 hover:bg-red-500 active:scale-95 text-white
                         disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                boxShadow: "0 0 20px rgba(239,68,68,0.55), 0 0 40px rgba(239,68,68,0.25)",
              }}
            >
              {checking ? "COMPROBANDO..." : "REINTENTAR"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
