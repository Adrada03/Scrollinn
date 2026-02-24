/**
 * HigherLowerGame.jsx — "Higher or Lower"
 *
 * Minijuego de cartas: se muestra una carta boca arriba (izquierda)
 * y un taco de cartas boca abajo (derecha). El jugador elige Mayor o Menor,
 * la carta del taco se voltea, y si acierta se desliza encima de la
 * carta actual convirtiéndose en la nueva referencia.
 *
 * Props:
 *   isActive    – cuando pasa a true, arranca el juego
 *   onNextGame  – callback para ir al siguiente juego
 *   userId      – id del usuario actual
 *   onScrollLock – bloquear scroll del feed
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ═══════════════════ CONSTANTES ═══════════════════ */
const STATES = { IDLE: "idle", PLAYING: "playing", ENDED: "ended" };

/**
 * Fases de animación por ronda:
 *  WAITING   → el jugador puede pulsar Higher/Lower
 *  FLIPPING  → la carta del taco se voltea (0.4s)
 *  RESULT    → se muestra el glow verde/rojo (0.5s)
 *  SLIDING   → la carta se desliza encima de la actual (0.4s)
 */
const PHASE = { WAITING: 0, FLIPPING: 1, RESULT: 2, SLIDING: 3 };

const SUITS = [
  { symbol: "♥", name: "hearts",   color: "text-red-500"   },
  { symbol: "♦", name: "diamonds", color: "text-red-500"   },
  { symbol: "♠", name: "spades",   color: "text-zinc-800"  },
  { symbol: "♣", name: "clubs",    color: "text-zinc-800"  },
];

const VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const VALUE_LABELS = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8",
  9: "9", 10: "10", 11: "J", 12: "Q", 13: "K", 14: "A",
};

/* Tamaños de carta responsivos */
const CARD_W = "clamp(7rem, 22vw, 12rem)";   // ~112px – 192px
const CARD_H = "clamp(10.5rem, 33vw, 18rem)";

/* ═══════════════════ HELPERS ═══════════════════ */

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ value, suit });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function drawCard(deckRef) {
  if (deckRef.current.length === 0) deckRef.current = createDeck();
  return deckRef.current.pop();
}

/* ═══════════════════ CARD FACE (boca arriba) ═══════════════════ */
const CardFace = ({ card, result = null, className = "" }) => {
  if (!card) return null;
  const label = VALUE_LABELS[card.value];
  const { symbol, color } = card.suit;

  let glowStyle = {};
  if (result === "correct") glowStyle = { boxShadow: "0 0 24px 4px rgba(52,211,153,0.5)", border: "2.5px solid rgba(52,211,153,0.7)" };
  if (result === "wrong")   glowStyle = { boxShadow: "0 0 24px 4px rgba(248,113,113,0.5)", border: "2.5px solid rgba(248,113,113,0.7)" };

  return (
    <div
      className={`relative bg-white rounded-2xl shadow-2xl flex flex-col items-center justify-center border border-zinc-200 select-none ${className}`}
      style={{ width: CARD_W, height: CARD_H, ...glowStyle }}
    >
      {/* Esquina superior izquierda */}
      <div className={`absolute top-1.5 left-2 flex flex-col items-center leading-none ${color}`}>
        <span className="text-[0.7rem] font-bold">{label}</span>
        <span className="text-[0.6rem] -mt-0.5">{symbol}</span>
      </div>
      {/* Centro */}
      <div className={`flex flex-col items-center ${color}`}>
        <span className="text-[clamp(2.5rem,8vw,4rem)] font-black leading-none">{label}</span>
        <span className="text-[clamp(1.5rem,5vw,2.5rem)] mt-0.5">{symbol}</span>
      </div>
      {/* Esquina inferior derecha (invertida) */}
      <div className={`absolute bottom-1.5 right-2 flex flex-col items-center leading-none rotate-180 ${color}`}>
        <span className="text-[0.7rem] font-bold">{label}</span>
        <span className="text-[0.6rem] -mt-0.5">{symbol}</span>
      </div>
    </div>
  );
};

/* ═══════════════════ CARD BACK (dorso del taco) ═══════════════════ */
const CardBack = ({ className = "" }) => (
  <div
    className={`relative rounded-2xl shadow-2xl select-none overflow-hidden ${className}`}
    style={{
      width: CARD_W,
      height: CARD_H,
      background: "linear-gradient(145deg, #1a1a1a 0%, #111111 50%, #0a0a0a 100%)",
      border: "2.5px solid rgba(255,255,255,0.06)",
    }}
  >
    {/* Borde interior */}
    <div className="absolute inset-2 rounded-xl border border-white/[0.06] flex items-center justify-center">
      <img
        src="/logoScrollinn-noBg.png"
        alt=""
        className="w-10 h-10 opacity-25"
        draggable={false}
        style={{ imageRendering: "auto" }}
      />
    </div>
  </div>
);

/* ═══════════════════ DECK STACK (taco visual con profundidad) ═══════════════════ */
const DeckStack = ({ className = "" }) => (
  <div className={`relative ${className}`} style={{ width: CARD_W, height: CARD_H }}>
    {/* Cartas apiladas debajo para dar profundidad */}
    <div className="absolute" style={{ top: "4px", left: "4px", width: CARD_W, height: CARD_H }}>
      <CardBack />
    </div>
    <div className="absolute" style={{ top: "2px", left: "2px", width: CARD_W, height: CARD_H }}>
      <CardBack />
    </div>
    <div className="absolute" style={{ top: 0, left: 0 }}>
      <CardBack />
    </div>
  </div>
);

/* ═══════════════════ FLIP CARD (carta que se voltea con CSS 3D) ═══════════════════ */
const FlipCard = ({ card, isFlipped, result = null }) => (
  <div style={{ width: CARD_W, height: CARD_H, perspective: "800px" }}>
    <div
      className="relative w-full h-full transition-transform duration-[400ms]"
      style={{
        transformStyle: "preserve-3d",
        transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
      }}
    >
      {/* Dorso (cara frontal en 3D, visible cuando NO está volteada) */}
      <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
        <CardBack className="w-full h-full" />
      </div>
      {/* Cara (visible cuando SÍ está volteada) */}
      <div
        className="absolute inset-0"
        style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
      >
        <CardFace card={card} result={result} className="w-full h-full" />
      </div>
    </div>
  </div>
);

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */
const HigherLowerGame = ({ isActive, onNextGame, onReplay, userId, onScrollLock }) => {
  const { t } = useLanguage();

  const [gameState, setGameState]     = useState(STATES.IDLE);
  const [score, setScore]             = useState(0);
  const [currentCard, setCurrentCard] = useState(null);
  const [nextCard, setNextCard]       = useState(null);
  const [phase, setPhase]             = useState(PHASE.WAITING);
  const [result, setResult]           = useState(null);     // "correct" | "wrong" | null
  const [streak, setStreak]           = useState(0);
  const [ranking, setRanking]         = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);

  const deckRef         = useRef([]);
  const scoreRef        = useRef(0);
  const currentCardRef  = useRef(null);
  const gameStateRef    = useRef(STATES.IDLE);
  const scoreSubmitted  = useRef(false);
  const lockingRef      = useRef(false);
  const scrollLockTORef = useRef(null);
  const t1Ref = useRef(null);
  const t2Ref = useRef(null);
  const t3Ref = useRef(null);

  const { submit } = useSubmitScore(userId, GAME_IDS.HigherLowerGame);

  /* ── Arrancar partida ── */
  const startGame = useCallback(() => {
    deckRef.current       = createDeck();
    scoreRef.current      = 0;
    gameStateRef.current  = STATES.PLAYING;
    lockingRef.current    = false;

    const first = drawCard(deckRef);
    currentCardRef.current = first;
    setCurrentCard(first);
    setNextCard(null);
    setScore(0);
    setStreak(0);
    setResult(null);
    setPhase(PHASE.WAITING);
    setGameState(STATES.PLAYING);

    clearTimeout(scrollLockTORef.current);
    clearTimeout(t1Ref.current);
    clearTimeout(t2Ref.current);
    clearTimeout(t3Ref.current);
    onScrollLock?.(true);
  }, [onScrollLock]);

  /* ── Auto-start ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, startGame, gameState]);

  /* ── Cleanup ── */
  useEffect(() => () => {
    clearTimeout(scrollLockTORef.current);
    clearTimeout(t1Ref.current);
    clearTimeout(t2Ref.current);
    clearTimeout(t3Ref.current);
    onScrollLock?.(false);
  }, []);

  /* ── Enviar puntuación al terminar ── */
  useEffect(() => {
    if (gameState === STATES.ENDED && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submit(score, () => {})
        .then((res) => {
          setRanking(res?.data?.ranking || []);
          setScoreMessage(res?.message || "");
        })
        .catch(() => setScoreMessage(t("svc.score_error")))
        .finally(() => setIsRankingLoading(false));
    }
    if (gameState === STATES.IDLE) {
      scoreSubmitted.current = false;
      setRanking([]);
      setScoreMessage("");
    }
  }, [gameState, score, userId, submit]);

  /* ── Lógica de adivinanza ── */
  const handleGuess = useCallback((guess) => {
    if (gameStateRef.current !== STATES.PLAYING || lockingRef.current) return;
    lockingRef.current = true;

    const prev  = currentCardRef.current;
    const drawn = drawCard(deckRef);
    setNextCard(drawn);

    // 1) Voltear la carta del taco
    setPhase(PHASE.FLIPPING);

    // 2) Tras volteo → evaluar y mostrar resultado
    t1Ref.current = setTimeout(() => {
      const isTie    = drawn.value === prev.value;
      const isHigher = drawn.value >= prev.value;
      const isLower  = drawn.value <= prev.value;

      const correct =
        isTie ||
        (guess === "higher" && isHigher) ||
        (guess === "lower" && isLower);

      if (correct) {
        scoreRef.current += 1;
        setScore(scoreRef.current);
        setStreak((s) => s + 1);
        setResult("correct");
        setPhase(PHASE.RESULT);

        // 3) Deslizar la carta encima de la actual
        t2Ref.current = setTimeout(() => {
          setPhase(PHASE.SLIDING);

          // 4) Completar: la carta deslizada se convierte en la actual
          t3Ref.current = setTimeout(() => {
            currentCardRef.current = drawn;
            setCurrentCard(drawn);
            setNextCard(null);
            setResult(null);
            setPhase(PHASE.WAITING);
            lockingRef.current = false;
          }, 450); // duración del slide
        }, 500); // duración del resultado visible
      } else {
        setResult("wrong");
        setPhase(PHASE.RESULT);
        gameStateRef.current = STATES.ENDED;

        t2Ref.current = setTimeout(() => {
          setGameState(STATES.ENDED);
          scrollLockTORef.current = setTimeout(() => onScrollLock?.(false), 2000);
        }, 900);
      }
    }, 420); // duración del flip 3D
  }, [onScrollLock]);

  /* ── Derivados ── */
  const isPlaying = gameState === STATES.PLAYING;
  const isEnded   = gameState === STATES.ENDED;
  const canGuess  = isPlaying && phase === PHASE.WAITING;

  /* Fondo del tapete */
  const bgStyle = {
    background: "radial-gradient(ellipse at center, #1a3a2a 0%, #0c1f17 50%, #070f0b 100%)",
  };

  /*
   * Estilo de la carta que se desliza de la posición derecha
   * a la posición izquierda (slide-left) cuando phase === SLIDING.
   */
  const slideStyle = phase === PHASE.SLIDING
    ? { transform: "translateX(calc(-100% - 1rem))", transition: "transform 0.4s cubic-bezier(0.4,0,0.2,1)" }
    : {};

  return (
    <div
      className="relative h-full w-full flex flex-col items-center justify-center overflow-hidden select-none"
      style={{
        ...bgStyle,
        touchAction: "manipulation",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      {/* ── Overlays para UI del feed ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ── Patrón sutil de tapete ── */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `repeating-linear-gradient(45deg,transparent,transparent 10px,rgba(255,255,255,0.03) 10px,rgba(255,255,255,0.03) 11px)`,
        }}
      />

      {/* ── Score (arriba) ── */}
      {gameState !== STATES.IDLE && (
        <div className="absolute top-16 left-0 right-0 z-3 flex flex-col items-center">
          <span
            className="text-4xl font-black text-white tabular-nums drop-shadow-lg"
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {score}
          </span>
          {streak >= 3 && (
            <span className="text-xs font-bold text-amber-400 mt-1 animate-pulse">
              🔥 {streak} streak!
            </span>
          )}
        </div>
      )}

      {/* ── Instrucciones de prioridad ── */}
      {isPlaying && phase === PHASE.WAITING && (
        <div className="absolute top-[6.5rem] left-0 right-0 z-3 flex justify-center pointer-events-none">
          <span className="text-sm font-bold text-white/35 tracking-widest">
            2 · 3 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · J · Q · K · A
          </span>
        </div>
      )}

      {/* ═══════ ZONA DE CARTAS ═══════ */}
      <div className="relative z-2 flex items-center justify-center gap-4 mt-6">

        {/* ── Carta actual (izquierda, boca arriba) ── */}
        <div className="relative" style={{ width: CARD_W, height: CARD_H }}>
          {currentCard && (
            <CardFace card={currentCard} />
          )}
        </div>

        {/* ── Taco / carta revelada (derecha) ── */}
        <div className="relative" style={{ width: CARD_W, height: CARD_H }}>
          {/* Taco de fondo (siempre visible mientras no se esté deslizando) */}
          {phase !== PHASE.SLIDING && (
            <div className="absolute inset-0">
              <DeckStack />
            </div>
          )}

          {/* Carta que se voltea y desliza */}
          {nextCard && (
            <div
              className="absolute inset-0 z-10"
              style={slideStyle}
            >
              <FlipCard
                card={nextCard}
                isFlipped={phase >= PHASE.FLIPPING}
                result={phase >= PHASE.RESULT ? result : null}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── VS badge entre cartas ── */}
      {isPlaying && (
        <div className="absolute z-3 pointer-events-none" style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
          <div className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center">
            <span className="text-white/60 text-xs font-black">VS</span>
          </div>
        </div>
      )}

      {/* ── Botones Higher / Lower ── */}
      {canGuess && (
        <div className="relative z-3 flex gap-6 mt-8">
          {/* HIGHER */}
          <button
            type="button"
            onPointerDown={() => handleGuess("higher")}
            className="flex flex-col items-center justify-center w-36 h-[4.5rem] rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-90 shadow-lg shadow-emerald-500/30 transition-all duration-100 cursor-pointer select-none"
            style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
          >
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
            <span className="text-white text-[0.65rem] font-bold mt-0.5 uppercase tracking-wider">Higher</span>
          </button>

          {/* LOWER */}
          <button
            type="button"
            onPointerDown={() => handleGuess("lower")}
            className="flex flex-col items-center justify-center w-36 h-[4.5rem] rounded-2xl bg-rose-500 hover:bg-rose-400 active:scale-90 shadow-lg shadow-rose-500/30 transition-all duration-100 cursor-pointer select-none"
            style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
          >
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            <span className="text-white text-[0.65rem] font-bold mt-0.5 uppercase tracking-wider">Lower</span>
          </button>
        </div>
      )}

      {/* ── Feedback acierto ── */}
      {result === "correct" && phase === PHASE.RESULT && (
        <div className="absolute inset-0 pointer-events-none z-4 flex items-center justify-center">
          <span className="text-5xl drop-shadow-lg animate-[popIn_0.3s_ease-out]">✅</span>
        </div>
      )}

      {/* ── Feedback fallo ── */}
      {result === "wrong" && phase === PHASE.RESULT && (
        <div className="absolute inset-0 pointer-events-none z-4 flex items-center justify-center">
          <span className="text-5xl drop-shadow-lg animate-[popIn_0.3s_ease-out]">❌</span>
        </div>
      )}

      {/* ── GAME OVER ── */}
      {isEnded && (
        <div className="absolute inset-0 flex items-center justify-center z-6 pointer-events-auto">
          <GameOverPanel
            title="Game Over"
            score={score}
            subtitle={score === 1 ? "acierto" : "aciertos"}
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

export default HigherLowerGame;
