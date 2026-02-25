/**
 * useClearModeGesture — Pinch-to-zoom "Clear Mode" al estilo TikTok
 *
 * Intercepta toques en FASE DE CAPTURA para evitar que un pinch
 * dispare acciones accidentales en el juego hijo.
 *
 * Flujo de protección:
 *  ┌─ Dedo 1 toca ─→ captura + stopPropagation ─→ timer 120ms
 *  │   Si dedo 2 llega antes → PINCH confirmado → bloquear todo
 *  │   Si timer expira        → TAP real → re-despachar al juego
 *  └─ Post-pinch → cooldown 150ms → bloquear touches residuales
 *
 * Devuelve:
 *  - containerRef:   ref para el <motion.div> wrapper
 *  - scaleMotion:    MotionValue<number> para style={{ scale }}
 *  - isUiHidden:     booleano
 *  - restoreUi:      función (botón X)
 *  - resetClearMode:  función (cambio de slide)
 *  - pinchGuardRef:   ref-like { current: boolean } — true mientras se hace pinch
 *                      o durante el cooldown post-pinch (150ms). Los juegos deben
 *                      verificar `if (pinchGuardRef.current) return;` en sus handlers.
 *
 * ⚠️ Ya NO devuelve handlers React — usa listeners nativos en capture.
 *    El contenedor padre debe tener `touch-action: pan-y`.
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useMotionValue, animate } from "framer-motion";

const CLEAR_THRESHOLD = 1.2;
const SPRING_CONFIG = { type: "spring", stiffness: 300, damping: 25 };
const PINCH_DETECT_WINDOW = 120; // ms para esperar segundo dedo
const POST_PINCH_COOLDOWN = 150; // ms de cooldown post-pinch

export default function useClearModeGesture({ disabled = false, scrollLockedRef: externalScrollLockedRef, activeIndex = 0 } = {}) {
  const containerRef = useRef(null);

  const scaleMotion = useMotionValue(1);
  const [isUiHidden, setIsUiHidden] = useState(false);

  // Ref reactivo para leer isUiHidden dentro de los listeners nativos
  const isUiHiddenRef = useRef(false);
  isUiHiddenRef.current = isUiHidden;

  // Ref reactivo para leer disabled dentro de los listeners nativos
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  // Ref para saber si el scroll está bloqueado (gameplay activo)
  const fallbackScrollLockedRef = useRef(false);
  const scrollLockedRef = externalScrollLockedRef || fallbackScrollLockedRef;

  // Refs internos del pinch
  const initialDistRef = useRef(null);
  const didExceedRef = useRef(false);
  const isPinchingRef = useRef(false);

  // Refs para la ventana de detección pre-pinch
  const detectTimerRef = useRef(null);
  const pendingStartRef = useRef(null); // guarda el TouchEvent original
  const isDetectingRef = useRef(false); // estamos en ventana de detección

  // Ref para cooldown post-pinch
  const cooldownRef = useRef(false);
  const cooldownTimerRef = useRef(null);

  // Flag para que el re-despacho no sea re-capturado
  const isSyntheticRef = useRef(false);

  // ── LEY 5: Ref compuesto para que los juegos verifiquen pinch activo ──
  // Devuelve true si estamos en pinch O en el cooldown post-pinch.
  // Los juegos lo reciben como prop y hacen: if (pinchGuardRef.current) return;
  const pinchGuardRef = useMemo(() => ({
    get current() {
      return isPinchingRef.current || cooldownRef.current;
    },
  }), []);

  const getDistance = (t0, t1) =>
    Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);

  /** Limpieza de la ventana de detección */
  const clearDetection = useCallback(() => {
    clearTimeout(detectTimerRef.current);
    detectTimerRef.current = null;
    pendingStartRef.current = null;
    isDetectingRef.current = false;
  }, []);

  /** Activar cooldown post-pinch */
  const startCooldown = useCallback(() => {
    cooldownRef.current = true;
    clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => {
      cooldownRef.current = false;
    }, POST_PINCH_COOLDOWN);
  }, []);

  /** Re-despachar el toque pendiente al elemento original (tap real) */
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

      // También despachar pointerdown y mousedown para juegos basados en canvas/pointer
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
      // FAILSAFE: garantizar que isSyntheticRef se libera incluso si
      // un handler del juego lanza un error durante el re-despacho.
      isSyntheticRef.current = false;
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    /* ═══════════════════════════════════════════════════
       TOUCHSTART — fase de captura
       ═══════════════════════════════════════════════════ */
    const handleTouchStart = (e) => {
      // Dejar pasar nuestros re-despachos sintéticos
      if (isSyntheticRef.current) return;

      // Post-pinch cooldown: bloquear touches residuales
      if (cooldownRef.current) {
        e.stopPropagation();
        return;
      }

      if (e.touches.length === 1 && !isPinchingRef.current) {
        // Solo interceptar 1 dedo si el scroll está bloqueado (gameplay activo)
        // Si no, dejar fluir para scroll/tap normal.
        if (disabledRef.current || !scrollLockedRef.current) return;

        // ── Primer dedo: iniciar ventana de detección ──
        isDetectingRef.current = true;
        pendingStartRef.current = e;
        e.stopPropagation();

        detectTimerRef.current = setTimeout(() => {
          // Timer expiró sin segundo dedo → fue un tap real
          redispatchPendingTouch();
          clearDetection();
        }, PINCH_DETECT_WINDOW);
      } else if (e.touches.length === 2) {
        // ── Segundo dedo: confirmar pinch (SIEMPRE permitido) ──
        e.stopPropagation();
        clearTimeout(detectTimerRef.current);
        clearDetection();

        isPinchingRef.current = true;
        didExceedRef.current = false;
        initialDistRef.current = getDistance(e.touches[0], e.touches[1]);
      }
    };

    /* ═══════════════════════════════════════════════════
       TOUCHMOVE — fase de captura
       ═══════════════════════════════════════════════════ */
    const handleTouchMove = (e) => {
      if (isSyntheticRef.current) return;

      // Durante cooldown, bloquear
      if (cooldownRef.current) {
        e.stopPropagation();
        return;
      }

      if (isDetectingRef.current && e.touches.length === 1) {
        // El usuario está arrastrando con 1 dedo durante la ventana de detección.
        // Probablemente es scroll o interacción real — cancelar detección, re-despachar.
        redispatchPendingTouch();
        clearDetection();
        return; // dejar fluir el move
      }

      if (!isPinchingRef.current || e.touches.length !== 2) return;

      // ── Pinch activo: actualizar scale ──
      e.stopPropagation();
      e.preventDefault(); // bloquear zoom nativo

      const currentDist = getDistance(e.touches[0], e.touches[1]);
      const ratio = currentDist / initialDistRef.current;
      const clamped = Math.max(1, ratio);

      scaleMotion.set(clamped);

      if (clamped >= CLEAR_THRESHOLD) {
        didExceedRef.current = true;
      }
    };

    /* ═══════════════════════════════════════════════════
       TOUCHEND — fase de captura
       ═══════════════════════════════════════════════════ */
    const handleTouchEnd = (e) => {
      if (isSyntheticRef.current) return;

      // Post-pinch cooldown: bloquear
      if (cooldownRef.current) {
        e.stopPropagation();
        return;
      }

      // Si estamos en ventana de detección y el dedo se levanta sin 2º dedo
      if (isDetectingRef.current) {
        // Fue un tap rápido — re-despachar touchstart + dejar pasar touchend
        redispatchPendingTouch();
        clearDetection();
        return; // dejar fluir el touchend
      }

      if (!isPinchingRef.current) return;

      if (e.touches.length < 2) {
        e.stopPropagation();
        isPinchingRef.current = false;

        animate(scaleMotion, 1, SPRING_CONFIG);

        if (didExceedRef.current) {
          setIsUiHidden(true);
        }

        initialDistRef.current = null;
        didExceedRef.current = false;

        // Activar cooldown para bloquear el "falso tap" del dedo restante
        startCooldown();
      }
    };

    /* ═══════════════════════════════════════════════════
       TOUCHCANCEL — fase de captura (limpieza)
       ═══════════════════════════════════════════════════ */
    const handleTouchCancel = () => {
      clearDetection();
      if (isPinchingRef.current) {
        isPinchingRef.current = false;
        scaleMotion.jump(1);
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
      // FAILSAFE: al desmontar/re-registrar, liberar todos los locks
      // para evitar que cooldownRef o isPinchingRef queden atrapados.
      cooldownRef.current = false;
      isPinchingRef.current = false;
      isDetectingRef.current = false;
      isSyntheticRef.current = false;
    };
  }, [activeIndex, scaleMotion, clearDetection, startCooldown, redispatchPendingTouch]);
  // ↑ activeIndex fuerza re-registro de listeners al cambiar de slide,
  //   porque containerRef.current apunta al nuevo elemento DOM.

  /** Restauración completa: UI visible + reset de toda la física del pinch.
   *  Usada por el botón X y cualquier acción que restaure la UI. */
  const restoreUi = useCallback(() => {
    setIsUiHidden(false);
    scaleMotion.jump(1);
    isPinchingRef.current = false;
    initialDistRef.current = null;
    didExceedRef.current = false;
    clearTimeout(detectTimerRef.current);
    clearTimeout(cooldownTimerRef.current);
    cooldownRef.current = false;
    isDetectingRef.current = false;
    pendingStartRef.current = null;
    isSyntheticRef.current = false;
  }, [scaleMotion]);

  /** Resetea solo el estado de pinch (scale, refs) SIN tocar isUiHidden.
   *  Útil al cambiar de slide para que el modo limpio persista. */
  const resetPinchState = useCallback(() => {
    scaleMotion.jump(1);
    isPinchingRef.current = false;
    initialDistRef.current = null;
    didExceedRef.current = false;
    clearTimeout(detectTimerRef.current);
    clearTimeout(cooldownTimerRef.current);
    cooldownRef.current = false;
    isDetectingRef.current = false;
    pendingStartRef.current = null;
  }, [scaleMotion]);

  /** Reset completo: pinch + restaurar UI. Para uso manual si hace falta. */
  const resetClearMode = useCallback(() => {
    setIsUiHidden(false);
    resetPinchState();
  }, [resetPinchState]);

  return {
    containerRef,
    scaleMotion,
    isUiHidden,
    restoreUi,
    resetClearMode,
    resetPinchState,
    pinchGuardRef,
  };
}
