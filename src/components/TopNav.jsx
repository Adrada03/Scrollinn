/**
 * TopNav.jsx — Barra de navegación superior fija estilo TikTok
 *
 * Contenido:
 *  - Izquierda: Botón de Registro / Login (icono de usuario)
 *  - Centro: Logo + nombre de marca "scrollinn"
 *  - Derecha: Selector de idioma (banderas ES/EN)
 *
 * Posicionamiento fixed, z-50, pointer-events-none en el contenedor
 * para no bloquear toques en el juego, pointer-events-auto solo
 * en los botones interactivos.
 *
 * Degradado from-black/60 to-transparent para legibilidad.
 */

import { useLanguage } from "../i18n";
import { getLevelFromXP, getTierColorStyles, getTierTextColor } from "../utils/leveling";

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

const TopNav = ({ onOpenAuth, currentUser }) => {
  const { lang, toggleLang } = useLanguage();

  const xp = currentUser?.xp ?? 0;
  const level = currentUser ? getLevelFromXP(xp) : null;
  const tierStyles = level ? getTierColorStyles(level) : '';
  const tierText = level ? getTierTextColor(level) : '';

  return (
    <nav className="fixed top-0 left-0 w-full z-50 pointer-events-none">
      {/* Degradado para legibilidad */}
      <div className="absolute inset-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />

      {/* Contenido */}
      <div className="relative flex items-center justify-between px-4 pt-3 pb-2">
        {/* ── Izquierda: Login / Perfil ── */}
        <button
          onClick={onOpenAuth}
          className="pointer-events-auto flex items-center gap-2 cursor-pointer group"
          aria-label={currentUser ? "Mi cuenta" : "Registrarse"}
        >
          <div className="relative">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors
                bg-black/30 backdrop-blur-sm border border-white/15 hover:bg-black/50
                ${currentUser ? `!bg-emerald-500/40 !border-transparent ${tierStyles}` : ""}`}
            >
              {currentUser ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-emerald-300 drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              )}
            </div>

            {/* Badge de nivel */}
            {currentUser && level != null && (
              <div
                className={`absolute -bottom-1 -right-1 translate-x-1/4 translate-y-1/4
                  w-5 h-5 rounded-full bg-gray-900 border border-white/20
                  flex items-center justify-center ${tierText}`}
              >
                <span className="text-[10px] font-bold leading-none">{level}</span>
              </div>
            )}
          </div>

          {currentUser && (
            <span className="text-xs font-semibold text-emerald-300 drop-shadow-md hidden sm:inline">
              {currentUser.username}
            </span>
          )}
        </button>

        {/* ── Centro: Logo + Marca ── */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          <img
            src="/logoScrollinn.png"
            alt="Scrollinn"
            className="h-10 drop-shadow-lg"
            draggable={false}
          />
          <span
            className="text-white text-2xl font-extrabold tracking-tight drop-shadow-lg select-none"
            style={{
              textShadow: "0 2px 10px rgba(0,0,0,0.5)",
              fontStyle: "italic",
              letterSpacing: "-0.03em",
            }}
          >
            scrollinn
          </span>
        </div>

        {/* ── Derecha: Idioma ── */}
        <button
          onClick={toggleLang}
          className="pointer-events-auto w-9 h-7 rounded-md overflow-hidden border border-white/20 shadow-lg cursor-pointer hover:scale-110 active:scale-95 transition-transform bg-black/30 backdrop-blur-sm flex items-center justify-center p-0.5"
          aria-label={lang === "es" ? "Switch to English" : "Cambiar a español"}
        >
          {lang === "es" ? <FlagGB /> : <FlagES />}
        </button>
      </div>
    </nav>
  );
};

export default TopNav;
