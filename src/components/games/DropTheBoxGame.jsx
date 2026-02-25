/**
 * DropTheBoxGame.jsx — "Drop the Box" (Apilador de Grúa)
 *
 * Una grúa se mueve de izquierda a derecha en la parte superior.
 * Al tocar la pantalla, suelta una caja que cae en línea recta.
 * Si la caja se solapa con la parte superior de la torre, se apila.
 * Si no, cae al vacío → Game Over.
 *
 * ✅ Todo proporcional al ancho del contenedor (containerWidth).
 * ✅ Movimiento basado en deltaTime (requestAnimationFrame).
 * ✅ Cooldown entre lanzamientos con feedback visual.
 *
 * Props:
 *   isActive   – cuando pasa a true, arranca el juego
 *   onNextGame – callback para ir al siguiente juego
 *   onReplay   – callback para reiniciar
 *   userId     – usuario logueado (para enviar puntuación)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ─────────── Estados ─────────── */
const STATES = { IDLE: "idle", PLAYING: "playing", DROPPING: "dropping", ENDED: "ended" };

/* ═════════════════════════════════════════════════════════════════
   PROPORCIONES — todo relativo a containerWidth (cw)
   ═════════════════════════════════════════════════════════════════ */
const BOX_W_FRAC       = 0.18;      // ancho de la caja  (≈ 18 % de gameW)
const BOX_H_FRAC       = 0.085;     // alto de la caja   (≈ 8.5 % de gameW)
const BASE_W_FRAC      = 0.22;      // ancho de la base  (≈ 22 % de gameW)
const CRANE_Y_FRAC     = 0.15;      // posición Y del gancho (fracción de cw)
const CABLE_EXT_FRAC   = 0.075;     // extensión del cable bajo el indicador
const CRANE_RATIO      = 0.70;      // zona horizontal de movimiento de la grúa
const LANDING_RATIO    = 0.52;      // línea de aterrizaje (fracción de ch)

/* ── Velocidades (fracciones de cw por segundo) ── */
const CRANE_SPEED_FRAC = 0.32;      // vel. base de la grúa  → ~3 s lado a lado
const SPEED_BUMP_FRAC  = 0.014;     // incremento por caja apilada
const DROP_SPEED_FRAC  = 3.0;       // velocidad de caída de la caja

/* ── Colisión ── */
const OVERLAP_MIN_FRAC = 0.05;      // solapamiento mínimo (fracción de boxW)

/* ── Cooldown ── */
const COOLDOWN_MS      = 800;       // ms entre lanzamientos

/* ── Área de juego restringida (PC) ── */
const MAX_GAME_WIDTH   = 450;       // ancho máximo del área jugable

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
const DropTheBoxGame = ({ isActive, onNextGame, onReplay, userId, pinchGuardRef }) => {
  const { t } = useLanguage();
  const containerRef = useRef(null);

  /* ── Estado del juego ── */
  const [gameState, setGameState] = useState(STATES.IDLE);
  const [score, setScore]         = useState(0);
  const scoreRef                  = useRef(0);

  /* ── Dimensiones del contenedor ── */
  const [dims, setDims] = useState({ w: 400, h: 700 });

  /* ── Valores proporcionales (recalculados en cada render) ── */
  const cw      = dims.w;
  const ch      = dims.h;
  const gameW   = Math.min(cw, MAX_GAME_WIDTH);   // área jugable limitada
  const offsetX = (cw - gameW) / 2;               // margen para centrar

  const boxW       = Math.round(gameW * BOX_W_FRAC);
  const boxH       = Math.round(gameW * BOX_H_FRAC);
  const baseW      = Math.round(gameW * BASE_W_FRAC);
  const craneY     = Math.round(gameW * CRANE_Y_FRAC);
  const cableExt   = Math.round(gameW * CABLE_EXT_FRAC);
  const overlapMin = Math.max(2, Math.round(boxW * OVERLAP_MIN_FRAC));

  /* ── Velocidades en px / s (basadas en gameW para timing consistente) ── */
  const baseCraneSpeed = gameW * CRANE_SPEED_FRAC;
  const speedBumpPxS   = gameW * SPEED_BUMP_FRAC;
  const dropSpeedPxS   = gameW * DROP_SPEED_FRAC;

  /* ── Tick forzado para re-render desde rAF ── */
  const [, setTick] = useState(0);
  const forceRender = useCallback(() => setTick((n) => n + 1), []);

  /* ── Datos mutables (refs) ── */
  const craneXRef       = useRef(0);
  const craneDirRef     = useRef(1);
  const craneSpeedRef   = useRef(baseCraneSpeed);   // px/s acumulada
  const dropXRef        = useRef(-1);
  const dropYRef        = useRef(0);
  const towerRef        = useRef([]);
  const cameraOffRef    = useRef(0);
  const rafRef          = useRef(null);
  const lastTimeRef     = useRef(0);                 // timestamp anterior (rAF)
  const lastDropTimeRef = useRef(0);                 // cooldown

  /* ── Estado de ranking ── */
  const [ranking, setRanking]                 = useState([]);
  const [scoreMessage, setScoreMessage]       = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted                        = useRef(false);

  /* ─────────── Medir contenedor (ResizeObserver) ─────────── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setDims({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ─────────── Posición Y del punto de aterrizaje ─────────── */
  const landingY = Math.round(ch * LANDING_RATIO);

  /* ─────────── Iniciar partida ─────────── */
  const startGame = useCallback(() => {
    const craneMinX = offsetX + (gameW - gameW * CRANE_RATIO) / 2;
    craneXRef.current       = craneMinX;
    craneDirRef.current     = 1;
    craneSpeedRef.current   = baseCraneSpeed;
    dropXRef.current        = -1;
    dropYRef.current        = 0;
    cameraOffRef.current    = 0;
    lastTimeRef.current     = 0;
    lastDropTimeRef.current = 0;
    scoreRef.current        = 0;
    setScore(0);
    scoreSubmitted.current = false;
    setRanking([]);
    setScoreMessage("");

    // Torre: solo la base
    towerRef.current = [{
      x: cw / 2 - baseW / 2,
      y: landingY,
      w: baseW,
      color: "#6b7280", // gray-500
    }];
    forceRender();
    setGameState(STATES.PLAYING);
  }, [cw, gameW, offsetX, landingY, forceRender, baseW, baseCraneSpeed]);

  /* ── Auto-start ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, gameState, startGame]);

  /* ═══════════════════════════════════════════════════════
     GAME LOOP — requestAnimationFrame + deltaTime
     ═══════════════════════════════════════════════════════ */
  useEffect(() => {
    if (gameState !== STATES.PLAYING && gameState !== STATES.DROPPING) return;

    lastTimeRef.current = 0; // resetear para evitar salto de dt al re-entrar

    const tick = (timestamp) => {
      /* Primer frame: calibrar y salir */
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      /* deltaTime en segundos (cap 50 ms para evitar saltos tras alt-tab) */
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = timestamp;

      /* ── Mover grúa (rango reducido al centro, dentro de gameW) ── */
      const craneZone = gameW * CRANE_RATIO;
      const craneMinX = offsetX + (gameW - craneZone) / 2;
      const craneMaxX = craneMinX + craneZone - boxW;

      if (gameState === STATES.PLAYING || dropXRef.current === -1) {
        craneXRef.current += craneSpeedRef.current * craneDirRef.current * dt;
        if (craneXRef.current >= craneMaxX) {
          craneXRef.current = craneMaxX;
          craneDirRef.current = -1;
        } else if (craneXRef.current <= craneMinX) {
          craneXRef.current = craneMinX;
          craneDirRef.current = 1;
        }
      }

      /* ── Animar caja cayendo ── */
      if (dropXRef.current >= 0) {
        dropYRef.current += dropSpeedPxS * dt;

        const topBox  = towerRef.current[towerRef.current.length - 1];
        const targetY = topBox.y - boxH + cameraOffRef.current;

        if (dropYRef.current >= targetY) {
          // Llegó a la altura de la torre — comprobar solapamiento X
          const dxLeft  = dropXRef.current;
          const dxRight = dropXRef.current + boxW;
          const txLeft  = topBox.x;
          const txRight = topBox.x + topBox.w;

          const overlapLeft  = Math.max(dxLeft, txLeft);
          const overlapRight = Math.min(dxRight, txRight);
          const overlap      = overlapRight - overlapLeft;

          if (overlap > overlapMin) {
            // ✅ ACIERTO — apilar la caja entera (sin recortar)
            const newScore = scoreRef.current + 1;
            scoreRef.current = newScore;
            setScore(newScore);

            towerRef.current.push({
              x: dropXRef.current,
              y: topBox.y - boxH,
              w: boxW,
              color: getBoxColor(newScore),
            });

            // Subir cámara para hacer hueco
            cameraOffRef.current += boxH;

            // Aumentar velocidad incrementalmente cada caja
            craneSpeedRef.current += speedBumpPxS;

            dropXRef.current = -1;
            setGameState(STATES.PLAYING);
          } else {
            // ❌ FALLO — dejar que siga cayendo un poco y luego game over
            if (dropYRef.current > ch + 50) {
              dropXRef.current = -1;
              setGameState(STATES.ENDED);
              forceRender();
              rafRef.current = null;
              return;
            }
          }
        } else if (dropYRef.current > ch + 50) {
          // Caja pasó de largo por debajo (sin torre debajo — fallo)
          dropXRef.current = -1;
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
  }, [gameState, cw, ch, gameW, offsetX, forceRender, boxW, boxH, dropSpeedPxS, speedBumpPxS, overlapMin]);

  /* ─────────── Drop (tap) con Cooldown ─────────── */
  const handleTap = useCallback(() => {
    if (gameState !== STATES.PLAYING) return;           // LEY 3: blindaje
    if (pinchGuardRef?.current) return;                 // LEY 5: anti-ghost click
    if (dropXRef.current >= 0) return;                              // ya hay caja cayendo
    if (Date.now() - lastDropTimeRef.current < COOLDOWN_MS) return; // en cooldown

    dropXRef.current        = craneXRef.current;
    dropYRef.current        = craneY + cableExt;
    lastDropTimeRef.current = Date.now();
    setGameState(STATES.DROPPING);
  }, [gameState, craneY, cableExt]);

  /* ─────────── Enviar puntuación al terminar ─────────── */
  const { submit, xpGained } = useSubmitScore(userId, GAME_IDS.DropTheBoxGame);

  useEffect(() => {
    if (gameState === STATES.ENDED && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submit(scoreRef.current, () => {})
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
  }, [gameState, submit]);

  /* ─────────── Cleanup ─────────── */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /* ═══════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════ */
  const isPlaying  = gameState === STATES.PLAYING || gameState === STATES.DROPPING;
  const isEnded    = gameState === STATES.ENDED;
  const towerBoxes = towerRef.current;
  const cam        = cameraOffRef.current;

  /* ── Cooldown: feedback visual ── */
  const now              = Date.now();
  const inCooldown       = isPlaying
                           && dropXRef.current < 0
                           && lastDropTimeRef.current > 0
                           && (now - lastDropTimeRef.current < COOLDOWN_MS);
  const cooldownProgress = inCooldown
    ? Math.min(1, (now - lastDropTimeRef.current) / COOLDOWN_MS)
    : 1;
  const craneOpacity     = inCooldown ? 0.35 + 0.65 * cooldownProgress : 1;

  /* ── Dimensiones proporcionales de piezas de la grúa ── */
  const indicW   = Math.max(16, Math.round(gameW * 0.07));
  const indicH   = Math.max(4, Math.round(gameW * 0.02));
  const cableW   = Math.max(1, Math.round(gameW * 0.005));
  const coolBarH = Math.max(3, Math.round(gameW * 0.008));

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-zinc-900 overflow-hidden select-none"
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

        {/* ── Grúa: cable + caja pendiente + indicador (con cooldown visual) ── */}
        {isPlaying && dropXRef.current < 0 && (
          <div style={{ opacity: craneOpacity, transition: "opacity 0.15s ease" }}>
            {/* Cable */}
            <div
              className="absolute"
              style={{
                left: craneXRef.current + boxW / 2 - cableW / 2,
                top: 0,
                width: cableW,
                height: craneY + cableExt,
                background: inCooldown ? "#f87171" : "rgba(255,255,255,0.2)",
                transition: "background 0.2s ease",
              }}
            />
            {/* Caja en la grúa */}
            <div
              className="absolute rounded-sm"
              style={{
                left: craneXRef.current,
                top: craneY + cableExt,
                width: boxW,
                height: boxH,
                background: getBoxColor(scoreRef.current + 1),
                boxShadow: `0 0 12px ${getBoxColor(scoreRef.current + 1)}40, inset 0 1px 0 rgba(255,255,255,0.25)`,
              }}
            />
            {/* Indicador superior de la grúa */}
            <div
              className="absolute bg-gray-500 rounded-sm"
              style={{
                left: craneXRef.current + boxW / 2 - indicW / 2,
                top: craneY - Math.round(gameW * 0.01),
                width: indicW,
                height: indicH,
              }}
            />
            {/* Barra de cooldown bajo la caja pendiente */}
            {inCooldown && (
              <div
                className="absolute rounded-full overflow-hidden"
                style={{
                  left: craneXRef.current,
                  top: craneY + cableExt + boxH + Math.round(gameW * 0.012),
                  width: boxW,
                  height: coolBarH,
                  background: "rgba(255,255,255,0.08)",
                }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${cooldownProgress * 100}%`,
                    background: "linear-gradient(90deg, #f87171, #22d3ee)",
                    transition: "width 0.05s linear",
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Caja cayendo ── */}
        {dropXRef.current >= 0 && (
          <div
            className="absolute rounded-sm"
            style={{
              left: dropXRef.current,
              top: dropYRef.current,
              width: boxW,
              height: boxH,
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
              height: boxH,
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
          style={{ top: landingY + cam + boxH }}
        />
      </div>

      {/* ── Hint IDLE ── */}
      {gameState === STATES.IDLE && (
        <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
          <div className="flex flex-col items-center gap-3 animate-pulse">
            <img
              src="/logo-dropthebox.png"
              alt="Drop the Box"
              className="w-16 h-16 object-contain drop-shadow-lg"
              draggable={false}
            />
            <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
              {t("dropthebox.instruction")}
            </span>
          </div>
        </div>
      )}

      {/* ── Hint PLAYING ── */}
      {gameState === STATES.PLAYING && score === 0 && dropXRef.current < 0 && (
        <div
          className="absolute inset-x-0 flex justify-center pointer-events-none z-3"
          style={{ top: craneY + boxH + cableExt + Math.round(gameW * 0.12) }}
        >
          <span className="text-sm font-medium text-white/20 tracking-wider uppercase animate-pulse">
            {t("dropthebox.tap_drop")}
          </span>
        </div>
      )}

      {/* ── Velocidad info ── */}
      {isPlaying && score >= 5 && (
        <div className="absolute bottom-28 left-0 right-0 flex justify-center pointer-events-none z-3">
          <span className="text-xs text-white/15 font-medium">
            {t("dropthebox.speed")} ×{(craneSpeedRef.current / baseCraneSpeed).toFixed(1)}
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
            {t("dropthebox.boxes_stacked")}
          </span>
        </div>
      )}

      {isEnded && (
        <GameOverPanel
          title="Game Over"
          score={score}
          subtitle={t("dropthebox.boxes_stacked")}
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

export default DropTheBoxGame;
