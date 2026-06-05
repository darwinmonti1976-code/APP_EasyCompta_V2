-- EasyCompta V2 — Phase 2 SQL
-- Run AFTER supabase_setup.sql in the Supabase SQL editor

-- 1. workspace_members (shared workspace access + invitations)
CREATE TABLE IF NOT EXISTS workspace_members (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT now(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_email TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted'))
);

CREATE INDEX IF NOT EXISTS wm_user_idx  ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS wm_email_idx ON workspace_members(invited_email);
CREATE INDEX IF NOT EXISTS wm_ws_idx    ON workspace_members(workspace_id);

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- Workspace owners can manage their own workspace members
CREATE POLICY "owners_manage_members" ON workspace_members
  FOR ALL USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );

-- Users can see and accept invitations sent to their email
CREATE POLICY "users_see_own_invitations" ON workspace_members
  FOR SELECT USING (user_id = auth.uid());

-- Invited users (matched by email on acceptance, done via function below) can update their own record
CREATE POLICY "invited_user_accept" ON workspace_members
  FOR UPDATE USING (user_id = auth.uid() OR user_id IS NULL);


-- 2. Add new columns to transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS created_by_email TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS attachment_url   TEXT;


-- 3. Update transactions RLS to allow shared workspace reads
--    Drop the old all-in-one policy and split by operation
DROP POLICY IF EXISTS "Users can manage their own transactions" ON transactions;

CREATE POLICY "users_read_workspace_transactions" ON transactions
  FOR SELECT USING (
    user_id = auth.uid()
    OR workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND status = 'accepted'
    )
  );

CREATE POLICY "users_insert_own_transactions" ON transactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_update_own_transactions" ON transactions
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "users_delete_own_transactions" ON transactions
  FOR DELETE USING (user_id = auth.uid());


-- 4. Supabase Storage — run via Dashboard > Storage
--    Create a bucket named "transaction-photos"
--    Set it to PUBLIC (so attachment_url links work directly)
--
-- Or run this SQL if you have storage schema access:
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('transaction-photos', 'transaction-photos', true)
-- ON CONFLICT (id) DO NOTHING;
--
-- Storage RLS (run in Dashboard > Storage > transaction-photos > Policies):
-- Allow SELECT for all (public bucket)
-- Allow INSERT for authenticated users where (bucket_id = 'transaction-photos' AND auth.uid()::text = (storage.foldername(name))[1])
-- Allow DELETE for authenticated users where (auth.uid()::text = (storage.foldername(name))[1])
