export interface Cue { s: number; e: number; text: string }

const ts = (x: string): number => {
  const m = x.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
  if (!m) return NaN;
  return (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, "0") / 1000;
};
const strip = (t: string) =>
  t.replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

/** WebVTT aur SRT dono parse karta hai */
export function parseSubtitles(raw: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = raw.replace(/\r/g, "").replace(/^﻿/, "").split(/\n{2,}/);
  for (const b of blocks) {
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
