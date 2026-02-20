/**
 * PlaceholderGame.jsx — Fondo visual de cada "juego"
 *
 * Pantalla completa con color de fondo, partículas decorativas
 * y un emoji central grande. Se oscurece ligeramente durante
 * la cuenta atrás (isActive=false) para indicar que aún no
 * ha empezado.
 *
 * En el futuro, aquí iría la lógica real del minijuego.
 */

import { motion } from "framer-motion";

const PlaceholderGame = ({ color, emoji, isActive }) => {
  return (
    <div
      className={`${color} w-full h-full flex items-center justify-center relative overflow-hidden transition-all duration-500`}
    >
      {/* Partículas / formas decorativas de fondo */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-white/10 rounded-full blur-xl" />
        <div className="absolute -bottom-40 -right-40 w-[28rem] h-[28rem] bg-black/10 rounded-full blur-2xl" />
        <div className="absolute top-1/3 right-8 w-40 h-40 bg-white/8 rounded-full blur-lg" />
        <div className="absolute bottom-1/4 left-12 w-24 h-24 bg-white/10 rounded-full blur-md" />
      </div>

      {/* Emoji central gigante */}
      <motion.span
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{
          scale: isActive ? 1 : 0.9,
          opacity: isActive ? 0.15 : 0.08,
        }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-[12rem] md:text-[16rem] select-none pointer-events-none"
        style={{ filter: "saturate(0.7)" }}
      >
        {emoji}
      </motion.span>

      {/* Gradiente inferior para legibilidad del texto UI */}
      <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none" />

      {/* Gradiente superior sutil */}
      <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/30 to-transparent pointer-events-none" />
    </div>
  );
};

export default PlaceholderGame;
