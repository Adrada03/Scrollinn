import { supabase } from '../supabaseClient';

// Utilidad para obtener la medianoche de hoy en UTC
function getTodayMidnightUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString();
}

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
      return { success: false, liked: false, totalLikes: 0, message: 'Debes iniciar sesión para dar like' };
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

    return { success: true, liked, totalLikes, message: liked ? 'Like añadido' : 'Like eliminado' };
  } catch (error) {
    return { success: false, liked: false, totalLikes: 0, message: error.message };
  }
}

export async function getDailyTop20(gameId) {
  try {
    // Obtener si el juego es lower better
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('is_lower_better')
      .eq('id', gameId)
      .maybeSingle();
    if (gameError) throw gameError;
    if (!game) return { success: false, data: null, message: 'Juego no encontrado' };

    const midnight = getTodayMidnightUTC();
    // Query de scores + join username
    let query = supabase
      .from('scores')
      .select('id, user_id, score, achieved_at, users(username)')
      .eq('game_id', gameId)
      .gte('achieved_at', midnight);

    // Ordenar según is_lower_better
    query = game.is_lower_better
      ? query.order('score', { ascending: true })
      : query.order('score', { ascending: false });
    query = query.order('achieved_at', { ascending: true }); // Desempate por fecha
    query = query.limit(20);

    const { data: scores, error: scoresError } = await query;
    if (scoresError) throw scoresError;

    return { success: true, data: scores, message: null };
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
    user: s.users?.username ?? '—',
    score: s.score,
  }));
}

export async function submitScore(userId, gameId, score) {
  try {
    // 1. Obtener is_lower_better
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('is_lower_better, total_plays')
      .eq('id', gameId)
      .maybeSingle();
    if (gameError) throw gameError;
    if (!game) return { success: false, data: null, message: 'Juego no encontrado' };

    // 2. Obtener el Top 20 de hoy (antes de insertar)
    const top20Res = await getDailyTop20(gameId);
    if (!top20Res.success) throw new Error(top20Res.message);
    const top20 = top20Res.data;

    let message;

    // 3. Lógica de portero
    if (top20.length < 20) {
      // Hay hueco, insertar
      const { error: insertError } = await supabase
        .from('scores')
        .insert([{ user_id: userId, game_id: gameId, score }]);
      if (insertError) throw insertError;
      message = '¡Puntuación registrada!';
    } else {
      // Hay 20, comprobar si es mejor que la peor
      const worst = top20[top20.length - 1];
      const isBetter = game.is_lower_better
        ? score < worst.score
        : score > worst.score;
      if (isBetter) {
        const { error: insertError } = await supabase
          .from('scores')
          .insert([{ user_id: userId, game_id: gameId, score }]);
        if (insertError) throw insertError;
        message = '¡Has entrado en el Top 20 de hoy!';
      } else {
        message = 'No has superado el Top 20 de hoy';
      }
    }

    // 4. Sumar +1 a total_plays
    await supabase
      .from('games')
      .update({ total_plays: (game.total_plays || 0) + 1 })
      .eq('id', gameId);

    // 5. Obtener el ranking actualizado (después de la posible inserción)
    const updatedTop = await getDailyTop20(gameId);
    const ranking = formatRanking(updatedTop.success ? updatedTop.data : []);

    return { success: true, data: { ranking }, message };
  } catch (error) {
    return { success: false, data: null, message: error.message };
  }
}
