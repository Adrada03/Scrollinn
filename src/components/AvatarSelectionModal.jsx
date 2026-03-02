/**
 * AvatarSelectionModal.jsx — Bottom Sheet "Tu Colección"
 *
 * Split view:
 *   ZONA A (top, scrollable): Grid con TODOS los avatares (owned + locked)
 *   ZONA B (bottom, fijo): Panel de inspección con lore + botón de acción
 *
 * Al pulsar "EQUIPAR", actualiza la BD y el estado global (optimistic).
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { getUserAvatars, updateEquippedAvatar } from "../services/avatarService";
import { useLanguage } from "../i18n";
import { User, Check, Sparkles } from "lucide-react";

const TIER_COLORS = {
  rookie:    { hex: "#94a3b8", label_es: "Rookie",    label_en: "Rookie" },
  cyberpunk: { hex: "#22d3ee", label_es: "Cyberpunk", label_en: "Cyberpunk" },
  hacker:    { hex: "#d946ef", label_es: "Hacker",    label_en: "Hacker" },
  legend:    { hex: "#fbbf24", label_es: "Leyenda",   label_en: "Legend" },
};

/* Helper: construye src del avatar desde image_url de la BD */
const getAvatarImgSrc = (avatar) => {
  if (!avatar.image_url) return `/avatars/${avatar.id}.png`;
  if (avatar.image_url.startsWith("http") || avatar.image_url.startsWith("/"))
    return avatar.image_url;
  return `/avatars/${avatar.image_url}`;
};

/* ═══════════════════════════════════════════════════════════════════
   Modal Principal — Bottom Sheet
   ═══════════════════════════════════════════════════════════════════ */
const AvatarSelectionModal = ({ isOpen, onClose, currentUser, onAvatarChange }) => {
  const { lang, t } = useLanguage();
  const [avatars, setAvatars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inspectedAvatar, setInspectedAvatar] = useState(null); // avatar object or null

  const equippedId = currentUser?.equipped_avatar_id || "none";

  // Cargar catálogo completo al abrir
  useEffect(() => {
    if (!isOpen || !currentUser?.id) return;

    setInspectedAvatar(null);
    setLoading(true);

    getUserAvatars(currentUser.id).then((result) => {
      if (result.success) {
        setAvatars(result.data || []);
      }
      setLoading(false);
    });
  }, [isOpen, currentUser?.id, currentUser?.equipped_avatar_id]);

  // Helpers
  const getTierColor = (tier) => TIER_COLORS[tier]?.hex || "#94a3b8";
  const getTierLabel = (tier) => {
    const data = TIER_COLORS[tier] || TIER_COLORS.rookie;
    return lang === "en" ? data.label_en : data.label_es;
  };
  const getAvatarName = (avatar) =>
    (lang === "en" && avatar.name_en) ? avatar.name_en : avatar.name_es;
  const getAvatarDesc = (avatar) =>
    (lang === "en" && avatar.description_en) ? avatar.description_en : avatar.description_es;

  // Equipar avatar
  const handleEquip = useCallback(async (avatarId) => {
    if (!currentUser?.id || avatarId === equippedId) return;

    setSaving(true);
    // Optimistic update
    onAvatarChange(avatarId);

    const result = await updateEquippedAvatar(currentUser.id, avatarId);
    if (!result.success) {
      // Rollback
      onAvatarChange(equippedId);
    }

    setSaving(false);
  }, [currentUser?.id, equippedId, onAvatarChange]);

  // Inspected avatar derived data
  const inspTier = inspectedAvatar ? getTierColor(inspectedAvatar.tier) : "#94a3b8";
  const inspName = inspectedAvatar ? getAvatarName(inspectedAvatar) : "";
  const inspDesc = inspectedAvatar ? getAvatarDesc(inspectedAvatar) : "";
  const inspTierLabel = inspectedAvatar ? getTierLabel(inspectedAvatar.tier) : "";
  const inspIsEquipped = inspectedAvatar?.id === equippedId;
  const inspIsDefault = inspectedAvatar?.id === "__default__";

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
            onClick={onClose}
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 360 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.15}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 400) onClose();
            }}
            className="fixed bottom-0 left-0 right-0 z-[201] h-[85vh]"
          >
            <div className="w-full h-full bg-[#0a0f16]/95 backdrop-blur-xl border-t border-white/10 rounded-t-3xl flex flex-col overflow-hidden">
              {/* ── Header ── */}
              <div className="flex-none pt-3 pb-2 px-5">
                {/* Drag handle */}
                <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-3" />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <h2 className="text-sm font-extrabold tracking-[0.15em] uppercase text-white/80">
                      {t("avatar.collection_title")}
                    </h2>
                  </div>
                  <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 transition-all cursor-pointer"
                    aria-label={t("auth.close")}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="mx-5 h-px bg-white/6" />

              {/* ══ ZONA A: Grid de avatares (scrollable) ══ */}
              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-7 h-7 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                    {/* Opción "Por defecto" */}
                    {(() => {
                      const isSelected = inspectedAvatar?.id === "__default__";
                      const isEquipped = equippedId === "none";
                      return (
                        <button
                          onClick={() =>
                            setInspectedAvatar({
                              id: "__default__",
                              name_es: "Por Defecto",
                              name_en: "Default",
                              description_es: "Tu avatar básico. Simple, pero honesto.",
                              description_en: "Your basic avatar. Simple, but honest.",
                              tier: "rookie",
                              owned: true,
                            })
                          }
                          className={`group relative flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all cursor-pointer
                            ${isSelected
                              ? "ring-2 ring-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.3)] border-cyan-400/40 bg-cyan-400/8"
                              : "border-white/8 bg-white/5 hover:border-white/15 hover:bg-white/8"
                            }`}
                        >
                          {isEquipped && (
                            <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-cyan-400 rounded-full flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />
                            </div>
                          )}
                          <div className="w-14 h-14 rounded-full bg-gray-800/80 border border-white/10 flex items-center justify-center">
                            <User className="w-7 h-7 text-white/40" strokeWidth={1.5} />
                          </div>
                          <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                            {t("avatar.default")}
                          </span>
                        </button>
                      );
                    })()}

                    {/* Todos los avatares del catálogo */}
                    {avatars.map((avatar) => {
                      const isSelected = inspectedAvatar?.id === avatar.id;
                      const isEquipped = equippedId === avatar.id;
                      const tierColor = getTierColor(avatar.tier);

                      return (
                        <button
                          key={avatar.id}
                          onClick={() => setInspectedAvatar(avatar)}
                          className={`group relative flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all cursor-pointer
                            ${isSelected
                              ? "ring-2 shadow-lg border-transparent bg-white/8"
                              : "border-white/8 bg-white/5 hover:border-white/15 hover:bg-white/8"
                            }`}
                          style={isSelected ? {
                            "--tw-ring-color": `${tierColor}`,
                            boxShadow: `0 0 15px ${tierColor}30`,
                          } : {}}
                        >
                          {/* Equipped check */}
                          {isEquipped && (
                            <div
                              className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                              style={{ background: tierColor }}
                            >
                              <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />
                            </div>
                          )}

                          {/* Avatar image */}
                          <div
                            className="w-14 h-14 rounded-full overflow-hidden"
                            style={{
                              border: `2px solid ${isSelected ? tierColor : "transparent"}`,
                              boxShadow: isSelected ? `0 0 10px ${tierColor}30` : "none",
                            }}
                          >
                            <img
                              src={getAvatarImgSrc(avatar)}
                              alt={getAvatarName(avatar)}
                              className="w-full h-full object-cover"
                              draggable={false}
                            />
                          </div>

                          {/* Name */}
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider w-full text-center leading-tight line-clamp-2 min-h-[1.75em]"
                            style={{ color: isSelected ? tierColor : "rgba(255,255,255,0.4)" }}
                          >
                            {getAvatarName(avatar)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {!loading && avatars.length === 0 && (
                  <p className="text-white/25 text-xs text-center mt-4">
                    {t("avatar.no_avatars")}
                  </p>
                )}
              </div>

              {/* ══ ZONA B: Panel de Inspección (fijo abajo) ══ */}
              <div className="flex-none border-t border-white/5 bg-black/50">
                <AnimatePresence mode="wait">
                  {inspectedAvatar ? (
                    <motion.div
                      key={inspectedAvatar.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col p-5 gap-3"
                    >
                      {/* Top: Name + Tier badge */}
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-black text-white tracking-wide flex-1 leading-tight">
                          {inspName}
                        </h3>
                        <div
                          className="px-3 py-1 rounded-sm text-[10px] font-extrabold uppercase tracking-[0.2em] shrink-0"
                          style={{
                            color: inspTier,
                            background: `linear-gradient(135deg, ${inspTier}12, ${inspTier}06)`,
                            border: `1px solid ${inspTier}30`,
                            textShadow: `0 0 6px ${inspTier}60`,
                          }}
                        >
                          {inspTierLabel}
                        </div>
                      </div>

                      {/* Lore / Description */}
                      {inspDesc && (
                        <p className="text-white/70 text-sm leading-relaxed italic line-clamp-3">
                          "{inspDesc}"
                        </p>
                      )}

                      {/* Action Button */}
                      <div className="pt-1">
                        {inspIsDefault ? (
                          /* Default avatar actions */
                          equippedId === "none" ? (
                            <button
                              disabled
                              className="w-full py-3.5 rounded-xl bg-white/5 text-white/50 border border-white/10
                                font-bold text-sm uppercase tracking-[0.12em]"
                            >
                              {t("avatar.equipped")}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleEquip("none")}
                              disabled={saving}
                              className="w-full py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50
                                text-black font-bold text-sm uppercase tracking-[0.12em]
                                hover:shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-all cursor-pointer"
                            >
                              {saving ? t("avatar.saving") : t("avatar.equip")}
                            </button>
                          )
                        ) : inspIsEquipped ? (
                          /* Already equipped */
                          <button
                            disabled
                            className="w-full py-3.5 rounded-xl bg-white/5 text-white/50 border border-white/10
                              font-bold text-sm uppercase tracking-[0.12em]"
                          >
                            {t("avatar.equipped")}
                          </button>
                        ) : (
                          /* Owned but not equipped */
                          <button
                            onClick={() => handleEquip(inspectedAvatar.id)}
                            disabled={saving}
                            className="w-full py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50
                              text-black font-bold text-sm uppercase tracking-[0.12em]
                              hover:shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-all cursor-pointer"
                          >
                            {saving ? t("avatar.saving") : t("avatar.equip")}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ) : (
                    /* Placeholder when nothing inspected */
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-center py-10 px-5"
                    >
                      <p className="text-white/20 text-sm text-center">
                        {t("avatar.tap_to_inspect")}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  // Use portal to ensure z-index above BottomNavigationBar
  return createPortal(modalContent, document.body);
};

export default AvatarSelectionModal;
