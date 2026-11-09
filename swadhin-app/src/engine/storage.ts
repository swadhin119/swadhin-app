import AsyncStorage from "@react-native-async-storage/async-storage";

export async function getJSON<T>(key: string, fallback: T): Promise<T> {
  try { const s = await AsyncStorage.getItem(key); return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}
export async function setJSON(key: string, value: unknown): Promise<void> {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch { /* disk full etc: ignore */ }
}
export async function removeKeys(prefix: string): Promise<void> {
  try { const ks = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix)); if (ks.length) await AsyncStorage.multiRemove(ks); } catch { /* ignore */ }
}
export { AsyncStorage };
