/**
 * SweetSpotGame.jsx — "Sweet Spot"
 *
 * Un indicador se mueve de izquierda a derecha (rebotando)
 * sobre una barra horizontal. El jugador toca la pantalla
 * para detenerlo dentro de la zona verde (sweet spot).
 *
 * - Acierto: +1 punto, nueva zona, +5% velocidad, zona más estrecha.
 * - Fallo: −1 vida, flash rojo.
 * - 3 vidas. Cuando llegan a 0 → onGameOver(score).
 *
 * Props:
 *   isActive   – cuando pasa a true, arranca el juego
 *   onNextGame – callback para "siguiente juego"
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";

/* ─────────── Constantes ─────────── */
const STATES = { IDLE: "idle", PLAYING: "playing", PAUSED: "paused", ENDED: "ended" };

const MAX_LIVES        = 3;
const INITIAL_SPEED    = 0.08;   // % de barra por ms — arranque suave
const SPEED_MULTIPLIER = 1.10;   // +10% por acierto (incremental agresivo)
const INITIAL_ZONE_PCT = 18;     // % del ancho de barra que ocupa la zona
const MIN_ZONE_PCT     = 6;      // mínimo tamaño de la zona
const ZONE_SHRINK      = 0.92;   // multiplicador por acierto
const PAUSE_DURATION   = 500;    // ms que se pausa tras tocar

/* ─────────── Helpers ─────────── */
function randomZoneLeft(zonePct) {
  // Deja margen para que la zona no se salga
  const maxLeft = 100 - zonePct;
  return Math.random() * maxLeft;
}

/* ═══════════════════ COMPONENT ═══════════════════ */
const SweetSpotGame = ({ isActive, onNextGame, userId }) => {
  const [gameState, setGameState] = useState(STATES.IDLE);
  const [score, setScore]         = useState(0);
  const [lives, setLives]         = useState(MAX_LIVES);
  const [zonePct, setZonePct]     = useState(INITIAL_ZONE_PCT);
  const [zoneLeft, setZoneLeft]   = useState(() => randomZoneLeft(INITIAL_ZONE_PCT));
  const [indicatorPct, setIndicatorPct] = useState(0);  // 0-100 posición del indicador
  const [flash, setFlash]         = useState("");         // "" | "correct" | "wrong"
  const [resultMsg, setResultMsg] = useState("");         // "+1" / "−❤️"

  const speedRef     = useRef(INITIAL_SPEED);
  const directionRef = useRef(1);            // 1 = derecha, -1 = izquierda
  const posRef       = useRef(0);            // posición real (para rAF)
  const rafRef       = useRef(null);
  const lastTimeRef  = useRef(null);
  const flashRef     = useRef(null);
  const pauseRef     = useRef(null);
  const isPausedRef  = useRef(false);

  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  const { submit, loading: isSubmittingScore } = useSubmitScore(userId, GAME_IDS.SweetSpotGame);

  /* ── Arrancar partida ── */
  const startGame = useCallback(() => {
    setScore(0);
    setLives(MAX_LIVES);
    setZonePct(INITIAL_ZONE_PCT);
    setZoneLeft(randomZoneLeft(INITIAL_ZONE_PCT));
    setIndicatorPct(0);
    setFlash("");
    setResultMsg("");
    posRef.current = 0;
    directionRef.current = 1;
    speedRef.current = INITIAL_SPEED;
    isPausedRef.current = false;
    lastTimeRef.current = null;
    setGameState(STATES.PLAYING);
  }, []);

  /* ── Auto-start ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, startGame, gameState]);

  /* ── rAF loop — movimiento fluido a 60fps ── */
  useEffect(() => {
    if (gameState !== STATES.PLAYING) return;

    const tick = (timestamp) => {
      if (isPausedRef.current) {
        lastTimeRef.current = timestamp;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (lastTimeRef.current === null) {
        lastTimeRef.current = timestamp;
      }

      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      let newPos = posRef.current + speedRef.current * delta * directionRef.current;

      // Rebote en bordes
      if (newPos >= 100) {
        newPos = 100 - (newPos - 100);
        directionRef.current = -1;
      } else if (newPos <= 0) {
        newPos = -newPos;
        directionRef.current = 1;
      }

      posRef.current = newPos;
      setIndicatorPct(newPos);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [gameState]);

  /* ── Cleanup general ── */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(flashRef.current);
      clearTimeout(pauseRef.current);
    };
  }, []);

  /* ── Tap del jugador ── */
  const handleTap = useCallback(() => {
    if (gameState !== STATES.PLAYING || isPausedRef.current) return;

    // Pausar indicador
    isPausedRef.current = true;

    const pos = posRef.current;
    const inZone = pos >= zoneLeft && pos <= zoneLeft + zonePct;

    if (inZone) {
      /* ✅ ACIERTO */
      const newScore = score + 1;
      setScore(newScore);
      setFlash("correct");
      setResultMsg("+1");
      speedRef.current *= SPEED_MULTIPLIER;

      const newZonePct = Math.max(MIN_ZONE_PCT, zonePct * ZONE_SHRINK);

      clearTimeout(flashRef.current);
      flashRef.current = setTimeout(() => setFlash(""), 300);

      clearTimeout(pauseRef.current);
      pauseRef.current = setTimeout(() => {
        setZonePct(newZonePct);
        setZoneLeft(randomZoneLeft(newZonePct));
        isPausedRef.current = false;
        setResultMsg("");
      }, PAUSE_DURATION);
    } else {
      /* ❌ FALLO */
      const newLives = lives - 1;
      setLives(newLives);
      setFlash("wrong");
      setResultMsg("−❤️");

      clearTimeout(flashRef.current);
      flashRef.current = setTimeout(() => setFlash(""), 400);

      if (newLives <= 0) {
        /* Game over */
        clearTimeout(pauseRef.current);
        pauseRef.current = setTimeout(() => {
          setGameState(STATES.ENDED);
        }, 500);
      } else {
        clearTimeout(pauseRef.current);
        pauseRef.current = setTimeout(() => {
          isPausedRef.current = false;
          setResultMsg("");
        }, PAUSE_DURATION);
      }
    }
  }, [gameState, score, lives, zoneLeft, zonePct]);

  /* ── Derivados ── */
  const isPlaying = gameState === STATES.PLAYING;
  const isEnded   = gameState === STATES.ENDED;

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
        .catch(() => setScoreMessage("Error al enviar puntuación."))
        .finally(() => setIsRankingLoading(false));
    }
    if (gameState === STATES.IDLE) {
      scoreSubmitted.current = false;
      setRanking([]);
      setScoreMessage("");
    }
  }, [isEnded, score, submit, gameState]);

  return (
    <div
      className="relative h-full w-full flex items-center justify-center bg-zinc-950 overflow-hidden select-none"
      onClick={isPlaying ? handleTap : undefined}
      style={{ cursor: isPlaying ? "pointer" : "default" }}
    >
      {/* ── Overlay gradients para UI del feed ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* Flash overlays */}
      {flash === "correct" && (
        <div className="absolute inset-0 bg-emerald-400/10 z-4 pointer-events-none transition-opacity" />
      )}
      {flash === "wrong" && (
        <div className="absolute inset-0 bg-red-500/20 z-4 pointer-events-none transition-opacity" />
      )}

      {/* ── Contenido principal ── */}
      <div className="relative w-full h-full flex flex-col items-center justify-center z-2 px-6">

        {/* ── HUD: Score + Vidas ── */}
        {gameState !== STATES.IDLE && (
          <div className="absolute top-16 left-0 right-0 flex items-center justify-between px-8 z-3">
            {/* Score */}
            <div className="flex items-center gap-2">
              <span className="text-3xl font-black text-white tabular-nums" style={{ fontFeatureSettings: "'tnum'" }}>
                {score}
              </span>
              {resultMsg && (
                <span className={`text-lg font-bold animate-[fadeUp_0.4s_ease] ${
                  resultMsg === "+1" ? "text-emerald-400" : "text-red-400"
                }`}>
                  {resultMsg}
                </span>
              )}
            </div>
            {/* Vidas */}
            <div className="flex gap-1.5">
              {Array.from({ length: MAX_LIVES }).map((_, i) => (
                <span
                  key={i}
                  className={`text-xl transition-all duration-200 ${
                    i < lives ? "opacity-100 scale-100" : "opacity-20 scale-75"
                  }`}
                >
                  ❤️
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ══════════ BARRA DE JUEGO ══════════ */}
        {isPlaying && (
          <div className="w-full max-w-md flex flex-col items-center gap-6">
            {/* Instrucción */}
            <span className="text-sm font-medium text-white/30 tracking-wider uppercase">
              Toca cuando esté en verde
            </span>

            {/* Barra */}
            <div className="relative w-full h-16 bg-zinc-800/80 rounded-2xl overflow-hidden border border-white/5">
              {/* Zona verde (sweet spot) */}
              <div
                className="absolute top-0 bottom-0 bg-emerald-500/50 rounded-lg"
                style={{ left: `${zoneLeft}%`, width: `${zonePct}%` }}
              >
                {/* Borde interior luminoso */}
                <div className="absolute inset-0 rounded-lg border-2 border-emerald-400/40" />
                {/* Brillo central */}
                <div className="absolute inset-0 rounded-lg bg-emerald-400/20" />
              </div>

              {/* Indicador (línea que se mueve) */}
              <div
                className={`absolute top-0 bottom-0 w-1 rounded-full transition-none ${
                  flash === "correct"
                    ? "bg-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.8)]"
                    : flash === "wrong"
                    ? "bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.8)]"
                    : "bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                }`}
                style={{ left: `${indicatorPct}%`, transform: "translateX(-50%)" }}
              />
            </div>

            {/* Nivel visual */}
            <div className="flex items-center gap-3 text-xs text-white/20">
              <span>Velocidad: {Math.round((speedRef.current / INITIAL_SPEED) * 100)}%</span>
              <span>·</span>
              <span>Zona: {Math.round(zonePct)}%</span>
            </div>
          </div>
        )}

        {/* ── Resultado final ── */}
        {isEnded && (
          <div className="flex flex-col items-center gap-2 mb-4">
            <span className="text-7xl sm:text-8xl font-black text-white tabular-nums" style={{ fontFeatureSettings: "'tnum'" }}>
              {score}
            </span>
            <span className="text-lg text-white/50 font-semibold">
              aciertos seguidos
            </span>
          </div>
        )}

        {/* ── Hint IDLE ── */}
        {gameState === STATES.IDLE && (
          <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
            <div className="flex flex-col items-center gap-3 animate-pulse">
              <img
                src="/logo-sweetspot.png"
                alt="Sweet Spot"
                className="w-16 h-16 object-contain drop-shadow-lg"
                draggable={false}
              />
              <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
                Detén la línea en la zona verde
              </span>
            </div>
          </div>
        )}

        {/* ── GAME OVER ── */}
        {isEnded && (
          <GameOverPanel
            title="Game Over"
            score={score}
            subtitle="aciertos"
            onNext={onNextGame}
            ranking={ranking}
            scoreMessage={scoreMessage}
            isLoading={isRankingLoading}
          />
        )}
      </div>

      {/* ── Keyframes para fadeUp ── */}
      <style>{`
        @keyframes fadeUp {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-18px); }
        }
      `}</style>
    </div>
  );
};

export default SweetSpotGame;
