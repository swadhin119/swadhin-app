// Remote look & feel: app name, logo and colours come from app-config.json in the GitHub repo.
// The admin app edits that file. The app caches the last config on the phone, applies it BEFORE any screen is built
// (see src/boot.tsx), and checks for a newer one in the background (applied the next time the app opens).
import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { C } from "../theme";

export const CONFIG_URL = "https://raw.githubusercontent.com/swadhin119/swadhin-app/main/app-config.json";
const KEY = "appConfig.v1";
export const COLOR_KEYS = ["bg", "card", "card2", "line", "text", "sub", "accent", "accent2"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];
export interface PickItem { provider: string; link: string; title: string; image: string }
export interface SliderAd { id: string; image: string; url: string; title: string; cta: string }
export interface OpeningAd { enabled: boolean; id: string; image: string; url: string; skipAfter: number; frequency: "always" | "daily" | "once" }
export interface Announcement { enabled: boolean; text: string; url: string }
export interface Notice { id: string; title: string; body: string; url: string; sentAt: number }
export interface AppConfig {
  version: number; appName: string; tagline?: string; logoUrl?: string; colors: Partial<Record<ColorKey, string>>; updatedAt?: number;
  slider?: PickItem[]; recommendedTitle?: string; recommended?: PickItem[]; sliderAds?: SliderAd[]; sliderAdEvery?: number;
  openingAd?: OpeningAd; announcement?: Announcement; notification?: Notice;
}

export const brand = { name: "SWADHIN", tagline: "", logoUrl: "" };
/** Admin-managed content (manual slider, recommended row, ads, announcement). Filled by applyConfig(). */
export const remote: { slider: PickItem[]; recommendedTitle: string; recommended: PickItem[]; sliderAds: SliderAd[]; sliderAdEvery: number; openingAd: OpeningAd | null; announcement: Announcement | null; notification: Notice | null } =
  { slider: [], recommendedTitle: "Recommended for you", recommended: [], sliderAds: [], sliderAdEvery: 3, openingAd: null, announcement: null, notification: null };

// Every screen that shows admin content subscribes here, so a new config appears without restarting the app.
let ver = 0;
const rsubs = new Set<() => void>();
const bump = () => { ver++; rsubs.forEach((f) => f()); };
export const useRemote = (): number => useSyncExternalStore((cb) => { rsubs.add(cb); return () => rsubs.delete(cb); }, () => ver);
/** Result of the last check, shown in Settings so it is clear what the phone actually downloaded. */
/** Set by the notification module so this file has no native imports. */
let notifyHook: ((n?: Notice) => void) | null = null;
export const setNotifyHook = (f: (n?: Notice) => void) => { notifyHook = f; };
export const status = { checking: false, at: 0, ok: false, error: "", updatedAt: 0 };
export const useStatus = (): number => useRemote();
const txt = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, "").trim().slice(0, n) : "");
const https = (v: unknown) => (typeof v === "string" && /^https:\/\//i.test(v.trim()) ? v.trim().slice(0, 800) : "");
const picks = (v: unknown): PickItem[] => (Array.isArray(v) ? v : []).slice(0, 30).map((x: any) => ({ provider: txt(x?.provider, 60), link: txt(x?.link, 800), title: txt(x?.title, 120), image: https(x?.image) })).filter((x) => x.provider && x.link && x.title);
const ads = (v: unknown): SliderAd[] => (Array.isArray(v) ? v : []).slice(0, 10).map((x: any) => ({ id: txt(x?.id, 40), image: https(x?.image), url: https(x?.url), title: txt(x?.title, 80), cta: txt(x?.cta, 24) || "Learn more" })).filter((x) => x.id && x.image && x.url);
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Accepts only safe, known fields; returns null if the file is not usable. */
export function sanitize(raw: unknown): AppConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;
  const colors: Partial<Record<ColorKey, string>> = {};
  for (const k of COLOR_KEYS) { const v = r.colors?.[k]; if (typeof v === "string" && HEX.test(v)) colors[k] = v.toLowerCase(); }
  const name = typeof r.appName === "string" ? r.appName.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 30) : "";
  const logo = typeof r.logoUrl === "string" && /^https:\/\//i.test(r.logoUrl) ? r.logoUrl.slice(0, 500) : "";
  const tag = typeof r.tagline === "string" ? r.tagline.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60) : "";
  const oa = r.openingAd; const fr = oa?.frequency;
  const openingAd: OpeningAd | undefined = oa && https(oa.image) ? { enabled: oa.enabled === true, id: txt(oa.id, 40) || "ad", image: https(oa.image), url: https(oa.url), skipAfter: Math.min(15, Math.max(0, Number(oa.skipAfter) || 0)), frequency: fr === "always" || fr === "once" ? fr : "daily" } : undefined;
  const an = r.announcement;
  const announcement: Announcement | undefined = an && txt(an.text, 160) ? { enabled: an.enabled === true, text: txt(an.text, 160), url: https(an.url) } : undefined;
  const nt = r.notification;
  const notification: Notice | undefined = nt && txt(nt.id, 40) && txt(nt.title, 80) ? { id: txt(nt.id, 40), title: txt(nt.title, 80), body: txt(nt.body, 300), url: https(nt.url), sentAt: Number(nt.sentAt) || 0 } : undefined;
  return { version: 1, appName: name, tagline: tag, logoUrl: logo, colors, updatedAt: Number(r.updatedAt) || 0,
    slider: picks(r.slider), recommendedTitle: txt(r.recommendedTitle, 40), recommended: picks(r.recommended), sliderAds: ads(r.sliderAds),
    sliderAdEvery: Math.min(10, Math.max(1, Math.round(Number(r.sliderAdEvery)) || 3)), openingAd, announcement, notification };
}

/** Writes the config into the live theme object and brand info. Must run before the screens are loaded. */
/** Content only (slider, rows, ads, notice). Safe to apply while the app is running. */
export function applyContent(cfg: AppConfig) {
  remote.slider = cfg.slider || []; remote.recommended = cfg.recommended || [];
  remote.recommendedTitle = cfg.recommendedTitle || "Recommended for you";
  remote.sliderAds = cfg.sliderAds || []; remote.sliderAdEvery = cfg.sliderAdEvery || 3;
  remote.openingAd = cfg.openingAd?.enabled ? cfg.openingAd : null;
  remote.announcement = cfg.announcement?.enabled ? cfg.announcement : null;
  remote.notification = cfg.notification || null;
  status.updatedAt = cfg.updatedAt || 0;
  bump();
}

/** Colours / name / logo need a restart, so this only runs before the screens are built. */
export function applyConfig(cfg: AppConfig) {
  Object.assign(C, cfg.colors);
  if (cfg.appName) brand.name = cfg.appName;
  brand.tagline = cfg.tagline || "";
  brand.logoUrl = cfg.logoUrl || "";
  applied = cfg;
  applyContent(cfg);
}
/** What the running app is actually showing, to spot a theme change that needs a restart. */
let applied: AppConfig | null = null;
const themeOf = (c: AppConfig | null) => JSON.stringify([c?.appName, c?.tagline, c?.logoUrl, c?.colors]);

export async function loadCached(): Promise<AppConfig | null> {
  try { const s = await AsyncStorage.getItem(KEY); return s ? sanitize(JSON.parse(s)) : null; } catch { return null; }
}
export async function fetchRemote(timeoutMs: number): Promise<AppConfig | null> {
  return (await fetchWithReason(timeoutMs)).cfg;
}
/** Same fetch, but it says why it failed so Settings can show a useful message.
 *  raw.githubusercontent.com is cached by GitHub's CDN for up to ~5 minutes, so we also ask the GitHub API
 *  (never cached that long) and use whichever copy is newer. */
const parts = CONFIG_URL.match(/githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
async function getOne(url: string, headers: Record<string, string>, ms: number): Promise<{ cfg: AppConfig | null; status: number; net: boolean }> {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { "Cache-Control": "no-cache", Pragma: "no-cache", ...headers } });
    if (!r.ok) return { cfg: null, status: r.status, net: false };
    return { cfg: sanitize(await r.json()), status: 200, net: false };
  } catch { return { cfg: null, status: 0, net: true }; } finally { clearTimeout(t); }
}
export async function fetchWithReason(timeoutMs: number): Promise<{ cfg: AppConfig | null; error: string }> {
  const bust = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const jobs = [getOne(`${CONFIG_URL}?t=${bust}`, {}, timeoutMs)];
  if (parts) jobs.push(getOne(`https://api.github.com/repos/${parts[1]}/${parts[2]}/contents/${parts[4]}?ref=${parts[3]}&t=${bust}`, { Accept: "application/vnd.github.raw+json" }, timeoutMs));
  const res = await Promise.all(jobs);
  const good = res.filter((x) => x.cfg).map((x) => x.cfg as AppConfig).sort((p, q) => (q.updatedAt || 0) - (p.updatedAt || 0));
  if (good[0]) return { cfg: good[0], error: "" };
  const raw = res[0];
  if (raw.status === 404) return { cfg: null, error: "app-config.json not found. The repository must be public and the file must be on the main branch." };
  if (raw.net) return { cfg: null, error: "Could not reach GitHub. Check the internet connection." };
  if (raw.status) return { cfg: null, error: `GitHub answered with HTTP ${raw.status}. Try again in a minute.` };
  return { cfg: null, error: "The config file is there but could not be read (bad JSON)." };
}

// "a newer look was downloaded" notice for the UI
let updated = false;
const subs = new Set<() => void>();
export const useConfigUpdated = (): boolean => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => updated);
export const dismissConfigUpdated = () => { updated = false; subs.forEach((f) => f()); };
const same = (a: AppConfig | null, b: AppConfig | null) => JSON.stringify(a) === JSON.stringify(b);

async function refresh(cached: AppConfig | null, timeoutMs: number): Promise<AppConfig | null> {
  const { cfg: fresh, error } = await fetchWithReason(timeoutMs);
  status.checking = false; status.at = Date.now(); status.ok = !!fresh; status.error = error;
  if (!fresh) { bump(); return cached; }
  if (!same(fresh, cached)) {
    try { await AsyncStorage.setItem(KEY, JSON.stringify(fresh)); } catch { /* ignore */ }
    applyContent(fresh);
    notifyHook?.(fresh.notification); // slider, rows, ads and the notice appear at once
    if (applied && themeOf(fresh) !== themeOf(applied)) { updated = true; subs.forEach((f) => f()); } // name / logo / colours need a restart
  }
  bump();
  return fresh;
}

/** "Check for updates now" button, and the automatic check when the app comes back to the front. */
export async function checkNow(): Promise<boolean> {
  if (status.checking) return false;
  status.checking = true; status.error = ""; bump();
  const cached = await loadCached();
  const out = await refresh(cached, 12000);
  return !!out;
}
let lastAuto = 0;
export function autoCheck() {
  const now = Date.now();
  if (now - lastAuto < 20000 || status.checking) return; // at most once every 20 seconds
  lastAuto = now; void checkNow();
}

/** Called once at app start. Applies the cached config at once; first launch waits briefly for the online one. */
export async function bootConfig() {
  const cached = await loadCached();
  if (cached) { applyConfig(cached); void refresh(cached, 8000); return; }
  const first = await refresh(null, 2500);
  if (first) applyConfig(first);
}
