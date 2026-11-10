import "../lib/desktop";
import { brand, dismissConfigUpdated, remote, useConfigUpdated } from "../config/remote";
import React, { useEffect } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { C } from "../theme";
import { clearCaches } from "../engine/engine";
import { hydrate, useApp } from "../state/store";
import { loadDownloads } from "../engine/downloads";
import { Loading } from "../components/ui";
import { OpeningAd } from "../components/OpeningAd";

// Koi bhi crash ho to blank screen ki jagah error text dikhao (aur retry / cache reset)
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 24, paddingTop: 70 }}>
      <Text style={{ color: C.danger, fontSize: 20, fontWeight: "800" }}>Something went wrong</Text>
      <ScrollView style={{ marginTop: 14, flex: 1 }}>
        <Text selectable style={{ color: C.text, fontSize: 13, lineHeight: 19 }}>{String(error?.message || error)}</Text>
        <Text selectable style={{ color: C.sub, fontSize: 11, marginTop: 12 }}>{String(error?.stack || "").slice(0, 1500)}</Text>
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 10, marginVertical: 16 }}>
        <Pressable onPress={retry} style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>Try again</Text></Pressable>
        <Pressable onPress={async () => { await clearCaches(); retry(); }} style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: C.card2, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>Clear cache + retry</Text></Pressable>
      </View>
    </View>
  );
}

export default function RootLayout() {
  const ready = useApp((s) => s.ready);
  const newLook = useConfigUpdated();
  useEffect(() => { void hydrate(); void loadDownloads(); }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        {!ready ? <Loading label={`Loading ${brand.name}…`} /> : (
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: "fade_from_bottom" }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="player" options={{ animation: "fade", orientation: "landscape", gestureEnabled: false }} />
          </Stack>
        )}
        {ready ? <OpeningAd /> : null}
        {ready && remote.announcement ? (
          <Pressable onPress={() => { const u = remote.announcement?.url; if (u) Linking.openURL(u).catch(() => {}); }} style={{ position: "absolute", left: 0, right: 0, top: 0, backgroundColor: C.accent, paddingTop: 34, paddingBottom: 8, paddingHorizontal: 14 }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5, textAlign: "center" }}>{remote.announcement.text}</Text>
          </Pressable>
        ) : null}
        {newLook ? (
          <Pressable onPress={dismissConfigUpdated} style={{ position: "absolute", left: 16, right: 16, bottom: 24, backgroundColor: C.card2, borderColor: C.accent, borderWidth: 1, borderRadius: 14, padding: 14 }}>
            <Text style={{ color: C.text, fontWeight: "800" }}>New look downloaded</Text>
            <Text style={{ color: C.sub, marginTop: 2 }}>Close the app completely and open it again to see the new name, logo and colours. Tap to dismiss.</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaProvider>
  );
}
