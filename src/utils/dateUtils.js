/**
 * dateUtils.js — Utilidades de fecha ancladas a Europe/Madrid
 *
 * Garantiza que la app SIEMPRE trabaje con la fecha/hora de España,
 * independientemente de la zona horaria del dispositivo del usuario.
 */

/**
 * Devuelve la fecha actual en España en formato YYYY-MM-DD.
 * Usa Intl.DateTimeFormat con locale 'en-CA' que produce YYYY-MM-DD nativamente.
 *
 * @returns {string} p.ej. "2026-02-25"
 */
export const getSpanishDateString = () => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
};

/**
 * Calcula los milisegundos que faltan hasta la próxima medianoche en Madrid.
 *
 * @returns {number} milisegundos restantes (siempre > 0, mín 1000 si justo da 0)
 */
export const getMsUntilSpanishMidnight = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const h = +get("hour");
  const m = +get("minute");
  const s = +get("second");

  const secsSinceMidnight = h * 3600 + m * 60 + s;
  const secsLeft = 86400 - secsSinceMidnight;

  // Si da exactamente 0 (justo medianoche), devolvemos 1 s para no crear un timer de 0
  return (secsLeft <= 0 ? 1 : secsLeft) * 1000;
};
