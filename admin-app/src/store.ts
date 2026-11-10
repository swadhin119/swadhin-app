import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { Conn } from "./github";

const KEY = "swadhin-admin-conn";
export async function loadConn(): Promise<Conn | null> {
  try {
    const raw = Platform.OS === "web" ? window.localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as Conn) : null;
  } catch { return null; }
}
export async function saveConn(c: Conn) {
  const raw = JSON.stringify(c);
  if (Platform.OS === "web") window.localStorage.setItem(KEY, raw); else await SecureStore.setItemAsync(KEY, raw);
}
export async function clearConn() {
  if (Platform.OS === "web") window.localStorage.removeItem(KEY); else await SecureStore.deleteItemAsync(KEY);
}
