/**
 * ClearModeWrapper — Capa superior global para Clear Mode (Pinch-to-zoom)
 *
 * ARQUITECTURA: Desacopla completamente la detección del zoom de los
 * juegos individuales. Este componente vive en lo más alto del Feed y es el
 * ÚNICO responsable de escuchar eventos táctiles para el pinch-to-zoom.
 *
 * Principio fundamental: TRANSPARENCIA TOTAL para toques de 1 dedo.
 * El wrapper NUNCA intercepta, retrasa ni re-despacha toques de un solo
 * dedo. Solo actúa cuando detecta 2+ dedos (pinch).
 *
 * Props:
 *  - activeIndex:     índice del slide activo en el feed
 *  - scrollLockedRef: ref { current: boolean } — true cuando gameplay bloquea scroll
 *  - disabled:        booleano — deshabilita el pinch (ej. modal abierto)
 *  - children:        React children (el feed scroll container)
 *
 * Estado interno:
 *  - isZooming:  true mientras se está haciendo pinch
 *  - isUiHidden: true después de un pinch exitoso (escala > umbral)
 *  - scale:      useMotionValue para animación suave con Framer Motion
 *
 * Reseteo nuclear: nuclearReset() restaura TODO al estado virginal.
 * Se ejecuta automáticamente:
 *  - Al cambiar de slide (activeIndex)
 *  - Al pulsar el botón "X"
 *
 * Provee via ClearModeContext:
 *  - isUiHidden, scaleMotion, pinchGuardRef, nuclearReset
 *
 * ⚠️ touch-action: pan-y en el contenedor permite scroll vertical nativo
 *    pero reserva el pinch para nuestro JS. No usar 'manipulation' porque
 *    el navegador reclama el pinch y no envía touchmove a JS.
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useMotionValue, animate } from "framer-motion";
import ClearModeContext from "../context/ClearModeContext";

/* ── Constantes ── */
const CLEAR_THRESHOLD = 1.2;        // escala mínima para activar modo limpio
const SPRING_CONFIG = { type: "spring", stiffness: 300, damping: 25 };
const POST_PINCH_COOLDOWN = 200;    // ms bloqueando touches post-pinch

export default function ClearModeWrapper({
  activeIndex,
  scrollLockedRef,
  disabled = false,
  children,
}) {
  /* ═══════════════════════════════════════════════════════
     Estado y refs
     ═══════════════════════════════════════════════════════ */
  const wrapperRef = useRef(null);
  const scale = useMotionValue(1);
  const [isZooming, setIsZooming] = useState(false);
  const [isUiHidden, setIsUiHidden] = useState(false);

  // Refs reactivos para lectura dentro de listeners nativos
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  // Pinch state refs
  const initialDistRef = useRef(null);
  const didExceedRef = useRef(false);
  const isPinchingRef = useRef(false);

  // Cooldown post-pinch
  const cooldownRef = useRef(false);
  const cooldownTimerRef = useRef(null);

  /* ═══════════════════════════════════════════════════════
     Pinch Guard — ref compuesto para que los juegos
     verifiquen si hay pinch activo o cooldown.
     Uso en juegos: if (pinchGuardRef.current) return;
     ═══════════════════════════════════════════════════════ */
  const pinchGuardRef = useMemo(() => ({
    get current() {
      return isPinchingRef.current || cooldownRef.current;
    },
  }), []);

  /* ═══════════════════════════════════════════════════════
     Utilidades internas
     ═══════════════════════════════════════════════════════ */
  const getDistance = (t0, t1) =>
    Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);

  /** Activar cooldown post-pinch para bloquear falsos taps */
  const startCooldown = useCallback(() => {
    cooldownRef.current = true;
    clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => {
      cooldownRef.current = false;
    }, POST_PINCH_COOLDOWN);
  }, []);

  /* ═══════════════════════════════════════════════════════
     NUCLEAR RESET — restaura todo al estado virgen
     ═══════════════════════════════════════════════════════ */
  const nuclearReset = useCallback(() => {
    setIsUiHidden(false);
    setIsZooming(false);
    scale.jump(1);
    initialDistRef.current = null;
    didExceedRef.current = false;
    isPinchingRef.current = false;
    clearTimeout(cooldownTimerRef.current);
    cooldownRef.current = false;
  }, [scale]);

  /* ═══════════════════════════════════════════════════════
     Auto-reset al cambiar de slide
     ═══════════════════════════════════════════════════════ */
  useEffect(() => {
    nuclearReset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  /* ═══════════════════════════════════════════════════════
     TOUCH EVENT LISTENERS — captura en el wrapper estable
     
     PRINCIPIO CLAVE: TRANSPARENCIA TOTAL para 1 dedo.
     
     Nunca interceptamos, retrasamos ni re-despachamos toques
     de un solo dedo. Esto elimina por completo los ghost clicks.
     Solo actuamos al detectar 2+ dedos (pinch).
     
     Los listeners se registran UNA sola vez en wrapperRef
     (nodo DOM estable). No dependen de activeIndex.
     ═══════════════════════════════════════════════════════ */
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    /* ─── TOUCHSTART (capture) ─── */
    const handleTouchStart = (e) => {
      // Post-pinch cooldown: bloquear touches residuales del dedo que queda
      if (cooldownRef.current) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      // 1 dedo → TRANSPARENCIA TOTAL. No interceptar NUNCA.
      // El toque fluye directamente al juego sin ninguna interferencia.
      if (e.touches.length < 2) return;

      // 2+ dedos → iniciar pinch
      if (disabledRef.current) return;

      e.stopPropagation();
      // preventDefault en touchstart con 2 dedos previene que el navegador
      // inicie su propio gesto de zoom Y evita que genere clicks de accesibilidad
      e.preventDefault();

      isPinchingRef.current = true;
      setIsZooming(true);
      didExceedRef.current = false;
      initialDistRef.current = getDistance(e.touches[0], e.touches[1]);
    };

    /* ─── TOUCHMOVE (capture) ─── */
    const handleTouchMove = (e) => {
      // Durante cooldown, bloquear moves residuales
      if (cooldownRef.current) {
        if (e.touches.length > 1) {
          e.stopPropagation();
          e.preventDefault();
        }
        return;
      }

      // Solo actuar si estamos en pinch activo con 2 dedos
      if (!isPinchingRef.current || e.touches.length !== 2) return;

      e.stopPropagation();
      e.preventDefault(); // bloquear zoom nativo del navegador

      const currentDist = getDistance(e.touches[0], e.touches[1]);
      const ratio = currentDist / initialDistRef.current;
      const clamped = Math.max(1, ratio);

      scale.set(clamped);

      if (clamped >= CLEAR_THRESHOLD) {
        didExceedRef.current = true;
      }
    };

    /* ─── TOUCHEND (capture) ─── */
    const handleTouchEnd = (e) => {
      // Post-pinch cooldown: bloquear touchends residuales
      if (cooldownRef.current) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      // Solo actuar si estábamos haciendo pinch
      if (!isPinchingRef.current) return;

      // Quedan < 2 dedos → pinch terminó
      if (e.touches.length < 2) {
        e.stopPropagation();
        e.preventDefault(); // evitar click de accesibilidad del dedo que se levanta
        isPinchingRef.current = false;
        setIsZooming(false);

        // Animar la escala de vuelta a 1 con spring
        animate(scale, 1, SPRING_CONFIG);

        if (didExceedRef.current) {
          setIsUiHidden(true);
        }

        initialDistRef.current = null;
        didExceedRef.current = false;

        // Cooldown para bloquear el "falso tap" del dedo restante
        startCooldown();
      }
    };

    /* ─── TOUCHCANCEL (capture) — limpieza de emergencia ─── */
    const handleTouchCancel = () => {
      if (isPinchingRef.current) {
        isPinchingRef.current = false;
        setIsZooming(false);
        scale.jump(1);
        startCooldown();
      }
    };

    // Registrar en CAPTURE + passive:false para poder preventDefault
    const opts = { capture: true, passive: false };
    el.addEventListener("touchstart", handleTouchStart, opts);
    el.addEventListener("touchmove", handleTouchMove, opts);
    el.addEventListener("touchend", handleTouchEnd, opts);
    el.addEventListener("touchcancel", handleTouchCancel, opts);

    return () => {
      el.removeEventListener("touchstart", handleTouchStart, opts);
      el.removeEventListener("touchmove", handleTouchMove, opts);
      el.removeEventListener("touchend", handleTouchEnd, opts);
      el.removeEventListener("touchcancel", handleTouchCancel, opts);
      clearTimeout(cooldownTimerRef.current);
      cooldownRef.current = false;
      isPinchingRef.current = false;
    };
    // SIN activeIndex en deps → listeners estables en un nodo DOM que no cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, startCooldown]);

  /* ═══════════════════════════════════════════════════════
     Context value (memoizado)
     ═══════════════════════════════════════════════════════ */
  const contextValue = useMemo(() => ({
    isUiHidden,
    scaleMotion: scale,
    pinchGuardRef,
    nuclearReset,
  }), [isUiHidden, scale, pinchGuardRef, nuclearReset]);

  /* ═══════════════════════════════════════════════════════
     RENDER — div estable con touch-action: pan-y
     ═══════════════════════════════════════════════════════ */
  return (
    <ClearModeContext.Provider value={contextValue}>
      <div
        ref={wrapperRef}
        className="h-full w-full"
        style={{ touchAction: "pan-y" }}
      >
        {children}
      </div>
    </ClearModeContext.Provider>
  );
}
