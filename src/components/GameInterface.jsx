/**
 * GameInterface.jsx — Capa de UI flotante sobre el juego
 *
 * Contiene:
 *  - ActionBar lateral derecha (like, gallery)
 *  - Info inferior izquierda (título + descripción)
 *  - Cuenta atrás para placeholders / nada para juegos reales
 *
 * Nota: el header (logo, idioma, login) ahora vive en <TopNav />
 */

import { useCallback, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ActionBar from "./ActionBar";
import DailyChallengesModal from "./DailyChallengesModal";
import { useLanguage } from "../i18n";
import { useAuth } from "../context/AuthContext";
import { getTodayChallenges, getChallengeStatus } from "../services/challengeService";

const GameInterface = ({
  game,
  gameId,
  isCountingDown,
  onCountdownComplete,
  likes,
  isLiked,
  onLike,
  onOpenGallery,
  hasRealGame,
  isChallengesOpen = false,
  onChallengesOpenChange,
  isInfoOpen = false,
  onInfoOpenChange,
  onNavigateToGame,
}) => {
  const { t } = useLanguage();
  const { currentUser } = useAuth();
  const [challengeStatus, setChallengeStatus] = useState("pending");

  // Fetch challenge status on mount + refresh after any game over upsert
  const refreshChallengeStatus = useCallback(() => {
    if (!currentUser?.id) { setChallengeStatus("none"); return; }
    getTodayChallenges(currentUser.id).then((data) => {
      setChallengeStatus(getChallengeStatus(data));
    });
  }, [currentUser?.id]);

  useEffect(() => {
    refreshChallengeStatus();
  }, [refreshChallengeStatus]);

  useEffect(() => {
    const handler = () => refreshChallengeStatus();
    window.addEventListener("challenges-updated", handler);
    return () => window.removeEventListener("challenges-updated", handler);
  }, [refreshChallengeStatus]);

  return (
    <div className="absolute inset-0 z-[60] pointer-events-none">
      {/* ========== ACTION STACK (estilo TikTok/Reels) ========== */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-6 pointer-events-auto">
        <ActionBar
          likes={likes}
          isLiked={isLiked}
          onLike={onLike}
          onOpenGallery={onOpenGallery}
          onOpenChallenges={() => onChallengesOpenChange?.(true)}
          challengeStatus={challengeStatus}
        />
      </div>

      {/* ========== MODAL RETOS DIARIOS ========== */}
      <div className="pointer-events-auto">
        <DailyChallengesModal
          isOpen={isChallengesOpen}
          onClose={() => onChallengesOpenChange?.(false)}
          onStateChange={setChallengeStatus}
          onNavigateToGame={onNavigateToGame}
        />
      </div>

      {/* ========== INFO INFERIOR — Cápsula Glassmorphism ========== */}
      <div className="absolute bottom-6 left-4 z-40 pointer-events-auto">
        <button
          type="button"
          onClick={() => onInfoOpenChange?.(true)}
          className="flex items-center bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-2xl p-2 pr-4 gap-3 shadow-lg
                     transition-all duration-200 hover:bg-slate-900/60 hover:border-white/20 hover:shadow-xl
                     active:scale-95 cursor-pointer"
        >
          {/* Logo / Emoji */}
          {game.logo ? (
            <img
              src={game.logo}
              alt=""
              className="w-10 h-10 object-contain rounded-xl drop-shadow-md"
              style={game.logoScale ? { transform: `scale(${game.logoScale})`, transformOrigin: 'center' } : undefined}
              draggable={false}
            />
          ) : (
            <span className="w-10 h-10 flex items-center justify-center text-2xl rounded-xl bg-white/5">
              {game.emoji}
            </span>
          )}

          {/* Título */}
          <span
            className="text-white text-base md:text-lg font-bold leading-tight tracking-tight"
            style={{ textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}
          >
            {game.title}
          </span>

          {/* Info icon */}
          <span className="w-5 h-5 flex items-center justify-center rounded-full bg-white/10 border border-white/15 text-white/50 text-[10px] font-bold ml-1 shrink-0">
            i
          </span>
        </button>
      </div>

      {/* ========== MODAL INFO / CONTROLES DEL JUEGO ========== */}
      <AnimatePresence>
        {isInfoOpen && (
          <div className="pointer-events-auto">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
              onClick={() => onInfoOpenChange?.(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[71] max-w-sm mx-auto
                         bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl
                         p-6 shadow-[0_8px_60px_rgba(0,0,0,0.6)]"
            >
              {/* Close button */}
              <button
                type="button"
                onClick={() => onInfoOpenChange?.(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Logo + Title */}
              <div className="flex items-center gap-4 mb-5">
                {game.logo ? (
                  <img
                    src={game.logo}
                    alt=""
                    className="w-16 h-16 object-contain rounded-2xl drop-shadow-lg"
                    style={game.logoScale ? { transform: `scale(${game.logoScale})`, transformOrigin: 'center' } : undefined}
                    draggable={false}
                  />
                ) : (
                  <span className="w-16 h-16 flex items-center justify-center text-4xl rounded-2xl bg-white/5">
                    {game.emoji}
                  </span>
                )}
                <h3
                  className="text-white text-2xl font-extrabold tracking-tight"
                  style={{ textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                >
                  {game.title}
                </h3>
              </div>

              {/* Divider */}
              <div className="w-full h-px bg-white/10 mb-5" />

              {/* Instructions */}
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40 mb-2">
                  {t("ui.how_to_play") || "Cómo jugar"}
                </p>
                <p
                  className="text-white/80 text-sm md:text-base leading-relaxed"
                  style={{ textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}
                >
                  {t(`desc.${game.id}`)}
                </p>
              </div>

              {/* Resume button */}
              <button
                type="button"
                onClick={() => onInfoOpenChange?.(false)}
                className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 hover:border-white/20
                           text-white font-semibold text-sm tracking-wide transition-all duration-200 active:scale-95"
              >
                {t("ui.resume") || "Continuar"}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========== CUENTA ATRÁS (gestionada por Feed.jsx) ========== */}
    </div>
  );
};

export default GameInterface;
