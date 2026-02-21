/**
 * GalleryModal.jsx — Modal de galería tipo TikTok
 *
 * Se desliza desde abajo como un bottom sheet.
 * Muestra una cuadrícula con todos los juegos disponibles.
 * Al hacer clic en uno, salta directamente a ese juego.
 */

import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "../i18n";

const GalleryModal = ({ isOpen, onClose, games, onSelectGame }) => {
  const { t } = useLanguage();
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
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-40"
            onClick={onClose}
          />

          {/* Centered modal */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="w-full max-w-xl max-h-[70vh] bg-gray-950/95 backdrop-blur-xl rounded-3xl flex flex-col border border-white/10 shadow-2xl pointer-events-auto overflow-hidden">
            {/* Handle decorativo */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-2">
              <h2 className="text-base font-bold text-white">
                {t("gallery.choose")}
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 text-sm transition-colors cursor-pointer"
                aria-label={t("auth.close")}
              >
                ✕
              </button>
            </div>

            {/* Grid de juegos */}
            <div className="flex-1 overflow-y-auto px-5 pb-6 overscroll-contain">
              <div className="grid grid-cols-3 gap-3">
                {games.map((game, index) => (
                  <motion.button
                    key={game.id}
                    onClick={() => onSelectGame(index)}
                    whileTap={{ scale: 0.95 }}
                    className={`${game.color} rounded-2xl p-5 flex flex-col items-center justify-center gap-3 text-white aspect-square cursor-pointer relative overflow-hidden group active:brightness-90 transition-all`}
                  >
                    {/* Hover glow */}
                    <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors" />

                    {game.logo ? (
                      <img src={game.logo} alt="" className="w-16 h-16 object-contain relative z-10 drop-shadow" style={game.logoScale ? { transform: `scale(${game.logoScale})` } : undefined} draggable={false} />
                    ) : (
                      <span className="text-4xl relative z-10">
                        {game.emoji}
                      </span>
                    )}
                    <span className="font-bold text-sm relative z-10 leading-tight text-center text-white/90">
                      {game.title}
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default GalleryModal;
