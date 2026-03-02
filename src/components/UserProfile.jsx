/**
 * UserProfile.jsx — Pantalla de perfil del usuario (Pestaña Derecha)
 *
 * Layout: flex-col h-full
 *  1. Header fijo (flex-none): Avatar, username, XP bar, stats, settings
 *  2. Rankings scrollable (flex-1 overflow-y-auto): búsqueda + grid
 *
 * Datos: Supabase RPC `get_user_profile_stats`
 */

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "../i18n";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";
import Avatar from "./Avatar";
import SettingsModal from "./SettingsModal";
import {
  getLevelFromXP,
  getLevelProgress,
  getTierHexColor,
  getTierTextColor,
  getTierName,
} from "../utils/leveling";

/* ── Skeleton loader ── */
const SkeletonCard = () => (
  <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 animate-pulse">
    <div className="flex-1 space-y-2">
      <div className="h-4 w-28 bg-white/10 rounded" />
      <div className="h-3 w-16 bg-white/5 rounded" />
    </div>
    <div className="w-12 h-12 rounded-xl bg-white/10" />
  </div>
);

const UserProfile = ({ onOpenAvatarModal, onPlayGame }) => {
  const { currentUser, logout } = useAuth();
  const { t } = useLanguage();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  // ── Datos de nivel ──
  const xp = currentUser?.xp ?? 0;
  const level = getLevelFromXP(xp);
  const progress = getLevelProgress(xp);
  const tierHex = getTierHexColor(level);
  const tierText = getTierTextColor(level);
  const tierName = getTierName(level);

  // ── Cargar datos del perfil ──
  useEffect(() => {
    if (!currentUser?.id) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    async function fetchProfile() {
      try {
        const { data, error } = await supabase.rpc("get_user_profile_stats", {
          p_user_id: currentUser.id,
        });

        if (cancelled) return;

        if (error) {
          console.warn("Error fetching profile stats:", error.message);
          setProfileData(null);
        } else {
          setProfileData(data);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("Network error fetching profile:", err.message);
          setProfileData(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchProfile();
    return () => { cancelled = true; };
  }, [currentUser?.id, currentUser?.xp]);

  const handleLogout = () => logout();

  // ── Posición color helpers ──
  const getPositionColor = (position) => {
    if (position === 1) return { color: "#facc15", shadow: "0 0 10px rgba(250,204,21,0.7)" };
    if (position <= 3) return { color: "#fbbf24", shadow: "0 0 8px rgba(217,119,6,0.5)" };
    return { color: "#22d3ee", shadow: "0 0 8px rgba(34,211,238,0.4)" };
  };

  const getPositionBg = (position) => {
    if (position === 1) return "bg-yellow-400/8 border-yellow-400/25";
    if (position <= 3) return "bg-amber-400/8 border-amber-400/20";
    return "bg-white/[0.03] border-white/[0.06]";
  };

  // ── Filtrar rankings por búsqueda ──
  const bestPositions = profileData?.bestPositions ?? profileData?.best_positions ?? [];
  const top1Count = profileData?.top1Count ?? profileData?.top1_count ?? 0;
  const top5Count = profileData?.top5Count ?? profileData?.top5_count ?? 0;

  const filteredRankings = useMemo(() => {
    if (!search.trim()) return bestPositions;
    const q = search.toLowerCase().trim();
    return bestPositions.filter((item) =>
      (item.game_name || "").toLowerCase().includes(q)
    );
  }, [bestPositions, search]);

  // ── Sin login ──
  if (!currentUser) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <svg className="w-10 h-10 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <h2 className="text-white text-xl font-bold">{t("profile.login_required_title")}</h2>
          <p className="text-white/50 text-sm">{t("profile.login_required_desc")}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden">
        {/* ═══ HEADER FIJO ═══ */}
        <div
          className="flex-none relative overflow-hidden"
          style={{
            paddingTop: "calc(var(--sat) + 12px)",
            background: "linear-gradient(180deg, rgba(15,19,24,1) 0%, rgba(10,14,18,0.95) 100%)",
          }}
        >
          {/* Ambient glow */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse, ${tierHex}12, transparent 70%)`,
              filter: "blur(30px)",
            }}
          />

          {/* Settings gear */}
          <div className="relative flex justify-end px-5 mb-2">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="w-9 h-9 rounded-full bg-white/5 border border-white/8 flex items-center justify-center
                hover:bg-white/10 transition-colors cursor-pointer"
              aria-label={t("settings.title")}
            >
              <svg className="w-4.5 h-4.5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>

          {/* Avatar + Username + Tier */}
          <motion.div
            className="relative flex flex-col items-center px-6"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <button
              onClick={onOpenAvatarModal}
              className="relative mb-2 group cursor-pointer active:scale-95 transition-transform duration-150"
            >
              <Avatar equippedAvatarId={currentUser.equipped_avatar_id} size="xl" tierHex={tierHex} />
              {/* Edit badge */}
              <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-gray-900 border-2 border-cyan-500/60
                flex items-center justify-center shadow-lg shadow-cyan-500/20
                group-hover:border-cyan-400 transition-colors">
                <svg className="w-3 h-3 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                </svg>
              </div>
              {/* Tier badge */}
              <div
                className={`absolute -bottom-1 -left-1 px-2 py-0.5 rounded-full bg-gray-900 border border-white/20
                  text-[10px] font-bold uppercase tracking-wider ${tierText}`}
              >
                {tierName}
              </div>
            </button>

            <h2 className="text-white text-lg font-bold mb-0.5">@{currentUser.username}</h2>

            {/* XP Bar compact */}
            <div className="w-full max-w-55 mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-bold ${tierText}`}>
                  {t("profile.level")} {progress.level}
                </span>
                <span className="text-xs text-white/70 font-semibold">
                  {progress.currentLevelXP}/{progress.nextLevelXP} XP
                </span>
              </div>
              <div className="relative w-full h-2 rounded-full bg-white/8 overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${tierHex}80, ${tierHex})`,
                    boxShadow: `0 0 10px ${tierHex}50`,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress.percentage}%` }}
                  transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
                />
              </div>
            </div>
          </motion.div>

          {/* Stats Row */}
          {!isLoading && (
            <motion.div
              className="flex items-center justify-center gap-6 py-3.5 px-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <div className="text-center">
                <div className="text-2xl font-black text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.4)]">
                  {top1Count}
                </div>
                <div className="text-[11px] text-white/80 font-bold uppercase tracking-wider">Top 1</div>
              </div>
              <div className="w-px h-8 bg-white/8" />
              <div className="text-center">
                <div className="text-2xl font-black text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]">
                  {top5Count}
                </div>
                <div className="text-[11px] text-white/80 font-bold uppercase tracking-wider">Top 5</div>
              </div>
              <div className="w-px h-8 bg-white/8" />
              <div className="text-center">
                <div className={`text-2xl font-black ${tierText}`}>{xp.toLocaleString()}</div>
                <div className="text-[11px] text-white/80 font-bold uppercase tracking-wider">XP</div>
              </div>
            </motion.div>
          )}

          {/* Bottom fade divider */}
          <div className="h-px bg-linear-to-r from-transparent via-white/6 to-transparent" />
        </div>

        {/* ═══ RANKINGS CONTAINER (nested scroll) ═══ */}
        <div className="flex-1 flex flex-col min-h-0 bg-black/40 rounded-t-3xl border-t border-white/8 mt-2">

          {/* ── Título + Buscador (fijos) ── */}
          <div className="flex-none p-5 pb-2">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-white/60 text-xs font-bold uppercase tracking-wider shrink-0">
                {t("profile.my_rankings")}
              </h3>
              <div className="flex-1 h-px bg-white/5" />
            </div>

            {/* Search input */}
            {bestPositions.length > 3 && (
              <div className="relative">
                <svg
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("profile.search_placeholder")}
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-white/5 border border-white/8
                    text-white/80 text-sm placeholder:text-white/25 outline-none
                    focus:border-cyan-500/50 focus:bg-white/8 focus:ring-1 focus:ring-cyan-500/20
                    transition-all duration-200"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5
                      flex items-center justify-center rounded-full bg-white/10
                      text-white/50 hover:text-white/80 hover:bg-white/20
                      transition-colors duration-150"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Lista de juegos (ÚNICA zona que scrollea) ── */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-8 min-h-0">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : bestPositions.length === 0 ? (
              <motion.div
                className="text-center py-12"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="text-4xl mb-3">🎮</div>
                <p className="text-white/40 text-sm">{t("profile.no_rankings")}</p>
              </motion.div>
            ) : filteredRankings.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-white/30 text-sm">{t("profile.no_results")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredRankings.map((item, i) => {
                  const posStyle = getPositionColor(item.position);
                  return (
                    <motion.div
                      key={item.game_id || i}
                      className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left bg-white/2 ${getPositionBg(item.position)}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 + i * 0.03, duration: 0.25 }}
                    >
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-semibold text-sm truncate">
                          {item.game_name}
                        </div>
                        <div className="text-white/50 text-xs font-medium mt-0.5">
                          {t("profile.best_score_label")}: <span className="text-white/80 font-bold">{item.score?.toLocaleString() ?? "—"}</span>
                        </div>
                      </div>

                      {/* Position Badge */}
                      <div
                        className="shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center"
                        style={{
                          background: `${posStyle.color}08`,
                          border: `1px solid ${posStyle.color}30`,
                        }}
                      >
                        <span
                          className="text-lg font-black leading-none"
                          style={{ color: posStyle.color, textShadow: posStyle.shadow }}
                        >
                          #{item.position}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Settings Modal ── */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onLogout={handleLogout}
      />
    </>
  );
};

export default UserProfile;
