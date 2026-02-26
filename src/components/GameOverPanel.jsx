/**
 * GameOverPanel.jsx — Panel unificado de Game Over
 *
 * Muestra:
 *  - Título (Game Over / ¡Victoria!)
 *  - Puntuación del jugador
 *  - Ranking (Top 5 mejores puntuaciones de usuarios distintos)
 *  - Mensaje de resultado (guardado / Top 5 / no registrado)
 *  - Botón "Siguiente juego" (scrollea al siguiente)
 *
 * Props:
 *   title       (string)  — "Game Over" o "¡Victoria!"
 *   score       (string)  — puntuación a mostrar (puede ser "12", "85%", "7 mov.")
 *   subtitle    (string)  — texto debajo del score
 *   onNext      (fn)      — callback para ir al siguiente juego
 *   ranking     (array)   — [{ pos, user, score }] ranking real del servidor
 *   scoreMessage (string) — mensaje del resultado del envío de puntuación
 *   isLoading   (bool)    — si está cargando el ranking
 */

import { useState, useEffect } from "react";
import { RefreshCw, ChevronDown } from "lucide-react";
import { useLanguage } from "../i18n";
import { useAuth } from "../context/AuthContext";
import Avatar from "./Avatar";
import PublicProfileModal from "./PublicProfileModal";

/* Notifica al Feed para desbloquear scroll inmediatamente */
const SCROLL_UNLOCK_EVENT = "gameover-scroll-unlock";

const FALLBACK_RANKING = [
  { pos: 1, user: "—", score: "—" },
  { pos: 2, user: "—", score: "—" },
  { pos: 3, user: "—", score: "—" },
  { pos: 4, user: "—", score: "—" },
  { pos: 5, user: "—", score: "—" },
];

/* ── Animación de XP ── */
const XpDisplay = ({ xpGained }) => {
  const { t } = useLanguage();
  const [phase, setPhase] = useState("calculating"); // "calculating" | "reveal"

  useEffect(() => {
    if (xpGained === null || xpGained === undefined) return;
    // Mostrar "Calculando..." brevemente, luego revelar el resultado
    setPhase("calculating");
    const timer = setTimeout(() => setPhase("reveal"), 1200);
    return () => clearTimeout(timer);
  }, [xpGained]);

  if (xpGained === null || xpGained === undefined) return null;

  // Fase "Calculando..."
  if (phase === "calculating") {
    return (
      <div className="flex items-center justify-center gap-2 py-1.5 animate-pulse">
        <svg className="w-4 h-4 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <span className="text-sm font-medium text-white/50">
          {t("gameover.calculating_xp") || "Calculando XP..."}
        </span>
      </div>
    );
  }

  // Fase "Revelar" — sin XP
  if (xpGained === 0) {
    return (
      <p className="text-center text-xs text-white/30 font-medium py-1.5">
        {t("gameover.no_xp") || "No has conseguido XP. ¡Inténtalo de nuevo!"}
      </p>
    );
  }

  // Fase "Revelar" — con XP (dorado si es tope ≥ 100)
  const isMaxTier = xpGained >= 100;

  return (
    <div className="flex items-center justify-center gap-1.5 py-1.5">
      <span
        className={`text-lg font-black tracking-tight animate-[xpPop_0.5s_ease-out] ${
          isMaxTier
            ? "text-transparent bg-clip-text bg-linear-to-r from-yellow-300 via-amber-400 to-yellow-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]"
            : "text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.5)]"
        }`}
      >
        +{xpGained} XP
      </span>
      {isMaxTier && (
        <span className="text-xs animate-bounce">✨</span>
      )}
    </div>
  );
};

/* ── Skeleton row para el ranking ── */
const SkeletonRow = ({ index }) => (
  <div
    className="grid grid-cols-[1.2rem_1.5rem_1fr_3rem] gap-x-1.5 items-center px-2.5 py-0.5 border-b border-white/4 last:border-0 animate-pulse"
  >
    {/* # pos */}
    <div className="h-3 w-3 rounded-sm bg-slate-700/60" />
    {/* avatar circle */}
    <div className="h-5 w-5 rounded-full bg-slate-700/60" />
    {/* name bar */}
    <div
      className="h-3 rounded-md bg-slate-700/60"
      style={{ width: `${60 + ((index * 17) % 30)}%` }}
    />
    {/* score bar */}
    <div className="h-3 w-8 rounded-md bg-slate-700/60 ml-auto" />
  </div>
);

const SKELETON_ROWS = Array.from({ length: 5 }, (_, i) => i);

const GameOverPanel = ({
  title = "Game Over",
  score,
  subtitle,
  onReplay,
  onNext,
  ranking = [],
  scoreMessage = "",
  isLoading = false,
  xpGained = null,
}) => {
  const { t } = useLanguage();
  const { currentUser } = useAuth();
  const [profileUserId, setProfileUserId] = useState(null);
  const displayRanking = ranking.length > 0 ? ranking : FALLBACK_RANKING;

  // Al montar el panel de Game Over, desbloquear scroll inmediatamente
  useEffect(() => {
    window.dispatchEvent(new Event(SCROLL_UNLOCK_EVENT));
  }, []);

  return (
    <>
    <PublicProfileModal
      isOpen={!!profileUserId}
      onClose={() => setProfileUserId(null)}
      userId={profileUserId}
    />
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center pt-20 pb-32 px-4 pointer-events-none">
      {/* ── Modal card: flex-col estricto para blindar layout ── */}
      <div className="bg-slate-900/80 backdrop-blur-md rounded-2xl px-5 py-4 flex flex-col items-center gap-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] w-full max-w-xs border border-white/10 pointer-events-auto overflow-hidden max-h-full">

        {/* ── Header zone (shrink-0: nunca se comprime) ── */}
        <div className="shrink-0 flex flex-col items-center gap-1.5 w-full">
          {/* Título */}
          <h2 className="text-base font-extrabold text-white/90 tracking-wide uppercase">
            {title}
          </h2>

          {/* Puntuación */}
          <div
            className="text-4xl font-black text-transparent bg-clip-text bg-linear-to-b from-white via-white to-white/50 drop-shadow-[0_0_20px_rgba(255,255,255,0.15)]"
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {score}
          </div>

          {subtitle && (
            <p className="text-white/40 text-xs -mt-0.5">{subtitle}</p>
          )}

          {/* Mensaje de puntuación */}
          {scoreMessage && (
            <p className="text-[11px] text-center text-amber-300/80 font-medium -mt-0.5">
              {scoreMessage}
            </p>
          )}

          {/* XP ganada */}
          <XpDisplay xpGained={xpGained} />
        </div>

        {/* ── Ranking zone (altura fija: 5 filas siempre) ── */}
        <div className="shrink-0 w-full rounded-xl bg-black/30 border border-white/6 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1.2rem_1.5rem_1fr_3rem] gap-x-1.5 items-center px-2.5 py-0.5 text-[9px] font-bold text-white/25 uppercase tracking-wider border-b border-white/6">
            <span>#</span>
            <span></span>
            <span>{t("gameover.user")}</span>
            <span className="text-right">{t("gameover.points")}</span>
          </div>

          {/* Rows container — min-h fija para 5 filas (5 × 24px + 4 borders = 124px) */}
          <div className="min-h-[124px]">
            {isLoading ? (
              /* ── Skeleton Loader: 5 filas falsas con animate-pulse ── */
              SKELETON_ROWS.map((i) => <SkeletonRow key={i} index={i} />)
            ) : (
              /* ── Filas reales ── */
              displayRanking.map((r) => {
                const isMe = currentUser?.id && r.userId === currentUser.id;
                return (
                  <div
                    key={r.pos}
                    onClick={() => r.userId && setProfileUserId(r.userId)}
                    className={`grid grid-cols-[1.2rem_1.5rem_1fr_3rem] gap-x-1.5 items-center px-2.5 py-0.5 text-xs border-b border-white/4 last:border-0 transition-colors ${
                      isMe ? "bg-white/8 rounded-lg" : ""
                    }${r.userId ? " cursor-pointer hover:bg-white/5 active:bg-white/10" : ""}`}
                  >
                    <span className={`font-bold tabular-nums ${isMe ? "text-emerald-400" : "text-white/40"}`}>{r.pos}</span>
                    <Avatar equippedAvatarId={r.equippedAvatarId} size="sm" className="w-5! h-5!" />
                    <span className={`font-medium truncate ${isMe ? "text-white" : "text-white/60"}`}>{r.user}</span>
                    <span className={`font-bold text-right tabular-nums ${isMe ? "text-emerald-400" : "text-white/50"}`}>{r.score}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Footer zone (shrink-0: botones anclados) ── */}
        <div className="shrink-0 flex flex-col gap-1.5 w-full">
          {/* Jugar de nuevo */}
          {onReplay && (
            <button
              onClick={onReplay}
              className="mt-1 w-full px-4 py-2 md:py-3 bg-slate-800/60 backdrop-blur-md hover:bg-slate-700/60 active:scale-95 text-white/90 font-bold rounded-xl text-sm md:text-base transition-all border border-white/10 shadow-lg flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.5} />
              {t("gameover.replay")}
            </button>
          )}

          {/* Siguiente juego */}
          <button
            onClick={onNext}
            className="w-full px-4 py-2 md:py-3 bg-slate-800/60 backdrop-blur-md hover:bg-slate-700/60 active:scale-95 text-white/90 font-bold rounded-xl text-sm md:text-base transition-all border border-white/10 shadow-lg flex items-center justify-center gap-2"
          >
            {t("gameover.next")}
            <ChevronDown className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
    </>
  );
};

export default GameOverPanel;
