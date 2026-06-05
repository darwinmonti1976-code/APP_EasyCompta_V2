import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Transaction } from './types';

const CHANNEL_ID = 'recurring';
const NOTIF_DATA_TYPE = 'recurring_reminder';

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Transactions récurrentes',
      description: 'Rappels pour les transactions récurrentes à confirmer',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleRecurringReminders(transactions: Transaction[]): Promise<void> {
  // Cancel all previously scheduled recurring reminders
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(n => n.content.data?.notifType === NOTIF_DATA_TYPE)
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );

  const now = new Date();
  const in30Days = new Date(now);
  in30Days.setDate(in30Days.getDate() + 30);

  const upcoming = transactions
    .filter(t => t.is_recurring && t.next_due_date)
    .filter(t => {
      const due = new Date(t.next_due_date!);
      return due > now && due <= in30Days;
    })
    .slice(0, 10); // stay well below iOS 64-notification limit

  for (const tx of upcoming) {
    const due = new Date(tx.next_due_date!);
    due.setHours(9, 0, 0, 0);

    if (due <= now) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '↻ Transaction récurrente',
        body: `${tx.description_clean} — ${tx.amount.toFixed(2)} ${tx.currency}`,
        data: { notifType: NOTIF_DATA_TYPE, txId: tx.id },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: due,
        channelId: CHANNEL_ID,
      },
    });
  }
}
