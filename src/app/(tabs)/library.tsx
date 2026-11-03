import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, R } from "../../theme";
import { getCatalog } from "../../engine/engine";
import type { Catalog } from "../../engine/types";
import { useApp } from "../../state/store";
import { useAsync } from "../../lib/useAsync";
import { ErrorBox, Loading } from "../../components/ui";

const GRADS: [string, string][] = [["#ff5a36", "#a3200a"], ["#7b5cff", "#32208f"], ["#1fb6a6", "#0b5f57"], ["#ffb020", "#a05a00"], ["#e8438c", "#8a1550"], ["#3a8bff", "#123f91"]];
type IconName = keyof typeof Ionicons.glyphMap;
const FALLBACK: IconName[] = ["film", "sparkles", "planet", "rocket", "flame", "heart"];
const iconFor = (t: string): IconName => {
  const x = t.toLowerCase();
  if (/comed/.test(x)) return "happy";
  if (/horror|thrill/.test(x)) return "skull";
  if (/romanc|love/.test(x)) return "heart";
  if (/action|war/.test(x)) return "flame";
  if (/sci|fantas/.test(x)) return "rocket";
  if (/anim|cartoon|kids/.test(x)) return "color-palette";
  if (/music/.test(x)) return "musical-notes";
  if (/crime|myster/.test(x)) return "search";
  if (/series|show|drama/.test(x)) return "tv";
  return FALLBACK[x.length % FALLBACK.length];
};

function Tile({ c, i, w, provider }: { c: Catalog; i: number; w: number; provider: string }) {
  return (
    <Pressable onPress={() => router.push({ pathname: "/category", params: { provider, filter: c.filter, title: c.title.trim() } })} style={{ width: w }}>
      <LinearGradient colors={GRADS[i % GRADS.length]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.tile}>
        <Ionicons name={iconFor(c.title)} size={30} color="rgba(255,255,255,.9)" />
        <Text style={st.tileTxt} numberOfLines={2}>{c.title.trim()}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export default function Library() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const provider = useApp((s) => s.provider);
  const { data, error, loading, reload } = useAsync(() => getCatalog(provider), [provider]);
  const cols = width > 700 ? 4 : 2, gap = 12, w = Math.floor((width - 32 - gap * (cols - 1)) / cols);
  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 40 }}>
      <Text style={st.h1}>Library</Text>
      {loading ? <Loading /> : error || !data ? <ErrorBox text={error || "Kuch nahi mila"} onRetry={reload} /> : <>
        <Text style={st.h2}>Sections</Text>
        <View style={st.grid}>{data.catalog.map((c, i) => <Tile key={"c" + i} c={c} i={i} w={w} provider={provider} />)}</View>
        {data.genres.length ? <>
          <Text style={st.h2}>Genres</Text>
          <View style={st.grid}>{data.genres.map((c, i) => <Tile key={"g" + i} c={c} i={i + 2} w={w} provider={provider} />)}</View>
        </> : null}
      </>}
    </ScrollView>
  );
}
const st = StyleSheet.create({
  h1: { color: C.text, fontSize: 28, fontWeight: "900", marginBottom: 4 },
  h2: { color: C.text, fontSize: 18, fontWeight: "800", marginTop: 20, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { height: 96, borderRadius: R.l, padding: 14, justifyContent: "space-between" },
  tileTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
