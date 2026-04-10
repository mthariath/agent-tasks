import { SyntaxStyle } from "@opentui/core";

export const COLORS = {
  background: "#0e1116",
  shell: "#12161d",
  panel: "#171c25",
  panelMuted: "#131821",
  panelElevated: "#1c2430",
  panelInset: "#10151d",
  dialogSurface: "#151b24",
  dialogHeader: "#111722",
  dialogFooter: "#111722",
  dialogField: "#10151d",
  dialogRow: "#151c25",
  dialogSelected: "#202a38",
  dialogBorder: "#3c4b5f",
  dialogDivider: "#243243",
  border: "#334155",
  borderMuted: "#253244",
  text: "#e7edf7",
  textMuted: "#93a4b8",
  textDim: "#64748b",
  accent: "#8bc3ff",
  accentStrong: "#4ea1ff",
  success: "#5fd3a0",
  warning: "#efc661",
  danger: "#ff7b72",
  focus: "#7ac2ff",
  overlay: "#090b0f",
  overlayMuted: "#0b0f14",
  chipText: "#0b0f14",
  selected: "#253a54",
  selectedBorder: "#4ea1ff"
} as const;

export const STATUS_COLORS: Record<string, string> = {
  backlog: "#718096",
  ready: "#56a8ff",
  in_progress: "#f0c25f",
  blocked: "#ff8478",
  in_review: "#c392ff",
  done: "#61d4a5"
};

export interface StatusTone {
  fg: string;
  bg: string;
  border: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const full = normalized.length === 3
    ? normalized.split("").map((char) => `${char}${char}`).join("")
    : normalized;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16)
  ];
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function mix(hexA: string, hexB: string, weight: number): string {
  const [redA, greenA, blueA] = hexToRgb(hexA);
  const [redB, greenB, blueB] = hexToRgb(hexB);
  const ratio = Math.max(0, Math.min(1, weight));

  return rgbToHex(
    Math.round(redA * (1 - ratio) + redB * ratio),
    Math.round(greenA * (1 - ratio) + greenB * ratio),
    Math.round(blueA * (1 - ratio) + blueB * ratio)
  );
}

export function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? COLORS.border;
}

export function statusTone(status: string): StatusTone {
  const color = statusColor(status);
  return {
    fg: color,
    bg: mix(COLORS.panelInset, color, 0.22),
    border: mix(COLORS.border, color, 0.55)
  };
}

export const markdownSyntaxStyle = SyntaxStyle.fromTheme([
  { scope: ["text"], style: { foreground: COLORS.text } },
  { scope: ["heading"], style: { foreground: COLORS.accent, bold: true } },
  { scope: ["string"], style: { foreground: "#c6e48b" } },
  { scope: ["keyword"], style: { foreground: "#ffb074", bold: true } },
  { scope: ["comment"], style: { foreground: COLORS.textDim, italic: true } },
  { scope: ["link"], style: { foreground: COLORS.accent, underline: true } },
  { scope: ["code"], style: { foreground: "#d2a8ff" } },
  { scope: ["concealer"], style: { foreground: COLORS.textDim } }
]);
