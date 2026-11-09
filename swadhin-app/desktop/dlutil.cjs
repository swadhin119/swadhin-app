"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/engine/dlutil.ts
var dlutil_exports = {};
__export(dlutil_exports, {
  absUrl: () => absUrl,
  buildLocalMaster: () => buildLocalMaster,
  extOf: () => extOf,
  isMaster: () => isMaster,
  parseMaster: () => parseMaster,
  pickVariant: () => pickVariant,
  planRanges: () => planRanges,
  rewriteMedia: () => rewriteMedia
});
module.exports = __toCommonJS(dlutil_exports);
function absUrl(u, base) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
  const m = base.match(/^([a-z][a-z0-9+.-]*:)\/\/([^/?#]+)([^?#]*)/i);
  if (!m) return u;
  if (u.startsWith("//")) return m[1] + u;
  const origin = m[1] + "//" + m[2];
  if (u.startsWith("/")) return origin + u;
  const i = u.search(/[?#]/);
  const p = i < 0 ? u : u.slice(0, i), tail = i < 0 ? "" : u.slice(i);
  const dir = m[3].slice(0, m[3].lastIndexOf("/") + 1) || "/";
  const out = [];
  (dir + p).split("/").forEach((seg, k, arr) => {
    if (seg === "..") out.pop();
    else if (seg !== "." && (seg !== "" || k === arr.length - 1 || k === 0)) out.push(seg);
  });
  return origin + (out[0] === "" ? "" : "/") + out.join("/") + tail;
}
var attrs = (line) => {
  const o = {};
  const body = line.slice(line.indexOf(":") + 1);
  const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let m;
  while (m = re.exec(body)) o[m[1]] = m[2].replace(/^"|"$/g, "");
  return o;
};
var isMaster = (t) => /#EXT-X-STREAM-INF/.test(t);
function parseMaster(text, base) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const variants = [], media = [];
  lines.forEach((l, i) => {
    if (l.startsWith("#EXT-X-STREAM-INF:")) {
      const a = attrs(l);
      const next = lines.slice(i + 1).find((x) => x && !x.startsWith("#"));
      if (next) variants.push({ bw: Number(a.BANDWIDTH) || 0, h: Number((a.RESOLUTION || "").split("x")[1]) || 0, uri: absUrl(next, base), attrs: l.slice("#EXT-X-STREAM-INF:".length), audio: a.AUDIO });
    } else if (l.startsWith("#EXT-X-MEDIA:")) {
      const a = attrs(l);
      media.push({ group: a["GROUP-ID"], type: a.TYPE, line: l, uri: a.URI ? absUrl(a.URI, base) : void 0 });
    }
  });
  return { variants, media };
}
function pickVariant(vs) {
  const ok = vs.filter((v) => !v.h || v.h <= 1080);
  return (ok.length ? ok : vs).slice().sort((a, b) => b.bw - a.bw)[0];
}
function rewriteMedia(text, base, reg) {
  let segments = 0;
  const out = text.split(/\r?\n/).map((raw) => {
    const l = raw.trim();
    if (!l) return "";
    if (l.startsWith("#")) {
      if (/^#EXT-X-(KEY|SESSION-KEY|MAP):/.test(l)) return l.replace(/URI="([^"]*)"/, (_m, u) => `URI="${reg(absUrl(u, base), l.startsWith("#EXT-X-MAP") ? "map" : "key")}"`);
      return l;
    }
    segments++;
    return reg(absUrl(l, base), "seg");
  });
  return { text: out.join("\n") + "\n", segments, live: !/#EXT-X-ENDLIST/.test(text) };
}
function buildLocalMaster(v, media, localVideo, localAudio) {
  const lines = ["#EXTM3U"];
  media.filter((m) => m.type === "AUDIO" && m.group === v.audio).forEach((m) => {
    if (!m.uri) {
      lines.push(m.line);
      return;
    }
    const loc = localAudio(m);
    if (loc) lines.push(m.line.replace(/URI="[^"]*"/, `URI="${loc}"`));
  });
  lines.push("#EXT-X-STREAM-INF:" + v.attrs.replace(/,?SUBTITLES="[^"]*"/, "").replace(/,?CLOSED-CAPTIONS="[^"]*"/, ""), localVideo);
  return lines.join("\n") + "\n";
}
function planRanges(total, n) {
  const size = Math.ceil(total / n), out = [];
  for (let s = 0; s < total; s += size) out.push([s, Math.min(total - 1, s + size - 1)]);
  return out;
}
var extOf = (url, fallback) => ((url.split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i) || [])[1] || fallback).toLowerCase();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  absUrl,
  buildLocalMaster,
  extOf,
  isMaster,
  parseMaster,
  pickVariant,
  planRanges,
  rewriteMedia
});
