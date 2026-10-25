import Ionicons from "@expo/vector-icons/Ionicons";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, call, type PatientSummary } from "@/lib/api";
import { ago, clock, eventLabel, initials } from "@/lib/format";
import { t } from "@/lib/i18n";
import { distanceKm, travelLabel } from "@/lib/location";
import { NEEDS, needOf } from "@/lib/needs";
import { registerPush } from "@/lib/push";
import { type FamilyLink, store } from "@/lib/storage";
import { Button, Card, type IconName, SectionTitle } from "@/ui/components";
import { FamilyMap, type MapPatient, type MapPerson } from "@/ui/FamilyMap";
import { colors, font, radius, shadow, space, type Tone, toneColors } from "@/ui/theme";

type Status = { tone: Tone; icon: IconName; title: string; sub: string; urgent: boolean };

function describe(p: PatientSummary): Status {
  if (p.alert === "no_response") {
    return {
      tone: "danger",
      icon: "alert",
      title: t.family.noAnswer,
      sub: t.family.noAnswerSub(clock(p.nextCheckinAt)),
      urgent: true,
    };
  }
  if (p.alert === "no_signal") {
    return { tone: "danger", icon: "cellular", title: t.family.noSignal, sub: t.family.noSignalSub, urgent: true };
  }
  if (p.waiting) {
    return { tone: "warn", icon: "notifications", title: t.family.asking, sub: t.family.askingSub, urgent: false };
  }
  if (p.outageStartedAt) {
    return {
      tone: "warn",
      icon: "flash-off",
      title: t.family.outageOk,
      sub: t.family.outageOkSub(ago(p.lastCheckinAt), clock(p.nextCheckinAt)),
      urgent: false,
    };
  }
  return { tone: "ok", icon: "checkmark", title: t.family.ok, sub: t.family.okSub(ago(p.lastCheckinAt)), urgent: false };
}

const severity: Record<Tone, number> = { danger: 0, warn: 1, ok: 2, neutral: 3 };

function directions(lat: number, lng: number) {
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() => {});
}

export default function FamilyScreen() {
  const insets = useSafeAreaInsets();
  const [links, setLinks] = useState<FamilyLink[]>([]);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    try {
      const l = await store.getLinks();
      setLinks(l);
      const r = await call<{ patients: PatientSummary[] }>("family_status", {
        links: l.map(({ contactId, secret }) => ({ contactId, secret })),
      });
      setPatients(r.patients.filter((p) => !p.error));
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    registerPush();
    const first = setTimeout(load, 0);
    const t = setInterval(load, 30_000);
    const sub = Notifications.addNotificationReceivedListener(() => load());
    return () => {
      clearTimeout(first);
      clearInterval(t);
      sub.remove();
    };
  }, [load]);

  async function pullToRefresh() {
    setLoading(true);
    await load();
    setLoading(false);
  }

  const sorted = useMemo(
    () => [...patients].sort((a, b) => severity[describe(a).tone] - severity[describe(b).tone]),
    [patients],
  );
  const selected = sorted.find((p) => p.contactId === selectedId) ?? sorted[0] ?? null;
  const status = selected ? describe(selected) : null;
  const myLink = links.find((l) => l.contactId === selected?.contactId);

  const mapPatients: MapPatient[] = useMemo(
    () =>
      sorted.map((p) => {
        const t = describe(p).tone;
        return { id: p.contactId, name: p.name, home: p.home, tone: t === "neutral" ? "ok" : t };
      }),
    [sorted],
  );
  const mapPeople: MapPerson[] = useMemo(
    () =>
      (selected?.people ?? []).map((m) => ({
        name: m.name,
        initials: initials(m.name),
        me: m.me,
        responding: m.responding,
        home: m.home,
      })),
    [selected],
  );

  const nearby = useMemo(() => {
    if (!selected) return [];
    return [...selected.people]
      .map((m) => ({ ...m, km: m.home && selected.home ? distanceKm(m.home, selected.home) : null }))
      .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9))
      .slice(0, 3);
  }, [selected]);
  const iAmGoing = selected?.people.some((m) => m.me && m.responding) ?? false;

  async function act(action: "request_checkin" | "responding" | "seen_in_person") {
    if (!myLink) return;
    setBusy(action);
    try {
      await call(action, { contactId: myLink.contactId, secret: myLink.secret });
      await load();
    } catch {
      Alert.alert(t.common.offline, t.common.cantSend);
    } finally {
      setBusy(null);
    }
  }

  async function report(kind: "report_outage" | "report_power_back") {
    if (!myLink || !selected) return;
    setBusy(kind);
    try {
      await call(kind, { contactId: myLink.contactId, secret: myLink.secret });
      await load();
      if (kind === "report_outage") {
        Alert.alert(t.family.thanksTitle, t.family.thanksBody(selected.name));
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) Alert.alert(t.family.alreadyTitle, t.family.alreadyBody);
      else Alert.alert(t.common.offline, t.common.cantSend);
    } finally {
      setBusy(null);
    }
  }

  function going() {
    if (selected?.home) directions(selected.home.lat, selected.home.lng);
    if (!iAmGoing) act("responding");
  }

  function confirmSeen() {
    if (!selected) return;
    Alert.alert(t.family.seenQuestion(selected.name), t.family.seenExplain, [
      { text: t.common.cancel, style: "cancel" },
      { text: t.family.seenYes, onPress: () => act("seen_in_person") },
    ]);
  }

  const tone = status ? toneColors[status.tone] : toneColors.neutral;
  const needsHelp = !!status?.urgent || iAmGoing;
  const need = selected ? NEEDS[needOf(selected.need)] : null;
  const othersGoing = selected?.people.filter((m) => m.responding && !m.me).map((m) => m.name) ?? [];

  return (
    <View style={styles.screen}>
      <View style={styles.mapBox}>
        <FamilyMap patients={mapPatients} people={mapPeople} selectedId={selected?.contactId ?? null} onSelect={setSelectedId} />
        {offline ? (
          <View style={[styles.offline, { top: insets.top + 8 }]}>
            <Ionicons name="cloud-offline" size={16} color={colors.warn} />
            <Text style={styles.offlineText}>{t.common.offline}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={styles.sheet}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + space.xl }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={pullToRefresh} />}
      >
        <View style={styles.grabber} />

        {sorted.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {sorted.map((p) => {
              const s = describe(p);
              const on = p.contactId === selected?.contactId;
              return (
                <Pressable
                  key={p.contactId}
                  onPress={() => setSelectedId(p.contactId)}
                  style={[styles.chip, on && styles.chipOn]}
                  accessibilityRole="button"
                >
                  <View style={[styles.chipDot, { backgroundColor: toneColors[s.tone].fg }]} />
                  <Text style={[styles.chipText, on && { color: "#fff" }]}>{p.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {selected && status ? (
          <>

            <Card style={status.urgent ? styles.urgentCard : undefined}>
              <Text style={styles.who}>{selected.name}</Text>
              {need?.label ? (
                <View style={styles.needRow}>
                  <Ionicons name={need.icon} size={16} color={colors.muted} />
                  <Text style={styles.needText}>{t.family.needLine(need.label, need.every)}</Text>
                </View>
              ) : null}
              <View style={styles.statusRow}>
                <View style={[styles.statusIcon, { backgroundColor: tone.bg }]}>
                  <Ionicons name={status.icon} size={30} color={tone.fg} />
                </View>
                <View style={styles.statusText}>
                  <Text style={[styles.title, status.urgent && { color: colors.danger }]}>{status.title}</Text>
                  <Text style={styles.sub}>{status.sub}</Text>
                </View>
              </View>

              {needsHelp ? (
                <View style={styles.actions}>

                  {!iAmGoing ? (
                    othersGoing.length > 0 ? (
                      <View style={[styles.goingRow, { backgroundColor: colors.okBg }]}>
                        <Ionicons name="car" size={18} color={colors.ok} />
                        <Text style={[styles.goingText, { color: colors.ok }]}>{t.family.othersGoing(othersGoing)}</Text>
                      </View>
                    ) : (
                      <View style={[styles.goingRow, { backgroundColor: colors.dangerBg }]}>
                        <Ionicons name="alert-circle" size={18} color={colors.danger} />
                        <Text style={[styles.goingText, { color: colors.danger }]}>{t.family.nobodyGoing}</Text>
                      </View>
                    )
                  ) : null}
                  {selected.phone ? (
                    <Button
                      label={t.family.call(selected.name)}
                      icon="call"
                      kind="danger"
                      onPress={() => Linking.openURL(`tel:${selected.phone}`).catch(() => {})}
                    />
                  ) : null}
                  {iAmGoing ? (
                    <>
                      <Button label={t.family.seenButton} icon="checkmark-circle" kind="ok" busy={busy === "seen_in_person"} onPress={confirmSeen} />
                      {selected.home ? (
                        <Pressable onPress={going} style={styles.link} accessibilityRole="button">
                          <Text style={styles.linkText}>{t.family.routeAgain}</Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {selected.home ? (
                        <Button label={t.family.going} icon="navigate" kind="primary" busy={busy === "responding"} onPress={going} />
                      ) : null}
                      <Pressable onPress={confirmSeen} style={styles.link} accessibilityRole="button">
                        <Text style={styles.linkText}>{t.family.seenLink}</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              ) : selected.waiting ? null : (
                <View style={styles.actions}>
                  {selected.outageStartedAt ? (
                    <Button
                      label={t.family.reportBack}
                      icon="flash"
                      kind="secondary"
                      busy={busy === "report_power_back"}
                      onPress={() => report("report_power_back")}
                    />
                  ) : (
                    <>
                      <Button
                        label={t.family.reportOut}
                        icon="flash-off"
                        kind="primary"
                        busy={busy === "report_outage"}
                        onPress={() => report("report_outage")}
                      />
                      <Text style={styles.hint}>{t.family.reportHint(selected.name)}</Text>
                    </>
                  )}
                  <Button
                    label={t.family.ask}
                    icon="notifications"
                    kind="secondary"
                    busy={busy === "request_checkin"}
                    onPress={() => act("request_checkin")}
                  />
                </View>
              )}
            </Card>

            {needsHelp && nearby.length > 0 ? (
              <>
                <SectionTitle>{t.family.closest}</SectionTitle>
                <Card style={styles.listCard}>
                  {nearby.map((m, i) => (
                    <View key={`${m.name}-${i}`} style={[styles.personRow, i > 0 && styles.rowLine]}>
                      <View style={[styles.face, m.me && { backgroundColor: colors.me }]}>
                        <Text style={styles.faceText}>{initials(m.name)}</Text>
                      </View>
                      <View style={styles.personText}>
                        <Text style={styles.personName}>{m.me ? t.common.you : m.name}</Text>
                        <Text style={styles.meta}>
                          {m.responding ? t.family.onTheWay : m.km !== null ? travelLabel(m.km) : t.family.noLocation}
                        </Text>
                      </View>
                      {m.responding ? <Ionicons name="car" size={22} color={colors.ok} /> : null}
                    </View>
                  ))}
                </Card>
              </>
            ) : null}

            {selected.events.length > 0 ? (
              <Pressable onPress={() => setShowHistory((v) => !v)} style={styles.historyToggle} accessibilityRole="button">
                <Text style={styles.historyText}>{showHistory ? t.family.hideHistory : t.family.showHistory}</Text>
                <Ionicons name={showHistory ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
              </Pressable>
            ) : null}
            {showHistory ? (
              <Card style={styles.listCard}>
                {selected.events.slice(0, 8).map((e, i) => (
                  <View key={`${e.created_at}-${i}`} style={[styles.eventRow, i > 0 && styles.rowLine]}>
                    <Text style={styles.eventTime}>{clock(e.created_at)}</Text>
                    <Text style={styles.eventText}>{eventLabel(e.kind, e.detail?.by)}</Text>
                  </View>
                ))}
              </Card>
            ) : null}
          </>
        ) : (
          <Card>
            <Text style={styles.sub}>{offline ? t.family.offlinePull : t.family.loading}</Text>
          </Card>
        )}

        <Pressable onPress={() => router.push("/setup/family?add=1")} style={styles.link} accessibilityRole="button">
          <Text style={styles.linkMuted}>{t.family.addPerson}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  mapBox: { height: "38%" },
  offline: {
    position: "absolute",
    right: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.warnBg,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    ...shadow,
  },
  offlineText: { fontSize: font.tiny, fontWeight: "700", color: colors.warn },
  sheet: {
    flex: 1,
    marginTop: -radius.lg,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  sheetContent: { padding: space.md, gap: space.md },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line },
  chips: { gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipDot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { fontSize: font.small, fontWeight: "700", color: colors.ink },
  urgentCard: { borderWidth: 2, borderColor: colors.danger },
  who: { fontSize: font.tiny, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 1 },
  needRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: -2 },
  needText: { fontSize: font.small - 1, color: colors.muted, flex: 1 },
  goingRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10 },
  goingText: { fontSize: font.small, fontWeight: "700" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  statusIcon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  statusText: { flex: 1, gap: 4 },
  title: { fontSize: font.big, fontWeight: "800", color: colors.ink, lineHeight: 33 },
  sub: { fontSize: font.body - 1, color: colors.muted, lineHeight: 23 },
  actions: { gap: space.sm, marginTop: space.sm },
  hint: { fontSize: font.small - 1, color: colors.muted, textAlign: "center" },
  link: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 16 },
  linkText: { fontSize: font.body - 1, fontWeight: "700", color: colors.ok },
  linkMuted: { fontSize: font.small, fontWeight: "600", color: colors.muted },
  listCard: { paddingVertical: space.sm, gap: 0 },
  personRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  face: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#57534E", alignItems: "center", justifyContent: "center" },
  faceText: { color: "#fff", fontWeight: "800", fontSize: font.small },
  personText: { flex: 1, gap: 2 },
  personName: { fontSize: font.body - 1, fontWeight: "700", color: colors.ink },
  meta: { fontSize: font.small - 1, color: colors.muted },
  historyToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 6 },
  historyText: { fontSize: font.small, fontWeight: "700", color: colors.muted },
  eventRow: { flexDirection: "row", gap: space.md, paddingVertical: 9 },
  eventTime: { width: 84, fontSize: font.small - 1, color: colors.muted, fontVariant: ["tabular-nums"] },
  eventText: { flex: 1, fontSize: font.small, color: colors.ink },
});
