/**
 * GalleryModal.jsx — Modal premium de selección de juegos
 *
 * Diseño AAA oscuro inspirado en PS5 / Apple Arcade.
 * Incluye buscador sticky, tarjetas con profundidad y animación,
 * scroll invisible y layout responsive.
 */

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "../i18n";

const GalleryModal = ({ isOpen, onClose, games, onSelectGame }) => {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");

  // Reset search when modal closes
  useEffect(() => {
    if (!isOpen) setSearchTerm("");
  }, [isOpen]);

  // Filtered games based on search
  const filteredGames = useMemo(() => {
    if (!searchTerm.trim()) return games;
    const term = searchTerm.toLowerCase().trim();
    return games.filter(
      (game) =>
        game.title.toLowerCase().includes(term) ||
        (game.description && game.description.toLowerCase().includes(term))
    );
  }, [games, searchTerm]);

  // Map filtered game back to its original index
  const getOriginalIndex = (game) => games.findIndex((g) => g.id === game.id);

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
            className="fixed inset-0 bg-black/70 backdrop-blur-lg z-40"
            onClick={onClose}
          />

          {/* Centered modal */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 30 }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="w-full max-w-xl max-h-[75vh] bg-linear-to-b from-gray-950 to-black rounded-3xl flex flex-col border border-white/10 shadow-[0_0_80px_rgba(99,102,241,0.08)] pointer-events-auto overflow-hidden">
              {/* Handle decorativo */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-white/15 rounded-full" />
              </div>

              {/* Sticky Header: Title + Search */}
              <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-md px-5 pt-2 pb-4">
                <div className="flex items-center justify-between mb-3">
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

                {/* Search bar */}
                <div className="relative">
                  {/* Search icon */}
                  <svg
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={t("gallery.search") || "Buscar juego..."}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-full text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-200"
                  />
                  {/* Clear button */}
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 text-white/60 text-xs transition-colors cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Grid de juegos — scrollbar invisible */}
              <div className="flex-1 overflow-y-auto px-5 pb-6 overscroll-contain scrollbar-hide">
                {filteredGames.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                    <svg
                      className="w-12 h-12 mb-3 text-slate-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p className="text-sm font-medium">
                      {t("gallery.noResults") || "No se encontraron juegos"}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-2">
                    {filteredGames.map((game) => (
                      <motion.button
                        key={game.id}
                        onClick={() => onSelectGame(getOriginalIndex(game))}
                        whileTap={{ scale: 0.95 }}
                        className="bg-linear-to-b from-slate-800/80 to-slate-900/80 border border-slate-700/50 rounded-2xl p-5 flex flex-col items-center justify-center gap-3 text-white aspect-square cursor-pointer relative overflow-hidden group transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:border-indigo-500/50 hover:shadow-[0_8px_30px_rgb(0,0,0,0.5)]"
                      >
                        {/* Hover glow overlay */}
                        <div className="absolute inset-0 bg-linear-to-t from-indigo-500/0 to-indigo-500/0 group-hover:from-indigo-500/5 group-hover:to-transparent transition-all duration-300" />

                        {/* Subtle top shine */}
                        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/10 to-transparent" />

                        {game.logo ? (
                          <img
                            src={game.logo}
                            alt=""
                            className="w-18 h-18 object-contain relative z-10 drop-shadow-lg group-hover:drop-shadow-[0_4px_12px_rgba(99,102,241,0.3)] transition-all duration-300"
                            style={
                              game.logoScale
                                ? { transform: `scale(${game.logoScale})` }
                                : undefined
                            }
                            draggable={false}
                          />
                        ) : (
                          <span className="text-5xl relative z-10 drop-shadow-lg">
                            {game.emoji}
                          </span>
                        )}
                        <span className="font-bold text-sm relative z-10 leading-tight text-center text-white/90 tracking-wide group-hover:text-white transition-colors duration-300">
                          {game.title}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default GalleryModal;
