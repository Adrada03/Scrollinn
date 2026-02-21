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

const ActionBar = ({ likes, isLiked, onLike, onOpenGallery, onOpenAuth, currentUser }) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center gap-5 md:gap-6">
      {/* === Like === */}
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
            isLiked ? "!bg-red-500/25 !border-red-500/30" : ""
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

      {/* === Registrarse / Perfil === */}
      <button
        onClick={onOpenAuth}
        className="flex flex-col items-center gap-1 group cursor-pointer"
        aria-label={currentUser ? t("ui.my_account") : t("ui.register_aria")}
      >
        <div className={`${btnBase} ${currentUser ? "!bg-emerald-500/50 !border-emerald-400/60 ring-1 ring-emerald-400/30" : ""}`}>
          {currentUser ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 md:w-7 md:h-7 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 md:w-7 md:h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
            </svg>
          )}
        </div>
        <span className={`text-xs md:text-sm font-semibold ${currentUser ? "text-emerald-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" : "text-white/80 drop-shadow"}`}>
          {currentUser ? currentUser.username : t("ui.register_label")}
        </span>
      </button>

      {/* === Galería === */}
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
