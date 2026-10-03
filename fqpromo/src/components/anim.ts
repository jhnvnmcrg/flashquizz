import { Easing, interpolate, spring, type SpringConfig } from "remotion";
import { FPS } from "../timeline";

/** Clamped interpolate. */
export const lerp = (frame: number, input: number[], output: number[], easing?: (t: number) => number) =>
  interpolate(frame, input, output, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

/** Spring that starts at `at` (absolute frame); 0 before it. */
export const sp = (frame: number, at: number, config: Partial<SpringConfig> = {}, durationInFrames?: number) =>
  spring({
    frame: frame - at,
    fps: FPS,
    config: { damping: 14, mass: 0.7, stiffness: 140, ...config },
    durationInFrames,
  });

/** Critically damped ease from 0 to 1 over `dur` frames — for pushes and scrolls. */
export const ease = (frame: number, at: number, dur = 14) =>
  lerp(frame, [at, at + dur], [0, 1], Easing.bezier(0.22, 1, 0.36, 1));

/** Deterministic 0..1 hash, cheaper than remotion's random() for per-particle use. */
export const hash = (a: number, b = 0, c = 0) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
