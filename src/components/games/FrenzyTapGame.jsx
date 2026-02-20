/**
 * FrenzyTapGame.jsx — "Frenzy Tap"
 *
 * Minijuego hipercasual de machacar botones: pulsa un botón
 * gigante tantas veces como puedas en 10 segundos.
 * El fondo se "calienta" (más rojo) con cada toque.
 *
 * Props:
 *   isActive   – cuando pasa a true, arranca el juego
 *   onNextGame – callback para "siguiente juego"
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { submitScore } from "../../services/scoreService";

/* ─────────── Constantes ─────────── */
const STATES = { IDLE: "idle", PLAYING: "playing", ENDED: "ended" };
const GAME_DURATION = 10; // segundos
const TICK_MS = 50;       // intervalo del timer (50ms → resolución 0.05s)

/* ═══════════════════ COMPONENT ═══════════════════ */
const FrenzyTapGame = ({ isActive, onNextGame, currentUser }) => {
  const [gameState, setGameState] = useState(STATES.IDLE);
  const [score, setScore]         = useState(0);
  const [timeLeft, setTimeLeft]   = useState(GAME_DURATION);
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  // Refs para mantener estado fiable dentro de callbacks/intervals
  const scoreRef     = useRef(0);
  const timeRef      = useRef(GAME_DURATION);
  const timerRef     = useRef(null);
  const gameStateRef = useRef(STATES.IDLE);
  const shakeRef     = useRef(false);
  const [shake, setShake] = useState(false);
  const shakeTORef   = useRef(null);

  /* ── Arrancar partida ── */
  const startGame = useCallback(() => {
    scoreRef.current     = 0;
    timeRef.current      = GAME_DURATION;
    gameStateRef.current = STATES.PLAYING;
    setScore(0);
    setTimeLeft(GAME_DURATION);
    setGameState(STATES.PLAYING);

    timerRef.current = setInterval(() => {
      timeRef.current -= TICK_MS / 1000;
      if (timeRef.current <= 0) {
        timeRef.current = 0;
        clearInterval(timerRef.current);
        gameStateRef.current = STATES.ENDED;
        setTimeLeft(0);
        setGameState(STATES.ENDED);
      } else {
        setTimeLeft(timeRef.current);
      }
    }, TICK_MS);
  }, []);

  /* ── Auto-start ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, startGame, gameState]);

  /* ── Cleanup ── */
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(shakeTORef.current);
    };
  }, []);

  /* ── Tap handler ── */
  const handleTap = useCallback(() => {
    if (gameStateRef.current !== STATES.PLAYING) return;
    scoreRef.current += 1;
    setScore(scoreRef.current);

    // Micro-shake feedback
    setShake(true);
    clearTimeout(shakeTORef.current);
    shakeTORef.current = setTimeout(() => setShake(false), 60);
  }, []);

  /* ── Derivados ── */
  const isPlaying = gameState === STATES.PLAYING;
  const isEnded   = gameState === STATES.ENDED;

  // Enviar puntuación al terminar
  useEffect(() => {
    if (isEnded && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submitScore("frenzy-tap", score, currentUser?.id)
        .then((result) => {
          setRanking(result.ranking || []);
          setScoreMessage(result.message || "");
        })
        .catch(() => setScoreMessage("Error al enviar puntuación."))
        .finally(() => setIsRankingLoading(false));
    }
    if (gameState === STATES.IDLE) {
      scoreSubmitted.current = false;
      setRanking([]);
      setScoreMessage("");
    }
  }, [isEnded, score, currentUser, gameState]);
  const progress  = timeLeft / GAME_DURATION;            // 1 → 0
  const heat      = Math.min(1, score / 80);             // 0 → 1 gradual

  // Color de fondo dinámico: de zinc-950 a rojo oscuro
  const bgR = Math.round(9  + heat * 80);   // 9 → ~89
  const bgG = Math.round(9  - heat * 6);    // 9 → ~3
  const bgB = Math.round(11 - heat * 8);    // 11 → ~3
  const bgColor = `rgb(${bgR}, ${bgG}, ${bgB})`;

  // Color del botón: de cyan-ish a rojo intenso
  const btnR = Math.round(56  + heat * 180);  // 56 → 236
  const btnG = Math.round(189 - heat * 150);  // 189 → 39
  const btnB = Math.round(248 - heat * 200);  // 248 → 48
  const btnGlow = `rgba(${btnR}, ${btnG}, ${btnB}, 0.4)`;
  const btnBorder = `rgba(${Math.min(255, btnR + 40)}, ${Math.min(255, btnG + 40)}, ${Math.min(255, btnB + 40)}, 0.5)`;

  // Tamaño del score: escala con el combo
  const scoreFontSize = Math.min(6, 3.5 + score * 0.008); // rem

  return (
    <div
      className="relative h-full w-full flex items-center justify-center overflow-hidden select-none"
      style={{
        backgroundColor: bgColor,
        touchAction: "manipulation",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      {/* ── Overlay gradients para UI del feed ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ── Barra de progreso (top) ── */}
      {gameState !== STATES.IDLE && (
        <div className="absolute top-14 left-6 right-6 z-3">
          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{
                width: `${progress * 100}%`,
                backgroundColor: `rgb(${btnR}, ${btnG}, ${btnB})`,
                boxShadow: `0 0 12px ${btnGlow}`,
              }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-xs font-bold text-white/50 tabular-nums" style={{ fontFeatureSettings: "'tnum'" }}>
              {timeLeft.toFixed(1)}s
            </span>
            <span className="text-xs font-bold text-white/50">
              {score} taps
            </span>
          </div>
        </div>
      )}

      {/* ── Botón central gigante ── */}
      {(isPlaying || gameState === STATES.IDLE) && (
        <button
          type="button"
          onPointerDown={handleTap}
          disabled={gameState !== STATES.PLAYING}
          className="relative z-2 flex items-center justify-center rounded-full outline-none cursor-pointer transition-transform duration-75"
          style={{
            width: "min(65vw, 65vh, 280px)",
            height: "min(65vw, 65vh, 280px)",
            background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.12), transparent 60%), rgb(${btnR}, ${btnG}, ${btnB})`,
            border: `3px solid ${btnBorder}`,
            boxShadow: `0 0 40px ${btnGlow}, 0 0 80px ${btnGlow}, inset 0 0 30px rgba(255,255,255,0.06)`,
            touchAction: "manipulation",
            userSelect: "none",
            WebkitUserSelect: "none",
            WebkitTapHighlightColor: "transparent",
            transform: shake ? "scale(0.92)" : "scale(1)",
          }}
        >
          {/* Score dentro del botón */}
          <div className="flex flex-col items-center gap-1 pointer-events-none">
            <span
              className="font-black text-white tabular-nums leading-none transition-all duration-75"
              style={{
                fontSize: `${scoreFontSize}rem`,
                fontFeatureSettings: "'tnum'",
                textShadow: "0 2px 20px rgba(0,0,0,0.3)",
                transform: shake ? "scale(1.08)" : "scale(1)",
              }}
            >
              {score}
            </span>
            {isPlaying && (
              <span className="text-[0.65rem] font-semibold text-white/40 uppercase tracking-widest">
                taps
              </span>
            )}
            {gameState === STATES.IDLE && (
              <span className="text-sm font-semibold text-white/50 mt-1">
                10.0s
              </span>
            )}
          </div>
        </button>
      )}

      {/* ── Partículas de feedback por tap ── */}
      {isPlaying && shake && (
        <>
          <div
            className="absolute z-1 rounded-full animate-ping pointer-events-none"
            style={{
              width: "min(70vw, 70vh, 300px)",
              height: "min(70vw, 70vh, 300px)",
              backgroundColor: `rgba(${btnR}, ${btnG}, ${btnB}, 0.15)`,
              animationDuration: "0.4s",
              animationIterationCount: 1,
            }}
          />
        </>
      )}

      {/* ── Hint IDLE ── */}
      {gameState === STATES.IDLE && (
        <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
          <div className="flex flex-col items-center gap-3 animate-pulse">
            <img
              src="/logo-frenzytap.png"
              alt="Frenzy Tap"
              className="w-16 h-16 object-contain drop-shadow-lg"
              draggable={false}
            />
            <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
              ¡Machaca el botón lo más rápido posible!
            </span>
          </div>
        </div>
      )}

      {/* ── GAME OVER ── */}
      {isEnded && (
        <div className="absolute inset-0 flex items-center justify-center z-6 pointer-events-auto">
          <GameOverPanel
            title="Game Over"
            score={score}
            subtitle="taps"
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

export default FrenzyTapGame;
