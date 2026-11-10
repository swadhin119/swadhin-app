import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "../../theme";
import { getCatalog, getLatest2026, getPosts, getProviders, type Latest } from "../../engine/engine";
import type { Catalog, Post } from "../../engine/types";
import { historyList, inWatchlist, toggleWatchlist, useApp } from "../../state/store";
import { useAsync } from "../../lib/useAsync";
import { Btn, ErrorBox, Loading, PosterCard, SectionHeader, Skeleton, POSTER_W } from "../../components/ui";
import { ProviderSheet } from "../../components/ProviderSheet";
import { openDetail } from "../../lib/nav";
import { brand, remote } from "../../config/remote";

type Slide = Post & { ad?: { url: string; cta: string } };
/** Puts admin-made ads between the movie slides (one ad after every N slides). */
function withAds(posts: Post[]): Slide[] {
  const ads = remote.sliderAds; if (!ads.length || !posts.length) return posts;
  const out: Slide[] = []; let a = 0;
  posts.forEach((p, i) => { out.push(p); if ((i + 1) % remote.sliderAdEvery === 0 || (posts.length < remote.sliderAdEvery && i === posts.length - 1)) { const ad = ads[a++ % ads.length]; out.push({ title: ad.title, link: "ad:" + ad.id + ":" + i, image: ad.image, ad: { url: ad.url, cta: ad.cta } }); } });
  return out;
}

function Hero({ posts, provider }: { posts: Slide[]; provider: string }) {
  const { width } = useWindowDimensions();
  const h = Math.round(width * 1.15);
  const ref = useRef<FlatList<Slide>>(null);
  const [i, setI] = useState(0);
  const wl = useApp((s) => s.watchlist);
  useEffect(() => {
    if (posts.length < 2) return;
    const id = setInterval(() => setI((x) => { const n = (x + 1) % posts.length; ref.current?.scrollToIndex({ index: n, animated: true }); return n; }), 5000);
    return () => clearInterval(id);
  }, [posts.length]);
  return (
    <View style={{ height: h }}>
      <FlatList ref={ref} data={posts} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(p) => p.link}
        onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / width))}
        getItemLayout={(_, k) => ({ length: width, offset: width * k, index: k })}
        renderItem={({ item }) => {
          if (item.ad) {
            const url = item.ad.url;
            return (
              <Pressable onPress={() => { Linking.openURL(url).catch(() => {}); }} style={{ width, height: h }}>
                <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
                <LinearGradient colors={["transparent", "rgba(11,11,16,.7)", C.bg]} style={StyleSheet.absoluteFill} locations={[0.35, 0.75, 1]} />
                <View style={st.heroBody}>
                  <Text style={st.badge}>SPONSORED</Text>
                  {item.title ? <Text style={st.heroTitle} numberOfLines={2}>{item.title}</Text> : null}
                  <View style={{ flexDirection: "row", marginTop: 14 }}><Btn label={item.ad.cta} icon="open-outline" onPress={() => { Linking.openURL(url).catch(() => {}); }} style={{ flex: 1 }} /></View>
                </View>
              </Pressable>
            );
          }
          const pv = item.provider || provider;
          const saved = wl.some((x) => x.provider === pv && x.link === item.link);
          return (
            <Pressable onPress={() => openDetail(pv, item)} style={{ width, height: h }}>
              <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient colors={["transparent", "rgba(11,11,16,.7)", C.bg]} style={StyleSheet.absoluteFill} locations={[0.35, 0.75, 1]} />
              <View style={st.heroBody}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={st.badge}>{remote.slider.length ? "FEATURED" : item.rating ? "TOP RATED • 2026" : "TRENDING NOW"}</Text>
                  {item.rating ? <View style={st.rate}><Ionicons name="star" size={12} color={C.accent2} /><Text style={st.rateTxt}>{item.rating.toFixed(1)}</Text></View> : null}
                </View>
                <Text style={st.heroTitle} numberOfLines={2}>{item.title}</Text>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                  <Btn label="Watch" icon="play" onPress={() => openDetail(pv, item)} style={{ flex: 1 }} />
                  <Btn label={saved ? "My List ✓" : "My List"} icon={saved ? "checkmark" : "add"} kind="ghost" style={{ flex: 1 }}
                    onPress={() => toggleWatchlist({ provider: pv, link: item.link, title: item.title, image: item.image })} />
                </View>
              </View>
            </Pressable>
          );
        }} />
      <View style={st.dots}>{posts.map((p, k) => <View key={p.link} style={[st.dot, k === i && { backgroundColor: C.accent, width: 18 }]} />)}</View>
    </View>
  );
}

function CatalogRow({ provider, cat, ranked }: { provider: string; cat: Catalog; ranked?: boolean }) {
  const { data, loading, error } = useAsync(() => getPosts(provider, cat.filter, 1), [provider, cat.filter]);
  if (!loading && (error || !data?.length)) return null;
  return (
    <View>
      <SectionHeader title={(ranked ? "Top 10 • " : "") + cat.title.trim()} onMore={() => router.push({ pathname: "/category", params: { provider, filter: cat.filter, title: cat.title.trim() } })} />
      <FlatList horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        data={loading ? [] : data!.slice(0, ranked ? 10 : 18)} keyExtractor={(p) => p.link}
        ListEmptyComponent={loading ? <View style={{ flexDirection: "row", gap: 12 }}>{[0, 1, 2, 3].map((k) => <Skeleton key={k} />)}</View> : undefined}
        renderItem={({ item, index }) => <PosterCard post={item} rank={ranked ? index + 1 : undefined} onPress={() => openDetail(provider, item)} />} />
    </View>
  );
}

function PostRow({ title, provider, posts }: { title: string; provider: string; posts: Post[] }) {
  if (!posts.length) return null;
  return (
    <View>
      <SectionHeader title={title} />
      <FlatList horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }} data={posts} keyExtractor={(p) => p.link}
        renderItem={({ item }) => <PosterCard post={item} onPress={() => openDetail(item.provider || provider, item)} />} />
    </View>
  );
}

const NO_LATEST: Latest = { movies: [], series: [], hero: [] };

export default function Home() {
  const insets = useSafeAreaInsets();
  const provider = useApp((s) => s.provider);
  const history = useApp((s) => s.history);
  const hist = useMemo(() => historyList({ history } as any).filter((h) => h.pos > 5 && (h.dur === 0 || h.pos < h.dur - 30)).slice(0, 12), [history]);
  const watch = useApp((s) => s.watchlist);
  const [sheet, setSheet] = useState(false);
  const cat = useAsync(() => getCatalog(provider), [provider]);
  const first = cat.data?.catalog[0];
  const posts = useAsync(() => getPosts(provider, first!.filter, 1), [provider, first?.filter], !!first);
  const latest = useAsync(() => getLatest2026(provider).catch(() => NO_LATEST), [provider]);
  const manual: Post[] = remote.slider;
  const auto = latest.data?.hero.length ? latest.data.hero : latest.loading ? [] : posts.data?.slice(0, 6) ?? [];
  const heroPosts: Slide[] = useMemo(() => withAds(manual.length ? manual : auto), [manual, auto]);
  const names = useAsync(getProviders, []);
  const pname = names.data?.find((p) => p.value === provider)?.name || provider;
  const failed = cat.error || posts.error;
  const { width: winW } = useWindowDimensions();

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        {cat.loading && !cat.data ? <View style={{ height: 420 }}><Loading label="Loading…" /></View>
          : failed ? <View style={{ paddingTop: insets.top + 60 }}><ErrorBox text={failed} onRetry={() => { cat.reload(); posts.reload(); }} /><Btn label="Change provider" icon="swap-horizontal" kind="ghost" onPress={() => setSheet(true)} style={{ alignSelf: "center" }} /></View>
          : <>
            {heroPosts.length ? <Hero key={heroPosts[0].link} posts={heroPosts} provider={provider} /> : (posts.loading || latest.loading) ? <View style={{ height: Math.round(winW * 1.15), backgroundColor: C.card, justifyContent: "center" }}><Loading label="Loading…" /></View> : <View style={{ height: insets.top + 70 }} />}
            {hist.length ? <View>
              <SectionHeader title="Continue Watching" />
              <FlatList horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }} data={hist} keyExtractor={(h) => h.key}
                renderItem={({ item }) => <View><PosterCard post={item} w={POSTER_W + 30} h={110} onPress={() => openDetail(item.provider, item, true)} />
                  <View style={st.prog}><View style={{ width: `${Math.min(100, item.dur ? (item.pos / item.dur) * 100 : 10)}%`, height: 3, backgroundColor: C.accent }} /></View></View>} />
            </View> : null}
            {watch.length ? <View>
              <SectionHeader title="My List" />
              <FlatList horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }} data={watch} keyExtractor={(w) => w.provider + w.link}
                renderItem={({ item }) => <PosterCard post={item} onPress={() => openDetail(item.provider, item)} />} />
            </View> : null}
            {remote.recommended.length ? <PostRow title={remote.recommendedTitle} provider={provider} posts={remote.recommended} /> : null}
            <PostRow title="2026 • Latest Hindi Movies" provider={provider} posts={latest.data?.movies ?? []} />
            <PostRow title="2026 • Latest Hindi Web Series" provider={provider} posts={latest.data?.series ?? []} />
            {(cat.data?.catalog || []).slice(0, 6).map((c, k) => <CatalogRow key={provider + c.filter + k} provider={provider} cat={c} ranked={k === 0} />)}
          </>}
      </ScrollView>
      <View style={[st.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{brand.logoUrl ? <Image source={{ uri: brand.logoUrl }} style={{ width: 28, height: 28, borderRadius: 7 }} contentFit="contain" /> : null}<Text style={st.logo}>{brand.name}</Text></View>
        <Pressable style={st.provBtn} onPress={() => setSheet(true)}>
          <Text style={st.provTxt} numberOfLines={1}>{pname}</Text><Ionicons name="chevron-down" size={14} color={C.text} />
        </Pressable>
      </View>
      <ProviderSheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}
const st = StyleSheet.create({
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { color: C.accent, fontWeight: "900", fontSize: 22, letterSpacing: 2, textShadowColor: "#000", textShadowRadius: 8 },
  provBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,.55)", paddingHorizontal: 12, height: 34, borderRadius: 17, maxWidth: 160, borderWidth: 1, borderColor: C.line },
  provTxt: { color: C.text, fontWeight: "600", fontSize: 13, flexShrink: 1 },
  heroBody: { position: "absolute", left: 16, right: 16, bottom: 34 },
  rate: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,.6)", paddingHorizontal: 8, height: 22, borderRadius: 11 },
  rateTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
  badge: { color: C.accent2, fontWeight: "800", fontSize: 12, letterSpacing: 1.5 },
  heroTitle: { color: C.text, fontSize: 28, fontWeight: "900", marginTop: 4 },
  dots: { position: "absolute", bottom: 12, alignSelf: "center", flexDirection: "row", gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.line },
  prog: { height: 3, backgroundColor: C.line, marginTop: -3, borderRadius: 2, overflow: "hidden" },
});
