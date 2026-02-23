/**
 * profileService.js — Consultas para el Perfil Público de un jugador
 *
 * Exporta:
 *  - getPublicProfile(userId) → { user, topGames }
 *
 * Lógica del "Top 3 Juegos Destacados":
 *   1. Para cada juego, obtiene el mejor score (récord) del usuario.
 *   2. Calcula la posición global de ese récord entre todos los usuarios
 *      (cuántos usuarios tienen un récord mejor → rank = count + 1).
 *   3. Ordena por mejor posición (rank más bajo) y devuelve los 3 mejores.
 */

import { supabase } from "../supabaseClient";

/**
 * Obtiene los datos públicos de un usuario y sus 3 juegos más destacados.
 *
 * @param {string} userId — UUID del usuario
 * @returns {Promise<{ user: object|null, topGames: Array }>}
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

  // ── 2. Obtener todos los scores del usuario ───────────────────────────────
  const { data: userScores, error: scoresError } = await supabase
    .from("scores")
    .select("game_id, score")
    .eq("user_id", userId);

  if (scoresError || !userScores || userScores.length === 0) {
    return { user, topGames: [], careerStats: { totalTop1: 0, totalTop5: 0 } };
  }

  // ── 3. Obtener la dirección de cada juego (is_lower_better) ───────────────
  const gameIds = [...new Set(userScores.map((s) => s.game_id))];

  const { data: gamesInfo, error: gamesError } = await supabase
    .from("games")
    .select("id, name, is_lower_better")
    .in("id", gameIds);

  if (gamesError || !gamesInfo) {
    return { user, topGames: [], careerStats: { totalTop1: 0, totalTop5: 0 } };
  }

  const gamesMap = {};
  for (const g of gamesInfo) {
    gamesMap[g.id] = { name: g.name, isLowerBetter: !!g.is_lower_better };
  }

  // ── 4. Calcular el récord del usuario por juego ───────────────────────────
  const bestByGame = {};
  for (const s of userScores) {
    const info = gamesMap[s.game_id];
    if (!info) continue;

    const current = bestByGame[s.game_id];
    if (!current) {
      bestByGame[s.game_id] = s.score;
    } else if (info.isLowerBetter) {
      if (s.score < current) bestByGame[s.game_id] = s.score;
    } else {
      if (s.score > current) bestByGame[s.game_id] = s.score;
    }
  }

  // ── 5. Para cada juego, calcular la posición global ───────────────────────
  //    rank = (# de usuarios distintos con un récord estrictamente mejor) + 1
  const rankPromises = Object.entries(bestByGame).map(
    async ([gameId, bestScore]) => {
      const info = gamesMap[gameId];
      if (!info) return null;

      // Traer todos los scores de ese juego para calcular el rank
      // (solo necesitamos user_id y score para deduplicar)
      const { data: allScores, error: allError } = await supabase
        .from("scores")
        .select("user_id, score")
        .eq("game_id", gameId);

      if (allError || !allScores) return null;

      // Mejor score por usuario
      const bestPerUser = {};
      for (const s of allScores) {
        const curr = bestPerUser[s.user_id];
        if (curr === undefined) {
          bestPerUser[s.user_id] = s.score;
        } else if (info.isLowerBetter) {
          if (s.score < curr) bestPerUser[s.user_id] = s.score;
        } else {
          if (s.score > curr) bestPerUser[s.user_id] = s.score;
        }
      }

      // Contar cuántos usuarios tienen un récord estrictamente mejor
      let betterCount = 0;
      for (const [uid, uScore] of Object.entries(bestPerUser)) {
        if (uid === userId) continue;
        if (info.isLowerBetter) {
          if (uScore < bestScore) betterCount++;
        } else {
          if (uScore > bestScore) betterCount++;
        }
      }

      return {
        gameId,
        gameName: info.name,
        rank: betterCount + 1,
        score: bestScore,
      };
    }
  );

  const results = (await Promise.all(rankPromises)).filter(Boolean);

  // ── 6. Ordenar por mejor posición y devolver top 3 ────────────────────────
  results.sort((a, b) => a.rank - b.rank);
  const topGames = results.slice(0, 3);

  // ── 7. Career highlights: contar Top 1 y Top 5 en todos los juegos ────────
  const totalTop1 = results.filter((r) => r.rank === 1).length;
  const totalTop5 = results.filter((r) => r.rank <= 5).length;

  return { user, topGames, careerStats: { totalTop1, totalTop5 } };
}
