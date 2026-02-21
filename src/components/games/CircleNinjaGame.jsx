/**
 * CircleNinjaGame.jsx — "Circle Ninja"
 *
 * Clon tipo Fruit Ninja con círculos: corta los verdes, evita los rojos.
 * Implementado con Canvas 2D puro (sin Phaser).
 *
 * - Los círculos salen disparados desde abajo con gravedad
 * - El jugador desliza el dedo / ratón para cortarlos
 * - Verde = +1 punto
 * - Rojo  = Game Over
 * - Si un verde se cae sin cortar → pierde 1 vida (3 vidas)
 *
 * Props:
 *   isActive (boolean) — cuando pasa a true, arranca el juego
 */

import { useEffect, useRef, useState, useCallback } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ─────────── Constantes ─────────── */

const GAME_STATES = { IDLE: "idle", PLAYING: "playing", ENDED: "ended" };
const GRAVITY = 0.22;
const GOOD_COLOR = "#22c55e";
const BAD_COLOR = "#ef4444";
const GOOD_RADIUS = 38;
const BAD_RADIUS = 28;
const MAX_LIVES = 3;
const THROW_INTERVAL_MIN = 1100;
const THROW_INTERVAL_MAX = 1800;
const SLASH_LENGTH = 12;

/* ─────────── Helpers ─────────── */

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function createCircle(w, h, type, score) {
  const r = type === "good" ? GOOD_RADIUS : BAD_RADIUS;
  // Zona central 80% (excluir 10% izda y 10% dcha)
  const margin = w * 0.10;
  const x = rand(margin + r, w - margin - r);
  // Velocidad base + incremento progresivo con el score
  const speedMult = 1 + Math.min(score, 30) * 0.025; // hasta +75% a score 30
  const vy = -(h * 0.012 + rand(2, 4.5)) * speedMult;
  const vx = rand(-1.8, 1.8) * speedMult;
  return { x, y: h + r, vx, vy, r, type, alive: true, sliced: false, alpha: 1 };
}

/* ─────────── Componente React ─────────── */

const CircleNinjaGame = ({ isActive, onNextGame, userId }) => {
  const { t } = useLanguage();
  const canvasRef = useRef(null);
  const stateRef = useRef({
    gameState: GAME_STATES.IDLE,
    score: 0,
    lives: MAX_LIVES,
    circles: [],
    slashPoints: [],
    particles: [],
    nextThrow: 0,
    w: 0,
    h: 0,
    pointer: { down: false, x: 0, y: 0 },
    animId: null,
  });
  const hasStartedRef = useRef(false);

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [gameState, setGameState] = useState(GAME_STATES.IDLE);
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  const { submit, loading: isSubmittingScore, error: submitError, lastResult } = useSubmitScore(userId, GAME_IDS.CircleNinjaGame);
  // Enviar puntuación al terminar
  useEffect(() => {
    if (gameState === GAME_STATES.ENDED && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submit(score, () => {})
        .then((result) => {
          setRanking(result?.data?.ranking || []);
          setScoreMessage(result?.message || "");
        })
        .catch(() => setScoreMessage(t("svc.score_error")))
        .finally(() => setIsRankingLoading(false));
    }
    if (gameState === GAME_STATES.IDLE) {
      scoreSubmitted.current = false;
      setRanking([]);
      setScoreMessage("");
    }
  }, [gameState, score, submit]);

  /* ── Arrancar cuando isActive llega ── */
  useEffect(() => {
    if (isActive && !hasStartedRef.current && stateRef.current.gameState === GAME_STATES.IDLE) {
      hasStartedRef.current = true;
      stateRef.current.gameState = GAME_STATES.PLAYING;
      stateRef.current.nextThrow = performance.now() + 400;
      setGameState(GAME_STATES.PLAYING);
    }
  }, [isActive]);

  /* ── Restart ── */
  const handleRestart = useCallback(() => {
    const s = stateRef.current;
    s.score = 0;
    s.lives = MAX_LIVES;
    s.circles = [];
    s.slashPoints = [];
    s.particles = [];
    s.gameState = GAME_STATES.PLAYING;
    s.nextThrow = performance.now() + 400;
    setScore(0);
    setLives(MAX_LIVES);
    setGameState(GAME_STATES.PLAYING);
  }, []);

  /* ── Canvas + Game loop ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const s = stateRef.current;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement.getBoundingClientRect();
      s.w = rect.width;
      s.h = rect.height;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);

    /* ── Pointer handlers ── */
    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] || e.changedTouches[0] : e;
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    function onDown(e) {
      e.preventDefault();
      s.pointer.down = true;
      const p = getPos(e);
      s.pointer.x = p.x;
      s.pointer.y = p.y;
      s.slashPoints = [{ ...p }];
    }
    function onMove(e) {
      if (!s.pointer.down) return;
      e.preventDefault();
      const p = getPos(e);
      s.pointer.x = p.x;
      s.pointer.y = p.y;
      s.slashPoints.push({ ...p });
      if (s.slashPoints.length > SLASH_LENGTH) s.slashPoints.shift();
    }
    function onUp(e) {
      e.preventDefault();
      s.pointer.down = false;
      s.slashPoints = [];
    }

    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onUp);
    canvas.addEventListener("mouseleave", onUp);
    canvas.addEventListener("touchstart", onDown, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onUp, { passive: false });

    /* ── Partículas ── */
    function spawnParticles(x, y, color, count) {
      for (let i = 0; i < count; i++) {
        s.particles.push({
          x, y,
          vx: rand(-4, 4),
          vy: rand(-5, 1),
          r: rand(3, 7),
          color,
          life: 1,
        });
      }
    }

    /* ── Colisión slash ↔ circle ── */
    function checkSlash() {
      if (s.slashPoints.length < 2) return;
      const pts = s.slashPoints;
      for (let ci = s.circles.length - 1; ci >= 0; ci--) {
        const c = s.circles[ci];
        if (!c.alive || c.sliced) continue;
        for (let pi = 1; pi < pts.length; pi++) {
          const dx = c.x - pts[pi].x;
          const dy = c.y - pts[pi].y;
          if (Math.sqrt(dx * dx + dy * dy) < c.r + 8) {
            c.sliced = true;
            c.alive = false;
            spawnParticles(c.x, c.y, c.type === "good" ? GOOD_COLOR : BAD_COLOR, 10);
            if (c.type === "good") {
              s.score++;
              setScore(s.score);
            } else {
              /* Rojo → Game Over */
              s.gameState = GAME_STATES.ENDED;
              setGameState(GAME_STATES.ENDED);
            }
            break;
          }
        }
      }
    }

    /* ── Throw circles ── */
    function maybeThrow(now) {
      if (now < s.nextThrow) return;
      // Intervalo se acorta progresivamente
      const speedUp = Math.min(s.score, 25) * 15; // hasta -375ms a score 25
      const intMin = Math.max(500, THROW_INTERVAL_MIN - speedUp);
      const intMax = Math.max(700, THROW_INTERVAL_MAX - speedUp);
      s.nextThrow = now + rand(intMin, intMax);
      // Siempre un verde
      s.circles.push(createCircle(s.w, s.h, "good", s.score));
      // 30% chance de extra verde (sube con score)
      if (Math.random() < 0.3 + Math.min(s.score, 20) * 0.01) s.circles.push(createCircle(s.w, s.h, "good", s.score));
      // Rojos: empiezan al score 3, probabilidad crece
      const redChance = s.score < 3 ? 0 : Math.min(0.45, 0.15 + (s.score - 3) * 0.015);
      if (Math.random() < redChance) s.circles.push(createCircle(s.w, s.h, "bad", s.score));
      // Rojo extra a score alto
      if (s.score > 15 && Math.random() < 0.2) s.circles.push(createCircle(s.w, s.h, "bad", s.score));
    }

    /* ── Main loop ── */
    function loop(now) {
      s.animId = requestAnimationFrame(loop);
      ctx.clearRect(0, 0, s.w, s.h);

      if (s.gameState !== GAME_STATES.PLAYING) {
        drawCircles(ctx, s);
        drawSlash(ctx, s);
        drawParticles(ctx, s);
        return;
      }

      maybeThrow(now);

      // Actualizar círculos
      for (let i = s.circles.length - 1; i >= 0; i--) {
        const c = s.circles[i];
        if (!c.alive) continue;
        c.x += c.vx;
        c.y += c.vy;
        c.vy += GRAVITY;

        // Se cayó sin cortarlo
        if (c.y > s.h + c.r * 2) {
          c.alive = false;
          if (c.type === "good" && !c.sliced) {
            s.lives--;
            setLives(s.lives);
            if (s.lives <= 0) {
              s.gameState = GAME_STATES.ENDED;
              setGameState(GAME_STATES.ENDED);
            }
          }
        }
      }

      // Limpiar muertos
      s.circles = s.circles.filter((c) => c.alive || c.y < s.h + 100);

      checkSlash();
      drawCircles(ctx, s);
      drawSlash(ctx, s);
      drawParticles(ctx, s);
    }

    function drawCircles(ctx, s) {
      for (const c of s.circles) {
        if (!c.alive) continue;
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fillStyle = c.type === "good" ? GOOD_COLOR : BAD_COLOR;
        ctx.fill();
        // Brillo interior
        ctx.beginPath();
        ctx.arc(c.x - c.r * 0.25, c.y - c.r * 0.25, c.r * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fill();
        ctx.restore();
      }
    }

    function drawSlash(ctx, s) {
      if (s.slashPoints.length < 2) return;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 1; i < s.slashPoints.length; i++) {
        const t = i / s.slashPoints.length;
        ctx.beginPath();
        ctx.moveTo(s.slashPoints[i - 1].x, s.slashPoints[i - 1].y);
        ctx.lineTo(s.slashPoints[i].x, s.slashPoints[i].y);
        ctx.strokeStyle = `rgba(255,255,255,${t * 0.7})`;
        ctx.lineWidth = t * 6 + 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawParticles(ctx, s) {
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const p = s.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        p.life -= 0.025;
        if (p.life <= 0) {
          s.particles.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.restore();
      }
    }

    s.animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(s.animId);
      ro.disconnect();
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mouseleave", onUp);
      canvas.removeEventListener("touchstart", onDown);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onUp);
    };
  }, []);

  const isPlaying = gameState === GAME_STATES.PLAYING;
  const isEnded = gameState === GAME_STATES.ENDED;

  return (
    <div className="w-full h-full relative overflow-hidden bg-gradient-to-b from-[#1a0a2e] via-[#16213e] to-[#0f0c29]">
      {/* Canvas */}
      <div className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ touchAction: "none" }}
        />
      </div>

      {/* Gradientes para UI de Scrollinn */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-gradient-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-[5]" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/30 to-transparent pointer-events-none z-[5]" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-black/15 to-transparent pointer-events-none z-[5]" />

      {/* HUD: Score + Vidas */}
      {gameState !== GAME_STATES.IDLE && (
        <div className="absolute top-16 inset-x-0 flex items-center justify-center gap-6 pointer-events-none z-[3]">
          <span
            className="text-white/80 text-2xl font-black tabular-nums"
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {score}
          </span>
          <div className="flex gap-1">
            {Array.from({ length: MAX_LIVES }, (_, i) => (
              <span
                key={i}
                className={`text-lg transition-opacity duration-300 ${
                  i < lives ? "opacity-100" : "opacity-20"
                }`}
              >
                💚
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Instrucciones al inicio */}
      {isPlaying && score === 0 && lives === MAX_LIVES && (
        <div className="absolute inset-x-0 top-[28vh] text-center pointer-events-none z-[3] animate-pulse">
          <span className="text-sm font-medium text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-full">
            {t("circleninja.instruction")}
          </span>
        </div>
      )}

      {/* Pantalla IDLE — oculta: el Countdown del feed ya muestra instrucciones */}

      {/* Game Over */}
      {isEnded && (
        <GameOverPanel
          title="Game Over"
          score={score}
          subtitle={lives <= 0 ? t("circleninja.too_many_escaped") : t("circleninja.cut_red")}
          onNext={onNextGame}
          ranking={ranking}
          scoreMessage={scoreMessage}
          isLoading={isRankingLoading}
        />
      )}
    </div>
  );
};

export default CircleNinjaGame;
