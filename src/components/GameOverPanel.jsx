/**
 * GameOverPanel.jsx — Overlay inmersivo de Game Over (estilo TikTok)
 *
 * Diseño: Capa transparente superpuesta sobre el último frame del juego.
 *  - Sin modal clásico: oscurecimiento + blur sobre el juego congelado.
 *  - Safe zone derecha para el HUD fijo (ActionBar).
 *  - Score con animación count-up y glow neón.
 *  - Bottom Sheet con glassmorphism para el Top 5.
 *
 * Props:
 *   title         (string)        — "Game Over" o "¡Victoria!"
 *   score         (string|number) — puntuación ("12", "85%", "7 mov.")
 *   subtitle      (string)        — texto debajo del score
 *   onReplay      (fn)            — callback para reiniciar
 *   onNext        (fn)            — callback para siguiente juego
 *   userId        (string|null)   — ID del usuario logueado
 *   gameId        (string|null)   — ID del juego en la BD
 *   xpGained      (number|null)   — XP ganada en esta partida
 *   ranking       (array)         — [{ pos, userId, user, equippedAvatarId, score }] (backward-compat, fallback)
 *   scoreMessage  (string)        — mensaje del resultado (backward-compat, fallback)
 *   isLoading     (bool)          — cargando el ranking (backward-compat)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, X } from "lucide-react";
import { useLanguage } from "../i18n";
import { useAuth } from "../context/AuthContext";
import { useSoundEffect } from "../hooks/useSoundEffect";
import { supabase } from "../supabaseClient";
import { getLevelProgress } from "../utils/leveling";
import { getTop5 } from "../services/gameService";
import Avatar from "./Avatar";
import PublicProfileModal from "./PublicProfileModal";

/* Notifica al Feed para desbloquear scroll inmediatamente */
const SCROLL_UNLOCK_EVENT = "gameover-scroll-unlock";

/* ── Perfect Circle: la BD guarda score×10 → mostrar /10 con “%” ── */
const PERFECT_CIRCLE_ID = "perfect-circle";
function displayScoreForGame(raw, gId) {
  if (gId === PERFECT_CIRCLE_ID) return `${(raw / 10).toFixed(1)}%`;
  return typeof raw === "number" ? raw.toLocaleString() : String(raw);
}

/* ── Formateador de ranking raw → UI ── */
function formatRanking(rawScores) {
  if (!rawScores?.length) return [];
  return rawScores.map((s, i) => ({
    pos: i + 1,
    userId: s.user_id ?? null,
    user: s.users?.username ?? "—",
    equippedAvatarId: s.users?.equipped_avatar_id ?? "none",
    score: s.score,
  }));
}

/* ── Utilidades de parseo de score ── */
function parseScoreNumber(score) {
  if (typeof score === "number") return score;
  if (typeof score === "string") {
    const m = score.replace(/,/g, "").match(/[\d.]+/);
    return m ? parseFloat(m[0]) : 0;
  }
  return 0;
}

function getScoreSuffix(score) {
  if (typeof score === "string") {
    const m = score.match(/[\d.,]+\s*(.*)/);
    return m?.[1]?.trim() || "";
  }
  return "";
}

/* ── Hook: reduce fontSize hasta que el texto quepa en una línea ── */
function useFitText(depValue, { maxPx = 112, minPx = 32 } = {}) {
  const ref = useRef(null);

  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Empezar desde el máximo
    let size = maxPx;
    el.style.fontSize = `${size}px`;
    // Reducir iterativamente hasta que quepa o toquemos el mínimo
    while (el.scrollWidth > el.clientWidth && size > minPx) {
      size -= 2;
      el.style.fontSize = `${size}px`;
    }
  }, [maxPx, minPx]);

  useEffect(() => {
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit, depValue]);

  return ref;
}

/* ── Score animado: cuenta desde 0 hasta target con ease-out ── */
const AnimatedScore = ({ target, suffix }) => {
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!target) {
      setVal(0);
      return;
    }
    const dur = 1400;
    let start = null;
    let raf;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setVal(Math.round(ease * target));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return (
    <span className="inline-flex items-baseline gap-1">
      <span>{val.toLocaleString()}</span>
      {suffix && (
        <span className="text-[0.35em] font-bold text-white/60 tracking-normal">
          {suffix}
        </span>
      )}
    </span>
  );
};

/* ══════════════════════════════════════════════════════════════
   GameOverPanel
   ══════════════════════════════════════════════════════════════ */
const GameOverPanel = ({
  title = "Game Over",
  score,
  subtitle,
  onReplay,
  onNext,
  userId = null,
  gameId = null,
  xpGained = null,
  /* backward-compat props (still passed by some game components) */
  ranking: propRanking = [],
  scoreMessage = "",
  isLoading: propIsLoading = false,
}) => {
  const { t } = useLanguage();
  const { currentUser } = useAuth();
  const { playLose, playRecord } = useSoundEffect();

  const effectiveUserId = userId || currentUser?.id || null;

  /* ── Estado local ── */
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [profileUserId, setProfileUserId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const [buttonsReady, setButtonsReady] = useState(false);

  /* Resultado de la partida (datos reales desde Supabase) */
  const [resultData, setResultData] = useState({
    isNewRecord: false,
    globalPosition: null,
    bestScore: null,
  });

  /* Barra de XP dual (nivel real) */
  const [levelInfo, setLevelInfo] = useState({
    level: 1,
    nextLevel: 2,
    basePercent: 0,
    gainedPercent: 0,
  });

  /* Top 5 lazy-loaded */
  const [top5Data, setTop5Data] = useState([]);
  const [top5Loading, setTop5Loading] = useState(false);

  const numericScore = parseScoreNumber(score);
  const scoreSuffix = getScoreSuffix(score);
  const xpValue = xpGained ?? 0;

  /* ── Fallback: detección de récord vía scoreMessage (si no hay userId/gameId) ── */
  const isNewRecordFallback =
    scoreMessage &&
    /top\s*5|récord|record|nuevo.*récord|new.*record/i.test(scoreMessage);

  /* Valor final: dato real si lo tenemos, fallback si no */
  const isNewRecord = effectiveUserId && gameId
    ? resultData.isNewRecord
    : isNewRecordFallback;

  /* ── Ref para auto-fit del tamaño del score ── */
  const scoreRef = useFitText(numericScore, { maxPx: 112, minPx: 32 });

  /* ── Desbloquear scroll del Feed al montar ── */
  useEffect(() => {
    window.dispatchEvent(new Event(SCROLL_UNLOCK_EVENT));
  }, []);

  /* ── Protección anti-clic accidental: 500ms de gracia ── */
  useEffect(() => {
    setButtonsReady(false);
    const timer = setTimeout(() => setButtonsReady(true), 500);
    return () => clearTimeout(timer);
  }, []);

  /* ── Sonido al montar: récord o derrota ── */
  useEffect(() => {
    if (isProcessing) return; // esperar a que se resuelva si hay datos reales
    const timer = setTimeout(() => {
      if (isNewRecord) playRecord();
      else playLose();
    }, 200);
    return () => clearTimeout(timer);
  }, [isProcessing]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ══════════════════════════════════════════════════════════════
     EFFECT A — Barra de XP (solo necesita effectiveUserId)
     ══════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!effectiveUserId) return;

    let cancelled = false;

    (async () => {
      try {
        const { data: userData } = await supabase
          .from("users")
          .select("xp")
          .eq("id", effectiveUserId)
          .maybeSingle();

        if (cancelled) return;

        const totalXP = userData?.xp ?? 0;
        const xpBefore = Math.max(0, totalXP - xpValue);

        const before = getLevelProgress(xpBefore);
        const after = getLevelProgress(totalXP);

        setLevelInfo({
          level: after.level,
          nextLevel: after.level + 1,
          basePercent: after.level === before.level ? before.percentage : 0,
          gainedPercent: after.level === before.level
            ? after.percentage - before.percentage
            : after.percentage,
        });
      } catch (err) {
        console.error("GameOverPanel XP fetch error:", err);
      }
    })();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ══════════════════════════════════════════════════════════════
     EFFECT B — Récord + Posición global (necesita userId + gameId)
     Espera a que propIsLoading pase a false (submit completado y
     trigger de highscores ejecutado) antes de consultar.
     ══════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!effectiveUserId || !gameId) {
      setIsProcessing(false);
      return;
    }
    // Mientras el juego aún está enviando la puntuación, no leer highscores
    if (propIsLoading) return;

    let cancelled = false;

    (async () => {
      try {
        /* ── Queries en paralelo (todo desde highscores) ── */
        const [gameRes, userHsRes, allHsRes] = await Promise.all([
          supabase.from("games").select("is_lower_better").eq("id", gameId).maybeSingle(),
          supabase
            .from("highscores")
            .select("score")
            .eq("user_id", effectiveUserId)
            .eq("game_id", gameId)
            .maybeSingle(),
          supabase
            .from("highscores")
            .select("score")
            .eq("game_id", gameId),
        ]);

        if (cancelled) return;

        const isLowerBetter = gameRes.data?.is_lower_better ?? false;
        const myHighscore = userHsRes.data?.score ?? null;

        /* ── ¿Nuevo récord? ── */
        let bestScore = null;
        let isRecord = false;

        if (myHighscore == null) {
          // Sin entrada en highscores → primera partida
          isRecord = true;
          bestScore = numericScore;
        } else if (numericScore === myHighscore) {
          // El score actual coincide con el highscore (trigger lo actualizó) → récord
          isRecord = true;
          bestScore = numericScore;
        } else {
          // El score actual no superó el highscore → no es récord
          isRecord = false;
          bestScore = myHighscore;
        }

        /* ── Posición global — Standard Competition Ranking (1,1,3) ── */
        const effectiveHS = myHighscore ?? numericScore;

        let betterCount = 0;
        for (const row of allHsRes.data || []) {
          if (isLowerBetter ? row.score < effectiveHS : row.score > effectiveHS) {
            betterCount++;
          }
        }
        const globalPos = betterCount + 1;

        setResultData({
          isNewRecord: isRecord,
          globalPosition: globalPos > 0 ? `#${globalPos}` : null,
          bestScore,
        });
      } catch (err) {
        console.error("GameOverPanel record fetch error:", err);
      } finally {
        if (!cancelled) setIsProcessing(false);
      }
    })();

    return () => { cancelled = true; };
  }, [propIsLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Fetch Top 5 (lazy, al abrir el bottom sheet) ── */
  const fetchTop5 = useCallback(async () => {
    if (!gameId) return;
    setTop5Loading(true);
    try {
      const result = await getTop5(gameId);
      if (result.success && result.data) {
        setTop5Data(formatRanking(result.data));
      }
    } catch (err) {
      console.error("Top 5 fetch error:", err);
    } finally {
      setTop5Loading(false);
    }
  }, [gameId]);

  /* Ranking a mostrar: datos reales (lazy), luego prop fallback */
  const displayRanking =
    top5Data.length > 0 ? top5Data : propRanking.length > 0 ? propRanking : [];
  const rankingLoading = top5Loading || (propIsLoading && top5Data.length === 0);

  /* ── Bloquear scroll del feed mientras el Top 5 está abierto ── */
  useEffect(() => {
    if (showLeaderboard) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [showLeaderboard]);

  /* ── Ease personalizado tipo "snappy" ── */
  const snappy = [0.16, 1, 0.3, 1];

  return (
    <>
      {/* Portal al body para que el perfil siempre quede por encima del bottom sheet */}
      {createPortal(
        <PublicProfileModal
          isOpen={!!profileUserId}
          onClose={() => setProfileUserId(null)}
          userId={profileUserId}
        />,
        document.body
      )}

      {/* ═══════════════════════════════════════════
          OVERLAY PRINCIPAL  — bg + blur sobre el juego
          ═══════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="absolute inset-0 z-20 bg-black/60 backdrop-blur-md"
      >
        {/* Contenedor con safe zones arriba/abajo + scroll de salvavidas */}
        <div className="w-full h-full pt-25 pb-20 flex flex-col items-center overflow-y-auto scrollbar-hide">
          {/* Wrapper centrado — my-auto centra solo si cabe, nunca pisa el pt */}
          <div
            className="w-full max-w-75 mx-auto flex flex-col items-center px-4 my-auto shrink-0"
            style={{ gap: "clamp(0.75rem, 2vh, 1.25rem)" }}
          >
          {/* ════════════════════════════════════
              TERCIO SUPERIOR — Puntuación
              ════════════════════════════════════ */}
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: snappy }}
            className="flex flex-col items-center gap-1"
          >
            {/* Etiqueta superior */}
            <p className="w-full text-center text-white/80 text-2xl font-bold uppercase tracking-[0.5em] pl-[0.5em] mb-1">
              {title}
            </p>

            {/* Score GIGANTE — auto-fit JS para que siempre quepa en 1 línea */}
            <div
              ref={scoreRef}
              className="w-full font-black text-white leading-none tabular-nums whitespace-nowrap tracking-tighter text-center"
              style={{
                fontSize: "clamp(4rem, 12vh, 7rem)", /* fallback inicial, JS lo sobreescribe */
                textShadow:
                  "0 0 20px rgba(255,255,255,0.5), 0 0 60px rgba(255,255,255,0.2), 0 0 100px rgba(255,255,255,0.1)",
                fontFeatureSettings: "'tnum'",
              }}
            >
              <AnimatedScore target={numericScore} suffix={scoreSuffix} />
            </div>

            {subtitle && (
              <p className="text-white/80 text-base mt-1.5">{subtitle}</p>
            )}

            {/* ════ Barra de XP Dual (nivel actual → siguiente) ════ */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.4 }}
              className="flex flex-col items-center gap-1.5 mt-3 w-full max-w-50"
            >
              <span
                className="text-base font-bold text-cyan-400"
                style={{ textShadow: "0 0 8px rgba(6,182,212,0.5)" }}
              >
                +{xpValue} XP
              </span>
              <div className="w-full flex items-center gap-2">
                <span className="text-[11px] font-semibold text-white/50 whitespace-nowrap">
                  {t('gameover.level')} {levelInfo.level}
                </span>
                <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden flex">
                  {/* XP que ya tenía */}
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${levelInfo.basePercent}%` }}
                    transition={{ delay: 1.0, duration: 0.6, ease: "easeOut" }}
                    className="h-full bg-cyan-600"
                  />
                  {/* XP ganada en esta partida */}
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${levelInfo.gainedPercent}%` }}
                    transition={{ delay: 1.5, duration: 0.7, ease: "easeOut" }}
                    className="h-full bg-cyan-400 animate-pulse"
                  />
                </div>
                <span className="text-[11px] font-semibold text-white/50 whitespace-nowrap">
                  {t('gameover.level')} {levelInfo.nextLevel}
                </span>
              </div>
            </motion.div>
          </motion.div>

          {/* ════════════════════════════════════
              TERCIO MEDIO — Ranking y mejor puntuación
              ════════════════════════════════════ */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.6 }}
            className="flex flex-col items-center gap-3"
          >
            {/* ════ Ranking y mejor puntuación ════ */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.25 }}
              className="flex flex-col items-center gap-1.5 text-base text-white/70 mt-2"
            >
              {isProcessing ? (
                <span className="text-white/40 animate-pulse">{t('gameover.processing')}</span>
              ) : (
                <>
                  {resultData.globalPosition && (
                    <span>
                      {t('gameover.global_pos')}:{" "}
                      <span className="text-cyan-400 font-bold">{resultData.globalPosition}</span>
                    </span>
                  )}
                  {isNewRecord && (
                    <span
                      className="text-yellow-400 font-bold drop-shadow-[0_0_8px_rgba(250,204,21,0.8)] animate-pulse"
                    >
                      🏆 {t('gameover.new_record')}
                    </span>
                  )}
                  {resultData.bestScore != null ? (
                    <span className="text-white/50">
                      {t('gameover.best_score')}:{" "}
                      <span className="text-white/80 font-semibold">{displayScoreForGame(resultData.bestScore, gameId)}</span>
                    </span>
                  ) : !isNewRecord && (
                    <span className="text-white/40">{t('gameover.first_game')}</span>
                  )}
                </>
              )}
            </motion.div>


          </motion.div>

          {/* ════════════════════════════════════
              TERCIO INFERIOR — Zona de acción
              ════════════════════════════════════ */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: buttonsReady ? 1 : 0.4, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35, ease: snappy }}
            className={`flex flex-col items-center gap-3 w-full transition-opacity duration-300 ${
              buttonsReady ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            {/* Botón principal: JUGAR DE NUEVO (píldora verde neón) */}
            {onReplay && (
              <button
                onClick={buttonsReady ? onReplay : undefined}
                className="w-full py-4 rounded-full font-black text-xl tracking-wide text-white
                           bg-emerald-500 hover:bg-emerald-400
                           active:scale-95 transition-all duration-150
                           shadow-[0_0_24px_rgba(16,185,129,0.45),0_0_60px_rgba(16,185,129,0.15)]
                           flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <RefreshCw className="w-5 h-5" strokeWidth={2.5} />
                {t('gameover.replay').toUpperCase()}
              </button>
            )}

            {/* VER TOP 5 — Ghost Button */}
            <button
              onClick={buttonsReady ? () => {
                setShowLeaderboard(true);
                if (top5Data.length === 0) fetchTop5();
              } : undefined}
              className="px-6 py-2 mt-2 rounded-full border border-white/20 bg-white/5 hover:bg-white/10
                         active:scale-95 transition-all text-sm font-bold tracking-wider text-white cursor-pointer"
            >
              {t('gameover.view_top5')}
            </button>

          </motion.div>
          </div>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════
          BOTTOM SHEET — Leaderboard Top 5
          Portal al body para escapar del stacking context
          ═══════════════════════════════════════════ */}
      {createPortal(
        <AnimatePresence>
          {showLeaderboard && (
            <>
              {/* Backdrop — clic para cerrar, bloquea scroll */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-200 bg-black/50 touch-none"
                onClick={() => setShowLeaderboard(false)}
                onTouchMove={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
              />

              {/* Sheet — 75% inferior, glassmorphism, full width */}
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 300 }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 100 || info.velocity.y > 300) {
                    setShowLeaderboard(false);
                  }
                }}
                className="fixed bottom-0 inset-x-0 z-201 h-[75vh] rounded-t-3xl flex flex-col overflow-hidden
                           bg-black/80 backdrop-blur-xl border-t border-white/15 touch-none"
            >
              {/* Handle pill — zona de arrastre */}
              <div className="flex justify-center pt-3 pb-1 shrink-0 cursor-grab active:cursor-grabbing">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-3 shrink-0">
                <h3 className="text-white font-extrabold text-xl tracking-tight">
                  {t('gameover.top5')}
                </h3>
                <button
                  onClick={() => setShowLeaderboard(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full
                             bg-white/10 hover:bg-white/20 active:scale-90 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </div>

              {/* Divider */}
              <div className="mx-6 h-px bg-white/8 shrink-0" />

              {/* Lista de jugadores */}
              <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-hide">
                {rankingLoading
                  ? /* ── Skeleton Loader ── */
                    Array.from({ length: 5 }, (_, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-3 py-3.5 animate-pulse"
                      >
                        <div className="w-7 h-5 bg-white/8 rounded" />
                        <div className="w-9 h-9 bg-white/8 rounded-full" />
                        <div
                          className="flex-1 h-4 bg-white/8 rounded"
                          style={{ width: `${55 + i * 8}%` }}
                        />
                        <div className="w-12 h-4 bg-white/8 rounded" />
                      </div>
                    ))
                  : /* ── Filas reales ── */
                    displayRanking.map((r, i) => {
                      const isMe =
                        currentUser?.id && r.userId === currentUser.id;
                      const medals = [
                        "text-yellow-400",
                        "text-gray-300",
                        "text-amber-600",
                      ];

                      return (
                        <motion.div
                          key={r.pos}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.07, duration: 0.25 }}
                          onClick={() =>
                            r.userId && setProfileUserId(r.userId)
                          }
                          className={`flex items-center gap-4 px-4 py-4 rounded-2xl mb-1.5 transition-colors ${
                            isMe
                              ? "bg-emerald-500/10 border border-emerald-400/20"
                              : "border border-transparent [@media(hover:hover)]:hover:bg-white/5"
                          }${
                            r.userId
                              ? " cursor-pointer active:bg-white/10"
                              : ""
                          }`}
                        >
                          {/* Posición */}
                          <span
                            className={`text-xl font-black w-8 text-center tabular-nums ${
                              i < 3 ? medals[i] : "text-white/25"
                            }`}
                          >
                            {r.pos}
                          </span>

                          {/* Avatar */}
                          <Avatar
                            equippedAvatarId={r.equippedAvatarId}
                            size="sm"
                            className="w-10! h-10!"
                          />

                          {/* Nombre */}
                          <span
                            className={`flex-1 font-semibold text-lg truncate ${
                              isMe ? "text-white" : "text-white/55"
                            }`}
                          >
                            {r.user}
                            {isMe && (
                              <span className="ml-1.5 text-[10px] text-emerald-400 font-bold uppercase">
                                ({t('gameover.you')})
                              </span>
                            )}
                          </span>

                          {/* Puntuación */}
                          <span
                            className={`font-bold tabular-nums text-lg ${
                              isMe ? "text-emerald-400" : "text-white/35"
                            }`}
                          >
                            {displayScoreForGame(r.score, gameId)}
                          </span>
                        </motion.div>
                      );
                    })}
              </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

export default GameOverPanel;
