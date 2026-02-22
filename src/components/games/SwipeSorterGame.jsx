/**
 * SwipeSorterGame.jsx — "Swipe Sorter"
 *
 * Minijuego de clasificación: aparece una carta roja o azul.
 * Roja → desliza a la izquierda. Azul → desliza a la derecha.
 * Tiempo global de 39s. Acierto = +1 pto. Fallo = −2 segundos de penalización.
 * Al llegar a 0 → Game Over.
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

const GLOBAL_TIME   = 30;    // segundos de tiempo total
const PENALTY_SECS  = 2;     // segundos que se restan por fallo
const SWIPE_THRESH  = 50;    // px mínimos para considerar swipe
const TICK_MS       = 30;    // resolución del timer

const COLORS = [
  { key: "red",  label: "ROJA",  bg: "bg-red-500",  border: "border-red-400",  glow: "rgba(239,68,68,0.35)",  dir: "left"  },
  { key: "blue", label: "AZUL",  bg: "bg-blue-500", border: "border-blue-400", glow: "rgba(59,130,246,0.35)", dir: "right" },
];

const pickColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

/* ═══════════════════ COMPONENT ═══════════════════ */
const SwipeSorterGame = ({ isActive, onNextGame, onReplay, userId }) => {
  const { t } = useLanguage();
  const [gameState, setGameState] = useState(STATES.IDLE);
  const [score, setScore]         = useState(0);
  const [card, setCard]           = useState(() => pickColor());
  const [timeLeft, setTimeLeft]   = useState(GLOBAL_TIME);

  // Drag state
  const [dragX, setDragX]       = useState(0);
  const [exiting, setExiting]   = useState(null); // "left" | "right" | null
  const [wrongFlash, setWrongFlash] = useState(false);

  // Refs
  const scoreRef      = useRef(0);
  const gameStateRef  = useRef(STATES.IDLE);
  const timerRef      = useRef(null);
  const timeRef       = useRef(GLOBAL_TIME);
  const cardRef       = useRef(card);
  const dragStartRef  = useRef(null);  // { x, y }
  const dragXRef      = useRef(0);
  const exitTORef     = useRef(null);

  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  const { submit, loading: isSubmittingScore } = useSubmitScore(userId, GAME_IDS.SwipeSorterGame);

  /* ── Arrancar partida ── */
  const startGame = useCallback(() => {
    const c = pickColor();
    scoreRef.current     = 0;
    gameStateRef.current = STATES.PLAYING;
    timeRef.current      = GLOBAL_TIME;
    cardRef.current      = c;
    dragXRef.current     = 0;

    setScore(0);
    setCard(c);
    setTimeLeft(GLOBAL_TIME);
    setDragX(0);
    setExiting(null);
    setWrongFlash(false);
    setGameState(STATES.PLAYING);

    // Timer countdown
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (gameStateRef.current !== STATES.PLAYING) return;
      timeRef.current -= TICK_MS / 1000;
      if (timeRef.current <= 0) {
        // Tiempo agotado → Game Over
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
    setWrongFlash(true);
    setTimeout(() => setWrongFlash(false), 400);
  }, []);

  /* ── Acierto: siguiente carta ── */
  const nextCard = useCallback(() => {
    scoreRef.current += 1;
    setScore(scoreRef.current);

    const c = pickColor();
    cardRef.current  = c;
    dragXRef.current = 0;
    setCard(c);
    setDragX(0);
    setExiting(null);
  }, []);

  /* ── Fallo: penalización de tiempo ── */
  const penalize = useCallback(() => {
    timeRef.current = Math.max(0, timeRef.current - PENALTY_SECS);
    setTimeLeft(timeRef.current);
    setWrongFlash(true);
    setTimeout(() => setWrongFlash(false), 400);

    if (timeRef.current <= 0) {
      endGame();
      return;
    }

    // Siguiente carta aunque falle
    const c = pickColor();
    cardRef.current  = c;
    dragXRef.current = 0;
    setCard(c);
    setDragX(0);
    setExiting(null);
  }, []);

  /* ── Auto-start ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, startGame, gameState]);

  /* ── Cleanup ── */
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(exitTORef.current);
    };
  }, []);

  /* ── Pointer/Touch handlers ── */
  const handlePointerDown = useCallback((e) => {
    if (gameStateRef.current !== STATES.PLAYING) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    dragXRef.current = 0;
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (gameStateRef.current !== STATES.PLAYING || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    dragXRef.current = dx;
    setDragX(dx);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (gameStateRef.current !== STATES.PLAYING || !dragStartRef.current) return;
    const dx = dragXRef.current;
    dragStartRef.current = null;

    if (Math.abs(dx) < SWIPE_THRESH) {
      // No alcanzó el umbral → vuelve al centro
      dragXRef.current = 0;
      setDragX(0);
      return;
    }

    const swipedDir = dx < 0 ? "left" : "right";
    const correctDir = cardRef.current.dir;

    if (swipedDir === correctDir) {
      // Acierto: animar salida
      setExiting(swipedDir);
      exitTORef.current = setTimeout(() => {
        nextCard();
      }, 150);
    } else {
      // Fallo: penalización de tiempo
      setExiting(swipedDir);
      exitTORef.current = setTimeout(() => {
        penalize();
      }, 150);
    }
  }, [nextCard, penalize]);

  /* ── Derivados ── */
  const isPlaying  = gameState === STATES.PLAYING;
  const isEnded    = gameState === STATES.ENDED;

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
  const progress   = GLOBAL_TIME > 0 ? timeLeft / GLOBAL_TIME : 0;
  const rotation   = dragX * 0.08; // grados de rotación según arrastra
  const opacity    = exiting ? 0 : 1;

  // Transform de la carta
  const cardTranslateX = exiting
    ? (exiting === "left" ? -500 : 500)
    : dragX;

  const cardRotate = exiting
    ? (exiting === "left" ? -25 : 25)
    : rotation;

  // Indicadores laterales (flechas de dirección)
  const leftOpacity  = Math.max(0, Math.min(1, -dragX / 80));
  const rightOpacity = Math.max(0, Math.min(1, dragX / 80));

  // Color de la barra de progreso
  const barColor = progress > 0.5
    ? `hsl(${120 * progress}, 70%, 50%)`
    : `hsl(${120 * progress}, 80%, 50%)`;

  return (
    <div
      className="relative h-full w-full flex items-center justify-center bg-zinc-950 overflow-hidden select-none"
      style={{
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      {/* ── Overlay gradients para UI del feed ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ── Flash de error ── */}
      {wrongFlash && (
        <div className="absolute inset-0 bg-red-500/20 z-4 pointer-events-none transition-opacity" />
      )}

      {/* ── Barra de tiempo ── */}
      {gameState !== STATES.IDLE && !isEnded && (
        <div className="absolute top-14 left-6 right-6 z-3">
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
            <span className="text-xs font-bold text-white/40 tabular-nums" style={{ fontFeatureSettings: "'tnum'" }}>
              {timeLeft.toFixed(1)}s
            </span>
            <span className="text-xs font-bold text-white/40">
              {score} ✓
            </span>
          </div>
        </div>
      )}

      {/* ── Bandas laterales de color (siempre visibles jugando) ── */}
      {isPlaying && (
        <>
          {/* Banda izquierda = ROJO */}
          <div className="absolute left-3 top-28 bottom-28 w-10 rounded-2xl pointer-events-none z-1 flex items-center justify-center overflow-hidden">
            <div
              className="absolute inset-0 bg-red-500 rounded-2xl"
              style={{ opacity: 0.15 + leftOpacity * 0.4 }}
            />
            <div
              className="relative flex flex-col items-center gap-2"
              style={{ opacity: 0.6 + leftOpacity * 0.4 }}
            >
              <span className="text-white/90 text-3xl font-black">←</span>
              <span
                className="text-[0.7rem] font-extrabold text-red-300 tracking-widest"
                style={{ writingMode: "vertical-lr", textOrientation: "mixed" }}
              >
                {t("swipesorter.red")}
              </span>
            </div>
          </div>
          {/* Banda derecha = AZUL */}
          <div className="absolute right-3 top-28 bottom-28 w-10 rounded-2xl pointer-events-none z-1 flex items-center justify-center overflow-hidden">
            <div
              className="absolute inset-0 bg-blue-500 rounded-2xl"
              style={{ opacity: 0.15 + rightOpacity * 0.4 }}
            />
            <div
              className="relative flex flex-col items-center gap-2"
              style={{ opacity: 0.6 + rightOpacity * 0.4 }}
            >
              <span className="text-white/90 text-3xl font-black">→</span>
              <span
                className="text-[0.7rem] font-extrabold text-blue-300 tracking-widest"
                style={{ writingMode: "vertical-lr", textOrientation: "mixed" }}
              >
                {t("swipesorter.blue")}
              </span>
            </div>
          </div>
        </>
      )}

      {/* ── Reglas fijas (siempre visibles jugando) ── */}
      {isPlaying && (
        <div className="absolute bottom-[20vh] inset-x-0 flex justify-center z-2 pointer-events-none">
          <div className="flex items-center gap-8 text-sm font-bold text-white/40">
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-red-500/80" /> {t("swipesorter.left")}
            </span>
            <span className="flex items-center gap-2">
              {t("swipesorter.right")} <span className="w-4 h-4 rounded bg-blue-500/80" />
            </span>
          </div>
        </div>
      )}

      {/* ── La Carta ── */}
      {(isPlaying || gameState === STATES.IDLE) && (
        <div
          className="z-3 cursor-grab active:cursor-grabbing"
          style={{
            touchAction: "none",
            transform: `translateX(${cardTranslateX}px) rotate(${cardRotate}deg)`,
            transition: exiting ? "transform 0.2s ease-out, opacity 0.2s" : "none",
            opacity,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <div
            className={`relative w-44 sm:w-52 rounded-3xl ${card.bg} ${card.border} border-2 flex flex-col items-center justify-center`}
            style={{
              aspectRatio: "3/4",
              boxShadow: `0 8px 40px ${card.glow}, 0 0 60px ${card.glow}`,
            }}
          >
            {/* Icono / símbolo decorativo */}
            <div className="absolute top-4 left-4 text-white/30 text-sm font-bold">
              {card.key === "red" ? "←" : "→"}
            </div>
            <div className="absolute bottom-4 right-4 text-white/30 text-sm font-bold rotate-180">
              {card.key === "red" ? "←" : "→"}
            </div>

            {/* Diamante central */}
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl rotate-45 border-2 border-white/20 mb-4"
              style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
            />
            <span className="text-2xl sm:text-3xl font-black text-white/90 tracking-wide">
              {t("swipesorter." + card.key)}
            </span>
          </div>
        </div>
      )}

      {/* ── Score grande central ── */}
      {isPlaying && score > 0 && (
        <div className="absolute inset-x-0 top-28 flex justify-center pointer-events-none z-2">
          <span
            className="text-6xl font-black text-white/10 tabular-nums"
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {score}
          </span>
        </div>
      )}

      {/* ── Hint IDLE ── */}
      {gameState === STATES.IDLE && (
        <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-4">
          <div className="flex flex-col items-center gap-3 animate-pulse">
            <img
              src="/logo-swipesorter.png"
              alt="Swipe Sorter"
              className="w-16 h-16 object-contain drop-shadow-lg"
              draggable={false}
            />
            <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
              {t("swipesorter.instruction")}
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
            subtitle={t("swipesorter.subtitle")}
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

export default SwipeSorterGame;
