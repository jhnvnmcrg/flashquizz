// One clock for visuals and audio: src/data/timeline.json is written by tools/layout.py
// from the generated voiceover, so every cue below follows the narration.
import tl from "./data/timeline.json";

export const FPS = tl.fps;
export const DURATION = tl.durationInFrames;
export const fr = (sec: number) => Math.round(sec * FPS);

export type SceneId = "hook" | "modules" | "practice" | "flashcards" | "offline" | "celebrate" | "end";
export type Chunk = (typeof tl.chunks)[number];

export const CHUNKS: Chunk[] = tl.chunks;

export const SCENE = Object.fromEntries(
  tl.scenes.map((s) => [s.id, { from: fr(s.start), to: fr(s.end) }]),
) as Record<SceneId, { from: number; to: number }>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Frame at which the nth occurrence of `text` is spoken in a line. */
export const wordAt = (line: SceneId, text: string, nth = 0): number => {
  let seen = 0;
  for (const c of CHUNKS) {
    if (c.line !== line) continue;
    for (const w of c.words) {
      if (norm(w.text) === norm(text) && seen++ === nth) return fr(w.start);
    }
  }
  throw new Error(`"${text}" (#${nth}) not spoken in ${line}`);
};

export const DROP = fr(tl.music.drop);

export const EV = {
  board: wordAt("hook", "board"),
  exam: wordAt("hook", "exam"),
  season: wordAt("hook", "season"),
  meet: wordAt("hook", "meet"),
  flash: wordAt("hook", "flash"),
  six: wordAt("modules", "six"),
  tapD: wordAt("practice", "real"),
  panel: wordAt("practice", "instant"),
  mnemonic: wordAt("practice", "mnemonics"),
  tapShow: wordAt("flashcards", "flip") + 2,
  tapAgain: wordAt("flashcards", "miss") + 4,
  comesBack: wordAt("flashcards", "comes"),
  chips: [
    wordAt("flashcards", "tomorrow"),
    wordAt("flashcards", "three", 0),
    wordAt("flashcards", "week"),
    wordAt("flashcards", "three", 1),
  ],
  signalLost: wordAt("offline", "signal"),
  tapB: wordAt("offline", "jeep") + 6,
  syncs: wordAt("offline", "syncs"),
  pass: wordAt("celebrate", "pass"),
  drop: DROP,
  good: wordAt("end", "good"),
  luck: wordAt("end", "luck"),
  future: wordAt("end", "future"),
  rph: wordAt("end", "rph"),
};

/** VO speech intervals in frames, for music ducking. */
export const SPEECH = CHUNKS.map((c) => [fr(c.speechStart), fr(c.speechEnd)] as const);
