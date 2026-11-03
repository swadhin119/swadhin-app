import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../../theme";

const icon = (name: keyof typeof Ionicons.glyphMap, off: keyof typeof Ionicons.glyphMap) =>
  ({ color, focused }: { color: import("react-native").ColorValue; focused: boolean }) => <Ionicons name={focused ? name : off} size={24} color={color as string} />;

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: C.accent, tabBarInactiveTintColor: C.sub,
      tabBarStyle: { backgroundColor: C.card, borderTopColor: C.line }, tabBarLabelStyle: { fontSize: 11, fontWeight: "600" }, sceneStyle: { backgroundColor: C.bg } }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home", "home-outline") }} />
      <Tabs.Screen name="search" options={{ title: "Search", tabBarIcon: icon("search", "search-outline") }} />
      <Tabs.Screen name="library" options={{ title: "Library", tabBarIcon: icon("grid", "grid-outline") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person", "person-outline") }} />
    </Tabs>
  );
}
