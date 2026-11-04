import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { WebView } from "react-native-webview";
import { StatusBar } from "expo-status-bar";
import { useKeepAwake } from "expo-keep-awake";
import * as ScreenOrientation from "expo-screen-orientation";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { C, R } from "../theme";
import { getStreams } from "../engine/engine";
import { makeAltFinder, type AltItem } from "../engine/fallback";
import { enqueue } from "../engine/downloads";
import type { Stream } from "../engine/types";
import { getSession, getState, itemKey, saveProgress } from "../state/store";
import { useAsync } from "../lib/useAsync";
import { cueAt, fmtTime, parseSubtitles, type Cue } from "../lib/subtitles";

const label = (s: Stream) => `${s.server}${s.quality ? " • " + s.quality + (/p$/i.test(s.quality) ? "" : "p") : ""} • ${s.kind.toUpperCase()}`;

export default function Player() {
  useKeepAwake();
  const sess = getSession();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(sess?.index ?? 0);
  // auto-fallback: jab tak chale nahi, doosre drive / quality / provider par apne aap
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
  const [panel, setPanel] = useState<null | "servers" | "subs">(null);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scrub, setScrub] = useState<number | null>(null);
  const [seekFlash, setSeekFlash] = useState<null | "L" | "R">(null);
  const [subIdx, setSubIdx] = useState(-1);
  const [cues, setCues] = useState<Cue[]>([]);

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
  const tapT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef({ t: 0, side: "" });
  const barW = useRef(1);

  const player = useVideoPlayer(null, (p) => { p.timeUpdateEventInterval = 0.25; });

  // ---- landscape lock ----
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    return () => { void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); };
  }, []);

  // ---- naya episode: sab reset, history se resume position ----
  useEffect(() => {
    if (!sess || !item) return;
    const h = getState().history[itemKey(sess.provider, sess.detailLink)];
    startAt.current = h?.epLink === item.link && h.pos > 5 && (!h.dur || h.pos < h.dur - 30) ? h.pos : 0;
    setSel(null); setFailed(new Set()); setTime(0); setDur(0); setLoading(true); setSubIdx(-1); setCues([]); setPanel(null);
    finder.current = null; setExhausted(false); setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // ---- streams aa gaye: pehla chalne layak chuno ----
  useEffect(() => {
    if (!list || sel) return;
    const pick = list.find((s) => s.kind !== "embed" && !failed.has(s.id)) || list.find((s) => !failed.has(s.id));
    if (pick) setSel(pick.id);
  }, [list, sel, failed]);

  const markFailed = useCallback(() => {
    if (!stream) return;
    startAt.current = lastTime.current > 5 ? lastTime.current : startAt.current; // jahan the wahin se agle server par
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
      if (!c) { setExhausted(true); setNote("Koi aur source nahi mila"); return; }
      startAt.current = lastTime.current > 5 ? lastTime.current : startAt.current;
      setFailed(new Set()); setSel(null); setLoading(true);
      setAlt({ forIndex: index, provider: c.provider, items: c.items, at: c.at });
      setNote("Source badla: " + c.label);
    } catch { setExhausted(true); } finally { switchingRef.current = false; setSwitching(false); }
  }, [sess, orig, index]);

  const allFailed0 = !!list && list.length > 0 && list.every((s) => failed.has(s.id));
  const noStreams0 = !streams.loading && (!!streams.error || (!!list && list.length === 0));
  useEffect(() => {
    if (!sess || !item || isLocal || exhausted || switching) return;
    if (allFailed0 || noStreams0) void switchSource();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFailed0, noStreams0, exhausted, switching, item?.link, prov]);

  // stream chuna par 30s me start hi nahi hua to bekaar maan ke agla
  useEffect(() => {
    if (!stream || stream.kind === "embed") return;
    started.current = false;
    const t = setTimeout(() => { if (!started.current) markFailed(); }, 30000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream?.id]);

  // ---- stream badla: player me load karo ----
  useEffect(() => {
    if (!stream || stream.kind === "embed") { try { player.pause(); } catch { /* ignore */ } return; }
    let dead = false;
    setLoading(true);
    player.replaceAsync({ uri: stream.link, headers: stream.headers, contentType: stream.kind === "hls" ? "hls" : "auto" })
      .then(() => { if (!dead) player.play(); })
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
          if (startAt.current > 2) { player.currentTime = startAt.current; startAt.current = 0; }
          player.play();
        } else if (status === "loading") setLoading(true);
        else if (status === "error") markFailed();
      }),
      player.addListener("playingChange", ({ isPlaying }) => setPlaying(isPlaying)),
      player.addListener("timeUpdate", ({ currentTime }) => {
        lastTime.current = currentTime; setTime(currentTime);
        const d = player.duration; if (d > 0 && d !== lastDur.current) { lastDur.current = d; setDur(d); }
        if (currentTime > 0.5) { started.current = true; setLoading(false); }
        const o = origRef.current;
        if (sess && o && !/^file:/i.test(o.link) && currentTime > 3) saveProgress({ provider: sess.provider, link: sess.detailLink, title: sess.title, image: sess.image, pos: currentTime, dur: lastDur.current, epTitle: o.title, epLink: o.link, epType: o.type });
      }),
      player.addListener("playToEnd", () => { if (hasNext) setIndex((i) => i + 1); else router.back(); }),
    ];
    return () => subs.forEach((s) => s.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, markFailed, hasNext, item?.link]);

  // ---- band hote waqt progress pakka save + player roko ----
  useEffect(() => () => {
    try {
      const o = origRef.current;
      if (sess && o && !/^file:/i.test(o.link) && lastTime.current > 3) saveProgress({ provider: sess.provider, link: sess.detailLink, title: sess.title, image: sess.image, pos: lastTime.current, dur: lastDur.current, epTitle: o.title, epLink: o.link, epType: o.type }, true);
      player.pause();
    } catch { /* player pehle hi release ho chuka */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- subtitles: English default, baaki list se ----
  useEffect(() => {
    const subs = stream?.subtitles || [];
    const en = subs.findIndex((s) => /^en/i.test(s.language || "") || /english/i.test(s.title));
    setSubIdx(en);
  }, [stream?.id]);
  useEffect(() => {
    const sub = stream?.subtitles?.[subIdx];
    if (!sub) { setCues([]); return; }
    let dead = false;
    fetch(sub.uri, { headers: stream?.headers }).then((r) => r.text()).then((t) => { if (!dead) setCues(parseSubtitles(t)); }).catch(() => { if (!dead) setCues([]); });
    return () => { dead = true; };
  }, [stream?.id, subIdx]);
  const subText = useMemo(() => (cues.length ? cueAt(cues, time) : ""), [cues, time]);

  // ---- controls auto-hide ----
  const poke = useCallback(() => {
    setShown(true);
    if (hideT.current) clearTimeout(hideT.current);
    hideT.current = setTimeout(() => setShown(false), 3800);
  }, []);
  useEffect(() => { poke(); return () => { if (hideT.current) clearTimeout(hideT.current); if (tapT.current) clearTimeout(tapT.current); }; }, [poke]);
  useEffect(() => { if (!playing && hideT.current) clearTimeout(hideT.current); }, [playing]);

  const seekBy = (d: number) => { try { player.currentTime = Math.max(0, Math.min(lastDur.current || 1e9, lastTime.current + d)); } catch { /* ignore */ } };
  const togglePlay = () => { if (player.playing) player.pause(); else player.play(); poke(); };

  const onTap = (side: "L" | "R") => {
    const now = Date.now();
    if (now - lastTap.current.t < 300 && lastTap.current.side === side) {
      if (tapT.current) clearTimeout(tapT.current);
      seekBy(side === "L" ? -10 : 10); setSeekFlash(side); setTimeout(() => setSeekFlash(null), 600); lastTap.current = { t: 0, side: "" }; return;
    }
    lastTap.current = { t: now, side };
    tapT.current = setTimeout(() => { if (shown) { setShown(false); } else poke(); }, 300);
  };

  // ---- seek bar ----
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => { setScrub(Math.max(0, Math.min(1, e.nativeEvent.locationX / barW.current))); },
    onPanResponderMove: (e) => { setScrub(Math.max(0, Math.min(1, e.nativeEvent.locationX / barW.current))); },
    onPanResponderRelease: (e) => {
      const f = Math.max(0, Math.min(1, e.nativeEvent.locationX / barW.current));
      if (lastDur.current > 0) player.currentTime = f * lastDur.current;
      setScrub(null); poke();
    },
    onPanResponderTerminate: () => setScrub(null),
  }), [player, poke]);
  const frac = scrub ?? (dur > 0 ? Math.min(1, time / dur) : 0);

  if (!sess || !item) return <View style={st.root}><Text style={{ color: C.text, margin: 40 }}>Kuch chalane ko nahi hai.</Text><Pressable onPress={() => router.back()}><Text style={{ color: C.accent, marginLeft: 40 }}>Wapas</Text></Pressable></View>;

  const allFailed = allFailed0;
  const noStreams = noStreams0;
  const giveUp = (allFailed || noStreams) && (exhausted || isLocal) && !switching;
  const embed = stream?.kind === "embed";

  return (
    <View style={st.root}>
      <StatusBar hidden />
      {embed ? (
        <WebView source={{ uri: stream!.link, headers: stream!.headers }} style={{ flex: 1, backgroundColor: "#000" }} allowsFullscreenVideo javaScriptEnabled domStorageEnabled
          mediaPlaybackRequiresUserAction={false} setSupportMultipleWindows={false} onShouldStartLoadWithRequest={(r) => !/^(intent|market):/i.test(r.url)} />
      ) : (
        <>
          <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} contentFit="contain" />
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <View style={{ flex: 1, flexDirection: "row" }}>
              <Pressable style={{ flex: 1 }} onPress={() => onTap("L")} />
              <Pressable style={{ flex: 1 }} onPress={() => onTap("R")} />
            </View>
          </View>
          {seekFlash ? <View pointerEvents="none" style={[st.flash, seekFlash === "L" ? { left: width * 0.12 } : { right: width * 0.12 }]}><Ionicons name={seekFlash === "L" ? "play-back" : "play-forward"} size={30} color="#fff" /><Text style={st.flashTxt}>10s</Text></View> : null}
          {subText ? <View pointerEvents="none" style={st.subWrap}><Text style={st.sub}>{subText}</Text></View> : null}
        </>
      )}

      {note ? <View pointerEvents="none" style={st.note}><Text style={st.noteTxt} numberOfLines={2}>{note}</Text></View> : null}

      {(streams.loading || switching || (loading && !embed && !allFailed && !noStreams)) ? <View pointerEvents="none" style={st.center}><ActivityIndicator size="large" color={C.accent} /><Text style={st.hint}>{switching ? "Doosra source dhoondh raha hoon…" : streams.loading ? "Streams dhoondh raha hoon…" : "Buffering…"}</Text></View> : null}

      {giveUp ? (
        <View style={st.center}>
          <Ionicons name="alert-circle-outline" size={44} color={C.danger} />
          <Text style={[st.hint, { fontSize: 15, textAlign: "center", maxWidth: 420 }]}>{streams.error ? streams.error : allFailed ? "Koi server nahi chala." : "Is episode ke liye stream nahi mili."}</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            {allFailed ? <Pressable style={st.pill} onPress={() => { setFailed(new Set()); setSel(null); }}><Text style={st.pillTxt}>Dobara try</Text></Pressable> : <Pressable style={st.pill} onPress={streams.reload}><Text style={st.pillTxt}>Dobara try</Text></Pressable>}
            {stream ? <Pressable style={st.pill} onPress={() => Linking.openURL(stream.link)}><Text style={st.pillTxt}>Original link kholo</Text></Pressable> : null}
            <Pressable style={st.pill} onPress={() => router.back()}><Text style={st.pillTxt}>Wapas</Text></Pressable>
          </View>
        </View>
      ) : null}

      {(shown || embed || giveUp) ? (
        <>
          <View style={st.top} pointerEvents="box-none">
            <Pressable onPress={() => router.back()} hitSlop={10} style={st.iconBtn}><Ionicons name="chevron-back" size={26} color="#fff" /></Pressable>
            <View style={{ flex: 1 }}>
              <Text style={st.title} numberOfLines={1}>{sess.title}</Text>
              <Text style={st.epTitle} numberOfLines={1}>{sess.items.length > 1 || item.title ? item.title : ""}</Text>
            </View>
            {!isLocal ? <Pressable onPress={() => { setExhausted(false); void switchSource(); }} style={st.iconBtn} hitSlop={8}><Ionicons name="shuffle" size={22} color="#fff" /></Pressable> : null}
            {!isLocal && orig ? <Pressable onPress={() => { enqueue({ provider: sess.provider, detailLink: sess.detailLink, title: sess.title, image: sess.image, epTitle: orig.title, type: orig.type, link: orig.link,
              ctx: { provider: sess.provider, title: sess.title, type: sess.type ?? orig.type, index, items: sess.items, groups: sess.groups, groupIdx: sess.groupIdx } }); setNote("Download shuru • Downloads tab me dekho"); }} style={st.iconBtn} hitSlop={8}><Ionicons name="download-outline" size={22} color="#fff" /></Pressable> : null}
            {(stream?.subtitles?.length ?? 0) > 0 && !embed ? <Pressable onPress={() => { setPanel("subs"); }} style={st.iconBtn} hitSlop={8}><Ionicons name={subIdx >= 0 ? "chatbox-ellipses" : "chatbox-ellipses-outline"} size={22} color="#fff" /></Pressable> : null}
            {(list?.length ?? 0) > 0 ? <Pressable onPress={() => setPanel("servers")} style={st.serverBtn} hitSlop={8}><Ionicons name="server-outline" size={16} color="#fff" /><Text style={st.serverTxt} numberOfLines={1}>{stream ? label(stream) : "Servers"}</Text></Pressable> : null}
          </View>

          {!embed && !giveUp && !allFailed && !noStreams ? (
            <>
              <View style={st.mid} pointerEvents="box-none">
                <Pressable onPress={() => hasPrev && setIndex((i) => i - 1)} disabled={!hasPrev} style={[st.iconBtn, !hasPrev && { opacity: 0.25 }]}><Ionicons name="play-skip-back" size={28} color="#fff" /></Pressable>
                <Pressable onPress={() => { seekBy(-10); poke(); }} style={st.iconBtn}><Ionicons name="play-back" size={28} color="#fff" /></Pressable>
                <Pressable onPress={togglePlay} style={st.playBtn}><Ionicons name={playing ? "pause" : "play"} size={38} color="#fff" /></Pressable>
                <Pressable onPress={() => { seekBy(10); poke(); }} style={st.iconBtn}><Ionicons name="play-forward" size={28} color="#fff" /></Pressable>
                <Pressable onPress={() => hasNext && setIndex((i) => i + 1)} disabled={!hasNext} style={[st.iconBtn, !hasNext && { opacity: 0.25 }]}><Ionicons name="play-skip-forward" size={28} color="#fff" /></Pressable>
              </View>
              <View style={st.bottom} pointerEvents="box-none">
                <Text style={st.time}>{fmtTime(scrub != null ? scrub * dur : time)}</Text>
                <View style={st.barHit} onLayout={(e) => { barW.current = e.nativeEvent.layout.width || 1; }} {...pan.panHandlers}>
                  <View style={st.barBg} pointerEvents="none"><View style={[st.barFill, { width: `${frac * 100}%` }]} /></View>
                  <View pointerEvents="none" style={[st.knob, { left: `${frac * 100}%` }]} />
                </View>
                <Text style={st.time}>{fmtTime(dur)}</Text>
              </View>
            </>
          ) : null}
        </>
      ) : null}

      {panel ? (
        <Pressable style={st.panelBack} onPress={() => setPanel(null)}>
          <Pressable style={st.panel} onPress={() => {}}>
            <Text style={st.panelTitle}>{panel === "servers" ? "Server / Quality" : "Subtitles"}</Text>
            <ScrollView>
              {panel === "subs" ? (
                <>
                  <Row text="Off" active={subIdx < 0} onPress={() => { setSubIdx(-1); setPanel(null); }} />
                  {(stream?.subtitles || []).map((s, i) => <Row key={s.uri} text={s.title || s.language || "Track " + (i + 1)} active={i === subIdx} onPress={() => { setSubIdx(i); setPanel(null); }} />)}
                </>
              ) : (list || []).map((s) => (
                <Row key={s.id} text={label(s)} active={s.id === sel} dim={failed.has(s.id)} onPress={() => { startAt.current = lastTime.current > 5 ? lastTime.current : startAt.current; setFailed((f) => { const n = new Set(f); n.delete(s.id); return n; }); setSel(s.id); setPanel(null); }} />
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      ) : null}
    </View>
  );
}

function Row({ text, active, dim, onPress }: { text: string; active?: boolean; dim?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={st.row}>
      <Text style={[st.rowTxt, dim && { color: C.sub, textDecorationLine: "line-through" }, active && { color: C.accent, fontWeight: "800" }]} numberOfLines={1}>{text}</Text>
      {active ? <Ionicons name="checkmark" size={18} color={C.accent} /> : null}
    </Pressable>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  hint: { color: "#ddd", marginTop: 10 },
  top: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, backgroundColor: "rgba(0,0,0,.45)" },
  title: { color: "#fff", fontSize: 16, fontWeight: "800" },
  epTitle: { color: "#cfcfe0", fontSize: 12.5, marginTop: 1 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  serverBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: "rgba(255,255,255,.16)", maxWidth: 260 },
  serverTxt: { color: "#fff", fontSize: 12.5, fontWeight: "600", flexShrink: 1 },
  mid: { ...StyleSheet.absoluteFill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 26 },
  playBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,90,54,.92)", alignItems: "center", justifyContent: "center" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 14, paddingTop: 26, backgroundColor: "rgba(0,0,0,.45)" },
  time: { color: "#fff", fontSize: 12.5, width: 52, textAlign: "center", fontVariant: ["tabular-nums"] },
  barHit: { flex: 1, height: 36, justifyContent: "center" },
  barBg: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,.28)", overflow: "hidden" },
  barFill: { height: 4, backgroundColor: C.accent },
  knob: { position: "absolute", width: 14, height: 14, borderRadius: 7, marginLeft: -7, top: 11, backgroundColor: "#fff" },
  subWrap: { position: "absolute", left: 40, right: 40, bottom: 56, alignItems: "center" },
  sub: { color: "#fff", fontSize: 18, textAlign: "center", fontWeight: "600", backgroundColor: "rgba(0,0,0,.55)", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, overflow: "hidden", textShadowColor: "#000", textShadowRadius: 3 },
  flash: { position: "absolute", top: "38%", width: 90, height: 90, borderRadius: 45, backgroundColor: "rgba(255,255,255,.18)", alignItems: "center", justifyContent: "center" },
  flashTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
  note: { position: "absolute", top: 70, alignSelf: "center", maxWidth: "70%", backgroundColor: "rgba(0,0,0,.75)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  noteTxt: { color: "#fff", fontSize: 13, fontWeight: "600", textAlign: "center" },
  pill: { paddingHorizontal: 16, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,.16)", alignItems: "center", justifyContent: "center" },
  pillTxt: { color: "#fff", fontWeight: "700" },
  panelBack: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,.5)", alignItems: "flex-end" },
  panel: { width: 340, maxWidth: "70%", height: "100%", backgroundColor: C.card, padding: 16 },
  panelTitle: { color: C.text, fontSize: 17, fontWeight: "800", marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, gap: 8, borderRadius: R.s },
  rowTxt: { color: C.text, fontSize: 14, flex: 1 },
});
