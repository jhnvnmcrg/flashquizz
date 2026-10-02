/**
 * A small canvas fireworks engine for the celebration overlay. Rockets rise
 * from the bottom edge and burst into sparks. Each frame is redrawn from a
 * clear, transparent canvas (sparks are streaks along their velocity), so the
 * night-sky backdrop shows through and nothing ghosts. Colours are oklch
 * module hues so a session's modules light up the sky.
 */

const ROCKET_GRAVITY = 0.12
const MAX_SPARKS = 2600

type Kind = 'peony' | 'ring' | 'willow'

type Rocket = { x: number; y: number; vx: number; vy: number; hue: number; kind: Kind }

type Spark = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  decay: number
  drag: number
  gravity: number
  width: number
  /** Streak length, in frames of travel. */
  trail: number
  color: string
  flicker: boolean
}

const GOLD = 'oklch(0.86 0.13 85)'
const rand = (min: number, max: number) => min + Math.random() * (max - min)
const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]

export class Fireworks {
  private readonly ctx: CanvasRenderingContext2D
  private rockets: Rocket[] = []
  private sparks: Spark[] = []
  private timers = new Set<number>()
  private raf = 0
  private last = 0
  private width = 0
  private height = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hues: number[],
  ) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is not available')
    this.ctx = ctx
    this.resize()
    window.addEventListener('resize', this.resize)
  }

  /** Fire one rocket that bursts at (x, y), or somewhere in the upper sky. */
  launch(x?: number, y?: number) {
    const { width: w, height: h } = this
    const tx = x ?? w * rand(0.15, 0.85)
    const ty = Math.min(y ?? h * rand(0.12, 0.42), h * 0.85)
    const sx = Math.min(Math.max(tx + rand(-0.12, 0.12) * w, w * 0.05), w * 0.95)
    const sy = h + 8
    // Reach the target at the top of the arc.
    const vy = -Math.sqrt(2 * ROCKET_GRAVITY * (sy - ty))
    const frames = -vy / ROCKET_GRAVITY
    this.rockets.push({
      x: sx,
      y: sy,
      vx: (tx - sx) / frames,
      vy,
      hue: pick(this.hues),
      kind: Math.random() < 0.18 ? 'willow' : Math.random() < 0.3 ? 'ring' : 'peony',
    })
    this.start()
  }

  /** `count` rockets spread over `spanMs`, then a closing volley. */
  show(count: number, spanMs: number, finale = 0) {
    for (let i = 0; i < count; i++) this.later(() => this.launch(), (i / count) * spanMs + rand(0, 220))
    for (let i = 0; i < finale; i++) this.later(() => this.launch(), spanMs + 300 + i * 90)
  }

  volley(count = 5) {
    for (let i = 0; i < count; i++) this.later(() => this.launch(), i * 110)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    for (const t of this.timers) window.clearTimeout(t)
    this.timers.clear()
    window.removeEventListener('resize', this.resize)
  }

  private later(fn: () => void, ms: number) {
    const id = window.setTimeout(() => {
      this.timers.delete(id)
      fn()
    }, ms)
    this.timers.add(id)
  }

  private resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.width = this.canvas.clientWidth
    this.height = this.canvas.clientHeight
    this.canvas.width = Math.round(this.width * dpr)
    this.canvas.height = Math.round(this.height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  private start() {
    if (this.raf) return
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  private burst(r: Rocket) {
    const room = MAX_SPARKS - this.sparks.length
    if (room <= 0) return
    // Bursts scale with the screen so phones and monitors both look full.
    const scale = Math.max(0.65, Math.min(this.width, this.height) / 720)
    const color = (l: number) => `oklch(${l} 0.19 ${r.hue + rand(-12, 12)})`
    const add = (s: Omit<Spark, 'x' | 'y' | 'life'>) => this.sparks.push({ ...s, x: r.x, y: r.y, life: 1 })

    if (r.kind === 'ring') {
      const n = Math.min(64, room)
      const speed = rand(3.2, 4) * scale
      const tilt = rand(0.55, 1)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        add({
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed * tilt,
          decay: rand(0.012, 0.016),
          drag: 0.965,
          gravity: 0.035,
          width: 2.2,
          trail: 4,
          color: color(0.8),
          flicker: false,
        })
      }
    } else if (r.kind === 'willow') {
      const n = Math.min(80, room)
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const speed = rand(0.6, 1) * 3.4 * scale
        add({
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          decay: rand(0.006, 0.009),
          drag: 0.975,
          gravity: 0.045,
          width: 1.6,
          trail: 10,
          color: GOLD,
          flicker: Math.random() < 0.4,
        })
      }
    } else {
      const n = Math.min(110, room)
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        // sqrt spreads sparks evenly through the sphere instead of bunching at the rim
        const speed = Math.sqrt(Math.random()) * 5.4 * scale
        add({
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          decay: rand(0.011, 0.02),
          drag: 0.955,
          gravity: 0.04,
          width: 2,
          trail: 5,
          color: color(rand(0.74, 0.88)),
          flicker: false,
        })
      }
    }
    // A pinch of white glitter in every burst.
    for (let i = 0; i < Math.min(14, MAX_SPARKS - this.sparks.length); i++) {
      const a = Math.random() * Math.PI * 2
      const speed = rand(0.5, 2.6) * scale
      add({
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        decay: rand(0.012, 0.02),
        drag: 0.95,
        gravity: 0.03,
        width: 1.6,
        trail: 0,
        color: 'oklch(0.98 0.02 90)',
        flicker: true,
      })
    }
  }

  private frame = (now: number) => {
    const dt = Math.min((now - this.last) / 16.667, 3)
    this.last = now
    const { ctx, width: w, height: h } = this

    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'

    const rockets: Rocket[] = []
    for (const r of this.rockets) {
      r.vy += ROCKET_GRAVITY * dt
      r.x += r.vx * dt
      r.y += r.vy * dt
      this.streak(r.x, r.y, r.vx, r.vy, 5, 2.4, `oklch(0.92 0.06 ${r.hue})`, 1)
      // a few embers falling off the rocket on the way up
      if (Math.random() < 0.5 * dt && this.sparks.length < MAX_SPARKS) {
        this.sparks.push({
          x: r.x,
          y: r.y,
          vx: rand(-0.4, 0.4),
          vy: rand(0.2, 0.8),
          life: 0.7,
          decay: 0.04,
          drag: 0.96,
          gravity: 0.02,
          width: 1.4,
          trail: 0,
          color: GOLD,
          flicker: true,
        })
      }
      if (r.vy >= -0.4) this.burst(r)
      else rockets.push(r)
    }
    this.rockets = rockets

    const sparks: Spark[] = []
    for (const s of this.sparks) {
      const drag = s.drag ** dt
      s.vx *= drag
      s.vy = s.vy * drag + s.gravity * dt
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.life -= s.decay * dt
      if (s.life <= 0) continue
      const alpha = s.flicker ? s.life * (Math.random() < 0.5 ? 1 : 0.25) : s.life
      this.streak(s.x, s.y, s.vx, s.vy, s.trail, s.width * (0.55 + 0.45 * s.life), s.color, alpha)
      sparks.push(s)
    }
    this.sparks = sparks

    this.raf = this.rockets.length || this.sparks.length || this.timers.size ? requestAnimationFrame(this.frame) : 0
  }

  /** A line back along the velocity; slow sparks shrink to round dots. */
  private streak(x: number, y: number, vx: number, vy: number, trail: number, width: number, color: string, alpha: number) {
    const { ctx } = this
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(x - vx * trail, y - vy * trail)
    ctx.lineTo(x + 0.01, y)
    ctx.stroke()
  }
}
