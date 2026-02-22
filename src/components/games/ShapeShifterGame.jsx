/**
 * ShapeShifterGame.jsx — "Shape Shifter"
 *
 * Juego de reflejos: cambia la forma del jugador para que coincida
 * con la forma enemiga que cae. Si coinciden → +1 punto.
 * Si no → Game Over.
 *
 * Props:
 *   isActive   – cuando pasa a true, arranca el juego
 *   onNextGame – callback para "siguiente juego"
 *   onReplay   – callback para replay
 *   userId     – usuario logueado (para enviar puntuación)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Circle, Square, Triangle } from "lucide-react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage } from "../../i18n";

/* ─────────── Constantes ─────────── */
const STATES = { IDLE: "idle", PLAYING: "playing", ENDED: "ended" };

const SHAPES = ["circle", "square", "triangle"];

const SHAPE_CONFIG = {
  circle:   { Icon: Circle,   color: "text-red-500",     glow: "rgba(239,68,68,0.6)",  bg: "rgba(239,68,68,0.15)" },
  square:   { Icon: Square,   color: "text-blue-500",    glow: "rgba(59,130,246,0.6)",  bg: "rgba(59,130,246,0.15)" },
  triangle: { Icon: Triangle, color: "text-emerald-500", glow: "rgba(16,185,129,0.6)",  bg: "rgba(16,185,129,0.15)" },
};

/* Zona de colisión: posición Y normalizada (0 = top, 1 = bottom)
   El jugador está en ~0.82, la hitzone empieza un poco antes */
const PLAYER_Y = 0.82;
const HIT_ZONE_TOP = 0.76;
const HIT_ZONE_BOT = 0.88;

/* Velocidades */
const BASE_SPEED = 0.004;       // unidades normalizadas por frame (~60fps)
const SPEED_MULTIPLIER = 0.00025; // incremento por punto

/* ─────────── Helpers ─────────── */
function pickNextShape(exclude) {
  const candidates = SHAPES.filter((s) => s !== exclude);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/* ═══════════════════ COMPONENT ═══════════════════ */
const ShapeShifterGame = ({ isActive, onNextGame, onReplay, userId }) => {
  const { t } = useLanguage();
  const containerRef = useRef(null);

  /* ── Estado React ── */
  const [gameState, setGameState] = useState(STATES.IDLE);
  const [score, setScore] = useState(0);
  const [playerShape, setPlayerShape] = useState("circle");
  const [enemyShape, setEnemyShape] = useState("square");
  const [enemyY, setEnemyY] = useState(0);
  const [flash, setFlash] = useState(null); // null | "success" | "fail"
  const [ranking, setRanking] = useState([]);
  const [scoreMessage, setScoreMessage] = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);

  /* ── Refs mutables para el game loop ── */
  const gameStateRef = useRef(STATES.IDLE);
  const scoreRef = useRef(0);
  const playerShapeRef = useRef("circle");
  const enemyShapeRef = useRef("square");
  const enemyYRef = useRef(-0.08);
  const rafRef = useRef(null);
  const scoreSubmitted = useRef(false);
  const flashTimeoutRef = useRef(null);
  const hitProcessedRef = useRef(false);

  const { submit } = useSubmitScore(userId, GAME_IDS.ShapeShifterGame);

  /* ─────────── Spawn nuevo enemigo ─────────── */
  const spawnEnemy = useCallback(() => {
    const nextShape = pickNextShape(enemyShapeRef.current);
    enemyShapeRef.current = nextShape;
    enemyYRef.current = -0.08;
    hitProcessedRef.current = false;
    setEnemyShape(nextShape);
    setEnemyY(-0.08);
  }, []);

  /* ─────────── Arrancar partida ─────────── */
  const startGame = useCallback(() => {
    scoreRef.current = 0;
    gameStateRef.current = STATES.PLAYING;
    playerShapeRef.current = "circle";
    hitProcessedRef.current = false;

    setScore(0);
    setPlayerShape("circle");
    setGameState(STATES.PLAYING);
    setFlash(null);

    // Generar primer enemigo
    const first = pickNextShape("circle");
    enemyShapeRef.current = first;
    enemyYRef.current = -0.08;
    setEnemyShape(first);
    setEnemyY(-0.08);
  }, []);

  /* ── Auto-start ── */
  useEffect(() => {
    if (isActive && gameState === STATES.IDLE) startGame();
  }, [isActive, startGame, gameState]);

  /* ─────────── Game Loop (requestAnimationFrame) ─────────── */
  useEffect(() => {
    if (gameState !== STATES.PLAYING) return;

    const tick = () => {
      if (gameStateRef.current !== STATES.PLAYING) return;

      const speed = BASE_SPEED + scoreRef.current * SPEED_MULTIPLIER;
      enemyYRef.current += speed;

      // Comprobar si entró en la hit zone
      if (!hitProcessedRef.current && enemyYRef.current >= HIT_ZONE_TOP) {
        if (enemyYRef.current <= HIT_ZONE_BOT) {
          // En la zona de colisión — comprobar formas
          hitProcessedRef.current = true;

          if (playerShapeRef.current === enemyShapeRef.current) {
            // ¡ACIERTO!
            scoreRef.current += 1;
            setScore(scoreRef.current);
            setFlash("success");
            clearTimeout(flashTimeoutRef.current);
            flashTimeoutRef.current = setTimeout(() => setFlash(null), 300);
            spawnEnemy();
          } else {
            // FALLO — Game Over
            setFlash("fail");
            gameStateRef.current = STATES.ENDED;
            setGameState(STATES.ENDED);
            return;
          }
        }
      }

      // Si pasó completamente la hit zone sin ser procesado → game over
      if (!hitProcessedRef.current && enemyYRef.current > HIT_ZONE_BOT) {
        hitProcessedRef.current = true;
        setFlash("fail");
        gameStateRef.current = STATES.ENDED;
        setGameState(STATES.ENDED);
        return;
      }

      setEnemyY(enemyYRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [gameState, spawnEnemy]);

  /* ── Cleanup ── */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  /* ─────────── Cambiar forma del jugador (tap) ─────────── */
  const handleTap = useCallback(() => {
    if (gameStateRef.current !== STATES.PLAYING) return;

    const idx = SHAPES.indexOf(playerShapeRef.current);
    const next = SHAPES[(idx + 1) % SHAPES.length];
    playerShapeRef.current = next;
    setPlayerShape(next);
  }, []);

  /* ── Enviar puntuación al terminar ── */
  useEffect(() => {
    if (gameState === STATES.ENDED && !scoreSubmitted.current) {
      scoreSubmitted.current = true;
      setIsRankingLoading(true);
      submit(scoreRef.current, () => {})
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
  }, [gameState, submit, t]);

  /* ── Derivados ── */
  const isPlaying = gameState === STATES.PLAYING;
  const isEnded = gameState === STATES.ENDED;

  const playerCfg = SHAPE_CONFIG[playerShape];
  const enemyCfg = SHAPE_CONFIG[enemyShape];
  const PlayerIcon = playerCfg.Icon;
  const EnemyIcon = enemyCfg.Icon;

  /* ─────────── RENDER ─────────── */
  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden select-none bg-zinc-900"
      onPointerDown={isPlaying ? handleTap : undefined}
      style={{ cursor: isPlaying ? "pointer" : "default", touchAction: "none" }}
    >
      {/* ── Fondo: líneas sutiles verticales ── */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "repeating-linear-gradient(90deg, white 0px, white 1px, transparent 1px, transparent 40px)",
        }}
      />

      {/* ── Overlay gradients para UI del feed ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ── HUD: Score ── */}
      {gameState !== STATES.IDLE && (
        <div className="absolute top-16 left-0 right-0 flex items-center justify-center z-3">
          <span
            className="text-4xl font-black text-white tabular-nums drop-shadow-lg"
            style={{ fontFeatureSettings: "'tnum'", textShadow: "0 0 20px rgba(255,255,255,0.2)" }}
          >
            {score}
          </span>
        </div>
      )}

      {/* ── Flash de acierto (destello) ── */}
      {flash === "success" && (
        <div
          className="absolute inset-0 pointer-events-none z-4 transition-opacity duration-200"
          style={{ background: "radial-gradient(circle at 50% 80%, rgba(255,255,255,0.25), transparent 60%)" }}
        />
      )}

      {/* ── Flash de fallo ── */}
      {flash === "fail" && (
        <div
          className="absolute inset-0 pointer-events-none z-4"
          style={{ background: "radial-gradient(circle at 50% 80%, rgba(239,68,68,0.3), transparent 60%)" }}
        />
      )}

      {/* ═══════════ GAME SCENE ═══════════ */}
      {isPlaying && (
        <>
          {/* ── Línea de referencia (hit zone) ── */}
          <div
            className="absolute left-0 right-0 pointer-events-none"
            style={{
              top: `${HIT_ZONE_TOP * 100}%`,
              height: `${(HIT_ZONE_BOT - HIT_ZONE_TOP) * 100}%`,
              background: "linear-gradient(to bottom, rgba(255,255,255,0.03), rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          />

          {/* ── Enemigo (cayendo) ── */}
          <div
            className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center transition-none"
            style={{
              top: `${enemyY * 100}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div
              className="relative flex items-center justify-center"
              style={{
                filter: `drop-shadow(0 0 12px ${enemyCfg.glow})`,
              }}
            >
              <EnemyIcon
                className={`${enemyCfg.color} drop-shadow-lg`}
                size={52}
                strokeWidth={2}
              />
            </div>
          </div>

          {/* ── Jugador (abajo, fijo) ── */}
          <div
            className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center"
            style={{ top: `${PLAYER_Y * 100}%`, transform: "translateX(-50%)" }}
          >
            {/* Anillo brillante activo */}
            <div
              className="absolute rounded-full"
              style={{
                width: 96,
                height: 96,
                background: playerCfg.bg,
                boxShadow: `0 0 30px ${playerCfg.glow}, 0 0 60px ${playerCfg.glow}40`,
                border: `2px solid ${playerCfg.glow}`,
              }}
            />
            <div
              className="relative flex items-center justify-center"
              style={{
                filter: `drop-shadow(0 0 16px ${playerCfg.glow})`,
              }}
            >
              <PlayerIcon
                className={`${playerCfg.color}`}
                size={72}
                strokeWidth={2.5}
              />
            </div>
          </div>

          {/* ── Indicador de formas (mini guía abajo) ── */}
          <div className="absolute bottom-[10vh] inset-x-0 flex justify-center gap-6 pointer-events-none z-3">
            {SHAPES.map((s) => {
              const cfg = SHAPE_CONFIG[s];
              const ShapeIcon = cfg.Icon;
              const isActive = s === playerShape;
              return (
                <div
                  key={s}
                  className={`flex items-center justify-center rounded-full transition-all duration-150 ${
                    isActive ? "scale-125 opacity-100" : "scale-90 opacity-30"
                  }`}
                  style={{
                    width: 36,
                    height: 36,
                    background: isActive ? cfg.bg : "transparent",
                    boxShadow: isActive ? `0 0 12px ${cfg.glow}` : "none",
                  }}
                >
                  <ShapeIcon className={cfg.color} size={20} strokeWidth={2} />
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Hint IDLE ── */}
      {gameState === STATES.IDLE && (
        <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
          <div className="flex flex-col items-center gap-3 animate-pulse">
            <img
              src="/logo-shapeshifter.png"
              alt="Shape Shifter"
              className="w-16 h-16 object-contain drop-shadow-lg"
              draggable={false}
            />
            <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
              {t("desc.shape-shifter")}
            </span>
          </div>
        </div>
      )}

      {/* ── Instrucción durante juego ── */}
      {isPlaying && (
        <div className="absolute bottom-[22vh] inset-x-0 flex justify-center pointer-events-none z-3">
          <span className="text-xs font-medium text-white/25 tracking-wider uppercase">
            {t("shapeshifter.instruction")}
          </span>
        </div>
      )}

      {/* ── GAME OVER panel ── */}
      {isEnded && (
        <GameOverPanel
          title="Game Over"
          score={score}
          subtitle={t("shapeshifter.subtitle")}
          onReplay={onReplay}
          onNext={onNextGame}
          ranking={ranking}
          scoreMessage={scoreMessage}
          isLoading={isRankingLoading}
        />
      )}
    </div>
  );
};

export default ShapeShifterGame;
