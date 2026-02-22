/**
 * MathRushGame.jsx — "Math Rush"
 *
 * Minijuego de agilidad mental: aparece una operación matemática
 * simple (suma o resta) con un resultado que puede ser verdadero
 * o falso. El jugador debe pulsar VERDADERO o FALSO antes de que
 * se agote el tiempo. Cada acierto reduce el tiempo disponible.
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

const INITIAL_TIME = 2.5;  // segundos para la primera operación
const MIN_TIME     = 0.8;  // mínimo posible
const TIME_DECAY   = 0.05; // segundos que se restan por acierto
const TICK_MS      = 30;   // resolución del timer

/* ─────────── Helpers ─────────── */
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function generateQuestion() {
  const isSum = Math.random() < 0.5;
  let a, b, realAnswer;

  if (isSum) {
    a = randInt(1, 10);
    b = randInt(1, 10);
    realAnswer = a + b;
  } else {
    a = randInt(2, 10);
    b = randInt(1, a); // b ≤ a para evitar negativos
    realAnswer = a - b;
  }

  const showCorrect = Math.random() < 0.5;
  let shownAnswer;

  if (showCorrect) {
    shownAnswer = realAnswer;
  } else {
    // Falso: sumar o restar 1 o 2
    const offset = randInt(1, 2) * (Math.random() < 0.5 ? 1 : -1);
    shownAnswer = realAnswer + offset;
    // Evitar que el "falso" coincida con el real
    if (shownAnswer === realAnswer) shownAnswer = realAnswer + 1;
  }

  return {
    text: `${a} ${isSum ? "+" : "−"} ${b} = ${shownAnswer}`,
    isCorrect: shownAnswer === realAnswer,
  };
}

/* ═══════════════════ COMPONENT ═══════════════════ */
const MathRushGame = ({ isActive, onNextGame, onReplay, userId }) => {
  const { t } = useLanguage();
  const [gameState, setGameState] = useState(STATES.IDLE);
  const [score, setScore]         = useState(0);
  const [question, setQuestion]   = useState(() => generateQuestion());
  const [timeLeft, setTimeLeft]   = useState(INITIAL_TIME);
  const [maxTime, setMaxTime]     = useState(INITIAL_TIME);
  const [flash, setFlash]         = useState(null); // "green" | "red" | null
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);
  const { submit } = useSubmitScore(userId, GAME_IDS.MathRushGame);

  // Refs
  const scoreRef      = useRef(0);
  const gameStateRef  = useRef(STATES.IDLE);
  const timerRef      = useRef(null);
  const timeRef       = useRef(INITIAL_TIME);
  const maxTimeRef    = useRef(INITIAL_TIME);
  const questionRef   = useRef(question);
  const flashTORef    = useRef(null);

  /* ── Arrancar partida ── */
  const startGame = useCallback(() => {
    const q = generateQuestion();
    scoreRef.current     = 0;
    gameStateRef.current = STATES.PLAYING;
    maxTimeRef.current   = INITIAL_TIME;
    timeRef.current      = INITIAL_TIME;
    questionRef.current  = q;

    setScore(0);
    setQuestion(q);
    setMaxTime(INITIAL_TIME);
    setTimeLeft(INITIAL_TIME);
    setFlash(null);
    setGameState(STATES.PLAYING);

    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (gameStateRef.current !== STATES.PLAYING) return;
      timeRef.current -= TICK_MS / 1000;
      if (timeRef.current <= 0) {
        timeRef.current = 0;
        setTimeLeft(0);
        endGame();
      } else {
        setTimeLeft(timeRef.current);
      }
    }, TICK_MS);
  }, []);

  const endGame = useCallback(() => {
    clearInterval(timerRef.current);
    gameStateRef.current = STATES.ENDED;
    setGameState(STATES.ENDED);
  }, []);

  /* ── Siguiente pregunta ── */
  const nextQuestion = useCallback(() => {
    scoreRef.current += 1;
    setScore(scoreRef.current);

    const newMax = Math.max(MIN_TIME, maxTimeRef.current - TIME_DECAY);
    maxTimeRef.current = newMax;
    timeRef.current    = newMax;
    setMaxTime(newMax);
    setTimeLeft(newMax);

    const q = generateQuestion();
    questionRef.current = q;
    setQuestion(q);

    // Flash verde breve
    setFlash("green");
    clearTimeout(flashTORef.current);
    flashTORef.current = setTimeout(() => setFlash(null), 150);
  }, []);

  /* ── Auto-start ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, startGame, gameState]);

  /* ── Cleanup ── */
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(flashTORef.current);
    };
  }, []);

  /* ── Responder ── */
  const handleAnswer = useCallback((answeredTrue) => {
    if (gameStateRef.current !== STATES.PLAYING) return;

    const isRight = answeredTrue === questionRef.current.isCorrect;
    if (isRight) {
      nextQuestion();
    } else {
      setFlash("red");
      clearTimeout(flashTORef.current);
      flashTORef.current = setTimeout(() => setFlash(null), 400);
      endGame();
    }
  }, [nextQuestion, endGame]);

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
        .catch(() => setScoreMessage(t("svc.score_error")))
        .finally(() => setIsRankingLoading(false));
    }
    if (gameState === STATES.IDLE) {
      scoreSubmitted.current = false;
      setRanking([]);
      setScoreMessage("");
    }
  }, [isEnded, score, userId, gameState, submit]);
  const progress  = maxTime > 0 ? timeLeft / maxTime : 0;

  // Color de la barra
  const barColor = progress > 0.5
    ? `hsl(${120 * progress}, 70%, 50%)`
    : `hsl(${120 * progress}, 80%, 50%)`;

  return (
    <div
      className="relative h-full w-full flex flex-col items-center justify-center bg-zinc-950 overflow-hidden select-none"
      style={{
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

      {/* ── Flash de feedback ── */}
      {flash === "green" && (
        <div className="absolute inset-0 bg-emerald-500/15 z-4 pointer-events-none" />
      )}
      {flash === "red" && (
        <div className="absolute inset-0 bg-red-500/20 z-4 pointer-events-none" />
      )}

      {/* ── Barra de tiempo ── */}
      {gameState !== STATES.IDLE && !isEnded && (
        <div className="absolute top-14 left-6 right-16 z-3">
          <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress * 100}%`,
                backgroundColor: barColor,
                boxShadow: `0 0 8px ${barColor}`,
                transition: `width ${TICK_MS}ms linear`,
              }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span
              className="text-xs font-bold text-white/40 tabular-nums"
              style={{ fontFeatureSettings: "'tnum'" }}
            >
              {timeLeft.toFixed(1)}s
            </span>
            <span className="text-xs font-bold text-white/40">
              {score} ✓
            </span>
          </div>
        </div>
      )}

      {/* ── Operación matemática ── */}
      {isPlaying && (
        <div className="relative z-2 flex flex-col items-center -mt-16">
          <span
            className="text-6xl sm:text-7xl font-black text-white tabular-nums tracking-tight leading-none"
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {question.text}
          </span>
        </div>
      )}

      {/* ── Botones VERDADERO / FALSO ── */}
      {isPlaying && (
        <div className="absolute bottom-0 left-0 right-0 z-3 flex h-[38vh]">
          {/* VERDADERO */}
          <button
            type="button"
            onPointerDown={() => handleAnswer(true)}
            className="flex-1 flex items-center justify-center bg-green-800 active:bg-green-700 transition-colors duration-75 border-r border-white/5"
            style={{
              touchAction: "manipulation",
              userSelect: "none",
              WebkitUserSelect: "none",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-3xl sm:text-4xl font-black text-white/90">✓</span>
              <span className="text-sm sm:text-base font-extrabold text-white/70 tracking-wide uppercase">
                {t("mathrush.true")}
              </span>
            </div>
          </button>
          {/* FALSO */}
          <button
            type="button"
            onPointerDown={() => handleAnswer(false)}
            className="flex-1 flex items-center justify-center bg-red-800 active:bg-red-700 transition-colors duration-75 border-l border-white/5"
            style={{
              touchAction: "manipulation",
              userSelect: "none",
              WebkitUserSelect: "none",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-3xl sm:text-4xl font-black text-white/90">✗</span>
              <span className="text-sm sm:text-base font-extrabold text-white/70 tracking-wide uppercase">
                {t("mathrush.false")}
              </span>
            </div>
          </button>
        </div>
      )}

      {/* ── Score grande de fondo ── */}
      {isPlaying && score > 0 && (
        <div className="absolute inset-x-0 top-28 flex justify-center pointer-events-none z-1">
          <span
            className="text-8xl font-black text-white/[0.04] tabular-nums"
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {score}
          </span>
        </div>
      )}

      {/* ── Hint IDLE — oculto: el Countdown del feed ya muestra instrucciones ── */}

      {/* ── GAME OVER ── */}
      {isEnded && (
        <div className="absolute inset-0 flex items-center justify-center z-6 pointer-events-auto">
          <GameOverPanel
            title="Game Over"
            score={score}
            subtitle={t("mathrush.subtitle")}
            onReplay={onReplay}
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

export default MathRushGame;
