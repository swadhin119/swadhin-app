import { router } from "expo-router";

let last = 0;
export function openDetail(provider: string, p: { link: string; title: string; image: string }, resume = false) {
  const now = Date.now(); if (now - last < 700) return; last = now; // double-tap se do-do detail screen na khule
  try { router.push({ pathname: "/detail", params: { provider, link: p.link, title: p.title || "", image: p.image || "", resume: resume ? "1" : "" } }); }
  catch { last = 0; }
}
