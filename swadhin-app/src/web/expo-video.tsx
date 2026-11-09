// Web / desktop stand-in for "expo-video" (Metro swaps it in for the web build only).
// Same small API the player uses, backed by an HTML <video> element + hls.js for .m3u8.
import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Hls from "hls.js";

type Fn = (e: any) => void;
type Src = { uri: string; headers?: Record<string, string>; contentType?: string } | null;
const desk = () => (typeof window !== "undefined" ? (window as any).desktop : undefined);

export class WebPlayer {
  video: HTMLVideoElement;
  timeUpdateEventInterval = 0.25;
  private hls: Hls | null = null;
  private subs: Record<string, Set<Fn>> = {};
  private lastEmit = 0;
  private token = 0;
  private ready = false;
  constructor() {
    const v = document.createElement("video");
    v.playsInline = true; v.preload = "auto"; v.controls = false; v.crossOrigin = null;
    v.style.cssText = "width:100%;height:100%;background:#000;object-fit:contain;";
    this.video = v;
    const on = (n: string, f: () => void) => v.addEventListener(n, f);
    on("loadstart", () => this.emit("statusChange", { status: "loading" }));
    on("waiting", () => this.emit("statusChange", { status: "loading" }));
    const rdy = () => { if (!this.ready) { this.ready = true; this.emit("statusChange", { status: "readyToPlay" }); } else this.emit("statusChange", { status: "readyToPlay" }); };
    on("canplay", rdy); on("loadeddata", rdy);
    on("error", () => { if (v.src || this.hls) this.emit("statusChange", { status: "error" }); });
    on("play", () => this.emit("playingChange", { isPlaying: true }));
    on("playing", () => this.emit("playingChange", { isPlaying: true }));
    on("pause", () => this.emit("playingChange", { isPlaying: false }));
    on("ended", () => this.emit("playToEnd", {}));
    on("timeupdate", () => {
      const now = Date.now();
      if (now - this.lastEmit >= this.timeUpdateEventInterval * 1000) { this.lastEmit = now; this.emit("timeUpdate", { currentTime: v.currentTime }); }
    });
  }
  private emit(n: string, e: any) { this.subs[n]?.forEach((f) => { try { f(e); } catch { /* listener errors must not break playback */ } }); }
  addListener(n: string, f: Fn) { (this.subs[n] ||= new Set()).add(f); return { remove: () => this.subs[n]?.delete(f) }; }
  get currentTime() { return this.video.currentTime || 0; }
  set currentTime(t: number) { try { this.video.currentTime = t; } catch { /* ignore */ } }
  get duration() { const d = this.video.duration; return Number.isFinite(d) ? d : 0; }
  get playing() { return !this.video.paused && !this.video.ended; }
  get playbackRate() { return this.video.playbackRate; }
  set playbackRate(r: number) { try { this.video.playbackRate = r; } catch { /* ignore */ } }
  get volume() { return this.video.volume; }
  set volume(v: number) { try { this.video.volume = Math.max(0, Math.min(1, v)); } catch { /* ignore */ } }
  get muted() { return this.video.muted; }
  set muted(m: boolean) { this.video.muted = m; }
  set preservesPitch(b: boolean) { try { (this.video as any).preservesPitch = b; } catch { /* ignore */ } }
  get bufferedPosition() { const b = this.video.buffered; return b.length ? b.end(b.length - 1) : 0; }
  availableAudioTracks: any[] = []; availableSubtitleTracks: any[] = []; audioTrack: any = null; subtitleTrack: any = null;
  seekBy(n: number) { this.currentTime = this.currentTime + n; }
  play() { void this.video.play().catch(() => {}); }
  pause() { this.video.pause(); }
  private kill() { if (this.hls) { try { this.hls.destroy(); } catch { /* ignore */ } this.hls = null; } }
  async replaceAsync(src: Src) {
    const my = ++this.token; this.kill(); this.ready = false;
    const v = this.video;
    if (!src) { v.removeAttribute("src"); v.load(); return; }
    // Referer / Origin the stream needs: Electron's main process adds them to the media requests
    try { await desk()?.setStreamHeaders?.(src.headers && Object.keys(src.headers).length ? src.headers : null); } catch { /* ignore */ }
    if (my !== this.token) return;
    const isHls = src.contentType === "hls" || /\.m3u8(\?|#|$)/i.test(src.uri);
    if (isHls && Hls.isSupported()) {
      const h = new Hls({ enableWorker: true, maxBufferLength: 40, xhrSetup: (xhr) => { try { xhr.setRequestHeader("x-sw-stream", "1"); } catch { /* ignore */ } } });
      this.hls = h;
      h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) { if (d.type === Hls.ErrorTypes.MEDIA_ERROR && !(h as any).__rec) { (h as any).__rec = 1; h.recoverMediaError(); } else this.emit("statusChange", { status: "error" }); } });
      h.loadSource(src.uri); h.attachMedia(v);
    } else { v.src = src.uri; v.load(); }
  }
  release() { this.token++; this.kill(); try { this.video.pause(); this.video.removeAttribute("src"); this.video.load(); } catch { /* ignore */ } }
}

export function useVideoPlayer(_source: any, setup?: (p: WebPlayer) => void) {
  const ref = useRef<WebPlayer | null>(null);
  if (!ref.current) { ref.current = new WebPlayer(); setup?.(ref.current); }
  useEffect(() => () => { ref.current?.release(); }, []);
  return ref.current;
}

export const isPictureInPictureSupported = () => false;
type VVProps = { player: WebPlayer; style?: any; nativeControls?: boolean; contentFit?: string; [k: string]: any };
export const VideoView = React.forwardRef<any, VVProps>(function VideoView({ player, style, contentFit }, ref) {
  React.useImperativeHandle(ref, () => ({ startPictureInPicture: async () => {}, stopPictureInPicture: async () => {}, enterFullscreen: async () => {}, exitFullscreen: async () => {} }));
  const host = useRef<any>(null);
  useEffect(() => {
    const el: HTMLElement | null = host.current;
    if (!el) return;
    player.video.style.objectFit = contentFit === "cover" ? "cover" : contentFit === "fill" ? "fill" : "contain";
    el.appendChild(player.video);
    return () => { if (player.video.parentNode === el) el.removeChild(player.video); };
  }, [player, contentFit]);
  return <View ref={host} style={[StyleSheet.absoluteFill, style, { backgroundColor: "#000" }]} />;
});
export default { VideoView, useVideoPlayer };
