import { useState, useCallback } from 'react';
import { submitScore, getTop5, incrementPlays } from '../services/gameService';
import { evaluateAndSaveChallenges } from '../services/challengeService';
import { calculateGameXP } from '../data/pointsToXpPerGame';
import { t } from '../i18n';

/**
 * Transforma el array raw de scores al formato de GameOverPanel.
 */
function formatRanking(rawScores) {
  if (!rawScores || rawScores.length === 0) return [];
  return rawScores.map((s, i) => ({
    pos: i + 1,
    userId: s.user_id ?? null,
    user: s.users?.username ?? '—',
    equippedAvatarId: s.users?.equipped_avatar_id ?? 'none',
    score: s.score,
  }));
}

/**
 * Custom hook para guardar puntuaciones en Supabase y notificar el resultado.
 * @param {string} userId - ID del usuario logueado
 * @param {string} gameId - ID del juego (usa el diccionario GAME_IDS)
 * @returns {Object} { submit, loading, error, lastResult, xpGained }
 */
export function useSubmitScore(userId, gameId) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [xpGained, setXpGained] = useState(null);

  const submit = useCallback(
    async (score, onGameOver) => {
      setLoading(true);
      setError(null);
      setXpGained(null); // Reset XP al iniciar nuevo submit
      let result = null;
      try {
        // Calcular XP ganada de forma centralizada
        const xp = calculateGameXP(gameId, score);

        if (userId && gameId) {
          result = await submitScore(userId, gameId, score, xp);
          setLastResult(result);
          setXpGained(xp);
        } else if (gameId) {
          // Usuario no registrado: incrementar plays, mostrar ranking y avisar
          await incrementPlays(gameId);
          const top = await getTop5(gameId);
          const ranking = formatRanking(top.success ? top.data : []);
          result = {
            success: false,
            data: { ranking, xpGained: 0 },
            message: t('svc.register_to_save'),
          };
          setLastResult(result);
          setXpGained(0);
        }
        // Evaluar retos diarios (fire-and-forget, nunca bloquea el Game Over)
        if (userId && gameId) {
          evaluateAndSaveChallenges(userId, gameId, score).catch(() => {});
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
        if (typeof onGameOver === 'function') onGameOver(score);
      }
      return result;
    },
    [userId, gameId]
  );

  return { submit, loading, error, lastResult, xpGained };
}

// Diccionario de gameId por componente (deben coincidir con games.id en la BD)
export const GAME_IDS = {
  TowerBlocksGame: 'tower-blocks',
  TimerGame: 'timer',
  TrafficLightGame: 'traffic-light',
  NeonTapGame: 'neon-tap',
  StroopEffectGame: 'stroop-effect',
  SweetSpotGame: 'sweet-spot',
  FrenzyTapGame: 'frenzy-tap',
  PerfectScaleGame: 'perfect-scale',
  SwipeSorterGame: 'swipe-sorter',
  MathRushGame: 'math-rush',
  StickBridgeGame: 'stick-bridge',
  DropTheBoxGame: 'drop-the-box',
  DodgeRushGame: 'dodge-rush',
  ColorMatchGame: 'color-match',
  CircleNinjaGame: 'circle-ninja',
  CirclePathGame: 'circle-path',
  HextrisGame: 'hextris',
  OddOneOutGame: 'odd-one-out',
  OverheatGame: 'overheat',
  MemoryLoopGame: 'memory-loop',
  HigherLowerGame: 'higher-lower',
  VectorLeapGame: 'vector-leap',
  RPSDuelGame: 'rps-duel',
  OrbitSniperGame: 'orbit-sniper',
  ShadowDashGame: 'shadow-dash',
  GravityDrawGame: 'gravity-draw',
  CrossroadDartGame: 'crossroad-dart',
  MentalMathGame: 'mental-math',
  PerfectCircleGame: 'perfect-circle',
};
