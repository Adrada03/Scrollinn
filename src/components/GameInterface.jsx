/**
 * GameInterface.jsx — Capa de UI flotante sobre el juego
 *
 * Contiene:
 *  - Header con logo Scrollinn + botón de idioma
 *  - ActionBar lateral derecha (like, register, gallery)
 *  - Info inferior izquierda (título + descripción)
 *  - Cuenta atrás para placeholders / nada para juegos reales
 */

import { useCallback } from "react";
import Countdown from "./Countdown";
import ActionBar from "./ActionBar";
import { useLanguage } from "../i18n";

/* ── Banderas inline (SVG) para el botón de idioma ── */
const FlagGB = () => (
  <svg viewBox="0 0 60 40" className="w-full h-full rounded-sm" aria-hidden="true">
    <rect fill="#012169" width="60" height="40"/>
    <path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" strokeWidth="8"/>
    <path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" strokeWidth="4"/>
    <path d="M30,0 V40 M0,20 H60" stroke="#fff" strokeWidth="12"/>
    <path d="M30,0 V40 M0,20 H60" stroke="#C8102E" strokeWidth="6"/>
  </svg>
);

const FlagES = () => (
  <svg viewBox="0 0 60 40" className="w-full h-full rounded-sm" aria-hidden="true">
    <rect fill="#AA151B" width="60" height="40"/>
    <rect fill="#F1BF00" y="10" width="60" height="20"/>
  </svg>
);

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
  const { lang, toggleLang, t } = useLanguage();
  const description = t(`desc.${game.id}`);

  const handleCountdownDone = useCallback(() => {
    onCountdownComplete();
  }, [onCountdownComplete]);

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {/* ========== HEADER ========== */}
      <div className="absolute top-0 left-0 right-0 h-16 flex items-center justify-between px-4">
        {/* Espaciador izquierdo */}
        <div className="w-10" />

        {/* Logo centrado */}
        <div className="flex items-center gap-2.5">
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
            scrollinn
          </span>
        </div>

        {/* Botón de idioma (bandera) */}
        <button
          onClick={toggleLang}
          className="w-10 h-7 rounded-md overflow-hidden border border-white/20 shadow-lg pointer-events-auto cursor-pointer hover:scale-110 active:scale-95 transition-transform bg-black/30 backdrop-blur-sm flex items-center justify-center p-0.5"
          aria-label={lang === "es" ? "Switch to English" : "Cambiar a español"}
        >
          {lang === "es" ? <FlagGB /> : <FlagES />}
        </button>
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

      {/* ========== CUENTA ATRÁS (solo placeholders) ========== */}
      {isCountingDown && !hasRealGame && (
        <Countdown
          gameId={gameId}
          onComplete={handleCountdownDone}
          description={description}
        />
      )}
    </div>
  );
};

export default GameInterface;
