import { makeContext } from "./context";
import { getJSON, setJSON, removeKeys } from "./storage";
import type { Catalog, EpisodeLink, Info, Post, ProviderInfo, RawStream, Stream, StreamKind } from "./types";

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

// ---------- manifest ----------
export async function getProviders(): Promise<ProviderInfo[]> {
  return cached("manifest:" + SOURCE, 30 * MIN, async () => {
    const r = await timeout(fetch(`${SOURCE}/manifest.json`), 20000, "Manifest load nahi hua (internet?)");
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
        const r = await timeout(fetch(`${SOURCE}/dist/${p}/${file}.js`), 25000, "Provider file load nahi hua");
        if (r.status === 404) return null; // jaise episodes.js sab providers me nahi hota
        if (!r.ok) throw new Error(`${p}/${file}.js HTTP ${r.status}`);
        code = await r.text();
        await removeKeys(`code:${p}/${file}@`); await setJSON("code:" + key, code); // purane version hata do
      }
      const module = { exports: {} as Mod };
      const req = (n: string) => { throw new Error(`Provider ne '${n}' maanga, jo yahan available nahi`); };
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
  if (!m) throw new Error(`${p} me ${file} nahi hai`);
  if (typeof m[fn] !== "function") throw new Error(`${p} me ${fn} available nahi hai`);
  const ac = new AbortController();
  try {
    return await timeout(m[fn]({ ...args, providerValue: p, signal: ac.signal, providerContext: makeContext(p) }), ms, "Provider ne time pe jawab nahi diya");
  } catch (e) { ac.abort(); throw e; }
}

// ---------- public API ----------
export async function getCatalog(p: string): Promise<{ catalog: Catalog[]; genres: Catalog[] }> {
  return cached(`cat:${p}:${await versionOf(p)}`, 60 * MIN, async () => {
    const m: any = await loadModule(p, "catalog");
    const ctx = makeContext(p);
    const get = async (x: any): Promise<Catalog[]> => (typeof x === "function" ? await x({ providerContext: ctx }) : x) || [];
    return { catalog: await get(m?.catalog), genres: await get(m?.genres) };
  });
}
const clean = (l: Post[] | undefined | null): Post[] => (Array.isArray(l) ? l.filter((x) => x && x.title && x.link) : []);
export const getPosts = (p: string, filter: string, page = 1) =>
  cached(`posts:${p}:${filter}:${page}`, 15 * MIN, async () => clean(await call<Post[]>(p, "posts", "getPosts", { filter, page })), { disk: page === 1, staleOk: true });
export const searchPosts = (p: string, q: string, page = 1) =>
  cached(`search:${p}:${q}:${page}`, 10 * MIN, async () => clean(await call<Post[]>(p, "posts", "getSearchPosts", { searchQuery: q, page })));
export const getMeta = (p: string, link: string) =>
  cached(`meta:${p}:${link}`, 30 * MIN, () => call<Info>(p, "meta", "getMeta", { link }));
export const getEpisodes = (p: string, url: string) =>
  cached(`eps:${p}:${url}`, 15 * MIN, async () => (await call<EpisodeLink[]>(p, "episodes", "getEpisodes", { url })) || []);

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
  const raw = await cached(`stream:${p}:${type}:${link}`, 2 * MIN, () => call<RawStream[]>(p, "stream", "getStream", { link, type, isDownload: false }, 60000));
  return normalizeStreams(raw);
}
export async function clearCaches() { memo.clear(); mods.clear(); await removeKeys("c:"); await removeKeys("code:"); await removeKeys("urls.json"); }
