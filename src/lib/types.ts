export type TransactionType = 'expense' | 'income' | 'debt' | 'transfer';
export type TransactionScope = 'personal' | 'business' | 'family';
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'unknown';
export type WorkspaceType = 'personal' | 'family' | 'business';
export type RecurrenceInterval = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Transaction {
  id: string;
  created_at: string;
  date: string;
  amount: number;
  currency: string;
  type: TransactionType;
  category: string;
  payment_method: PaymentMethod;
  scope: TransactionScope;
  workspace_id: string;
  description_raw: string;
  description_clean: string;
  has_attachment: boolean;
  attachment_url: string | null;
  created_by_email: string;
  user_id: string;
  is_recurring: boolean;
  recurrence_interval: RecurrenceInterval | null;
  next_due_date: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  owner_id: string;
}

export interface WorkspaceMember {
  id: string;
  created_at: string;
  workspace_id: string;
  user_id: string | null;
  invited_email: string;
  role: 'owner' | 'member';
  status: 'pending' | 'accepted';
  workspaces?: Workspace;
}

export interface ParsedTransaction {
  amount: number;
  currency: string;
  type: TransactionType;
  category: string;
  payment_method: PaymentMethod;
  scope: TransactionScope;
  description_clean: string;
  is_recurring: boolean;
  recurrence_interval: RecurrenceInterval | null;
}
