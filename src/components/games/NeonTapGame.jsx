/**
 * NeonTapGame.jsx — "Neon Tap"
 *
 * Minijuego de reflejos: cuadrícula 4×4 donde un solo cuadrado
 * se enciende con brillo neón. Tócalo para sumar puntos.
 * Fallas → penalización. Cada acierto acelera el ritmo.
 * 30 segundos de partida.
 *
 * Props:
 *   isActive   – cuando pasa a true, arranca el juego
 *   onNextGame – callback para "siguiente juego"
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ─────────── Constantes ─────────── */
const STATES = { IDLE: "idle", PLAYING: "playing", ENDED: "ended" };
const GRID = 4;
const CELLS = GRID * GRID;
const GAME_DURATION = 30; // segundos

const INITIAL_INTERVAL = 800; // ms entre cambios automáticos
const ACCEL = 12;             // ms que se resta por acierto
const MIN_INTERVAL = 400;     // velocidad mínima
const TIME_PENALTY = 1;       // segundos restados por fallo

/* Colores neón rotativos para el objetivo */
const NEON_PALETTE = [
  { bg: "bg-cyan-400",    shadow: "shadow-[0_0_18px_rgba(34,211,238,0.55)]",   glow: "cyan"    },
  { bg: "bg-fuchsia-400", shadow: "shadow-[0_0_18px_rgba(232,121,249,0.55)]",  glow: "fuchsia" },
  { bg: "bg-lime-400",    shadow: "shadow-[0_0_18px_rgba(163,230,53,0.55)]",   glow: "lime"    },
  { bg: "bg-amber-400",   shadow: "shadow-[0_0_18px_rgba(251,191,36,0.55)]",   glow: "amber"   },
];

/* ─────────── Helpers ─────────── */
function pickTarget(prev) {
  let next;
  do { next = Math.floor(Math.random() * CELLS); } while (next === prev);
  return next;
}

function pickNeon(prevIdx) {
  let next;
  do { next = Math.floor(Math.random() * NEON_PALETTE.length); } while (next === prevIdx);
  return next;
}

/**
 * Intervalo efectivo: combina la reducción por aciertos (intervalRef)
 * con un factor temporal suave que encoge el intervalo conforme avanza la partida.
 * Al inicio multiplica ×1, al final ×0.75 (25% más rápido).
 * Después aplica aleatorización ±20% para evitar patrones predecibles.
 */
function getEffectiveInterval(hitBase, timeRemaining) {
  const elapsed = GAME_DURATION - timeRemaining;
  const timeFactor = 1 - (elapsed / GAME_DURATION) * 0.25; // 1.0 → 0.75
  const effective = Math.max(MIN_INTERVAL, hitBase * timeFactor);
  // Aleatorización ±20%
  const lo = Math.max(MIN_INTERVAL, effective * 0.80);
  const hi = effective * 1.20;
  return lo + Math.random() * (hi - lo);
}

/* ═══════════════════ COMPONENT ═══════════════════ */
const NeonTapGame = ({ isActive, onNextGame, onReplay, userId }) => {
  const { t } = useLanguage();
  const [gameState, setGameState] = useState(STATES.IDLE);
  const [score, setScore]         = useState(0);
  const [timeLeft, setTimeLeft]   = useState(GAME_DURATION);
  const [target, setTarget]       = useState(-1);        // índice activo
  const [neonIdx, setNeonIdx]     = useState(0);         // color neón actual
  const [errorCell, setErrorCell] = useState(-1);         // flash rojo
  const [hitCell, setHitCell]     = useState(-1);         // flash acierto
  const [combo, setCombo]         = useState(0);          // aciertos seguidos
  const [penaltyFlash, setPenaltyFlash] = useState(false);
  const [shaking, setShaking]     = useState(false);
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  const { submit, loading: isSubmittingScore, error: submitError, lastResult, xpGained, gameId } = useSubmitScore(userId, GAME_IDS.NeonTapGame);

  const intervalRef = useRef(INITIAL_INTERVAL);
  const lastChangeTimeRef = useRef(0);        // timestamp del último cambio de objetivo
  const currentIntervalRef = useRef(INITIAL_INTERVAL); // duración aleatoria del objetivo actual
  const errorTORef  = useRef(null);
  const hitTORef    = useRef(null);
  const progressBarRef = useRef(null);
  const timeRef = useRef(GAME_DURATION);
  const lastFrameRef = useRef(null);
  const rafBarRef = useRef(null);
  const prevSecondsRef = useRef(GAME_DURATION);

  /* ── Arrancar partida ── */
  const startGame = useCallback(() => {
    setScore(0);
    setTimeLeft(GAME_DURATION);
    timeRef.current = GAME_DURATION;
    lastFrameRef.current = null;
    prevSecondsRef.current = GAME_DURATION;
    setCombo(0);
    setPenaltyFlash(false);
    setShaking(false);
    intervalRef.current = INITIAL_INTERVAL;
    currentIntervalRef.current = getEffectiveInterval(INITIAL_INTERVAL, GAME_DURATION);
    lastChangeTimeRef.current = performance.now();
    const t = pickTarget(-1);
    const n = pickNeon(-1);
    setTarget(t);
    setNeonIdx(n);
    setErrorCell(-1);
    setHitCell(-1);
    setGameState(STATES.PLAYING);
  }, []);

  /* ── Auto-start cuando isActive ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, startGame, gameState]);

  /* ── Temporizador RAF (60 fps, direct DOM bar) ── */
  useEffect(() => {
    if (gameState !== STATES.PLAYING || !isActive) {
      cancelAnimationFrame(rafBarRef.current);
      lastFrameRef.current = null;
      return;
    }

    const tick = (now) => {
      if (!lastFrameRef.current) lastFrameRef.current = now;
      const dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;

      timeRef.current -= dt;

      if (timeRef.current <= 0) {
        timeRef.current = 0;
        setTimeLeft(0);
        setGameState(STATES.ENDED);
        if (progressBarRef.current) {
          progressBarRef.current.style.transform = "scaleX(0)";
        }
        return;
      }

      // Direct DOM bar update — 60 fps
      if (progressBarRef.current) {
        progressBarRef.current.style.transform = `scaleX(${timeRef.current / GAME_DURATION})`;
      }

      // Sync React state only when displayed seconds change
      const sec = Math.ceil(timeRef.current);
      if (sec !== prevSecondsRef.current) {
        prevSecondsRef.current = sec;
        setTimeLeft(sec);
      }

      // Auto-change target when interval expires (random duration, scales with time)
      if (now - lastChangeTimeRef.current >= currentIntervalRef.current) {
        setTarget((prev) => pickTarget(prev));
        setNeonIdx((prev) => pickNeon(prev));
        lastChangeTimeRef.current = now;
        currentIntervalRef.current = getEffectiveInterval(intervalRef.current, timeRef.current);
      }

      rafBarRef.current = requestAnimationFrame(tick);
    };

    rafBarRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafBarRef.current);
  }, [gameState, isActive]);

  /* ── Limpiar al terminar ── */
  useEffect(() => {
    if (gameState === STATES.ENDED) {
      setTarget(-1);
    }
  }, [gameState]);

  /* ── Click en celda ── */
  const handleTap = useCallback(
    (idx) => {
      if (gameState !== STATES.PLAYING) return;

      if (idx === target) {
        /* ✅ ACIERTO */
        setScore((s) => s + 1);
        setCombo((c) => c + 1);

        /* Flash verde en la celda */
        setHitCell(idx);
        clearTimeout(hitTORef.current);
        hitTORef.current = setTimeout(() => setHitCell(-1), 150);

        /* Acelerar intervalo base */
        intervalRef.current = Math.max(MIN_INTERVAL, intervalRef.current - ACCEL);

        /* Mover objetivo inmediatamente + nuevo intervalo aleatorio */
        const next = pickTarget(idx);
        setTarget(next);
        setNeonIdx((prev) => pickNeon(prev));
        lastChangeTimeRef.current = performance.now();
        currentIntervalRef.current = getEffectiveInterval(intervalRef.current, timeRef.current);
      } else {
        /* ❌ FALLO — penalización de tiempo */
        setCombo(0);
        timeRef.current = Math.max(0, timeRef.current - TIME_PENALTY);
        if (timeRef.current <= 0) {
          setTimeLeft(0);
          setGameState(STATES.ENDED);
        } else {
          prevSecondsRef.current = Math.ceil(timeRef.current);
          setTimeLeft(prevSecondsRef.current);
        }
        setErrorCell(idx);
        clearTimeout(errorTORef.current);
        errorTORef.current = setTimeout(() => setErrorCell(-1), 250);
        setPenaltyFlash(true);
        setShaking(true);
        setTimeout(() => setPenaltyFlash(false), 400);
        setTimeout(() => setShaking(false), 500);
        if (navigator.vibrate) navigator.vibrate(100);
      }
    },
    [gameState, target],
  );

  /* ── Cleanup timers ── */
  useEffect(() => {
    return () => {
      clearTimeout(errorTORef.current);
      clearTimeout(hitTORef.current);
      cancelAnimationFrame(rafBarRef.current);
    };
  }, []);

  /* ── Derivados ── */
  const isPlaying   = gameState === STATES.PLAYING;
  const isEnded     = gameState === STATES.ENDED;

  // Enviar puntuación al terminar
  useEffect(() => {
    if (isEnded && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submit(score, () => {})
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
  }, [isEnded, score, submit, gameState]);
  const timerPct    = Math.min(100, (timeLeft / GAME_DURATION) * 100);
  const isLowTime   = timeLeft <= 5;
  const neon        = NEON_PALETTE[neonIdx];

  /* Velocidad visual (para mostrar al jugador) */
  const speedPct = Math.round(
    ((INITIAL_INTERVAL - intervalRef.current) / (INITIAL_INTERVAL - MIN_INTERVAL)) * 100,
  );

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#0a0e17]">
      {/* Keyframes para shake */}
      <style>{`
        @keyframes neonShake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-6px)}
          40%{transform:translateX(6px)}
          60%{transform:translateX(-4px)}
          80%{transform:translateX(4px)}
        }
      `}</style>

      {/* Flash de penalización (rojo) */}
      {penaltyFlash && (
        <div className="absolute inset-0 bg-red-500/15 z-4 pointer-events-none" />
      )}

      {/* ── Glow decorativo ── */}
      <div
        className="absolute w-[50vw] h-[50vw] rounded-full opacity-[0.07] blur-3xl pointer-events-none"
        style={{ background: neon.glow, top: "20%", left: "25%", transition: "background 0.3s" }}
      />

      {/* ── Overlay gradients para UI del feed ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ═════ CONTENIDO ═════ */}
      <div className="relative w-full h-full flex flex-col items-center justify-center z-2">

        {/* ── HUD ── */}
        {gameState !== STATES.IDLE && (
          <div className="w-full flex flex-col items-center gap-1.5 mb-5 px-6 z-3">
            {/* Barra de tiempo */}
            <div className="w-full max-w-[320px] h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                ref={progressBarRef}
                className={`h-full rounded-full ${
                  isLowTime ? "bg-red-500" : "bg-cyan-400"
                }`}
                style={{
                  transformOrigin: "left",
                  willChange: "transform",
                }}
              />
            </div>
            {/* Stats */}
            <div className="flex items-center justify-between w-full max-w-[320px]">
              <span
                className={`text-xs font-mono font-bold tabular-nums ${
                  isLowTime ? "text-red-400 animate-pulse" : "text-white/50"
                }`}
              >
                {timeLeft}s
              </span>
              <span className="text-white/90 text-2xl font-black font-mono tabular-nums" style={{ fontFeatureSettings: "'tnum'", textShadow: "0 0 10px rgba(34,211,238,0.5), 0 0 30px rgba(34,211,238,0.2)" }}>
                {score}
              </span>
              <span className="text-white/30 text-[10px] font-medium tracking-wider uppercase">
                {combo > 2 ? `🔥 x${combo}` : `${speedPct}% vel`}
              </span>
            </div>
          </div>
        )}

        {/* ══════════ GRID 4×4 ══════════ */}
        <div className="px-6" style={{ animation: shaking ? "neonShake 0.5s ease-in-out" : "none" }}>
          <div
            className="aspect-square"
            style={{
              width: "min(78vw, 380px)",
              display: "grid",
              gridTemplateColumns: `repeat(${GRID}, 1fr)`,
              gap: "10px",
            }}
          >
            {Array.from({ length: CELLS }, (_, i) => {
              const isTarget = i === target && isPlaying;
              const isError  = i === errorCell;
              const isHit    = i === hitCell;

              let cellClass = "rounded-xl transition-all duration-100 ";

              if (isError) {
                cellClass += "bg-red-500/80 scale-95 ";
              } else if (isHit) {
                cellClass += "bg-emerald-400/80 scale-95 ";
              } else if (isTarget) {
                cellClass += `${neon.bg} ${neon.shadow} scale-105 `;
              } else {
                cellClass += "bg-zinc-800/90 ";
              }

              if (isPlaying) {
                cellClass += "cursor-pointer active:scale-90 ";
              }

              return (
                <button
                  key={i}
                  onClick={() => handleTap(i)}
                  disabled={!isPlaying}
                  className={cellClass}
                  style={{ aspectRatio: "1" }}
                />
              );
            })}
          </div>
        </div>

        {/* ── Hint IDLE ── */}
        {gameState === STATES.IDLE && (
          <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
            <div className="flex flex-col items-center gap-3 animate-pulse">
              <img src="/logo-neontap.png" alt="Neon Tap" className="w-16 h-16 object-contain drop-shadow-lg" draggable={false} />
              <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
                {t("neontap.instruction")}
              </span>
            </div>
          </div>
        )}

        {/* ── GAME OVER ── */}
        {isEnded && (
          <GameOverPanel
            title="Game Over"
            score={score}
            subtitle={t("neontap.subtitle")}
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
    </div>
  );
};

export default NeonTapGame;
