/**
 * AuthContext.jsx — Proveedor global de autenticación
 *
 * Persistencia de sesión con localStorage:
 *  - Al montar la app, recupera la sesión guardada y la revalida contra la BD.
 *  - Cualquier cambio (login / logout / update) se refleja en localStorage automáticamente.
 *  - Sincroniza entre pestañas mediante el evento "storage".
 *
 * Exporta:
 *  - AuthProvider   — wrapper React
 *  - useAuth()      — hook: { currentUser, loading, login, logout, updateUser }
 *
 * Nota legal: almacenar la sesión en localStorage para autenticación se considera
 * "estrictamente necesario" y no requiere consentimiento de cookies.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { supabase } from "../supabaseClient";

// ─── Constantes ──────────────────────────────────────────────────────────────

const SESSION_KEY = "scrollinn-session";

// ─── Helpers de localStorage ────────────────────────────────────────────────

function readStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validación mínima de integridad
    if (parsed && parsed.id && parsed.username) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeSession(user) {
  try {
    if (user) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    /* modo privado / SSR — falla silenciosamente */
  }
}

// ─── Contexto ────────────────────────────────────────────────────────────────

const AuthContext = createContext(null);

/**
 * AuthProvider
 *
 * 1. Lee la sesión de localStorage al iniciar (instantáneo, sin parpadeo).
 * 2. Revalida contra Supabase (BD) para asegurar que el usuario sigue existiendo
 *    y refrescar datos que puedan haber cambiado (XP, avatar, etc.).
 * 3. Escucha el evento "storage" para sincronizar entre pestañas.
 */
export function AuthProvider({ children }) {
  // Estado inicial: lo que haya guardado en localStorage (o null)
  const [currentUser, setCurrentUser] = useState(() => readStoredSession());
  const [loading, setLoading] = useState(true);

  // ── 1. Revalidar sesión al montar ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function validateSession() {
      const stored = readStoredSession();

      if (!stored) {
        setLoading(false);
        return;
      }

      try {
        // Traer datos frescos del usuario desde la BD
        const { data, error } = await supabase
          .from("users")
          .select("id, username, xp, equipped_avatar_id")
          .eq("id", stored.id)
          .maybeSingle();

        if (cancelled) return;

        if (error || !data) {
          // El usuario ya no existe en la BD → cerrar sesión local
          writeSession(null);
          setCurrentUser(null);
        } else {
          // Refrescar con los datos más recientes
          const freshUser = {
            id: data.id,
            username: data.username,
            xp: data.xp ?? 0,
            equipped_avatar_id: data.equipped_avatar_id ?? "none",
          };
          writeSession(freshUser);
          setCurrentUser(freshUser);
        }
      } catch {
        // Error de red — mantener la sesión local como estaba
        // (mejor UX offline que desloguear al usuario)
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    validateSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── 2. Persistir en localStorage cada vez que cambia currentUser ───────────
  useEffect(() => {
    writeSession(currentUser);
  }, [currentUser]);

  // ── 3. Sincronizar entre pestañas ──────────────────────────────────────────
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === SESSION_KEY) {
        try {
          const updated = e.newValue ? JSON.parse(e.newValue) : null;
          setCurrentUser(updated);
        } catch {
          setCurrentUser(null);
        }
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // ── API pública ────────────────────────────────────────────────────────────

  /** Guarda el usuario tras login/registro exitoso. */
  const login = useCallback((user) => {
    setCurrentUser(user);
  }, []);

  /** Cierra sesión (local + localStorage). */
  const logout = useCallback(() => {
    setCurrentUser(null);
  }, []);

  /**
   * Actualiza parcialmente el usuario actual (p.ej. cambio de avatar o XP).
   * Acepta un objeto parcial o una función updater.
   *
   * Ejemplos:
   *   updateUser({ xp: 120 })
   *   updateUser(prev => ({ ...prev, equipped_avatar_id: 'cat' }))
   */
  const updateUser = useCallback((updater) => {
    setCurrentUser((prev) => {
      if (!prev) return prev;
      return typeof updater === "function"
        ? updater(prev)
        : { ...prev, ...updater };
    });
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  const value = useMemo(
    () => ({ currentUser, loading, login, logout, updateUser }),
    [currentUser, loading, login, logout, updateUser]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

/**
 * Hook para consumir el contexto de autenticación.
 *
 * @returns {{ currentUser: object|null, loading: boolean, login: Function, logout: Function, updateUser: Function }}
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
