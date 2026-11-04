import React from "react";
import { FlatList, Platform, Pressable, StyleSheet, Switch, Text, ToastAndroid, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, R } from "../../theme";
import { canGallery, pause, removeDl, resume, retryDl, saveToGallery, setAutoGallery, useAutoGallery, useDownloads, type DlItem } from "../../engine/downloads";
import { setSession } from "../../state/store";
import { Empty } from "../../components/ui";

const toast = (m: string) => { if (Platform.OS === "android") ToastAndroid.show(m, ToastAndroid.LONG); };
const mb = (b: number) => (b >= 1073741824 ? (b / 1073741824).toFixed(2) + " GB" : (b / 1048576).toFixed(b > 1e8 ? 0 : 1) + " MB");

function Row({ d }: { d: DlItem }) {
  const busy = d.status === "downloading" || d.status === "resolving";
  const play = () => {
    if (d.status !== "done" || !d.path) return;
    setSession({ provider: d.provider, detailLink: d.detailLink, title: d.title, image: d.image, items: [{ title: d.epTitle || d.title, link: d.path, type: d.type }], index: 0, type: d.type });
    router.push("/player");
  };
  const info = d.status === "done" ? `Ready • ${mb(d.total || d.bytes)}${d.gallery === "saved" ? " • In gallery" : ""}`
    : d.status === "error" ? (d.error || "Error")
    : d.status === "paused" ? "Paused"
    : d.status === "queued" ? "Queued…"
    : d.status === "resolving" ? (d.src || "Finding link…")
    : `${mb(d.bytes)}${d.total ? " / " + mb(d.total) : ""} • ${d.speed > 0 ? mb(d.speed) + "/s" : "…"}`;
  return (
    <Pressable onPress={play} style={st.row}>
      <View style={st.thumb}>{d.image ? <Image source={{ uri: d.image }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        {d.status === "done" ? <View style={st.playOv}><Ionicons name="play" size={22} color="#fff" /></View> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={st.title} numberOfLines={1}>{d.title}</Text>
        {d.epTitle && d.epTitle !== d.title ? <Text style={st.ep} numberOfLines={1}>{d.epTitle}</Text> : null}
        <Text style={[st.info, d.status === "error" && { color: C.danger }]} numberOfLines={2}>{info}</Text>
        {busy && d.src ? <Text style={st.src} numberOfLines={1}>{d.src}</Text> : null}
        {d.status === "done" && d.galleryErr && d.gallery !== "saved" ? <Text style={[st.info, { color: C.danger }]} numberOfLines={2}>{d.galleryErr}</Text> : null}
        {d.status === "done" && d.kind === "hls" ? <Text style={st.src} numberOfLines={2}>Plays in the app only (cannot be saved to gallery)</Text> : null}
        {d.status !== "done" ? <View style={st.bar}><View style={[st.fill, { width: `${Math.round(d.progress * 100)}%` }]} /></View> : null}
      </View>
      <View style={{ gap: 4 }}>
        {canGallery(d) ? <Pressable hitSlop={8} style={st.btn} onPress={async () => toast(await saveToGallery(d.id))}>
          {d.gallery === "saved" ? <Ionicons name="checkmark-circle" size={20} color="#3ddc84" /> : <Ionicons name={d.gallery === "saving" ? "hourglass-outline" : "images-outline"} size={18} color={C.text} />}
        </Pressable> : null}
        {busy || d.status === "queued" ? <Pressable hitSlop={8} style={st.btn} onPress={() => pause(d.id)}><Ionicons name="pause" size={18} color={C.text} /></Pressable> : null}
        {d.status === "paused" ? <Pressable hitSlop={8} style={st.btn} onPress={() => resume(d.id)}><Ionicons name="play" size={18} color={C.text} /></Pressable> : null}
        {d.status === "error" ? <Pressable hitSlop={8} style={st.btn} onPress={() => retryDl(d.id)}><Ionicons name="refresh" size={18} color={C.text} /></Pressable> : null}
        <Pressable hitSlop={8} style={st.btn} onPress={() => removeDl(d.id)}><Ionicons name="trash-outline" size={18} color={C.danger} /></Pressable>
      </View>
    </Pressable>
  );
}

export default function Downloads() {
  const insets = useSafeAreaInsets();
  const list = useDownloads();
  const auto = useAutoGallery();
  return (
    <View style={{ flex: 1, paddingTop: insets.top + 12 }}>
      <Text style={st.h1}>Downloads</Text>
      <View style={st.autoRow}>
        <View style={{ flex: 1 }}>
          <Text style={st.autoTitle}>Auto-save to gallery</Text>
          <Text style={st.autoSub}>Copy each finished mp4 / mkv download into your phone gallery. Uses extra storage.</Text>
        </View>
        <Switch value={auto} onValueChange={setAutoGallery} trackColor={{ true: C.accent, false: C.line }} thumbColor="#fff" />
      </View>
      {list.length ? <FlatList data={list} keyExtractor={(d) => d.id} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} renderItem={({ item }) => <Row d={item} />} />
        : <Empty icon="download-outline" text={"No downloads yet.\nStart one with the download button on any movie or episode."} />}
    </View>
  );
}
const st = StyleSheet.create({
  h1: { color: C.text, fontSize: 28, fontWeight: "900", paddingHorizontal: 16 },
  row: { flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: C.card, padding: 10, borderRadius: R.m, borderWidth: 1, borderColor: C.line },
  thumb: { width: 64, height: 92, borderRadius: R.s, overflow: "hidden", backgroundColor: C.card2 },
  playOv: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,.35)", alignItems: "center", justifyContent: "center" },
  title: { color: C.text, fontWeight: "800", fontSize: 14.5 },
  ep: { color: C.sub, fontSize: 12.5, marginTop: 1 },
  info: { color: C.sub, fontSize: 12, marginTop: 4 },
  src: { color: C.accent2, fontSize: 11, marginTop: 2 },
  bar: { height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 8, overflow: "hidden" },
  fill: { height: 4, backgroundColor: C.accent },
  autoRow: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, marginTop: 12, marginBottom: 4, padding: 12, borderRadius: R.m, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  autoTitle: { color: C.text, fontWeight: "700", fontSize: 14 },
  autoSub: { color: C.sub, fontSize: 11.5, marginTop: 2 },
  btn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card2, alignItems: "center", justifyContent: "center" },
});
