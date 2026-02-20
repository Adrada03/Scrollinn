-- Borramos el trigger y la función si existían
DROP TRIGGER IF EXISTS trigger_update_likes_count ON user_likes;
DROP FUNCTION IF EXISTS update_likes_count();

-- Borramos las tablas de "hijos" a "padres"
DROP TABLE IF EXISTS survival_runs;
DROP TABLE IF EXISTS scores;
DROP TABLE IF EXISTS user_likes;
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS users;