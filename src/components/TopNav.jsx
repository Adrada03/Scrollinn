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
import { getLevelFromXP, getTierColorStyles, getTierTextColor, getTierHexColor } from "../utils/leveling";
import Avatar from "./Avatar";

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
  const tierHex = level ? getTierHexColor(level) : null;

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
            <Avatar
              equippedAvatarId={currentUser?.equipped_avatar_id}
              size="md"
              tierHex={currentUser ? tierHex : null}
              className={!currentUser ? "bg-black/30 backdrop-blur-sm border-white/15 hover:bg-black/50" : ""}
            />

            {/* Badge de nivel */}
            {currentUser && level != null && (
              <div
                className={`absolute -bottom-1 -right-1 translate-x-1/4 translate-y-1/4
                  w-6 h-6 rounded-full bg-gray-900 border border-white/20
                  flex items-center justify-center ${tierText}`}
              >
                <span className="text-[11px] font-bold leading-none">{level}</span>
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
            className="text-white text-3xl font-extrabold tracking-tight drop-shadow-lg select-none"
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
          className="pointer-events-auto w-13 h-10 rounded-md overflow-hidden border border-white/20 shadow-lg cursor-pointer hover:scale-110 active:scale-95 transition-transform bg-black/30 backdrop-blur-sm flex items-center justify-center p-0.5"
          aria-label={lang === "es" ? "Switch to English" : "Cambiar a español"}
        >
          {lang === "es" ? <FlagGB /> : <FlagES />}
        </button>
      </div>
    </nav>
  );
};

export default TopNav;
