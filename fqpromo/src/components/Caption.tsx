import { interpolateColors } from "remotion";
import { C, FONT } from "../theme";
import { CHUNKS, SCENE, fr, type SceneId } from "../timeline";
import { lerp, sp } from "./anim";

// Kinetic headline captions for the middle scenes (the hook and end card set their own type).
const LINES: SceneId[] = ["modules", "practice", "flashcards", "offline", "celebrate"];

type Word = { text: string; hl: boolean; at: number };

/**
 * "*Six modules.* One app." → words with highlight flags. Each word is timed to its spoken
 * word when the caption and TTS have the same word count, otherwise spread by length.
 */
const parse = (caption: string, start: number, end: number, spoken: number[]): Word[] => {
  const words: { text: string; hl: boolean }[] = [];
  let hl = false;
  let cur = "";
  let curHl = false;
  for (const ch of caption) {
    if (ch === "*") {
      hl = !hl;
      if (cur === "") curHl = hl;
      continue;
    }
    if (ch === " ") {
      if (cur) words.push({ text: cur, hl: curHl });
      cur = "";
      curHl = hl;
      continue;
    }
    if (cur === "") curHl = hl;
    cur += ch;
  }
  if (cur) words.push({ text: cur, hl: curHl });
  if (spoken.length === words.length) return words.map((w, i) => ({ ...w, at: spoken[i] - 2 }));
  const weights = words.map((w) => w.text.length + 2);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  return words.map((w, i) => {
    const at = start + (end - start) * 0.85 * (acc / total);
    acc += weights[i];
    return { ...w, at };
  });
};

const CAPS = (() => {
  const chunks = CHUNKS.filter((c) => LINES.includes(c.line as SceneId));
  return chunks.map((c, i) => {
    const show = fr(c.speechStart) - 3;
    const next = chunks[i + 1];
    const hide = next ? fr(next.speechStart) - 3 : SCENE.end.from;
    return { show, hide, words: parse(c.caption, fr(c.speechStart) - 2, fr(c.speechEnd), c.words.map((w) => fr(w.start))) };
  });
})();

export const Caption: React.FC<{ frame: number; night: number }> = ({ frame, night }) => {
  const cap = CAPS.find((c) => frame >= c.show && frame < c.hide);
  if (!cap) return null;
  const ink = interpolateColors(night, [0, 1], [C.ink, "#ffffff"]);
  const accent = interpolateColors(night, [0, 1], [C.primary, C.gold]);
  const marker = night > 0.5 ? "rgba(248,202,101,0.2)" : "rgba(0,125,83,0.13)";
  const exit = lerp(frame, [cap.hide - 5, cap.hide], [0, 1]);
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 150,
        top: 150,
        height: 320,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        opacity: 1 - exit,
        transform: `translateY(${-exit * 18}px)`,
      }}
    >
      <div style={{ textAlign: "center", fontFamily: FONT, fontWeight: 800, fontSize: 74, lineHeight: 1.08, letterSpacing: "-0.02em", color: ink }}>
        {cap.words.map((w, i) => {
          const s = sp(frame, w.at, { damping: 15, stiffness: 190, mass: 0.6 });
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                marginRight: "0.24em",
                opacity: Math.min(1, s * 1.5),
                transform: `translateY(${(1 - s) * 30}px) scale(${0.9 + 0.1 * s})`,
                color: w.hl ? accent : ink,
                backgroundImage: w.hl ? `linear-gradient(transparent 60%, ${marker} 60%)` : undefined,
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};
