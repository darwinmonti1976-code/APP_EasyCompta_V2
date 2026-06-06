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
      url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/invite-member',
      headers := jsonb_build_object(
        'Authorization', 'Bearer YOUR_SERVICE_KEY',
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
