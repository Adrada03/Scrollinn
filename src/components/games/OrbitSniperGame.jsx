/**
 * OrbitSniperGame.jsx — "Orbit Sniper"
 *
 * Mecánica:
 *  1. ORBITING  → El jugador gira alrededor de una órbita base.
 *  2. SHOOTING  → Al tocar, sale disparado en la tangente.
 *  3. Colisión  → Si toca el objetivo, se engancha y orbita de nuevo. +1 Score.
 *  4. Fallo     → Si sale de pantalla, Game Over.
 *
 * Dificultad progresiva: velocidad de órbita sube, objetivos más lejanos/pequeños.
 *
 * Props:
 *   isActive   – cuando pasa a true, arranca el juego
 *   onNextGame – callback para "siguiente juego"
 *   onReplay   – callback para replay
 *   userId     – usuario logueado (para enviar puntuación)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ─────────── Fases ─────────── */
const PHASE = {
  IDLE: 0,
  ORBITING: 1,
  SHOOTING: 2,
  TRAVELING: 3,
  ENDED: 4,
};

/* ─────────── Constantes (TIME-BASED) ─────────── */
const PLAYER_R_RATIO       = 0.026;   // radio jugador como % de shortSide
const BASE_ORBIT_RATIO     = 0.24;    // radio órbita base como % de shortSide
const TARGET_R_RATIO       = 0.16;    // radio objetivo inicial como % de shortSide
const TARGET_R_MIN_RATIO   = 0.085;   // radio mínimo objetivo como % de shortSide
const ORBIT_SPEED_INIT_PS  = 3.2;     // rad/s — ~2s por revolución
const ORBIT_SPEED_MAX_PS   = 10.0;    // rad/s — tope
const SPEED_INCREMENT_PS   = 0.12;    // rad/s incremento por acierto
const SHOOT_SPEED_RATIO_PS = 1.08;    // velocidad disparo (shortSide-units/s)
const TRAIL_LENGTH         = 14;      // puntos de estela
const TRAVEL_DURATION      = 0.3;     // s — duración animación de asentamiento
const MAX_DELTA            = 0.05;    // s — cap para evitar saltos enormes

/* ─────────── Paleta de planetas ─────────── */
const PLANET_PALETTES = [
  { base: "#3b82f6", light: "#93c5fd", dark: "#1e3a5f" },
  { base: "#8b5cf6", light: "#c4b5fd", dark: "#3b1f6e" },
  { base: "#ec4899", light: "#f9a8d4", dark: "#701a38" },
  { base: "#f97316", light: "#fdba74", dark: "#7c2d12" },
  { base: "#10b981", light: "#6ee7b7", dark: "#064e3b" },
  { base: "#06b6d4", light: "#67e8f9", dark: "#164e63" },
  { base: "#ef4444", light: "#fca5a5", dark: "#7f1d1d" },
  { base: "#eab308", light: "#fde68a", dark: "#713f12" },
];

function pickPlanetColor(exclude) {
  const filtered = PLANET_PALETTES.filter((p) => p.base !== exclude);
  return filtered[Math.floor(Math.random() * filtered.length)];
}

/* ─────────── Helpers ─────────── */
function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/* ═══════════════════════════════════════════════════════
   COMPONENTE
   ═══════════════════════════════════════════════════════ */
const OrbitSniperGame = ({ isActive, onNextGame, onReplay, userId }) => {
  const { t } = useLanguage();
  const containerRef = useRef(null);

  /* ── Estado de fase y puntuación ── */
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);

  /* ── Dimensiones del contenedor ── */
  const [dims, setDims] = useState({ w: 400, h: 700 });

  /* ── Tick para forzar re-render ── */
  const [, setTick] = useState(0);
  const forceRender = useCallback(() => setTick((t) => t + 1), []);

  /* ── Datos mutables del juego (ref para evitar re-renders) ── */
  const g = useRef({
    // Órbita base
    baseX: 0,
    baseY: 0,
    baseR: 0,
    // Jugador
    playerR: 8,
    angle: 0,
    playerX: 0,
    playerY: 0,
    // Velocidad de disparo
    shootSpeed: 8,
    vx: 0,
    vy: 0,
    // Objetivo
    targetX: 0,
    targetY: 0,
    targetR: 0,
    // Dificultad
    orbitSpeed: ORBIT_SPEED_INIT_PS,
    // Estela
    trail: [],
    // Estrellas de fondo
    stars: [],
    // Colores de planetas
    basePlanet: PLANET_PALETTES[0],
    targetPlanet: PLANET_PALETTES[3],
    // Viaje entre planetas
    travelStartAngle: 0,
    travelTime: 0,
  }).current;

  /* ── Refs de animación ── */
  const rafRef = useRef(null);
  const lastTimeRef = useRef(0);
  const phaseRef = useRef(PHASE.IDLE);

  /* ── Estado de ranking ── */
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  const { submit, xpGained } = useSubmitScore(userId, GAME_IDS.OrbitSniperGame);

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

  /* ─────────── Generar estrellas de fondo ─────────── */
  useEffect(() => {
    const stars = [];
    for (let i = 0; i < 60; i++) {
      stars.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: rand(1, 2.5),
        opacity: rand(0.2, 0.7),
      });
    }
    g.stars = stars;
  }, [g]);

  /* ─────────── Generar objetivo en posición aleatoria ─────────── */
  const generateTarget = useCallback(
    (currentScore) => {
      const ss = Math.min(dims.w, dims.h);
      const diff = Math.min(currentScore / 25, 1); // 0→1 progresivo

      // Radio del objetivo: aleatorio dentro de un rango que encoge con la dificultad
      const tRMax = ss * TARGET_R_RATIO * (1 - diff * 0.35);
      const tRMin = ss * TARGET_R_MIN_RATIO * (1 + (1 - diff) * 0.3);
      const tR = rand(Math.min(tRMin, tRMax), Math.max(tRMin, tRMax));
      g.targetR = tR;

      // Distancia mínima: las órbitas NO pueden tocarse (gap generoso proporcional)
      const noOverlapDist = g.baseR + tR + ss * 0.06;
      const minDist = noOverlapDist + ss * 0.05 + diff * ss * 0.06;
      const maxDist = noOverlapDist + ss * 0.35 + diff * ss * 0.20;
      const distance = rand(minDist, Math.min(maxDist, ss * 0.85));

      // Ángulo: 360° completo
      const angleRad = rand(-Math.PI, Math.PI);

      let tx = g.baseX + distance * Math.cos(angleRad);
      let ty = g.baseY + distance * Math.sin(angleRad);

      // Márgenes: top para header, bottom para instrucciones
      const topSafe = dims.h * 0.12 + tR;   // evita header
      const botSafe = dims.h * 0.18 + tR;   // evita zona de instrucciones
      const sideSafe = tR + ss * 0.04;
      tx = clamp(tx, sideSafe, dims.w - sideSafe);
      ty = clamp(ty, topSafe, dims.h - botSafe);

      // Segunda comprobación: si al clampear hay overlap, empujar
      const actualDist = dist(g.baseX, g.baseY, tx, ty);
      if (actualDist < noOverlapDist) {
        const angle2 = Math.atan2(ty - g.baseY, tx - g.baseX);
        const push = noOverlapDist + ss * 0.02;
        tx = g.baseX + push * Math.cos(angle2);
        ty = g.baseY + push * Math.sin(angle2);
        tx = clamp(tx, sideSafe, dims.w - sideSafe);
        ty = clamp(ty, topSafe, dims.h - botSafe);
      }

      g.targetX = tx;
      g.targetY = ty;
      g.targetPlanet = pickPlanetColor(g.basePlanet.base);
    },
    [dims.w, dims.h, g],
  );

  /* ─────────── Iniciar partida ─────────── */
  const startGame = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    // Base: zona central, proporcional a pantalla
    const ss = Math.min(dims.w, dims.h);
    g.baseX = dims.w / 2;
    g.baseY = dims.h * 0.50;
    g.baseR = ss * BASE_ORBIT_RATIO;
    g.playerR = Math.max(6, ss * PLAYER_R_RATIO);
    g.shootSpeed = Math.max(300, ss * SHOOT_SPEED_RATIO_PS); // px/s
    g.basePlanet = pickPlanetColor("");
    g.angle = -Math.PI / 2; // empezar arriba
    g.orbitSpeed = ORBIT_SPEED_INIT_PS;
    g.trail = [];
    g.vx = 0;
    g.vy = 0;

    // Posición inicial del jugador
    g.playerX = g.baseX + g.baseR * Math.cos(g.angle);
    g.playerY = g.baseY + g.baseR * Math.sin(g.angle);

    scoreRef.current = 0;
    setScore(0);
    scoreSubmitted.current = false;
    setRanking([]);
    setScoreMessage("");

    generateTarget(0);

    lastTimeRef.current = performance.now();
    forceRender();
    phaseRef.current = PHASE.ORBITING;
    setPhase(PHASE.ORBITING);
  }, [dims.w, dims.h, generateTarget, forceRender, g]);

  /* ── Auto-start cuando isActive ── */
  useEffect(() => {
    if (isActive && phase === PHASE.IDLE) startGame();
  }, [isActive, phase, startGame]);

  /* ─────────── MAIN GAME LOOP ─────────── */
  useEffect(() => {
    if (phase !== PHASE.ORBITING && phase !== PHASE.SHOOTING && phase !== PHASE.TRAVELING) return;
    if (!isActive) return;

    const tick = (currentTime) => {
      // ── Delta time (en segundos) con cap de seguridad ──
      const rawDelta = (currentTime - lastTimeRef.current) / 1000;
      lastTimeRef.current = currentTime;
      const dt = Math.min(rawDelta, MAX_DELTA);

      const p = phaseRef.current;

      /* ─── ORBITING ─── */
      if (p === PHASE.ORBITING) {
        g.angle += g.orbitSpeed * dt;
        g.playerX = g.baseX + g.baseR * Math.cos(g.angle);
        g.playerY = g.baseY + g.baseR * Math.sin(g.angle);
        g.trail = []; // sin estela mientras orbita
      }

      /* ─── SHOOTING ─── */
      if (p === PHASE.SHOOTING) {
        g.playerX += g.vx * dt;
        g.playerY += g.vy * dt;

        // Estela
        g.trail.push({ x: g.playerX, y: g.playerY });
        if (g.trail.length > TRAIL_LENGTH) g.trail.shift();

        // Comprobar colisión con objetivo
        const d = dist(g.playerX, g.playerY, g.targetX, g.targetY);
        if (d < (g.playerR || 8) + g.targetR) {
          // ¡Acierto! — iniciar viaje animado al nuevo planeta
          const newScore = scoreRef.current + 1;
          scoreRef.current = newScore;
          setScore(newScore);

          // El objetivo se convierte en la nueva base
          g.baseX = g.targetX;
          g.baseY = g.targetY;
          g.baseR = g.targetR;
          g.basePlanet = g.targetPlanet;

          // Calcular ángulo de enganche y preparar viaje
          g.angle = Math.atan2(
            g.playerY - g.baseY,
            g.playerX - g.baseX,
          );
          g.playerX = g.baseX + g.baseR * Math.cos(g.angle);
          g.playerY = g.baseY + g.baseR * Math.sin(g.angle);
          g.travelStartAngle = g.angle;
          g.travelTime = 0;

          // Incrementar dificultad (suave)
          g.orbitSpeed = Math.min(
            ORBIT_SPEED_MAX_PS,
            ORBIT_SPEED_INIT_PS + newScore * SPEED_INCREMENT_PS,
          );

          // Generar nuevo objetivo
          generateTarget(newScore);

          phaseRef.current = PHASE.TRAVELING;
          setPhase(PHASE.TRAVELING);
        }

        // Comprobar fuera de pantalla
        const margin = 50;
        if (
          g.playerX < -margin ||
          g.playerX > dims.w + margin ||
          g.playerY < -margin ||
          g.playerY > dims.h + margin
        ) {
          phaseRef.current = PHASE.ENDED;
          setPhase(PHASE.ENDED);
          forceRender();
          return;
        }
      }

      /* ─── TRAVELING (asentándose en nueva órbita) ─── */
      if (p === PHASE.TRAVELING) {
        g.travelTime += dt;
        const progress = Math.min(g.travelTime / TRAVEL_DURATION, 1);
        const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic

        // Recorre ~120° alrededor de la nueva órbita con desaceleración
        g.angle = g.travelStartAngle + (Math.PI * 0.67) * ease;
        g.playerX = g.baseX + g.baseR * Math.cos(g.angle);
        g.playerY = g.baseY + g.baseR * Math.sin(g.angle);

        // Estela durante el viaje
        g.trail.push({ x: g.playerX, y: g.playerY });
        if (g.trail.length > TRAIL_LENGTH) g.trail.shift();

        if (progress >= 1) {
          g.trail = [];
          phaseRef.current = PHASE.ORBITING;
          setPhase(PHASE.ORBITING);
        }
      }

      forceRender();
      rafRef.current = requestAnimationFrame(tick);
    };

    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, isActive, dims.w, dims.h, generateTarget, forceRender, g]);

  /* ── Cleanup ── */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /* ─────────── Disparo (tap) ─────────── */
  const handleTap = useCallback(() => {
    if (phaseRef.current !== PHASE.ORBITING) return;

    // Vector tangente (perpendicular al radio, en sentido del giro) — px/s
    const spd = g.shootSpeed || 300;
    g.vx = -Math.sin(g.angle) * spd;
    g.vy = Math.cos(g.angle) * spd;

    g.trail = [{ x: g.playerX, y: g.playerY }];

    phaseRef.current = PHASE.SHOOTING;
    setPhase(PHASE.SHOOTING);
  }, [g]);

  /* ── Enviar puntuación al terminar ── */
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

  /* ── Derivados ── */
  const isPlaying = phase === PHASE.ORBITING || phase === PHASE.SHOOTING || phase === PHASE.TRAVELING;
  const isEnded = phase === PHASE.ENDED;

  /* ─────────── RENDER ─────────── */
  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden select-none bg-slate-950"
      onPointerDown={isPlaying ? handleTap : undefined}
      style={{ cursor: isPlaying ? "pointer" : "default", touchAction: "none" }}
    >
      {/* ── Estrellas de fondo ── */}
      {g.stars.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
          }}
        />
      ))}

      {/* ── Overlay gradients para UI del feed ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ── HUD: Score ── */}
      {phase !== PHASE.IDLE && (
        <div className="absolute top-16 left-0 right-0 flex items-center justify-center z-3">
          <span
            className="text-4xl font-black text-white tabular-nums drop-shadow-lg"
            style={{ fontFeatureSettings: "'tnum'", textShadow: "0 0 20px rgba(96,165,250,0.4)" }}
          >
            {score}
          </span>
        </div>
      )}

      {/* ═══════════ GAME SCENE ═══════════ */}
      {isPlaying && (
        <>
          {/* ── Órbita Base (círculo) ── */}
          <div
            className="absolute rounded-full border-2 border-blue-500/30"
            style={{
              left: g.baseX - g.baseR,
              top: g.baseY - g.baseR,
              width: g.baseR * 2,
              height: g.baseR * 2,
              boxShadow: "0 0 15px rgba(59,130,246,0.15), inset 0 0 15px rgba(59,130,246,0.05)",
            }}
          />

          {/* ── Planeta Base ── */}
          {(() => {
            const pl = g.basePlanet;
            const pR = Math.max(10, g.baseR * 0.32);
            return (
              <div
                className="absolute rounded-full"
                style={{
                  left: g.baseX - pR,
                  top: g.baseY - pR,
                  width: pR * 2,
                  height: pR * 2,
                  background: `radial-gradient(circle at 35% 30%, ${pl.light}, ${pl.base} 55%, ${pl.dark})`,
                  boxShadow: `0 0 ${pR * 0.6}px ${pl.base}40, inset -${pR * 0.25}px ${pR * 0.15}px ${pR * 0.5}px ${pl.dark}80`,
                }}
              />
            );
          })()}

          {/* ── Objetivo (órbita + planeta) ── */}
          <div
            className="absolute rounded-full border-2 border-cyan-400/60"
            style={{
              left: g.targetX - g.targetR,
              top: g.targetY - g.targetR,
              width: g.targetR * 2,
              height: g.targetR * 2,
              boxShadow: "0 0 20px rgba(34,211,238,0.2), inset 0 0 20px rgba(34,211,238,0.08)",
            }}
          />

          {/* ── Planeta Objetivo ── */}
          {(() => {
            const pl = g.targetPlanet;
            const pR = Math.max(7, g.targetR * 0.30);
            return (
              <div
                className="absolute rounded-full"
                style={{
                  left: g.targetX - pR,
                  top: g.targetY - pR,
                  width: pR * 2,
                  height: pR * 2,
                  background: `radial-gradient(circle at 35% 30%, ${pl.light}, ${pl.base} 55%, ${pl.dark})`,
                  boxShadow: `0 0 ${pR * 0.6}px ${pl.base}40, inset -${pR * 0.25}px ${pR * 0.15}px ${pR * 0.5}px ${pl.dark}80`,
                }}
              />
            );
          })()}

          {/* ── Estela del jugador (SHOOTING + TRAVELING) ── */}
          {(phaseRef.current === PHASE.SHOOTING || phaseRef.current === PHASE.TRAVELING) &&
            g.trail.map((pt, i) => {
              const opacity = ((i + 1) / g.trail.length) * 0.6;
              const size = (g.playerR || 8) * 2 * ((i + 1) / g.trail.length) * 0.7;
              return (
                <div
                  key={i}
                  className="absolute rounded-full bg-blue-400"
                  style={{
                    left: pt.x - size / 2,
                    top: pt.y - size / 2,
                    width: size,
                    height: size,
                    opacity,
                  }}
                />
              );
            })}

          {/* ── Jugador ── */}
          {(() => {
            const pR = g.playerR || 8;
            return (
              <div
                className="absolute rounded-full bg-blue-400"
                style={{
                  left: g.playerX - pR,
                  top: g.playerY - pR,
                  width: pR * 2,
                  height: pR * 2,
                  boxShadow:
                    (phaseRef.current === PHASE.SHOOTING || phaseRef.current === PHASE.TRAVELING)
                      ? "0 0 18px rgba(96,165,250,0.8), 0 0 40px rgba(96,165,250,0.3)"
                      : "0 0 12px rgba(96,165,250,0.6)",
                }}
              />
            );
          })()}

          {/* ── Líneas guía sutiles (ORBITING): radio y tangente ── */}
          {phaseRef.current === PHASE.ORBITING && (
            <svg
              className="absolute inset-0 pointer-events-none"
              width={dims.w}
              height={dims.h}
              style={{ zIndex: 1 }}
            >
              {/* Línea tangente (dirección de disparo) */}
              <line
                x1={g.playerX}
                y1={g.playerY}
                x2={g.playerX + (-Math.sin(g.angle)) * 35}
                y2={g.playerY + Math.cos(g.angle) * 35}
                stroke="rgba(96,165,250,0.3)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
            </svg>
          )}
        </>
      )}

      {/* ── Hint IDLE ── */}
      {phase === PHASE.IDLE && (
        <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
          <div className="flex flex-col items-center gap-3 animate-pulse">
            <img
              src="/logo-orbitsniper.png"
              alt="Orbit Sniper"
              className="w-16 h-16 object-contain drop-shadow-lg"
              draggable={false}
            />
            <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
              {t("desc.orbit-sniper")}
            </span>
          </div>
        </div>
      )}

      {/* ── Resultado final ── */}
      {isEnded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-2">
          <div className="flex flex-col items-center gap-2 mb-4">
            <span
              className="text-7xl sm:text-8xl font-black text-white tabular-nums"
              style={{ fontFeatureSettings: "'tnum'" }}
            >
              {score}
            </span>
            <span className="text-lg text-white/50 font-semibold">
              {t("orbitsniper.subtitle")}
            </span>
          </div>
        </div>
      )}

      {/* ── GAME OVER panel ── */}
      {isEnded && (
        <GameOverPanel
          title="Game Over"
          score={score}
          subtitle={t("orbitsniper.subtitle")}
          onReplay={onReplay}
          onNext={onNextGame}
          ranking={ranking}
          scoreMessage={scoreMessage}
          xpGained={xpGained}

          isLoading={isRankingLoading}
        />
      )}

      {/* ── Instrucción durante juego ── */}
      {phaseRef.current === PHASE.ORBITING && phase !== PHASE.IDLE && (
        <div className="absolute bottom-[22vh] inset-x-0 flex justify-center pointer-events-none z-3">
          <span className="text-xs font-medium text-white/25 tracking-wider uppercase">
            {t("desc.orbit-sniper")}
          </span>
        </div>
      )}
    </div>
  );
};

export default OrbitSniperGame;
