import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError, call } from "@/lib/api";
import { spacedCode } from "@/lib/format";
import { lang, t } from "@/lib/i18n";
import type { LatLng } from "@/lib/location";
import { type Need, NEEDS } from "@/lib/needs";
import { askPermission, getPushToken } from "@/lib/notifications";
import { startBackgroundChecks, syncPower } from "@/lib/patient";
import { store } from "@/lib/storage";
import { Button, Card, ErrorText, Field } from "@/ui/components";
import { LocationPicker } from "@/ui/LocationPicker";
import { colors, font, space } from "@/ui/theme";

type Created = { patientId: string; secret: string; linkCode: string };

export default function SetupPatient() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [home, setHome] = useState<LatLng | null>(null);
  const [useCharger, setUseCharger] = useState(false);
  const [need, setNeed] = useState<Need | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError("");
    try {
      if (!(await askPermission())) {
        setError(t.setupPatient.needPermission);
        return;
      }
      const pushToken = await getPushToken();
      const r = await call<Created>("register_patient", {
        name: name.trim(),
        phone: phone.trim() || null,
        need: need ?? "other",
        lat: home?.lat,
        lng: home?.lng,
        pushToken,
        lang,
      });
      await store.setPatient({
        patientId: r.patientId,
        secret: r.secret,
        name: name.trim(),
        linkCode: r.linkCode,
        need: need ?? "other",
      });
      await store.setRole("patient");
      await store.setChargerDetection(useCharger);
      await startBackgroundChecks();
      await syncPower();
      setCode(r.linkCode);
    } catch (e) {
      setError(
        e instanceof ApiError && e.message === "bad phone"
          ? t.common.badPhone
          : t.common.cantConnect,
      );
    } finally {
      setBusy(false);
    }
  }

  if (code) {
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark" size={36} color="#fff" />
          </View>
          <Text style={styles.title}>{t.setupPatient.done}</Text>
          <Text style={styles.body}>{t.setupPatient.giveCode}</Text>
          <Card style={styles.codeCard}>
            <Text style={styles.code} accessibilityLabel={t.setupPatient.codeA11y(code.split("").join(" "))}>
              {spacedCode(code)}
            </Text>
          </Card>
          <Text style={styles.note}>{t.setupPatient.codeNote}</Text>
          <Card style={styles.tip}>
            <Ionicons name={useCharger ? "battery-charging" : "people"} size={26} color={colors.warn} />
            <Text style={styles.tipText}>{useCharger ? t.setupPatient.tipCharger : t.setupPatient.tipCommunity}</Text>
          </Card>
        </ScrollView>
        <View style={styles.footer}>
          <Button label={t.setupPatient.start} icon="arrow-forward" onPress={() => router.replace("/patient")} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{t.setupPatient.title}</Text>
          <Text style={styles.body}>{t.setupPatient.body}</Text>
          <Field
            label={t.setupPatient.name}
            placeholder={t.setupPatient.namePlaceholder}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            hint={t.setupPatient.nameHint}
          />
          <View style={styles.needs}>
            <Text style={styles.label}>{t.setupPatient.needQuestion}</Text>
            <Text style={styles.toggleHint}>{t.setupPatient.needHint}</Text>
            {(Object.keys(NEEDS) as Need[]).map((k) => {
              const on = need === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => setNeed(k)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={[styles.need, on && styles.needOn]}
                >
                  <Ionicons name={NEEDS[k].icon} size={22} color={on ? colors.ok : colors.muted} />
                  <Text style={styles.needTitle}>{NEEDS[k].title}</Text>
                  <Text style={styles.needEvery}>{NEEDS[k].every}</Text>
                  <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={22} color={on ? colors.ok : colors.line} />
                </Pressable>
              );
            })}
          </View>
          <Field
            label={t.setupPatient.phone}
            placeholder="787-555-1234"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            hint={t.setupPatient.phoneHint}
          />
          <LocationPicker
            title={t.setupPatient.homeTitle}
            hint={t.setupPatient.homeHint}
            value={home}
            onChange={setHome}
          />
          <View style={styles.toggle}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleTitle}>{t.setupPatient.chargerTitle}</Text>
              <Text style={styles.toggleHint}>{t.setupPatient.chargerHint}</Text>
            </View>
            <Switch value={useCharger} onValueChange={setUseCharger} trackColor={{ true: colors.ok, false: colors.line }} />
          </View>
          {Platform.OS === "ios" ? (
            <Card style={styles.tip}>
              <Ionicons name="warning" size={26} color={colors.warn} />
              <Text style={styles.tipText}>{t.setupPatient.iphoneWarning}</Text>
            </Card>
          ) : null}
          <ErrorText>{error}</ErrorText>
        </ScrollView>
        <View style={styles.footer}>
          <Button label={t.setupPatient.create} busy={busy} disabled={name.trim().length < 2 || need === null} onPress={create} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.lg, paddingTop: space.xl },
  footer: { padding: space.lg, paddingTop: space.sm },
  title: { fontSize: font.big + 2, fontWeight: "800", color: colors.ink, letterSpacing: -0.5 },
  body: { fontSize: font.body, color: colors.muted, lineHeight: 26 },
  note: { fontSize: font.small + 1, color: colors.muted, lineHeight: 23 },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.ok,
    alignItems: "center",
    justifyContent: "center",
  },
  codeCard: { alignItems: "center", paddingVertical: space.xl },
  code: { fontSize: 54, fontWeight: "800", letterSpacing: 4, color: colors.ink, fontVariant: ["tabular-nums"] },
  label: { fontSize: font.body, fontWeight: "700", color: colors.ink },
  needs: { gap: 8 },
  need: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 54,
    paddingHorizontal: space.md,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  needOn: { borderColor: colors.ok, backgroundColor: colors.okBg },
  needTitle: { flex: 1, fontSize: font.body - 1, fontWeight: "600", color: colors.ink },
  needEvery: { fontSize: font.small - 1, color: colors.muted },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: { fontSize: font.body, fontWeight: "700", color: colors.ink },
  toggleHint: { fontSize: font.small, color: colors.muted, lineHeight: 20 },
  tip: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: colors.warnBg },
  tipText: { flex: 1, fontSize: font.small + 1, color: colors.ink, lineHeight: 22 },
});
