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

    // Torre: solo la base (estilizada como plataforma cyberpunk)
    towerRef.current = [{
      x: cw / 2 - baseW / 2,
      y: landingY,
      w: baseW,
      color: "#22d3ee", // cyan-400 — acento neón para la base
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
    if ((gameState !== STATES.PLAYING && gameState !== STATES.DROPPING) || !isActive) return;

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
  }, [gameState, isActive, cw, ch, gameW, offsetX, forceRender, boxW, boxH, dropSpeedPxS, speedBumpPxS, overlapMin]);

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
  const { submit, xpGained, gameId } = useSubmitScore(userId, GAME_IDS.DropTheBoxGame);

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
      className="relative w-full h-full overflow-hidden select-none"
      style={{ background: "#0a0e17" }}
      onPointerDown={handleTap}
    >
      {/* ── Gradient overlays para UI del feed ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ── Fondo cyberpunk: rejilla de circuito ── */}
      <div className="absolute inset-0 pointer-events-none cyber-circuit-bg opacity-60" />

      {/* ── Scanlines CRT ── */}
      <div className="absolute inset-0 pointer-events-none cyber-scanlines" />

      {/* ── Radial glow ambiental en la base de la torre ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "50%",
          bottom: `${(1 - LANDING_RATIO) * 100}%`,
          width: "120%",
          height: "45%",
          transform: "translateX(-50%)",
          background: "radial-gradient(ellipse at center, rgba(34,211,238,0.06) 0%, rgba(168,85,247,0.03) 40%, transparent 70%)",
        }}
      />

      {/* ── Fondo decorativo: líneas de guía verticales neón ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0"
            style={{
              left: `${(i + 1) * 12.5}%`,
              width: "1px",
              background: "rgba(34,211,238,0.04)",
            }}
          />
        ))}
        {/* Líneas horizontales sutiles */}
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={`h${i}`}
            className="absolute left-0 right-0"
            style={{
              top: `${(i + 1) * 8.33}%`,
              height: "1px",
              background: "rgba(34,211,238,0.02)",
            }}
          />
        ))}
      </div>

      {/* ── HUD: Score ── */}
      {gameState !== STATES.IDLE && (
        <div className="absolute top-[calc(var(--sat,0px)+5.5rem)] left-0 right-0 flex justify-center z-10 pointer-events-none">
          <span
            className="text-5xl font-black text-white tabular-nums font-mono"
            style={{
              fontFeatureSettings: "'tnum'",
              textShadow: "0 0 20px rgba(34,211,238,0.6), 0 0 40px rgba(34,211,238,0.2), 0 0 60px rgba(168,85,247,0.15)",
            }}
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
            {/* Cable — neón con glow */}
            <div
              className="absolute"
              style={{
                left: craneXRef.current + boxW / 2 - cableW / 2,
                top: 0,
                width: Math.max(2, cableW),
                height: craneY + cableExt,
                background: inCooldown
                  ? "linear-gradient(180deg, rgba(248,113,113,0.1), #f87171)"
                  : "linear-gradient(180deg, rgba(34,211,238,0.05), rgba(34,211,238,0.4))",
                boxShadow: inCooldown
                  ? "0 0 6px rgba(248,113,113,0.5)"
                  : "0 0 8px rgba(34,211,238,0.3), 0 0 2px rgba(34,211,238,0.5)",
                transition: "background 0.2s ease, box-shadow 0.2s ease",
              }}
            />
            {/* Caja en la grúa — con borde neón y glow fuerte */}
            <div
              className="absolute rounded-sm"
              style={{
                left: craneXRef.current,
                top: craneY + cableExt,
                width: boxW,
                height: boxH,
                background: `linear-gradient(135deg, ${getBoxColor(scoreRef.current + 1)}cc, ${getBoxColor(scoreRef.current + 1)}88)`,
                border: `1px solid ${getBoxColor(scoreRef.current + 1)}`,
                boxShadow: `0 0 14px ${getBoxColor(scoreRef.current + 1)}60, 0 0 30px ${getBoxColor(scoreRef.current + 1)}20, inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.3)`,
              }}
            />
            {/* Indicador superior de la grúa — neón */}
            <div
              className="absolute rounded-sm"
              style={{
                left: craneXRef.current + boxW / 2 - indicW / 2,
                top: craneY - Math.round(gameW * 0.01),
                width: indicW,
                height: indicH,
                background: "linear-gradient(90deg, #22d3ee, #a855f7)",
                boxShadow: "0 0 8px rgba(34,211,238,0.5), 0 0 4px rgba(168,85,247,0.4)",
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
                    transform: `scaleX(${cooldownProgress})`,
                    transformOrigin: "left",
                    willChange: "transform",
                    background: "linear-gradient(90deg, #f87171, #a855f7, #22d3ee)",
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Caja cayendo — con estela neón ── */}
        {dropXRef.current >= 0 && (
          <>
            {/* Estela vertical tras la caja */}
            <div
              className="absolute"
              style={{
                left: dropXRef.current + boxW * 0.15,
                top: craneY + cableExt,
                width: boxW * 0.7,
                height: Math.max(0, dropYRef.current - craneY - cableExt),
                background: `linear-gradient(180deg, transparent, ${getBoxColor(scoreRef.current + 1)}15)`,
                filter: "blur(4px)",
              }}
            />
            <div
              className="absolute rounded-sm"
              style={{
                left: dropXRef.current,
                top: dropYRef.current,
                width: boxW,
                height: boxH,
                background: `linear-gradient(135deg, ${getBoxColor(scoreRef.current + 1)}cc, ${getBoxColor(scoreRef.current + 1)}88)`,
                border: `1px solid ${getBoxColor(scoreRef.current + 1)}`,
                boxShadow: `0 0 18px ${getBoxColor(scoreRef.current + 1)}70, 0 0 35px ${getBoxColor(scoreRef.current + 1)}25, inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.3)`,
              }}
            />
          </>
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
              background: i === 0
                ? "linear-gradient(135deg, #1e293b, #334155)"
                : `linear-gradient(135deg, ${box.color}bb, ${box.color}77)`,
              border: i === 0
                ? "1px solid rgba(34,211,238,0.3)"
                : `1px solid ${box.color}99`,
              boxShadow: i === 0
                ? "0 0 12px rgba(34,211,238,0.15), inset 0 1px 0 rgba(255,255,255,0.1)"
                : `0 0 10px ${box.color}35, 0 0 25px ${box.color}12, inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.25)`,
            }}
          >
            {/* Línea decorativa superior brillante */}
            {i > 0 && (
              <div
                className="absolute top-0 left-0.5 right-0.5 h-px rounded"
                style={{ background: `${box.color}55` }}
              />
            )}
            {/* Sutil marca interior */}
            {i === 0 && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ fontSize: Math.round(boxH * 0.45), color: "rgba(34,211,238,0.25)", fontWeight: 900, fontFamily: "monospace" }}
              >
                ▼
              </div>
            )}
          </div>
        ))}

        {/* ── Línea de suelo — neón cian con glow ── */}
        <div
          className="absolute left-0 right-0"
          style={{
            top: landingY + cam + boxH,
            height: "1px",
            background: "linear-gradient(90deg, transparent 5%, rgba(34,211,238,0.3) 30%, rgba(34,211,238,0.5) 50%, rgba(34,211,238,0.3) 70%, transparent 95%)",
            boxShadow: "0 0 8px rgba(34,211,238,0.2), 0 0 20px rgba(34,211,238,0.1)",
          }}
        />
        {/* Sub-suelo: gradiente oscuro */}
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: landingY + cam + boxH + 1,
            height: "60px",
            background: "linear-gradient(180deg, rgba(34,211,238,0.03), transparent)",
          }}
        />
      </div>

      {/* ── Hint IDLE ── */}
      {gameState === STATES.IDLE && (
        <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
          <div className="flex flex-col items-center gap-3 animate-pulse">
            <img
              src="/logo-dropthebox.png"
              alt="Drop the Box"
              className="w-16 h-16 object-contain"
              style={{ filter: "drop-shadow(0 0 12px rgba(34,211,238,0.5)) drop-shadow(0 0 24px rgba(168,85,247,0.3))" }}
              draggable={false}
            />
            <span
              className="text-xs font-bold font-mono text-cyan-300/70 bg-cyan-400/5 backdrop-blur-sm px-4 py-2 rounded-xl tracking-wider uppercase"
              style={{
                border: "1px solid rgba(34,211,238,0.15)",
                textShadow: "0 0 8px rgba(34,211,238,0.4)",
              }}
            >
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
          <span
            className="text-sm font-mono font-medium text-cyan-400/30 tracking-wider uppercase animate-pulse"
            style={{ textShadow: "0 0 10px rgba(34,211,238,0.2)" }}
          >
            {t("dropthebox.tap_drop")}
          </span>
        </div>
      )}

      {/* ── Velocidad info — neón ── */}
      {isPlaying && score >= 5 && (
        <div className="absolute bottom-28 left-0 right-0 flex justify-center pointer-events-none z-3">
          <span
            className="text-xs font-mono font-medium"
            style={{
              color: "rgba(168,85,247,0.35)",
              textShadow: "0 0 8px rgba(168,85,247,0.2)",
            }}
          >
            {t("dropthebox.speed")} ×{(craneSpeedRef.current / baseCraneSpeed).toFixed(1)}
          </span>
        </div>
      )}

      {/* ── GAME OVER ── */}
      {isEnded && (
        <div className="flex flex-col items-center gap-2 mb-4">
          <span
            className="text-7xl sm:text-8xl font-black text-white tabular-nums font-mono"
            style={{
              fontFeatureSettings: "'tnum'",
              textShadow: "0 0 20px rgba(34,211,238,0.5), 0 0 50px rgba(168,85,247,0.3)",
            }}
          >
            {score}
          </span>
          <span
            className="text-lg text-cyan-300/50 font-semibold font-mono"
            style={{ textShadow: "0 0 8px rgba(34,211,238,0.3)" }}
          >
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
          gameId={gameId}

          isLoading={isRankingLoading}
        />
      )}
    </div>
  );
};

export default DropTheBoxGame;
