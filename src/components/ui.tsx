import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { C, R } from "../theme";
import type { Post } from "../engine/types";

export const Loading = ({ label }: { label?: string }) => (
  <View style={s.center}><ActivityIndicator color={C.accent} size="large" />{label ? <Text style={[s.sub, { marginTop: 10 }]}>{label}</Text> : null}</View>
);
export const ErrorBox = ({ text, onRetry }: { text: string; onRetry?: () => void }) => (
  <View style={s.center}>
    <Ionicons name="cloud-offline-outline" size={40} color={C.sub} />
    <Text style={[s.sub, { marginTop: 10, textAlign: "center", paddingHorizontal: 24 }]} numberOfLines={6}>{text}</Text>
    {onRetry ? <Btn label="Dobara try karo" icon="refresh" onPress={onRetry} style={{ marginTop: 16 }} /> : null}
  </View>
);
export const Empty = ({ text, icon = "film-outline" }: { text: string; icon?: keyof typeof Ionicons.glyphMap }) => (
  <View style={s.center}><Ionicons name={icon} size={40} color={C.sub} /><Text style={[s.sub, { marginTop: 10, textAlign: "center" }]}>{text}</Text></View>
);

export function Btn({ label, icon, onPress, kind = "primary", style, disabled }: { label: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; kind?: "primary" | "ghost"; style?: ViewStyle; disabled?: boolean }) {
  const primary = kind === "primary";
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.btn, primary ? { backgroundColor: C.accent } : { backgroundColor: C.card2, borderWidth: 1, borderColor: C.line }, pressed && { opacity: 0.75 }, disabled && { opacity: 0.4 }, style]}>
      {icon ? <Ionicons name={icon} size={18} color="#fff" /> : null}
      <Text style={s.btnTxt}>{label}</Text>
    </Pressable>
  );
}
export const Chip = ({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) => (
  <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: C.accent, borderColor: C.accent }]}>
    <Text style={[s.chipTxt, active && { color: "#fff", fontWeight: "700" }]} numberOfLines={1}>{label}</Text>
  </Pressable>
);

export const POSTER_W = 118, POSTER_H = 172;
export function PosterCard({ post, onPress, w = POSTER_W, h = POSTER_H, rank }: { post: Pick<Post, "title" | "image" | "rating">; onPress: () => void; w?: number; h?: number; rank?: number }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width: w }, pressed && { opacity: 0.8 }]}>
      <View style={{ width: w, height: h, borderRadius: R.m, overflow: "hidden", backgroundColor: C.card }}>
        {post.image ? <Image source={{ uri: post.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} recyclingKey={post.image} /> : <View style={[StyleSheet.absoluteFill, s.center]}><Ionicons name="film-outline" size={28} color={C.sub} /></View>}
        {rank ? <View style={s.rank}><Text style={s.rankTxt}>{rank}</Text></View> : null}
        {post.rating ? <View style={s.rate}><Ionicons name="star" size={10} color={C.accent2} /><Text style={s.rateTxt}>{post.rating.toFixed(1)}</Text></View> : null}
      </View>
      <Text numberOfLines={2} style={s.cardTitle}>{post.title}</Text>
    </Pressable>
  );
}
export const SectionHeader = ({ title, onMore }: { title: string; onMore?: () => void }) => (
  <View style={s.secHead}>
    <Text style={s.secTitle} numberOfLines={1}>{title}</Text>
    {onMore ? <Pressable onPress={onMore} hitSlop={10}><Text style={{ color: C.accent, fontWeight: "600" }}>Sab dekho</Text></Pressable> : null}
  </View>
);
export const Skeleton = ({ w = POSTER_W, h = POSTER_H }: { w?: number; h?: number }) => <View style={{ width: w, height: h, borderRadius: R.m, backgroundColor: C.card }} />;

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, minHeight: 200 },
  sub: { color: C.sub, fontSize: 14 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18, height: 46, borderRadius: R.m },
  btnTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: "center", justifyContent: "center" },
  chipTxt: { color: C.sub, fontSize: 13 },
  cardTitle: { color: C.text, fontSize: 12.5, marginTop: 6, lineHeight: 16 },
  rank: { position: "absolute", left: 0, bottom: 0, backgroundColor: "rgba(0,0,0,.72)", paddingHorizontal: 9, paddingVertical: 2, borderTopRightRadius: R.m },
  rate: { position: "absolute", right: 5, top: 5, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,.7)", paddingHorizontal: 6, height: 20, borderRadius: 10 },
  rateTxt: { color: "#fff", fontWeight: "800", fontSize: 11 },
  rankTxt: { color: C.accent2, fontWeight: "900", fontSize: 20 },
  secHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, marginTop: 22, marginBottom: 10 },
  secTitle: { color: C.text, fontSize: 18, fontWeight: "800", flex: 1, marginRight: 10 },
});
