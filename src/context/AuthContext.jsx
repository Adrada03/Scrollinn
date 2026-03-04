/**
 * AuthContext.jsx — Proveedor global de autenticación (Supabase Auth nativo)
 *
 * Usa `supabase.auth.onAuthStateChange` para escuchar cambios de sesión.
 * Sincroniza el perfil de `public.users` cada vez que hay sesión activa.
 *
 * Exporta:
 *  - AuthProvider   — wrapper React
 *  - useAuth()      — hook: { session, currentUser, loading, logout, updateUser, refreshProfile }
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

// ─── Contexto ────────────────────────────────────────────────────────────────

const AuthContext = createContext(null);

/**
 * AuthProvider
 *
 * 1. Al montar, obtiene la sesión actual con getSession().
 * 2. Escucha onAuthStateChange para detectar login/logout/token refresh.
 * 3. Cada vez que hay sesión activa, consulta public.users para datos de perfil.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(() => sessionStorage.getItem("scrollinn-guest") === "1");

  // ── Fetch profile from public.users (con retry progresivo) ────────────
  const fetchProfile = useCallback(async (userId) => {
    if (!userId) {
      setCurrentUser(null);
      return;
    }

    const delays = [0, 800, 1500, 2500]; // retry progresivo

    for (const delay of delays) {
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));

      try {
        const { data, error } = await supabase
          .from("users")
          .select("id, username, xp, equipped_avatar_id, coins")
          .eq("id", userId)
          .maybeSingle();

        if (!error && data) {
          setCurrentUser({
            id: data.id,
            username: data.username,
            xp: data.xp ?? 0,
            equipped_avatar_id: data.equipped_avatar_id ?? "none",
            coins: data.coins ?? 0,
          });
          return;
        }
      } catch {
        // Network error — continue retrying
      }
    }

    // All retries exhausted — leave currentUser null
    setCurrentUser(null);
  }, []);

  // ── 1. Bootstrap session + listen for changes ─────────────────────────────
  useEffect(() => {
    let mounted = true;

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user?.id) {
        fetchProfile(s.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!mounted) return;
        setSession(newSession);
        if (newSession?.user?.id) {
          fetchProfile(newSession.user.id);
        } else {
          setCurrentUser(null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // ── API pública ────────────────────────────────────────────────────────────

  /** Cierra sesión (Supabase Auth). */
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setCurrentUser(null);
    setIsGuest(false);
    sessionStorage.removeItem("scrollinn-guest");
  }, []);

  /** Entra como invitado (sin cuenta). */
  const loginAsGuest = useCallback(() => {
    setIsGuest(true);
    sessionStorage.setItem("scrollinn-guest", "1");
  }, []);

  /** Sale del modo invitado y muestra AuthScreen. */
  const exitGuest = useCallback(() => {
    setIsGuest(false);
    sessionStorage.removeItem("scrollinn-guest");
  }, []);

  /**
   * Actualiza parcialmente el usuario actual (p.ej. cambio de avatar o XP).
   * Acepta un objeto parcial o una función updater.
   */
  const updateUser = useCallback((updater) => {
    setCurrentUser((prev) => {
      if (!prev) return prev;
      return typeof updater === "function"
        ? updater(prev)
        : { ...prev, ...updater };
    });
  }, []);

  /** Refresca el perfil desde la BD */
  const refreshProfile = useCallback(() => {
    if (session?.user?.id) {
      return fetchProfile(session.user.id);
    }
    return Promise.resolve();
  }, [session?.user?.id, fetchProfile]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const value = useMemo(
    () => ({ session, currentUser, loading, logout, updateUser, refreshProfile, isGuest, loginAsGuest, exitGuest }),
    [session, currentUser, loading, logout, updateUser, refreshProfile, isGuest, loginAsGuest, exitGuest]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

/**
 * Hook para consumir el contexto de autenticación.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
