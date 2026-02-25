/**
 * MemorySequenceGame.jsx — Memory Sequence
 *
 * Juego de memoria visual. Se muestran X cuadrados numerados en posiciones
 * aleatorias. Al tocar el "1", los números restantes desaparecen.
 * El jugador debe recordar y tocar en orden correcto.
 *
 * Props:
 *   isActive   – inicia el juego tras el countdown
 *   onNextGame – avanza al siguiente juego
 *   onReplay   – replay del juego actual
 *   userId     – ID de Supabase (puede ser undefined)
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ═══════════════════ CONSTANTS ═══════════════════ */
const STATES = { IDLE: "idle", PLAYING: "playing", ENDED: "ended" };

// Grid virtual: 5 columnas x 7 filas (zona jugable central)
const GRID_COLS = 5;
const GRID_ROWS = 7;
const STARTING_SQUARES = 4; // Ronda 1
const ROUND_TRANSITION_MS = 600;

// Zona segura: top 20%, bottom 25%, derecha 20% (botones del feed)
// Grid virtual 9 filas × 5 cols; solo usamos filas 2-6 y cols 0-3
const SAFE_GRID_COLS = 5;
const SAFE_GRID_ROWS = 9;
const COL_START = 0;  // columna inicial
const COL_END = 3;    // columna final (col 4 = botones derecha, excluida)
const ROW_START = 2;  // 20% top excluded (rows 0,1)
const ROW_END = 6;    // 25% bottom excluded (rows 7,8)

// Colores
const BG_COLOR = "#0a0e17";
const SQUARE_COLOR = "#6366f1";        // indigo-500
const SQUARE_CLICKED = "#22c55e";      // green-500
const SQUARE_WRONG = "#ef4444";        // red-500
const SQUARE_IDLE = "#4f46e5";         // indigo-600

/* ═══════════════════ GRID GENERATION ═══════════════════ */

/**
 * Genera posiciones únicas en una cuadrícula invisible.
 * No hay solapamientos porque cada celda es única.
 */
function generateLevel(squareCount) {
  // Todas las celdas disponibles en la zona segura
  const availableCells = [];
  for (let r = ROW_START; r <= ROW_END; r++) {
    for (let c = COL_START; c <= COL_END; c++) {
      availableCells.push({ row: r, col: c });
    }
  }

  // Shuffle (Fisher-Yates)
  for (let i = availableCells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableCells[i], availableCells[j]] = [availableCells[j], availableCells[i]];
  }

  // Seleccionar squareCount celdas únicas
  const selectedCells = availableCells.slice(0, Math.min(squareCount, availableCells.length));

  return selectedCells.map((cell, idx) => ({
    id: `sq-${idx}`,
    number: idx + 1,
    row: cell.row,
    col: cell.col,
    isClicked: false,
    isHidden: false,
  }));
}

/* ═══════════════════ COMPONENT ═══════════════════ */

const MemorySequenceGame = ({ isActive, onNextGame, onReplay, userId }) => {
  const { t } = useLanguage();

  /* ── Core state ── */
  const [gameState, setGameState] = useState(STATES.IDLE);
  const [round, setRound] = useState(1);
  const [squares, setSquares] = useState([]);
  const [nextExpected, setNextExpected] = useState(1);
  const [score, setScore] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  /* ── GameOver/Ranking state ── */
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  /* ── Flash feedback ── */
  const [wrongId, setWrongId] = useState(null);
  const [roundFlash, setRoundFlash] = useState(false);
  const [failed, setFailed] = useState(false);

  const { submit, xpGained } = useSubmitScore(userId, GAME_IDS.MemorySequenceGame);

  /* ── Start game when isActive flips ── */
  const startGame = useCallback(() => {
    const initialSquares = generateLevel(STARTING_SQUARES);
    setRound(1);
    setSquares(initialSquares);
    setNextExpected(1);
    setScore(0);
    setTransitioning(false);
    setWrongId(null);
    setRoundFlash(false);
    setFailed(false);
    setGameState(STATES.PLAYING);
  }, []);

  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, startGame, gameState]);

  /* ── Max squares the grid can support ── */
  const maxSquares = useMemo(
    () => (ROW_END - ROW_START + 1) * (COL_END - COL_START + 1),
    []
  );

  /* ── Handle square click ── */
  const handleSquareClick = useCallback(
    (clickedSquare) => {
      if (gameState !== STATES.PLAYING) return;
      if (transitioning) return;
      if (failed) return;
      if (clickedSquare.isClicked) return;

      if (clickedSquare.number === nextExpected) {
        /* ── Correct tap ── */
        setSquares((prev) =>
          prev.map((sq) => {
            if (sq.id === clickedSquare.id) {
              return { ...sq, isClicked: true };
            }
            // Si toca el "1", ocultar números del resto
            if (clickedSquare.number === 1 && sq.id !== clickedSquare.id) {
              return { ...sq, isHidden: true };
            }
            return sq;
          })
        );

        const next = nextExpected + 1;
        const totalInRound = STARTING_SQUARES + round - 1;

        if (next > totalInRound) {
          /* ── Ronda completada ── */
          const newScore = round; // score = rondas completadas
          setScore(newScore);
          setTransitioning(true);
          setRoundFlash(true);

          const nextRound = round + 1;
          const nextSquareCount = STARTING_SQUARES + nextRound - 1;

          // Si supera el máximo de celdas, Game Over (¡ganó!)
          if (nextSquareCount > maxSquares) {
            setTimeout(() => {
              setGameState(STATES.ENDED);
            }, ROUND_TRANSITION_MS);
            return;
          }

          setTimeout(() => {
            setRound(nextRound);
            setSquares(generateLevel(nextSquareCount));
            setNextExpected(1);
            setTransitioning(false);
            setRoundFlash(false);
          }, ROUND_TRANSITION_MS);
        } else {
          setNextExpected(next);
        }
      } else {
        /* ── Wrong tap → Game Over ── */
        setFailed(true);
        setWrongId(clickedSquare.id);
        // Revelar todos los números antes de morir
        setSquares((prev) =>
          prev.map((sq) => ({ ...sq, isHidden: false }))
        );
        setTimeout(() => {
          setGameState(STATES.ENDED);
        }, 500);
      }
    },
    [gameState, nextExpected, round, transitioning, failed, maxSquares]
  );

  /* ── Submit score on game end ── */
  const isEnded = gameState === STATES.ENDED;

  useEffect(() => {
    if (isEnded && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submit(score, () => {})
        .then((r) => {
          setRanking(r?.data?.ranking || []);
          setScoreMessage(r?.message || "");
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

  /* ── Computed values ── */
  const totalInRound = STARTING_SQUARES + round - 1;

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <div
      className="w-full h-full relative overflow-hidden select-none"
      style={{ backgroundColor: BG_COLOR, touchAction: "manipulation" }}
    >
      {/* Feed decorative overlays */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* HUD: Round indicator */}
      {gameState === STATES.PLAYING && (
        <div className="absolute top-14 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <div
            className={`
              px-5 py-2 rounded-full text-white font-bold text-lg
              transition-all duration-300
              ${roundFlash
                ? "bg-green-500/90 scale-110"
                : "bg-white/10 backdrop-blur-sm"
              }
            `}
          >
            {t("memseq.round")} {round}
          </div>
        </div>
      )}

      {/* Game area: cuadrícula invisible */}
      {gameState === STATES.PLAYING && (
        <div className="absolute inset-0 z-2">
          {squares.map((sq) => {
            // Calcular posición con porcentajes basados en la cuadrícula
            // Mapear cols 0-COL_END al 80% izquierdo de la pantalla (derecha = botones)
            const usableWidth = 80; // % de ancho útil
            const xPercent = ((sq.col - COL_START + 0.5) / (COL_END - COL_START + 1)) * usableWidth;
            const yPercent = ((sq.row + 0.5) / SAFE_GRID_ROWS) * 100;

            let bgColor = SQUARE_COLOR;
            if (sq.isClicked) bgColor = SQUARE_CLICKED;
            if (wrongId === sq.id) bgColor = SQUARE_WRONG;

            return (
              <button
                key={sq.id}
                onClick={() => handleSquareClick(sq)}
                className="absolute flex items-center justify-center rounded-xl
                           font-bold text-white shadow-lg
                           transition-all duration-150 active:scale-90
                           focus:outline-none"
                style={{
                  left: `${xPercent}%`,
                  top: `${yPercent}%`,
                  transform: "translate(-50%, -50%)",
                  width: "clamp(48px, 14vw, 72px)",
                  height: "clamp(48px, 14vw, 72px)",
                  backgroundColor: bgColor,
                  fontSize: "clamp(18px, 5vw, 28px)",
                  boxShadow: sq.isClicked
                    ? "0 0 20px rgba(34,197,94,0.4)"
                    : wrongId === sq.id
                    ? "0 0 20px rgba(239,68,68,0.5)"
                    : "0 4px 15px rgba(99,102,241,0.3)",
                  opacity: sq.isClicked ? 0.6 : 1,
                  pointerEvents: sq.isClicked || transitioning || failed ? "none" : "auto",
                }}
              >
                {/* Mostrar número si no está oculto o ya fue clickeado */}
                {(!sq.isHidden || sq.isClicked) && (
                  <span className="drop-shadow-md">{sq.number}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Game Over */}
      {isEnded && (
        <GameOverPanel
          title="Game Over"
          score={score}
          subtitle={t("memseq.subtitle")}
          onReplay={onReplay}
          onNext={onNextGame}
          ranking={ranking}
          scoreMessage={scoreMessage}
          xpGained={xpGained}
          isLoading={isRankingLoading}
        />
      )}
    </div>
  );
};

export default MemorySequenceGame;
