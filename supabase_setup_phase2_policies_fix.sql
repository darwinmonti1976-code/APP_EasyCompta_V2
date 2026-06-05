-- EasyCompta V2 — Phase 2 Policy Fix
-- Run this AFTER supabase_setup_phase2_tables.sql
-- Fixes: pending invitations not visible (user_id IS NULL fails user_id = auth.uid())

-- ─── workspace_members ───────────────────────────────────────────────────────

-- Owners can fully manage their workspace's member list.
DROP POLICY IF EXISTS "owners_manage_members" ON workspace_members;
CREATE POLICY "owners_manage_members" ON workspace_members
  FOR ALL USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );

-- Old SELECT policy only matched accepted members (user_id = auth.uid()).
-- Pending invitations have user_id = NULL, so invited users could not see them.
-- Fix: also allow SELECT when invited_email matches the authenticated user's JWT email.
DROP POLICY IF EXISTS "users_see_own_invitations" ON workspace_members;
CREATE POLICY "users_see_own_invitations" ON workspace_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR invited_email = (auth.jwt() ->> 'email')
  );

-- Old UPDATE policy blocked acceptance because user_id was still NULL at that point.
DROP POLICY IF EXISTS "invited_user_accept" ON workspace_members;
CREATE POLICY "invited_user_accept" ON workspace_members
  FOR UPDATE USING (
    user_id = auth.uid()
    OR (user_id IS NULL AND invited_email = (auth.jwt() ->> 'email'))
  );


-- ─── workspaces ──────────────────────────────────────────────────────────────

-- Old policy only let owners read their workspaces.
-- Invited users need to see the workspace name/type in the pending invitation card.
-- We add a separate SELECT-only policy for invited/accepted members.
-- The existing ALL policy for owners is kept unchanged.

DROP POLICY IF EXISTS "members_see_their_workspaces" ON workspaces;
CREATE POLICY "members_see_their_workspaces" ON workspaces
  FOR SELECT USING (
    id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
         OR invited_email = (auth.jwt() ->> 'email')
    )
  );
