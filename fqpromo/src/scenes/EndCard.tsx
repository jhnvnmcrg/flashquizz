import { AbsoluteFill } from "remotion";
import { C, FONT } from "../theme";
import { EV, SCENE } from "../timeline";
import { lerp, sp } from "../components/anim";
import { Logo } from "../components/Logo";

export const EndCard: React.FC<{ frame: number }> = ({ frame }) => {
  const t0 = SCENE.end.from;
  if (frame < t0) return null;
  const logo = sp(frame, t0 + 4, { damping: 11, stiffness: 120 });
  const mark = sp(frame, t0 + 9, { damping: 14, stiffness: 150 });
  const word = (at: number) => {
    const s = sp(frame, at - 2, { damping: 12, stiffness: 190, mass: 0.6 });
    return { display: "inline-block", opacity: Math.min(1, s * 1.6), transform: `translateY(${(1 - s) * 50}px) scale(${0.85 + 0.15 * s})` } as const;
  };
  return (
    <AbsoluteFill style={{ fontFamily: FONT, alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: 470,
          transform: `scale(${logo}) rotate(${(1 - logo) * -120}deg)`,
          filter: "drop-shadow(0 0 2px rgba(255,255,255,0.7)) drop-shadow(0 0 40px rgba(71,190,139,0.45))",
        }}
      >
        <Logo size={250} />
      </div>
      <div
        style={{
          position: "absolute",
          top: 760,
          fontWeight: 800,
          fontSize: 120,
          letterSpacing: "-0.035em",
          color: "#fff",
          opacity: mark,
          transform: `translateY(${(1 - mark) * 40}px)`,
        }}
      >
        FlashQuizz
      </div>
      <div style={{ position: "absolute", top: 985, textAlign: "center", fontWeight: 800, fontSize: 112, lineHeight: 1.04, letterSpacing: "-0.03em", color: "#fff" }}>
        <span style={word(EV.good)}>Good</span> <span style={word(EV.luck)}>luck,</span>
        <br />
        <span style={word(EV.future)}>future</span>{" "}
        <span style={{ ...word(EV.rph), color: C.gold, backgroundImage: "linear-gradient(transparent 62%, rgba(248,202,101,0.14) 62%)" }}>RPh!</span>
      </div>
      <div
        style={{
          position: "absolute",
          top: 1290,
          fontWeight: 700,
          fontSize: 38,
          color: C.darkMuted,
          letterSpacing: "0.01em",
          opacity: lerp(frame, [EV.rph + 6, EV.rph + 14], [0, 1]),
        }}
      >
        Flashcards · Practice · Review — works offline
      </div>
    </AbsoluteFill>
  );
};
