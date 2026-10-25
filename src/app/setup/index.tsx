import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { t } from "@/lib/i18n";
import type { IconName } from "@/ui/components";
import { colors, font, radius, shadow, space } from "@/ui/theme";

function Choice(props: { icon: IconName; tint: string; title: string; body: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ pressed }) => [styles.choice, pressed && { transform: [{ scale: 0.99 }], opacity: 0.92 }]}
    >
      <View style={[styles.choiceIcon, { backgroundColor: props.tint }]}>
        <Ionicons name={props.icon} size={30} color="#fff" />
      </View>
      <View style={styles.choiceText}>
        <Text style={styles.choiceTitle}>{props.title}</Text>
        <Text style={styles.choiceBody}>{props.body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color={colors.muted} />
    </Pressable>
  );
}

export default function ChooseRole() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.logo}>
          <Ionicons name="heart" size={34} color="#fff" />
        </View>
        <Text style={styles.brand}>RedVita</Text>
        <Text style={styles.lead}>{t.role.lead}</Text>

        <Text style={styles.question}>{t.role.question}</Text>
        <Choice
          icon="medkit"
          tint={colors.brand}
          title={t.role.patientTitle}
          body={t.role.patientBody}
          onPress={() => router.push("/setup/patient")}
        />
        <Choice
          icon="people"
          tint={colors.me}
          title={t.role.familyTitle}
          body={t.role.familyBody}
          onPress={() => router.push("/setup/family")}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.md, paddingTop: space.xl },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    ...shadow,
  },
  brand: { fontSize: font.huge, fontWeight: "800", color: colors.ink, letterSpacing: -1 },
  lead: { fontSize: font.body, color: colors.muted, lineHeight: 26 },
  question: { fontSize: font.title, fontWeight: "700", color: colors.ink, marginTop: space.lg },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    ...shadow,
  },
  choiceIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  choiceText: { flex: 1, gap: 4 },
  choiceTitle: { fontSize: font.body + 1, fontWeight: "700", color: colors.ink },
  choiceBody: { fontSize: font.small, color: colors.muted, lineHeight: 21 },
});
