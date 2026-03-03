-- ==========================================
-- TRIGGER: Actualizar highscores automáticamente
-- al insertar en scores.
-- Ejecutar en el SQL Editor de Supabase.
-- ==========================================

-- 1. Función del trigger
CREATE OR REPLACE FUNCTION update_highscore_on_new_score()
RETURNS TRIGGER AS $$
DECLARE
    v_is_lower_better BOOLEAN;
    v_current_highscore INT4;
    v_existing_id UUID;
BEGIN
    -- 1) Obtener la configuración del juego
    SELECT g.is_lower_better
      INTO v_is_lower_better
      FROM games g
     WHERE g.id = NEW.game_id;

    -- 2) Buscar si ya existe un highscore para este usuario + juego
    SELECT h.id, h.score
      INTO v_existing_id, v_current_highscore
      FROM highscores h
     WHERE h.user_id = NEW.user_id
       AND h.game_id = NEW.game_id;

    -- 3) Si NO existe → INSERT directo
    IF v_existing_id IS NULL THEN
        INSERT INTO highscores (user_id, game_id, score, achieved_at)
        VALUES (NEW.user_id, NEW.game_id, NEW.score, NEW.achieved_at);

        RETURN NEW;
    END IF;

    -- 4) Si SÍ existe → evaluar si es nuevo récord
    IF v_is_lower_better IS TRUE THEN
        -- Juegos donde menor puntuación es mejor (Timer, Traffic Light, etc.)
        IF NEW.score < v_current_highscore THEN
            UPDATE highscores
               SET score       = NEW.score,
                   achieved_at = NEW.achieved_at
             WHERE id = v_existing_id;
        END IF;
    ELSE
        -- Juegos donde mayor puntuación es mejor (is_lower_better = FALSE o NULL)
        IF NEW.score > v_current_highscore THEN
            UPDATE highscores
               SET score       = NEW.score,
                   achieved_at = NEW.achieved_at
             WHERE id = v_existing_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger que dispara la función tras cada INSERT en scores
DROP TRIGGER IF EXISTS trigger_update_highscore ON scores;
CREATE TRIGGER trigger_update_highscore
AFTER INSERT ON scores
FOR EACH ROW
EXECUTE FUNCTION update_highscore_on_new_score();
