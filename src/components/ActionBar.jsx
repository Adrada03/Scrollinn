/**
 * ActionBar.jsx — Barra lateral de acciones
 *
 * Columna vertical de iconos a la derecha:
 *  - Like (corazón) con contador
 *  - Registrarse (placeholder para futuro)
 *  - Galería de juegos
 *
 * Todos los botones tienen fondo oscuro semi-opaco + borde
 * para garantizar contraste sobre cualquier fondo de juego.
 */

import { motion } from "framer-motion";
import { useLanguage } from "../i18n";

const btnBase =
  "w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-colors " +
  "bg-black/40 backdrop-blur-sm border border-white/15 hover:bg-black/60";

const ActionBar = ({ likes, isLiked, onLike, onOpenGallery, onOpenChallenges, challengeStatus = "pending" }) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center gap-6">
      {/* === 1. Like === */}
      <button
        onClick={onLike}
        className="flex flex-col items-center gap-1 group cursor-pointer"
        aria-label={t("ui.like")}
      >
        <motion.div
          whileTap={{ scale: 1.4 }}
          animate={isLiked ? { scale: [1, 1.3, 1] } : {}}
          transition={{ duration: 0.3 }}
          className={`${btnBase} ${
            isLiked ? "bg-red-500/25! border-red-500/30!" : ""
          }`}
        >
          {isLiked ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 md:w-8 md:h-8 text-red-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 md:w-8 md:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
          )}
        </motion.div>
        <span className={`text-xs md:text-sm font-semibold drop-shadow ${isLiked ? "text-red-400" : "text-white/80"}`}>
          {likes}
        </span>
      </button>

      {/* === 2. Retos Diarios (Daily Challenges) === */}
      <button
        onClick={onOpenChallenges}
        className="flex flex-col items-center gap-1 group cursor-pointer"
        aria-label="Retos Diarios"
      >
        <div className={`${btnBase} relative ${challengeStatus === "allDone" ? "bg-emerald-500/20! border-emerald-500/30!" : ""}`}>
          {/* Icono de target / diana */}
          <svg xmlns="http://www.w3.org/2000/svg" className={`w-6 h-6 md:w-7 md:h-7 ${challengeStatus === "allDone" ? "text-emerald-400" : "text-white"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
          </svg>
          {/* Notification dot — color depends on challenge status */}
          {challengeStatus === "pending" && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          )}
          {challengeStatus === "claimable" && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
          )}
        </div>
        <span className={`text-xs md:text-sm font-semibold drop-shadow ${challengeStatus === "allDone" ? "text-emerald-400" : "text-white/80"}`}>Retos</span>
      </button>

      {/* === 3. Galería === */}
      <button
        onClick={onOpenGallery}
        className="flex flex-col items-center gap-1 group cursor-pointer"
        aria-label={t("ui.gallery_aria")}
      >
        <div className={btnBase}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 md:w-7 md:h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
        </div>
        <span className="text-xs md:text-sm font-semibold text-white/80 drop-shadow">{t("ui.games")}</span>
      </button>
    </div>
  );
};

export default ActionBar;
