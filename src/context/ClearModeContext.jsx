/**
 * ClearModeContext — Contexto global para el modo limpio (Pinch-to-zoom)
 *
 * Provee a todos los hijos:
 *  - isUiHidden:    booleano — true cuando la UI debe estar oculta
 *  - scaleMotion:   MotionValue<number> — escala animada por Framer Motion
 *  - pinchGuardRef: ref-like { current: boolean } — true durante pinch/cooldown
 *  - nuclearReset:  () => void — restaura todo al estado virgen
 *
 * Los juegos que necesiten saber si hay pinch activo pueden:
 *  1. Recibir `pinchGuardRef` como prop (pasado desde Feed)
 *  2. O usar `useClearMode()` directamente
 */

import { createContext, useContext } from "react";

const ClearModeContext = createContext({
  isUiHidden: false,
  scaleMotion: null,
  pinchGuardRef: { current: false },
  nuclearReset: () => {},
});

/** Hook de conveniencia para consumir el contexto de Clear Mode */
export const useClearMode = () => useContext(ClearModeContext);

export default ClearModeContext;
