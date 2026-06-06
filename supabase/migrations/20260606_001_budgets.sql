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
-- RLS
-- ─────────────────────────────────────────────────────────────

alter table public.budgets enable row level security;

-- Les membres du workspace peuvent lire et écrire les budgets
create policy "members can manage budgets"
  on public.budgets
  for all
  using  (public.is_workspace_member(workspace_id, auth.uid()))
  with check (public.is_workspace_member(workspace_id, auth.uid()));
