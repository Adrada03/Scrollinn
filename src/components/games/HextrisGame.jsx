/**
 * HextrisGame.jsx — Hextris (Canvas 2D)
 *
 * Faithful reimplementation based on the original Hextris source code.
 * Blocks fall toward a central hexagon. Rotate the hexagon (← → or
 * tap left/right) to align colors. 3+ connected same-color = score.
 *
 * Props:
 *   isActive   – starts the game
 *   onNextGame – callback for "next game"
 */

import { useEffect, useRef, useState, useCallback } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ═══════════════════ CONSTANTS (matching original) ═══════════════════ */
const COLORS = ["#e74c3c", "#f1c40f", "#3498db", "#2ecc71"];
const BG_COLOR      = "#2c3e50";          // darker bg so overlay text is readable
const BOUNDARY_GREY = "#4a6274";          // outer boundary (lighter than bg)
const CENTER_HEX    = "#1a252f";          // dark center hex
const SCORE_COLOR   = "rgb(236,240,241)"; // score text on center (light)
const SIDES    = 6;
const MAX_ROWS = 8;
const BASE_HEX_W    = 87;
const BASE_BLOCK_H  = 20;
const BASE_SCALE    = 1.4;
const START_DIST    = 340;
const SPEED_MOD     = 0.88;               // slightly faster than original 0.73
const CREATION_DT   = 60;
const ANG_V_CONST   = 4;
const COMBO_WINDOW  = 310;

/* ═══════════════════ MATH (original math.js) ═══════════════════ */
function rotPt(x, y, deg) {
  const r = (deg * Math.PI) / 180;
  return { x: Math.cos(r) * x - Math.sin(r) * y, y: Math.sin(r) * x + Math.cos(r) * y };
}
function ri(min, max) { return Math.floor(Math.random() * max + min); }

/* ═══════════════════ DRAWING (original view.js drawPolygon) ═══════════════════ */
function drawPolygon(ctx, x, y, sides, radius, theta, fill, lw, lc) {
  ctx.fillStyle = fill;
  ctx.lineWidth = lw || 0;
  ctx.strokeStyle = lc || "rgba(0,0,0,0)";
  ctx.beginPath();
  let c = rotPt(0, radius, theta);
  ctx.moveTo(c.x + x, c.y + y);
  for (let i = 0; i < sides; i++) {
    c = rotPt(c.x, c.y, 360 / sides);
    ctx.lineTo(c.x + x, c.y + y);
  }
  ctx.closePath();
  ctx.fill();
  if (lw) ctx.stroke();
}

/* ═══════════════════ GAME STATE ═══════════════════ */
function createGame(W, H) {
  const scale = ((H > W ? W : H) / 800) * BASE_SCALE;
  const hexW    = BASE_HEX_W   * scale;
  const blockH  = BASE_BLOCK_H * scale;
  const startD  = START_DIST   * scale;
  const hexR    = (hexW / 2) * Math.sqrt(3);

  return {
    scale, hexW, blockH, startDist: startD, hexR,
    cx: W / 2, cy: H / 2,
    hexAngle: 30, hexTarget: 30, hexAngV: 0, position: 0,
    blocks: Array.from({ length: SIDES }, () => []),
    falling: [],
    shakes: [], texts: [],
    gdx: 0, gdy: 0,
    score: 0, combo: 1, lastCombo: -9999, lastColorScored: "#000",
    ct: 0,
    wLastGen: 0, wNextGen: 2700, wDiff: 1, wCt: 0, wDt: 0,
    wPattern: "random",
    over: false, delay: 15, op: 0,
  };
}

/* ═══════════════════ BLOCK (original Block.js) ═══════════════════ */
function mkBlock(lane, color, speed, g) {
  return {
    lane, color,
    speed: speed * SPEED_MOD,
    dist: g.startDist,
    angle:       90 - (30 + 60 * lane),
    targetAngle: 90 - (30 + 60 * lane),
    angVel: 0,
    settled: false, attachedLane: 0, checked: false,
    deleted: 0, opacity: 1, tint: 0,
    initT: g.ct, initLen: CREATION_DT, initializing: true,
    height: g.blockH,
  };
}

/* ═══════════════════ CORE LOGIC ═══════════════════ */

function rotateHex(g, steps) {
  g.position = ((g.position + steps) % SIDES + SIDES) % SIDES;
  g.hexTarget -= steps * 60;
  for (const side of g.blocks)
    for (const b of side) b.targetAngle -= steps * 60;
}

function settleBlock(g, block) {
  block.settled = true;
  block.tint = 0.6;
  let lane = SIDES - block.lane;
  lane = ((lane + g.position) % SIDES + SIDES) % SIDES;
  block.dist = g.hexR + g.blockH * g.blocks[lane].length;
  g.blocks[lane].push(block);
  block.attachedLane = lane;
  block.checked = true;
  g.shakes.push({ lane: block.lane, mag: 4.5 * g.scale });
}

function doesCollide(g, block) {
  if (block.settled) return;
  let lane = SIDES - block.lane;
  lane = ((lane + g.position) % SIDES + SIDES) % SIDES;
  const arr = g.blocks[lane];
  if (arr.length > 0) {
    const top = arr[arr.length - 1];
    if (block.dist - block.speed * g.scale <= top.dist + top.height) {
      block.dist = top.dist + top.height;
      settleBlock(g, block);
    }
  } else {
    if (block.dist - block.speed * g.scale <= g.hexR) {
      block.dist = g.hexR;
      settleBlock(g, block);
    }
  }
}

function reCollide(g, b, idx, arr) {
  if (b.deleted) return;
  if (idx <= 0) {
    if (b.dist - b.speed * g.scale - g.hexR <= 0) {
      b.dist = g.hexR; b.settled = true;
    } else {
      b.settled = false;
      b.speed = (1.5 + (g.wDiff / 15) * 3) * SPEED_MOD;
    }
  } else {
    const below = arr[idx - 1];
    if (below.settled && b.dist - b.speed * g.scale - below.dist - below.height <= 0) {
      b.dist = below.dist + below.height; b.settled = true;
    } else {
      b.settled = false;
      b.speed = (1.5 + (g.wDiff / 15) * 3) * SPEED_MOD;
    }
  }
}

/* ── Flood fill (original checking.js) ── */
function floodFill(g, side, index, color, visited) {
  if (!g.blocks[side] || !g.blocks[side][index]) return;
  for (let x = -1; x < 2; x++) {
    for (let y = -1; y < 2; y++) {
      if (Math.abs(x) === Math.abs(y)) continue;
      const ns = ((side + x) % SIDES + SIDES) % SIDES;
      const ni = index + y;
      if (!g.blocks[ns] || !g.blocks[ns][ni]) continue;
      const key = ns + "," + ni;
      if (visited.has(key)) continue;
      if (g.blocks[ns][ni].color === color && g.blocks[ns][ni].deleted === 0) {
        visited.add(key);
        floodFill(g, ns, ni, color, visited);
      }
    }
  }
}

function consolidate(g, side, index) {
  const block = g.blocks[side][index];
  if (!block || block.deleted) return;
  const visited = new Set([side + "," + index]);
  floodFill(g, side, index, block.color, visited);
  if (visited.size < 3) return;

  const now = g.ct;
  if (now - g.lastCombo < COMBO_WINDOW) g.combo += 1;
  else g.combo = 1;
  g.lastCombo = now;

  const adder = visited.size * visited.size * g.combo;
  g.score += adder;
  g.lastColorScored = block.color;

  for (const key of visited) {
    const [s, i] = key.split(",").map(Number);
    if (g.blocks[s] && g.blocks[s][i]) g.blocks[s][i].deleted = 1;
  }

  g.texts.push({ x: g.cx, y: g.cy, text: "+" + adder, color: block.color, op: 1, dy: 0 });
  if (g.combo > 1)
    g.texts.push({ x: g.cx, y: g.cy - 30 * g.scale, text: "x" + g.combo, color: "#fff", op: 1, dy: 0 });
}

function blockDestroyed(g) {
  if (g.wNextGen > 1350)      g.wNextGen -= 30 * SPEED_MOD;
  else if (g.wNextGen > 600)  g.wNextGen -= 8  * SPEED_MOD;
  if (g.wNextGen < 600) g.wNextGen = 600;
  if (g.wDiff < 35) g.wDiff += 0.085 * SPEED_MOD;
}

/* ── Wave generation (original wavegen.js) ── */
function waveUpdate(g) {
  g.wDt = 14 * g.ct;

  if (g.wDiff < 35) {
    const elapsed = g.wDt - (g.wLastGen || 0);
    let inc;
    if      (g.wDiff < 8)  inc = elapsed / 5166667;
    else if (g.wDiff < 15) inc = elapsed / 72333333;
    else                    inc = elapsed / 90000000;
    g.wDiff += inc * 0.5 * SPEED_MOD;
  }

  if ((g.wDt - g.wLastGen) * SPEED_MOD > g.wNextGen) {
    if (g.wNextGen > 600)
      g.wNextGen -= 11 * (g.wNextGen / 1300) * SPEED_MOD;
  }

  if (g.wDt - g.wLastGen <= g.wNextGen) return;
  g.wLastGen = g.wDt;
  g.wCt++;

  const spd = 1.6 + (g.wDiff / 15) * 3;

  switch (g.wPattern) {
    case "random": {
      g.falling.push(mkBlock(ri(0, SIDES), COLORS[ri(0, 4)], spd, g));
      if (g.wCt > 5) {
        const r = ri(0, 24);
        g.wCt = 0;
        if      (r > 15) g.wPattern = "double";
        else if (r > 10) g.wPattern = "cross";
        else if (r > 7)  g.wPattern = "spiral";
        else if (r > 4)  g.wPattern = "circle";
        else if (r > 1)  g.wPattern = "halfCircle";
      }
      break;
    }
    case "double": {
      const ln = ri(0, SIDES);
      g.falling.push(mkBlock(ln, COLORS[ri(0, 4)], spd, g));
      g.falling.push(mkBlock((ln + 1) % SIDES, COLORS[ri(0, 4)], spd, g));
      g.wCt += 2;
      if (g.wCt > 8 && ri(0, 2) === 0) { g.wCt = 0; g.wPattern = "random"; }
      break;
    }
    case "cross": {
      const c = COLORS[ri(0, 4)];
      const ln = ri(0, SIDES);
      g.falling.push(mkBlock(ln, c, spd * 0.6, g));
      g.falling.push(mkBlock((ln + 3) % SIDES, c, spd * 0.6, g));
      g.wCt += 1.5;
      if (g.wCt > 8 && ri(0, 2) === 0) { g.wCt = 0; g.wPattern = "random"; }
      break;
    }
    case "spiral": {
      const dir = ri(0, 2);
      const lane = dir ? SIDES - 1 - (g.wCt % SIDES) : g.wCt % SIDES;
      g.falling.push(mkBlock(lane, COLORS[ri(0, 4)], spd, g));
      g.wCt++;
      if (g.wCt > 8 && ri(0, 2) === 0) { g.wCt = 0; g.wPattern = "random"; }
      break;
    }
    case "circle": {
      const numC = ri(1, 3);
      const cl = [];
      for (let i = 0; i < numC; i++) {
        let c; do { c = COLORS[ri(0, 4)]; } while (cl.includes(c));
        cl.push(c);
      }
      for (let i = 0; i < SIDES; i++)
        g.falling.push(mkBlock(i, cl[i % numC], spd, g));
      g.wCt = 0;
      g.wPattern = ["double", "spiral", "cross", "random"][ri(0, 4)];
      break;
    }
    case "halfCircle": {
      const c = COLORS[ri(0, 4)];
      const d = ri(0, 6);
      for (let i = 0; i < 3; i++)
        g.falling.push(mkBlock((d + i) % 6, c, spd, g));
      g.wCt += 8;
      if (g.wCt > 8 && ri(0, 2) === 0) { g.wCt = 0; g.wPattern = "random"; }
      break;
    }
  }
}

/* ── Main update (original update.js) ── */
function update(g, dt) {
  if (g.over) return;
  if (g.delay > 0) { g.delay -= dt; return; }

  waveUpdate(g);

  for (const b of g.falling) {
    doesCollide(g, b);
    if (!b.settled) {
      if (g.ct - b.initT >= b.initLen) b.initializing = false;
      if (!b.initializing) b.dist -= b.speed * dt * g.scale;
    }
  }

  for (let s = 0; s < SIDES; s++) {
    for (let j = 0; j < g.blocks[s].length; j++) {
      if (g.blocks[s][j].checked) {
        consolidate(g, s, j);
        g.blocks[s][j].checked = false;
      }
    }
  }

  for (let s = 0; s < SIDES; s++) {
    let lowest = 99;
    for (let j = g.blocks[s].length - 1; j >= 0; j--) {
      const b = g.blocks[s][j];
      if (b.deleted) {
        if (b.opacity >= 0.925)
          g.shakes.push({ lane: ((SIDES - b.attachedLane + g.position) % SIDES + SIDES) % SIDES, mag: 3 * g.scale });
        b.opacity -= 0.075 * dt;
        if (b.opacity <= 0) {
          g.blocks[s].splice(j, 1);
          blockDestroyed(g);
          if (j < lowest) lowest = j;
        }
      }
    }
    if (lowest < g.blocks[s].length) {
      for (let j = lowest; j < g.blocks[s].length; j++) g.blocks[s][j].settled = false;
    }
  }

  for (let s = 0; s < SIDES; s++) {
    for (let j = 0; j < g.blocks[s].length; j++) {
      reCollide(g, g.blocks[s][j], j, g.blocks[s]);
      if (!g.blocks[s][j].settled) g.blocks[s][j].dist -= g.blocks[s][j].speed * dt * g.scale;
    }
  }

  g.falling = g.falling.filter((b) => !b.settled);

  for (let i = g.texts.length - 1; i >= 0; i--) {
    const t = g.texts[i];
    t.dy -= 1.2 * dt * g.scale;
    t.op -= 0.018 * dt;
    if (t.op <= 0) g.texts.splice(i, 1);
  }

  for (let s = 0; s < SIDES; s++) {
    let alive = 0;
    for (const b of g.blocks[s]) if (!b.deleted) alive++;
    if (alive > MAX_ROWS) { g.over = true; return; }
  }

  g.ct += dt;
}

/* ═══════════════════ RENDER ═══════════════════ */

function renderGame(ctx, g, W, H) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  g.gdx = 0; g.gdy = 0;
  for (let i = g.shakes.length - 1; i >= 0; i--) {
    const s = g.shakes[i];
    const a = ((30 + s.lane * 60) * Math.PI) / 180;
    g.gdx -= Math.cos(a) * s.mag;
    g.gdy += Math.sin(a) * s.mag;
    s.mag /= 2;
    if (s.mag < 1) g.shakes.splice(i, 1);
  }

  if (g.hexAngle !== g.hexTarget) {
    if (g.hexAngle > g.hexTarget) g.hexAngV -= ANG_V_CONST;
    else g.hexAngV += ANG_V_CONST;
    if (Math.abs(g.hexAngle - g.hexTarget + g.hexAngV) <= Math.abs(g.hexAngV)) {
      g.hexAngle = g.hexTarget; g.hexAngV = 0;
    } else {
      g.hexAngle += g.hexAngV;
    }
  }

  const cx = g.cx + g.gdx;
  const cy = g.cy + g.gdy;

  if (g.op < 1) g.op += 0.01;
  ctx.globalAlpha = g.op;
  const outerR = MAX_ROWS * g.blockH * (2 / Math.sqrt(3)) + g.hexW;
  drawPolygon(ctx, cx, cy, 6, outerR, 30, BOUNDARY_GREY, 0, null);
  drawComboTimer(ctx, g, cx, cy, outerR);
  ctx.globalAlpha = 1;

  for (let s = 0; s < SIDES; s++)
    for (let j = 0; j < g.blocks[s].length; j++)
      drawBlock(ctx, g.blocks[s][j], g, cx, cy);

  for (const b of g.falling) drawBlock(ctx, b, g, cx, cy);

  drawPolygon(ctx, cx, cy, SIDES, g.hexW, g.hexAngle, CENTER_HEX, 0, "rgba(0,0,0,0)");

  const ss = String(g.score);
  let sz = 50;
  if (ss.length === 6) sz = 43;
  else if (ss.length === 7) sz = 35;
  else if (ss.length >= 8) sz = 27;
  sz *= g.scale;
  ctx.fillStyle = SCORE_COLOR;
  ctx.font = `bold ${Math.round(sz)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ss, cx, cy);

  for (const t of g.texts) {
    ctx.globalAlpha = Math.max(0, t.op);
    ctx.fillStyle = t.color;
    ctx.font = `bold ${Math.round(22 * g.scale)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t.text, t.x + g.gdx, t.y + t.dy + g.gdy);
  }
  ctx.globalAlpha = 1;
}

function drawBlock(ctx, b, g, cx, cy) {
  b.height = g.blockH;

  if (b.angle !== b.targetAngle) {
    if (b.angle > b.targetAngle) b.angVel -= ANG_V_CONST;
    else b.angVel += ANG_V_CONST;
    if (Math.abs(b.angle - b.targetAngle + b.angVel) <= Math.abs(b.angVel)) {
      b.angle = b.targetAngle; b.angVel = 0;
    } else {
      b.angle += b.angVel;
    }
  }

  const h  = b.height;
  const wN = (2 * b.dist) / Math.sqrt(3);
  const wW = (2 * (b.dist + h)) / Math.sqrt(3);

  let rat = 1;
  if (b.initializing) {
    rat = Math.min(1, (g.ct - b.initT) / b.initLen);
    if (rat >= 1) b.initializing = false;
  }

  const p1 = rotPt((-wN / 2) * rat,  h / 2, b.angle);
  const p2 = rotPt(( wN / 2) * rat,  h / 2, b.angle);
  const p3 = rotPt(( wW / 2) * rat, -h / 2, b.angle);
  const p4 = rotPt((-wW / 2) * rat, -h / 2, b.angle);

  const bx = cx + Math.sin((b.angle * Math.PI) / 180) * (b.dist + h / 2);
  const by = cy - Math.cos((b.angle * Math.PI) / 180) * (b.dist + h / 2);

  ctx.globalAlpha = Math.max(0, b.opacity);
  ctx.fillStyle = b.deleted ? "#FFF" : b.color;
  ctx.beginPath();
  ctx.moveTo(bx + p1.x, by + p1.y);
  ctx.lineTo(bx + p2.x, by + p2.y);
  ctx.lineTo(bx + p3.x, by + p3.y);
  ctx.lineTo(bx + p4.x, by + p4.y);
  ctx.closePath();
  ctx.fill();

  if (b.tint > 0 && !b.deleted) {
    ctx.fillStyle = "#FFF";
    ctx.globalAlpha = b.tint;
    ctx.beginPath();
    ctx.moveTo(bx + p1.x, by + p1.y);
    ctx.lineTo(bx + p2.x, by + p2.y);
    ctx.lineTo(bx + p3.x, by + p3.y);
    ctx.lineTo(bx + p4.x, by + p4.y);
    ctx.closePath();
    ctx.fill();
    b.tint -= 0.02;
    if (b.tint < 0) b.tint = 0;
  }
  ctx.globalAlpha = 1;
}

/* ── Combo timer (original comboTimer.js - hex edge lines) ── */
function drawComboTimer(ctx, g, cx, cy, outerR) {
  if (g.lastCombo < 0 || g.ct - g.lastCombo >= COMBO_WINDOW) return;

  const progress = 1 - (g.ct - g.lastCombo) / COMBO_WINDOW;
  const R = outerR;
  const hR = R / 2;
  const tH = R * (Math.sqrt(3) / 2);

  const verts = [
    [hR,             tH],
    [0,              tH],
    [-hR,            tH],
    [-(hR * 3) / 2,  tH / 2],
    [-R,             0],
    [-(hR * 3) / 2, -tH / 2],
    [-hR,           -tH],
    [0,             -tH],
    [hR,            -tH],
    [(hR * 3) / 2,  -tH / 2],
    [R,              0],
    [(hR * 3) / 2,   tH / 2],
  ];

  const totalSegs = 6;
  const segsCovered = progress * totalSegs;
  const fullSegs = Math.floor(segsCovered);
  const partFrac = segsCovered - fullSegs;

  ctx.strokeStyle = g.lastColorScored;
  ctx.lineWidth = 4 * g.scale;
  ctx.lineCap = "round";

  ctx.beginPath();
  let started = false;
  for (let i = 0; i <= fullSegs && i < totalSegs; i++) {
    const sx = cx + verts[i][0];
    const sy = cy + verts[i][1];
    if (!started) { ctx.moveTo(sx, sy); started = true; }
    else ctx.lineTo(sx, sy);
    if (i === fullSegs && partFrac > 0 && i + 1 < verts.length) {
      const nx = cx + verts[i + 1][0];
      const ny = cy + verts[i + 1][1];
      ctx.lineTo(sx + (nx - sx) * partFrac, sy + (ny - sy) * partFrac);
    }
  }
  ctx.stroke();

  ctx.beginPath();
  started = false;
  for (let i = 0; i <= fullSegs && i < totalSegs; i++) {
    const vi = (verts.length - i) % verts.length;
    const sx = cx + verts[vi][0];
    const sy = cy + verts[vi][1];
    if (!started) { ctx.moveTo(sx, sy); started = true; }
    else ctx.lineTo(sx, sy);
    if (i === fullSegs && partFrac > 0) {
      const nvi = ((verts.length - i - 1) % verts.length + verts.length) % verts.length;
      const nx = cx + verts[nvi][0];
      const ny = cy + verts[nvi][1];
      ctx.lineTo(sx + (nx - sx) * partFrac, sy + (ny - sy) * partFrac);
    }
  }
  ctx.stroke();
}

/* ═══════════════════ REACT COMPONENT ═══════════════════ */
const STATES = { IDLE: "idle", PLAYING: "playing", ENDED: "ended" };

const HextrisGame = ({ isActive, onNextGame, userId }) => {
  const { t } = useLanguage();
  const canvasRef   = useRef(null);
  const stateRef    = useRef(STATES.IDLE);
  const gameRef     = useRef(null);
  const rafRef      = useRef(null);
  const lastTimeRef = useRef(0);
  const [uiState, setUiState]       = useState(STATES.IDLE);
  const [finalScore, setFinalScore] = useState(0);
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  const { submit, loading: isSubmittingScore, error: submitError, lastResult } = useSubmitScore(userId, GAME_IDS.HextrisGame);

  // Enviar puntuación al terminar
  useEffect(() => {
    if (uiState === STATES.ENDED && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submit(finalScore, () => {})
        .then((result) => {
          setRanking(result?.data?.ranking || []);
          setScoreMessage(result?.message || "");
        })
        .catch(() => setScoreMessage(t("svc.score_error")))
        .finally(() => setIsRankingLoading(false));
    }
    if (uiState === STATES.IDLE) {
      scoreSubmitted.current = false;
      setRanking([]);
      setScoreMessage("");
    }
  }, [uiState, finalScore, submit]);

  const startGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.parentElement.clientWidth;
    const H = canvas.parentElement.clientHeight;
    gameRef.current = createGame(W, H);
    stateRef.current = STATES.PLAYING;
    setUiState(STATES.PLAYING);
    lastTimeRef.current = performance.now();
  }, []);

  useEffect(() => {
    if (!isActive) return;
    const onKey = (e) => {
      if (stateRef.current !== STATES.PLAYING) return;
      if (e.key === "ArrowLeft"  || e.key === "a") { e.preventDefault(); rotateHex(gameRef.current, 1);  }
      if (e.key === "ArrowRight" || e.key === "d") { e.preventDefault(); rotateHex(gameRef.current, -1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isActive) return;
    const onPtr = (e) => {
      if (stateRef.current !== STATES.PLAYING) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      rotateHex(gameRef.current, x < rect.width / 2 ? 1 : -1);
    };
    canvas.addEventListener("pointerdown", onPtr);
    return () => canvas.removeEventListener("pointerdown", onPtr);
  }, [isActive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.parentElement.clientWidth;
      const h = canvas.parentElement.clientHeight;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width  = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (gameRef.current) {
        const g = gameRef.current;
        g.cx = w / 2;
        g.cy = h / 2;
        g.scale     = ((h > w ? w : h) / 800) * BASE_SCALE;
        g.hexW      = BASE_HEX_W   * g.scale;
        g.blockH    = BASE_BLOCK_H * g.scale;
        g.startDist = START_DIST   * g.scale;
        g.hexR      = (g.hexW / 2) * Math.sqrt(3);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = (now) => {
      rafRef.current = requestAnimationFrame(loop);
      const g = gameRef.current;
      const W = canvas.parentElement.clientWidth;
      const H = canvas.parentElement.clientHeight;

      if (!g || stateRef.current === STATES.IDLE) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, W, H);
        return;
      }

      const dt = Math.min((now - lastTimeRef.current) / 16.667, 3);
      lastTimeRef.current = now;

      if (stateRef.current === STATES.PLAYING) {
        update(g, dt);
        if (g.over) {
          stateRef.current = STATES.ENDED;
          setUiState(STATES.ENDED);
          setFinalScore(g.score);
        }
      }

      renderGame(ctx, g, W, H);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    if (isActive && stateRef.current === STATES.IDLE) startGame();
  }, [isActive, startGame]);

  return (
    <div className="absolute inset-0" style={{ background: BG_COLOR }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: "none" }}
      />
      {uiState === STATES.ENDED && (
        <GameOverPanel
          title="Game Over"
          score={String(finalScore)}
          subtitle={t("hextris.subtitle")}
          onNext={onNextGame}
          ranking={ranking}
          scoreMessage={scoreMessage}
          isLoading={isRankingLoading}
        />
      )}
    </div>
  );
};

export default HextrisGame;