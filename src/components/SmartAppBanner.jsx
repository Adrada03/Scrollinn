import { useState } from "react";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.scrollinn.app";
const LS_KEY = "smartBannerDismissed";

const isAndroidBrowser =
  /android/i.test(navigator.userAgent) &&
  !window.matchMedia("(display-mode: standalone)").matches;

export default function SmartAppBanner() {
  const [visible, setVisible] = useState(
    () => isAndroidBrowser && localStorage.getItem(LS_KEY) !== "1"
  );

  if (!visible) return null;

  const handleDismiss = () => {
    localStorage.setItem(LS_KEY, "1");
    setVisible(false);
  };

  return (
    <div
      className="relative z-50 flex items-center gap-3 px-4 py-2.5 bg-slate-900 shrink-0"
      style={{ borderBottom: "1.5px solid rgba(6,182,212,0.55)", boxShadow: "0 2px 18px rgba(6,182,212,0.18)" }}
    >
      {/* App icon */}
      <img
        src="/logosWeb/web-app-manifest-192x192.png"
        alt="Scrollinn"
        className="w-10 h-10 rounded-xl shrink-0"
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-sm leading-tight truncate">Scrollinn</p>
        <p className="text-slate-400 text-xs leading-tight truncate">Disponible en Google Play</p>
      </div>

      {/* CTA */}
      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide text-black active:scale-95 transition-transform"
        style={{ background: "linear-gradient(135deg,#06b6d4,#3b82f6)", boxShadow: "0 0 12px rgba(6,182,212,0.45)" }}
      >
        INSTALAR APP
      </a>

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        aria-label="Cerrar banner"
        className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:text-white active:scale-90 transition-all cursor-pointer"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
