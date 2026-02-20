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

const SALT_ROUNDS = 10;

/**
 * Login o registro automático.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ ok: boolean, action?: string, user?: { id, username }, error?: string }>}
 */
export async function authenticate(username, password) {
  // Validaciones
  if (!username || !password) {
    return { ok: false, error: 'Nombre de usuario y contraseña son obligatorios.' };
  }
  if (username.length > 30) {
    return { ok: false, error: 'El nombre de usuario no puede tener más de 30 caracteres.' };
  }
  if (password.length < 4) {
    return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres.' };
  }

  try {
    // Buscar si el usuario ya existe
    const { data: existing, error: selectError } = await supabase
      .from('users')
      .select('id, username, password_hash')
      .eq('username', username)
      .maybeSingle();

    if (selectError) throw selectError;

    if (existing) {
      // === Usuario existe → verificar contraseña ===
      const match = await bcrypt.compare(password, existing.password_hash);

      if (!match) {
        return { ok: false, error: 'Contraseña incorrecta.' };
      }

      return {
        ok: true,
        action: 'logged_in',
        user: { id: existing.id, username: existing.username },
      };
    }

    // === Usuario nuevo → crear cuenta ===
    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{ username, password_hash: hash }])
      .select('id, username')
      .single();

    if (insertError) {
      // Puede ser conflicto de username (race condition)
      if (insertError.code === '23505') {
        return { ok: false, error: 'Ese nombre de usuario ya está cogido.' };
      }
      throw insertError;
    }

    return {
      ok: true,
      action: 'registered',
      user: { id: newUser.id, username: newUser.username },
    };
  } catch (err) {
    console.error('authService error:', err);
    return { ok: false, error: 'Error de conexión con la base de datos.' };
  }
}
