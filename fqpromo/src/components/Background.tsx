import { AbsoluteFill, interpolateColors } from "remotion";
import { C } from "../theme";
import { hash } from "./anim";

/** Cool paper with soft pharmacy-green/teal light and a faint dot grid; fades to the celebration night sky. */
export const Background: React.FC<{ frame: number; night: number }> = ({ frame, night }) => {
  const drift = (i: number) => Math.sin(frame / 70 + i * 2.1) * 60;
  const day = 1 - night;
  return (
    <AbsoluteFill style={{ background: interpolateColors(night, [0, 1], [C.bg, C.night]) }}>
      <AbsoluteFill
        style={{
          opacity: day,
          backgroundImage: [
            `radial-gradient(circle at ${18 + drift(0) / 20}% ${14 + drift(1) / 30}%, rgba(0,125,83,0.13), transparent 38%)`,
            `radial-gradient(circle at ${88 + drift(2) / 20}% ${30 + drift(3) / 30}%, rgba(0,134,140,0.12), transparent 36%)`,
            `radial-gradient(circle at 50% 105%, rgba(117,101,187,0.08), transparent 45%)`,
          ].join(","),
        }}
      />
      <AbsoluteFill
        style={{
          opacity: day * 0.55,
          backgroundImage: "radial-gradient(rgba(23,37,46,0.10) 1.6px, transparent 1.8px)",
          backgroundSize: "40px 40px",
          backgroundPosition: `0 ${-frame * 0.4}px`,
        }}
      />
      {night > 0 && (
        <AbsoluteFill style={{ opacity: night }}>
          <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 115%, #0d2a4a 0%, transparent 60%)" }} />
          {Array.from({ length: 90 }, (_, i) => {
            const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(frame * 0.12 + i * 1.7));
            const r = 1.2 + hash(i, 2) * 2.2;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: hash(i, 0) * 1080,
                  top: hash(i, 1) * 1920,
                  width: r * 2,
                  height: r * 2,
                  borderRadius: r,
                  background: "#dfe9ff",
                  opacity: tw * (0.4 + 0.6 * hash(i, 3)),
                }}
              />
            );
          })}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
