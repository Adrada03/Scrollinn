/**
 * authService.js — Autenticación contra Supabase (tabla custom `users`)
 *
 * Replica la lógica del antiguo POST /api/auth:
 *   - Si el usuario existe → verifica contraseña (login)
 *   - Si no existe → crea cuenta nueva (registro)
 *
 * Usa bcryptjs (compatible browser) para hashear/verificar contraseñas
 * contra la columna password_hash de la tabla users.
 */

import { supabase } from '../supabaseClient';
import bcrypt from 'bcryptjs';
import { t } from '../i18n';

const SALT_ROUNDS = 10;

/**
 * Login o registro automático.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ ok: boolean, action?: string, user?: { id, username }, error?: string }>}
 */
export async function authenticate(username, password, mode = 'auto') {
  // Validaciones
  if (!username || !password) {
    return { ok: false, error: t('svc.username_required') };
  }
  if (username.length > 30) {
    return { ok: false, error: t('svc.username_too_long') };
  }
  if (password.length < 4) {
    return { ok: false, error: t('svc.password_too_short') };
  }

  try {
    // Buscar si el usuario ya existe
    const { data: existing, error: selectError } = await supabase
      .from('users')
      .select('id, username, password_hash, xp')
      .eq('username', username)
      .maybeSingle();

    if (selectError) throw selectError;

    if (existing) {
      // Modo registro: el nombre ya está cogido
      if (mode === 'register') {
        return { ok: false, error: t('svc.username_taken') };
      }

      // === Usuario existe → verificar contraseña ===
      const match = await bcrypt.compare(password, existing.password_hash);

      if (!match) {
        return { ok: false, error: t('svc.wrong_password') };
      }

      return {
        ok: true,
        action: 'logged_in',
        user: { id: existing.id, username: existing.username, xp: existing.xp ?? 0 },
      };
    }

    // Modo login: el usuario no existe
    if (mode === 'login') {
      return { ok: false, error: t('svc.user_not_found') };
    }

    // === Usuario nuevo → crear cuenta ===
    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{ username, password_hash: hash }])
      .select('id, username, xp')
      .single();

    if (insertError) {
      // Puede ser conflicto de username (race condition)
      if (insertError.code === '23505') {
        return { ok: false, error: t('svc.username_taken') };
      }
      throw insertError;
    }

    return {
      ok: true,
      action: 'registered',
      user: { id: newUser.id, username: newUser.username, xp: newUser.xp ?? 0 },
    };
  } catch (err) {
    console.error('authService error:', err);
    return { ok: false, error: t('svc.db_error') };
  }
}
