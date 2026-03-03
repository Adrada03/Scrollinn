/**
 * NeonChronoGame.jsx — "Neon Chrono" v2
 *
 * Minijuego de tensión a ciegas: Hold & Release.
 * El jugador ve el objetivo → pulsa → el cronómetro arranca INVISIBLE
 * desde el ms 1 → suelta cuando crea que ha llegado al tiempo.
 *
 * Flujo simplificado:
 *   WAITING_FOR_TAP → HOLDING → RESULT → GAMEOVER
 *
 * - Generación incremental infinita (mín 3.00s, +rand cada ronda).
 * - Margen proporcional al target (~10 %, decreciente).
 * - Precisión milimétrica: performance.now() en useRef.
 *
 * Props (estándar Scrollinn):
 *   isActive · onNextGame · onReplay · userId
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import GameOverPanel from "../GameOverPanel";
import { useSubmitScore, GAME_IDS } from "../../services/useSubmitScore";
import { useLanguage, t } from "../../i18n";

/* ══════════════════════════════════════════════════════════════════
   GENERACIÓN DE RONDAS — Incremental infinita
   ──────────────────────────────────────────────────────────────── 
   target  = 3.00 + round * rand(0.8 … 1.5)  (nunca < 3.00)
   margin  = target * marginPct               (proporcional)
   perfect = target * 0.015                   (1.5 % del target)
   marginPct empieza en 12 % y baja 0.4 % por ronda (mín 5 %)
   ══════════════════════════════════════════════════════════════════ */
const BASE_TIME = 3.0;            // segundos mínimos
const INC_MIN   = 0.8;            // incremento mínimo por ronda
const INC_MAX   = 1.5;            // incremento máximo por ronda
const MARGIN_START = 0.12;        // 12 % inicial
const MARGIN_DECAY = 0.004;       // –0.4 % por ronda
const MARGIN_FLOOR = 0.05;        // 5 % mínimo
const PERFECT_PCT  = 0.015;       // 1.5 % → "perfect"

/** Genera target + márgenes para la ronda dada (determinista por seed) */
function generateRound(index, seedRef) {
  // Pseudo-random determinista por ronda (para que no cambie en re-render)
  if (!seedRef.current[index]) {
    seedRef.current[index] = INC_MIN + Math.random() * (INC_MAX - INC_MIN);
  }
  const inc    = seedRef.current[index];
  const target = Math.max(3, Math.round(BASE_TIME + index * inc));

  const marginPct = Math.max(MARGIN_FLOOR, MARGIN_START - index * MARGIN_DECAY);
  const margin    = +(target * marginPct).toFixed(2);
  const perfect   = +(target * PERFECT_PCT).toFixed(2);

  return { target, margin, perfect };
}

/* ─────────── Estados del juego ─────────── */
const PHASE = {
  WAITING_FOR_TAP: "WAITING_FOR_TAP",   // muestra objetivo, espera tap
  HOLDING:         "HOLDING",            // dedo puesto, cronómetro invisible
  RESULT:          "RESULT",             // breve feedback acertó
  GAMEOVER:        "GAMEOVER",           // fin
};

/* ─────────── Colores neón rotativos ─────────── */
const NEON = [
  { text: "text-cyan-400",    glow: "0 0 30px rgba(34,211,238,0.8),  0 0 80px rgba(34,211,238,0.35)",   rgb: "34,211,238"  },
  { text: "text-fuchsia-400", glow: "0 0 30px rgba(232,121,249,0.8), 0 0 80px rgba(232,121,249,0.35)",  rgb: "232,121,249" },
  { text: "text-lime-400",    glow: "0 0 30px rgba(163,230,53,0.8),  0 0 80px rgba(163,230,53,0.35)",   rgb: "163,230,53"  },
  { text: "text-amber-400",   glow: "0 0 30px rgba(251,191,36,0.8),  0 0 80px rgba(251,191,36,0.35)",   rgb: "251,191,36"  },
  { text: "text-rose-400",    glow: "0 0 30px rgba(251,113,133,0.8), 0 0 80px rgba(251,113,133,0.35)",  rgb: "251,113,133" },
];

/* ─────────── Helpers ─────────── */
function fmtTime(s) { return Math.max(0, s).toFixed(2); }

/* Inline keyframes (inyectadas una sola vez) */
const STYLE_ID = "__neonchrono_kf";
function ensureKeyframes() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes nc-radar{0%{transform:scale(.35);opacity:.55}100%{transform:scale(1.6);opacity:0}}
    @keyframes nc-pulse-border{0%,100%{opacity:.15}50%{opacity:.6}}
    @keyframes nc-flash{0%{opacity:.85}100%{opacity:0}}
    @keyframes nc-fadein{0%{opacity:0;transform:scale(.92)}100%{opacity:1;transform:scale(1)}}
    @keyframes nc-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
    @keyframes nc-scan-rotate{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
    @keyframes nc-scan-sweep{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
    @keyframes nc-core-idle{0%,100%{box-shadow:0 0 30px 5px rgba(34,211,238,0.15),inset 0 0 30px rgba(34,211,238,0.05)}50%{box-shadow:0 0 60px 15px rgba(34,211,238,0.3),inset 0 0 50px rgba(34,211,238,0.1)}}
    @keyframes nc-ring-drift{0%,100%{transform:scale(1);opacity:.18}50%{transform:scale(1.04);opacity:.35}}
    @keyframes nc-heartbeat{0%,100%{transform:scale(1)}8%{transform:scale(1.12)}16%{transform:scale(1)}24%{transform:scale(1.08)}32%{transform:scale(1)}}
    @keyframes nc-hold-expand{0%{transform:scale(.3);opacity:.6}100%{transform:scale(2.8);opacity:0}}
    @keyframes nc-edge-throb{0%,100%{opacity:.08}50%{opacity:.25}}
    @keyframes nc-dot-float{0%,100%{transform:translateY(0) scale(1);opacity:.3}50%{transform:translateY(-8px) scale(1.3);opacity:.7}}
  `;
  document.head.appendChild(style);
}

/* ═══════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ═══════════════════════════════════════════════════════════════════ */
const NeonChronoGame = ({ isActive, onNextGame, onReplay, userId }) => {
  useLanguage();

  /* ── Inyectar keyframes al montar ── */
  useEffect(ensureKeyframes, []);

  /* ── Estado del juego ── */
  const [phase, setPhase]          = useState(PHASE.WAITING_FOR_TAP);
  const [round, setRound]          = useState(0);
  const [perfects, setPerfects]    = useState(0);
  const [resultDiff, setResultDiff]     = useState(null);
  const [isPerfectHit, setIsPerfectHit] = useState(false);
  const [flashColor, setFlashColor]     = useState(null); // "green" | "red" | "gold" | null
  const [elapsedTime, setElapsedTime]   = useState(null); // tiempo real al soltar
  const [resultDidPass, setResultDidPass] = useState(null); // true = acierto, false = fallo

  /* ── Refs de precisión milimétrica ── */
  const startRef   = useRef(0);       // performance.now() al pointerDown
  const resultTimer = useRef(null);   // timeout para avanzar tras RESULT
  const seedRef     = useRef({});     // incrementos random por ronda

  /* ── Score submission ── */
  const [ranking, setRanking]             = useState([]);
  const [scoreMessage, setScoreMessage]   = useState("");
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const scoreSubmitted = useRef(false);
  const { submit, xpGained, gameId } =
    useSubmitScore(userId, GAME_IDS.NeonChronoGame);

  /* ── Derivados ── */
  const neon       = NEON[round % NEON.length];
  const roundCfg   = useMemo(() => generateRound(round, seedRef), [round]);
  const isWaiting  = phase === PHASE.WAITING_FOR_TAP;
  const isHolding  = phase === PHASE.HOLDING;
  const isResult   = phase === PHASE.RESULT;
  const isGameOver = phase === PHASE.GAMEOVER;

  /* ── Limpieza ── */
  useEffect(() => () => { if (resultTimer.current) clearTimeout(resultTimer.current); }, []);

  /* ══════════════════════════════════════════════════════════════
     POINTER DOWN — Arranque instantáneo a ciegas
     ══════════════════════════════════════════════════════════════ */
  const handlePointerDown = useCallback(() => {
    if (phase !== PHASE.WAITING_FOR_TAP) return;

    // Capturar instante exacto en ref (sin setState)
    startRef.current = performance.now();
    setFlashColor(null);
    setResultDiff(null);
    setIsPerfectHit(false);
    setElapsedTime(null);
    setResultDidPass(null);
    setPhase(PHASE.HOLDING);
  }, [phase]);

  /* ══════════════════════════════════════════════════════════════
     POINTER UP — Evaluar resultado
     ══════════════════════════════════════════════════════════════ */
  const handlePointerUp = useCallback(() => {
    if (phase !== PHASE.HOLDING) return;

    const elapsed = (performance.now() - startRef.current) / 1000;
    const cfg     = generateRound(round, seedRef);
    const diff    = Math.abs(elapsed - cfg.target);
    const passed  = diff <= cfg.margin;
    const wasPerfect = passed && diff <= cfg.perfect;

    setElapsedTime(elapsed);
    setResultDiff(diff);
    setIsPerfectHit(wasPerfect);
    setResultDidPass(passed);
    setFlashColor(wasPerfect ? "gold" : passed ? "green" : "red");

    if (wasPerfect) setPerfects((p) => p + 1);

    // Siempre pasar a RESULT (el useEffect se encarga de la transición)
    setPhase(PHASE.RESULT);
  }, [phase, round]);

  /* ══════════════════════════════════════════════════════════════
     RESULT → TRANSICIÓN RETARDADA
     ══════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (phase !== PHASE.RESULT || resultDidPass === null) return;

    const delay = resultDidPass
      ? (isPerfectHit ? 1800 : 1500)
      : 2000;

    resultTimer.current = setTimeout(() => {
      if (resultDidPass) {
        setRound((r) => r + 1);
        setFlashColor(null);
        setPhase(PHASE.WAITING_FOR_TAP);
      } else {
        setFlashColor(null);
        setPhase(PHASE.GAMEOVER);
      }
    }, delay);

    return () => { if (resultTimer.current) clearTimeout(resultTimer.current); };
  }, [phase, resultDidPass, isPerfectHit]);

  /* ══════════════════════════════════════════════════════════════
     SUBMIT SCORE
     ══════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (phase !== PHASE.GAMEOVER || scoreSubmitted.current) return;
    scoreSubmitted.current = true;
    setIsRankingLoading(true);
    submit(round, () => {})
      .then((r) => {
        setRanking(r?.data?.ranking || []);
        setScoreMessage(r?.message || "");
      })
      .catch(() => setScoreMessage(t("svc.score_error")))
      .finally(() => setIsRankingLoading(false));
  }, [phase, round, submit]);

  /* ── Game Over title ── */
  const gameOverTitle = round >= 10
    ? t("neonchrono.title_legendary")
    : round >= 5
      ? t("neonchrono.title_great")
      : "Game Over";

  /* ══════════════════════════════════════════════════════════════
     FLASH COLOR MAP
     ══════════════════════════════════════════════════════════════ */
  const flashMap = {
    green: "rgba(34,197,94,0.45)",
    red:   "rgba(220,38,38,0.50)",
    gold:  "rgba(255,255,255,0.55)",
  };

  /* ══════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════ */
  return (
    <div
      className={`relative h-full w-full flex flex-col items-center justify-center overflow-hidden select-none touch-none transition-colors duration-200
        ${isHolding ? "bg-[#050510]" : "bg-zinc-950"}`}
      onPointerDown={isActive && isWaiting ? handlePointerDown : undefined}
      onPointerUp={isActive ? handlePointerUp : undefined}
      onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: "none", WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
    >
      {/* ── Feed overlay gradients (safe zones) ── */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-linear-to-t from-black/50 via-black/20 to-transparent pointer-events-none z-5" />
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none z-5" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-linear-to-l from-black/15 to-transparent pointer-events-none z-5" />

      {/* ═══════════════════════════════════════════════════════
          FULL-SCREEN FLASH (resultado al soltar)
          ═══════════════════════════════════════════════════════ */}
      {flashColor && (
        <div
          key={`flash-${round}-${flashColor}`}
          className="absolute inset-0 z-40 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${flashMap[flashColor]}, transparent 75%)`,
            animation: "nc-flash 0.6s ease-out forwards",
          }}
        />
      )}

      {/* ═══════════════════════════════════════════════════════
          PHASE: WAITING_FOR_TAP  —  Objetivo + Círculo pulsante
          ═══════════════════════════════════════════════════════ */}
      {isWaiting && isActive && (
        <div
          className="relative w-full h-full flex flex-col items-center justify-center z-2 px-6"
          style={{ animation: "nc-fadein 0.4s ease" }}
        >
          {/* ── Fondo: grid sutil cyberpunk ── */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
               style={{ backgroundImage: "linear-gradient(rgba(34,211,238,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.3) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

          {/* ── Ronda (badge) ── */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] font-bold tracking-[0.35em] uppercase text-white/20">
              {t("neonchrono.round")}
            </span>
            <span className="text-sm font-black tabular-nums text-cyan-400" style={{ textShadow: "0 0 12px rgba(34,211,238,0.6)" }}>
              {round + 1}
            </span>
          </div>

          {/* ── Etiqueta OBJETIVO ── */}
          <span className="text-[10px] font-semibold tracking-[0.3em] uppercase text-cyan-300/40 mb-1">
            {t("neonchrono.target")}
          </span>

          {/* ── Tiempo objetivo — Premium gradient glow ── */}
          <span
            className="text-7xl sm:text-8xl font-black font-mono tabular-nums leading-none text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-blue-500"
            style={{
              fontFeatureSettings: "'tnum'",
              filter: "drop-shadow(0 0 20px rgba(34,211,238,0.7)) drop-shadow(0 0 60px rgba(59,130,246,0.3))",
            }}
          >
            {roundCfg.target}
          </span>
          <span className="text-[10px] text-cyan-400/25 tracking-widest mt-1 uppercase">
            {t("neonchrono.seconds")}
          </span>

          {/* Perfects acumulados */}
          {perfects > 0 && (
            <span className="text-fuchsia-400 text-xs font-bold mt-3 tracking-wide"
                  style={{ textShadow: "0 0 10px rgba(232,121,249,0.5)" }}>
              ⚡ {perfects} PERFECT{perfects > 1 ? "S" : ""}
            </span>
          )}

          {/* ══ Escáner Biométrico — Núcleo de Energía Inactivo ══ */}
          <div className="relative mt-10 flex items-center justify-center" style={{ width: "16rem", height: "16rem" }}>

            {/* Anillo 5 — Borde exterior giratorio lento */}
            <div
              className="absolute rounded-full"
              style={{
                width: "15rem", height: "15rem",
                border: "1px dashed rgba(34,211,238,0.08)",
                animation: "nc-scan-rotate 25s linear infinite",
              }}
            />

            {/* Anillo 4 — Ring expandiéndose */}
            <div
              className="absolute rounded-full"
              style={{
                width: "12rem", height: "12rem",
                border: "1px solid rgba(34,211,238,0.10)",
                animation: "nc-radar 3.5s ease-out infinite",
              }}
            />

            {/* Anillo 3 — Drift suave */}
            <div
              className="absolute rounded-full"
              style={{
                width: "10.5rem", height: "10.5rem",
                border: "1.5px solid rgba(34,211,238,0.12)",
                animation: "nc-ring-drift 4s ease-in-out infinite",
              }}
            />

            {/* Anillo 2 — Resplandeciente principal */}
            <div
              className="absolute rounded-full"
              style={{
                width: "9rem", height: "9rem",
                border: "2px solid rgba(34,211,238,0.20)",
                boxShadow: "0 0 30px 4px rgba(34,211,238,0.08), inset 0 0 30px rgba(34,211,238,0.04)",
                animation: "nc-breathe 2.5s ease-in-out infinite",
              }}
            />

            {/* Sweep line — barrido de radar */}
            <div
              className="absolute"
              style={{
                width: "9rem", height: "9rem",
                animation: "nc-scan-sweep 4s linear infinite",
              }}
            >
              <div style={{
                width: "50%", height: "1px",
                background: "linear-gradient(90deg, rgba(34,211,238,0.4), transparent)",
                position: "absolute", top: "50%", left: "50%",
                transformOrigin: "0% 50%",
              }} />
            </div>

            {/* Núcleo central — escáner biométrico */}
            <div
              className="w-28 h-28 sm:w-32 sm:h-32 rounded-full flex items-center justify-center relative"
              style={{
                background: "radial-gradient(circle, rgba(34,211,238,0.08) 0%, rgba(34,211,238,0.02) 50%, transparent 100%)",
                border: "1.5px solid rgba(34,211,238,0.25)",
                animation: "nc-core-idle 3s ease-in-out infinite",
              }}
            >
              {/* Icono fingerprint/escáner */}
              <svg className="w-11 h-11 sm:w-13 sm:h-13" fill="none" viewBox="0 0 24 24" strokeWidth="1.2" stroke="rgba(34,211,238,0.55)"
                   style={{ filter: "drop-shadow(0 0 10px rgba(34,211,238,0.4))" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a48.667 48.667 0 00-1.26 8.303M12 10.5a3 3 0 11-6 0 3 3 0 016 0zm0 0a48.667 48.667 0 01-1.26 8.303M9.75 10.5a3.001 3.001 0 00-2.008 2.303M12 10.5c0 .463-.013.923-.038 1.38M15 10.5a48.544 48.544 0 01-1.538 10.065m2.288-3.315a48.482 48.482 0 01-.617 2.065" />
              </svg>

              {/* Micro-punto latente en el centro */}
              <div className="absolute w-1.5 h-1.5 rounded-full bg-cyan-400/50 animate-pulse" />
            </div>

            {/* 4 puntos cardinales decorativos flotando */}
            {[0, 90, 180, 270].map((deg) => (
              <div
                key={deg}
                className="absolute w-1 h-1 rounded-full bg-cyan-400/40"
                style={{
                  transform: `rotate(${deg}deg) translateY(-6.5rem)`,
                  animation: `nc-dot-float ${2.5 + (deg % 180) * 0.01}s ease-in-out infinite`,
                  animationDelay: `${deg * 0.005}s`,
                }}
              />
            ))}
          </div>

          <span className="text-xs font-bold text-cyan-400/30 tracking-[0.25em] uppercase mt-7"
                style={{ textShadow: "0 0 8px rgba(34,211,238,0.2)" }}>
            {t("neonchrono.hold_instruction")}
          </span>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          PHASE: HOLDING  —  Tensión a ciegas (sin HUD)
          ═══════════════════════════════════════════════════════ */}
      {isHolding && (
        <>
          {/* ── Viñeteado profundo claustrofóbico ── */}
          <div
            className="absolute inset-0 pointer-events-none z-1"
            style={{
              background: "radial-gradient(ellipse at center, rgba(15,23,42,0.3) 0%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0.98) 100%)",
            }}
          />

          {/* ── Ondas de latido — heartbeat rings expandiéndose ── */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: "8rem", height: "8rem",
                  border: `${i === 0 ? '1.5px' : '1px'} solid rgba(244,63,94,${0.18 - i * 0.03})`,
                  boxShadow: i < 2 ? `0 0 ${20 + i * 10}px rgba(244,63,94,${0.06 - i * 0.02})` : "none",
                  animation: `nc-hold-expand ${3 + i * 0.6}s ease-out infinite`,
                  animationDelay: `${i * 0.7}s`,
                }}
              />
            ))}

            {/* Núcleo latiente — heartbeat */}
            <div
              className="absolute w-5 h-5 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(244,63,94,0.35) 0%, rgba(244,63,94,0.08) 60%, transparent 100%)",
                boxShadow: "0 0 20px 6px rgba(244,63,94,0.15), 0 0 60px rgba(244,63,94,0.06)",
                animation: "nc-heartbeat 1.4s ease-in-out infinite",
              }}
            />

            {/* Punto central mínimo */}
            <div className="absolute w-1.5 h-1.5 rounded-full bg-rose-500/50" />
          </div>

          {/* ── Borde de pantalla — throb intenso ── */}
          <div
            className="absolute inset-0 pointer-events-none z-3"
            style={{
              boxShadow: "inset 0 0 100px 20px rgba(244,63,94,0.05), inset 0 0 200px 50px rgba(139,92,246,0.03), inset 0 0 300px 80px rgba(0,0,0,0.7)",
              animation: "nc-edge-throb 2.5s ease-in-out infinite",
            }}
          />

          {/* ── CRT scan lines ── */}
          <div className="absolute inset-0 pointer-events-none z-1 opacity-[0.04]"
               style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.05) 2px, rgba(255,255,255,0.05) 4px)", backgroundSize: "100% 4px" }} />

          {/* ── Partículas flotantes dispersas ── */}
          <div className="absolute inset-0 pointer-events-none z-2 overflow-hidden">
            {[...Array(6)].map((_, i) => (
              <div
                key={`p-${i}`}
                className="absolute w-0.5 h-0.5 rounded-full bg-rose-400/30"
                style={{
                  left: `${15 + i * 13}%`,
                  top: `${20 + ((i * 37) % 60)}%`,
                  animation: `nc-dot-float ${3 + i * 0.7}s ease-in-out infinite`,
                  animationDelay: `${i * 0.5}s`,
                }}
              />
            ))}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
          PHASE: RESULT  —  Feedback rápido
          ═══════════════════════════════════════════════════════ */}
      {isResult && elapsedTime !== null && (
        <div
          className="relative z-10 flex flex-col items-center gap-3"
          style={{ animation: "nc-fadein 0.2s ease" }}
        >
          {/* ── Veredicto ── */}
          {isPerfectHit ? (
            <span
              className="text-5xl sm:text-6xl font-black uppercase tracking-wider text-white"
              style={{ textShadow: "0 0 40px rgba(255,215,0,0.9), 0 0 100px rgba(255,215,0,0.4)" }}
            >
              {t("neonchrono.perfect")}
            </span>
          ) : resultDidPass ? (
            <span
              className="text-5xl sm:text-6xl font-black uppercase tracking-wider text-emerald-400"
              style={{ textShadow: "0 0 40px rgba(34,197,94,0.7)" }}
            >
              {t("neonchrono.pass")}
            </span>
          ) : (
            <span
              className="text-5xl sm:text-6xl font-black uppercase tracking-wider text-red-500"
              style={{ textShadow: "0 0 40px rgba(220,38,38,0.7)" }}
            >
              {t("neonchrono.fail")}
            </span>
          )}

          {/* ── Tiempo del jugador ── */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-white/40 text-xs uppercase tracking-widest">{t("neonchrono.your_time")}</span>
            <span className="text-3xl font-mono font-black tabular-nums text-white/90">
              {elapsedTime.toFixed(2)}s
            </span>
          </div>

          {/* ── Diferencia con signo ── */}
          <div className="flex items-center gap-2">
            <span className="text-white/30 text-xs uppercase tracking-widest">{t("neonchrono.off_by")}</span>
            <span className={`text-2xl font-mono font-black tabular-nums ${
              isPerfectHit ? "text-amber-300" : resultDidPass ? "text-emerald-400" : "text-red-400"
            }`}>
              {(() => {
                const signed = elapsedTime - roundCfg.target;
                return `${signed >= 0 ? "+" : ""}${signed.toFixed(2)}s`;
              })()}
            </span>
          </div>

          {/* ── Indicador siguiente ronda (solo si acertó) ── */}
          {resultDidPass && (
            <span className="text-sm text-white/20 animate-pulse mt-2">
              {t("neonchrono.next_round")}
            </span>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          IDLE HINT (no-active placeholder)
          ═══════════════════════════════════════════════════════ */}
      {isWaiting && !isActive && (
        <div className="absolute inset-x-0 bottom-[28vh] flex justify-center pointer-events-none z-3">
          <div className="flex flex-col items-center gap-3 animate-pulse">
            <img src="/logo-neonchrono.png" alt="Neon Chrono"
                 className="w-16 h-16 object-contain drop-shadow-lg" draggable={false} />
            <span className="text-xs font-semibold text-white/50 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl">
              {t("neonchrono.instruction")}
            </span>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          SCORE PILL (visible durante HOLDING & RESULT)
          ═══════════════════════════════════════════════════════ */}
      {isActive && (isHolding || isResult) && (
        <div className="absolute bottom-24 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <div className="flex items-center gap-4 bg-white/4 backdrop-blur-sm rounded-xl px-5 py-2 border border-white/6">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-white/30 uppercase tracking-widest font-medium">
                {t("neonchrono.score_label")}
              </span>
              <span className="text-lg font-black text-white/90 tabular-nums font-mono">{round}</span>
            </div>
            {perfects > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-fuchsia-400/60">⚡</span>
                <span className="text-[10px] font-bold text-fuchsia-400/80">{perfects}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          GAME OVER PANEL
          ═══════════════════════════════════════════════════════ */}
      {isGameOver && (
        <GameOverPanel
          title={gameOverTitle}
          score={`${round}`}
          subtitle={t("neonchrono.subtitle")}
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

export default NeonChronoGame;
