// Player preferences that should survive between videos / app launches
import { useSyncExternalStore } from "react";
import { getJSON, setJSON } from "../engine/storage";

export type Aspect = "fit" | "fill" | "stretch";
export interface Prefs { aspect: Aspect; subScale: number; subBg: boolean }
let prefs: Prefs = { aspect: "fit", subScale: 1, subBg: true };
let loaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export async function loadPrefs() {
  if (loaded) return; loaded = true;
  const p = await getJSON<Partial<Prefs>>("playerPrefs", {});
  prefs = { ...prefs, ...p }; emit();
}
export const setPrefs = (p: Partial<Prefs>) => { prefs = { ...prefs, ...p }; emit(); void setJSON("playerPrefs", prefs); };
export const usePrefs = (): Prefs => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => prefs);
