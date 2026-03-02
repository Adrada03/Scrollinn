/**
 * profileService.js — Consultas para el Perfil Público de un jugador
 *
 * Exporta:
 *  - getPublicProfile(userId) → { user, topGames, careerStats }
 *
 * Usa el RPC `get_user_profile_stats` que lee directamente de la tabla
 * optimizada `highscores`, devolviendo top1Count, top5Count y bestPositions
 * ya calculados en el servidor.
 */

import { supabase } from "../supabaseClient";

/**
 * Obtiene los datos públicos de un usuario y sus mejores posiciones.
 *
 * @param {string} userId — UUID del usuario
 * @returns {Promise<{ user: object|null, topGames: Array, careerStats: { totalTop1: number, totalTop5: number } }>}
 */
export async function getPublicProfile(userId) {
  if (!userId) return { user: null, topGames: [], careerStats: { totalTop1: 0, totalTop5: 0 } };

  // ── 1. Datos del usuario ──────────────────────────────────────────────────
  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("id, username, xp, equipped_avatar_id")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !userData) {
    console.warn("getPublicProfile: usuario no encontrado", userError?.message);
    return { user: null, topGames: [], careerStats: { totalTop1: 0, totalTop5: 0 } };
  }

  const user = {
    id: userData.id,
    username: userData.username,
    xp: userData.xp ?? 0,
    equipped_avatar_id: userData.equipped_avatar_id ?? "none",
  };

  // ── 2. Stats vía RPC (lee de highscores, ya calculado en el servidor) ─────
  const { data: stats, error: statsError } = await supabase.rpc(
    "get_user_profile_stats",
    { p_user_id: userId }
  );

  if (statsError || !stats) {
    console.warn("getPublicProfile: RPC error", statsError?.message);
    return { user, topGames: [], careerStats: { totalTop1: 0, totalTop5: 0 } };
  }

  // ── 3. Mapear bestPositions al formato que esperan los componentes ────────
  //    Cogemos las 5 mejores posiciones del jugador (ya vienen ordenadas)
  const topGames = (stats.bestPositions ?? [])
    .slice(0, 5)
    .map((bp) => ({
      gameId: bp.game_id,
      gameName: bp.game_name,
      rank: bp.position,
      score: bp.score,
    }));

  const careerStats = {
    totalTop1: stats.top1Count ?? 0,
    totalTop5: stats.top5Count ?? 0,
  };

  return { user, topGames, careerStats };
}
