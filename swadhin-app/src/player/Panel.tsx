// Settings side panel (MX Player style)
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, R } from "../theme";
import { fmtTime } from "../lib/subtitles";
import type { Aspect, Prefs, Repeat } from "./prefs";

export type PanelTab = "servers" | "speed" | "audio" | "subs" | "display" | "tools" | "episodes" | "settings" | "info" | "timer";
export type Timer = "off" | "end" | number;
export type Orient = "land" | "auto" | "port";
export interface Item { key: string; text: string; active?: boolean; dim?: boolean }
export interface PanelData {
  tab: PanelTab; servers: Item[]; speed: number; audio: Item[]; subs: Item[]; subDelay: number; prefs: Prefs; orient: Orient; zoom: number;
  timer: Timer; ab: { a: number | null; b: number | null }; bookmarks: number[]; episodes: Item[]; info: [string, string][]; canExternal: boolean; subBusy: string;
}
export interface PanelActions {
  tab(t: PanelTab): void; close(): void; server(k: string): void; speed(n: number): void; audio(k: string): void; sub(k: string): void; subDelay(n: number): void;
  prefs(p: Partial<Prefs>): void; orient(o: Orient): void; resetZoom(): void; timer(t: Timer): void;
  setA(): void; setB(): void; clearAB(): void; addBookmark(): void; jump(sec: number): void; delBookmark(sec: number): void;
  episode(k: string): void; loadSubFile(): void; loadSubUrl(url: string): void; external(): void;
}
const TABS: { id: PanelTab; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { id: "servers", icon: "server-outline", label: "Quality" }, { id: "speed", icon: "speedometer-outline", label: "Speed" },
  { id: "audio", icon: "musical-notes-outline", label: "Audio" }, { id: "subs", icon: "chatbox-ellipses-outline", label: "Subtitles" },
  { id: "display", icon: "tv-outline", label: "Display" }, { id: "tools", icon: "construct-outline", label: "Tools" },
  { id: "episodes", icon: "list-outline", label: "Episodes" }, { id: "settings", icon: "options-outline", label: "Settings" },
  { id: "info", icon: "information-circle-outline", label: "Info" }, { id: "timer", icon: "moon-outline", label: "Timer" },
];
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const TIMERS: { v: Timer; t: string }[] = [{ v: "off", t: "Off" }, { v: 15, t: "15 min" }, { v: 30, t: "30 min" }, { v: 45, t: "45 min" }, { v: 60, t: "1 hour" }, { v: "end", t: "End of episode" }];
const ASPECTS: { v: Aspect; t: string }[] = [{ v: "fit", t: "Fit" }, { v: "fill", t: "Fill (crop)" }, { v: "stretch", t: "Stretch" }, { v: "16:9", t: "16:9" }, { v: "4:3", t: "4:3" }, { v: "21:9", t: "21:9" }];
const SUB_COLORS = ["#ffffff", "#ffe14d", "#7df9ff", "#7CFC7C", "#ff9ecb"];
const SUB_SIZES = [0.7, 0.85, 1, 1.3, 1.6, 2];
const SKIPS = [5, 10, 15, 30, 60];
const r1 = (n: number) => Math.round(n * 10) / 10;

export function Panel({ d, a }: { d: PanelData; a: PanelActions }) {
  const p = d.prefs;
  const [url, setUrl] = useState("");
  return (
    <Pressable style={st.back} onPress={a.close}>
      <Pressable style={st.panel} onPress={() => {}}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.tabsScroll} contentContainerStyle={st.tabs}>
          {TABS.filter((t) => t.id !== "episodes" || d.episodes.length > 1).map((t) => (
            <Pressable key={t.id} onPress={() => a.tab(t.id)} style={[st.tab, d.tab === t.id && st.tabOn]} hitSlop={4}>
              <Ionicons name={t.icon} size={18} color={d.tab === t.id ? C.accent : C.sub} />
              <Text style={[st.tabTxt, d.tab === t.id && { color: C.accent }]} numberOfLines={1}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {d.tab === "servers" ? (d.servers.length ? d.servers.map((i) => <Row key={i.key} text={i.text} active={i.active} dim={i.dim} onPress={() => a.server(i.key)} />) : <Hint text="No other servers for this video" />) : null}
          {d.tab === "speed" ? (<>
            <View style={st.grid}>{SPEEDS.map((s) => <Chip key={s} text={s === 1 ? "Normal" : s + "x"} on={Math.abs(d.speed - s) < 0.01} onPress={() => a.speed(s)} />)}</View>
            <Sec t="Fine tune" />
            <View style={st.grid}>
              <Chip text="−0.05" onPress={() => a.speed(Math.max(0.1, Math.round((d.speed - 0.05) * 100) / 100))} />
              <Chip text={d.speed.toFixed(2) + "x"} on onPress={() => a.speed(1)} />
              <Chip text="+0.05" onPress={() => a.speed(Math.min(4, Math.round((d.speed + 0.05) * 100) / 100))} />
            </View></>) : null}
          {d.tab === "audio" ? (d.audio.length ? d.audio.map((i) => <Row key={i.key} text={i.text} active={i.active} onPress={() => a.audio(i.key)} />) : <Hint text="This video has only one audio track" />) : null}
          {d.tab === "subs" ? (<>
            {d.subs.map((i) => <Row key={i.key} text={i.text} active={i.active} onPress={() => a.sub(i.key)} />)}
            <View style={st.grid}><Chip text="Load from device" onPress={a.loadSubFile} /></View>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 4 }}>
              <TextInput style={st.input} value={url} onChangeText={setUrl} placeholder="…or paste a subtitle link (.srt / .vtt / .ass)" placeholderTextColor={C.sub} autoCapitalize="none" autoCorrect={false} />
              <Chip text="Load" onPress={() => { if (url.trim()) { a.loadSubUrl(url.trim()); setUrl(""); } }} />
            </View>
            {d.subBusy ? <Text style={st.hint}>{d.subBusy}</Text> : null}
            <Sec t="Size" />
            <View style={st.grid}>{SUB_SIZES.map((s) => <Chip key={s} text={Math.round(s * 100) + "%"} on={Math.abs(p.subScale - s) < 0.01} onPress={() => a.prefs({ subScale: s })} />)}</View>
            <Sec t="Colour" />
            <View style={st.grid}>{SUB_COLORS.map((c) => <Pressable key={c} onPress={() => a.prefs({ subColor: c })} style={[st.dot, { backgroundColor: c }, p.subColor === c && st.dotOn]} />)}</View>
            <Sec t="Look" />
            <View style={st.grid}>
              <Chip text="Bold" on={p.subBold} onPress={() => a.prefs({ subBold: !p.subBold })} />
              <Chip text="Outline" on={p.subOutline} onPress={() => a.prefs({ subOutline: !p.subOutline })} />
              {[0, 0.35, 0.6, 0.85].map((v, k) => <Chip key={v} text={["No box", "Light box", "Medium box", "Dark box"][k]} on={Math.abs(p.subBgAlpha - v) < 0.01} onPress={() => a.prefs({ subBgAlpha: v })} />)}
            </View>
            <Sec t="Position" />
            <View style={st.grid}>
              <Chip text="Lower" onPress={() => a.prefs({ subBottom: Math.max(4, p.subBottom - 12) })} />
              <Chip text={String(p.subBottom)} on onPress={() => a.prefs({ subBottom: 28 })} />
              <Chip text="Higher" onPress={() => a.prefs({ subBottom: Math.min(220, p.subBottom + 12) })} />
            </View>
            <Sec t="Delay (loaded subtitles)" />
            <View style={st.grid}>
              <Chip text="−0.5s" onPress={() => a.subDelay(r1(d.subDelay - 0.5))} /><Chip text="−0.1s" onPress={() => a.subDelay(r1(d.subDelay - 0.1))} />
              <Chip text={(d.subDelay > 0 ? "+" : "") + d.subDelay.toFixed(1) + "s"} on={d.subDelay !== 0} onPress={() => a.subDelay(0)} />
              <Chip text="+0.1s" onPress={() => a.subDelay(r1(d.subDelay + 0.1))} /><Chip text="+0.5s" onPress={() => a.subDelay(r1(d.subDelay + 0.5))} />
            </View></>) : null}
          {d.tab === "display" ? (<>
            <Sec t="Picture size" />
            <View style={st.grid}>{ASPECTS.map((x) => <Chip key={x.v} text={x.t} on={p.aspect === x.v} onPress={() => a.prefs({ aspect: x.v })} />)}</View>
            <Sec t={`Zoom (pinch with two fingers) • ${Math.round(d.zoom * 100)}%`} />
            <View style={st.grid}><Chip text="Reset zoom" onPress={a.resetZoom} /></View>
            <Sec t="Screen orientation" />
            <View style={st.grid}>
              <Chip text="Landscape" on={d.orient === "land"} onPress={() => a.orient("land")} />
              <Chip text="Auto-rotate" on={d.orient === "auto"} onPress={() => a.orient("auto")} />
              <Chip text="Portrait" on={d.orient === "port"} onPress={() => a.orient("port")} />
            </View>
            <Sec t="Eye comfort" />
            <View style={st.grid}><Chip text={p.night ? "Night mode: on" : "Night mode: off"} on={p.night} onPress={() => a.prefs({ night: !p.night })} /></View></>) : null}
          {d.tab === "tools" ? (<>
            <Sec t="A–B repeat" />
            <View style={st.grid}>
              <Chip text={d.ab.a != null ? "A: " + fmtTime(d.ab.a) : "Set A (start)"} on={d.ab.a != null} onPress={a.setA} />
              <Chip text={d.ab.b != null ? "B: " + fmtTime(d.ab.b) : "Set B (end)"} on={d.ab.b != null} onPress={a.setB} />
              <Chip text="Clear" onPress={a.clearAB} />
            </View>
            <Text style={st.hint}>{d.ab.a != null && d.ab.b != null ? "Looping between A and B." : "Play to the start of the part, tap Set A, then at the end tap Set B."}</Text>
            <Sec t="Repeat" />
            <View style={st.grid}>{(["off", "one", "all"] as Repeat[]).map((r) => <Chip key={r} text={r === "off" ? "No repeat" : r === "one" ? "Repeat this video" : "Repeat all"} on={p.repeat === r} onPress={() => a.prefs({ repeat: r })} />)}</View>
            <Sec t="Skip interval (double-tap and buttons)" />
            <View style={st.grid}>{SKIPS.map((s) => <Chip key={s} text={s + "s"} on={p.skipSec === s} onPress={() => a.prefs({ skipSec: s })} />)}</View>
            <Sec t="Bookmarks" />
            <View style={st.grid}><Chip text="Add bookmark here" onPress={a.addBookmark} /></View>
            {d.bookmarks.map((t) => (
              <View key={t} style={st.row}>
                <Pressable style={{ flex: 1 }} onPress={() => a.jump(t)}><Text style={st.rowTxt}>{fmtTime(t)}</Text></Pressable>
                <Pressable onPress={() => a.delBookmark(t)} hitSlop={10}><Ionicons name="close-circle-outline" size={20} color={C.sub} /></Pressable>
              </View>
            ))}
            {d.canExternal ? <><Sec t="Other player" /><View style={st.grid}><Chip text="Open in external player" onPress={a.external} /></View></> : null}</>) : null}
          {d.tab === "episodes" ? d.episodes.map((i) => <Row key={i.key} text={i.text} active={i.active} onPress={() => a.episode(i.key)} />) : null}
          {d.tab === "settings" ? (<>
            <Sec t="Gestures" />
            <View style={st.grid}>
              <Chip text="Swipe to seek" on={p.gSeek} onPress={() => a.prefs({ gSeek: !p.gSeek })} />
              <Chip text="Brightness / volume swipe" on={p.gSide} onPress={() => a.prefs({ gSide: !p.gSide })} />
              <Chip text="Double-tap" on={p.gDouble} onPress={() => a.prefs({ gDouble: !p.gDouble })} />
              <Chip text="Hold for 2x" on={p.gLong} onPress={() => a.prefs({ gLong: !p.gLong })} />
              <Chip text="Pinch to zoom" on={p.gPinch} onPress={() => a.prefs({ gPinch: !p.gPinch })} />
            </View>
            <Sec t="Playback" />
            <View style={st.grid}>
              <Chip text="Auto-play next episode" on={p.autoNext} onPress={() => a.prefs({ autoNext: !p.autoNext })} />
              <Chip text="Play in background" on={p.background} onPress={() => a.prefs({ background: !p.background })} />
              <Chip text="Show remaining time" on={p.remaining} onPress={() => a.prefs({ remaining: !p.remaining })} />
            </View>
            <Text style={st.hint}>Background play keeps the sound going (with a notification) when you leave the app or turn the screen off.</Text></>) : null}
          {d.tab === "info" ? d.info.map(([k, v]) => <View key={k} style={st.infoRow}><Text style={st.infoK}>{k}</Text><Text style={st.infoV} numberOfLines={2}>{v}</Text></View>) : null}
          {d.tab === "timer" ? <View style={st.grid}>{TIMERS.map((t) => <Chip key={String(t.v)} text={t.t} on={d.timer === t.v} onPress={() => a.timer(t.v)} />)}</View> : null}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}
const Sec = ({ t }: { t: string }) => <Text style={st.sec}>{t}</Text>;
const Hint = ({ text }: { text: string }) => <Text style={st.hint}>{text}</Text>;
function Chip({ text, on, onPress }: { text: string; on?: boolean; onPress(): void }) {
  return <Pressable onPress={onPress} style={[st.chip, on && st.chipOn]}><Text style={[st.chipTxt, on && { color: "#fff" }]}>{text}</Text></Pressable>;
}
function Row({ text, active, dim, onPress }: { text: string; active?: boolean; dim?: boolean; onPress(): void }) {
  return (
    <Pressable onPress={onPress} style={st.row}>
      <Text style={[st.rowTxt, dim && { color: C.sub, textDecorationLine: "line-through" }, active && { color: C.accent, fontWeight: "800" }]} numberOfLines={1}>{text}</Text>
      {active ? <Ionicons name="checkmark" size={18} color={C.accent} /> : null}
    </Pressable>
  );
}
const st = StyleSheet.create({
  back: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,.5)", alignItems: "flex-end" },
  panel: { width: 420, maxWidth: "82%", height: "100%", backgroundColor: C.card, paddingHorizontal: 14, paddingTop: 10 },
  tabsScroll: { flexGrow: 0, marginBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  tabs: { gap: 2 },
  tab: { width: 66, alignItems: "center", paddingVertical: 8, gap: 2, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabOn: { borderBottomColor: C.accent },
  tabTxt: { color: C.sub, fontSize: 10.5, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, gap: 8, borderRadius: R.s },
  rowTxt: { color: C.text, fontSize: 14, flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 8 },
  chip: { paddingHorizontal: 14, height: 38, borderRadius: 19, backgroundColor: C.card2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipTxt: { color: C.text, fontSize: 13, fontWeight: "700" },
  dot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: C.line },
  dotOn: { borderColor: C.accent, transform: [{ scale: 1.12 }] },
  input: { flex: 1, height: 38, borderRadius: 19, backgroundColor: C.card2, color: C.text, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, fontSize: 12.5 },
  sec: { color: C.sub, fontSize: 12, fontWeight: "800", marginTop: 14, textTransform: "uppercase", letterSpacing: 0.6 },
  hint: { color: C.sub, fontSize: 12.5, lineHeight: 18, marginTop: 10 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  infoK: { color: C.sub, fontSize: 13, width: 110 },
  infoV: { color: C.text, fontSize: 13, flex: 1, textAlign: "right" },
});
