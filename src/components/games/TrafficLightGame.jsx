/**
 * TrafficLightGame.jsx — "Traffic Light"
 *
 * Minijuego de reflejos puro: la pantalla está en rojo durante
 * un tiempo aleatorio (2.5–7 s). Cuando cambia a verde, el
 * jugador toca lo más rápido posible. Se mide el tiempo de
 * reacción en milisegundos (cuanto menor, mejor).
 *
 * Si toca durante la fase roja → penalización de 9999 ms.
 *
 * Props:
 *   isActive   – cuando pasa a true, arranca la fase de espera
 *   onNextGame – callback para "siguiente juego"
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";

/* ─────────── Constantes ─────────── */
const STATES = { IDLE: "idle", WAITING: "waiting", GREEN: "green", ENDED: "ended" };
const MIN_WAIT = 2500; // ms mínimo en rojo
const MAX_WAIT = 7000; // ms máximo en rojo
const PENALTY  = 9999; // ms de penalización por false start

/* ─────────── Helpers ─────────── */
function getRandomWait() {
  return MIN_WAIT + Math.random() * (MAX_WAIT - MIN_WAIT);
}

function getVerdict(ms) {
  if (ms === PENALTY) return "¡Demasiado pronto! 🚫";
  if (ms <= 150) return "¡Sobrehumano! ⚡";
  if (ms <= 220) return "¡Increíble! 🔥";
  if (ms <= 300) return "¡Muy rápido! 🎯";
  if (ms <= 450) return "Buen reflejo 👏";
  if (ms <= 700) return "No está mal 🤔";
  return "Puedes más rápido 💪";
}

function getAccentColor(ms) {
  if (ms === PENALTY) return "text-red-400";
  if (ms <= 150) return "text-emerald-400";
  if (ms <= 220) return "text-cyan-400";
  if (ms <= 300) return "text-blue-400";
  if (ms <= 450) return "text-amber-400";
  return "text-orange-400";
}

/* ═══════════════════ COMPONENT ═══════════════════ */
const TrafficLightGame = ({ isActive, onNextGame, userId }) => {
  const [gameState, setGameState] = useState(STATES.IDLE);
  const [reactionMs, setReactionMs] = useState(null);
  const [falseStart, setFalseStart] = useState(false);

  const greenTimestampRef = useRef(null); // Date.now() cuando se pone verde
  const timeoutRef = useRef(null);        // setTimeout para el cambio a verde

  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  const { submit, loading: isSubmittingScore } = useSubmitScore(userId, GAME_IDS.TrafficLightGame);

  /* ── Arrancar: pasar a WAITING (pantalla roja) ── */
  const startGame = useCallback(() => {
    setReactionMs(null);
    setFalseStart(false);
    greenTimestampRef.current = null;

    setGameState(STATES.WAITING);

    // Programar el cambio a verde tras un tiempo aleatorio
    const delay = getRandomWait();
    timeoutRef.current = setTimeout(() => {
      greenTimestampRef.current = Date.now();
      setGameState(STATES.GREEN);
    }, delay);
  }, []);

  /* ── Auto-start cuando isActive ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, startGame, gameState]);

  /* ── Cleanup de timeouts al desmontar ── */
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  /* ── Tap del jugador ── */
  const handleTap = useCallback(() => {
    if (gameState === STATES.WAITING) {
      /* ❌ FALSE START — tocó en rojo */
      clearTimeout(timeoutRef.current);
      setFalseStart(true);
      setReactionMs(PENALTY);
      setGameState(STATES.ENDED);
    } else if (gameState === STATES.GREEN) {
      /* ✅ Reacción válida */
      const reaction = Date.now() - greenTimestampRef.current;
      setReactionMs(reaction);
      setGameState(STATES.ENDED);
    }
  }, [gameState]);

  /* ── Derivados ── */
  const isWaiting = gameState === STATES.WAITING;
  const isGreen   = gameState === STATES.GREEN;
  const isEnded   = gameState === STATES.ENDED;

  // Enviar puntuación al terminar (is_lower_better=true, score = reactionMs)
  useEffect(() => {
    if (isEnded && reactionMs !== null && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submit(reactionMs, () => {})
        .then((result) => {
          setRanking(result?.data?.ranking || []);
          setScoreMessage(result?.message || "");
        })
        .catch(() => setScoreMessage("Error al enviar puntuación."))
        .finally(() => setIsRankingLoading(false));
    }
    if (gameState === STATES.IDLE) {
      scoreSubmitted.current = false;
      setRanking([]);
      setScoreMessage("");
    }
  }, [isEnded, reactionMs, submit, gameState]);

  // Color de fondo según estado
  let bgClass = "bg-zinc-950";
  if (isWaiting) bgClass = "bg-red-800";
  if (isGreen)   bgClass = "bg-green-500";
  if (isEnded && falseStart) bgClass = "bg-red-900";
  if (isEnded && !falseStart) bgClass = "bg-green-600";

  return (
    <div
      className={`relative h-full w-full flex items-center justify-center overflow-hidden select-none
                  transition-colors duration-150 ${bgClass}`}
      onClick={handleTap}
      style={{ cursor: isWaiting || isGreen ? "pointer" : "default" }}
    >
      {/* ── Overlay gradients para UI del feed ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ── Contenido principal ── */}
      <div className="relative w-full h-full flex flex-col items-center justify-center z-2">

        {/* ── Fase WAITING (rojo) ── */}
        {isWaiting && (
          <div className="flex flex-col items-center gap-6">
            <div className="w-28 h-28 rounded-full bg-red-600 shadow-[0_0_60px_rgba(220,38,38,0.5)] flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-red-500 shadow-[inset_0_-4px_8px_rgba(0,0,0,0.3)]" />
            </div>
            <span className="text-4xl sm:text-5xl font-black text-white/90 tracking-tight">
              ESPERA...
            </span>
            <span className="text-sm text-white/40 font-medium">
              No toques aún
            </span>
          </div>
        )}

        {/* ── Fase GREEN (¡toca!) ── */}
        {isGreen && (
          <div className="flex flex-col items-center gap-6 animate-[pulse_0.6s_ease-in-out_infinite]">
            <div className="w-28 h-28 rounded-full bg-green-400 shadow-[0_0_80px_rgba(74,222,128,0.6)] flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-green-300 shadow-[inset_0_-4px_8px_rgba(0,0,0,0.15)]" />
            </div>
            <span className="text-5xl sm:text-6xl font-black text-white tracking-tight">
              ¡TOCA!
            </span>
          </div>
        )}

        {/* ── Resultado (ENDED) ── */}
        {isEnded && reactionMs !== null && (
          <div className="flex flex-col items-center gap-3">
            {/* Tiempo de reacción */}
            <span className={`text-7xl sm:text-8xl font-black font-mono tabular-nums ${getAccentColor(reactionMs)}`}
              style={{ fontFeatureSettings: "'tnum'" }}
            >
              {reactionMs}
            </span>
            <span className="text-lg text-white/50 font-semibold -mt-1">
              milisegundos
            </span>

            {/* Veredicto */}
            <span className="text-xl font-bold text-white/80 mt-3">
              {getVerdict(reactionMs)}
            </span>

            {/* Indicador de false start */}
            {falseStart && (
              <span className="text-sm text-red-300/70 font-medium mt-1">
                Tocaste antes de que se pusiera verde
              </span>
            )}
          </div>
        )}

        {/* ── Hint IDLE ── */}
        {gameState === STATES.IDLE && (
          <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
            <div className="flex flex-col items-center gap-3 animate-pulse">
              <img
                src="/logo-trafficlight.png"
                alt="Traffic Light"
                className="w-16 h-16 object-contain drop-shadow-lg"
                draggable={false}
              />
              <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
                Toca cuando se ponga verde
              </span>
            </div>
          </div>
        )}

        {/* ── GAME OVER ── */}
        {isEnded && (
          <GameOverPanel
            title={falseStart ? "¡Demasiado pronto!" : reactionMs <= 220 ? "¡Increíble!" : "Game Over"}
            score={`${reactionMs} ms`}
            subtitle={falseStart ? "penalización" : "de reacción"}
            onNext={onNextGame}
            ranking={ranking}
            scoreMessage={scoreMessage}
            isLoading={isRankingLoading}
          />
        )}
      </div>
    </div>
  );
};

export default TrafficLightGame;
