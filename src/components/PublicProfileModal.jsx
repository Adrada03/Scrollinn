/**
 * PublicProfileModal.jsx — Modal de Perfil Público (Estética Esports Premium)
 *
 * Se abre al hacer clic en un jugador del ranking de Game Over.
 * Muestra:
 *  - Avatar grande con anillo de neón y drop-shadow flotante
 *  - Username + badge de nivel estilo medalla
 *  - Insignia de rango metálica (Rookie / Cyberpunk / Hacker / Leyenda)
 *  - Resumen de carrera (Total Top 1 + Total Top 5)
 *  - Los 3 juegos donde el jugador está más alto en el ranking mundial
 *
 * Props:
 *   isOpen   (bool)     — si el modal está visible
 *   onClose  (fn)       — callback para cerrar
 *   userId   (string)   — UUID del jugador a mostrar
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getPublicProfile } from "../services/profileService";
import { useLanguage } from "../i18n";
import {
  getLevelFromXP,
  getTierHexColor,
  getTierTextColor,
  getTierName,
  getTierHexColorDim,
  getLevelProgress,
} from "../utils/leveling";
import Avatar from "./Avatar";

// ─── Helpers visuales ────────────────────────────────────────────────────────

/** Color de acento para la posición del ranking */
function getRankAccent(rank) {
  if (rank === 1) return "text-amber-400";
  if (rank === 2) return "text-slate-300";
  if (rank === 3) return "text-amber-600";
  if (rank <= 10) return "text-cyan-400";
  return "text-white/60";
}

/** Gradiente de fondo para cada tarjeta de juego según posición */
function getRankCardStyle(rank) {
  if (rank === 1) return {
    background: "linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(251,191,36,0.02) 100%)",
    borderColor: "rgba(251,191,36,0.25)",
  };
  if (rank === 2) return {
    background: "linear-gradient(135deg, rgba(148,163,184,0.06) 0%, rgba(148,163,184,0.01) 100%)",
    borderColor: "rgba(148,163,184,0.18)",
  };
  if (rank === 3) return {
    background: "linear-gradient(135deg, rgba(180,83,9,0.06) 0%, rgba(180,83,9,0.01) 100%)",
    borderColor: "rgba(180,83,9,0.18)",
  };
  return {
    background: "linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.005) 100%)",
    borderColor: "rgba(255,255,255,0.06)",
  };
}

// ─── Componente ──────────────────────────────────────────────────────────────

const PublicProfileModal = ({ isOpen, onClose, userId }) => {
  const { t } = useLanguage();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch del perfil cuando se abre el modal
  useEffect(() => {
    if (!isOpen || !userId) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getPublicProfile(userId)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, userId]);

  // Datos derivados
  const user = profile?.user;
  const topGames = profile?.topGames ?? [];
  const careerStats = profile?.careerStats ?? { totalTop1: 0, totalTop5: 0 };
  const level = user ? getLevelFromXP(user.xp ?? 0) : null;
  const tierHex = level != null ? getTierHexColor(level) : null;
  const tierHexDim = level != null ? getTierHexColorDim(level) : null;
  const tierText = level != null ? getTierTextColor(level) : "";
  const tierName = level != null ? getTierName(level) : "";
  const progress = user ? getLevelProgress(user.xp ?? 0) : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="profile-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[80]"
          />

          {/* Modal */}
          <motion.div
            key="profile-modal"
            initial={{ opacity: 0, scale: 0.92, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 30 }}
            transition={{ type: "spring", damping: 28, stiffness: 350 }}
            className="fixed inset-0 z-[81] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="relative w-full max-w-md pointer-events-auto rounded-3xl shadow-2xl overflow-hidden"
              style={{
                background: "linear-gradient(180deg, #0c1222 0%, #070d1a 50%, #0a0f1e 100%)",
                border: "1px solid rgba(148,163,184,0.08)",
              }}
            >
              {/* ── Dot texture overlay ── */}
              <div
                className="absolute inset-0 opacity-[0.03] pointer-events-none"
                style={{
                  backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)`,
                  backgroundSize: "24px 24px",
                }}
              />

              {/* ── Top glow (behind avatar) ── */}
              {tierHex && (
                <div
                  className="absolute top-0 left-0 w-48 h-36 pointer-events-none"
                  style={{
                    background: `radial-gradient(ellipse at top left, ${tierHex}12 0%, ${tierHex}06 40%, transparent 70%)`,
                  }}
                />
              )}

              {/* Botón cerrar */}
              <button
                onClick={onClose}
                className="absolute top-3.5 right-3.5 z-10 w-8 h-8 rounded-full
                  bg-white/5 hover:bg-white/10 transition-colors
                  flex items-center justify-center cursor-pointer border border-white/5"
                aria-label={t("profile.close")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* ── Loading ── */}
              {loading && (
                <div className="relative px-6 py-20 flex flex-col items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full border-2 border-white/10 animate-spin"
                    style={{ borderTopColor: tierHex ?? "#22d3ee" }}
                  />
                  <span className="text-white/30 text-sm">{t("profile.loading")}</span>
                </div>
              )}

              {/* ── No encontrado ── */}
              {!loading && !user && (
                <div className="relative px-6 py-20 text-center text-white/30 text-sm">
                  {t("profile.not_found")}
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════════════
                  CONTENIDO PRINCIPAL
                 ═══════════════════════════════════════════════════════════════ */}
              {!loading && user && (
                <div className="relative px-6 pt-7 pb-6 flex flex-col gap-4">

                  {/* ── HERO: Avatar + Username + Badge (horizontal) ── */}
                  <div className="flex items-center gap-4">

                    {/* Avatar con doble anillo de neón */}
                    <div className="relative shrink-0">
                      {/* Outer glow ring */}
                      <div
                        className="absolute inset-[-5px] rounded-full pointer-events-none"
                        style={{
                          background: `conic-gradient(from 180deg, ${tierHex}30, ${tierHex}08, ${tierHex}30, ${tierHex}08, ${tierHex}30)`,
                          filter: `blur(2px)`,
                        }}
                      />
                      {/* Inner ring container */}
                      <div
                        className="relative rounded-full p-[3px]"
                        style={{
                          background: `linear-gradient(135deg, ${tierHex}50, ${tierHex}18, ${tierHex}50)`,
                          boxShadow: `0 0 24px ${tierHex}25, 0 6px 24px rgba(0,0,0,0.5)`,
                        }}
                      >
                        <div className="rounded-full overflow-hidden bg-slate-950">
                          <Avatar
                            equippedAvatarId={user.equipped_avatar_id}
                            size="lg"
                            className="!border-0 !shadow-none"
                          />
                        </div>
                      </div>

                      {/* Badge de nivel (joya metálica) */}
                      {level != null && (
                        <div
                          className="absolute -bottom-1 -right-1 translate-x-1/4 translate-y-1/4"
                          style={{ filter: `drop-shadow(0 0 6px ${tierHex}60)` }}
                        >
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center"
                            style={{
                              background: `linear-gradient(145deg, ${tierHex}30, #0a0f1e 60%, ${tierHex}20)`,
                              border: `2px solid ${tierHex}80`,
                              boxShadow: `inset 0 1px 2px ${tierHex}30, 0 2px 8px rgba(0,0,0,0.6)`,
                            }}
                          >
                            <span className="text-xs font-black leading-none" style={{ color: tierHex }}>
                              {level}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Info column */}
                    <div className="flex flex-col gap-1.5 min-w-0">
                      {/* Username */}
                      <h2
                        className="text-xl font-black tracking-tight truncate"
                        style={{ color: "#fff", textShadow: `0 0 20px ${tierHex ?? "#fff"}20` }}
                      >
                        {user.username}
                      </h2>

                      {/* Insignia de rango metálica */}
                      <div className="flex items-center gap-2">
                        <div
                          className="px-3 py-0.5 rounded-full relative overflow-hidden"
                          style={{
                            background: `linear-gradient(135deg, ${tierHex}15, ${tierHex}05)`,
                            border: `1px solid ${tierHex}30`,
                            boxShadow: `inset 0 1px 0 ${tierHex}15, 0 0 12px ${tierHex}10`,
                          }}
                        >
                          <div
                            className="absolute inset-0 pointer-events-none"
                            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 50%)" }}
                          />
                          <span className="relative text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: tierHex }}>
                            {tierName}
                          </span>
                        </div>
                      </div>

                      {/* Barra de progreso de nivel */}
                      <div className="w-full max-w-[160px]">
                        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: `${tierHex}10` }}>
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${progress}%`,
                              background: `linear-gradient(90deg, ${tierHex}90, ${tierHex})`,
                              boxShadow: `0 0 10px ${tierHex}80, 0 0 4px ${tierHex}40`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Separator ── */}
                  <div
                    className="w-full h-px"
                    style={{ background: `linear-gradient(90deg, transparent, ${tierHex ?? "#fff"}15, transparent)` }}
                  />

                  {/* ── CAREER + FEATURED GAMES (side by side) ── */}
                  <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0 w-full">

                    {/* Left column: Career highlights */}
                    <div className="flex flex-col gap-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/20 mb-0.5">
                        {t("profile.career")}
                      </h3>
                      {/* Top 1 */}
                      <div
                        className="relative overflow-hidden flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                        style={{
                          background: "linear-gradient(145deg, rgba(251,191,36,0.06) 0%, rgba(251,191,36,0.01) 100%)",
                          border: "1px solid rgba(251,191,36,0.12)",
                        }}
                      >
                        <span className="text-lg leading-none">🏆</span>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/25">
                            {t("profile.total_top1")}
                          </span>
                          <span
                            className="text-xl font-black leading-tight tabular-nums"
                            style={{
                              color: careerStats.totalTop1 > 0 ? "#fbbf24" : "rgba(255,255,255,0.15)",
                              fontFeatureSettings: "'tnum'",
                              textShadow: careerStats.totalTop1 > 0 ? "0 0 10px rgba(251,191,36,0.4)" : "none",
                            }}
                          >
                            {careerStats.totalTop1}
                          </span>
                        </div>
                      </div>
                      {/* Top 5 */}
                      <div
                        className="relative overflow-hidden flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                        style={{
                          background: "linear-gradient(145deg, rgba(34,211,238,0.05) 0%, rgba(34,211,238,0.01) 100%)",
                          border: "1px solid rgba(34,211,238,0.10)",
                        }}
                      >
                        <span className="text-lg leading-none">🏅</span>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/25">
                            {t("profile.total_top5")}
                          </span>
                          <span
                            className="text-xl font-black leading-tight tabular-nums"
                            style={{
                              color: careerStats.totalTop5 > 0 ? "#22d3ee" : "rgba(255,255,255,0.15)",
                              fontFeatureSettings: "'tnum'",
                              textShadow: careerStats.totalTop5 > 0 ? "0 0 10px rgba(34,211,238,0.35)" : "none",
                            }}
                          >
                            {careerStats.totalTop5}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right column: Featured games */}
                    <div className="flex flex-col gap-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/20 mb-0.5">
                        {t("profile.featured_games")}
                      </h3>

                      {topGames.length === 0 ? (
                        <p className="text-white/15 text-xs py-3 italic">
                          {t("profile.no_data")}
                        </p>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {topGames.map((g) => {
                            const cardStyle = getRankCardStyle(g.rank);
                            return (
                              <div
                                key={g.gameId}
                                className="relative overflow-hidden flex items-center justify-between px-3 py-2.5 rounded-lg"
                                style={{
                                  background: cardStyle.background,
                                  border: `1px solid ${cardStyle.borderColor}`,
                                }}
                              >
                                <div className="flex flex-col min-w-0">
                                  <span className="text-[13px] font-bold text-white/75 truncate">
                                    <span className={`font-black ${getRankAccent(g.rank)}`}>Top {g.rank}</span>
                                    {" "}
                                    <span className="text-white/30">{t("profile.in_game")}</span>
                                    {" "}
                                    {g.gameName}
                                  </span>
                                </div>
                                <span
                                  className="text-[13px] font-bold text-white/40 ml-2 shrink-0 tabular-nums"
                                  style={{ fontFeatureSettings: "'tnum'" }}
                                >
                                  {g.score.toLocaleString()}
                                </span>
                              </div>
                            );
                          })}

                          {topGames.length < 3 &&
                            Array.from({ length: 3 - topGames.length }).map((_, i) => (
                              <div
                                key={`empty-${i}`}
                                className="flex items-center justify-center px-3 py-2.5 rounded-lg border border-dashed"
                                style={{ borderColor: "rgba(255,255,255,0.04)" }}
                              >
                                <span className="text-[10px] text-white/8">—</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default PublicProfileModal;
