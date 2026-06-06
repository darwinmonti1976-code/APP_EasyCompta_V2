import { NativeModules, Platform } from 'react-native';

interface WidgetBridgeNative {
  updateWidget: (income: number, expense: number, currency: string) => Promise<void>;
}

const native: WidgetBridgeNative | null = NativeModules.WidgetBridge ?? null;

export async function updateWidget(income: number, expense: number, currency: string): Promise<void> {
  if (!native) return; // Expo Go / web — no-op
  try {
    await native.updateWidget(income, expense, currency);
  } catch {
    // Non-fatal: widget simply won't refresh until next periodic update
  }
}
