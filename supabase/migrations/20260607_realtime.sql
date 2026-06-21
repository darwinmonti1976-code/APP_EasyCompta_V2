-- ─────────────────────────────────────────────────────────────
-- Activer Supabase Realtime sur la table transactions
--
-- À exécuter dans : Dashboard → SQL Editor
--
-- Cela permet aux clients abonnés via supabase.channel() de
-- recevoir les événements INSERT / UPDATE / DELETE en temps réel,
-- ce qui alimente la sync dans les workspaces partagés (famille,
-- entreprise).
-- ─────────────────────────────────────────────────────────────

-- Ajoute transactions à la publication Realtime (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;
end;
$$;
