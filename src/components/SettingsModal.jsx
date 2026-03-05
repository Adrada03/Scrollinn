/**
 * SettingsModal.jsx — Modal/Bottom Sheet de ajustes
 *
 * Contiene:
 *  - Selector de idioma
 *  - Toggle de sonido
 *  - Botón de cerrar sesión
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "../i18n";
import { useSound } from "../context/SoundContext";
import { useSoundEffect } from "../hooks/useSoundEffect";
import CreditsModal from "./CreditsModal";

/* ── Banderas inline (SVG) ── */
const FlagGB = () => (
  <svg viewBox="0 0 60 40" className="w-full h-full rounded-sm" aria-hidden="true">
    <rect fill="#012169" width="60" height="40"/>
    <path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" strokeWidth="8"/>
    <path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" strokeWidth="4"/>
    <path d="M30,0 V40 M0,20 H60" stroke="#fff" strokeWidth="12"/>
    <path d="M30,0 V40 M0,20 H60" stroke="#C8102E" strokeWidth="6"/>
  </svg>
);

const FlagES = () => (
  <svg viewBox="0 0 60 40" className="w-full h-full rounded-sm" aria-hidden="true">
    <rect fill="#AA151B" width="60" height="40"/>
    <rect fill="#F1BF00" y="10" width="60" height="20"/>
  </svg>
);

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const sheetVariants = {
  hidden: { y: "100%" },
  visible: { y: 0 },
};

const SettingsModal = ({ isOpen, onClose, onLogout }) => {
  const { lang, toggleLang, t } = useLanguage();
  const { isMuted, toggleMute } = useSound();
  const { playNavigation } = useSoundEffect();
  const [showCredits, setShowCredits] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleClose = () => {
    setShowLogoutConfirm(false);
    onClose();
  };

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 z-200 bg-black/60 backdrop-blur-sm"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: 0.2 }}
            onClick={handleClose}
          />

          {/* Bottom Sheet (drag to dismiss) */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-201 bg-gray-950 border-t border-white/10 rounded-t-2xl"
            variants={sheetVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            style={{ paddingBottom: "var(--sab)" }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 300) handleClose();
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            <div className="px-6 pb-6 space-y-4">
              {/* Título */}
              <h2 className="text-white text-lg font-bold text-center">
                {t("settings.title")}
              </h2>

              {/* ── 1. Idioma ── */}
              <button
                onClick={() => { playNavigation(); toggleLang(); }}
                className="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10
                  hover:bg-white/10 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/20 flex items-center justify-center">
                    {lang === "es" ? <FlagES /> : <FlagGB />}
                  </div>
                  <span className="text-white font-medium">{t("settings.language")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white/50 text-sm">{lang === "es" ? "Español" : "English"}</span>
                  <svg className="w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </button>

              {/* ── 2. Sonido ── */}
              <button
                onClick={() => {
                  playNavigation();
                  toggleMute();
                }}
                className="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10
                  hover:bg-white/10 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  {!isMuted ? (
                    <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                      <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H2v6h4l5 4V5z" />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H2v6h4l5 4V5z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M23 9l-6 6" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 9l6 6" />
                      </svg>
                    </div>
                  )}
                  <span className="text-white font-medium">{t("settings.sound")}</span>
                </div>
                <div className={`w-12 h-7 rounded-full p-0.5 transition-colors duration-200 ${
                  !isMuted ? "bg-violet-500" : "bg-white/10"
                }`}>
                  <div className={`w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-200 ${
                    !isMuted ? "translate-x-5" : "translate-x-0"
                  }`} />
                </div>
              </button>

              {/* ── 3. Créditos y Licencias ── */}
              <button
                onClick={() => { playNavigation(); setShowCredits(true); }}
                className="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10
                  hover:bg-white/10 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <span className="text-white font-medium">{t("credits.button")}</span>
                </div>
                <svg className="w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>

              {/* ── 4. Cerrar Sesión ── */}
              {!showLogoutConfirm ? (
                <button
                  onClick={() => { playNavigation(); setShowLogoutConfirm(true); }}
                  className="w-full p-4 rounded-xl border
                    hover:bg-red-500/20 transition-colors cursor-pointer
                    text-red-400 font-semibold text-center"
                  style={{
                    background: "rgba(127,29,29,0.15)",
                    borderColor: "rgba(239,68,68,0.3)",
                    boxShadow: "0 0 15px rgba(239,68,68,0.1), inset 0 0 15px rgba(239,68,68,0.05)",
                  }}
                >
                  {t("auth.logout")}
                </button>
              ) : (
                <div className="w-full p-4 rounded-xl border space-y-3"
                  style={{
                    background: "rgba(127,29,29,0.15)",
                    borderColor: "rgba(239,68,68,0.3)",
                    boxShadow: "0 0 15px rgba(239,68,68,0.1), inset 0 0 15px rgba(239,68,68,0.05)",
                  }}
                >
                  <p className="text-white/80 text-sm text-center font-medium">
                    {t("auth.logout_confirm")}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { playNavigation(); setShowLogoutConfirm(false); }}
                      className="flex-1 p-3 rounded-xl bg-white/5 border border-white/10
                        text-white/60 font-semibold text-sm cursor-pointer
                        hover:bg-white/10 transition-colors"
                    >
                      {t("auth.logout_no")}
                    </button>
                    <button
                      onClick={() => { playNavigation(); onLogout(); handleClose(); }}
                      className="flex-1 p-3 rounded-xl bg-red-500/20 border border-red-500/30
                        text-red-400 font-semibold text-sm cursor-pointer
                        hover:bg-red-500/30 transition-colors"
                    >
                      {t("auth.logout_yes")}
                    </button>
                  </div>
                </div>
              )}

              {/* Botón Cerrar */}
              <button
                onClick={handleClose}
                className="w-full p-3 text-white/40 text-sm font-medium text-center cursor-pointer
                  hover:text-white/60 transition-colors"
              >
                {t("auth.close")}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

    {/* Credits Modal */}
    <CreditsModal isOpen={showCredits} onClose={() => setShowCredits(false)} />
    </>
  );
};

export default SettingsModal;
