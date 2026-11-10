// Web / desktop stand-in for "react-native-webview": an <iframe> (embed players). Electron strips frame-blocking headers.
import React from "react";
import { StyleSheet } from "react-native";
export function WebView({ source, style }: { source: { uri: string }; style?: any; [k: string]: any }) {
  const css = StyleSheet.flatten(style) || {};
  return React.createElement("iframe", {
    src: source?.uri, allow: "autoplay; fullscreen; encrypted-media; picture-in-picture", allowFullScreen: true,
    style: { border: 0, width: "100%", height: "100%", background: "#000", flex: 1, ...(css as object) },
  });
}
export default WebView;
