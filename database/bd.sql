-- ==========================================
-- 1. USUARIOS Y AUTENTICACIÓN
-- ==========================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(30) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- IMPORTANTE: Aquí guardarás la contraseña encriptada (ej: con bcrypt)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para buscar rápido si un nombre de usuario ya está cogido al registrarse
CREATE INDEX idx_users_username ON users (username);


-- ==========================================
-- 2. CATÁLOGO DE JUEGOS
-- ==========================================
CREATE TABLE games (
    id VARCHAR(50) PRIMARY KEY, 
    name VARCHAR(100) NOT NULL,
    is_lower_better BOOLEAN DEFAULT false, -- ¡LA MAGIA! true para Timer/Semáforo, false para el resto
    total_plays BIGINT DEFAULT 0, 
    total_likes BIGINT DEFAULT 0, 
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ==========================================
-- 3. FAVORITOS / LIKES (Modo TikTok)
-- ==========================================
CREATE TABLE user_likes (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    game_id VARCHAR(50) REFERENCES games(id) ON DELETE CASCADE,
    liked_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, game_id) -- Clave primaria compuesta: Un usuario solo puede dar 1 like por juego
);


-- ==========================================
-- 4. PUNTUACIONES Y LEADERBOARDS (Modo Normal)
-- ==========================================
CREATE TABLE scores (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    game_id VARCHAR(50) REFERENCES games(id) ON DELETE CASCADE,
    score INT NOT NULL,
    achieved_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🔥 Índice mágico: Hace que buscar el "Top 20 de Hoy" sea instantáneo, 
-- ordenando por juego, fecha y puntuación de mayor a menor.
CREATE INDEX idx_daily_leaderboard ON scores (game_id, achieved_at, score DESC);


-- ==========================================
-- 5. MODO SUPERVIVENCIA (El Metajuego)
-- ==========================================
CREATE TABLE survival_runs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    games_survived INT NOT NULL, -- Cuántos juegos superó antes de perder las 3 vidas
    ended_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para el ranking global de los mejores supervivientes de la historia
CREATE INDEX idx_survival_global ON survival_runs (games_survived DESC);

-- ==========================================
-- 🤖 6. EL ROBOT DE LOS LIKES (TRIGGER)
-- ==========================================
-- Función que decide qué hacer cuando hay un cambio en user_likes
CREATE OR REPLACE FUNCTION update_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE games SET total_likes = total_likes + 1 WHERE id = NEW.game_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE games SET total_likes = total_likes - 1 WHERE id = OLD.game_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Enganchamos la función a la tabla user_likes
DROP TRIGGER IF EXISTS trigger_update_likes_count ON user_likes;
CREATE TRIGGER trigger_update_likes_count
AFTER INSERT OR DELETE ON user_likes
FOR EACH ROW EXECUTE FUNCTION update_likes_count();