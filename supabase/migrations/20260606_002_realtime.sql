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

-- Ajoute transactions à la publication Realtime
alter publication supabase_realtime add table public.transactions;

-- Vérification (optionnel) : liste les tables dans la publication
-- select * from pg_publication_tables where pubname = 'supabase_realtime';
