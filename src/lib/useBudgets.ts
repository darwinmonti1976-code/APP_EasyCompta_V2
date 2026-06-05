import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type BudgetMap = Record<string, number>; // category -> monthly amount

function key(workspaceId: string) {
  return `@budgets_${workspaceId}`;
}

export function useBudgets(workspaceId: string | undefined) {
  const [budgets, setBudgets] = useState<BudgetMap>({});

  const load = useCallback(async () => {
    if (!workspaceId) return;
    const raw = await AsyncStorage.getItem(key(workspaceId));
    if (raw) setBudgets(JSON.parse(raw));
  }, [workspaceId]);

  const setBudget = useCallback(async (category: string, amount: number) => {
    if (!workspaceId) return;
    const updated = { ...budgets, [category]: amount };
    setBudgets(updated);
    await AsyncStorage.setItem(key(workspaceId), JSON.stringify(updated));
  }, [workspaceId, budgets]);

  const removeBudget = useCallback(async (category: string) => {
    if (!workspaceId) return;
    const updated = { ...budgets };
    delete updated[category];
    setBudgets(updated);
    await AsyncStorage.setItem(key(workspaceId), JSON.stringify(updated));
  }, [workspaceId, budgets]);

  return { budgets, load, setBudget, removeBudget };
}
