// Notifications that the admin sends from the admin app.
// Two ways to receive them:
//  1) Always on: the app (and a background job every ~15 min) reads the admin's config and shows a normal
//     Android notification when a NEW one arrives.
//  2) Instant (optional, needs a free Firebase project): see fcm.ts. When it is active, step 1 stays quiet
//     so nobody gets the same message twice.
import { Linking, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type * as NotificationsT from "expo-notifications";
import { fetchWithReason, setNotifyHook, type Notice } from "../config/remote";

export const TASK = "swadhin-notify-check";
const SEEN = "notify.seenId";
export const FCM_FLAG = "notify.fcmActive";
export const OFF_FLAG = "notify.off";
export const notificationsEnabled = async () => (await AsyncStorage.getItem(OFF_FLAG)) !== "1";
export const setNotificationsEnabled = (on: boolean) => (on ? AsyncStorage.removeItem(OFF_FLAG) : AsyncStorage.setItem(OFF_FLAG, "1"));
// The native modules are loaded only when needed and every call is guarded, so a problem here can never stop the app from opening.
const NT = (): typeof NotificationsT => require("expo-notifications");
const TM = (): typeof import("expo-task-manager") => require("expo-task-manager");
const BT = (): typeof import("expo-background-task") => require("expo-background-task");
const MAX_AGE = 3 * 24 * 3600 * 1000; // an old notice found on a fresh install is not worth a buzz

let ready = false;
export async function setupNotifications(): Promise<void> {
  if (Platform.OS === "web" || ready) return;
  ready = true;
  try {
    NT().setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
    await NT().setNotificationChannelAsync("updates", { name: "Updates & announcements", importance: NT().AndroidImportance.HIGH, vibrationPattern: [0, 200, 120, 200], lightColor: "#ff5a36" });
    const cur = await NT().getPermissionsAsync();
    if (!cur.granted && cur.canAskAgain) await NT().requestPermissionsAsync();
  } catch { /* notifications are a bonus, never block the app */ }
}

/** Shows `n` once. Returns true if a notification was shown. */
export async function maybeNotify(n: Notice | null | undefined): Promise<boolean> {
  if (Platform.OS === "web" || !n) return false;
  try {
    if (!(await notificationsEnabled())) return false;
    if (await AsyncStorage.getItem(FCM_FLAG) === "1") { await AsyncStorage.setItem(SEEN, n.id); return false; }
    const seen = await AsyncStorage.getItem(SEEN);
    if (seen === n.id) return false;
    await AsyncStorage.setItem(SEEN, n.id);
    if (n.sentAt && Date.now() - n.sentAt > MAX_AGE) return false;
    const perm = await NT().getPermissionsAsync();
    if (!perm.granted) return false;
    await NT().scheduleNotificationAsync({ identifier: n.id, content: { title: n.title, body: n.body || undefined, data: { url: n.url }, ...(Platform.OS === "android" ? { channelId: "updates" } : {}) } as any, trigger: null });
    return true;
  } catch { return false; }
}

/** Tapping a notification opens its link (if the admin added one). */
export function listenForTaps(): () => void {
  if (Platform.OS === "web") return () => {};
  try {
    const open = (r: NotificationsT.NotificationResponse | null) => {
      const u = (r?.notification.request.content.data as any)?.url;
      if (typeof u === "string" && /^https:\/\//i.test(u)) Linking.openURL(u).catch(() => {});
    };
    NT().getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = NT().addNotificationResponseReceivedListener(open);
    return () => { try { sub.remove(); } catch { /* ignore */ } };
  } catch { return () => {}; }
}

setNotifyHook((n) => { void maybeNotify(n); });

/** Background job: Android runs it roughly every 15 minutes (the system decides exactly when) even if the app is closed. */
export function defineBackgroundJob(): void {
  if (Platform.OS === "web") return;
  try {
    TM().defineTask(TASK, async () => {
      try {
        const { cfg } = await fetchWithReason(15000);
        if (cfg?.notification) await maybeNotify(cfg.notification);
        return BT().BackgroundTaskResult.Success;
      } catch { return BT().BackgroundTaskResult.Failed; }
    });
  } catch { /* already defined */ }
}
export async function registerBackgroundCheck(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const st = await BT().getStatusAsync();
    if (st !== BT().BackgroundTaskStatus.Available) return;
    if (await TM().isTaskRegisteredAsync(TASK)) return;
    await BT().registerTaskAsync(TASK, { minimumInterval: 15 });
  } catch { /* ignore */ }
}

/** Used by Settings and the instant-push module. */
export async function permissionGranted(): Promise<boolean> { try { return (await NT().getPermissionsAsync()).granted; } catch { return true; } }
export async function showNow(title: string, body: string, url: string): Promise<void> {
  try { await NT().scheduleNotificationAsync({ content: { title, body: body || undefined, data: { url }, ...(Platform.OS === "android" ? { channelId: "updates" } : {}) } as any, trigger: null }); } catch { /* ignore */ }
}
