/**
 * AvatarSelectionModal.jsx — Modal "El Armario" para seleccionar avatar
 *
 * Dos vistas:
 *   1. Grid — Todos los avatares del inventario + "Por defecto"
 *   2. Detalles — Imagen grande, nombre, tier, lore, cómo se consigue
 *
 * Al guardar, actualiza la BD y el estado global del usuario (optimistic).
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getUserAvatars, updateEquippedAvatar } from "../services/avatarService";
import { useLanguage } from "../i18n";
import { User, Check, Sparkles, Info, ArrowLeft } from "lucide-react";

const TIER_COLORS = {
  rookie:    { hex: "#94a3b8", label_es: "Rookie",    label_en: "Rookie" },
  cyberpunk: { hex: "#22d3ee", label_es: "Cyberpunk", label_en: "Cyberpunk" },
  hacker:    { hex: "#d946ef", label_es: "Hacker",    label_en: "Hacker" },
  legend:    { hex: "#fbbf24", label_es: "Leyenda",   label_en: "Legend" },
};

/* ─── Helper: texto de desbloqueo ─── */
function getUnlockText(avatar, t) {
  switch (avatar.unlock_type) {
    case "level":
      return t("avatar.unlock_level", { level: avatar.requirement });
    case "shop":
      return t("avatar.unlock_shop", { price: avatar.base_price });
    case "starter":
      return t("avatar.unlock_starter");
    default:
      return t("avatar.unlock_unknown");
  }
}

/* ═══════════════════════════════════════════════════════════════════
   Vista de Detalles
   ═══════════════════════════════════════════════════════════════════ */
const AvatarDetailView = ({ avatar, lang, t, onBack }) => {
  const tierData = TIER_COLORS[avatar.tier] || TIER_COLORS.rookie;
  const tierHex  = tierData.hex;
  const tierLabel = lang === "es" ? tierData.label_es : tierData.label_en;
  const name = (lang === "en" && avatar.name_en) ? avatar.name_en : avatar.name_es;
  const description = (lang === "en" && avatar.description_en)
    ? avatar.description_en
    : avatar.description_es;

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className="flex flex-col"
    >
      {/* Header con botón Volver */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
        <button
          onClick={onBack}
          className="w-7 h-7 flex items-center justify-center rounded-md bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 transition-all cursor-pointer"
          aria-label={t("avatar.back")}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="text-xs font-extrabold tracking-[0.18em] uppercase text-white/70">
          {t("avatar.details")}
        </h2>
      </div>

      <div className="mx-5 h-px bg-white/[0.06]" />

      {/* Contenido */}
      <div className="px-5 pt-5 pb-5 flex flex-col items-center gap-4">
        {/* Imagen grande */}
        <div className="relative">
          <div
            className="w-28 h-28 rounded-full p-[2px]"
            style={{
              background: `conic-gradient(from 180deg, ${tierHex}, ${tierHex}30 40%, ${tierHex} 60%, ${tierHex}30)`,
              boxShadow: `0 0 32px ${tierHex}25, 0 0 64px ${tierHex}10`,
            }}
          >
            <div className="w-full h-full rounded-full overflow-hidden bg-[#0a0f1e]">
              <img
                src={`/avatars/${avatar.id}.webp`}
                alt={name}
                className="w-full h-full object-cover"
                draggable={false}
                onError={(e) => {
                  if (!e.target.src.endsWith(".jpg")) {
                    e.target.src = `/avatars/${avatar.id}.jpg`;
                  }
                }}
              />
            </div>
          </div>
          {/* Reflejo */}
          <div
            className="w-16 h-1 rounded-full mx-auto mt-2 blur-md opacity-40"
            style={{ background: tierHex }}
          />
        </div>

        {/* Nombre */}
        <h3 className="text-xl font-black text-white tracking-wide text-center">
          {name}
        </h3>

        {/* Tier badge */}
        <div
          className="px-4 py-1.5 rounded-sm text-[11px] font-extrabold uppercase tracking-[0.25em]"
          style={{
            color: tierHex,
            background: `linear-gradient(135deg, ${tierHex}12, ${tierHex}06)`,
            border: `1px solid ${tierHex}30`,
            textShadow: `0 0 6px ${tierHex}60`,
          }}
        >
          {tierLabel}
        </div>

        {/* Divider */}
        <div className="w-full h-px opacity-20" style={{ background: `linear-gradient(90deg, transparent, ${tierHex}, transparent)` }} />

        {/* Lore / Descripción */}
        {description && (
          <div className="w-full">
            <p className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-white/25 mb-1.5">
              {t("avatar.lore")}
            </p>
            <p className="text-sm leading-relaxed text-slate-400 italic">
              "{description}"
            </p>
          </div>
        )}

        {/* Cómo se consigue */}
        <div className="w-full">
          <p className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-white/25 mb-1.5">
            {t("avatar.how_to_get")}
          </p>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-md bg-white/[0.03] border border-white/[0.06]">
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: tierHex, boxShadow: `0 0 6px ${tierHex}` }}
            />
            <span className="text-sm text-white/60 font-medium">
              {getUnlockText(avatar, t)}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   Modal Principal
   ═══════════════════════════════════════════════════════════════════ */
const AvatarSelectionModal = ({ isOpen, onClose, currentUser, onAvatarChange }) => {
  const { lang, t } = useLanguage();
  const [avatars, setAvatars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(
    currentUser?.equipped_avatar_id || "none"
  );
  const [detailAvatar, setDetailAvatar] = useState(null); // null = vista Grid

  // Cargar inventario al abrir
  useEffect(() => {
    if (!isOpen || !currentUser?.id) return;

    setSelectedAvatar(currentUser.equipped_avatar_id || "none");
    setDetailAvatar(null);
    setLoading(true);

    getUserAvatars(currentUser.id).then((result) => {
      if (result.success) {
        setAvatars(result.data || []);
      }
      setLoading(false);
    });
  }, [isOpen, currentUser?.id, currentUser?.equipped_avatar_id]);

  const handleSave = async () => {
    if (!currentUser?.id) return;
    if (selectedAvatar === (currentUser.equipped_avatar_id || "none")) {
      onClose();
      return;
    }

    setSaving(true);
    onAvatarChange(selectedAvatar);

    const result = await updateEquippedAvatar(currentUser.id, selectedAvatar);
    if (!result.success) {
      onAvatarChange(currentUser.equipped_avatar_id || "none");
    }

    setSaving(false);
    onClose();
  };

  const getTierColor = (tier) => TIER_COLORS[tier]?.hex || "#94a3b8";
  const getAvatarName = (avatar) =>
    (lang === "en" && avatar.name_en) ? avatar.name_en : avatar.name_es;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-lg z-[60]"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 16 }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="w-full max-w-md pointer-events-auto overflow-hidden relative"
              style={{
                background: "linear-gradient(175deg, #0c1222 0%, #050510 100%)",
                border: "1px solid rgba(34, 211, 238, 0.15)",
                borderRadius: "6px",
                clipPath:
                  "polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px))",
              }}
            >
              {/* Top accent line */}
              <div
                className="absolute top-0 left-[8px] right-[8px] h-px opacity-50"
                style={{
                  background: "linear-gradient(90deg, transparent, #22d3ee, transparent)",
                }}
              />

              <AnimatePresence mode="wait">
                {detailAvatar ? (
                  /* ─── Vista de Detalles ─── */
                  <AvatarDetailView
                    key="detail"
                    avatar={detailAvatar}
                    lang={lang}
                    t={t}
                    onBack={() => setDetailAvatar(null)}
                  />
                ) : (
                  /* ─── Vista de Grid ─── */
                  <motion.div
                    key="grid"
                    initial={{ opacity: 0, x: -40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ type: "spring", damping: 28, stiffness: 300 }}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 pt-5 pb-3">
                      <div className="flex items-center gap-2.5">
                        <Sparkles className="w-4 h-4 text-cyan-400" />
                        <h2 className="text-xs font-extrabold tracking-[0.18em] uppercase text-white/70">
                          {t("avatar.select_title")}
                        </h2>
                      </div>
                      <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-md bg-white/5 hover:bg-white/10 text-white/30 hover:text-white/60 text-xs transition-all cursor-pointer"
                        aria-label={t("auth.close")}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="mx-5 h-px bg-white/[0.06]" />

                    {/* Grid de avatares */}
                    <div className="px-5 pt-4 pb-2 max-h-[50vh] overflow-y-auto">
                      {loading ? (
                        <div className="flex items-center justify-center py-10">
                          <div className="w-6 h-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-3">
                          {/* Opción "Por defecto" */}
                          <button
                            onClick={() => setSelectedAvatar("none")}
                            className={`group relative flex flex-col items-center gap-2 p-3 rounded-lg border transition-all cursor-pointer
                              ${
                                selectedAvatar === "none"
                                  ? "border-cyan-400/50 bg-cyan-400/10 shadow-[0_0_12px_rgba(34,211,238,0.15)]"
                                  : "border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
                              }`}
                          >
                            {selectedAvatar === "none" && (
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

                          {/* Avatares del inventario */}
                          {avatars.map((avatar) => {
                            const isSelected = selectedAvatar === avatar.id;
                            const tierColor = getTierColor(avatar.tier);

                            return (
                              <div key={avatar.id} className="relative">
                                {/* Tarjeta principal — seleccionar */}
                                <button
                                  onClick={() => setSelectedAvatar(avatar.id)}
                                  className={`group relative w-full flex flex-col items-center gap-2 p-3 rounded-lg border transition-all cursor-pointer
                                    ${
                                      isSelected
                                        ? "bg-white/10 shadow-lg"
                                        : "border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
                                    }`}
                                  style={
                                    isSelected
                                      ? {
                                          borderColor: `${tierColor}60`,
                                          boxShadow: `0 0 16px ${tierColor}20`,
                                        }
                                      : {}
                                  }
                                >
                                  {/* Checkmark */}
                                  {isSelected && (
                                    <div
                                      className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full flex items-center justify-center"
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
                                      src={`/avatars/${avatar.id}.webp`}
                                      alt={getAvatarName(avatar)}
                                      className="w-full h-full object-cover"
                                      draggable={false}
                                      onError={(e) => {
                                        if (!e.target.src.endsWith(".jpg")) {
                                          e.target.src = `/avatars/${avatar.id}.jpg`;
                                        }
                                      }}
                                    />
                                  </div>

                                  {/* Nombre */}
                                  <span
                                    className="text-[10px] font-bold uppercase tracking-wider w-full text-center leading-tight line-clamp-2 min-h-[1.75em]"
                                    style={{ color: isSelected ? tierColor : "rgba(255,255,255,0.4)" }}
                                  >
                                    {getAvatarName(avatar)}
                                  </span>
                                </button>

                                {/* Botón Info — esquina superior derecha */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDetailAvatar(avatar);
                                  }}
                                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center
                                    bg-black/40 border border-white/10 text-white/25 backdrop-blur-sm
                                    hover:bg-white/10 hover:border-white/25 hover:text-white/60
                                    transition-all cursor-pointer z-10"
                                  aria-label={t("avatar.details")}
                                >
                                  <Info className="w-3 h-3" strokeWidth={2.5} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {!loading && avatars.length === 0 && (
                        <p className="text-white/25 text-xs text-center mt-3 mb-1">
                          {t("avatar.no_avatars")}
                        </p>
                      )}
                    </div>

                    <div className="mx-5 h-px bg-white/[0.06]" />

                    {/* Footer — Botón Guardar */}
                    <div className="px-5 py-4">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full py-3 rounded-md bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm uppercase tracking-[0.12em] hover:shadow-[0_0_16px_rgba(34,211,238,0.25)] transition-all cursor-pointer"
                      >
                        {saving ? t("avatar.saving") : t("avatar.save")}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AvatarSelectionModal;
