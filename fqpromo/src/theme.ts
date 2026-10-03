// Design tokens from the FlashQuizz repo (src/styles.css, "Clinical clean"), converted from oklch.
export const C = {
  bg: "#f6fafb",
  card: "#ffffff",
  ink: "#17252e",
  muted: "#54636d",
  border: "#dae1e4",
  subtle: "#eef3f5",
  primary: "#007d53",
  primarySoft: "#e3f3ec",
  teal: "#00868c",
  tealSoft: "#ddf3f4",
  success: "#2f8543",
  successSoft: "#e6f4e8",
  destructive: "#cc3336",
  destructiveSoft: "#fdeceb",
  warning: "#d49824",
  warningSoft: "#fdf4e1",
  warningInk: "#7a5208",
  // celebration / dark theme
  night: "#04101e",
  gold: "#f8ca65",
  darkCard: "#151f27",
  darkInk: "#ebeff2",
  darkMuted: "#9fb0bc",
  darkBorder: "#26323b",
  darkPrimary: "#47be8b",
  // logo (public/favicon.svg)
  logoInk: "#1e2a35",
  logoGreen: "#0b7f58",
} as const;

export type Module = { id: string; name: string; accent: string; soft: string; bright: string };

export const MODULES: Module[] = [
  { id: "M1", name: "Pharmaceutical Chemistry", accent: "#7565bb", soft: "#f2f0ff", bright: "#a99bf0" },
  { id: "M2", name: "Biochemistry & Pharmacognosy", accent: "#51852f", soft: "#ebf7e4", bright: "#8fd16a" },
  { id: "M3", name: "Pharmacy Practice", accent: "#0084a9", soft: "#dff7ff", bright: "#4fc3e8" },
  { id: "M4", name: "Pharmacology & Toxicology", accent: "#b4514c", soft: "#ffece9", bright: "#f08a84" },
  { id: "M5", name: "Pharmaceutics, Manufacturing & Jurisprudence", accent: "#a06700", soft: "#fef0de", bright: "#f2b54a" },
  { id: "M6", name: "Microbiology, QA/QC & Analysis", accent: "#a5538c", soft: "#ffecf8", bright: "#e58ccf" },
];

export const M4 = MODULES[3];

export const FIREWORK_COLORS = [...MODULES.map((m) => m.bright), C.gold, C.gold, "#ffffff", C.darkPrimary];

export const FONT = '"Atkinson Hyperlegible Next Variable", "Segoe UI", system-ui, sans-serif';

export const W = 1080;
export const H = 1920;
