import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import {
  AndroidAudioContentType,
  AndroidAudioUsage,
  AndroidImportance,
  AndroidNotificationVisibility,
} from "expo-notifications";
import { Platform } from "react-native";
import { t } from "./i18n";
import { RERING_OFFSETS_MS } from "./rules";

export const CHANNEL_CHECKIN = "checkin";
export const CHANNEL_ALERT = "alert";
export const CHANNEL_INFO = "info";
const ALARM_SOUND = "alarm.wav";
const RING_PREFIX = "checkin-ring-";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const ACTION_OK = "ok";

export async function setupChannels(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(CHANNEL_CHECKIN, [
    { identifier: ACTION_OK, buttonTitle: t.notif.okAction, options: { opensAppToForeground: true } },
  ]).catch(() => {});
  if (Platform.OS !== "android") return;
  const loud = {
    importance: AndroidImportance.MAX,
    sound: ALARM_SOUND,
    bypassDnd: true,
    vibrationPattern: [0, 800, 400, 800, 400, 800],
    enableVibrate: true,
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    audioAttributes: {
      usage: AndroidAudioUsage.ALARM,
      contentType: AndroidAudioContentType.SONIFICATION,
    },
  };
  await Notifications.setNotificationChannelAsync(CHANNEL_CHECKIN, {
    name: t.notif.checkinChannel,
    description: t.notif.checkinChannelDesc,
    ...loud,
  });
  await Notifications.setNotificationChannelAsync(CHANNEL_ALERT, {
    name: t.notif.alertChannel,
    description: t.notif.alertChannelDesc,
    ...loud,
  });
  await Notifications.setNotificationChannelAsync(CHANNEL_INFO, {
    name: t.notif.infoChannel,
    importance: AndroidImportance.DEFAULT,
  });
}

export async function askPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  if (Platform.OS === "android") {
    try {
      const exact = await Notifications.getExactAlarmPermissionsAsync();
      if (!exact.granted) await Notifications.requestExactAlarmPermissionsAsync();
    } catch {
    }
  }
  return asked.granted;
}

export async function getPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const configured = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const projectId = configured && !configured.startsWith("REPLACE") ? configured : undefined;
  if (!projectId) console.warn("RedVita: run `npx eas-cli init` so push notifications work");
  try {
    const t = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return t.data;
  } catch (e) {
    console.warn("push token failed", e);
    return null;
  }
}

export async function scheduleRings(dueAt: number): Promise<void> {
  await cancelRings();
  const start = Math.max(dueAt, Date.now() + 1_000);
  for (const [i, offset] of RERING_OFFSETS_MS.entries()) {
    const at = start + offset;
    await Notifications.scheduleNotificationAsync({
      identifier: `${RING_PREFIX}${i}`,
      content: {
        title: i === 0 ? t.notif.ringTitle : t.notif.ringAgainTitle,
        body: t.notif.ringBody,
        sound: ALARM_SOUND,
        data: { type: "checkin", dueAt },
        categoryIdentifier: CHANNEL_CHECKIN,
        priority: Notifications.AndroidNotificationPriority.MAX,
        interruptionLevel: "timeSensitive",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
        channelId: CHANNEL_CHECKIN,
        delivery: "alarmClock",
      },
    });
  }
}

export async function cancelRings(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(RING_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  await Notifications.dismissAllNotificationsAsync();
}
