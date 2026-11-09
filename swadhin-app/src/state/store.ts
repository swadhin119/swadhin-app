import { useSyncExternalStore } from "react";
import { getJSON, setJSON } from "../engine/storage";
import { DEFAULT_SOURCE, setSource, warmUp } from "../engine/engine";
import type { AltGroup } from "../engine/fallback";

export interface ListItem { provider: string; link: string; title: string; image: string }
export interface HistItem extends ListItem { key: string; pos: number; dur: number; t: number; epTitle?: string; epLink?: string; epType?: "movie" | "series" }
interface State { ready: boolean; provider: string; source: string; watchlist: ListItem[]; history: Record<string, HistItem> }

let state: State = { ready: false, provider: "hdhub4u", source: DEFAULT_SOURCE, watchlist: [], history: {} };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const persist = () => void setJSON("app-state", { provider: state.provider, source: state.source, watchlist: state.watchlist, history: state.history });
const set = (p: Partial<State>, save = true) => { state = { ...state, ...p }; emit(); if (save) persist(); };

export const useApp = <T,>(sel: (s: State) => T): T => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => sel(state));
export const getState = () => state;
export const itemKey = (provider: string, link: string) => provider + "|" + link;

export async function hydrate() {
  let s: Partial<State> = {};
  try { s = await Promise.race([getJSON<Partial<State>>("app-state", {}), new Promise<Partial<State>>((ok) => setTimeout(() => ok({}), 4000))]); } catch { s = {}; }
  const source = typeof s.source === "string" && s.source ? s.source : DEFAULT_SOURCE;
  try { setSource(source); } catch { /* ignore */ }
  set({ ready: true, provider: s.provider || "hdhub4u", source,
    watchlist: Array.isArray(s.watchlist) ? s.watchlist : [], history: s.history && typeof s.history === "object" ? s.history : {} }, false);
  warmUp(state.provider);
}
export const setProvider = (provider: string) => { set({ provider }); warmUp(provider); };
export const changeSource = (source: string) => { setSource(source); set({ source: source || DEFAULT_SOURCE }); };
export const inWatchlist = (s: State, provider: string, link: string) => s.watchlist.some((x) => x.provider === provider && x.link === link);
export const toggleWatchlist = (it: ListItem) => {
  const has = inWatchlist(state, it.provider, it.link);
  set({ watchlist: has ? state.watchlist.filter((x) => !(x.provider === it.provider && x.link === it.link)) : [it, ...state.watchlist] });
};
let lastSave = 0;
export function saveProgress(h: Omit<HistItem, "t" | "key">, force = false) {
  const now = Date.now(); if (!force && now - lastSave < 5000) return; lastSave = now;
  const key = itemKey(h.provider, h.link);
  const hist = { ...state.history, [key]: { ...h, key, t: now } };
  const keys = Object.keys(hist); if (keys.length > 80) { keys.sort((a, b) => hist[a].t - hist[b].t); delete hist[keys[0]]; }
  set({ history: hist });
}
export const removeHistory = (key: string) => { const h = { ...state.history }; delete h[key]; set({ history: h }); };
export const clearHistory = () => set({ history: {} });
export const historyList = (s: State) => Object.values(s.history).sort((a, b) => b.t - a.t);

// Player ko kya chalana hai (screen ke beech me data pass karne ke liye)
export interface PlayItem { title: string; link: string; type: "movie" | "series" }
export interface PlaySession {
  provider: string; detailLink: string; title: string; image: string; items: PlayItem[]; index: number;
  type?: "movie" | "series"; groups?: AltGroup[]; groupIdx?: number; // auto source badalne ke liye
}
let session: PlaySession | null = null;
export const setSession = (s: PlaySession) => { session = s; };
export const getSession = () => session;
