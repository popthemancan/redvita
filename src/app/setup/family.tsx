import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError, call } from "@/lib/api";
import { lang, t } from "@/lib/i18n";
import type { LatLng } from "@/lib/location";
import { askPermission, getPushToken } from "@/lib/notifications";
import { store } from "@/lib/storage";
import { Button, ErrorText, Field } from "@/ui/components";
import { LocationPicker } from "@/ui/LocationPicker";
import { colors, font, space } from "@/ui/theme";

type Linked = { contactId: string; secret: string; patientName: string };

export default function SetupFamily() {
  const { add } = useLocalSearchParams<{ add?: string }>();
  const adding = add === "1";
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [home, setHome] = useState<LatLng | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    store.getFamilyPhone().then((me) => {
      if (!me) return;
      setName(me.name);
      setPhone(me.phone);
      if (me.home) setHome(me.home);
    });
  }, []);

  const digits = code.replace(/\D/g, "");

  async function link() {
    setBusy(true);
    setError("");
    try {
      await askPermission();
      const pushToken = await getPushToken();
      const r = await call<Linked>("register_contact", {
        linkCode: digits,
        name: name.trim(),
        phone: phone.trim() || null,
        lat: home?.lat,
        lng: home?.lng,
        pushToken,
        lang,
      });
      const links = await store.getLinks();
      await store.setLinks([...links, { contactId: r.contactId, secret: r.secret, patientName: r.patientName }]);
      await store.setFamilyPhone({ name: name.trim(), phone: phone.trim(), home });
      await store.setRole("family");
      router.replace("/family");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setError(t.setupFamily.badCode);
      else if (e instanceof ApiError && e.status === 429) setError(t.setupFamily.tooMany);
      else if (e instanceof ApiError && e.message === "bad phone") setError(t.common.badPhone);
      else setError(t.common.cantConnect);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{adding ? t.setupFamily.titleAdd : t.setupFamily.title}</Text>
          <Text style={styles.body}>{t.setupFamily.body}</Text>
          <Field
            label={t.setupFamily.code}
            placeholder="123 456"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={7}
          />
          <Field label={t.setupFamily.yourName} placeholder={t.setupFamily.namePlaceholder} value={name} onChangeText={setName} autoCapitalize="words" />
          <Field
            label={t.setupFamily.yourPhone}
            placeholder="787-555-1234"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            hint={t.setupFamily.phoneHint}
          />
          <LocationPicker
            title={t.setupFamily.homeTitle}
            hint={t.setupFamily.homeHint}
            value={home}
            onChange={setHome}
          />
          <ErrorText>{error}</ErrorText>
        </ScrollView>
        <View style={styles.footer}>
          <Button label={t.setupFamily.connect} busy={busy} disabled={digits.length !== 6 || name.trim().length < 2} onPress={link} />
          {adding ? <Button label={t.common.cancel} kind="secondary" onPress={() => router.back()} /> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.lg, paddingTop: space.xl },
  footer: { padding: space.lg, paddingTop: space.sm, gap: space.sm },
  title: { fontSize: font.big + 2, fontWeight: "800", color: colors.ink, letterSpacing: -0.5 },
  body: { fontSize: font.body, color: colors.muted, lineHeight: 26 },
});
