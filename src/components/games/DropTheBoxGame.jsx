/**
 * DropTheBoxGame.jsx — "Drop the Box" (Apilador de Grúa)
 *
 * Una grúa se mueve de izquierda a derecha en la parte superior.
 * Al tocar la pantalla, suelta una caja que cae en línea recta.
 * Si la caja se solapa con la parte superior de la torre, se apila.
 * Si no, cae al vacío → Game Over.
 *
 * Cada 5 puntos la grúa se mueve más rápido.
 *
 * Props:
 *   isActive    – cuando pasa a true, arranca el juego
 *   onNextGame  – callback para ir al siguiente juego
 *   currentUser – usuario logueado (para enviar puntuación)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";

/* ─────────── Estados ─────────── */
const STATES = { IDLE: "idle", PLAYING: "playing", DROPPING: "dropping", ENDED: "ended" };

/* ─────────── Constantes ─────────── */
const BOX_W         = 100;       // ancho de cada caja (px)
const BOX_H         = 44;        // alto de cada caja (px)
const BASE_W        = 120;       // ancho de la base
const DROP_SPEED    = 20;        // px por frame de caída
const CRANE_Y       = 60;        // posición Y de la grúa (fija)
const BASE_SPEED    = 3.2;       // velocidad inicial de la grúa (px/frame)
const SPEED_BUMP    = 0.18;      // incremento de velocidad por cada caja apilada
const CRANE_RATIO   = 0.55;      // fracción del ancho usada por la grúa
const LANDING_RATIO = 0.52;      // posición vertical del punto de aterrizaje (desde arriba)

/* ─────────── Colores neón para las cajas ─────────── */
const BOX_COLORS = [
  "#22d3ee", // cyan-400
  "#a78bfa", // violet-400
  "#f472b6", // pink-400
  "#34d399", // emerald-400
  "#fbbf24", // amber-400
  "#fb923c", // orange-400
  "#60a5fa", // blue-400
  "#e879f9", // fuchsia-400
  "#f87171", // red-400
  "#4ade80", // green-400
];

function getBoxColor(index) {
  return BOX_COLORS[index % BOX_COLORS.length];
}

/* ═══════════════════════════════════════════════════════
   COMPONENTE
   ═══════════════════════════════════════════════════════ */
const DropTheBoxGame = ({ isActive, onNextGame, userId }) => {
  const containerRef = useRef(null);

  /* ── Estado del juego ── */
  const [gameState, setGameState] = useState(STATES.IDLE);
  const [score, setScore]         = useState(0);
  const scoreRef                  = useRef(0);

  /* ── Dimensiones del contenedor ── */
  const [dims, setDims] = useState({ w: 400, h: 700 });

  /* ── Tick forzado para re-render desde rAF ── */
  const [, setTick] = useState(0);
  const forceRender = useCallback(() => setTick((t) => t + 1), []);

  /* ── Datos mutables (refs) ── */
  const craneX     = useRef(0);            // posición X actual de la grúa
  const craneDir   = useRef(1);            // 1 = derecha, -1 = izquierda
  const craneSpeed = useRef(BASE_SPEED);
  const dropX      = useRef(-1);           // X de la caja que cae (-1 = sin caja)
  const dropY      = useRef(0);            // Y de la caja que cae
  const tower      = useRef([]);           // [{ x, y, w, color }] — cajas apiladas
  const cameraOff  = useRef(0);            // desplazamiento vertical de cámara
  const rafRef     = useRef(null);

  /* ── Estado de ranking ── */
  const [ranking, setRanking]             = useState([]);
  const [scoreMessage, setScoreMessage]   = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted                    = useRef(false);

  /* ─────────── Medir contenedor ─────────── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setDims({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ─────────── Posición Y del tope de la torre ─────────── */
  const landingY = Math.round(dims.h * LANDING_RATIO);

  const getTopY = useCallback(() => {
    if (tower.current.length === 0) {
      return landingY - BOX_H;
    }
    const top = tower.current[tower.current.length - 1];
    return top.y - BOX_H;
  }, [landingY]);

  /* ─────────── Iniciar partida ─────────── */
  const startGame = useCallback(() => {
    const craneMinX = (dims.w - dims.w * CRANE_RATIO) / 2;
    craneX.current     = craneMinX;
    craneDir.current   = 1;
    craneSpeed.current = BASE_SPEED;
    dropX.current      = -1;
    dropY.current      = 0;
    cameraOff.current  = 0;
    scoreRef.current   = 0;
    setScore(0);
    scoreSubmitted.current = false;
    setRanking([]);
    setScoreMessage("");

    // Torre: solo la base
    tower.current = [{
      x: dims.w / 2 - BASE_W / 2,
      y: landingY,
      w: BASE_W,
      color: "#6b7280", // gray-500
    }];
    forceRender();
    setGameState(STATES.PLAYING);
  }, [dims.w, landingY, forceRender]);

  /* ── Auto-start ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, gameState, startGame]);

  /* ─────────── Game loop (rAF) ─────────── */
  useEffect(() => {
    if (gameState !== STATES.PLAYING && gameState !== STATES.DROPPING) return;

    const tick = () => {
      const W = dims.w;

      /* ── Mover grúa (rango reducido al centro) ── */
      const craneZone = W * CRANE_RATIO;
      const craneMinX = (W - craneZone) / 2;
      const craneMaxX = craneMinX + craneZone - BOX_W;

      if (gameState === STATES.PLAYING || dropX.current === -1) {
        craneX.current += craneSpeed.current * craneDir.current;
        if (craneX.current >= craneMaxX) {
          craneX.current = craneMaxX;
          craneDir.current = -1;
        } else if (craneX.current <= craneMinX) {
          craneX.current = craneMinX;
          craneDir.current = 1;
        }
      }

      /* ── Animar caja cayendo ── */
      if (dropX.current >= 0) {
        dropY.current += DROP_SPEED;

        const topBox = tower.current[tower.current.length - 1];
        const landingY = topBox.y - BOX_H + cameraOff.current;

        if (dropY.current >= landingY) {
          // Llegó a la altura de la torre — comprobar solapamiento X
          const dxLeft  = dropX.current;
          const dxRight = dropX.current + BOX_W;
          const txLeft  = topBox.x;
          const txRight = topBox.x + topBox.w;

          const overlapLeft  = Math.max(dxLeft, txLeft);
          const overlapRight = Math.min(dxRight, txRight);
          const overlap      = overlapRight - overlapLeft;

          if (overlap > 4) {
            // ✅ ACIERTO — apilar la caja entera (sin recortar)
            const newScore = scoreRef.current + 1;
            scoreRef.current = newScore;
            setScore(newScore);

            tower.current.push({
              x: dropX.current,
              y: topBox.y - BOX_H,
              w: BOX_W,
              color: getBoxColor(newScore),
            });

            // Subir cámara para hacer hueco
            cameraOff.current += BOX_H;

            // Aumentar velocidad incrementalmente cada caja
            craneSpeed.current += SPEED_BUMP;

            dropX.current = -1;
            setGameState(STATES.PLAYING);
          } else {
            // ❌ FALLO — dejar que siga cayendo un poco y luego game over
            if (dropY.current > dims.h + 50) {
              dropX.current = -1;
              setGameState(STATES.ENDED);
              forceRender();
              rafRef.current = null;
              return;
            }
          }
        } else if (dropY.current > dims.h + 50) {
          // Caja pasó de largo por debajo (sin torre debajo — fallo)
          dropX.current = -1;
          setGameState(STATES.ENDED);
          forceRender();
          rafRef.current = null;
          return;
        }
      }

      forceRender();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [gameState, dims.w, dims.h, forceRender]);

  /* ─────────── Drop (tap) ─────────── */
  const handleTap = useCallback(() => {
    if (gameState !== STATES.PLAYING) return;
    if (dropX.current >= 0) return; // ya hay una caja cayendo

    dropX.current = craneX.current;
    dropY.current = CRANE_Y + 30; // empieza justo debajo de la grúa
    setGameState(STATES.DROPPING);
  }, [gameState]);

  const { submit, loading: isSubmittingScore, error: submitError, lastResult } = useSubmitScore(userId, GAME_IDS.DropTheBoxGame);
  /* ─────────── Enviar puntuación al terminar ─────────── */
  useEffect(() => {
    if (gameState === STATES.ENDED && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submit(scoreRef.current, () => {})
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
  }, [gameState, submit]);

  /* ─────────── Cleanup ─────────── */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /* ─────────── Render ─────────── */
  const isPlaying  = gameState === STATES.PLAYING || gameState === STATES.DROPPING;
  const isEnded    = gameState === STATES.ENDED;
  const towerBoxes = tower.current;
  const cam        = cameraOff.current;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-zinc-900 overflow-hidden select-none"
      style={{ touchAction: "none" }}
      onPointerDown={handleTap}
    >
      {/* ── Gradient overlays para UI del feed ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ── Fondo decorativo: líneas de guía verticales ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-px bg-white/3"
            style={{ left: `${(i + 1) * 12.5}%` }}
          />
        ))}
      </div>

      {/* ── HUD: Score ── */}
      {gameState !== STATES.IDLE && (
        <div className="absolute top-16 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <span
            className="text-5xl font-black text-white/80 tabular-nums"
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {score}
          </span>
        </div>
      )}

      {/* ════════════════ ESCENA ════════════════ */}
      <div className="absolute inset-0">

        {/* ── Grúa: brazo + cable + caja pendiente ── */}
        {isPlaying && dropX.current < 0 && (
          <>
            {/* Cable */}
            <div
              className="absolute bg-white/20"
              style={{
                left: craneX.current + BOX_W / 2 - 1,
                top: 0,
                width: 2,
                height: CRANE_Y + 30,
              }}
            />
            {/* Caja en la grúa */}
            <div
              className="absolute rounded-sm"
              style={{
                left: craneX.current,
                top: CRANE_Y + 30,
                width: BOX_W,
                height: BOX_H,
                background: getBoxColor(scoreRef.current + 1),
                boxShadow: `0 0 12px ${getBoxColor(scoreRef.current + 1)}40, inset 0 1px 0 rgba(255,255,255,0.25)`,
              }}
            />
            {/* Indicador superior de la grúa */}
            <div
              className="absolute bg-gray-500 rounded-sm"
              style={{
                left: craneX.current + BOX_W / 2 - 14,
                top: CRANE_Y - 4,
                width: 28,
                height: 8,
              }}
            />
          </>
        )}

        {/* ── Caja cayendo ── */}
        {dropX.current >= 0 && (
          <div
            className="absolute rounded-sm"
            style={{
              left: dropX.current,
              top: dropY.current,
              width: BOX_W,
              height: BOX_H,
              background: getBoxColor(scoreRef.current + 1),
              boxShadow: `0 0 12px ${getBoxColor(scoreRef.current + 1)}40, inset 0 1px 0 rgba(255,255,255,0.25)`,
            }}
          />
        )}

        {/* ── Torre de cajas apiladas ── */}
        {towerBoxes.map((box, i) => (
          <div
            key={i}
            className="absolute rounded-sm"
            style={{
              left: box.x,
              top: box.y + cam,
              width: box.w,
              height: BOX_H,
              background: box.color,
              boxShadow: i === 0
                ? "none"
                : `0 0 8px ${box.color}30, inset 0 1px 0 rgba(255,255,255,0.2)`,
              border: i === 0 ? "2px solid #9ca3af" : "none",
            }}
          >
            {/* Línea decorativa superior */}
            {i > 0 && (
              <div className="absolute top-0 left-0.5 right-0.5 h-px bg-white/20 rounded" />
            )}
          </div>
        ))}

        {/* ── Línea de suelo ── */}
        <div
          className="absolute left-0 right-0 h-px bg-white/10"
          style={{ top: landingY + cam + BOX_H }}
        />
      </div>

      {/* ── Hint IDLE ── */}
      {gameState === STATES.IDLE && (
        <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
          <div className="flex flex-col items-center gap-3 animate-pulse">
            <img
              src="/static/img/logoDropTheBox-noBg.png"
              alt="Drop the Box"
              className="w-16 h-16 object-contain drop-shadow-lg"
              draggable={false}
            />
            <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
              Toca para soltar la caja
            </span>
          </div>
        </div>
      )}

      {/* ── Hint PLAYING ── */}
      {gameState === STATES.PLAYING && score === 0 && dropX.current < 0 && (
        <div className="absolute inset-x-0 flex justify-center pointer-events-none z-3" style={{ top: CRANE_Y + BOX_H + 60 }}>
          <span className="text-sm font-medium text-white/20 tracking-wider uppercase animate-pulse">
            Toca para soltar
          </span>
        </div>
      )}

      {/* ── Velocidad info ── */}
      {isPlaying && score >= 5 && (
        <div className="absolute bottom-28 left-0 right-0 flex justify-center pointer-events-none z-3">
          <span className="text-xs text-white/15 font-medium">
            Velocidad ×{(craneSpeed.current / BASE_SPEED).toFixed(1)}
          </span>
        </div>
      )}

      {/* ── GAME OVER ── */}
      {isEnded && (
        <div className="flex flex-col items-center gap-2 mb-4">
          <span
            className="text-7xl sm:text-8xl font-black text-white tabular-nums"
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {score}
          </span>
          <span className="text-lg text-white/50 font-semibold">
            cajas apiladas
          </span>
        </div>
      )}

      {isEnded && (
        <GameOverPanel
          title="Game Over"
          score={score}
          subtitle="cajas apiladas"
          onNext={onNextGame}
          ranking={ranking}
          scoreMessage={scoreMessage}
          isLoading={isRankingLoading}
        />
      )}
    </div>
  );
};

export default DropTheBoxGame;
