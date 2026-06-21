-- EasyCompta V2 — RLS Circular Dependency Fix
-- Run this in Supabase SQL Editor.
--
-- Root cause: infinite recursion
--   SELECT workspaces → members_see_their_workspaces → SELECT workspace_members
--   SELECT workspace_members → owners_manage_members  → SELECT workspaces  → loop
--
-- Fix: one SECURITY DEFINER function breaks the cycle.
--      SECURITY DEFINER = the function body runs without RLS, so no re-entry.

-- ─── Step 1: remove the two policies that form the cycle ─────────────────────

DROP POLICY IF EXISTS "members_see_their_workspaces" ON workspaces;
DROP POLICY IF EXISTS "owners_manage_members"         ON workspace_members;
DROP POLICY IF EXISTS "users_see_own_invitations"     ON workspace_members;
DROP POLICY IF EXISTS "invited_user_accept"           ON workspace_members;


-- ─── Step 2: helper function (no RLS inside) ─────────────────────────────────

CREATE OR REPLACE FUNCTION is_workspace_owner(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspaces WHERE id = ws_id AND owner_id = auth.uid()
  );
$$;


-- ─── Step 3: workspace_members policies (no direct workspaces subquery) ───────

-- Owners and own-invitation rows
CREATE POLICY "members_policy" ON workspace_members
  FOR SELECT USING (
    is_workspace_owner(workspace_id)       -- owner sees all rows for their workspace
    OR user_id = auth.uid()                -- accepted member sees their own row
    OR invited_email = (auth.jwt() ->> 'email')  -- invited user sees their pending row
  );

-- Only owners can insert / update / delete member rows
CREATE POLICY "owners_write_members" ON workspace_members
  FOR INSERT WITH CHECK (is_workspace_owner(workspace_id));

CREATE POLICY "owners_modify_members" ON workspace_members
  FOR UPDATE USING (
    is_workspace_owner(workspace_id)
    OR (user_id IS NULL AND invited_email = (auth.jwt() ->> 'email'))
  );

CREATE POLICY "owners_delete_members" ON workspace_members
  FOR DELETE USING (is_workspace_owner(workspace_id));


-- ─── Step 4: workspaces SELECT for members (safe now — workspace_members ──────
--            SELECT no longer loops back through workspaces)

CREATE POLICY "members_see_their_workspaces" ON workspaces
  FOR SELECT USING (
    id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
         OR invited_email = (auth.jwt() ->> 'email')
    )
  );
