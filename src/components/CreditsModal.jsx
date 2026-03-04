/**
 * CreditsModal.jsx — Modal de créditos y licencias
 *
 * Muestra la atribución legal (MIT License) de los juegos
 * de código abierto adaptados para Scrollinn.
 */

import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "../i18n";
import { useState } from "react";

/* ── Datos de créditos ── */
const CREDITS = [
  {
    game: "Tower Blocks",
    author: "Steve Gardner",
    year: "2021",
    link: "https://codepen.io/ste-vg/pen/ppLQNW",
  },
  {
    game: "Circle Ninja",
    author: "Envato Tuts+",
    year: "2021",
    note: "Fork of an original work Olives – a Phaser FruitNinja test by labdev",
    link: "https://codepen.io/tutsplus/pen/WNOaqqa",
  },
  {
    game: "Color Match",
    author: "Jase",
    year: "2021",
    link: "https://codepen.io/jasesmith/pen/mRmWjQ",
  },
  {
    game: "Circle Path",
    author: "Richard Davey, Photon Storm Ltd.",
    year: "2018",
    link: null,
  },
];

const MIT_LICENSE_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const sheetVariants = {
  hidden: { y: "100%" },
  visible: { y: 0 },
};

const CreditsModal = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  const [showFullLicense, setShowFullLicense] = useState(false);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 z-300 bg-black/70 backdrop-blur-sm"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Bottom Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-301 bg-slate-900 border-t border-cyan-500/20 rounded-t-2xl max-h-[85vh] flex flex-col"
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
              if (info.offset.y > 100 || info.velocity.y > 300) onClose();
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2 shrink-0">
              <div className="w-10 h-1 rounded-full bg-cyan-400/30" />
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto px-5 pb-6 space-y-4 flex-1 min-h-0">
              {/* Título */}
              <h2 className="text-white text-lg font-bold text-center flex items-center justify-center gap-2">
                <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {t("credits.title")}
              </h2>

              <p className="text-gray-400 text-sm text-center">
                {t("credits.subtitle")}
              </p>

              {/* Tarjetas de juegos */}
              {CREDITS.map((credit) => (
                <div
                  key={credit.game}
                  className="rounded-xl bg-white/5 border border-cyan-500/10 p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-white font-semibold text-base">
                      {credit.game}
                    </h3>
                    <span className="text-[10px] font-mono text-cyan-400/70 bg-cyan-400/10 px-2 py-0.5 rounded-full border border-cyan-400/20">
                      MIT
                    </span>
                  </div>

                  <p className="text-gray-300 text-sm">
                    Copyright &copy; {credit.year} {credit.author}
                  </p>

                  {credit.note && (
                    <p className="text-gray-500 text-xs italic">
                      {credit.note}
                    </p>
                  )}

                  {credit.link && (
                    <a
                      href={credit.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-cyan-400 text-xs hover:text-cyan-300 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      {t("credits.original")}
                    </a>
                  )}
                </div>
              ))}

              {/* Bloque de licencia MIT general */}
              <div className="rounded-xl bg-white/3 border border-white/5 p-4 space-y-3">
                <button
                  onClick={() => setShowFullLicense(!showFullLicense)}
                  className="w-full flex items-center justify-between cursor-pointer"
                >
                  <h3 className="text-gray-300 text-sm font-semibold">
                    {t("credits.license_heading")}
                  </h3>
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${showFullLicense ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                <AnimatePresence>
                  {showFullLicense && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <p className="text-gray-500 text-xs leading-relaxed whitespace-pre-line font-mono">
                        {MIT_LICENSE_TEXT}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Botón cerrar */}
              <button
                onClick={onClose}
                className="w-full p-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5
                  text-cyan-400 text-sm font-semibold text-center cursor-pointer
                  hover:bg-cyan-500/10 transition-colors"
              >
                {t("auth.close")}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CreditsModal;
