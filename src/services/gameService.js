import { supabase } from '../supabaseClient';
import { t } from '../i18n';



/**
 * Obtiene el mapa de likes de todos los juegos.
 * Si se pasa userId, también marca cuáles ha likeado ese usuario.
 *
 * @param {string|null} userId
 * @returns {Promise<{ [gameId: string]: { count: number, liked: boolean } }>}
 */
export async function getLikesMap(userId = null) {
  try {
    // Total likes de cada juego
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('id, total_likes');
    if (gamesError) throw gamesError;

    const likesMap = {};
    for (const row of games) {
      likesMap[row.id] = { count: Number(row.total_likes), liked: false };
    }

    // Si hay usuario, marcar cuáles ha likeado
    if (userId) {
      const { data: userLikes, error: ulError } = await supabase
        .from('user_likes')
        .select('game_id')
        .eq('user_id', userId);
      if (ulError) throw ulError;

      for (const row of userLikes) {
        if (likesMap[row.game_id]) {
          likesMap[row.game_id].liked = true;
        }
      }
    }

    return likesMap;
  } catch (err) {
    console.warn('getLikesMap error:', err.message);
    return {};
  }
}

export async function toggleLike(userId, gameId) {
  try {
    if (!userId) {
      // Anónimo: no podemos hacer toggle, ignorar
      return { success: false, liked: false, totalLikes: 0, message: t('svc.login_required') };
    }

    // ¿Ya existe el like?
    const { data: existing, error: selectError } = await supabase
      .from('user_likes')
      .select('user_id')
      .eq('user_id', userId)
      .eq('game_id', gameId)
      .maybeSingle();

    if (selectError) throw selectError;

    let liked;
    if (existing) {
      // Si existe, borrar
      const { error: deleteError } = await supabase
        .from('user_likes')
        .delete()
        .eq('user_id', userId)
        .eq('game_id', gameId);
      if (deleteError) throw deleteError;
      liked = false;
    } else {
      // Si no existe, insertar
      const { error: insertError } = await supabase
        .from('user_likes')
        .insert([{ user_id: userId, game_id: gameId }]);
      if (insertError) throw insertError;
      liked = true;
    }

    // Leer el total actualizado
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('total_likes')
      .eq('id', gameId)
      .maybeSingle();
    if (gameError) throw gameError;
    const totalLikes = game ? Number(game.total_likes) : 0;

    return { success: true, liked, totalLikes, message: liked ? t('svc.like_added') : t('svc.like_removed') };
  } catch (error) {
    return { success: false, liked: false, totalLikes: 0, message: error.message };
  }
}

/**
 * Obtiene el Top 5 de puntuaciones (mejor score por usuario distinto, all-time).
 */
export async function getTop5(gameId) {
  try {
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('is_lower_better')
      .eq('id', gameId)
      .maybeSingle();
    if (gameError) throw gameError;
    if (!game) return { success: false, data: null, message: t('svc.game_not_found') };

    // Traer las mejores puntuaciones ordenadas (+ avatar del usuario)
    let query = supabase
      .from('scores')
      .select('id, user_id, score, achieved_at, users(username, equipped_avatar_id)')
      .eq('game_id', gameId);

    query = game.is_lower_better
      ? query.order('score', { ascending: true })
      : query.order('score', { ascending: false });
    query = query.order('achieved_at', { ascending: true });
    query = query.limit(200);

    const { data: scores, error: scoresError } = await query;
    if (scoresError) throw scoresError;

    // Deduplicar: quedarse con la mejor puntuación de cada usuario
    const seen = new Set();
    const unique = [];
    for (const s of scores) {
      if (!seen.has(s.user_id)) {
        seen.add(s.user_id);
        unique.push(s);
        if (unique.length >= 5) break;
      }
    }

    return { success: true, data: unique, message: null };
  } catch (error) {
    return { success: false, data: null, message: error.message };
  }
}

/**
 * Transforma el array raw de scores (con join de users) al formato
 * que espera GameOverPanel: [{ pos, user, score }]
 */
function formatRanking(rawScores) {
  if (!rawScores || rawScores.length === 0) return [];
  return rawScores.map((s, i) => ({
    pos: i + 1,
    userId: s.user_id ?? null,
    user: s.users?.username ?? '—',
    equippedAvatarId: s.users?.equipped_avatar_id ?? 'none',
    score: s.score,
  }));
}

/**
 * Incrementa total_plays +1 de un juego (sin requerir usuario).
 */
export async function incrementPlays(gameId) {
  try {
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('total_plays')
      .eq('id', gameId)
      .maybeSingle();
    if (gameError || !game) return;

    await supabase
      .from('games')
      .update({ total_plays: (game.total_plays || 0) + 1 })
      .eq('id', gameId);
  } catch {
    // silencioso: no bloquear UX por un contador
  }
}

/**
 * Cuenta cuántos likes (favoritos) tiene un usuario en user_likes.
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function getUserLikesCount(userId) {
  if (!userId) return 0;
  try {
    const { count, error } = await supabase
      .from('user_likes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) throw error;
    return count ?? 0;
  } catch (err) {
    console.warn('getUserLikesCount error:', err.message);
    return 0;
  }
}

/**
 * Obtiene los IDs de los juegos que el usuario ha likeado.
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export async function getUserLikedGameIds(userId) {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('user_likes')
      .select('game_id')
      .eq('user_id', userId);
    if (error) throw error;
    return (data || []).map(r => r.game_id);
  } catch (err) {
    console.warn('getUserLikedGameIds error:', err.message);
    return [];
  }
}

export async function submitScore(userId, gameId, score) {
  try {
    // 1. Obtener info del juego
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('is_lower_better, total_plays')
      .eq('id', gameId)
      .maybeSingle();
    if (gameError) throw gameError;
    if (!game) return { success: false, data: null, message: t('svc.game_not_found') };

    // 2. Insertar la puntuación siempre
    const { error: insertError } = await supabase
      .from('scores')
      .insert([{ user_id: userId, game_id: gameId, score }]);
    if (insertError) throw insertError;

    // 3. Sumar +1 a total_plays
    await supabase
      .from('games')
      .update({ total_plays: (game.total_plays || 0) + 1 })
      .eq('id', gameId);

    // 4. Obtener el ranking actualizado (top 5 usuarios distintos)
    const updatedTop = await getTop5(gameId);
    const topData = updatedTop.success ? updatedTop.data : [];
    const ranking = formatRanking(topData);

    // 5. Comprobar si el usuario aparece en el Top 5
    const inTop5 = topData.some(s => s.user_id === userId);
    const message = inTop5 ? t('svc.top5_made') : t('svc.score_saved');

    return { success: true, data: { ranking }, message };
  } catch (error) {
    return { success: false, data: null, message: error.message };
  }
}
