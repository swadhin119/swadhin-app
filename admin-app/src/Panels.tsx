import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { isHttps, newId, type Announcement, type Extra, type OpeningAd, type Pending, type PickItem, type SliderAd } from "./model";

const A = { bg: "#0b0b10", card: "#16161e", card2: "#1f1f2a", line: "#2a2a38", text: "#f4f4f8", sub: "#9a9ab0", accent: "#ff5a36", ok: "#35d07f", danger: "#ff4d6d" };
type Set = (fn: (e: Extra) => Extra) => void;

export async function pickImage(aspect: [number, number]): Promise<Pending | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect, quality: 0.8, base64: true });
  if (r.canceled || !r.assets?.[0]?.base64) return null;
  const a = r.assets[0]; const ext = /png/i.test(a.mimeType || "") || /\.png$/i.test(a.uri) ? "png" : "jpg";
  return { b64: a.base64!, ext, uri: a.uri };
}

function Row({ item, i, n, onMove, onDel }: { item: PickItem; i: number; n: number; onMove(d: -1 | 1): void; onDel(): void }) {
  return (
    <View style={st.row}>
      <Image source={{ uri: item.image }} style={st.thumb} />
      <View style={{ flex: 1 }}>
        <Text style={st.t} numberOfLines={2}>{item.title}</Text>
        <Text style={st.s} numberOfLines={1}>{item.provider}</Text>
      </View>
      <Pressable disabled={i === 0} onPress={() => onMove(-1)} style={[st.mini, i === 0 && { opacity: 0.3 }]}><Text style={st.mt}>▲</Text></Pressable>
      <Pressable disabled={i === n - 1} onPress={() => onMove(1)} style={[st.mini, i === n - 1 && { opacity: 0.3 }]}><Text style={st.mt}>▼</Text></Pressable>
      <Pressable onPress={onDel} style={st.mini}><Text style={[st.mt, { color: A.danger }]}>✕</Text></Pressable>
    </View>
  );
}
const move = <T,>(a: T[], i: number, d: -1 | 1) => { const b = a.slice(); const j = i + d; if (j < 0 || j >= b.length) return b; [b[i], b[j]] = [b[j], b[i]]; return b; };

/** Search a provider and add movies / series to the main slider or to the Recommended row. */
function Search({ extra, set }: { extra: Extra; set: Set }) {
  const [provs, setProvs] = useState<{ value: string; name: string }[]>([]);
  const [prov, setProv] = useState("");
  const [q, setQ] = useState("");
  const [res, setRes] = useState<PickItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const loadProvs = async () => {
    setBusy(true); setErr("");
    try { const { getProviders } = require("./engine/engine"); const l = await getProviders(); setProvs(l.map((p: any) => ({ value: p.value, name: p.name }))); if (l[0]) setProv((v) => v || l[0].value); }
    catch (e: any) { setErr("Could not load providers: " + String(e?.message || e)); } finally { setBusy(false); }
  };
  const search = async () => {
    if (!prov || !q.trim()) return;
    setBusy(true); setErr(""); setRes([]);
    try { const { searchPosts } = require("./engine/engine"); const l = await searchPosts(prov, q.trim(), 1); setRes((l as any[]).map((p) => ({ provider: prov, link: p.link, title: p.title, image: p.image || "" }))); if (!l.length) setErr("Nothing found. Try another word or provider."); }
    catch (e: any) { setErr("Search failed: " + String(e?.message || e)); } finally { setBusy(false); }
  };
  const has = (a: PickItem[], x: PickItem) => a.some((y) => y.provider === x.provider && y.link === x.link);
  const toggle = (key: "slider" | "recommended", x: PickItem) => set((e) => ({ ...e, [key]: has(e[key], x) ? e[key].filter((y) => !(y.provider === x.provider && y.link === x.link)) : [...e[key], x].slice(0, 30) }));

  return (
    <View style={st.card}>
      <Text style={st.lbl}>Find movies & series</Text>
      {!provs.length ? <Pressable style={st.btnLite} onPress={loadProvs}>{busy ? <ActivityIndicator color={A.accent} /> : <Text style={st.btnTxt}>Load providers</Text>}</Pressable> : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
            {provs.map((p) => <Pressable key={p.value} onPress={() => setProv(p.value)} style={[st.chip, prov === p.value && { backgroundColor: A.accent, borderColor: A.accent }]}><Text style={[st.chipT, prov === p.value && { color: "#fff" }]}>{p.name}</Text></Pressable>)}
          </ScrollView>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput style={[st.input, { flex: 1 }]} value={q} onChangeText={setQ} placeholder="Movie or series name" placeholderTextColor={A.sub} onSubmitEditing={search} returnKeyType="search" />
            <Pressable style={st.go} onPress={search}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>Search</Text>}</Pressable>
          </View>
        </>
      )}
      {err ? <Text style={{ color: A.danger, marginTop: 8, fontSize: 12.5 }}>{err}</Text> : null}
      {res.map((x) => (
        <View key={x.link} style={st.row}>
          <Image source={{ uri: x.image }} style={st.thumb} />
          <Text style={[st.t, { flex: 1 }]} numberOfLines={2}>{x.title}</Text>
          <Pressable onPress={() => toggle("slider", x)} style={[st.tag, has(extra.slider, x) && { backgroundColor: A.accent, borderColor: A.accent }]}><Text style={[st.tagT, has(extra.slider, x) && { color: "#fff" }]}>Slider</Text></Pressable>
          <Pressable onPress={() => toggle("recommended", x)} style={[st.tag, has(extra.recommended, x) && { backgroundColor: A.accent, borderColor: A.accent }]}><Text style={[st.tagT, has(extra.recommended, x) && { color: "#fff" }]}>Recomm.</Text></Pressable>
        </View>
      ))}
    </View>
  );
}

export function SliderPanel({ extra, set }: { extra: Extra; set: Set }) {
  return (
    <View>
      <Search extra={extra} set={set} />
      <Text style={st.sec}>Main slider ({extra.slider.length})</Text>
      <View style={st.card}>
        <Text style={st.hint}>Only these titles appear in the big slider on Home. If this list is empty, the app picks automatically.</Text>
        {extra.slider.map((x, i) => <Row key={x.provider + x.link} item={x} i={i} n={extra.slider.length} onMove={(d) => set((e) => ({ ...e, slider: move(e.slider, i, d) }))} onDel={() => set((e) => ({ ...e, slider: e.slider.filter((_, k) => k !== i) }))} />)}
      </View>
      <Text style={st.sec}>Recommended row ({extra.recommended.length})</Text>
      <View style={st.card}>
        <Text style={st.lbl}>Row title</Text>
        <TextInput style={st.input} value={extra.recommendedTitle} maxLength={40} onChangeText={(v) => set((e) => ({ ...e, recommendedTitle: v }))} />
        {extra.recommended.map((x, i) => <Row key={x.provider + x.link} item={x} i={i} n={extra.recommended.length} onMove={(d) => set((e) => ({ ...e, recommended: move(e.recommended, i, d) }))} onDel={() => set((e) => ({ ...e, recommended: e.recommended.filter((_, k) => k !== i) }))} />)}
      </View>
    </View>
  );
}

const FREQ: { v: OpeningAd["frequency"]; l: string }[] = [{ v: "always", l: "Every launch" }, { v: "daily", l: "Once a day" }, { v: "once", l: "Only once" }];

export function AdsPanel({ extra, set }: { extra: Extra; set: Set }) {
  const o = extra.openingAd; const an = extra.announcement;
  const setO = (p: Partial<OpeningAd>) => set((e) => ({ ...e, openingAd: { ...e.openingAd, ...p } }));
  const setA = (p: Partial<Announcement>) => set((e) => ({ ...e, announcement: { ...e.announcement, ...p } }));
  const pickOpen = async () => { const p = await pickImage([9, 16]); if (p) setO({ pending: p, id: newId() }); };
  const addAd = async () => { const p = await pickImage([4, 5]); if (p) set((e) => ({ ...e, sliderAds: [...e.sliderAds, { id: newId(), image: "", url: "", title: "", cta: "Learn more", pending: p }].slice(0, 10) })); };
  const upd = (i: number, p: Partial<SliderAd>) => set((e) => ({ ...e, sliderAds: e.sliderAds.map((a, k) => (k === i ? { ...a, ...p } : a)) }));
  const openImg = o.pending?.uri || o.image;
  return (
    <View>
      <Text style={st.sec}>Opening ad (full screen at app start)</Text>
      <View style={st.card}>
        <View style={st.line}><Text style={st.lbl}>Show opening ad</Text><Switch value={o.enabled} onValueChange={(v) => setO({ enabled: v })} /></View>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <View style={st.adBox}>{openImg ? <Image source={{ uri: openImg }} style={{ width: 72, height: 128 }} resizeMode="cover" /> : <Text style={st.s}>No image</Text>}</View>
          <Pressable style={st.btnLite} onPress={pickOpen}><Text style={st.btnTxt}>Choose image</Text></Pressable>
        </View>
        <Text style={st.hint}>Tall (9:16) image looks best.</Text>
        <Text style={[st.lbl, { marginTop: 10 }]}>Link when tapped (https://…)</Text>
        <TextInput style={[st.input, o.url && !isHttps(o.url) && { borderColor: A.danger }]} value={o.url} autoCapitalize="none" onChangeText={(v) => setO({ url: v })} placeholder="https://" placeholderTextColor={A.sub} />
        <Text style={[st.lbl, { marginTop: 10 }]}>Skip button appears after (seconds, 0-15)</Text>
        <TextInput style={st.input} keyboardType="number-pad" value={String(o.skipAfter)} maxLength={2} onChangeText={(v) => setO({ skipAfter: Math.min(15, Number(v.replace(/\D/g, "")) || 0) })} />
        <Text style={[st.lbl, { marginTop: 10 }]}>How often</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {FREQ.map((f) => <Pressable key={f.v} onPress={() => setO({ frequency: f.v })} style={[st.chip, o.frequency === f.v && { backgroundColor: A.accent, borderColor: A.accent }]}><Text style={[st.chipT, o.frequency === f.v && { color: "#fff" }]}>{f.l}</Text></Pressable>)}
        </View>
      </View>

      <Text style={st.sec}>Slider ads ({extra.sliderAds.length})</Text>
      <View style={st.card}>
        <Text style={st.hint}>These cards are mixed into the main slider with a “Sponsored” label.</Text>
        <Text style={[st.lbl, { marginTop: 10 }]}>Show one ad after every N slides</Text>
        <TextInput style={st.input} keyboardType="number-pad" value={String(extra.sliderAdEvery)} maxLength={2} onChangeText={(v) => set((e) => ({ ...e, sliderAdEvery: Math.min(10, Math.max(1, Number(v.replace(/\D/g, "")) || 1)) }))} />
        {extra.sliderAds.map((a, i) => (
          <View key={a.id} style={[st.row, { alignItems: "flex-start", flexDirection: "column", gap: 8 }]}>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center", width: "100%" }}>
              <Image source={{ uri: a.pending?.uri || a.image }} style={{ width: 64, height: 80, borderRadius: 8, backgroundColor: A.card2 }} />
              <View style={{ flex: 1, gap: 6 }}>
                <TextInput style={st.input} value={a.title} placeholder="Headline" placeholderTextColor={A.sub} maxLength={80} onChangeText={(v) => upd(i, { title: v })} />
                <TextInput style={[st.input, a.url && !isHttps(a.url) && { borderColor: A.danger }]} value={a.url} placeholder="https://link" placeholderTextColor={A.sub} autoCapitalize="none" onChangeText={(v) => upd(i, { url: v })} />
                <TextInput style={st.input} value={a.cta} placeholder="Button text" placeholderTextColor={A.sub} maxLength={24} onChangeText={(v) => upd(i, { cta: v })} />
              </View>
            </View>
            <Pressable onPress={() => set((e) => ({ ...e, sliderAds: e.sliderAds.filter((_, k) => k !== i) }))}><Text style={{ color: A.danger, fontWeight: "700" }}>Remove this ad</Text></Pressable>
          </View>
        ))}
        <Pressable style={[st.btnLite, { marginTop: 12 }]} onPress={addAd}><Text style={st.btnTxt}>+ Add slider ad</Text></Pressable>
      </View>

      <Text style={st.sec}>Announcement bar</Text>
      <View style={st.card}>
        <View style={st.line}><Text style={st.lbl}>Show announcement</Text><Switch value={an.enabled} onValueChange={(v) => setA({ enabled: v })} /></View>
        <TextInput style={st.input} value={an.text} maxLength={160} placeholder="New movies added every Friday!" placeholderTextColor={A.sub} onChangeText={(v) => setA({ text: v })} />
        <Text style={[st.lbl, { marginTop: 10 }]}>Link (optional)</Text>
        <TextInput style={[st.input, an.url && !isHttps(an.url) && { borderColor: A.danger }]} value={an.url} autoCapitalize="none" placeholder="https://" placeholderTextColor={A.sub} onChangeText={(v) => setA({ url: v })} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  sec: { color: A.sub, fontSize: 12, fontWeight: "800", marginTop: 20, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.7 },
  card: { backgroundColor: A.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: A.line },
  lbl: { color: A.text, fontSize: 13, fontWeight: "700", marginBottom: 6 },
  hint: { color: A.sub, fontSize: 12, lineHeight: 17, marginTop: 4 },
  input: { backgroundColor: A.card2, color: A.text, borderRadius: 10, borderWidth: 1, borderColor: A.line, paddingHorizontal: 12, height: 44, fontSize: 15 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: A.line },
  thumb: { width: 44, height: 62, borderRadius: 6, backgroundColor: A.card2 },
  t: { color: A.text, fontSize: 13, fontWeight: "700" }, s: { color: A.sub, fontSize: 11.5 },
  mini: { width: 32, height: 32, borderRadius: 16, backgroundColor: A.card2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: A.line }, mt: { color: A.text, fontWeight: "800" },
  tag: { paddingHorizontal: 10, height: 30, borderRadius: 15, borderWidth: 1, borderColor: A.line, backgroundColor: A.card2, alignItems: "center", justifyContent: "center" }, tagT: { color: A.text, fontSize: 11.5, fontWeight: "800" },
  chip: { paddingHorizontal: 14, height: 34, borderRadius: 17, borderWidth: 1, borderColor: A.line, backgroundColor: A.card2, alignItems: "center", justifyContent: "center" }, chipT: { color: A.text, fontWeight: "700", fontSize: 12.5 },
  btnLite: { paddingHorizontal: 14, height: 40, borderRadius: 20, backgroundColor: A.card2, borderWidth: 1, borderColor: A.line, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" }, btnTxt: { color: A.text, fontWeight: "700", fontSize: 13 },
  go: { paddingHorizontal: 16, height: 44, borderRadius: 10, backgroundColor: A.accent, alignItems: "center", justifyContent: "center" },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  adBox: { width: 72, height: 128, borderRadius: 10, backgroundColor: A.card2, borderWidth: 1, borderColor: A.line, alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
