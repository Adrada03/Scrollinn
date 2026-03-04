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
 * Zonas visuales (colores + dificultad continua):
 *  - Sector 1 (0-199 MB): Cyan
 *  - Sector 2 (200-499 MB): Naranja neón
 *  - Sector 3 (500+ MB): Rojo sangre → ∞
 *
 * Difficulty scales infinitely via continuous functions.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ═══════════════════ CONSTANTS ═══════════════════ */
const STATES = {
  IDLE: "idle",
  PLAYING: "playing",
  CRASHING: "crashing",
  ENDED: "ended",
};

// Layout
const LANE_OFFSET = 40;
const PLAYER_Y_RATIO = 0.80;
const OBS_WIDTH = 48;
const PLAYER_SIZE = 24;

// Spawning (base / floor)
const BASE_SPAWN_INTERVAL = 900; // ms
const MIN_SPAWN_INTERVAL = 180;  // absolute floor

// Fair spawning reaction buffers (seconds)
const BASE_REACTION_BUFFER = 0.24;
const MIN_REACTION_BUFFER = 0.13; // ~8 frames @ 60fps — absolute floor

// Speed (px/s base, before multiplier)
const BASE_SPEED = 310;

// Zone thresholds
const ZONE_2_THRESHOLD = 200;
const ZONE_3_THRESHOLD = 500;

// Crash animation
const CRASH_DELAY = 800; // ms before Game Over panel appears

// Trail
const TRAIL_COUNT = 4;

/* ─── Continuous difficulty scaling (infinite) ─── */
const getSpeedMult = (score) => {
  // 1.0 → 1.15 (zone 1), → 1.6 (zone 2-3 boundary), → ∞ log growth
  if (score < ZONE_2_THRESHOLD)
    return 1.0 + 0.15 * (score / ZONE_2_THRESHOLD);
  if (score < ZONE_3_THRESHOLD)
    return 1.15 + 0.45 * ((score - ZONE_2_THRESHOLD) / (ZONE_3_THRESHOLD - ZONE_2_THRESHOLD));
  // Beyond zone 3: logarithmic growth → never stalls, never plateaus
  return 1.6 + 0.18 * Math.log2(1 + (score - ZONE_3_THRESHOLD) / 200);
};

const getSpawnInterval = (score) => {
  // 900ms → 180ms via quadratic ease
  const t = Math.min(score / 1200, 1);
  return BASE_SPAWN_INTERVAL - (BASE_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL) * (t * t);
};

const getReactionBuffer = (score) => {
  // 0.24s → 0.13s linearly over 1500 score — never below 0.13s
  const t = Math.min(score / 1500, 1);
  return BASE_REACTION_BUFFER - (BASE_REACTION_BUFFER - MIN_REACTION_BUFFER) * t;
};

const getLaneChangeProb = (score) => {
  // 0.30 → 0.72 — more zigzags as you progress
  const t = Math.min(score / 800, 1);
  return 0.30 + 0.42 * t;
};

/* ─── Zone color configs ─── */
const ZONE_CONFIGS = [
  {
    // Sector 1: Cyan
    playerClass: "bg-cyan-400",
    playerGlow: "0 0 18px rgba(34,211,238,0.8), 0 0 40px rgba(34,211,238,0.3)",
    lineClass: "bg-cyan-900/50",
    obsClass: "bg-blue-600",
    obsGlow: "0 0 12px rgba(59,130,246,0.6), inset 0 0 6px rgba(147,197,253,0.3)",
    trailColor: "rgba(34,211,238,0.35)",
    particleColor: "#22d3ee",
    gridOpacity: 0.03,
  },
  {
    // Sector 2: Naranja neón
    playerClass: "bg-orange-400",
    playerGlow: "0 0 18px rgba(251,146,60,0.8), 0 0 40px rgba(251,146,60,0.3)",
    lineClass: "bg-orange-900/50",
    obsClass: "bg-orange-600",
    obsGlow: "0 0 12px rgba(234,88,12,0.6), inset 0 0 6px rgba(253,186,116,0.3)",
    trailColor: "rgba(251,146,60,0.35)",
    particleColor: "#fb923c",
    gridOpacity: 0.05,
  },
  {
    // Sector 3: Rojo sangre — triple glow (22px + 50px + 80px)
    playerClass: "bg-red-500",
    playerGlow:
      "0 0 22px rgba(239,68,68,0.9), 0 0 50px rgba(239,68,68,0.4), 0 0 80px rgba(239,68,68,0.15)",
    lineClass: "bg-red-900",
    obsClass: "bg-red-600",
    obsGlow:
      "0 0 15px rgba(239,68,68,0.7), 0 0 30px rgba(239,68,68,0.3), inset 0 0 8px rgba(252,165,165,0.3)",
    trailColor: "rgba(239,68,68,0.4)",
    particleColor: "#ef4444",
    gridOpacity: 0.06,
  },
];

/* ═══════════════════ COMPONENT ═══════════════════ */
const CoreEscapeGame = ({ isActive, onNextGame, onReplay, userId }) => {
  const { t } = useLanguage();

  /* ── View-layer state (triggers re-renders) ── */
  const [gameState, setGameState] = useState(STATES.IDLE);
  const [currentZone, setCurrentZone] = useState(0);
  const [flash, setFlash] = useState(false);
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const [showGameOver, setShowGameOver] = useState(false);
  const scoreSubmitted = useRef(false);

  /* ── Mutable game state (NO re-renders) ── */
  const playerLaneRef = useRef(-1);
  const obstaclesRef = useRef([]);
  const scoreRef = useRef(0);
  const speedMultRef = useRef(1.0);
  const spawnTimerRef = useRef(0);
  const zoneRef = useRef(0);
  const obstacleIdRef = useRef(0);
  const lastTimeRef = useRef(null);
  const rafRef = useRef(null);
  const gameStateRef = useRef(STATES.IDLE);
  const containerRef = useRef(null);

  // Fair-spawning tracking
  const gameTimeRef = useRef(0);
  const lastSpawnTimeRef = useRef(-Infinity);
  const lastSpawnLaneRef = useRef(0);
  const lastSpawnHeightRef = useRef(0);

  // DOM refs for direct manipulation
  const playerRef = useRef(null);
  const scoreDisplayRef = useRef(null);
  const scoreBgRef = useRef(null);
  const lineRef = useRef(null);
  const obstaclePoolRef = useRef([]);
  const flashTimeoutRef = useRef(null);

  // Crash + trail
  const crashTimeoutRef = useRef(null);
  const trailRefs = useRef([]);
  const trailHistory = useRef([]);

  /* ── Zone tracker ── */
  const getZoneForScore = (s) => {
    if (s >= ZONE_3_THRESHOLD) return 2;
    if (s >= ZONE_2_THRESHOLD) return 1;
    return 0;
  };

  /* ══════════ Start game ══════════ */
  const startGame = useCallback(() => {
    playerLaneRef.current = -1;
    obstaclesRef.current = [];
    scoreRef.current = 0;
    speedMultRef.current = 1.0;
    spawnTimerRef.current = 0;
    zoneRef.current = 0;
    obstacleIdRef.current = 0;
    lastTimeRef.current = null;
    gameStateRef.current = STATES.PLAYING;
    gameTimeRef.current = 0;
    lastSpawnTimeRef.current = -Infinity;
    lastSpawnLaneRef.current = 0;
    lastSpawnHeightRef.current = 0;
    trailHistory.current = [];

    setCurrentZone(0);
    setGameState(STATES.PLAYING);
    setShowGameOver(false);
    setFlash(false);

    // Clear crash timeout
    clearTimeout(crashTimeoutRef.current);

    // Clear obstacle pool DOM
    obstaclePoolRef.current.forEach((el) => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    obstaclePoolRef.current = [];

    // Position player on left lane
    if (playerRef.current) {
      const container = containerRef.current;
      if (container) {
        const cx = container.offsetWidth / 2;
        playerRef.current.style.transform = `translateX(${cx - LANE_OFFSET - PLAYER_SIZE / 2}px) scale(1)`;
        playerRef.current.style.opacity = "1";
        playerRef.current.style.boxShadow = "";
        playerRef.current.style.transition = "";
      }
    }

    // Reset trail
    trailRefs.current.forEach((el) => {
      if (el) el.style.opacity = "0";
    });

    // Remove shake class
    if (containerRef.current) {
      containerRef.current.classList.remove("ce-shake");
    }

    // Reset score display
    if (scoreDisplayRef.current) scoreDisplayRef.current.textContent = "0 MB";
    if (scoreBgRef.current) scoreBgRef.current.textContent = "0";
  }, []);

  /* ── Auto-start ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, startGame, gameState]);

  /* ══════════ Tap handler ══════════ */
  const handleTap = useCallback(() => {
    if (gameStateRef.current !== STATES.PLAYING) return;
    playerLaneRef.current *= -1;

    if (playerRef.current && containerRef.current) {
      const cx = containerRef.current.offsetWidth / 2;
      const targetX =
        playerLaneRef.current === -1
          ? cx - LANE_OFFSET - PLAYER_SIZE / 2
          : cx + LANE_OFFSET - PLAYER_SIZE / 2;
      playerRef.current.style.transform = `translateX(${targetX}px) scale(1)`;
    }
  }, []);

  /* ══════════ Create obstacle DOM ══════════ */
  const createObstacleDom = useCallback((zone) => {
    const cfg = ZONE_CONFIGS[zone];
    const el = document.createElement("div");
    el.className = `absolute rounded-md ${cfg.obsClass}`;
    el.style.width = `${OBS_WIDTH}px`;
    el.style.position = "absolute";
    el.style.willChange = "transform";
    el.style.zIndex = "10";
    el.style.borderRadius = "6px";
    // Neon glow + subtle white border
    el.style.boxShadow = cfg.obsGlow;
    el.style.borderTop = "1px solid rgba(255,255,255,0.15)";
    el.style.borderLeft = "1px solid rgba(255,255,255,0.08)";
    return el;
  }, []);

  /* ══════════ Crash handler ══════════ */
  const triggerCrash = useCallback(() => {
    gameStateRef.current = STATES.CRASHING;
    setGameState(STATES.CRASHING);

    // Screen shake via CSS class
    if (containerRef.current) {
      containerRef.current.classList.add("ce-shake");
    }

    // Player explosion: scale 1→3.5, white glow, fade out
    if (playerRef.current) {
      const currentTransform = playerRef.current.style.transform || "";
      const baseTranslate = currentTransform.replace(/scale\([^)]*\)/, "").trim();
      playerRef.current.style.transition =
        "transform 0.35s cubic-bezier(0.22,1,0.36,1), opacity 0.5s ease-out, box-shadow 0.15s";
      playerRef.current.style.transform = `${baseTranslate} scale(3.5)`;
      playerRef.current.style.boxShadow =
        "0 0 40px #fff, 0 0 80px #fff, 0 0 120px rgba(255,100,100,0.8)";
      setTimeout(() => {
        if (playerRef.current) playerRef.current.style.opacity = "0";
      }, 150);
    }

    // Hide trail immediately
    trailRefs.current.forEach((el) => {
      if (el) el.style.opacity = "0";
    });

    // After delay → show Game Over
    crashTimeoutRef.current = setTimeout(() => {
      gameStateRef.current = STATES.ENDED;
      setGameState(STATES.ENDED);
      setShowGameOver(true);
      if (containerRef.current) {
        containerRef.current.classList.remove("ce-shake");
      }
    }, CRASH_DELAY);
  }, []);

  /* ═══════════════════ GAME LOOP ═══════════════════ */
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

      /* ── Score ── */
      const currentSpeedMult = getSpeedMult(scoreRef.current);
      speedMultRef.current = currentSpeedMult;
      scoreRef.current += dt * 30 * currentSpeedMult;
      const currentScore = Math.floor(scoreRef.current);

      /* ── Zone change ── */
      const newZone = getZoneForScore(currentScore);
      if (newZone !== zoneRef.current) {
        zoneRef.current = newZone;
        setCurrentZone(newZone);
        setFlash(true);
        clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = setTimeout(() => setFlash(false), 350);

        // Update existing obstacle DOM for new zone colors
        const cfg = ZONE_CONFIGS[newZone];
        obstaclePoolRef.current.forEach((el) => {
          if (el) {
            el.className = `absolute rounded-md ${cfg.obsClass}`;
            el.style.boxShadow = cfg.obsGlow;
          }
        });
      }

      /* ── Score display (direct DOM) ── */
      if (scoreDisplayRef.current)
        scoreDisplayRef.current.textContent = `${currentScore} MB`;
      if (scoreBgRef.current)
        scoreBgRef.current.textContent = currentScore;

      /* ── Player glow per zone ── */
      if (playerRef.current) {
        playerRef.current.style.boxShadow = ZONE_CONFIGS[zoneRef.current].playerGlow;
      }

      /* ── Trail update ── */
      const playerX =
        playerLaneRef.current === -1
          ? cx - LANE_OFFSET
          : cx + LANE_OFFSET;

      trailHistory.current.unshift({ x: playerX, t: timestamp });
      if (trailHistory.current.length > 20) trailHistory.current.length = 20;

      const trailCfg = ZONE_CONFIGS[zoneRef.current];
      trailRefs.current.forEach((el, i) => {
        if (!el) return;
        const histIdx = (i + 1) * 3;
        const hist = trailHistory.current[histIdx];
        if (hist) {
          const age = (timestamp - hist.t) / 1000;
          const alpha = Math.max(0, 0.45 - i * 0.09 - age * 2);
          el.style.transform = `translate(${hist.x - 5}px, ${pY - 5}px)`;
          el.style.opacity = String(alpha);
          el.style.background = trailCfg.trailColor;
          el.style.boxShadow = `0 0 ${8 + i * 3}px ${trailCfg.trailColor}`;
        } else {
          el.style.opacity = "0";
        }
      });

      /* ══════════ Fair Spawn System ══════════
       *  Single unified spawner. When switching lanes, enforces a physics-
       *  based minimum gap so the player always has enough frames to react.
       *  Gap shrinks continuously with score, but NEVER below
       *  MIN_REACTION_BUFFER + clearance time.
       */
      gameTimeRef.current += dt;
      spawnTimerRef.current -= dt * 1000;

      if (spawnTimerRef.current <= 0) {
        const currentSpeed = BASE_SPEED * currentSpeedMult;
        const obsH = 60 + Math.random() * 40; // 60-100px

        const timeSinceLast = gameTimeRef.current - lastSpawnTimeRef.current;
        const reactionBuf = getReactionBuffer(currentScore);
        const minLaneChangeTime =
          reactionBuf + (PLAYER_SIZE + lastSpawnHeightRef.current) / currentSpeed;

        const canChangeLane =
          lastSpawnLaneRef.current === 0 || timeSinceLast >= minLaneChangeTime;

        const laneChangeProb = getLaneChangeProb(currentScore);
        const wantsChange =
          lastSpawnLaneRef.current !== 0 && Math.random() < laneChangeProb;

        let lane;

        if (!lastSpawnLaneRef.current) {
          // Very first obstacle — pick randomly
          lane = Math.random() < 0.5 ? -1 : 1;
        } else if (wantsChange && canChangeLane) {
          // Safe to switch → opposite lane
          lane = -lastSpawnLaneRef.current;
        } else if (wantsChange && !canChangeLane) {
          // Delay until safe
          const remainingMs = Math.max(
            16,
            (minLaneChangeTime - timeSinceLast) * 1000
          );
          spawnTimerRef.current = remainingMs;
        } else {
          // Stay on the same lane
          lane = lastSpawnLaneRef.current;
        }

        // Spawn if lane resolved (skip if deferred)
        if (lane) {
          const obs = {
            id: obstacleIdRef.current++,
            lane,
            y: -obsH,
            height: obsH,
          };
          obstaclesRef.current.push(obs);

          const el = createObstacleDom(zoneRef.current);
          el.style.height = `${obsH}px`;
          el.dataset.obsId = obs.id;
          container.appendChild(el);
          obstaclePoolRef.current.push(el);

          lastSpawnLaneRef.current = lane;
          lastSpawnTimeRef.current = gameTimeRef.current;
          lastSpawnHeightRef.current = obsH;

          const interval = getSpawnInterval(currentScore);
          spawnTimerRef.current = interval * (0.8 + Math.random() * 0.4);
        }
      }

      /* ── Move obstacles & collisions ── */
      const speed = BASE_SPEED * currentSpeedMult;
      const playerLane = playerLaneRef.current;
      const obstacles = obstaclesRef.current;
      const toRemove = [];

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.y += speed * dt;

        const el = obstaclePoolRef.current.find(
          (e) => e && e.dataset.obsId === String(obs.id)
        );
        if (el) {
          const obsX =
            obs.lane === -1
              ? cx - LANE_OFFSET - OBS_WIDTH / 2
              : cx + LANE_OFFSET - OBS_WIDTH / 2;
          el.style.transform = `translate(${obsX}px, ${obs.y}px)`;
        }

        if (obs.y > containerH + 20) {
          toRemove.push(i);
          continue;
        }

        // Collision
        if (obs.lane === playerLane) {
          const obsBottom = obs.y + obs.height;
          const playerTop = pY - PLAYER_SIZE / 2;
          const playerBottom = pY + PLAYER_SIZE / 2;

          if (obsBottom > playerTop && obs.y < playerBottom) {
            triggerCrash();
            return; // stop loop
          }
        }
      }

      // Cleanup off-screen
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
  }, [gameState, isActive, createObstacleDom, triggerCrash]);

  /* ── Cleanup on unmount ── */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(flashTimeoutRef.current);
      clearTimeout(crashTimeoutRef.current);
      obstaclePoolRef.current.forEach((el) => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
    };
  }, []);

  /* ══════════ Derived ══════════ */
  const isPlaying = gameState === STATES.PLAYING;
  const isCrashing = gameState === STATES.CRASHING;
  const isEnded = gameState === STATES.ENDED;
  const finalScore = Math.floor(scoreRef.current);
  const zone = ZONE_CONFIGS[currentZone];

  const {
    submit,
    loading: isSubmittingScore,
    xpGained,
    gameId,
  } = useSubmitScore(userId, GAME_IDS.CoreEscapeGame);

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

  /* ══════════ RENDER ══════════ */
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-black touch-none select-none"
      onPointerDown={isPlaying ? handleTap : undefined}
    >
      {/* ── Scoped CSS keyframes ── */}
      <style>{`
        @keyframes ce-screen-shake {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-6px, 3px); }
          20% { transform: translate(5px, -4px); }
          30% { transform: translate(-4px, 5px); }
          40% { transform: translate(6px, -2px); }
          50% { transform: translate(-3px, 4px); }
          60% { transform: translate(4px, -3px); }
          70% { transform: translate(-5px, 2px); }
          80% { transform: translate(3px, -4px); }
          90% { transform: translate(-2px, 3px); }
        }
        .ce-shake { animation: ce-screen-shake 0.5s ease-out; }
        @keyframes ce-fadeOut { to { opacity: 0; } }
        @keyframes ce-zoneFlash {
          0%   { opacity: 0.4; }
          50%  { opacity: 0.15; }
          100% { opacity: 0; }
        }
      `}</style>

      {/* ── Feed overlay gradients ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ── Zone transition flash (radial colored glow, 350ms) ── */}
      {flash && (
        <div
          className="absolute inset-0 z-50 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 40%, ${zone.particleColor}50, transparent 70%)`,
            animation: "ce-zoneFlash 0.35s ease-out forwards",
          }}
        />
      )}

      {/* ── Crash white flash overlay ── */}
      {isCrashing && (
        <div
          className="absolute inset-0 z-45 pointer-events-none"
          style={{
            background: "rgba(255,255,255,0.3)",
            animation: "ce-fadeOut 0.6s ease-out forwards",
          }}
        />
      )}

      {/* ── Background score (giant, low opacity) ── */}
      <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
        <span
          ref={scoreBgRef}
          className="text-white/6 text-[10rem] sm:text-[14rem] font-black tabular-nums leading-none select-none"
          style={{ fontFeatureSettings: "'tnum'" }}
        >
          0
        </span>
      </div>

      {/* ── Central fiber trunk ── */}
      <div
        ref={lineRef}
        className={`absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.75 z-1 transition-colors duration-500 ${zone.lineClass}`}
      />

      {/* ── Decorative grid lines (dynamic opacity per zone) ── */}
      {(isPlaying || isCrashing) && (
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          {[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((ratio) => (
            <div
              key={ratio}
              className="absolute left-0 right-0 h-px transition-opacity duration-700"
              style={{
                top: `${ratio * 100}%`,
                backgroundColor: `rgba(255,255,255,${zone.gridOpacity ?? 0.03})`,
              }}
            />
          ))}
        </div>
      )}

      {/* ── Trail elements (4 ghost divs, positioned by game loop) ── */}
      {Array.from({ length: TRAIL_COUNT }).map((_, i) => (
        <div
          key={`trail-${i}`}
          ref={(el) => (trailRefs.current[i] = el)}
          className="absolute z-14 rounded-full pointer-events-none"
          style={{
            width: 10,
            height: 10,
            opacity: 0,
            willChange: "transform, opacity",
            filter: `blur(${2 + i}px)`,
          }}
        />
      ))}

      {/* ── Player (data spark) ── */}
      <div
        ref={playerRef}
        className={`absolute z-15 rounded-full ${zone.playerClass}`}
        style={{
          width: PLAYER_SIZE,
          height: PLAYER_SIZE,
          top: `${PLAYER_Y_RATIO * 100}%`,
          marginTop: -PLAYER_SIZE / 2,
          opacity: isPlaying || isCrashing ? 1 : 0,
          willChange: "transform",
          boxShadow: zone.playerGlow,
          transition: isCrashing
            ? "transform 0.35s cubic-bezier(0.22,1,0.36,1), opacity 0.4s ease-out, box-shadow 0.15s"
            : "background-color 0.5s, box-shadow 0.5s",
        }}
      >
        {/* Inner glow core */}
        <div className="absolute inset-0.75 rounded-full bg-white/70" />
      </div>

      {/* ── HUD: Zone badge (pill) + Score (separated, no overlap) ── */}
      {gameState !== STATES.IDLE && (
        <div className="absolute top-[calc(var(--sat,0px)+6rem)] left-0 right-0 flex flex-col items-center z-20 pointer-events-none gap-1.5">
          {/* Zone badge — compact pill ABOVE score */}
          {(isPlaying || isCrashing) && (
            <span
              className={`text-[10px] font-black uppercase tracking-[0.4em] px-3 py-0.5 rounded-full border transition-colors duration-500 ${
                currentZone === 0
                  ? "text-cyan-400/80 border-cyan-400/20 bg-cyan-950/40"
                  : currentZone === 1
                  ? "text-orange-400/80 border-orange-400/20 bg-orange-950/40"
                  : "text-red-500/80 border-red-500/20 bg-red-950/40"
              }`}
            >
              SECTOR {currentZone + 1}
            </span>
          )}

          {/* Score */}
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

      {/* ── Lane guides ── */}
      {(isPlaying || isCrashing) && (
        <>
          <div
            className="absolute top-0 bottom-0 w-px z-0 pointer-events-none"
            style={{
              left: `calc(50% - ${LANE_OFFSET}px)`,
              background:
                "repeating-linear-gradient(to bottom, transparent, transparent 8px, rgba(255,255,255,0.04) 8px, rgba(255,255,255,0.04) 16px)",
            }}
          />
          <div
            className="absolute top-0 bottom-0 w-px z-0 pointer-events-none"
            style={{
              left: `calc(50% + ${LANE_OFFSET}px)`,
              background:
                "repeating-linear-gradient(to bottom, transparent, transparent 8px, rgba(255,255,255,0.04) 8px, rgba(255,255,255,0.04) 16px)",
            }}
          />
        </>
      )}

      {/* ── Game Over (delayed via showGameOver after crash animation) ── */}
      {showGameOver && isEnded && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-auto z-35">
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
