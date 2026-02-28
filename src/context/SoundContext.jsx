/**
 * SoundContext.jsx — Proveedor global de sonido + BGM
 *
 * Gestiona:
 *  - Estado ON/OFF del sonido (persistido en localStorage)
 *  - Por defecto MUTE hasta primera interacción del usuario
 *  - Toggle global accesible desde cualquier componente
 *  - Música de fondo (BGM) en bucle continuo a volumen bajo
 *    · Respeta el estado mute global
 *    · Maneja la política de autoplay del navegador
 *    · No se reinicia al cambiar de juego o abrir menús
 *
 * Exporta:
 *  - SoundProvider  — wrapper React
 *  - useSound()     — hook: { isMuted, toggleMute, setMuted }
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";

// ─── Constantes ──────────────────────────────────────────────────────────────

const SOUND_KEY = "scrollinn-sound-muted";
const BGM_SRC = "/sounds/bgm-loop.mp3";
const BGM_VOLUME = 0.10;

// ─── Helpers de localStorage ────────────────────────────────────────────────

function readStoredMute() {
  try {
    const raw = localStorage.getItem(SOUND_KEY);
    // Primera visita → null → sonido activado por defecto
    if (raw === null) return false;
    return raw === "true";
  } catch {
    return false;
  }
}

function writeMute(muted) {
  try {
    localStorage.setItem(SOUND_KEY, String(muted));
  } catch {
    /* modo privado — falla silenciosamente */
  }
}

// ─── BGM singleton (fuera de React para que nunca se recree) ────────────────

let _bgm = null;

/**
 * Devuelve la instancia única de Audio para la música de fondo.
 * Se crea lazy una sola vez; las llamadas posteriores devuelven la misma.
 */
function getBgm() {
  if (!_bgm) {
    _bgm = new Audio(BGM_SRC);
    _bgm.loop = true;
    _bgm.volume = BGM_VOLUME;
    _bgm.preload = "auto";
  }
  return _bgm;
}

// ─── Contexto ────────────────────────────────────────────────────────────────

const SoundContext = createContext(null);

export function SoundProvider({ children }) {
  const [isMuted, setIsMuted] = useState(readStoredMute);

  // Ref estable para que los event listeners lean siempre el valor actual
  const mutedRef = useRef(isMuted);
  mutedRef.current = isMuted;

  // ── BGM: intentar reproducir y registrar fallback de autoplay ──
  // Se ejecuta solo al montar el provider (una vez en toda la vida de la app)
  useEffect(() => {
    const bgm = getBgm();

    /**
     * Intenta reproducir la BGM si el sonido está habilitado.
     * Devuelve true si se consiguió play(), false si fue rechazado.
     */
    function tryPlay() {
      if (mutedRef.current) return false;
      const p = bgm.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {});       // silenciar DOMException de autoplay
      }
      return true;
    }

    // Intento inmediato (funcionará si el usuario ya interactuó antes)
    tryPlay();

    /**
     * Fallback: si el navegador bloqueó el autoplay, escuchamos la
     * primera interacción real del usuario (click / touch / tecla)
     * y arrancamos la música en ese momento.
     */
    function onFirstInteraction() {
      // Solo reproducir si no está muted en ese instante
      if (!mutedRef.current && bgm.paused) {
        bgm.play().catch(() => {});
      }
      // Limpiar todos los listeners — solo necesitamos uno
      INTERACTION_EVENTS.forEach((ev) =>
        document.removeEventListener(ev, onFirstInteraction, true)
      );
    }

    const INTERACTION_EVENTS = ["click", "touchstart", "keydown"];
    INTERACTION_EVENTS.forEach((ev) =>
      document.addEventListener(ev, onFirstInteraction, {
        capture: true,
        passive: true,
      })
    );

    // Cleanup al desmontar (prácticamente nunca ocurre, pero es buena práctica)
    return () => {
      INTERACTION_EVENTS.forEach((ev) =>
        document.removeEventListener(ev, onFirstInteraction, true)
      );
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reaccionar a cambios de mute → pausar / reanudar BGM ──
  useEffect(() => {
    const bgm = getBgm();
    if (isMuted) {
      bgm.pause();
    } else {
      // play() puede fallar si aún no hubo interacción; no pasa nada,
      // el listener de "primera interacción" lo recogerá después.
      bgm.play().catch(() => {});
    }
  }, [isMuted]);

  const setMuted = useCallback((val) => {
    const muted = typeof val === "function" ? val(isMuted) : val;
    setIsMuted(muted);
    writeMute(muted);
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      writeMute(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ isMuted, toggleMute, setMuted }),
    [isMuted, toggleMute, setMuted]
  );

  return (
    <SoundContext.Provider value={value}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error("useSound must be used within <SoundProvider>");
  return ctx;
}
