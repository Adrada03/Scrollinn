/**
 * OverheatGame.jsx — "Overheat"
 *
 * Minijuego de precisión, velocidad y autocontrol.
 * El jugador debe hacer un número EXACTO de taps antes de que se acabe el tiempo.
 * - Más taps del objetivo → el motor se sobrecalienta → Game Over inmediato.
 * - Menos taps al acabar el tiempo → Game Over.
 * - Taps exactos al acabar el tiempo → ronda superada, +1 score.
 *
 * La dificultad sube con TPS (taps por segundo) progresivo.
 *
 * Props:
 *   isActive   – cuando pasa a true, arranca el juego
 *   onNextGame – callback para "siguiente juego"
 *   userId     – ID del usuario logueado (o undefined)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ─────────── Constantes ─────────── */
const STATES = { IDLE: "idle", PLAYING: "playing", ENDED: "ended" };
const BASE_TPS = 3.5;
const TPS_INCREMENT = 0.2;
const MAX_TPS = 8;
const TICK_MS = 10; // 10ms → ~60fps smooth bar

/* ─────────── Helpers ─────────── */
function getTPS(score) {
  return Math.min(MAX_TPS, BASE_TPS + score * TPS_INCREMENT);
}

function getTargetRange(score) {
  // Rango progresivo de taps objetivo (crece más rápido)
  const minTaps = Math.floor(5 + score * 1.0);
  const maxTaps = Math.floor(10 + score * 1.5);
  return [minTaps, maxTaps];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRound(score) {
  const [minT, maxT] = getTargetRange(score);

  // Sesgo progresivo hacia más taps: potencia < 1 → más prob. de valores altos
  const bias = 1 / (1 + score * 0.15);
  const target = Math.round(minT + Math.pow(Math.random(), bias) * (maxT - minT));

  const tps = getTPS(score);
  const baseTime = target / tps;

  // Cada ronda da un pelín menos de tiempo (mínimo 65 % del base)
  const timeFactor = Math.max(0.65, 1 - score * 0.025);
  const time = baseTime * timeFactor;

  return { target, time, tps };
}

/* ═══════════════════ COMPONENT ═══════════════════ */
const OverheatGame = ({ isActive, onNextGame, userId }) => {
  const { t } = useLanguage();

  const [gameState, setGameState] = useState(STATES.IDLE);
  const [score, setScore] = useState(0);
  const [targetTaps, setTargetTaps] = useState(0);
  const [currentTaps, setCurrentTaps] = useState(0);
  const [roundTime, setRoundTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [flash, setFlash] = useState(""); // "green" | "red" | ""
  const [tapPulse, setTapPulse] = useState(false);
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  const { submit } = useSubmitScore(userId, GAME_IDS.OverheatGame);

  // Refs for stable callbacks
  const scoreRef = useRef(0);
  const currentTapsRef = useRef(0);
  const targetTapsRef = useRef(0);
  const timeLeftRef = useRef(0);
  const roundTimeRef = useRef(0);
  const gameStateRef = useRef(STATES.IDLE);
  const timerRef = useRef(null);
  const flashTimeoutRef = useRef(null);
  const tapPulseRef = useRef(null);

  /* ── Start a new round ── */
  const startRound = useCallback((currentScore) => {
    const round = generateRound(currentScore);
    targetTapsRef.current = round.target;
    currentTapsRef.current = 0;
    timeLeftRef.current = round.time;
    roundTimeRef.current = round.time;

    setTargetTaps(round.target);
    setCurrentTaps(0);
    setRoundTime(round.time);
    setTimeLeft(round.time);
  }, []);

  /* ── End game ── */
  const endGame = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    gameStateRef.current = STATES.ENDED;
    setGameState(STATES.ENDED);
  }, []);

  /* ── Win round ── */
  const winRound = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;

    // Green flash
    setFlash("green");
    clearTimeout(flashTimeoutRef.current);

    scoreRef.current += 1;
    setScore(scoreRef.current);

    flashTimeoutRef.current = setTimeout(() => {
      setFlash("");
      // Start next round
      startRound(scoreRef.current);

      // Restart timer
      timerRef.current = setInterval(() => {
        timeLeftRef.current -= TICK_MS / 1000;
        if (timeLeftRef.current <= 0) {
          timeLeftRef.current = 0;
          setTimeLeft(0);
          // Check if taps match
          if (currentTapsRef.current === targetTapsRef.current) {
            winRound();
          } else {
            endGame();
          }
        } else {
          setTimeLeft(timeLeftRef.current);
        }
      }, TICK_MS);
    }, 350);
  }, [startRound, endGame]);

  /* ── Start game (first round) ── */
  const startGame = useCallback(() => {
    scoreRef.current = 0;
    gameStateRef.current = STATES.PLAYING;
    scoreSubmitted.current = false;
    setScore(0);
    setGameState(STATES.PLAYING);
    setFlash("");
    setRanking([]);
    setScoreMessage("");

    startRound(0);

    timerRef.current = setInterval(() => {
      timeLeftRef.current -= TICK_MS / 1000;
      if (timeLeftRef.current <= 0) {
        timeLeftRef.current = 0;
        setTimeLeft(0);
        // Timer ended: check result
        if (currentTapsRef.current === targetTapsRef.current) {
          winRound();
        } else {
          endGame();
        }
      } else {
        setTimeLeft(timeLeftRef.current);
      }
    }, TICK_MS);
  }, [startRound, endGame, winRound]);

  /* ── Auto-start when isActive becomes true ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, startGame, gameState]);

  /* ── Cleanup ── */
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(flashTimeoutRef.current);
      clearTimeout(tapPulseRef.current);
    };
  }, []);

  /* ── Tap handler ── */
  const handleTap = useCallback(
    (e) => {
      e.preventDefault();
      if (gameStateRef.current !== STATES.PLAYING) return;
      if (flash) return; // Don't accept taps during flash transition

      currentTapsRef.current += 1;
      const newTaps = currentTapsRef.current;
      setCurrentTaps(newTaps);

      // Tap pulse feedback
      setTapPulse(true);
      clearTimeout(tapPulseRef.current);
      tapPulseRef.current = setTimeout(() => setTapPulse(false), 80);

      // Overheat check: too many taps → immediate Game Over
      if (newTaps > targetTapsRef.current) {
        setFlash("red");
        clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = setTimeout(() => {
          setFlash("");
          endGame();
        }, 400);
        clearInterval(timerRef.current);
        timerRef.current = null;
        return;
      }

      // Exact match while time is still running → wait for timer
      // (player must wait for timer to end with exact taps)
    },
    [endGame, flash]
  );

  /* ── Submit score on game end ── */
  const isEnded = gameState === STATES.ENDED;
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
  }, [isEnded, score, gameState, submit, t]);

  /* ── Derived values ── */
  const progress = roundTime > 0 ? timeLeft / roundTime : 1;
  const tapRatio = targetTaps > 0 ? currentTaps / targetTaps : 0;

  // Color transitions based on proximity to target
  const isClose = tapRatio >= 0.7;
  const isExact = currentTaps === targetTaps;
  const isOver = currentTaps > targetTaps;

  // Heat color: interpolates from cyan → amber → red
  let hR, hG, hB;
  if (tapRatio < 0.5) {
    const t2 = tapRatio / 0.5;
    hR = Math.round(56 + t2 * (245 - 56));
    hG = Math.round(189 + t2 * (158 - 189));
    hB = Math.round(248 + t2 * (11 - 248));
  } else {
    const t2 = (tapRatio - 0.5) / 0.5;
    hR = Math.round(245 + t2 * (239 - 245));
    hG = Math.round(158 - t2 * 120);
    hB = Math.round(11 - t2 * 7);
  }
  const heatColor = `rgb(${hR}, ${hG}, ${hB})`;
  const heatGlow = `rgba(${hR}, ${hG}, ${hB}, 0.4)`;

  // Background: dark with subtle heat tint
  const heatLevel = Math.min(1, tapRatio);
  const bgR = Math.round(15 + heatLevel * 45);
  const bgG = Math.round(15 - heatLevel * 10);
  const bgB = Math.round(18 - heatLevel * 14);

  // Flash overlay
  let flashOverlay = null;
  if (flash === "green") {
    flashOverlay = "bg-emerald-500/25";
  } else if (flash === "red") {
    flashOverlay = "bg-red-500/35";
  }

  // Circular gauge: SVG arc percentage
  const gaugeRadius = 120;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeOffset = gaugeCircumference * (1 - Math.min(1, tapRatio));

  // X/Y color
  let xColor = "text-white";
  if (isOver) xColor = "text-red-400";
  else if (isExact) xColor = "text-emerald-400";
  else if (isClose) xColor = "text-amber-300";

  return (
    <div
      className="relative h-full w-full flex flex-col items-center justify-center overflow-hidden select-none"
      style={{
        backgroundColor: `rgb(${bgR}, ${bgG}, ${bgB})`,
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
      onPointerDown={gameState === STATES.PLAYING ? handleTap : undefined}
    >
      {/* ── Overlay gradients for feed UI ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ── Ambient glow behind gauge ── */}
      {gameState === STATES.PLAYING && (
        <div
          className="absolute pointer-events-none z-0"
          style={{
            width: "340px",
            height: "340px",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${heatGlow} 0%, transparent 70%)`,
            opacity: 0.5 + tapRatio * 0.5,
            transition: "opacity 0.15s ease-out",
          }}
        />
      )}

      {/* ── Flash overlay ── */}
      <AnimatePresence>
        {flashOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`absolute inset-0 ${flashOverlay} pointer-events-none z-4`}
          />
        )}
      </AnimatePresence>

      {/* ── Progress bar (top) ── */}
      {gameState !== STATES.IDLE && !isEnded && (
        <div className="absolute top-14 left-6 right-6 z-3">
          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden backdrop-blur-sm">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(0, progress * 100)}%`,
                backgroundColor: heatColor,
                boxShadow: `0 0 14px ${heatGlow}`,
                transition: "width 0.02s linear",
              }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span
              className="text-[0.65rem] font-bold text-white/40 tabular-nums"
              style={{ fontFeatureSettings: "'tnum'" }}
            >
              {timeLeft.toFixed(2)}s
            </span>
            <span className="text-[0.65rem] font-bold text-white/40">
              {t("overheat.round")} {score + 1}
            </span>
          </div>
        </div>
      )}

      {/* ── Central display ── */}
      {(gameState === STATES.PLAYING || gameState === STATES.IDLE) && (
        <div className="relative z-2 flex flex-col items-center pointer-events-none">

          {/* Score badge (top) */}
          <AnimatePresence>
            {gameState === STATES.PLAYING && score > 0 && (
              <motion.div
                key={score}
                initial={{ scale: 1.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="mb-6 px-5 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md"
              >
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{
                    fontFeatureSettings: "'tnum'",
                    color: heatColor,
                    textShadow: `0 0 10px ${heatGlow}`,
                  }}
                >
                  {t("overheat.score")}: {score}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Circular gauge + X / Y display */}
          <div className="relative flex items-center justify-center" style={{ width: 280, height: 280 }}>

            {/* SVG ring gauge */}
            <svg
              className="absolute inset-0"
              width="280"
              height="280"
              viewBox="0 0 280 280"
              style={{ transform: "rotate(-90deg)" }}
            >
              {/* Background ring */}
              <circle
                cx="140" cy="140" r={gaugeRadius}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="6"
              />
              {/* Progress ring */}
              <circle
                cx="140" cy="140" r={gaugeRadius}
                fill="none"
                stroke={heatColor}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={gaugeCircumference}
                strokeDashoffset={gaugeOffset}
                style={{
                  transition: "stroke-dashoffset 0.08s ease-out, stroke 0.15s ease-out",
                  filter: `drop-shadow(0 0 8px ${heatGlow})`,
                }}
              />
            </svg>

            {/* Tap pulse ring */}
            {tapPulse && (
              <div
                className="absolute rounded-full pointer-events-none animate-ping"
                style={{
                  width: 260,
                  height: 260,
                  border: `2px solid ${heatColor}`,
                  opacity: 0.2,
                  animationDuration: "0.4s",
                  animationIterationCount: 1,
                }}
              />
            )}

            {/* Inner content: X / Y */}
            <div className="relative flex flex-col items-center justify-center">
              {/* Big fraction: currentTaps / targetTaps */}
              <div className="flex items-baseline gap-1">
                <motion.span
                  key={currentTaps}
                  initial={tapPulse ? { scale: 1.15 } : false}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                  className={`font-black tabular-nums leading-none transition-colors duration-100 ${xColor}`}
                  style={{
                    fontSize: "clamp(3.5rem, 14vw, 6.5rem)",
                    fontFeatureSettings: "'tnum'",
                    textShadow: isClose
                      ? `0 0 24px ${heatGlow}`
                      : isExact
                      ? "0 0 24px rgba(16,185,129,0.5)"
                      : "0 0 20px rgba(255,255,255,0.04)",
                  }}
                >
                  {currentTaps}
                </motion.span>
                <span
                  className="font-bold text-white/20 leading-none"
                  style={{ fontSize: "clamp(2rem, 7vw, 3.5rem)" }}
                >
                  /
                </span>
                <span
                  className="font-black text-white/50 tabular-nums leading-none"
                  style={{
                    fontSize: "clamp(3.5rem, 14vw, 6.5rem)",
                    fontFeatureSettings: "'tnum'",
                  }}
                >
                  {targetTaps}
                </span>
              </div>

              {/* Label */}
              <span className="text-[0.65rem] font-semibold text-white/25 uppercase tracking-[0.2em] mt-2">
                taps
              </span>
            </div>
          </div>

          {/* Remaining hint */}
          {gameState === STATES.PLAYING && currentTaps < targetTaps && (
            <div className="mt-4 flex items-center gap-1.5">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: heatColor, boxShadow: `0 0 6px ${heatGlow}` }}
              />
              <span
                className="text-xs font-bold text-white/30 tabular-nums"
                style={{ fontFeatureSettings: "'tnum'" }}
              >
                {targetTaps - currentTaps} {t("overheat.remaining")}
              </span>
            </div>
          )}

          {/* Exact match indicator */}
          {gameState === STATES.PLAYING && isExact && !isOver && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 px-4 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30"
            >
              <span className="text-xs font-bold text-emerald-400 tracking-wide">
                ✓ {t("overheat.hold")}
              </span>
            </motion.div>
          )}
        </div>
      )}

      {/* ── GAME OVER ── */}
      {isEnded && (
        <div className="absolute inset-0 flex items-center justify-center z-6 pointer-events-auto">
          <GameOverPanel
            title="Game Over"
            score={score}
            subtitle={t("overheat.rounds")}
            onNext={onNextGame}
            ranking={ranking}
            scoreMessage={scoreMessage}
            isLoading={isRankingLoading}
          />
        </div>
      )}
    </div>
  );
};

export default OverheatGame;
