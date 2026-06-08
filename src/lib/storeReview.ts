import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@easycompta_tx_count';
const THRESHOLDS = [10, 30, 60, 100];

export async function maybeRequestReview(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const count = (parseInt(raw ?? '0', 10) || 0) + 1;
    await AsyncStorage.setItem(KEY, String(count));

    if (!THRESHOLDS.includes(count)) return;

    // Dynamic import to avoid build errors if expo-store-review is unavailable
    const StoreReview = await import('expo-store-review').catch(() => null);
    if (!StoreReview) return;
    if (!(await StoreReview.isAvailableAsync())) return;

    await StoreReview.requestReview();
  } catch {
    // never block the save flow
  }
}
