/**
 * StickBridgeGame.jsx — "Stick Bridge" (clon de Stick Hero)
 *
 * El ninja está al borde de una plataforma. El jugador mantiene
 * pulsado para hacer crecer un palo vertical. Al soltar, el palo
 * cae 90° formando un puente. Si alcanza la siguiente plataforma
 * (sin pasarse), el ninja cruza. Si no, cae al vacío.
 *
 * Puntuación = plataformas cruzadas con éxito.
 *
 * Props:
 *   isActive    – cuando pasa a true, arranca el juego
 *   onNextGame  – callback para ir al siguiente juego
 *   currentUser – usuario logueado (para enviar puntuación)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ─────────── Fases del juego ─────────── */
const PHASE = {
  IDLE: 0,
  WAITING: 1,
  GROWING: 2,
  FALLING: 3,     // palo rotando 90°
  WALKING: 4,     // ninja cruza el palo
  SLIDING: 5,     // cámara desplaza escena
  DYING: 6,       // ninja cae al vacío
  ENDED: 7,
};

/* ─────────── Constantes de layout ─────────── */
const GROUND_RATIO = 0.58;       // línea del suelo (desde arriba)
const HOME_RATIO   = 0.28;       // posición X base del ninja
const PLAT_HEIGHT  = 500;        // alto visual de las plataformas (px)
const NINJA_W      = 16;
const NINJA_H      = 28;
const STICK_W      = 4;
const GROW_SPEED   = 2.5;        // px por frame (~130 px/s a 60fps)

/* ─────────── Generación de plataformas ─────────── */
const MIN_GAP     = 45;
const MAX_GAP     = 170;
const MIN_PLAT_W  = 30;
const MAX_PLAT_W  = 110;
const INIT_PLAT_W = 90;

/* ─────────── Duración de animaciones (ms) ─────────── */
const FALL_MS  = 350;     // rotación del palo
const WALK_PXS = 380;     // velocidad del ninja (px/s)
const SLIDE_MS = 350;     // desplazamiento de cámara
const DIE_MS   = 500;     // ninja cayendo

function rand(a, b) { return a + Math.random() * (b - a); }

/* ═══════════════════════════════════════════════════════
   COMPONENTE
   ═══════════════════════════════════════════════════════ */
const StickBridgeGame = ({ isActive, onNextGame, onReplay, userId }) => {
  const { t } = useLanguage();
  const containerRef = useRef(null);

  /* ── Estado de fase y puntuación ── */
  const [phase, setPhase]   = useState(PHASE.IDLE);
  const [score, setScore]   = useState(0);
  const scoreRef            = useRef(0);

  /* ── Dimensiones del contenedor ── */
  const [dims, setDims] = useState({ w: 400, h: 700 });

  /* ── Tick counter para forzar re-render desde refs ── */
  const [, setTick] = useState(0);
  const forceRender = useCallback(() => setTick((t) => t + 1), []);

  /* ── Datos mutables del juego (refs para evitar closures stale) ── */
  const g = useRef({
    platAW: INIT_PLAT_W,
    gap: 100,
    platBW: 80,
    stickLen: 0,
    stickAngle: 0,
    ninjaX: 0,
    ninjaY: 0,
    sceneOff: 0,
    history: [],  // { platW, gap, stickLen } — plataformas anteriores
  }).current;

  /* ── Refs de animación / timers ── */
  const rafRef    = useRef(null);
  const timersRef = useRef([]);

  /* ── Estado de ranking (envío de score) ── */
  const [ranking, setRanking]             = useState([]);
  const [scoreMessage, setScoreMessage]   = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted                    = useRef(false);

  const { submit, loading: isSubmittingScore } = useSubmitScore(userId, GAME_IDS.StickBridgeGame);

  /* ─────────── Helpers ─────────── */
  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const addTimer = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  /* ─────────── Medir contenedor ─────────── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setDims({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── Derivados de layout ── */
  const groundY = dims.h * GROUND_RATIO;
  const homeX   = dims.w * HOME_RATIO;

  /* ─────────── Generar nueva plataforma B ─────────── */
  const generatePlatB = useCallback(
    (currentScore) => {
      const diff = Math.min(currentScore / 25, 1); // 0→1 en 25 rondas
      const minG = MIN_GAP + diff * 20;
      const maxG = MAX_GAP + diff * 30;
      const minW = Math.max(MIN_PLAT_W - diff * 10, 20);
      const maxW = Math.max(MAX_PLAT_W - diff * 30, 30);
      g.gap   = rand(minG, Math.min(maxG, dims.w * 0.5));
      g.platBW = rand(minW, maxW);
    },
    [dims.w, g],
  );

  /* ─────────── Iniciar partida ─────────── */
  const startGame = useCallback(() => {
    clearTimers();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    g.platAW     = INIT_PLAT_W;
    g.stickLen   = 0;
    g.stickAngle = 0;
    g.ninjaX     = 0;
    g.ninjaY     = 0;
    g.sceneOff   = 0;
    g.history    = [];
    scoreRef.current = 0;
    setScore(0);
    scoreSubmitted.current = false;
    setRanking([]);
    setScoreMessage("");
    generatePlatB(0);
    forceRender();
    setPhase(PHASE.WAITING);
  }, [clearTimers, generatePlatB, forceRender, g]);

  /* ── Auto-start cuando isActive pasa a true ── */
  useEffect(() => {
    if (isActive && phase === PHASE.IDLE) startGame();
  }, [isActive, phase, startGame]);

  /* ─────────── rAF: crecimiento del palo ─────────── */
  useEffect(() => {
    if (phase !== PHASE.GROWING) return;
    const tick = () => {
      g.stickLen += GROW_SPEED;
      forceRender();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, forceRender, g]);

  /* ─────────── Pointer handlers ─────────── */
  const handlePointerDown = useCallback(() => {
    if (phase !== PHASE.WAITING) return;
    setPhase(PHASE.GROWING);
  }, [phase]);

  const handlePointerUp = useCallback(() => {
    if (phase !== PHASE.GROWING) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    // ── FALLING: rotar palo 90° ──
    setPhase(PHASE.FALLING);
    g.stickAngle = 90;
    forceRender();

    addTimer(() => {
      // ── WALKING: ninja cruza el puente ──
      setPhase(PHASE.WALKING);
      const len = g.stickLen;
      g.ninjaX = len;
      forceRender();

      const walkMs = Math.max(200, (len / WALK_PXS) * 1000);

      addTimer(() => {
        // ── CHECK ──
        const success = len >= g.gap && len <= g.gap + g.platBW;

        if (success) {
          const newScore = scoreRef.current + 1;
          scoreRef.current = newScore;
          setScore(newScore);

          // ── SLIDING: cámara panea + ninja camina al borde ──
          setPhase(PHASE.SLIDING);
          g.ninjaX  = g.gap + g.platBW;
          g.sceneOff = g.gap + g.platBW;
          forceRender();

          addTimer(() => {
            // Guardar plataforma actual en el historial
            g.history.push({ platW: g.platAW, gap: g.gap, stickLen: g.stickLen });
            if (g.history.length > 12) g.history.shift();

            // Reset para siguiente ronda
            g.platAW     = g.platBW;
            g.stickLen   = 0;
            g.stickAngle = 0;
            g.ninjaX     = 0;
            g.ninjaY     = 0;
            g.sceneOff   = 0;
            generatePlatB(newScore);
            forceRender();
            setPhase(PHASE.WAITING);
          }, SLIDE_MS + 60);
        } else {
          // ── DYING: ninja cae al vacío ──
          setPhase(PHASE.DYING);
          g.ninjaY = dims.h;
          forceRender();

          addTimer(() => {
            setPhase(PHASE.ENDED);
          }, DIE_MS + 100);
        }
      }, walkMs + 60);
    }, FALL_MS + 60);
  }, [phase, dims.h, forceRender, addTimer, generatePlatB, g]);

  /* ─────────── Enviar puntuación al terminar ─────────── */
  useEffect(() => {
    if (phase === PHASE.ENDED && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submit(scoreRef.current, () => {})
        .then((result) => {
          setRanking(result?.data?.ranking || []);
          setScoreMessage(result?.message || "");
        })
        .catch(() => setScoreMessage(t("svc.score_error")))
        .finally(() => setIsRankingLoading(false));
    }
    if (phase === PHASE.IDLE) {
      scoreSubmitted.current = false;
      setRanking([]);
      setScoreMessage("");
    }
  }, [phase, submit]);

  /* ─────────── Cleanup general ─────────── */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimers();
    };
  }, [clearTimers]);

  /* ─────────── CSS transitions por fase ─────────── */
  const stickTransition =
    phase === PHASE.FALLING
      ? `transform ${FALL_MS}ms ease-in`
      : phase >= PHASE.WALKING
        ? "transform 0ms"
        : "none";

  const walkMs = Math.max(200, (g.stickLen / WALK_PXS) * 1000);
  const ninjaTransition =
    phase === PHASE.WALKING
      ? `transform ${walkMs}ms linear`
      : phase === PHASE.SLIDING
        ? `transform ${SLIDE_MS}ms ease-in-out`
        : phase === PHASE.DYING
          ? `transform ${DIE_MS}ms ease-in`
          : "none";

  const sceneTransition =
    phase === PHASE.SLIDING
      ? `transform ${SLIDE_MS}ms ease-in-out`
      : "none";

  /* ─────────── Derivados de estado ─────────── */
  const isEnded = phase === PHASE.ENDED;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-zinc-900 overflow-hidden select-none"
      style={{ touchAction: isEnded || phase === PHASE.IDLE ? "auto" : "none" }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* ── Gradient overlays para UI del feed ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ── Fondo: estrellas / puntos decorativos ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white/10"
            style={{
              width: 2 + (i % 3),
              height: 2 + (i % 3),
              left: `${(i * 37 + 13) % 100}%`,
              top: `${(i * 23 + 7) % (GROUND_RATIO * 100)}%`,
            }}
          />
        ))}
      </div>

      {/* ── HUD: Score ── */}
      {phase !== PHASE.IDLE && (
        <div className="absolute top-16 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <span
            className="text-5xl font-black text-white/80 tabular-nums"
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {score}
          </span>
        </div>
      )}

      {/* ════════════════ ESCENA ════════════════ */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transition: sceneTransition,
          transform: `translateX(${-g.sceneOff}px)`,
        }}
      >
        {/* ── Suelo (relleno debajo de las plataformas) ── */}
        <div
          className="absolute bg-zinc-950"
          style={{
            left: -dims.w * 3,
            top: groundY + PLAT_HEIGHT,
            width: dims.w * 8,
            height: dims.h,
          }}
        />

        {/* ── Plataformas anteriores (historial) ── */}
        {(() => {
          let rightEdge = homeX - g.platAW;
          const items = [];
          for (let i = g.history.length - 1; i >= 0; i--) {
            const entry = g.history[i];
            const gapLeft = rightEdge - entry.gap;
            const platLeft = gapLeft - entry.platW;
            const age = g.history.length - 1 - i;
            const opacity = Math.max(0.25, 1 - age * 0.12);
            items.push(
              <div key={`h-${i}`}>
                {/* Abismo */}
                <div className="absolute bg-zinc-950" style={{
                  left: gapLeft,
                  top: groundY,
                  width: entry.gap,
                  height: PLAT_HEIGHT,
                }} />
                {/* Plataforma */}
                <div className="absolute bg-gray-700" style={{
                  left: platLeft,
                  top: groundY,
                  width: entry.platW,
                  height: PLAT_HEIGHT,
                  borderRadius: "2px 2px 0 0",
                  opacity,
                }}>
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gray-500 rounded-t-sm" />
                </div>
                {/* Puente caído */}
                <div className="absolute bg-red-500 rounded-sm" style={{
                  left: gapLeft,
                  top: groundY - STICK_W / 2,
                  width: entry.stickLen,
                  height: STICK_W,
                  opacity: opacity * 0.7,
                }} />
              </div>
            );
            rightEdge = platLeft;
          }
          /* Relleno oscuro continuo a la izquierda del historial */
          items.push(
            <div key="h-fill" className="absolute bg-zinc-950" style={{
              left: rightEdge - dims.w * 3,
              top: groundY,
              width: dims.w * 3,
              height: PLAT_HEIGHT,
            }} />
          );
          return items;
        })()}

        {/* ── Plataforma A ── */}
        <div
          className="absolute bg-gray-700"
          style={{
            left: homeX - g.platAW,
            top: groundY,
            width: g.platAW,
            height: PLAT_HEIGHT,
            borderRadius: "2px 2px 0 0",
          }}
        >
          {/* Borde superior decorativo */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gray-500 rounded-t-sm" />
        </div>

        {/* ── Plataforma B ── */}
        <div
          className="absolute bg-gray-700"
          style={{
            left: homeX + g.gap,
            top: groundY,
            width: g.platBW,
            height: PLAT_HEIGHT,
            borderRadius: "2px 2px 0 0",
          }}
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gray-500 rounded-t-sm" />
        </div>

        {/* ── Abismo (fondo oscuro entre plataformas) ── */}
        <div
          className="absolute bg-zinc-950"
          style={{
            left: homeX,
            top: groundY,
            width: g.gap,
            height: PLAT_HEIGHT,
          }}
        />
        {/* Abismo tras plataforma B */}
        <div
          className="absolute bg-zinc-950"
          style={{
            left: homeX + g.gap + g.platBW,
            top: groundY,
            width: dims.w * 2,
            height: PLAT_HEIGHT,
          }}
        />

        {/* ── Palo / Puente ── */}
        {g.stickLen > 0 && (
          <div
            className="absolute bg-red-500 rounded-sm"
            style={{
              left: homeX - STICK_W / 2,
              top: groundY - g.stickLen,
              width: STICK_W,
              height: g.stickLen,
              transformOrigin: "50% 100%",
              transition: stickTransition,
              transform: `rotate(${g.stickAngle}deg)`,
            }}
          />
        )}

        {/* ── Ninja ── */}
        <div
          className="absolute"
          style={{
            left: homeX - NINJA_W,
            top: groundY - NINJA_H,
            width: NINJA_W,
            height: NINJA_H,
            transition: ninjaTransition,
            transform: `translate(${g.ninjaX}px, ${g.ninjaY}px)`,
          }}
        >
          {/* Cuerpo */}
          <div className="absolute inset-x-0 bottom-0 h-[70%] bg-cyan-400 rounded-sm" />
          {/* Cabeza */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-cyan-300 rounded-full" />
        </div>
      </div>

      {/* ── Hint IDLE ── */}
      {phase === PHASE.IDLE && (
        <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
          <div className="flex flex-col items-center gap-3 animate-pulse">
            <img
              src="/logo-stickbridge.png"
              alt="Stick Bridge"
              className="w-16 h-16 object-contain drop-shadow-lg"
              draggable={false}
            />
            <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
              {t("stickbridge.instruction")}
            </span>
          </div>
        </div>
      )}

      {/* ── Hint WAITING ── */}
      {phase === PHASE.WAITING && (
        <div className="absolute inset-x-0 flex justify-center pointer-events-none z-3" style={{ top: groundY - 80 }}>
          <span className="text-sm font-medium text-white/25 tracking-wider uppercase animate-pulse">
            {t("stickbridge.hold")}
          </span>
        </div>
      )}

      {/* ── GAME OVER ── */}
      {isEnded && (
        <GameOverPanel
          title="Game Over"
          score={score}
          subtitle={t("stickbridge.subtitle")}
          onReplay={onReplay}
          onNext={onNextGame}
          ranking={ranking}
          scoreMessage={scoreMessage}
          isLoading={isRankingLoading}
        />
      )}
    </div>
  );
};

export default StickBridgeGame;
