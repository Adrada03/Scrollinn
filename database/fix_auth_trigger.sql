/**
 * FIX: Trigger de vinculación auth.users → public.users
 *
 * Problemas que resuelve:
 *  1. El trigger anterior podía fallar por permisos RLS.
 *  2. No tenía SET search_path, causando errores intermitentes.
 *  3. No manejaba conflictos (INSERT duplicado si se re-ejecuta).
 *
 * EJECUTAR EN: Supabase Dashboard → SQL Editor → New Query → Pegar y ejecutar.
 */

-- ═══ PASO 1: Borrar trigger y función existentes ═══

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- ═══ PASO 2: Recrear la función con SECURITY DEFINER ═══

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, username, xp, coins)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    0,
    0
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ═══ PASO 3: Recrear el trigger ═══

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ═══ PASO 4: Reparar usuarios huérfanos existentes ═══
-- (usuarios en auth.users que NO tienen fila en public.users)

INSERT INTO public.users (id, username, xp, coins)
SELECT
  au.id,
  COALESCE(au.raw_user_meta_data->>'username', split_part(au.email, '@', 1)),
  0,
  0
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ═══ PASO 5: Verificar que get_email_by_username existe ═══

CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_email   TEXT;
BEGIN
  SELECT id INTO v_user_id
  FROM public.users
  WHERE LOWER(username) = LOWER(p_username)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  RETURN v_email;
END;
$$;
