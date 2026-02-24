/**
 * Avatar.jsx — Componente reutilizable de Avatar dinámico
 *
 * Props:
 *   equippedAvatarId (string|null) — ID del avatar equipado ('none' o null = genérico)
 *   size             (string)      — 'sm' | 'md' | 'lg' (por defecto 'md')
 *   tierHex          (string|null) — Color hex del tier para borde/resplandor
 *   className        (string)      — Clases extra opcionales
 */

import { useState, useEffect } from "react";
import { User } from "lucide-react";
import { getAvatarImageUrl, getAvatarImageUrlSync } from "../services/avatarService";

const SIZES = {
  sm: { container: "w-8 h-8", icon: "w-4 h-4", ring: 1 },
  md: { container: "w-13 h-13", icon: "w-7 h-7", ring: 2 },
  lg: { container: "w-[88px] h-[88px]", icon: "w-10 h-10", ring: 2 },
};

const Avatar = ({ equippedAvatarId, size = "md", tierHex = null, className = "" }) => {
  const s = SIZES[size] || SIZES.md;
  const hasAvatar = equippedAvatarId && equippedAvatarId !== "none";

  // Intentar resolución síncrona primero (cache ya cargada)
  const [src, setSrc] = useState(() =>
    hasAvatar ? getAvatarImageUrlSync(equippedAvatarId) : null
  );

  useEffect(() => {
    if (!hasAvatar) { setSrc(null); return; }
    // Si la cache síncrona ya resolvió, no hacer nada
    const syncUrl = getAvatarImageUrlSync(equippedAvatarId);
    if (syncUrl) { setSrc(syncUrl); return; }
    // Si no, esperar a la versión async
    let cancelled = false;
    getAvatarImageUrl(equippedAvatarId).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => { cancelled = true; };
  }, [equippedAvatarId, hasAvatar]);

  // Estilos de borde/resplandor basados en el tier
  const ringStyle = tierHex
    ? {
        boxShadow: `0 0 ${s.ring === 1 ? 8 : 16}px ${tierHex}40, 0 0 ${s.ring === 1 ? 4 : 8}px ${tierHex}20`,
        border: `${s.ring}px solid ${tierHex}60`,
      }
    : {};

  if (hasAvatar && src) {
    return (
      <div
        className={`${s.container} rounded-full overflow-hidden shrink-0 ${className}`}
        style={ringStyle}
      >
        <img
          src={src}
          alt="Avatar"
          className="w-full h-full object-cover"
          draggable={false}
        />
      </div>
    );
  }

  // Avatar genérico
  return (
    <div
      className={`${s.container} rounded-full flex items-center justify-center shrink-0
        bg-gray-800/80 border border-white/10 ${className}`}
      style={tierHex ? ringStyle : {}}
    >
      <User
        className={`${s.icon} ${tierHex ? "" : "text-white/50"}`}
        style={tierHex ? { color: `${tierHex}90` } : {}}
        strokeWidth={1.8}
      />
    </div>
  );
};

export default Avatar;
