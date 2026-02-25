/**
 * GravityDrawGame.jsx — "Gravity Draw"
 *
 * Dos fases por ronda:
 *  FASE 1 (DRAW): Aparece una meta y una bola. El jugador tiene ~1.5s
 *        para dibujar UNA línea recta arrastrando el dedo / ratón.
 *  FASE 2 (SIM):  La bola cae con gravedad, rebota en la línea del
 *        jugador (reflexión vectorial), rebota en los bordes laterales
 *        y superior. Si toca la meta → +1 y nueva ronda.
 *        Si cae por abajo → Game Over.
 *
 * Motor de físicas propio: colisión círculo-segmento con reflexión
 * vectorial + restitución, detección de bordes, gravedad constante.
 *
 * Props:
 *   isActive    – arranca el juego al pasar a true
 *   onNextGame  – callback siguiente juego
 *   onReplay    – callback replay
 *   userId      – ID del usuario logueado
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ═══════════════════ CONSTANTES ═══════════════════ */
const PHASE = { IDLE: 0, DRAW: 1, PRE_SIM: 6, SIM: 2, SETTLING: 5, SCORED: 3, ENDED: 4 };

// Fase SCORED: delay antes de siguiente ronda
const SCORED_DELAY_MS = 900;
const SETTLE_DAMP     = 0.985;    // rozamiento suave dentro de la canasta (por frame)
const SETTLE_VEL_THR  = 0.35;    // umbral de velocidad para considerar 'quieta'
const SETTLE_BOUNCE   = 0.35;    // restitución al rebotar en el fondo

// Área de juego confinada
const MAX_GAME_WIDTH = 450;

// Físicas
const GRAVITY       = 0.45;     // px/frame²
const RESTITUTION   = 0.72;     // pérdida de energía en rebote con línea
const WALL_REST     = 0.85;     // pérdida en bordes
const REF_WIDTH     = 450;      // ancho de referencia para escalar tamaños
const BASE_BALL_R   = 22;       // radio de bola a REF_WIDTH (ronda 0, grande)
const BASE_GOAL_S   = 92;       // tamaño de canasta a REF_WIDTH (ronda 0, grande)
const MIN_BALL_R    = 12;       // radio mínimo
const MIN_GOAL_S    = 44;       // tamaño mínimo de canasta
const SHRINK_PER_ROUND = 0.022; // reducción por ronda (muy gradual)
const BASKET_REST   = 0.65;     // restitución en paredes de canasta
const BALL_START_VY = 0;        // velocidad inicial Y
const MAX_VEL       = 18;       // clamp de velocidad

// Tiempos
const DRAW_TIME_BASE = 1550;    // ms para dibujar (ronda 0)
const DRAW_TIME_MIN  = 1000;    // mínimo ms
const DRAW_TIME_SHRINK = 45;    // ms menos por ronda
const SIM_TIMEOUT_MS = 5000;    // 5 s máximo en fase SIM
const PRE_SIM_DELAY  = 500;     // ms de pausa antes de soltar la bola (ajustable)

// Colores
const BG_COLOR      = "#0d1117";
const BALL_COLOR    = "#ffffff";
const BALL_GLOW     = "rgba(255,255,255,0.35)";
const LINE_COLOR    = "#00e5ff";
const LINE_GLOW     = "rgba(0,229,255,0.4)";
const GOAL_COLOR    = "#ff9800";
const GOAL_GLOW     = "rgba(255,152,0,0.35)";
const TIMER_BG      = "rgba(255,255,255,0.12)";
const TIMER_FILL    = "#00e5ff";

/* ═══════════════════ HELPERS VECTORIALES ═══════════════════ */
function dot(ax, ay, bx, by) { return ax * bx + ay * by; }
function lenSq(x, y) { return x * x + y * y; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * Distancia mínima de un punto P a un segmento AB.
 * Devuelve { dist, closestX, closestY, t }.
 */
function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = lenSq(dx, dy);
  if (l2 === 0) {
    const d = Math.hypot(px - ax, py - ay);
    return { dist: d, closestX: ax, closestY: ay, t: 0 };
  }
  let t = dot(px - ax, py - ay, dx, dy) / l2;
  t = clamp(t, 0, 1);
  const cx = ax + t * dx, cy = ay + t * dy;
  return { dist: Math.hypot(px - cx, py - cy), closestX: cx, closestY: cy, t };
}

/**
 * Reflexión vectorial: V_out = V_in - 2·dot(V_in, N)·N
 * N debe estar normalizado.
 */
function reflect(vx, vy, nx, ny) {
  const d = dot(vx, vy, nx, ny);
  return { vx: vx - 2 * d * nx, vy: vy - 2 * d * ny };
}

/** Rebota la bola contra un segmento AB. Devuelve true si hubo colisión. */
function bounceBallOffSeg(g, ax, ay, bx, by, rest, ballR) {
  const seg = pointSegDist(g.ballX, g.ballY, ax, ay, bx, by);
  if (seg.dist >= ballR) return false;
  let ndx = -(by - ay), ndy = (bx - ax);
  const nLen = Math.hypot(ndx, ndy);
  if (nLen === 0) return false;
  ndx /= nLen; ndy /= nLen;
  if (dot(g.ballX - seg.closestX, g.ballY - seg.closestY, ndx, ndy) < 0) {
    ndx = -ndx; ndy = -ndy;
  }
  const ref = reflect(g.ballVx, g.ballVy, ndx, ndy);
  g.ballVx = ref.vx * rest;
  g.ballVy = ref.vy * rest;
  const overlap = ballR - seg.dist;
  g.ballX += ndx * (overlap + 1);
  g.ballY += ndy * (overlap + 1);
  return true;
}

/* ═══════════════════ COMPONENTE ═══════════════════ */
const GravityDrawGame = ({ isActive, onNextGame, onReplay, userId, onScrollLock, pinchGuardRef }) => {
  const { t } = useLanguage();
  const canvasRef     = useRef(null);
  const containerRef  = useRef(null);

  /* ── Estado de juego ── */
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [score, setScore] = useState(0);
  const scoreRef          = useRef(0);
  const phaseRef          = useRef(PHASE.IDLE);

  /* ── Dimensiones ── */
  const [dims, setDims] = useState({ w: 400, h: 700 });

  /* ── Ranking / submit ── */
  const [ranking, setRanking]                   = useState([]);
  const [scoreMessage, setScoreMessage]         = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted                          = useRef(false);

  const { submit, xpGained } = useSubmitScore(userId, GAME_IDS.GravityDrawGame);

  /* ── Datos mutables del juego ── */
  const g = useRef({
    // Bola
    ballX: 0, ballY: 0, ballVx: 0, ballVy: 0,
    // Línea del jugador [x1,y1, x2,y2] o null
    line: null,
    // Meta
    goalX: 0, goalY: 0,
    // Draw state
    drawing: false,
    drawStart: null, // {x, y}
    drawEnd: null,   // {x, y}
    drawTimeLeft: DRAW_TIME_BASE,
    drawTimeCur: DRAW_TIME_BASE, // tiempo actual de la ronda
    drawStartTime: 0,
    // Fase interna
    phase: PHASE.IDLE,
    // Animación
    lastTime: 0,
    // Fase SCORED
    scoredTime: 0,       // timestamp de cuando anotó
    scoredAlpha: 1,      // alpha del texto de éxito
    // Fase SIM timeout
    simStartTime: 0,
    // PRE_SIM
    preSimTime: 0,
    // Área de juego confinada (se recalcula)
    gameW: 450, offsetX: 0, ballR: BASE_BALL_R, goalS: BASE_GOAL_S,
  }).current;

  /* ── RAF ref ── */
  const rafRef = useRef(null);

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

  /* ─────────── Recalcular área de juego confinada + dificultad progresiva ─────────── */
  const recalcArea = useCallback((currentScore = 0) => {
    const W = dims.w;
    const gameW   = Math.min(W, MAX_GAME_WIDTH);
    const offsetX = (W - gameW) / 2;
    const scale   = gameW / REF_WIDTH;
    // Reducción progresiva por ronda
    const shrink  = Math.max(1 - SHRINK_PER_ROUND * currentScore, 0.35);
    g.gameW   = gameW;
    g.offsetX = offsetX;
    g.ballR   = Math.max(MIN_BALL_R, Math.round(BASE_BALL_R * scale * shrink));
    g.goalS   = Math.max(MIN_GOAL_S, Math.round(BASE_GOAL_S * scale * shrink));
  }, [dims, g]);

  /* ─────────── Generar posiciones de ronda ─────────── */
  const setupRound = useCallback((currentScore = 0) => {
    recalcArea(currentScore);
    const H = dims.h;
    const { gameW, offsetX, ballR, goalS } = g;
    const margin = Math.round(gameW * 0.08);
    // Meta: X aleatoria dentro del área de juego, Y fija en ~75% de la pantalla
    g.goalX = offsetX + margin + Math.random() * (gameW - 2 * margin - goalS);
    g.goalY = H * 0.74;
    // Bola: X aleatoria, garantizando que NO esté justo encima de la canasta
    const xRange = gameW - 2 * margin;
    let ballXLocal;
    let attempts = 0;
    do {
      ballXLocal = Math.random() * xRange;
      attempts++;
    } while (
      attempts < 50 &&
      (offsetX + margin + ballXLocal) > g.goalX - ballR * 1.5 &&
      (offsetX + margin + ballXLocal) < g.goalX + goalS + ballR * 1.5
    );
    g.ballX = offsetX + margin + ballXLocal;
    g.ballY = H * 0.18;
    g.ballVx = 0;
    g.ballVy = BALL_START_VY;
    // Reset línea
    g.line = null;
    g.drawing = false;
    g.drawStart = null;
    g.drawEnd = null;
    // Tiempo de dibujo progresivo
    g.drawTimeCur = Math.max(DRAW_TIME_MIN, DRAW_TIME_BASE - DRAW_TIME_SHRINK * currentScore);
    g.drawTimeLeft = g.drawTimeCur;
    g.drawStartTime = performance.now();
  }, [dims, g, recalcArea]);

  /* ─────────── Iniciar partida ─────────── */
  const startGame = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    scoreRef.current = 0;
    setScore(0);
    scoreSubmitted.current = false;
    setRanking([]);
    setScoreMessage("");
    setupRound(0);
    g.phase = PHASE.DRAW;
    g.lastTime = performance.now();
    phaseRef.current = PHASE.DRAW;
    setPhase(PHASE.DRAW);
  }, [setupRound, g]);

  /* ── Auto-start ── */
  useEffect(() => {
    if (isActive && phaseRef.current === PHASE.IDLE) startGame();
  }, [isActive, startGame]);

  /* ─────────── MAIN GAME LOOP ─────────── */
  useEffect(() => {
    if (phase !== PHASE.DRAW && phase !== PHASE.PRE_SIM && phase !== PHASE.SIM && phase !== PHASE.SETTLING && phase !== PHASE.SCORED) return;
    if (!isActive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = dims.w, H = dims.h;
    canvas.width  = W * devicePixelRatio;
    canvas.height = H * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    // Área de juego confinada
    const gameW   = g.gameW;
    const offsetX = g.offsetX;
    const ballR   = g.ballR;
    const goalS   = g.goalS;
    const leftW   = offsetX;
    const rightW  = offsetX + gameW;

    function loop(now) {
      if (phaseRef.current === PHASE.ENDED || phaseRef.current === PHASE.IDLE) return;

      /* ── FASE PRE_SIM: pausa antes de soltar bola ── */
      if (g.phase === PHASE.PRE_SIM) {
        if (now - g.preSimTime >= PRE_SIM_DELAY) {
          g.phase = PHASE.SIM;
          phaseRef.current = PHASE.SIM;
          g.simStartTime = now;
          setPhase(PHASE.SIM);
        }
      }

      /* ── FASE SETTLING: bola cae dentro de la canasta con física real ── */
      if (g.phase === PHASE.SETTLING) {
        // Timeout compartido con SIM
        if (now - g.simStartTime > SIM_TIMEOUT_MS) {
          g.phase = PHASE.ENDED;
          phaseRef.current = PHASE.ENDED;
          setPhase(PHASE.ENDED);
          return;
        }
        const sdt = Math.min((now - g.lastTime) / 16.667, 3);
        // Gravedad completa + rozamiento leve (simula aire/red)
        g.ballVy += GRAVITY * sdt;
        g.ballVx *= Math.pow(SETTLE_DAMP, sdt);
        g.ballVy *= Math.pow(SETTLE_DAMP, sdt);
        g.ballX += g.ballVx * sdt;
        g.ballY += g.ballVy * sdt;

        // Colisión sólida con las 3 paredes de la canasta (misma lógica que SIM)
        // Pared izquierda
        bounceBallOffSeg(g, g.goalX, g.goalY, g.goalX, g.goalY + goalS, SETTLE_BOUNCE, ballR);
        // Pared derecha
        bounceBallOffSeg(g, g.goalX + goalS, g.goalY, g.goalX + goalS, g.goalY + goalS, SETTLE_BOUNCE, ballR);
        // Fondo
        bounceBallOffSeg(g, g.goalX, g.goalY + goalS, g.goalX + goalS, g.goalY + goalS, SETTLE_BOUNCE, ballR);

        // Seguridad: no traspasar el fondo nunca
        const bBot = g.goalY + goalS - ballR;
        if (g.ballY > bBot) { g.ballY = bBot; g.ballVy = -Math.abs(g.ballVy) * SETTLE_BOUNCE; }

        // Cuando la bola está quieta en el fondo → anotar gol
        const speed = Math.hypot(g.ballVx, g.ballVy);
        if (speed < SETTLE_VEL_THR && g.ballY >= bBot - 2) {
          scoreRef.current += 1;
          setScore(scoreRef.current);
          g.scoredTime = now;
          g.scoredAlpha = 1;
          g.phase = PHASE.SCORED;
          phaseRef.current = PHASE.SCORED;
          setPhase(PHASE.SCORED);
        }
      }

      const dt = Math.min((now - g.lastTime) / 16.667, 3); // normalize to ~60fps
      g.lastTime = now;

      /* ── FASE SCORED: delay + mensaje de éxito ── */
      if (g.phase === PHASE.SCORED) {
        const elapsed = now - g.scoredTime;
        g.scoredAlpha = clamp(1 - (elapsed - SCORED_DELAY_MS * 0.6) / (SCORED_DELAY_MS * 0.4), 0, 1);
        if (elapsed >= SCORED_DELAY_MS) {
          setupRound(scoreRef.current);
          g.phase = PHASE.DRAW;
          phaseRef.current = PHASE.DRAW;
          setPhase(PHASE.DRAW);
        }
      }

      /* ── FASE DRAW: countdown ── */
      if (g.phase === PHASE.DRAW) {
        const elapsed = now - g.drawStartTime;
        g.drawTimeLeft = Math.max(0, g.drawTimeCur - elapsed);
        if (g.drawTimeLeft <= 0) {
          // Tiempo acabado → solidificar lo que haya y pasar a SIM
          if (!g.line && g.drawStart && g.drawEnd) {
            const dx = g.drawEnd.x - g.drawStart.x;
            const dy = g.drawEnd.y - g.drawStart.y;
            if (Math.hypot(dx, dy) > 10) {
              g.line = [g.drawStart.x, g.drawStart.y, g.drawEnd.x, g.drawEnd.y];
            }
          }
          g.drawing = false;
          g.phase = PHASE.PRE_SIM;
          phaseRef.current = PHASE.PRE_SIM;
          g.preSimTime = now;
          setPhase(PHASE.PRE_SIM);
        }
      }

      /* ── FASE SIM: físicas ── */
      if (g.phase === PHASE.SIM) {
        // Timeout 5 s
        if (now - g.simStartTime > SIM_TIMEOUT_MS) {
          g.phase = PHASE.ENDED;
          phaseRef.current = PHASE.ENDED;
          setPhase(PHASE.ENDED);
          return;
        }
        // Gravedad
        g.ballVy += GRAVITY * dt;
        // Clamp velocidad
        g.ballVx = clamp(g.ballVx, -MAX_VEL, MAX_VEL);
        g.ballVy = clamp(g.ballVy, -MAX_VEL, MAX_VEL);
        // Mover
        g.ballX += g.ballVx * dt;
        g.ballY += g.ballVy * dt;

        // --- Colisión con línea del jugador ---
        if (g.line) {
          bounceBallOffSeg(g, g.line[0], g.line[1], g.line[2], g.line[3], RESTITUTION, ballR);
        }

        // --- Colisión con bordes del área confinada ---
        // Izquierda
        if (g.ballX - ballR < leftW) {
          g.ballX = leftW + ballR;
          g.ballVx = Math.abs(g.ballVx) * WALL_REST;
        }
        // Derecha
        if (g.ballX + ballR > rightW) {
          g.ballX = rightW - ballR;
          g.ballVx = -Math.abs(g.ballVx) * WALL_REST;
        }
        // Arriba
        if (g.ballY - ballR < 0) {
          g.ballY = ballR;
          g.ballVy = Math.abs(g.ballVy) * WALL_REST;
        }

        // --- Canasta: paredes laterales (rebote) ---
        bounceBallOffSeg(g, g.goalX, g.goalY, g.goalX, g.goalY + goalS, BASKET_REST, ballR);
        bounceBallOffSeg(g, g.goalX + goalS, g.goalY, g.goalX + goalS, g.goalY + goalS, BASKET_REST, ballR);

        // --- ¿Bola entra en la canasta por arriba? → pasar a SETTLING ---
        const insideX = g.ballX > g.goalX + ballR * 0.4 && g.ballX < g.goalX + goalS - ballR * 0.4;
        const insideY = g.ballY > g.goalY + goalS * 0.28 && g.ballY < g.goalY + goalS;
        if (insideX && insideY && g.ballVy > 0.5) {
          g.line = null; // quitar la línea para limpiar la escena
          g.phase = PHASE.SETTLING;
          phaseRef.current = PHASE.SETTLING;
        }

        // --- Canasta: pared inferior (impide entrar desde abajo) ---
        bounceBallOffSeg(g, g.goalX, g.goalY + goalS, g.goalX + goalS, g.goalY + goalS, BASKET_REST, ballR);

        // --- ¿Lose? Bola cae por abajo ---
        if (g.ballY - ballR > H) {
          g.phase = PHASE.ENDED;
          phaseRef.current = PHASE.ENDED;
          setPhase(PHASE.ENDED);
          return;
        }
      }

      /* ── RENDER ── */
      // Fondo completo
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, W, H);

      // Zona fuera del área de juego (oscurecer)
      if (offsetX > 0) {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, 0, leftW, H);
        ctx.fillRect(rightW, 0, W - rightW, H);
        // Bordes del área de juego
        ctx.strokeStyle = "rgba(0,229,255,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(leftW,  0); ctx.lineTo(leftW,  H);
        ctx.moveTo(rightW, 0); ctx.lineTo(rightW, H);
        ctx.stroke();
      }

      // Sutil cuadrícula (solo dentro del área de juego)
      ctx.strokeStyle = "rgba(255,255,255,0.03)";
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = leftW; x < rightW; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(leftW, y); ctx.lineTo(rightW, y); ctx.stroke();
      }

      // ── Zona de dibujo (banda entre bola y canasta, solo en DRAW) ──
      if (g.phase === PHASE.DRAW && !g.line) {
        const zoneTop = g.ballY + ballR * 3.2;
        const zoneBot = g.goalY - goalS * 0.4;
        if (zoneBot > zoneTop + 10) {
          ctx.save();
          const zoneH = zoneBot - zoneTop;
          // Líneas divisorias visibles (arriba y abajo de la zona)
          ctx.setLineDash([10, 6]);
          ctx.strokeStyle = "rgba(255,170,50,0.35)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(leftW, zoneTop); ctx.lineTo(rightW, zoneTop);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(leftW, zoneBot); ctx.lineTo(rightW, zoneBot);
          ctx.stroke();
          ctx.setLineDash([]);
          // Relleno suave de la zona
          const zoneGrad = ctx.createLinearGradient(0, zoneTop, 0, zoneBot);
          zoneGrad.addColorStop(0, "rgba(255,170,50,0)");
          zoneGrad.addColorStop(0.2, "rgba(255,170,50,0.07)");
          zoneGrad.addColorStop(0.5, "rgba(255,170,50,0.09)");
          zoneGrad.addColorStop(0.8, "rgba(255,170,50,0.07)");
          zoneGrad.addColorStop(1, "rgba(255,170,50,0)");
          ctx.fillStyle = zoneGrad;
          ctx.fillRect(leftW, zoneTop, gameW, zoneH);
          // Texto centrado grande en la zona
          if (!g.drawing) {
            ctx.fillStyle = "rgba(255,190,80,0.30)";
            ctx.font = "700 16px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(t("gravitydraw.drawHere"), leftW + gameW / 2, zoneTop + zoneH / 2 + 5);
          }
          ctx.restore();
        }
      }

      // ══ GENERADOR DE CONTENCIÓN AVANZADO ══
      {
        const bx = g.goalX;
        const by = g.goalY;
        const bw = goalS;
        const bh = goalS;
        const gcx = bx + bw / 2;
        const wt  = Math.max(3, bw * 0.07);
        const rimH = Math.max(2.5, bw * 0.065);
        const rimOut = bw * 0.09;

        const platW = bw * 1.6;
        const platH = bw * 0.22;
        const platX = gcx - platW / 2;
        const platY = by + bh;
        const platR = platH * 0.4;
        const hover = Math.sin(now * 0.003) * 2.5;

        const pulse    = Math.sin(now * 0.004);
        const fastP    = Math.sin(now * 0.008);
        const slowP    = Math.sin(now * 0.002);
        const secCycle = (now * 0.001) % 6.283;

        ctx.save();
        ctx.translate(0, hover);

        // ═══════════ PLATAFORMA: ESTACIÓN DE ENERGÍA PESADA ═══════════

        // Chorro anti-gravedad (debajo)
        for (let j = 0; j < 3; j++) {
          const jx = gcx + (j - 1) * platW * 0.28;
          const jetGrad = ctx.createRadialGradient(jx, platY + platH + 2, 1, jx, platY + platH + 18, platW * 0.12);
          jetGrad.addColorStop(0, `rgba(34,211,238,${0.22 + slowP * 0.06})`);
          jetGrad.addColorStop(0.4, `rgba(34,211,238,${0.08 + slowP * 0.03})`);
          jetGrad.addColorStop(1, "rgba(34,211,238,0)");
          ctx.fillStyle = jetGrad;
          ctx.fillRect(jx - platW * 0.09, platY + platH - 1, platW * 0.18, 22);
        }

        // Sombra de levitación amplia
        ctx.fillStyle = `rgba(0,229,255,${0.04 + slowP * 0.015})`;
        ctx.beginPath();
        ctx.ellipse(gcx, platY + platH + 14, platW * 0.48, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Cuerpo blindado (doble capa)
        const platG1 = ctx.createLinearGradient(platX, platY, platX, platY + platH);
        platG1.addColorStop(0, "#44536a");
        platG1.addColorStop(0.12, "#5a6b80");
        platG1.addColorStop(0.35, "#374556");
        platG1.addColorStop(0.7, "#222e3c");
        platG1.addColorStop(1, "#111a24");
        ctx.fillStyle = platG1;
        ctx.beginPath();
        ctx.roundRect(platX, platY, platW, platH, platR);
        ctx.fill();

        // Placas de blindaje (paneles separados)
        ctx.strokeStyle = "rgba(100,130,160,0.18)";
        ctx.lineWidth = 0.7;
        const panelCount = 6;
        for (let p = 1; p < panelCount; p++) {
          const px = platX + platW * (p / panelCount);
          ctx.beginPath();
          ctx.moveTo(px, platY + 2);
          ctx.lineTo(px, platY + platH - 2);
          ctx.stroke();
        }

        // Borde superior (filo de titanio)
        const edgeG = ctx.createLinearGradient(platX, platY, platX + platW, platY);
        edgeG.addColorStop(0, "rgba(120,150,180,0.3)");
        edgeG.addColorStop(0.5, "rgba(200,220,240,0.55)");
        edgeG.addColorStop(1, "rgba(120,150,180,0.3)");
        ctx.strokeStyle = edgeG;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(platX + platR, platY + 0.5);
        ctx.lineTo(platX + platW - platR, platY + 0.5);
        ctx.stroke();

        // Borde inferior cian
        ctx.strokeStyle = `rgba(0,229,255,${0.18 + pulse * 0.06})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(platX + platR, platY + platH - 0.5);
        ctx.lineTo(platX + platW - platR, platY + platH - 0.5);
        ctx.stroke();

        // Tornillos grandes (4 esquinas + 2 centrales)
        const screwR = Math.max(1.2, platH * 0.08);
        const screwPositions = [
          [platX + platW * 0.08, platY + platH * 0.35],
          [platX + platW * 0.08, platY + platH * 0.65],
          [platX + platW * 0.92, platY + platH * 0.35],
          [platX + platW * 0.92, platY + platH * 0.65],
          [platX + platW * 0.5,  platY + platH * 0.3],
          [platX + platW * 0.5,  platY + platH * 0.7],
        ];
        screwPositions.forEach(([sx, sy]) => {
          ctx.fillStyle = "rgba(90,110,135,0.7)";
          ctx.beginPath();
          ctx.arc(sx, sy, screwR, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(180,200,220,0.35)";
          ctx.beginPath();
          ctx.arc(sx, sy, screwR * 0.4, 0, Math.PI * 2);
          ctx.fill();
        });

        // LEDs secuenciales (parpadeo tipo chaser)
        for (let i = 0; i < 3; i++) {
          const lx = platX + platW * (0.25 + i * 0.25);
          const ly = platY + platH * 0.5;
          const ledR = Math.max(2.2, platH * 0.14);
          // Secuencia: cada LED brilla fuerte en su turno
          const phase_i = (secCycle + i * 2.1) % 6.283;
          const ledBr = 0.3 + 0.65 * Math.max(0, Math.cos(phase_i));
          // Halo
          const hG = ctx.createRadialGradient(lx, ly, 0, lx, ly, ledR * 5);
          hG.addColorStop(0, `rgba(34,211,238,${ledBr * 0.35})`);
          hG.addColorStop(1, "rgba(34,211,238,0)");
          ctx.fillStyle = hG;
          ctx.beginPath();
          ctx.arc(lx, ly, ledR * 5, 0, Math.PI * 2);
          ctx.fill();
          // Core
          ctx.shadowColor = "#22d3ee";
          ctx.shadowBlur = 10;
          ctx.fillStyle = `rgba(34,211,238,${ledBr})`;
          ctx.beginPath();
          ctx.arc(lx, ly, ledR, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          // Specular
          ctx.fillStyle = `rgba(255,255,255,${ledBr * 0.6})`;
          ctx.beginPath();
          ctx.arc(lx - ledR * 0.2, ly - ledR * 0.2, ledR * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }

        // ═══════════ CANASTA: GENERADOR DE CONTENCIÓN ═══════════

        const innerL = bx + wt;
        const innerR = bx + bw - wt;
        const innerT = by + rimH;
        const innerB = by + bh - wt;
        const innerW = innerR - innerL;
        const innerH = innerB - innerT;

        // --- Campo de fuerza interior (volumen de energía intenso) ---
        const fieldG = ctx.createRadialGradient(gcx, by + bh * 0.55, bw * 0.05, gcx, by + bh * 0.55, bw * 0.6);
        fieldG.addColorStop(0, `rgba(255,180,40,${0.1 + pulse * 0.03})`);
        fieldG.addColorStop(0.4, `rgba(251,146,0,${0.06 + pulse * 0.02})`);
        fieldG.addColorStop(1, `rgba(251,100,0,${0.015})`);
        ctx.fillStyle = fieldG;
        ctx.fillRect(innerL, innerT, innerW, innerH);

        // Distorsión de escudo (bandas horizontales ondulantes)
        for (let s = 0; s < 5; s++) {
          const sy = innerT + innerH * ((s + 0.5) / 5) + Math.sin(now * 0.003 + s * 1.3) * 3;
          const sAlpha = 0.025 + 0.015 * Math.sin(now * 0.005 + s * 2);
          ctx.fillStyle = `rgba(255,200,80,${sAlpha})`;
          ctx.fillRect(innerL + 1, sy - 1.5, innerW - 2, 3);
        }

        // Partículas ascendentes dentro del campo
        for (let i = 0; i < 10; i++) {
          const seed = i * 73.37;
          const px = innerL + 3 + ((seed + Math.sin(now * 0.001 + i * 1.9) * 6) % (innerW - 6));
          // Ascendentes: bajan en y mod innerH
          const rawY = innerB - ((now * 0.015 + seed) % innerH);
          const py = rawY < innerT ? rawY + innerH : rawY;
          const pa = 0.12 + 0.15 * Math.sin(now * 0.006 + i * 2.7);
          const pr = 0.8 + 0.4 * Math.sin(now * 0.008 + i);
          ctx.fillStyle = `rgba(255,200,80,${pa})`;
          ctx.beginPath();
          ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.fill();
        }

        // --- Pilares de titanio (paredes mecánicas) ---
        const pillarG = ctx.createLinearGradient(bx, by, bx + wt, by);

        // Pilar izquierdo
        const plG_L = ctx.createLinearGradient(bx, by, bx + wt, by);
        plG_L.addColorStop(0, "#2a3444");
        plG_L.addColorStop(0.3, "#3a4a5c");
        plG_L.addColorStop(0.6, "#2e3c4e");
        plG_L.addColorStop(1, "#1e2a38");
        ctx.fillStyle = plG_L;
        ctx.fillRect(bx, innerT, wt, bh - rimH);

        // Pilar derecho
        const plG_R = ctx.createLinearGradient(bx + bw - wt, by, bx + bw, by);
        plG_R.addColorStop(0, "#1e2a38");
        plG_R.addColorStop(0.4, "#2e3c4e");
        plG_R.addColorStop(0.7, "#3a4a5c");
        plG_R.addColorStop(1, "#2a3444");
        ctx.fillStyle = plG_R;
        ctx.fillRect(bx + bw - wt, innerT, wt, bh - rimH);

        // Pilar fondo
        const plG_B = ctx.createLinearGradient(bx, by + bh - wt, bx, by + bh);
        plG_B.addColorStop(0, "#2e3c4e");
        plG_B.addColorStop(0.5, "#3a4a5c");
        plG_B.addColorStop(1, "#222e3c");
        ctx.fillStyle = plG_B;
        ctx.fillRect(bx, by + bh - wt, bw, wt);

        // Rejillas de ventilación en pilares laterales
        ctx.strokeStyle = "rgba(60,80,100,0.5)";
        ctx.lineWidth = 0.5;
        const ventCount = Math.max(3, Math.floor((bh - rimH) / 8));
        for (let v = 0; v < ventCount; v++) {
          const vy = innerT + (bh - rimH) * ((v + 0.5) / ventCount);
          // Izquierda
          ctx.beginPath();
          ctx.moveTo(bx + 1, vy);
          ctx.lineTo(bx + wt - 1, vy);
          ctx.stroke();
          // Derecha
          ctx.beginPath();
          ctx.moveTo(bx + bw - wt + 1, vy);
          ctx.lineTo(bx + bw - 1, vy);
          ctx.stroke();
        }

        // Remaches en pilares
        const rivetR = Math.max(0.8, wt * 0.12);
        const rivetY_positions = [innerT + 5, by + bh - wt - 4, by + bh * 0.5];
        rivetY_positions.forEach(ry => {
          // Izquierda
          ctx.fillStyle = "rgba(80,100,125,0.6)";
          ctx.beginPath();
          ctx.arc(bx + wt * 0.5, ry, rivetR, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(160,185,210,0.3)";
          ctx.beginPath();
          ctx.arc(bx + wt * 0.5, ry, rivetR * 0.4, 0, Math.PI * 2);
          ctx.fill();
          // Derecha
          ctx.fillStyle = "rgba(80,100,125,0.6)";
          ctx.beginPath();
          ctx.arc(bx + bw - wt * 0.5, ry, rivetR, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(160,185,210,0.3)";
          ctx.beginPath();
          ctx.arc(bx + bw - wt * 0.5, ry, rivetR * 0.4, 0, Math.PI * 2);
          ctx.fill();
        });

        // Núcleo de plasma en pilares (tira de neón naranja pulsante)
        const plasmaW = Math.max(1, wt * 0.22);
        const plasmaAlpha = 0.5 + 0.3 * fastP;
        // Gradiente de plasma animado
        const plsG = ctx.createLinearGradient(0, innerT, 0, by + bh);
        const plsOffset = (now * 0.002) % 1;
        plsG.addColorStop(0, `rgba(255,180,40,${plasmaAlpha * 0.3})`);
        plsG.addColorStop(Math.max(0, Math.min(1, 0.2 + plsOffset * 0.3)), `rgba(255,140,0,${plasmaAlpha})`);
        plsG.addColorStop(Math.max(0, Math.min(1, 0.5 + plsOffset * 0.2)), `rgba(255,200,60,${plasmaAlpha * 0.6})`);
        plsG.addColorStop(1, `rgba(255,120,0,${plasmaAlpha * 0.3})`);
        ctx.shadowColor = "rgba(255,160,30,0.4)";
        ctx.shadowBlur = 5;
        ctx.fillStyle = plsG;
        // Izquierda
        ctx.fillRect(bx + wt * 0.5 - plasmaW * 0.5, innerT, plasmaW, bh - rimH);
        // Derecha
        ctx.fillRect(bx + bw - wt * 0.5 - plasmaW * 0.5, innerT, plasmaW, bh - rimH);
        // Fondo
        ctx.fillRect(bx + wt, by + bh - wt * 0.5 - plasmaW * 0.5, bw - wt * 2, plasmaW);
        ctx.shadowBlur = 0;

        // --- Generadores de esquina (4 unidades) ---
        const genS = Math.max(5, bw * 0.09);  // tamaño del generador
        const corners = [
          [bx - genS * 0.6, innerT - genS * 0.3],            // sup-izq
          [bx + bw - genS * 0.4, innerT - genS * 0.3],       // sup-der
          [bx - genS * 0.6, by + bh - genS * 0.7],           // inf-izq
          [bx + bw - genS * 0.4, by + bh - genS * 0.7],      // inf-der
        ];
        corners.forEach(([cx, cy], ci) => {
          // Carcasa
          const cG = ctx.createLinearGradient(cx, cy, cx + genS, cy + genS);
          cG.addColorStop(0, "#3a4858");
          cG.addColorStop(0.5, "#4a5a6c");
          cG.addColorStop(1, "#2a3644");
          ctx.fillStyle = cG;
          ctx.beginPath();
          ctx.roundRect(cx, cy, genS, genS, genS * 0.15);
          ctx.fill();

          // Borde metálico
          ctx.strokeStyle = "rgba(140,170,200,0.25)";
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.roundRect(cx, cy, genS, genS, genS * 0.15);
          ctx.stroke();

          // Bobina (arco interno)
          ctx.strokeStyle = `rgba(255,180,40,${0.3 + 0.2 * Math.sin(now * 0.006 + ci * 1.5)})`;
          ctx.lineWidth = Math.max(0.8, genS * 0.08);
          ctx.beginPath();
          ctx.arc(cx + genS * 0.5, cy + genS * 0.5, genS * 0.28, 0, Math.PI * 1.4);
          ctx.stroke();

          // Núcleo luminoso
          const coreA = 0.5 + 0.4 * Math.sin(now * 0.007 + ci * 2.3);
          ctx.shadowColor = "rgba(255,160,30,0.5)";
          ctx.shadowBlur = 4;
          ctx.fillStyle = `rgba(255,180,40,${coreA})`;
          ctx.beginPath();
          ctx.arc(cx + genS * 0.5, cy + genS * 0.5, genS * 0.14, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          // Indicador LED parpadeante
          const ledA = Math.sin(now * 0.01 + ci * 1.6) > 0.3 ? 0.8 : 0.15;
          ctx.fillStyle = `rgba(0,255,120,${ledA})`;
          ctx.beginPath();
          ctx.arc(cx + genS * 0.82, cy + genS * 0.18, Math.max(0.8, genS * 0.06), 0, Math.PI * 2);
          ctx.fill();

          // Cables (líneas del generador al pilar)
          ctx.strokeStyle = "rgba(100,130,160,0.25)";
          ctx.lineWidth = 0.5;
          const isLeft = ci % 2 === 0;
          const cblX = isLeft ? bx + wt * 0.5 : bx + bw - wt * 0.5;
          ctx.beginPath();
          ctx.moveTo(cx + (isLeft ? genS : 0), cy + genS * 0.5);
          ctx.quadraticCurveTo(
            (cx + (isLeft ? genS : 0) + cblX) * 0.5,
            cy + genS * 0.5 + 3 * Math.sin(now * 0.004 + ci),
            cblX, cy + genS * 0.5
          );
          ctx.stroke();
        });

        // --- Aro / Rim (barra de contención superior, con textura metálica) ---
        ctx.shadowColor = `rgba(251,191,36,${0.45 + pulse * 0.15})`;
        ctx.shadowBlur = 20;
        const rimG = ctx.createLinearGradient(bx - rimOut, by, bx - rimOut, by + rimH);
        rimG.addColorStop(0, "#ffe082");
        rimG.addColorStop(0.3, "#ffc107");
        rimG.addColorStop(0.6, "#ffb300");
        rimG.addColorStop(1, "#ff8f00");
        ctx.fillStyle = rimG;
        ctx.beginPath();
        ctx.roundRect(bx - rimOut, by, bw + rimOut * 2, rimH, rimH * 0.4);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Brillo especular en rim
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.roundRect(bx - rimOut + 3, by + 0.8, bw + rimOut * 2 - 6, rimH * 0.3, rimH * 0.15);
        ctx.fill();

        // Muescas en el rim (como engranaje)
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        const notchCount = Math.max(4, Math.floor(bw / 10));
        for (let n = 0; n < notchCount; n++) {
          const nx = bx - rimOut + 4 + (bw + rimOut * 2 - 8) * (n / (notchCount - 1));
          ctx.fillRect(nx - 0.5, by + rimH * 0.65, 1, rimH * 0.3);
        }

        // Escaneo horizontal doble (dos líneas a diferente velocidad)
        const scan1 = innerT + ((now * 0.025) % innerH);
        const scan2 = innerT + ((now * 0.018 + innerH * 0.5) % innerH);
        ctx.strokeStyle = `rgba(255,185,50,${0.06 + 0.03 * pulse})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(innerL + 2, scan1); ctx.lineTo(innerR - 2, scan1);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,185,50,${0.035 + 0.02 * pulse})`;
        ctx.beginPath();
        ctx.moveTo(innerL + 2, scan2); ctx.lineTo(innerR - 2, scan2);
        ctx.stroke();

        ctx.restore();
      }

      // Línea del jugador (o preview mientras dibuja)
      const lineData = g.line || (g.drawStart && g.drawEnd
        ? [g.drawStart.x, g.drawStart.y, g.drawEnd.x, g.drawEnd.y]
        : null);
      if (lineData) {
        ctx.save();
        ctx.shadowColor = LINE_GLOW;
        ctx.shadowBlur = 14;
        ctx.strokeStyle = LINE_COLOR;
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(lineData[0], lineData[1]);
        ctx.lineTo(lineData[2], lineData[3]);
        ctx.stroke();
        // Endpoints
        ctx.fillStyle = LINE_COLOR;
        ctx.beginPath();
        ctx.arc(lineData[0], lineData[1], 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(lineData[2], lineData[3], 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Bola (blanca con glow)
      ctx.save();
      ctx.shadowColor = BALL_GLOW;
      ctx.shadowBlur = 24;
      ctx.fillStyle = BALL_COLOR;
      ctx.beginPath();
      ctx.arc(g.ballX, g.ballY, ballR, 0, Math.PI * 2);
      ctx.fill();
      // Brillo interior
      const grad = ctx.createRadialGradient(
        g.ballX - ballR * 0.2, g.ballY - ballR * 0.2, 1,
        g.ballX, g.ballY, ballR
      );
      grad.addColorStop(0, "rgba(255,255,255,0.9)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();

      // Mensaje de éxito (fase SCORED)
      if (g.phase === PHASE.SCORED && g.scoredAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = g.scoredAlpha;
        ctx.fillStyle = "#4ade80";
        ctx.font = "bold 28px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(74,222,128,0.5)";
        ctx.shadowBlur = 20;
        ctx.fillText(t("gravitydraw.success"), leftW + gameW / 2, H * 0.44);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // Barra de tiempo (solo en DRAW) — dentro del área de juego, debajo del header
      if (g.phase === PHASE.DRAW) {
        const barW = gameW - 40;
        const barH = 6;
        const barX = leftW + 20;
        const barY = 52;
        const pct = g.drawTimeLeft / g.drawTimeCur;
        // Fondo
        ctx.fillStyle = TIMER_BG;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 3);
        ctx.fill();
        // Fill
        ctx.fillStyle = TIMER_FILL;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * pct, barH, 3);
        ctx.fill();
      }

      // Barra de tiempo SIM (cuenta atrás 5 s)
      if (g.phase === PHASE.SIM || g.phase === PHASE.SETTLING) {
        const barW = gameW - 40;
        const barH = 6;
        const barX = leftW + 20;
        const barY = 52;
        const elapsed = now - g.simStartTime;
        const pct = Math.max(0, 1 - elapsed / SIM_TIMEOUT_MS);
        // Fondo
        ctx.fillStyle = TIMER_BG;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 3);
        ctx.fill();
        // Fill — cambia de cyan a rojo cuando queda poco
        const simColor = pct > 0.3 ? "#ff6b00" : "#ff2244";
        ctx.fillStyle = simColor;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * pct, barH, 3);
        ctx.fill();
      }

      // HUD Score
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "bold 18px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Score: ${scoreRef.current}`, leftW + gameW / 2, H - 18);

      // Instrucción fase draw
      if (g.phase === PHASE.DRAW && !g.drawing && !g.line) {
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.font = "600 14px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(t("gravitydraw.instruction"), leftW + gameW / 2, 76);
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    g.lastTime = performance.now();
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, isActive, dims, g, setupRound, t]);

  /* ─────────── INPUT: pointer events ─────────── */
  const getPos = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const handlePointerDown = useCallback((e) => {
    if (g.phase !== PHASE.DRAW || g.line) return;
    if (pinchGuardRef?.current) return;               // LEY 5
    e.preventDefault();
    const pos = getPos(e);
    // La línea debe empezar dentro de la zona de dibujo (entre bola y canasta)
    const zoneTop = g.ballY + g.ballR * 3.2;
    const zoneBot = g.goalY - g.goalS * 0.4;
    if (pos.y < zoneTop || pos.y > zoneBot) return;
    g.drawing = true;
    g.drawStart = pos;
    g.drawEnd = pos;
  }, [g, getPos]);

  const handlePointerMove = useCallback((e) => {
    if (!g.drawing) return;
    e.preventDefault();
    g.drawEnd = getPos(e);
  }, [g, getPos]);

  const handlePointerUp = useCallback((e) => {
    if (!g.drawing) return;
    e.preventDefault();
    g.drawing = false;
    if (g.drawStart && g.drawEnd) {
      const dx = g.drawEnd.x - g.drawStart.x;
      const dy = g.drawEnd.y - g.drawStart.y;
      // Mínimo de longitud para aceptar línea
      if (Math.hypot(dx, dy) > 15) {
        g.line = [g.drawStart.x, g.drawStart.y, g.drawEnd.x, g.drawEnd.y];
        // Transición a pre-simulación (delay antes de soltar bola)
        g.phase = PHASE.PRE_SIM;
        phaseRef.current = PHASE.PRE_SIM;
        g.preSimTime = performance.now();
        setPhase(PHASE.PRE_SIM);
      }
    }
  }, [g]);

  /* ── Touch events para canvas ── */
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const opts = { passive: false };
    const onTouchStart = (e) => handlePointerDown(e);
    const onTouchMove  = (e) => handlePointerMove(e);
    const onTouchEnd   = (e) => {
      // Use changedTouches for touchend
      if (!g.drawing) return;
      e.preventDefault();
      g.drawing = false;
      if (g.drawStart && g.drawEnd) {
        const dx = g.drawEnd.x - g.drawStart.x;
        const dy = g.drawEnd.y - g.drawStart.y;
        if (Math.hypot(dx, dy) > 15) {
          g.line = [g.drawStart.x, g.drawStart.y, g.drawEnd.x, g.drawEnd.y];
          g.phase = PHASE.PRE_SIM;
          phaseRef.current = PHASE.PRE_SIM;
          g.preSimTime = performance.now();
          setPhase(PHASE.PRE_SIM);
        }
      }
    };
    c.addEventListener("touchstart", onTouchStart, opts);
    c.addEventListener("touchmove",  onTouchMove,  opts);
    c.addEventListener("touchend",   onTouchEnd,   opts);
    return () => {
      c.removeEventListener("touchstart", onTouchStart);
      c.removeEventListener("touchmove",  onTouchMove);
      c.removeEventListener("touchend",   onTouchEnd);
    };
  }, [handlePointerDown, handlePointerMove, g]);

  /* ── Bloquear scroll del feed durante la partida ── */
  const scrollLockTORef = useRef(null);
  useEffect(() => {
    const playing =
      phase === PHASE.DRAW || phase === PHASE.PRE_SIM || phase === PHASE.SIM || phase === PHASE.SETTLING || phase === PHASE.SCORED;
    if (playing) {
      clearTimeout(scrollLockTORef.current);
      onScrollLock?.(true);
    } else if (phase === PHASE.ENDED) {
      // Desbloquear scroll con pequeño delay tras terminar (igual que FrenzyTap)
      scrollLockTORef.current = setTimeout(() => onScrollLock?.(false), 2000);
    } else {
      clearTimeout(scrollLockTORef.current);
      onScrollLock?.(false);
    }
    return () => clearTimeout(scrollLockTORef.current);
  }, [phase, onScrollLock]);

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

  /* ── Cleanup ── */
  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const isEnded = phase === PHASE.ENDED;
  const isIdle  = phase === PHASE.IDLE;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden select-none"
      style={{ background: BG_COLOR }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
      />

      {/* ── Hint IDLE ── */}
      {isIdle && (
        <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
          <div className="flex flex-col items-center gap-3 animate-pulse">
            <img
              src="/logo-gravitydraw.png"
              alt="Gravity Draw"
              className="w-16 h-16 object-contain drop-shadow-lg"
              draggable={false}
            />
            <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
              {t("gravitydraw.instruction")}
            </span>
          </div>
        </div>
      )}

      {/* ── GAME OVER ── */}
      {isEnded && (
        <GameOverPanel
          title="Game Over"
          score={score}
          subtitle={t("gravitydraw.subtitle")}
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

export default GravityDrawGame;
