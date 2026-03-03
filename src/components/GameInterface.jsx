/**
 * GameInterface.jsx — Capa de UI flotante sobre el juego
 *
 * Contiene:
 *  - ActionBar lateral derecha (like, retos)
 *  - Modal de Retos Diarios
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
      <div className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center gap-6 pointer-events-auto"
           style={{ right: 'calc(1rem + var(--sar))' }}>
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



      {/* ========== CUENTA ATRÁS (gestionada por Feed.jsx) ========== */}
    </div>
  );
};

export default GameInterface;
