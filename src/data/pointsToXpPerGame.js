// lib/xpCalculator.js

/**
 * Calcula la XP ganada basándose en el juego y la puntuación/tiempo obtenido.
 * @param {string} gameId - El identificador único del juego (ej: 'tower-blocks')
 * @param {number} score - La puntuación final o tiempo (ms) de la partida
 * @returns {number} - La cantidad de XP calculada
 */
export const calculateGameXP = (gameId, score) => {
  // Verificación de seguridad por si entra un null/undefined
  if (score === null || score === undefined) return 0;

  switch (gameId) {
    
    // 🧱 1. TOWER BLOCKS
    case 'tower-blocks':
      // 1. Suelo: Menos de 15 puntos no dan nada de experiencia
      if (score < 15) return 0; 
      // 2. Techo: 60 puntos o más dan el tope máximo de 100 XP
      if (score >= 60) return 100; 
      // 3. Progresión lineal entre 15 y 60 puntos
      return Math.floor((score / 60) * 100);

    // ⚡ 2. NEON TAP
    case 'neon-tap':
      // 1. Suelo: Menos de 12 puntos en 30 segundos no da XP (evita AFK/Trolls)
      if (score < 12) return 0; 
      // 2. Techo: 30 puntos o más dan el tope máximo de 50 XP
      if (score >= 30) return 50; 
      // 3. Progresión lineal entre 12 y 30 puntos
      return Math.floor((score / 30) * 50);

    // 🚦 3. TRAFFIC LIGHT (Usamos { } para aislar las variables)
    case 'traffic-light': {
      const reactionTimeMs = score;
      // 1. Faltas o AFK: Clic anticipado (<= 0) o más de 500ms
      if (!reactionTimeMs || reactionTimeMs <= 0 || reactionTimeMs > 500) return 0;
      
      // 2. Techo: Tiempos nivel "Esports" (200ms o menos)
      const MAX_XP = 15;
      if (reactionTimeMs <= 200) return MAX_XP;
      
      // 3. Progresión lineal invertida entre 500ms y 200ms
      const peorTiempo = 500;
      const mejorTiempo = 200;
      const rango = peorTiempo - mejorTiempo; // 300
      const porcentajeExito = (peorTiempo - reactionTimeMs) / rango;
      
      return Math.floor(porcentajeExito * MAX_XP);
    }

    // ⏱️ 4. TIMER (Usamos { } para aislar las variables)
    case 'timer': {
      const stoppedTimeMs = score;
      const TARGET_TIME = 9999;
      const difference = Math.abs(TARGET_TIME - stoppedTimeMs);
      
      // 1. Margen de error excedido (> 500ms)
      if (difference > 500) return 0;
      
      // 2. EL JACKPOT (Precisión Divina): Margen <= 15ms
      if (difference <= 15) return 50;
      
      // 3. Progresión lineal basada en la precisión
      const normalMaxXP = 25;
      const porcentajePrecision = (500 - difference) / 500;
      
      return Math.floor(porcentajePrecision * normalMaxXP);
    }

    // 🧩 6. ODD ONE OUT (Intervalos de Puntuación)
    case 'odd-one-out':
      if (score >= 17) return 50;
      if (score >= 14) return 25;
      return 0; // Menos de 14 puntos no da XP

    // 🥷 7. CIRCLE NINJA (Intervalos de Puntuación)
    case 'circle-ninja':
      if (score >= 30) return 75;
      if (score >= 25) return 40;
      return 0; // Menos de 25 puntos no da XP

    // 🎨 8. COLOR MATCH (Invertido: Menor es mejor)
    case 'color-match':
      // Como menos es mejor, evaluamos primero el requisito más estricto
      if (score <= 12) return 50;
      if (score <= 13) return 35;
      if (score <= 14) return 20;
      return 0; // Si haces más de 14, 0 XP

    // 🌀 9. CIRCLE PATH (Intervalos de Puntuación)
    case 'circle-path':
      if (score >= 40) return 100;
      if (score >= 30) return 80;
      if (score >= 20) return 60;
      return 0; // Menos de 20 puntos no da XP

    // 🛑 10. HEXTRIS (Intervalos de Puntuación)
    case 'hextris':
      if (score >= 2000) return 100;
      if (score >= 1600) return 75;
      if (score >= 1200) return 50;
      return 0; // Menos de 1200 puntos no da XP

    // 🧠 11. STROOP EFFECT (Intervalos de Puntuación)
    case 'stroop-effect':
      if (score >= 42) return 50;
      if (score >= 36) return 40;
      if (score >= 32) return 30;
      return 0; // Menos de 32 puntos no da XP

    // 🎯 12. SWEET SPOT (Multiplicador directo x8)
    case 'sweet-spot':
      if (score < 3) return 0; // Mínimo 3 puntos
      // 8 XP por punto, con un tope máximo de seguridad de 100 XP
      return Math.min(score * 8, 100);

    // 🏃‍♂️ 13. DODGE RUSH (Supervivencia: 1 XP = 1 Segundo)
    case 'dodge-rush':
      // Asumimos que 'score' viene en segundos. Si viniera en milisegundos, 
      // tendrías que dividirlo entre 1000 (score / 1000).
      if (score < 15) return 0; // Mínimo 15 segundos
      // 1 XP por segundo, con tope de seguridad de 100 XP
      return Math.min(Math.floor(score), 100);

    case 'frenzy-tap':
      // Suelo anti-AFK: Si hacen menos de 20 clics en 10s, 0 XP
      if (score < 20) return 0;
      
      // Cálculo: 1 XP por cada 5 clicks
      const calculatedXP = Math.floor(score / 5);
      
      // Tope de seguridad: Máximo 30 XP (así si alguien hace 300 clics con trampa no rompe el juego)
      return Math.min(calculatedXP, 30);

    case 'perfect-scale':
      if (score === 0) return 60;
      if (score <= 1) return 50;
      if (score <= 3) return 30;
      return 0; // Más de 3 píxeles de error no da XP

    // 🗂️ 15. SWIPE SORTER (1 XP por punto)
    case 'swipe-sorter':
      // Mínimo 10 puntos para evitar que farmeen perdiendo rápido
      if (score < 10) return 0; 
      return Math.min(score, 100); // 1 XP por punto (Máximo 100)

    // ➕ 16. MATH RUSH (Intervalos)
    case 'math-rush':
      if (score >= 30) return 50;
      if (score >= 20) return 25;
      return 0; // Menos de 20 no da XP

    // 🌉 17. STICK BRIDGE (Intervalos)
    case 'stick-bridge':
      if (score >= 25) return 40;
      if (score >= 16) return 20;
      return 0; // Menos de 16 no da XP

    // 📦 18. DROP THE BOX (1 XP por punto)
    case 'drop-the-box':
      if (score < 5) return 0; // Suelo: Mínimo 5 puntos
      return Math.min(score, 100);

    // 🚀 19. VECTOR LEAP (7 XP por punto)
    case 'vector-leap':
      if (score < 2) return 0; // Suelo: Mínimo 2 puntos
      return Math.min(score * 7, 100);

    // ✌️ 20. RPS DUEL (3 XP por punto)
    case 'rps-duel':
      if (score < 3) return 0; // Suelo: Mínimo 3 puntos
      return Math.min(score * 3, 100);

    // ☄️ 21. ORBIT SNIPER (7 XP por punto)
    case 'orbit-sniper':
      if (score < 2) return 0; // Suelo: Mínimo 2 puntos
      return Math.min(score * 7, 100);

    // 🏃‍♂️ 22. SHADOW DASH (1 XP cada 12 puntos)
    case 'shadow-dash':
      if (score < 24) return 0; // Suelo: Mínimo 24 puntos (para ganar al menos 2 XP)
      return Math.min(Math.floor(score / 12), 100);

    // 🌌 23. GRAVITY DRAW (10 XP por punto)
    case 'gravity-draw':
      if (score < 2) return 0; // Suelo: Mínimo 2 puntos
      return Math.min(score * 10, 100);

    // 🎯 24. CROSSROAD DART (5 XP por punto)
    case 'crossroad-dart':
      if (score < 3) return 0; // Suelo: Mínimo 3 puntos
      return Math.min(score * 5, 100);

    // ⭕ 25. PERFECT CIRCLE (Intervalos de precisión porcentual)
    case 'perfect-circle':
      if (score >= 975) return 15;
      if (score >= 925) return 7;
      return 0; // Menos de 92.5% no da XP

    // 🧮 26. MENTAL MATH (3 XP por punto)
    case 'mental-math':
      if (score < 2) return 0; // Suelo: Mínimo 2 puntos
      return Math.min(score * 3, 100);

    // 📈 27. HIGHER OR LOWER (10 XP por punto, min 4)
    case 'higher-lower':
      if (score < 4) return 0; // Suelo estricto de la tabla
      return Math.min(score * 10, 100);

    // 🧠 28. MEMORY LOOP (4 XP por punto)
    case 'memory-loop':
      if (score < 2) return 0; // Suelo: Mínimo 2 puntos
      return Math.min(score * 4, 100);

    // 🔥 29. OVERHEAT (2.5 XP por punto)
    case 'overheat':
      if (score < 2) return 0; // Suelo: Mínimo 2 puntos
      // Redondeamos hacia abajo por si da decimal (ej: 3 * 2.5 = 7.5 -> 7 XP)
      return Math.min(Math.floor(score * 2.5), 100);

    default:
      // Si añades un juego nuevo y se te olvida ponerlo aquí, te avisa en consola
      console.warn(`No se ha definido lógica de XP para el juego: ${gameId}`);
      return 0; 
  }
};