import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLanguage } from "../i18n";

/**
 * GameSelectorSheet.jsx — Bottom Sheet selector de juegos estilo TikTok/Cyberpunk
 * Props:
 *  - isOpen, onClose, games, onSelectGame, selectedGameId
 */
const GameSelectorSheet = ({ isOpen, onClose, games, onSelectGame, selectedGameId }) => {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");

  // Limpiar búsqueda al cerrar
  useEffect(() => {
    if (!isOpen) setSearch("");
  }, [isOpen]);

  // Filtro de juegos
  const filtered = useMemo(() => {
    if (!search.trim()) return games;
    const term = search.toLowerCase();
    return games.filter(
      (g) => g.title.toLowerCase().includes(term) || (g.description && g.description.toLowerCase().includes(term))
    );
  }, [games, search]);

  // Mapear juego filtrado a su índice original
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
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-200 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Bottom Sheet — draggable para dismiss */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.15}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 400) onClose();
            }}
            className="fixed bottom-0 left-0 right-0 z-201 h-[85vh]"
          >
            <div
              className="w-full h-full bg-[#0a0f16]/95 backdrop-blur-xl border-t border-white/10 rounded-t-3xl flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* ── Header ── */}
              <div className="flex-none pt-3 pb-2 px-5">
                {/* Drag handle */}
                <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-3" />

                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold tracking-wide uppercase text-white/70 select-none">
                    {t("gallery.choose")}
                  </h2>
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

                {/* Search bar — sin autofocus para no abrir teclado */}
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t("gallery.search")}
                  inputMode="search"
                  autoComplete="off"
                  autoFocus={false}
                  className="w-full mt-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white placeholder:text-white/40 focus:border-cyan-500/50 outline-none transition-all"
                />
              </div>

              <div className="mx-5 mt-2 h-px bg-white/6" />

              {/* Scroll wrapper */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide p-4" style={{ WebkitOverflowScrolling: "touch" }}>
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-white/40">
                    <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm font-medium">{t("gallery.noResults")}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 pb-8">
                  {filtered.map((game) => {
                    return (
                      <button
                        key={game.id}
                        onClick={() => onSelectGame(getOriginalIndex(game))}
                        className={
                          `relative group overflow-hidden rounded-2xl bg-white/5 border border-white/10 flex flex-col cursor-pointer transition-colors duration-200 ` +
                          `hover:border-cyan-500/50 hover:bg-white/10 active:scale-95`
                        }
                      >
                        {/* Logo */}
                        <div className="w-full aspect-square flex items-center justify-center p-3 bg-linear-to-b from-black/40 to-transparent relative">
                          {game.logo ? (
                            <img
                              src={game.logo}
                              alt=""
                              className="w-full h-full object-contain"
                              loading="lazy"
                              draggable={false}
                            />
                          ) : (
                            <span className="text-6xl">
                              {game.emoji}
                            </span>
                          )}

                        </div>
                        {/* Título */}
                        <div className="px-2 py-2 text-center border-t border-white/5 bg-black/40">
                          <span className="text-white font-bold text-xs sm:text-sm tracking-wide truncate block">{game.title}</span>
                        </div>
                      </button>
                    );
                  })}
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

export default GameSelectorSheet;
