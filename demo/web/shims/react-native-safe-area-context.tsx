import type { ReactNode } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

export * from "react-native-safe-area-context";

const insets = { top: 54, bottom: 34, left: 0, right: 0 };
type Edge = keyof typeof insets;

export const initialWindowMetrics = { insets, frame: { x: 0, y: 0, width: 393, height: 852 } };
export const useSafeAreaInsets = () => insets;
export const useSafeAreaFrame = () => initialWindowMetrics.frame;

export function SafeAreaView({ edges, style, children, ...rest }: ViewProps & { edges?: Edge[] | Partial<Record<Edge, string>>; children?: ReactNode }) {
  const on: Edge[] = !edges ? ["top", "bottom", "left", "right"] : Array.isArray(edges) ? edges : (Object.keys(edges) as Edge[]);
  const s = StyleSheet.flatten(style) ?? {};
  const base = (e: Edge) => {
    const side = { top: s.paddingTop, bottom: s.paddingBottom, left: s.paddingLeft, right: s.paddingRight }[e];
    const axis = e === "top" || e === "bottom" ? s.paddingVertical : s.paddingHorizontal;
    return Number(side ?? axis ?? s.padding ?? 0);
  };
  const pad: Record<string, number> = {};
  for (const e of on) pad[`padding${e[0].toUpperCase()}${e.slice(1)}`] = base(e) + insets[e];
  return (
    <View {...rest} style={[style, pad]}>
      {children}
    </View>
  );
}
