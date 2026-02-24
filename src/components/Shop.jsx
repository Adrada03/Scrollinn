/**
 * Shop.jsx — Tienda de avatares "Premium Esports"
 *
 * - Temporizador de rotación (próximo lunes 09:00 CET)
 * - Layout podio con tarjeta central destacada + glow
 * - Modal de inspección con avatar protagonista, tier dinámico, lore RPG
 * - Botón de compra único premium con degradado
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "../i18n";
import { getShopAvatars, purchaseAvatar } from "../services/avatarService";

/* ── Tier palette ── */
const TIER_COLORS = {
  rookie:    { hex: "#94a3b8", label_es: "Rookie",    label_en: "Rookie" },
  cyberpunk: { hex: "#22d3ee", label_es: "Cyberpunk", label_en: "Cyberpunk" },
  hacker:    { hex: "#d946ef", label_es: "Hacker",    label_en: "Hacker" },
  legend:    { hex: "#fbbf24", label_es: "Leyenda",   label_en: "Legend" },
};

const getAvatarImgSrc = (item) => {
  if (!item.image_url) return `/avatars/${item.id}.png`;
  if (item.image_url.startsWith("http") || item.image_url.startsWith("/"))
    return item.image_url;
  return `/avatars/${item.image_url}`;
};

/* ── Countdown: calcula ms hasta el próximo lunes 09:00 CET ── */
function msUntilNextMonday9CET() {
  const now = new Date();
  // Crear "ahora" en CET (UTC+1) — usamos offset fijo
  const cetOffset = 1; // CET = UTC+1
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const cetNow = new Date(utcMs + cetOffset * 3600000);

  // Próximo lunes
  const day = cetNow.getDay(); // 0=dom...6=sab
  let daysUntilMon = (1 - day + 7) % 7 || 7; // si es lunes, siguiente lunes

  // Si es lunes pero antes de las 09:00, es hoy
  if (day === 1 && (cetNow.getHours() < 9 || (cetNow.getHours() === 9 && cetNow.getMinutes() === 0 && cetNow.getSeconds() === 0))) {
    daysUntilMon = 0;
  }

  const target = new Date(cetNow);
  target.setDate(target.getDate() + daysUntilMon);
  target.setHours(9, 0, 0, 0);

  return Math.max(0, target.getTime() - cetNow.getTime());
}

function useCountdown() {
  const [remaining, setRemaining] = useState(msUntilNextMonday9CET);
  const rafRef = useRef(null);

  useEffect(() => {
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      setRemaining((prev) => {
        const next = prev - (now - last);
        last = now;
        return next <= 0 ? msUntilNextMonday9CET() : next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const totalSec = Math.floor(remaining / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");

  return { days, hours: pad(hours), mins: pad(mins), secs: pad(secs) };
}

/* ═══════════════════════════════════════════════════════════════════
   RotationTimer — HUD de cuenta atrás
   ═══════════════════════════════════════════════════════════════════ */
const RotationTimer = ({ t }) => {
  const { days, hours, mins, secs } = useCountdown();

  return (
    <div className="relative mx-auto w-full max-w-md rounded-lg overflow-hidden">
      {/* Fondo oscuro con borde brillante */}
      <div
        className="relative px-4 py-2.5 flex items-center justify-center gap-3 bg-black/50 backdrop-blur-md"
        style={{
          border: "1px solid rgba(139,92,246,0.3)",
          boxShadow: "0 0 20px rgba(139,92,246,0.12), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        {/* Línea top accent */}
        <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-violet-500/60 to-transparent" />

        {/* Icono reloj */}
        <svg className="w-4 h-4 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>

        <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-violet-300/80">
          {t("shop.rotation")}
        </span>

        {/* Dígitos */}
        <div className="flex items-center gap-1 font-mono">
          {days > 0 && (
            <>
              <span className="text-white font-black text-sm tabular-nums">{days}</span>
              <span className="text-violet-400/60 text-[10px] font-bold mr-1">{t("shop.days")}</span>
            </>
          )}
          <span className="text-white font-black text-sm tabular-nums">{hours}</span>
          <span className="text-violet-400/50 text-sm font-bold animate-pulse">:</span>
          <span className="text-white font-black text-sm tabular-nums">{mins}</span>
          <span className="text-violet-400/50 text-sm font-bold animate-pulse">:</span>
          <span className="text-white font-black text-sm tabular-nums">{secs}</span>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════   EpicTimer — Temporizador protagonista (solo móvil)
   ═════════════════════════════════════════════════════════════════ */
const EpicTimer = ({ t }) => {
  const { days, hours, mins, secs } = useCountdown();

  return (
    <div className="flex flex-col items-center justify-center">
      {/* Label */}
      <span className="text-slate-400 text-[10px] font-extrabold tracking-[0.25em] uppercase mb-1">
        {t("shop.rotation")}
      </span>

      {/* Digits */}
      <div className="flex items-baseline gap-1 font-mono">
        {days > 0 && (
          <>
            <span
              className="text-3xl font-black text-white tabular-nums"
              style={{ textShadow: "0 0 16px rgba(139,92,246,0.5), 0 0 40px rgba(139,92,246,0.2)" }}
            >
              {days}
            </span>
            <span className="text-violet-400/60 text-xs font-bold mr-2">{t("shop.days")}</span>
          </>
        )}
        <span
          className="text-3xl font-black text-white tabular-nums"
          style={{ textShadow: "0 0 16px rgba(139,92,246,0.5), 0 0 40px rgba(139,92,246,0.2)" }}
        >
          {hours}
        </span>
        <span className="text-violet-400 text-2xl font-bold animate-pulse">:</span>
        <span
          className="text-3xl font-black text-white tabular-nums"
          style={{ textShadow: "0 0 16px rgba(139,92,246,0.5), 0 0 40px rgba(139,92,246,0.2)" }}
        >
          {mins}
        </span>
        <span className="text-violet-400 text-2xl font-bold animate-pulse">:</span>
        <span
          className="text-3xl font-black text-white tabular-nums"
          style={{ textShadow: "0 0 16px rgba(139,92,246,0.5), 0 0 40px rgba(139,92,246,0.2)" }}
        >
          {secs}
        </span>
      </div>

      {/* Accent line */}
      <div className="w-28 h-px mt-2 bg-linear-to-r from-transparent via-violet-500/40 to-transparent" />
    </div>
  );
};

/* ═════════════════════════════════════════════════════════════════   HoldToConfirmButton — Botón «mantener para comprar»
   Se rellena de izquierda a derecha mientras el usuario mantiene
   pulsado. Si suelta antes de completar, se resetea.
   ═══════════════════════════════════════════════════════════════════ */
const HOLD_DURATION_MS = 1200; // 1.2 s para confirmar

const HoldToConfirmButton = ({ onConfirm, disabled, children }) => {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const startRef = useRef(null);
  const rafRef = useRef(null);

  const tick = useCallback(() => {
    if (!startRef.current) return;
    const elapsed = performance.now() - startRef.current;
    const pct = Math.min(elapsed / HOLD_DURATION_MS, 1);
    setProgress(pct);
    if (pct >= 1) {
      // Completado
      cancelAnimationFrame(rafRef.current);
      startRef.current = null;
      setHolding(false);
      setProgress(0);
      onConfirm();
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [onConfirm]);

  const startHold = useCallback(() => {
    if (disabled) return;
    startRef.current = performance.now();
    setHolding(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, tick]);

  const stopHold = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    startRef.current = null;
    setHolding(false);
    setProgress(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <button
      onPointerDown={startHold}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
      onContextMenu={(e) => e.preventDefault()}
      disabled={disabled}
      className="group/btn relative w-full py-3.5 rounded-lg font-extrabold text-sm uppercase tracking-[0.14em] text-white overflow-hidden transition-all duration-200 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed touch-none"
      style={{
        background: "linear-gradient(135deg, #10b981, #059669)",
        boxShadow: holding
          ? "0 0 35px rgba(16,185,129,0.5), inset 0 1px 0 rgba(255,255,255,0.2)"
          : "0 0 20px rgba(16,185,129,0.25), inset 0 1px 0 rgba(255,255,255,0.12)",
        border: "1px solid rgba(16,185,129,0.4)",
        transform: holding ? "scale(0.98)" : "scale(1)",
      }}
    >
      {/* Barra de progreso que se rellena de izquierda a derecha */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08))",
          width: `${progress * 100}%`,
          transition: progress === 0 ? "width 0.15s ease-out" : "none",
        }}
      />
      {/* Contenido del botón */}
      <span className="relative z-10">{children}</span>
    </button>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   ItemInspectModal — Modal premium de inspección
   ═══════════════════════════════════════════════════════════════════ */
const ItemInspectModal = ({ item, lang, t, coins, userId, onClose, onPurchaseSuccess }) => {
  const [purchasing, setPurchasing] = useState(false);
  const [justPurchased, setJustPurchased] = useState(false);

  if (!item) return null;

  const tierData = TIER_COLORS[item.tier] || TIER_COLORS.rookie;
  const tierHex = tierData.hex;
  const tierLabel = lang === "es" ? tierData.label_es : tierData.label_en;
  const name = (lang === "en" && item.name_en) ? item.name_en : item.name_es;
  const description = (lang === "en" && item.description_en)
    ? item.description_en
    : item.description_es;
  const price = item.price ?? 0;
  const isOwned = item.owned || justPurchased;
  const canAfford = (coins ?? 0) >= price;

  const handleBuy = async () => {
    if (!userId || isOwned || !canAfford) return;
    setPurchasing(true);
    const result = await purchaseAvatar(userId, item.id);
    setPurchasing(false);
    if (result.success) {
      setJustPurchased(true);
      onPurchaseSuccess(item.id, result.newCoins);
    }
  };

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-lg z-70"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 30, stiffness: 320 }}
        className="fixed inset-0 z-71 flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          className="w-full max-w-sm pointer-events-auto overflow-hidden relative"
          style={{
            background: "linear-gradient(175deg, #0c1222 0%, #050510 100%)",
            border: `1px solid ${tierHex}25`,
            borderRadius: "6px",
            clipPath:
              "polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px))",
          }}
        >
          {/* Top + bottom accent lines */}
          <div className="absolute top-0 left-2 right-2 h-px opacity-60" style={{ background: `linear-gradient(90deg, transparent, ${tierHex}, transparent)` }} />
          <div className="absolute bottom-0 left-2 right-2 h-px opacity-30" style={{ background: `linear-gradient(90deg, transparent, ${tierHex}, transparent)` }} />

          {/* Botón cerrar */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 w-7 h-7 flex items-center justify-center rounded-md bg-white/5 hover:bg-white/10 text-white/30 hover:text-white/60 text-xs transition-all cursor-pointer"
          >
            ✕
          </button>

          {/* Contenido */}
          <div className="px-6 pt-8 pb-2 flex flex-col items-center gap-5">
            {/* ── Avatar protagonista (más grande + radial glow) ── */}
            <div className="relative">
              {/* Glow radial detrás */}
              <div
                className="absolute inset-0 rounded-full blur-2xl opacity-40 scale-125"
                style={{ background: `radial-gradient(circle, ${tierHex}50, transparent 70%)` }}
              />
              <div
                className="relative w-36 h-36 rounded-full p-0.5"
                style={{
                  background: `conic-gradient(from 180deg, ${tierHex}, ${tierHex}30 40%, ${tierHex} 60%, ${tierHex}30)`,
                  boxShadow: `0 0 40px ${tierHex}30, 0 0 80px ${tierHex}10`,
                }}
              >
                <div className="w-full h-full rounded-full overflow-hidden bg-[#0a0f1e]">
                  <img
                    src={getAvatarImgSrc(item)}
                    alt={name}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                </div>
              </div>
              {/* Reflejo */}
              <div className="w-20 h-1 rounded-full mx-auto mt-3 blur-md opacity-40" style={{ background: tierHex }} />
            </div>

            {/* ── Nombre ── */}
            <h3 className="text-2xl font-black text-white tracking-wide text-center uppercase" style={{ textShadow: `0 0 20px ${tierHex}30` }}>
              {name}
            </h3>

            {/* ── Tier badge (colores dinámicos por tier) ── */}
            <div
              className="px-5 py-1.5 rounded text-[11px] font-black uppercase tracking-[0.3em]"
              style={{
                color: "#fff",
                background: `linear-gradient(135deg, ${tierHex}90, ${tierHex}60)`,
                boxShadow: `0 0 12px ${tierHex}40, inset 0 1px 0 rgba(255,255,255,0.15)`,
                textShadow: "0 1px 2px rgba(0,0,0,0.5)",
              }}
            >
              {tierLabel}
            </div>

            {/* ── Lore (estilo RPG) ── */}
            {description && (
              <div className="w-full flex flex-col gap-2">
                {/* Divider top */}
                <div className="h-px opacity-20" style={{ background: `linear-gradient(90deg, transparent, ${tierHex}, transparent)` }} />
                <p className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-white/25">
                  {t("avatar.lore")}
                </p>
                <p className="text-sm leading-relaxed text-slate-400 italic px-1">
                  &ldquo;{description}&rdquo;
                </p>
                {/* Divider bottom */}
                <div className="h-px opacity-20" style={{ background: `linear-gradient(90deg, transparent, ${tierHex}, transparent)` }} />
              </div>
            )}
          </div>

          {/* ── Botón de acción único (sin precio duplicado) ── */}
          <div className="px-6 pt-3 pb-5">
            {isOwned ? (
              <button
                disabled
                className="w-full py-3.5 rounded-lg bg-white/5 border border-white/10 text-white/30 font-bold text-sm uppercase tracking-[0.14em] cursor-not-allowed"
              >
                ✓ {t("shop.owned")}
              </button>
            ) : !userId ? (
              <button
                disabled
                className="w-full py-3.5 rounded-lg bg-white/5 border border-white/10 text-white/30 font-bold text-sm uppercase tracking-[0.14em] cursor-not-allowed"
              >
                {t("shop.login_required")}
              </button>
            ) : canAfford ? (
              <HoldToConfirmButton onConfirm={handleBuy} disabled={purchasing}>
                {purchasing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2.5">
                    <img src="/logo-moneda.png" alt="" className="w-5 h-5 drop-shadow" draggable={false} />
                    {t("shop.hold_to_buy")} — {price.toLocaleString()}
                  </span>
                )}
              </HoldToConfirmButton>
            ) : (
              <button
                disabled
                className="w-full py-3.5 rounded-lg bg-red-900/30 border border-red-500/20 text-red-400/60 font-bold text-sm uppercase tracking-[0.14em] cursor-not-allowed"
              >
                {t("shop.not_enough")}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   Shop — Componente principal "Premium Esports"
   ═══════════════════════════════════════════════════════════════════ */
const Shop = ({ coins = 0, currentUser, onCoinsChange }) => {
  const { lang, t } = useLanguage();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [localCoins, setLocalCoins] = useState(coins);

  useEffect(() => setLocalCoins(coins), [coins]);

  useEffect(() => {
    setLoading(true);
    getShopAvatars(currentUser?.id).then((result) => {
      if (result.success) setItems(result.data);
      setLoading(false);
    });
  }, [currentUser?.id]);

  const getAvatarName = (avatar) =>
    (lang === "en" && avatar.name_en) ? avatar.name_en : avatar.name_es;

  const getTierHex = (tier) => (TIER_COLORS[tier] || TIER_COLORS.rookie).hex;

  const { podiumItems, restItems, mobileItems } = useMemo(() => {
    if (items.length === 0) return { podiumItems: [], restItems: [], mobileItems: [] };
    const sorted = [...items].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    const top = sorted.slice(0, Math.min(3, sorted.length));
    const rest = sorted.slice(Math.min(3, sorted.length));
    let podium = [];
    if (top.length >= 3) podium = [top[1], top[0], top[2]];
    else if (top.length === 2) podium = [top[1], top[0]];
    else podium = [top[0]];
    return { podiumItems: podium, restItems: rest, mobileItems: sorted };
  }, [items]);

  const handlePurchaseSuccess = useCallback((avatarId, newCoins) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === avatarId ? { ...item, owned: true } : item
      )
    );
    setLocalCoins(newCoins);
    if (onCoinsChange) onCoinsChange(newCoins);
  }, [onCoinsChange]);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-slate-950/95 backdrop-blur-sm overflow-hidden">
      {/* ── HUD de monedas (solo escritorio) ── */}
      <div className="hidden md:flex relative justify-end md:absolute md:top-20 md:right-4 md:z-40 md:p-0 pointer-events-auto">
        <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-yellow-500/30 rounded-full px-4 py-2 shadow-lg shadow-yellow-500/10">
          <img src="/logo-moneda.png" alt={t("shop.coins")} className="w-8 h-8 drop-shadow-md" draggable={false} />
          <span className="text-yellow-400 font-bold text-lg tabular-nums tracking-wide drop-shadow-md">
            {localCoins.toLocaleString()}
          </span>
        </div>
      </div>

      {/* ═════ MOBILE LAYOUT — Escala al viewport, sin scroll ═════ */}
      <div className="md:hidden flex flex-col h-dvh w-full px-4 pt-16 pb-[2dvh] bg-[#0B0E17]">

        {/* ── 1. FILA DE MONEDAS ── */}
        <div className="shrink-0 w-full flex justify-end mb-[1.5dvh]">
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-yellow-500/30 rounded-full px-4 py-2 shadow-lg shadow-yellow-500/10">
            <img src="/logo-moneda.png" alt={t("shop.coins")} className="w-7 h-7 drop-shadow-md" draggable={false} />
            <span className="text-yellow-400 font-bold text-base tabular-nums tracking-wide drop-shadow-md">
              {localCoins.toLocaleString()}
            </span>
          </div>
        </div>

        {/* ── 2. FILA DEL TEMPORIZADOR ── */}
        <div className="shrink-0 flex flex-col items-center mb-[1.5dvh]">
          <EpicTimer t={t} />
        </div>

        {/* ── Separador "AVATARES" ── */}
        <div className="shrink-0 w-full border-b border-slate-700/50 pb-1.5 mb-[1dvh]">
          <span className="text-slate-500 text-xs font-bold tracking-widest uppercase">
            {t("shop.avatars_title")}
          </span>
        </div>

        {/* ── Tarjetas ── */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-7 h-7 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-4">
            <div className="w-16 h-16 rounded-2xl bg-white/3 border border-white/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
              </svg>
            </div>
            <p className="text-white/30 text-sm">{t("shop.empty")}</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-[1.5dvh] mt-[1.5dvh] min-h-0">

            {/* ═══ Fila 1 — DESTACADO (Hero card) ═══ */}
            {mobileItems[0] && (() => {
              const hero = mobileItems[0];
              const heroTierHex = getTierHex(hero.tier);
              const heroName = getAvatarName(hero);
              const heroPrice = hero.price ?? 0;
              const heroTierLabel = lang === "es"
                ? (TIER_COLORS[hero.tier] || TIER_COLORS.rookie).label_es
                : (TIER_COLORS[hero.tier] || TIER_COLORS.rookie).label_en;

              return (
                <motion.button
                  key={hero.id}
                  onClick={() => setSelectedItem(hero)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 26 }}
                  className="w-full shrink-0 relative flex flex-row items-center rounded-2xl cursor-pointer active:scale-[0.97] transition-transform duration-150 p-[3vw] overflow-hidden"
                  style={{
                    background: "linear-gradient(135deg, rgba(55,48,20,0.8), rgba(30,25,10,0.95))",
                    border: "2px solid rgba(251,191,36,0.7)",
                    boxShadow: "0 0 30px rgba(251,191,36,0.2), 0 0 60px rgba(251,191,36,0.08), inset 0 1px 0 rgba(255,255,255,0.08)",
                  }}
                >
                  {/* Glow ambiental top */}
                  <div
                    className="absolute top-0 left-4 right-4 h-px rounded-full"
                    style={{ background: "linear-gradient(90deg, transparent, rgba(250,204,21,0.5), transparent)" }}
                  />
                  {/* Glow ambiental bottom */}
                  <div
                    className="absolute bottom-0 left-4 right-4 h-px rounded-full"
                    style={{ background: "linear-gradient(90deg, transparent, rgba(250,204,21,0.2), transparent)" }}
                  />

                  {/* Owned badge */}
                  {hero.owned && (
                    <div
                      className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full flex items-center justify-center"
                      style={{
                        background: "linear-gradient(135deg, #22c55e, #16a34a)",
                        boxShadow: "0 0 12px rgba(34,197,94,0.5), 0 2px 4px rgba(0,0,0,0.3)",
                      }}
                    >
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                  )}

                  {/* ── Lado Izquierdo: Avatar Grande ── */}
                  <div className="relative shrink-0">
                    <div
                      className="absolute inset-0 rounded-xl blur-2xl opacity-50 scale-150"
                      style={{ background: `radial-gradient(circle, ${heroTierHex}, transparent 70%)` }}
                    />
                    <div
                      className="relative rounded-xl p-0.5 overflow-hidden"
                      style={{
                        width: "min(22vw, 12dvh)",
                        height: "min(22vw, 12dvh)",
                        background: "conic-gradient(from 180deg, #fbbf24, #92400e 40%, #fbbf24 60%, #92400e)",
                        boxShadow: "0 0 30px rgba(250,204,21,0.4), 0 0 60px rgba(250,204,21,0.12)",
                      }}
                    >
                      <div className="w-full h-full rounded-[10px] overflow-hidden bg-[#0a0f1e]">
                        <img
                          src={getAvatarImgSrc(hero)}
                          alt={heroName}
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── Lado Derecho: Info + Botón ── */}
                  <div className="flex flex-col flex-1 pl-5 justify-center gap-2">
                    {/* Nombre */}
                    <span
                      className="text-lg font-black text-white text-left line-clamp-1 leading-tight uppercase"
                      style={{ textShadow: "0 0 16px rgba(250,204,21,0.3)" }}
                    >
                      {heroName}
                    </span>

                    {/* Tier badge */}
                    <span
                      className="text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded w-fit"
                      style={{
                        color: "#fbbf24",
                        background: "rgba(250,204,21,0.12)",
                        border: "1px solid rgba(250,204,21,0.35)",
                        textShadow: "0 0 6px rgba(250,204,21,0.3)",
                      }}
                    >
                      {heroTierLabel}
                    </span>

                    {/* Botón de compra */}
                    <div
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl mt-1"
                      style={{
                        background: hero.owned
                          ? "linear-gradient(135deg, rgba(51,65,85,0.6), rgba(30,41,59,0.8))"
                          : "linear-gradient(135deg, #f59e0b, #d97706)",
                        boxShadow: hero.owned
                          ? "inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 6px rgba(0,0,0,0.2)"
                          : "0 0 20px rgba(245,158,11,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
                        border: hero.owned ? "1px solid rgba(71,85,105,0.5)" : "none",
                      }}
                    >
                      {hero.owned ? (
                        <span className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                          </svg>
                          <span className="text-slate-300 text-xs font-bold uppercase tracking-wider">
                            {t("shop.owned")}
                          </span>
                        </span>
                      ) : (
                        <>
                          <img src="/logo-moneda.png" alt="" className="w-5 h-5" draggable={false} />
                          <span className="text-black text-sm font-extrabold tabular-nums">
                            {heroPrice.toLocaleString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })()}

            {/* ═══ Fila 2 — Grid 2 columnas (normales) ═══ */}
            {mobileItems.length > 1 && (
              <div className="flex-1 grid grid-cols-2 gap-[1.5dvh] min-h-0 overflow-hidden">
                {mobileItems.slice(1, 3).map((item, idx) => {
                  const tierHex = getTierHex(item.tier);
                  const name = getAvatarName(item);
                  const price = item.price ?? 0;
                  const tierLabel = lang === "es"
                    ? (TIER_COLORS[item.tier] || TIER_COLORS.rookie).label_es
                    : (TIER_COLORS[item.tier] || TIER_COLORS.rookie).label_en;

                  return (
                    <motion.button
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + idx * 0.08, type: "spring", stiffness: 300, damping: 26 }}
                      className="relative flex flex-col items-center justify-center gap-[0.8dvh] rounded-2xl cursor-pointer active:scale-[0.97] transition-transform duration-150 p-[2.5vw] overflow-hidden"
                      style={{
                        background: "linear-gradient(175deg, rgba(30,41,59,0.9), rgba(15,23,42,0.95))",
                        border: `1px solid ${tierHex}40`,
                        boxShadow: `0 0 18px ${tierHex}10, 0 4px 20px rgba(0,0,0,0.3)`,
                      }}
                    >
                      {/* Top accent */}
                      <div
                        className="absolute top-0 left-3 right-3 h-px rounded-full"
                        style={{ background: `linear-gradient(90deg, transparent, ${tierHex}50, transparent)` }}
                      />

                      {/* Owned badge */}
                      {item.owned && (
                        <div
                          className="absolute top-2.5 right-2.5 z-10 w-6 h-6 rounded-full flex items-center justify-center"
                          style={{
                            background: "linear-gradient(135deg, #22c55e, #16a34a)",
                            boxShadow: "0 0 10px rgba(34,197,94,0.4), 0 2px 4px rgba(0,0,0,0.3)",
                          }}
                        >
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </div>
                      )}

                      {/* Avatar centrado */}
                      <div className="relative">
                        <div
                          className="absolute inset-0 rounded-full blur-xl opacity-25 scale-130"
                          style={{ background: `radial-gradient(circle, ${tierHex}, transparent 70%)` }}
                        />
                        <div
                          className="relative rounded-full p-0.5 overflow-hidden"
                          style={{
                            width: "min(24vw, 12dvh)",
                            height: "min(24vw, 12dvh)",
                            background: `conic-gradient(from 180deg, ${tierHex}, ${tierHex}30 40%, ${tierHex} 60%, ${tierHex}30)`,
                            boxShadow: `0 0 16px ${tierHex}20`,
                          }}
                        >
                          <div className="w-full h-full rounded-full overflow-hidden bg-[#0a0f1e]">
                            <img
                              src={getAvatarImgSrc(item)}
                              alt={name}
                              className="w-full h-full object-cover"
                              draggable={false}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Nombre */}
                      <span className="text-sm font-extrabold text-white text-center line-clamp-1 leading-tight">
                        {name}
                      </span>

                      {/* Tier badge */}
                      <span
                        className="text-[9px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded-full"
                        style={{
                          color: tierHex,
                          background: `${tierHex}12`,
                          border: `1px solid ${tierHex}30`,
                        }}
                      >
                        {tierLabel}
                      </span>

                      {/* Botón de compra */}
                      <div
                        className="flex items-center justify-center gap-2 w-full py-[1dvh] rounded-xl"
                        style={{
                          background: item.owned
                            ? "linear-gradient(135deg, rgba(51,65,85,0.6), rgba(30,41,59,0.8))"
                            : "linear-gradient(135deg, #10b981, #059669)",
                          boxShadow: item.owned
                            ? "inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 6px rgba(0,0,0,0.2)"
                            : "0 0 12px rgba(16,185,129,0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
                          border: item.owned ? "1px solid rgba(71,85,105,0.5)" : "none",
                        }}
                      >
                        {item.owned ? (
                          <span className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                            <span className="text-slate-300 text-[11px] font-bold uppercase tracking-wider">
                              {t("shop.owned")}
                            </span>
                          </span>
                        ) : (
                          <>
                            <img src="/logo-moneda.png" alt="" className="w-4 h-4" draggable={false} />
                            <span className="text-white text-sm font-extrabold tabular-nums">
                              {price.toLocaleString()}
                            </span>
                          </>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}

          </div>
        )}

        {/* ═══ Footer marca de agua ═══ */}
        <div className="shrink-0 mt-[2dvh] flex flex-col items-center justify-center">
          <div className="w-12 h-px bg-slate-700 mb-2" />
          <img
            src="/logo.png"
            alt="ARCADE"
            className="h-6 opacity-30 mb-0.5 grayscale"
            draggable={false}
          />
          <span className="text-slate-600 font-black tracking-[0.3em] uppercase text-sm">
            ARCADE
          </span>
          <span className="text-[9px] text-slate-500 font-medium tracking-wider mt-1">
            {lang === "es" ? "NUEVOS COSMÉTICOS CADA SEMANA" : "NEW COSMETICS EVERY WEEK"}
          </span>
        </div>

      </div>

      {/* ═════ DESKTOP LAYOUT (scrollable) ═════ */}
      <div className="hidden md:flex md:flex-col flex-1 overflow-y-auto pt-24 pb-10 px-4">
        {/* Temporizador de rotación */}
        <div className="mb-5 shrink-0">
          <RotationTimer t={t} />
        </div>

        {/* Título de sección */}
        <div className="flex items-center gap-2.5 mb-5 ml-1 shrink-0">
          <h2 className="text-xs font-extrabold tracking-[0.18em] uppercase text-white/50">
            {t("shop.avatars_title")}
          </h2>
          <div className="flex-1 h-px bg-white/6" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-white/3 border border-white/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
              </svg>
            </div>
            <p className="text-white/30 text-sm">{t("shop.empty")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">

            {/* ─ Podio top 3 ─ */}
            <div
              className="flex items-end justify-center gap-3"
              style={{ minHeight: podiumItems.length > 1 ? "310px" : "240px" }}
            >
              {podiumItems.map((item, idx) => {
                const tierHex = getTierHex(item.tier);
                const name = getAvatarName(item);
                const price = item.price ?? 0;
                const isCenter =
                  podiumItems.length === 1
                    ? true
                    : podiumItems.length === 2
                    ? idx === 1
                    : idx === 1;

                // Tamaños dinámicos: centro mucho más grande
                const imgSize = isCenter ? "w-32 h-32" : "w-22 h-22";
                const ringSize = isCenter ? "w-36 h-36" : "w-26 h-26";
                const cardPad = isCenter ? "px-6 pt-7 pb-5" : "px-3.5 pt-5 pb-4";
                const nameSz = isCenter ? "text-sm" : "text-[11px]";
                const priceSz = isCenter ? "text-sm" : "text-[11px]";
                const coinSz = isCenter ? "w-5 h-5" : "w-4 h-4";
                const liftClass = isCenter ? "mb-8" : "mb-0";

                return (
                  <motion.button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    whileHover={{ scale: 1.06, y: -8 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className={`group relative flex flex-col items-center gap-3 ${cardPad} ${liftClass} rounded-xl transition-colors duration-300 cursor-pointer`}
                    style={{
                      background: isCenter
                        ? `linear-gradient(175deg, ${tierHex}08 0%, transparent 60%)`
                        : "rgba(255,255,255,0.02)",
                      border: `1px solid ${isCenter ? tierHex + "30" : "rgba(255,255,255,0.08)"}`,
                      boxShadow: isCenter
                        ? `0 0 40px ${tierHex}15, 0 8px 32px ${tierHex}08`
                        : "none",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = `0 4px 35px ${tierHex}35, 0 0 70px ${tierHex}15`;
                      e.currentTarget.style.borderColor = `${tierHex}50`;
                      e.currentTarget.style.background = `linear-gradient(175deg, ${tierHex}12 0%, transparent 60%)`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = isCenter
                        ? `0 0 40px ${tierHex}15, 0 8px 32px ${tierHex}08`
                        : "none";
                      e.currentTarget.style.borderColor = isCenter ? `${tierHex}30` : "rgba(255,255,255,0.08)";
                      e.currentTarget.style.background = isCenter
                        ? `linear-gradient(175deg, ${tierHex}08 0%, transparent 60%)`
                        : "rgba(255,255,255,0.02)";
                    }}
                  >
                    {/* Owned badge */}
                    {item.owned && (
                      <div
                        className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full flex items-center justify-center shadow-md"
                        style={{ background: tierHex }}
                      >
                        <svg className="w-3.5 h-3.5 text-black" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </div>
                    )}

                    {/* Crown para el #1 */}
                    {isCenter && (
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-yellow-400 drop-shadow-lg">
                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
                        </svg>
                      </div>
                    )}

                    {/* Avatar con ring + glow para centro */}
                    <div className="relative">
                      {isCenter && (
                        <div
                          className="absolute inset-0 rounded-full blur-xl opacity-30 scale-150"
                          style={{ background: `radial-gradient(circle, ${tierHex}, transparent 70%)` }}
                        />
                      )}
                      <div
                        className={`relative ${ringSize} rounded-full p-0.5 shrink-0 transition-shadow duration-300`}
                        style={{
                          background: `conic-gradient(from 180deg, ${tierHex}, ${tierHex}30 40%, ${tierHex} 60%, ${tierHex}30)`,
                        }}
                      >
                        <div className="w-full h-full rounded-full overflow-hidden bg-[#0a0f1e]">
                          <img
                            src={getAvatarImgSrc(item)}
                            alt={name}
                            className={`${imgSize} min-w-full min-h-full object-cover`}
                            draggable={false}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Nombre — más grande, negrita, claro */}
                    <span
                      className={`${nameSz} font-black uppercase tracking-wider text-center leading-tight line-clamp-2 text-slate-200`}
                    >
                      {name}
                    </span>

                    {/* Tier mini badge (solo centro) */}
                    {isCenter && (
                      <span
                        className="text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded"
                        style={{
                          color: "#fff",
                          background: `linear-gradient(135deg, ${tierHex}80, ${tierHex}50)`,
                          boxShadow: `0 0 8px ${tierHex}30`,
                          textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                        }}
                      >
                        {lang === "es"
                          ? (TIER_COLORS[item.tier] || TIER_COLORS.rookie).label_es
                          : (TIER_COLORS[item.tier] || TIER_COLORS.rookie).label_en}
                      </span>
                    )}

                    {/* Precio */}
                    <div className="flex items-center gap-1.5 bg-black/50 rounded-full px-3.5 py-1.5 border border-yellow-500/15">
                      <img src="/logo-moneda.png" alt="" className={coinSz} draggable={false} />
                      <span className={`text-yellow-400 ${priceSz} font-bold tabular-nums`}>
                        {price.toLocaleString()}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* ─ Resto de items ─ */}
            {restItems.length > 0 && (
              <>
                <div className="flex items-center gap-2.5 ml-1">
                  <div className="flex-1 h-px bg-white/6" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {restItems.map((item) => {
                    const tierHex = getTierHex(item.tier);
                    const name = getAvatarName(item);
                    const price = item.price ?? 0;

                    return (
                      <motion.button
                        key={item.id}
                        onClick={() => setSelectedItem(item)}
                        whileHover={{ scale: 1.04, y: -4 }}
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        className="group relative flex flex-col items-center gap-2.5 p-4 rounded-xl border border-white/8 bg-white/2 transition-colors duration-300 cursor-pointer"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.boxShadow = `0 4px 24px ${tierHex}25, 0 0 40px ${tierHex}10`;
                          e.currentTarget.style.borderColor = `${tierHex}40`;
                          e.currentTarget.style.background = `linear-gradient(175deg, ${tierHex}08 0%, transparent 60%)`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.boxShadow = "none";
                          e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                          e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                        }}
                      >
                        {/* Owned badge */}
                        {item.owned && (
                          <div
                            className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ background: tierHex }}
                          >
                            <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          </div>
                        )}

                        {/* Avatar */}
                        <div
                          className="w-22 h-22 rounded-full p-0.5 shrink-0"
                          style={{
                            background: `conic-gradient(from 180deg, ${tierHex}, ${tierHex}30 40%, ${tierHex} 60%, ${tierHex}30)`,
                          }}
                        >
                          <div className="w-full h-full rounded-full overflow-hidden bg-[#0a0f1e]">
                            <img
                              src={getAvatarImgSrc(item)}
                              alt={name}
                              className="w-full h-full object-cover"
                              draggable={false}
                            />
                          </div>
                        </div>

                        {/* Nombre — negrita, claro */}
                        <span className="text-[11px] font-black uppercase tracking-wider text-center leading-tight line-clamp-2 text-slate-200">
                          {name}
                        </span>

                        {/* Precio */}
                        <div className="flex items-center gap-1.5 bg-black/50 rounded-full px-3 py-1 border border-yellow-500/15">
                          <img src="/logo-moneda.png" alt="" className="w-4 h-4" draggable={false} />
                          <span className="text-yellow-400 text-[11px] font-bold tabular-nums">
                            {price.toLocaleString()}
                          </span>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Modal de inspección ── */}
      <AnimatePresence>
        {selectedItem && (
          <ItemInspectModal
            item={selectedItem}
            lang={lang}
            t={t}
            coins={localCoins}
            userId={currentUser?.id}
            onClose={() => setSelectedItem(null)}
            onPurchaseSuccess={handlePurchaseSuccess}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Shop;
