/**
 * ColorMatchGame.jsx — "Color Match" (Color Flood)
 *
 * Juego de inundación de colores: partiendo de la esquina superior-izquierda,
 * elige colores de la paleta para expandir tu zona y conquistar todo el tablero.
 *
 * - Tablero 10×10 con 5 colores aleatorios
 * - Máximo 25 movimientos
 * - Flood-fill desde la celda [0,0]
 * - Gana si todo el tablero es de un solo color; pierde si agota movimientos
 *
 * Props:
 *   isActive (boolean) — cuando pasa a true, arranca la partida
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ─────────── Constantes ─────────── */

const GAME_STATES = { IDLE: "idle", PLAYING: "playing", ENDED: "ended" };
const BOARD_SIZE = 10;
const TOTAL_CELLS = BOARD_SIZE * BOARD_SIZE;
const NUM_COLORS = 5;
const MAX_MOVES = 25;

const COLOR_PALETTE = [
  "#573659", // morado oscuro
  "#ad4375", // rosa
  "#fa7370", // salmón
  "#f59231", // naranja
  "#fecd5f", // amarillo
  "#9ccf5e", // verde lima
  "#3cad5b", // verde
  "#36cbbf", // turquesa
  "#1d839c", // azul petróleo
  "#2f506c", // azul oscuro
];

/* ─────────── Utilidades ─────────── */

/** Mezcla Fisher-Yates */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Escoge N colores aleatorios de la paleta */
function pickColors(n) {
  return shuffle(COLOR_PALETTE).slice(0, n);
}

/** Genera un tablero aleatorio de TOTAL_CELLS con los colores dados */
function generateBoard(colors) {
  return Array.from({ length: TOTAL_CELLS }, () =>
    colors[Math.floor(Math.random() * colors.length)]
  );
}

/**
 * Flood-fill: marca todas las celdas conectadas al origen (0,0)
 * que comparten el mismo color, retorna un Set de índices.
 */
function getFloodRegion(board) {
  const visited = new Set();
  const queue = [0];
  const targetColor = board[0];
  visited.add(0);

  while (queue.length > 0) {
    const idx = queue.shift();
    const row = Math.floor(idx / BOARD_SIZE);
    const col = idx % BOARD_SIZE;

    const neighbors = [];
    if (col + 1 < BOARD_SIZE) neighbors.push(idx + 1);
    if (col - 1 >= 0) neighbors.push(idx - 1);
    if (row + 1 < BOARD_SIZE) neighbors.push(idx + BOARD_SIZE);
    if (row - 1 >= 0) neighbors.push(idx - BOARD_SIZE);

    for (const n of neighbors) {
      if (!visited.has(n) && board[n] === targetColor) {
        visited.add(n);
        queue.push(n);
      }
    }
  }
  return visited;
}

/**
 * Aplica un movimiento: cambia toda la región flood al nuevo color,
 * luego expande con flood-fill iterativo para absorber vecinos del mismo color.
 */
function applyMove(board, newColor) {
  const newBoard = [...board];
  const currentColor = newBoard[0];
  if (currentColor === newColor) return newBoard;

  // Paso 1: pintar toda la región actual con newColor
  const region = getFloodRegion(newBoard);
  for (const idx of region) {
    newBoard[idx] = newColor;
  }

  // Paso 2: expandir iterativamente (las nuevas celdas adyacentes del mismo color se unen)
  let changed = true;
  while (changed) {
    changed = false;
    const currentRegion = getFloodRegion(newBoard);
    for (const idx of currentRegion) {
      if (newBoard[idx] !== newColor) {
        newBoard[idx] = newColor;
        changed = true;
      }
    }
  }

  return newBoard;
}

/** Comprueba si todo el tablero es del mismo color */
function isBoardSolved(board) {
  return board.every((c) => c === board[0]);
}

/* ═══════════════════════════════════════════
   Componente principal
   ═══════════════════════════════════════════ */

const ColorMatchGame = ({ isActive, onNextGame, userId }) => {
  const { t } = useLanguage();
  const [gameState, setGameState] = useState(GAME_STATES.IDLE);
  const [board, setBoard] = useState([]);
  const [colors, setColors] = useState([]);
  const [moves, setMoves] = useState(0);
  const [won, setWon] = useState(false);
  const gameInitialized = useRef(false);
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  const isPlaying = gameState === GAME_STATES.PLAYING;
  const isEnded = gameState === GAME_STATES.ENDED;

  const { submit, loading: isSubmittingScore, error: submitError, lastResult } = useSubmitScore(userId, GAME_IDS.ColorMatchGame);
  // Enviar puntuación al terminar (solo si ganó: menos movimientos = mejor)
  useEffect(() => {
    if (isEnded && won && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submit(moves, () => {})
        .then((result) => {
          setRanking(result?.data?.ranking || []);
          setScoreMessage(result?.message || "");
        })
        .catch(() => setScoreMessage(t("svc.score_error")))
        .finally(() => setIsRankingLoading(false));
    }
    if (isEnded && !won && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      // No ganó — solo cargar ranking sin guardar
      submit(moves, null)
        .then((result) => setRanking(result?.data?.ranking || []))
        .catch(() => {});
    }
    if (gameState === GAME_STATES.IDLE) {
      scoreSubmitted.current = false;
      setRanking([]);
      setScoreMessage("");
    }
  }, [isEnded, won, moves, submit, gameState]);

  /* ─── Iniciar juego nuevo ─── */
  const startGame = useCallback(() => {
    const chosen = pickColors(NUM_COLORS);
    const newBoard = generateBoard(chosen);
    setColors(chosen);
    setBoard(newBoard);
    setMoves(0);
    setWon(false);
    setGameState(GAME_STATES.PLAYING);
    gameInitialized.current = true;
  }, []);

  /* ─── Se activa cuando isActive pasa a true ─── */
  useEffect(() => {
    if (isActive && gameState === GAME_STATES.IDLE) {
      startGame();
    }
  }, [isActive, gameState, startGame]);

  /* ─── Manejar click en color de la paleta ─── */
  const handleColorClick = useCallback(
    (color) => {
      if (!isPlaying) return;
      if (color === board[0]) return; // ya es ese color

      const newBoard = applyMove(board, color);
      const newMoves = moves + 1;
      setBoard(newBoard);
      setMoves(newMoves);

      if (isBoardSolved(newBoard)) {
        setWon(true);
        setGameState(GAME_STATES.ENDED);
      } else if (newMoves >= MAX_MOVES) {
        setWon(false);
        setGameState(GAME_STATES.ENDED);
      }
    },
    [isPlaying, board, moves]
  );

  /* ─── Reiniciar ─── */
  const handleRestart = useCallback(() => {
    startGame();
  }, [startGame]);

  /* ─── Calcular tamaño de la región actual (para progreso visual) ─── */
  const floodSize =
    board.length > 0 ? getFloodRegion(board).size : 0;
  const progress = Math.round((floodSize / TOTAL_CELLS) * 100);

  /* ─── Tamaños responsivos ─── */
  const boardPx = "min(78vw, 390px)";
  const cellGap = 2;

  return (
    <div className="absolute inset-0 bg-[#2d1b36] flex flex-col items-center justify-center select-none overflow-hidden">
      {/* Degradados decorativos Scrollinn */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-40 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 w-full h-40 bg-gradient-to-t from-black/60 to-transparent" />
      </div>

      {/* ====== HUD ====== */}
      {(isPlaying || isEnded) && (
        <div className="relative z-[2] flex items-center justify-between w-full px-6 mb-3" style={{ maxWidth: boardPx }}>
          {/* Movimientos */}
          <div className="flex items-center gap-2">
            <span className="text-white/50 text-xs font-semibold uppercase tracking-wider">
              {t("colormatch.moves")}
            </span>
            <span
              className={`text-lg font-black tabular-nums ${
                moves >= MAX_MOVES - 3 ? "text-red-400" : "text-white/90"
              }`}
            >
              {moves}
            </span>
            <span className="text-white/30 text-sm font-bold">/ {MAX_MOVES}</span>
          </div>

          {/* Progreso */}
          <div className="flex items-center gap-2">
            <span className="text-white/50 text-xs font-semibold uppercase tracking-wider">
              {t("colormatch.zone")}
            </span>
            <span className="text-lg font-black text-white/90 tabular-nums">
              {progress}%
            </span>
          </div>
        </div>
      )}

      {/* ====== TABLERO ====== */}
      <div
        className="relative z-[2] rounded-2xl overflow-hidden shadow-2xl"
        style={{
          width: boardPx,
          aspectRatio: "1",
          display: "grid",
          gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
          gap: `${cellGap}px`,
          background: "#111",
          padding: `${cellGap}px`,
        }}
      >
        {board.map((color, i) => {
          const region = board.length > 0 ? getFloodRegion(board) : new Set();
          const inRegion = region.has(i);
          return (
            <div
              key={i}
              className="transition-colors duration-300"
              style={{
                backgroundColor: color,
                borderRadius: "3px",
                aspectRatio: "1",
                opacity:
                  isPlaying && inRegion && i === 0
                    ? 1
                    : 1,
                boxShadow: isPlaying && inRegion ? "inset 0 0 0 1px rgba(255,255,255,0.08)" : "none",
              }}
            />
          );
        })}

        {/* Indicador de inicio en celda [0,0] */}
        {isPlaying && moves === 0 && (
          <div
            className="absolute pointer-events-none z-10 flex items-center justify-center text-lg animate-pulse"
            style={{
              top: cellGap,
              left: cellGap,
              width: `calc((${boardPx} - ${cellGap * (BOARD_SIZE + 1)}px) / ${BOARD_SIZE})`,
              height: `calc((${boardPx} - ${cellGap * (BOARD_SIZE + 1)}px) / ${BOARD_SIZE})`,
            }}
          >
            ⭐
          </div>
        )}
      </div>

      {/* ====== PALETA DE COLORES ====== */}
      {isPlaying && (
        <div
          className="relative z-[2] flex justify-between mt-4"
          style={{ width: boardPx }}
        >
          {colors.map((color) => {
            const isCurrent = board[0] === color;
            return (
              <button
                key={color}
                onClick={() => handleColorClick(color)}
                disabled={isCurrent}
                className={`rounded-xl transition-all duration-200 ${
                  isCurrent
                    ? "ring-2 ring-white/60 scale-110 brightness-125"
                    : "hover:scale-110 active:scale-95 cursor-pointer"
                }`}
                style={{
                  backgroundColor: color,
                  width: `calc((${boardPx} - 1.5rem) / ${NUM_COLORS})`,
                  aspectRatio: "1",
                  opacity: isCurrent ? 0.5 : 1,
                }}
              />
            );
          })}
        </div>
      )}

      {/* ====== IDLE — oculto: el Countdown del feed ya muestra instrucciones ====== */}

      {/* ====== GAME OVER ====== */}
      {isEnded && (
        <GameOverPanel
          title={won ? t("colormatch.victory") : "Game Over"}
          score={won ? `${moves} mov.` : `${progress}%`}
          subtitle={won ? t("colormatch.completed", { moves }) : t("colormatch.reached", { progress })}
          onNext={onNextGame}
          ranking={ranking}
          scoreMessage={scoreMessage}
          isLoading={isRankingLoading}
        />
      )}
    </div>
  );
};

export default ColorMatchGame;
