-- ==========================================
-- 1. USUARIOS (Sincronizados con Supabase Auth)
-- ==========================================
CREATE TABLE public.users (
    id UUID PRIMARY KEY, -- El ID vendrá de auth.users automáticamente
    username VARCHAR(30) UNIQUE NOT NULL,
    xp INT4 DEFAULT 0,
    coins INT4 DEFAULT 0,
    equipped_avatar_id VARCHAR, -- Se vinculará con la tabla avatars después
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 2. CATÁLOGO DE JUEGOS Y AVATARES
-- ==========================================
CREATE TABLE public.games (
    id VARCHAR(50) PRIMARY KEY, 
    name VARCHAR(100) NOT NULL,
    is_lower_better BOOLEAN DEFAULT false, 
    total_plays BIGINT DEFAULT 0, 
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.avatars (
    id VARCHAR PRIMARY KEY,
    name_es VARCHAR NOT NULL,
    name_en VARCHAR NOT NULL,
    description_es TEXT,
    description_en TEXT,
    image_url VARCHAR NOT NULL,
    unlock_type VARCHAR NOT NULL,
    requirement INT4,
    base_price INT4,
    tier VARCHAR NOT NULL
);

-- Ahora añadimos la relación que faltaba en users
ALTER TABLE public.users 
ADD CONSTRAINT fk_equipped_avatar 
FOREIGN KEY (equipped_avatar_id) REFERENCES avatars(id);

-- ==========================================
-- 3. PUNTUACIONES Y RENDIMIENTO
-- ==========================================
CREATE TABLE public.scores (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    game_id VARCHAR(50) REFERENCES public.games(id) ON DELETE CASCADE,
    score INT NOT NULL,
    achieved_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.highscores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    game_id VARCHAR NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    score INT4 NOT NULL,
    achieved_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, game_id)
);

CREATE TABLE public.survival_runs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    games_survived INT NOT NULL,
    ended_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 4. TIENDA, INVENTARIO Y RETOS
-- ==========================================
CREATE TABLE public.shop_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    avatar_id VARCHAR REFERENCES public.avatars(id) ON DELETE CASCADE,
    price INT4 NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.user_avatars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    avatar_id VARCHAR NOT NULL REFERENCES public.avatars(id) ON DELETE CASCADE,
    acquired_via VARCHAR NOT NULL,
    amount_paid INT4,
    unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, avatar_id)
);

CREATE TABLE public.daily_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    active_date DATE NOT NULL,
    title_es VARCHAR NOT NULL,
    title_en VARCHAR NOT NULL,
    description_es TEXT NOT NULL,
    description_en TEXT NOT NULL,
    target_game_id VARCHAR REFERENCES public.games(id),
    target_score INT4 NOT NULL DEFAULT 0,
    target_plays INT4 NOT NULL DEFAULT 1,
    reward_coins INT4 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.user_challenge_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    challenge_id UUID NOT NULL REFERENCES public.daily_challenges(id) ON DELETE CASCADE,
    current_progress INT4 DEFAULT 0,
    is_claimed BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, challenge_id)
);

-- ==========================================
-- 5. AUTOMATIZACIÓN (TRIGGERS)
-- ==========================================

-- A. VINCULACIÓN DE USUARIO (Al registrarse en Auth, se crea el perfil público)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, username, xp, coins)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), 
    0, 
    0
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- B. CONTADOR DE PARTIDAS (Al insertar un score, se suma play al juego)
CREATE OR REPLACE FUNCTION increment_game_plays()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.games SET total_plays = total_plays + 1 WHERE id = NEW.game_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_score_inserted
  AFTER INSERT ON public.scores
  FOR EACH ROW EXECUTE FUNCTION increment_game_plays();

-- ==========================================
-- 6. ÍNDICES PARA VELOCIDAD
-- ==========================================
CREATE INDEX idx_users_username ON public.users (username);
CREATE INDEX idx_daily_leaderboard ON public.scores (game_id, achieved_at, score DESC);
CREATE INDEX idx_survival_global ON public.survival_runs (games_survived DESC);
CREATE INDEX idx_daily_challenges_date ON public.daily_challenges(active_date);
CREATE INDEX idx_highscores_game_score ON public.highscores(game_id, score);