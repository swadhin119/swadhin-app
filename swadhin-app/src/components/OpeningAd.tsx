import React, { useEffect, useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { remote } from "../config/remote";
import { getJSON, setJSON } from "../engine/storage";

const KEY = "openAd.state";
interface St { id: string; day: string; seen: number }
const today = () => new Date().toISOString().slice(0, 10);

/** Full-screen ad shown once when the app opens. Controlled by the admin app (image, link, skip time, how often). */
export function OpeningAd() {
  const ad = remote.openingAd;
  const insets = useSafeAreaInsets();
  const [show, setShow] = useState(false);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!ad) return;
    let dead = false;
    (async () => {
      const s = await getJSON<St>(KEY, { id: "", day: "", seen: 0 });
      const same = s.id === ad.id;
      const ok = ad.frequency === "always" || (ad.frequency === "once" ? !(same && s.seen > 0) : !(same && s.day === today()));
      if (!ok || dead) return;
      await setJSON(KEY, { id: ad.id, day: today(), seen: (same ? s.seen : 0) + 1 });
      setLeft(ad.skipAfter); setShow(true);
    })();
    return () => { dead = true; };
  }, [ad?.id]);

  useEffect(() => {
    if (!show || left <= 0) return;
    const t = setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [show, left]);

  if (!ad || !show) return null;
  const open = () => { if (ad.url) Linking.openURL(ad.url).catch(() => {}); };
  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={() => { if (left <= 0) setShow(false); }} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={open}>
          <Image source={{ uri: ad.image }} style={StyleSheet.absoluteFill} contentFit="contain" />
        </Pressable>
        <View style={[st.tag, { top: insets.top + 12 }]}><Text style={st.tagTxt}>AD</Text></View>
        <Pressable disabled={left > 0} onPress={() => setShow(false)} style={[st.skip, { top: insets.top + 10 }]}>
          <Text style={st.skipTxt}>{left > 0 ? `Skip in ${left}` : "Skip ✕"}</Text>
        </Pressable>
        {ad.url ? <Pressable onPress={open} style={[st.cta, { bottom: insets.bottom + 24 }]}><Text style={st.skipTxt}>Learn more</Text></Pressable> : null}
      </View>
    </Modal>
  );
}
const st = StyleSheet.create({
  tag: { position: "absolute", left: 14, backgroundColor: "rgba(0,0,0,.6)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tagTxt: { color: "#fff", fontSize: 11, fontWeight: "800" },
  skip: { position: "absolute", right: 14, backgroundColor: "rgba(0,0,0,.65)", borderRadius: 18, paddingHorizontal: 14, height: 36, alignItems: "center", justifyContent: "center" },
  skipTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  cta: { position: "absolute", alignSelf: "center", backgroundColor: "rgba(0,0,0,.65)", borderRadius: 22, paddingHorizontal: 24, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#fff5" },
});
