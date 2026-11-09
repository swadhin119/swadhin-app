// Desktop downloader (runs in Electron's main process, plain Node): fast parallel direct downloads,
// parallel HLS segments + ffmpeg remux to a single mp4. No Electron imports, so it can be tested with plain node.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const U = require("./dlutil.cjs");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DIRECT_PARTS_MIN = 24 * 1024 * 1024, HLS_CONC = 12;
const hdr = (h) => ({ "User-Agent": UA, ...(h || {}) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ffmpegPath() {
  if (process.env.SWADHIN_FFMPEG) return process.env.SWADHIN_FFMPEG;
  const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  try { const r = process.resourcesPath && path.join(process.resourcesPath, "ffmpeg", exe); if (r && fs.existsSync(r)) return r; } catch { /* not packaged */ }
  try {
    let p = require("ffmpeg-static");
    if (p) { p = p.replace("app.asar" + path.sep, "app.asar.unpacked" + path.sep); if (fs.existsSync(p)) return p; }
  } catch { /* not installed */ }
  return null;
}

async function req(url, headers, signal, extra) {
  const r = await fetch(url, { headers, signal, redirect: "follow", ...(extra || {}) });
  return r;
}
async function fetchText(url, headers, signal) {
  const r = await req(url, headers, signal);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.text();
}
async function probe(url, headers, signal) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 12000);
  const onAbort = () => ac.abort(); signal.addEventListener("abort", onAbort);
  try {
    const r = await fetch(url, { headers: { ...headers, Range: "bytes=0-0" }, signal: ac.signal, redirect: "follow" });
    const m = (r.headers.get("content-range") || "").match(/\/(\d+)\s*$/);
    if (r.status === 206 && m) return { total: Number(m[1]), ranges: true };
    return { total: Number(r.headers.get("content-length") || 0), ranges: false };
  } catch { return { total: 0, ranges: false }; } finally { clearTimeout(t); ac.abort(); signal.removeEventListener("abort", onAbort); }
}
// stream a URL (or a byte range) into a file at `pos`; returns bytes written
async function pipeToFile(url, headers, fh, pos, signal, onBytes) {
  const r = await req(url, headers, signal);
  if (!r.ok && r.status !== 206) throw new Error("HTTP " + r.status);
  if (!r.body) throw new Error("empty response");
  const reader = r.body.getReader(); let at = pos, n = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    await fh.write(value, 0, value.length, at); at += value.length; n += value.length; if (onBytes) onBytes(value.length);
  }
  return n;
}
async function pool(n, list, fn, signal) {
  let i = 0, fail = null;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (!fail && i < list.length) { if (signal.aborted) throw new Error("stopped"); const k = i++; try { await fn(list[k], k); } catch (e) { fail = fail || e; } }
  }));
  if (fail) throw fail;
}

async function downloadDirect(job, outFile, signal, progress) {
  const headers = hdr(job.headers);
  const { total, ranges } = await probe(job.url, headers, signal);
  const part = outFile + ".part";
  let bytes = 0; const tick = (n) => { bytes += n; progress(bytes, total); };
  const fh = await fs.promises.open(part, "w");
  try {
    if (ranges && total >= DIRECT_PARTS_MIN) {
      const plan = U.planRanges(total, total > 700 * 1024 * 1024 ? 8 : 6);
      await pool(plan.length, plan, async ([a, b]) => {
        let last;
        for (let k = 0; k < 3; k++) {
          const before = bytes; let got = 0;
          try { got = await pipeToFile(job.url, { ...headers, Range: `bytes=${a}-${b}` }, fh, a, signal, tick); if (got !== b - a + 1) throw new Error("part was incomplete"); return; }
          catch (e) { last = e; if (signal.aborted) throw e; bytes = before; await sleep(500 * (k + 1)); }
        }
        throw last;
      }, signal);
    } else {
      const n = await pipeToFile(job.url, headers, fh, 0, signal, tick);
      if (total && n !== total) throw new Error("download was incomplete");
    }
  } finally { await fh.close(); }
  await fs.promises.rename(part, outFile);
  return bytes;
}

function runFfmpeg(args, signal) {
  const bin = ffmpegPath();
  if (!bin) return Promise.reject(new Error("ffmpeg is missing, cannot join HLS parts into an mp4"));
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true }); let err = "";
    p.stderr.on("data", (d) => { err = (err + d).slice(-1500); });
    const kill = () => { try { p.kill("SIGKILL"); } catch { /* ignore */ } };
    signal.addEventListener("abort", kill, { once: true });
    p.on("error", reject);
    p.on("close", (code, sig) => { signal.removeEventListener("abort", kill); if (signal.aborted) reject(new Error("stopped")); else if (code === 0) resolve(); else reject(new Error("ffmpeg failed" + (sig ? " (signal " + sig + ")" : " (code " + code + ")") + ": " + err.split("\n").slice(-3).join(" ").trim())); });
  });
}


const byAudio = (dir) => fs.readdirSync(dir).filter((f) => /^a\d+\.m3u8$/.test(f)).length;
const ivFromSeq = (n) => { const b = Buffer.alloc(16); b.writeUInt32BE(Math.floor(n / 4294967296) >>> 0, 8); b.writeUInt32BE(n >>> 0, 12); return b; };
// Reads a rewritten local playlist and appends init + every segment (decrypted when needed) into one file.
async function joinTrack(dir, playlist, outPath, signal) {
  const lines = (await fs.promises.readFile(path.join(dir, playlist), "utf8")).split(/\r?\n/);
  const crypto = require("crypto");
  let seq = 0, key = null, iv = null, init = null; const segs = [];
  for (const l of lines) {
    if (l.startsWith("#EXT-X-MEDIA-SEQUENCE:")) seq = Number(l.split(":")[1]) || 0;
    else if (l.startsWith("#EXT-X-MAP:")) { const m = l.match(/URI="([^"]+)"/); if (m) init = m[1]; }
    else if (l.startsWith("#EXT-X-KEY:")) {
      if (/METHOD=NONE/.test(l)) { key = null; iv = null; }
      else if (/METHOD=AES-128/.test(l)) { const m = l.match(/URI="([^"]+)"/), v = l.match(/IV=0x([0-9a-fA-F]+)/); key = m ? m[1] : null; iv = v ? Buffer.from(v[1].padStart(32, "0"), "hex") : null; }
      else throw new Error("This stream uses an unsupported encryption (" + (l.match(/METHOD=([A-Z0-9-]+)/) || [])[1] + ")");
    } else if (l && !l.startsWith("#")) { segs.push({ name: l, key, iv: iv || ivFromSeq(seq) }); seq++; }
  }
  const out = await fs.promises.open(outPath, "w");
  try {
    if (init) await out.write(await fs.promises.readFile(path.join(dir, init)));
    const keys = new Map();
    for (const s of segs) {
      if (signal.aborted) throw new Error("stopped");
      let data = await fs.promises.readFile(path.join(dir, s.name));
      if (s.key) {
        if (!keys.has(s.key)) keys.set(s.key, await fs.promises.readFile(path.join(dir, s.key)));
        const d = crypto.createDecipheriv("aes-128-cbc", keys.get(s.key), s.iv);
        data = Buffer.concat([d.update(data), d.final()]);
      }
      await out.write(data);
    }
  } finally { await out.close(); }
}

async function downloadHls(job, outFile, signal, progress) {
  const headers = hdr(job.headers);
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "swadhin-hls-"));
  try {
    const top = await fetchText(job.url, headers, signal);
    const res = []; const byUrl = new Map(); let n = 0;
    const reg = (u, kind) => {
      let nm = byUrl.get(u); if (nm) return nm;
      nm = kind === "key" ? `k${n++}.key` : `s${n++}.${U.extOf(u, kind === "map" ? "mp4" : "ts")}`;
      byUrl.set(u, nm); res.push({ url: u, name: nm }); return nm;
    };
    const write = (name, text) => fs.promises.writeFile(path.join(tmp, name), text);
    const media = async (u, base, local) => {
      const t = u === base ? top : await fetchText(u, headers, signal);
      const r = U.rewriteMedia(t, u, reg);
      if (r.live || !r.segments) throw new Error("Live or empty playlists cannot be downloaded");
      await write(local, r.text);
    };
    if (U.isMaster(top)) {
      const { variants, media: mt } = U.parseMaster(top, job.url);
      const v = U.pickVariant(variants); if (!v) throw new Error("No HLS variant found");
      await media(v.uri, job.url, "v0.m3u8");
      let a = 0; const audioLocal = new Map();
      for (const m of mt.filter((x) => x.type === "AUDIO" && x.group === v.audio && x.uri)) { const nm = `a${a++}.m3u8`; await media(m.uri, job.url, nm); audioLocal.set(m.uri, nm); }
      await write("index.m3u8", U.buildLocalMaster(v, mt, "v0.m3u8", (m) => (m.uri ? audioLocal.get(m.uri) || null : null)));
    } else await media(job.url, job.url, "index.m3u8");

    let done = 0, bytes = 0;
    await pool(HLS_CONC, res, async (r) => {
      const f = path.join(tmp, r.name); let last;
      for (let k = 0; k < 3; k++) {
        const fh = await fs.promises.open(f, "w");
        try { const got = await pipeToFile(r.url, headers, fh, 0, signal); bytes += got; last = null; break; }
        catch (e) { last = e; if (signal.aborted) throw e; await sleep(400 * (k + 1)); }
        finally { await fh.close(); }
      }
      if (last) throw last;
      done++; progress(bytes, Math.round((bytes / done) * res.length), done / res.length);
    }, signal);
    progress(bytes, bytes, 0.999, "Joining parts into mp4…");
    // Join in Node (decrypting AES-128 if needed) instead of using ffmpeg's HLS reader: simpler files, far more reliable.
    const tracks = [];
    if (U.isMaster(top)) { tracks.push("v0.m3u8"); for (let i = 0; i < byAudio(tmp); i++) tracks.push(`a${i}.m3u8`); } else tracks.push("index.m3u8");
    const joined = [];
    for (let i = 0; i < tracks.length; i++) {
      const j = path.join(tmp, `joined${i}.bin`);
      await joinTrack(tmp, tracks[i], j, signal);
      joined.push(j);
    }
    const args = ["-y", "-v", "error"];
    joined.forEach((j) => args.push("-i", j));
    joined.forEach((_j, i) => args.push("-map", `${i}:${i === 0 ? "v:0?" : "a:0?"}`));
    if (joined.length === 1) args.splice(args.indexOf("-map"), 2, "-map", "0");
    args.push("-c", "copy", "-movflags", "+faststart", outFile + ".part.mp4");
    await runFfmpeg(args, signal);
    await fs.promises.rename(outFile + ".part.mp4", outFile);
    return (await fs.promises.stat(outFile)).size;
  } finally { if (!process.env.SWADHIN_KEEP) fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {}); else console.log("kept", tmp); }
}

const safe = (s) => String(s || "").replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || "SWADHIN video";
function uniquePath(dir, base, ext) {
  let p = path.join(dir, `${base}.${ext}`), i = 2;
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${i++}).${ext}`);
  return p;
}

/** job: { id, url, kind: "hls"|"mp4"|"mkv", headers, outDir, baseName }  ->  { filePath, bytes, kind } */
async function startDownload(job, signal, onProgress) {
  await fs.promises.mkdir(job.outDir, { recursive: true });
  const ext = job.kind === "mkv" ? "mkv" : "mp4";
  const outFile = uniquePath(job.outDir, safe(job.baseName), ext);
  const progress = (bytes, total, frac, stage) => onProgress({ id: job.id, bytes, total, frac, stage });
  try {
    const bytes = job.kind === "hls" ? await downloadHls(job, outFile, signal, progress) : await downloadDirect(job, outFile, signal, progress);
    return { filePath: outFile, bytes, kind: ext };
  } catch (e) {
    for (const f of [outFile + ".part", outFile + ".part.mp4", outFile]) { try { fs.rmSync(f, { force: true }); } catch { /* ignore */ } }
    throw e;
  }
}
module.exports = { startDownload, ffmpegPath };
