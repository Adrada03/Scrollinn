/**
 * DodgeRushGame.jsx — "Dodge Rush"
 *
 * Minijuego de esquiva: el jugador mueve un escudo/círculo
 * arrastrando el dedo (touch) o el ratón por la pantalla.
 * Bolas rojas caen desde arriba. Si una te golpea, pierdes
 * 1 de 3 vidas. La dificultad sube progresivamente:
 * más bolas y más rápido.
 *
 * Puntuación = segundos sobrevividos (redondeados).
 *
 * Props:
 *   isActive   – cuando pasa a true, arranca el juego
 *   onNextGame – callback para "siguiente juego"
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";

/* ─────────── Constantes ─────────── */
const STATES = { IDLE: "idle", PLAYING: "playing", ENDED: "ended" };

const IS_DESKTOP =
  typeof window !== "undefined" &&
  window.matchMedia("(pointer: fine)").matches;

const MAX_LIVES = 3;
const PLAYER_R  = IS_DESKTOP ? 26 : 20;  // radio del jugador (px)

// Obstáculos — formas geométricas variadas
const SHAPES = ["circle", "triangle", "square", "diamond", "hexagon", "pentagon"];
const OBS_COLORS = [
  "#ef4444", "#f97316", "#f43f5e", "#e11d48",
  "#dc2626", "#fb923c", "#be123c",
];
const BASE_MIN_R = IS_DESKTOP ? 10 : 8;   // radio mínimo obstáculo
const BASE_MAX_R = IS_DESKTOP ? 32 : 26;  // radio máximo obstáculo
const INITIAL_SPEED     = 190;  // px/s velocidad inicial de caída
const SPEED_INCREMENT   = 10;   // px/s extra por segundo de partida
const INITIAL_SPAWN_INT = 700;  // ms entre spawns al principio
const MIN_SPAWN_INT     = 120;  // ms mínimo entre spawns
const SPAWN_ACCEL       = 0.96; // multiplicador del intervalo por spawn
const BATCH_EXTRA_CHANCE = 0.35; // prob. de spawnear 2-3 extra por ciclo

const HIT_COOLDOWN      = 400;  // ms de invulnerabilidad tras golpe

/* ── Helpers para crear/dibujar obstáculos ── */
const randomShape = () => SHAPES[Math.floor(Math.random() * SHAPES.length)];
const randomColor = () => OBS_COLORS[Math.floor(Math.random() * OBS_COLORS.length)];
const randomRadius = () => BASE_MIN_R + Math.random() * (BASE_MAX_R - BASE_MIN_R);

const spawnObstacle = (H) => ({
  x: Math.random(),
  y: -0.05,
  r: randomRadius(),
  shape: randomShape(),
  color: randomColor(),
  rot: Math.random() * Math.PI * 2,        // rotación inicial
  rotSpeed: (Math.random() - 0.5) * 3,     // rad/s
  speedMult: 0.8 + Math.random() * 0.4,    // variación velocidad ×0.8-1.2
});

const drawShape = (ctx, shape, x, y, r, rot, color) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();

  switch (shape) {
    case "circle":
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      break;
    case "triangle":
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
        ctx[i === 0 ? "moveTo" : "lineTo"](Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      break;
    case "square":
      ctx.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
      break;
    case "diamond":
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.7, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.7, 0);
      ctx.closePath();
      break;
    case "hexagon":
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx[i === 0 ? "moveTo" : "lineTo"](Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      break;
    case "pentagon":
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        ctx[i === 0 ? "moveTo" : "lineTo"](Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      break;
    default:
      ctx.arc(0, 0, r, 0, Math.PI * 2);
  }

  ctx.fillStyle = color;
  ctx.fill();
  // Glow — convertir hex a rgba con alpha 0.5
  const hex = color.replace("#", "");
  const cr = parseInt(hex.slice(0, 2), 16);
  const cg = parseInt(hex.slice(2, 4), 16);
  const cb = parseInt(hex.slice(4, 6), 16);
  ctx.shadowColor = `rgba(${cr}, ${cg}, ${cb}, 0.5)`;
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
};

/* ═══════════════════ COMPONENT ═══════════════════ */
const DodgeRushGame = ({ isActive, onNextGame, userId }) => {
  const [gameState, setGameState] = useState(STATES.IDLE);
  const [score, setScore]         = useState(0);
  const [lives, setLives]         = useState(MAX_LIVES);
  const [flash, setFlash]         = useState(false);
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  // Refs para el game loop
  const canvasRef      = useRef(null);
  const rafRef         = useRef(null);
  const lastTimeRef    = useRef(null);
  const elapsedRef     = useRef(0);
  const ballsRef       = useRef([]);
  const playerRef      = useRef({ x: 0.5, y: 0.85 }); // posición normalizada (0-1)
  const livesRef       = useRef(MAX_LIVES);
  const spawnTimerRef  = useRef(0);
  const spawnIntRef    = useRef(INITIAL_SPAWN_INT);
  const invulnRef      = useRef(false);
  const invulnTORef    = useRef(null);
  const flashTORef     = useRef(null);
  const gameStateRef   = useRef(STATES.IDLE);

  /* ── Arrancar partida ── */
  const startGame = useCallback(() => {
    setScore(0);
    setLives(MAX_LIVES);
    setFlash(false);
    livesRef.current     = MAX_LIVES;
    ballsRef.current     = [];
    playerRef.current    = { x: 0.5, y: 0.85 };
    elapsedRef.current   = 0;
    spawnTimerRef.current = 0;
    spawnIntRef.current  = INITIAL_SPAWN_INT;
    invulnRef.current    = false;
    lastTimeRef.current  = null;
    gameStateRef.current = STATES.PLAYING;
    setGameState(STATES.PLAYING);
  }, []);

  /* ── Auto-start ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, startGame, gameState]);

  /* ── Pointer tracking (mouse + touch) ── */
  useEffect(() => {
    if (gameState !== STATES.PLAYING) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const updatePos = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      playerRef.current = {
        x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
      };
    };

    const onMouse = (e) => updatePos(e.clientX, e.clientY);
    const onTouch = (e) => {
      e.preventDefault();
      const t = e.touches[0];
      if (t) updatePos(t.clientX, t.clientY);
    };

    canvas.addEventListener("mousemove", onMouse);
    canvas.addEventListener("touchmove", onTouch, { passive: false });
    canvas.addEventListener("touchstart", onTouch, { passive: false });

    return () => {
      canvas.removeEventListener("mousemove", onMouse);
      canvas.removeEventListener("touchmove", onTouch);
      canvas.removeEventListener("touchstart", onTouch);
    };
  }, [gameState]);

  /* ── Game loop (rAF) ── */
  useEffect(() => {
    if (gameState !== STATES.PLAYING) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width  = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const tick = (timestamp) => {
      if (gameStateRef.current !== STATES.PLAYING) return;

      if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05); // cap delta
      lastTimeRef.current = timestamp;
      elapsedRef.current += dt;

      const W = canvas.getBoundingClientRect().width;
      const H = canvas.getBoundingClientRect().height;

      // Velocidad actual de caída
      const currentSpeed = INITIAL_SPEED + SPEED_INCREMENT * elapsedRef.current;

      // ── Spawn obstáculos ──
      spawnTimerRef.current -= dt * 1000;
      if (spawnTimerRef.current <= 0) {
        ballsRef.current.push(spawnObstacle(H));
        // Chance de batch extra (2-3 más) para oleadas densas
        if (Math.random() < BATCH_EXTRA_CHANCE) {
          const extra = 1 + Math.floor(Math.random() * 2);
          for (let e = 0; e < extra; e++) {
            ballsRef.current.push(spawnObstacle(H));
          }
        }
        spawnIntRef.current = Math.max(MIN_SPAWN_INT, spawnIntRef.current * SPAWN_ACCEL);
        spawnTimerRef.current = spawnIntRef.current;
      }

      // ── Mover obstáculos ──
      const balls = ballsRef.current;
      for (let i = balls.length - 1; i >= 0; i--) {
        const ob = balls[i];
        ob.y += (currentSpeed * ob.speedMult / H) * dt;
        ob.rot += ob.rotSpeed * dt;
        // Fuera de pantalla → eliminar
        if (ob.y > 1 + ob.r / H + 0.05) {
          balls.splice(i, 1);
        }
      }

      // ── Colisiones ──
      if (!invulnRef.current) {
        const px = playerRef.current.x * W;
        const py = playerRef.current.y * H;
        for (let i = balls.length - 1; i >= 0; i--) {
          const ob = balls[i];
          const bx = ob.x * W;
          const by = ob.y * H;
          const dist = Math.hypot(px - bx, py - by);
          if (dist < PLAYER_R + ob.r * 0.8) {
            // Golpe
            balls.splice(i, 1);
            livesRef.current -= 1;
            setLives(livesRef.current);
            setFlash(true);
            clearTimeout(flashTORef.current);
            flashTORef.current = setTimeout(() => setFlash(false), 300);

            if (livesRef.current <= 0) {
              gameStateRef.current = STATES.ENDED;
              setScore(Math.floor(elapsedRef.current));
              setGameState(STATES.ENDED);
              return;
            }

            // Invulnerabilidad temporal
            invulnRef.current = true;
            clearTimeout(invulnTORef.current);
            invulnTORef.current = setTimeout(() => {
              invulnRef.current = false;
            }, HIT_COOLDOWN);
            break;
          }
        }
      }

      // ── Actualizar score ──
      setScore(Math.floor(elapsedRef.current));

      // ── Dibujar ──
      ctx.clearRect(0, 0, W, H);

      // Obstáculos
      for (const ob of balls) {
        drawShape(ctx, ob.shape, ob.x * W, ob.y * H, ob.r, ob.rot, ob.color);
      }

      // Jugador
      const px = playerRef.current.x * W;
      const py = playerRef.current.y * H;
      const isInvuln = invulnRef.current;

      ctx.beginPath();
      ctx.arc(px, py, PLAYER_R, 0, Math.PI * 2);
      ctx.fillStyle = isInvuln
        ? `rgba(147, 197, 253, ${0.4 + 0.4 * Math.sin(elapsedRef.current * 20)})`
        : "rgba(147, 197, 253, 0.9)";
      ctx.fill();
      // Glow
      ctx.shadowColor = isInvuln
        ? "rgba(147, 197, 253, 0.3)"
        : "rgba(147, 197, 253, 0.6)";
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Borde
      ctx.beginPath();
      ctx.arc(px, py, PLAYER_R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 2;
      ctx.stroke();

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [gameState]);

  /* ── Cleanup global ── */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(invulnTORef.current);
      clearTimeout(flashTORef.current);
    };
  }, []);

  /* ── Derivados ── */
  const isPlaying = gameState === STATES.PLAYING;
  const isEnded   = gameState === STATES.ENDED;

  const { submit, loading: isSubmittingScore, error: submitError, lastResult } = useSubmitScore(userId, GAME_IDS.DodgeRushGame);
  // Enviar puntuación al terminar
  useEffect(() => {
    if (isEnded && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submit(score, () => {})
        .then((result) => {
          setRanking(result?.data?.ranking || []);
          setScoreMessage(result?.message || "");
        })
        .catch(() => setScoreMessage("Error al enviar puntuación."))
        .finally(() => setIsRankingLoading(false));
    }
    if (gameState === STATES.IDLE) {
      scoreSubmitted.current = false;
      setRanking([]);
      setScoreMessage("");
    }
  }, [isEnded, score, submit, gameState]);

  return (
    <div className="relative h-full w-full flex items-center justify-center bg-zinc-950 overflow-hidden select-none">

      {/* ── Overlay gradients para UI del feed ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* Flash de golpe */}
      {flash && (
        <div className="absolute inset-0 bg-red-500/20 z-4 pointer-events-none transition-opacity" />
      )}

      {/* ── Canvas de juego ── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full z-1"
        style={{ touchAction: "none" }}
      />

      {/* ── HUD ── */}
      <div className="relative w-full h-full z-2 pointer-events-none">

        {/* Score + Vidas */}
        {gameState !== STATES.IDLE && (
          <div className="absolute top-16 left-0 right-0 flex items-center justify-between px-8">
            <span className="text-3xl font-black text-white tabular-nums" style={{ fontFeatureSettings: "'tnum'" }}>
              {score}<span className="text-sm font-semibold text-white/40 ml-1">s</span>
            </span>
            <div className="flex gap-1.5">
              {Array.from({ length: MAX_LIVES }).map((_, i) => (
                <span
                  key={i}
                  className={`text-xl transition-all duration-200 ${
                    i < lives ? "opacity-100 scale-100" : "opacity-20 scale-75"
                  }`}
                >
                  ❤️
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Hint IDLE — oculto: el Countdown del feed ya muestra instrucciones ── */}

        {/* ── Resultado final ── */}
        {isEnded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="flex flex-col items-center gap-2 mb-4">
              <span className="text-7xl sm:text-8xl font-black text-white tabular-nums" style={{ fontFeatureSettings: "'tnum'" }}>
                {score}
              </span>
              <span className="text-lg text-white/50 font-semibold">
                segundos
              </span>
            </div>
          </div>
        )}

        {/* ── GAME OVER ── */}
        {isEnded && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
            <GameOverPanel
              title="Game Over"
              score={`${score}s`}
              subtitle="sobrevividos"
              onNext={onNextGame}
              ranking={ranking}
              scoreMessage={scoreMessage}
              isLoading={isRankingLoading}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default DodgeRushGame;
