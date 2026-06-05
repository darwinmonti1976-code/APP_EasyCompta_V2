-- EasyCompta V2 — Phase 2 Tables Migration
-- Run this AFTER supabase_setup.sql
-- Safe to re-run: all statements use IF NOT EXISTS / IF EXISTS guards

-- ─── workspace_members ───────────────────────────────────────────────────────

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


-- ─── transactions — add Phase 2 columns ──────────────────────────────────────

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS created_by_email TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS attachment_url   TEXT;


-- ─── transactions RLS — split by operation (shared workspace support) ─────────

-- Drop the old catch-all policy from Phase 1
DROP POLICY IF EXISTS "Users can manage their own transactions" ON transactions;

-- Re-create split policies (idempotent via DROP IF EXISTS first)
DROP POLICY IF EXISTS "users_read_workspace_transactions"  ON transactions;
DROP POLICY IF EXISTS "users_insert_own_transactions"      ON transactions;
DROP POLICY IF EXISTS "users_update_own_transactions"      ON transactions;
DROP POLICY IF EXISTS "users_delete_own_transactions"      ON transactions;

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
