/**
 * PlaceholderGame.jsx — Pantalla de carga premium para cada juego
 *
 * Muestra el logo y título del juego sobre un degradado oscuro
 * elegante mientras el componente real se monta o cuando el juego
 * aún no tiene implementación. Se usa también como fallback para
 * slides que aún no están "nearby" (scroll rápido).
 */

const PlaceholderGame = ({ game, isActive }) => {
  const logo = game?.logo;
  const title = game?.title;
  const emoji = game?.emoji;

  return (
    <div className="flex flex-col items-center justify-center w-full h-full min-h-dvh absolute inset-0 bg-linear-to-b from-slate-900 via-[#0a0a0a] to-black">
      {/* Logo del juego con pulse */}
      {logo ? (
        <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl overflow-hidden shadow-2xl shadow-black/50 animate-pulse select-none">
          <img
            src={logo}
            alt={title || ""}
            draggable={false}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <span className="text-7xl sm:text-8xl animate-pulse select-none opacity-60">
          {emoji}
        </span>
      )}

      {/* Título del juego */}
      {title && (
        <h3 className="mt-6 text-2xl font-bold text-white tracking-wide text-center drop-shadow-md select-none">
          {title}
        </h3>
      )}

      {/* Texto sutil de carga */}
      <p className="text-slate-500 text-sm mt-2 select-none">Cargando…</p>

      {/* Gradiente inferior para legibilidad del texto UI */}
      <div className="absolute bottom-0 left-0 right-0 h-48 bg-linear-to-t from-black/60 via-black/20 to-transparent pointer-events-none" />

      {/* Gradiente superior sutil */}
      <div className="absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-black/30 to-transparent pointer-events-none" />
    </div>
  );
};

export default PlaceholderGame;
