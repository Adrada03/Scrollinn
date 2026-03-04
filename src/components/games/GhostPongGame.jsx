/**
 * GhostPongGame.jsx — "Ghost Pong" v2.2
 *
 * Pong × Arkanoid cyberpunk con zona vórtice creciente, power-ups y vidas.
 * Estética neón cian (bola) + magenta (pala / paredes láser).
 *
 * Mecánicas v2.2:
 *  1. Aceleración progresiva +3% por rebote, sin cap bajo.
 *  2. Zona vórtice dinámica: empieza al 20%, crece +2% por rebote (max 65%).
 *  3. Spawning aleatorio de cajas: aparecen cada 1.5-4s, máx 3 en pantalla.
 *     Tipos: Gold ⭐ (+5 pts), Expand ↔️ (pala ancha), Life ❤️ (+1 vida).
 *     Cada caja tiene TTL 12-15s con parpadeo de aviso en los últimos 2s.
 *     Las cajas SOLO aparecen por encima de la zona vórtice (margen 40px).
 *  4. Sistema de vidas: si toca el fondo con vidas > 0, rebota y gasta 1 vida.
 *  5. Score y vidas se mutan directamente en el DOM (scoreDisplayRef, livesRef)
 *     para evitar desincronización con React re-renders.
 *
 * Rendimiento (60 FPS):
 *  - Posiciones/colisiones en useRef, mutaciones directas de style.
 *  - Bucle de físicas en requestAnimationFrame con delta-time.
 *  - useState solo para fase y UI de game over.
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
const BOX_TTL_MIN = 12;           // segundos vida mínima (antes 8)
const BOX_TTL_MAX = 15;           // segundos vida máxima (antes 10)
const BOX_BLINK_TIME = 2;         // parpadeo últimos 2s
const SPAWN_INTERVAL_MIN = 1.5;   // spawn mínimo (antes 3s → ahora 1.5s)
const SPAWN_INTERVAL_MAX = 4;     // spawn máximo (antes 8s → ahora 4s)
const BOX_SPAWN_MARGIN_X = 10;    // margen lateral para posicionar
const BOX_SPAWN_MARGIN_TOP = 10;  // margen desde techo
const BOX_VORTEX_SAFETY = 40;     // px de margen por encima del vórtice
const BOX_TYPES = { GOLD: 0, EXPAND: 1, LIFE: 2 };

// Delta-time cap
const MAX_DELTA = 0.05;

/* ═══════════════════ HELPERS ═══════════════════ */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/** Intervalo aleatorio hasta el próximo spawn (en segundos) */
function randomSpawnInterval() {
  return SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);
}

/** Genera un tipo de caja según probabilidad: Gold 70%, Expand 20%, Life 10% */
function randomBoxType() {
  const r = Math.random();
  if (r < 0.70) return BOX_TYPES.GOLD;
  if (r < 0.90) return BOX_TYPES.EXPAND;
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

/** Comprueba si dos rectángulos se solapan (con padding extra) */
function boxesOverlap(a, b, padding = 4) {
  return (
    a.x - padding < b.x + b.w + padding &&
    a.x + a.w + padding > b.x - padding &&
    a.y - padding < b.y + b.h + padding &&
    a.y + a.h + padding > b.y - padding
  );
}

/**
 * Crea una caja en posición aleatoria SOLO en la zona visible superior.
 * La Y máxima es el borde superior del vórtice menos un margen de seguridad.
 * Garantiza que no se solape con ninguna caja existente (máx 10 intentos).
 * Devuelve null si no encuentra hueco.
 */
function spawnBox(cw, ch, blackoutSize, existingBoxes) {
  const vortexTopPx = (0.5 - blackoutSize / 2) * ch;
  const maxY = Math.max(BOX_SPAWN_MARGIN_TOP, vortexTopPx - BOX_VORTEX_SAFETY - BOX_SIZE);
  const minY = BOX_SPAWN_MARGIN_TOP;
  const minX = BOX_SPAWN_MARGIN_X;
  const maxX = cw - BOX_SPAWN_MARGIN_X - BOX_SIZE;

  for (let attempt = 0; attempt < 10; attempt++) {
    const x = minX + Math.random() * Math.max(0, maxX - minX);
    const y = minY + Math.random() * Math.max(0, maxY - minY);
    const candidate = { x, y, w: BOX_SIZE, h: BOX_SIZE };

    const overlaps = existingBoxes.some(b => b.alive && boxesOverlap(candidate, b));
    if (!overlaps) {
      return {
        x,
        y,
        w: BOX_SIZE,
        h: BOX_SIZE,
        alive: true,
        type: randomBoxType(),
        ttl: BOX_TTL_MIN + Math.random() * (BOX_TTL_MAX - BOX_TTL_MIN),
        el: null,
      };
    }
  }
  return null; // no se encontró hueco, se reintentará en el próximo ciclo
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
const GhostPongGame = ({ isActive, onNextGame, onReplay, userId, pinchGuardRef }) => {
  const { t } = useLanguage();

  /* ── Estado de React (UI-only: fase y game over) ── */
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [showGameOver, setShowGameOver] = useState(false);

  /* ── Score/lives guardados para GameOverPanel (solo al terminar) ── */
  const [finalScore, setFinalScore] = useState(0);

  /* ── Submit de score ── */
  const gameId = GAME_IDS.GhostPongGame || "ghost-pong";
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
  const scoreBgRef = useRef(null);          // DOM ref para score fondo gigante

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
    expandTimer: 0,
    // Cajas (spawning dinámico)
    boxes: [],
    spawnTimer: 0,
    // Flash de vida (feedback visual)
    flashTimer: 0,
  });

  /* ══════════════════════════════════════════════════
     HELPER: actualizar marcador y vidas en DOM
  ══════════════════════════════════════════════════ */
  function syncScoreDom(score) {
    if (scoreBgRef.current) scoreBgRef.current.textContent = score;
  }

  function syncLivesDom(lives) {
    if (livesRef.current) livesRef.current.textContent = "❤️".repeat(lives);
  }

  /** Muestra texto flotante (+5 BONUS, etc.) que sube y desaparece */
  function showFloatingText(x, y, text) {
    const layer = boxLayerRef.current;
    if (!layer) return;
    const el = document.createElement("div");
    el.textContent = text;
    el.style.position = "absolute";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = "#fbbf24";
    el.style.fontFamily = "monospace";
    el.style.fontWeight = "900";
    el.style.fontSize = "18px";
    el.style.textShadow = "0 0 10px rgba(251,191,36,0.9), 0 0 25px rgba(245,158,11,0.5)";
    el.style.pointerEvents = "none";
    el.style.whiteSpace = "nowrap";
    el.style.zIndex = "20";
    el.style.transition = "transform 0.7s ease-out, opacity 0.7s ease-out";
    el.style.transform = "translateY(0)";
    el.style.opacity = "1";
    layer.appendChild(el);
    // Trigger animation next frame
    requestAnimationFrame(() => {
      el.style.transform = "translateY(-50px)";
      el.style.opacity = "0";
    });
    setTimeout(() => { el.remove(); }, 750);
  }

  /* ══════════════════════════════════════════════════
     INICIALIZAR / REINICIAR JUEGO
  ══════════════════════════════════════════════════ */
  const startGame = useCallback(() => {
    const s = g.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) { s.cw = rect.width; s.ch = rect.height; }

    // Pala centrada
    s.px = s.cw / 2;
    s.paddleW = PADDLE_W;

    // Bola centrada justo encima de la pala, ángulo aleatorio hacia arriba
    s.bx = s.cw / 2;
    s.by = s.ch - PADDLE_BOTTOM - PADDLE_H - BALL_SIZE;
    s.speed = INITIAL_SPEED;
    // Ángulo entre 30° y 150° (siempre sube, pero con componente lateral)
    const angle = (Math.PI / 6) + Math.random() * (Math.PI * 2 / 3);
    const dir = Math.random() < 0.5 ? 1 : -1;
    s.vx = Math.cos(angle) * INITIAL_SPEED * dir;
    s.vy = -Math.sin(angle) * INITIAL_SPEED;

    s.score = 0;
    s.lives = 0;
    s.blackoutSize = INITIAL_BLACKOUT;
    s.expandTimer = 0;
    s.flashTimer = 0;

    // Techo vacío: las cajas aparecerán con spawning aleatorio
    s.boxes = [];
    s.spawnTimer = randomSpawnInterval();

    setFinalScore(0);
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
    // Sincronizar DOM de score y vidas
    syncScoreDom(0);
    syncLivesDom(0);
  }, []);

  /* ══════════════════════════════════════════════════
     GAME OVER
  ══════════════════════════════════════════════════ */
  const endGame = useCallback((score) => {
    phaseRef.current = PHASE.ENDED;
    setPhase(PHASE.ENDED);
    setFinalScore(score);

    if (!scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);

      // Mínimo 2.5s mostrando el score antes del panel de ranking
      const minDelay = new Promise(r => setTimeout(r, 1000));

      Promise.all([
        submitScore(score).catch(() => null),
        minDelay,
      ]).then(([res]) => {
        if (res?.data?.ranking) setRanking(res.data.ranking);
        if (res?.message) setScoreMessage(res.message);
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

  /* ══════════════════════════════════════════════════
     GAME LOOP — requestAnimationFrame
  ══════════════════════════════════════════════════ */
  useEffect(() => {
    if (phase !== PHASE.PLAYING || !isActive) return;

    let rafId;
    let lastTime = 0;

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

      /* ── Spawning aleatorio de cajas (zona segura arriba del vórtice) ── */
      const layer = boxLayerRef.current;
      s.spawnTimer -= dt;
      if (s.spawnTimer <= 0 && layer) {
        const aliveCount = s.boxes.filter(b => b.alive).length;
        if (aliveCount < MAX_BOXES) {
          const newBox = spawnBox(s.cw, s.ch, s.blackoutSize, s.boxes);
          if (newBox) {
            createBoxEl(newBox, layer);
            s.boxes.push(newBox);
          }
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
          const blinkRate = box.ttl < 1 ? 8 : 4;
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

      // Limpiar cajas muertas del array
      s.boxes = s.boxes.filter(b => b.alive);

      /* ── Colisión con cajas ── */
      for (let i = 0; i < s.boxes.length; i++) {
        const box = s.boxes[i];
        if (!box.alive) continue;

        const closestX = clamp(s.bx, box.x, box.x + box.w);
        const closestY = clamp(s.by, box.y, box.y + box.h);
        const dx = s.bx - closestX;
        const dy = s.by - closestY;

        if (dx * dx + dy * dy <= halfBall * halfBall) {
          box.alive = false;

          if (box.el) {
            box.el.style.opacity = "0";
            box.el.style.transform = "scale(1.3)";
            const elRef = box.el;
            setTimeout(() => { elRef.remove(); }, 150);
            box.el = null;
          }

          // Bounce axis
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
            s.score += 5;
            showFloatingText(box.x, box.y - 10, t("ghostpong.bonus"));
          } else if (box.type === BOX_TYPES.EXPAND) {
            s.paddleW = PADDLE_W_EXPANDED;
            s.expandTimer = EXPAND_DURATION;
            if (paddleRef.current) paddleRef.current.style.width = `${PADDLE_W_EXPANDED}px`;
            s.score += 1;
          } else if (box.type === BOX_TYPES.LIFE) {
            s.lives += 1;
            syncLivesDom(s.lives);
            s.score += 1;
          }

          // Actualizar marcador directamente en DOM
          syncScoreDom(s.score);
          break;
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

        // +1 punto por rebote en pala
        s.score += 1;
        syncScoreDom(s.score);

        // Vórtice crece
        s.blackoutSize = Math.min(s.blackoutSize + BLACKOUT_GROW, MAX_BLACKOUT);
        renderVortex(s);
      }

      /* ── Borde inferior: vida o game over ── */
      if (s.by + halfBall >= s.ch) {
        if (s.lives > 0) {
          s.lives -= 1;
          syncLivesDom(s.lives);
          s.by = s.ch - halfBall - 1;
          s.vy = -Math.abs(s.vy);
          s.flashTimer = 0.35;
        } else {
          setFinalScore(s.score);
          endGame(s.score);
          return;
        }
      }

      /* ── Renderizar pala ── */
      if (paddleRef.current) {
        paddleRef.current.style.transform = `translateX(${s.px - pw / 2}px)`;
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
        <div className="absolute inset-y-0 left-0 w-1"
             style={{ background: "linear-gradient(180deg, #d946ef 0%, #a855f7 50%, #d946ef 100%)", boxShadow: "0 0 8px rgba(217,70,239,0.6), 0 0 20px rgba(217,70,239,0.3)" }} />
        <div className="absolute inset-y-0 right-0 w-1"
             style={{ background: "linear-gradient(180deg, #d946ef 0%, #a855f7 50%, #d946ef 100%)", boxShadow: "0 0 8px rgba(217,70,239,0.6), 0 0 20px rgba(217,70,239,0.3)" }} />
        <div className="absolute inset-x-0 top-0 h-1"
             style={{ background: "linear-gradient(90deg, #d946ef 0%, #a855f7 50%, #d946ef 100%)", boxShadow: "0 0 8px rgba(217,70,239,0.6), 0 0 20px rgba(217,70,239,0.3)" }} />

        {/* ── Score fondo gigante (ambient, más visible) ── */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <span
            ref={scoreBgRef}
            className="font-mono font-black tabular-nums text-cyan-400/25 select-none"
            style={{
              fontSize: "clamp(8rem, 30vw, 14rem)",
              fontFeatureSettings: "'tnum'",
              lineHeight: 1,
              textShadow: "0 0 30px rgba(34,211,238,0.15)",
            }}
          >
            0
          </span>
        </div>

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

        {/* ── Capa de cajas (power-ups) ── */}
        <div ref={boxLayerRef} className="absolute inset-0 pointer-events-none z-5" />

        {/* ── Vidas (corazones grandes, esquina superior derecha) ── */}
        <div className="absolute top-3 right-3 pointer-events-none z-10">
          <span
            ref={livesRef}
            className="text-3xl select-none"
            style={{ filter: "drop-shadow(0 0 6px rgba(239,68,68,0.7))" }}
          />
        </div>

        {/* ── Bola (neón cian) — centrada sobre la pala por defecto ── */}
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
            transform: `translate(${GAME_W / 2 - BALL_SIZE / 2}px, ${GAME_H - PADDLE_BOTTOM - PADDLE_H - BALL_SIZE - BALL_SIZE / 2}px)`,
          }}
        />

        {/* ── Pala (neón magenta, expansión dinámica) — centrada por defecto ── */}
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
            transform: `translateX(${GAME_W / 2 - PADDLE_W / 2}px)`,
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
            {finalScore}
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
          score={finalScore}
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

export default GhostPongGame;
