/**
 * CountdownOverlay.jsx — Cuenta atrás gigante 3, 2, 1, GO!
 *
 * Overlay flotante, centrado, SIN fondo oscuro — el tablero de juego
 * real se ve por detrás. Números vibrantes con efecto "Pop!" arcade:
 * escala grande → normal → desaparece.
 *
 * pointer-events-none: no bloquea scroll ni taps.
 * El usuario puede hacer scroll durante el countdown para abortar.
 *
 * Props:
 *  - onComplete: () => void — se llama al terminar la secuencia
 *  - gameId:     string — key para reiniciar la cuenta al cambiar de juego
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const CountdownOverlay = ({ onComplete, gameId }) => {
  // null = terminado, 3/2/1/0 = cuenta atrás
  const [count, setCount] = useState(3);

  // Reiniciar si cambia el juego
  useEffect(() => {
    setCount(3);
  }, [gameId]);

  // Timer de la cuenta atrás
  useEffect(() => {
    if (count === null) return;

    if (count === 0) {
      const timer = setTimeout(() => {
        setCount(null);
        onComplete();
      }, 500);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setCount((prev) => prev - 1);
    }, 750);

    return () => clearTimeout(timer);
  }, [count, onComplete]);

  if (count === null) return null;

  const display = count === 0 ? "GO!" : count;
  const isGo = count === 0;

  // Colores vibrantes por número
  const colorMap = {
    3: {
      text: "text-red-400",
      glow: "rgba(248, 113, 113, 0.6)",
      ring: "rgba(248, 113, 113, 0.15)",
    },
    2: {
      text: "text-amber-400",
      glow: "rgba(251, 191, 36, 0.6)",
      ring: "rgba(251, 191, 36, 0.15)",
    },
    1: {
      text: "text-sky-400",
      glow: "rgba(56, 189, 248, 0.6)",
      ring: "rgba(56, 189, 248, 0.15)",
    },
    0: {
      text: "text-emerald-400",
      glow: "rgba(52, 211, 153, 0.7)",
      ring: "rgba(52, 211, 153, 0.2)",
    },
  };

  const colors = colorMap[count] || colorMap[0];

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
      <AnimatePresence mode="wait">
        <motion.div
          key={`cd-${count}`}
          className="relative flex items-center justify-center"
          initial={{ scale: 2.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.3, opacity: 0 }}
          transition={{
            duration: 0.45,
            ease: [0.16, 1, 0.3, 1], // expo-out
          }}
        >
          {/* ── Anillo expansivo (ping) ── */}
          <motion.div
            className="absolute w-40 h-40 rounded-full"
            style={{
              background: `radial-gradient(circle, ${colors.ring}, transparent 70%)`,
            }}
            initial={{ scale: 0.5, opacity: 0.8 }}
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />

          {/* ── Segundo anillo (stagger) ── */}
          <motion.div
            className="absolute w-32 h-32 rounded-full border-2"
            style={{ borderColor: colors.ring }}
            initial={{ scale: 0.8, opacity: 0.6 }}
            animate={{ scale: 2.5, opacity: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
          />

          {/* ── Número gigante ── */}
          <motion.span
            className={`relative ${colors.text} font-black leading-none select-none`}
            style={{
              fontSize: isGo ? "8rem" : "11rem",
              textShadow: `0 0 40px ${colors.glow}, 0 0 80px ${colors.glow}, 0 4px 20px rgba(0,0,0,0.5)`,
              WebkitTextStroke: "2px rgba(255,255,255,0.1)",
            }}
            initial={{ scale: 1 }}
            animate={{
              scale: [1, 1.08, 1],
            }}
            transition={{
              duration: 0.5,
              ease: "easeInOut",
            }}
          >
            {display}
          </motion.span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default CountdownOverlay;
