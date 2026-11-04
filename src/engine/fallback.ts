// Auto source badalna: pehle isi provider ke doosre drive/quality, phir doosre providers me wahi title dhoondh kar
import { getEpisodes, getMeta, getProviders, searchPosts } from "./engine";
import { normTitle, sameTitle } from "./match";
import type { Info } from "./types";

export interface AltItem { title: string; link: string; type: "movie" | "series" }
export interface AltGroup { title: string; episodesLink?: string; directLinks?: { title: string; link: string; type?: "movie" | "series" }[] }
export interface AltCtx { provider: string; title: string; type: "movie" | "series"; index: number; items: AltItem[]; groups?: AltGroup[]; groupIdx?: number }
export interface Cand { provider: string; items: AltItem[]; at: number; label: string }

const MAX_PROVIDERS = 18;
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((ok, no) => { const id = setTimeout(() => no(new Error("timeout")), ms); p.then((v) => { clearTimeout(id); ok(v); }, (e) => { clearTimeout(id); no(e); }); });

export const playableGroups = (info: Info | undefined | null): AltGroup[] =>
  (info?.linkList || []).filter((g) => g && (g.episodesLink || g.directLinks?.length)) as AltGroup[];

async function fromGroups(provider: string, groups: AltGroup[], skip: number, ctx: AltCtx, label: string): Promise<Cand[]> {
  const out: Cand[] = [];
  const idx = ctx.type === "series" ? ctx.index : 0;
  for (let gi = 0; gi < groups.length; gi++) {
    if (gi === skip) continue;
    const g = groups[gi]; const tag = `${label} • ${(g.title || "Link " + (gi + 1)).slice(0, 28)}`;
    try {
      if (g.episodesLink) {
        const eps = await withTimeout(getEpisodes(provider, g.episodesLink), 20000);
        if (eps[idx]) out.push({ provider, at: idx, label: tag, items: eps.map((e) => ({ title: e.title, link: e.link, type: "series" as const })) });
      } else if (ctx.type === "series") {
        const items = (g.directLinks || []).map((d) => ({ title: d.title, link: d.link, type: "series" as const }));
        if (items[idx]) out.push({ provider, at: idx, label: tag, items });
      } else {
        (g.directLinks || []).forEach((d) => out.push({ provider, at: 0, label: `${tag} • ${d.title || "Link"}`.slice(0, 60), items: [{ title: d.title || ctx.title, link: d.link, type: d.type || "movie" }] }));
      }
    } catch { /* is group se kuch nahi mila, aage badho */ }
  }
  return out;
}

async function tryProvider(prov: string, ctx: AltCtx, name: string): Promise<Cand[]> {
  try {
    const posts = await withTimeout(searchPosts(prov, normTitle(ctx.title) || ctx.title), 16000);
    const hit = posts.filter((x) => sameTitle(x.title, ctx.title)).slice(0, 2);
    const res: Cand[] = [];
    for (const h of hit) {
      const info = await withTimeout(getMeta(prov, h.link), 20000);
      res.push(...(await fromGroups(prov, playableGroups(info), -1, ctx, name)));
    }
    return res;
  } catch { return []; }
}

export function makeAltFinder(ctx: AltCtx) {
  const queue: Cand[] = [];
  const seen = new Set<string>();
  const cur = ctx.items[ctx.index];
  if (cur) seen.add(ctx.provider + "|" + cur.link);
  let stage = 0, provList: { value: string; name: string }[] | null = null, pos = 0;

  const stage0 = async (): Promise<Cand[]> => {
    const out: Cand[] = [];
    if (ctx.type === "movie") ctx.items.forEach((it, i) => { if (i !== ctx.index) out.push({ provider: ctx.provider, items: ctx.items, at: i, label: it.title || "Doosra drive" }); }); // isi quality ke doosre drives
    if (ctx.groups?.length) out.push(...(await fromGroups(ctx.provider, ctx.groups, ctx.groupIdx ?? -1, ctx, "Doosri quality")));
    return out;
  };
  const nextProviders = async (): Promise<boolean> => {
    if (!provList) provList = (await getProviders()).filter((x) => x.value !== ctx.provider).map((x) => ({ value: x.value, name: x.name })).slice(0, MAX_PROVIDERS);
    const batch = provList.slice(pos, pos + 3); pos += batch.length;
    if (!batch.length) return false;
    (await Promise.all(batch.map((b) => tryProvider(b.value, ctx, b.name)))).forEach((r) => queue.push(...r));
    return true;
  };
  return {
    async next(): Promise<Cand | null> {
      for (;;) {
        const c = queue.shift();
        if (c) { const k = c.provider + "|" + c.items[c.at]?.link; if (!c.items[c.at] || seen.has(k)) continue; seen.add(k); return c; }
        if (stage === 0) { stage = 1; queue.push(...(await stage0())); continue; }
        if (!(await nextProviders())) return null;
      }
    },
  };
}

// Detail page ke liye: is provider me title khula nahi / links nahi, to doosre provider me wahi title ka page dhoondo
export async function findAltDetail(title: string, exclude: string, shouldStop?: () => boolean): Promise<{ provider: string; link: string; info: Info; name: string } | null> {
  const list = (await getProviders()).filter((x) => x.value !== exclude).slice(0, MAX_PROVIDERS);
  for (let i = 0; i < list.length; i += 3) {
    if (shouldStop?.()) return null;
    const found = await Promise.all(list.slice(i, i + 3).map(async (pv) => {
      try {
        const posts = await withTimeout(searchPosts(pv.value, normTitle(title) || title), 16000);
        for (const h of posts.filter((x) => sameTitle(x.title, title)).slice(0, 2)) {
          const info = await withTimeout(getMeta(pv.value, h.link), 20000);
          if (playableGroups(info).length) return { provider: pv.value, link: h.link, info, name: pv.name };
        }
      } catch { /* agla */ }
      return null;
    }));
    const hit = found.find((x) => x);
    if (hit) return hit;
  }
  return null;
}
