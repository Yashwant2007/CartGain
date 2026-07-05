-- Enable RLS on all public tables and create deny-all policies
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- This is safe because the app uses Prisma (direct connection), not the Supabase public API

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations', 'schema_migrations')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    BEGIN
      EXECUTE format(
        'CREATE POLICY "deny_public_access_%s" ON public.%I FOR ALL USING (false);',
        tbl, tbl
      );
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END;
$$;
