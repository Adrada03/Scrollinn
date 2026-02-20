/**
 * GameFeed.jsx — Feed vertical infinito estilo TikTok
 *
 * Maneja scroll/swipe/teclado para navegar entre juegos.
 * Cada slide es un juego a pantalla completa con:
 *  - Transición animada (framer-motion)
 *  - Cuenta atrás de 3 segundos al cambiar
 *  - UI overlay flotante (GameInterface)
 *  - Navegación aleatoria
 *
 * Se bloquea cuando hay un modal abierto (prop disabled).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PlaceholderGame from "./PlaceholderGame";
import GameInterface from "./GameInterface";
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
};

const IDLE_TIMEOUT = 8000; // ms sin interacción para mostrar el hint

const GameFeed = ({
  games,
  currentIndex,
  onChangeIndex,
  disabled = false,
  likesMap,
  onToggleLike,
  onOpenGallery,
  onOpenAuth,
  currentUser,
}) => {
  const touchStartY = useRef(null);
  const isTransitioning = useRef(false);
  const history = useRef([0]);
  const [direction, setDirection] = useState(1);
  const [isCountingDown, setIsCountingDown] = useState(true);
  const [showScrollHint, setShowScrollHint] = useState(true); // visible al abrir
  const idleTimer = useRef(null);

  const currentGame = games[currentIndex];
  // Solo los juegos con skipCountdown gestionan su propio inicio (ej. TowerBlocks click-to-start)
  const skipCountdown = !!(currentGame?.gameComponent && GAME_COMPONENTS[currentGame.gameComponent] && currentGame.skipCountdown);

  /**
   * Reset síncrono de la cuenta atrás al cambiar de juego.
   * Usa el patrón "storing information from previous renders" de React
   * para evitar un render con isActive stale (bug: juegos arrancaban
   * durante la cuenta atrás al venir de un juego con skipCountdown).
   */
  const prevIndexRef = useRef(currentIndex);
  if (prevIndexRef.current !== currentIndex) {
    prevIndexRef.current = currentIndex;
    const shouldSkip = !!(currentGame?.gameComponent && GAME_COMPONENTS[currentGame.gameComponent] && currentGame.skipCountdown);
    if (isCountingDown !== !shouldSkip) {
      setIsCountingDown(!shouldSkip);
    }
  }

  /**
   * Elige un juego aleatorio diferente al actual.
   */
  const getRandomIndex = useCallback(
    (excludeIndex) => {
      if (games.length <= 1) return 0;
      let next;
      do {
        next = Math.floor(Math.random() * games.length);
      } while (next === excludeIndex);
      return next;
    },
    [games.length]
  );

  /**
   * Navega al juego siguiente (aleatorio) o anterior (historial).
   */
  const navigate = useCallback(
    (dir) => {
      if (disabled || isTransitioning.current) return;

      if (dir === "next") {
        isTransitioning.current = true;
        setDirection(1);
        const nextIndex = getRandomIndex(currentIndex);
        history.current.push(nextIndex);
        onChangeIndex(nextIndex);
        setTimeout(() => (isTransitioning.current = false), 500);
      }
    },
    [currentIndex, disabled, getRandomIndex, onChangeIndex]
  );

  // === Idle hint: ocultar al interactuar, mostrar tras inactividad ===
  const resetIdleTimer = useCallback(() => {
    setShowScrollHint(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setShowScrollHint(true), IDLE_TIMEOUT);
  }, []);

  useEffect(() => {
    // Arrancar timer inicial
    idleTimer.current = setTimeout(() => setShowScrollHint(true), IDLE_TIMEOUT);

    const events = ["pointerdown", "keydown", "wheel", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, resetIdleTimer, { passive: true }));
    return () => {
      clearTimeout(idleTimer.current);
      events.forEach((ev) => window.removeEventListener(ev, resetIdleTimer));
    };
  }, [resetIdleTimer]);

  // === Rueda del ratón ===
  useEffect(() => {
    const handleWheel = (e) => {
      if (disabled) return;
      e.preventDefault();
      if (e.deltaY > 30) navigate("next");
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [navigate, disabled]);

  // === Teclado ===
  useEffect(() => {
    const handleKey = (e) => {
      if (disabled) return;
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        navigate("next");
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [navigate, disabled]);

  // === Touch (swipe) ===
  useEffect(() => {
    const handleTouchStart = (e) => {
      if (disabled) return;
      touchStartY.current = e.touches[0].clientY;
    };
    const handleTouchEnd = (e) => {
      if (disabled || touchStartY.current === null) return;
      const deltaY = touchStartY.current - e.changedTouches[0].clientY;
      if (deltaY > 50) navigate("next");
      touchStartY.current = null;
    };
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [navigate, disabled]);

  // Variantes de animación
  const variants = {
    enter: (dir) => ({
      y: dir > 0 ? "100%" : "-100%",
      opacity: 0.3,
    }),
    center: {
      y: 0,
      opacity: 1,
    },
    exit: (dir) => ({
      y: dir > 0 ? "-50%" : "50%",
      opacity: 0,
      scale: 0.95,
    }),
  };

  const gameKey = currentGame.id + "-" + history.current.length;

  return (
    <div className="w-screen h-screen overflow-hidden relative bg-black">
      {/* === FONDO DEL JUEGO (animado) === */}
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={gameKey}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            y: { type: "tween", duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
            opacity: { duration: 0.3 },
            scale: { duration: 0.3 },
          }}
          className="absolute inset-0"
        >
          {currentGame.gameComponent && GAME_COMPONENTS[currentGame.gameComponent] ? (
            (() => {
              const GameComp = GAME_COMPONENTS[currentGame.gameComponent];
              return <GameComp isActive={!isCountingDown} onNextGame={() => navigate("next")} userId={currentUser?.id} />;
            })()
          ) : (
            <PlaceholderGame
              color={currentGame.color}
              emoji={currentGame.emoji}
              isActive={!isCountingDown}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* === UI OVERLAY FLOTANTE === */}
      <GameInterface
        game={currentGame}
        gameId={gameKey}
        isCountingDown={isCountingDown}
        onCountdownComplete={() => setIsCountingDown(false)}
        likes={likesMap[currentGame.id]?.count || 0}
        isLiked={likesMap[currentGame.id]?.liked || false}
        onLike={() => onToggleLike(currentGame.id)}
        onOpenGallery={onOpenGallery}
        onOpenAuth={onOpenAuth}
        currentUser={currentUser}
        hasRealGame={skipCountdown}
      />

      {/* === SCROLL HINT === */}
      <AnimatePresence>
        {showScrollHint && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.4 }}
            className="absolute bottom-1 left-0 right-0 z-30 flex flex-col items-center pointer-events-none select-none"
          >
            <span
              className="text-white/40 text-xs font-medium tracking-wide"
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}
            >
              Desliza para cambiar de juego
            </span>
            <motion.svg
              animate={{ y: [0, 5, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-white/30 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </motion.svg>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GameFeed;
