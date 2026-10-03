import { AbsoluteFill, Easing } from "remotion";
import { Sparkles } from "lucide-react";
import { C } from "../theme";
import { DROP, EV, SCENE } from "../timeline";
import { lerp, sp } from "../components/anim";
import { Fireworks, makeBursts } from "../components/Fireworks";
import { SCREEN_H, SCREEN_W, STATUS_H } from "../components/Phone";
import { ProgressRing, font, rise } from "../components/ui";

const out = Easing.out(Easing.cubic);
const RING_START = SCENE.celebrate.from + 10;

/** Score ring: counts to the 75% pass mark on "pass", then on to 85% exactly on the drop. */
export const scoreAt = (frame: number) =>
  frame < EV.pass ? lerp(frame, [RING_START, EV.pass], [0, 75], out) : lerp(frame, [EV.pass, DROP], [75, 85], out);

const E = SCENE.end.from;
const IN_APP = makeBursts(5, [
  { t: DROP, x: 85, y: 120, size: 0.42, n: 60 },
  { t: DROP + 2, x: 305, y: 95, size: 0.45, n: 60 },
  { t: DROP + 8, x: 200, y: 70, size: 0.38 },
  { t: DROP + 14, x: 70, y: 640, size: 0.4 },
  { t: DROP + 19, x: 320, y: 610, size: 0.42 },
  { t: DROP + 26, x: 195, y: 110, size: 0.4 },
  { t: DROP + 33, x: 300, y: 700, size: 0.38 },
  { t: E + 2, x: 100, y: 90, size: 0.4 },
]);

export const CelebrationScreen: React.FC<{ frame: number }> = ({ frame }) => {
  const pct = scoreAt(frame);
  const lit = frame >= EV.pass;
  const glow = lit ? lerp(frame, [EV.pass, EV.pass + 6, EV.pass + 30], [0, 1.6, 0.8]) : 0;
  const pulse = Math.sin(lerp(frame, [DROP, DROP + 12], [0, 1]) * Math.PI);
  const card = sp(frame, SCENE.celebrate.from + 2, { damping: 16, stiffness: 140 });
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 100%, #0d2a4a 0%, #04101e 62%)" }}>
      <Fireworks width={SCREEN_W} height={SCREEN_H} bursts={IN_APP} frame={frame} density={2.4} />
      <div
        style={{
          position: "absolute",
          top: STATUS_H + 70,
          left: 16,
          right: 16,
          background: C.darkCard,
          border: `1px solid ${C.darkBorder}`,
          borderRadius: 24,
          padding: "22px 20px 20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          boxShadow: `0 20px 60px rgba(0,0,0,0.45), 0 0 ${40 * pulse}px rgba(71,190,139,${0.35 * pulse})`,
          opacity: Math.min(1, card * 1.4),
          transform: `translateY(${(1 - card) * 40}px) scale(${0.94 + 0.06 * card})`,
        }}
      >
        <div style={{ ...font(12.5, 800, C.darkMuted), letterSpacing: "0.12em" }}>PRACTICE FINISHED</div>
        <div style={{ marginTop: 16, scale: `${1 + 0.06 * pulse}` }}>
          <ProgressRing size={176} stroke={14} pct={pct} color={C.darkPrimary} track={C.darkBorder} tick={{ at: 75, color: lit ? C.gold : "#5b6b77", glow }}>
            <div>
              <div style={{ ...font(46, 800, C.darkInk), letterSpacing: "-0.03em", lineHeight: 1 }}>{Math.round(pct)}%</div>
              <div style={{ ...font(12.5, 600, C.darkMuted), marginTop: 4 }}>{Math.round(pct / 5)} of 20 right</div>
            </div>
          </ProgressRing>
        </div>
        <div style={{ minHeight: 64, marginTop: 16 }}>
          {lit && (
            <>
              <div style={{ ...font(23, 800, C.darkInk), ...rise(frame, EV.pass + 1) }}>That's a passing score!</div>
              <div style={{ ...font(14, 500, C.darkMuted), marginTop: 4, ...rise(frame, EV.pass + 4) }}>You're above the 75% passing mark.</div>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16, width: "100%" }}>
          <div
            style={{
              flex: 1,
              height: 46,
              borderRadius: 14,
              border: `1.5px solid ${C.darkBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              ...font(14.5, 800, C.darkInk),
            }}
          >
            <Sparkles size={15} strokeWidth={2.4} /> More fireworks
          </div>
          <div style={{ flex: 1, height: 46, borderRadius: 14, background: C.darkPrimary, display: "grid", placeItems: "center", ...font(14.5, 800, C.night) }}>
            See results
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", top: 640, width: "100%", textAlign: "center", ...font(12.5, 600, C.darkMuted), opacity: lerp(frame, [DROP + 10, DROP + 20], [0, 1]) }}>
        Tap anywhere for more fireworks
      </div>
    </AbsoluteFill>
  );
};
