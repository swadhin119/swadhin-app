// Providers ko jo "providerContext" chahiye: axios, cheerio, getBaseUrl, headers, Crypto, kvStore, openWebView
import axios from "axios";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { AsyncStorage, getJSON, setJSON } from "./storage";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cheerio = require("../vendor/cheerio.js");

export const URLS_ENDPOINT = "https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/urls.json";
const HOUR = 3600e3;
let urlsMem: { t: number; v: Record<string, { url?: string }> } | null = null;

async function loadUrls(): Promise<Record<string, { url?: string }>> {
  if (urlsMem && Date.now() - urlsMem.t < HOUR) return urlsMem.v;
  try {
    const r = await fetch(URLS_ENDPOINT);
    if (!r.ok) throw new Error("urls.json " + r.status);
    const v = await r.json();
    urlsMem = { t: Date.now(), v };
    await setJSON("urls.json", v);
    return v;
  } catch (e) {
    const old = await getJSON<Record<string, { url?: string }> | null>("urls.json", null);
    if (old) { urlsMem = { t: Date.now() - HOUR + 60e3, v: old }; return old; }
    throw e;
  }
}

export const commonHeaders: Record<string, string> = {
  "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": Platform.OS === "ios" ? '"iOS"' : '"Android"',
  "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

const kvKey = (p: string, k: string) => `kv:${p}:${k}`;
export const makeKvStore = (provider: string) => ({
  get: async (k: string) => { const s = await AsyncStorage.getItem(kvKey(provider, k)); if (s == null) return undefined; try { return JSON.parse(s); } catch { return s; } },
  set: async (k: string, v: unknown) => { if (v === undefined) await AsyncStorage.removeItem(kvKey(provider, k)); else await AsyncStorage.setItem(kvKey(provider, k), JSON.stringify(v)); },
  delete: async (k: string) => { const had = (await AsyncStorage.getItem(kvKey(provider, k))) != null; await AsyncStorage.removeItem(kvKey(provider, k)); return had; },
  keys: async () => (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(`kv:${provider}:`)).map((k) => k.slice(`kv:${provider}:`.length)),
  clear: async () => { const ks = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(`kv:${provider}:`)); if (ks.length) await AsyncStorage.multiRemove(ks); },
});

export function makeContext(provider: string) {
  return {
    axios, cheerio, Crypto, commonHeaders,
    getBaseUrl: async (key: string) => { try { return (await loadUrls())[key]?.url ?? ""; } catch { return ""; } },
    kvStore: makeKvStore(provider),
    // Cloudflare/WAF browser challenge is app me supported nahi: provider ko saaf error milta hai
    openWebView: async () => { throw new Error("Is provider ko browser verification (Cloudflare) chahiye, jo ye app abhi support nahi karta. Doosra provider chuno."); },
    getCookies: async () => ({}),
  };
}
