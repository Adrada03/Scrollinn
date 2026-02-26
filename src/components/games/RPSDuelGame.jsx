/**
 * RPSDuelGame.jsx — "RPS Duel" (Duelo Piedra Papel Tijera)
 *
 * Brain Training Frenético: la CPU elige una jugada y te da una ORDEN
 * (GANAR, PERDER o EMPATAR). Debes pulsar la respuesta correcta antes
 * de que se agote el tiempo. Cada acierto reduce el tiempo disponible.
 *
 * Props:
 *   isActive   – cuando pasa a true, arranca el juego
 *   onNextGame – callback para "siguiente juego"
 *   onReplay   – callback para reiniciar
 *   userId     – ID del jugador autenticado
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ─────────── Constantes ─────────── */
const STATES = { IDLE: "idle", PLAYING: "playing", ENDED: "ended" };

const INITIAL_TIME = 3.5;   // segundos primera ronda (generoso para entrar en calor)
const MIN_TIME     = 0.6;   // mínimo absoluto
const TIME_DECAY   = 0.06;  // reducción por ronda (baja más rápido para compensar)
const TICK_MS      = 16;    // resolución del timer (~60fps)

const CHOICES = ["rock", "paper", "scissors"];
const ORDERS  = ["WIN", "LOSE", "DRAW"];

const EMOJI = { rock: "✊", paper: "✋", scissors: "✌️" };

/* ─────────── Lógica RPS ─────────── */

/** Devuelve qué opción vence a `choice` */
const winsAgainst = { rock: "paper", paper: "scissors", scissors: "rock" };
/** Devuelve qué opción pierde contra `choice` */
const losesTo     = { rock: "scissors", paper: "rock", scissors: "paper" };

/**
 * Dado un orden y la jugada de la CPU, devuelve la respuesta correcta del jugador.
 */
function getCorrectAnswer(order, cpuChoice) {
  if (order === "DRAW") return cpuChoice;
  if (order === "WIN")  return winsAgainst[cpuChoice];
  /* LOSE */ return losesTo[cpuChoice];
}

/** Genera una ronda aleatoria */
function generateRound() {
  const cpuChoice = CHOICES[Math.floor(Math.random() * 3)];
  const order     = ORDERS[Math.floor(Math.random() * 3)];
  return { cpuChoice, order };
}

/* ═══════════════════ COMPONENT ═══════════════════ */
const RPSDuelGame = ({ isActive, onNextGame, onReplay, userId }) => {
  const { t } = useLanguage();

  // ── State ──
  const [gameState, setGameState] = useState(STATES.IDLE);
  const [score, setScore]         = useState(0);
  const [round, setRound]         = useState(() => generateRound());
  const [timeLeft, setTimeLeft]   = useState(INITIAL_TIME);
  const [maxTime, setMaxTime]     = useState(INITIAL_TIME);
  const [flash, setFlash]         = useState(null); // "green" | "red" | null

  // ── Ranking / submit ──
  const [ranking, setRanking]               = useState([]);
  const [scoreMessage, setScoreMessage]     = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);
  const { submit, xpGained } = useSubmitScore(userId, GAME_IDS.RPSDuelGame);

  // ── Refs (para acceso síncrono dentro de intervals) ──
  const scoreRef     = useRef(0);
  const gameStateRef = useRef(STATES.IDLE);
  const timerRef     = useRef(null);
  const timeRef      = useRef(INITIAL_TIME);
  const maxTimeRef   = useRef(INITIAL_TIME);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const roundRef     = useRef(round);
  const flashTORef   = useRef(null);

  /* ── End Game ── */
  const endGame = useCallback(() => {
    clearInterval(timerRef.current);
    gameStateRef.current = STATES.ENDED;
    setGameState(STATES.ENDED);
  }, []);

  /* ── Start Game ── */
  const startGame = useCallback(() => {
    const r = generateRound();
    scoreRef.current     = 0;
    gameStateRef.current = STATES.PLAYING;
    maxTimeRef.current   = INITIAL_TIME;
    timeRef.current      = INITIAL_TIME;
    roundRef.current     = r;

    setScore(0);
    setRound(r);
    setMaxTime(INITIAL_TIME);
    setTimeLeft(INITIAL_TIME);
    setFlash(null);
    setGameState(STATES.PLAYING);

    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (!isActiveRef.current) return; // Pausa
      if (gameStateRef.current !== STATES.PLAYING) return;
      timeRef.current -= TICK_MS / 1000;
      if (timeRef.current <= 0) {
        timeRef.current = 0;
        setTimeLeft(0);
        setFlash("red");
        endGame();
      } else {
        setTimeLeft(timeRef.current);
      }
    }, TICK_MS);
  }, [endGame]);

  /* ── Next Round (on correct answer) ── */
  const nextRound = useCallback(() => {
    scoreRef.current += 1;
    setScore(scoreRef.current);

    const newMax = Math.max(MIN_TIME, maxTimeRef.current - TIME_DECAY);
    maxTimeRef.current = newMax;
    timeRef.current    = newMax;
    setMaxTime(newMax);
    setTimeLeft(newMax);

    const r = generateRound();
    roundRef.current = r;
    setRound(r);

    // Flash verde
    setFlash("green");
    clearTimeout(flashTORef.current);
    flashTORef.current = setTimeout(() => setFlash(null), 200);
  }, []);

  /* ── Auto-start ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, startGame, gameState]);

  /* ── Pausar/reanudar timer al perder/ganar foco ── */
  useEffect(() => {
    if (!isActive && gameStateRef.current === STATES.PLAYING) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (isActive && gameStateRef.current === STATES.PLAYING && !timerRef.current) {
      timerRef.current = setInterval(() => {
        if (!isActiveRef.current) return;
        if (gameStateRef.current !== STATES.PLAYING) return;
        timeRef.current -= TICK_MS / 1000;
        if (timeRef.current <= 0) {
          timeRef.current = 0;
          setTimeLeft(0);
          setFlash("red");
          endGame();
        } else {
          setTimeLeft(timeRef.current);
        }
      }, TICK_MS);
    }
  }, [isActive, endGame]);

  /* ── Cleanup ── */
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(flashTORef.current);
    };
  }, []);

  /* ── Player picks a choice ── */
  const handlePick = useCallback((playerChoice) => {
    if (gameStateRef.current !== STATES.PLAYING) return;
    const correct = getCorrectAnswer(roundRef.current.order, roundRef.current.cpuChoice);

    if (playerChoice === correct) {
      nextRound();
    } else {
      setFlash("red");
      clearTimeout(flashTORef.current);
      flashTORef.current = setTimeout(() => setFlash(null), 400);
      endGame();
    }
  }, [nextRound, endGame]);

  /* ── Submit score on end ── */
  useEffect(() => {
    if (gameState === STATES.ENDED && !scoreSubmitted.current) {
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
  }, [gameState, score, submit, t]);

  /* ── Derived ── */
  const isPlaying = gameState === STATES.PLAYING;
  const isEnded   = gameState === STATES.ENDED;
  const progress  = maxTime > 0 ? timeLeft / maxTime : 0;

  // Barra de color verde→amarillo→rojo
  const barColor = `hsl(${120 * progress}, 80%, 50%)`;

  // Colores y texto según la orden
  const orderStyles = {
    WIN:  { color: "text-green-400", glow: "drop-shadow-[0_0_24px_rgba(34,197,94,0.7)]",  label: t("rpsduel.win") },
    LOSE: { color: "text-orange-400", glow: "drop-shadow-[0_0_24px_rgba(249,115,22,0.7)]", label: t("rpsduel.lose") },
    DRAW: { color: "text-cyan-400",  glow: "drop-shadow-[0_0_24px_rgba(34,211,238,0.7)]",  label: t("rpsduel.draw") },
  };
  const currentOrderStyle = orderStyles[round.order] || orderStyles.WIN;

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
      {/* ── Overlay gradients (feed UI) ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ── Flash feedback ── */}
      {flash === "green" && (
        <div className="absolute inset-0 bg-emerald-500/20 z-4 pointer-events-none transition-opacity duration-200" />
      )}
      {flash === "red" && (
        <div className="absolute inset-0 bg-red-500/25 z-4 pointer-events-none transition-opacity duration-200" />
      )}

      {/* ── Timer bar ── */}
      {isPlaying && (
        <div className="absolute top-14 left-6 right-16 z-3">
          <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress * 100}%`,
                backgroundColor: barColor,
                boxShadow: `0 0 12px ${barColor}`,
                transition: `width ${TICK_MS}ms linear`,
              }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span
              className="text-xs font-bold text-white/40 tabular-nums"
              style={{ fontFeatureSettings: "'tnum'" }}
            >
              {timeLeft.toFixed(2)}s
            </span>
            <span className="text-xs font-bold text-white/40">
              {score} ✓
            </span>
          </div>
        </div>
      )}

      {/* ── Score fantasma de fondo ── */}
      {isPlaying && score > 0 && (
        <div className="absolute inset-x-0 top-28 flex justify-center pointer-events-none z-1">
          <span
            className="text-9xl font-black text-white/4 tabular-nums"
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {score}
          </span>
        </div>
      )}

      {/* ════════════ PLAYING STATE ════════════ */}
      {isPlaying && (
        <div className="absolute inset-x-0 top-24 bottom-56 sm:bottom-64 z-2 flex flex-col items-center justify-center px-4">
          {/* Rival choice — icono gigante */}
          <div className="flex flex-col items-center shrink-0">
            <span className="text-xs uppercase tracking-widest text-white/30 font-bold mb-1">
              🎲 RIVAL
            </span>
            <span
              className="text-7xl sm:text-8xl leading-none"
              style={{ filter: "drop-shadow(0 0 20px rgba(255,255,255,0.15))" }}
              key={`${round.cpuChoice}-${score}`}
            >
              {EMOJI[round.cpuChoice]}
            </span>
          </div>

          {/* La ORDEN */}
          <div className={`flex flex-col items-center mt-5 shrink-0 ${currentOrderStyle.glow}`} key={`order-${score}`}>
            <span className="text-xs uppercase tracking-widest text-white/40 font-bold">
              {t("rpsduel.youmust")}
            </span>
            <span
              className={`text-3xl sm:text-4xl font-black uppercase tracking-tight ${currentOrderStyle.color} animate-pulse`}
            >
              {currentOrderStyle.label}
            </span>
          </div>
        </div>
      )}

      {/* ── Player buttons — bottom ── */}
      {isPlaying && (
        <div className="absolute bottom-36 sm:bottom-40 left-0 right-0 z-3 flex justify-center gap-5 sm:gap-7 px-6">
          {CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              onPointerDown={() => handlePick(choice)}
              className="
                w-20 h-20 sm:w-24 sm:h-24
                rounded-full
                bg-white/10 hover:bg-white/20 active:bg-white/25
                backdrop-blur-sm
                border-2 border-white/20
                flex items-center justify-center
                text-4xl sm:text-5xl
                transition-all duration-75
                active:scale-90
                shadow-lg shadow-black/30
              "
              style={{
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {EMOJI[choice]}
            </button>
          ))}
        </div>
      )}

      {/* ── GAME OVER ── */}
      {isEnded && (
        <div className="absolute inset-0 flex items-center justify-center z-6 pointer-events-auto">
          <GameOverPanel
            title="Game Over"
            score={score}
            subtitle={t("rpsduel.subtitle")}
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
  );
};

export default RPSDuelGame;
