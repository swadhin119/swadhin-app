import { makeContext, primeUrls } from "./context";
import { getJSON, setJSON, removeKeys } from "./storage";
import type { Catalog, EpisodeLink, Info, Post, ProviderInfo, RawStream, Stream, StreamKind } from "./types";
import { dedupeKey, isHindi, isSeriesTitle, parseRating } from "./match";

export const DEFAULT_SOURCE = "https://raw.githubusercontent.com/Zenda-Cross/vega-providers/main";
const SKIP = new Set(["torrentio", "youtube", "showbox"]); // torrent / youtube: ye app abhi nahi chalata
const MIN = 60e3;
let SOURCE = DEFAULT_SOURCE;
export const setSource = (u: string) => { SOURCE = (u || DEFAULT_SOURCE).replace(/\/+$/, "").replace(/\/manifest\.json$/, ""); memo.clear(); mods.clear(); };
export const getSource = () => SOURCE;

// ---------- chhota cache: memory + (zarurat par) disk ----------
const memo = new Map<string, { t: number; v: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
async function cached<T>(key: string, ttl: number, load: () => Promise<T>, opts: { disk?: boolean; staleOk?: boolean } = {}): Promise<T> {
  const m = memo.get(key);
  if (m && m.t > Date.now()) return m.v as T;
  let disk: { t: number; v: T } | null = null;
  if (opts.disk) disk = await getJSON<{ t: number; v: T } | null>("c:" + key, null);
  if (disk && disk.t > Date.now()) { memo.set(key, disk); return disk.v; }
  const run = () => {
    let p = inflight.get(key) as Promise<T> | undefined;
    if (!p) {
      p = load().then((v) => {
        const empty = Array.isArray(v) && v.length === 0;
        if (!empty) { const e = { t: Date.now() + ttl, v }; memo.set(key, e); if (opts.disk) void setJSON("c:" + key, e); }
        return v;
      }).finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    return p;
  };
  if (opts.staleOk && (m || disk)) { run().catch(() => {}); return (m?.v ?? disk!.v) as T; } // purana turant, naya background me
  return run();
}

const timeout = <T,>(p: Promise<T>, ms: number, msg: string) =>
  new Promise<T>((ok, no) => { const id = setTimeout(() => no(new Error(msg)), ms); p.then((v) => { clearTimeout(id); ok(v); }, (e) => { clearTimeout(id); no(e); }); });


// ---------- ek saath bahut saari scraping na ho (site slow / block ho jati hai) ----------
const MAXC = 3;
let active = 0;
const waiting: Array<() => void> = [];
export async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAXC) await new Promise<void>((ok) => waiting.push(ok)); else active++;
  try { return await fn(); } finally { const n = waiting.shift(); if (n) n(); else active--; }
}
// network ki ek chhoti galti par dobara try (pehla try fail ho to hi)
export const retry = async <T,>(f: () => Promise<T>): Promise<T> => { try { return await f(); } catch { return f(); } };
const FAST = 18000; // posts / meta / episodes: 18s se zyada intezaar nahi

// ---------- manifest ----------
export async function getProviders(): Promise<ProviderInfo[]> {
  return cached("manifest:" + SOURCE, 30 * MIN, async () => {
    const r = await timeout(fetch(`${SOURCE}/manifest.json`), 12000, "Could not load the manifest (check internet)");
    if (!r.ok) throw new Error("Manifest HTTP " + r.status);
    const list = (await r.json()) as any[];
    return list.filter((m) => m && !m.disabled && !SKIP.has(m.value)).map((m) => ({ value: m.value, name: m.display_name || m.value, version: String(m.version ?? "0"), icon: m.icon, type: m.type }));
  }, { disk: true, staleOk: true });
}
async function versionOf(p: string) {
  const l = await getProviders(); const x = l.find((v) => v.value === p);
  if (!x) throw new Error("Unknown provider: " + p);
  return x.version;
}

// ---------- provider module loader ----------
type Mod = Record<string, (a: any) => Promise<any>>;
const mods = new Map<string, Promise<Mod | null>>();
async function loadModule(p: string, file: string): Promise<Mod | null> {
  const ver = await versionOf(p);
  const key = `${p}/${file}@${ver}`;
  let pr = mods.get(key);
  if (!pr) {
    pr = (async () => {
      let code = await getJSON<string | null>("code:" + key, null);
      if (!code) {
        const r = await timeout(fetch(`${SOURCE}/dist/${p}/${file}.js`), 25000, "Could not load the provider file");
        if (r.status === 404) return null; // jaise episodes.js sab providers me nahi hota
        if (!r.ok) throw new Error(`${p}/${file}.js HTTP ${r.status}`);
        code = await r.text();
        await removeKeys(`code:${p}/${file}@`); await setJSON("code:" + key, code); // purane version hata do
      }
      const module = { exports: {} as Mod };
      const req = (n: string) => { throw new Error(`Provider needs '${n}', which is not available here`); };
      // eslint-disable-next-line no-new-func
      new Function("module", "exports", "require", "providerGlobal", code)(module, module.exports, req, globalThis);
      return module.exports;
    })();
    pr.catch(() => mods.delete(key));
    mods.set(key, pr);
  }
  return pr;
}
async function call<T>(p: string, file: string, fn: string, args: Record<string, unknown>, ms = 45000): Promise<T> {
  const m = await loadModule(p, file);
  if (!m) throw new Error(`${p} has no ${file}`);
  if (typeof m[fn] !== "function") throw new Error(`${p} has no ${fn}`);
  const ac = new AbortController();
  try {
    return await timeout(m[fn]({ ...args, providerValue: p, signal: ac.signal, providerContext: makeContext(p) }), ms, "Provider did not respond in time");
  } catch (e) { ac.abort(); throw e; }
}

// ---------- public API ----------
export async function getCatalog(p: string): Promise<{ catalog: Catalog[]; genres: Catalog[] }> {
  return cached(`cat:${p}:${await versionOf(p)}`, 6 * 60 * MIN, async () => {
    const m: any = await loadModule(p, "catalog");
    const ctx = makeContext(p);
    const get = async (x: any): Promise<Catalog[]> => (typeof x === "function" ? await x({ providerContext: ctx }) : x) || [];
    return { catalog: await get(m?.catalog), genres: await get(m?.genres) };
  }, { disk: true, staleOk: true });
}
const clean = (l: Post[] | undefined | null): Post[] => (Array.isArray(l) ? l.filter((x) => x && x.title && x.link) : []);
export const getPosts = (p: string, filter: string, page = 1) =>
  cached(`posts:${p}:${filter}:${page}`, 15 * MIN, async () => clean(await slot(() => retry(() => call<Post[]>(p, "posts", "getPosts", { filter, page }, FAST)))), { disk: page === 1, staleOk: true });
export const searchPosts = (p: string, q: string, page = 1) =>
  cached(`search:${p}:${q}:${page}`, 10 * MIN, async () => clean(await slot(() => retry(() => call<Post[]>(p, "posts", "getSearchPosts", { searchQuery: q, page }, FAST)))));
export const getMeta = (p: string, link: string) =>
  cached(`meta:${p}:${link}`, 30 * MIN, () => retry(() => call<Info>(p, "meta", "getMeta", { link }, FAST)));
export const getEpisodes = (p: string, url: string) =>
  cached(`eps:${p}:${url}`, 15 * MIN, async () => (await retry(() => call<EpisodeLink[]>(p, "episodes", "getEpisodes", { url }, FAST))) || []);

const score = (s: Stream) => (s.kind === "hls" ? 0 : s.kind === "mp4" ? 1 : s.kind === "mkv" ? 2 : s.kind === "other" ? 3 : 9);
export function normalizeStreams(list: RawStream[] | null | undefined): Stream[] {
  const seen = new Set<string>();
  const out: Stream[] = [];
  (list || []).forEach((s, i) => {
    if (!s || typeof s.link !== "string" || !/^https?:/i.test(s.link) || seen.has(s.link)) return;
    seen.add(s.link);
    const ext = (s.link.split(/[?#]/)[0].match(/\.(m3u8|mp4|m4v|mkv|webm|avi|mov|ts)$/i) || [])[1]?.toLowerCase() || "";
    const t = (s.type || "").toLowerCase();
    const embed = /embed|iframe|html/.test(t) || /\.(html?|php)(\?|$)/i.test(s.link);
    const kind: StreamKind = embed ? "embed" : ext === "m3u8" || t.includes("hls") || t.includes("m3u8") ? "hls" : ["mp4", "m4v", "webm", "mov"].includes(ext) || t === "mp4" ? "mp4" : ext === "mkv" || t === "mkv" ? "mkv" : "other";
    out.push({ id: `${i}:${s.link}`, server: s.server || "Server " + (i + 1), quality: s.quality, link: s.link, kind, headers: s.headers || {},
      subtitles: (s.subtitles || []).filter((x) => x && x.uri) });
  });
  return out.map((s, i) => [s, i] as const).sort((a, b) => score(a[0]) - score(b[0]) || a[1] - b[1]).map((x) => x[0]);
}
export async function getStreams(p: string, link: string, type: "movie" | "series" = "movie"): Promise<Stream[]> {
  if (/^file:/i.test(link)) { // download ki hui offline file
    const ext = (link.split(/[?#]/)[0].match(/\.(\w+)$/) || [])[1]?.toLowerCase();
    return [{ id: "local", server: "Offline", link, kind: ext === "m3u8" ? "hls" : ext === "mkv" ? "mkv" : "mp4", headers: {}, subtitles: [] }];
  }
  const raw = await cached(`stream:${p}:${type}:${link}`, 2 * MIN, () => call<RawStream[]>(p, "stream", "getStream", { link, type, isDownload: false }, 60000));
  return normalizeStreams(raw);
}
export async function clearCaches() { memo.clear(); mods.clear(); await removeKeys("c:"); await removeKeys("code:"); await removeKeys("urls"); }

// App khulte hi background me tayyari: manifest + provider ki files + urls.json (taaki Home turant data le sake)
export function warmUp(p: string) {
  void primeUrls();
  getProviders().then(() => Promise.all(["catalog", "posts", "meta", "stream", "episodes"].map((f) => loadModule(p, f).catch(() => null)))).catch(() => {});
}

// ---------- Home: 2026 ki latest Hindi movies + series, aur unme se best rating wale (hero slider) ----------
export interface Latest { movies: Post[]; series: Post[]; hero: Post[] }
const sleep = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
export const getLatest2026 = (p: string) =>
  cached<Latest>(`latest26:${p}`, 3 * 60 * MIN, async () => {
    const cats = (await getCatalog(p).catch(() => ({ catalog: [] as Catalog[], genres: [] as Catalog[] }))).catalog;
    const isSer = (c: Catalog) => /series|show|tv|drama|anime/i.test(c.title);
    const serCat = cats.find(isSer);
    const movCat: Catalog = cats.find((c) => !isSer(c)) ?? { title: "Latest", filter: "" };
    const pg = (c: Catalog | undefined, n: number) => (c ? getPosts(p, c.filter, n).catch(() => [] as Post[]) : Promise.resolve([] as Post[]));
    const srch = (q: string) => searchPosts(p, q, 1).catch(() => [] as Post[]);
    const [m1, m2, m3, s1, s2, q1, q2] = await Promise.all([pg(movCat, 1), pg(movCat, 2), pg(movCat, 3), pg(serCat, 1), pg(serCat, 2), srch("2026"), srch("2026 hindi")]);
    const serLinks = new Set([...s1, ...s2].map((x) => x.link));
    const seen = new Set<string>(); const items: Post[] = [];
    [...s1, ...m1, ...q1, ...q2, ...s2, ...m2, ...m3].forEach((x) => {
      if (!/2026/.test(x.title)) return;
      const k = dedupeKey(x.title); if (seen.has(k)) return; seen.add(k); items.push(x);
    });
    if (!items.length) throw new Error("No 2026 titles found"); // empty result cache na ho
    const hi = items.filter((x) => isHindi(x.title));
    const base = hi.length >= 4 ? hi : items;
    const isSer2 = (x: Post) => serLinks.has(x.link) || isSeriesTitle(x.title);
    const movies = base.filter((x) => !isSer2(x)), series = base.filter(isSer2);
    // rating: meta se (IMDb). Kuch hi candidates, 3 ek saath, 7 second tak ruk kar jo mila wahi
    const cands = [...movies.slice(0, 8), ...series.slice(0, 6)];
    const rate = new Map<string, number>();
    await Promise.race([
      Promise.all(cands.map(async (x) => { try { const m = await slot(() => getMeta(p, x.link)); const r = parseRating(m.rating); if (r) rate.set(x.link, r); } catch { /* skip */ } })),
      sleep(7000),
    ]);
    const withR = (x: Post): Post => ({ ...x, rating: rate.get(x.link) });
    const hero = cands.filter((x) => rate.has(x.link)).sort((a, b) => rate.get(b.link)! - rate.get(a.link)!).slice(0, 6).map(withR);
    if (hero.length < 4) base.filter((x) => !hero.some((h) => h.link === x.link)).slice(0, 6 - hero.length).forEach((x) => hero.push(withR(x)));
    return { movies: movies.slice(0, 20).map(withR), series: series.slice(0, 20).map(withR), hero };
  }, { disk: true, staleOk: true });
