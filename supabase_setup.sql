-- EasyCompta V2 — Supabase Setup
-- Run this in your Supabase SQL editor

-- Workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('personal', 'family', 'business')),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CHF',
  type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'debt', 'transfer')),
  category TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT 'unknown' CHECK (payment_method IN ('cash', 'card', 'transfer', 'unknown')),
  scope TEXT NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal', 'business', 'family')),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  description_raw TEXT DEFAULT '',
  description_clean TEXT DEFAULT '',
  has_attachment BOOLEAN DEFAULT false,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Row Level Security
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Workspaces: users can only access their own
CREATE POLICY "Users can manage their own workspaces"
  ON workspaces
  FOR ALL
  USING (owner_id = auth.uid());

-- Transactions: users can only access their own
CREATE POLICY "Users can manage their own transactions"
  ON transactions
  FOR ALL
  USING (user_id = auth.uid());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON transactions(user_id);
CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON transactions(created_at DESC);
