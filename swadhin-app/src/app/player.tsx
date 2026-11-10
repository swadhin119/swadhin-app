import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { VideoView, isPictureInPictureSupported, useVideoPlayer, type AudioTrack, type SubtitleTrack } from "expo-video";
import { WebView } from "react-native-webview";
import { StatusBar } from "expo-status-bar";
import { useKeepAwake } from "expo-keep-awake";
import * as ScreenOrientation from "expo-screen-orientation";
import * as Brightness from "expo-brightness";
import * as DocumentPicker from "expo-document-picker";
import * as IntentLauncher from "expo-intent-launcher";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { C } from "../theme";
import { getStreams } from "../engine/engine";
import { makeAltFinder, type AltItem } from "../engine/fallback";
import { enqueue } from "../engine/downloads";
import type { Stream } from "../engine/types";
import { getSession, getState, itemKey, saveProgress } from "../state/store";
import { useAsync } from "../lib/useAsync";
import { cueAt, decodeSubtitleBytes, fmtTime, parseSubtitles, type Cue } from "../lib/subtitles";
import { getJSON, setJSON } from "../engine/storage";
import { GestureLayer, type GestureHandlers } from "../player/GestureLayer";
import { SeekBar } from "../player/SeekBar";
import { Panel, type Item, type Orient, type PanelActions, type PanelData, type PanelTab, type Timer } from "../player/Panel";
import { loadPrefs, setPrefs, usePrefs } from "../player/prefs";

const label = (s: Stream) => `${s.server}${s.quality ? " • " + s.quality + (/p$/i.test(s.quality) ? "" : "p") : ""} • ${s.kind.toUpperCase()}`;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const trackLabel = (t: { label: string; language: string; name?: string }, i: number) => t.label || t.name || (t.language ? t.language.toUpperCase() : "Track " + (i + 1));

export default function Player() {
  useKeepAwake();
  const sess = getSession();
  const { width, height } = useWindowDimensions();
  const prefs = usePrefs();
  const [index, setIndex] = useState(sess?.index ?? 0);
  // auto-fallback: until it plays, switch to another drive / quality / provider automatically
  const [alt, setAlt] = useState<{ forIndex: number; provider: string; items: AltItem[]; at: number } | null>(null);
  const live = alt && alt.forIndex === index ? alt : null;
  const prov = live ? live.provider : sess?.provider ?? "";
  const item = live ? live.items[live.at] : sess?.items[index];
  const orig = sess?.items[index];
  const origRef = useRef(orig); origRef.current = orig;
  const isLocal = !!item && /^file:/i.test(item.link);
  const hasNext = !!sess && index < sess.items.length - 1;
  const hasPrev = index > 0;

  const streams = useAsync(() => getStreams(prov, item!.link, item!.type), [prov, item?.link], !!item);
  const list = streams.loading ? undefined : streams.data;
  const [sel, setSel] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const stream = list?.find((s) => s.id === sel) || null;

  const [shown, setShown] = useState(true);
  const [panel, setPanel] = useState<null | PanelTab>(null);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scrub, setScrub] = useState<number | null>(null);
  const [seekFlash, setSeekFlash] = useState<null | "L" | "R">(null);
  const [subSel, setSubSel] = useState("off"); // "off" | "x<i>" stream | "f<i>" loaded file/link | "e<i>" built-in
  const [cues, setCues] = useState<Cue[]>([]);
  const [subDelay, setSubDelay] = useState(0);
  const [localSubs, setLocalSubs] = useState<{ title: string; cues: Cue[] }[]>([]);
  const [subBusy, setSubBusy] = useState("");
  const [orient, setOrient] = useState<Orient>("land");
  const [zoom, setZoom] = useState(1);
  const [zoomTxt, setZoomTxt] = useState("");
  const [ab, setAb] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [now, setNow] = useState(Date.now());

  // pro-player state
  const [locked, setLocked] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [boost, setBoost] = useState(false);
  const [hud, setHud] = useState<null | { kind: "bright" | "vol"; v: number }>(null);
  const [seekDrag, setSeekDrag] = useState<number | null>(null);
  const [timer, setTimerState] = useState<Timer>("off");
  const [pip, setPip] = useState(false);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [curAudio, setCurAudio] = useState<AudioTrack | null>(null);
  const [subTracks, setSubTracks] = useState<SubtitleTrack[]>([]);

  const [switching, setSwitching] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [note, setNote] = useState("");
  const switchingRef = useRef(false);
  const finder = useRef<ReturnType<typeof makeAltFinder> | null>(null);
  const finderIdx = useRef(-1);
  const started = useRef(false);
  const startAt = useRef(0);
  const lastTime = useRef(0);
  const lastDur = useRef(0);
  const hideT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hudT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speedRef = useRef(1); speedRef.current = speed;
  const brightRef = useRef(0.5);
  const volRef = useRef(1);
  const endTimerRef = useRef(false);
  const abRef = useRef(ab); abRef.current = ab;
  const zoomRef = useRef(1); const zoomBase = useRef(1); const zoomT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localSubsRef = useRef(localSubs); localSubsRef.current = localSubs;
  const lastSubSel = useRef("off");
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const videoRef = useRef<VideoView>(null);

  const player = useVideoPlayer(null, (p) => { p.timeUpdateEventInterval = 0.25; p.preservesPitch = true; });

  useEffect(() => { void loadPrefs(); }, []);

  // ---- orientation: landscape lock (or auto-rotate when the user turns that on) ----
  useEffect(() => {
    const O = ScreenOrientation.OrientationLock;
    void ScreenOrientation.lockAsync(orient === "auto" ? O.DEFAULT : orient === "port" ? O.PORTRAIT_UP : O.LANDSCAPE).catch(() => {});
  }, [orient]);
  useEffect(() => () => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    if (Platform.OS !== "web") void Brightness.restoreSystemBrightnessAsync?.().catch(() => {});
  }, []);
  useEffect(() => {
    if (Platform.OS === "web") return;
    Brightness.getBrightnessAsync().then((b) => { brightRef.current = b; }).catch(() => {});
  }, []);

  // ---- new episode: reset everything, resume position from history ----
  useEffect(() => {
    if (!sess || !item) return;
    const h = getState().history[itemKey(sess.provider, sess.detailLink)];
    startAt.current = h?.epLink === item.link && h.pos > 5 && (!h.dur || h.pos < h.dur - 30) ? h.pos : 0;
    setSel(null); setFailed(new Set()); setTime(0); setDur(0); setBuffered(0); setLoading(true); setSubSel("off"); setCues([]); setPanel(null); setSubDelay(0);
    setAudioTracks([]); setSubTracks([]); setCurAudio(null); setLocalSubs([]); setAb({ a: null, b: null }); setSubBusy("");
    finder.current = null; setExhausted(false); setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // ---- streams arrived: pick the first one that can play ----
  useEffect(() => {
    if (!list || sel) return;
    const pick = list.find((s) => s.kind !== "embed" && !failed.has(s.id)) || list.find((s) => !failed.has(s.id));
    if (pick) setSel(pick.id);
  }, [list, sel, failed]);

  const markFailed = useCallback(() => {
    if (!stream) return;
    startAt.current = lastTime.current > 5 ? lastTime.current : startAt.current; // continue from the same spot on the next server
    setFailed((f) => new Set(f).add(stream.id));
    setSel(null);
  }, [stream]);

  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(""), 4500); return () => clearTimeout(t); }, [note]);

  const switchSource = useCallback(async () => {
    if (!sess || !orig || switchingRef.current) return;
    switchingRef.current = true; setSwitching(true);
    try {
      if (!finder.current || finderIdx.current !== index) {
        finderIdx.current = index; setExhausted(false);
        finder.current = makeAltFinder({ provider: sess.provider, title: sess.title, type: sess.type ?? orig.type, index, items: sess.items, groups: sess.groups, groupIdx: sess.groupIdx });
      }
      const c = await finder.current.next();
      if (!c) { setExhausted(true); setNote("No more sources found"); return; }
      startAt.current = lastTime.current > 5 ? lastTime.current : startAt.current;
      setFailed(new Set()); setSel(null); setLoading(true);
      setAlt({ forIndex: index, provider: c.provider, items: c.items, at: c.at });
      setNote("Source switched: " + c.label);
    } catch { setExhausted(true); } finally { switchingRef.current = false; setSwitching(false); }
  }, [sess, orig, index]);

  const allFailed0 = !!list && list.length > 0 && list.every((s) => failed.has(s.id));
  const noStreams0 = !streams.loading && (!!streams.error || (!!list && list.length === 0));
  useEffect(() => {
    if (!sess || !item || isLocal || exhausted || switching) return;
    if (allFailed0 || noStreams0) void switchSource();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFailed0, noStreams0, exhausted, switching, item?.link, prov]);

  // a stream that has not started within 30s is treated as broken: next one
  useEffect(() => {
    if (!stream || stream.kind === "embed") return;
    started.current = false;
    const t = setTimeout(() => { if (!started.current) markFailed(); }, 30000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream?.id]);

  // ---- stream changed: load it into the player ----
  useEffect(() => {
    if (!stream || stream.kind === "embed") { try { player.pause(); } catch { /* ignore */ } return; }
    let dead = false;
    setLoading(true);
    player.replaceAsync({ uri: stream.link, headers: stream.headers, contentType: stream.kind === "hls" ? "hls" : "auto", metadata: { title: sess?.title, artist: item?.title } })
      .then(() => { if (!dead) { player.playbackRate = speedRef.current; player.play(); } })
      .catch(() => { if (!dead) markFailed(); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream?.id]);

  // ---- player events ----
  useEffect(() => {
    const subs = [
      player.addListener("statusChange", ({ status }) => {
        if (status === "readyToPlay") {
          started.current = true; setLoading(false);
          if (startAt.current > 2) { const at = startAt.current; player.currentTime = at; startAt.current = 0; setNote("Resumed from " + fmtTime(at)); }
          player.playbackRate = speedRef.current;
          try { setAudioTracks([...player.availableAudioTracks]); setCurAudio(player.audioTrack); setSubTracks([...player.availableSubtitleTracks]); } catch { /* not supported */ }
          player.play();
        } else if (status === "loading") setLoading(true);
        else if (status === "error") markFailed();
      }),
      player.addListener("playingChange", ({ isPlaying }) => setPlaying(isPlaying)),
      player.addListener("timeUpdate", ({ currentTime }) => {
        lastTime.current = currentTime; setTime(currentTime);
        const d = player.duration; if (d > 0 && d !== lastDur.current) { lastDur.current = d; setDur(d); }
        try { const b = player.bufferedPosition; if (b >= 0) setBuffered(b); } catch { /* ignore */ }
        if (currentTime > 0.5) { started.current = true; setLoading(false); }
        const { a: A, b: B } = abRef.current;
        if (A != null && B != null && currentTime >= B) { try { player.currentTime = A; } catch { /* ignore */ } }
        const o = origRef.current;
        if (sess && o && !/^file:/i.test(o.link) && currentTime > 3) saveProgress({ provider: sess.provider, link: sess.detailLink, title: sess.title, image: sess.image, pos: currentTime, dur: lastDur.current, epTitle: o.title, epLink: o.link, epType: o.type });
      }),
      player.addListener("playToEnd", () => {
        // A broken / ad / "not available" clip ends within seconds: that is NOT a finished movie. Never close the player or skip the episode for it, switch source instead.
        const d = lastDur.current || player.duration || 0, t = lastTime.current;
        const real = isLocal || (d >= 120 && t >= d - 25 && t >= 60);
        if (!real) { lastTime.current = 0; startAt.current = 0; setNote("This stream ended too early, trying another source"); markFailed(); return; }
        if (endTimerRef.current) { endTimerRef.current = false; setTimerState("off"); setNote("Sleep timer: stopped after this episode"); return; }
        const pf = prefsRef.current;
        if (hasNext && !pf.autoNext) { setNote("Episode finished"); return; }
        if (hasNext) setIndex((i) => i + 1);
        else if (pf.repeat === "all" && (sess?.items.length ?? 0) > 1) setIndex(0);
        else if (router.canGoBack()) router.back();
      }),
      player.addListener("availableAudioTracksChange", (e: any) => setAudioTracks([...(e.availableAudioTracks || [])])),
      player.addListener("audioTrackChange", (e: any) => setCurAudio(e.audioTrack ?? null)),
      player.addListener("availableSubtitleTracksChange", (e: any) => setSubTracks([...(e.availableSubtitleTracks || [])])),
    ];
    return () => subs.forEach((s) => s.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, markFailed, hasNext, item?.link]);

  // ---- on exit: save progress for sure and stop the player ----
  useEffect(() => () => {
    try {
      const o = origRef.current;
      if (sess && o && !/^file:/i.test(o.link) && lastTime.current > 3) saveProgress({ provider: sess.provider, link: sess.detailLink, title: sess.title, image: sess.image, pos: lastTime.current, dur: lastDur.current, epTitle: o.title, epLink: o.link, epType: o.type }, true);
      player.pause();
    } catch { /* player already released */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- subtitles ----
  useEffect(() => {
    const subs = stream?.subtitles || [];
    const en = subs.findIndex((x) => /^en/i.test(x.language || "") || /english/i.test(x.title));
    setSubSel((cur) => (cur.startsWith("f") || cur.startsWith("e") ? cur : en >= 0 ? "x" + en : "off"));
  }, [stream?.id]);
  useEffect(() => {
    if (subSel[0] === "f") { setCues(localSubsRef.current[Number(subSel.slice(1))]?.cues ?? []); return; }
    const sub = subSel[0] === "x" ? stream?.subtitles?.[Number(subSel.slice(1))] : undefined;
    if (!sub) { setCues([]); return; }
    let dead = false;
    fetch(sub.uri, { headers: stream?.headers }).then((r) => r.arrayBuffer()).then((buf) => { if (!dead) setCues(parseSubtitles(decodeSubtitleBytes(new Uint8Array(buf)))); }).catch(() => { if (!dead) setCues([]); });
    return () => { dead = true; };
  }, [stream?.id, subSel, localSubs]);
  const subText = useMemo(() => (cues.length ? cueAt(cues, time - subDelay) : ""), [cues, time, subDelay]);
  const addLocalSub = (title: string, parsed: Cue[]) => {
    const n = [...localSubsRef.current, { title, cues: parsed }];
    localSubsRef.current = n; setLocalSubs(n); setSubSel("f" + (n.length - 1)); lastSubSel.current = "f" + (n.length - 1); setSubDelay(0); setSubBusy("Loaded: " + title);
  };
  const loadSubFile = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.[0]) return;
      const asset = r.assets[0]; setSubBusy("Reading " + asset.name + "…");
      const buf = await (await fetch(asset.uri)).arrayBuffer();
      const parsed = parseSubtitles(decodeSubtitleBytes(new Uint8Array(buf)));
      if (!parsed.length) { setSubBusy("Could not read any subtitles from " + asset.name + " (use .srt, .vtt or .ass)"); return; }
      addLocalSub(asset.name, parsed);
    } catch (e: any) { setSubBusy("Could not open the file: " + String(e?.message || e)); }
  };
  const loadSubUrl = async (url: string) => {
    try {
      setSubBusy("Downloading subtitles…");
      const r = await fetch(url); if (!r.ok) throw new Error("HTTP " + r.status);
      const parsed = parseSubtitles(decodeSubtitleBytes(new Uint8Array(await r.arrayBuffer())));
      if (!parsed.length) { setSubBusy("That link has no readable subtitles (use .srt, .vtt or .ass)"); return; }
      addLocalSub(url.split("/").pop()?.split("?")[0] || "Online subtitles", parsed);
    } catch (e: any) { setSubBusy("Could not download: " + String(e?.message || e)); }
  };
  const pickSub = (k: string) => {
    try { player.subtitleTrack = k[0] === "e" ? subTracks[Number(k.slice(1))] ?? null : null; } catch { /* ignore */ }
    if (k !== "off") lastSubSel.current = k;
    setSubSel(k);
  };
  const toggleCC = () => {
    if (subSel !== "off") { pickSub("off"); setNote("Subtitles off"); return; }
    const first = lastSubSel.current !== "off" ? lastSubSel.current : (stream?.subtitles?.length ? "x0" : localSubsRef.current.length ? "f0" : subTracks.length ? "e0" : "off");
    if (first === "off") { setPanel("subs"); setNote("No subtitles found: load one from your device or a link"); return; }
    pickSub(first); setNote("Subtitles on");
  };

  // ---- sleep timer ----
  useEffect(() => {
    endTimerRef.current = timer === "end";
    if (typeof timer !== "number") return;
    const t = setTimeout(() => { try { player.pause(); } catch { /* ignore */ } setTimerState("off"); setNote("Sleep timer: paused"); }, timer * 60000);
    return () => clearTimeout(t);
  }, [timer, player]);

  // ---- repeat one, background play ----
  useEffect(() => { try { player.loop = prefs.repeat === "one"; } catch { /* ignore */ } }, [prefs.repeat, player]);
  useEffect(() => { try { player.staysActiveInBackground = prefs.background; player.showNowPlayingNotification = prefs.background; } catch { /* ignore */ } }, [prefs.background, player]);
  const bmKey = sess && item ? `bookmarks:${sess.provider}|${item.link}` : "";
  useEffect(() => { setBookmarks([]); if (!bmKey) return; void getJSON<number[]>(bmKey, []).then((l) => setBookmarks(Array.isArray(l) ? l : [])); }, [bmKey]);
  const saveBookmarks = (l: number[]) => { setBookmarks(l); if (bmKey) void setJSON(bmKey, l); };
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(t); }, []);

  // ---- controls auto-hide ----
  const poke = useCallback(() => {
    setShown(true);
    if (hideT.current) clearTimeout(hideT.current);
    hideT.current = setTimeout(() => setShown(false), 3800);
  }, []);
  useEffect(() => { poke(); return () => { [hideT, hudT, flashT].forEach((r) => { if (r.current) clearTimeout(r.current); }); }; }, [poke]);
  useEffect(() => { if ((!playing || panel) && hideT.current) clearTimeout(hideT.current); }, [playing, panel]);

  const skip = prefs.skipSec;
  const seekBy = (d: number) => { try { player.currentTime = clamp(lastTime.current + d, 0, lastDur.current || 1e9); } catch { /* ignore */ } };
  const togglePlay = () => { if (player.playing) player.pause(); else player.play(); poke(); };
  const flash = (side: "L" | "R") => { setSeekFlash(side); if (flashT.current) clearTimeout(flashT.current); flashT.current = setTimeout(() => setSeekFlash(null), 600); };
  const setSpeed = (n: number) => { player.playbackRate = n; setSpeedState(n); };
  const showHud = (kind: "bright" | "vol", v: number) => { setHud({ kind, v }); if (hudT.current) clearTimeout(hudT.current); hudT.current = setTimeout(() => setHud(null), 900); };

  // ---- gestures ----
  const gestures: GestureHandlers = {
    onTap: () => { if (locked) { setShown(true); if (hideT.current) clearTimeout(hideT.current); hideT.current = setTimeout(() => setShown(false), 2500); } else if (shown) setShown(false); else poke(); },
    onDoubleTap: (zone) => {
      if (locked) return;
      if (zone === "C") togglePlay(); else { seekBy(zone === "L" ? -skip : skip); flash(zone); }
    },
    onSeekDrag: (delta, phase) => {
      if (phase === "move") { setSeekDrag(delta); return; }
      setSeekDrag(null);
      if (delta !== 0) { seekBy(delta); poke(); }
    },
    onSideDrag: (side, inc, phase) => {
      if (phase === "end") return;
      if (side === "L") {
        const v = clamp(brightRef.current + inc, 0.02, 1); brightRef.current = v; showHud("bright", v);
        if (Platform.OS !== "web") void Brightness.setBrightnessAsync(v).catch(() => {});
      } else {
        const v = clamp(volRef.current + inc); volRef.current = v; showHud("vol", v);
        try { player.volume = v; } catch { /* ignore */ }
      }
    },
    onPinch: (scale, phase) => {
      if (phase === "start") { zoomBase.current = zoomRef.current; return; }
      if (phase === "end") { if (zoomRef.current < 1.04) { zoomRef.current = 1; setZoom(1); } return; }
      const z = clamp(zoomBase.current * scale, 1, 4); zoomRef.current = z; setZoom(z); setZoomTxt(Math.round(z * 100) + "%");
      if (zoomT.current) clearTimeout(zoomT.current); zoomT.current = setTimeout(() => setZoomTxt(""), 900);
    },
    onLongPress: (active) => {
      if (active) { player.playbackRate = 2; setBoost(true); } else { player.playbackRate = speedRef.current; setBoost(false); }
    },
  };

  const resetZoom = () => { zoomRef.current = 1; setZoom(1); };
  const startPip = () => { if (isPictureInPictureSupported()) void videoRef.current?.startPictureInPicture().catch(() => {}); else setNote("Picture-in-picture is not supported on this device"); };

  // ---- desktop keyboard (web build only) ----
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null; if (t && /^(input|textarea)$/i.test(t.tagName)) return;
      if (e.code === "Space" || e.key === "k") { e.preventDefault(); togglePlay(); }
      else if (e.key === "ArrowLeft") { seekBy(-skip); flash("L"); poke(); }
      else if (e.key === "ArrowRight") { seekBy(skip); flash("R"); poke(); }
      else if (e.key === "f" || e.key === "F") { const d: any = document; if (d.fullscreenElement) void d.exitFullscreen(); else void document.documentElement.requestFullscreen?.(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- panel data ----
  const serverItems: Item[] = (list || []).map((x) => ({ key: x.id, text: label(x), active: x.id === sel, dim: failed.has(x.id) }));
  const audioItems: Item[] = audioTracks.length > 1 ? audioTracks.map((t, i) => ({ key: String(i), text: trackLabel(t, i), active: !!curAudio && (curAudio.id ? curAudio.id === t.id : curAudio.label === t.label && curAudio.language === t.language) })) : [];
  const subItems: Item[] = [
    { key: "off", text: "Off", active: subSel === "off" },
    ...subTracks.map((t, i) => ({ key: "e" + i, text: trackLabel(t, i) + " (built-in)", active: subSel === "e" + i })),
    ...(stream?.subtitles || []).map((x, i) => ({ key: "x" + i, text: x.title || x.language || "Track " + (i + 1), active: subSel === "x" + i })),
    ...localSubs.map((x, i) => ({ key: "f" + i, text: "File: " + x.title, active: subSel === "f" + i })),
  ];
  const pickAudio = (k: string) => { try { player.audioTrack = audioTracks[Number(k)] ?? null; } catch { /* ignore */ } };
  const addBookmark = () => { const t = Math.floor(lastTime.current); if (t < 1) return; if (bookmarks.some((x) => Math.abs(x - t) < 2)) { setNote("Bookmark already there"); return; } saveBookmarks([...bookmarks, t].sort((x, y) => x - y)); setNote("Bookmark added at " + fmtTime(t)); };
  const setA = () => { const t = lastTime.current; setAb((v) => ({ a: t, b: v.b != null && v.b > t ? v.b : null })); setNote("A set at " + fmtTime(t)); };
  const setB = () => { const t = lastTime.current; if (ab.a == null) { setNote("Set A first"); return; } if (t <= ab.a + 1) { setNote("B must be after A"); return; } setAb({ a: ab.a, b: t }); setNote("Looping " + fmtTime(ab.a) + " – " + fmtTime(t)); };
  const external = () => { if (stream) IntentLauncher.startActivityAsync("android.intent.action.VIEW", { data: stream.link, type: "video/*" }).catch(() => setNote("No other video player found on this phone")); };
  const host = (() => { try { return stream ? new URL(stream.link).host : "-"; } catch { return "-"; } })();
  const info: [string, string][] = [
    ["Title", sess?.title ?? "-"], ["Episode", item?.title || "-"], ["Provider", prov], ["Server", stream?.server ?? "-"], ["Quality", stream?.quality ? stream.quality + (/p$/i.test(stream.quality) ? "" : "p") : "-"],
    ["Type", stream ? stream.kind.toUpperCase() : "-"], ["Source", isLocal ? "Downloaded file" : host], ["Duration", fmtTime(dur)], ["Buffered up to", fmtTime(buffered)], ["Speed", speed + "x"],
    ["Audio tracks", String(audioTracks.length || 1)], ["Subtitles", String(subTracks.length + (stream?.subtitles?.length ?? 0) + localSubs.length)], ["Picture", prefs.aspect], ["Zoom", Math.round(zoom * 100) + "%"],
  ];
  const panelData: PanelData = { tab: panel ?? "servers", servers: serverItems, speed, audio: audioItems, subs: subItems, subDelay, prefs, orient, zoom, timer, ab, bookmarks, info, subBusy,
    episodes: (sess?.items ?? []).map((x, i) => ({ key: String(i), text: `${i + 1}. ${x.title || "Episode"}`, active: i === index })), canExternal: Platform.OS === "android" && !!stream && stream.kind !== "embed" && !isLocal };
  const panelActions: PanelActions = {
    tab: setPanel, close: () => { setPanel(null); poke(); },
    server: (k) => { startAt.current = lastTime.current > 5 ? lastTime.current : startAt.current; setFailed((f) => { const n = new Set(f); n.delete(k); return n; }); setSel(k); setPanel(null); },
    speed: setSpeed, audio: pickAudio, sub: pickSub, subDelay: setSubDelay, prefs: setPrefs, orient: (o) => { setOrient(o); setNote("Orientation: " + (o === "land" ? "landscape" : o === "port" ? "portrait" : "auto-rotate")); },
    resetZoom, timer: (t) => { setTimerState(t); setNote(t === "off" ? "Sleep timer off" : t === "end" ? "Will stop after this episode" : "Sleep timer: " + t + " min"); setPanel(null); },
    setA, setB, clearAB: () => { setAb({ a: null, b: null }); setNote("A–B repeat cleared"); }, addBookmark, jump: (t) => { try { player.currentTime = t; } catch { /* ignore */ } setPanel(null); poke(); },
    delBookmark: (t) => saveBookmarks(bookmarks.filter((x) => x !== t)), episode: (k) => { setPanel(null); setIndex(Number(k)); },
    loadSubFile: () => { void loadSubFile(); }, loadSubUrl: (u) => { void loadSubUrl(u); }, external,
  };

  if (!sess || !item) return <View style={st.root}><Text style={{ color: C.text, margin: 40 }}>Nothing to play.</Text><Pressable onPress={() => router.back()}><Text style={{ color: C.accent, marginLeft: 40 }}>Back</Text></Pressable></View>;

  const allFailed = allFailed0;
  const noStreams = noStreams0;
  const giveUp = (allFailed || noStreams) && (exhausted || isLocal) && !switching;
  const embed = stream?.kind === "embed";
  const showCtl = !pip && !locked && (shown || embed || giveUp);
  const target = seekDrag != null ? clamp(lastTime.current + seekDrag, 0, lastDur.current || 1e9) : 0;
  const remaining = dur > 0 ? dur - time : 0;
  const ratio = prefs.aspect === "16:9" ? 16 / 9 : prefs.aspect === "4:3" ? 4 / 3 : prefs.aspect === "21:9" ? 21 / 9 : 0;
  const fit = ratio ? "fill" : prefs.aspect === "fill" ? "cover" : prefs.aspect === "stretch" ? "fill" : "contain";
  const bw = ratio ? Math.min(width, height * ratio) : width, bh = ratio ? Math.min(height, width / ratio) : height;
  const boxStyle = ratio ? { position: "absolute" as const, left: (width - bw) / 2, top: (height - bh) / 2, width: bw, height: bh } : StyleSheet.absoluteFill;
  const subShadow = prefs.subOutline ? { textShadowColor: "#000", textShadowRadius: 4, textShadowOffset: { width: 0, height: 0 } } : {};
  const endsAt = dur > 0 && playing ? new Date(now + ((dur - time) / Math.max(speed, 0.1)) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <View style={st.root}>
      <StatusBar hidden />
      {embed ? (
        <WebView source={{ uri: stream!.link, headers: stream!.headers }} style={{ flex: 1, backgroundColor: "#000" }} allowsFullscreenVideo javaScriptEnabled domStorageEnabled
          mediaPlaybackRequiresUserAction={false} setSupportMultipleWindows={false} onShouldStartLoadWithRequest={(r) => !/^(intent|market):/i.test(r.url)} />
      ) : (
        <>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ scale: zoom }] }]}><VideoView ref={videoRef} player={player} style={boxStyle} nativeControls={false} contentFit={fit}
            allowsPictureInPicture startsPictureInPictureAutomatically={playing} onPictureInPictureStart={() => setPip(true)} onPictureInPictureStop={() => setPip(false)} /></View>
          {!pip ? <GestureLayer handlers={gestures} locked={locked} flags={{ seek: prefs.gSeek, side: prefs.gSide, long: prefs.gLong, dbl: prefs.gDouble, pinch: prefs.gPinch }} /> : null}
          {seekFlash ? <View pointerEvents="none" style={[st.flash, seekFlash === "L" ? { left: width * 0.12 } : { right: width * 0.12 }]}><Ionicons name={seekFlash === "L" ? "play-back" : "play-forward"} size={30} color="#fff" /><Text style={st.flashTxt}>{skip}s</Text></View> : null}
          {subText && !pip ? <View pointerEvents="none" style={[st.subWrap, { bottom: (showCtl ? 112 : 0) + prefs.subBottom }]}><Text style={[st.sub, { fontSize: 18 * prefs.subScale, color: prefs.subColor, fontWeight: prefs.subBold ? "700" : "400", backgroundColor: `rgba(0,0,0,${prefs.subBgAlpha})` }, subShadow]}>{subText}</Text></View> : null}
        </>
      )}

      {note && !pip ? <View pointerEvents="none" style={st.note}><Text style={st.noteTxt} numberOfLines={2}>{note}</Text></View> : null}
      {prefs.night ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,150,40,.22)" }]} /> : null}
      {zoomTxt ? <View pointerEvents="none" style={st.note}><Text style={st.noteTxt}>Zoom {zoomTxt}</Text></View> : null}
      {boost ? <View pointerEvents="none" style={st.boost}><Ionicons name="play-forward" size={16} color="#fff" /><Text style={st.boostTxt}>2x speed</Text></View> : null}
      {seekDrag != null ? <View pointerEvents="none" style={st.dragBox}><Text style={st.dragBig}>{(seekDrag >= 0 ? "+" : "−") + Math.abs(seekDrag) + "s"}</Text><Text style={st.dragSm}>{fmtTime(target)} / {fmtTime(dur)}</Text></View> : null}
      {hud ? (
        <View pointerEvents="none" style={[st.hud, hud.kind === "bright" ? { left: 36 } : { right: 36 }]}>
          <Ionicons name={hud.kind === "bright" ? "sunny" : hud.v <= 0.01 ? "volume-mute" : "volume-high"} size={22} color="#fff" />
          <View style={st.hudBar}><View style={[st.hudFill, { height: `${Math.round(hud.v * 100)}%` }]} /></View>
          <Text style={st.hudTxt}>{Math.round(hud.v * 100)}</Text>
        </View>
      ) : null}

      {(streams.loading || switching || (loading && !embed && !allFailed && !noStreams)) && !pip ? <View pointerEvents="none" style={st.center}><ActivityIndicator size="large" color={C.accent} /><Text style={st.hint}>{switching ? "Looking for another source…" : streams.loading ? "Finding streams…" : "Buffering…"}</Text></View> : null}

      {giveUp ? (
        <View style={st.center}>
          <Ionicons name="alert-circle-outline" size={44} color={C.danger} />
          <Text style={[st.hint, { fontSize: 15, textAlign: "center", maxWidth: 420 }]}>{streams.error ? streams.error : allFailed ? "No server worked." : "No stream found for this episode."}</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            {allFailed ? <Pressable style={st.pill} onPress={() => { setFailed(new Set()); setSel(null); }}><Text style={st.pillTxt}>Try again</Text></Pressable> : <Pressable style={st.pill} onPress={streams.reload}><Text style={st.pillTxt}>Try again</Text></Pressable>}
            {stream ? <Pressable style={st.pill} onPress={() => Linking.openURL(stream.link)}><Text style={st.pillTxt}>Open original link</Text></Pressable> : null}
            <Pressable style={st.pill} onPress={() => router.back()}><Text style={st.pillTxt}>Back</Text></Pressable>
          </View>
        </View>
      ) : null}

      {locked && shown && !pip ? <View style={st.lockWrap} pointerEvents="box-none"><Pressable style={st.lockBtn} onPress={() => { setLocked(false); poke(); setNote("Controls unlocked"); }}><Ionicons name="lock-closed" size={22} color="#fff" /><Text style={st.lockTxt}>Tap to unlock</Text></Pressable></View> : null}

      {showCtl ? (
        <>
          <View style={st.top} pointerEvents="box-none">
            <Pressable onPress={() => router.back()} hitSlop={10} style={st.iconBtn}><Ionicons name="chevron-back" size={26} color="#fff" /></Pressable>
            <View style={{ flex: 1 }}>
              <Text style={st.title} numberOfLines={1}>{sess.title}</Text>
              <Text style={st.epTitle} numberOfLines={1}>{sess.items.length > 1 || item.title ? item.title : ""}</Text>
            </View>
            {!isLocal && orig ? <Pressable onPress={() => { enqueue({ provider: sess.provider, detailLink: sess.detailLink, title: sess.title, image: sess.image, epTitle: orig.title, type: orig.type, link: orig.link,
              ctx: { provider: sess.provider, title: sess.title, type: sess.type ?? orig.type, index, items: sess.items, groups: sess.groups, groupIdx: sess.groupIdx } }); setNote("Download started • see the Downloads tab"); }} style={st.iconBtn} hitSlop={8}><Ionicons name="download-outline" size={22} color="#fff" /></Pressable> : null}
            {!isLocal ? <Pressable onPress={() => { setExhausted(false); void switchSource(); }} style={st.iconBtn} hitSlop={8}><Ionicons name="shuffle" size={22} color="#fff" /></Pressable> : null}
            {!embed ? <Pressable onPress={toggleCC} onLongPress={() => setPanel("subs")} style={st.iconBtn} hitSlop={8}><Ionicons name={subSel !== "off" ? "chatbox-ellipses" : "chatbox-ellipses-outline"} size={22} color="#fff" /></Pressable> : null}
            {!embed && Platform.OS === "android" ? <Pressable onPress={startPip} style={st.iconBtn} hitSlop={8}><Ionicons name="albums-outline" size={22} color="#fff" /></Pressable> : null}
            <Pressable onPress={() => setPanel("servers")} style={st.iconBtn} hitSlop={8}><Ionicons name="settings-outline" size={22} color="#fff" /></Pressable>
          </View>

          {!embed && !giveUp && !allFailed && !noStreams ? (
            <>
              <View style={st.mid} pointerEvents="box-none">
                <Pressable onPress={() => hasPrev && setIndex((i) => i - 1)} disabled={!hasPrev} style={[st.iconBtn, !hasPrev && { opacity: 0.25 }]}><Ionicons name="play-skip-back" size={28} color="#fff" /></Pressable>
                <Pressable onPress={() => { seekBy(-skip); poke(); }} style={st.iconBtn}><Ionicons name="play-back" size={28} color="#fff" /></Pressable>
                <Pressable onPress={togglePlay} style={st.playBtn}><Ionicons name={playing ? "pause" : "play"} size={38} color="#fff" /></Pressable>
                <Pressable onPress={() => { seekBy(skip); poke(); }} style={st.iconBtn}><Ionicons name="play-forward" size={28} color="#fff" /></Pressable>
                <Pressable onPress={() => hasNext && setIndex((i) => i + 1)} disabled={!hasNext} style={[st.iconBtn, !hasNext && { opacity: 0.25 }]}><Ionicons name="play-skip-forward" size={28} color="#fff" /></Pressable>
              </View>

              {hasNext && dur > 0 && remaining < 25 && remaining > 0 ? <Pressable style={st.nextPill} onPress={() => setIndex((i) => i + 1)}><Text style={st.nextTxt}>Next episode</Text><Ionicons name="play-skip-forward" size={16} color="#fff" /></Pressable> : null}
              {time < 240 && dur > 600 ? <Pressable style={st.skipPill} onPress={() => { seekBy(85); poke(); }}><Text style={st.nextTxt}>Skip intro +85s</Text></Pressable> : null}

              <View style={st.bottom} pointerEvents="box-none">
                <View style={st.barRow}>
                  <Text style={st.time}>{fmtTime(scrub != null ? scrub * dur : time)}</Text>
                  <SeekBar time={time} dur={dur} buffered={buffered} scrub={scrub} onScrub={(f) => { setScrub(f); if (f != null && hideT.current) clearTimeout(hideT.current); }}
                    onCommit={(f) => { if (lastDur.current > 0) player.currentTime = f * lastDur.current; poke(); }} />
                  <Pressable onPress={() => setPrefs({ remaining: !prefs.remaining })}><Text style={st.time}>{prefs.remaining && dur > 0 ? "-" + fmtTime(Math.max(0, dur - time)) : fmtTime(dur)}</Text></Pressable>
                </View>
                <View style={st.toolRow}>
                  <Pressable onPress={() => { setLocked(true); setShown(false); setNote("Controls locked"); }} style={st.tool} hitSlop={6}><Ionicons name="lock-open-outline" size={19} color="#fff" /></Pressable>
                  <Pressable onPress={() => setPanel("speed")} style={st.tool} hitSlop={6}><Ionicons name="speedometer-outline" size={19} color="#fff" /><Text style={st.toolTxt}>{speed === 1 ? "1x" : speed + "x"}</Text></Pressable>
                  <Pressable onPress={() => { const n = prefs.aspect === "fit" ? "fill" : prefs.aspect === "fill" ? "stretch" : "fit"; setPrefs({ aspect: n }); setNote("Picture: " + (n === "fit" ? "Fit" : n === "fill" ? "Fill (crop)" : "Stretch")); poke(); }} style={st.tool} hitSlop={6}><Ionicons name="expand-outline" size={19} color="#fff" /><Text style={st.toolTxt}>{prefs.aspect === "fit" ? "Fit" : prefs.aspect === "fill" ? "Fill" : "Stretch"}</Text></Pressable>
                  <Pressable onPress={() => setPanel("audio")} style={st.tool} hitSlop={6}><Ionicons name="musical-notes-outline" size={19} color="#fff" /></Pressable>
                  <Pressable onPress={() => { const n: Orient = orient === "land" ? "auto" : orient === "auto" ? "port" : "land"; setOrient(n); setNote("Orientation: " + (n === "land" ? "landscape" : n === "port" ? "portrait" : "auto-rotate")); poke(); }} style={st.tool} hitSlop={6}><Ionicons name={orient === "auto" ? "sync-outline" : "phone-landscape-outline"} size={19} color="#fff" /></Pressable>
                  <Pressable onPress={() => setPanel("tools")} style={st.tool} hitSlop={6}><Ionicons name="construct-outline" size={19} color={ab.a != null ? C.accent : "#fff"} /></Pressable>
                  <Pressable onPress={() => { const n = prefs.aspect === "fit" ? "fill" : prefs.aspect === "fill" ? "stretch" : "fit"; setPrefs({ aspect: n }); poke(); }} style={st.tool} hitSlop={6}><Ionicons name="expand-outline" size={19} color="#fff" /></Pressable>
                  {endsAt ? <Text style={[st.toolTxt, { alignSelf: "center", marginLeft: 6, opacity: 0.8 }]}>Ends {endsAt}</Text> : null}
                  <Pressable onPress={() => setPanel("timer")} style={st.tool} hitSlop={6}><Ionicons name="moon-outline" size={19} color={timer === "off" ? "#fff" : C.accent} /></Pressable>
                  <View style={{ flex: 1 }} />
                  {(list?.length ?? 0) > 0 ? <Pressable onPress={() => setPanel("servers")} style={st.serverBtn} hitSlop={6}><Ionicons name="server-outline" size={15} color="#fff" /><Text style={st.serverTxt} numberOfLines={1}>{stream ? label(stream) : "Servers"}</Text></Pressable> : null}
                </View>
              </View>
            </>
          ) : null}
        </>
      ) : null}

      {panel ? (
        <Panel d={panelData} a={panelActions} />
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  hint: { color: "#ddd", marginTop: 10 },
  top: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, backgroundColor: "rgba(0,0,0,.45)" },
  title: { color: "#fff", fontSize: 16, fontWeight: "800" },
  epTitle: { color: "#cfcfe0", fontSize: 12.5, marginTop: 1 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  serverBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: "rgba(255,255,255,.16)", maxWidth: 260 },
  serverTxt: { color: "#fff", fontSize: 12, fontWeight: "600", flexShrink: 1 },
  mid: { ...StyleSheet.absoluteFill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 26 },
  playBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,90,54,.92)", alignItems: "center", justifyContent: "center" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingBottom: 10, paddingTop: 22, backgroundColor: "rgba(0,0,0,.5)" },
  barRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  toolRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  tool: { flexDirection: "row", alignItems: "center", gap: 5, height: 36, paddingHorizontal: 10, borderRadius: 18 },
  toolTxt: { color: "#fff", fontSize: 12, fontWeight: "700" },
  time: { color: "#fff", fontSize: 12.5, width: 52, textAlign: "center", fontVariant: ["tabular-nums"] },
  subWrap: { position: "absolute", left: 40, right: 40, bottom: 30, alignItems: "center" },
  sub: { color: "#fff", fontSize: 18, textAlign: "center", fontWeight: "600", backgroundColor: "rgba(0,0,0,.55)", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, overflow: "hidden", textShadowColor: "#000", textShadowRadius: 3 },
  flash: { position: "absolute", top: "38%", width: 90, height: 90, borderRadius: 45, backgroundColor: "rgba(255,255,255,.18)", alignItems: "center", justifyContent: "center" },
  flashTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
  note: { position: "absolute", top: 70, alignSelf: "center", maxWidth: "70%", backgroundColor: "rgba(0,0,0,.75)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  noteTxt: { color: "#fff", fontSize: 13, fontWeight: "600", textAlign: "center" },
  boost: { position: "absolute", top: 24, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,.7)", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  boostTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  dragBox: { position: "absolute", top: "32%", alignSelf: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,.65)", paddingHorizontal: 22, paddingVertical: 10, borderRadius: 14 },
  dragBig: { color: "#fff", fontSize: 26, fontWeight: "800" },
  dragSm: { color: "#ddd", fontSize: 13, marginTop: 2, fontVariant: ["tabular-nums"] },
  hud: { position: "absolute", top: "20%", height: "55%", width: 54, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(0,0,0,.55)", borderRadius: 27, paddingVertical: 12 },
  hudBar: { flex: 1, width: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,.3)", justifyContent: "flex-end", overflow: "hidden" },
  hudFill: { width: 6, backgroundColor: "#fff" },
  hudTxt: { color: "#fff", fontSize: 12, fontWeight: "800" },
  nextPill: { position: "absolute", right: 24, bottom: 112, flexDirection: "row", alignItems: "center", gap: 8, height: 38, paddingHorizontal: 16, borderRadius: 19, backgroundColor: "rgba(255,90,54,.92)" },
  skipPill: { position: "absolute", right: 24, bottom: 112, height: 38, paddingHorizontal: 16, borderRadius: 19, backgroundColor: "rgba(255,255,255,.2)", alignItems: "center", justifyContent: "center" },
  nextTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  lockWrap: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  lockBtn: { flexDirection: "row", alignItems: "center", gap: 8, height: 46, paddingHorizontal: 20, borderRadius: 23, backgroundColor: "rgba(0,0,0,.75)" },
  lockTxt: { color: "#fff", fontWeight: "700" },
  pill: { paddingHorizontal: 16, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,.16)", alignItems: "center", justifyContent: "center" },
  pillTxt: { color: "#fff", fontWeight: "700" },
});
