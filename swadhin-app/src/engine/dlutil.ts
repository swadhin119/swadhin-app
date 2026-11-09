// Download ke pure helpers: URL join, m3u8 parse / rewrite, range plan (RN import nahi, test ho sakta hai)
export function absUrl(u: string, base: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
  const m = base.match(/^([a-z][a-z0-9+.-]*:)\/\/([^/?#]+)([^?#]*)/i);
  if (!m) return u;
  if (u.startsWith("//")) return m[1] + u;
  const origin = m[1] + "//" + m[2];
  if (u.startsWith("/")) return origin + u;
  const i = u.search(/[?#]/);
  const p = i < 0 ? u : u.slice(0, i), tail = i < 0 ? "" : u.slice(i);
  const dir = m[3].slice(0, m[3].lastIndexOf("/") + 1) || "/";
  const out: string[] = [];
  (dir + p).split("/").forEach((seg, k, arr) => {
    if (seg === "..") out.pop(); else if (seg !== "." && (seg !== "" || k === arr.length - 1 || k === 0)) out.push(seg);
  });
  return origin + (out[0] === "" ? "" : "/") + out.join("/") + tail;
}

const attrs = (line: string): Record<string, string> => {
  const o: Record<string, string> = {};
  const body = line.slice(line.indexOf(":") + 1);
  const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g; let m: RegExpExecArray | null;
  while ((m = re.exec(body))) o[m[1]] = m[2].replace(/^"|"$/g, "");
  return o;
};

export interface Variant { bw: number; h: number; uri: string; attrs: string; audio?: string }
export interface MediaTag { group: string; type: string; line: string; uri?: string }
export const isMaster = (t: string) => /#EXT-X-STREAM-INF/.test(t);
export function parseMaster(text: string, base: string): { variants: Variant[]; media: MediaTag[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const variants: Variant[] = [], media: MediaTag[] = [];
  lines.forEach((l, i) => {
    if (l.startsWith("#EXT-X-STREAM-INF:")) {
      const a = attrs(l); const next = lines.slice(i + 1).find((x) => x && !x.startsWith("#"));
      if (next) variants.push({ bw: Number(a.BANDWIDTH) || 0, h: Number((a.RESOLUTION || "").split("x")[1]) || 0, uri: absUrl(next, base), attrs: l.slice("#EXT-X-STREAM-INF:".length), audio: a.AUDIO });
    } else if (l.startsWith("#EXT-X-MEDIA:")) {
      const a = attrs(l); media.push({ group: a["GROUP-ID"], type: a.TYPE, line: l, uri: a.URI ? absUrl(a.URI, base) : undefined });
    }
  });
  return { variants, media };
}
export function pickVariant(vs: Variant[]): Variant | undefined {
  const ok = vs.filter((v) => !v.h || v.h <= 1080);
  return (ok.length ? ok : vs).slice().sort((a, b) => b.bw - a.bw)[0];
}
export type ResKind = "seg" | "key" | "map";
export function rewriteMedia(text: string, base: string, reg: (url: string, kind: ResKind) => string) {
  let segments = 0;
  const out = text.split(/\r?\n/).map((raw) => {
    const l = raw.trim(); if (!l) return "";
    if (l.startsWith("#")) {
      if (/^#EXT-X-(KEY|SESSION-KEY|MAP):/.test(l)) return l.replace(/URI="([^"]*)"/, (_m, u: string) => `URI="${reg(absUrl(u, base), l.startsWith("#EXT-X-MAP") ? "map" : "key")}"`);
      return l;
    }
    segments++; return reg(absUrl(l, base), "seg");
  });
  return { text: out.join("\n") + "\n", segments, live: !/#EXT-X-ENDLIST/.test(text) };
}
// Master ka local version: sirf chuna hua variant + uske audio group
export function buildLocalMaster(v: Variant, media: MediaTag[], localVideo: string, localAudio: (m: MediaTag) => string | null): string {
  const lines = ["#EXTM3U"];
  media.filter((m) => m.type === "AUDIO" && m.group === v.audio).forEach((m) => {
    if (!m.uri) { lines.push(m.line); return; }
    const loc = localAudio(m); if (loc) lines.push(m.line.replace(/URI="[^"]*"/, `URI="${loc}"`));
  });
  lines.push("#EXT-X-STREAM-INF:" + v.attrs.replace(/,?SUBTITLES="[^"]*"/, "").replace(/,?CLOSED-CAPTIONS="[^"]*"/, ""), localVideo);
  return lines.join("\n") + "\n";
}
export function planRanges(total: number, n: number): [number, number][] {
  const size = Math.ceil(total / n), out: [number, number][] = [];
  for (let s = 0; s < total; s += size) out.push([s, Math.min(total - 1, s + size - 1)]);
  return out;
}
export const extOf = (url: string, fallback: string) => ((url.split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i) || [])[1] || fallback).toLowerCase();
