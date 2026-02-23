/**
 * AuthModal.jsx — Modal de registro / login
 *
 * Campo de usuario + contraseña.
 * Si el usuario existe → verifica contraseña (login).
 * Si no existe → crea cuenta nueva.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { authenticate } from "../services/authService";
import { useLanguage } from "../i18n";
import {
  getLevelFromXP,
  getLevelProgress,
  getXPRequiredForNextLevel,
  getTierName,
  getTierHexColor,
} from "../utils/leveling";
import Avatar from "./Avatar";

const AuthModal = ({ isOpen, onClose, onAuthSuccess, currentUser, onOpenAvatarModal }) => {
  const { t } = useLanguage();
  const [view, setView] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const switchView = (newView) => {
    setView(newView);
    setError("");
    setSuccess("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!username.trim() || !password.trim() || (view === "register" && !confirmPassword.trim())) {
      setError(t(view === "register" ? "auth.fill_all" : "auth.fill_both"));
      return;
    }

    if (view === "register" && password !== confirmPassword) {
      setError(t("auth.passwords_no_match"));
      return;
    }

    setLoading(true);
    try {
      const data = await authenticate(username.trim(), password, view);

      if (!data.ok) {
        setError(data.error);
        setLoading(false);
        return;
      }

      // Éxito
      const msg =
        data.action === "registered"
          ? t("auth.account_created", { username: data.user.username })
          : t("auth.welcome_back", { username: data.user.username });

      setSuccess(msg);
      onAuthSuccess(data.user);

      // Cerrar el modal tras un momento
      setTimeout(() => {
        setUsername("");
        setPassword("");
        setConfirmPassword("");
        setShowPassword(false);
        setShowConfirmPassword(false);
        setError("");
        setSuccess("");
        onClose();
      }, 1500);
    } catch {
      setError(t("auth.connection_error"));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    onAuthSuccess(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-lg z-40"
            onClick={onClose}
          />

          {/* Modal centrado */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 16 }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            {(() => {
              const neonHex = currentUser
                ? getTierHexColor(getLevelFromXP(currentUser.xp ?? 0))
                : '#22d3ee';

              return (
                <div
                  className="w-full max-w-sm backdrop-blur-xl flex flex-col pointer-events-auto overflow-hidden relative"
                  style={{
                    background: 'linear-gradient(175deg, #0c1222 0%, #050510 100%)',
                    border: `1px solid ${neonHex}25`,
                    borderRadius: '6px',
                    clipPath: 'polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px))',
                  }}
                >
                  {/* Subtle top accent line */}
                  <div
                    className="absolute top-0 left-[8px] right-[8px] h-px opacity-50"
                    style={{ background: `linear-gradient(90deg, transparent, ${neonHex}, transparent)` }}
                  />

                  {/* ── Header ── */}
                  <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: neonHex, boxShadow: `0 0 6px ${neonHex}` }}
                      />
                      <h2 className="text-xs font-extrabold tracking-[0.18em] uppercase text-white/70">
                        {currentUser ? t("auth.your_account") : view === "login" ? t("auth.login") : t("auth.create_account")}
                      </h2>
                    </div>
                    <button
                      onClick={onClose}
                      className="w-7 h-7 flex items-center justify-center rounded-md bg-white/5 hover:bg-white/10 text-white/30 hover:text-white/60 text-xs transition-all cursor-pointer"
                      aria-label={t("auth.close")}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Separator */}
                  <div className="mx-5 h-px bg-white/[0.06]" />

                  {/* ── Content ── */}
                  <div className="px-5 pb-6 pt-5">
                    {currentUser ? (
                      (() => {
                        const xp = currentUser.xp ?? 0;
                        const level = getLevelFromXP(xp);
                        const progress = getLevelProgress(xp);
                        const tierName = getTierName(level);
                        const nextLevelXP = getXPRequiredForNextLevel(level);
                        const tierHex = getTierHexColor(level);

                        return (
                          <div className="flex flex-col items-center gap-5">

                            {/* ── Avatar + Level ── */}
                            <div className="flex flex-col items-center gap-4">

                              {/* Avatar ring */}
                              <div className="relative">
                                <div
                                  className="w-[88px] h-[88px] rounded-full p-[2px]"
                                  style={{
                                    background: `conic-gradient(from 180deg, ${tierHex}, ${tierHex}30 40%, ${tierHex} 60%, ${tierHex}30)`,
                                    boxShadow: `0 0 24px ${tierHex}30, 0 0 48px ${tierHex}10`,
                                  }}
                                >
                                  <div className="w-full h-full rounded-full bg-[#0a0f1e] flex items-center justify-center overflow-hidden">
                                    <Avatar
                                      equippedAvatarId={currentUser.equipped_avatar_id}
                                      size="lg"
                                      className="!border-0 !shadow-none w-full h-full"
                                    />
                                  </div>
                                </div>

                                {/* Botón de editar avatar */}
                                <button
                                  onClick={() => onOpenAvatarModal && onOpenAvatarModal()}
                                  className="absolute -bottom-0.5 -right-0.5 w-7 h-7 bg-gray-900 border border-white/20 rounded-full flex items-center justify-center hover:bg-gray-800 hover:border-cyan-400/40 transition-all cursor-pointer group"
                                  aria-label={t("avatar.edit")}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white/50 group-hover:text-cyan-400 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                                  </svg>
                                </button>

                                {/* Soft reflection below */}
                                <div
                                  className="w-14 h-1 rounded-full mx-auto mt-1.5 blur-md opacity-40"
                                  style={{ background: tierHex }}
                                />
                              </div>

                              {/* Level display */}
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-xs font-extrabold tracking-[0.2em] uppercase text-white/25">LVL</span>
                                <span
                                  className="text-5xl font-black leading-none tracking-tight"
                                  style={{
                                    color: tierHex,
                                    textShadow: `0 0 20px ${tierHex}50`,
                                  }}
                                >
                                  {level}
                                </span>
                              </div>
                            </div>

                            {/* ── Divider ── */}
                            <div className="w-full h-px opacity-25" style={{ background: `linear-gradient(90deg, transparent, ${tierHex}, transparent)` }} />

                            {/* ── Player Info ── */}
                            <div className="flex flex-col items-center gap-2.5">

                              {/* Username */}
                              <p className="text-white font-black text-2xl tracking-wide">
                                {currentUser.username}
                              </p>

                              {/* Rank badge */}
                              <div
                                className="px-4 py-1.5 rounded-sm text-[11px] font-extrabold uppercase tracking-[0.25em]"
                                style={{
                                  color: tierHex,
                                  background: `linear-gradient(135deg, ${tierHex}12, ${tierHex}06)`,
                                  border: `1px solid ${tierHex}30`,
                                  textShadow: `0 0 6px ${tierHex}60`,
                                }}
                              >
                                {tierName}
                              </div>
                            </div>

                            {/* ── Divider ── */}
                            <div className="w-full h-px opacity-25" style={{ background: `linear-gradient(90deg, transparent, ${tierHex}, transparent)` }} />

                            {/* ── XP Progress ── */}
                            <div className="w-full flex flex-col gap-2">
                              {/* Header row */}
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-extrabold tracking-[0.18em] uppercase text-white/30">XP</span>
                                <span className="text-xs font-bold tabular-nums" style={{ color: `${tierHex}cc` }}>
                                  {xp.toLocaleString()} / {nextLevelXP.toLocaleString()}
                                </span>
                              </div>

                              {/* Progress bar */}
                              <div
                                className="relative w-full h-2.5 rounded-[2px] overflow-hidden"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)' }}
                              >
                                {/* Fill */}
                                <div
                                  className="cyber-plasma-bar h-full rounded-[1px] transition-all duration-700 ease-out"
                                  style={{
                                    width: `${progress}%`,
                                    background: `linear-gradient(90deg, ${tierHex}80, ${tierHex})`,
                                    boxShadow: `0 0 8px ${tierHex}60`,
                                  }}
                                />
                                {/* Segments */}
                                <div className="absolute inset-0 flex pointer-events-none">
                                  {[...Array(10)].map((_, i) => (
                                    <div key={i} className="flex-1 border-r border-black/30 last:border-r-0" />
                                  ))}
                                </div>
                              </div>

                              {/* Progress label */}
                              <p className="text-white/20 text-xs text-center font-semibold tracking-wider">
                                {Math.round(progress)}%
                              </p>
                            </div>

                            {/* ── Logout ── */}
                            <button
                              onClick={handleLogout}
                              className="group w-full mt-1 py-3 flex items-center justify-center gap-2 rounded-md border border-red-500/20 bg-red-500/[0.04] text-red-400/80 text-xs font-bold uppercase tracking-[0.12em] hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400 transition-all cursor-pointer"
                            >
                              <svg className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                                <path d="M12 2v6M18.36 6.64A9 9 0 1 1 5.64 6.64" />
                              </svg>
                              {t("auth.logout")}
                            </button>

                          </div>
                        );
                      })()
                    ) : (
                      /* === Formulario Login / Registro === */
                      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        {/* Username */}
                        <div>
                          <label className="block text-xs tracking-[0.15em] uppercase font-bold text-white/35 mb-1.5 ml-0.5">
                            {t("auth.username")}
                          </label>
                          <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            maxLength={30}
                            autoComplete="username"
                            placeholder={t("auth.username_ph")}
                            className="w-full px-4 py-3 rounded-md bg-white/[0.03] border border-white/[0.08] text-white placeholder-white/20 text-sm focus:outline-none focus:border-cyan-500/40 focus:shadow-[0_0_12px_rgba(34,211,238,0.08)] transition-all"
                          />
                        </div>

                        {/* Password */}
                        <div>
                          <label className="block text-xs tracking-[0.15em] uppercase font-bold text-white/35 mb-1.5 ml-0.5">
                            {t("auth.password")}
                          </label>
                          <div className="relative">
                            <input
                              type={showPassword ? "text" : "password"}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              autoComplete={view === "login" ? "current-password" : "new-password"}
                              placeholder="••••••••"
                              className="w-full px-4 py-3 pr-12 rounded-md bg-white/[0.03] border border-white/[0.08] text-white placeholder-white/20 text-sm focus:outline-none focus:border-cyan-500/40 focus:shadow-[0_0_12px_rgba(34,211,238,0.08)] transition-all"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors cursor-pointer"
                              aria-label={showPassword ? t("auth.hide_password") : t("auth.show_password")}
                            >
                              {showPassword ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                                </svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Confirm Password (register only) */}
                        {view === "register" && (
                          <div>
                            <label className="block text-xs tracking-[0.15em] uppercase font-bold text-white/35 mb-1.5 ml-0.5">
                              {t("auth.confirm_password")}
                            </label>
                            <div className="relative">
                              <input
                                type={showConfirmPassword ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                autoComplete="new-password"
                                placeholder="••••••••"
                                className="w-full px-4 py-3 pr-12 rounded-md bg-white/[0.03] border border-white/[0.08] text-white placeholder-white/20 text-sm focus:outline-none focus:border-cyan-500/40 focus:shadow-[0_0_12px_rgba(34,211,238,0.08)] transition-all"
                              />
                              <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors cursor-pointer"
                                aria-label={showConfirmPassword ? t("auth.hide_password") : t("auth.show_password")}
                              >
                                {showConfirmPassword ? (
                                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                                  </svg>
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                  </svg>
                                )}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Messages */}
                        {error && (
                          <p className="text-red-400 text-sm font-medium bg-red-500/10 border border-red-500/15 rounded-md px-3 py-2">
                            {error}
                          </p>
                        )}
                        {success && (
                          <p className="text-emerald-400 text-sm font-medium bg-emerald-500/10 border border-emerald-500/15 rounded-md px-3 py-2">
                            {success}
                          </p>
                        )}

                        {/* ⚠️ Password warning (register only) */}
                        {view === "register" && (
                          <div className="flex items-start gap-2.5 bg-amber-500/[0.06] border border-amber-500/15 rounded-md px-3.5 py-2.5">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                              <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.499-2.599 4.499H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.004zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                            </svg>
                            <p className="text-amber-300/80 text-sm leading-relaxed font-medium">
                              <span className="font-bold">{t("auth.dont_forget")}</span><br/>
                              {t("auth.no_recovery")}
                            </p>
                          </div>
                        )}

                        {/* Submit */}
                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full py-3.5 rounded-md bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm uppercase tracking-[0.12em] hover:shadow-[0_0_16px_rgba(34,211,238,0.25)] transition-all cursor-pointer"
                        >
                          {loading ? t("auth.connecting") : view === "login" ? t("auth.login") : t("auth.create_account")}
                        </button>

                        {/* Switch view link */}
                        {view === "login" ? (
                          <p className="text-white/30 text-xs text-center leading-relaxed tracking-wide">
                            {t("auth.no_account")}{" "}
                            <button
                              type="button"
                              onClick={() => switchView("register")}
                              className="text-cyan-400 hover:text-cyan-300 font-bold transition-colors cursor-pointer"
                            >
                              {t("auth.create_fast")}
                            </button>
                          </p>
                        ) : (
                          <p className="text-white/30 text-xs text-center leading-relaxed tracking-wide">
                            {t("auth.have_account")}{" "}
                            <button
                              type="button"
                              onClick={() => switchView("login")}
                              className="text-cyan-400 hover:text-cyan-300 font-bold transition-colors cursor-pointer"
                            >
                              {t("auth.go_login")}
                            </button>
                          </p>
                        )}
                      </form>
                    )}
                  </div>
                </div>
              );
            })()}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AuthModal;
