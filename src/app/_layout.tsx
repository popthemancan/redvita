import "@/lib/patient";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { setupChannels } from "@/lib/notifications";
import { colors } from "@/ui/theme";

export default function RootLayout() {
  useEffect(() => {
    setupChannels();
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "fade",
        }}
      />
    </>
  );
}
