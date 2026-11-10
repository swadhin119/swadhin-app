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
export interface AppConfig {
  version: number; appName: string; tagline?: string; logoUrl?: string; colors: Partial<Record<ColorKey, string>>; updatedAt?: number;
  slider?: PickItem[]; recommendedTitle?: string; recommended?: PickItem[]; sliderAds?: SliderAd[]; sliderAdEvery?: number;
  openingAd?: OpeningAd; announcement?: Announcement;
}

export const brand = { name: "SWADHIN", tagline: "", logoUrl: "" };
/** Admin-managed content (manual slider, recommended row, ads, announcement). Filled by applyConfig(). */
export const remote: { slider: PickItem[]; recommendedTitle: string; recommended: PickItem[]; sliderAds: SliderAd[]; sliderAdEvery: number; openingAd: OpeningAd | null; announcement: Announcement | null } =
  { slider: [], recommendedTitle: "Recommended for you", recommended: [], sliderAds: [], sliderAdEvery: 3, openingAd: null, announcement: null };
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
  return { version: 1, appName: name, tagline: tag, logoUrl: logo, colors, updatedAt: Number(r.updatedAt) || 0,
    slider: picks(r.slider), recommendedTitle: txt(r.recommendedTitle, 40), recommended: picks(r.recommended), sliderAds: ads(r.sliderAds),
    sliderAdEvery: Math.min(10, Math.max(1, Math.round(Number(r.sliderAdEvery)) || 3)), openingAd, announcement };
}

/** Writes the config into the live theme object and brand info. Must run before the screens are loaded. */
export function applyConfig(cfg: AppConfig) {
  Object.assign(C, cfg.colors);
  if (cfg.appName) brand.name = cfg.appName;
  brand.tagline = cfg.tagline || "";
  brand.logoUrl = cfg.logoUrl || "";
  remote.slider = cfg.slider || []; remote.recommended = cfg.recommended || [];
  remote.recommendedTitle = cfg.recommendedTitle || "Recommended for you";
  remote.sliderAds = cfg.sliderAds || []; remote.sliderAdEvery = cfg.sliderAdEvery || 3;
  remote.openingAd = cfg.openingAd?.enabled ? cfg.openingAd : null;
  remote.announcement = cfg.announcement?.enabled ? cfg.announcement : null;
}

export async function loadCached(): Promise<AppConfig | null> {
  try { const s = await AsyncStorage.getItem(KEY); return s ? sanitize(JSON.parse(s)) : null; } catch { return null; }
}
export async function fetchRemote(timeoutMs: number): Promise<AppConfig | null> {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(`${CONFIG_URL}?t=${Date.now()}`, { signal: ac.signal, headers: { "Cache-Control": "no-cache" } });
    if (!r.ok) return null;
    return sanitize(await r.json());
  } catch { return null; } finally { clearTimeout(t); }
}

// "a newer look was downloaded" notice for the UI
let updated = false;
const subs = new Set<() => void>();
export const useConfigUpdated = (): boolean => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => updated);
export const dismissConfigUpdated = () => { updated = false; subs.forEach((f) => f()); };
const same = (a: AppConfig | null, b: AppConfig | null) => JSON.stringify(a) === JSON.stringify(b);

async function refresh(cached: AppConfig | null, timeoutMs: number): Promise<AppConfig | null> {
  const fresh = await fetchRemote(timeoutMs);
  if (!fresh) return cached;
  if (!same(fresh, cached)) {
    try { await AsyncStorage.setItem(KEY, JSON.stringify(fresh)); } catch { /* ignore */ }
    if (cached) { updated = true; subs.forEach((f) => f()); }
  }
  return fresh;
}

/** Called once at app start. Applies the cached config at once; first launch waits briefly for the online one. */
export async function bootConfig() {
  const cached = await loadCached();
  if (cached) { applyConfig(cached); void refresh(cached, 8000); return; }
  const first = await refresh(null, 2500);
  if (first) applyConfig(first);
}
