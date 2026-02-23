/**
 * avatarService.js — Queries de Supabase para el sistema de avatares
 *
 * Funciones:
 *   getUserAvatars(userId)           — Inventario de avatares del usuario (JOIN user_avatars + avatars)
 *   updateEquippedAvatar(userId, id) — UPDATE users SET equipped_avatar_id = id
 *   getEquippedAvatar(userId)        — Obtiene el equipped_avatar_id actual del usuario
 */

import { supabase } from '../supabaseClient';

/**
 * Obtiene los avatares que posee el usuario (su inventario).
 * Hace JOIN entre user_avatars y avatars para traer los datos del catálogo.
 *
 * @param {string} userId - UUID del usuario
 * @returns {Promise<{ success: boolean, data: Array|null, error?: string }>}
 */
export async function getUserAvatars(userId) {
  try {
    if (!userId) return { success: false, data: null, error: 'No user ID' };

    const { data, error } = await supabase
      .from('user_avatars')
      .select('avatar_id, avatars(id, name_es, name_en, description_es, description_en, tier, image_url, unlock_type, requirement, base_price)')
      .eq('user_id', userId);

    if (error) throw error;

    // Aplanar la respuesta con todos los campos del catálogo
    const avatars = (data || []).map((row) => ({
      id: row.avatars.id,
      name_es: row.avatars.name_es,
      name_en: row.avatars.name_en,
      description_es: row.avatars.description_es,
      description_en: row.avatars.description_en,
      tier: row.avatars.tier,
      image_url: row.avatars.image_url,
      unlock_type: row.avatars.unlock_type,
      requirement: row.avatars.requirement,
      base_price: row.avatars.base_price,
    }));

    return { success: true, data: avatars };
  } catch (err) {
    console.error('getUserAvatars error:', err);
    return { success: false, data: null, error: err.message };
  }
}

/**
 * Actualiza el avatar equipado del usuario.
 *
 * @param {string} userId  - UUID del usuario
 * @param {string} avatarId - ID del avatar a equipar ('none' para el por defecto)
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function updateEquippedAvatar(userId, avatarId) {
  try {
    if (!userId) return { success: false, error: 'No user ID' };

    const { error } = await supabase
      .from('users')
      .update({ equipped_avatar_id: avatarId })
      .eq('id', userId);

    if (error) throw error;

    return { success: true };
  } catch (err) {
    console.error('updateEquippedAvatar error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Obtiene el equipped_avatar_id actual de un usuario.
 *
 * @param {string} userId - UUID del usuario
 * @returns {Promise<string>} El ID del avatar equipado ('none' por defecto)
 */
export async function getEquippedAvatar(userId) {
  try {
    if (!userId) return 'none';

    const { data, error } = await supabase
      .from('users')
      .select('equipped_avatar_id')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;

    return data?.equipped_avatar_id || 'none';
  } catch (err) {
    console.error('getEquippedAvatar error:', err);
    return 'none';
  }
}
