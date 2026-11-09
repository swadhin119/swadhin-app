import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, R } from "../../theme";
import { searchPosts } from "../../engine/engine";
import type { Post } from "../../engine/types";
import { useApp } from "../../state/store";
import { Empty, ErrorBox, Loading } from "../../components/ui";
import { PostGrid } from "../../components/PostGrid";
import { openDetail } from "../../lib/nav";

export default function Search() {
  const insets = useSafeAreaInsets();
  const provider = useApp((s) => s.provider);
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => { const id = setTimeout(() => setTerm(q.trim()), 500); return () => clearTimeout(id); }, [q]);

  const load = useCallback(async (t: string, p: number) => {
    const my = ++seq.current; setLoading(true); setError(null);
    try {
      const r = await searchPosts(provider, t, p);
      if (my !== seq.current) return;
      setItems((prev) => { if (p === 1) return r; const seen = new Set(prev.map((x) => x.link)); return [...prev, ...r.filter((x) => !seen.has(x.link))]; });
      setMore(r.length > 0 && p < 8); setPage(p);
    } catch (e: any) { if (my === seq.current) { setError(String(e?.message || e)); setMore(false); } }
    finally { if (my === seq.current) setLoading(false); }
  }, [provider]);

  useEffect(() => {
    if (term.length < 2) { seq.current++; setItems([]); setLoading(false); setError(null); return; }
    setItems([]); setMore(true); void load(term, 1);
  }, [term, provider, load]);

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 8 }}>
      <View style={st.bar}>
        <Ionicons name="search" size={20} color={C.sub} />
        <TextInput value={q} onChangeText={setQ} placeholder="Movie or series name…" placeholderTextColor={C.sub} style={st.input}
          returnKeyType="search" autoCorrect={false} onSubmitEditing={() => setTerm(q.trim())} />
        {q ? <Pressable onPress={() => setQ("")} hitSlop={10}><Ionicons name="close-circle" size={20} color={C.sub} /></Pressable> : null}
      </View>
      {term.length < 2 ? <Empty icon="search-outline" text="Type to search, results appear live" />
        : error && !items.length ? <ErrorBox text={error} onRetry={() => load(term, 1)} />
        : loading && !items.length ? <Loading label="Searching…" />
        : !items.length ? <Empty text={`No results for "${term}"`} />
        : <PostGrid posts={items} provider={provider} onOpen={(p) => openDetail(provider, p)} footerLoading={loading}
            onEnd={() => { if (more && !loading) void load(term, page + 1); }} keyboardShouldPersistTaps="handled" />}
    </View>
  );
}
const st = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 14, paddingHorizontal: 14, height: 48, borderRadius: R.l, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  input: { flex: 1, color: C.text, fontSize: 16, paddingVertical: 0 },
});
