/**
 * GameOverPanel.jsx — Panel unificado de Game Over
 *
 * Muestra:
 *  - Título (Game Over / ¡Victoria!)
 *  - Puntuación del jugador
 *  - Ranking (Top 5 mejores puntuaciones de usuarios distintos)
 *  - Mensaje de resultado (guardado / Top 5 / no registrado)
 *  - Botón "Siguiente juego" (scrollea al siguiente)
 *
 * Props:
 *   title       (string)  — "Game Over" o "¡Victoria!"
 *   score       (string)  — puntuación a mostrar (puede ser "12", "85%", "7 mov.")
 *   subtitle    (string)  — texto debajo del score
 *   onNext      (fn)      — callback para ir al siguiente juego
 *   ranking     (array)   — [{ pos, user, score }] ranking real del servidor
 *   scoreMessage (string) — mensaje del resultado del envío de puntuación
 *   isLoading   (bool)    — si está cargando el ranking
 */

import { useLanguage } from "../i18n";

const FALLBACK_RANKING = [
  { pos: 1, user: "—", score: "—" },
  { pos: 2, user: "—", score: "—" },
  { pos: 3, user: "—", score: "—" },
  { pos: 4, user: "—", score: "—" },
  { pos: 5, user: "—", score: "—" },
];

const GameOverPanel = ({
  title = "Game Over",
  score,
  subtitle,
  onReplay,
  onNext,
  ranking = [],
  scoreMessage = "",
  isLoading = false,
}) => {
  const { t } = useLanguage();
  const displayRanking = ranking.length > 0 ? ranking : FALLBACK_RANKING;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-[6]">
      <div className="bg-black/50 backdrop-blur-xl rounded-3xl px-8 py-7 flex flex-col items-center gap-3 shadow-2xl w-[85vw] max-w-sm">
        {/* Título */}
        <h2 className="text-2xl font-black text-white tracking-tight">
          {title}
        </h2>

        {/* Puntuación */}
        <div
          className="text-5xl font-black text-white/90"
          style={{ fontFeatureSettings: "'tnum'" }}
        >
          {score}
        </div>

        {subtitle && (
          <p className="text-white/40 text-sm -mt-1">{subtitle}</p>
        )}

        {/* Mensaje de puntuación */}
        {scoreMessage && (
          <p className="text-xs text-center text-amber-300/80 font-medium -mt-1">
            {scoreMessage}
          </p>
        )}

        {/* Ranking */}
        <div className="w-full mt-2 rounded-xl bg-white/5 border border-white/10 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[2.5rem_1fr_4rem] px-3 py-1.5 text-[10px] font-bold text-white/30 uppercase tracking-wider border-b border-white/5">
            <span>#</span>
            <span>{t("gameover.user")}</span>
            <span className="text-right">{t("gameover.points")}</span>
          </div>
          {/* Loading */}
          {isLoading ? (
            <div className="px-3 py-4 text-center text-sm text-white/30 animate-pulse">
              {t("gameover.loading")}
            </div>
          ) : (
            /* Rows */
            <div className="max-h-48 overflow-y-auto">
              {displayRanking.map((r) => (
                <div
                  key={r.pos}
                  className="grid grid-cols-[2.5rem_1fr_4rem] px-3 py-1.5 text-sm border-b border-white/5 last:border-0"
                >
                  <span className="text-white/50 font-bold tabular-nums">{r.pos}</span>
                  <span className="text-white/70 font-medium truncate">{r.user}</span>
                  <span className="text-white/60 font-bold text-right tabular-nums">{r.score}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Jugar de nuevo */}
        {onReplay && (
          <button
            onClick={onReplay}
            className="mt-2 w-full px-6 py-3 bg-white/15 hover:bg-white/25 active:scale-95 text-white font-bold rounded-2xl text-base transition-all pointer-events-auto border border-white/10 flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            {t("gameover.replay")}
          </button>
        )}

        {/* Siguiente juego */}
        <button
          onClick={onNext}
          className="mt-2 w-full px-6 py-3 bg-white/15 hover:bg-white/25 active:scale-95 text-white font-bold rounded-2xl text-base transition-all pointer-events-auto border border-white/10 flex items-center justify-center gap-2"
        >
          {t("gameover.next")}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default GameOverPanel;
