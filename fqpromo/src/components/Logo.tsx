import type { CSSProperties } from "react";
import { C, FONT } from "../theme";

/** Two-tone capsule mark from public/favicon.svg; `split` pulls the halves apart along the capsule. */
export const Logo: React.FC<{ size: number; split?: number; style?: CSSProperties }> = ({ size, split = 0, style }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" style={{ overflow: "visible", ...style }}>
    <g transform="rotate(-45 16 16)">
      <path
        d="M16 10h-7a6 6 0 0 0 0 12h7z"
        transform={`translate(${-split} 0)`}
        fill="#fff"
        stroke={C.logoInk}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path
        d="M16 10h7a6 6 0 0 1 0 12h-7z"
        transform={`translate(${split} 0)`}
        fill={C.logoGreen}
        stroke={C.logoInk}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </g>
  </svg>
);

export const Wordmark: React.FC<{ size: number; color?: string; style?: CSSProperties }> = ({ size, color = C.ink, style }) => (
  <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: size, letterSpacing: "-0.025em", color, lineHeight: 1, ...style }}>
    FlashQuizz
  </span>
);

/** A module-coloured capsule — the hook's "pills" that snap into the logo. */
export const Pill: React.FC<{ w: number; color: string; style?: CSSProperties }> = ({ w, color, style }) => {
  const h = w * 0.42;
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: h / 2,
        overflow: "hidden",
        display: "flex",
        border: `${Math.max(3, w * 0.035)}px solid ${C.logoInk}`,
        boxShadow: "0 18px 40px rgba(23,37,46,0.18)",
        ...style,
      }}
    >
      <div style={{ flex: 1, background: "#fff" }} />
      <div style={{ width: Math.max(3, w * 0.03), background: C.logoInk }} />
      <div style={{ flex: 1, background: color }} />
    </div>
  );
};
