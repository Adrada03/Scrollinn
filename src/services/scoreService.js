/**
 * scoreService.js — Servicio de puntuaciones para Scrollinn
 *
 * Funciones:
 *  - submitScore(gameId, newScore, userId) → envía puntuación al servidor
 *  - fetchDailyRanking(gameId) → obtiene el Top 20 de hoy
 */

const API_URL = "";

/**
 * Envía una puntuación al servidor.
 *
 * Flujo del backend:
 *  1. Verifica que el usuario exista (registrado)
 *  2. Consulta is_lower_better del juego automáticamente
 *  3. Solo guarda si entra en el Top 20 diario
 *
 * @param {string} gameId    — ID del juego (ej: "tower-blocks")
 * @param {number} newScore  — Puntuación obtenida
 * @param {string|null} userId — UUID del usuario logueado (null = anónimo)
 * @returns {Promise<{ ok: boolean, saved: boolean, message: string, ranking: Array }>}
 */
export async function submitScore(gameId, newScore, userId) {
  // Si no hay usuario registrado, no intentamos guardar
  if (!userId) {
    // Aun así devolvemos el ranking de hoy para mostrarlo
    const ranking = await fetchDailyRanking(gameId);
    return {
      ok: true,
      saved: false,
      message: "Debes registrarte para entrar al ranking.",
      ranking,
    };
  }

  try {
    const res = await fetch(`${API_URL}/api/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, gameId, score: newScore }),
    });
    const data = await res.json();

    if (!data.ok) {
      // Si falla, intentamos devolver al menos el ranking
      const ranking = await fetchDailyRanking(gameId);
      return { ok: false, saved: false, message: data.error || "Error al guardar.", ranking };
    }

    return data; // { ok, saved, message, ranking }
  } catch (err) {
    console.error("submitScore error:", err);
    const ranking = await fetchDailyRanking(gameId);
    return { ok: false, saved: false, message: "Error de conexión.", ranking };
  }
}

/**
 * Obtiene el Top 20 de hoy para un juego.
 *
 * @param {string} gameId — ID del juego
 * @returns {Promise<Array<{ pos: number, user: string, score: number }>>}
 */
export async function fetchDailyRanking(gameId) {
  try {
    const res = await fetch(`${API_URL}/api/scores/${gameId}/today`);
    const data = await res.json();
    return data.ok ? data.ranking : [];
  } catch (err) {
    console.error("fetchDailyRanking error:", err);
    return [];
  }
}
