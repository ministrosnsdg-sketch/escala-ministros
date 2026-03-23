-- ============================================================
-- MIGRAÇÃO v3.0 — COPIE E COLE TUDO NO SQL EDITOR DO SUPABASE
-- ============================================================
-- SEGURO para produção com usuários online:
-- ✅ Apenas CREATE — não modifica tabelas existentes
-- ✅ IF NOT EXISTS — idempotente, pode rodar várias vezes
-- ✅ Zero downtime
-- ============================================================

-- ==================== TROCA DE ESCALA ====================

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

ALTER TABLE public.swap_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "swap_select_all" ON public.swap_requests;
CREATE POLICY "swap_select_all" ON public.swap_requests
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "swap_insert_auth" ON public.swap_requests;
CREATE POLICY "swap_insert_auth" ON public.swap_requests
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "swap_update_auth" ON public.swap_requests;
CREATE POLICY "swap_update_auth" ON public.swap_requests
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_swap_requests_date ON public.swap_requests(date);
CREATE INDEX IF NOT EXISTS idx_swap_requests_status ON public.swap_requests(status);
CREATE INDEX IF NOT EXISTS idx_swap_requests_requester ON public.swap_requests(requester_id);

-- ==================== NOTIFICAÇÕES DO ADMIN ====================

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'manual' CHECK (type IN ('manual', 'swap', 'escala', 'aniversario')),
  target text NOT NULL DEFAULT 'all' CHECK (target IN ('all', 'admins')),
  scheduled_at timestamp with time zone,
  sent boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_select_all" ON public.admin_notifications;
CREATE POLICY "notif_select_all" ON public.admin_notifications
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "notif_insert_admin" ON public.admin_notifications;
CREATE POLICY "notif_insert_admin" ON public.admin_notifications
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "notif_update_admin" ON public.admin_notifications;
CREATE POLICY "notif_update_admin" ON public.admin_notifications
  FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "notif_delete_admin" ON public.admin_notifications;
CREATE POLICY "notif_delete_admin" ON public.admin_notifications
  FOR DELETE USING (auth.role() = 'authenticated');

-- ==================== CONFIG DE NOTIFICAÇÕES ====================

CREATE TABLE IF NOT EXISTS public.notification_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  auto_escala boolean NOT NULL DEFAULT true,
  auto_swap boolean NOT NULL DEFAULT true,
  auto_aniversario boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_settings_select" ON public.notification_settings;
CREATE POLICY "notif_settings_select" ON public.notification_settings
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "notif_settings_insert" ON public.notification_settings;
CREATE POLICY "notif_settings_insert" ON public.notification_settings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "notif_settings_update" ON public.notification_settings;
CREATE POLICY "notif_settings_update" ON public.notification_settings
  FOR UPDATE USING (auth.role() = 'authenticated');

-- ==================== TOKENS DE PUSH ====================

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'unknown',
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_tokens_select" ON public.push_tokens;
CREATE POLICY "push_tokens_select" ON public.push_tokens
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "push_tokens_insert" ON public.push_tokens;
CREATE POLICY "push_tokens_insert" ON public.push_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_tokens_update" ON public.push_tokens;
CREATE POLICY "push_tokens_update" ON public.push_tokens
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.push_tokens(user_id);

-- ==================== FIM ====================
-- Se aparecer "Success. No rows returned" está tudo certo!
