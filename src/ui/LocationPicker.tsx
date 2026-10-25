import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { t } from "@/lib/i18n";
import { getHere, type LatLng } from "@/lib/location";
import { colors, font, radius, space } from "./theme";

type Props = {
  title: string;
  hint: string;
  value: LatLng | null;
  onChange: (v: LatLng | null) => void;
};

export function LocationPicker({ title, hint, value, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  async function pick() {
    setBusy(true);
    try {
      const here = await getHere();
      setDenied(here === null);
      onChange(here);
    } catch {
      setDenied(true);
    } finally {
      setBusy(false);
    }
  }

  const done = value !== null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={pick}
      disabled={busy}
      style={({ pressed }) => [styles.box, done && styles.done, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.icon, done && { backgroundColor: colors.ok }]}>
        <Ionicons name={done ? "checkmark" : "location"} size={24} color="#fff" />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{done ? t.location.saved : busy ? t.location.finding : title}</Text>
        <Text style={styles.hint}>
          {denied ? t.location.failed : done ? t.location.again : hint}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  done: { borderColor: colors.ok, backgroundColor: colors.okBg },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.me,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: font.body, fontWeight: "700", color: colors.ink },
  hint: { fontSize: font.small, color: colors.muted, lineHeight: 20 },
});
