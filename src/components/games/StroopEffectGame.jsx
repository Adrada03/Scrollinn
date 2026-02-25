/**
 * StroopEffectGame.jsx — "The Stroop Effect"
 *
 * Minijuego basado en el Efecto Stroop: aparece el nombre de un color
 * pintado en un color DIFERENTE. El jugador debe tocar el botón del
 * color en el que está PINTADA la palabra, ignorando lo que dice.
 *
 * - 4 colores: Rojo, Azul, Verde, Amarillo
 * - Barra de tiempo que decrece (empieza en 2 s, baja cada 5 pts)
 * - Fallo o timeout → Game Over
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

const COLORS = [
  { name: "ROJO",     tw: "text-red-500",    btn: "bg-red-500",    key: "red"    },
  { name: "AZUL",     tw: "text-blue-500",   btn: "bg-blue-500",   key: "blue"   },
  { name: "VERDE",    tw: "text-green-500",  btn: "bg-green-500",  key: "green"  },
  { name: "AMARILLO", tw: "text-yellow-400", btn: "bg-yellow-400", key: "yellow" },
];

const GAME_DURATION  = 30;   // segundos totales
const PENALTY_TIME   = 2;    // segundos que se restan al fallar
const PENALTY_SCORE  = 1;    // puntos que se restan al fallar

/* ─────────── Helpers ─────────── */
/** Genera una ronda donde la palabra y el color de la tinta no coinciden */
function generateRound(prevTextIdx, prevInkIdx) {
  let textIdx, inkIdx;
  // Elegir palabra
  do { textIdx = Math.floor(Math.random() * COLORS.length); } while (textIdx === prevTextIdx);
  // Elegir tinta diferente a la palabra
  do { inkIdx = Math.floor(Math.random() * COLORS.length); } while (inkIdx === textIdx || inkIdx === prevInkIdx);
  return { textIdx, inkIdx };
}

/** Baraja un array (Fisher-Yates) */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ═══════════════════ COMPONENT ═══════════════════ */
const StroopEffectGame = ({ isActive, onNextGame, onReplay, userId }) => {
  const { t } = useLanguage();
  const [gameState, setGameState] = useState(STATES.IDLE);
  const [score, setScore]         = useState(0);
  const [textIdx, setTextIdx]     = useState(0);
  const [inkIdx, setInkIdx]       = useState(1);
  const [btnOrder, setBtnOrder]   = useState([0, 1, 2, 3]);
  const [timeLeft, setTimeLeft]   = useState(GAME_DURATION);
  const [flash, setFlash]         = useState("");
  const [shaking, setShaking]     = useState(false);

  const tickRef   = useRef(null);
  const flashRef  = useRef(null);
  const shakeRef  = useRef(null);

  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  const { submit, loading: isSubmittingScore, xpGained } = useSubmitScore(userId, GAME_IDS.StroopEffectGame);

  /* ── Nueva ronda ── */
  const nextRound = useCallback((prevTI, prevII) => {
    const r = generateRound(prevTI, prevII);
    setTextIdx(r.textIdx);
    setInkIdx(r.inkIdx);
    setBtnOrder(shuffle([0, 1, 2, 3]));
  }, []);

  /* ── Arrancar partida ── */
  const startGame = useCallback(() => {
    setScore(0);
    setTimeLeft(GAME_DURATION);
    setFlash("");
    setShaking(false);
    const r = generateRound(-1, -1);
    setTextIdx(r.textIdx);
    setInkIdx(r.inkIdx);
    setBtnOrder(shuffle([0, 1, 2, 3]));
    setGameState(STATES.PLAYING);
  }, []);

  /* ── Auto-start ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, startGame, gameState]);

  /* ── Timer global de 30 s ── */
  useEffect(() => {
    if (gameState !== STATES.PLAYING) return;
    tickRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setGameState(STATES.ENDED);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, [gameState]);

  /* ── Limpiar al acabar ── */
  useEffect(() => {
    if (gameState === STATES.ENDED) clearInterval(tickRef.current);
  }, [gameState]);

  /* ── Cleanup ── */
  useEffect(() => {
    return () => {
      clearInterval(tickRef.current);
      clearTimeout(flashRef.current);
      clearTimeout(shakeRef.current);
    };
  }, []);

  /* ── Click en botón de color ── */
  const handleAnswer = useCallback(
    (colorIdx) => {
      if (gameState !== STATES.PLAYING) return;

      if (colorIdx === inkIdx) {
        /* ✅ ACIERTO: +1 punto */
        setScore((s) => s + 1);
        setFlash("correct");
        clearTimeout(flashRef.current);
        flashRef.current = setTimeout(() => setFlash(""), 150);
        nextRound(textIdx, inkIdx);
      } else {
        /* ❌ FALLO: −1 punto, −2 s */
        setScore((s) => Math.max(0, s - PENALTY_SCORE));
        setFlash("wrong");
        setShaking(true);
        clearTimeout(flashRef.current);
        clearTimeout(shakeRef.current);
        flashRef.current = setTimeout(() => setFlash(""), 300);
        shakeRef.current = setTimeout(() => setShaking(false), 400);
        setTimeLeft((t) => {
          const next = t - PENALTY_TIME;
          if (next <= 0) {
            setGameState(STATES.ENDED);
            return 0;
          }
          return next;
        });
        nextRound(textIdx, inkIdx);
      }
    },
    [gameState, inkIdx, textIdx, nextRound],
  );

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
  const timerPct   = Math.max(0, (timeLeft / GAME_DURATION) * 100);
  const isLowTime  = timeLeft <= 5;
  const wordColor  = COLORS[inkIdx];
  const wordText   = t("stroop." + COLORS[textIdx].key);

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#0d1117]">
      {/* ── Glow decorativo ── */}
      <div
        className="absolute w-[55vw] h-[55vw] rounded-full opacity-[0.06] blur-3xl pointer-events-none"
        style={{ background: wordColor.key, top: "15%", left: "22%", transition: "background 0.3s" }}
      />

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

      {/* ═════ CONTENIDO ═════ */}
      <div className="relative w-full h-full flex flex-col items-center justify-center z-2">

        {/* ── HUD ── */}
        {gameState !== STATES.IDLE && (
          <div className="w-full flex flex-col items-center gap-1.5 mb-6 px-6 z-3">
            {/* Barra de tiempo */}
            <div className="w-full max-w-[320px] h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ease-linear ${
                  isLowTime ? "bg-red-500" : "bg-violet-400"
                }`}
                style={{ width: `${timerPct}%`, transitionDuration: "1000ms" }}
              />
            </div>
            {/* Score */}
            <div className="flex items-center justify-between w-full max-w-[320px]">
              <span
                className={`text-xs font-mono font-bold tabular-nums ${
                  isLowTime ? "text-red-400 animate-pulse" : "text-white/50"
                }`}
              >
                {timeLeft}s
              </span>
              <span className="text-white/90 text-2xl font-black tabular-nums" style={{ fontFeatureSettings: "'tnum'" }}>
                {score}
              </span>
              <span className="text-white/30 text-[10px] font-medium tracking-wider uppercase">
                {t("stroop.points")}
              </span>
            </div>
          </div>
        )}

        {/* ══════════ PALABRA STROOP ══════════ */}
        {isPlaying && (
          <div className={`mb-10 select-none ${shaking ? "animate-[shake_0.4s_ease]" : ""}`}>
            <span
              className={`text-6xl sm:text-7xl font-black tracking-wider ${wordColor.tw}`}
              style={{ textShadow: "0 0 30px currentColor", userSelect: "none" }}
            >
              {wordText}
            </span>
          </div>
        )}

        {/* ══════════ BOTONES DE COLOR ══════════ */}
        {isPlaying && (
          <div className="grid grid-cols-2 gap-4 px-8" style={{ width: "min(80vw, 340px)" }}>
            {btnOrder.map((ci) => {
              const c = COLORS[ci];
              return (
                <button
                  key={c.key}
                  onClick={() => handleAnswer(ci)}
                  className={`${c.btn} h-20 sm:h-24 rounded-2xl font-bold text-white/90 text-lg
                    shadow-lg active:scale-90 transition-transform duration-75
                    cursor-pointer select-none`}
                  style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
                >
                  {t("stroop." + c.key)}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Hint IDLE ── */}
        {gameState === STATES.IDLE && (
          <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
            <div className="flex flex-col items-center gap-3 animate-pulse">
              <img src="/logo-stroopeffect.png" alt="Stroop Effect" className="w-16 h-16 object-contain drop-shadow-lg" draggable={false} />
              <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
                {t("stroop.instruction")}
              </span>
            </div>
          </div>
        )}

        {/* ── GAME OVER ── */}
        {isEnded && (
          <GameOverPanel
            title="Game Over"
            score={score}
            subtitle={t("stroop.subtitle")}
            onReplay={onReplay}
            onNext={onNextGame}
            ranking={ranking}
            scoreMessage={scoreMessage}
            xpGained={xpGained}

            isLoading={isRankingLoading}
          />
        )}
      </div>
    </div>
  );
};

export default StroopEffectGame;
