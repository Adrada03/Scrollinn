/**
 * VectorLeapGame.jsx — "Vector Leap" (Salto Parabólico)
 *
 * Mecánica: máquina de estados con un solo tap.
 *  1. AIMING   → Ángulo oscila 10°–80°. Tap fija el ángulo.
 *  2. POWERING → Fuerza oscila min–max. Tap fija la fuerza.
 *  3. FLYING   → Física 2D parabólica (vx, vy, gravedad).
 *  4. TRANSITIONING → Aterriza, escena se desplaza, nueva plataforma.
 *
 * Puntuación = saltos exitosos.
 *
 * Props:
 *   isActive    – cuando pasa a true, arranca el juego
 *   onNextGame  – callback para ir al siguiente juego
 *   onReplay    – callback para replay
 *   userId      – usuario logueado (para enviar puntuación)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ─────────── Fases del juego ─────────── */
const PHASE = {
  IDLE: 0,
  AIMING: 1,
  POWERING: 2,
  FLYING: 3,
  TRANSITIONING: 4,
  ENDED: 5,
};

/* ─────────── Constantes de diseño ─────────── */
const PLAYER_SIZE  = 22;
const ARROW_LEN    = 70;        // longitud visual máxima de la flecha (AIMING)
const GROUND_H     = 120;       // alto del "suelo" visual inferior
const MIN_PLAT_W   = 50;
const MAX_PLAT_W   = 120;
const INIT_PLAT_W  = 90;
const PLAT_H       = 200;       // alto visual de la plataforma

/* ─────────── Física ─────────── */
const GRAVITY      = 0.35;
const MIN_ANGLE    = 10;
const MAX_ANGLE    = 80;
const ANGLE_SPEED  = 0.002;     // rad/ms para Math.sin
const POWER_SPEED  = 0.004;
const MIN_POWER    = 4;
const MAX_POWER    = 13;

/* ─────────── Transición ─────────── */
const TRANSITION_MS = 400;

function rand(a, b) { return a + Math.random() * (b - a); }
function degToRad(d) { return (d * Math.PI) / 180; }

/* ═══════════════════════════════════════════════════════
   COMPONENTE
   ═══════════════════════════════════════════════════════ */
const VectorLeapGame = ({ isActive, onNextGame, onReplay, userId }) => {
  const { t } = useLanguage();
  const containerRef = useRef(null);

  /* ── Estado de fase y puntuación ── */
  const [phase, setPhase]   = useState(PHASE.IDLE);
  const [score, setScore]   = useState(0);
  const scoreRef            = useRef(0);

  /* ── Dimensiones del contenedor ── */
  const [dims, setDims] = useState({ w: 400, h: 700 });

  /* ── Tick counter para forzar re-render ── */
  const [, setTick] = useState(0);
  const forceRender = useCallback(() => setTick((t) => t + 1), []);

  /* ── Datos mutables del juego ── */
  const g = useRef({
    // Plataformas: lista de plataformas [{x, w, topY}]
    platforms: [], // index 0 = base actual
    // Jugador
    playerX: 0,
    playerY: 0,
    // Ángulo y fuerza
    angle: 45,
    power: 10,
    // Velocidades
    vx: 0,
    vy: 0,
    // Cámara offset
    camX: 0,
    camY: 0,
    camTargetX: 0,
    // Trail de puntos
    trail: [],
    // Target platform index (para saltar a más adelante)
    targetPlatform: 1,
  }).current;

  /* ── Refs de animación ── */
  const rafRef    = useRef(null);
  const phaseRef  = useRef(PHASE.IDLE);

  /* ── Estado de ranking ── */
  const [ranking, setRanking]             = useState([]);
  const [scoreMessage, setScoreMessage]   = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted                    = useRef(false);

  const { submit } = useSubmitScore(userId, GAME_IDS.VectorLeapGame);

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

  /* ─────────── Derivados de layout ─────────── */
  const groundY = dims.h - GROUND_H; // Y del tope del suelo (en coords pantalla, Y crece hacia abajo)

  /* ─────────── Generar siguiente plataforma B ─────────── */
  const generatePlatB = useCallback(
    (currentScore) => {
      const diff = Math.min(currentScore / 20, 1);
      // Genera 5 plataformas adelante
      const platforms = g.platforms.length ? [...g.platforms] : [];
      let last = platforms.length ? platforms[platforms.length - 1] : null;
      if (!last) {
        // Inicializar base
        const startX = Math.max(50, dims.w * 0.12);
        const startTopY = 60;
        last = { x: startX, w: INIT_PLAT_W, topY: startTopY };
        platforms.push(last);
      }
      while (platforms.length < 6) {
        const minGap = 70 + diff * 25;
        const maxGap = 170 + diff * 60;
        const gap = rand(minGap, Math.min(maxGap, dims.w * 0.6));
        const minW = Math.max(MIN_PLAT_W - diff * 15, 30);
        const maxW = Math.max(MAX_PLAT_W - diff * 40, 45);
        const w = rand(minW, maxW);
        const heightDelta = rand(0, 100) * (0.3 + diff * 0.7);
        const plat = {
          x: last.x + last.w + gap,
          w,
          topY: last.topY + heightDelta,
        };
        platforms.push(plat);
        last = plat;
      }
      g.platforms = platforms;
    },
    [dims.w, g],
  );

  /* ─────────── Iniciar partida ─────────── */
  const startGame = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    // Plataforma A con margen respecto al borde
    g.platforms = [];
    g.targetPlatform = 1;
    generatePlatB(0);
    // Posición inicial jugador
    const platA = g.platforms[0];
    g.playerX = platA.x + platA.w / 2 - PLAYER_SIZE / 2;
    g.playerY = platA.topY;
    g.angle = 45;
    g.power = 10;
    g.vx = 0;
    g.vy = 0;
    g.camX = platA.x + platA.w / 2 - dims.w * 0.3;
    g.camY = platA.topY;
    g.camTargetX = g.camX;
    g.trail = [];
    scoreRef.current = 0;
    setScore(0);
    scoreSubmitted.current = false;
    setRanking([]);
    setScoreMessage("");
    forceRender();
    phaseRef.current = PHASE.AIMING;
    setPhase(PHASE.AIMING);
  }, [generatePlatB, forceRender, g]);

  /* ── Auto-start cuando isActive ── */
  useEffect(() => {
    if (isActive && phase === PHASE.IDLE) startGame();
  }, [isActive, phase, startGame]);

  /* ─────────── MAIN GAME LOOP ─────────── */
  useEffect(() => {
    if (phase !== PHASE.AIMING && phase !== PHASE.POWERING && phase !== PHASE.FLYING && phase !== PHASE.TRANSITIONING) return;
    if (!isActive) return;

    let transitionStart = 0;
    let transitionFromCam = g.camX;
    let transitionFromCamY = g.camY;
    let transitionFromPlayerX = g.playerX;
    let transitionFromPlayerY = g.playerY;
    let transitionToPlatA = null;

    if (phase === PHASE.TRANSITIONING) {
      transitionStart = performance.now();
      transitionFromCam = g.camX;
      // La plataforma destino
      const targetPlat = g.platforms[g.targetPlatform];
      transitionToPlatA = { ...targetPlat };
      // Destino del jugador: centro de la plataforma destino
      const destPlayerX = targetPlat.x + targetPlat.w / 2 - PLAYER_SIZE / 2;
      const destPlayerY = targetPlat.topY;
      transitionFromPlayerX = g.playerX;
      transitionFromPlayerY = g.playerY;

      // Store destination for lerp
      transitionToPlatA._destPlayerX = destPlayerX;
      transitionToPlatA._destPlayerY = destPlayerY;
    }

    const tick = (now) => {
      const currentPhase = phaseRef.current;

      if (currentPhase === PHASE.AIMING) {
        // Oscilar ángulo entre MIN_ANGLE y MAX_ANGLE
        const mid = (MIN_ANGLE + MAX_ANGLE) / 2;
        const amp = (MAX_ANGLE - MIN_ANGLE) / 2;
        g.angle = mid + amp * Math.sin(now * ANGLE_SPEED);
        forceRender();
      }

      else if (currentPhase === PHASE.POWERING) {
        // Oscilar fuerza
        const mid = (MIN_POWER + MAX_POWER) / 2;
        const amp = (MAX_POWER - MIN_POWER) / 2;
        g.power = mid + amp * Math.sin(now * POWER_SPEED);
        forceRender();
      }

      else if (currentPhase === PHASE.FLYING) {
        // Actualizar posición con física 2D
        // Nota: en nuestro sistema Y "mundano" positivo = arriba, pero en pantalla Y crece abajo
        // Usamos playerY como offset relativo al groundY. Positivo = arriba.
        g.playerX += g.vx;
        g.playerY += g.vy;
        g.vy -= GRAVITY;

        // Trail
        if (g.trail.length === 0 || 
            Math.abs(g.playerX - g.trail[g.trail.length - 1].x) > 8 ||
            Math.abs(g.playerY - g.trail[g.trail.length - 1].y) > 8) {
          g.trail.push({ x: g.playerX, y: g.playerY });
          if (g.trail.length > 50) g.trail.shift();
        }

        // Cámara: jugador al ~30% de la pantalla desde la izquierda
        const idealCamX = g.playerX + PLAYER_SIZE / 2 - dims.w * 0.3;
        g.camX += (idealCamX - g.camX) * 0.08;
        // Cámara Y: seguir al jugador suavemente
        const idealCamY = g.playerY;
        g.camY += (idealCamY - g.camY) * 0.05;

        // ── Colisión con cualquier plataforma adelante ──
        const pLeft = g.playerX;
        const pRight = g.playerX + PLAYER_SIZE;
        const pBottom = g.playerY;
        for (let i = 1; i < g.platforms.length; i++) {
          const plat = g.platforms[i];
          const bLeft = plat.x;
          const bRight = plat.x + plat.w;
          const bTop = plat.topY;
          if (g.vy < 0 && pRight > bLeft && pLeft < bRight) {
            if (pBottom <= bTop + 5 && pBottom >= bTop - 25) {
              // ¡Aterriza en plataforma i! (+i puntos por saltar i plataformas)
              g.playerY = bTop;
              g.vx = 0;
              g.vy = 0;
              g.targetPlatform = i;
              const newScore = scoreRef.current + i;
              scoreRef.current = newScore;
              setScore(newScore);
              phaseRef.current = PHASE.TRANSITIONING;
              setPhase(PHASE.TRANSITIONING);
              rafRef.current = requestAnimationFrame(tick);
              return;
            }
          }
        }

        // ── Colisión con plataforma base (si vuelve) ──
        const platBase = g.platforms[0];
        const aLeft = platBase.x;
        const aRight = platBase.x + platBase.w;
        const aTop = platBase.topY;
        if (g.vy < 0 && pRight > aLeft && pLeft < aRight && pBottom <= aTop + 5 && pBottom >= aTop - 25) {
          // Aterriza de vuelta en la base (cuenta como fallo, no avanza)
          g.playerY = aTop;
          g.vx = 0;
          g.vy = 0;
          phaseRef.current = PHASE.AIMING;
          setPhase(PHASE.AIMING);
          g.trail = [];
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        // ── Game Over: jugador cae muy abajo ──
        // En coords mundo, playerY negativo = bajo pantalla
        const screenBottom = -(GROUND_H + 100);
        if (g.playerY < screenBottom - 50) {
          phaseRef.current = PHASE.ENDED;
          setPhase(PHASE.ENDED);
          return;
        }

        forceRender();
      }

      else if (currentPhase === PHASE.TRANSITIONING) {
        if (!transitionToPlatA) {
          phaseRef.current = PHASE.AIMING;
          setPhase(PHASE.AIMING);
          return;
        }
        const elapsed = now - transitionStart;
        const progress = Math.min(elapsed / TRANSITION_MS, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        // Lerp camera: plataforma destino al ~30% izquierda
        const tPlat = g.platforms[g.targetPlatform];
        const targetCamX = tPlat.x + tPlat.w / 2 - dims.w * 0.3;
        const targetCamY = tPlat.topY;
        g.camX = transitionFromCam + (targetCamX - transitionFromCam) * ease;
        g.camY = transitionFromCamY + (targetCamY - transitionFromCamY) * ease;
        // Lerp player
        g.playerX = transitionFromPlayerX + (transitionToPlatA._destPlayerX - transitionFromPlayerX) * ease;
        g.playerY = transitionFromPlayerY + (transitionToPlatA._destPlayerY - transitionFromPlayerY) * ease;
        if (progress >= 1) {
          // Commit: target platform becomes base
          g.platforms = g.platforms.slice(g.targetPlatform);
          g.targetPlatform = 1;
          generatePlatB(scoreRef.current);
          g.playerX = g.platforms[0].x + g.platforms[0].w / 2 - PLAYER_SIZE / 2;
          g.playerY = g.platforms[0].topY;
          g.trail = [];
          phaseRef.current = PHASE.AIMING;
          setPhase(PHASE.AIMING);
        }
        forceRender();
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, isActive, dims, forceRender, generatePlatB, g]);

  /* ─────────── Pointer handler ─────────── */
  const handlePointerDown = useCallback(() => {
    const p = phaseRef.current;
    if (p === PHASE.AIMING) {
      // Fija ángulo, pasa a POWERING
      phaseRef.current = PHASE.POWERING;
      setPhase(PHASE.POWERING);
    } else if (p === PHASE.POWERING) {
      // Fija fuerza, lanza
      const rad = degToRad(g.angle);
      g.vx = g.power * Math.cos(rad);
      g.vy = g.power * Math.sin(rad);
      g.trail = [];
      phaseRef.current = PHASE.FLYING;
      setPhase(PHASE.FLYING);
    }
  }, [g]);

  /* ─────────── Enviar puntuación al terminar ─────────── */
  useEffect(() => {
    if (phase === PHASE.ENDED && !scoreSubmitted.current) {
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
    if (phase === PHASE.IDLE) {
      scoreSubmitted.current = false;
      setRanking([]);
      setScoreMessage("");
    }
  }, [phase, submit, t]);

  /* ─────────── Cleanup ─────────── */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /* ─────────── Helpers de render ─────────── */
  // Convierte coordenadas "mundo" a coordenadas pantalla
  // Mundo: X derecha positivo, Y arriba positivo (0 = tope de plataforma base original)
  // Pantalla: X izquierda, Y arriba (CSS: bottom para Y)
  const worldToScreen = (wx, wy) => ({
    left: wx - g.camX,
    bottom: GROUND_H + (wy - g.camY),
  });

  const isEnded = phase === PHASE.ENDED;
  const isIdle  = phase === PHASE.IDLE;

  // Posición pantalla del jugador
  const playerScreen = worldToScreen(g.playerX, g.playerY);
  const arrowAngle = g.angle;
  const showArrow = phase === PHASE.AIMING || phase === PHASE.POWERING;
  const arrowLength = phase === PHASE.POWERING
    ? ARROW_LEN * ((g.power - MIN_POWER) / (MAX_POWER - MIN_POWER)) * 0.8 + ARROW_LEN * 0.2
    : ARROW_LEN * 0.6;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-slate-900 overflow-hidden select-none"
      style={{ touchAction: isEnded || isIdle ? "auto" : "none" }}
      onPointerDown={handlePointerDown}
    >
      {/* ── Gradient overlays para UI del feed ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ── Fondo: estrellas ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 40 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: 1.5 + (i % 3),
              height: 1.5 + (i % 3),
              left: `${(i * 31 + 17) % 100}%`,
              top: `${(i * 19 + 11) % 70}%`,
              backgroundColor: `rgba(255,255,255,${0.05 + (i % 5) * 0.03})`,
            }}
          />
        ))}
      </div>

      {/* ── HUD: Score ── */}
      {phase !== PHASE.IDLE && (
        <div className="absolute top-16 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <span
            className="text-5xl font-black text-white/80 tabular-nums"
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {score}
          </span>
        </div>
      )}

      {/* ── HUD: Estado actual ── */}
      {phase === PHASE.AIMING && (
        <div className="absolute top-28 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <span className="text-xs font-bold text-amber-400/70 uppercase tracking-widest animate-pulse">
            {t("vectorleap.tap_angle")}
          </span>
        </div>
      )}
      {phase === PHASE.POWERING && (
        <div className="absolute top-28 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <span className="text-xs font-bold text-sky-400/70 uppercase tracking-widest animate-pulse">
            {t("vectorleap.tap_power")}
          </span>
        </div>
      )}

      {/* ════════════════ ESCENA ════════════════ */}

      {/* ── Suelo base ── */}
      <div
        className="absolute left-0 right-0 bottom-0 bg-slate-950"
        style={{ height: GROUND_H }}
      >
        {/* Línea decorativa superior del suelo */}
        <div className="absolute top-0 left-0 right-0 h-px bg-emerald-500/20" />
      </div>

      {/* ── Trail de vuelo ── */}
      {g.trail.map((pt, i) => {
        const s = worldToScreen(pt.x + PLAYER_SIZE / 2, pt.y + PLAYER_SIZE / 2);
        const opacity = 0.1 + (i / g.trail.length) * 0.3;
        return (
          <div
            key={i}
            className="absolute rounded-full bg-sky-400 pointer-events-none"
            style={{
              width: 4,
              height: 4,
              left: s.left,
              bottom: s.bottom,
              opacity,
              transform: "translate(-50%, 50%)",
            }}
          />
        );
      })}

      {/* ── Plataforma A ── */}
      {phase !== PHASE.IDLE && g.platforms.map((plat, idx) => {
        const s = worldToScreen(plat.x, plat.topY);
        return (
          <div
            key={idx}
            className={`absolute bg-emerald-600 ${idx === 0 ? '' : 'opacity-80'}`}
            style={{
              left: s.left,
              bottom: 0,
              width: plat.w,
              height: s.bottom,
              borderRadius: "3px 3px 0 0",
              boxShadow: idx === g.targetPlatform ? '0 0 0 3px #38bdf8' : undefined,
            }}
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-400 rounded-t-sm" />
            {idx > 0 && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-3 h-3 border-2 border-emerald-300/40 rounded-full" />
            )}
          </div>
        );
      })}

      {/* ── Jugador ── */}
      {phase !== PHASE.IDLE && (
        <div
          className="absolute z-3"
          style={{
            left: playerScreen.left,
            bottom: playerScreen.bottom,
            width: PLAYER_SIZE,
            height: PLAYER_SIZE,
          }}
        >
          <div className="w-full h-full bg-sky-400 rounded-sm shadow-lg shadow-sky-400/30" />
          {/* Ojos */}
          <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-sky-900" />
          <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-sky-900" />
        </div>
      )}

      {/* ── Flecha de apuntado ── */}
      {showArrow && phase !== PHASE.IDLE && (
        <div
          className="absolute z-4 pointer-events-none"
          style={{
            left: playerScreen.left + PLAYER_SIZE / 2,
            bottom: playerScreen.bottom + PLAYER_SIZE / 2,
            width: arrowLength,
            height: 3,
            transformOrigin: "0% 50%",
            transform: `rotate(-${arrowAngle}deg)`,
          }}
        >
          {/* Línea de la flecha */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: phase === PHASE.AIMING
                ? "linear-gradient(90deg, rgba(251,191,36,0.9), rgba(251,191,36,0.3))"
                : "linear-gradient(90deg, rgba(56,189,248,0.9), rgba(56,189,248,0.3))",
            }}
          />
          {/* Punta de la flecha */}
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2"
            style={{
              width: 0,
              height: 0,
              borderTop: "6px solid transparent",
              borderBottom: "6px solid transparent",
              borderLeft: phase === PHASE.AIMING
                ? "10px solid rgba(251,191,36,0.8)"
                : "10px solid rgba(56,189,248,0.8)",
            }}
          />
        </div>
      )}

      {/* ── Barra de fuerza (HUD) ── */}
      {phase === PHASE.POWERING && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-3 rounded-full overflow-hidden z-10 pointer-events-none"
          style={{ height: 120, backgroundColor: "rgba(255,255,255,0.08)" }}
        >
          <div
            className="absolute bottom-0 left-0 right-0 rounded-full transition-none"
            style={{
              height: `${((g.power - MIN_POWER) / (MAX_POWER - MIN_POWER)) * 100}%`,
              background: "linear-gradient(to top, #38bdf8, #0ea5e9)",
            }}
          />
        </div>
      )}

      {/* ── Hint IDLE ── */}
      {isIdle && (
        <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
          <div className="flex flex-col items-center gap-3 animate-pulse">
            <img
              src="/logo-vectorleap.png"
              alt="Vector Leap"
              className="w-16 h-16 object-contain drop-shadow-lg"
              draggable={false}
            />
            <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
              {t("vectorleap.instruction")}
            </span>
          </div>
        </div>
      )}

      {/* ── GAME OVER ── */}
      {isEnded && (
        <GameOverPanel
          title="Game Over"
          score={score}
          subtitle={t("vectorleap.subtitle")}
          onReplay={onReplay}
          onNext={onNextGame}
          ranking={ranking}
          scoreMessage={scoreMessage}
          isLoading={isRankingLoading}
        />
      )}
    </div>
  );
};

export default VectorLeapGame;
