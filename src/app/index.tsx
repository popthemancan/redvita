import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { type Role, store } from "@/lib/storage";
import { colors } from "@/ui/theme";

export default function Index() {
  const [role, setRole] = useState<Role | null | undefined>(undefined);

  useEffect(() => {
    store.getRole().then(setRole);
  }, []);

  if (role === undefined) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }
  if (role === "patient") return <Redirect href="/patient" />;
  if (role === "family") return <Redirect href="/family" />;
  return <Redirect href="/setup" />;
}
