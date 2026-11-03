import React, { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, R } from "../theme";
import { getEpisodes, getMeta } from "../engine/engine";
import type { LinkItem } from "../engine/types";
import { getState, inWatchlist, itemKey, setSession, toggleWatchlist, useApp, type PlayItem } from "../state/store";
import { useAsync } from "../lib/useAsync";
import { Btn, Chip, ErrorBox, Loading } from "../components/ui";

export default function Detail() {
  const { provider, link, title: pTitle, image: pImage, resume } = useLocalSearchParams<{ provider: string; link: string; title: string; image: string; resume?: string }>();
  const insets = useSafeAreaInsets();
  const meta = useAsync(() => getMeta(provider, link), [provider, link]);
  const saved = useApp((s) => inWatchlist(s, provider, link));
  const hist = useApp((s) => s.history[itemKey(provider, link)]);
  const [sel, setSel] = useState(0);
  const [more, setMore] = useState(false);

  const info = meta.data;
  const groups: LinkItem[] = useMemo(() => (info?.linkList || []).filter((g) => g && (g.episodesLink || g.directLinks?.length)), [info]);
  const g = groups[Math.min(sel, Math.max(0, groups.length - 1))];
  const eps = useAsync(() => getEpisodes(provider, g!.episodesLink!), [provider, g?.episodesLink], !!g?.episodesLink);

  const title = info?.title || pTitle || "";
  const image = info?.image || pImage || "";
  const backdrop = info?.poster || image;
  const type = info?.type === "series" ? "series" : "movie";

  const items: PlayItem[] = useMemo(() => {
    if (!g) return [];
    if (g.episodesLink) return (eps.data || []).map((e) => ({ title: e.title, link: e.link, type: "series" as const }));
    return (g.directLinks || []).map((d) => ({ title: d.title, link: d.link, type: (d.type || type) as "movie" | "series" }));
  }, [g, eps.data, type]);

  const play = (index: number) => {
    if (!items.length) return;
    setSession({ provider, detailLink: link, title, image, items, index });
    router.push("/player");
  };
  const resumeIndex = hist?.epLink ? items.findIndex((x) => x.link === hist.epLink) : -1;
  const playNow = () => play(resumeIndex >= 0 ? resumeIndex : 0);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: 330 }}>
          {backdrop ? <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={info?.poster ? 0 : 18} /> : null}
          <LinearGradient colors={["rgba(11,11,16,.35)", "transparent", C.bg]} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
        </View>
        <View style={{ marginTop: -150, paddingHorizontal: 16, flexDirection: "row", gap: 14, alignItems: "flex-end" }}>
          <View style={st.poster}>{image ? <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
          <View style={{ flex: 1, paddingBottom: 4 }}>
            <Text style={st.title} numberOfLines={4}>{title}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, alignItems: "center" }}>
              {info?.rating ? <View style={st.rate}><Ionicons name="star" size={12} color={C.accent2} /><Text style={st.rateTxt}>{info.rating}</Text></View> : null}
              {info?.type ? <Text style={st.tag}>{info.type.toUpperCase()}</Text> : null}
              {(info?.tags || []).slice(0, 3).map((t) => <Text key={t} style={st.tag}>{t}</Text>)}
            </View>
          </View>
        </View>

        {meta.loading ? <Loading label="Details load ho rahe hain…" /> : meta.error ? <ErrorBox text={meta.error} onRetry={meta.reload} /> : <View style={{ paddingHorizontal: 16 }}>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
            <Btn label={hist ? "Resume" : "Play Now"} icon="play" onPress={playNow} disabled={!items.length} style={{ flex: 1.4 }} />
            <Btn label={saved ? "Saved" : "My List"} icon={saved ? "checkmark" : "add"} kind="ghost" style={{ flex: 1 }}
              onPress={() => toggleWatchlist({ provider, link, title, image })} />
          </View>

          {info?.synopsis ? <Pressable onPress={() => setMore(!more)}>
            <Text style={st.syn} numberOfLines={more ? undefined : 4}>{info.synopsis}</Text>
            <Text style={{ color: C.accent, marginTop: 4, fontWeight: "600" }}>{more ? "Kam dikhao" : "Aur padho"}</Text>
          </Pressable> : null}
          {info?.cast?.length ? <Text style={st.cast} numberOfLines={2}>Cast: {info.cast.slice(0, 8).join(", ")}</Text> : null}

          {groups.length ? <>
            <Text style={st.h2}>{groups.some((x) => x.episodesLink) ? "Seasons / Quality" : "Quality / Links"}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {groups.map((x, i) => <Chip key={i} label={(x.title || "Link " + (i + 1)).slice(0, 38) + (x.quality && !x.title?.includes(x.quality) ? " • " + x.quality : "")} active={i === sel} onPress={() => setSel(i)} />)}
            </ScrollView>

            {g?.episodesLink && eps.loading ? <Loading label="Episodes aa rahe hain…" /> : null}
            {g?.episodesLink && eps.error ? <ErrorBox text={eps.error} onRetry={eps.reload} /> : null}
            <View style={{ marginTop: 14, gap: 8 }}>
              {items.map((it, i) => {
                const cur = hist?.epLink === it.link;
                return (
                  <Pressable key={it.link + i} onPress={() => play(i)} style={[st.ep, cur && { borderColor: C.accent }]}>
                    <View style={st.epNum}>{cur ? <Ionicons name="play" size={16} color="#fff" /> : <Text style={st.epNumTxt}>{i + 1}</Text>}</View>
                    <Text style={st.epTitle} numberOfLines={2}>{it.title}</Text>
                    <Ionicons name="chevron-forward" size={18} color={C.sub} />
                  </Pressable>
                );
              })}
              {!items.length && !eps.loading && !eps.error ? <Text style={{ color: C.sub, marginTop: 8 }}>Is option me koi link nahi mila.</Text> : null}
            </View>
          </> : <Text style={{ color: C.sub, marginTop: 24 }}>Is title ke liye koi stream link nahi mila. Doosra provider try karo.</Text>}
          {info?.webUrl ? <Pressable onPress={() => Linking.openURL(info.webUrl!)} style={{ marginTop: 22 }}><Text style={{ color: C.sub, textDecorationLine: "underline" }}>Original page kholo</Text></Pressable> : null}
        </View>}
      </ScrollView>
      <Pressable onPress={() => router.back()} style={[st.back, { top: insets.top + 8 }]} hitSlop={8}><Ionicons name="chevron-back" size={24} color="#fff" /></Pressable>
    </View>
  );
}
const st = StyleSheet.create({
  back: { position: "absolute", left: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,.55)", alignItems: "center", justifyContent: "center" },
  poster: { width: 116, height: 170, borderRadius: R.m, overflow: "hidden", backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  title: { color: C.text, fontSize: 22, fontWeight: "900" },
  rate: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.card2, paddingHorizontal: 8, height: 24, borderRadius: 12 },
  rateTxt: { color: C.text, fontSize: 12, fontWeight: "700" },
  tag: { color: C.sub, fontSize: 11, borderWidth: 1, borderColor: C.line, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: "hidden" },
  syn: { color: "#cfcfe0", lineHeight: 21, marginTop: 18, fontSize: 14 },
  cast: { color: C.sub, marginTop: 10, fontSize: 13 },
  h2: { color: C.text, fontSize: 18, fontWeight: "800", marginTop: 24, marginBottom: 12 },
  ep: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.card, padding: 12, borderRadius: R.m, borderWidth: 1, borderColor: C.line },
  epNum: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.card2, alignItems: "center", justifyContent: "center" },
  epNumTxt: { color: C.sub, fontWeight: "700", fontSize: 13 },
  epTitle: { color: C.text, flex: 1, fontSize: 14 },
});
