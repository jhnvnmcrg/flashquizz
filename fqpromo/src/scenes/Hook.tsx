import { AbsoluteFill } from "remotion";
import { C, FONT, MODULES } from "../theme";
import { EV, SCENE } from "../timeline";
import { ease, lerp, sp } from "../components/anim";
import { Logo, Pill } from "../components/Logo";

// Rest positions for the six module pills (video px, centre), then they converge into the logo.
export const PILLS = [
  { x: 250, y: 1180, r: -28 },
  { x: 450, y: 1300, r: -62 },
  { x: 650, y: 1170, r: -18 },
  { x: 850, y: 1290, r: -50 },
  { x: 330, y: 1450, r: -40 },
  { x: 740, y: 1460, r: -34 },
];
export const pillDelay = (i: number) => 2 + i * 4;

const LOGO = { x: 540, y: 860, size: 330 };

export const Hook: React.FC<{ frame: number }> = ({ frame }) => {
  const end = SCENE.modules.from + 18;
  if (frame > end) return null;

  const words: [string, number, boolean][] = [
    ["Board", EV.board, false],
    ["exam", EV.exam, false],
    ["season?", EV.season, true],
  ];
  const textOut = ease(frame, EV.meet - 6, 12);
  const converge = ease(frame, EV.meet - 9, 11);
  const join = sp(frame, EV.meet - 2, { damping: 11, stiffness: 170 });
  const logoIn = lerp(frame, [EV.meet - 3, EV.meet + 1], [0, 1]);
  const snap = Math.sin(lerp(frame, [EV.meet + 5, EV.meet + 14], [0, 1]) * Math.PI);
  const exit = ease(frame, SCENE.modules.from - 2, 16);

  return (
    <AbsoluteFill>
      {/* "Board exam season?" */}
      <div
        style={{
          position: "absolute",
          top: 330,
          left: 60,
          right: 60,
          textAlign: "center",
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 132,
          lineHeight: 1.02,
          letterSpacing: "-0.03em",
          color: C.ink,
          opacity: 1 - textOut,
          transform: `translateY(${-textOut * 80}px) scale(${1 - 0.1 * textOut})`,
        }}
      >
        {words.map(([w, at, hl], i) => {
          const s = sp(frame, at - 3, { damping: 12, stiffness: 180, mass: 0.7 });
          return (
            <span key={i}>
              <span
                style={{
                  display: "inline-block",
                  opacity: Math.min(1, s * 1.6),
                  transform: `translateY(${(1 - s) * 60}px) rotate(${(1 - s) * (i % 2 ? 6 : -6)}deg)`,
                  color: hl ? C.primary : C.ink,
                  backgroundImage: hl ? "linear-gradient(transparent 62%, rgba(0,125,83,0.14) 62%)" : undefined,
                }}
              >
                {w}
              </span>
              {i === 1 ? <br /> : " "}
            </span>
          );
        })}
      </div>

      <AbsoluteFill style={{ opacity: 1 - exit, transform: `translateY(${-exit * 620}px) scale(${1 - exit * 0.5})` }}>
        {/* six module pills drop in, then fly into the logo */}
        {converge < 1 &&
          PILLS.map((p, i) => {
            const s = sp(frame, pillDelay(i), { damping: 9, mass: 0.8, stiffness: 120 });
            const x = p.x + (LOGO.x - p.x) * converge;
            const y = -260 + (p.y + 260) * s + (LOGO.y - p.y) * converge;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: x - 95,
                  top: y - 40,
                  transform: `rotate(${p.r + (1 - s) * 80 + converge * (-45 - p.r)}deg) scale(${1 - 0.7 * converge})`,
                  opacity: 1 - converge,
                }}
              >
                <Pill w={190} color={MODULES[i].accent} />
              </div>
            );
          })}

        {/* the capsule snaps together */}
        {logoIn > 0 && (
          <div
            style={{
              position: "absolute",
              left: LOGO.x - LOGO.size / 2,
              top: LOGO.y - LOGO.size / 2,
              opacity: logoIn,
              transform: `scale(${(0.7 + 0.3 * Math.min(1, join)) * (1 + 0.08 * snap)})`,
              filter: "drop-shadow(0 30px 50px rgba(23,37,46,0.22))",
            }}
          >
            <Logo size={LOGO.size} split={(1 - join) * 18} />
          </div>
        )}
        {frame >= EV.meet + 5 &&
          Array.from({ length: 10 }, (_, i) => {
            const t = lerp(frame, [EV.meet + 5, EV.meet + 22], [0, 1]);
            const a = (i / 10) * Math.PI * 2;
            const r = 190 + 120 * t;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: LOGO.x + Math.cos(a) * r - 9,
                  top: LOGO.y + Math.sin(a) * r - 9,
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  background: MODULES[i % 6].accent,
                  opacity: 1 - t,
                  transform: `scale(${1 - 0.6 * t})`,
                }}
              />
            );
          })}

        {/* wordmark, letter by letter */}
        <div style={{ position: "absolute", top: 1080, width: "100%", textAlign: "center", fontFamily: FONT, fontWeight: 800, fontSize: 156, letterSpacing: "-0.035em", color: C.ink }}>
          {"FlashQuizz".split("").map((l, i) => {
            const s = sp(frame, EV.flash - 2 + i * 1.4, { damping: 12, stiffness: 200, mass: 0.6 });
            return (
              <span key={i} style={{ display: "inline-block", opacity: Math.min(1, s * 1.6), transform: `translateY(${(1 - s) * 50}px)` }}>
                {l}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
