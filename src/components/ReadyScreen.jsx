/**
 * ReadyScreen.jsx — Pantalla de Atracción "Premium Esports"
 *
 * Estado `ready`: la portada espectacular del juego.
 * Glassmorphism, sombras dramáticas, logo grande, título llamativo
 * y un texto parpadeante "Toca para empezar".
 *
 * Interacción:
 *  - onClick → pasa al estado `countdown`
 *  - Scroll (swipe arriba/abajo) → fluye sin interferir (pointer-events
 *    configurados para no bloquear el scroll nativo)
 *
 * Props:
 *  - logo:        string — ruta al logo del juego
 *  - logoScale:   number — escala opcional del logo (default 1)
 *  - emoji:       string — emoji fallback si no hay logo
 *  - title:       string — título del juego
 *  - instruction: string — texto de instrucciones
 *  - color:       string — clase Tailwind bg para acento
 *  - onStart:     () => void — callback al tocar para empezar
 */

import { useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "../i18n";

/** Max px movement to still count as a tap (not a scroll) */
const TAP_THRESHOLD = 10;

const ReadyScreen = ({
  logo,
  logoScale = 1,
  emoji,
  title,
  instruction,
  color,
  onStart,
  onOpenChallenges,
  onOpenGallery,
  challengeStatus = "pending",
}) => {
  const { t } = useLanguage();
  const startPos = useRef(null);

  /* ── Tap detection that coexists with scroll ──
     Track pointerdown position → on pointerup, if the finger
     barely moved it's a tap → fire onStart.
     This avoids relying on `click` which mobile browsers suppress
     when touch-action: pan-y triggers a scroll gesture. */
  const handlePointerDown = useCallback((e) => {
    startPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerUp = useCallback((e) => {
    if (!startPos.current) return;
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    startPos.current = null;
    if (dx < TAP_THRESHOLD && dy < TAP_THRESHOLD) {
      onStart();
    }
  }, [onStart]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="absolute inset-0 z-[65] flex items-center justify-center"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      style={{ touchAction: "pan-y" }}
    >
      {/* ── Fondo oscuro con desenfoque ── */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* ── Tarjeta central glassmorphism ── */}
      <motion.div
        initial={{ y: 30, opacity: 0, scale: 0.92 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: -20, opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex flex-col items-center w-[85%] max-w-sm
                   px-8 py-10 rounded-3xl
                   bg-white/[0.07] backdrop-blur-xl
                   border border-white/12
                   shadow-[0_8px_60px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)]"
      >
        {/* ── Glow accent detrás del logo ── */}
        <div
          className={`absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2
                      w-40 h-40 rounded-full blur-3xl opacity-30 ${color || "bg-violet-600"}`}
        />

        {/* ── Logo / Emoji ── */}
        <div className="relative mb-6">
          {logo ? (
            <motion.img
              src={logo}
              alt={title}
              draggable={false}
              className="w-28 h-28 object-contain drop-shadow-[0_4px_30px_rgba(255,255,255,0.15)]"
              style={
                logoScale !== 1
                  ? { transform: `scale(${logoScale})`, transformOrigin: "center" }
                  : undefined
              }
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          ) : (
            <motion.span
              className="text-7xl drop-shadow-lg"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              {emoji}
            </motion.span>
          )}
        </div>

        {/* ── Título ── */}
        <motion.h2
          className="text-white text-2xl md:text-3xl font-extrabold tracking-tight text-center mb-2
                     drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]"
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.4 }}
        >
          {title}
        </motion.h2>

        {/* ── Línea decorativa ── */}
        <div className="w-12 h-0.5 bg-linear-to-r from-transparent via-white/30 to-transparent mb-4" />

        {/* ── Instrucciones ── */}
        {instruction && (
          <motion.p
            className="text-white/60 text-sm md:text-base text-center leading-relaxed mb-6 max-w-70"
            style={{ textShadow: "0 1px 6px rgba(0,0,0,0.4)" }}
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.4 }}
          >
            {instruction}
          </motion.p>
        )}

        {/* ── "Toca para empezar" — Texto parpadeante ── */}
        <motion.p
          className="text-white/80 text-sm md:text-base font-semibold tracking-widest uppercase"
          style={{ textShadow: "0 0 20px rgba(255,255,255,0.3)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{
            delay: 0.5,
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {t("ui.tap_to_start") || "Toca para empezar"}
        </motion.p>

        {/* ── Botones: Misiones + Elegir juego ── */}
        {(onOpenChallenges || onOpenGallery) && (
          <motion.div
            className="flex items-center gap-4 mt-6"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.4 }}
          >
            {onOpenChallenges && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenChallenges();
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full
                           backdrop-blur-md border
                           hover:bg-white/[0.14] active:scale-95 transition-all cursor-pointer ${
                  challengeStatus === "allDone" ? "bg-emerald-500/15 border-emerald-500/30" :
                  challengeStatus === "claimable" ? "animate-pulse bg-emerald-500/20 border-emerald-500/40" :
                  challengeStatus === "pending" ? "animate-pulse bg-red-500/20 border-red-500/40" :
                  "bg-white/[0.08] border-white/12"
                }`}
              >
                {/* Target icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 ${
                  challengeStatus === "allDone" ? "text-emerald-400" :
                  challengeStatus === "claimable" ? "text-emerald-400" :
                  challengeStatus === "pending" ? "text-red-400" : "text-white"
                }`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" fill="currentColor" />
                </svg>
                <span className={`text-xs font-semibold ${
                  challengeStatus === "allDone" ? "text-emerald-400" :
                  challengeStatus === "claimable" ? "text-emerald-400" :
                  challengeStatus === "pending" ? "text-red-400" : "text-white/80"
                }`}>
                  {t("ui.challenges") || "Retos"}
                </span>
              </button>
            )}

            {onOpenGallery && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenGallery();
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full
                           bg-white/[0.08] backdrop-blur-md border border-white/12
                           hover:bg-white/[0.14] active:scale-95 transition-all cursor-pointer"
              >
                {/* Grid icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                <span className="text-xs font-semibold text-white/80">
                  {t("ui.games") || "Juegos"}
                </span>
              </button>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* ── Partículas/Glow decorativo exterior ── */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-48 h-1 bg-linear-to-r from-transparent via-white/10 to-transparent rounded-full blur-sm" />
    </motion.div>
  );
};

export default ReadyScreen;
