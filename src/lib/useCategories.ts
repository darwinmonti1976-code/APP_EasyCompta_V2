import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_CATEGORIES = [
  'Courses', 'Restaurant', 'Transport', 'Logement',
  'Santé', 'Loisirs', 'Shopping', 'Salaire', 'Abonnements', 'Autre',
];

const key = (wsId: string) => `@cats_${wsId}`;

export function useCategories(workspaceId: string | undefined) {
  const [custom, setCustom] = useState<string[]>([]);

  useEffect(() => {
    if (!workspaceId) return;
    AsyncStorage.getItem(key(workspaceId)).then(raw => {
      setCustom(raw ? (JSON.parse(raw) as string[]) : []);
    });
  }, [workspaceId]);

  const persist = useCallback(async (next: string[]) => {
    if (!workspaceId) return;
    setCustom(next);
    await AsyncStorage.setItem(key(workspaceId), JSON.stringify(next));
  }, [workspaceId]);

  const addCategory = useCallback(async (name: string) => {
    const t = name.trim();
    if (!t || DEFAULT_CATEGORIES.includes(t) || custom.includes(t)) return;
    await persist([...custom, t]);
  }, [custom, persist]);

  const removeCategory = useCallback(async (name: string) => {
    await persist(custom.filter(c => c !== name));
  }, [custom, persist]);

  return {
    categories: [...DEFAULT_CATEGORIES, ...custom] as string[],
    custom,
    addCategory,
    removeCategory,
  };
}
