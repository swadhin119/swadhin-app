const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);

// Web / desktop build only: swap native-only modules for browser versions
const WEB = {
  "expo-video": path.join(__dirname, "src/web/expo-video.tsx"),
  "react-native-webview": path.join(__dirname, "src/web/webview.tsx"),
};
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && WEB[moduleName]) return { type: "sourceFile", filePath: WEB[moduleName] };
  return (upstream || context.resolveRequest)(context, moduleName, platform);
};
// The Electron shell lives in ./desktop (own node_modules, build output): keep Metro out of it
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const desktopDir = new RegExp("^(" + [path.join(__dirname, "desktop"), path.join(__dirname, "admin-app")].map(esc).join("|").replace(/[\\/]+/g, "[\\\\/]") + ")[\\\\/].*");
const cur = config.resolver.blockList;
config.resolver.blockList = Array.isArray(cur) ? [...cur, desktopDir] : cur ? [cur, desktopDir] : [desktopDir];
module.exports = config;
