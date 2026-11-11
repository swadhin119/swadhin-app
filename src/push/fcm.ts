// OPTIONAL instant push (works even when the app is closed). It only switches on when the APK was built with
// Firebase (the build adds the Firebase packages when google-services.json is in the repo; see PUSH-SETUP.md).
// Without Firebase this file does nothing and the normal check in notify.ts is used.
import { Linking, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { FCM_FLAG, notificationsEnabled } from "./notify";

const TOPIC = "all";
const open = (m: any) => { const u = m?.data?.url; if (typeof u === "string" && /^https:\/\//i.test(u)) Linking.openURL(u).catch(() => {}); };
function messagingOrNull(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("@react-native-firebase/messaging");
    return (mod.default ?? mod)();
  } catch { return null; }
}

export async function initFcm(): Promise<void> {
  if (Platform.OS !== "android") return;
  const m = messagingOrNull(); if (!m) { try { await AsyncStorage.removeItem(FCM_FLAG); } catch { /* ignore */ } return; }
  try {
    await AsyncStorage.setItem(FCM_FLAG, "1");
    if (await notificationsEnabled()) await m.subscribeToTopic(TOPIC); else await m.unsubscribeFromTopic(TOPIC);
    // app is open: Firebase does not draw anything itself, so show it as a normal notification
    m.onMessage(async (msg: any) => {
      if (!(await notificationsEnabled())) return;
      const n = msg?.notification; if (!n?.title) return;
      await Notifications.scheduleNotificationAsync({ content: { title: n.title, body: n.body || undefined, data: { url: msg?.data?.url || "" }, ...({ channelId: "updates" } as any) }, trigger: null });
    });
    m.onNotificationOpenedApp(open);
    m.getInitialNotification().then(open).catch(() => {});
  } catch {
    try { await AsyncStorage.removeItem(FCM_FLAG); } catch { /* ignore */ }
  }
}
/** The user's on/off switch also has to join / leave the instant-push group. */
export async function applyFcmPreference(on: boolean): Promise<void> {
  const m = messagingOrNull(); if (!m) return;
  try { if (on) await m.subscribeToTopic(TOPIC); else await m.unsubscribeFromTopic(TOPIC); } catch { /* ignore */ }
}
