/**
 * AuthScreen.jsx — Pantalla de Login / Registro obligatorio
 *
 * Estética Cyberpunk/Neón coherente con Scrollinn.
 * Dos modos: Login (Email + Password) y Registro (Username + Email + Password).
 * Usa Supabase Auth nativo (signInWithPassword, signUp).
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../supabaseClient";
import { useLanguage } from "../i18n";

/* ── Eye icons for password toggle ── */
const EyeOff = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
  </svg>
);
const EyeOn = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const inputClass =
  "w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/25 outline-none focus:border-cyan-500/50 focus:bg-white/8 focus:ring-1 focus:ring-cyan-500/20 transition-all duration-200";

const AuthScreen = ({ onClose }) => {
  const { t } = useLanguage();

  const [mode, setMode] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const clearFeedback = () => { setError(""); };

  const switchMode = (m) => {
    setMode(m);
    clearFeedback();
  };

  /* ── Email / Username Login ── */
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError(t("authscreen.fill_both"));
      return;
    }
    clearFeedback();
    setLoading(true);

    let loginEmail = email.trim();

    // If input doesn't look like an email, treat it as a username
    if (!loginEmail.includes("@")) {
      const { data, error: rpcError } = await supabase.rpc(
        "get_email_by_username",
        { p_username: loginEmail }
      );
      if (rpcError || !data) {
        setError(t("authscreen.username_not_found"));
        setLoading(false);
        return;
      }
      loginEmail = data;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });
    if (signInError) setError(t("authscreen.invalid_credentials"));
    setLoading(false);
  };

  /* ── Email Sign Up (acceso directo, sin verificación) ── */
  const handleSignUp = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError(t("authscreen.fill_username"));
      return;
    }
    if (!email.trim() || !password.trim()) {
      setError(t("authscreen.fill_both"));
      return;
    }
    if (password.length < 6) {
      setError(t("authscreen.password_min"));
      return;
    }
    clearFeedback();
    setLoading(true);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { username: username.trim() },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // Si el registro devuelve sesión (verificación desactivada), asegurar
    // que la fila en public.users existe (fallback por si el trigger tarda)
    const userId = signUpData?.user?.id;
    if (userId) {
      // Pequeña espera para dar tiempo al trigger
      await new Promise((r) => setTimeout(r, 600));

      // Comprobar si el trigger ya creó la fila
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (!existing) {
        // Fallback: crear la fila manualmente
        await supabase.from("users").upsert({
          id: userId,
          username: username.trim(),
          xp: 0,
          coins: 0,
        }, { onConflict: "id" });
      }
    }

    // onAuthStateChange se encargará de setSession → redirect automático
    setLoading(false);
  };

  const isRegister = mode === "register";

  return (
    <div className="fixed inset-0 z-9999 flex flex-col items-center justify-center bg-slate-950 overflow-y-auto py-4">
      {/* ── Ambient glow ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-100 h-75 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #d946ef 0%, transparent 70%)" }} />
      </div>

      {/* ── Content ── */}
      <motion.div
        className="relative z-10 w-full max-w-sm px-8 py-6 flex flex-col items-center gap-5 my-auto"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {/* ── Title ── */}
        <div className="text-center select-none">
          <h1
            className="text-4xl font-black tracking-widest"
            style={{
              color: "#06b6d4",
              textShadow: "0 0 20px rgba(6,182,212,0.6), 0 0 60px rgba(6,182,212,0.3), 0 0 100px rgba(6,182,212,0.15)",
            }}
          >
            SCROLLINN
          </h1>
          <p className="mt-2 text-white/40 text-sm tracking-wide">
            {t("authscreen.subtitle")}
          </p>
        </div>

        {/* ── Mode Tabs ── */}
        <div className="w-full flex rounded-xl overflow-hidden border border-white/10">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={`flex-1 py-2.5 text-sm font-semibold tracking-wide transition-all cursor-pointer ${
              !isRegister
                ? "bg-cyan-500/15 text-cyan-400 border-r border-cyan-500/30"
                : "bg-white/3 text-white/35 border-r border-white/10 hover:text-white/50"
            }`}
          >
            {t("auth.login")}
          </button>
          <button
            type="button"
            onClick={() => switchMode("register")}
            className={`flex-1 py-2.5 text-sm font-semibold tracking-wide transition-all cursor-pointer ${
              isRegister
                ? "bg-cyan-500/15 text-cyan-400"
                : "bg-white/3 text-white/35 hover:text-white/50"
            }`}
          >
            {t("auth.create_account")}
          </button>
        </div>

        {/* ── Form ── */}
        <form
          onSubmit={isRegister ? handleSignUp : handleLogin}
          className="w-full flex flex-col gap-3"
        >
          {/* Username (solo registro) */}
          <AnimatePresence initial={false}>
            {isRegister && (
              <motion.div
                key="username-field"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <label className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-1.5 block">
                  {t("authscreen.username_label")}
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(""); }}
                  placeholder={t("authscreen.username_placeholder")}
                  autoComplete="username"
                  maxLength={20}
                  className={inputClass}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email / Username (login) or Email (register) */}
          <div>
            <label className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-1.5 block">
              {isRegister ? "Email" : t("authscreen.email_or_username")}
            </label>
            <input
              type={isRegister ? "email" : "text"}
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder={isRegister ? "tu@email.com" : t("authscreen.email_or_username_ph")}
              autoComplete={isRegister ? "email" : "username email"}
              className={inputClass}
            />
          </div>

          {/* Password */}
          <div>
            <label className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-1.5 block">
              {t("auth.password")}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                placeholder="••••••••"
                autoComplete={isRegister ? "new-password" : "current-password"}
                className={`${inputClass} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff /> : <EyeOn />}
              </button>
            </div>
          </div>

          {/* ── Submit ── */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-2xl font-bold text-sm tracking-wide text-white mt-1
              cursor-pointer active:scale-[0.97] transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
              boxShadow: "0 8px 32px rgba(6,182,212,0.25), 0 2px 8px rgba(6,182,212,0.15)",
            }}
          >
            {loading
              ? t("auth.connecting")
              : isRegister
                ? t("auth.create_account")
                : t("auth.login")}
          </button>
        </form>

        {/* ── Error ── */}
        <AnimatePresence>
          {error && (
            <motion.p
              key="error"
              className="text-sm font-medium text-center px-2"
              style={{ color: "#f87171", textShadow: "0 0 12px rgba(248,113,113,0.4)" }}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* ── Hint ── */}
        <p className="text-white/20 text-xs text-center leading-relaxed max-w-xs">
          {t("authscreen.hint")}
        </p>

        {/* ── Guest Mode / Close ── */}
        {onClose && (
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-2xl text-sm font-semibold tracking-wide
              cursor-pointer active:scale-[0.97] transition-all duration-200
              text-white/60 border border-white/20 bg-white/5
              hover:text-white/80 hover:border-white/35 hover:bg-white/10"
          >
            {t("authscreen.guest_btn")}
          </button>
        )}
      </motion.div>
    </div>
  );
};

export default AuthScreen;
