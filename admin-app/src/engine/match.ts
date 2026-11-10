// Title milana / 2026 / Hindi / series pehchanna (pure functions, koi RN import nahi)
const CUT = /[(\[]|\b(19|20)\d{2}\b|\bseason\b|\bs\d{1,2}\b|\bhindi\b|\b(480|720|1080|2160)p\b|\bweb[\s-]?(dl|rip)\b|\bdual\b/i;

export const yearOf = (t: string): number => {
  const p = t.match(/\(((?:19|20)\d{2})\)/); if (p) return Number(p[1]);
  const m = t.match(/\b((?:19|20)\d{2})\b/); return m ? Number(m[1]) : 0;
};
export const seasonOf = (t: string): number => {
  const m = t.match(/\bs(?:eason)?[\s.-]*0?(\d{1,2})(?!\d)/i); return m ? Number(m[1]) : 0;
};
export const normTitle = (t: string): string => {
  let s = (t || "").replace(/^\s*(download|watch)\s+/i, "");
  const i = s.search(CUT);
  if (i > 0) s = s.slice(0, i);
  return s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\u0900-\u097f]+/g, " ").trim();
};
const tokens = (s: string) => new Set(s.split(" ").filter((w) => w.length > 0));

export function titleScore(a: string, b: string): number {
  const x = normTitle(a), y = normTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const A = tokens(x), B = tokens(y);
  let inter = 0; A.forEach((w) => { if (B.has(w)) inter++; });
  const union = A.size + B.size - inter;
  const small = Math.min(A.size, B.size);
  if (inter === small && small >= 2) return 0.85; // ek doosre ka hissa hai
  return union ? inter / union : 0;
}
export function sameTitle(cand: string, want: string): boolean {
  if (titleScore(cand, want) < 0.75) return false;
  const y1 = yearOf(cand), y2 = yearOf(want);
  if (y1 && y2 && Math.abs(y1 - y2) > 1) return false;
  const s1 = seasonOf(cand), s2 = seasonOf(want);
  if (s1 && s2 && s1 !== s2) return false;
  return true;
}
export const isSeriesTitle = (t: string) => /\b(season|s\d{1,2}(e\d+)?|web[\s-]?series|episodes?|complete)\b/i.test(t);
export const isHindi = (t: string) => /hindi|\bhin\b|dual[\s-]*audio|multi[\s-]*audio|bollywood/i.test(t);
export const dedupeKey = (t: string) => normTitle(t) + "|" + seasonOf(t);
export const parseRating = (r: unknown): number => {
  const n = parseFloat(String(r ?? "").replace(",", "."));
  return isFinite(n) && n > 0 && n <= 10 ? n : 0;
};
