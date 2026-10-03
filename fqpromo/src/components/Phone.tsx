import type { CSSProperties, ReactNode } from "react";
import { C, FONT } from "../theme";
import { lerp } from "./anim";
import { WifiOff } from "lucide-react";

// Generic phone mockup. Screens are authored at the app's mobile size (390 px wide) and
// scaled up, so the UI keeps the app's real proportions.
export const PHONE = { w: 800, h: 1700, bezel: 18, x: 140, y: 500, radius: 116 };
export const SCREEN_W = 390;
export const S = (PHONE.w - PHONE.bezel * 2) / SCREEN_W;
export const SCREEN_H = (PHONE.h - PHONE.bezel * 2) / S;
export const STATUS_H = 44;

export const StatusBar: React.FC<{ dark?: boolean; signal?: number }> = ({ dark = false, signal = 1 }) => {
  const ink = dark ? "#ffffff" : C.ink;
  const off = dark ? "rgba(255,255,255,0.28)" : "rgba(23,37,46,0.2)";
  return (
    <div
      style={{
        position: "absolute",
        inset: "0 0 auto 0",
        height: STATUS_H,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 28px 0 32px",
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: 15,
        color: ink,
        zIndex: 50,
      }}
    >
      <span>9:41</span>
      <div style={{ width: 11, height: 11, borderRadius: 6, background: "#05080a", position: "absolute", left: "50%", top: 14, marginLeft: -5.5 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <svg width={18} height={12} viewBox="0 0 18 12">
          {[0, 1, 2, 3].map((i) => {
            const lit = lerp(signal, [(3 - i) / 4, (4 - i) / 4], [0, 1]);
            return (
              <rect key={i} x={i * 4.6} y={9 - i * 3} width={3.4} height={3 + i * 3} rx={1} fill={lit > 0.5 ? ink : off} />
            );
          })}
        </svg>
        {signal > 0.35 ? (
          <svg width={16} height={12} viewBox="0 0 16 12" style={{ opacity: lerp(signal, [0.35, 0.8], [0.3, 1]) }}>
            <path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0L8 11.5Z" fill={ink} />
            <path d="M3.4 6.8a6.5 6.5 0 0 1 9.2 0l-1.5 1.5a4.4 4.4 0 0 0-6.2 0L3.4 6.8Z" fill={ink} />
            <path d="M1.1 4.5a9.8 9.8 0 0 1 13.8 0l-1.5 1.5a7.7 7.7 0 0 0-10.8 0L1.1 4.5Z" fill={ink} />
          </svg>
        ) : (
          <WifiOff size={15} color={ink} strokeWidth={2.4} />
        )}
        <div style={{ width: 25, height: 12, borderRadius: 4, border: `1.5px solid ${ink}`, padding: 1.5, opacity: 0.9 }}>
          <div style={{ width: "78%", height: "100%", borderRadius: 2, background: ink }} />
        </div>
      </div>
    </div>
  );
};

export const Phone: React.FC<{
  children: ReactNode;
  y?: number;
  scale?: number;
  dark?: boolean;
  signal?: number;
  screenBg?: string;
  style?: CSSProperties;
}> = ({ children, y = PHONE.y, scale = 1, dark, signal, screenBg = C.bg, style }) => (
  <div
    style={{
      position: "absolute",
      left: PHONE.x,
      top: y,
      width: PHONE.w,
      height: PHONE.h,
      borderRadius: PHONE.radius,
      background: "linear-gradient(160deg, #26313a 0%, #0b1014 40%, #141b20 100%)",
      boxShadow: "0 70px 140px rgba(15,23,29,0.28), 0 20px 50px rgba(15,23,29,0.18), inset 0 0 0 3px #36424b",
      transform: `scale(${scale})`,
      transformOrigin: "50% 0%",
      ...style,
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: PHONE.bezel,
        borderRadius: PHONE.radius - PHONE.bezel,
        overflow: "hidden",
        background: screenBg,
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, width: SCREEN_W, height: SCREEN_H, transform: `scale(${S})`, transformOrigin: "0 0" }}>
        {children}
        <StatusBar dark={dark} signal={signal} />
      </div>
    </div>
  </div>
);
