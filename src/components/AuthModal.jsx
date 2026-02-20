/**
 * AuthModal.jsx — Modal de registro / login
 *
 * Campo de usuario + contraseña.
 * Si el usuario existe → verifica contraseña (login).
 * Si no existe → crea cuenta nueva.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const AuthModal = ({ isOpen, onClose, onAuthSuccess, currentUser }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!username.trim() || !password.trim()) {
      setError("Rellena ambos campos.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!data.ok) {
        setError(data.error);
        setLoading(false);
        return;
      }

      // Éxito
      const msg =
        data.action === "registered"
          ? `¡Cuenta creada! Bienvenido, ${data.user.username} 🎉`
          : `¡Hola de nuevo, ${data.user.username}! 👋`;

      setSuccess(msg);
      onAuthSuccess(data.user);

      // Cerrar el modal tras un momento
      setTimeout(() => {
        setUsername("");
        setPassword("");
        setError("");
        setSuccess("");
        onClose();
      }, 1500);
    } catch {
      setError("No se pudo conectar con el servidor.");
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
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-40"
            onClick={onClose}
          />

          {/* Modal centrado */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="w-full max-w-sm bg-gray-950/95 backdrop-blur-xl rounded-3xl flex flex-col border border-white/10 shadow-2xl pointer-events-auto overflow-hidden">
              {/* Handle decorativo */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-white/20 rounded-full" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-2">
                <h2 className="text-base font-bold text-white">
                  {currentUser ? "Tu cuenta" : "Entrar / Registrarse"}
                </h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 text-sm transition-colors cursor-pointer"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>

              {/* Contenido */}
              <div className="px-5 pb-6 pt-2">
                {currentUser ? (
                  /* === Ya logueado === */
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                    </div>
                    <p className="text-white font-semibold text-lg">{currentUser.username}</p>
                    <button
                      onClick={handleLogout}
                      className="w-full py-3 rounded-xl bg-red-500/20 border border-red-400/30 text-red-400 font-semibold text-sm hover:bg-red-500/30 transition-colors cursor-pointer"
                    >
                      Cerrar sesión
                    </button>
                  </div>
                ) : (
                  /* === Formulario === */
                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                      <label className="block text-white/60 text-xs font-medium mb-1.5 ml-1">
                        Nombre de usuario
                      </label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        maxLength={30}
                        autoComplete="username"
                        placeholder="Tu nombre..."
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-white/60 text-xs font-medium mb-1.5 ml-1">
                        Contraseña
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                      />
                    </div>

                    {/* Mensajes */}
                    {error && (
                      <p className="text-red-400 text-xs font-medium bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                        {error}
                      </p>
                    )}
                    {success && (
                      <p className="text-emerald-400 text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                        {success}
                      </p>
                    )}

                    {/* ⚠️ Aviso contraseña */}
                    <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3.5 py-2.5">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.499-2.599 4.499H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.004zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                      </svg>
                      <p className="text-amber-300/90 text-xs leading-relaxed font-medium">
                        <span className="font-bold">¡No olvides tu contraseña!</span><br/>
                        No hay forma de recuperarla. Si la pierdes, no podrás volver a acceder a tu cuenta.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors cursor-pointer"
                    >
                      {loading ? "Conectando..." : "Continuar"}
                    </button>

                    <p className="text-white/40 text-xs text-center leading-relaxed">
                      Si no tienes cuenta, se creará una automáticamente.
                    </p>
                  </form>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AuthModal;
