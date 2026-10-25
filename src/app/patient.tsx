import Ionicons from "@expo/vector-icons/Ionicons";
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import { LinearGradient } from "expo-linear-gradient";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import { Animated, AppState, Easing, Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { clock, longDate, spacedCode } from "@/lib/format";
import { t } from "@/lib/i18n";
import { checkIn, getLocalState, handlePush, startBackgroundChecks, syncPower, watchCharger } from "@/lib/patient";
import { registerPush } from "@/lib/push";
import { emptyLocal, type Local } from "@/lib/rules";
import { type PatientIdentity, store } from "@/lib/storage";
import { Pill } from "@/ui/components";
import { colors, font, space } from "@/ui/theme";

const alarmSource = require("../../assets/sounds/alarm.wav");

function KeepAwake() {
  useKeepAwake("redvita-alarm");
  return null;
}

function PulseRings({ size }: { size: number }) {
  const [a] = useState(() => new Animated.Value(0));
  const [b] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const ring = (v: Animated.Value) =>
      Animated.loop(Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    const ra = ring(a);
    const rb = ring(b);
    ra.start();
    const t = setTimeout(() => rb.start(), 900);
    return () => {
      clearTimeout(t);
      ra.stop();
      rb.stop();
    };
  }, [a, b]);
  const style = (v: Animated.Value) => ({
    position: "absolute" as const,
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.7)",
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
  });
  return (
    <>
      <Animated.View pointerEvents="none" style={style(a)} />
      <Animated.View pointerEvents="none" style={style(b)} />
    </>
  );
}

function BigButton({ size, onPress }: { size: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.patient.buttonA11y}
      onPress={onPress}
      style={({ pressed }) => [
        styles.big,
        { width: size, height: size, borderRadius: size / 2 },
        pressed && { transform: [{ scale: 0.96 }] },
      ]}
    >
      <Ionicons name="checkmark" size={size * 0.27} color="#fff" />
      <Text style={styles.bigText}>{t.patient.button}</Text>
    </Pressable>
  );
}

export default function PatientScreen() {
  const [me, setMe] = useState<PatientIdentity | null>(null);
  const [local, setLocal] = useState<Local>(emptyLocal);
  const [pending, setPending] = useState(false);
  const [thanks, setThanks] = useState(false);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const s = await getLocalState();
    setLocal(s.local);
    setPending(s.pending);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    store.getPatient().then(setMe);
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {});
    registerPush();
    startBackgroundChecks();
    syncPower().then(refresh);
  }, [refresh]);

  useEffect(() => watchCharger(() => refresh()), [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") syncPower().then(refresh);
    });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => syncPower().then(refresh), 5 * 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const last = Notifications.getLastNotificationResponse();
    if (last) handlePush(last.notification.request.content.data, last.actionIdentifier).then(refresh);
    const a = Notifications.addNotificationReceivedListener((n) => handlePush(n.request.content.data).then(refresh));
    const b = Notifications.addNotificationResponseReceivedListener((r) =>
      handlePush(r.notification.request.content.data, r.actionIdentifier).then(refresh),
    );
    return () => {
      a.remove();
      b.remove();
    };
  }, [refresh]);

  useEffect(() => {
    if (!pending) return;
    let player: AudioPlayer | null = null;
    try {
      player = createAudioPlayer(alarmSource);
      player.loop = true;
      player.volume = 1;
      player.play();
    } catch {
    }
    Vibration.vibrate([0, 700, 500], true);
    return () => {
      Vibration.cancel();
      player?.pause();
      player?.remove();
    };
  }, [pending]);

  async function press() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setPending(false);
    setSending(true);
    const l = await checkIn();
    setSending(false);
    setLocal(l);
    setThanks(true);
    setTimeout(() => setThanks(false), 8_000);
  }

  if (pending) {
    return (
      <LinearGradient colors={["#C62828", "#7F1D1D"]} style={styles.fill}>
        <KeepAwake />
        <SafeAreaView style={styles.alarm}>
          <View style={styles.alarmTop}>
            <View style={styles.alarmBrand}>
              <Ionicons name="heart" size={18} color="rgba(255,255,255,0.85)" />
              <Text style={styles.alarmBrandText}>RedVita</Text>
            </View>
            <Text style={styles.alarmTitle}>{t.patient.askTitle}</Text>
            <Text style={styles.alarmSub}>
              {local.outageSince !== null ? t.patient.askOutage : t.patient.ask}
            </Text>
          </View>
          <View style={styles.alarmCenter}>
            <PulseRings size={230} />
            <BigButton size={230} onPress={press} />
          </View>
          <Text style={styles.alarmHint}>{t.patient.tapGreen}</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const outage = local.outageSince !== null;
  const unsent = local.unsentCheckinAt !== null;
  const message = sending
    ? t.patient.sending
    : thanks
      ? unsent
        ? t.patient.saved
        : t.patient.sent
      : local.lastCheckinAt
        ? t.patient.last(clock(local.lastCheckinAt))
        : t.patient.idle;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.top}>
        <Text style={styles.time}>{clock(now)}</Text>
        <Text style={styles.date}>{longDate(now)}</Text>
        <Pill
          tone={outage ? "warn" : "ok"}
          icon={outage ? "flash-off" : "flash"}
          label={outage ? t.patient.powerOut : t.patient.powerOn}
        />
      </View>

      <View style={styles.center}>
        <View style={styles.halo}>
          <BigButton size={240} onPress={press} />
        </View>
        <View style={styles.messageRow}>
          {thanks && !sending ? (
            <Ionicons name={unsent ? "time" : "checkmark-circle"} size={26} color={unsent ? colors.warn : colors.ok} />
          ) : null}
          <Text style={styles.message} accessibilityLiveRegion="polite">
            {message}
          </Text>
        </View>
      </View>

      <Text style={styles.footer}>{me ? t.patient.footer(me.name, spacedCode(me.linkCode)) : " "}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.lg },
  top: { alignItems: "center", gap: 6, marginTop: space.xl },
  time: { fontSize: font.hero, fontWeight: "300", color: colors.ink, fontVariant: ["tabular-nums"], letterSpacing: -1 },
  date: { fontSize: font.body, color: colors.muted, marginBottom: space.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.xl },
  halo: { padding: 14, borderRadius: 999, backgroundColor: colors.okBg },
  big: {
    backgroundColor: colors.ok,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  bigText: { color: "#fff", fontSize: 32, fontWeight: "800", letterSpacing: 0.5 },
  messageRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 64, paddingHorizontal: space.md },
  message: { fontSize: font.title, color: colors.ink, textAlign: "center", fontWeight: "600", flexShrink: 1 },
  footer: { fontSize: font.small, color: colors.muted, textAlign: "center", marginBottom: space.md },

  alarm: { flex: 1, paddingHorizontal: space.lg, justifyContent: "space-between" },
  alarmTop: { alignItems: "center", gap: space.sm, marginTop: space.xl },
  alarmBrand: { flexDirection: "row", alignItems: "center", gap: 6 },
  alarmBrandText: { color: "rgba(255,255,255,0.85)", fontSize: font.small, fontWeight: "700", letterSpacing: 1 },
  alarmTitle: { color: "#fff", fontSize: 48, fontWeight: "800", letterSpacing: -1 },
  alarmSub: { color: "rgba(255,255,255,0.9)", fontSize: font.title, textAlign: "center" },
  alarmCenter: { alignItems: "center", justifyContent: "center", height: 380 },
  alarmHint: { color: "#fff", fontSize: font.title, fontWeight: "700", textAlign: "center", marginBottom: space.xl },
});
