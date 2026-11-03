import React, { useMemo, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, R } from "../../theme";
import { clearCaches, DEFAULT_SOURCE, getProviders } from "../../engine/engine";
import { changeSource, clearHistory, historyList, removeHistory, useApp } from "../../state/store";
import { useAsync } from "../../lib/useAsync";
import { Btn, Empty, PosterCard, SectionHeader } from "../../components/ui";
import { ProviderSheet } from "../../components/ProviderSheet";
import { openDetail } from "../../lib/nav";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const provider = useApp((s) => s.provider);
  const source = useApp((s) => s.source);
  const watch = useApp((s) => s.watchlist);
  const history = useApp((s) => s.history);
  const hist = useMemo(() => historyList({ history } as any), [history]);
  const [sheet, setSheet] = useState(false);
  const [src, setSrc] = useState(source);
  const names = useAsync(getProviders, [source]);
  const cur = names.data?.find((p) => p.value === provider);

  const saveSource = () => {
    const v = src.trim();
    if (v && !/^https?:\/\//i.test(v)) { Alert.alert("Galat URL", "URL http:// ya https:// se shuru hona chahiye."); return; }
    changeSource(v || DEFAULT_SOURCE); Alert.alert("Ho gaya", "Source badal gaya. Home par wapas jao.");
  };

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 50 }}>
      <Text style={st.h1}>Profile</Text>

      <Pressable style={st.card} onPress={() => setSheet(true)}>
        {cur?.icon ? <Image source={{ uri: cur.icon }} style={st.icon} /> : <View style={st.icon} />}
        <View style={{ flex: 1 }}>
          <Text style={st.sub}>Active provider</Text>
          <Text style={st.name}>{cur?.name || provider}</Text>
        </View>
        <Text style={{ color: C.accent, fontWeight: "700" }}>Badlo</Text>
      </Pressable>

      <SectionHeader title={`My List (${watch.length})`} />
      {watch.length ? <FlatList horizontal data={watch} keyExtractor={(w) => w.provider + w.link} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        renderItem={({ item }) => <PosterCard post={item} onPress={() => openDetail(item.provider, item)} />} /> : <Empty icon="bookmark-outline" text="Koi title save nahi kiya" />}

      <SectionHeader title="History" />
      {hist.length ? <View style={{ paddingHorizontal: 16, gap: 8 }}>
        {hist.slice(0, 15).map((h) => (
          <Pressable key={h.key} style={st.hrow} onPress={() => openDetail(h.provider, h, true)}>
            <Image source={{ uri: h.image }} style={st.thumb} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <Text style={st.name} numberOfLines={1}>{h.title}</Text>
              {h.epTitle ? <Text style={st.sub} numberOfLines={1}>{h.epTitle}</Text> : null}
              <View style={st.bar}><View style={{ height: 3, backgroundColor: C.accent, width: `${Math.min(100, h.dur ? (h.pos / h.dur) * 100 : 8)}%` }} /></View>
            </View>
            <Pressable hitSlop={10} onPress={() => removeHistory(h.key)}><Ionicons name="close" size={20} color={C.sub} /></Pressable>
          </Pressable>
        ))}
        <Btn label="History saaf karo" icon="trash-outline" kind="ghost" onPress={() => clearHistory()} style={{ marginTop: 6 }} />
      </View> : <Empty icon="time-outline" text="Abhi kuch nahi dekha" />}

      <SectionHeader title="Advanced" />
      <View style={{ paddingHorizontal: 16 }}>
        <Text style={st.sub}>Provider source (manifest.json wali folder ka URL)</Text>
        <TextInput value={src} onChangeText={setSrc} autoCapitalize="none" autoCorrect={false} style={st.input} placeholder={DEFAULT_SOURCE} placeholderTextColor={C.sub} />
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <Btn label="Save" onPress={saveSource} style={{ flex: 1 }} />
          <Btn label="Default" kind="ghost" onPress={() => { setSrc(DEFAULT_SOURCE); changeSource(DEFAULT_SOURCE); }} style={{ flex: 1 }} />
        </View>
        <Btn label="Cache saaf karo (providers dobara download)" icon="refresh" kind="ghost" style={{ marginTop: 10 }}
          onPress={async () => { await clearCaches(); Alert.alert("Ho gaya", "Cache saaf. Home dobara kholo."); }} />
        <Text style={[st.sub, { marginTop: 18, lineHeight: 18 }]}>
          Ye app sirf ek player/browser hai. Content third-party providers se aata hai. Jo kuch dekho, wo apni zimmedari par aur apne desh ke kanoon ke hisaab se dekho.
        </Text>
      </View>
      <ProviderSheet visible={sheet} onClose={() => setSheet(false)} />
    </ScrollView>
  );
}
const st = StyleSheet.create({
  h1: { color: C.text, fontSize: 28, fontWeight: "900", paddingHorizontal: 16, marginBottom: 14 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, padding: 14, borderRadius: R.l, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  icon: { width: 44, height: 44, borderRadius: R.m, backgroundColor: C.card2 },
  name: { color: C.text, fontSize: 15, fontWeight: "700" },
  sub: { color: C.sub, fontSize: 12.5 },
  hrow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.card, padding: 10, borderRadius: R.m },
  thumb: { width: 54, height: 76, borderRadius: R.s, backgroundColor: C.card2 },
  bar: { height: 3, backgroundColor: C.line, marginTop: 8, borderRadius: 2, overflow: "hidden" },
  input: { color: C.text, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: R.m, paddingHorizontal: 12, height: 46, marginTop: 8 },
});
