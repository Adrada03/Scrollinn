/**
 * useActiveSlide — Custom Hook para detectar el slide activo en un feed con scroll snap.
 *
 * Flujo:
 *  1. IntersectionObserver (threshold 0.5) detecta un slide *candidato*.
 *  2. MutationObserver observa automáticamente slides nuevos añadidos al DOM
 *     (necesario para el feed infinito que crece dinámicamente).
 *  3. Solo cuando el scroll ha terminado (scrollend + fallback debounce)
 *     se "comitea" el candidato → setActiveIndex.
 *
 * @param {number} initialIndex — Índice activo por defecto
 * @returns {{ containerRef, activeIndex, scrollToSlide }}
 */

import { useState, useEffect, useRef, useCallback } from "react";

const SCROLL_SETTLE_MS = 150;

export default function useActiveSlide(initialIndex = 0) {
  const containerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const pendingIndexRef = useRef(initialIndex);
  const settleTimer = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /* ── 1. IntersectionObserver: detecta slide candidato ── */
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const idx = Number(entry.target.dataset.slideIndex);
            if (!isNaN(idx)) {
              pendingIndexRef.current = idx;
            }
          }
        }
      },
      { root: container, threshold: 0.5 }
    );

    // Observar slides iniciales
    const slides = container.querySelectorAll("[data-slide-index]");
    slides.forEach((el) => observer.observe(el));

    /* ── 2. MutationObserver: observa slides nuevos automáticamente ── */
    const mutationObs = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && node.dataset?.slideIndex != null) {
            observer.observe(node);
          }
        }
      }
    });
    mutationObs.observe(container, { childList: true });

    /* ── 3. Commit: solo cuando el scroll se detiene ── */
    const commitPending = () => {
      clearTimeout(settleTimer.current);
      setActiveIndex(pendingIndexRef.current);
    };

    const handleScroll = () => {
      clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(commitPending, SCROLL_SETTLE_MS);
    };

    const handleScrollEnd = () => {
      commitPending();
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("scrollend", handleScrollEnd);

    return () => {
      observer.disconnect();
      mutationObs.disconnect();
      clearTimeout(settleTimer.current);
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("scrollend", handleScrollEnd);
    };
  }, []);

  const scrollToSlide = useCallback((index, behavior = "smooth") => {
    const container = containerRef.current;
    if (!container) return;

    if (behavior === "instant") {
      pendingIndexRef.current = index;
      setActiveIndex(index);
    }

    const el = container.querySelector(`[data-slide-index="${index}"]`);
    if (el) el.scrollIntoView({ behavior, block: "start" });
  }, []);

  return { containerRef, activeIndex, scrollToSlide };
}
