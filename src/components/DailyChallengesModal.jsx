/**
 * DailyChallengesModal.jsx — Modal premium de Retos Diarios
 *
 * Estilo AAA gaming: degradado slate-800→900, bordes neón, barras de
 * progreso con resplandor, botón de reclamar dorado, y animación de
 * monedas SVG con Framer Motion. Cero emojis.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n";
import { getTodayChallenges, claimReward, getChallengeStatus } from "../services/challengeService";
import { getSpanishDateString, getMsUntilSpanishMidnight } from "../utils/dateUtils";

// ─── SVG Icons (inline, zero dependencies) ───────────────────────────────────

const IconTarget = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
);

const IconCoin = ({ className = "w-4 h-4" }) => (
  <img src="/logo-moneda.png" alt="" className={`${className} drop-shadow-[0_0_4px_rgba(250,204,21,0.5)]`} draggable={false} />
);

const IconCheck = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
  </svg>
);

const IconLock = ({ className = "w-3.5 h-3.5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
  </svg>
);

const IconClipboard = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
);

const IconClock = ({ className = "w-3.5 h-3.5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);



// ─── Coin Burst Animation (SVG coins, no emojis) ────────────────────────────

function generateCoins(count = 12) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * 180,
    y: -(50 + Math.random() * 100),
    rotate: Math.random() * 720 - 360,
    scale: 0.7 + Math.random() * 0.5,
    delay: Math.random() * 0.12,
  }));
}

const CoinBurst = ({ trigger }) => {
  const [coins, setCoins] = useState([]);

  useEffect(() => {
    if (trigger > 0) setCoins(generateCoins(14));
  }, [trigger]);

  if (coins.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      {coins.map((c) => (
        <motion.div
          key={`${trigger}-${c.id}`}
          className="absolute left-1/2 top-1/2"
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.2, rotate: 0 }}
          animate={{
            x: c.x,
            y: c.y,
            opacity: [1, 1, 0],
            scale: c.scale,
            rotate: c.rotate,
          }}
          transition={{ duration: 0.85, delay: c.delay, ease: "easeOut" }}
          onAnimationComplete={() => {
            if (c.id === coins.length - 1) setTimeout(() => setCoins([]), 80);
          }}
        >
          <img src="/logo-moneda.png" alt="" className="block w-6 h-6 drop-shadow-[0_0_8px_rgba(250,204,21,0.7)]" draggable={false} />
        </motion.div>
      ))}
    </div>
  );
};

// ─── XP Big Celebration Overlay ─────────────────────────────────────────────

function generateXPParticles(count = 16) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * 280,
    y: (Math.random() - 0.5) * 280,
    rotate: Math.random() * 720 - 360,
    scale: 0.4 + Math.random() * 0.7,
    delay: Math.random() * 0.15,
    size: 4 + Math.random() * 6,
  }));
}

const XPCelebration = ({ show, t }) => {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (show) setParticles(generateXPParticles(16));
    else setParticles([]);
  }, [show]);

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          style={{ zIndex: 99999 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Green burst particles */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-1/2 top-1/2">
              {particles.map((p) => (
                <motion.div
                  key={p.id}
                  className="absolute rounded-full"
                  style={{
                    width: p.size,
                    height: p.size,
                    backgroundColor: "#34d399",
                    boxShadow: "0 0 12px rgba(52,211,153,0.9)",
                  }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 0.2 }}
                  animate={{
                    x: p.x,
                    y: p.y,
                    opacity: [1, 1, 0],
                    scale: p.scale,
                    rotate: p.rotate,
                  }}
                  transition={{ duration: 1, delay: p.delay, ease: "easeOut" }}
                />
              ))}
            </div>
          </div>

          {/* Big +500 XP */}
          <motion.div
            initial={{ opacity: 0, scale: 0.2, y: 10 }}
            animate={{ opacity: 1, scale: [0.2, 1.3, 1], y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
            className="relative flex flex-col items-center gap-1.5"
          >
            <span className="text-5xl sm:text-6xl font-black text-emerald-400 drop-shadow-[0_0_30px_rgba(52,211,153,0.8)] tracking-tight">
              +500 XP
            </span>
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-sm font-bold text-emerald-300/70 uppercase tracking-wider"
            >
              {t("challenges.daily_bonus")}
            </motion.span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

// ─── Challenge Card ──────────────────────────────────────────────────────────

const ChallengeCard = ({ challenge, lang, t, onClaim, claimingId }) => {
  const {
    id,
    title_es,
    title_en,
    description_es,
    description_en,
    target_plays,
    reward_coins,
    current_progress,
    is_claimed,
  } = challenge;

  const title = lang === "es" ? title_es : title_en;
  const description = lang === "es" ? description_es : description_en;
  const progress = Math.min(current_progress, target_plays);
  const percent = target_plays > 0 ? (progress / target_plays) * 100 : 0;
  const isComplete = progress >= target_plays;
  const isClaiming = claimingId === id;

  return (
    <motion.div
      layout
      className={`relative rounded-lg border p-3 transition-all duration-300 ${
        is_claimed
          ? "opacity-50 border-emerald-500/20 bg-black/30"
          : isComplete
          ? "border-amber-500/25 bg-black/40"
          : "border-white/5 bg-black/40"
      }`}
    >
      {/* ── Top row: title + reward pill ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-bold text-sm leading-tight">
            {title}
          </h3>
          <p className="text-slate-400 text-xs leading-snug mt-0.5">
            {description}
          </p>
        </div>

        {/* Reward pill */}
        <div className="shrink-0 flex items-center gap-1 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 rounded-md text-xs font-bold">
          <span>+{reward_coins}</span>
          <IconCoin className="w-3 h-3" />
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="mt-2.5 flex items-center gap-2.5">
        <div className="flex-1 h-2 bg-slate-700/50 rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${
              is_claimed
                ? "bg-emerald-500/50"
                : isComplete
                ? "bg-linear-to-r from-amber-400 to-yellow-300 shadow-[0_0_8px_rgba(250,204,21,0.5)]"
                : "bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.4)]"
            }`}
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
          />
        </div>
        <span className="text-[11px] font-bold text-slate-400 tabular-nums shrink-0 w-8 text-right">
          {progress}/{target_plays}
        </span>
      </div>

      {/* ── Action row ── */}
      <div className="mt-2.5 flex items-center justify-end min-h-8">
        {is_claimed ? (
          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400/70 uppercase tracking-wide">
            {t("challenges.completed")}
            <IconCheck className="w-3.5 h-3.5" />
          </span>
        ) : isComplete ? (
          <motion.button
            onClick={() => onClaim(id, reward_coins)}
            disabled={isClaiming}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="cursor-pointer flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-extrabold text-xs text-slate-900
              bg-linear-to-r from-yellow-400 via-amber-400 to-yellow-300
              shadow-[0_0_18px_rgba(250,204,21,0.45)]
              hover:shadow-[0_0_28px_rgba(250,204,21,0.65)]
              animate-pulse transition-shadow duration-300
              disabled:opacity-60 disabled:cursor-wait disabled:animate-none"
          >
            {isClaiming ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t("challenges.claiming")}
              </>
            ) : (
              <>
                {t("challenges.claim", { coins: reward_coins })}
                <IconCoin className="w-3 h-3" />
              </>
            )}
          </motion.button>
        ) : (
          <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500 uppercase tracking-wide">
            <IconLock className="w-3 h-3" />
            {t("challenges.in_progress")}
          </span>
        )}
      </div>
    </motion.div>
  );
};

// ─── Skeleton Loader ─────────────────────────────────────────────────────────

const SkeletonCard = () => (
  <div className="rounded-lg border border-slate-700/20 bg-black/15 p-3 animate-pulse">
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-3/4 bg-white/8 rounded" />
        <div className="h-2.5 w-full bg-white/4 rounded" />
      </div>
      <div className="h-5 w-14 bg-yellow-500/8 rounded-md" />
    </div>
    <div className="mt-2.5 flex items-center gap-2.5">
      <div className="flex-1 h-2 bg-slate-700/30 rounded-full" />
      <div className="h-2.5 w-6 bg-white/4 rounded" />
    </div>
    <div className="mt-2.5 flex justify-end">
      <div className="h-6 w-20 bg-white/4 rounded-lg" />
    </div>
  </div>
);

// ─── Main Modal ──────────────────────────────────────────────────────────────

const DailyChallengesModal = ({ isOpen, onClose, onStateChange }) => {
  const { currentUser, updateUser } = useAuth();
  const { lang, t } = useLanguage();

  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState(null);
  const [coinBurstTrigger, setCoinBurstTrigger] = useState(0);
  const [showXPCelebration, setShowXPCelebration] = useState(false);
  const [xpBonusClaimed, setXpBonusClaimed] = useState(false);
  const [resetCountdown, setResetCountdown] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Reset timer: countdown to 00:00 Europe/Madrid + auto-refetch ──
  useEffect(() => {
    if (!isOpen) return;

    // Guardamos la fecha española al montar para detectar cambio de día
    let lastSpanishDate = getSpanishDateString();

    const calcTimeLeft = () => {
      const msLeft = getMsUntilSpanishMidnight();
      const secsLeft = Math.floor(msLeft / 1000);

      const hh = String(Math.floor(secsLeft / 3600)).padStart(2, "0");
      const mm = String(Math.floor((secsLeft % 3600) / 60)).padStart(2, "0");
      const ss = String(secsLeft % 60).padStart(2, "0");
      return `${hh}:${mm}:${ss}`;
    };

    setResetCountdown(calcTimeLeft());

    const id = setInterval(() => {
      const currentSpanishDate = getSpanishDateString();

      // Si el día cambió → medianoche en Madrid → refetch automático
      if (currentSpanishDate !== lastSpanishDate) {
        lastSpanishDate = currentSpanishDate;
        setRefreshKey((k) => k + 1);
      }

      setResetCountdown(calcTimeLeft());
    }, 1000);

    return () => clearInterval(id);
  }, [isOpen]);

  // Derived: XP bonus localStorage key (siempre Europe/Madrid)
  const todayMadrid = getSpanishDateString();
  const xpBonusKey = currentUser?.id
    ? `scrollinn_daily_xp_${currentUser.id}_${todayMadrid}`
    : null;

  // Re-check XP bonus state when modal opens
  useEffect(() => {
    if (isOpen && xpBonusKey) {
      setXpBonusClaimed(localStorage.getItem(xpBonusKey) === "1");
    }
  }, [isOpen, xpBonusKey]);

  // ── Fetch challenges when modal opens or after a game-over upsert ──

  useEffect(() => {
    if (!isOpen) return;
    const handler = () => setRefreshKey((k) => k + 1);
    window.addEventListener("challenges-updated", handler);
    return () => window.removeEventListener("challenges-updated", handler);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setLoading(true);

    getTodayChallenges(currentUser?.id ?? null).then((data) => {
      if (!cancelled) {
        setChallenges(data);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, currentUser?.id, refreshKey]);

  // ── Computed: cuántos reclamados ──
  const claimedCount = useMemo(
    () => challenges.filter((c) => c.is_claimed).length,
    [challenges]
  );

  const allClaimed = challenges.length > 0 && claimedCount === challenges.length;

  // ── Notify parent of state changes ──
  useEffect(() => {
    if (loading || !onStateChange) return;
    onStateChange(getChallengeStatus(challenges));
  }, [challenges, loading, onStateChange]);

  // ── Claim handler (con orquestación de Full Clear) ──
  const handleClaim = useCallback(
    async (challengeId, rewardCoins) => {
      if (!currentUser?.id || claimingId) return;
      setClaimingId(challengeId);

      // Detectar si este es el último reto (Full Clear)
      const alreadyClaimed = challenges.filter((c) => c.is_claimed).length;
      const isFullClear =
        challenges.length >= 3 &&
        alreadyClaimed === challenges.length - 1 &&
        !xpBonusClaimed;

      const result = await claimReward(currentUser.id, challengeId, rewardCoins, {
        isFullClear,
      });

      if (result.success) {
        // ── Fase 1 (0 s): Monedas + marcar reclamado ──
        setCoinBurstTrigger((prev) => prev + 1);

        setChallenges((prev) =>
          prev.map((ch) =>
            ch.id === challengeId ? { ...ch, is_claimed: true } : ch
          )
        );

        if (typeof result.newCoins === "number") {
          updateUser({ coins: result.newCoins });
        }

        // ── Fase 2 (+600 ms): Gran animación +500 XP ──
        if (isFullClear && typeof result.newXP === "number") {
          setXpBonusClaimed(true);
          if (xpBonusKey) localStorage.setItem(xpBonusKey, "1");

          setTimeout(() => {
            setShowXPCelebration(true);
            updateUser({ xp: result.newXP });
            // Auto-cerrar la celebración
            setTimeout(() => setShowXPCelebration(false), 2200);
          }, 600);
        }
      }

      setClaimingId(null);
    },
    [currentUser?.id, claimingId, challenges, xpBonusClaimed, xpBonusKey, updateUser, showXPCelebration]
  );

  // ── No-challenges placeholder ──
  const isEmpty = !loading && challenges.length === 0;

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-60 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-md mt-16 max-h-[75svh] flex flex-col bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden"
            initial={{ scale: 0.85, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 30 }}
            transition={{ type: "spring", damping: 24, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Coin burst overlay ── */}
            <CoinBurst trigger={coinBurstTrigger} />

            {/* ── Top glow accent ── */}
            <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-white/20 to-transparent" />

            {/* ══════════ HEADER ══════════ */}
            <div className="relative px-5 pt-5 pb-3">
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/5 hover:bg-white/12 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Cerrar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Icon + Title row (horizontal, compact) */}
              <div className="flex items-center justify-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <IconTarget className="w-4.5 h-4.5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-white text-base font-extrabold tracking-wide uppercase leading-none">
                    {t("challenges.title")}{" "}
                    <span className="text-amber-400">
                      ({claimedCount}/{challenges.length || 3})
                    </span>
                  </h2>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    {t("challenges.subtitle")}
                  </p>
                </div>
              </div>

              {/* ── Reset Timer Pill ── */}
              {resetCountdown && (
                <div className="bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700/50 flex items-center gap-2 w-fit mx-auto mt-2.5">
                  <IconClock className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[11px] text-slate-500 font-medium">
                    {t("challenges.new_in")}
                  </span>
                  <span className="text-xs text-slate-300 font-bold font-mono tabular-nums tracking-wide">
                    {resetCountdown}
                  </span>
                </div>
              )}
            </div>

            {/* ── Separator ── */}
            <div className="mx-5 h-px bg-slate-700/40" />

            {/* ══════════ CHALLENGE LIST ══════════ */}
            <div className="flex-1 min-h-0 px-4 py-3 space-y-2 overflow-y-auto scrollbar-hide">
              {loading ? (
                <>
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </>
              ) : isEmpty ? (
                <div className="text-center py-8">
                  <div className="mx-auto mb-2 w-10 h-10 rounded-full bg-slate-700/30 flex items-center justify-center">
                    <IconClipboard className="w-5 h-5 text-slate-500" />
                  </div>
                  <p className="text-slate-400 text-sm font-medium">
                    {t("challenges.no_challenges")}
                  </p>
                  <p className="text-slate-600 text-xs mt-0.5">
                    {t("challenges.come_back")}
                  </p>
                </div>
              ) : (
                challenges.map((ch) => (
                  <ChallengeCard
                    key={ch.id}
                    challenge={ch}
                    lang={lang}
                    t={t}
                    onClaim={handleClaim}
                    claimingId={claimingId}
                  />
                ))
              )}
            </div>

            {/* ══════════ BONUS XP (auto-claimed on Full Clear) ══════════ */}
            <AnimatePresence>
              {allClaimed && !loading && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-4 pb-3"
                >
                  <div className="h-px bg-slate-700/40 mb-3" />
                  <div className="flex items-center justify-center gap-2 py-2 text-emerald-400/70">
                    <IconCheck className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wide">
                      {t("challenges.all_complete")}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Bottom glow accent ── */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-white/10 to-transparent" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Portal: XP celebration overlay (fixed, above everything) */}
    <XPCelebration show={showXPCelebration} t={t} />
    </>
  );
};

export default DailyChallengesModal;
