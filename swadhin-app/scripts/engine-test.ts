import { getProviders, getCatalog, getPosts, searchPosts, getMeta, getStreams, normalizeStreams } from "../src/engine/engine";
const ok = (m: string) => console.log("✅", m), bad = (m: string, e: any) => console.log("❌", m, "->", String(e?.message || e).slice(0, 200));
(async () => {
  const provs = await getProviders(); ok(`manifest: ${provs.length} providers`);
  for (const p of ["hdhub4u", "vega", "drive"]) {
    try { const c = await getCatalog(p); ok(`${p} catalog: ${c.catalog.length} rows, ${c.genres.length} genres`); } catch (e) { bad(p + " catalog", e); }
  }
  try { const posts = await getPosts("hdhub4u", "", 1); ok("hdhub4u posts: " + posts.length + " " + JSON.stringify(posts[0])); } catch (e) { bad("hdhub4u posts", e); }
  try { const posts = await searchPosts("hdhub4u", "avengers", 1); ok("search: " + posts.length); } catch (e) { bad("search", e); }
  try { await getMeta("hdhub4u", "/x/"); } catch (e) { bad("meta (expected network fail)", e); }
  try { await getPosts("nope", "", 1); } catch (e) { bad("unknown provider (expected)", e); }
  const n = normalizeStreams([{ server: "A", link: "https://x/a.mkv" }, { server: "B", link: "https://x/b.m3u8" }, { server: "C", link: "https://x/embed/1", type: "embed" }, { server: "D", link: "https://x/d.mp4" }, { server: "D", link: "https://x/d.mp4" }, { server: "bad", link: "ftp://x" } as any]);
  console.log(n.map((s) => s.kind).join(",") === "hls,mp4,mkv,embed" ? "✅ normalizeStreams order ok" : "❌ order " + n.map((s) => s.kind));
})();
