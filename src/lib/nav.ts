import { router } from "expo-router";

export function openDetail(provider: string, p: { link: string; title: string; image: string }, resume = false) {
  router.push({ pathname: "/detail", params: { provider, link: p.link, title: p.title, image: p.image, resume: resume ? "1" : "" } });
}
