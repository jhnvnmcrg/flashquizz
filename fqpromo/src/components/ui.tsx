// Small recreations of the app's shadcn/Tailwind UI pieces, in screen (390 px) units.
import type { CSSProperties, ReactNode } from "react";
import { Bookmark, Check, RefreshCw, User, WifiOff, X } from "lucide-react";
import { C, FONT } from "../theme";
import { lerp, sp } from "./anim";
import { Logo } from "./Logo";
import { STATUS_H } from "./Phone";

export const font = (size: number, weight = 400, color: string = C.ink): CSSProperties => ({
  fontFamily: FONT,
  fontSize: size,
  fontWeight: weight,
  color,
  lineHeight: 1.3,
});

export type SyncState = { kind: "synced" } | { kind: "offline"; waiting: number } | { kind: "syncing" };

export const SyncPill: React.FC<{ state: SyncState; frame: number; spin?: number; bump?: number }> = ({ state, frame, bump = -999 }) => {
  const look = {
    synced: { bg: C.primarySoft, fg: C.primary, border: "#bfe3d2" },
    offline: { bg: C.warningSoft, fg: C.warningInk, border: "#f0d9a6" },
    syncing: { bg: C.tealSoft, fg: C.teal, border: "#b5e3e5" },
  }[state.kind];
  const pop = 1 + 0.12 * Math.sin(Math.min(1, Math.max(0, (frame - bump) / 9)) * Math.PI);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        height: 26,
        padding: "0 10px",
        borderRadius: 13,
        background: look.bg,
        border: `1px solid ${look.border}`,
        ...font(12.5, 700, look.fg),
        whiteSpace: "nowrap",
        transform: `scale(${pop})`,
      }}
    >
      {state.kind === "synced" && <Check size={14} strokeWidth={3} />}
      {state.kind === "offline" && <WifiOff size={14} strokeWidth={2.6} />}
      {state.kind === "syncing" && <RefreshCw size={13} strokeWidth={2.8} style={{ transform: `rotate(${frame * 24}deg)` }} />}
      {state.kind === "synced" && "Synced"}
      {state.kind === "offline" && `Offline, ${state.waiting} waiting`}
      {state.kind === "syncing" && "Syncing"}
    </div>
  );
};

export const AppHeader: React.FC<{ sync: ReactNode }> = ({ sync }) => (
  <div
    style={{
      position: "absolute",
      top: STATUS_H,
      left: 0,
      right: 0,
      height: 54,
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "0 16px",
      background: "rgba(246,250,251,0.94)",
      borderBottom: `1px solid ${C.border}`,
      zIndex: 20,
    }}
  >
    <Logo size={26} />
    <span style={{ ...font(18, 800), letterSpacing: "-0.025em" }}>FlashQuizz</span>
    <div style={{ flex: 1 }} />
    {sync}
    <div style={{ width: 30, height: 30, borderRadius: 15, background: "#e3e9ec", display: "grid", placeItems: "center", marginLeft: 4 }}>
      <User size={16} color={C.muted} strokeWidth={2.4} />
    </div>
  </div>
);

export type Seg = "right" | "wrong" | "current" | "todo";

export const SegmentedProgress: React.FC<{ segs: Seg[]; dark?: boolean }> = ({ segs, dark }) => (
  <div style={{ display: "flex", gap: 3 }}>
    {segs.map((s, i) => (
      <div
        key={i}
        style={{
          flex: 1,
          height: 5,
          borderRadius: 3,
          background: { right: C.success, wrong: C.destructive, current: C.teal, todo: dark ? C.darkBorder : C.border }[s],
        }}
      />
    ))}
  </div>
);

export const segments = (done: Seg[], total = 20): Seg[] => [
  ...done,
  "current",
  ...Array<Seg>(Math.max(0, total - done.length - 1)).fill("todo"),
];

/** Focus-mode session header: X, "Practice 3 of 20", bookmark, segmented progress. */
export const FocusHeader: React.FC<{ title: string; segs: Seg[] }> = ({ title, segs }) => (
  <div style={{ position: "absolute", top: STATUS_H, left: 0, right: 0, padding: "4px 16px 10px", background: C.bg, zIndex: 20 }}>
    <div style={{ display: "flex", alignItems: "center", height: 44 }}>
      <div style={{ width: 34, height: 34, borderRadius: 17, display: "grid", placeItems: "center", background: C.subtle }}>
        <X size={18} color={C.muted} strokeWidth={2.6} />
      </div>
      <div style={{ flex: 1, textAlign: "center", ...font(15, 800) }}>{title}</div>
      <div style={{ width: 34, height: 34, borderRadius: 17, display: "grid", placeItems: "center", background: C.subtle }}>
        <Bookmark size={17} color={C.muted} strokeWidth={2.4} />
      </div>
    </div>
    <SegmentedProgress segs={segs} />
  </div>
);

export const ModuleChip: React.FC<{ id: string; name: string; accent: string; soft: string }> = ({ id, name, accent, soft }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 24,
      padding: "0 10px 0 8px",
      borderRadius: 12,
      background: soft,
      ...font(12, 700, accent),
    }}
  >
    <div style={{ width: 7, height: 7, borderRadius: 4, background: accent }} />
    {id} · {name}
  </div>
);

export const LetterTile: React.FC<{ letter: string; state?: "idle" | "right" | "wrong"; size?: number }> = ({
  letter,
  state = "idle",
  size = 30,
}) => {
  const look = {
    idle: { bg: C.subtle, fg: C.muted, border: C.border },
    right: { bg: C.success, fg: "#fff", border: C.success },
    wrong: { bg: C.destructive, fg: "#fff", border: C.destructive },
  }[state];
  return (
    <div
      style={{
        width: size,
        height: size,
        flex: "none",
        borderRadius: size * 0.3,
        display: "grid",
        placeItems: "center",
        background: look.bg,
        border: `1.5px solid ${look.border}`,
        ...font(size * 0.48, 800, look.fg),
      }}
    >
      {state === "right" ? <Check size={size * 0.55} strokeWidth={3.4} /> : letter}
    </div>
  );
};

export const ProgressRing: React.FC<{
  size: number;
  stroke: number;
  pct: number;
  color: string;
  track: string;
  children?: ReactNode;
  tick?: { at: number; color: string; glow?: number };
}> = ({ size, stroke, pct, color, track, children, tick }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const th = tick ? (tick.at / 100) * 2 * Math.PI : 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", overflow: "visible" }}>
        <circle cx={cx} cy={cx} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {pct > 0.4 && (
          <circle
            cx={cx}
            cy={cx}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - Math.min(100, pct) / 100)}
          />
        )}
        {tick && (
          <line
            x1={cx + (r - stroke * 0.9) * Math.cos(th)}
            y1={cx + (r - stroke * 0.9) * Math.sin(th)}
            x2={cx + (r + stroke * 0.9) * Math.cos(th)}
            y2={cx + (r + stroke * 0.9) * Math.sin(th)}
            stroke={tick.color}
            strokeWidth={Math.max(2.5, stroke * 0.32)}
            strokeLinecap="round"
            style={{ filter: tick.glow ? `drop-shadow(0 0 ${6 * tick.glow}px ${tick.color})` : undefined }}
          />
        )}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>{children}</div>
    </div>
  );
};

/** Finger press + ripple centred on (x, y) — screen units, or "50%" to centre in the parent; `at` is the press frame. */
export const Tap: React.FC<{ x: number | string; y: number | string; at: number; frame: number }> = ({ x, y, at, frame }) => {
  const t = frame - at;
  if (t < -10 || t > 20) return null;
  const appear = lerp(t, [-10, -5], [0, 1]) * lerp(t, [9, 18], [1, 0]);
  const press = t < 0 ? lerp(t, [-4, 0], [1, 0.8]) : lerp(t, [0, 6], [0.8, 1]);
  const ring = lerp(t, [0, 16], [12, 52]);
  return (
    <div style={{ position: "absolute", left: x, top: y, zIndex: 40, pointerEvents: "none" }}>
      {t >= 0 && (
        <div
          style={{
            position: "absolute",
            left: -ring,
            top: -ring,
            width: ring * 2,
            height: ring * 2,
            borderRadius: ring,
            border: `3px solid ${C.teal}`,
            opacity: lerp(t, [0, 16], [0.55, 0]),
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          left: -17,
          top: -17,
          width: 34,
          height: 34,
          borderRadius: 17,
          background: "rgba(23,37,46,0.24)",
          border: "2.5px solid rgba(255,255,255,0.9)",
          boxShadow: "0 4px 14px rgba(23,37,46,0.25)",
          opacity: appear,
          transform: `scale(${press})`,
        }}
      />
    </div>
  );
};

export const Kbd: React.FC<{ children: ReactNode; dark?: boolean }> = ({ children, dark }) => (
  <span
    style={{
      display: "inline-grid",
      placeItems: "center",
      minWidth: 20,
      height: 20,
      padding: "0 5px",
      borderRadius: 5,
      border: `1px solid ${dark ? "rgba(255,255,255,0.35)" : "rgba(23,37,46,0.18)"}`,
      ...font(11, 700, dark ? "rgba(255,255,255,0.85)" : C.muted),
    }}
  >
    {children}
  </span>
);

/** Springy entrance helper: returns style for an element appearing at `at`. */
export const rise = (frame: number, at: number, dist = 18): CSSProperties => {
  const s = sp(frame, at, { damping: 16, stiffness: 160 });
  return { opacity: Math.min(1, s * 1.3), transform: `translateY(${(1 - s) * dist}px)` };
};
