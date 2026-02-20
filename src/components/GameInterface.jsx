/**
 * GameInterface.jsx — Capa de UI flotante sobre el juego
 *
 * Contiene:
 *  - Header con logo Scrollinn
 *  - ActionBar lateral derecha (like, register, gallery)
 *  - Info inferior izquierda (título + descripción)
 *  - Cuenta atrás para placeholders / nada para juegos reales
 */

import { useCallback } from "react";
import Countdown from "./Countdown";
import ActionBar from "./ActionBar";

const GameInterface = ({
  game,
  gameId,
  isCountingDown,
  onCountdownComplete,
  likes,
  isLiked,
  onLike,
  onOpenGallery,
  onOpenAuth,
  currentUser,
  hasRealGame,
}) => {
  const handleCountdownDone = useCallback(() => {
    onCountdownComplete();
  }, [onCountdownComplete]);

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {/* ========== HEADER ========== */}
      <div className="absolute top-0 left-0 right-0 h-16 flex items-center justify-center gap-2.5 px-4">
        <img
          src="/logoScrollinn.png"
          alt="Scrollinn"
          className="h-13 drop-shadow-lg"
          draggable={false}
        />
        <span
          className="text-white text-3xl font-extrabold tracking-tight drop-shadow-lg"
          style={{ textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}
        >
          Scrollinn
        </span>
      </div>

      {/* ========== ACTION BAR ========== */}
      <div className="absolute right-3 bottom-44 md:bottom-52 pointer-events-auto">
        <ActionBar
          likes={likes}
          isLiked={isLiked}
          onLike={onLike}
          onOpenGallery={onOpenGallery}
          onOpenAuth={onOpenAuth}
          currentUser={currentUser}
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
          {game.description}
        </p>

        {/* Indicador de estado */}
        <div className="flex items-center gap-2 mt-3">
          {isCountingDown ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-300/80 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Preparando...
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300/80 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              En juego
            </span>
          )}
        </div>
      </div>

      {/* ========== CUENTA ATRÁS (solo placeholders) ========== */}
      {isCountingDown && !hasRealGame && (
        <Countdown
          gameId={gameId}
          onComplete={handleCountdownDone}
          description={game.description}
        />
      )}
    </div>
  );
};

export default GameInterface;
