import { useLayoutEffect, useRef } from "react";
import { FIREWORK_COLORS } from "../theme";
import { FPS } from "../timeline";
import { hash } from "./anim";

// Deterministic fireworks in the spirit of the app's celebration (module colours + gold on a
// night sky). Every particle's position is closed-form in time since its burst, so any frame
// renders the same in isolation.
export type Burst = {
  t: number; // burst frame (absolute)
  x: number;
  y: number;
  color: string;
  n: number;
  speed: number; // px/s
  life: number; // s
  kind: "peony" | "ring" | "willow";
  size: number;
  rocket: boolean;
};

export type BurstSpec = Partial<Burst> & Pick<Burst, "t" | "x" | "y">;

export const makeBursts = (salt: number, specs: BurstSpec[]): Burst[] =>
  specs.map((s, i) => ({
    color: FIREWORK_COLORS[Math.floor(hash(salt, i, 1) * FIREWORK_COLORS.length)],
    n: 72,
    speed: 430,
    life: 1.5,
    kind: (["peony", "peony", "ring", "willow"] as const)[Math.floor(hash(salt, i, 2) * 4)],
    size: 1,
    rocket: true,
    ...s,
  }));

const ROCKET_FRAMES = 16;
const GRAVITY = 260;

const pos = (v: number, k: number, g: number, t: number) => {
  const e = (1 - Math.exp(-k * t)) / k;
  return v * e + (g / k) * (t - e);
};

export const Fireworks: React.FC<{
  width: number;
  height: number;
  bursts: Burst[];
  frame: number;
  density?: number; // canvas pixels per unit
  opacity?: number;
}> = ({ width, height, bursts, frame, density = 1, opacity = 1 }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(density, 0, 0, density, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    bursts.forEach((b, bi) => {
      const dt = (frame - b.t) / FPS;

      if (b.rocket && frame < b.t && frame >= b.t - ROCKET_FRAMES) {
        const p = 1 - (b.t - frame) / ROCKET_FRAMES;
        const e = 1 - (1 - p) ** 2;
        const y0 = height + 40;
        const y = y0 + (b.y - y0) * e;
        const x = b.x + Math.sin(p * 7 + bi) * 5;
        const tail = ctx.createLinearGradient(x, y + 70 * b.size, x, y);
        tail.addColorStop(0, "rgba(255,220,160,0)");
        tail.addColorStop(1, "rgba(255,236,200,0.9)");
        ctx.strokeStyle = tail;
        ctx.lineWidth = 3 * b.size;
        ctx.beginPath();
        ctx.moveTo(x, y + 70 * b.size);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.fillStyle = "#fff7e0";
        ctx.beginPath();
        ctx.arc(x, y, 3.2 * b.size, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      if (dt < 0 || dt > b.life) return;

      if (dt < 0.12) {
        const r = 100 * b.size;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
        g.addColorStop(0, `rgba(255,255,255,${0.32 * (1 - dt / 0.12)})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);
      }

      const k = b.kind === "willow" ? 1.4 : 2.6;
      const life = b.kind === "willow" ? b.life * 1.25 : b.life;
      const fade = Math.max(0, 1 - dt / life) ** 1.4;
      for (let i = 0; i < b.n; i++) {
        const r = hash(bi * 977 + b.t, i, 3);
        const a = (i / b.n) * Math.PI * 2 + (hash(bi, i, 4) - 0.5) * 0.3;
        const speed = b.speed * b.size * (b.kind === "ring" ? 0.92 + 0.08 * r : 0.3 + 0.7 * Math.sqrt(r));
        const vx = Math.cos(a) * speed;
        const vy = Math.sin(a) * speed;
        const t0 = Math.max(0, dt - 0.1);
        const x0 = b.x + pos(vx, k, 0, t0);
        const y0 = b.y + pos(vy, k, GRAVITY, t0);
        const x1 = b.x + pos(vx, k, 0, dt);
        const y1 = b.y + pos(vy, k, GRAVITY, dt);
        const twinkle = dt > life * 0.5 ? 0.45 + 0.55 * hash(i, frame, bi) : 1;
        const alpha = fade * twinkle;
        if (alpha < 0.02) continue;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = dt < 0.08 ? "#ffffff" : b.color;
        ctx.lineWidth = 2.6 * b.size;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.fillStyle = dt < 0.25 ? "#fffbe8" : b.color;
        ctx.beginPath();
        ctx.arc(x1, y1, 1.9 * b.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
  }, [bursts, density, frame, height, width]);

  return (
    <canvas
      ref={ref}
      width={width * density}
      height={height * density}
      style={{ position: "absolute", left: 0, top: 0, width, height, opacity, pointerEvents: "none" }}
    />
  );
};
