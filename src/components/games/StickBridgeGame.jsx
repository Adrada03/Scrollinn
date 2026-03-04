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
const StickBridgeGame = ({ isActive, onNextGame, onReplay, userId, pinchGuardRef }) => {
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

  const { submit, loading: isSubmittingScore, xpGained, gameId } = useSubmitScore(userId, GAME_IDS.StickBridgeGame);

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
    if (phase !== PHASE.GROWING || !isActive) return;
    const tick = () => {
      g.stickLen += GROW_SPEED;
      forceRender();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, forceRender, g, isActive]);

  /* ─────────── Pointer handlers ─────────── */
  const handlePointerDown = useCallback(() => {
    if (phase !== PHASE.WAITING) return;
    if (pinchGuardRef?.current) return;               // LEY 5
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
      className="relative w-full h-full overflow-hidden select-none"
      style={{ background: "#0a0e17" }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* ── Gradient overlays para UI del feed ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ── Fondo cyberpunk: rejilla de circuito ── */}
      <div className="absolute inset-0 pointer-events-none cyber-circuit-bg opacity-50" />

      {/* ── Scanlines CRT ── */}
      <div className="absolute inset-0 pointer-events-none cyber-scanlines" />

      {/* ── Glow ambiental bajo la zona de juego ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "50%",
          top: `${GROUND_RATIO * 100 - 15}%`,
          width: "140%",
          height: "40%",
          transform: "translateX(-50%)",
          background: "radial-gradient(ellipse at center, rgba(34,211,238,0.05) 0%, rgba(168,85,247,0.03) 35%, transparent 65%)",
        }}
      />

      {/* ── Fondo: partículas neón ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 35 }).map((_, i) => {
          const colors = ["rgba(34,211,238,0.15)", "rgba(168,85,247,0.12)", "rgba(236,72,153,0.10)", "rgba(34,211,238,0.08)"];
          const color = colors[i % colors.length];
          const size = 2 + (i % 3);
          return (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: size,
                height: size,
                left: `${(i * 37 + 13) % 100}%`,
                top: `${(i * 23 + 7) % (GROUND_RATIO * 100)}%`,
                background: color,
                boxShadow: `0 0 ${size + 2}px ${color}`,
              }}
            />
          );
        })}
      </div>

      {/* ── HUD: Score ── */}
      {phase !== PHASE.IDLE && (
        <div className="absolute top-[calc(var(--sat,0px)+5.5rem)] left-0 right-0 flex justify-center z-10 pointer-events-none">
          <span
            className="text-5xl font-black text-white tabular-nums font-mono"
            style={{
              fontFeatureSettings: "'tnum'",
              textShadow: "0 0 20px rgba(34,211,238,0.6), 0 0 40px rgba(34,211,238,0.2), 0 0 60px rgba(168,85,247,0.15)",
            }}
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
          className="absolute"
          style={{
            left: -dims.w * 3,
            top: groundY + PLAT_HEIGHT,
            width: dims.w * 8,
            height: dims.h,
            background: "#050810",
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
                <div className="absolute" style={{
                  left: gapLeft,
                  top: groundY,
                  width: entry.gap,
                  height: PLAT_HEIGHT,
                  background: "#050810",
                }} />
                {/* Plataforma */}
                <div className="absolute" style={{
                  left: platLeft,
                  top: groundY,
                  width: entry.platW,
                  height: PLAT_HEIGHT,
                  borderRadius: "2px 2px 0 0",
                  opacity,
                  background: "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)",
                  border: "1px solid rgba(34,211,238,0.08)",
                  borderBottom: "none",
                }}>
                  <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-sm"
                    style={{ background: "linear-gradient(90deg, rgba(34,211,238,0.2), rgba(168,85,247,0.2))", boxShadow: "0 0 6px rgba(34,211,238,0.15)" }} />
                </div>
                {/* Puente caído */}
                <div className="absolute rounded-sm" style={{
                  left: gapLeft,
                  top: groundY - STICK_W / 2,
                  width: entry.stickLen,
                  height: STICK_W,
                  opacity: opacity * 0.7,
                  background: "linear-gradient(90deg, #ec4899, #a855f7)",
                  boxShadow: "0 0 6px rgba(236,72,153,0.2)",
                }} />
              </div>
            );
            rightEdge = platLeft;
          }
          /* Relleno oscuro continuo a la izquierda del historial */
          items.push(
            <div key="h-fill" className="absolute" style={{
              left: rightEdge - dims.w * 3,
              top: groundY,
              width: dims.w * 3,
              height: PLAT_HEIGHT,
              background: "#050810",
            }} />
          );
          return items;
        })()}

        {/* ── Plataforma A ── */}
        <div
          className="absolute"
          style={{
            left: homeX - g.platAW,
            top: groundY,
            width: g.platAW,
            height: PLAT_HEIGHT,
            borderRadius: "2px 2px 0 0",
            background: "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)",
            border: "1px solid rgba(34,211,238,0.1)",
            borderBottom: "none",
          }}
        >
          {/* Borde superior neón */}
          <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-sm"
            style={{ background: "linear-gradient(90deg, #22d3ee, #a855f7)", boxShadow: "0 0 8px rgba(34,211,238,0.4), 0 0 20px rgba(34,211,238,0.15)" }} />
          {/* Marcas internas decorativas */}
          <div className="absolute top-3 left-0 right-0 h-px" style={{ background: "rgba(34,211,238,0.04)" }} />
          <div className="absolute top-6 left-0 right-0 h-px" style={{ background: "rgba(34,211,238,0.02)" }} />
        </div>

        {/* ── Plataforma B ── */}
        <div
          className="absolute"
          style={{
            left: homeX + g.gap,
            top: groundY,
            width: g.platBW,
            height: PLAT_HEIGHT,
            borderRadius: "2px 2px 0 0",
            background: "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)",
            border: "1px solid rgba(34,211,238,0.1)",
            borderBottom: "none",
          }}
        >
          <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-sm"
            style={{ background: "linear-gradient(90deg, #22d3ee, #a855f7)", boxShadow: "0 0 8px rgba(34,211,238,0.4), 0 0 20px rgba(34,211,238,0.15)" }} />
          <div className="absolute top-3 left-0 right-0 h-px" style={{ background: "rgba(34,211,238,0.04)" }} />
          <div className="absolute top-6 left-0 right-0 h-px" style={{ background: "rgba(34,211,238,0.02)" }} />
        </div>

        {/* ── Abismo (fondo oscuro entre plataformas) ── */}
        <div
          className="absolute"
          style={{
            left: homeX,
            top: groundY,
            width: g.gap,
            height: PLAT_HEIGHT,
            background: "#050810",
          }}
        />
        {/* Abismo tras plataforma B */}
        <div
          className="absolute"
          style={{
            left: homeX + g.gap + g.platBW,
            top: groundY,
            width: dims.w * 2,
            height: PLAT_HEIGHT,
            background: "#050810",
          }}
        />

        {/* ── Palo / Puente — neón magenta→púrpura con glow ── */}
        {g.stickLen > 0 && (
          <div
            className="absolute rounded-sm"
            style={{
              left: homeX - STICK_W / 2,
              top: groundY - g.stickLen,
              width: STICK_W,
              height: g.stickLen,
              transformOrigin: "50% 100%",
              transition: stickTransition,
              transform: `rotate(${g.stickAngle}deg)`,
              background: "linear-gradient(180deg, #ec4899, #a855f7)",
              boxShadow: "0 0 10px rgba(236,72,153,0.6), 0 0 25px rgba(168,85,247,0.3), 0 0 4px rgba(236,72,153,0.8)",
            }}
          />
        )}

        {/* ── Ninja — neón cian con glow ── */}
        <div
          className="absolute"
          style={{
            left: homeX - NINJA_W,
            top: groundY - NINJA_H,
            width: NINJA_W,
            height: NINJA_H,
            transition: ninjaTransition,
            transform: `translate(${g.ninjaX}px, ${g.ninjaY}px)`,
            filter: "drop-shadow(0 0 6px rgba(34,211,238,0.6)) drop-shadow(0 0 14px rgba(34,211,238,0.25))",
          }}
        >
          {/* Cuerpo */}
          <div className="absolute inset-x-0 bottom-0 h-[70%] rounded-sm"
            style={{ background: "linear-gradient(180deg, #22d3ee, #06b6d4)", border: "1px solid rgba(34,211,238,0.4)" }} />
          {/* Cabeza */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full"
            style={{ background: "#67e8f9", boxShadow: "0 0 6px rgba(34,211,238,0.8)" }} />
        </div>
      </div>

      {/* ── Hint IDLE ── */}
      {phase === PHASE.IDLE && (
        <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
          <div className="flex flex-col items-center gap-3 animate-pulse">
            <img
              src="/logo-stickbridge.png"
              alt="Stick Bridge"
              className="w-16 h-16 object-contain"
              style={{ filter: "drop-shadow(0 0 12px rgba(34,211,238,0.5)) drop-shadow(0 0 24px rgba(168,85,247,0.3))" }}
              draggable={false}
            />
            <span
              className="text-xs font-bold font-mono text-cyan-300/70 bg-cyan-400/5 backdrop-blur-sm px-4 py-2 rounded-xl tracking-wider uppercase"
              style={{
                border: "1px solid rgba(34,211,238,0.15)",
                textShadow: "0 0 8px rgba(34,211,238,0.4)",
              }}
            >
              {t("stickbridge.instruction")}
            </span>
          </div>
        </div>
      )}

      {/* ── Hint WAITING ── */}
      {phase === PHASE.WAITING && (
        <div className="absolute inset-x-0 flex justify-center pointer-events-none z-3" style={{ top: groundY - 80 }}>
          <span
            className="text-sm font-mono font-medium text-cyan-400/30 tracking-wider uppercase animate-pulse"
            style={{ textShadow: "0 0 10px rgba(34,211,238,0.2)" }}
          >
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
          xpGained={xpGained}
          gameId={gameId}

          isLoading={isRankingLoading}
        />
      )}
    </div>
  );
};

export default StickBridgeGame;
