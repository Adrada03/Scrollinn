/**
 * challengeService.js — Servicio de Retos Diarios
 *
 * Funciones:
 *  - getTodayChallenges(userId)  → retos del día + progreso del usuario
 *  - claimReward(userId, challengeId, rewardCoins) → marca reclamado + suma monedas
 */

import { supabase } from "../supabaseClient";
import { getSpanishDateString } from "../utils/dateUtils";

/**
 * Devuelve los retos activos de HOY junto con el progreso del usuario.
 *
 * @param {string|null} userId - UUID del usuario logueado (o null si anónimo)
 * @returns {Promise<Array<{
 *   id: string,
 *   title_es: string,
 *   title_en: string,
 *   description_es: string,
 *   description_en: string,
 *   target_score: number,
 *   target_plays: number,
 *   target_game_id: string|null,
 *   reward_coins: number,
 *   current_progress: number,
 *   is_claimed: boolean
 * }>>}
 */
export async function getTodayChallenges(userId = null) {
  try {
    // Fecha de hoy en formato YYYY-MM-DD (siempre Europe/Madrid)
    const today = getSpanishDateString();

    // 1. Traer los retos del día
    const { data: challenges, error: chError } = await supabase
      .from("daily_challenges")
      .select("*")
      .eq("active_date", today)
      .order("created_at", { ascending: true })
      .limit(3);

    if (chError) throw chError;
    if (!challenges || challenges.length === 0) return [];

    // 2. Si hay usuario, traer su progreso para estos retos
    let progressMap = {};

    if (userId) {
      const challengeIds = challenges.map((c) => c.id);
      const { data: progress, error: prError } = await supabase
        .from("user_challenge_progress")
        .select("challenge_id, current_progress, is_claimed")
        .eq("user_id", userId)
        .in("challenge_id", challengeIds);

      if (prError) throw prError;

      for (const row of progress ?? []) {
        progressMap[row.challenge_id] = {
          current_progress: row.current_progress ?? 0,
          is_claimed: row.is_claimed ?? false,
        };
      }
    }

    // 3. Fusionar retos + progreso
    return challenges.map((ch) => ({
      ...ch,
      current_progress: progressMap[ch.id]?.current_progress ?? 0,
      is_claimed: progressMap[ch.id]?.is_claimed ?? false,
    }));
  } catch (err) {
    console.warn("getTodayChallenges error:", err.message);
    return [];
  }
}

/**
 * Reclama la recompensa de un reto completado.
 *
 * 1. Marca `is_claimed = true` en `user_challenge_progress`
 * 2. Suma las monedas al usuario en `users`
 *
 * @param {string} userId
 * @param {string} challengeId
 * @param {number} rewardCoins
 * @returns {Promise<{ success: boolean, newCoins?: number, error?: string }>}
 */
export async function claimReward(userId, challengeId, rewardCoins, { isFullClear = false } = {}) {
  try {
    if (!userId) return { success: false, error: "No user" };

    // 1. Marcar como reclamado
    const { error: upError } = await supabase
      .from("user_challenge_progress")
      .update({ is_claimed: true })
      .eq("user_id", userId)
      .eq("challenge_id", challengeId);

    if (upError) throw upError;

    // 2. Leer datos actuales del usuario (coins + xp si es full clear)
    const { data: userData, error: readErr } = await supabase
      .from("users")
      .select("coins, xp")
      .eq("id", userId)
      .single();

    if (readErr) throw readErr;

    const newCoins = (userData.coins ?? 0) + rewardCoins;
    const updatePayload = { coins: newCoins };

    let oldXP, newXP;
    if (isFullClear) {
      oldXP = userData.xp ?? 0;
      newXP = oldXP + 500;
      updatePayload.xp = newXP;
    }

    const { error: updateErr } = await supabase
      .from("users")
      .update(updatePayload)
      .eq("id", userId);

    if (updateErr) throw updateErr;

    const result = { success: true, newCoins };
    if (isFullClear) {
      result.oldXP = oldXP;
      result.newXP = newXP;
    }
    return result;
  } catch (err) {
    console.warn("claimReward error:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Evalúa la partida terminada contra los retos del día y guarda el progreso
 * mediante un UPSERT que aprovecha el constraint UNIQUE(user_id, challenge_id).
 *
 * Debe llamarse en cada Game Over.
 *
 * @param {string} userId   – UUID del jugador
 * @param {string} gameId   – ID del juego (de GAME_IDS)
 * @param {number} finalScore – Puntuación obtenida en la partida
 * @returns {Promise<void>}
 */
export async function evaluateAndSaveChallenges(userId, gameId, finalScore) {
  try {
    if (!userId) return;

    // ── Paso 1: Obtener retos de hoy + progreso actual ──────────────────
    const today = getSpanishDateString();

    const { data: challenges, error: chErr } = await supabase
      .from("daily_challenges")
      .select("*")
      .eq("active_date", today);

    if (chErr) throw chErr;
    if (!challenges || challenges.length === 0) return;

    const challengeIds = challenges.map((c) => c.id);

    const { data: progressRows, error: prErr } = await supabase
      .from("user_challenge_progress")
      .select("challenge_id, current_progress, is_claimed")
      .eq("user_id", userId)
      .in("challenge_id", challengeIds);

    if (prErr) throw prErr;

    const progressMap = {};
    for (const row of progressRows ?? []) {
      progressMap[row.challenge_id] = row;
    }

    // ── Paso 2 & 3: Evaluar cada reto y hacer UPSERT si procede ─────────
    for (const reto of challenges) {
      // Si ya reclamado, no tocar
      if (progressMap[reto.id]?.is_claimed) continue;

      // Sistema AND: juego válido + puntuación válida
      const isGameValid =
        reto.target_game_id === null || reto.target_game_id === gameId;
      const isScoreValid = finalScore >= reto.target_score;

      if (!isGameValid || !isScoreValid) continue;

      // Calcular nuevo progreso sin pasarse del límite
      const currentProgress =
        progressMap[reto.id]?.current_progress ?? 0;

      // Si ya estaba al máximo, no volver a escribir
      if (currentProgress >= reto.target_plays) continue;

      const newProgress = Math.min(currentProgress + 1, reto.target_plays);

      // UPSERT aprovechando el constraint UNIQUE(user_id, challenge_id)
      const { error: upsertErr } = await supabase
        .from("user_challenge_progress")
        .upsert(
          {
            user_id: userId,
            challenge_id: reto.id,
            current_progress: newProgress,
            // is_claimed se mantiene false por defecto al insertar;
            // al actualizar, Supabase solo toca las columnas enviadas.
          },
          { onConflict: "user_id, challenge_id" }
        );

      if (upsertErr) {
        console.warn(
          `evaluateAndSaveChallenges upsert error (challenge ${reto.id}):`,
          upsertErr.message
        );
      }
    }
    // Notificar a la UI para que refresque retos
    window.dispatchEvent(new Event("challenges-updated"));
  } catch (err) {
    // Nunca romper el flujo del Game Over por un error de retos
    console.warn("evaluateAndSaveChallenges error:", err.message);
  }
}

/**
 * Calcula el estado de los retos diarios.
 * @param {Array} challenges
 * @returns {"none"|"pending"|"claimable"|"allDone"}
 */
export function getChallengeStatus(challenges) {
  if (!challenges || challenges.length === 0) return "none";
  const allClaimed = challenges.every((c) => c.is_claimed);
  if (allClaimed) return "allDone";
  const hasClaimable = challenges.some(
    (c) => c.current_progress >= c.target_plays && !c.is_claimed
  );
  return hasClaimable ? "claimable" : "pending";
}

/**
 * Reclama el bonus de XP diario por completar todos los retos.
 * @param {string} userId
 * @param {number} xpAmount
 * @returns {Promise<{ success: boolean, newXP?: number, error?: string }>}
 */
export async function claimDailyXPBonus(userId, xpAmount = 500) {
  try {
    if (!userId) return { success: false, error: "No user" };

    const { data: userData, error: readErr } = await supabase
      .from("users")
      .select("xp")
      .eq("id", userId)
      .single();

    if (readErr) throw readErr;

    const newXP = (userData.xp ?? 0) + xpAmount;

    const { error: xpErr } = await supabase
      .from("users")
      .update({ xp: newXP })
      .eq("id", userId);

    if (xpErr) throw xpErr;

    return { success: true, newXP };
  } catch (err) {
    console.warn("claimDailyXPBonus error:", err.message);
    return { success: false, error: err.message };
  }
}
