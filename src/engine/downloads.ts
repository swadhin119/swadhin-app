// Download manager: queue (2 ek saath), parallel parts (direct file), parallel segments (HLS), resume, offline files
import { useSyncExternalStore } from "react";
import { Directory, File, FileMode, Paths } from "expo-file-system";
import { getJSON, setJSON } from "./storage";
import { getStreams } from "./engine";
import { commonHeaders } from "./context";
import { makeAltFinder, type AltCtx } from "./fallback";
import { buildLocalMaster, extOf, isMaster, parseMaster, pickVariant, planRanges, rewriteMedia } from "./dlutil";
import type { Stream } from "./types";

export type DlStatus = "queued" | "resolving" | "downloading" | "paused" | "done" | "error";
export interface DlItem {
  id: string; provider: string; detailLink: string; title: string; epTitle: string; image: string; type: "movie" | "series"; link: string;
  status: DlStatus; progress: number; bytes: number; total: number; speed: number; path?: string; kind?: string; src?: string; error?: string; t: number;
}
const MAX_ACTIVE = 2, PARTS_MIN = 24 * 1024 * 1024, HLS_CONC = 8, MERGE_CHUNK = 8 * 1024 * 1024;

let items: DlItem[] = [];
let loaded = false;
const subs = new Set<() => void>();
const ctxs = new Map<string, AltCtx>();
const aborts = new Map<string, AbortController>();
const speedState = new Map<string, { t: number; b: number }>();
let saveT: ReturnType<typeof setTimeout> | null = null;

const emit = () => subs.forEach((f) => f());
const save = () => { if (saveT) return; saveT = setTimeout(() => { saveT = null; void setJSON("downloads", items); }, 1000); };
const patch = (id: string, p: Partial<DlItem>) => { items = items.map((x) => (x.id === id ? { ...x, ...p } : x)); emit(); save(); };
const get = (id: string) => items.find((x) => x.id === id);
export const useDownloads = (): DlItem[] => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => items);

export async function loadDownloads() {
  if (loaded) return; loaded = true;
  const saved = await getJSON<DlItem[]>("downloads", []);
  items = (Array.isArray(saved) ? saved : []).map((x) => (x.status === "downloading" || x.status === "resolving" || x.status === "queued" ? { ...x, status: "paused" as const, speed: 0 } : x));
  emit();
}

const root = () => { const d = new Directory(Paths.document, "downloads"); try { if (!d.exists) d.create({ intermediates: true }); } catch { /* ho sakta hai pehle se ho */ } return d; };
const dirOf = (id: string) => { const d = new Directory(root(), id); try { if (!d.exists) d.create({ intermediates: true }); } catch { /* ignore */ } return d; };
const wipe = (id: string) => { try { const d = new Directory(root(), id); if (d.exists) d.delete(); } catch { /* ignore */ } };

// ---------- progress + speed ----------
function report(id: string, bytes: number, total: number) {
  const now = Date.now(); const s = speedState.get(id) || { t: now, b: bytes };
  let speed = get(id)?.speed ?? 0;
  if (now - s.t >= 800) { const inst = ((bytes - s.b) * 1000) / (now - s.t); speed = speed ? speed * 0.6 + inst * 0.4 : inst; speedState.set(id, { t: now, b: bytes }); }
  else if (!speedState.has(id)) speedState.set(id, s);
  patch(id, { bytes, total, speed: Math.max(0, speed), progress: total > 0 ? Math.min(0.999, bytes / total) : 0 });
}

// ---------- network helpers ----------
const hdr = (h?: Record<string, string>) => ({ "User-Agent": commonHeaders["User-Agent"], ...(h || {}) });
async function fetchText(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<string> {
  const r = await fetch(url, { headers, signal });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.text();
}
async function probe(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<{ total: number; ranges: boolean }> {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 12000);
  const onAbort = () => ac.abort(); signal.addEventListener("abort", onAbort);
  try {
    const r = await fetch(url, { headers: { ...headers, Range: "bytes=0-0" }, signal: ac.signal });
    const m = (r.headers.get("content-range") || "").match(/\/(\d+)\s*$/);
    if (r.status === 206 && m) return { total: Number(m[1]), ranges: true };
    return { total: Number(r.headers.get("content-length") || 0), ranges: false };
  } catch { return { total: 0, ranges: false }; } finally { clearTimeout(t); ac.abort(); signal.removeEventListener("abort", onAbort); }
}
// File.downloadFileAsync, par pehle .tmp me, poora hone par naam badlo (adhuri file kabhi "poori" na lage)
async function fetchTo(url: string, headers: Record<string, string>, dest: File, signal: AbortSignal, onProgress?: (b: number) => void): Promise<File> {
  const tmp = new File(dest.parentDirectory, dest.name + ".tmp");
  try { if (tmp.exists) tmp.delete(); } catch { /* ignore */ }
  await File.downloadFileAsync(url, tmp, { headers, idempotent: true, signal, onProgress: (p) => onProgress?.(p.bytesWritten) });
  try { if (dest.exists) dest.delete(); } catch { /* ignore */ }
  tmp.rename(dest.name);
  return dest;
}
async function pool<T>(n: number, list: T[], fn: (x: T, i: number) => Promise<void>, signal: AbortSignal) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (next < list.length) { if (signal.aborted) throw new Error("rok diya"); const i = next++; await fn(list[i], i); }
  }));
}
const needSpace = (total: number) => { try { if (total > 0 && Paths.availableDiskSpace < total + 150 * 1024 * 1024) throw new Error("Phone me jagah kam hai"); } catch (e: any) { if (String(e?.message).includes("jagah")) throw e; } };

// ---------- direct file (mp4 / mkv): parallel parts, nahi to single ----------
async function downloadDirect(id: string, url: string, headers: Record<string, string>, ext: string, dir: Directory, signal: AbortSignal): Promise<File> {
  const out = new File(dir, "video." + ext);
  const { total, ranges } = await probe(url, headers, signal);
  needSpace(total);
  if (ranges && total >= PARTS_MIN) {
    try {
      const plan = planRanges(total, total > 700 * 1024 * 1024 ? 6 : 4);
      const got = new Array(plan.length).fill(0);
      const parts = plan.map((_, i) => new File(dir, `p${i}.part`));
      await pool(plan.length, plan, async ([a, b], i) => {
        if (parts[i].exists && parts[i].size === b - a + 1) { got[i] = b - a + 1; return; } // resume: poora part pehle se hai
        await fetchTo(url, { ...headers, Range: `bytes=${a}-${b}` }, parts[i], signal, (w) => { got[i] = w; report(id, got.reduce((x, y) => x + y, 0), total); });
        if (parts[i].size !== b - a + 1) throw new Error("part adhura aaya");
        got[i] = b - a + 1;
      }, signal);
      patch(id, { src: "Jod raha hoon…" });
      if (out.exists) out.delete();
      out.create();
      const wh = out.open(FileMode.WriteOnly);
      try {
        for (const part of parts) {
          const rh = part.open(FileMode.ReadOnly);
          try { for (;;) { const bytes = await rh.readBytes(MERGE_CHUNK); if (!bytes.length) break; await wh.writeBytes(bytes); } } finally { rh.close(); }
          part.delete();
        }
      } finally { wh.close(); }
      if (out.size !== total) throw new Error("joda hua size match nahi hua");
      return out;
    } catch (e) {
      if (signal.aborted) throw e;
      try { dir.list().forEach((f) => { try { f.delete(); } catch { /* ignore */ } }); } catch { /* ignore */ } // parallel fail: single connection se try
      patch(id, { src: "Seedha download…", bytes: 0, progress: 0 });
    }
  }
  return fetchTo(url, headers, out, signal, (w) => report(id, w, total));
}

// ---------- HLS (m3u8): segments parallel, local playlist ----------
async function downloadHls(id: string, url: string, headers: Record<string, string>, dir: Directory, signal: AbortSignal): Promise<File> {
  const top = await fetchText(url, headers, signal);
  const res: { url: string; name: string }[] = []; const byUrl = new Map<string, string>(); let n = 0;
  const reg = (u: string, kind: "seg" | "key" | "map") => {
    let nm = byUrl.get(u); if (nm) return nm;
    nm = kind === "key" ? `k${n++}.key` : `s${n++}.${extOf(u, kind === "map" ? "mp4" : "ts")}`;
    byUrl.set(u, nm); res.push({ url: u, name: nm }); return nm;
  };
  const writeText = (name: string, text: string) => { const f = new File(dir, name); if (!f.exists) f.create(); f.write(text); return f; };
  const media = async (u: string, base: string, localName: string) => {
    const t = u === base ? top : await fetchText(u, headers, signal);
    const r = rewriteMedia(t, u, reg);
    if (r.live || !r.segments) throw new Error("Live / khaali playlist download nahi hoti");
    writeText(localName, r.text);
  };
  if (isMaster(top)) {
    const { variants, media: mt } = parseMaster(top, url);
    const v = pickVariant(variants); if (!v) throw new Error("HLS variant nahi mila");
    await media(v.uri, url, "v0.m3u8");
    let a = 0; const audioLocal = new Map<string, string>();
    for (const m of mt.filter((x) => x.type === "AUDIO" && x.group === v.audio && x.uri)) { const nm = `a${a++}.m3u8`; await media(m.uri!, url, nm); audioLocal.set(m.uri!, nm); }
    writeText("index.m3u8", buildLocalMaster(v, mt, "v0.m3u8", (m) => (m.uri ? audioLocal.get(m.uri) ?? null : null)));
  } else await media(url, url, "index.m3u8");

  let done = 0, bytes = 0;
  await pool(HLS_CONC, res, async (r) => {
    const f = new File(dir, r.name);
    if (!(f.exists && f.size > 0)) {
      let last: unknown;
      for (let k = 0; k < 3; k++) { try { await fetchTo(r.url, headers, f, signal); last = null; break; } catch (e) { last = e; if (signal.aborted) throw e; } }
      if (last) throw last;
    }
    done++; bytes += f.size;
    report(id, bytes, Math.round((bytes / done) * res.length));
    patch(id, { progress: Math.min(0.999, done / res.length) });
  }, signal);
  return new File(dir, "index.m3u8");
}

// ---------- ek stream ko download karo ----------
const dlScore = (s: Stream) => (s.kind === "mp4" ? 0 : s.kind === "mkv" ? 1 : s.kind === "hls" ? 2 : 3);
async function downloadStream(id: string, s: Stream, dir: Directory, signal: AbortSignal): Promise<{ file: File; kind: string }> {
  const headers = hdr(s.headers);
  if (s.kind === "hls") return { file: await downloadHls(id, s.link, headers, dir, signal), kind: "hls" };
  const ext = s.kind === "mkv" ? "mkv" : "mp4";
  return { file: await downloadDirect(id, s.link, headers, ext, dir, signal), kind: ext };
}

async function runOne(id: string) {
  const it = get(id); if (!it) return;
  const ac = new AbortController(); aborts.set(id, ac);
  patch(id, { status: "resolving", error: undefined, speed: 0 });
  speedState.delete(id);
  try {
    const dir = dirOf(id);
    const ctx: AltCtx = ctxs.get(id) ?? { provider: it.provider, title: it.title, type: it.type, index: 0, items: [{ title: it.epTitle, link: it.link, type: it.type }] };
    const queue: { s: Stream; label: string }[] = [];
    const load = async (provider: string, link: string, type: "movie" | "series", label: string) => {
      const list = (await getStreams(provider, link, type)).filter((x) => x.kind !== "embed").sort((a, b) => dlScore(a) - dlScore(b));
      list.forEach((x) => queue.push({ s: x, label: `${label} • ${x.server}` }));
    };
    try { await load(it.provider, it.link, it.type, "Asli"); } catch { /* fallback chalega */ }
    const finder = makeAltFinder(ctx);
    let lastErr = "Download layak link nahi mila";
    for (let tries = 0; tries < 14; tries++) {
      if (ac.signal.aborted) throw new Error("rok diya");
      if (!queue.length) {
        const c = await finder.next(); if (!c) break;
        patch(id, { src: "Doosra source dhoondh raha hoon…" });
        const x = c.items[c.at]; try { await load(c.provider, x.link, x.type, c.label); } catch { /* agla */ }
        continue;
      }
      const pick = queue.shift()!;
      patch(id, { status: "downloading", src: pick.label, bytes: 0, progress: 0, kind: pick.s.kind });
      try {
        const { file, kind } = await downloadStream(id, pick.s, dir, ac.signal);
        patch(id, { status: "done", progress: 1, path: file.uri, kind, speed: 0, total: Math.max(get(id)?.total ?? 0, get(id)?.bytes ?? 0) });
        return;
      } catch (e: any) {
        if (ac.signal.aborted) throw e;
        lastErr = String(e?.message || e);
        wipe(id); dirOf(id); // adhura kachra hatao, agle stream / source par
      }
    }
    throw new Error(lastErr);
  } catch (e: any) {
    const cur = get(id);
    if (cur && cur.status !== "paused") patch(id, { status: ac.signal.aborted ? "paused" : "error", error: String(e?.message || e), speed: 0 });
  } finally { aborts.delete(id); pump(); }
}

function pump() {
  const active = items.filter((x) => x.status === "resolving" || x.status === "downloading").length;
  let free = MAX_ACTIVE - active;
  for (const x of items) { if (free <= 0) break; if (x.status === "queued" && !aborts.has(x.id)) { free--; void runOne(x.id); } }
}

// ---------- public API ----------
export interface EnqueueArgs { provider: string; detailLink: string; title: string; epTitle: string; image: string; type: "movie" | "series"; link: string; ctx?: AltCtx }
export function enqueue(a: EnqueueArgs): string {
  const dup = items.find((x) => x.provider === a.provider && x.link === a.link && x.status !== "error");
  if (dup) { if (dup.status === "paused") resume(dup.id); return dup.id; }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (a.ctx) ctxs.set(id, a.ctx);
  const { ctx: _c, ...rest } = a;
  items = [{ ...rest, id, status: "queued", progress: 0, bytes: 0, total: 0, speed: 0, t: Date.now() }, ...items];
  emit(); save(); pump();
  return id;
}
export const pause = (id: string) => { const x = get(id); if (!x) return; if (x.status === "queued") patch(id, { status: "paused" }); else { patch(id, { status: "paused", speed: 0 }); aborts.get(id)?.abort(); } };
export const resume = (id: string) => { patch(id, { status: "queued", error: undefined }); pump(); };
export const retryDl = (id: string) => { wipe(id); patch(id, { status: "queued", error: undefined, bytes: 0, progress: 0 }); pump(); };
export function removeDl(id: string) { aborts.get(id)?.abort(); wipe(id); ctxs.delete(id); items = items.filter((x) => x.id !== id); emit(); save(); pump(); }
export const downloadOf = (provider: string, link: string) => items.find((x) => x.provider === provider && x.link === link && x.status !== "error");
