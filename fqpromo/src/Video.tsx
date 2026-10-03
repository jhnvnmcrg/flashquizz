import { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame } from "remotion";
import { Background } from "./components/Background";
import { Caption } from "./components/Caption";
import { Fireworks, makeBursts } from "./components/Fireworks";
import { lerp } from "./components/anim";
import { EndCard } from "./scenes/EndCard";
import { Hook } from "./scenes/Hook";
import { PhoneLayer } from "./scenes/PhoneLayer";
import { Soundtrack } from "./Soundtrack";
import { FONT, H, W } from "./theme";
import { DROP, SCENE } from "./timeline";

const E = SCENE.end.from;

// Full-frame sky: a volley on the drop, then a steady show behind the end card.
const SKY = makeBursts(11, [
  { t: DROP, x: 270, y: 330, size: 1.25, n: 90, kind: "peony" },
  { t: DROP, x: 820, y: 290, size: 1.2, n: 90, kind: "ring" },
  { t: DROP + 3, x: 545, y: 170, size: 1.0 },
  { t: DROP + 9, x: 100, y: 780, size: 0.9 },
  { t: DROP + 13, x: 985, y: 720, size: 0.9 },
  { t: DROP + 18, x: 400, y: 120, size: 0.95 },
  { t: DROP + 24, x: 720, y: 430, size: 1.0 },
  { t: DROP + 30, x: 150, y: 300, size: 0.9 },
  { t: DROP + 36, x: 950, y: 220, size: 1.0 },
  { t: E + 2, x: 210, y: 330, size: 1.1 },
  { t: E + 8, x: 880, y: 400 },
  { t: E + 16, x: 540, y: 1520, size: 1.1 },
  { t: E + 24, x: 170, y: 1380 },
  { t: E + 31, x: 910, y: 1440 },
  { t: E + 38, x: 330, y: 190 },
  { t: E + 45, x: 770, y: 180 },
  { t: E + 53, x: 140, y: 1640 },
  { t: E + 60, x: 930, y: 1250 },
  { t: E + 67, x: 540, y: 250, size: 1.2 },
  { t: E + 74, x: 260, y: 1520 },
]);

export const Video: React.FC = () => {
  const frame = useCurrentFrame();
  const [handle] = useState(() => delayRender("Loading Atkinson Hyperlegible Next"));
  useEffect(() => {
    Promise.all([400, 500, 600, 700, 800].map((w) => document.fonts.load(`${w} 40px "Atkinson Hyperlegible Next Variable"`)))
      .then(() => continueRender(handle))
      .catch(() => continueRender(handle));
  }, [handle]);

  const night = lerp(frame, [DROP - 14, DROP + 2], [0, 1]);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, overflow: "hidden" }}>
      <Background frame={frame} night={night} />
      <Fireworks width={W} height={H} bursts={SKY} frame={frame} />
      <Hook frame={frame} />
      <PhoneLayer frame={frame} />
      <Caption frame={frame} night={night} />
      <EndCard frame={frame} />
      <AbsoluteFill style={{ background: "#fff", opacity: lerp(frame, [DROP, DROP + 1, DROP + 7], [0, 0.32, 0]), pointerEvents: "none" }} />
      <Soundtrack />
    </AbsoluteFill>
  );
};
