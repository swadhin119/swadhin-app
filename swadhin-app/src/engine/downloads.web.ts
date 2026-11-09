// Desktop (Electron) version of the download manager. Same exports as downloads.ts, but the heavy lifting
// (parallel parts, HLS segments, ffmpeg join) happens in Electron's main process (electron/downloader.cjs).
// Finished files go to the user's Videos\SWADHIN folder, so there is no separate "save to gallery" step.
import { useSyncExternalStore } from "react";
import { getJSON, setJSON } from "./storage";
import { getStreams } from "./engine";
import { makeAltFinder, type AltCtx } from "./fallback";
import type { Stream } from "./types";

export type DlStatus = "queued" | "resolving" | "downloading" | "paused" | "done" | "error";
export interface DlItem {
  id: string; provider: string; detailLink: string; title: string; epTitle: string; image: string; type: "movie" | "series"; link: string;
  status: DlStatus; progress: number; bytes: number; total: number; speed: number; path?: string; kind?: string; src?: string; error?: string; t: number;
  gallery?: "saving" | "saved"; galleryErr?: string;
}
const MAX_ACTIVE = 2;
let items: DlItem[] = [];
let loaded = false;
const subs = new Set<() => void>();
const ctxs = new Map<string, AltCtx>();
const aborts = new Map<string, AbortController>();
const speedState = new Map<string, { t: number; b: number }>();
let saveT: ReturnType<typeof setTimeout> | null = null;
const dl = (): any => (typeof window !== "undefined" ? (window as any).desktop : undefined);

const emit = () => subs.forEach((f) => f());
const save = () => { if (saveT) return; saveT = setTimeout(() => { saveT = null; void setJSON("downloads", items); }, 1000); };
const patch = (id: string, p: Partial<DlItem>) => { items = items.map((x) => (x.id === id ? { ...x, ...p } : x)); emit(); save(); };
const get = (id: string) => items.find((x) => x.id === id);
export const useDownloads = (): DlItem[] => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => items);
export const useAutoGallery = (): boolean => false;
export function setAutoGallery(_v: boolean) { /* not needed on desktop */ }

export async function loadDownloads() {
  if (loaded) return; loaded = true;
  const saved = await getJSON<DlItem[]>("downloads", []);
  items = (Array.isArray(saved) ? saved : []).map((x) => (x.status === "downloading" || x.status === "resolving" || x.status === "queued" ? { ...x, status: "paused" as const, speed: 0 } : x));
  emit();
  dl()?.onProgress?.((p: { id: string; bytes: number; total: number; frac?: number; stage?: string }) => {
    if (!get(p.id)) return;
    if (p.stage) patch(p.id, { src: p.stage });
    report(p.id, p.bytes, p.total);
    if (p.frac) patch(p.id, { progress: Math.min(0.999, p.frac) });
  });
}

function report(id: string, bytes: number, total: number) {
  const now = Date.now(); const s = speedState.get(id) || { t: now, b: bytes };
  let speed = get(id)?.speed ?? 0;
  if (now - s.t >= 800) { const inst = ((bytes - s.b) * 1000) / (now - s.t); speed = speed ? speed * 0.6 + inst * 0.4 : inst; speedState.set(id, { t: now, b: bytes }); }
  else if (!speedState.has(id)) speedState.set(id, s);
  patch(id, { bytes, total, speed: Math.max(0, speed), progress: total > 0 ? Math.min(0.999, bytes / total) : 0 });
}

const dlScore = (s: Stream) => (s.kind === "mp4" ? 0 : s.kind === "mkv" ? 1 : s.kind === "hls" ? 2 : 3);
const baseName = (it: DlItem) => `${it.title}${it.epTitle && it.epTitle !== it.title ? " " + it.epTitle : ""}`;

async function runOne(id: string) {
  const it = get(id); if (!it) return;
  const d = dl();
  const ac = new AbortController(); aborts.set(id, ac);
  ac.signal.addEventListener("abort", () => { void d?.cancel?.(id); });
  patch(id, { status: "resolving", error: undefined, speed: 0 });
  speedState.delete(id);
  try {
    if (!d?.download) throw new Error("Downloads need the SWADHIN desktop app");
    const ctx: AltCtx = ctxs.get(id) ?? { provider: it.provider, title: it.title, type: it.type, index: 0, items: [{ title: it.epTitle, link: it.link, type: it.type }] };
    const queue: { s: Stream; label: string }[] = [];
    const load = async (provider: string, link: string, type: "movie" | "series", label: string) => {
      const list = (await getStreams(provider, link, type)).filter((x) => x.kind !== "embed").sort((a, b) => dlScore(a) - dlScore(b));
      list.forEach((x) => queue.push({ s: x, label: `${label} • ${x.server}` }));
    };
    try { await load(it.provider, it.link, it.type, "Original"); } catch { /* the fallback below takes over */ }
    const finder = makeAltFinder(ctx);
    let lastErr = "No downloadable link found";
    for (let tries = 0; tries < 14; tries++) {
      if (ac.signal.aborted) throw new Error("stopped");
      if (!queue.length) {
        const c = await finder.next(); if (!c) break;
        patch(id, { src: "Looking for another source…" });
        const x = c.items[c.at]; try { await load(c.provider, x.link, x.type, c.label); } catch { /* next one */ }
        continue;
      }
      const pick = queue.shift()!;
      patch(id, { status: "downloading", src: pick.label, bytes: 0, progress: 0, kind: pick.s.kind });
      speedState.delete(id);
      const r = await d.download({ id, url: pick.s.link, kind: pick.s.kind === "hls" ? "hls" : pick.s.kind === "mkv" ? "mkv" : "mp4", headers: pick.s.headers || {}, baseName: baseName(it) });
      if (r?.ok) {
        patch(id, { status: "done", progress: 1, path: r.url, kind: r.kind, speed: 0, bytes: r.bytes, total: r.bytes, src: undefined });
        return;
      }
      if (ac.signal.aborted || r?.aborted) throw new Error("stopped");
      lastErr = String(r?.error || "Download failed");
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
export const retryDl = (id: string) => { const x = get(id); if (x?.path) void dl()?.remove?.(x.path); patch(id, { status: "queued", error: undefined, bytes: 0, progress: 0, path: undefined }); pump(); };
export function removeDl(id: string) {
  const x = get(id); aborts.get(id)?.abort();
  if (x?.path) void dl()?.remove?.(x.path);
  ctxs.delete(id); items = items.filter((y) => y.id !== id); emit(); save(); pump();
}
export const downloadOf = (provider: string, link: string) => items.find((x) => x.provider === provider && x.link === link && x.status !== "error");

// Desktop saves straight into Videos\SWADHIN, so there is nothing extra to do for a gallery
export const canGallery = (_x: DlItem) => false;
export async function saveToGallery(_id: string): Promise<string> { return "Downloads are saved in your Videos\\SWADHIN folder"; }
