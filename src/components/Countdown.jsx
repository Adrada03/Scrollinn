/**
 * Countdown.jsx — Cuenta atrás gigante (3, 2, 1, ¡GO!)
 *
 * Se muestra al centro de la pantalla cuando un nuevo juego
 * entra en el viewport. Cada número tiene animación scale+fade.
 * Cuando termina, ejecuta onComplete para activar el juego.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const Countdown = ({ onComplete, gameId, description }) => {
  // null = terminado, 3/2/1/0 = cuenta atrás
  const [count, setCount] = useState(3);

  // Reiniciar la cuenta atrás cuando cambia el juego
  useEffect(() => {
    setCount(3);
  }, [gameId]);

  // Temporizador de la cuenta atrás
  useEffect(() => {
    if (count === null) return;

    if (count === 0) {
      // Pequeño delay para que se vea el "GO!" antes de desaparecer
      const t = setTimeout(() => {
        setCount(null);
        onComplete();
      }, 600);
      return () => clearTimeout(t);
    }

    const t = setTimeout(() => {
      setCount((prev) => prev - 1);
    }, 800);

    return () => clearTimeout(t);
  }, [count, onComplete]);

  // Texto a mostrar
  const display = count === 0 ? "GO!" : count;

  return count !== null ? (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none">
      {/* Fondo oscuro semi-transparente */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Número gigante animado */}
      <AnimatePresence mode="wait">
        <motion.span
          key={`countdown-${count}`}
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 2, opacity: 0 }}
          transition={{
            duration: 0.4,
            ease: [0.16, 1, 0.3, 1], // ease-out-expo
          }}
          className={`relative text-[10rem] md:text-[14rem] font-black leading-none drop-shadow-2xl ${
            count === 0
              ? "text-emerald-400"
              : "text-white"
          }`}
          style={{
            textShadow: count === 0
              ? "0 0 60px rgba(52, 211, 153, 0.5)"
              : "0 0 60px rgba(255, 255, 255, 0.3)",
          }}
        >
          {display}
        </motion.span>
      </AnimatePresence>

      {/* Descripción / instrucciones — fija, sin animación */}
      {description && count !== 0 && (
        <div className="relative mt-6 mx-8 max-w-sm px-6 py-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50 mb-1.5 text-center">
            Cómo jugar
          </p>
          <p
            className="text-base md:text-lg font-semibold text-white/90 text-center leading-snug"
            style={{ textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}
          >
            {description}
          </p>
        </div>
      )}
    </div>
  ) : null;
};

export default Countdown;
