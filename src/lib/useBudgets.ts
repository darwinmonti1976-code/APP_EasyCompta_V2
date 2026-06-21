import { useState, useCallback } from 'react';
import { supabase } from './supabase';

type BudgetMap = Record<string, number>; // category -> monthly amount

export function useBudgets(workspaceId: string | undefined) {
  const [budgets, setBudgets] = useState<BudgetMap>({});

  const load = useCallback(async () => {
    if (!workspaceId) return;
    const { data } = await supabase
      .from('budgets')
      .select('category, amount')
      .eq('workspace_id', workspaceId);
    if (data) {
      const map: BudgetMap = {};
      for (const row of data) map[row.category] = row.amount;
      setBudgets(map);
    }
  }, [workspaceId]);

  const setBudget = useCallback(async (category: string, amount: number) => {
    if (!workspaceId) return;
    setBudgets(prev => ({ ...prev, [category]: amount }));
    await supabase
      .from('budgets')
      .upsert(
        { workspace_id: workspaceId, category, amount },
        { onConflict: 'workspace_id,category' }
      );
  }, [workspaceId]);

  const removeBudget = useCallback(async (category: string) => {
    if (!workspaceId) return;
    setBudgets(prev => {
      const next = { ...prev };
      delete next[category];
      return next;
    });
    await supabase
      .from('budgets')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('category', category);
  }, [workspaceId]);

  return { budgets, load, setBudget, removeBudget };
}
