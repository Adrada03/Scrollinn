/**
 * leveling.js — Motor de progresión y niveles
 *
 * El nivel se calcula al vuelo a partir del XP (Single Source of Truth).
 * NO existe columna `level` en la BD; es un valor derivado.
 *
 * Progresión triangular x10:
 *   XP para nivel L = 500 * L * (L - 1)
 *   Nivel desde XP  = floor((1 + sqrt(1 + 8*xp/1000)) / 2)
 */

/**
 * Calcula el nivel a partir de la experiencia acumulada.
 * Fórmula inversa ajustada (x10): el divisor pasa de 100 a 1000.
 * @param {number} xp - Experiencia total del usuario (≥ 0).
 * @returns {number} Nivel actual (mínimo 1).
 */
export function getLevelFromXP(xp = 0) {
  const safeXP = Math.max(0, xp);
  return Math.floor((1 + Math.sqrt(1 + 8 * safeXP / 1000)) / 2);
}

/**
 * Devuelve el XP total necesario para alcanzar un nivel dado.
 * Progresión triangular x10: 500 * level * (level - 1).
 *
 * @param {number} level - El nivel objetivo.
 * @returns {number} XP total requerido para llegar a ese nivel.
 */
export function getXPForLevel(level) {
  if (level <= 1) return 0;
  return 500 * level * (level - 1);
}

/**
 * Devuelve el XP total requerido para alcanzar el SIGUIENTE nivel
 * desde el nivel actual.
 *
 * @param {number} currentLevel - Nivel actual del usuario.
 * @returns {number} XP total necesario para el siguiente nivel.
 */
export function getXPRequiredForNextLevel(currentLevel) {
  return getXPForLevel(currentLevel + 1);
}

/**
 * Calcula el porcentaje de progreso (0–100) entre el nivel actual
 * y el siguiente.
 *
 * @param {number} xp - Experiencia total del usuario.
 * @returns {{ level: number, currentLevelXP: number, nextLevelXP: number, percentage: number }}
 */
export function getLevelProgress(xp = 0) {
  const safeXP = Math.max(0, xp);
  const level = getLevelFromXP(safeXP);
  const xpForCurrentLevel = getXPForLevel(level);
  const xpForNextLevel = getXPForLevel(level + 1);

  const xpIntoCurrentLevel = safeXP - xpForCurrentLevel;
  const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;
  const percentage = xpNeededForNextLevel > 0
    ? Math.min(100, Math.max(0, (xpIntoCurrentLevel / xpNeededForNextLevel) * 100))
    : 100;

  return {
    level,
    currentLevelXP: xpIntoCurrentLevel,
    nextLevelXP: xpNeededForNextLevel,
    percentage,
  };
}

/**
 * Devuelve clases de Tailwind para borde + resplandor según el tier.
 *
 * Tiers:
 *   1–9   Rookie   → slate
 *   10–19 Cyberpunk → cyan
 *   20–29 Hacker   → fuchsia
 *   30+   Leyenda  → amber
 *
 * @param {number} level - Nivel actual del usuario.
 * @returns {string} Clases de Tailwind (ring + shadow).
 */
export function getTierColorStyles(level = 1) {
  if (level >= 30) return 'ring-2 ring-amber-400 shadow-[0_0_20px_#fbbf24]';
  if (level >= 20) return 'ring-2 ring-fuchsia-500 shadow-[0_0_15px_#d946ef]';
  if (level >= 10) return 'ring-2 ring-cyan-400 shadow-[0_0_15px_#22d3ee]';
  return 'ring-2 ring-slate-400 shadow-[0_0_10px_#94a3b8]';
}

/**
 * Devuelve el nombre del tier según el nivel.
 *
 * @param {number} level
 * @returns {string}
 */
export function getTierName(level = 1) {
  if (level >= 30) return 'Leyenda';
  if (level >= 20) return 'Hacker';
  if (level >= 10) return 'Cyberpunk';
  return 'Rookie';
}

/**
 * Devuelve el color de acento del tier como clase de Tailwind para texto.
 *
 * @param {number} level
 * @returns {string}
 */
export function getTierTextColor(level = 1) {
  if (level >= 30) return 'text-amber-400';
  if (level >= 20) return 'text-fuchsia-400';
  if (level >= 10) return 'text-cyan-400';
  return 'text-slate-300';
}

/**
 * Devuelve el color hex del tier para usar en CSS custom properties.
 *
 * @param {number} level
 * @returns {string} Color hex.
 */
export function getTierHexColor(level = 1) {
  if (level >= 30) return '#fbbf24';
  if (level >= 20) return '#d946ef';
  if (level >= 10) return '#22d3ee';
  return '#94a3b8';
}

/**
 * Devuelve el color hex del tier más tenue (para sombras secundarias).
 *
 * @param {number} level
 * @returns {string} Color hex con transparencia.
 */
export function getTierHexColorDim(level = 1) {
  if (level >= 30) return '#fbbf2440';
  if (level >= 20) return '#d946ef40';
  if (level >= 10) return '#22d3ee40';
  return '#94a3b840';
}
