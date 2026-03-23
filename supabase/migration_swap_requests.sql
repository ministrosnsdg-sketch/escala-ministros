-- ============================================================
-- MIGRAÇÃO v3.0: Tabela swap_requests (Troca de Escala)
-- ============================================================
--
-- SEGURO PARA PRODUÇÃO COM USUÁRIOS ONLINE:
-- ✅ Apenas CREATE (não modifica tabelas existentes)
-- ✅ IF NOT EXISTS em tudo (idempotente, pode rodar várias vezes)
-- ✅ Nenhum ALTER/DELETE/UPDATE em tabelas existentes
-- ✅ Zero downtime — operação instantânea
--
-- Execute no SQL Editor do Supabase (todo de uma vez)
-- ============================================================

-- 1. Criar tabela (só se não existir)
CREATE TABLE IF NOT EXISTS public.swap_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id uuid NOT NULL REFERENCES public.ministers(id) ON DELETE CASCADE,
  requester_name text NOT NULL,
  date date NOT NULL,
  time time NOT NULL,
  title text,
  source_type text NOT NULL CHECK (source_type IN ('regular', 'extra')),
  source_horario_id integer REFERENCES public.horarios(id) ON DELETE SET NULL,
  source_extra_id integer REFERENCES public.extras(id) ON DELETE SET NULL,
  accepter_id uuid REFERENCES public.ministers(id) ON DELETE SET NULL,
  accepter_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- 2. Habilitar RLS (segurança por linha)
ALTER TABLE public.swap_requests ENABLE ROW LEVEL SECURITY;

-- 3. Policies de acesso (DROP IF EXISTS para ser idempotente)
DROP POLICY IF EXISTS "swap_select_all" ON public.swap_requests;
CREATE POLICY "swap_select_all" ON public.swap_requests
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "swap_insert_auth" ON public.swap_requests;
CREATE POLICY "swap_insert_auth" ON public.swap_requests
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "swap_update_auth" ON public.swap_requests;
CREATE POLICY "swap_update_auth" ON public.swap_requests
  FOR UPDATE USING (auth.role() = 'authenticated');

-- 4. Índices para performance
CREATE INDEX IF NOT EXISTS idx_swap_requests_date ON public.swap_requests(date);
CREATE INDEX IF NOT EXISTS idx_swap_requests_status ON public.swap_requests(status);
CREATE INDEX IF NOT EXISTS idx_swap_requests_requester ON public.swap_requests(requester_id);
