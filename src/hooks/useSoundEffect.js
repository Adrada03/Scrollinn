/**
 * useSoundEffect.js — Hook centralizado de efectos de sonido
 *
 * Genera sonidos satisfactorios "retro-futuristas" usando la Web Audio API.
 * Cero archivos externos → cero impacto en la carga de la web.
 *
 * Sonidos disponibles:
 *  - playNavigation()  — "pop" o "clic" satisfactorio y corto
 *  - playCoin()        — tintineo metálico ascendente
 *  - playRecord()      — fanfarria de neón triunfal (~1.5s)
 *  - playLose()        — "bloop" descendente sutil
 *
 * Todos verifican el estado global de mute antes de reproducir.
 */

import { useCallback, useRef } from "react";
import { useSound } from "../context/SoundContext";

// ─── AudioContext singleton (se crea en la primera interacción) ─────────────

let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume si está suspendido (política de autoplay de navegadores)
  if (_audioCtx.state === "suspended") {
    _audioCtx.resume().catch(() => {});
  }
  return _audioCtx;
}

// ─── Generadores de sonido ──────────────────────────────────────────────────

/**
 * Sfx_Navegación — Pop/clic sutil y satisfactorio.
 * Un pulso sinusoidal muy corto con una ligera caída de frecuencia.
 */
function synthNavigation() {
  const ctx = getAudioCtx();
  const t = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(1200, t);
  osc.frequency.exponentialRampToValueAtTime(800, t + 0.06);

  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(t);
  osc.stop(t + 0.1);
}

/**
 * Sfx_Monedas — Tintineo metálico ascendente ("blip-blip" dorado).
 * Dos tonos ascendentes rápidos con envolvente corta.
 */
function synthCoin() {
  const ctx = getAudioCtx();
  const t = ctx.currentTime;

  // Tono 1
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(1400, t);
  osc1.frequency.exponentialRampToValueAtTime(1800, t + 0.06);
  gain1.gain.setValueAtTime(0.2, t);
  gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(t);
  osc1.stop(t + 0.15);

  // Tono 2 (más alto, ligeramente retrasado)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(1800, t + 0.08);
  osc2.frequency.exponentialRampToValueAtTime(2400, t + 0.14);
  gain2.gain.setValueAtTime(0, t);
  gain2.gain.setValueAtTime(0.22, t + 0.08);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(t + 0.08);
  osc2.stop(t + 0.28);
}

/**
 * Sfx_Récord — Fanfarria de neón triunfal (~1.5s).
 * Tres notas ascendentes con reverb + shimmer.
 */
function synthRecord() {
  const ctx = getAudioCtx();
  const t = ctx.currentTime;

  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  const durations = [0.18, 0.18, 0.18, 0.6];
  let offset = 0;

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = i === notes.length - 1 ? "triangle" : "square";
    osc.frequency.setValueAtTime(freq, t + offset);

    const dur = durations[i];
    const peakGain = i === notes.length - 1 ? 0.14 : 0.10;

    gain.gain.setValueAtTime(0, t + offset);
    gain.gain.linearRampToValueAtTime(peakGain, t + offset + 0.02);
    gain.gain.setValueAtTime(peakGain, t + offset + dur * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, t + offset + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t + offset);
    osc.stop(t + offset + dur + 0.05);

    offset += dur;
  });

  // Shimmer: frecuencia alta muy sutil acompañando la última nota
  const shimmer = ctx.createOscillator();
  const shimGain = ctx.createGain();
  shimmer.type = "sine";
  shimmer.frequency.setValueAtTime(2093, t + offset - 0.6);
  shimGain.gain.setValueAtTime(0, t + offset - 0.6);
  shimGain.gain.linearRampToValueAtTime(0.04, t + offset - 0.3);
  shimGain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.3);
  shimmer.connect(shimGain);
  shimGain.connect(ctx.destination);
  shimmer.start(t + offset - 0.6);
  shimmer.stop(t + offset + 0.35);
}

/**
 * Sfx_Error/Perder — "Bloop" descendente sutil.
 * Un tono que baja de frecuencia con envolvente suave.
 */
function synthLose() {
  const ctx = getAudioCtx();
  const t = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(500, t);
  osc.frequency.exponentialRampToValueAtTime(180, t + 0.25);

  gain.gain.setValueAtTime(0.18, t);
  gain.gain.linearRampToValueAtTime(0.15, t + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(t);
  osc.stop(t + 0.4);

  // Sub-armónico para "peso"
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = "triangle";
  sub.frequency.setValueAtTime(250, t);
  sub.frequency.exponentialRampToValueAtTime(90, t + 0.3);
  subGain.gain.setValueAtTime(0.1, t);
  subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  sub.connect(subGain);
  subGain.connect(ctx.destination);
  sub.start(t);
  sub.stop(t + 0.35);
}

// ─── Hook público ───────────────────────────────────────────────────────────

export function useSoundEffect() {
  const { isMuted } = useSound();
  const mutedRef = useRef(isMuted);
  mutedRef.current = isMuted;

  const playNavigation = useCallback(() => {
    if (mutedRef.current) return;
    try { synthNavigation(); } catch { /* AudioContext no disponible */ }
  }, []);

  const playCoin = useCallback(() => {
    if (mutedRef.current) return;
    try { synthCoin(); } catch { /* AudioContext no disponible */ }
  }, []);

  const playRecord = useCallback(() => {
    if (mutedRef.current) return;
    try { synthRecord(); } catch { /* AudioContext no disponible */ }
  }, []);

  const playLose = useCallback(() => {
    if (mutedRef.current) return;
    try { synthLose(); } catch { /* AudioContext no disponible */ }
  }, []);

  return { playNavigation, playCoin, playRecord, playLose };
}
