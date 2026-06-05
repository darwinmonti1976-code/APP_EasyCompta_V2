-- EasyCompta V2 — Phase 2 Complete Setup
-- Single file, correct order. Safe to re-run (IF NOT EXISTS / DROP IF EXISTS guards).
-- Run this in Supabase SQL Editor AFTER supabase_setup.sql.

-- ─── 1. workspace_members table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace_members (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    TIMESTAMPTZ DEFAULT now(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_email TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted'))
);

CREATE INDEX IF NOT EXISTS wm_user_idx  ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS wm_email_idx ON workspace_members(invited_email);
CREATE INDEX IF NOT EXISTS wm_ws_idx    ON workspace_members(workspace_id);

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;


-- ─── 2. transactions — Phase 2 columns ───────────────────────────────────────

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS created_by_email TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS attachment_url   TEXT;


-- ─── 3. workspace_members policies ───────────────────────────────────────────

-- Owners can fully manage their workspace member list
DROP POLICY IF EXISTS "owners_manage_members" ON workspace_members;
CREATE POLICY "owners_manage_members" ON workspace_members
  FOR ALL USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );

-- Invited/accepted users can see their own invitations
DROP POLICY IF EXISTS "users_see_own_invitations" ON workspace_members;
CREATE POLICY "users_see_own_invitations" ON workspace_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR invited_email = (auth.jwt() ->> 'email')
  );

-- Invited users can accept their invitation (user_id is NULL until accepted)
DROP POLICY IF EXISTS "invited_user_accept" ON workspace_members;
CREATE POLICY "invited_user_accept" ON workspace_members
  FOR UPDATE USING (
    user_id = auth.uid()
    OR (user_id IS NULL AND invited_email = (auth.jwt() ->> 'email'))
  );


-- ─── 4. workspaces policies ──────────────────────────────────────────────────

-- Members (accepted or pending) can read the workspace they belong to
-- NOTE: this policy must come AFTER workspace_members table is created
DROP POLICY IF EXISTS "members_see_their_workspaces" ON workspaces;
CREATE POLICY "members_see_their_workspaces" ON workspaces
  FOR SELECT USING (
    id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
         OR invited_email = (auth.jwt() ->> 'email')
    )
  );


-- ─── 5. transactions RLS — split by operation ────────────────────────────────

DROP POLICY IF EXISTS "Users can manage their own transactions"  ON transactions;
DROP POLICY IF EXISTS "users_read_workspace_transactions"        ON transactions;
DROP POLICY IF EXISTS "users_insert_own_transactions"            ON transactions;
DROP POLICY IF EXISTS "users_update_own_transactions"            ON transactions;
DROP POLICY IF EXISTS "users_delete_own_transactions"            ON transactions;

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
