// Player preferences that should survive between videos / app launches
import { useSyncExternalStore } from "react";
import { getJSON, setJSON } from "../engine/storage";

export type Aspect = "fit" | "fill" | "stretch" | "16:9" | "4:3" | "21:9";
export type Repeat = "off" | "one" | "all";
export interface Prefs {
  aspect: Aspect;
  subScale: number; subColor: string; subBold: boolean; subOutline: boolean; subBgAlpha: number; subBottom: number;
  skipSec: number; repeat: Repeat; autoNext: boolean; background: boolean; remaining: boolean; night: boolean;
  gSeek: boolean; gSide: boolean; gLong: boolean; gDouble: boolean; gPinch: boolean;
}
export const DEFAULT_PREFS: Prefs = {
  aspect: "fit", subScale: 1, subColor: "#ffffff", subBold: true, subOutline: true, subBgAlpha: 0.35, subBottom: 28,
  skipSec: 10, repeat: "off", autoNext: true, background: false, remaining: false, night: false,
  gSeek: true, gSide: true, gLong: true, gDouble: true, gPinch: true,
};
let prefs: Prefs = { ...DEFAULT_PREFS };
let loaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export async function loadPrefs() {
  if (loaded) return; loaded = true;
  const p = await getJSON<Partial<Prefs>>("playerPrefs", {});
  prefs = { ...DEFAULT_PREFS, ...p }; emit();
}
export const setPrefs = (p: Partial<Prefs>) => { prefs = { ...prefs, ...p }; emit(); void setJSON("playerPrefs", prefs); };
export const usePrefs = (): Prefs => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => prefs);
