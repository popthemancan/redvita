import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from "react-native";
import { colors, font, radius, shadow, space, type Tone, toneColors } from "./theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

type ButtonKind = "primary" | "secondary" | "danger" | "ok";

type ButtonProps = {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

const buttonColors: Record<ButtonKind, { bg: string; fg: string }> = {
  primary: { bg: colors.ink, fg: "#fff" },
  secondary: { bg: colors.card, fg: colors.ink },
  danger: { bg: colors.danger, fg: "#fff" },
  ok: { bg: colors.ok, fg: "#fff" },
};

export function Button({ label, onPress, kind = "primary", icon, busy, disabled, style }: ButtonProps) {
  const c = buttonColors[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: c.bg, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
        kind === "secondary" && styles.secondary,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={22} color={c.fg} /> : null}
          <Text style={[styles.buttonText, { color: c.fg }]} numberOfLines={1} adjustsFontSizeToFit>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, ...input }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#A8A29E" style={styles.input} {...input} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Pill({ tone, icon, label }: { tone: Tone; icon: IconName; label: string }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Ionicons name={icon} size={16} color={c.fg} />
      <Text style={[styles.pillText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <View style={styles.errorBox}>
      <Ionicons name="alert-circle" size={20} color={colors.danger} />
      <Text style={styles.error}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 58,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: space.lg,
  },
  secondary: { borderWidth: 1.5, borderColor: colors.line },
  buttonText: { fontSize: font.body, fontWeight: "700", flexShrink: 1 },
  field: { gap: 8 },
  label: { fontSize: font.body, fontWeight: "700", color: colors.ink },
  hint: { fontSize: font.small, color: colors.muted, lineHeight: 21 },
  input: {
    minHeight: 58,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: space.md,
    fontSize: font.body + 2,
    color: colors.ink,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
    ...shadow,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillText: { fontSize: font.small, fontWeight: "700" },
  section: {
    fontSize: font.tiny,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: space.sm,
  },
  errorBox: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: colors.dangerBg,
    padding: space.md,
    borderRadius: radius.sm,
  },
  error: { color: colors.dangerDark, fontSize: font.small, fontWeight: "600", flex: 1, lineHeight: 21 },
});
