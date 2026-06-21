-- ─────────────────────────────────────────────────────────────
-- Webhook trigger : appelle l'Edge Function invite-member
-- à chaque INSERT dans workspace_members
--
-- ⚠️  AVANT D'EXÉCUTER : remplace les deux placeholders ci-dessous
--   YOUR_PROJECT_REF  → Dashboard → Settings → General → Reference ID
--   YOUR_SERVICE_KEY  → Dashboard → Settings → API → service_role (secret)
-- ─────────────────────────────────────────────────────────────

-- pg_net est préinstallé sur tous les projets Supabase
create extension if not exists pg_net schema extensions;

-- Fonction appelée par le trigger
create or replace function public.trigger_invite_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- N'envoie l'email que pour les nouvelles invitations en attente
  if new.status = 'pending' and new.invited_email is not null then
    perform net.http_post(
      url     := 'https://uhmkozvmvbgumhxtcfoq.supabase.co/functions/v1/invite-member',
      headers := jsonb_build_object(
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVobWtvenZtdmJndW1oeHRjZm9xIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgwMDk3OCwiZXhwIjoyMDk1Mzc2OTc4fQ.OQbInQpmHxxWXnySp16Pyu_8ars_7BVFWnRjFhbb-Dg',
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object('record', row_to_json(new))
    );
  end if;
  return new;
end;
$$;

-- Trigger sur workspace_members
drop trigger if exists on_workspace_member_insert on public.workspace_members;

create trigger on_workspace_member_insert
  after insert on public.workspace_members
  for each row execute function public.trigger_invite_member();
