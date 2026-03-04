/**
 * Función RPC: get_email_by_username
 *
 * Recibe un username y devuelve el email correspondiente desde auth.users.
 * Usa SECURITY DEFINER para acceder a auth.users sin exposición pública.
 *
 * EJECUTAR EN: Supabase Dashboard → SQL Editor → New Query → Pegar y ejecutar.
 */

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
  -- 1. Buscar el ID del usuario en public.users por username (case-insensitive)
  SELECT id INTO v_user_id
  FROM public.users
  WHERE LOWER(username) = LOWER(p_username)
  LIMIT 1;

  -- Si no existe, devolver NULL
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Buscar el email en auth.users (solo accesible con SECURITY DEFINER)
  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  RETURN v_email;
END;
$$;
