-- migration_add_minister_fields.sql
-- Adiciona campos necessários para autenticação e controle de senha
-- Execute no SQL Editor do Supabase ANTES de fazer o deploy das Edge Functions

-- 1. Adicionar campo email na tabela ministers (se não existir)
ALTER TABLE public.ministers
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Adicionar campo user_id na tabela ministers (se não existir)
ALTER TABLE public.ministers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Adicionar campo must_reset_password (se não existir)
ALTER TABLE public.ministers
  ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Criar índice para busca por user_id
CREATE INDEX IF NOT EXISTS idx_ministers_user_id ON public.ministers(user_id);

-- 5. Criar índice para busca por email
CREATE INDEX IF NOT EXISTS idx_ministers_email ON public.ministers(email);

-- 6. Criar tabela de códigos de convite (se não existir)
CREATE TABLE IF NOT EXISTS public.invite_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  max_uses INT NOT NULL DEFAULT 10,
  used_count INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

-- Admins podem gerenciar códigos; autenticados podem ler (para validar ao cadastrar)
DROP POLICY IF EXISTS "invite_codes_select" ON public.invite_codes;
CREATE POLICY "invite_codes_select" ON public.invite_codes
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "invite_codes_write_admin" ON public.invite_codes;
CREATE POLICY "invite_codes_write_admin" ON public.invite_codes
  FOR ALL TO authenticated USING (fn_is_admin()) WITH CHECK (fn_is_admin());
