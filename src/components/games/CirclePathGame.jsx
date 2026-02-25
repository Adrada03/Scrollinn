/**
 * CirclePathGame.jsx — "Circle Path"
 *
 * Dos bolas conectadas por un brazo orbitan entre sí.
 * El jugador toca para cambiar qué bola rota, intentando
 * aterrizar en los círculos objetivo que forman un camino.
 *
 * - Toca cuando la bola rotante esté sobre el siguiente objetivo
 * - Si aciertas → se cambia la rotación y el camino avanza
 * - Si fallas → Game Over
 *
 * Reimplementado con Canvas 2D puro (sin Phaser).
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

const BALL_DISTANCE = 120;
const ROTATION_SPEED_MIN = 1.0;
const ROTATION_SPEED_MAX = 4.5;
const ROTATION_SPEED_RAMP = 0.07; // incremento por punto
const ANGLE_RANGE = [25, 155];
const VISIBLE_TARGETS = 7;
const BALL_RADIUS = 22;
const TARGET_RADIUS = 30;
const HIT_THRESHOLD = 23.5;
const APPROACH_THRESHOLD = 40;
const MISS_THRESHOLD = 90;

const BG_COLOR = "#0f2922";   // fondo suave esmeralda oscuro
const FG_COLOR = "#e2e8f0";   // bolas y brazo (slate-200)

/* ─────────── Helpers ─────────── */

function rand(min, max) {
  return min + Math.random() * (max - min);
}
function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}
function degToRad(deg) {
  return (deg * Math.PI) / 180;
}
function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/* ─────────── Inicialización de partida ─────────── */

function initGameState(s) {
  s.gameState = GAME_STATES.PLAYING;
  s.score = 0;
  s.steps = 0;
  s.destroy = false;

  s.bgColor = BG_COLOR;
  s.fgColor = FG_COLOR;

  // Posiciones virtuales (base 640×960)
  const cx = 320;
  const cy = (960 / 4) * 2.7; // ≈ 648

  s.balls[0] = { x: cx, y: cy };
  s.balls[1] = { x: cx, y: cy + BALL_DISTANCE }; // directamente debajo

  s.rotatingBall = 1;
  s.rotationAngle = 0;
  s.rotationDirection = randInt(0, 1) * 2 - 1; // -1 ó 1

  // Offset de cámara (inicializar directamente al objetivo, sin interpolación)
  const anchorX = s.w / 2;
  const anchorY = s.h * 0.55;
  s.cameraOffsetX = anchorX - s.balls[0].x * s.scale;
  s.cameraOffsetY = anchorY - s.balls[0].y * s.scale;

  // Crear objetivos
  s.targets = [];
  s.targets.push({ x: cx, y: cy, step: 0, alpha: 1 });
  for (let i = 0; i < VISIBLE_TARGETS; i++) {
    addTarget(s);
  }
}

function addTarget(s) {
  s.steps++;
  const last = s.targets[s.targets.length - 1];
  const randomAngle = randInt(ANGLE_RANGE[0] + 90, ANGLE_RANGE[1] + 90);
  const nx = last.x + BALL_DISTANCE * Math.sin(degToRad(randomAngle));
  const ny = last.y + BALL_DISTANCE * Math.cos(degToRad(randomAngle));
  const alpha = 1 - s.targets.length * (1 / 7);
  s.targets.push({ x: nx, y: ny, step: s.steps, alpha: Math.max(0.08, alpha) });
}

/* ─────────── Componente React ─────────── */

const CirclePathGame = ({ isActive, onNextGame, onReplay, userId, pinchGuardRef }) => {
  const { t } = useLanguage();
  const canvasRef = useRef(null);
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);
  const stateRef = useRef({
    gameState: GAME_STATES.IDLE,
    score: 0,
    balls: [
      { x: 320, y: 648 },
      { x: 320, y: 768 },
    ],
    rotatingBall: 1,
    rotationAngle: 0,
    rotationDirection: 1,
    targets: [],
    steps: 0,
    destroy: false,
    bgColor: BG_COLOR,
    fgColor: FG_COLOR,
    cameraOffsetX: 0,
    cameraOffsetY: 0,
    w: 0,
    h: 0,
    scale: 1,
    animId: null,
  });

  const hasStartedRef = useRef(false);
  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState(GAME_STATES.IDLE);

  /* ── Arrancar cuando isActive llega ── */
  useEffect(() => {
    if (
      isActive &&
      !hasStartedRef.current &&
      stateRef.current.gameState === GAME_STATES.IDLE
    ) {
      hasStartedRef.current = true;
      initGameState(stateRef.current);
      setScore(0);
      setGameState(GAME_STATES.PLAYING);
    }
  }, [isActive]);

  /* ── Restart ── */
  const handleRestart = useCallback(() => {
    const s = stateRef.current;
    initGameState(s);
    setScore(0);
    setGameState(GAME_STATES.PLAYING);
  }, []);

  /* ── Canvas + Game loop ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const s = stateRef.current;

    /* ── Resize ── */
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
      s.scale = Math.min(s.w / 640, s.h / 960);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);

    /* ── Tap handler ── */
    function onTap(e) {
      e.preventDefault();
      if (s.gameState !== GAME_STATES.PLAYING) return;
      if (pinchGuardRef?.current) return;              // LEY 5

      s.destroy = false;
      const rotBall = s.balls[s.rotatingBall];
      const target = s.targets[1];
      if (!target) return;

      const d = dist(rotBall.x, rotBall.y, target.x, target.y);

      if (d < HIT_THRESHOLD) {
        /* ✅ Acierto */
        s.rotationDirection = randInt(0, 1) * 2 - 1;

        // Eliminar objetivo anterior
        s.targets.shift();

        // Actualizar alfas
        for (let i = 0; i < s.targets.length; i++) {
          s.targets[i].alpha = Math.min(1, s.targets[i].alpha + 1 / 7);
        }

        // Cambiar bola rotante
        s.rotatingBall = 1 - s.rotatingBall;

        // Recalcular ángulo de rotación
        const fixedBall = s.balls[1 - s.rotatingBall];
        const newRotBall = s.balls[s.rotatingBall];
        s.rotationAngle =
          (Math.atan2(
            -(newRotBall.x - fixedBall.x),
            newRotBall.y - fixedBall.y
          ) *
            180) /
          Math.PI;

        // Añadir nuevo objetivo
        addTarget(s);

        // Actualizar score
        s.score = Math.max(0, s.steps - VISIBLE_TARGETS);
        setScore(s.score);
      } else {
        /* ❌ Game Over */
        endGame(s);
      }
    }

    function endGame(s) {
      s.gameState = GAME_STATES.ENDED;
      setGameState(GAME_STATES.ENDED);
    }

    canvas.addEventListener("mousedown", onTap);
    canvas.addEventListener("touchstart", onTap, { passive: false });

    /* ── Dibujar objetivo ── */
    function drawTarget(t, s) {
      ctx.save();
      ctx.globalAlpha = Math.max(0.08, t.alpha);

      // Círculo exterior
      ctx.beginPath();
      ctx.arc(t.x, t.y, TARGET_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Brillo sutil interior
      ctx.beginPath();
      ctx.arc(t.x, t.y, TARGET_RADIUS * 0.65, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fill();

      // Número del paso
      if (t.step > 0) {
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 22px Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(t.step.toString(), t.x, t.y + 1);
      }

      ctx.restore();
    }

    /* ── Dibujar bola ── */
    function drawBall(b, color) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Brillo interior
      ctx.beginPath();
      ctx.arc(
        b.x - BALL_RADIUS * 0.22,
        b.y - BALL_RADIUS * 0.22,
        BALL_RADIUS * 0.38,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fill();
    }

    /* ── Game loop ── */
    function loop() {
      s.animId = requestAnimationFrame(loop);
      const { w, h } = s;

      // Fondo
      ctx.fillStyle = s.gameState === GAME_STATES.IDLE ? BG_COLOR : s.bgColor;
      ctx.fillRect(0, 0, w, h);

      if (s.gameState === GAME_STATES.IDLE) return;

      const sc = s.scale;

      /* ── Actualizar física ── */
      if (s.gameState === GAME_STATES.PLAYING) {
        // Velocidad incremental: empieza suave, sube con cada punto
        const speed = Math.min(
          ROTATION_SPEED_MAX,
          ROTATION_SPEED_MIN + s.score * ROTATION_SPEED_RAMP
        );
        // Rotar
        s.rotationAngle =
          (s.rotationAngle + speed * s.rotationDirection) % 360;

        // Mover bola rotante
        const fixed = s.balls[1 - s.rotatingBall];
        s.balls[s.rotatingBall].x =
          fixed.x - BALL_DISTANCE * Math.sin(degToRad(s.rotationAngle));
        s.balls[s.rotatingBall].y =
          fixed.y + BALL_DISTANCE * Math.cos(degToRad(s.rotationAngle));

        // Comprobar proximidad al objetivo
        if (s.targets[1]) {
          const rotBall = s.balls[s.rotatingBall];
          const target = s.targets[1];
          const d = dist(rotBall.x, rotBall.y, target.x, target.y);

          if (d < APPROACH_THRESHOLD && !s.destroy) {
            s.destroy = true;
          }
          if (d > MISS_THRESHOLD && s.destroy && s.steps > VISIBLE_TARGETS) {
            endGame(s);
          }
        }
      }

      /* ── Cámara ── */
      const anchorX = w / 2;
      const anchorY = h * 0.55;
      const followBall = s.balls[1 - s.rotatingBall];
      const targetCamX = anchorX - followBall.x * sc;
      const targetCamY = anchorY - followBall.y * sc;
      s.cameraOffsetX = lerp(s.cameraOffsetX, targetCamX, 0.05);
      s.cameraOffsetY = lerp(s.cameraOffsetY, targetCamY, 0.05);

      ctx.save();
      ctx.translate(s.cameraOffsetX, s.cameraOffsetY);
      ctx.scale(sc, sc);

      /* ── Dibujar objetivos ── */
      for (let i = 0; i < s.targets.length; i++) {
        drawTarget(s.targets[i], s);
      }

      /* ── Dibujar brazo ── */
      ctx.beginPath();
      ctx.moveTo(s.balls[0].x, s.balls[0].y);
      ctx.lineTo(s.balls[1].x, s.balls[1].y);
      ctx.strokeStyle = s.fgColor;
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.stroke();

      /* ── Dibujar bolas ── */
      drawBall(s.balls[0], s.fgColor);
      drawBall(s.balls[1], s.fgColor);

      ctx.restore();
    }

    s.animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(s.animId);
      ro.disconnect();
      canvas.removeEventListener("mousedown", onTap);
      canvas.removeEventListener("touchstart", onTap);
    };
  }, []);

  const { submit, loading: isSubmittingScore, error: submitError, lastResult, xpGained } = useSubmitScore(userId, GAME_IDS.CirclePathGame);
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

  const isPlaying = gameState === GAME_STATES.PLAYING;
  const isEnded = gameState === GAME_STATES.ENDED;

  return (
    <div className="w-full h-full relative overflow-hidden">
      {/* Canvas */}
      <div className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
        />
      </div>

      {/* Gradientes para UI de Scrollinn */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-gradient-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-[5]" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/30 to-transparent pointer-events-none z-[5]" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-black/15 to-transparent pointer-events-none z-[5]" />

      {/* HUD: Score */}
      {gameState !== GAME_STATES.IDLE && (
        <div className="absolute top-16 inset-x-0 flex items-center justify-center pointer-events-none z-[3]">
          <span
            className="text-white/80 text-2xl font-black tabular-nums"
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {score}
          </span>
        </div>
      )}

      {/* Instrucciones al inicio */}
      {isPlaying && score === 0 && (
        <div className="absolute inset-x-0 top-[28vh] text-center pointer-events-none z-[3] animate-pulse">
          <span className="text-sm font-medium text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-full">
            {t("circlepath.instruction")}
          </span>
        </div>
      )}

      {/* Pantalla IDLE — oculta: el Countdown del feed ya muestra instrucciones */}

      {/* Game Over */}
      {/* Game Over */}
      {isEnded && (
        <GameOverPanel
          title="Game Over"
          score={score}
          subtitle={t("circlepath.reached", { score, unit: score === 1 ? t("circlepath.point") : t("circlepath.points") })}
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

export default CirclePathGame;
