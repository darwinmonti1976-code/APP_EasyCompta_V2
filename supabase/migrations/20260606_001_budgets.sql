-- ─────────────────────────────────────────────────────────────
-- Table: budgets
-- Stocke les plafonds de budget par catégorie et par workspace
-- ─────────────────────────────────────────────────────────────

create table if not exists public.budgets (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category     text not null,
  amount       numeric(12, 2) not null check (amount >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint budgets_workspace_category_unique unique (workspace_id, category)
);

-- Mise à jour automatique de updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger budgets_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Helper : vérifie qu'un utilisateur est propriétaire ou membre
--          accepté d'un workspace
-- ─────────────────────────────────────────────────────────────

create or replace function public.is_workspace_member(
  p_workspace_id uuid,
  p_user_id      uuid
)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    -- Propriétaire du workspace
    select 1 from public.workspaces
    where id = p_workspace_id and owner_id = p_user_id
    union all
    -- Membre accepté
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = p_user_id
      and status = 'accepted'
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────

alter table public.budgets enable row level security;

-- Les membres du workspace peuvent lire et écrire les budgets
create policy "members can manage budgets"
  on public.budgets
  for all
  using  (public.is_workspace_member(workspace_id, auth.uid()))
  with check (public.is_workspace_member(workspace_id, auth.uid()));
