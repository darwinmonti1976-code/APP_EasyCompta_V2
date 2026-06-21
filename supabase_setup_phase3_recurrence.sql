-- EasyCompta V2 — Phase 3: Recurring Transactions
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_recurring       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_interval TEXT    CHECK (recurrence_interval IN ('daily', 'weekly', 'monthly', 'yearly')),
  ADD COLUMN IF NOT EXISTS next_due_date      DATE;

CREATE INDEX IF NOT EXISTS tx_recurring_idx ON transactions (workspace_id, next_due_date)
  WHERE is_recurring = true;
