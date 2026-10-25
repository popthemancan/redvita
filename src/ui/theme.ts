export const colors = {
  bg: "#F4F2EF",
  card: "#FFFFFF",
  ink: "#1C1917",
  muted: "#78716C",
  line: "#E7E2DC",
  subtle: "#F0EDE9",
  brand: "#B3261E",

  ok: "#15803D",
  okDark: "#0F5F2D",
  okBg: "#DCFCE7",
  warn: "#B45309",
  warnBg: "#FEF3C7",
  danger: "#DC2626",
  dangerDark: "#991B1B",
  dangerBg: "#FEE2E2",
  me: "#2563EB",
};

export const font = {
  hero: 56,
  huge: 40,
  big: 28,
  title: 22,
  body: 18,
  small: 15,
  tiny: 13,
};

export const space = { xs: 6, sm: 10, md: 16, lg: 22, xl: 32 };
export const radius = { sm: 12, md: 18, lg: 26 };

export const shadow = {
  shadowColor: "#1C1917",
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
};

export type Tone = "ok" | "warn" | "danger" | "neutral";

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  ok: { fg: colors.ok, bg: colors.okBg },
  warn: { fg: colors.warn, bg: colors.warnBg },
  danger: { fg: colors.danger, bg: colors.dangerBg },
  neutral: { fg: colors.muted, bg: colors.subtle },
};
