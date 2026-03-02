/**
 * BottomNavigationBar.jsx — Bottom Navigation Bar Cyberpunk / Neon
 *
 * 3 pestañas: Tienda (izq), Jugar (centro – gamepad), Perfil (der).
 * Cada ítem está en un contenedor flex centrado simétrico para
 * garantizar que indicadores y glow queden alineados al 50 % exacto.
 */

import { useLanguage } from "../i18n";
import { useSoundEffect } from "../hooks/useSoundEffect";
import Avatar from "./Avatar";
import { getLevelFromXP, getTierHexColor } from "../utils/leveling";

/* ── Iconos individuales ──────────────────────────────────────── */

const ShopIcon = ({ active }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={active ? 2.2 : 1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-6 h-6"
  >
    <path d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
  </svg>
);

const GamepadIcon = ({ active }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={active ? 1.8 : 1.4}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-8 h-8"
  >
    {/* Cuerpo del mando */}
    <rect x="2" y="6" width="20" height="12" rx="3" />
    {/* D-pad horizontal */}
    <path d="M6 12h2" />
    {/* D-pad vertical */}
    <path d="M7 11v2" />
    {/* Botón central */}
    <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
    {/* Botones derecha (X / O) */}
    <path d="M16 10.5l1.5 1.5" />
    <path d="M17.5 10.5L16 12" />
  </svg>
);

const ProfileIcon = ({ active }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={active ? 2.2 : 1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-6 h-6"
  >
    <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
);

/* ── Componente principal ─────────────────────────────────────── */

const BottomNavigationBar = ({ activeTab, onTabChange, currentUser }) => {
  const { t } = useLanguage();
  const { playNavigation } = useSoundEffect();

  const xp = currentUser?.xp ?? 0;
  const level = currentUser ? getLevelFromXP(xp) : null;
  const tierHex = level ? getTierHexColor(level) : null;

  const handleTab = (tab) => {
    if (tab === activeTab) return;
    playNavigation();
    onTabChange(tab);
  };

  const tabs = [
    {
      key: "tienda",
      label: t("tab.shop"),
      icon: (active) => <ShopIcon active={active} />,
    },
    {
      key: "jugar",
      label: t("nav.play"),
      icon: (active) => <GamepadIcon active={active} />,
    },
    {
      key: "perfil",
      label: t("nav.profile"),
      icon: (active) => {
        if (currentUser) {
          return (
            <Avatar
              equippedAvatarId={currentUser.equipped_avatar_id}
              size="sm"
              tierHex={active ? tierHex : null}
            />
          );
        }
        return <ProfileIcon active={active} />;
      },
    },
  ];

  return (
    <nav
      className="flex-none w-full relative"
      style={{
        background: "rgba(10,15,22,0.92)",
        backdropFilter: "blur(24px) saturate(1.8)",
        WebkitBackdropFilter: "blur(24px) saturate(1.8)",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Luminous top edge accent */}
      <div
        className="absolute top-0 inset-x-0 h-px pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent 10%, rgba(34,211,238,0.15) 50%, transparent 90%)",
        }}
      />

      {/* ── Grid de 3 columnas iguales → centrado perfecto ── */}
      <div className="h-20 grid grid-cols-3 items-center relative max-w-lg mx-auto">
        {tabs.map(({ key, label, icon }) => {
          const isActive = activeTab === key;

          return (
            <button
              key={key}
              onClick={() => handleTab(key)}
              className="relative flex flex-col items-center justify-center h-full cursor-pointer select-none"
              aria-current={isActive ? "page" : undefined}
              aria-label={label}
            >
              {/* ── Pill indicator flotante (top) ── */}
              <div
                className="absolute top-0 left-1/2 w-8 h-[3px] rounded-b-full transition-all duration-300 pointer-events-none"
                style={{
                  transform: `translateX(-50%) scaleX(${isActive ? 1 : 0})`,
                  background: isActive ? "#22d3ee" : "transparent",
                  boxShadow: isActive
                    ? "0 2px 10px rgba(34,211,238,0.9), 0 4px 20px rgba(34,211,238,0.35)"
                    : "none",
                  opacity: isActive ? 1 : 0,
                }}
              />

              {/* ── Glow radial detrás del icono ── */}
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full pointer-events-none transition-opacity duration-300"
                style={{
                  background:
                    "radial-gradient(circle, rgba(34,211,238,0.20), transparent 70%)",
                  opacity: isActive ? 1 : 0,
                  filter: "blur(10px)",
                }}
              />

              {/* ── Icon ── */}
              <div
                className="relative z-10 flex items-center justify-center transition-all duration-300 ease-out"
                style={{
                  color: isActive ? "#22d3ee" : "#64748b",
                  transform: isActive
                    ? "scale(1.12) translateY(-2px)"
                    : "scale(1) translateY(0)",
                  filter: isActive
                    ? "drop-shadow(0 0 8px rgba(34,211,238,0.7)) drop-shadow(0 0 18px rgba(34,211,238,0.25))"
                    : "none",
                }}
              >
                {icon(isActive)}
              </div>

              {/* ── Label ── */}
              <span
                className="relative z-10 text-[10px] font-bold tracking-wide mt-0.5 transition-all duration-300"
                style={{
                  color: isActive ? "#22d3ee" : "#64748b",
                  textShadow: isActive
                    ? "0 0 12px rgba(34,211,238,0.5)"
                    : "none",
                }}
              >
                {label}
              </span>

              {/* ── Dot indicator debajo del label ── */}
              <div
                className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full transition-all duration-300 pointer-events-none"
                style={{
                  background: isActive ? "#22d3ee" : "transparent",
                  boxShadow: isActive
                    ? "0 0 6px rgba(34,211,238,0.8)"
                    : "none",
                  opacity: isActive ? 1 : 0,
                }}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavigationBar;
