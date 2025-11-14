
-- Escala de Ministros – Schema Supabase (Postgres)
-- Execute no SQL Editor do projeto novo.

-- Extensões úteis
create extension if not exists "uuid-ossp";

-- PERFIS (ligado a auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamp with time zone default now()
);

alter table public.profiles enable row level security;

-- Função helper para RLS
create or replace function public.fn_is_admin(uid uuid default auth.uid())
returns boolean language sql stable as $$
  select coalesce((select is_admin from public.profiles p where p.id = uid), false);
$$;

-- MINISTERS (podemos usar profiles como ministros, mas mantemos tabela própria para administrar nomes independentes se necessário)
create table if not exists public.ministers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  phone text,
  is_active boolean not null default true,
  is_admin boolean not null default false,
  created_at timestamp with time zone default now()
);
alter table public.ministers enable row level security;

-- HORÁRIOS FIXOS
create table if not exists public.horarios (
  id uuid primary key default uuid_generate_v4(),
  weekday int not null check (weekday between 0 and 6),
  time_hhmm text not null,
  min_required int not null default 2,
  max_allowed int not null default 4,
  is_active boolean not null default true,
  created_at timestamp with time zone default now()
);
alter table public.horarios enable row level security;

-- MISSAS EXTRAS
create table if not exists public.extras (
  id uuid primary key default uuid_generate_v4(),
  date_ymd date not null,
  time_hhmm text not null,
  name text not null,
  min_required int not null default 2,
  max_allowed int not null default 4,
  created_at timestamp with time zone default now(),
  unique (date_ymd, time_hhmm, name)
);
alter table public.extras enable row level security;

-- DISPONIBILIDADE
create table if not exists public.availability (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  minister_id uuid references public.ministers(id) on delete set null,
  date_ymd date not null,
  time_hhmm text not null,
  is_extra boolean not null default false,
  created_at timestamp with time zone default now(),
  unique (coalesce(minister_id, user_id), date_ymd, time_hhmm)
);
alter table public.availability enable row level security;

-- VIEW para listar disponibilidade com nomes
create or replace view public.v_availability as
select a.id, a.user_id, a.minister_id,
       coalesce(m.name, '—') as minister_name,
       a.date_ymd::text as date_ymd, a.time_hhmm, a.is_extra
from public.availability a
left join public.ministers m on m.id = a.minister_id;

-- RLS POLICIES
-- profiles: o usuário vê e altera seu próprio perfil; admins leem todos
drop policy if exists "profiles_select_self_admin" on public.profiles;
create policy "profiles_select_self_admin" on public.profiles
for select using ( auth.uid() = id or fn_is_admin() );

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
for update using ( auth.uid() = id );

-- ministers: todos autenticados leem; apenas admins escrevem
drop policy if exists "ministers_select_all" on public.ministers;
create policy "ministers_select_all" on public.ministers
for select using ( auth.role() = 'authenticated' );

drop policy if exists "ministers_write_admin" on public.ministers;
create policy "ministers_write_admin" on public.ministers
for all to authenticated using ( fn_is_admin() ) with check ( fn_is_admin() );

-- horarios: idem
drop policy if exists "horarios_select_all" on public.horarios;
create policy "horarios_select_all" on public.horarios
for select using ( auth.role() = 'authenticated' );

drop policy if exists "horarios_write_admin" on public.horarios;
create policy "horarios_write_admin" on public.horarios
for all to authenticated using ( fn_is_admin() ) with check ( fn_is_admin() );

-- extras: idem
drop policy if exists "extras_select_all" on public.extras;
create policy "extras_select_all" on public.extras
for select using ( auth.role() = 'authenticated' );

drop policy if exists "extras_write_admin" on public.extras;
create policy "extras_write_admin" on public.extras
for all to authenticated using ( fn_is_admin() ) with check ( fn_is_admin() );

-- availability: todos autenticados leem; usuário escreve na sua linha; admin escreve em todas
drop policy if exists "availability_select_all" on public.availability;
create policy "availability_select_all" on public.availability
for select using ( auth.role() = 'authenticated' );

drop policy if exists "availability_insert_self_or_admin" on public.availability;
create policy "availability_insert_self_or_admin" on public.availability
for insert with check ( user_id = auth.uid() or fn_is_admin() );

drop policy if exists "availability_update_self_or_admin" on public.availability;
create policy "availability_update_self_or_admin" on public.availability
for update using ( user_id = auth.uid() or fn_is_admin() );

drop policy if exists "availability_delete_self_or_admin" on public.availability;
create policy "availability_delete_self_or_admin" on public.availability
for delete using ( user_id = auth.uid() or fn_is_admin() );

-- RPC para Escala do dia
create or replace function public.fn_escala_do_dia(p_date_ymd date)
returns table (
  time_hhmm text,
  evento text,
  confirmados int,
  min_required int,
  max_allowed int,
  status text
) language sql stable as $$
  with base as (
    select p_date_ymd as date_ymd, time_hhmm, false as is_extra, min_required, max_allowed, null::text as name
    from public.horarios
    where extract(dow from p_date_ymd) = weekday
    union all
    select date_ymd, time_hhmm, true, min_required, max_allowed, name
    from public.extras
    where date_ymd = p_date_ymd
  ),
  marcados as (
    select date_ymd, time_hhmm, count(*)::int as qtd
    from public.availability
    where date_ymd = p_date_ymd
    group by date_ymd, time_hhmm
  )
  select b.time_hhmm,
         coalesce(b.name,'') as evento,
         coalesce(m.qtd,0) as confirmados,
         b.min_required, b.max_allowed,
         case when coalesce(m.qtd,0) < b.min_required then 'ABAIXO'
              when coalesce(m.qtd,0) > b.max_allowed then 'ACIMA'
              else 'OK' end as status
  from base b
  left join marcados m on m.date_ymd=b.date_ymd and m.time_hhmm=b.time_hhmm
  order by b.time_hhmm, evento;
$$;

-- Usuário seed opcional: criar um ministro admin padrão
insert into public.ministers(name, phone, is_active, is_admin)
select 'Administrador', '(16) 99999-0000', true, true
where not exists (select 1 from public.ministers);
