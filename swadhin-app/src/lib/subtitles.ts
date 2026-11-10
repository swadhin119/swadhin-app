export interface Cue { s: number; e: number; text: string }

const ts = (x: string): number => {
  const m = x.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
  if (!m) return NaN;
  return (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, "0") / 1000;
};
const strip = (t: string) =>
  t.replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

const assTime = (x: string): number => {
  const m = x.trim().match(/^(\d+):(\d{1,2}):(\d{2})[.](\d{1,3})$/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, "0") / 1000 : NaN;
};
function parseAss(raw: string): Cue[] {
  const cues: Cue[] = [];
  let fmt: string[] = [], inEvents = false;
  for (const line of raw.replace(/\r/g, "").split("\n")) {
    const t = line.trim();
    if (/^\[.*\]$/.test(t)) { inEvents = /^\[events\]$/i.test(t); continue; }
    if (!inEvents) continue;
    if (/^format:/i.test(t)) { fmt = t.slice(7).split(",").map((x) => x.trim().toLowerCase()); continue; }
    if (!/^dialogue:/i.test(t)) continue;
    const cols = fmt.length || 10, parts = t.slice(9).split(",");
    const head = parts.slice(0, cols - 1), text = parts.slice(cols - 1).join(",");
    const iS = fmt.indexOf("start") >= 0 ? fmt.indexOf("start") : 1, iE = fmt.indexOf("end") >= 0 ? fmt.indexOf("end") : 2;
    const s = assTime(head[iS] || ""), e = assTime(head[iE] || "");
    const clean = text.replace(/\{[^}]*\}/g, "").replace(/\\N/gi, "\n").replace(/\\h/g, " ").trim();
    if (!isNaN(s) && !isNaN(e) && clean) cues.push({ s, e, text: clean });
  }
  return cues.sort((x, y) => x.s - y.s);
}

/** SRT, WebVTT and ASS/SSA */
export function parseSubtitles(raw: string): Cue[] {
  raw = raw.replace(/^﻿/, "");
  if (/\[Script Info\]/i.test(raw) || (/^Dialogue:/m.test(raw) && !raw.includes("-->"))) return parseAss(raw);
  const cues: Cue[] = [];
  for (const b of raw.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = b.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, rest] = lines[i].split("-->");
    const s = ts(a), e = ts((rest || "").trim().split(/\s+/)[0]);
    const text = strip(lines.slice(i + 1).join("\n"));
    if (!isNaN(s) && !isNaN(e) && text) cues.push({ s, e, text });
  }
  return cues.sort((x, y) => x.s - y.s);
}

const CP1252 = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ";
function latin(b: Uint8Array): string {
  const parts: string[] = []; let cur = "";
  for (let i = 0; i < b.length; i++) { const c = b[i]; cur += c >= 0x80 && c <= 0x9f ? CP1252[c - 0x80] : String.fromCharCode(c); if (cur.length > 8192) { parts.push(cur); cur = ""; } }
  return parts.join("") + cur;
}
/** Subtitle files are often not UTF-8: UTF-8 first, UTF-16 if it has a BOM, otherwise Windows-1252. */
export function decodeSubtitleBytes(b: Uint8Array): string {
  if (b.length >= 2 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff))) {
    const le = b[0] === 0xff; let o = "";
    for (let i = 2; i + 1 < b.length; i += 2) o += String.fromCharCode(le ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]);
    return o;
  }
  let i = 0; if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) i = 3;
  const chunks: string[] = []; let out = "";
  while (i < b.length) {
    const c = b[i];
    if (c < 0x80) { out += String.fromCharCode(c); i++; }
    else {
      const n = c >= 0xf0 && c < 0xf8 ? 3 : c >= 0xe0 ? 2 : c >= 0xc2 && c < 0xe0 ? 1 : -1;
      if (n < 0 || i + n >= b.length) return latin(b);
      let cp = c & (0x3f >> n);
      for (let k = 1; k <= n; k++) { const x = b[i + k]; if ((x & 0xc0) !== 0x80) return latin(b); cp = (cp << 6) | (x & 0x3f); }
      out += String.fromCodePoint(cp); i += n + 1;
    }
    if (out.length > 8192) { chunks.push(out); out = ""; }
  }
  return chunks.join("") + out;
}

/** Binary search se current time ka cue */
export function cueAt(cues: Cue[], t: number): string {
  let lo = 0, hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, c = cues[mid];
    if (t < c.s) hi = mid - 1; else if (t > c.e) lo = mid + 1; else return c.text;
  }
  return "";
}

export const fmtTime = (sec: number) => {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
};
