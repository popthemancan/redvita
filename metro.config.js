const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

if (process.env.EXPO_PUBLIC_DEMO === "1") {
  const shims = path.join(__dirname, "demo", "web", "shims");
  const deviceApis = path.join(shims, "device-apis.ts");
  const swap = {
    "expo-notifications": path.join(shims, "expo-notifications.ts"),
    "expo-secure-store": deviceApis,
    "expo-location": deviceApis,
    "expo-battery": deviceApis,
    "expo-task-manager": deviceApis,
    "expo-background-task": deviceApis,
    "expo-device": deviceApis,
    "expo-keep-awake": deviceApis,
    "react-native-webview": path.join(shims, "react-native-webview.tsx"),
    "react-native-safe-area-context": path.join(shims, "react-native-safe-area-context.tsx"),
  };
  const next = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, name, platform) => {
    const target = swap[name];
    if (platform === "web" && target && context.originModulePath !== target) {
      return { type: "sourceFile", filePath: target };
    }
    return next ? next(context, name, platform) : context.resolveRequest(context, name, platform);
  };
}

module.exports = config;
