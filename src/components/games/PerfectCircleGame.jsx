/**
 * PerfectCircleGame.jsx — "Perfect Circle"  ·  Neon Void Edition
 *
 * Dibuja un círculo perfecto de un solo trazo en 5 segundos.
 * Evaluación: Bounding-Box center + avgError + maxError + penalización por óvalo.
 *
 * Flujo: IDLE → DRAWING (5 s timer) → ANALYZING → REVEAL (3 s) → ENDED
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ─────────── Constantes ─────────── */

const PHASES = {
  IDLE: "idle",
  DRAWING: "drawing",
  ANALYZING: "analyzing",
  REVEAL: "reveal",
  ENDED: "ended",
};

const MIN_POINTS = 20;
const CLOSURE_THRESHOLD = 0.20;
const MIN_RADIUS = 40;
const TIME_LIMIT = 5.0;       // segundos
const REVEAL_DURATION = 2500; // ms

// Neon Blueprint palette
const STROKE_COLOR = "#22d3ee";            // cian brillante
const STROKE_WIDTH = 6;
const STROKE_GLOW  = "rgba(34,211,238,0.6)";
const STROKE_DIM   = "#94a3b8";            // gris neutro (trazo revelado)
const PERFECT_CIRCLE_COLOR = "#4ade80";    // verde neón
const CENTER_CROSS_COLOR   = "#4ade80";

/* ═══════════════════ COMPONENT ═══════════════════ */
const PerfectCircleGame = ({ isActive, onNextGame, onReplay, userId, pinchGuardRef }) => {
  const { t } = useLanguage();

  // ── Phase state ──
  const [phase, setPhase] = useState(PHASES.IDLE);
  const [displayScore, setDisplayScore] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // ── Timer state ──
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const timerStartRef = useRef(null);  // performance.now() del primer toque
  const timerRafRef = useRef(null);

  // ── Ranking ──
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const scoreSubmitted = useRef(false);

  const { submit, loading: isSubmittingScore, xpGained } = useSubmitScore(userId, GAME_IDS.PerfectCircleGame);

  // ── Canvas & drawing refs ──
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const pointsRef = useRef([]);
  const isDrawingRef = useRef(false);
  const phaseRef = useRef(PHASES.IDLE);

  // ── Analysis refs ──
  const analysisRef = useRef(null);

  // ── Animated counter ──
  const [animatedScore, setAnimatedScore] = useState(0);
  const counterRafRef = useRef(null);

  // ── Reveal auto-transition ──
  const revealTimerRef = useRef(null);

  /* ─────────── Sync phase ref ─────────── */
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /* ─────────── Canvas sizing ─────────── */
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (phaseRef.current === PHASES.REVEAL || phaseRef.current === PHASES.ENDED) {
      drawReveal(ctx);
    }
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  /* ─────────── Auto-start when active ─────────── */
  useEffect(() => {
    if (isActive && phase === PHASES.IDLE) {
      resetGame();
    }
  }, [isActive]);

  /* ─────────── Reset ─────────── */
  const resetGame = useCallback(() => {
    pointsRef.current = [];
    isDrawingRef.current = false;
    analysisRef.current = null;
    scoreSubmitted.current = false;
    timerStartRef.current = null;
    cancelAnimationFrame(timerRafRef.current);
    cancelAnimationFrame(counterRafRef.current);
    clearTimeout(revealTimerRef.current);
    setDisplayScore(null);
    setErrorMsg(null);
    setAnimatedScore(0);
    setTimeLeft(TIME_LIMIT);
    setRanking([]);
    setScoreMessage("");
    setPhase(PHASES.IDLE);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  /* ═══════════════════ DRAWING ═══════════════════ */
  const getCanvasPoint = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  /** Dibuja trazo neón en vivo */
  const drawStroke = useCallback((points, ctx, color = STROKE_COLOR, width = STROKE_WIDTH, alpha = 1.0, glow = true) => {
    if (points.length < 2) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (glow) {
      ctx.shadowColor = STROKE_GLOW;
      ctx.shadowBlur = 18;
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }, []);

  const drawLiveStroke = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    drawStroke(pointsRef.current, ctx);
  }, [drawStroke]);

  /* ─────────── Draw the REVEAL overlay ─────────── */
  const drawReveal = useCallback((ctx) => {
    const pts = pointsRef.current;
    const a = analysisRef.current;
    if (!pts.length) return;

    // 1. Player stroke (dimmed, neutro)
    drawStroke(pts, ctx, STROKE_DIM, STROKE_WIDTH - 1, 0.4, false);

    if (!a) return; // error case – no perfect circle to draw

    // 2. Perfect circle — verde neón con glow fuerte
    ctx.save();
    ctx.strokeStyle = PERFECT_CIRCLE_COLOR;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = PERFECT_CIRCLE_COLOR;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(a.cx, a.cy, a.radius, 0, Math.PI * 2);
    ctx.stroke();
    // Double pass for extra glow
    ctx.shadowBlur = 30;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.restore();

    // 3. Center crosshair
    const cs = 12;
    ctx.save();
    ctx.strokeStyle = CENTER_CROSS_COLOR;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = CENTER_CROSS_COLOR;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(a.cx - cs, a.cy);
    ctx.lineTo(a.cx + cs, a.cy);
    ctx.moveTo(a.cx, a.cy - cs);
    ctx.lineTo(a.cx, a.cy + cs);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(a.cx, a.cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = CENTER_CROSS_COLOR;
    ctx.fill();
    ctx.restore();
  }, [drawStroke]);

  /* ═══════════════════ THE MATH (UNTOUCHED) ═══════════════════ */
  const analyzeCircle = useCallback((points) => {
    // --- 1. Anti-cheat: too few points ---
    if (points.length < MIN_POINTS) {
      return { score: 0, error: t("perfectcircle.too_short") };
    }

    // --- 2. Bounding Box → Centro exacto ---
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // --- 3. Radio ideal (media de semi-ejes) ---
    const radiusX = (maxX - minX) / 2;
    const radiusY = (maxY - minY) / 2;
    const radius = (radiusX + radiusY) / 2;

    // --- Anti-cheat: too small ---
    if (radius < MIN_RADIUS) {
      return { score: 0, error: t("perfectcircle.too_small") };
    }

    // --- 4. Closure check ---
    const first = points[0];
    const last = points[points.length - 1];
    const closureDist = Math.sqrt((first.x - last.x) ** 2 + (first.y - last.y) ** 2);
    const diameter = radius * 2;
    if (closureDist > diameter * CLOSURE_THRESHOLD) {
      return { score: 0, error: t("perfectcircle.incomplete"), cx, cy, radius };
    }

// --- 5. Errores: promedio + máximo ---
    let sumError = 0;
    let maxError = 0;
    for (const p of points) {
      const d = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
      const error = Math.abs(d - radius);
      sumError += error;
      maxError = Math.max(maxError, error);
    }
    const avgError = sumError / points.length;

    // --- 6. El Nuevo Sistema de Puntuación (Justo pero exigente) ---
    const errorRatio = avgError / radius; 
    const maxRatio = maxError / radius;   
    const ovalRatio = Math.abs(radiusX - radiusY) / radius;

    // Base: 100 menos el error promedio (escalado para ser más amable)
    let baseScore = 100 - (errorRatio * 150);

    // Penalización 1: Por achatamiento (forma de huevo)
    baseScore -= (ovalRatio * 100);

    // Penalización 2: El Castigador de Esquinas (Solo actúa si hay picos obvios)
    // Un cuadrado tiene un maxRatio de ~0.41. Un temblor humano es ~0.08.
    if (maxRatio > 0.15) {
        // Castiga fuertemente la parte del error que excede el margen humano
        baseScore -= ((maxRatio - 0.15) * 200); 
    }

    // --- 7. Score final (entero 0-1000 para BD, fixed-point ×10) ---
    const scoreInt = Math.round(Math.max(0, Math.min(100, baseScore)) * 10);

    return { score: scoreInt, cx, cy, radius, error: null };
  }, [t]);

  /* ─────────── Finish drawing → Analyze → Reveal ─────────── */
  const finishDrawing = useCallback(() => {
    if (!isDrawingRef.current && phaseRef.current !== PHASES.DRAWING) return;
    isDrawingRef.current = false;
    cancelAnimationFrame(timerRafRef.current);
    setPhase(PHASES.ANALYZING);

    setTimeout(() => {
      const result = analyzeCircle(pointsRef.current);
      analysisRef.current = result.error && !result.cx
        ? null
        : { cx: result.cx, cy: result.cy, radius: result.radius, score: result.score };

      if (result.error) {
        setErrorMsg(result.error);
        setDisplayScore(0);
      } else {
        setDisplayScore(result.score);
      }

      // Paint reveal on canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        drawReveal(ctx);
      }

      setPhase(PHASES.REVEAL);
    }, 250);
  }, [analyzeCircle, drawReveal]);

  /* ─────────── REVEAL → ENDED auto-transition (3 s) ─────────── */
  useEffect(() => {
    if (phase !== PHASES.REVEAL) return;
    revealTimerRef.current = setTimeout(() => setPhase(PHASES.ENDED), REVEAL_DURATION);
    return () => clearTimeout(revealTimerRef.current);
  }, [phase]);

  /* ─────────── Animated score counter (runs in REVEAL) ─────────── */
  useEffect(() => {
    if (phase !== PHASES.REVEAL || displayScore == null) return;
    const target = displayScore;
    const duration = 600;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setAnimatedScore(Math.round(eased * target));
      if (progress < 1) counterRafRef.current = requestAnimationFrame(tick);
    };
    counterRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(counterRafRef.current);
  }, [phase, displayScore]);

  /* ─────────── Submit score on ENDED ─────────── */
  useEffect(() => {
    if (phase === PHASES.ENDED && displayScore != null && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      submit(displayScore).then((r) => {
        if (r?.data?.ranking) setRanking(r.data.ranking);
        if (r?.message) setScoreMessage(r.message);
      });
    }
  }, [phase, displayScore, submit]);

  /* ═══════════════════ TIMER (rAF) ═══════════════════ */
  const startTimer = useCallback(() => {
    timerStartRef.current = performance.now();
    const tick = (now) => {
      if (phaseRef.current !== PHASES.DRAWING) return;
      const elapsed = (now - timerStartRef.current) / 1000;
      const remaining = Math.max(0, TIME_LIMIT - elapsed);
      setTimeLeft(Math.round(remaining * 10) / 10);
      if (remaining <= 0) {
        // Tiempo agotado → forzar evaluación
        finishDrawing();
        return;
      }
      timerRafRef.current = requestAnimationFrame(tick);
    };
    timerRafRef.current = requestAnimationFrame(tick);
  }, [finishDrawing]);

  /* ═══════════════════ POINTER EVENTS ═══════════════════ */
  const handlePointerDown = useCallback((e) => {
    const p = phaseRef.current;
    if (p === PHASES.ENDED || p === PHASES.ANALYZING || p === PHASES.REVEAL) return;
    if (pinchGuardRef?.current) return;               // LEY 5
    e.preventDefault();
    const pt = getCanvasPoint(e);
    if (!pt) return;
    pointsRef.current = [pt];
    isDrawingRef.current = true;
    setPhase(PHASES.DRAWING);
    startTimer();
    drawLiveStroke();
  }, [getCanvasPoint, drawLiveStroke, startTimer]);

  const handlePointerMove = useCallback((e) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const pt = getCanvasPoint(e);
    if (!pt) return;
    pointsRef.current.push(pt);
    drawLiveStroke();
  }, [getCanvasPoint, drawLiveStroke]);

  const handlePointerUp = useCallback((e) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    finishDrawing();
  }, [finishDrawing]);

  /* ─────────── Replay handler ─────────── */
  const handleReplay = useCallback(() => {
    resetGame();
    if (onReplay) onReplay();
  }, [resetGame, onReplay]);

  /* ═══════════════════ RENDER ═══════════════════ */
  const isIdle     = phase === PHASES.IDLE;
  const isDrawing  = phase === PHASES.DRAWING;
  const isAnalyzing = phase === PHASES.ANALYZING;
  const isReveal   = phase === PHASES.REVEAL;
  const isEnded    = phase === PHASES.ENDED;

  const timerDanger = timeLeft < 1;

  return (
    <div
      className="relative h-full w-full overflow-hidden select-none bg-black"
      style={{
        background: "radial-gradient(circle at center, #0f172a 0%, #000000 70%)",
        boxShadow: "inset 0 0 60px rgba(0,0,0,0.85)",
      }}
    >
      {/* ── Vignette overlay ── */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ boxShadow: "inset 0 0 120px 40px rgba(0,0,0,0.7)" }}
      />

      {/* ── Feed-blending gradients ── */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-linear-to-t from-black/60 to-transparent z-5" />
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/40 to-transparent z-5" />

      {/* ── Timer display (during DRAWING) ── */}
      {isDrawing && (
        <div className="absolute top-14 left-0 right-0 flex justify-center z-4 pointer-events-none">
          <span
            className={`text-5xl font-black tabular-nums transition-colors duration-200 ${
              timerDanger ? "text-red-500 animate-pulse" : "text-white/20"
            }`}
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {timeLeft.toFixed(1)}s
          </span>
        </div>
      )}

      {/* ── Centred game container ── */}
      <div
        ref={containerRef}
        className="relative h-full w-full"
      >
        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full z-1"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{ cursor: isEnded || isReveal ? "default" : "crosshair" }}
        />

        {/* ── IDLE hint ── */}
        {isIdle && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-2 pointer-events-none gap-4">
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-cyan-400/30 flex items-center justify-center animate-pulse">
              <svg className="w-7 h-7 text-cyan-400/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
            </div>
            <p className="text-slate-400/70 text-lg font-medium text-center px-8">
              {t("perfectcircle.instruction")}
            </p>
            <p className="text-slate-500/40 text-xs tracking-widest uppercase">
              {TIME_LIMIT}s limit
            </p>
          </div>
        )}

        {/* ── ANALYZING spinner ── */}
        {isAnalyzing && (
          <div className="absolute inset-0 flex items-center justify-center z-2 pointer-events-none">
            <div className="w-10 h-10 border-4 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        )}

        {/* ── REVEAL: Score overlay ── */}
        {isReveal && !errorMsg && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-2 pointer-events-none gap-1">
            <p
              className="font-black italic text-7xl tabular-nums"
              style={{
                color: "#fff",
                textShadow: "0 0 40px rgba(34,211,238,0.5), 0 0 80px rgba(74,222,128,0.3)",
              }}
            >
              {(animatedScore / 10).toFixed(1)}%
            </p>
            <p className="text-slate-400 text-sm font-medium tracking-wide mt-1">
              {t("perfectcircle.subtitle")}
            </p>
          </div>
        )}

        {/* ── REVEAL: Error message ── */}
        {isReveal && errorMsg && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-2 pointer-events-none gap-1">
            <p className="text-red-400 text-xl font-bold text-center px-6">{errorMsg}</p>
            <p className="text-white/30 text-base mt-1">0%</p>
          </div>
        )}
      </div>

      {/* ── GameOverPanel (only in ENDED) ── */}
      {isEnded && (
        <GameOverPanel
          title="Game Over"
          score={`${displayScore != null ? (displayScore / 10).toFixed(1) : '0'}%`}
          subtitle={errorMsg || t("perfectcircle.subtitle")}
          onReplay={handleReplay}
          onNext={onNextGame}
          ranking={ranking.map(r => ({ ...r, score: `${(Number(r.score) / 10).toFixed(1)}%` }))}
          scoreMessage={scoreMessage}
          xpGained={xpGained}
          isLoading={isSubmittingScore}
        />
      )}
    </div>
  );
};

export default PerfectCircleGame;
