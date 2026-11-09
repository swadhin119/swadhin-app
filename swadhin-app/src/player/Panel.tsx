// Settings side panel: Speed · Audio · Subtitles · Servers/Quality · Display · Sleep timer
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, R } from "../theme";
import type { Aspect } from "./prefs";

export type PanelTab = "servers" | "speed" | "audio" | "subs" | "display" | "timer";
export type Timer = "off" | "end" | number;
export interface Item { key: string; text: string; active?: boolean; dim?: boolean }

export interface PanelProps {
  tab: PanelTab; onTab(t: PanelTab): void; onClose(): void;
  servers: Item[]; onServer(key: string): void;
  speed: number; onSpeed(n: number): void;
  audio: Item[]; onAudio(key: string): void;
  subs: Item[]; onSub(key: string): void;
  subScale: number; onSubScale(n: number): void; subBg: boolean; onSubBg(b: boolean): void; subDelay: number; onSubDelay(n: number): void;
  aspect: Aspect; onAspect(a: Aspect): void; autoRotate: boolean; onRotate(): void;
  timer: Timer; onTimer(t: Timer): void;
}
const TABS: { id: PanelTab; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { id: "servers", icon: "server-outline", label: "Quality" },
  { id: "speed", icon: "speedometer-outline", label: "Speed" },
  { id: "audio", icon: "musical-notes-outline", label: "Audio" },
  { id: "subs", icon: "chatbox-ellipses-outline", label: "Subtitles" },
  { id: "display", icon: "tv-outline", label: "Display" },
  { id: "timer", icon: "moon-outline", label: "Timer" },
];
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const TIMERS: { v: Timer; t: string }[] = [{ v: "off", t: "Off" }, { v: 15, t: "15 min" }, { v: 30, t: "30 min" }, { v: 45, t: "45 min" }, { v: 60, t: "1 hour" }, { v: "end", t: "End of episode" }];

export function Panel(p: PanelProps) {
  return (
    <Pressable style={st.back} onPress={p.onClose}>
      <Pressable style={st.panel} onPress={() => {}}>
        <View style={st.tabs}>
          {TABS.map((t) => (
            <Pressable key={t.id} onPress={() => p.onTab(t.id)} style={[st.tab, p.tab === t.id && st.tabOn]} hitSlop={4}>
              <Ionicons name={t.icon} size={18} color={p.tab === t.id ? C.accent : C.sub} />
              <Text style={[st.tabTxt, p.tab === t.id && { color: C.accent }]} numberOfLines={1}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          {p.tab === "servers" ? (p.servers.length ? p.servers.map((i) => <Row key={i.key} text={i.text} active={i.active} dim={i.dim} onPress={() => p.onServer(i.key)} />) : <Empty text="No other servers for this video" />) : null}
          {p.tab === "speed" ? (
            <View style={st.grid}>{SPEEDS.map((s) => <Chip key={s} text={s === 1 ? "Normal" : s + "x"} on={Math.abs(p.speed - s) < 0.01} onPress={() => p.onSpeed(s)} />)}</View>
          ) : null}
          {p.tab === "audio" ? (p.audio.length ? p.audio.map((i) => <Row key={i.key} text={i.text} active={i.active} dim={i.dim} onPress={() => p.onAudio(i.key)} />) : <Empty text="This video has only one audio track" />) : null}
          {p.tab === "subs" ? (
            <>
              {p.subs.map((i) => <Row key={i.key} text={i.text} active={i.active} dim={i.dim} onPress={() => p.onSub(i.key)} />)}
              <Text style={st.sec}>Style</Text>
              <View style={st.grid}>
                {[0.8, 1, 1.3, 1.6].map((s, k) => <Chip key={s} text={["Small", "Medium", "Large", "Huge"][k]} on={Math.abs(p.subScale - s) < 0.01} onPress={() => p.onSubScale(s)} />)}
                <Chip text={p.subBg ? "Background: on" : "Background: off"} on={p.subBg} onPress={() => p.onSubBg(!p.subBg)} />
              </View>
              <Text style={st.sec}>Delay (external subtitles)</Text>
              <View style={st.grid}>
                <Chip text="−0.5s" onPress={() => p.onSubDelay(Math.round((p.subDelay - 0.5) * 10) / 10)} />
                <Chip text={(p.subDelay > 0 ? "+" : "") + p.subDelay.toFixed(1) + "s"} on={p.subDelay !== 0} onPress={() => p.onSubDelay(0)} />
                <Chip text="+0.5s" onPress={() => p.onSubDelay(Math.round((p.subDelay + 0.5) * 10) / 10)} />
              </View>
            </>
          ) : null}
          {p.tab === "display" ? (
            <>
              <Text style={st.sec}>Picture size</Text>
              <View style={st.grid}>
                <Chip text="Fit" on={p.aspect === "fit"} onPress={() => p.onAspect("fit")} />
                <Chip text="Fill (crop)" on={p.aspect === "fill"} onPress={() => p.onAspect("fill")} />
                <Chip text="Stretch" on={p.aspect === "stretch"} onPress={() => p.onAspect("stretch")} />
              </View>
              <Text style={st.sec}>Screen rotation</Text>
              <View style={st.grid}><Chip text={p.autoRotate ? "Auto-rotate" : "Locked to landscape"} on onPress={p.onRotate} /></View>
              <Text style={st.hint}>Tip: swipe up/down on the left side for brightness, on the right side for volume. Swipe sideways to seek. Press and hold to play at 2x. Double-tap the sides to skip 10 seconds.</Text>
            </>
          ) : null}
          {p.tab === "timer" ? <View style={st.grid}>{TIMERS.map((t) => <Chip key={String(t.v)} text={t.t} on={p.timer === t.v} onPress={() => p.onTimer(t.v)} />)}</View> : null}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}
const Empty = ({ text }: { text: string }) => <Text style={st.hint}>{text}</Text>;
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
  panel: { width: 380, maxWidth: "78%", height: "100%", backgroundColor: C.card, paddingHorizontal: 14, paddingTop: 10 },
  tabs: { flexDirection: "row", marginBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8, gap: 2, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabOn: { borderBottomColor: C.accent },
  tabTxt: { color: C.sub, fontSize: 10.5, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, gap: 8, borderRadius: R.s },
  rowTxt: { color: C.text, fontSize: 14, flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 8 },
  chip: { paddingHorizontal: 14, height: 38, borderRadius: 19, backgroundColor: C.card2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipTxt: { color: C.text, fontSize: 13, fontWeight: "700" },
  sec: { color: C.sub, fontSize: 12, fontWeight: "800", marginTop: 14, textTransform: "uppercase", letterSpacing: 0.6 },
  hint: { color: C.sub, fontSize: 12.5, lineHeight: 18, marginTop: 14 },
});
