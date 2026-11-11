export interface PickItem { provider: string; link: string; title: string; image: string }
export interface SliderAd { id: string; image: string; url: string; title: string; cta: string; file?: string; pending?: Pending }
export interface Pending { b64: string; ext: string; uri: string }
export interface OpeningAd { enabled: boolean; id: string; image: string; url: string; skipAfter: number; frequency: "always" | "daily" | "once"; file?: string; pending?: Pending }
export interface Announcement { enabled: boolean; text: string; url: string }
export interface Notice { id: string; title: string; body: string; url: string; sentAt: number }
export interface Extra {
  notification?: Notice;
  slider: PickItem[]; recommendedTitle: string; recommended: PickItem[];
  sliderAds: SliderAd[]; sliderAdEvery: number; openingAd: OpeningAd; announcement: Announcement;
}
export const EMPTY_EXTRA: Extra = {
  slider: [], recommendedTitle: "Recommended for you", recommended: [], sliderAds: [], sliderAdEvery: 3,
  openingAd: { enabled: false, id: "", image: "", url: "", skipAfter: 5, frequency: "daily" },
  announcement: { enabled: false, text: "", url: "" },
};
const s = (v: unknown) => (typeof v === "string" ? v : "");
export function readExtra(j: any): Extra {
  const e: Extra = JSON.parse(JSON.stringify(EMPTY_EXTRA));
  const pk = (a: any): PickItem[] => (Array.isArray(a) ? a : []).map((x) => ({ provider: s(x?.provider), link: s(x?.link), title: s(x?.title), image: s(x?.image) })).filter((x) => x.provider && x.link);
  e.slider = pk(j?.slider); e.recommended = pk(j?.recommended);
  e.recommendedTitle = s(j?.recommendedTitle) || e.recommendedTitle;
  e.sliderAds = (Array.isArray(j?.sliderAds) ? j.sliderAds : []).map((x: any) => ({ id: s(x?.id), image: s(x?.image), url: s(x?.url), title: s(x?.title), cta: s(x?.cta) || "Learn more", file: s(x?.file) || undefined })).filter((x: SliderAd) => x.id);
  e.sliderAdEvery = Number(j?.sliderAdEvery) || 3;
  const o = j?.openingAd; if (o) e.openingAd = { enabled: o.enabled === true, id: s(o.id), image: s(o.image), url: s(o.url), skipAfter: Number(o.skipAfter) || 0, frequency: o.frequency === "always" || o.frequency === "once" ? o.frequency : "daily", file: s(o.file) || undefined };
  const nt = j?.notification; if (nt?.id) e.notification = { id: s(nt.id), title: s(nt.title), body: s(nt.body), url: s(nt.url), sentAt: Number(nt.sentAt) || 0 };
  const a = j?.announcement; if (a) e.announcement = { enabled: a.enabled === true, text: s(a.text), url: s(a.url) };
  return e;
}
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
export const isHttps = (v: string) => /^https:\/\/\S+$/i.test(v.trim());
