/**
 * ClearModeWrapper — Capa superior global para Clear Mode (Pinch-to-zoom)
 *
 * NUEVA ARQUITECTURA: Desacopla completamente la detección del zoom de los
 * juegos individuales. Este componente vive en lo más alto del Feed y es el
 * ÚNICO responsable de escuchar eventos táctiles para el pinch-to-zoom.
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
const PINCH_DETECT_WINDOW = 120;    // ms esperando segundo dedo
const POST_PINCH_COOLDOWN = 150;    // ms bloqueando touches post-pinch

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

  // Ventana de detección pre-pinch
  const detectTimerRef = useRef(null);
  const pendingStartRef = useRef(null);
  const isDetectingRef = useRef(false);

  // Cooldown post-pinch
  const cooldownRef = useRef(false);
  const cooldownTimerRef = useRef(null);

  // Flag para re-despachos sintéticos
  const isSyntheticRef = useRef(false);

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

  /** Limpieza de la ventana de detección */
  const clearDetection = useCallback(() => {
    clearTimeout(detectTimerRef.current);
    detectTimerRef.current = null;
    pendingStartRef.current = null;
    isDetectingRef.current = false;
  }, []);

  /** Activar cooldown post-pinch para bloquear falsos taps */
  const startCooldown = useCallback(() => {
    cooldownRef.current = true;
    clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => {
      cooldownRef.current = false;
    }, POST_PINCH_COOLDOWN);
  }, []);

  /** Re-despachar toque pendiente al elemento original (fue un tap real) */
  const redispatchPendingTouch = useCallback(() => {
    const pending = pendingStartRef.current;
    if (!pending) return;

    const touch = pending.changedTouches[0];
    if (!touch) return;

    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!target) return;

    isSyntheticRef.current = true;
    try {
      // Re-despachar touchstart
      target.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          touches: pending.touches,
          targetTouches: pending.targetTouches,
          changedTouches: pending.changedTouches,
        })
      );
      // También pointerdown para juegos basados en canvas/pointer
      target.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: touch.clientX,
          clientY: touch.clientY,
          pointerId: touch.identifier,
          pointerType: "touch",
          isPrimary: true,
        })
      );
    } finally {
      // FAILSAFE: garantizar liberación incluso si un handler lanza error
      isSyntheticRef.current = false;
    }
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
    clearTimeout(detectTimerRef.current);
    clearTimeout(cooldownTimerRef.current);
    cooldownRef.current = false;
    isDetectingRef.current = false;
    pendingStartRef.current = null;
    isSyntheticRef.current = false;
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
     
     ¡CLAVE ARQUITECTÓNICA! Los listeners se registran UNA
     sola vez en wrapperRef (nodo DOM estable). No dependen
     de activeIndex ni se re-registran al cambiar de slide.
     ═══════════════════════════════════════════════════════ */
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    /* ─── TOUCHSTART (capture) ─── */
    const handleTouchStart = (e) => {
      // Dejar pasar re-despachos sintéticos
      if (isSyntheticRef.current) return;

      // Post-pinch cooldown: bloquear touches residuales
      if (cooldownRef.current) {
        e.stopPropagation();
        return;
      }

      if (e.touches.length === 1 && !isPinchingRef.current) {
        // Solo interceptar 1 dedo si el scroll está bloqueado (gameplay activo).
        // Si no, dejar fluir para scroll/tap normal.
        if (disabledRef.current || !scrollLockedRef?.current) return;

        // Primer dedo: iniciar ventana de detección
        isDetectingRef.current = true;
        pendingStartRef.current = e;
        e.stopPropagation();

        detectTimerRef.current = setTimeout(() => {
          // Timer expiró sin segundo dedo → fue un tap real
          redispatchPendingTouch();
          clearDetection();
        }, PINCH_DETECT_WINDOW);
      } else if (e.touches.length === 2) {
        // Segundo dedo: confirmar pinch (SIEMPRE permitido)
        e.stopPropagation();
        clearTimeout(detectTimerRef.current);
        clearDetection();

        isPinchingRef.current = true;
        setIsZooming(true);
        didExceedRef.current = false;
        initialDistRef.current = getDistance(e.touches[0], e.touches[1]);
      }
    };

    /* ─── TOUCHMOVE (capture) ─── */
    const handleTouchMove = (e) => {
      if (isSyntheticRef.current) return;

      // Durante cooldown, bloquear
      if (cooldownRef.current) {
        e.stopPropagation();
        return;
      }

      if (isDetectingRef.current && e.touches.length === 1) {
        // Arrastrando con 1 dedo durante ventana de detección.
        // Probablemente scroll o interacción real → cancelar detección, re-despachar.
        redispatchPendingTouch();
        clearDetection();
        return; // dejar fluir el move
      }

      if (!isPinchingRef.current || e.touches.length !== 2) return;

      // Pinch activo: actualizar escala
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
      if (isSyntheticRef.current) return;

      // Post-pinch cooldown: bloquear
      if (cooldownRef.current) {
        e.stopPropagation();
        return;
      }

      // Si estamos en ventana de detección y el dedo se levanta sin 2º dedo
      if (isDetectingRef.current) {
        redispatchPendingTouch();
        clearDetection();
        return; // dejar fluir el touchend
      }

      if (!isPinchingRef.current) return;

      if (e.touches.length < 2) {
        e.stopPropagation();
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
      clearDetection();
      if (isPinchingRef.current) {
        isPinchingRef.current = false;
        setIsZooming(false);
        scale.jump(1);
        startCooldown();
      }
    };

    // Registrar en CAPTURE + passive:false para poder preventDefault en pinch
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
      clearTimeout(detectTimerRef.current);
      clearTimeout(cooldownTimerRef.current);
      // FAILSAFE: al desmontar, liberar todos los locks
      cooldownRef.current = false;
      isPinchingRef.current = false;
      isDetectingRef.current = false;
      isSyntheticRef.current = false;
    };
    // SIN activeIndex en deps → listeners estables en un nodo DOM que no cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, clearDetection, startCooldown, redispatchPendingTouch]);

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
