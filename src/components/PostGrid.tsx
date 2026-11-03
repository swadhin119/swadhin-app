import React from "react";
import { FlatList, useWindowDimensions, View, ActivityIndicator, type FlatListProps } from "react-native";
import { C } from "../theme";
import type { Post } from "../engine/types";
import { PosterCard } from "./ui";

export function PostGrid({ posts, provider, onOpen, onEnd, footerLoading, header, ...rest }: {
  posts: Post[]; provider: string; onOpen: (p: Post) => void; onEnd?: () => void; footerLoading?: boolean; header?: React.ReactElement;
} & Partial<FlatListProps<Post>>) {
  const { width } = useWindowDimensions();
  const cols = width > 700 ? 5 : 3, gap = 12, pad = 16;
  const w = Math.floor((width - pad * 2 - gap * (cols - 1)) / cols);
  return (
    <FlatList {...rest} key={cols} data={posts} numColumns={cols} keyExtractor={(p, i) => p.link + i}
      columnWrapperStyle={{ gap, paddingHorizontal: pad, marginBottom: 14 }} contentContainerStyle={{ paddingBottom: 40 }}
      ListHeaderComponent={header} onEndReached={onEnd} onEndReachedThreshold={0.6}
      ListFooterComponent={footerLoading ? <View style={{ padding: 20 }}><ActivityIndicator color={C.accent} /></View> : undefined}
      renderItem={({ item }) => <PosterCard post={item} w={w} h={Math.round(w * 1.45)} onPress={() => onOpen(item)} />} />
  );
}
