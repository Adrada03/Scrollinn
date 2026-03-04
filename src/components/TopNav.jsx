/**
 * TopNav.jsx — Barra de navegación superior fija (rediseño minimalista)
 *
 * Layout:
 *  - Izquierda: Botón de Retos (icono rayo con estados de color)
 *  - Centro: Título "SCROLLINN" con estilo neón
 *  - Derecha: Lupa de búsqueda
 */

import { useLanguage } from "../i18n";
import { useSoundEffect } from "../hooks/useSoundEffect";

const TopNav = ({
  onSearchClick,
  onOpenChallenges,
  challengeStatus = "pending",
}) => {
  const { t } = useLanguage();
  const { playNavigation } = useSoundEffect();

  /* ── Colores del icono de retos según estado ── */
  const getChallengeIconColor = () => {
    switch (challengeStatus) {
      case "claimable":
        return "text-green-400";
      case "pending":
        return "text-red-500";
      case "allDone":
        return "text-green-500";
      default:
        return "text-white/40";
    }
  };

  const shouldPulse =
    challengeStatus === "pending" || challengeStatus === "claimable";

  return (
    <nav
      className="fixed top-0 left-0 w-full z-70 pointer-events-none"
      style={{
        paddingTop: "var(--sat)",
        paddingLeft: "var(--sal)",
        paddingRight: "var(--sar)",
      }}
    >
      {/* Degradado para legibilidad */}
      <div className="absolute inset-0 h-20 bg-linear-to-b from-black/60 to-transparent" />

      {/* Contenido */}
      <div className="relative flex items-center justify-between px-4 pt-4 pb-3">
        {/* ── Izquierda: Botón de Retos (Rayo) ── */}
        {onOpenChallenges ? (
          <button
            onClick={() => {
              playNavigation();
              onOpenChallenges();
            }}
            className={`pointer-events-auto p-3 -m-1 transition-all cursor-pointer active:scale-90 ${
              shouldPulse ? "animate-pulse" : ""
            }`}
            aria-label={t("gallery.challenges_aria") || "Retos diarios"}
          >
            {/* Lightning bolt SVG */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`w-6 h-6 drop-shadow-[0_0_6px_currentColor] ${getChallengeIconColor()}`}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.75a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.913-.143z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : (
          <div className="w-10" />
        )}

        {/* ── Centro: SCROLLINN ── */}
        <h1
          className="pointer-events-none text-[20px] font-black tracking-[0.15em] uppercase select-none"
          style={{
            background: "linear-gradient(135deg, #fff 0%, #22d3ee 50%, #e879f9 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 0 12px rgba(34,211,238,0.45)) drop-shadow(0 0 4px rgba(232,121,249,0.3))",
          }}
        >
          SCROLLINN
        </h1>

        {/* ── Derecha: Lupa ── */}
        {onSearchClick ? (
          <button
            onClick={onSearchClick}
            className="pointer-events-auto p-2 text-white/70 hover:text-white active:scale-90 transition-all cursor-pointer"
            aria-label={t("gallery.search_game") || "Buscar juego"}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="M15.5 15.5 21 21" />
            </svg>
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>
    </nav>
  );
};

export default TopNav;
