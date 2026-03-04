/**
 * GalleryModal.jsx — Modal premium de selección de juegos
 *
 * Diseño AAA oscuro inspirado en PS5 / Apple Arcade.
 * Tarjetas con profundidad y animación, scroll invisible y layout responsive.
 */

import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "../i18n";
import { useSoundEffect } from "../hooks/useSoundEffect";

const GalleryModal = ({ isOpen, onClose, games, onSelectGame }) => {
  const { t } = useLanguage();
  const { playNavigation } = useSoundEffect();
  const pointerDownOnBackdrop = useRef(false);

  // Map game back to its original index
  const getOriginalIndex = (game) => games.findIndex((g) => g.id === game.id);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop + container — single fixed layer, click-blocking */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-100 bg-black/60 backdrop-blur-md flex flex-col justify-center items-center"
            onPointerDown={(e) => { pointerDownOnBackdrop.current = e.target === e.currentTarget; }}
            onClick={(e) => { if (e.target === e.currentTarget && pointerDownOnBackdrop.current) onClose(); pointerDownOnBackdrop.current = false; }}
          >

          {/* Centered modal */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 30 }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className="w-full max-w-xl md:max-w-3xl p-4"
            onAnimationComplete={() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }}
          >
            <div className="w-full max-h-[75vh] bg-linear-to-b from-gray-950 to-black rounded-3xl flex flex-col border border-white/10 shadow-[0_0_80px_rgba(99,102,241,0.08)] overflow-hidden" style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}>
              {/* Handle decorativo */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-white/15 rounded-full" />
              </div>

              {/* Header: Title + Close */}
              <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-md px-5 pt-2 pb-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    {t("gallery.choose")}
                  </h2>
                  <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white/8 hover:bg-white/15 text-white/50 hover:text-white text-sm transition-all duration-200 cursor-pointer"
                    aria-label={t("auth.close")}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Grid de juegos — scrollbar invisible */}
              <div className="flex-1 overflow-y-auto px-5 pb-6 overscroll-contain scrollbar-hide">
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 sm:gap-4 md:gap-5 p-2">
                    {games.map((game) => (
                      <motion.button
                        key={game.id}
                        onClick={() => { playNavigation(); onSelectGame(getOriginalIndex(game)); }}
                        whileTap={{ scale: 0.95 }}
                        className="bg-linear-to-b from-slate-800/80 to-slate-900/80 border border-slate-700/50 rounded-2xl p-3 sm:p-4 md:p-5 flex flex-col items-center justify-center gap-1.5 md:gap-2.5 text-white cursor-pointer relative overflow-hidden group transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:border-indigo-500/50 hover:shadow-[0_8px_30px_rgb(0,0,0,0.5)]"
                      >
                        {/* Hover glow overlay */}
                        <div className="absolute inset-0 bg-linear-to-t from-indigo-500/0 to-indigo-500/0 group-hover:from-indigo-500/5 group-hover:to-transparent transition-all duration-300" />

                        {/* Subtle top shine */}
                        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/10 to-transparent" />

                        {game.logo ? (
                          <img
                            src={game.logo}
                            alt=""
                            className="w-14 h-14 md:w-18 md:h-18 object-cover rounded-xl shrink-0 mx-auto relative z-10 drop-shadow-lg group-hover:drop-shadow-[0_4px_12px_rgba(99,102,241,0.3)] transition-all duration-300"
                            draggable={false}
                          />
                        ) : (
                          <span className="text-4xl md:text-5xl relative z-10 drop-shadow-lg">
                            {game.emoji}
                          </span>
                        )}
                        <span className="text-[10px] sm:text-xs md:text-sm text-center font-medium leading-tight whitespace-normal wrap-break-word mt-2 relative z-10 text-white/90 group-hover:text-white transition-colors duration-300">
                          {game.title}
                        </span>
                      </motion.button>
                    ))}
                  </div>
              </div>
            </div>
          </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default GalleryModal;
