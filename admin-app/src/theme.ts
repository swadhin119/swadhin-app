export const COLOR_KEYS = ["accent", "accent2", "bg", "card", "card2", "line", "text", "sub"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];
export type Colors = Record<ColorKey, string>;
export const LABELS: Record<ColorKey, string> = { accent: "Main colour (buttons, highlights)", accent2: "Second colour (stars, badges)", bg: "Background", card: "Cards", card2: "Raised cards", line: "Lines / borders", text: "Text", sub: "Soft text" };
export const DEFAULT_COLORS: Colors = { bg: "#0b0b10", card: "#16161e", card2: "#1f1f2a", line: "#2a2a38", text: "#f4f4f8", sub: "#9a9ab0", accent: "#ff5a36", accent2: "#ffb020" };
export const PRESETS: { name: string; colors: Colors }[] = [
  { name: "Sunset (default)", colors: DEFAULT_COLORS },
  { name: "Ocean", colors: { bg: "#06121a", card: "#0c1f2c", card2: "#122c3d", line: "#1d3b50", text: "#eaf6ff", sub: "#8fb0c6", accent: "#18b6ff", accent2: "#5eead4" } },
  { name: "Emerald", colors: { bg: "#07120d", card: "#0e1e16", card2: "#142b20", line: "#1f3a2c", text: "#ecfdf5", sub: "#8fb5a2", accent: "#22c55e", accent2: "#facc15" } },
  { name: "Royal", colors: { bg: "#0c0a1a", card: "#161230", card2: "#1f1a42", line: "#2f2860", text: "#f3f0ff", sub: "#a39bd0", accent: "#8b5cf6", accent2: "#f472b6" } },
  { name: "Rose", colors: { bg: "#14070b", card: "#220d14", card2: "#2e121c", line: "#45202d", text: "#fff1f4", sub: "#c79aa6", accent: "#f43f5e", accent2: "#fb923c" } },
  { name: "Mono", colors: { bg: "#0a0a0a", card: "#151515", card2: "#1e1e1e", line: "#2c2c2c", text: "#f5f5f5", sub: "#a3a3a3", accent: "#e5e5e5", accent2: "#a3a3a3" } },
  { name: "Light", colors: { bg: "#f6f6fa", card: "#ffffff", card2: "#eeeef5", line: "#d9d9e6", text: "#14141c", sub: "#5c5c70", accent: "#e8451f", accent2: "#d98a00" } },
];
export const QUICK = ["#ff5a36", "#f43f5e", "#f97316", "#facc15", "#22c55e", "#14b8a6", "#18b6ff", "#3b82f6", "#8b5cf6", "#ec4899", "#e5e5e5", "#ffffff"];
export const isHex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);
const lum = (h: string) => { const n = parseInt(h.slice(1), 16); const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255); };
export const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
