/**
 * TopNav.jsx — Barra de navegación superior fija estilo TikTok
 *
 * Layout:
 *  - Izquierda: Avatar / Login
 *  - Centro: Pestañas "Todos" | "Favoritos" | "Tienda"
 *  - Derecha: Selector de idioma
 *
 * La pestaña "Favoritos" se desbloquea al tener ≥ 5 likes.
 */

import { useLanguage } from "../i18n";
import { getLevelFromXP, getTierTextColor, getTierHexColor } from "../utils/leveling";
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

/* ── Tabs config ── */
const TABS = [
  { key: "all",       i18nKey: "tab.all" },
  { key: "favorites", i18nKey: "tab.favorites" },
  { key: "shop",      i18nKey: "tab.shop" },
];

const TopNav = ({
  onOpenAuth,
  currentUser,
  activeTab,
  onTabChange,
  userLikesCount,
}) => {
  const { lang, toggleLang, t } = useLanguage();

  const xp = currentUser?.xp ?? 0;
  const level = currentUser ? getLevelFromXP(xp) : null;
  const tierText = level ? getTierTextColor(level) : '';
  const tierHex = level ? getTierHexColor(level) : null;

  /**
   * Maneja clic en una pestaña.
   * "Favoritos" requiere login + ≥5 likes.
   */
  const handleTabClick = (tabKey) => {
    onTabChange(tabKey);
  };

  return (
    <nav className="fixed top-0 left-0 w-full z-50 pointer-events-none">
      {/* Degradado para legibilidad */}
      <div className="absolute inset-0 h-24 bg-linear-to-b from-black/60 to-transparent" />

      {/* Contenido */}
      <div className="relative flex items-center justify-between px-4 pt-3 pb-2">
        {/* ── Izquierda: Login / Perfil ── */}
        <button
          onClick={onOpenAuth}
          className="pointer-events-auto flex items-center gap-2 cursor-pointer group shrink-0"
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

        {/* ── Centro: Pestañas TikTok ── */}
        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-6">
          {TABS.map(({ key, i18nKey }) => {
            const isActive = activeTab === key;
            const isLocked =
              (key === "favorites" && (!currentUser || (userLikesCount ?? 0) < 5)) ||
              (key === "shop" && !currentUser);

            return (
              <button
                key={key}
                onClick={() => handleTabClick(key)}
                className={`relative pb-1 cursor-pointer transition-all duration-200 text-[15px] tracking-wide select-none
                  ${isActive
                    ? "text-white font-bold"
                    : "text-white/50 hover:text-white/80 font-medium"
                  }
                `}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="flex items-center gap-1">
                  {t(i18nKey)}
                  {/* Candado si está bloqueado */}
                  {isLocked && (
                    <svg className="w-3 h-3 text-white/40" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
                    </svg>
                  )}
                </span>

                {/* Indicador activo (línea blanca debajo) */}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-white"
                    style={{ boxShadow: "0 0 6px rgba(255,255,255,0.5)" }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Derecha: Idioma ── */}
        <button
          onClick={toggleLang}
          className="pointer-events-auto shrink-0 w-13 h-10 rounded-md overflow-hidden border border-white/20 shadow-lg cursor-pointer hover:scale-110 active:scale-95 transition-transform bg-black/30 backdrop-blur-sm flex items-center justify-center p-0.5"
          aria-label={lang === "es" ? "Switch to English" : "Cambiar a español"}
        >
          {lang === "es" ? <FlagGB /> : <FlagES />}
        </button>
      </div>
    </nav>
  );
};

export default TopNav;
