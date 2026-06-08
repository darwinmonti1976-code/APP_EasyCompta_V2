import { NativeModules } from 'react-native';

interface WidgetBridgeNative {
  updateWidget(income: number, expense: number, currency: string): Promise<void>;
}

const native: WidgetBridgeNative | null = NativeModules.WidgetBridge ?? null;

export async function updateWidget(
  income: number,
  expense: number,
  currency: string,
): Promise<void> {
  if (!native) return;
  await native.updateWidget(income, expense, currency);
}
