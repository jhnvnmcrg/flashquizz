import { Easing } from "remotion";
import { C } from "../theme";
import { EV, SCENE } from "../timeline";
import { ease, lerp, sp } from "../components/anim";
import { PHONE, Phone, SCREEN_W } from "../components/Phone";
import { CelebrationScreen } from "./CelebrationScreen";
import { FlashcardScreen } from "./FlashcardScreen";
import { PracticeScreen } from "./PracticeScreen";
import { TodayScreen, offlineState } from "./TodayScreen";

const PUSH = 14;

const SCREENS = [
  { from: SCENE.modules.from, render: (f: number) => <TodayScreen frame={f} variant="modules" /> },
  { from: SCENE.practice.from, render: (f: number) => <PracticeScreen frame={f} /> },
  { from: SCENE.flashcards.from, render: (f: number) => <FlashcardScreen frame={f} /> },
  { from: SCENE.offline.from, render: (f: number) => <TodayScreen frame={f} variant="warmup" /> },
  { from: SCENE.celebrate.from, render: (f: number) => <CelebrationScreen frame={f} />, fade: true },
];

export const PhoneLayer: React.FC<{ frame: number }> = ({ frame }) => {
  const start = SCENE.modules.from;
  const end = SCENE.end.from;
  if (frame < start - 2 || frame > end + 24) return null;

  const rise = sp(frame, start, { damping: 17, mass: 0.9, stiffness: 100 });
  const drop = lerp(frame, [end, end + 20], [0, 1], Easing.in(Easing.cubic));
  const y = PHONE.y + (1 - rise) * 1500 + drop * 1500;
  // lean in on the sync pill for the offline beat
  const zoom = 1 + 0.16 * ease(frame, SCENE.offline.from + 4, 16) - 0.16 * ease(frame, EV.syncs + 18, 14);
  const celebrating = frame >= SCENE.celebrate.from + 4;

  return (
    <Phone y={y} scale={zoom} dark={celebrating} signal={offlineState(frame).signal} screenBg={celebrating ? C.night : C.bg}>
      {SCREENS.map((s, i) => {
        const next = SCREENS[i + 1];
        if (frame < s.from - 1 || (next && frame >= next.from + PUSH + 2)) return null;
        const enter = i === 0 ? 1 : ease(frame, s.from, PUSH);
        const leave = next && !next.fade ? ease(frame, next.from, PUSH) : 0;
        const x = s.fade ? 0 : (1 - enter) * SCREEN_W - leave * SCREEN_W * 0.3;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              transform: `translateX(${x}px)`,
              opacity: s.fade ? enter : 1,
              boxShadow: enter < 1 && !s.fade ? "-12px 0 30px rgba(23,37,46,0.12)" : undefined,
            }}
          >
            {s.render(frame)}
            {leave > 0 && <div style={{ position: "absolute", inset: 0, background: `rgba(23,37,46,${0.14 * leave})` }} />}
          </div>
        );
      })}
    </Phone>
  );
};
