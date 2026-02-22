/**
 * TimerGame.jsx — "Timer"
 *
 * Minijuego de precisión temporal: un cronómetro digital gigante
 * corre a toda velocidad. El jugador tiene UN SOLO intento para
 * detenerlo exactamente en 09:999 (justo antes de los 10 s).
 *
 * Puntuación = Math.abs(9999 - tiempoDetenidoEnMs)
 * Cuanto más cerca de 0, mejor.
 *
 * Props:
 *   isActive   – cuando pasa a true, arranca el cronómetro
 *   onNextGame – callback para "siguiente juego"
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage, t } from "../../i18n";

/* ─────────── Constantes ─────────── */
const STATES  = { IDLE: "idle", PLAYING: "playing", ENDED: "ended" };
const TARGET  = 9999; // ms objetivo

/* ─────────── Helpers ─────────── */
/** Formatea ms → "SS:mmm" */
function formatTime(ms) {
  const clamped = Math.max(0, ms);
  const secs = Math.floor(clamped / 1000);
  const millis = clamped % 1000;
  return `${String(secs).padStart(2, "0")}:${String(millis).padStart(3, "0")}`;
}

/** Califica la diferencia */
function getVerdict(diff) {
  if (diff === 0) return t("timer.perfect");
  if (diff <= 10) return t("timer.incredible");
  if (diff <= 50) return t("timer.very_close");
  if (diff <= 150) return t("timer.good_try");
  if (diff <= 500) return t("timer.not_bad");
  if (diff <= 1500) return t("timer.can_improve");
  return t("timer.keep_trying");
}

/** Color de acento según diferencia */
function getAccentColor(diff) {
  if (diff <= 10) return "text-emerald-400";
  if (diff <= 50) return "text-cyan-400";
  if (diff <= 150) return "text-blue-400";
  if (diff <= 500) return "text-amber-400";
  if (diff <= 1500) return "text-orange-400";
  return "text-red-400";
}

/* ═══════════════════ COMPONENT ═══════════════════ */
const TimerGame = ({ isActive, onNextGame, onReplay, userId }) => {
  useLanguage(); // subscribe to lang changes for re-render
  const [gameState, setGameState] = useState(STATES.IDLE);
  const [displayMs, setDisplayMs] = useState(0);       // ms que se muestran
  const [stoppedMs, setStoppedMs] = useState(null);     // ms en el que paró
  const [score, setScore]         = useState(null);     // diferencia absoluta

  const rafRef   = useRef(null);
  const startRef = useRef(null);     // performance.now() al arrancar
  const elapsedRef = useRef(0);      // ms reales transcurridos (mirror)

  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  const { submit, loading: isSubmittingScore } = useSubmitScore(userId, GAME_IDS.TimerGame);

  /* ── Arrancar partida ── */
  const startGame = useCallback(() => {
    setDisplayMs(0);
    setStoppedMs(null);
    setScore(null);
    elapsedRef.current = 0;
    setGameState(STATES.PLAYING);
  }, []);

  /* ── Auto-start ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, startGame, gameState]);

  /* ── requestAnimationFrame loop ── */
  useEffect(() => {
    if (gameState !== STATES.PLAYING) return;

    startRef.current = performance.now();

    const tick = (now) => {
      const elapsed = Math.floor(now - startRef.current);
      elapsedRef.current = elapsed;
      setDisplayMs(elapsed);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [gameState]);

  /* ── Cleanup global ── */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /* ── Detener cronómetro (un solo clic) ── */
  const handleStop = useCallback(() => {
    if (gameState !== STATES.PLAYING) return;

    // Parar animación
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const finalMs = elapsedRef.current;
    const diff = Math.abs(TARGET - finalMs);

    setStoppedMs(finalMs);
    setDisplayMs(finalMs);
    setScore(diff);
    setGameState(STATES.ENDED);
  }, [gameState]);

  /* ── Derivados ── */
  const isPlaying = gameState === STATES.PLAYING;
  const isEnded   = gameState === STATES.ENDED;

  // Enviar puntuación al terminar (is_lower_better=true, score = diferencia)
  useEffect(() => {
    if (isEnded && score !== null && !scoreSubmitted.current) {
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
  const timeStr   = formatTime(displayMs);

  // En estado "playing" separamos segundos y milisegundos del display
  const [secsPart, milliPart] = timeStr.split(":");

  // Indicador de zona: verde si estamos cerca
  const inTargetZone = displayMs >= 9000 && displayMs <= 11000;

  return (
    <div className="relative h-full w-full flex items-center justify-center bg-zinc-950 overflow-hidden select-none">

      {/* ── Overlay gradients para UI del feed ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ── Fondo decorativo: anillo de referencia ── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        <div
          className={`w-72 h-72 sm:w-96 sm:h-96 rounded-full border transition-colors duration-300 ${
            inTargetZone && isPlaying
              ? "border-emerald-500/30 shadow-[0_0_60px_rgba(16,185,129,0.15)]"
              : "border-white/5"
          }`}
        />
      </div>

      {/* ── Contenido principal ── */}
      <div className="relative w-full h-full flex flex-col items-center justify-center z-2">

        {/* ── Objetivo ── */}
        {isPlaying && (
          <div className="mb-4">
            <span className="text-xs font-medium tracking-[0.25em] uppercase text-white/30">
              {t("timer.target")}
            </span>
            <p className="text-center font-mono text-lg text-white/20 tabular-nums">
              09:999
            </p>
          </div>
        )}

        {/* ══════════ CRONÓMETRO GIGANTE ══════════ */}
        {(isPlaying || gameState === STATES.IDLE) && (
          <div className="flex items-baseline font-mono tabular-nums select-none">
            <span
              className={`text-7xl sm:text-8xl font-black tracking-tight transition-colors duration-150 ${
                inTargetZone && isPlaying ? "text-emerald-400" : "text-white"
              }`}
              style={{ fontFeatureSettings: "'tnum'" }}
            >
              {secsPart}
            </span>
            <span
              className={`text-7xl sm:text-8xl font-black transition-colors duration-150 ${
                inTargetZone && isPlaying ? "text-emerald-400/60" : "text-white/40"
              }`}
            >
              :
            </span>
            <span
              className={`text-5xl sm:text-6xl font-bold tracking-tight transition-colors duration-150 ${
                inTargetZone && isPlaying ? "text-emerald-400/80" : "text-white/60"
              }`}
              style={{ fontFeatureSettings: "'tnum'" }}
            >
              {milliPart}
            </span>
          </div>
        )}

        {/* ── Instrucción / Tap zone ── */}
        {isPlaying && (
          <button
            onClick={handleStop}
            className="mt-12 px-12 py-5 rounded-2xl bg-white/15 border border-white/25 
                       active:scale-95 active:bg-white/25 transition-all cursor-pointer
                       shadow-[0_0_20px_rgba(255,255,255,0.06)]"
          >
            <span className="text-base font-bold text-white/90 tracking-wider uppercase">
              {t("timer.tap_stop")}
            </span>
          </button>
        )}

        {/* ── Resultado tras detener ── */}
        {isEnded && stoppedMs !== null && score !== null && (
          <div className="flex flex-col items-center gap-3 animate-[fadeIn_0.3s_ease]">
            {/* Tiempo conseguido */}
            <div className="flex items-baseline font-mono tabular-nums">
              <span className={`text-7xl sm:text-8xl font-black ${getAccentColor(score)}`}>
                {formatTime(stoppedMs)}
              </span>
            </div>

            {/* Veredicto */}
            <span className="text-lg font-bold text-white/80 mt-2">
              {getVerdict(score)}
            </span>

            {/* Diferencia */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-white/40 uppercase tracking-wider">{t("timer.difference")}</span>
              <span className={`text-xl font-mono font-black tabular-nums ${getAccentColor(score)}`}>
                {score} ms
              </span>
            </div>
          </div>
        )}

        {/* ── Hint IDLE ── */}
        {gameState === STATES.IDLE && (
          <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
            <div className="flex flex-col items-center gap-3 animate-pulse">
              <img
                src="/logo-timer.png"
                alt="Timer"
                className="w-16 h-16 object-contain drop-shadow-lg"
                draggable={false}
              />
              <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
                {t("timer.instruction")}
              </span>
            </div>
          </div>
        )}

        {/* ── GAME OVER ── */}
        {isEnded && (
          <GameOverPanel
            title={score !== null && score <= 50 ? t("timer.title_amazing") : "Game Over"}
            score={`${score} ms`}
            subtitle={t("timer.subtitle")}
            onReplay={onReplay}
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

export default TimerGame;
