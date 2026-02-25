-- ==========================================
-- MIGRACIÓN: Añadir columna xp_gained a scores
-- ==========================================
-- Esta columna registra cuánta XP ganó el jugador en cada partida.
-- Se calcula con calculateGameXP(gameId, score) antes de insertar.

ALTER TABLE scores
ADD COLUMN xp_gained INT4 DEFAULT 0;

-- Índice opcional para consultas de XP total por usuario/juego
CREATE INDEX idx_scores_xp ON scores (user_id, xp_gained);
