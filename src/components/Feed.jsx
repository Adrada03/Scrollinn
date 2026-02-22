/**
 * GameFeed.jsx — Feed vertical infinito con CSS Scroll Snapping estilo TikTok
 *
 * Arquitectura "Baraja infinita":
 *  - Mantiene una playlist interna de items { game, uid }
 *  - Inicializa con 2 barajas shuffled (~42 slides)
 *  - Auto-extiende al acercarse al final (append otra baraja)
 *  - Galería: inyecta el juego elegido justo después del slide activo
 *  - IntersectionObserver + MutationObserver detectan slides nuevos
 *  - Solo el slide activo recibe isPlayable={true}
 *  - ±1 slide monta el componente real; el resto son placeholders ligeros
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLanguage } from "../i18n";
import useActiveSlide from "../hooks/useActiveSlide";
import PlaceholderGame from "./PlaceholderGame";
import GameInterface from "./GameInterface";

/* ── Imports de juegos reales ── */
import TowerBlocksGame from "./games/TowerBlocksGame";
import OddOneOutGame from "./games/OddOneOutGame";
import CircleNinjaGame from "./games/CircleNinjaGame";
import ColorMatchGame from "./games/ColorMatchGame";
import CirclePathGame from "./games/CirclePathGame";
import HextrisGame from "./games/HextrisGame";
import NeonTapGame from "./games/NeonTapGame";
import StroopEffectGame from "./games/StroopEffectGame";
import TimerGame from "./games/TimerGame";
import TrafficLightGame from "./games/TrafficLightGame";
import SweetSpotGame from "./games/SweetSpotGame";
import DodgeRushGame from "./games/DodgeRushGame";
import FrenzyTapGame from "./games/FrenzyTapGame";
import PerfectScaleGame from "./games/PerfectScaleGame";
import SwipeSorterGame from "./games/SwipeSorterGame";
import MathRushGame from "./games/MathRushGame";
import StickBridgeGame from "./games/StickBridgeGame";
import DropTheBoxGame from "./games/DropTheBoxGame";
import OverheatGame from "./games/OverheatGame";
import MemoryLoopGame from "./games/MemoryLoopGame";
import HigherLowerGame from "./games/HigherLowerGame";
import VectorLeapGame from "./games/VectorLeapGame";
import RPSDuelGame from "./games/RPSDuelGame";
import OrbitSniperGame from "./games/OrbitSniperGame";
import ShapeShifterGame from "./games/ShapeShifterGame";

/** Registro de componentes reales de juego */
const GAME_COMPONENTS = {
  TowerBlocks: TowerBlocksGame,
  OddOneOut: OddOneOutGame,
  CircleNinja: CircleNinjaGame,
  ColorMatch: ColorMatchGame,
  CirclePath: CirclePathGame,
  Hextris: HextrisGame,
  NeonTap: NeonTapGame,
  StroopEffect: StroopEffectGame,
  Timer: TimerGame,
  TrafficLight: TrafficLightGame,
  SweetSpot: SweetSpotGame,
  DodgeRush: DodgeRushGame,
  FrenzyTap: FrenzyTapGame,
  PerfectScale: PerfectScaleGame,
  SwipeSorter: SwipeSorterGame,
  MathRush: MathRushGame,
  StickBridge: StickBridgeGame,
  DropTheBox: DropTheBoxGame,
  Overheat: OverheatGame,
  MemoryLoop: MemoryLoopGame,
  HigherLower: HigherLowerGame,
  VectorLeap: VectorLeapGame,
  RPSDuel: RPSDuelGame,
  OrbitSniper: OrbitSniperGame,
  ShapeShifter: ShapeShifterGame,
};

/* ================================================================
   Utilidades de playlist
   ================================================================ */

let uidCounter = 0;

/** Fisher-Yates shuffle (no muta el original) */
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Crea una baraja shuffled evitando que el primer juego sea igual a lastId
 * (para que no haya dos juegos consecutivos iguales entre barajas).
 */
function createBatch(games, lastId) {
  let shuffled = shuffleArray(games);
  if (lastId && shuffled.length > 1 && shuffled[0].id === lastId) {
    const swap = 1 + Math.floor(Math.random() * (shuffled.length - 1));
    [shuffled[0], shuffled[swap]] = [shuffled[swap], shuffled[0]];
  }
  return shuffled.map((game) => ({ game, uid: `${game.id}-${++uidCounter}` }));
}

/** Playlist inicial: 2 barajas shuffled */
function buildInitialPlaylist(games) {
  const batch1 = createBatch(games, null);
  const batch2 = createBatch(games, batch1[batch1.length - 1].game.id);
  return [...batch1, ...batch2];
}

/* ================================================================
   Constantes
   ================================================================ */

const RENDER_WINDOW = 1;       // ±1 slide monta componente real
const EXTEND_THRESHOLD = 12;   // extiende cuando quedan menos de 12 slides
const IDLE_TIMEOUT = 8000;     // ms para mostrar hint de scroll

/* ================================================================
   GameFeed — Componente principal
   ================================================================ */
const GameFeed = ({
  games,            // catálogo maestro (GAMES)
  selectedGameId,   // id del juego elegido en la galería (o null)
  gameEpoch = 0,    // se bumps al elegir desde la galería
  disabled = false,
  likesMap,
  onToggleLike,
  onOpenGallery,
  currentUser,
}) => {
  const { t } = useLanguage();

  /* ── Playlist interna ── */
  const [playlist, setPlaylist] = useState(() => buildInitialPlaylist(games));
  const playlistRef = useRef(playlist);
  playlistRef.current = playlist;

  /* ── Hook de scroll snap + IntersectionObserver ── */
  const { containerRef, activeIndex, scrollToSlide } = useActiveSlide(0);

  /* ── Estado ── */
  const [isCountingDown, setIsCountingDown] = useState(true);
  const [replayKeys, setReplayKeys] = useState({});     // keyed by uid
  const [showScrollHint, setShowScrollHint] = useState(true);

  /* ── Refs ── */
  const prevActiveRef = useRef(null);
  const prevEpochRef = useRef(gameEpoch);
  const scrollLockedRef = useRef(false);
  const disabledRef = useRef(disabled);
  const activeIndexRef = useRef(activeIndex);
  const idleTimer = useRef(null);
  const pendingScrollRef = useRef(null);

  disabledRef.current = disabled;
  activeIndexRef.current = activeIndex;

  /* ==============================================================
     Cuenta atrás — sincronización SÍNCRONA durante el render
     ============================================================== */
  if (prevActiveRef.current !== activeIndex) {
    prevActiveRef.current = activeIndex;
    const item = playlistRef.current[activeIndex];
    const game = item?.game;
    const shouldSkip = !!(
      game?.gameComponent &&
      GAME_COMPONENTS[game.gameComponent] &&
      game.skipCountdown
    );
    const nextCountingDown = !shouldSkip;
    if (isCountingDown !== nextCountingDown) {
      setIsCountingDown(nextCountingDown);
    }
  }

  /* ==============================================================
     Auto-extender playlist al acercarse al final
     ============================================================== */
  useEffect(() => {
    if (activeIndex >= playlist.length - EXTEND_THRESHOLD) {
      setPlaylist((prev) => {
        const lastId = prev[prev.length - 1].game.id;
        const newBatch = createBatch(games, lastId);
        return [...prev, ...newBatch];
      });
    }
  }, [activeIndex, playlist.length, games]);

  /* ==============================================================
     Galería: inyectar juego tras el slide activo y scroll instantáneo
     ============================================================== */
  useEffect(() => {
    if (prevEpochRef.current !== gameEpoch && selectedGameId) {
      prevEpochRef.current = gameEpoch;
      const targetGame = games.find((g) => g.id === selectedGameId);
      if (!targetGame) return;

      const insertAt = activeIndexRef.current + 1;
      const newItem = {
        game: targetGame,
        uid: `${targetGame.id}-${++uidCounter}`,
      };

      setPlaylist((prev) => {
        const copy = [...prev];
        copy.splice(insertAt, 0, newItem);
        return copy;
      });

      pendingScrollRef.current = insertAt;
    }
  }, [gameEpoch, selectedGameId, games]);

  // Scroll después de que el DOM se actualice con la nueva playlist
  useEffect(() => {
    if (pendingScrollRef.current !== null) {
      const idx = pendingScrollRef.current;
      pendingScrollRef.current = null;
      requestAnimationFrame(() => scrollToSlide(idx, "instant"));
    }
  }, [playlist, scrollToSlide]);

  /* ==============================================================
     Bloquear scroll: modal abierto o juego lo solicita
     ============================================================== */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.style.overflowY =
      disabled || scrollLockedRef.current ? "hidden" : "scroll";
  }, [disabled, containerRef]);

  const handleScrollLock = useCallback(
    (locked) => {
      scrollLockedRef.current = locked;
      const container = containerRef.current;
      if (container) {
        container.style.overflowY =
          locked || disabledRef.current ? "hidden" : "scroll";
      }
    },
    [containerRef]
  );

  /* ==============================================================
     Replay — remonta el componente del juego actual
     ============================================================== */
  const handleReplay = useCallback((uid, index) => {
    setReplayKeys((prev) => ({ ...prev, [uid]: (prev[uid] || 0) + 1 }));
    const game = playlistRef.current[index]?.game;
    const skip = !!(
      game?.gameComponent &&
      GAME_COMPONENTS[game.gameComponent] &&
      game.skipCountdown
    );
    setIsCountingDown(!skip);
  }, []);

  /* ==============================================================
     Navegar al siguiente slide (llamado por un juego vía onNextGame)
     ============================================================== */
  const handleNextGame = useCallback(
    (fromIndex) => {
      scrollToSlide(fromIndex + 1, "smooth");
    },
    [scrollToSlide]
  );

  /* ==============================================================
     Teclado: Arrow Down/Up, PgDown/PgUp
     ============================================================== */
  useEffect(() => {
    const handleKey = (e) => {
      if (disabledRef.current) return;
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        scrollToSlide(activeIndexRef.current + 1, "smooth");
      }
      if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        if (activeIndexRef.current > 0) {
          scrollToSlide(activeIndexRef.current - 1, "smooth");
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [scrollToSlide]);

  /* ==============================================================
     Idle hint
     ============================================================== */
  const resetIdleTimer = useCallback(() => {
    setShowScrollHint(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(
      () => setShowScrollHint(true),
      IDLE_TIMEOUT
    );
  }, []);

  useEffect(() => {
    idleTimer.current = setTimeout(
      () => setShowScrollHint(true),
      IDLE_TIMEOUT
    );
    const events = ["pointerdown", "keydown", "wheel", "touchstart"];
    events.forEach((ev) =>
      window.addEventListener(ev, resetIdleTimer, { passive: true })
    );
    return () => {
      clearTimeout(idleTimer.current);
      events.forEach((ev) => window.removeEventListener(ev, resetIdleTimer));
    };
  }, [resetIdleTimer]);

  /* ==============================================================
     RENDER
     ============================================================== */
  return (
    <>
      <div
        ref={containerRef}
        className="h-dvh w-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide overscroll-none bg-black"
      >
        {playlist.map((item, index) => {
          const { game, uid } = item;
          const isActive = index === activeIndex;
          const isNearby = Math.abs(index - activeIndex) <= RENDER_WINDOW;
          const shouldSkipCountdown = !!(
            game.gameComponent &&
            GAME_COMPONENTS[game.gameComponent] &&
            game.skipCountdown
          );
          const isPlayable = isActive && !isCountingDown;
          const replayKey = replayKeys[uid] || 0;

          return (
            <section
              key={uid}
              data-slide-index={index}
              className="h-dvh w-full snap-start snap-always relative"
            >
              {/* ── Contenido del juego ── */}
              {isNearby ? (
                game.gameComponent &&
                GAME_COMPONENTS[game.gameComponent] ? (
                  (() => {
                    const GameComp = GAME_COMPONENTS[game.gameComponent];
                    return (
                      <GameComp
                        key={`${uid}-${replayKey}`}
                        isActive={isPlayable}
                        onNextGame={() => handleNextGame(index)}
                        onReplay={() => handleReplay(uid, index)}
                        userId={currentUser?.id}
                        onScrollLock={handleScrollLock}
                      />
                    );
                  })()
                ) : (
                  <PlaceholderGame
                    key={`${uid}-ph-${replayKey}`}
                    color={game.color}
                    emoji={game.emoji}
                    isActive={isPlayable}
                  />
                )
              ) : (
                <div
                  className={`h-full w-full ${game.color} flex items-center justify-center`}
                >
                  <span className="text-6xl opacity-20 select-none">
                    {game.emoji}
                  </span>
                </div>
              )}

              {/* ── UI Overlay flotante (por slide) ── */}
              {isNearby && (
                <GameInterface
                  game={game}
                  gameId={`${uid}-${replayKey}`}
                  isCountingDown={
                    isActive && isCountingDown && !shouldSkipCountdown
                  }
                  onCountdownComplete={() => setIsCountingDown(false)}
                  likes={likesMap[game.id]?.count || 0}
                  isLiked={likesMap[game.id]?.liked || false}
                  onLike={() => onToggleLike(game.id)}
                  onOpenGallery={onOpenGallery}
                  hasRealGame={shouldSkipCountdown}
                />
              )}
            </section>
          );
        })}
      </div>

      {/* ── Scroll Hint ── */}
      <AnimatePresence>
        {showScrollHint && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.4 }}
            className="fixed bottom-2 left-0 right-0 z-30 flex flex-col items-center pointer-events-none select-none"
          >
            <span
              className="text-white/40 text-xs font-medium tracking-wide"
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}
            >
              {t("ui.swipe_hint")}
            </span>
            <motion.svg
              animate={{ y: [0, 5, 0] }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-white/30 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </motion.svg>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default GameFeed;
