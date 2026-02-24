/**
 * avatarService.js — Queries de Supabase para el sistema de avatares
 *
 * Funciones:
 *   getUserAvatars(userId)           — Inventario de avatares del usuario (JOIN user_avatars + avatars)
 *   updateEquippedAvatar(userId, id) — UPDATE users SET equipped_avatar_id = id
 *   getEquippedAvatar(userId)        — Obtiene el equipped_avatar_id actual del usuario
 */

import { supabase } from '../supabaseClient';

/* ═══════════════════════════════════════════════════════════════════
   Cache in-memory: avatar_id → image_url
   Se carga una sola vez (la tabla avatars es muy pequeña).
   ═══════════════════════════════════════════════════════════════════ */
let _imageCache = null;   // Map<string, string>
let _cachePromise = null; // dedup de fetch concurrentes

async function loadImageCache() {
  const { data, error } = await supabase
    .from('avatars')
    .select('id, image_url');
  if (error) {
    console.warn('avatarImageCache: failed to load', error.message);
    return new Map();
  }
  const map = new Map();
  for (const a of data || []) {
    map.set(a.id, a.image_url);
  }
  return map;
}

async function getImageCache() {
  if (_imageCache) return _imageCache;
  if (!_cachePromise) {
    _cachePromise = loadImageCache().then((m) => {
      _imageCache = m;
      _cachePromise = null;
      return m;
    });
  }
  return _cachePromise;
}

/**
 * Dado un avatar_id, devuelve la URL resuelta de su imagen.
 * Lee de la cache en memoria (carga lazy la primera vez).
 * Devuelve null si no encuentra nada.
 */
export async function getAvatarImageUrl(avatarId) {
  if (!avatarId || avatarId === 'none') return null;
  const cache = await getImageCache();
  const raw = cache.get(avatarId);
  if (!raw) return null;
  if (raw.startsWith('http') || raw.startsWith('/')) return raw;
  return `/avatars/${raw}`;
}

/**
 * Versión síncrona: devuelve la URL si la cache ya está cargada,
 * o null si aún no se ha cargado. Dispara la carga en segundo plano.
 */
export function getAvatarImageUrlSync(avatarId) {
  if (!avatarId || avatarId === 'none') return null;
  if (!_imageCache) {
    // Disparar carga pero devolver null mientras tanto
    getImageCache();
    return null;
  }
  const raw = _imageCache.get(avatarId);
  if (!raw) return null;
  if (raw.startsWith('http') || raw.startsWith('/')) return raw;
  return `/avatars/${raw}`;
}

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
      .select('avatar_id, avatars(id, name_es, name_en, description_es, description_en, tier, image_url)')
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

/* ═══════════════════════════════════════════════════════════════════
   Shop — Tienda de avatares
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Obtiene los avatares a la venta en la tienda.
 * Busca en `shop_items` (is_active = true) y hace JOIN con `avatars`.
 * Si se pasa userId, también marca cuáles ya posee el usuario.
 *
 * @param {string|null} userId
 * @returns {Promise<{ success: boolean, data: Array }>}
 */
export async function getShopAvatars(userId = null) {
  try {
    const { data: shopRows, error } = await supabase
      .from('shop_items')
      .select('id, price, avatar_id, avatars(id, name_es, name_en, description_es, description_en, tier, image_url)')
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (error) throw error;

    let ownedIds = new Set();
    if (userId) {
      const { data: userAvatars, error: uaError } = await supabase
        .from('user_avatars')
        .select('avatar_id')
        .eq('user_id', userId);
      if (!uaError && userAvatars) {
        ownedIds = new Set(userAvatars.map(r => r.avatar_id));
      }
    }

    const result = (shopRows || []).map(row => ({
      // Datos del avatar (del JOIN)
      id: row.avatars.id,
      name_es: row.avatars.name_es,
      name_en: row.avatars.name_en,
      description_es: row.avatars.description_es,
      description_en: row.avatars.description_en,
      tier: row.avatars.tier,
      image_url: row.avatars.image_url,
      // Datos de la tienda
      shop_item_id: row.id,
      price: row.price,
      owned: ownedIds.has(row.avatars.id),
    }));

    return { success: true, data: result };
  } catch (err) {
    console.error('getShopAvatars error:', err);
    return { success: false, data: [] };
  }
}

/**
 * Compra un avatar de la tienda.
 * Busca el precio en `shop_items`, verifica monedas, deduce y crea en user_avatars.
 *
 * @param {string} userId
 * @param {string} avatarId - El id del avatar (de la tabla avatars)
 * @returns {Promise<{ success: boolean, newCoins?: number, error?: string }>}
 */
export async function purchaseAvatar(userId, avatarId) {
  try {
    if (!userId) return { success: false, error: 'No user ID' };

    // 1. Obtener el shop_item activo para este avatar
    const { data: shopItem, error: siErr } = await supabase
      .from('shop_items')
      .select('id, price')
      .eq('avatar_id', avatarId)
      .eq('is_active', true)
      .maybeSingle();
    if (siErr || !shopItem) return { success: false, error: 'Item not found in shop' };

    // 2. Verificar que el usuario no lo tenga ya
    const { data: existing } = await supabase
      .from('user_avatars')
      .select('avatar_id')
      .eq('user_id', userId)
      .eq('avatar_id', avatarId)
      .maybeSingle();
    if (existing) return { success: false, error: 'Already owned' };

    // 3. Obtener monedas del usuario
    const { data: user, error: uErr } = await supabase
      .from('users')
      .select('coins')
      .eq('id', userId)
      .maybeSingle();
    if (uErr || !user) return { success: false, error: 'User not found' };

    const price = shopItem.price ?? 0;
    if ((user.coins ?? 0) < price) return { success: false, error: 'Not enough coins' };

    // 4. Deducir monedas
    const newCoins = (user.coins ?? 0) - price;
    const { error: updateErr } = await supabase
      .from('users')
      .update({ coins: newCoins })
      .eq('id', userId);
    if (updateErr) throw updateErr;

    // 5. Insertar en user_avatars
    const { error: insertErr } = await supabase
      .from('user_avatars')
      .insert([{ user_id: userId, avatar_id: avatarId, acquired_via: 'shop', amount_paid: price }]);
    if (insertErr) throw insertErr;

    return { success: true, newCoins };
  } catch (err) {
    console.error('purchaseAvatar error:', err);
    return { success: false, error: err.message };
  }
}
