/**
 * PerfectScaleGame.jsx — "Perfect Scale"
 *
 * Minijuego de precisión: en el centro de la pantalla hay un
 * círculo-objetivo con borde discontinuo. Al mantener pulsado,
 * un "globo" sólido crece desde el centro. Al soltar, se mide
 * la diferencia de diámetro entre el globo y el objetivo.
 *
 * Puntuación = diferencia en px (cuanto más cerca de 0, mejor).
 * Un solo intento por partida.
 *
 * Props:
 *   isActive   – cuando pasa a true, permite jugar
 *   onNextGame – callback para "siguiente juego"
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ─────────── Constantes ─────────── */
const STATES = { IDLE: "idle", READY: "ready", INFLATING: "inflating", ENDED: "ended" };

const MIN_TARGET = 220; // px diámetro mínimo
const MAX_TARGET = 380; // px diámetro máximo
const MIN_GROW   = 130; // px/s velocidad mínima de crecimiento
const MAX_GROW   = 210; // px/s velocidad máxima de crecimiento
const START_SIZE = 12;  // px diámetro inicial del globo (puntito)

/* ═══════════════════ COMPONENT ═══════════════════ */
const PerfectScaleGame = ({ isActive, onNextGame, onReplay, userId, pinchGuardRef }) => {
  const { t } = useLanguage();
  const [gameState, setGameState] = useState(STATES.IDLE);
  const [targetSize, setTargetSize] = useState(220);
  const [balloonSize, setBalloonSize] = useState(START_SIZE);
  const [score, setScore] = useState(null);

  // Refs
  const gameStateRef   = useRef(STATES.IDLE);
  const balloonRef     = useRef(START_SIZE);
  const targetRef      = useRef(220);
  const rafRef         = useRef(null);
  const lastTimeRef    = useRef(null);
  const resultShownRef = useRef(false);
  const growSpeedRef   = useRef(170);

  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  const { submit, loading: isSubmittingScore, error: submitError, lastResult, xpGained } = useSubmitScore(userId, GAME_IDS.PerfectScaleGame);

  /* ── Generar objetivo aleatorio y preparar ── */
  const initRound = useCallback(() => {
    const t = Math.round(MIN_TARGET + Math.random() * (MAX_TARGET - MIN_TARGET));
    const speed = MIN_GROW + Math.random() * (MAX_GROW - MIN_GROW);
    targetRef.current    = t;
    growSpeedRef.current = speed;
    balloonRef.current   = START_SIZE;
    lastTimeRef.current  = null;
    resultShownRef.current = false;
    setTargetSize(t);
    setBalloonSize(START_SIZE);
    setScore(null);
    gameStateRef.current = STATES.READY;
    setGameState(STATES.READY);
  }, []);

  /* ── Auto-start ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) initRound();
  }, [isActive, initRound, gameState]);

  /* ── rAF loop: inflar el globo mientras se mantiene pulsado ── */
  const inflate = useCallback((timestamp) => {
    if (gameStateRef.current !== STATES.INFLATING) return;

    if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
    const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05);
    lastTimeRef.current = timestamp;

    balloonRef.current += growSpeedRef.current * dt;
    setBalloonSize(balloonRef.current);

    rafRef.current = requestAnimationFrame(inflate);
  }, []);

  /* ── Pointer handlers ── */
  const handleDown = useCallback(() => {
    if (gameStateRef.current !== STATES.READY) return;
    if (pinchGuardRef?.current) return;               // LEY 5
    gameStateRef.current = STATES.INFLATING;
    setGameState(STATES.INFLATING);
    lastTimeRef.current = null;
    rafRef.current = requestAnimationFrame(inflate);
  }, [inflate]);

  const handleUp = useCallback(() => {
    if (gameStateRef.current !== STATES.INFLATING) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    gameStateRef.current = STATES.ENDED;

    const diff = Math.round(Math.abs(targetRef.current - balloonRef.current));
    setScore(diff);
    setGameState(STATES.ENDED);
  }, []);

  /* ── Cleanup ── */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /* ── Derivados ── */
  const isEnded     = gameState === STATES.ENDED;
  const isInflating = gameState === STATES.INFLATING;
  const isReady     = gameState === STATES.READY;

  // Enviar puntuación al terminar (is_lower_better=true, score = diff en px)
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

  // Precisión visual: de 0 (lejos) a 1 (perfecto)
  const precision   = score !== null ? Math.max(0, 1 - score / 150) : 0;

  // Feedback visual del globo: de cyan a verde/rojo según se acerque o pase
  const overshoot = balloonRef.current - targetRef.current;
  const closeness = Math.abs(overshoot) / targetRef.current;
  const balloonHue = overshoot > 0
    ? `hsl(${Math.max(0, 180 - closeness * 300)}, 80%, 60%)`   // cyan → rojo si se pasa
    : `hsl(${180 + closeness * 40}, 80%, 60%)`;                  // cyan → un poco azul si corto

  // Texto de feedback final
  const feedbackText = score !== null
    ? score === 0 ? t("perfectscale.perfect") : score <= 5 ? t("perfectscale.almost") : score <= 15 ? t("perfectscale.great") : score <= 30 ? t("perfectscale.not_bad") : t("perfectscale.keep_trying")
    : "";

  const feedbackColor = score !== null
    ? score <= 5 ? "text-emerald-400" : score <= 15 ? "text-lime-400" : score <= 30 ? "text-amber-400" : "text-red-400"
    : "";

  return (
    <div
      className="relative h-full w-full flex items-center justify-center bg-zinc-950 overflow-hidden select-none"
      style={{
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onPointerLeave={handleUp}
    >
      {/* ── Overlay gradients para UI del feed ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ── Círculo objetivo (borde discontinuo) ── */}
      {gameState !== STATES.IDLE && (
        <div
          className="absolute rounded-full pointer-events-none z-1 transition-opacity duration-300"
          style={{
            width: `${targetSize}px`,
            height: `${targetSize}px`,
            border: isEnded
              ? `2px solid ${score <= 5 ? "rgba(52,211,153,0.7)" : score <= 15 ? "rgba(163,230,53,0.5)" : "rgba(107,114,128,0.3)"}`
              : "2px dashed rgba(107,114,128,0.4)",
            opacity: 1,
          }}
        />
      )}

      {/* ── Globo (crece desde el centro) ── */}
      {gameState !== STATES.IDLE && (
        <div
          className="absolute rounded-full pointer-events-none z-2"
          style={{
            width: `${balloonSize}px`,
            height: `${balloonSize}px`,
            backgroundColor: isEnded
              ? (score <= 5 ? "rgba(52,211,153,0.6)" : score <= 15 ? "rgba(163,230,53,0.5)" : score <= 30 ? "rgba(251,191,36,0.4)" : "rgba(239,68,68,0.4)")
              : balloonHue,
            opacity: isInflating ? 0.7 : 0.5,
            boxShadow: isInflating
              ? `0 0 ${Math.min(40, balloonSize * 0.15)}px ${balloonHue}`
              : "none",
            transition: isEnded ? "background-color 0.3s, opacity 0.3s" : "none",
          }}
        />
      )}

      {/* ── Punto central (siempre visible como referencia) ── */}
      {(isReady || isInflating) && (
        <div
          className="absolute w-3 h-3 rounded-full bg-cyan-400 z-3 pointer-events-none"
          style={{
            boxShadow: "0 0 12px rgba(34,211,238,0.6)",
          }}
        />
      )}

      {/* ── HUD ── */}
      <div className="relative w-full h-full z-3 pointer-events-none">

        {/* Instrucción durante juego */}
        {isReady && (
          <div className="absolute top-20 inset-x-0 flex justify-center">
            <span className="text-sm font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-5 py-2.5 rounded-xl animate-pulse">
              {t("perfectscale.hold_inflate")}
            </span>
          </div>
        )}

        {isInflating && (
          <div className="absolute top-20 inset-x-0 flex justify-center">
            <span className="text-sm font-bold text-cyan-400/70 bg-white/5 backdrop-blur-sm px-5 py-2.5 rounded-xl">
              {t("perfectscale.release")}
            </span>
          </div>
        )}

        {/* Tamaño actual en tiempo real */}
        {isInflating && (
          <div className="absolute bottom-[28vh] inset-x-0 flex justify-center">
            <span
              className="text-4xl font-black text-white/60 tabular-nums"
              style={{ fontFeatureSettings: "'tnum'" }}
            >
              {Math.round(balloonSize)}<span className="text-lg text-white/30 ml-1">px</span>
            </span>
          </div>
        )}

        {/* ── Hint IDLE ── */}
        {gameState === STATES.IDLE && (
          <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
            <div className="flex flex-col items-center gap-3 animate-pulse">
              <img
                src="/logo-perfectscale.png"
                alt="Perfect Scale"
                className="w-16 h-16 object-contain drop-shadow-lg"
                draggable={false}
              />
              <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
                {t("perfectscale.inflate_edge")}
              </span>
            </div>
          </div>
        )}

        {/* ── Resultado final ── */}
        {isEnded && score !== null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="flex flex-col items-center gap-1 mb-2">
              <span className={`text-base font-bold ${feedbackColor}`}>
                {feedbackText}
              </span>
              <span
                className="text-7xl sm:text-8xl font-black text-white tabular-nums leading-none"
                style={{ fontFeatureSettings: "'tnum'" }}
              >
                {score}
              </span>
              <span className="text-sm text-white/40 font-semibold">
                {t("perfectscale.px_diff")}
              </span>
              <div className="flex items-center gap-3 mt-2 text-xs text-white/30">
                <span>{t("perfectscale.target")}: {targetSize}px</span>
                <span>·</span>
                <span>{t("perfectscale.your_balloon")}: {Math.round(balloonSize)}px</span>
              </div>
            </div>
          </div>
        )}

        {/* ── GAME OVER ── */}
        {isEnded && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
            <GameOverPanel
              title="Game Over"
              score={`${score}px`}
              subtitle={t("perfectscale.subtitle")}
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
    </div>
  );
};

export default PerfectScaleGame;
