-- ============================================================
-- MIGRAÇÃO: push_tokens — suporte a múltiplos dispositivos
-- Execute no SQL Editor do Supabase
-- ============================================================

-- 1. Adicionar coluna endpoint (identificador único por dispositivo/browser)
ALTER TABLE public.push_tokens
  ADD COLUMN IF NOT EXISTS endpoint text;

-- 2. Preencher endpoint a partir do JSON do token (para registros existentes)
UPDATE public.push_tokens
SET endpoint = token::json->>'endpoint'
WHERE endpoint IS NULL AND token IS NOT NULL;

-- 3. Criar índice único por endpoint (substitui o único por user_id)
--    Isso permite que um usuário tenha tokens em vários dispositivos
CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_endpoint_unique
  ON public.push_tokens (endpoint)
  WHERE endpoint IS NOT NULL;

-- 4. Manter o índice por user_id (para busca eficiente, mas não mais unique)
--    Primeiro remove o constraint antigo se existir
DO $$
BEGIN
  -- Remove unique constraint por user_id se existir (agora um user pode ter vários tokens)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'push_tokens_user_id_key'
      AND conrelid = 'public.push_tokens'::regclass
  ) THEN
    ALTER TABLE public.push_tokens DROP CONSTRAINT push_tokens_user_id_key;
  END IF;
END $$;

-- 5. Índice normal por user_id para queries de busca por usuário
CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx
  ON public.push_tokens (user_id);

-- 6. Coluna updated_at (pode já existir)
ALTER TABLE public.push_tokens
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 7. Verificar resultado
SELECT
  user_id,
  platform,
  endpoint IS NOT NULL AS has_endpoint,
  updated_at
FROM public.push_tokens
ORDER BY updated_at DESC
LIMIT 20;
