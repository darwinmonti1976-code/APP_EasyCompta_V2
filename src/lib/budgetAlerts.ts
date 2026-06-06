import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const CHANNEL_ID = 'budget';

async function ensureChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Alertes budgets',
      description: 'Notifications quand un budget est presque atteint ou dépassé',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

/**
 * Fires an immediate push notification if adding `newAmount` to the current
 * month's spending for `category` crosses the 80% or 100% budget threshold.
 * No-ops if no budget is set for that category.
 * Call fire-and-forget (.catch(() => {})) — never awaited on the hot path.
 */
export async function checkBudgetAlert(
  workspaceId: string,
  category: string,
  newAmount: number,
): Promise<void> {
  const { data: budgetRow } = await supabase
    .from('budgets')
    .select('amount')
    .eq('workspace_id', workspaceId)
    .eq('category', category)
    .single();

  if (!budgetRow) return;

  const budget = budgetRow.amount as number;

  const now = new Date();
  const fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const { data: txData } = await supabase
    .from('transactions')
    .select('amount')
    .eq('workspace_id', workspaceId)
    .eq('category', category)
    .eq('type', 'expense')
    .gte('date', fromDate);

  if (!txData) return;

  const spent = txData.reduce((s, t) => s + (t.amount as number), 0);
  const spentBefore = spent - newAmount;
  const pctNow    = spent / budget;
  const pctBefore = spentBefore / budget;

  if (pctNow >= 1 && pctBefore < 1) {
    await ensureChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Budget dépassé !',
        body: `${category} : ${spent.toFixed(0)} / ${budget.toFixed(0)} CHF`,
        data: { notifType: 'budget_exceeded' },
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: null,
    });
  } else if (pctNow >= 0.8 && pctBefore < 0.8) {
    await ensureChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Budget bientôt atteint',
        body: `${category} : ${Math.round(pctNow * 100)}% utilisé (${spent.toFixed(0)} / ${budget.toFixed(0)} CHF)`,
        data: { notifType: 'budget_warning' },
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: null,
    });
  }
}
