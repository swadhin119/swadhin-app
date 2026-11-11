// Root component: loads the saved look (colours / name / logo) first, THEN loads the router app,
// so every screen is built with the right colours.
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { bootConfig } from "./config/remote";
import "./push/notify"; // defines the background job at app start

export default function Boot() {
  const [App, setApp] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    let dead = false;
    bootConfig().catch(() => {}).finally(() => {
      if (dead) return;
      const { App: Router } = require("expo-router/build/qualified-entry");
      setApp(() => Router);
    });
    return () => { dead = true; };
  }, []);
  if (!App) return <View style={{ flex: 1, backgroundColor: "#0b0b10", alignItems: "center", justifyContent: "center" }}><ActivityIndicator color="#ff5a36" /></View>;
  return <App />;
}
