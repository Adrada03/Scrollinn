/**
 * CrossroadDartGame.jsx — "Crossroad Dart" (Static Physics Prototype)
 *
 * Tap-to-dash arcade: cross 4 lanes of traffic without getting hit.
 * Static screen, instant teleport on success, colored-rectangle visuals.
 *
 * Flow:  IDLE → PLAYING (waiting / dashing / cooldown) → ENDED
 *
 * Motor: single requestAnimationFrame, deltaTime, AABB collisions,
 * per-lane random speed multipliers, progressive difficulty.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ═══════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════ */

const MAX_GAME_WIDTH = 450;
const NUM_LANES      = 4;

// Sizes (proportional to gameW)
const PLAYER_RATIO = 0.065;
const CAR_H_RATIO  = 0.09;
const SAFE_ZONE_R  = 0.20;
const LANE_GAP_R   = 0.35;

// Physics
const DASH_SPEED = 700;

/* ═══════════════════════════════════════════════════
   DIFFICULTY CURVE  — the 3 levers
   
   Score  0-9 : chill, learn mechanics
   Score 10-15: sweat, tight gaps
   Score 15-20: hard, fast + dense
   Score  25+ : bullet hell, pixel-perfect
   ═══════════════════════════════════════════════════ */

/** Difficulty tier — steps every 5 points, caps at tier 5 (score 25+). */
function tier(score) { return Math.min(5, Math.floor(score / 5)); }

// 1) SPEED — stepped per tier
//   tier:  0     1     2     3     4     5
//   spd:   55    72    90   112   138   165
const SPD_TIERS = [55, 72, 90, 112, 138, 165];
const SPD_CAP   = 320;  // for lane-mult ceiling

// Lane speed mult widens with tier ("scissor" effect)
function laneMultRange(score) {
  const t  = tier(score);
  const lo = Math.max(0.45, 0.65 - t * 0.06);
  const hi = Math.min(1.75, 1.35 + t * 0.09);
  return [lo, hi];
}

// 2) DISTANCE-BASED GAP — stepped per tier
//   tier:  0     1     2     3     4     5
//   gap:   200   178   156   134   112    90
const GAP_TIERS    = [200, 178, 156, 134, 112, 90];
const GAP_MIN_MULT = 1.5;
const GAP_SPREAD   = 0.30;

// 3) CAR WIDTH — wider cars at higher tiers
function carWidthRange(score) {
  const t = tier(score);
  const wMin = Math.min(0.22, 0.08 + t * 0.015);
  const wMax = Math.min(0.44, 0.24 + t * 0.030);
  return [wMin, wMax];
}

// Cooldown between rounds (semaphore sequence)
const COOLDOWN_MS  = 2000;
const GO_FADE_MS   = 500;
const RUSH_MS      = 1500;     // first 2000ms cars rush in at high speed
const RUSH_MULT    = 3.5;      // speed multiplier during rush phase

// Camera scroll on scoring
const SCROLL_MS    = 500;

// Crash / explosion animation
const CRASH_MS     = 1200;
const CRASH_FRAGS  = 8;

/** Smooth ease-in-out for scroll animation */
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Colors
const BG_COLOR   = "#0b132b";
const BG_COLOR2  = "#111d3a";
const LANE_BG    = "#0e1a34";
const LANE_EDGE  = "#162040";
const LANE_DASH  = "rgba(255,255,255,0.15)";
const FINISH_CLR = "#22c55e";
const START_CLR  = "#3b82f6";
const PLAYER_CLR = "#22d3ee";
const PLAYER_CD  = "#334155";

const CAR_COLORS = [
  "#ec4899", "#f97316", "#22d3ee", "#a855f7",
  "#f43f5e", "#facc15", "#34d399", "#fb923c",
];

/* ═══════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════ */

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd  = (lo, hi) => lo + Math.random() * (hi - lo);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Generate a random car width for the current score */
function rndCarW(gameW, score) {
  const [lo, hi] = carWidthRange(score);
  return Math.round(gameW * rnd(lo, hi));
}

function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** Per-lane speed multipliers — wider spread at higher scores */
function laneSpeedMults(score) {
  const [lo, hi] = laneMultRange(score);
  const m = new Float64Array(NUM_LANES);
  for (let i = 0; i < NUM_LANES; i++) m[i] = rnd(lo, hi);
  return m;
}

/** Difficulty helpers (pure functions of score, stepped by tier) */
function getSpeed(score) { return SPD_TIERS[tier(score)]; }

/** Mean gap for a given score (px). */
function getMeanGap(score, playerSz) {
  return Math.max(playerSz * GAP_MIN_MULT, GAP_TIERS[tier(score)]);
}

/** Roll per-lane gaps: each lane gets the mean ± GAP_SPREAD, floored at min. */
function rollLaneGaps(score, playerSz) {
  const mean = getMeanGap(score, playerSz);
  const floor = playerSz * GAP_MIN_MULT;
  const gaps = new Float64Array(NUM_LANES);
  for (let i = 0; i < NUM_LANES; i++) {
    gaps[i] = Math.max(floor, mean * rnd(1 - GAP_SPREAD, 1 + GAP_SPREAD));
  }
  return gaps;
}

/* ═══════════════════════════════════════════════════
   LAYOUT  (pure function of canvas pixel size)
   ═══════════════════════════════════════════════════ */

function computeLayout(cw, ch) {
  const gameW   = Math.min(cw, MAX_GAME_WIDTH);
  const offsetX = (cw - gameW) / 2;

  const playerSz = Math.round(gameW * PLAYER_RATIO);
  const carH     = Math.round(gameW * CAR_H_RATIO);
  const laneGap  = Math.round(carH * LANE_GAP_R);

  const blockH = NUM_LANES * carH + (NUM_LANES - 1) * laneGap;
  const safeH  = Math.round(blockH * SAFE_ZONE_R);
  const totalH = safeH + blockH + safeH;
  const topY   = Math.round((ch - totalH) / 2);

  // Finish zone (top safe zone)
  const finishTop = topY;
  const finishBot = finishTop + safeH;

  // Lanes  (index 0 = bottom, index 3 = top)
  const lanesTop = finishBot;
  const lanes = [];
  for (let i = 0; i < NUM_LANES; i++) {
    const fromTop = NUM_LANES - 1 - i;
    const y = lanesTop + fromTop * (carH + laneGap);
    lanes.push({ y, dir: i % 2 === 0 ? 1 : -1 });
  }

  // Start zone (bottom safe zone)
  const startTop = lanesTop + blockH;
  const startBot = startTop + safeH;

  const pStartX = Math.round(gameW / 2 - playerSz / 2);
  const pStartY = Math.round(startTop + (safeH - playerSz) / 2);
  const finishY = Math.round(finishTop + safeH * 0.45);

  return {
    gameW, offsetX, playerSz, carH, laneGap, blockH,
    finishTop, finishBot, startTop, startBot, safeH,
    lanes, pStartX, pStartY, finishY, cw, ch,
  };
}

/* ═══════════════════════════════════════════════════
   SEMAPHORE — draws a 3-light traffic light on canvas
   ═══════════════════════════════════════════════════ */
const SEM_OFF = "#0a0a18";
function drawSemaphore(ctx, cx, cy, cdTimeLeft, goTimer, alpha) {
  const r     = 13;
  const gap   = 12;
  const totalW = r * 6 + gap * 2;
  const baseX = cx - totalW / 2 + r;
  const positions = [baseX, baseX + r * 2 + gap, baseX + r * 4 + gap * 2];

  // Background pill — dark cyberpunk housing
  const pillH = r * 2 + 16;
  const pillW = totalW + 16;
  ctx.save();
  ctx.fillStyle = "rgba(5,5,16,0.92)";
  ctx.strokeStyle = "rgba(34,211,238,0.12)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Determine which light is on
  let red = false, yellow = false, green = false;
  if (cdTimeLeft > 0) {
    red    = cdTimeLeft > 1000;
    yellow = cdTimeLeft <= 1000;
  } else {
    green = true;
  }

  const lights = [
    { on: red,    color: "#ef4444", offColor: "#1a0808" },
    { on: yellow, color: "#f59e0b", offColor: "#1a1408" },
    { on: green,  color: "#22c55e", offColor: "#081a10" },
  ];

  for (let i = 0; i < 3; i++) {
    const lx = positions[i];
    const l  = lights[i];
    // LED socket ring
    ctx.beginPath();
    ctx.arc(lx, cy, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.globalAlpha = alpha;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(lx, cy, r, 0, Math.PI * 2);
    if (l.on) {
      ctx.save();
      ctx.shadowColor = l.color;
      ctx.shadowBlur  = 35;
      ctx.fillStyle   = l.color;
      ctx.globalAlpha = alpha;
      ctx.fill();
      // Double-pass for intense halo
      ctx.shadowBlur  = 60;
      ctx.globalAlpha = alpha * 0.4;
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle  = l.offColor;
      ctx.globalAlpha = alpha * 0.6;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // "GO!" text under green — massive neon
  if (green) {
    ctx.save();
    ctx.globalAlpha  = alpha;
    ctx.fillStyle    = "#22c55e";
    ctx.shadowColor  = "#22c55e";
    ctx.shadowBlur   = 30;
    ctx.font         = "bold 26px 'Courier New', monospace";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("¡GO!", cx, cy + r + 24);
    ctx.shadowBlur   = 60;
    ctx.globalAlpha  = alpha * 0.5;
    ctx.fillText("¡GO!", cx, cy + r + 24);
    ctx.shadowBlur   = 0;
    ctx.shadowColor  = "transparent";
    ctx.globalAlpha  = 1;
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }
}

/** Draw one world block (finish zone + lanes + start zone) shifted by yOff px. */
function drawBlock(ctx, L, yOff) {
  const { offsetX, gameW, finishTop, finishBot, startTop, safeH, carH, lanes } = L;
  const ft = finishTop + yOff;
  const fb = finishBot + yOff;
  const st = startTop + yOff;

  // ── Finish zone (green neon glow) ──
  // Floor illumination
  ctx.fillStyle = "rgba(74,222,128,0.08)";
  ctx.fillRect(offsetX, ft, gameW, safeH);

  ctx.save();
  ctx.shadowColor = "#22c55e";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "rgba(34,197,94,0.09)";
  ctx.fillRect(offsetX, ft, gameW, safeH);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.restore();

  // Finish scanlines
  ctx.fillStyle = "rgba(34,197,94,0.03)";
  for (let sy = ft; sy < ft + safeH; sy += 4) {
    ctx.fillRect(offsetX, sy, gameW, 1);
  }

  // Finish border — neon line
  ctx.save();
  ctx.strokeStyle = "#22c55e";
  ctx.shadowColor = "#22c55e";
  ctx.shadowBlur = 14;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 6]);
  ctx.beginPath();
  ctx.moveTo(offsetX, fb);
  ctx.lineTo(offsetX + gameW, fb);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.restore();

  // "META" label — neon
  ctx.save();
  ctx.fillStyle = "rgba(34,197,94,0.4)";
  ctx.shadowColor = "#22c55e";
  ctx.shadowBlur = 10;
  ctx.font = "bold 12px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("\u25B8 META \u25C2", offsetX + gameW / 2, ft + safeH / 2 + 4);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.restore();

  // ── Start zone (blue/cyan neon glow) ──
  // Floor illumination
  ctx.fillStyle = "rgba(34,211,238,0.08)";
  ctx.fillRect(offsetX, st, gameW, safeH);

  ctx.save();
  ctx.shadowColor = "#3b82f6";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "rgba(59,130,246,0.08)";
  ctx.fillRect(offsetX, st, gameW, safeH);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.restore();

  // Start scanlines
  ctx.fillStyle = "rgba(59,130,246,0.03)";
  for (let sy = st; sy < st + safeH; sy += 4) {
    ctx.fillRect(offsetX, sy, gameW, 1);
  }

  // Start border — neon line
  ctx.save();
  ctx.strokeStyle = "#3b82f6";
  ctx.shadowColor = "#3b82f6";
  ctx.shadowBlur = 14;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 6]);
  ctx.beginPath();
  ctx.moveTo(offsetX, st);
  ctx.lineTo(offsetX + gameW, st);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.restore();

  // "SALIDA" label — neon
  ctx.save();
  ctx.fillStyle = "rgba(59,130,246,0.35)";
  ctx.shadowColor = "#3b82f6";
  ctx.shadowBlur = 10;
  ctx.font = "bold 12px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("\u25B8 SALIDA \u25C2", offsetX + gameW / 2, st + safeH / 2 + 4);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.restore();

  // ── Lanes (dark asphalt strips with neon accents) ──
  for (let i = 0; i < NUM_LANES; i++) {
    const lnY = lanes[i].y + yOff;

    // Lane background — slightly brighter asphalt strip
    ctx.fillStyle = LANE_BG;
    ctx.fillRect(offsetX, lnY, gameW, carH);
    // Subtle brightness lift so lanes stand out from bg
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fillRect(offsetX, lnY, gameW, carH);

    // Lane edge lines — faint cyan
    ctx.strokeStyle = "rgba(100,200,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(offsetX, lnY);
    ctx.lineTo(offsetX + gameW, lnY);
    ctx.moveTo(offsetX, lnY + carH);
    ctx.lineTo(offsetX + gameW, lnY + carH);
    ctx.stroke();

    // Center dashed line — glowing
    ctx.save();
    ctx.strokeStyle = LANE_DASH;
    ctx.shadowColor = "rgba(34,211,238,0.35)";
    ctx.shadowBlur = 6;
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(offsetX, lnY + carH / 2);
    ctx.lineTo(offsetX + gameW, lnY + carH / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.restore();

    // Direction arrows — very subtle repeating
    ctx.fillStyle = "rgba(34,211,238,0.05)";
    ctx.font = "13px monospace";
    ctx.textAlign = "center";
    const arrow = lanes[i].dir === 1 ? "\u27E9" : "\u27E8";
    for (let ax = offsetX + 30; ax < offsetX + gameW; ax += 55) {
      ctx.fillText(arrow, ax, lnY + carH / 2 + 5);
    }
  }
}

/* ═══════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════ */

const CrossroadDartGame = ({ isActive, onNextGame, onReplay, userId, pinchGuardRef }) => {
  const { t }     = useLanguage();
  const canvasRef  = useRef(null);
  const rafRef     = useRef(null);

  /* ── React state (triggers renders for UI) ── */
  const [phase, setPhase]                       = useState("idle");
  const [displayScore, setDisplayScore]         = useState(0);
  const [ranking, setRanking]                   = useState([]);
  const [scoreMessage, setScoreMessage]         = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  /* ── Mutable game state (refs, zero re-renders) ── */
  const phaseRef   = useRef("idle");
  const subRef     = useRef("waiting");   // waiting | dashing | scrolling | cooldown
  const scoreRef   = useRef(0);
  const lastTRef   = useRef(null);
  const playerRef  = useRef({ x: 0, y: 0 });
  const carsRef    = useRef([]);
  const lGapsRef   = useRef(rollLaneGaps(0, 30)); // re-rolled each round
  const lSpeedRef  = useRef(laneSpeedMults(0));
  const layoutRef    = useRef(null);
  const cdTimerRef   = useRef(0);
  const goTimerRef   = useRef(0);         // GO! fade countdown
  const scrollTRef   = useRef(0);
  const nextCarsRef  = useRef([]);
  const crashTimeRef = useRef(null);
  const particlesRef = useRef([]);

  /* ══════════════════════════════
     START / RESET
     ══════════════════════════════ */
  const startGame = useCallback(() => {
    scoreRef.current    = 0;
    subRef.current      = "cooldown";
    cdTimerRef.current  = COOLDOWN_MS;
    goTimerRef.current  = 0;
    scrollTRef.current  = 0;
    nextCarsRef.current = [];
    crashTimeRef.current = null;
    particlesRef.current = [];
    lSpeedRef.current   = laneSpeedMults(0);
    lGapsRef.current   = rollLaneGaps(0, 30);
    lastTRef.current   = null;
    scoreSubmitted.current = false;

    setDisplayScore(0);
    setRanking([]);
    setScoreMessage("");

    const canvas = canvasRef.current;
    if (canvas) {
      const r = canvas.getBoundingClientRect();
      layoutRef.current = computeLayout(r.width, r.height);
    }
    const L = layoutRef.current;
    if (L) {
      playerRef.current = { x: L.pStartX, y: L.pStartY };
      lGapsRef.current  = rollLaneGaps(0, L.playerSz);
      carsRef.current   = [];   // empty lanes — edge-spawner fills during cooldown
    } else {
      carsRef.current = [];
    }

    phaseRef.current = "playing";
    setPhase("playing");
  }, []);

  /* ── Auto-start when slide becomes active ── */
  useEffect(() => {
    if (isActive && phase === "idle") startGame();
  }, [isActive, startGame, phase]);

  /* ── Pointer input ── */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const down = (e) => {
      e.preventDefault();
      if (pinchGuardRef?.current) return;              // LEY 5
      if (phaseRef.current === "playing" && subRef.current === "waiting") {
        subRef.current = "dashing";
      }
    };
    cv.addEventListener("pointerdown", down);
    return () => cv.removeEventListener("pointerdown", down);
  }, []);

  /* ══════════════════════════════
     GAME LOOP
     ══════════════════════════════ */
  useEffect(() => {
    if (phase !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const resize = () => {
      const dpr  = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width  = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layoutRef.current = computeLayout(rect.width, rect.height);
      playerRef.current.x = layoutRef.current.pStartX;
      if (subRef.current !== "dashing") {
        playerRef.current.y = layoutRef.current.pStartY;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const tick = (ts) => {
      if (phaseRef.current !== "playing") return;

      if (lastTRef.current === null) lastTRef.current = ts;
      const dt = Math.min((ts - lastTRef.current) / 1000, 0.05);
      lastTRef.current = ts;

      const L = layoutRef.current;
      if (!L) { rafRef.current = requestAnimationFrame(tick); return; }

      const {
        gameW, offsetX, playerSz, carH, blockH,
        finishTop, finishBot, startTop, safeH,
        lanes, pStartX, pStartY, finishY, cw, ch,
      } = L;

      const sub   = subRef.current;
      const score = scoreRef.current;

      // ── Difficulty scaling ──
      const baseSpd = getSpeed(score);
      // During first RUSH_MS of cooldown, cars move much faster ("placing" anim)
      const inRush  = sub === "cooldown" && cdTimerRef.current > (COOLDOWN_MS - RUSH_MS);
      const spd     = inRush ? baseSpd * RUSH_MULT : baseSpd;
      const gaps    = lGapsRef.current;

      /* ── COOLDOWN timer + GO fade ── */
      if (sub === "cooldown") {
        cdTimerRef.current -= dt * 1000;
        if (cdTimerRef.current <= 0) {
          cdTimerRef.current = 0;
          goTimerRef.current = GO_FADE_MS;
          subRef.current = "waiting";
        }
      }
      if (sub === "waiting" && goTimerRef.current > 0) {
        goTimerRef.current -= dt * 1000;
        if (goTimerRef.current < 0) goTimerRef.current = 0;
      }

      /* ── SCROLLING camera ── */
      if (sub === "scrolling") {
        scrollTRef.current += dt * 1000;
        if (scrollTRef.current >= SCROLL_MS) {
          scrollTRef.current  = 0;
          playerRef.current   = { x: pStartX, y: pStartY };
          carsRef.current     = [];           // empty — edge-spawner fills
          nextCarsRef.current = [];
          subRef.current      = "cooldown";
          cdTimerRef.current  = COOLDOWN_MS;
          goTimerRef.current  = 0;
        }
      }

      /* ── CRASHING timer → delayed game over ── */
      if (sub === "crashing") {
        const elapsed = ts - crashTimeRef.current;
        if (elapsed >= CRASH_MS) {
          phaseRef.current = "ended";
          setDisplayScore(scoreRef.current);
          setPhase("ended");
          return;
        }
      }

      /* ── SPAWN + MOVE (frozen during scroll, alive during crash) ── */
      const cars = carsRef.current;
      const sm   = lSpeedRef.current;

      if (sub !== "scrolling") {
        for (let i = 0; i < NUM_LANES; i++) {
          const dir    = lanes[i].dir;
          const lGap   = gaps[i];

          let nearest = Infinity;
          for (let j = 0; j < cars.length; j++) {
            if (cars[j].lane !== i) continue;
            const c = cars[j];
            const dist = dir === 1 ? c.x : gameW - (c.x + c.w);
            if (dist < nearest) nearest = dist;
          }

          if (nearest >= lGap) {
            const cW = rndCarW(gameW, score);
            const spawnX = dir === 1 ? -cW : gameW;
            cars.push({ x: spawnX, w: cW, lane: i, color: pick(CAR_COLORS), dir });
            // Re-roll this lane's gap so spacing varies car-to-car
            const mean  = getMeanGap(score, playerSz);
            const floor = playerSz * GAP_MIN_MULT;
            gaps[i] = Math.max(floor, mean * rnd(1 - GAP_SPREAD, 1 + GAP_SPREAD));
          }
        }

        for (let i = cars.length - 1; i >= 0; i--) {
          const car = cars[i];
          car.x += car.dir * spd * sm[car.lane] * dt;
          if ((car.dir === 1 && car.x > gameW + 60) ||
              (car.dir === -1 && car.x + car.w < -60)) {
            cars.splice(i, 1);
          }
        }
      }

      /* ── DASHING ── */
      if (sub === "dashing") {
        playerRef.current.y -= DASH_SPEED * dt;

        const px = playerRef.current.x;
        const py = playerRef.current.y;

        // AABB collision
        let hit = false;
        for (let i = 0; i < cars.length; i++) {
          const c  = cars[i];
          const ln = lanes[c.lane];
          if (aabb(px, py, playerSz, playerSz, c.x, ln.y, c.w, carH)) {
            hit = true;
            break;
          }
        }

        if (hit) {
          subRef.current = "crashing";
          crashTimeRef.current = ts;
          // Generate explosion fragments
          const frags = [];
          for (let fi = 0; fi < CRASH_FRAGS; fi++) {
            const angle = (Math.PI * 2 / CRASH_FRAGS) * fi + rnd(-0.3, 0.3);
            frags.push({
              angle,
              speed: rnd(60, 160),
              size: rnd(3, 7),
              color: pick(["#ef4444", "#f97316", "#22d3ee", "#facc15", "#ffffff"]),
              rot: rnd(0, Math.PI * 2),
              rotSpd: rnd(-8, 8),
            });
          }
          particlesRef.current = frags;
        }

        // Crossed finish? → start camera scroll
        if (py <= finishY) {
          scoreRef.current += 1;
          setDisplayScore(scoreRef.current);
          subRef.current      = "scrolling";
          scrollTRef.current  = 0;
          // Prepare next round difficulty (no pre-fill — lanes start empty)
          lGapsRef.current    = rollLaneGaps(scoreRef.current, playerSz);
          nextCarsRef.current = [];
          lSpeedRef.current   = laneSpeedMults(scoreRef.current);
        }
      }

      /* ═══════════════════════════════════════
         R E N D E R
         ═══════════════════════════════════════ */
      ctx.clearRect(0, 0, cw, ch);

      // Background — rich dark-blue gradient (city ambient light)
      const bgGrad = ctx.createLinearGradient(0, 0, 0, ch);
      bgGrad.addColorStop(0, BG_COLOR2);
      bgGrad.addColorStop(0.45, BG_COLOR);
      bgGrad.addColorStop(1, "#0d1630");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, cw, ch);

      // Holographic grid overlay (static)
      ctx.strokeStyle = "rgba(100,180,255,0.035)";
      ctx.lineWidth = 1;
      const gridSz = 40;
      ctx.beginPath();
      for (let gx = offsetX % gridSz; gx < cw; gx += gridSz) {
        ctx.moveTo(gx, 0); ctx.lineTo(gx, ch);
      }
      for (let gy = 0; gy < ch; gy += gridSz) {
        ctx.moveTo(0, gy); ctx.lineTo(cw, gy);
      }
      ctx.stroke();

      // ── Camera offset for scroll transition ──
      const scrollDist = blockH + safeH;
      let camY = 0;
      if (sub === "scrolling") {
        const p = clamp(scrollTRef.current / SCROLL_MS, 0, 1);
        camY = easeInOut(p) * scrollDist;
      }

      ctx.save();
      ctx.translate(0, camY);

      // Ghost block (new road scrolling in from above)
      if (camY > 0) {
        drawBlock(ctx, L, -scrollDist);
      }

      // Current block (zones + lanes)
      drawBlock(ctx, L, 0);

      // ── Cars (Cyberpunk hover-capsules, clipped to game width) ──
      ctx.save();
      ctx.beginPath();
      ctx.rect(offsetX, 0, gameW, ch);
      ctx.clip();
      for (let i = 0; i < cars.length; i++) {
        const c  = cars[i];
        const ln = lanes[c.lane];
        const carX = offsetX + c.x;
        const carY = ln.y + 3;
        const cW   = c.w;
        const cH   = carH - 6;
        const rad  = Math.min(cH / 2, 8);

        // Capsule body with neon glow
        ctx.save();
        ctx.shadowColor = c.color;
        ctx.shadowBlur = 18;
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.roundRect(carX, carY, cW, cH, rad);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        ctx.restore();

        // Inner highlight strip (windshield)
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.beginPath();
        ctx.roundRect(carX + 4, carY + 2, cW - 8, cH * 0.28, Math.max(1, rad / 2));
        ctx.fill();

        // Darker lower body panel
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.roundRect(carX + 2, carY + cH * 0.58, cW - 4, cH * 0.32, Math.max(1, rad / 2));
        ctx.fill();

        // Propulsor thruster (rear based on direction)
        ctx.save();
        const thrustR = cH * 0.25;
        let thrustX, thrustClr;
        if (c.dir === 1) {
          thrustX = carX + 2;
          thrustClr = "#f97316";
        } else {
          thrustX = carX + cW - 2;
          thrustClr = "#22d3ee";
        }
        ctx.shadowColor = thrustClr;
        ctx.shadowBlur = 16;
        ctx.fillStyle = thrustClr;
        ctx.beginPath();
        ctx.ellipse(thrustX, carY + cH / 2, thrustR * 0.6, thrustR, 0, 0, Math.PI * 2);
        ctx.fill();
        // White-hot core
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.beginPath();
        ctx.ellipse(thrustX, carY + cH / 2, thrustR * 0.2, thrustR * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        ctx.restore();
      }
      ctx.restore();

      // ── Player (Energy Dart) / Explosion ──
      const px   = offsetX + playerRef.current.x;
      const py   = playerRef.current.y;
      const isCD = sub === "cooldown";
      const isSC = sub === "scrolling";
      const isDashing = sub === "dashing";
      const isCrash = sub === "crashing";
      const dartCx = px + playerSz / 2;
      const dartCy = py + playerSz / 2;
      const dartR  = playerSz / 2;

      if (isCrash) {
        // ── EXPLOSION ANIMATION ──
        const crashP = clamp((ts - crashTimeRef.current) / CRASH_MS, 0, 1);
        const invP   = 1 - crashP;

        // Shockwave ring 1 (red/orange)
        ctx.save();
        const ring1R = playerSz * 0.5 + crashP * playerSz * 3;
        ctx.globalAlpha = invP * 0.9;
        ctx.strokeStyle = "#ef4444";
        ctx.shadowColor = "#ef4444";
        ctx.shadowBlur  = 30 * invP;
        ctx.lineWidth   = Math.max(1, 4 * invP);
        ctx.beginPath();
        ctx.arc(dartCx, dartCy, ring1R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        ctx.globalAlpha = 1;
        ctx.restore();

        // Shockwave ring 2 (cyan, slightly delayed)
        if (crashP > 0.08) {
          ctx.save();
          const p2 = clamp((crashP - 0.08) / 0.92, 0, 1);
          const ring2R = playerSz * 0.3 + p2 * playerSz * 2.2;
          ctx.globalAlpha = (1 - p2) * 0.5;
          ctx.strokeStyle = "#22d3ee";
          ctx.shadowColor = "#22d3ee";
          ctx.shadowBlur  = 20 * (1 - p2);
          ctx.lineWidth   = Math.max(1, 2.5 * (1 - p2));
          ctx.beginPath();
          ctx.arc(dartCx, dartCy, ring2R, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.shadowColor = "transparent";
          ctx.globalAlpha = 1;
          ctx.restore();
        }

        // Central flash (white-hot core that fades fast)
        if (crashP < 0.35) {
          ctx.save();
          const flashP = crashP / 0.35;
          ctx.globalAlpha = (1 - flashP) * 0.8;
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = "#ffffff";
          ctx.shadowBlur = 40 * (1 - flashP);
          ctx.beginPath();
          ctx.arc(dartCx, dartCy, playerSz * (0.6 + flashP * 0.4), 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.shadowColor = "transparent";
          ctx.globalAlpha = 1;
          ctx.restore();
        }

        // Flying fragments
        const frags = particlesRef.current;
        for (let fi = 0; fi < frags.length; fi++) {
          const f = frags[fi];
          const dist = f.speed * crashP;
          const fx = dartCx + Math.cos(f.angle) * dist;
          const fy = dartCy + Math.sin(f.angle) * dist;
          const fAlpha = invP * invP;  // quadratic fade
          const fSize = f.size * (1 - crashP * 0.6);

          ctx.save();
          ctx.globalAlpha = fAlpha;
          ctx.translate(fx, fy);
          ctx.rotate(f.rot + f.rotSpd * crashP);
          ctx.shadowColor = f.color;
          ctx.shadowBlur = 8 * fAlpha;
          ctx.fillStyle = f.color;
          // Diamond-shaped shard
          ctx.beginPath();
          ctx.moveTo(0, -fSize);
          ctx.lineTo(fSize * 0.5, 0);
          ctx.moveTo(0, fSize);
          ctx.lineTo(-fSize * 0.5, 0);
          ctx.closePath();
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.shadowColor = "transparent";
          ctx.globalAlpha = 1;
          ctx.restore();
        }

        // Screen red tint overlay (subtle, early)
        if (crashP < 0.5) {
          ctx.save();
          ctx.globalAlpha = (1 - crashP / 0.5) * 0.12;
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(offsetX, 0, gameW, ch);
          ctx.globalAlpha = 1;
          ctx.restore();
        }
      } else {
        // ── Normal player rendering ──

        // Trail when dashing
        if (isDashing) {
          const trailLen = playerSz * 2.5;
          const grad = ctx.createLinearGradient(dartCx, dartCy, dartCx, dartCy + trailLen);
          grad.addColorStop(0, "rgba(34,211,238,0.35)");
          grad.addColorStop(0.5, "rgba(34,211,238,0.1)");
          grad.addColorStop(1, "rgba(34,211,238,0)");
          ctx.fillStyle = grad;
          ctx.fillRect(px + 2, py + playerSz * 0.5, playerSz - 4, trailLen);
        }

        // Dart shape
        ctx.save();
        if (!isCD && !isSC) {
          ctx.shadowColor = "#22d3ee";
          ctx.shadowBlur = 28;
        }

        ctx.beginPath();
        ctx.moveTo(dartCx, py - dartR * 0.3);
        ctx.lineTo(dartCx + dartR, dartCy + dartR * 0.2);
        ctx.lineTo(dartCx + dartR * 0.4, dartCy + dartR * 0.6);
        ctx.lineTo(dartCx, py + playerSz + dartR * 0.1);
        ctx.lineTo(dartCx - dartR * 0.4, dartCy + dartR * 0.6);
        ctx.lineTo(dartCx - dartR, dartCy + dartR * 0.2);
        ctx.closePath();

        if (isCD || isSC) {
          ctx.fillStyle = "#334155";
          ctx.fill();
        } else {
          ctx.fillStyle = "#22d3ee";
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.beginPath();
          ctx.moveTo(dartCx, py + dartR * 0.15);
          ctx.lineTo(dartCx + dartR * 0.4, dartCy + dartR * 0.15);
          ctx.lineTo(dartCx, dartCy + dartR * 0.5);
          ctx.lineTo(dartCx - dartR * 0.4, dartCy + dartR * 0.15);
          ctx.closePath();
          ctx.fill();
        }

        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        ctx.restore();

        if (isCD) {
          ctx.fillStyle    = "rgba(148,163,184,0.6)";
          ctx.font         = `bold ${Math.max(8, playerSz * 0.4)}px monospace`;
          ctx.textAlign    = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("\u23F3", dartCx, dartCy);
          ctx.textBaseline = "alphabetic";
        }
      }

      ctx.restore(); // camera translate

      // Dim sides — deep black for cyberpunk contrast
      if (offsetX > 0) {
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(0, 0, offsetX, ch);
        ctx.fillRect(offsetX + gameW, 0, cw - offsetX - gameW, ch);
        // Neon edge lines
        ctx.strokeStyle = "rgba(34,211,238,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(offsetX, 0); ctx.lineTo(offsetX, ch);
        ctx.moveTo(offsetX + gameW, 0); ctx.lineTo(offsetX + gameW, ch);
        ctx.stroke();
      }

      // ── SEMAPHORE (drawn outside camera translate, screen-space) ──
      const semCx = offsetX + gameW / 2;
      const semCy = startTop - 24 + camY;    // just above start zone, follows camera

      if (sub === "cooldown") {
        drawSemaphore(ctx, semCx, semCy, cdTimerRef.current, 0, 1);
      } else if (sub === "waiting" && goTimerRef.current > 0) {
        const fadeAlpha = clamp(goTimerRef.current / GO_FADE_MS, 0, 1);
        drawSemaphore(ctx, semCx, semCy, 0, goTimerRef.current, fadeAlpha);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [phase]);

  /* ── Cleanup ── */
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  /* ══════════════════════════════
     SCORE SUBMISSION
     ══════════════════════════════ */
  const { submit, xpGained } = useSubmitScore(userId, GAME_IDS.CrossroadDartGame);

  useEffect(() => {
    if (phase === "ended" && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submit(displayScore)
        .then((r) => {
          setRanking(r?.data?.ranking || []);
          setScoreMessage(r?.message || "");
        })
        .catch(() => setScoreMessage("Error"))
        .finally(() => setIsRankingLoading(false));
    }
    if (phase === "idle") {
      scoreSubmitted.current = false;
      setRanking([]);
      setScoreMessage("");
    }
  }, [phase, displayScore, submit]);

  /* ══════════════════════════════
     JSX
     ══════════════════════════════ */
  const isEnded = phase === "ended";

  return (
    <div className="relative h-full w-full flex items-center justify-center overflow-hidden select-none" style={{ background: "#0b132b" }}>
      {/* Feed gradients — cyberpunk vignette */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/70 via-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/40 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/25 to-transparent pointer-events-none z-5" />

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full z-1"
      />

      {/* HUD */}
      <div className="relative w-full h-full z-2 pointer-events-none">
        {/* Live score */}
        {phase === "playing" && (
          <div className="absolute top-16 left-0 right-0 flex items-center justify-center">
            <span
              className="text-5xl font-black italic tabular-nums"
              style={{ fontFeatureSettings: "'tnum'", color: "#fff",
                       textShadow: "0 0 10px rgba(34,211,238,1), 0 0 30px rgba(34,211,238,0.6), 0 0 60px rgba(34,211,238,0.3), 0 2px 4px rgba(0,0,0,0.8)" }}
            >
              {displayScore}
            </span>
          </div>
        )}

        {/* Tap hint (first round only) */}
        {phase === "playing" && displayScore === 0 && (
          <div className="absolute bottom-32 left-0 right-0 flex items-center justify-center animate-pulse">
            <span className="text-base font-bold tracking-widest uppercase" style={{ color: "rgba(34,211,238,0.5)",
                       textShadow: "0 0 12px rgba(34,211,238,0.3)" }}>
              {t("crossroaddart.tap")}
            </span>
          </div>
        )}

        {/* Game Over */}
        {isEnded && (
          <>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="text-7xl sm:text-8xl font-black italic tabular-nums"
                style={{ fontFeatureSettings: "'tnum'", color: "#fff",
                         textShadow: "0 0 15px rgba(34,211,238,1), 0 0 40px rgba(34,211,238,0.7), 0 0 80px rgba(34,211,238,0.4), 0 0 120px rgba(34,211,238,0.2)" }}
              >
                {displayScore}
              </span>
              <span className="text-lg font-bold uppercase tracking-wider" style={{ color: "rgba(34,211,238,0.6)",
                       textShadow: "0 0 10px rgba(34,211,238,0.3)" }}>
                {displayScore === 1 ? t("crossroaddart.cross") : t("crossroaddart.crosses")}
              </span>
            </div>

            <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
              <GameOverPanel
                title="Game Over"
                score={displayScore}
                subtitle={t("crossroaddart.subtitle")}
                onReplay={onReplay}
                onNext={onNextGame}
                ranking={ranking}
                scoreMessage={scoreMessage}
                xpGained={xpGained}

                isLoading={isRankingLoading}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CrossroadDartGame;
