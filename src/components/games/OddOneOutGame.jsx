/**
 * OddOneOutGame.jsx — "Odd One Out"
 *
 * Clon del clásico Kuku Kube: encuentra el cuadrado de color
 * diferente en una cuadrícula que crece con cada acierto.
 *
 * - Cuadrícula de 2×2 → 8×8 máximo
 * - Diferencia de color cada vez más sutil
 * - 30 s de tiempo total (+1 s por acierto, −2 s por fallo)
 * - Vibración y flash rojo al fallar
 *
 * Props:
 *   isActive (boolean) — cuando pasa a true, arranca el reloj
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { submitScore } from "../../services/scoreService";

/* ─────────── Constantes ─────────── */

const GAME_STATES = { IDLE: "idle", PLAYING: "playing", ENDED: "ended" };
const INITIAL_TIME = 30;
const MAX_GRID = 8;
const TIME_BONUS = 1; // segundos extra por acierto
const TIME_PENALTY = 2; // segundos restados por fallo

/* ─────────── Utilidades de color ─────────── */

/** Color HSL base aleatorio con buena saturación y luminosidad */
function randomBaseColor() {
  const h = Math.floor(Math.random() * 360);
  const s = 55 + Math.floor(Math.random() * 25); // 55-80 %
  const l = 38 + Math.floor(Math.random() * 22); // 38-60 %
  return { h, s, l };
}

/** Diferencia de luminosidad según nivel (decrece → más difícil) */
function colorDiffForLevel(level) {
  return Math.max(3, 25 - (level - 1) * 2);
}

/** Genera la cuadrícula para un nivel dado */
function generateGrid(level) {
  const size = Math.min(level + 1, MAX_GRID);
  const total = size * size;
  const { h, s, l } = randomBaseColor();

  const diff = colorDiffForLevel(level);
  const dir = Math.random() > 0.5 ? 1 : -1;
  const oddL = Math.max(15, Math.min(85, l + diff * dir));

  return {
    size,
    total,
    baseColor: `hsl(${h}, ${s}%, ${l}%)`,
    oddColor: `hsl(${h}, ${s}%, ${oddL}%)`,
    oddIndex: Math.floor(Math.random() * total),
  };
}

/* ─────────── Componente React ─────────── */

const OddOneOutGame = ({ isActive, onNextGame, currentUser }) => {
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(INITIAL_TIME);
  const [gameState, setGameState] = useState(GAME_STATES.IDLE);
  const [grid, setGrid] = useState(() => generateGrid(1));

  /* Feedback visual */
  const [shaking, setShaking] = useState(false);
  const [flashCorrect, setFlashCorrect] = useState(false);
  const [penaltyFlash, setPenaltyFlash] = useState(false);
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  const timerRef = useRef(null);
  const hasStartedRef = useRef(false);

  /* ── Arrancar cuando la cuenta atrás del feed termina ── */
  useEffect(() => {
    if (isActive && !hasStartedRef.current && gameState === GAME_STATES.IDLE) {
      hasStartedRef.current = true;
      setGameState(GAME_STATES.PLAYING);
    }
  }, [isActive, gameState]);

  /* ── Temporizador (cada 1 s) ── */
  useEffect(() => {
    if (gameState !== GAME_STATES.PLAYING) {
      clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setGameState(GAME_STATES.ENDED);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [gameState]);

  /* ── Cleanup general ── */
  useEffect(() => () => clearInterval(timerRef.current), []);

  /* ── Click en celda ── */
  const handleCellClick = useCallback(
    (index) => {
      if (gameState !== GAME_STATES.PLAYING) return;

      if (index === grid.oddIndex) {
        /* ✅ Acierto */
        const newLevel = level + 1;
        setScore((s) => s + 1);
        setLevel(newLevel);
        setGrid(generateGrid(newLevel));
        setFlashCorrect(true);
        setTimeout(() => setFlashCorrect(false), 300);
      } else {
        /* ❌ Fallo */
        setTimeLeft((t) => {
          const next = t - TIME_PENALTY;
          if (next <= 0) {
            setGameState(GAME_STATES.ENDED);
            return 0;
          }
          return next;
        });
        setShaking(true);
        setPenaltyFlash(true);
        setTimeout(() => setShaking(false), 500);
        setTimeout(() => setPenaltyFlash(false), 400);
        if (navigator.vibrate) navigator.vibrate(100);
      }
    },
    [gameState, grid, level],
  );

  /* ── Reiniciar partida ── */
  const handleRestart = useCallback(() => {
    setLevel(1);
    setScore(0);
    setTimeLeft(INITIAL_TIME);
    setGrid(generateGrid(1));
    setGameState(GAME_STATES.PLAYING);
    setShaking(false);
    setFlashCorrect(false);
    setPenaltyFlash(false);
  }, []);

  /* ── Valores derivados ── */
  const timerPercent = Math.min(100, (timeLeft / INITIAL_TIME) * 100);
  const isLowTime = timeLeft <= 5;
  const isPlaying = gameState === GAME_STATES.PLAYING;
  const isEnded = gameState === GAME_STATES.ENDED;

  // Enviar puntuación al terminar
  useEffect(() => {
    if (isEnded && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submitScore("odd-one-out", score, currentUser?.id)
        .then((result) => {
          setRanking(result.ranking || []);
          setScoreMessage(result.message || "");
        })
        .catch(() => setScoreMessage("Error al enviar puntuación."))
        .finally(() => setIsRankingLoading(false));
    }
    if (gameState === GAME_STATES.IDLE) {
      scoreSubmitted.current = false;
      setRanking([]);
      setScoreMessage("");
    }
  }, [isEnded, score, currentUser, gameState]);

  const gapPx = grid.size <= 3 ? 10 : grid.size <= 5 ? 6 : grid.size <= 7 ? 4 : 3;
  const radius = grid.size <= 4 ? 12 : grid.size <= 6 ? 8 : 5;

  return (
    <div className="w-full h-full relative overflow-hidden bg-gradient-to-br from-[#0f2027] via-[#203a43] to-[#2c5364]">
      {/* Keyframes para shake */}
      <style>{`
        @keyframes oddShake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-6px)}
          40%{transform:translateX(6px)}
          60%{transform:translateX(-4px)}
          80%{transform:translateX(4px)}
        }
      `}</style>

      {/* Decorative glow detrás del grid */}
      <div
        className="absolute w-[60vw] h-[60vw] rounded-full opacity-[0.08] blur-3xl pointer-events-none"
        style={{ background: grid.baseColor, top: "18%", left: "20%" }}
      />

      {/* Gradientes para overlay de Scrollinn (UI legible) */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-gradient-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-[5]" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/30 to-transparent pointer-events-none z-[5]" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-black/15 to-transparent pointer-events-none z-[5]" />

      {/* Flash de penalización (rojo) */}
      {penaltyFlash && (
        <div className="absolute inset-0 bg-red-500/15 z-[4] pointer-events-none" />
      )}
      {/* Flash de acierto (verde) */}
      {flashCorrect && (
        <div className="absolute inset-0 bg-emerald-400/10 z-[4] pointer-events-none" />
      )}

      {/* ==================== CONTENIDO ==================== */}
      <div className="relative w-full h-full flex flex-col items-center justify-center z-[2]">

        {/* ── HUD: Timer + Score + Nivel (compacto, encima del grid) ── */}
        {gameState !== GAME_STATES.IDLE && (
          <div className="w-full flex flex-col items-center gap-1.5 mb-4 px-6 z-[3]">
            {/* Barra de progreso */}
            <div className="w-full max-w-[320px] h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                  isLowTime ? "bg-red-500" : "bg-emerald-400"
                }`}
                style={{ width: `${timerPercent}%` }}
              />
            </div>
            {/* Stats row */}
            <div className="flex items-center justify-between w-full max-w-[320px]">
              <span
                className={`text-xs font-mono font-bold tabular-nums ${
                  isLowTime ? "text-red-400 animate-pulse" : "text-white/50"
                }`}
              >
                {timeLeft}s
              </span>
              <span className="text-white/80 text-lg font-black tabular-nums" style={{ fontFeatureSettings: "'tnum'" }}>
                {score}
              </span>
              <span className="text-white/30 text-[10px] font-medium tracking-wider uppercase">
                Nivel {level}
              </span>
            </div>
          </div>
        )}

        {/* ========== GRID ========== */}
        <div
          className="px-6"
          style={{ animation: shaking ? "oddShake 0.5s ease-in-out" : "none" }}
        >
          <div
            className="aspect-square"
            style={{
              width: "min(72vw, 360px)",
              display: "grid",
              gridTemplateColumns: `repeat(${grid.size}, 1fr)`,
              gap: `${gapPx}px`,
            }}
          >
            {Array.from({ length: grid.total }, (_, i) => (
              <button
                key={`${level}-${i}`}
                onClick={() => handleCellClick(i)}
                disabled={!isPlaying}
                className={`transition-transform duration-75 ${
                  isPlaying
                    ? "cursor-pointer active:scale-90 hover:brightness-110"
                    : "cursor-default"
                }`}
                style={{
                  backgroundColor:
                    i === grid.oddIndex ? grid.oddColor : grid.baseColor,
                  borderRadius: `${radius}px`,
                  aspectRatio: "1",
                }}
              />
            ))}
          </div>
        </div>

        {/* Hint en IDLE (visible detrás de la cuenta atrás del feed) */}
        {gameState === GAME_STATES.IDLE && (
          <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-[3]">
            <div className="flex flex-col items-center gap-3 animate-pulse">
              <img src="/logo-oddoneout.png" alt="Odd One Out" className="w-16 h-16 object-contain drop-shadow-lg" draggable={false} />
              <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
                Encuentra al infiltrado
              </span>
            </div>
          </div>
        )}

        {/* ========== GAME OVER ========== */}
        {isEnded && (
          <GameOverPanel
            title="Game Over"
            score={score}
            subtitle={`Nivel alcanzado: ${level}`}
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

export default OddOneOutGame;
