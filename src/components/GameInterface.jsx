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
  onNavigateToGame,
}) => {
  const { t } = useLanguage();
  const { currentUser } = useAuth();
  const description = t(`desc.${game.id}`);
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
    <div className="absolute inset-0 z-20 pointer-events-none">
      {/* ========== ACTION STACK (estilo TikTok/Reels) ========== */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-60 flex flex-col items-center gap-6 pointer-events-auto">
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

      {/* ========== INFO INFERIOR ========== */}
      <div className="absolute bottom-6 left-4 right-20 pr-4">
        <h2
          className="text-white text-xl md:text-2xl font-bold leading-tight drop-shadow-lg"
          style={{ textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}
        >
          {game.logo ? (
            <img src={game.logo} alt="" className="inline-block h-9 w-9 object-contain mr-1.5 align-middle drop-shadow" style={game.logoScale ? { transform: `scale(${game.logoScale})`, transformOrigin: 'center' } : undefined} draggable={false} />
          ) : (
            <span className="mr-1">{game.emoji}</span>
          )}
          {game.title}
        </h2>
        <p
          className="text-white/70 text-sm md:text-base mt-1 leading-snug drop-shadow"
          style={{ textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}
        >
          {description}
        </p>

        {/* Indicador de estado */}
        <div className="flex items-center gap-2 mt-3">
          {isCountingDown ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-300/80 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              {t("ui.preparing")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300/80 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {t("ui.playing")}
            </span>
          )}
        </div>
      </div>

      {/* ========== CUENTA ATRÁS (gestionada por Feed.jsx) ========== */}
    </div>
  );
};

export default GameInterface;
