// Root component: loads the saved look (colours / name / logo) first, THEN loads the router app,
// so every screen is built with the right colours.
// It also catches crashes: instead of the app silently closing, a screen shows what went wrong.
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { bootConfig } from "./config/remote";

// Notifications are a bonus: if anything in there fails, the app must still open.
try { require("./push/notify").defineBackgroundJob(); } catch { /* ignore */ }

let lastError = "";
const listeners = new Set<() => void>();
const report = (e: unknown, fatal?: boolean) => {
  const err: any = e;
  lastError = ((fatal ? "FATAL " : "") + (err?.message || String(e)) + "\n" + String(err?.stack || "").split("\n").slice(0, 8).join("\n")).slice(0, 1200);
  listeners.forEach((f) => f());
};
try {
  const EU = (globalThis as any).ErrorUtils;
  const prev = EU?.getGlobalHandler?.();
  // Show the error instead of closing the app. (Original handler is not called, so the app keeps running.)
  EU?.setGlobalHandler?.((e: unknown, fatal?: boolean) => { report(e, fatal); if (!prev) return; });
} catch { /* ignore */ }

class Guard extends React.Component<{ children: React.ReactNode }, { err: string }> {
  state = { err: "" };
  static getDerivedStateFromError(e: any) { return { err: String(e?.message || e) + "\n" + String(e?.stack || "").split("\n").slice(0, 8).join("\n") }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: "#0b0b10", padding: 20, paddingTop: 70 }}>
        <Text style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>Something went wrong</Text>
        <Text style={{ color: "#9a9ab0", marginTop: 6 }}>Please send a screenshot of this screen to the developer.</Text>
        <ScrollView style={{ marginTop: 14, backgroundColor: "#16161e", borderRadius: 12, padding: 12 }}><Text selectable style={{ color: "#ff8a70", fontSize: 12 }}>{this.state.err}</Text></ScrollView>
        <Pressable onPress={() => this.setState({ err: "" })} style={{ marginTop: 14, height: 46, borderRadius: 23, backgroundColor: "#ff5a36", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "800" }}>Try again</Text></Pressable>
        <Pressable onPress={async () => { try { await AsyncStorage.clear(); } catch { /* ignore */ } this.setState({ err: "" }); }} style={{ marginTop: 10, height: 46, borderRadius: 23, backgroundColor: "#1f1f2a", alignItems: "center", justifyContent: "center", marginBottom: 20 }}><Text style={{ color: "#fff", fontWeight: "700" }}>Clear saved data and try again</Text></Pressable>
      </View>
    );
  }
}

export default function Boot() {
  const [App, setApp] = useState<React.ComponentType | null>(null);
  const [err, setErr] = useState(lastError);
  useEffect(() => { const f = () => setErr(lastError); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  useEffect(() => {
    let dead = false;
    bootConfig().catch(() => {}).finally(() => {
      if (dead) return;
      try {
        const { App: Router } = require("expo-router/build/qualified-entry");
        setApp(() => Router);
      } catch (e) { report(e, true); }
    });
    return () => { dead = true; };
  }, []);
  const banner = err ? (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#3a0f18", padding: 12, paddingBottom: 24 }}>
      <Text style={{ color: "#ffb4c0", fontWeight: "800", fontSize: 12 }}>An error happened (the app kept running)</Text>
      <Text selectable numberOfLines={7} style={{ color: "#ffd9df", fontSize: 11, marginTop: 4 }}>{err}</Text>
      <Pressable onPress={() => { lastError = ""; setErr(""); }} style={{ alignSelf: "flex-start", marginTop: 8, paddingHorizontal: 14, height: 32, borderRadius: 16, backgroundColor: "#ff5a36", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>Dismiss</Text></Pressable>
    </View>
  ) : null;
  if (!App) return <View style={{ flex: 1, backgroundColor: "#0b0b10", alignItems: "center", justifyContent: "center" }}><ActivityIndicator color="#ff5a36" />{banner}</View>;
  return <View style={{ flex: 1 }}><Guard><App /></Guard>{banner}</View>;
}
