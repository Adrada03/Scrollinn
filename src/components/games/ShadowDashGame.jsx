/**
 * ShadowDashGame.jsx — "Shadow Dash"
 *
 * Endless Runner Vertical — mecánica "Escondite Inglés" (Red Light, Green Light)
 * con estética CYBERPUNK STEALTH.
 *
 * - Mantén pulsado para correr (suma metros, rellena la Barra de Pánico).
 * - Suelta para esconderte bajo un escudo holográfico.
 * - El Ojo Robótico alterna: ASLEEP → WARNING (0.4s) → AWAKE.
 * - Si corres con el ojo AWAKE → Game Over.
 * - La Barra de Pánico se vacía constantemente. 0 = Game Over.
 * - TODO usa requestAnimationFrame + deltaTime.
 *
 * Props:
 *   isActive   – cuando pasa a true, arranca el juego
 *   onNextGame – callback para "siguiente juego"
 *   onReplay   – callback para reiniciar
 *   userId     – ID del usuario logueado
 *   onScrollLock – bloquear/desbloquear scroll del feed
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Eye, EyeOff, AlertTriangle, Shield } from "lucide-react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ═══════════════════ CONSTANTES ═══════════════════ */
const STATES = { IDLE: "idle", PLAYING: "playing", DYING: "dying", ENDED: "ended" };

const GUARD = {
  ASLEEP: "asleep",
  WARNING: "warning",
  AWAKE: "awake",
};

// Barra de pánico
const PANIC_MAX = 100;
const PANIC_DRAIN_BASE = 6;       // drenaje lento al inicio
const PANIC_FILL_BASE = 18;       // recuperación moderada al inicio

// Velocidad base metros/s
const BASE_SPEED = 12;
const SPEED_ACCEL = 0.008;

// Guardia tiempos base — SIEMPRE pasa por WARNING antes de AWAKE
const ASLEEP_MIN_BASE = 2.0;
const ASLEEP_MAX_BASE = 6.0;
const WARNING_MIN_BASE = 0.9;
const WARNING_MAX_BASE = 1.6;
const AWAKE_MIN_BASE = 0.8;
const AWAKE_MAX_BASE = 2.5;

// Dificultad progresiva — cada DIFFICULTY_STEP metros sube un tier
const DIFFICULTY_STEP = 120;

// Área de juego max
const GAME_MAX_W = 450;

/* ═══════════════════ HELPERS ═══════════════════ */
const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
const randRange = (a, b) => a + Math.random() * (b - a);

/* ═══════════════════ COMPONENT ═══════════════════ */
const ShadowDashGame = ({ isActive, onNextGame, onReplay, userId, onScrollLock, pinchGuardRef }) => {
  const { t } = useLanguage();
  const [gameState, setGameState] = useState(STATES.IDLE);
  const [score, setScore] = useState(0);
  const [panic, setPanic] = useState(PANIC_MAX);
  const [guardPhase, setGuardPhase] = useState(GUARD.ASLEEP);
  const [isRunning, setIsRunning] = useState(false);
  const [flashRed, setFlashRed] = useState(false);
  const [deathCause, setDeathCause] = useState(null); // "eye" | "panic"
  const [showGameOver, setShowGameOver] = useState(false);
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const [bgOffset, setBgOffset] = useState(0);

  const scoreSubmitted = useRef(false);
  const { submit, xpGained } = useSubmitScore(userId, GAME_IDS.ShadowDashGame);

  // Refs para el game loop
  const gameStateRef = useRef(STATES.IDLE);
  const scoreRef = useRef(0);
  const panicRef = useRef(PANIC_MAX);
  const guardRef = useRef(GUARD.ASLEEP);
  const guardTimerRef = useRef(0);     // tiempo restante en fase actual
  const isRunningRef = useRef(false);
  const rafRef = useRef(null);
  const prevTimeRef = useRef(null);
  const bgOffsetRef = useRef(0);
  const scrollLockTORef = useRef(null);
  const deathTimerRef = useRef(null);
  // No drenar pánico hasta que el jugador corra por primera vez
  const hasStartedRunningRef = useRef(false);

  /* ── Calcular dificultad basada en score ── */
  const getDifficulty = useCallback((s) => {
    const tier = Math.floor(s / DIFFICULTY_STEP);
    return {
      // Sueño se acorta gradualmente
      asleepMin: Math.max(0.5, ASLEEP_MIN_BASE - tier * 0.1),
      asleepMax: Math.max(1.2, ASLEEP_MAX_BASE - tier * 0.25),
      // WARNING siempre existe, se acorta suavemente
      warningMin: Math.max(0.25, WARNING_MIN_BASE - tier * 0.04),
      warningMax: Math.max(0.4, WARNING_MAX_BASE - tier * 0.06),
      // AWAKE crece un poco → menos ventana para correr
      awakeMin: Math.min(2.5, AWAKE_MIN_BASE + tier * 0.08),
      awakeMax: Math.min(4.5, AWAKE_MAX_BASE + tier * 0.15),
      // El drenaje sube suave
      panicDrain: PANIC_DRAIN_BASE + tier * 0.6,
      // Recuperación baja gradualmente, pero SIEMPRE recarga más que el drain
      panicFill: Math.max(PANIC_DRAIN_BASE + tier * 0.6 + 4, PANIC_FILL_BASE - tier * 0.8),
    };
  }, []);

  /* ── Elegir siguiente fase del guardia ── */
  // SIEMPRE: ASLEEP → WARNING → AWAKE → ASLEEP (nunca salta WARNING)
  const nextGuardPhase = useCallback((currentPhase, currentScore) => {
    const diff = getDifficulty(currentScore);
    switch (currentPhase) {
      case GUARD.ASLEEP:
        // Siempre pasa por WARNING antes de despertar
        return { phase: GUARD.WARNING, duration: randRange(diff.warningMin, diff.warningMax) };
      case GUARD.WARNING:
        return { phase: GUARD.AWAKE, duration: randRange(diff.awakeMin, diff.awakeMax) };
      case GUARD.AWAKE:
        return { phase: GUARD.ASLEEP, duration: randRange(diff.asleepMin, diff.asleepMax) };
      default:
        return { phase: GUARD.ASLEEP, duration: randRange(diff.asleepMin, diff.asleepMax) };
    }
  }, [getDifficulty]);

  /* ── End game ── */
  const endGame = useCallback((cause) => {
    gameStateRef.current = STATES.DYING;
    setDeathCause(cause);
    setGameState(STATES.DYING);
    setFlashRed(true);
    setTimeout(() => setFlashRed(false), 500);

    // Mostrar splash de muerte 1.5s, luego pasar a ENDED con GameOverPanel
    deathTimerRef.current = setTimeout(() => {
      gameStateRef.current = STATES.ENDED;
      setGameState(STATES.ENDED);
      setShowGameOver(true);
      scrollLockTORef.current = setTimeout(() => onScrollLock?.(false), 2000);
    }, 1500);
  }, [onScrollLock]);

  /* ── Game loop (rAF) ── */
  const gameLoop = useCallback((timestamp) => {
    if (gameStateRef.current !== STATES.PLAYING) return;

    if (!prevTimeRef.current) prevTimeRef.current = timestamp;
    const dt = Math.min((timestamp - prevTimeRef.current) / 1000, 0.1); // cap a 100ms
    prevTimeRef.current = timestamp;

    const running = isRunningRef.current;
    const currentScore = scoreRef.current;
    const diff = getDifficulty(currentScore);

    // ── 1. Actualizar guardia ──
    guardTimerRef.current -= dt;
    if (guardTimerRef.current <= 0) {
      const prev = guardRef.current;
      const next = nextGuardPhase(prev, currentScore);
      guardRef.current = next.phase;
      guardTimerRef.current = next.duration;
      setGuardPhase(next.phase);
    }

    // ── 2. Comprobar muerte por guardia ──
    if (guardRef.current === GUARD.AWAKE && running) {
      endGame("eye");
      rafRef.current = null;
      return;
    }

    // ── 3. Actualizar pánico ──
    // El pánico solo empieza a drenar después de la primera vez que corres
    if (running) hasStartedRunningRef.current = true;

    if (hasStartedRunningRef.current) {
      panicRef.current -= diff.panicDrain * dt;
    }
    if (running) {
      panicRef.current += diff.panicFill * dt;
    }
    panicRef.current = clamp(panicRef.current, 0, PANIC_MAX);

    if (panicRef.current <= 0) {
      endGame("panic");
      rafRef.current = null;
      return;
    }

    // ── 4. Actualizar score (solo corriendo) ──
    if (running) {
      const speed = BASE_SPEED + currentScore * SPEED_ACCEL;
      scoreRef.current += speed * dt;
      // Mover fondo (multiplicador alto para que visualmente corra rápido)
      bgOffsetRef.current += speed * dt * 12;
    }

    // ── 5. Sincronizar estado React (throttled via rAF) ──
    setScore(Math.floor(scoreRef.current));
    setPanic(panicRef.current);
    setBgOffset(bgOffsetRef.current);

    rafRef.current = requestAnimationFrame(gameLoop);
  }, [getDifficulty, nextGuardPhase, endGame]);

  /* ── Arrancar partida ── */
  const startGame = useCallback(() => {
    scoreRef.current = 0;
    panicRef.current = PANIC_MAX;
    guardRef.current = GUARD.ASLEEP;
    const diff = getDifficulty(0);
    guardTimerRef.current = randRange(diff.asleepMin, diff.asleepMax);
    isRunningRef.current = false;
    gameStateRef.current = STATES.PLAYING;
    prevTimeRef.current = null;
    bgOffsetRef.current = 0;
    hasStartedRunningRef.current = false;

    setScore(0);
    setPanic(PANIC_MAX);
    setGuardPhase(GUARD.ASLEEP);
    setIsRunning(false);
    setGameState(STATES.PLAYING);
    setFlashRed(false);
    setBgOffset(0);
    setDeathCause(null);
    setShowGameOver(false);
    clearTimeout(deathTimerRef.current);

    clearTimeout(scrollLockTORef.current);
    onScrollLock?.(true);

    rafRef.current = requestAnimationFrame(gameLoop);
  }, [getDifficulty, gameLoop, onScrollLock]);

  /* ── Auto-start ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, startGame, gameState]);

  /* ── Cleanup ── */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(scrollLockTORef.current);
      clearTimeout(deathTimerRef.current);
      onScrollLock?.(false);
    };
  }, []);

  /* ── Pointer handlers ── */
  const handlePointerDown = useCallback(() => {
    if (gameStateRef.current !== STATES.PLAYING) return;
    if (pinchGuardRef?.current) return;               // LEY 5
    isRunningRef.current = true;
    setIsRunning(true);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (gameStateRef.current !== STATES.PLAYING) return;
    isRunningRef.current = false;
    setIsRunning(false);
  }, []);

  /* ── Submit score ── */
  const isEnded = gameState === STATES.ENDED;
  const isDying = gameState === STATES.DYING;

  useEffect(() => {
    // Submit during DYING so ranking is ready when GameOverPanel shows
    if ((isDying || isEnded) && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      const finalScore = Math.floor(scoreRef.current);
      submit(finalScore, () => {})
        .then((result) => {
          setRanking(result?.data?.ranking || []);
          setScoreMessage(result?.message || "");
        })
        .catch(() => setScoreMessage(t("svc.score_error")))
        .finally(() => setIsRankingLoading(false));
    }
    if (gameState === STATES.IDLE) {
      scoreSubmitted.current = false;
      setRanking([]);
      setScoreMessage("");
    }
  }, [isDying, isEnded, gameState, submit, t]);

  /* ═══════════════════════════════════════════════════════
     DERIVADOS VISUALES — CYBERPUNK STEALTH
     ═══════════════════════════════════════════════════════ */
  const isPlaying = gameState === STATES.PLAYING;
  const isAlive = isPlaying; // for visual elements that should hide on death
  const panicPct = panic / PANIC_MAX;
  const panicLow = panicPct < 0.2;

  // Barra gradiente dinámico
  const barGrad =
    panicPct > 0.5
      ? "linear-gradient(90deg, #06b6d4, #22d3ee)"
      : panicPct > 0.25
        ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
        : "linear-gradient(90deg, #ef4444, #f87171)";

  const barGlow =
    panicPct > 0.5
      ? "0 0 12px rgba(34,211,238,0.5), 0 0 24px rgba(34,211,238,0.25)"
      : panicPct > 0.25
        ? "0 0 12px rgba(251,191,36,0.4), 0 0 24px rgba(251,191,36,0.2)"
        : "0 0 12px rgba(239,68,68,0.6), 0 0 24px rgba(239,68,68,0.3)";

  // Bobbing
  const bobY = isRunning && isPlaying ? Math.sin(bgOffset * 0.18) * 5 : 0;

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <div
      className="relative h-full w-full flex items-center justify-center overflow-hidden select-none"
      style={{
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        background: "linear-gradient(180deg, #020617 0%, #0f172a 40%, #020617 100%)",
      }}
      onPointerDown={isPlaying ? handlePointerDown : undefined}
      onPointerUp={isPlaying ? handlePointerUp : undefined}
      onPointerLeave={isPlaying ? handlePointerUp : undefined}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ═══ GAME AREA — max 450px centered ═══ */}
      <div
        className="relative h-full w-full flex flex-col"
        style={{ maxWidth: `${GAME_MAX_W}px` }}
      >

        {/* ───────── CYBERPUNK FLOOR GRID ───────── */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: isRunning ? 0.35 : 0.12,
            transition: "opacity 0.2s",
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent 0px, transparent 46px, rgba(34,211,238,0.18) 46px, rgba(34,211,238,0.18) 48px)",
            backgroundPositionY: `${bgOffset % 48}px`,
          }}
        />
        {[15, 30, 50, 70, 85].map((pct) => (
          <div
            key={pct}
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${pct}%`,
              width: "1px",
              opacity: isRunning ? 0.2 : 0.06,
              transition: "opacity 0.2s",
              backgroundImage:
                "repeating-linear-gradient(180deg, transparent 0px, transparent 30px, rgba(34,211,238,0.13) 30px, rgba(34,211,238,0.13) 32px)",
              backgroundPositionY: `${bgOffset % 32}px`,
            }}
          />
        ))}
        <div
          className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 pointer-events-none"
          style={{
            width: "2px",
            opacity: isRunning ? 0.45 : 0.1,
            transition: "opacity 0.25s",
            backgroundImage:
              "repeating-linear-gradient(180deg, rgba(34,211,238,0.5) 0px, rgba(34,211,238,0.5) 14px, transparent 14px, transparent 28px)",
            backgroundPositionY: `${bgOffset % 28}px`,
            boxShadow: isRunning ? "0 0 6px rgba(34,211,238,0.3)" : "none",
          }}
        />

        {/* ───────── AWAKE LASER SCANNER ───────── */}
        {guardPhase === GUARD.AWAKE && isPlaying && (
          <div
            className="absolute top-0 left-0 right-0 pointer-events-none z-4"
            style={{
              height: "60%",
              background:
                "linear-gradient(180deg, rgba(239,68,68,0.25) 0%, rgba(239,68,68,0.08) 40%, transparent 100%)",
              animation: "sd-scanner 0.6s ease-in-out infinite alternate",
            }}
          />
        )}

        {/* ───────── WARNING ambient pulse ───────── */}
        {guardPhase === GUARD.WARNING && isPlaying && (
          <div
            className="absolute inset-0 pointer-events-none z-4"
            style={{
              background:
                "radial-gradient(ellipse at 50% 15%, rgba(251,191,36,0.12) 0%, transparent 60%)",
              animation: "sd-warn-pulse 0.2s ease-in-out infinite alternate",
            }}
          />
        )}

        {/* ───────── FEED OVERLAY GRADIENTS ───────── */}
        <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
        <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
        <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

        {/* ───────── GAME OVER FLASH + GLITCH ───────── */}
        {flashRed && (
          <>
            <div
              className="absolute inset-0 z-40 pointer-events-none"
              style={{ animation: "sd-flash 0.5s ease-out forwards" }}
            />
            <div
              className="absolute inset-0 z-40 pointer-events-none"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(239,68,68,0.08) 2px, rgba(239,68,68,0.08) 4px)",
                animation: "sd-glitch 0.5s steps(8) forwards",
              }}
            />
          </>
        )}

        {/* ═══════════════════════════════════════════
            HUD — CYBERPUNK TENSION UI
            ═══════════════════════════════════════════ */}
        {gameState !== STATES.IDLE && (
          <div className="absolute top-13 left-4 right-4 z-10 flex flex-col items-center gap-2.5">
            {/* Score */}
            <div className="flex items-baseline gap-1.5">
              <span
                className="text-5xl font-black italic text-white leading-none tracking-tight"
                style={{
                  fontFeatureSettings: "'tnum'",
                  textShadow:
                    "0 0 20px rgba(34,211,238,0.3), 0 2px 12px rgba(0,0,0,0.6)",
                }}
              >
                {score}
              </span>
              <span
                className="text-lg font-bold italic text-cyan-400/60 uppercase"
                style={{ textShadow: "0 0 8px rgba(34,211,238,0.2)" }}
              >
                m
              </span>
            </div>

            {/* Panic Bar */}
            <div className="w-full flex flex-col gap-1">
              {/* Label row */}
              <div className="flex justify-between items-center px-0.5">
                <span
                  className="text-[0.6rem] font-bold uppercase tracking-[0.15em]"
                  style={{ color: "rgba(34,211,238,0.5)" }}
                >
                  {t("shadowdash.panic")}
                </span>
                <span
                  className="text-[0.6rem] font-bold tabular-nums uppercase tracking-wider"
                  style={{
                    fontFeatureSettings: "'tnum'",
                    color: panicPct > 0.5 ? "rgba(34,211,238,0.7)" : panicPct > 0.25 ? "rgba(251,191,36,0.8)" : "rgba(239,68,68,0.9)",
                    animation: panicLow ? "sd-bar-blink 0.3s ease-in-out infinite" : "none",
                  }}
                >
                  {Math.round(panicPct * 100)}%
                </span>
              </div>
              {/* Bar container */}
              <div
                className="relative w-full overflow-hidden"
                style={{
                  height: "18px",
                  borderRadius: "4px",
                  background: "rgba(15,23,42,0.85)",
                  border: `1px solid ${panicPct > 0.5 ? "rgba(34,211,238,0.2)" : panicPct > 0.25 ? "rgba(251,191,36,0.25)" : "rgba(239,68,68,0.35)"}`,
                  boxShadow: `inset 0 2px 6px rgba(0,0,0,0.6), ${panicLow ? "0 0 8px rgba(239,68,68,0.25)" : "0 0 4px rgba(34,211,238,0.08)"}`,
                  transition: "border-color 0.3s, box-shadow 0.3s",
                }}
              >
                {/* Fill bar */}
                <div
                  className="absolute top-0 left-0 bottom-0"
                  style={{
                    width: `${panicPct * 100}%`,
                    background: barGrad,
                    boxShadow: barGlow,
                    borderRadius: "3px",
                    animation: panicLow ? "sd-bar-blink 0.3s ease-in-out infinite" : "none",
                  }}
                />
                {/* Segmented notches (10 segments) */}
                {Array.from({ length: 9 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 pointer-events-none"
                    style={{
                      left: `${(i + 1) * 10}%`,
                      width: "2px",
                      background: "rgba(2,6,23,0.6)",
                      zIndex: 2,
                    }}
                  />
                ))}
                {/* Top shine */}
                <div
                  className="absolute top-0 left-0 right-0 pointer-events-none"
                  style={{
                    height: "40%",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 100%)",
                    borderRadius: "4px 4px 0 0",
                    zIndex: 3,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            THE EYE — ROBOTIC GUARDIAN
            ═══════════════════════════════════════════ */}
        {isPlaying && (
          <div className="absolute top-32 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
            <div
              className="relative flex items-center justify-center"
              style={{
                width: guardPhase === GUARD.WARNING ? "96px" : "80px",
                height: guardPhase === GUARD.WARNING ? "96px" : "80px",
                transition: "width 0.15s, height 0.15s",
              }}
            >
              {/* Ring glow */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  border:
                    guardPhase === GUARD.ASLEEP
                      ? "2px solid rgba(100,116,139,0.3)"
                      : guardPhase === GUARD.WARNING
                        ? "2px solid rgba(251,191,36,0.7)"
                        : "2px solid rgba(239,68,68,0.6)",
                  boxShadow:
                    guardPhase === GUARD.ASLEEP
                      ? "0 0 15px rgba(100,116,139,0.1), inset 0 0 10px rgba(100,116,139,0.05)"
                      : guardPhase === GUARD.WARNING
                        ? "0 0 25px rgba(251,191,36,0.5), 0 0 50px rgba(251,191,36,0.2), inset 0 0 15px rgba(251,191,36,0.1)"
                        : "0 0 30px rgba(239,68,68,0.5), 0 0 60px rgba(239,68,68,0.25), inset 0 0 20px rgba(239,68,68,0.1)",
                  animation:
                    guardPhase === GUARD.AWAKE
                      ? "sd-eye-ring-pulse 0.5s ease-in-out infinite"
                      : guardPhase === GUARD.WARNING
                        ? "sd-eye-ring-pulse 0.15s ease-in-out infinite"
                        : "none",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
              />
              {/* Inner bg */}
              <div
                className="absolute rounded-full"
                style={{
                  inset: "6px",
                  background:
                    guardPhase === GUARD.ASLEEP
                      ? "radial-gradient(circle, rgba(51,65,85,0.4) 0%, rgba(15,23,42,0.8) 100%)"
                      : guardPhase === GUARD.WARNING
                        ? "radial-gradient(circle, rgba(251,191,36,0.15) 0%, rgba(15,23,42,0.8) 100%)"
                        : "radial-gradient(circle, rgba(239,68,68,0.2) 0%, rgba(15,23,42,0.8) 100%)",
                  transition: "background 0.15s",
                }}
              />
              {/* Icon */}
              <div className="relative z-2">
                {guardPhase === GUARD.ASLEEP && (
                  <EyeOff
                    className="text-slate-500"
                    style={{
                      width: 36, height: 36,
                      filter: "drop-shadow(0 0 6px rgba(100,116,139,0.3))",
                    }}
                  />
                )}
                {guardPhase === GUARD.WARNING && (
                  <AlertTriangle
                    style={{
                      width: 40, height: 40,
                      color: "#fbbf24",
                      filter: "drop-shadow(0 0 20px rgba(251,191,36,1)) drop-shadow(0 0 40px rgba(251,191,36,0.5))",
                      animation: "sd-warn-shake 0.08s infinite",
                    }}
                  />
                )}
                {guardPhase === GUARD.AWAKE && (
                  <Eye
                    style={{
                      width: 38, height: 38,
                      color: "#ef4444",
                      filter: "drop-shadow(0 0 15px rgba(239,68,68,0.9)) drop-shadow(0 0 30px rgba(239,68,68,0.4))",
                      animation: "sd-eye-pulse 0.4s ease-in-out infinite",
                    }}
                  />
                )}
              </div>
            </div>
            {/* Label */}
            <span
              className="text-[0.6rem] font-bold uppercase tracking-[0.2em]"
              style={{
                color:
                  guardPhase === GUARD.ASLEEP
                    ? "rgba(100,116,139,0.5)"
                    : guardPhase === GUARD.WARNING
                      ? "rgba(251,191,36,0.9)"
                      : "rgba(239,68,68,0.9)",
                textShadow:
                  guardPhase === GUARD.ASLEEP
                    ? "none"
                    : guardPhase === GUARD.WARNING
                      ? "0 0 10px rgba(251,191,36,0.5)"
                      : "0 0 10px rgba(239,68,68,0.5)",
                animation:
                  guardPhase === GUARD.AWAKE ? "sd-bar-blink 0.4s ease-in-out infinite" : "none",
              }}
            >
              {guardPhase === GUARD.ASLEEP && t("shadowdash.asleep")}
              {guardPhase === GUARD.WARNING && t("shadowdash.warning")}
              {guardPhase === GUARD.AWAKE && t("shadowdash.watching")}
            </span>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            THE PLAYER — NEON DASH / STEALTH SHIELD
            ═══════════════════════════════════════════ */}
        {isPlaying && (
          <div
            className="absolute bottom-32 left-1/2 z-10 flex flex-col items-center gap-2"
            style={{ transform: `translateX(-50%) translateY(${bobY}px)` }}
          >
            {isRunning ? (
              /* Running: Neon Diamond */
              <div className="relative flex items-center justify-center">
                {/* Outer glow */}
                <div
                  className="absolute"
                  style={{
                    width: 72, height: 72,
                    background: "radial-gradient(circle, rgba(34,211,238,0.2) 0%, transparent 70%)",
                    animation: "sd-runner-glow 0.3s ease-in-out infinite alternate",
                  }}
                />
                {/* Diamond */}
                <div
                  style={{
                    width: 44, height: 44,
                    background: "linear-gradient(135deg, #06b6d4, #22d3ee, #67e8f9)",
                    transform: "rotate(45deg)",
                    borderRadius: "6px",
                    boxShadow:
                      "0 0 15px rgba(34,211,238,0.8), 0 0 30px rgba(34,211,238,0.4), 0 0 60px rgba(34,211,238,0.15), inset 0 0 12px rgba(255,255,255,0.2)",
                    animation: "sd-runner-vibrate 0.06s infinite alternate",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute", inset: 8,
                      background: "rgba(255,255,255,0.25)",
                      borderRadius: "3px",
                    }}
                  />
                </div>
                {/* Speed trail */}
                <div
                  className="absolute"
                  style={{
                    width: 20, height: 40, bottom: -18, left: "50%",
                    transform: "translateX(-50%)",
                    background: "linear-gradient(180deg, rgba(34,211,238,0.3) 0%, transparent 100%)",
                    filter: "blur(4px)",
                    animation: "sd-trail-flicker 0.15s infinite alternate",
                  }}
                />
              </div>
            ) : (
              /* Hidden: Holographic Shield */
              <div className="relative flex items-center justify-center">
                <div
                  style={{
                    width: 52, height: 52,
                    borderRadius: "10px",
                    border: "2px solid rgba(34,211,238,0.35)",
                    background: "rgba(8,145,178,0.12)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    boxShadow:
                      "0 0 10px rgba(34,211,238,0.15), inset 0 0 15px rgba(34,211,238,0.05)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Shield
                    style={{
                      width: 26, height: 26,
                      color: "rgba(34,211,238,0.45)",
                      filter: "drop-shadow(0 0 4px rgba(34,211,238,0.3))",
                    }}
                  />
                </div>
                {/* Holo scan line */}
                <div
                  className="absolute inset-0 rounded-[10px] overflow-hidden pointer-events-none"
                  style={{ width: 52, height: 52 }}
                >
                  <div
                    style={{
                      position: "absolute", left: 0, right: 0,
                      height: "2px",
                      background: "rgba(34,211,238,0.2)",
                      animation: "sd-holo-scan 1.5s linear infinite",
                    }}
                  />
                </div>
              </div>
            )}
            {/* State label */}
            <span
              className="text-[0.55rem] font-bold uppercase tracking-[0.2em]"
              style={{
                color: isRunning ? "rgba(34,211,238,0.7)" : "rgba(34,211,238,0.3)",
                textShadow: isRunning ? "0 0 8px rgba(34,211,238,0.4)" : "none",
              }}
            >
              {isRunning ? t("shadowdash.running") : t("shadowdash.hidden")}
            </span>
          </div>
        )}

        {/* ───────── CONTROL HINT ───────── */}
        {isPlaying && score === 0 && !isRunning && (
          <div className="absolute bottom-52 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <span
              className="text-xs font-semibold tracking-wide"
              style={{
                color: "rgba(34,211,238,0.5)",
                textShadow: "0 0 8px rgba(34,211,238,0.2)",
                animation: "sd-bar-blink 1.2s ease-in-out infinite",
              }}
            >
              {t("shadowdash.hold_to_run")}
            </span>
          </div>
        )}

        {/* ───────── DEATH SPLASH — EYE CAUGHT YOU ───────── */}
        {isDying && deathCause === "eye" && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none">
            {/* Radial red pulse bg */}
            <div
              className="absolute inset-0"
              style={{
                background: "radial-gradient(circle at 50% 40%, rgba(239,68,68,0.3) 0%, rgba(0,0,0,0.85) 70%)",
                animation: "sd-death-bg 1.5s ease-out forwards",
              }}
            />
            {/* Big eye */}
            <div
              className="relative"
              style={{ animation: "sd-death-eye-in 0.4s cubic-bezier(0.16,1,0.3,1) forwards" }}
            >
              <div
                className="flex items-center justify-center"
                style={{
                  width: 140, height: 140,
                  borderRadius: "50%",
                  border: "3px solid rgba(239,68,68,0.7)",
                  background: "radial-gradient(circle, rgba(239,68,68,0.15) 0%, rgba(15,23,42,0.9) 100%)",
                  boxShadow: "0 0 60px rgba(239,68,68,0.5), 0 0 120px rgba(239,68,68,0.2), inset 0 0 30px rgba(239,68,68,0.1)",
                  animation: "sd-death-eye-pulse 0.5s ease-in-out infinite alternate",
                }}
              >
                <Eye
                  style={{
                    width: 70, height: 70,
                    color: "#ef4444",
                    filter: "drop-shadow(0 0 20px rgba(239,68,68,1)) drop-shadow(0 0 40px rgba(239,68,68,0.6))",
                  }}
                />
              </div>
            </div>
            {/* Text */}
            <span
              className="mt-6 text-2xl font-black uppercase tracking-widest"
              style={{
                color: "#ef4444",
                textShadow: "0 0 20px rgba(239,68,68,0.8), 0 0 40px rgba(239,68,68,0.4)",
                animation: "sd-death-text-in 0.5s 0.2s ease-out both",
              }}
            >
              {t("shadowdash.death_eye")}
            </span>
          </div>
        )}

        {/* ───────── DEATH SPLASH — PANIC DEPLETED ───────── */}
        {isDying && deathCause === "panic" && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none">
            {/* Dark fade bg */}
            <div
              className="absolute inset-0"
              style={{
                background: "radial-gradient(circle at 50% 50%, rgba(34,211,238,0.08) 0%, rgba(0,0,0,0.9) 60%)",
                animation: "sd-death-bg 1.5s ease-out forwards",
              }}
            />
            {/* Shattered bar icon */}
            <div
              style={{ animation: "sd-death-panic-in 0.5s cubic-bezier(0.16,1,0.3,1) forwards" }}
            >
              {/* Empty bar frame */}
              <div
                style={{
                  width: 200, height: 28,
                  borderRadius: "6px",
                  border: "2px solid rgba(239,68,68,0.5)",
                  background: "rgba(15,23,42,0.8)",
                  boxShadow: "0 0 30px rgba(239,68,68,0.3), inset 0 0 15px rgba(0,0,0,0.5)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Flickering remnant */}
                <div
                  style={{
                    position: "absolute", top: 0, left: 0, bottom: 0,
                    width: "8%",
                    background: "linear-gradient(90deg, #ef4444, #f87171)",
                    borderRadius: "4px",
                    animation: "sd-bar-blink 0.15s ease-in-out infinite",
                  }}
                />
                {/* Crack lines */}
                {[30, 55, 75].map((pct) => (
                  <div
                    key={pct}
                    style={{
                      position: "absolute", top: "-4px", bottom: "-4px",
                      left: `${pct}%`, width: "2px",
                      background: "rgba(239,68,68,0.6)",
                      transform: `rotate(${(pct % 2 === 0 ? 1 : -1) * 8}deg)`,
                      boxShadow: "0 0 6px rgba(239,68,68,0.4)",
                    }}
                  />
                ))}
              </div>
            </div>
            {/* Text */}
            <span
              className="mt-6 text-2xl font-black uppercase tracking-widest"
              style={{
                color: "#ef4444",
                textShadow: "0 0 20px rgba(239,68,68,0.8), 0 0 40px rgba(239,68,68,0.4)",
                animation: "sd-death-text-in 0.5s 0.2s ease-out both",
              }}
            >
              {t("shadowdash.death_panic")}
            </span>
          </div>
        )}

        {/* ───────── GAME OVER ───────── */}
        {isEnded && showGameOver && (
          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-auto">
            <GameOverPanel
              title={deathCause === "eye" ? t("shadowdash.death_eye") : t("shadowdash.death_panic")}
              score={score}
              subtitle={t("shadowdash.subtitle")}
              onReplay={onReplay}
              onNext={onNextGame}
              ranking={ranking}
              scoreMessage={scoreMessage}
              xpGained={xpGained}

              isLoading={isRankingLoading}
            />
          </div>
        )}
      </div>

      {/* ═══════════════════ CSS KEYFRAMES ═══════════════════ */}
      <style>{`
        @keyframes sd-flash {
          0%   { background: rgba(239,68,68,0.5); }
          30%  { background: rgba(239,68,68,0.3); }
          60%  { background: rgba(239,68,68,0.15); }
          100% { background: transparent; }
        }
        @keyframes sd-glitch {
          0%   { opacity: 0.8; transform: translateX(0); }
          12%  { opacity: 0.6; transform: translateX(-3px); }
          25%  { opacity: 0.9; transform: translateX(2px); }
          37%  { opacity: 0.5; transform: translateX(-1px); }
          50%  { opacity: 0.7; transform: translateX(3px); }
          62%  { opacity: 0.4; transform: translateX(-2px); }
          75%  { opacity: 0.3; transform: translateX(1px); }
          100% { opacity: 0;   transform: translateX(0); }
        }
        @keyframes sd-eye-ring-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.06); opacity: 0.8; }
        }
        @keyframes sd-eye-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.55; transform: scale(1.15); }
        }
        @keyframes sd-warn-shake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          25%      { transform: translateX(-3px) rotate(-3deg); }
          75%      { transform: translateX(3px) rotate(3deg); }
        }
        @keyframes sd-warn-pulse {
          0%   { opacity: 0.5; }
          100% { opacity: 1; }
        }
        @keyframes sd-scanner {
          0%   { opacity: 0.6; }
          100% { opacity: 1; }
        }
        @keyframes sd-runner-vibrate {
          0%   { transform: rotate(45deg) translateY(0); }
          100% { transform: rotate(45deg) translateY(-1.5px); }
        }
        @keyframes sd-runner-glow {
          0%   { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.15); opacity: 1; }
        }
        @keyframes sd-trail-flicker {
          0%   { opacity: 0.5; height: 40px; }
          100% { opacity: 1;   height: 50px; }
        }
        @keyframes sd-holo-scan {
          0%   { top: -2px; }
          100% { top: 52px; }
        }
        @keyframes sd-bar-blink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }
        @keyframes sd-death-bg {
          0%   { opacity: 0; }
          30%  { opacity: 1; }
          100% { opacity: 1; }
        }
        @keyframes sd-death-eye-in {
          0%   { transform: scale(0.3); opacity: 0; }
          60%  { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes sd-death-eye-pulse {
          0%   { transform: scale(1); box-shadow: 0 0 60px rgba(239,68,68,0.5); }
          100% { transform: scale(1.05); box-shadow: 0 0 80px rgba(239,68,68,0.7); }
        }
        @keyframes sd-death-text-in {
          0%   { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes sd-death-panic-in {
          0%   { transform: scale(0.5) translateY(10px); opacity: 0; }
          60%  { transform: scale(1.05) translateY(-2px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default ShadowDashGame;
