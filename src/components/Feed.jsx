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
import ClearModeWrapper from "./ClearModeWrapper";
import { useClearMode } from "../context/ClearModeContext";
import PlaceholderGame from "./PlaceholderGame";
import GameInterface from "./GameInterface";
import ReadyScreen from "./ReadyScreen";
import CountdownOverlay from "./CountdownOverlay";
import { getTodayChallenges, getChallengeStatus } from "../services/challengeService";

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
import ShadowDashGame from "./games/ShadowDashGame";
import GravityDrawGame from "./games/GravityDrawGame";
import CrossroadDartGame from "./games/CrossroadDartGame";
import MentalMathGame from "./games/MentalMathGame";
import PerfectCircleGame from "./games/PerfectCircleGame";
import MemorySequenceGame from "./games/MemorySequenceGame";

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
  ShadowDash: ShadowDashGame,
  GravityDraw: GravityDrawGame,
  CrossroadDart: CrossroadDartGame,
  MentalMath: MentalMathGame,
  PerfectCircle: PerfectCircleGame,
  MemorySequence: MemorySequenceGame,
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
   GameFeed — Componente exterior
   Levanta useActiveSlide y scrollLockedRef al nivel del wrapper
   para que ClearModeWrapper pueda recibir activeIndex.
   ================================================================ */
const GameFeed = ({
  games,
  selectedGameId,
  gameEpoch = 0,
  disabled = false,
  likesMap,
  onToggleLike,
  onOpenGallery,
  currentUser,
}) => {
  /* ── Hook de scroll snap + IntersectionObserver ── */
  const { containerRef, activeIndex, scrollToSlide } = useActiveSlide(0);
  const scrollLockedRef = useRef(false);
  const [isChallengesOpen, setIsChallengesOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  return (
    <ClearModeWrapper
      activeIndex={activeIndex}
      scrollLockedRef={scrollLockedRef}
      disabled={disabled || isChallengesOpen || isInfoOpen}
    >
      <GameFeedContent
        games={games}
        selectedGameId={selectedGameId}
        gameEpoch={gameEpoch}
        disabled={disabled}
        likesMap={likesMap}
        onToggleLike={onToggleLike}
        onOpenGallery={onOpenGallery}
        currentUser={currentUser}
        containerRef={containerRef}
        activeIndex={activeIndex}
        scrollToSlide={scrollToSlide}
        scrollLockedRef={scrollLockedRef}
        isChallengesOpen={isChallengesOpen}
        onChallengesOpenChange={setIsChallengesOpen}
        isInfoOpen={isInfoOpen}
        onInfoOpenChange={setIsInfoOpen}
      />
    </ClearModeWrapper>
  );
};

/* ================================================================
   GameFeedContent — Componente interior (consume ClearMode context)
   ================================================================ */
const GameFeedContent = ({
  games,
  selectedGameId,
  gameEpoch = 0,
  disabled = false,
  likesMap,
  onToggleLike,
  onOpenGallery,
  currentUser,
  containerRef,
  activeIndex,
  scrollToSlide,
  scrollLockedRef,
  isChallengesOpen = false,
  onChallengesOpenChange,
  isInfoOpen = false,
  onInfoOpenChange,
}) => {
  const { t } = useLanguage();

  /* ── Clear Mode desde el contexto global ── */
  const { isUiHidden, scaleMotion, pinchGuardRef, nuclearReset } = useClearMode();

  /* ── Playlist interna ── */
  const [playlist, setPlaylist] = useState(() => buildInitialPlaylist(games));
  const playlistRef = useRef(playlist);
  playlistRef.current = playlist;

  /* ── Estado ── */
  const [isReady, setIsReady] = useState(true);
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [replayKeys, setReplayKeys] = useState({});
  const [showScrollHint, setShowScrollHint] = useState(true);
  const [isGameOver, setIsGameOver] = useState(false);
  const [challengeStatus, setChallengeStatus] = useState("pending");

  /* ── Challenge status (for ReadyScreen buttons) ── */
  const refreshChallengeStatus = useCallback(() => {
    if (!currentUser?.id) { setChallengeStatus("none"); return; }
    getTodayChallenges(currentUser.id).then((data) => {
      setChallengeStatus(getChallengeStatus(data));
    });
  }, [currentUser?.id]);

  useEffect(() => { refreshChallengeStatus(); }, [refreshChallengeStatus]);
  useEffect(() => {
    const handler = () => refreshChallengeStatus();
    window.addEventListener("challenges-changed", handler);
    return () => window.removeEventListener("challenges-changed", handler);
  }, [refreshChallengeStatus]);

  /* ── Refs ── */
  const prevActiveRef = useRef(null);
  const prevEpochRef = useRef(gameEpoch);

  /* ══════════════════════════════════════════════════════════════
     LEY 1 · Fase del slide activo: 'ready' | 'countdown' | 'playing' | 'game_over'
     Se calcula derivada de isReady + isCountingDown + isGameOver.
     Controla touch-action y overflow-y de forma centralizada.
     ══════════════════════════════════════════════════════════════ */
  const slidePhase = isReady
    ? "ready"
    : isCountingDown
      ? "countdown"
      : isGameOver
        ? "game_over"
        : "playing";

  const disabledRef = useRef(disabled);
  const activeIndexRef = useRef(activeIndex);
  const idleTimer = useRef(null);
  const pendingScrollRef = useRef(null);

  disabledRef.current = disabled;
  activeIndexRef.current = activeIndex;

  /* ══════════════════════════════════════════════════════════════
     REGLA DE LOS 3 SEGUNDOS — Timer proactivo
     Al abandonar un slide en "playing", arranca un timer de 3 s.
     • Si el timer DISPARA (usuario no ha vuelto) → se incrementa
       replayKey inmediatamente (el juego se remonta off-screen
       ya limpio, listo para cuando el usuario vuelva).
     • Si el usuario vuelve ANTES de 3 s → se cancela el timer y
       se reanuda la partida en curso sin countdown.
     ══════════════════════════════════════════════════════════════ */
  // { [slideIndex]: { timerId, phase } }
  const pauseContextRef = useRef({});

  /* ==============================================================
     Cuenta atrás + Regla de 3s — sincronización SÍNCRONA durante el render
     ============================================================== */
  if (prevActiveRef.current !== activeIndex) {
    const leavingIndex = prevActiveRef.current;
    prevActiveRef.current = activeIndex;

    /* ── 1. Registrar contexto del slide que ABANDONA ── */
    if (leavingIndex !== null) {
      if (slidePhase === "ready") {
        // CASO A0: Scroll durante ready → simplemente salir, no ha empezado nada
        delete pauseContextRef.current[leavingIndex];
      } else if (slidePhase === "countdown") {
        // CASO A: Scroll durante countdown → abortar, forzar remontaje
        const leavingUid = playlistRef.current[leavingIndex]?.uid;
        if (leavingUid) {
          setReplayKeys((prev) => ({ ...prev, [leavingUid]: (prev[leavingUid] || 0) + 1 }));
        }
        delete pauseContextRef.current[leavingIndex];
      } else if (slidePhase === "playing") {
        // CASO B: Scroll durante gameplay → arrancar timer de 3 s
        const leavingUid = playlistRef.current[leavingIndex]?.uid;
        const leavingGame = playlistRef.current[leavingIndex]?.game;
        const timerId = setTimeout(() => {
          // Timer disparó: el usuario lleva ≥ 3 s fuera → remontaje proactivo
          delete pauseContextRef.current[leavingIndex];
          if (leavingUid) {
            setReplayKeys((prev) => ({ ...prev, [leavingUid]: (prev[leavingUid] || 0) + 1 }));
          }
          // Preparar countdown para cuando vuelva
          const shouldSkip = !!(
            leavingGame?.gameComponent &&
            GAME_COMPONENTS[leavingGame.gameComponent] &&
            leavingGame.skipCountdown
          );
          // Sólo seteamos isCountingDown si ese slide vuelve a ser activo;
          // por ahora lo guardamos como marca en el contexto.
          pauseContextRef.current[leavingIndex] = { phase: "reset_done", shouldSkip };
        }, 3000);
        pauseContextRef.current[leavingIndex] = { phase: "playing", timerId };
      } else if (slidePhase === "game_over") {
        // Game over: forzar remontaje inmediato (ya se terminó la partida)
        const leavingUid = playlistRef.current[leavingIndex]?.uid;
        if (leavingUid) {
          setReplayKeys((prev) => ({ ...prev, [leavingUid]: (prev[leavingUid] || 0) + 1 }));
        }
        pauseContextRef.current[leavingIndex] = { phase: "game_over" };
      }
    }

    /* ── 2. Invalidar contextos de slides fuera de RENDER_WINDOW ── */
    for (const idx of Object.keys(pauseContextRef.current)) {
      if (Math.abs(Number(idx) - activeIndex) > RENDER_WINDOW) {
        const old = pauseContextRef.current[idx];
        if (old?.timerId) clearTimeout(old.timerId);
        delete pauseContextRef.current[idx];
      }
    }

    /* ── 3. Decidir qué hacer con el slide al que LLEGAMOS ── */
    const ctx = pauseContextRef.current[activeIndex];

    if (ctx && ctx.phase === "playing" && ctx.timerId) {
      // Quick Return (< 3 s): timer aún no ha disparado → cancelar y reanudar
      clearTimeout(ctx.timerId);
      delete pauseContextRef.current[activeIndex];
      setIsGameOver(false);
      setIsReady(false);
      setIsCountingDown(false); // reanudar sin countdown
    } else if (ctx && ctx.phase === "reset_done") {
      // El timer ya disparó mientras estábamos fuera → juego ya remontado.
      // Volver a pantalla ready.
      delete pauseContextRef.current[activeIndex];
      setIsGameOver(false);
      setIsReady(true);
      setIsCountingDown(false);
    } else if (ctx && ctx.phase === "game_over") {
      // Volvemos a un slide en game_over → ya se hizo remontaje al salir
      // Volver a pantalla ready.
      delete pauseContextRef.current[activeIndex];
      setIsGameOver(false);
      setIsReady(true);
      setIsCountingDown(false);
    } else {
      // Primera visita o slide sin contexto de pausa → flujo ready
      setIsGameOver(false);
      setIsReady(true);
      setIsCountingDown(false);
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
     LEY 1 — Control centralizado de scroll (touch-action + overflow)
     Reemplaza handleScrollLock individual de cada juego.
     ============================================================== */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const effectiveDisabled = disabled || isChallengesOpen || isInfoOpen;
    const activeGame = playlistRef.current[activeIndex]?.game;
    const shouldLock =
      slidePhase === "playing" &&
      !!activeGame?.requiresScrollLock &&
      !effectiveDisabled;

    scrollLockedRef.current = shouldLock;
    container.style.overflowY = shouldLock || effectiveDisabled ? "hidden" : "scroll";
  }, [slidePhase, activeIndex, disabled, isChallengesOpen, isInfoOpen, containerRef]);

  /* Fallback: juegos sin requiresScrollLock que usan onScrollLock manualmente */
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
     Game Over: desbloquear scroll inmediatamente (señal de GameOverPanel)
     ============================================================== */
  useEffect(() => {
    const handleGameOverUnlock = () => {
      setIsGameOver(true);
      scrollLockedRef.current = false;
      const container = containerRef.current;
      if (container && !disabledRef.current) {
        container.style.overflowY = "scroll";
      }
    };
    window.addEventListener("gameover-scroll-unlock", handleGameOverUnlock);
    return () => window.removeEventListener("gameover-scroll-unlock", handleGameOverUnlock);
  }, [containerRef]);

  /* ==============================================================
     Replay — remonta el componente del juego actual
     ============================================================== */
  const handleReplay = useCallback((uid, index, skipCountdown = false) => {
    setReplayKeys((prev) => ({ ...prev, [uid]: (prev[uid] || 0) + 1 }));
    setIsGameOver(false);
    // Replay → directo a countdown (no vuelve a ready)
    setIsReady(false);
    if (skipCountdown) {
      setIsCountingDown(false);
    } else {
      setIsCountingDown(true);
    }
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
          const isPlayable = isActive && !isReady && !isCountingDown && !disabled && !isChallengesOpen && !isInfoOpen;
          const replayKey = replayKeys[uid] || 0;

          /* ── LEY 1: touch-action dinámico en el wrapper del juego ──
             Solo 'none' si: juego activo + jugando + requiresScrollLock.
             En el resto → 'pan-y': permite scroll vertical pero reserva
             el pinch para nuestro JS (clear mode). 'manipulation' no sirve
             porque el navegador reclama el pinch y no envía touchmove a JS. */
          const gameTouchAction =
            isActive &&
            slidePhase === "playing" &&
            game.requiresScrollLock
              ? "none"
              : "pan-y";

          return (
            <section
              key={uid}
              data-slide-index={index}
              className="h-dvh w-full snap-start snap-always relative"
            >
              {/* ── Contenedor escalable: juego + UI se amplían juntos ── */}
              <motion.div
                className="h-full w-full origin-center"
                style={{ scale: isActive ? scaleMotion : 1 }}
              >
                {/* ── Wrapper con touch-action dinámico (LEY 1) ── */}
                <div
                  className="h-full w-full"
                  style={{ touchAction: gameTouchAction }}
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
                            onReplay={() => handleReplay(uid, index, shouldSkipCountdown)}
                            userId={currentUser?.id}
                            pinchGuardRef={pinchGuardRef}
                            onScrollLock={handleScrollLock}
                          />
                        );
                      })()
                    ) : (
                      <PlaceholderGame
                        key={`${uid}-ph-${replayKey}`}
                        game={game}
                        isActive={isPlayable}
                      />
                    )
                  ) : (
                    <PlaceholderGame game={game} isActive={false} />
                  )}
                </div>

                {/* ── UI Overlay (DENTRO del contenedor escalable) ── */}
                <AnimatePresence>
                  {isNearby && !isUiHidden && (
                    <motion.div
                      key="ui-overlay"
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
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
                        isChallengesOpen={isChallengesOpen}
                        onChallengesOpenChange={onChallengesOpenChange}
                        isInfoOpen={isInfoOpen}
                        onInfoOpenChange={onInfoOpenChange}
                        onNavigateToGame={(targetGameId) => {
                          const targetGame = games.find(
                            (g) => g.id === targetGameId
                          );
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
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── ReadyScreen: pantalla de atracción ── */}
                <AnimatePresence>
                  {isActive && isReady && !isInfoOpen && (
                    <ReadyScreen
                      key={`ready-${uid}-${replayKey}`}
                      logo={game.logo}
                      logoScale={game.logoScale}
                      emoji={game.emoji}
                      title={game.title}
                      instruction={t(`desc.${game.id}`)}
                      color={game.color}
                      onOpenChallenges={() => onChallengesOpenChange?.(true)}
                      onOpenGallery={onOpenGallery}
                      challengeStatus={challengeStatus}
                      onStart={() => {
                        setIsReady(false);
                        if (shouldSkipCountdown) {
                          setIsCountingDown(false);
                        } else {
                          setIsCountingDown(true);
                        }
                      }}
                    />
                  )}
                </AnimatePresence>

                {/* ── CountdownOverlay: 3, 2, 1, GO! flotante sobre el tablero ── */}
                {isActive && isCountingDown && !shouldSkipCountdown && !disabled && !isChallengesOpen && !isInfoOpen && (
                  <CountdownOverlay
                    gameId={`${uid}-${replayKey}`}
                    onComplete={() => setIsCountingDown(false)}
                  />
                )}
              </motion.div>

              {/* ── LEY 2: Skip Button — solo durante gameplay de juegos con scroll bloqueado ── */}
              <AnimatePresence>
                {isActive &&
                  slidePhase === "playing" &&
                  game.requiresScrollLock && (
                    <motion.button
                      key="skip-btn"
                      initial={{ opacity: 0, scale: 0.6, y: 20 }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        y: [0, 5, 0],
                      }}
                      exit={{ opacity: 0, scale: 0.6, y: 10 }}
                      transition={{
                        opacity: { duration: 0.3, ease: "easeOut" },
                        scale: { duration: 0.3, ease: "easeOut" },
                        y: {
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeInOut",
                        },
                      }}
                      whileTap={{ scale: 0.85 }}
                      onClick={() => scrollToSlide(index + 1, "smooth")}
                      className="absolute right-4 z-50 flex items-center justify-center
                                 w-12 h-12 rounded-full
                                 bg-black/40 backdrop-blur-lg border border-white/15
                                 text-white/70 hover:text-white hover:bg-black/55
                                 transition-colors pointer-events-auto
                                 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
                      style={{
                        bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
                      }}
                      aria-label={t("ui.next_game") || "Siguiente juego"}
                    >
                      {/* Lucide ChevronsDown */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-6 h-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m7 6 5 5 5-5" />
                        <path d="m7 13 5 5 5-5" />
                      </svg>
                    </motion.button>
                  )}
              </AnimatePresence>

              {/* ── Botón restaurar UI (X) — FUERA del escalable para tamaño fijo ── */}
              <AnimatePresence>
                {isActive && isUiHidden && (
                  <motion.button
                    key="restore-btn"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                    onClick={nuclearReset}
                    className="absolute bottom-4 left-4 z-50 flex items-center justify-center
                               w-10 h-10 rounded-full
                               bg-white/10 backdrop-blur-md border border-white/20
                               text-white/70 hover:text-white hover:bg-white/20
                               transition-colors pointer-events-auto
                               shadow-lg shadow-black/20"
                    aria-label="Restaurar interfaz"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </motion.button>
                )}
              </AnimatePresence>
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
