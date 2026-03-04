/**
 * GhostPongMVP.jsx — "Ghost Pong" v2.1
 *
 * Pong × Arkanoid cyberpunk con zona vórtice creciente, power-ups y vidas.
 * Estética neón cian (bola) + magenta (pala / paredes láser).
 *
 * Mecánicas v2.1:
 *  1. Aceleración progresiva +3% por rebote, sin cap bajo.
 *  2. Zona vórtice dinámica: empieza al 20%, crece +2% por rebote (max 65%).
 *  3. Spawning aleatorio de cajas: aparecen cada 3-8s, máx 3 en pantalla.
 *     Tipos: Gold ⭐ (+10 pts), Expand ↔️ (pala ancha), Life ❤️ (+1 vida).
 *     Cada caja tiene TTL 8-10s con parpadeo de aviso en los últimos 2s.
 *  4. Sistema de vidas: si toca el fondo con vidas > 0, rebota y gasta 1 vida.
 *
 * Rendimiento (60 FPS):
 *  - Posiciones/colisiones en useRef, mutaciones directas de style.
 *  - Bucle de físicas en requestAnimationFrame con delta-time.
 *  - useState solo para fase, score y UI de game over.
 *
 * Props:
 *   isActive      – cuando es true, arranca el juego
 *   onNextGame    – callback para "siguiente juego"
 *   onReplay      – callback para reiniciar
 *   userId        – ID del usuario logueado
 *   pinchGuardRef – ref para protección de pinch-zoom
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ═══════════════════ CONSTANTES ═══════════════════ */
const PHASE = { IDLE: 0, PLAYING: 1, ENDED: 2 };

const GAME_W = 400;
const GAME_H = 600;

// Pala
const PADDLE_W = 80;
const PADDLE_W_EXPANDED = 120;     // +50% temporal
const PADDLE_H = 14;
const PADDLE_BOTTOM = 20;
const EXPAND_DURATION = 5;         // segundos

// Bola
const BALL_SIZE = 16;

// Velocidad
const INITIAL_SPEED = 300;
const SPEED_MULTIPLIER = 1.03;     // +3% por rebote (se vuelve frenético)

// Zona Blackout dinámica
const INITIAL_BLACKOUT = 0.20;     // 20% al inicio
const BLACKOUT_GROW = 0.02;        // +2% por rebote
const MAX_BLACKOUT = 0.65;         // máximo 65%

// Cajas (spawning aleatorio con caducidad)
const BOX_SIZE = 32;              // cajas cuadradas
const MAX_BOXES = 3;              // máximo simultáneas en pantalla
const BOX_TTL_MIN = 8;            // segundos vida mínima
const BOX_TTL_MAX = 10;           // segundos vida máxima
const BOX_BLINK_TIME = 2;         // parpadeo últimos 2s
const SPAWN_INTERVAL_MIN = 3;     // spawn mínimo (segundos)
const SPAWN_INTERVAL_MAX = 8;     // spawn máximo (segundos)
const BOX_SPAWN_MARGIN = 10;      // margen lateral para posicionar
const BOX_TYPES = { GOLD: 0, EXPAND: 1, LIFE: 2 };

// Delta-time cap
const MAX_DELTA = 0.05;

/* ═══════════════════ HELPERS ═══════════════════ */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/** Intervalo aleatorio hasta el próximo spawn (en segundos) */
function randomSpawnInterval() {
  return SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);
}

/** Genera un tipo de caja según probabilidad: Gold 55%, Expand 30%, Life 15% */
function randomBoxType() {
  const r = Math.random();
  if (r < 0.55) return BOX_TYPES.GOLD;
  if (r < 0.85) return BOX_TYPES.EXPAND;
  return BOX_TYPES.LIFE;
}

/** Emoji + colores por tipo de caja */
const BOX_STYLE = {
  [BOX_TYPES.GOLD]: {
    emoji: "⭐",
    bg: "linear-gradient(135deg, #fbbf24, #f59e0b)",
    shadow: "0 0 10px rgba(251,191,36,0.8), 0 0 22px rgba(245,158,11,0.4)",
  },
  [BOX_TYPES.EXPAND]: {
    emoji: "↔️",
    bg: "linear-gradient(135deg, #22d3ee, #06b6d4)",
    shadow: "0 0 10px rgba(34,211,238,0.8), 0 0 22px rgba(6,182,212,0.4)",
  },
  [BOX_TYPES.LIFE]: {
    emoji: "❤️",
    bg: "linear-gradient(135deg, #f43f5e, #d946ef)",
    shadow: "0 0 10px rgba(244,63,94,0.8), 0 0 22px rgba(217,70,239,0.4)",
  },
};

/** Crea una caja en posición aleatoria en el tercio superior */
function spawnBox(cw, ch) {
  const maxX = cw - BOX_SPAWN_MARGIN - BOX_SIZE;
  const x = BOX_SPAWN_MARGIN + Math.random() * Math.max(0, maxX - BOX_SPAWN_MARGIN);
  const y = BOX_SPAWN_MARGIN + Math.random() * (ch * 0.3 - BOX_SPAWN_MARGIN);
  return {
    x,
    y,
    w: BOX_SIZE,
    h: BOX_SIZE,
    alive: true,
    type: randomBoxType(),
    ttl: BOX_TTL_MIN + Math.random() * (BOX_TTL_MAX - BOX_TTL_MIN),
    el: null,                     // DOM node ref (se crea en createBoxEl)
  };
}

/** Crea el elemento DOM para una caja y lo añade al layer */
function createBoxEl(box, layer) {
  const style = BOX_STYLE[box.type];
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.left = `${box.x}px`;
  el.style.top = `${box.y}px`;
  el.style.width = `${BOX_SIZE}px`;
  el.style.height = `${BOX_SIZE}px`;
  el.style.borderRadius = "6px";
  el.style.background = style.bg;
  el.style.boxShadow = style.shadow;
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.fontSize = "16px";
  el.style.lineHeight = "1";
  el.style.transition = "opacity 0.15s, transform 0.15s";
  el.style.opacity = "1";
  el.textContent = style.emoji;
  layer.appendChild(el);
  box.el = el;
}

/* ═══════════════════ COMPONENT ═══════════════════ */
const GhostPongMVP = ({ isActive, onNextGame, onReplay, userId, pinchGuardRef }) => {
  const { t } = useLanguage();

  /* ── Estado de React (UI-only) ── */
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(0);
  const [showGameOver, setShowGameOver] = useState(false);

  /* ── Submit de score ── */
  const gameId = GAME_IDS.GhostPongMVP || "ghost-pong";
  const { submit: submitScore, xpGained } = useSubmitScore(userId, gameId);
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  /* ── Refs de fase ── */
  const phaseRef = useRef(PHASE.IDLE);

  /* ── Refs del contenedor y elementos DOM ── */
  const containerRef = useRef(null);
  const paddleRef = useRef(null);
  const ballRef = useRef(null);
  const vortexRef = useRef(null);
  const boxLayerRef = useRef(null);
  const livesRef = useRef(null);

  /* ── Estado de juego mutable (NO useState!) ── */
  const g = useRef({
    bx: 0, by: 0, vx: 0, vy: 0, speed: INITIAL_SPEED,
    px: 0,
    cw: GAME_W, ch: GAME_H,
    score: 0,
    lives: 0,
    // Blackout dinámico
    blackoutSize: INITIAL_BLACKOUT,
    // Pala expandida
    paddleW: PADDLE_W,
    expandTimer: 0,             // segundos restantes
    // Cajas (spawning dinámico)
    boxes: [],                  // array de objetos caja { x, y, w, h, alive, type, ttl, el }
    spawnTimer: 0,              // segundos hasta próximo spawn
    // Flash de vida (feedback visual)
    flashTimer: 0,
  });

  /* ══════════════════════════════════════════════════
     INICIALIZAR / REINICIAR JUEGO
  ══════════════════════════════════════════════════ */
  const startGame = useCallback(() => {
    const s = g.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) { s.cw = rect.width; s.ch = rect.height; }

    s.px = s.cw / 2;
    s.bx = s.cw / 2;
    s.by = s.ch * 0.55;          // empieza justo debajo del vórtice
    s.speed = INITIAL_SPEED;
    s.score = 0;
    s.lives = 0;
    s.blackoutSize = INITIAL_BLACKOUT;
    s.paddleW = PADDLE_W;
    s.expandTimer = 0;
    s.flashTimer = 0;

    const angle = (Math.PI / 6) + Math.random() * (Math.PI / 3);
    const dir = Math.random() < 0.5 ? 1 : -1;
    s.vx = Math.cos(angle) * INITIAL_SPEED * dir;
    s.vy = Math.sin(angle) * INITIAL_SPEED;

    // Techo vacío: las cajas aparecerán con spawning aleatorio
    s.boxes = [];
    s.spawnTimer = randomSpawnInterval();

    setScore(0);
    setLives(0);
    setShowGameOver(false);
    scoreSubmitted.current = false;
    phaseRef.current = PHASE.PLAYING;
    setPhase(PHASE.PLAYING);

    // Renderizar posición inicial
    if (paddleRef.current) {
      paddleRef.current.style.transform = `translateX(${s.px - s.paddleW / 2}px)`;
      paddleRef.current.style.width = `${s.paddleW}px`;
    }
    if (ballRef.current) {
      ballRef.current.style.transform = `translate(${s.bx - BALL_SIZE / 2}px, ${s.by - BALL_SIZE / 2}px)`;
      ballRef.current.style.opacity = "1";
    }
    // Renderizar zona vórtice
    renderVortex(s);
    // Limpiar cajas anteriores
    if (boxLayerRef.current) boxLayerRef.current.innerHTML = "";
  }, []);

  /* ══════════════════════════════════════════════════
     GAME OVER
  ══════════════════════════════════════════════════ */
  const endGame = useCallback((finalScore) => {
    phaseRef.current = PHASE.ENDED;
    setPhase(PHASE.ENDED);
    setScore(finalScore);

    if (!scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submitScore(finalScore).then((res) => {
        if (res?.data?.ranking) setRanking(res.data.ranking);
        if (res?.message) setScoreMessage(res.message);
        setIsRankingLoading(false);
        setShowGameOver(true);
      }).catch(() => {
        setIsRankingLoading(false);
        setShowGameOver(true);
      });
    }
  }, [submitScore]);

  /* ══════════════════════════════════════════════════
     AUTO-START
  ══════════════════════════════════════════════════ */
  useEffect(() => {
    if (isActive && phaseRef.current === PHASE.IDLE) startGame();
  }, [isActive, startGame]);

  /* ══════════════════════════════════════════════════
     CONTROLES: MOUSE & TOUCH (solo eje X)
  ══════════════════════════════════════════════════ */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handlePointer = (clientX) => {
      if (phaseRef.current !== PHASE.PLAYING) return;
      const rect = container.getBoundingClientRect();
      const localX = clientX - rect.left;
      const pw = g.current.paddleW;
      g.current.px = clamp(localX, pw / 2, g.current.cw - pw / 2);
    };

    const onMouseMove = (e) => handlePointer(e.clientX);
    const onTouchMove = (e) => { e.preventDefault(); if (e.touches.length > 0) handlePointer(e.touches[0].clientX); };
    const onTouchStart = (e) => { if (e.touches.length > 0) handlePointer(e.touches[0].clientX); };

    container.addEventListener("mousemove", onMouseMove);
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    return () => {
      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchstart", onTouchStart);
    };
  }, []);

  /* ══════════════════════════════════════════════════
     RESIZE
  ══════════════════════════════════════════════════ */
  useEffect(() => {
    const onResize = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) { g.current.cw = rect.width; g.current.ch = rect.height; }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* ══════════════════════════════════════════════════
     RENDER HELPERS (direct DOM mutation)
  ══════════════════════════════════════════════════ */
  function renderVortex(s) {
    if (!vortexRef.current) return;
    const topPct = (0.5 - s.blackoutSize / 2) * 100;
    const heightPct = s.blackoutSize * 100;
    vortexRef.current.style.top = `${topPct}%`;
    vortexRef.current.style.height = `${heightPct}%`;
  }

  /* (Dynamic box rendering happens inline via createBoxEl during game loop) */

  /* ══════════════════════════════════════════════════
     GAME LOOP — requestAnimationFrame
  ══════════════════════════════════════════════════ */
  useEffect(() => {
    if (phase !== PHASE.PLAYING || !isActive) return;

    let rafId;
    let lastTime = 0;
    // Need local ref to set lives without stale closure
    let livesRenderDirty = false;

    const loop = (timestamp) => {
      if (phaseRef.current !== PHASE.PLAYING) return;

      if (lastTime === 0) lastTime = timestamp;
      const rawDt = (timestamp - lastTime) / 1000;
      const dt = Math.min(rawDt, MAX_DELTA);
      lastTime = timestamp;

      const s = g.current;
      const halfBall = BALL_SIZE / 2;

      /* ── Expand timer countdown ── */
      if (s.expandTimer > 0) {
        s.expandTimer -= dt;
        if (s.expandTimer <= 0) {
          s.expandTimer = 0;
          s.paddleW = PADDLE_W;
          if (paddleRef.current) paddleRef.current.style.width = `${PADDLE_W}px`;
        }
      }

      /* ── Flash timer countdown ── */
      if (s.flashTimer > 0) {
        s.flashTimer -= dt;
      }

      /* ── Mover bola ── */
      s.bx += s.vx * dt;
      s.by += s.vy * dt;

      /* ── Rebote paredes laterales ── */
      if (s.bx - halfBall <= 0) { s.bx = halfBall; s.vx = Math.abs(s.vx); }
      if (s.bx + halfBall >= s.cw) { s.bx = s.cw - halfBall; s.vx = -Math.abs(s.vx); }

      /* ── Rebote pared superior ── */
      if (s.by - halfBall <= 0) { s.by = halfBall; s.vy = Math.abs(s.vy); }

      /* ── Spawning aleatorio de cajas ── */
      const layer = boxLayerRef.current;
      s.spawnTimer -= dt;
      if (s.spawnTimer <= 0 && layer) {
        // Contar vivas
        const aliveCount = s.boxes.filter(b => b.alive).length;
        if (aliveCount < MAX_BOXES) {
          const newBox = spawnBox(s.cw, s.ch);
          createBoxEl(newBox, layer);
          s.boxes.push(newBox);
        }
        s.spawnTimer = randomSpawnInterval();
      }

      /* ── TTL y parpadeo de cajas ── */
      for (let i = s.boxes.length - 1; i >= 0; i--) {
        const box = s.boxes[i];
        if (!box.alive) continue;

        box.ttl -= dt;

        // Parpadeo en los últimos 2 segundos
        if (box.ttl <= BOX_BLINK_TIME && box.el) {
          const blinkRate = box.ttl < 1 ? 8 : 4; // más rápido el último segundo
          const visible = Math.sin(box.ttl * blinkRate * Math.PI) > 0;
          box.el.style.opacity = visible ? "1" : "0.2";
        }

        // Expirado: eliminar
        if (box.ttl <= 0) {
          box.alive = false;
          if (box.el) {
            box.el.style.opacity = "0";
            box.el.style.transform = "scale(0.5)";
            const elRef = box.el;
            setTimeout(() => { elRef.remove(); }, 150);
            box.el = null;
          }
        }
      }

      // Limpiar cajas muertas del array (evitar acumulación)
      s.boxes = s.boxes.filter(b => b.alive);

      /* ── Colisión con cajas ── */
      for (let i = 0; i < s.boxes.length; i++) {
        const box = s.boxes[i];
        if (!box.alive) continue;

        // AABB ball vs box
        const closestX = clamp(s.bx, box.x, box.x + box.w);
        const closestY = clamp(s.by, box.y, box.y + box.h);
        const dx = s.bx - closestX;
        const dy = s.by - closestY;

        if (dx * dx + dy * dy <= halfBall * halfBall) {
          box.alive = false;

          // Destroy visual
          if (box.el) {
            box.el.style.opacity = "0";
            box.el.style.transform = "scale(1.3)";
            const elRef = box.el;
            setTimeout(() => { elRef.remove(); }, 150);
            box.el = null;
          }

          // Determine bounce axis
          const overlapLeft = (s.bx + halfBall) - box.x;
          const overlapRight = (box.x + box.w) - (s.bx - halfBall);
          const overlapTop = (s.by + halfBall) - box.y;
          const overlapBottom = (box.y + box.h) - (s.by - halfBall);
          const minOverlapX = Math.min(overlapLeft, overlapRight);
          const minOverlapY = Math.min(overlapTop, overlapBottom);

          if (minOverlapX < minOverlapY) {
            s.vx = -s.vx;
          } else {
            s.vy = -s.vy;
          }

          // Apply power-up según tipo
          if (box.type === BOX_TYPES.GOLD) {
            s.score += 10;  // +10 puntos
          } else if (box.type === BOX_TYPES.EXPAND) {
            s.paddleW = PADDLE_W_EXPANDED;
            s.expandTimer = EXPAND_DURATION;
            if (paddleRef.current) paddleRef.current.style.width = `${PADDLE_W_EXPANDED}px`;
            s.score += 1;
          } else if (box.type === BOX_TYPES.LIFE) {
            s.lives += 1;
            livesRenderDirty = true;
            s.score += 1;
          }

          setScore(s.score);
          break; // only one box per frame
        }
      }

      /* ── Colisión con la pala ── */
      const pw = s.paddleW;
      const paddleTop = s.ch - PADDLE_BOTTOM - PADDLE_H;
      const paddleLeft = s.px - pw / 2;
      const paddleRight = s.px + pw / 2;

      if (
        s.vy > 0 &&
        s.by + halfBall >= paddleTop &&
        s.by + halfBall <= paddleTop + PADDLE_H + s.vy * dt &&
        s.bx >= paddleLeft &&
        s.bx <= paddleRight
      ) {
        s.by = paddleTop - halfBall;

        const hitPos = (s.bx - paddleLeft) / pw;
        const angle = Math.PI * (5 / 6 - (hitPos * 4 / 6));

        // Aceleración +3%
        s.speed *= SPEED_MULTIPLIER;

        s.vx = Math.cos(angle) * s.speed;
        s.vy = -Math.sin(angle) * s.speed;

        s.score += 1;

        // Vórtice crece
        s.blackoutSize = Math.min(s.blackoutSize + BLACKOUT_GROW, MAX_BLACKOUT);
        renderVortex(s);
      }

      /* ── Borde inferior: vida o game over ── */
      if (s.by + halfBall >= s.ch) {
        if (s.lives > 0) {
          // Gastar vida, rebotar
          s.lives -= 1;
          livesRenderDirty = true;
          s.by = s.ch - halfBall - 1;
          s.vy = -Math.abs(s.vy);
          s.flashTimer = 0.35;
        } else {
          // Score final = rebotes acumulados
          setScore(s.score);
          endGame(s.score);
          return;
        }
      }

      /* ── Sync lives to React (batched) ── */
      if (livesRenderDirty) {
        setLives(s.lives);
        setScore(s.score);
        livesRenderDirty = false;
      }

      /* ── Renderizar pala ── */
      if (paddleRef.current) {
        paddleRef.current.style.transform = `translateX(${s.px - pw / 2}px)`;
        // Glow extra durante expand
        if (s.expandTimer > 0) {
          paddleRef.current.style.boxShadow = "0 0 14px rgba(251,191,36,0.8), 0 0 30px rgba(249,115,22,0.4), 0 2px 8px rgba(0,0,0,0.5)";
          paddleRef.current.style.background = "linear-gradient(90deg, #f59e0b, #f97316 50%, #f59e0b)";
        } else {
          paddleRef.current.style.boxShadow = "0 0 10px rgba(217,70,239,0.7), 0 0 25px rgba(217,70,239,0.3), 0 2px 8px rgba(0,0,0,0.5)";
          paddleRef.current.style.background = "linear-gradient(90deg, #a855f7, #d946ef 50%, #a855f7)";
        }
      }

      /* ── Renderizar bola ── */
      if (ballRef.current) {
        ballRef.current.style.transform = `translate(${s.bx - halfBall}px, ${s.by - halfBall}px)`;

        // Zona Blackout dinámica
        const vortexTop = 0.5 - s.blackoutSize / 2;
        const vortexBot = 0.5 + s.blackoutSize / 2;
        const normalizedY = s.by / s.ch;
        ballRef.current.style.opacity = (normalizedY >= vortexTop && normalizedY <= vortexBot) ? "0" : "1";
      }

      /* ── Flash de pantalla (vida gastada) ── */
      if (containerRef.current) {
        containerRef.current.style.outline = s.flashTimer > 0
          ? "2px solid rgba(239,68,68,0.6)"
          : "none";
      }

      /* ── Renderizar lives counter ── */
      if (livesRef.current) {
        livesRef.current.textContent = "♥".repeat(s.lives);
      }

      rafId = requestAnimationFrame(loop);
    };

    // Initial vortex render
    renderVortex(g.current);

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [phase, isActive, endGame]);

  /* ══════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════ */
  const isEnded = phase === PHASE.ENDED;

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black select-none overflow-hidden">
      {/* ── Contenedor del juego ── */}
      <div
        ref={containerRef}
        className="relative overflow-hidden"
        style={{
          width: "100%",
          height: "100%",
          maxWidth: `${GAME_W}px`,
          maxHeight: `${GAME_H}px`,
          touchAction: "none",
          cursor: "none",
          background: "radial-gradient(ellipse at center, #0f172a 0%, #020617 40%, #000 100%)",
        }}
      >
        {/* ── Bordes láser (paredes neón magenta) ── */}
        <div className="absolute inset-y-0 left-0 w-0.5"
             style={{ background: "linear-gradient(180deg, #d946ef 0%, #a855f7 50%, #d946ef 100%)", boxShadow: "0 0 8px rgba(217,70,239,0.6), 0 0 20px rgba(217,70,239,0.3)" }} />
        <div className="absolute inset-y-0 right-0 w-0.5"
             style={{ background: "linear-gradient(180deg, #d946ef 0%, #a855f7 50%, #d946ef 100%)", boxShadow: "0 0 8px rgba(217,70,239,0.6), 0 0 20px rgba(217,70,239,0.3)" }} />
        <div className="absolute inset-x-0 top-0 h-0.5"
             style={{ background: "linear-gradient(90deg, #d946ef 0%, #a855f7 50%, #d946ef 100%)", boxShadow: "0 0 8px rgba(217,70,239,0.6), 0 0 20px rgba(217,70,239,0.3)" }} />

        {/* ── Zona Vórtice (dinámica) ── */}
        <div
          ref={vortexRef}
          className="absolute inset-x-0 pointer-events-none"
          style={{
            top: `${(0.5 - INITIAL_BLACKOUT / 2) * 100}%`,
            height: `${INITIAL_BLACKOUT * 100}%`,
          }}
        >
          <div className="absolute inset-0 bg-gray-900/30"
               style={{
                 backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 6px, rgba(217,70,239,0.04) 6px, rgba(217,70,239,0.04) 7px)",
               }} />
          <div className="absolute inset-x-0 top-0 h-px animate-pulse"
               style={{ background: "linear-gradient(90deg, transparent 0%, #d946ef 30%, #22d3ee 50%, #d946ef 70%, transparent 100%)", opacity: 0.5 }} />
          <div className="absolute inset-x-0 bottom-0 h-px animate-pulse"
               style={{ background: "linear-gradient(90deg, transparent 0%, #d946ef 30%, #22d3ee 50%, #d946ef 70%, transparent 100%)", opacity: 0.5 }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-mono uppercase tracking-[0.4em] text-fuchsia-500/10 select-none">
              vortex
            </span>
          </div>
        </div>

        {/* ── Capa de cajas (power-ups Arkanoid) ── */}
        <div ref={boxLayerRef} className="absolute inset-0 pointer-events-none z-5" />

        {/* ── HUD: Puntuación + Vidas (arriba) ── */}
        <div className="absolute top-3 right-3 pointer-events-none z-10 flex items-center gap-2">
          {/* Vidas */}
          <span
            ref={livesRef}
            className="font-mono text-sm text-emerald-400 tabular-nums"
            style={{ textShadow: "0 0 8px rgba(52,211,153,0.6)" }}
          />
          {/* Score */}
          <span
            className="font-mono text-lg font-bold text-cyan-400 tabular-nums"
            style={{
              fontFeatureSettings: "'tnum'",
              textShadow: "0 0 10px rgba(34,211,238,0.6), 0 0 30px rgba(34,211,238,0.25)",
            }}
          >
            {score}
          </span>
        </div>

        {/* ── Bola (neón cian) ── */}
        <div
          ref={ballRef}
          className="absolute top-0 left-0 rounded-full"
          style={{
            width: BALL_SIZE,
            height: BALL_SIZE,
            background: "radial-gradient(circle at 35% 35%, #67e8f9, #22d3ee 50%, #06b6d4 100%)",
            boxShadow: "0 0 8px rgba(34,211,238,0.9), 0 0 20px rgba(34,211,238,0.5), 0 0 40px rgba(34,211,238,0.2)",
            willChange: "transform, opacity",
            transition: "opacity 0.08s linear",
          }}
        />

        {/* ── Pala (neón magenta, expansión dinámica) ── */}
        <div
          ref={paddleRef}
          className="absolute left-0 rounded-sm"
          style={{
            width: PADDLE_W,
            height: PADDLE_H,
            bottom: PADDLE_BOTTOM,
            background: "linear-gradient(90deg, #a855f7, #d946ef 50%, #a855f7)",
            boxShadow: "0 0 10px rgba(217,70,239,0.7), 0 0 25px rgba(217,70,239,0.3), 0 2px 8px rgba(0,0,0,0.5)",
            willChange: "transform, width",
            transition: "width 0.25s ease",
          }}
        />

        {/* ── Línea de muerte ── */}
        <div className="absolute inset-x-0 bottom-0 h-px"
             style={{ background: "linear-gradient(90deg, transparent, #ef4444 50%, transparent)", opacity: 0.35 }} />
      </div>

      {/* ── Overlay de Game Over (resultado) ── */}
      {isEnded && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center z-20"
          style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.95) 100%)" }}
        >
          <span
            className="font-mono font-black tabular-nums text-transparent bg-clip-text"
            style={{
              fontSize: "clamp(4rem, 12vw, 7rem)",
              fontFeatureSettings: "'tnum'",
              backgroundImage: "linear-gradient(180deg, #22d3ee 0%, #a855f7 100%)",
              filter: "drop-shadow(0 0 20px rgba(34,211,238,0.5)) drop-shadow(0 0 40px rgba(168,85,247,0.3))",
            }}
          >
            {score}
          </span>
          <span
            className="text-sm font-mono uppercase tracking-widest text-fuchsia-400/70 mt-1"
            style={{ textShadow: "0 0 12px rgba(217,70,239,0.4)" }}
          >
            {t("ghostpong.subtitle")}
          </span>
        </div>
      )}

      {/* ── GAME OVER panel ── */}
      {isEnded && showGameOver && (
        <GameOverPanel
          title="Game Over"
          score={score}
          subtitle={t("ghostpong.subtitle")}
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

export default GhostPongMVP;
