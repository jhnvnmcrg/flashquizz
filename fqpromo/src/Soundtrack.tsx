import { Html5Audio, Sequence, staticFile } from "remotion";
import { lerp } from "./components/anim";
import { DROP, EV, SCENE, SPEECH, CHUNKS, fr } from "./timeline";
import { pillDelay, PILLS } from "./scenes/Hook";

const MUSIC_BASE = 0.55;
const MUSIC_DUCKED = 0.25;

/** Music ducks under the voice with 6-frame ramps, but is let through for the drop. */
const musicVolume = (f: number) => {
  let duck = 0;
  for (const [s, e] of SPEECH) duck = Math.max(duck, lerp(f, [s - 6, s, e, e + 6], [0, 1, 1, 0]));
  const v = MUSIC_BASE - (MUSIC_BASE - MUSIC_DUCKED) * duck;
  return f >= DROP - 2 && f < DROP + 24 ? Math.max(v, 0.55) : v;
};

const E = SCENE.end.from;

const SFX: [frame: number, name: string, volume: number][] = [
  ...PILLS.map((_, i) => [pillDelay(i) + 9, "pop", 0.45] as [number, string, number]),
  [EV.meet + 4, "sparkle", 0.45],
  [SCENE.modules.from, "swoosh-up", 0.55],
  [SCENE.practice.from, "whoosh", 0.3],
  [EV.tapD, "tap", 0.7],
  [EV.tapD + 2, "ding", 0.42],
  [EV.panel, "swoosh-up", 0.3],
  ...Array.from({ length: 7 }, (_, i) => [Math.round(EV.mnemonic + 2 + i * 2.5), "pop", 0.32] as [number, string, number]),
  [SCENE.flashcards.from, "whoosh", 0.3],
  [EV.tapShow, "tap", 0.7],
  [EV.tapShow + 3, "whoosh", 0.5],
  [EV.tapAgain, "tap", 0.7],
  [EV.comesBack - 4, "swoosh-up", 0.4],
  ...EV.chips.map((c) => [c, "pop", 0.5] as [number, string, number]),
  [SCENE.offline.from, "whoosh", 0.3],
  [EV.signalLost + 5, "offline", 0.55],
  [EV.tapB, "tap", 0.7],
  [EV.tapB + 2, "ding", 0.35],
  [EV.syncs + 13, "online", 0.55],
  [SCENE.celebrate.from, "whoosh", 0.3],
  [EV.pass, "sparkle", 0.55],
  [DROP, "boom", 0.9],
  [DROP + 9, "boom", 0.35],
  [DROP + 18, "boom", 0.4],
  [DROP + 30, "boom", 0.35],
  [E + 2, "boom", 0.35],
  [E + 16, "boom", 0.3],
  [E + 31, "boom", 0.3],
  [E + 45, "boom", 0.28],
  [E + 67, "boom", 0.3],
];

export const Soundtrack: React.FC = () => (
  <>
    <Html5Audio src={staticFile("audio/music.wav")} volume={musicVolume} />
    {CHUNKS.map((c) => (
      <Sequence key={c.file} from={fr(c.clipStart)} layout="none">
        <Html5Audio src={staticFile(c.file)} volume={1} />
      </Sequence>
    ))}
    {SFX.map(([f, name, v], i) => (
      <Sequence key={i} from={f} layout="none">
        <Html5Audio src={staticFile(`audio/sfx/${name}.wav`)} volume={v} />
      </Sequence>
    ))}
  </>
);
