/**
 * CoreEscapeGame.jsx — "Core Escape"
 *
 * Vertical 2-Lane Runner · One-Tap · 60 FPS
 *
 * El jugador controla un "Paquete de Datos" (chispa de luz)
 * que sube por un "Troncal de Fibra" (línea central fija).
 * Al tocar la pantalla, la chispa cambia instantáneamente
 * del lado IZQUIERDO al DERECHO del tronco y viceversa.
 *
 * Desde arriba caen "Cortafuegos" (obstáculos) por el carril
 * izquierdo o derecho. El objetivo es esquivarlos.
 * Score = "MB" extraídos (sube automáticamente con el tiempo).
 *
 * Zonas visuales:
 *  - Sector 1 (0-199 MB): Cyan · velocidad 1.0x
 *  - Sector 2 (200-499 MB): Naranja neón · velocidad 1.3x
 *  - Sector 3 (500+ MB): Rojo sangre · velocidad 1.6x
 *
 * Props:
 *   isActive   – cuando pasa a true, arranca el juego
 *   onNextGame – callback para "siguiente juego"
 *   onReplay   – callback para reiniciar
 *   userId     – ID del usuario logueado
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ─────────── Constantes ─────────── */
const STATES = { IDLE: "idle", PLAYING: "playing", ENDED: "ended" };

// Distancia horizontal del jugador/obstáculos al centro (px)
const LANE_OFFSET = 40;

// Player Y position (80% from top = 20% from bottom)
const PLAYER_Y_RATIO = 0.80;

// Obstacle dimensions
const OBS_WIDTH = 48;
const OBS_HEIGHT = 80;

// Player dimensions
const PLAYER_SIZE = 24;

// Spawning
const BASE_SPAWN_INTERVAL = 900;  // ms entre spawns base
const MIN_SPAWN_INTERVAL = 280;   // ms mínimo en sector 3

// Fair spawning: minimum reaction buffer (seconds) the player gets
// when obstacles switch lanes. At 512 px/s (zone 3), 220ms ≈ 13 frames.
const REACTION_BUFFER = 0.22;

// Probability of lane change per zone (higher zone = more lane switches)
const LANE_CHANGE_PROB = [0.35, 0.45, 0.55];

// Speeds (px/s base)
const BASE_SPEED = 320;

// Zone thresholds
const ZONE_2_THRESHOLD = 200;
const ZONE_3_THRESHOLD = 500;

// Zone speed multipliers
const ZONE_SPEEDS = [1.0, 1.3, 1.6];

// Zone spawn intervals
const ZONE_SPAWN_INTERVALS = [BASE_SPAWN_INTERVAL, 650, MIN_SPAWN_INTERVAL];

/* ─────────── Zone color configs ─────────── */
const ZONE_CONFIGS = [
  {
    // Sector 1: Cyan
    playerClass: "bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.8)]",
    lineClass: "bg-cyan-900/50",
    obsClass: "bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)]",
    trailColor: "rgba(34,211,238,0.15)",
    particleColor: "#22d3ee",
  },
  {
    // Sector 2: Naranja neón
    playerClass: "bg-orange-400 shadow-[0_0_20px_rgba(251,146,60,0.8)]",
    lineClass: "bg-orange-900/50",
    obsClass: "bg-orange-600 shadow-[0_0_10px_rgba(234,88,12,0.5)]",
    trailColor: "rgba(251,146,60,0.15)",
    particleColor: "#fb923c",
  },
  {
    // Sector 3: Rojo sangre
    playerClass: "bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.9)] animate-pulse",
    lineClass: "bg-red-900",
    obsClass: "bg-red-600 shadow-[0_0_15px_red]",
    trailColor: "rgba(239,68,68,0.15)",
    particleColor: "#ef4444",
  },
];

/* ═══════════════════ COMPONENT ═══════════════════ */
const CoreEscapeGame = ({ isActive, onNextGame, onReplay, userId }) => {
  const { t } = useLanguage();

  // Only these use useState (view-layer changes)
  const [gameState, setGameState] = useState(STATES.IDLE);
  const [currentZone, setCurrentZone] = useState(0);
  const [flash, setFlash] = useState(false); // zone transition flash
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);

  // All mutable game state lives in refs (NO re-renders)
  const playerLaneRef = useRef(-1);        // -1 = left, 1 = right
  const obstaclesRef = useRef([]);          // { id, lane, y, height }
  const scoreRef = useRef(0);
  const speedMultRef = useRef(1.0);
  const spawnTimerRef = useRef(0);
  const spawnIntervalRef = useRef(BASE_SPAWN_INTERVAL);
  const zoneRef = useRef(0);
  const obstacleIdRef = useRef(0);
  const lastTimeRef = useRef(null);
  const rafRef = useRef(null);
  const gameStateRef = useRef(STATES.IDLE);
  const containerRef = useRef(null);       // main container

  // Fair-spawning tracking refs
  const gameTimeRef = useRef(0);             // cumulative game time (seconds)
  const lastSpawnTimeRef = useRef(-Infinity); // game-time of last obstacle spawn
  const lastSpawnLaneRef = useRef(0);         // lane of last spawned obstacle (0 = none yet)
  const lastSpawnHeightRef = useRef(0);       // height of last spawned obstacle

  // DOM refs for direct manipulation (no re-renders)
  const playerRef = useRef(null);
  const scoreDisplayRef = useRef(null);
  const scoreBgRef = useRef(null);
  const lineRef = useRef(null);
  const obstaclePoolRef = useRef([]);       // pool of DOM elements
  const flashTimeoutRef = useRef(null);

  /* ── Zone tracker ── */
  const getZoneForScore = (s) => {
    if (s >= ZONE_3_THRESHOLD) return 2;
    if (s >= ZONE_2_THRESHOLD) return 1;
    return 0;
  };

  /* ── Start game ── */
  const startGame = useCallback(() => {
    playerLaneRef.current = -1;
    obstaclesRef.current = [];
    scoreRef.current = 0;
    speedMultRef.current = ZONE_SPEEDS[0];
    spawnTimerRef.current = 0;
    spawnIntervalRef.current = ZONE_SPAWN_INTERVALS[0];
    zoneRef.current = 0;
    obstacleIdRef.current = 0;
    lastTimeRef.current = null;
    gameStateRef.current = STATES.PLAYING;
    gameTimeRef.current = 0;
    lastSpawnTimeRef.current = -Infinity;
    lastSpawnLaneRef.current = 0;
    lastSpawnHeightRef.current = 0;
    setCurrentZone(0);
    setGameState(STATES.PLAYING);
    setFlash(false);

    // Clear obstacle pool DOM
    obstaclePoolRef.current.forEach((el) => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    obstaclePoolRef.current = [];

    // Position player on left lane initially
    if (playerRef.current) {
      const container = containerRef.current;
      if (container) {
        const cx = container.offsetWidth / 2;
        playerRef.current.style.transform = `translateX(${cx - LANE_OFFSET - PLAYER_SIZE / 2}px)`;
        playerRef.current.style.opacity = "1";
      }
    }

    // Reset score display
    if (scoreDisplayRef.current) {
      scoreDisplayRef.current.textContent = "0 MB";
    }
    if (scoreBgRef.current) {
      scoreBgRef.current.textContent = "0";
    }
  }, []);

  /* ── Auto-start ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, startGame, gameState]);

  /* ── Tap handler (switch lane) ── */
  const handleTap = useCallback(() => {
    if (gameStateRef.current !== STATES.PLAYING) return;
    playerLaneRef.current *= -1; // toggle lane

    // Instant DOM update for player position
    if (playerRef.current && containerRef.current) {
      const cx = containerRef.current.offsetWidth / 2;
      const targetX = playerLaneRef.current === -1
        ? cx - LANE_OFFSET - PLAYER_SIZE / 2
        : cx + LANE_OFFSET - PLAYER_SIZE / 2;
      playerRef.current.style.transform = `translateX(${targetX}px)`;
    }
  }, []);

  /* ── Create obstacle DOM element ── */
  const createObstacleDom = useCallback((zone) => {
    const el = document.createElement("div");
    el.className = `absolute rounded-md ${ZONE_CONFIGS[zone].obsClass}`;
    el.style.width = `${OBS_WIDTH}px`;
    el.style.position = "absolute";
    el.style.willChange = "transform";
    el.style.zIndex = "10";
    el.style.borderRadius = "6px";
    return el;
  }, []);

  /* ── Game Loop ── */
  useEffect(() => {
    if (gameState !== STATES.PLAYING || !isActive) return;

    const container = containerRef.current;
    if (!container) return;

    const W = () => container.offsetWidth;
    const H = () => container.offsetHeight;

    const playerY = () => H() * PLAYER_Y_RATIO;

    const tick = (timestamp) => {
      if (gameStateRef.current !== STATES.PLAYING) return;

      if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = timestamp;

      const containerW = W();
      const containerH = H();
      const cx = containerW / 2;
      const pY = playerY();

      // ── Update score ──
      scoreRef.current += dt * 30 * speedMultRef.current; // ~30 MB/s base
      const currentScore = Math.floor(scoreRef.current);

      // ── Check zone change ──
      const newZone = getZoneForScore(currentScore);
      if (newZone !== zoneRef.current) {
        zoneRef.current = newZone;
        speedMultRef.current = ZONE_SPEEDS[newZone];
        spawnIntervalRef.current = ZONE_SPAWN_INTERVALS[newZone];

        // Trigger zone transition flash
        setCurrentZone(newZone);
        setFlash(true);
        clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = setTimeout(() => setFlash(false), 200);
      }

      // ── Update score display (DOM direct) ──
      if (scoreDisplayRef.current) {
        scoreDisplayRef.current.textContent = `${currentScore} MB`;
      }
      if (scoreBgRef.current) {
        scoreBgRef.current.textContent = currentScore;
      }

      // ── Fair Spawn System ──
      // Unified spawner guaranteeing at least one safe lane.
      // When the new obstacle is on a DIFFERENT lane than the previous one,
      // we enforce a minimum time gap so the player always has enough
      // frames to react and tap.  Same-lane streaks need no extra gap
      // because the player simply stays on the opposite side.
      //
      // minLaneChangeTime = REACTION_BUFFER + (PLAYER_SIZE + prevHeight) / speed
      //   → the time for the previous obstacle's danger-zone to fully clear
      //     the player PLUS a human-reaction buffer.

      gameTimeRef.current += dt;
      spawnTimerRef.current -= dt * 1000;

      if (spawnTimerRef.current <= 0) {
        const currentSpeed = BASE_SPEED * speedMultRef.current;
        const obsH = 60 + Math.random() * 40; // 60-100px

        // How long since the last obstacle was spawned?
        const timeSinceLast = gameTimeRef.current - lastSpawnTimeRef.current;

        // Minimum time required before we can safely place an obstacle
        // on the OPPOSITE lane (derived from physics + reaction buffer).
        const minLaneChangeTime =
          REACTION_BUFFER +
          (PLAYER_SIZE + lastSpawnHeightRef.current) / currentSpeed;

        const canChangeLane =
          lastSpawnLaneRef.current === 0 || timeSinceLast >= minLaneChangeTime;

        // Decide intent: does the spawner WANT to switch lanes?
        const wantsChange =
          lastSpawnLaneRef.current !== 0 &&
          Math.random() < LANE_CHANGE_PROB[zoneRef.current];

        let lane;

        if (!lastSpawnLaneRef.current) {
          // Very first obstacle — pick randomly
          lane = Math.random() < 0.5 ? -1 : 1;
        } else if (wantsChange && canChangeLane) {
          // Safe to switch → opposite lane
          lane = -lastSpawnLaneRef.current;
        } else if (wantsChange && !canChangeLane) {
          // WANT to switch but not safe yet → delay this spawn
          const remainingMs = Math.max(
            16,
            (minLaneChangeTime - timeSinceLast) * 1000
          );
          spawnTimerRef.current = remainingMs;
          // Skip spawn this frame; the loop continues with movement & collisions
        } else {
          // Stay on the same lane (no danger, player stays on the other side)
          lane = lastSpawnLaneRef.current;
        }

        // Only spawn if we resolved a lane (not deferred)
        if (lane) {
          const obs = {
            id: obstacleIdRef.current++,
            lane,
            y: -obsH,
            height: obsH,
          };
          obstaclesRef.current.push(obs);

          // Create DOM element
          const el = createObstacleDom(zoneRef.current);
          el.style.height = `${obsH}px`;
          el.dataset.obsId = obs.id;
          container.appendChild(el);
          obstaclePoolRef.current.push(el);

          // Update tracking
          lastSpawnLaneRef.current = lane;
          lastSpawnTimeRef.current = gameTimeRef.current;
          lastSpawnHeightRef.current = obsH;

          // Schedule next spawn (with some randomness)
          spawnTimerRef.current =
            spawnIntervalRef.current * (0.8 + Math.random() * 0.4);
        }
      }

      // ── Move obstacles & check collisions ──
      const speed = BASE_SPEED * speedMultRef.current;
      const playerLane = playerLaneRef.current;
      const obstacles = obstaclesRef.current;
      const toRemove = [];

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.y += speed * dt;

        // Position DOM element
        const el = obstaclePoolRef.current.find(
          (e) => e && e.dataset.obsId === String(obs.id)
        );
        if (el) {
          const obsX = obs.lane === -1
            ? cx - LANE_OFFSET - OBS_WIDTH / 2
            : cx + LANE_OFFSET - OBS_WIDTH / 2;
          el.style.transform = `translate(${obsX}px, ${obs.y}px)`;
        }

        // Off-screen removal
        if (obs.y > containerH + 20) {
          toRemove.push(i);
          continue;
        }

        // ── Collision check ──
        // Same lane AND vertical overlap with player
        if (obs.lane === playerLane) {
          const obsTop = obs.y;
          const obsBottom = obs.y + obs.height;
          const playerTop = pY - PLAYER_SIZE / 2;
          const playerBottom = pY + PLAYER_SIZE / 2;

          if (obsBottom > playerTop && obsTop < playerBottom) {
            // GAME OVER
            gameStateRef.current = STATES.ENDED;
            const finalScore = Math.floor(scoreRef.current);
            setGameState(STATES.ENDED);
            return;
          }
        }
      }

      // ── Clean up off-screen obstacles ──
      for (const idx of toRemove) {
        const removed = obstacles.splice(idx, 1)[0];
        const poolIdx = obstaclePoolRef.current.findIndex(
          (e) => e && e.dataset.obsId === String(removed.id)
        );
        if (poolIdx !== -1) {
          const el = obstaclePoolRef.current[poolIdx];
          if (el && el.parentNode) el.parentNode.removeChild(el);
          obstaclePoolRef.current.splice(poolIdx, 1);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [gameState, isActive, createObstacleDom]);

  /* ── Cleanup on unmount ── */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(flashTimeoutRef.current);
      obstaclePoolRef.current.forEach((el) => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
    };
  }, []);

  /* ── Derived ── */
  const isPlaying = gameState === STATES.PLAYING;
  const isEnded = gameState === STATES.ENDED;
  const finalScore = Math.floor(scoreRef.current);
  const zone = ZONE_CONFIGS[currentZone];

  const { submit, loading: isSubmittingScore, xpGained, gameId } = useSubmitScore(
    userId,
    GAME_IDS.CoreEscapeGame
  );

  // Submit score on game end
  useEffect(() => {
    if (isEnded && !scoreSubmitted.current) {
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
    if (gameState === STATES.IDLE) {
      scoreSubmitted.current = false;
      setRanking([]);
      setScoreMessage("");
    }
  }, [isEnded, finalScore, submit, gameState, t]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-black touch-none select-none"
      onPointerDown={isPlaying ? handleTap : undefined}
    >
      {/* ── Overlay gradients for feed UI ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-[5]" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-[5]" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-[5]" />

      {/* ── Zone transition flash ── */}
      {flash && (
        <div className="absolute inset-0 bg-white/30 z-[50] pointer-events-none animate-[fadeOut_0.2s_ease-out_forwards]" />
      )}

      {/* ── Background score (giant, low opacity) ── */}
      <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
        <span
          ref={scoreBgRef}
          className="text-white/[0.06] text-[10rem] sm:text-[14rem] font-black tabular-nums leading-none select-none"
          style={{ fontFeatureSettings: "'tnum'" }}
        >
          0
        </span>
      </div>

      {/* ── Central fiber trunk (vertical line) ── */}
      <div
        ref={lineRef}
        className={`absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[3px] z-[1] transition-colors duration-500 ${zone.lineClass}`}
      />

      {/* ── Decorative grid lines (depth illusion) ── */}
      {isPlaying && (
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          {[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((ratio) => (
            <div
              key={ratio}
              className="absolute left-0 right-0 h-px bg-white/[0.03]"
              style={{ top: `${ratio * 100}%` }}
            />
          ))}
        </div>
      )}

      {/* ── Player (data spark) ── */}
      <div
        ref={playerRef}
        className={`absolute z-[15] rounded-full transition-[background-color,box-shadow] duration-500 ${zone.playerClass}`}
        style={{
          width: PLAYER_SIZE,
          height: PLAYER_SIZE,
          top: `${PLAYER_Y_RATIO * 100}%`,
          marginTop: -PLAYER_SIZE / 2,
          opacity: isPlaying ? 1 : 0,
          willChange: "transform",
        }}
      >
        {/* Inner glow core */}
        <div className="absolute inset-[3px] rounded-full bg-white/70" />
      </div>

      {/* ── HUD: Score display ── */}
      {gameState !== STATES.IDLE && (
        <div className="absolute top-22 left-0 right-0 flex justify-center z-[20] pointer-events-none">
          <span
            ref={scoreDisplayRef}
            className="text-3xl sm:text-4xl font-black text-white/90 tabular-nums tracking-tight"
            style={{
              fontFeatureSettings: "'tnum'",
              textShadow: "0 0 20px rgba(255,255,255,0.15)",
            }}
          >
            0 MB
          </span>
        </div>
      )}

      {/* ── HUD: Zone indicator ── */}
      {isPlaying && (
        <div className="absolute top-28 left-0 right-0 flex justify-center z-[20] pointer-events-none">
          <span
            className={`text-xs font-bold uppercase tracking-[0.3em] ${
              currentZone === 0
                ? "text-cyan-400/60"
                : currentZone === 1
                ? "text-orange-400/60"
                : "text-red-500/60"
            }`}
          >
            {currentZone === 0 && "SECTOR 1"}
            {currentZone === 1 && "SECTOR 2"}
            {currentZone === 2 && "SECTOR 3"}
          </span>
        </div>
      )}

      {/* ── Lane guides (subtle dotted lines) ── */}
      {isPlaying && (
        <>
          <div
            className="absolute top-0 bottom-0 w-px z-0 pointer-events-none"
            style={{
              left: `calc(50% - ${LANE_OFFSET}px)`,
              background: "repeating-linear-gradient(to bottom, transparent, transparent 8px, rgba(255,255,255,0.04) 8px, rgba(255,255,255,0.04) 16px)",
            }}
          />
          <div
            className="absolute top-0 bottom-0 w-px z-0 pointer-events-none"
            style={{
              left: `calc(50% + ${LANE_OFFSET}px)`,
              background: "repeating-linear-gradient(to bottom, transparent, transparent 8px, rgba(255,255,255,0.04) 8px, rgba(255,255,255,0.04) 16px)",
            }}
          />
        </>
      )}

      {/* ── Game Over ── */}
      {isEnded && (
        <div className="absolute inset-0 z-[30] flex flex-col items-center justify-center pointer-events-none">
          {/* Score display */}
          <div className="flex flex-col items-center gap-2 mb-4">
            <span
              className="text-7xl sm:text-8xl font-black text-white tabular-nums"
              style={{ fontFeatureSettings: "'tnum'" }}
            >
              {finalScore}
            </span>
            <span className="text-lg text-white/50 font-semibold">
              {t("coreescape.unit")}
            </span>
          </div>
        </div>
      )}

      {isEnded && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-auto z-[35]">
          <GameOverPanel
            title="Game Over"
            score={`${finalScore} MB`}
            subtitle={t("coreescape.subtitle")}
            onReplay={onReplay}
            onNext={onNextGame}
            ranking={ranking}
            scoreMessage={scoreMessage}
            xpGained={xpGained}
            gameId={gameId}
            isLoading={isRankingLoading}
          />
        </div>
      )}
    </div>
  );
};

export default CoreEscapeGame;
