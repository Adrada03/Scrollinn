/**
 * MemoryLoopGame.jsx — "Memory Loop"
 *
 * Clon experto de Simon Says con cuadrícula 3×3 (9 botones).
 * El juego muestra una secuencia creciente que el jugador debe reproducir
 * de memoria. Cada ronda añade un paso más. Un fallo o agotar el tiempo
 * es Game Over inmediato.
 *
 * Props:
 *   isActive    – cuando pasa a true, arranca la primera ronda
 *   onNextGame  – callback para ir al siguiente juego
 *   userId      – ID del usuario para enviar puntuación
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ─────────── Constantes ─────────── */
const STATES = { IDLE: "idle", PLAYING: "playing", ENDED: "ended" };
const GRID = 3;
const CELLS = GRID * GRID;

/** 9 colores vibrantes para cada botón de la cuadrícula */
const BUTTON_COLORS = [
  { base: "bg-red-600",     lit: "bg-red-400",     ring: "ring-red-400/60"     },
  { base: "bg-green-600",   lit: "bg-green-400",   ring: "ring-green-400/60"   },
  { base: "bg-blue-600",    lit: "bg-blue-400",    ring: "ring-blue-400/60"    },
  { base: "bg-yellow-500",  lit: "bg-yellow-300",  ring: "ring-yellow-300/60"  },
  { base: "bg-purple-600",  lit: "bg-purple-400",  ring: "ring-purple-400/60"  },
  { base: "bg-cyan-600",    lit: "bg-cyan-400",    ring: "ring-cyan-400/60"    },
  { base: "bg-orange-600",  lit: "bg-orange-400",  ring: "ring-orange-400/60"  },
  { base: "bg-pink-600",    lit: "bg-pink-400",    ring: "ring-pink-400/60"    },
  { base: "bg-lime-600",    lit: "bg-lime-400",    ring: "ring-lime-400/60"    },
];

/** Tiempo límite para reproducir la secuencia (ms) */
function timeForSequence(len) {
  return 2000 + 900 * len;
}

/** Pausa entre cada flash durante la muestra (ms) */
const SHOW_ON = 420;
const SHOW_OFF = 200;

/* ─────────── Helpers ─────────── */
function randomCell() {
  return Math.floor(Math.random() * CELLS);
}

/* ═══════════════════ COMPONENT ═══════════════════ */
const MemoryLoopGame = ({ isActive, onNextGame, userId }) => {
  const { t } = useLanguage();

  /* ── Estado principal ── */
  const [gameState, setGameState]         = useState(STATES.IDLE);
  const [sequence, setSequence]           = useState([]);      // secuencia completa
  const [playerIndex, setPlayerIndex]     = useState(0);       // posición del jugador
  const [score, setScore]                 = useState(0);       // rondas completadas
  const [isShowingPattern, setIsShowingPattern] = useState(false);
  const [litCell, setLitCell]             = useState(-1);      // botón iluminado actualmente
  const [flashCell, setFlashCell]         = useState(-1);      // flash por tap del jugador
  const [flashError, setFlashError]       = useState(-1);      // flash rojo al equivocarse

  /* ── Barra de tiempo ── */
  const [timeLimit, setTimeLimit]         = useState(0);       // duración total (ms)
  const [timeLeft, setTimeLeft]           = useState(0);       // tiempo restante (ms)
  const timerStartRef  = useRef(0);
  const timerTotalRef  = useRef(0);
  const rafRef         = useRef(null);

  /* ── Ranking / score ── */
  const [ranking, setRanking]             = useState([]);
  const [scoreMessage, setScoreMessage]   = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  const { submit } = useSubmitScore(userId, GAME_IDS.MemoryLoopGame);

  /* ── Refs para evitar stale closures ── */
  const sequenceRef    = useRef(sequence);
  const playerIndexRef = useRef(playerIndex);
  const gameStateRef   = useRef(gameState);
  const showTimeoutIds = useRef([]);

  useEffect(() => { sequenceRef.current = sequence; }, [sequence]);
  useEffect(() => { playerIndexRef.current = playerIndex; }, [playerIndex]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  /* ─────────── Funciones de ronda ─────────── */

  /** Muestra la secuencia iluminando botones uno a uno */
  const showPattern = useCallback((seq) => {
    setIsShowingPattern(true);
    setLitCell(-1);

    // Limpiar timeouts previos si existieran
    showTimeoutIds.current.forEach(clearTimeout);
    showTimeoutIds.current = [];

    seq.forEach((cellIdx, i) => {
      // Encender
      const onId = setTimeout(() => {
        setLitCell(cellIdx);
      }, i * (SHOW_ON + SHOW_OFF));
      showTimeoutIds.current.push(onId);

      // Apagar
      const offId = setTimeout(() => {
        setLitCell(-1);
      }, i * (SHOW_ON + SHOW_OFF) + SHOW_ON);
      showTimeoutIds.current.push(offId);
    });

    // Fase del jugador cuando termina la muestra
    const endId = setTimeout(() => {
      setIsShowingPattern(false);
      setLitCell(-1);
      setPlayerIndex(0);

      // Arrancar el cronómetro
      const total = timeForSequence(seq.length);
      timerTotalRef.current = total;
      timerStartRef.current = performance.now();
      setTimeLimit(total);
      setTimeLeft(total);
    }, seq.length * (SHOW_ON + SHOW_OFF) + 300);
    showTimeoutIds.current.push(endId);
  }, []);

  /** Empieza una nueva ronda: añade un paso y muestra la secuencia */
  const startNextRound = useCallback((prevSeq) => {
    const next = [...prevSeq, randomCell()];
    setSequence(next);
    setPlayerIndex(0);
    setFlashCell(-1);
    setFlashError(-1);
    showPattern(next);
  }, [showPattern]);

  /** Game Over */
  const endGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    showTimeoutIds.current.forEach(clearTimeout);
    showTimeoutIds.current = [];
    setIsShowingPattern(false);
    setLitCell(-1);
    setTimeLeft(0);
    setGameState(STATES.ENDED);
  }, []);

  /* ─────────── Arranque ─────────── */

  const startGame = useCallback(() => {
    setScore(0);
    setSequence([]);
    setPlayerIndex(0);
    setIsShowingPattern(false);
    setLitCell(-1);
    setFlashCell(-1);
    setFlashError(-1);
    setTimeLeft(0);
    setTimeLimit(0);
    scoreSubmitted.current = false;
    setRanking([]);
    setScoreMessage("");
    setGameState(STATES.PLAYING);

    // Pequeña pausa antes de la primera ronda
    const id = setTimeout(() => startNextRound([]), 600);
    showTimeoutIds.current.push(id);
  }, [startNextRound]);

  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, startGame, gameState]);

  /* ─────────── Cronómetro con RAF ─────────── */

  useEffect(() => {
    if (gameState !== STATES.PLAYING || isShowingPattern) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    if (timeLimit === 0) return;

    const tick = () => {
      const elapsed = performance.now() - timerStartRef.current;
      const remaining = timerTotalRef.current - elapsed;

      if (remaining <= 0) {
        setTimeLeft(0);
        endGame();
        return;
      }
      setTimeLeft(remaining);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [gameState, isShowingPattern, timeLimit, endGame]);

  /* ─────────── Input del jugador ─────────── */

  const handleTap = useCallback(
    (idx) => {
      if (gameStateRef.current !== STATES.PLAYING || isShowingPattern) return;

      const expected = sequenceRef.current[playerIndexRef.current];

      if (idx === expected) {
        /* ✅ ACIERTO */
        setFlashCell(idx);
        setTimeout(() => setFlashCell(-1), 180);

        const nextIdx = playerIndexRef.current + 1;

        if (nextIdx >= sequenceRef.current.length) {
          /* Ronda completada */
          cancelAnimationFrame(rafRef.current);
          setTimeLeft(0);
          setTimeLimit(0);
          const newScore = sequenceRef.current.length;
          setScore(newScore);
          setPlayerIndex(0);

          // Pausa y siguiente ronda
          const id = setTimeout(() => {
            if (gameStateRef.current === STATES.PLAYING) {
              startNextRound([...sequenceRef.current]);
            }
          }, 700);
          showTimeoutIds.current.push(id);
        } else {
          setPlayerIndex(nextIdx);
        }
      } else {
        /* ❌ FALLO — Game Over */
        setFlashError(idx);
        setTimeout(() => endGame(), 500);
      }
    },
    [isShowingPattern, startNextRound, endGame],
  );

  /* ─────────── Enviar puntuación ─────────── */

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
  }, [isEnded, score, submit, gameState, t]);

  /* ─────────── Cleanup ─────────── */

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      showTimeoutIds.current.forEach(clearTimeout);
    };
  }, []);

  /* ─────────── Derivados ─────────── */

  const isPlaying = gameState === STATES.PLAYING;
  const timerPct = timeLimit > 0 ? Math.max(0, (timeLeft / timeLimit) * 100) : 100;
  const isLowTime = timeLimit > 0 && timeLeft < 3000;
  const isPlayerTurn = isPlaying && !isShowingPattern && timeLimit > 0;

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <div className="w-full h-full relative overflow-hidden bg-zinc-900">
      {/* Glow decorativo */}
      <div
        className="absolute w-[50vw] h-[50vw] rounded-full opacity-[0.06] blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, #a78bfa 0%, transparent 70%)", top: "15%", left: "25%" }}
      />

      {/* Overlay gradients para UI del feed */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ═════ CONTENIDO ═════ */}
      <div className="relative w-full h-full flex flex-col items-center justify-center z-2">

        {/* ── HUD ── */}
        {gameState !== STATES.IDLE && (
          <div className="w-full flex flex-col items-center gap-1.5 mb-5 px-6 z-3">
            {/* Barra de tiempo */}
            <div className="w-full max-w-[320px] h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
                  isLowTime ? "bg-red-500 animate-pulse" : "bg-violet-400"
                }`}
                style={{ width: `${timerPct}%` }}
              />
            </div>

            {/* Stats */}
            <div className="flex items-center justify-between w-full max-w-[320px]">
              <span
                className={`text-xs font-mono font-bold tabular-nums ${
                  isLowTime ? "text-red-400 animate-pulse" : "text-white/50"
                }`}
              >
                {timeLimit > 0 ? `${Math.ceil(timeLeft / 1000)}s` : "—"}
              </span>

              <div className="flex flex-col items-center">
                <span className="text-white/90 text-2xl font-black tabular-nums" style={{ fontFeatureSettings: "'tnum'" }}>
                  {score}
                </span>
                <span className="text-white/30 text-[10px] font-medium uppercase tracking-wider -mt-0.5">
                  {score === 1 ? "round" : "rounds"}
                </span>
              </div>

              <span className={`font-bold tracking-wider uppercase transition-all ${
                isPlayerTurn
                  ? "text-violet-300 text-sm"
                  : "text-white/30 text-[10px]"
              }`}>
                {isShowingPattern
                  ? "WATCH"
                  : isPlayerTurn
                    ? "YOUR TURN"
                    : ""}
              </span>
            </div>
          </div>
        )}

        {/* ══════════ GRID 3×3 ══════════ */}
        <div className="px-6">
          <div
            className="aspect-square"
            style={{
              width: "min(78vw, 360px)",
              display: "grid",
              gridTemplateColumns: `repeat(${GRID}, 1fr)`,
              gap: "12px",
            }}
          >
            {Array.from({ length: CELLS }, (_, i) => {
              const color = BUTTON_COLORS[i];
              const isLit = litCell === i;
              const isFlash = flashCell === i;
              const isError = flashError === i;
              const isIdle = !isPlaying;
              const disabled = isIdle || isShowingPattern;

              let cellClass = "rounded-2xl transition-all duration-150 select-none ";

              if (isError) {
                cellClass += "bg-red-500 scale-95 ring-4 ring-red-400/80 brightness-150 ";
              } else if (isLit || isFlash) {
                cellClass += `${color.lit} ring-4 ${color.ring} scale-105 brightness-150 opacity-100 `;
              } else {
                cellClass += `${color.base} opacity-40 `;
              }

              if (!disabled) {
                cellClass += "cursor-pointer active:scale-90 ";
              }

              return (
                <button
                  key={i}
                  onClick={() => handleTap(i)}
                  disabled={disabled}
                  className={cellClass}
                  style={{ aspectRatio: "1" }}
                  aria-label={`Button ${i + 1}`}
                />
              );
            })}
          </div>
        </div>

        {/* ── Hint IDLE ── */}
        {gameState === STATES.IDLE && (
          <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
            <div className="flex flex-col items-center gap-3 animate-pulse">
              <img
                src="/logo-memoryloop.png"
                alt="Memory Loop"
                className="w-16 h-16 object-contain drop-shadow-lg"
                draggable={false}
              />
              <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
                {t("memoryloop.instruction")}
              </span>
            </div>
          </div>
        )}

        {/* ── GAME OVER ── */}
        {isEnded && (
          <GameOverPanel
            title="Game Over"
            score={score}
            subtitle={t("memoryloop.subtitle")}
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

export default MemoryLoopGame;
