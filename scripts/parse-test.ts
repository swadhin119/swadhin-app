import { getPosts } from "../src/engine/engine";
const real = globalThis.fetch;
globalThis.fetch = (async (u: any, o: any) => {
  if (String(u).includes("hdhub4u") && String(u).includes("/page/")) {
    return new Response(`<html><body><ul class="recent-movies"><li class="thumb"><figure><img alt="Inception (2010) Download" src="https://img/1.jpg"></figure><a href="https://new10.hdhub4u.cl/inception-2010/"><p>x</p></a></li><li class="thumb"><figure><img alt="Dune (2021)" src="https://img/2.jpg"></figure><a href="/dune-2021/"></a></li></ul></body></html>`, { status: 200 });
  }
  return real(u, o);
}) as any;
getPosts("hdhub4u", "", 1).then((p) => { console.log(JSON.stringify(p)); console.log(p.length === 2 && p[0].title === "Inception (2010)" ? "✅ cheerio parse ok" : "❌ unexpected"); });
