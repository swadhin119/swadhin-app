import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "../theme";
import { getPosts } from "../engine/engine";
import type { Post } from "../engine/types";
import { Empty, ErrorBox, Loading } from "../components/ui";
import { PostGrid } from "../components/PostGrid";
import { openDetail } from "../lib/nav";

export default function Category() {
  const { provider, filter, title } = useLocalSearchParams<{ provider: string; filter: string; title: string }>();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true); setError(null);
    try {
      const r = await getPosts(provider, filter ?? "", p);
      setItems((prev) => { if (p === 1) return r; const seen = new Set(prev.map((x) => x.link)); return [...prev, ...r.filter((x) => !seen.has(x.link))]; });
      setMore(r.length > 0 && p < 30); setPage(p);
    } catch (e: any) { setError(String(e?.message || e)); setMore(false); } finally { setLoading(false); }
  }, [provider, filter]);
  useEffect(() => { void load(1); }, [load]);

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, height: 52 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: 8 }}><Ionicons name="chevron-back" size={26} color={C.text} /></Pressable>
        <Text style={{ color: C.text, fontSize: 20, fontWeight: "800", flex: 1 }} numberOfLines={1}>{title}</Text>
      </View>
      {error && !items.length ? <ErrorBox text={error} onRetry={() => load(1)} />
        : loading && !items.length ? <Loading />
        : !items.length ? <Empty text="Nothing found" />
        : <PostGrid posts={items} provider={provider} onOpen={(p) => openDetail(provider, p)} footerLoading={loading}
            onEnd={() => { if (more && !loading) void load(page + 1); }} />}
    </View>
  );
}
