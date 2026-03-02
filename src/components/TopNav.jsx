/**
 * TopNav.jsx — Barra de navegación superior fija (simplificada)
 *
 * Layout: Solo selector central "Todos" | "Favoritos"
 * Los controles de Perfil, Idioma y Tienda se han movido
 * a la Bottom Navigation Bar y al panel de Ajustes.
 */

import { useLanguage } from "../i18n";
import { useSoundEffect } from "../hooks/useSoundEffect";

/* ── Tabs config (solo Todos y Favoritos) ── */
const TABS = [
  { key: "all",       i18nKey: "tab.all" },
  { key: "favorites", i18nKey: "tab.favorites" },
];

const TopNav = ({
  onOpenAuth,
  currentUser,
  activeTab,
  onTabChange,
  userLikesCount,
}) => {
  const { t } = useLanguage();
  const { playNavigation } = useSoundEffect();

  /**
   * Maneja clic en una pestaña.
   * "Favoritos" requiere login + ≥5 likes.
   */
  const handleTabClick = (tabKey) => {
    playNavigation();
    onTabChange(tabKey);
  };

  return (
    <nav className="fixed top-0 left-0 w-full z-70 pointer-events-none"
         style={{ paddingTop: 'var(--sat)', paddingLeft: 'var(--sal)', paddingRight: 'var(--sar)' }}>
      {/* Degradado para legibilidad */}
      <div className="absolute inset-0 h-20 bg-linear-to-b from-black/60 to-transparent" />

      {/* Contenido: Solo pestañas centradas */}
      <div className="relative flex items-center justify-center px-4 pt-3 pb-2">
        {/* ── Centro: Pestañas Todos | Favoritos ── */}
        <div className="pointer-events-auto flex items-center gap-6">
          {TABS.map(({ key, i18nKey }) => {
            const isActive = activeTab === key;
            const isLocked =
              key === "favorites" && (!currentUser || (userLikesCount ?? 0) < 5);

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
      </div>
    </nav>
  );
};

export default TopNav;
