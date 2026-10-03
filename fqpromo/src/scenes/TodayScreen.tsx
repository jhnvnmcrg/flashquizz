import { AbsoluteFill } from "remotion";
import { ChevronRight, Flame, Sparkles, Target } from "lucide-react";
import { C, MODULES, type Module } from "../theme";
import { EV, SCENE } from "../timeline";
import { WARMUP_Q } from "../data/questions";
import { ease, lerp, sp } from "../components/anim";
import { STATUS_H } from "../components/Phone";
import { AppHeader, LetterTile, ModuleChip, ProgressRing, SyncPill, Tap, font, rise, type SyncState } from "../components/ui";

// Illustrative progress for the demo deck.
const STATS = [
  { pct: 37, seen: 142, of: 380, right: 78 },
  { pct: 52, seen: 205, of: 394, right: 81 },
  { pct: 64, seen: 251, of: 392, right: 84 },
  { pct: 45, seen: 168, of: 373, right: 72 },
  { pct: 29, seen: 97, of: 334, right: 69 },
  { pct: 41, seen: 133, of: 324, right: 76 },
];

const StatTile: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; style?: React.CSSProperties }> = ({
  icon,
  label,
  value,
  sub,
  style,
}) => (
  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "10px 12px", ...style }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, ...font(12.5, 700, C.muted) }}>
      {icon}
      {label}
    </div>
    <div style={{ ...font(21, 800), marginTop: 2 }}>{value}</div>
    {sub && <div style={font(11.5, 500, C.muted)}>{sub}</div>}
  </div>
);

const ModuleRow: React.FC<{ m: Module; pct: number; stats: (typeof STATS)[number]; pulse: number; style?: React.CSSProperties }> = ({
  m,
  pct,
  stats,
  pulse,
  style,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      height: 56,
      background: C.card,
      border: `1px solid ${pulse > 0.05 ? m.accent : C.border}`,
      borderRadius: 14,
      overflow: "hidden",
      paddingRight: 12,
      marginBottom: 8,
      boxShadow: `0 0 0 ${3 * pulse}px ${m.accent}33, 0 ${6 * pulse}px ${18 * pulse}px ${m.accent}33`,
      ...style,
    }}
  >
    <div style={{ width: 5, alignSelf: "stretch", background: m.accent }} />
    <ProgressRing size={38} stroke={4.5} pct={pct} color={m.accent} track={m.soft}>
      <span style={font(10.5, 800, m.accent)}>{Math.round(pct)}%</span>
    </ProgressRing>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...font(13.5, 800), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {m.id} {m.name}
      </div>
      <div style={font(11.5, 500, C.muted)}>
        {stats.seen} of {stats.of} seen, {stats.right}% right
      </div>
    </div>
    <ChevronRight size={16} color={C.muted} />
  </div>
);

const Title: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div style={style}>
    <div style={{ ...font(28, 800), letterSpacing: "-0.02em" }}>Today</div>
    <div style={font(13.5, 500, C.muted)}>Pick up where you left off</div>
  </div>
);

/** Sync pill + signal for the offline beat. */
export const offlineState = (frame: number): { sync: SyncState; signal: number; bump: number } => {
  const signal = Math.min(lerp(frame, [EV.signalLost - 2, EV.signalLost + 8], [1, 0]), 1) + lerp(frame, [EV.syncs - 4, EV.syncs + 3], [0, 1]);
  const lostAt = EV.signalLost + 5;
  const syncingAt = EV.syncs + 3;
  const syncedAt = EV.syncs + 13;
  const answeredAt = EV.tapB + 4;
  if (frame < lostAt) return { sync: { kind: "synced" }, signal, bump: -999 };
  if (frame < syncingAt) return { sync: { kind: "offline", waiting: frame >= answeredAt ? 3 : 2 }, signal, bump: frame >= answeredAt ? answeredAt : lostAt };
  if (frame < syncedAt) return { sync: { kind: "syncing" }, signal, bump: syncingAt };
  return { sync: { kind: "synced" }, signal, bump: syncedAt };
};

export const TodayScreen: React.FC<{ frame: number; variant: "modules" | "warmup" }> = ({ frame, variant }) => {
  if (variant === "warmup") return <WarmupToday frame={frame} />;

  const enter = SCENE.modules.from + 10;
  const scroll = -104 * ease(frame, EV.six - 8, 20);
  const streak = Math.round(12 * ease(frame, enter + 6, 26));
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AppHeader sync={<SyncPill state={{ kind: "synced" }} frame={frame} />} />
      <div style={{ position: "absolute", top: STATUS_H + 54, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
      <div style={{ padding: "16px 16px 0", transform: `translateY(${scroll}px)` }}>
        <Title style={rise(frame, enter)} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
          <StatTile
            style={rise(frame, enter + 3)}
            icon={<Flame size={16} color="#e0782b" fill="#f6b04a" strokeWidth={2.2} />}
            label="Streak"
            value={`${streak} days`}
          />
          <StatTile
            style={rise(frame, enter + 5)}
            icon={<Target size={16} color={C.teal} strokeWidth={2.4} />}
            label="Today"
            value="87% right"
            sub="24 answered"
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "18px 0 8px", ...rise(frame, enter + 7) }}>
          <span style={font(16, 800)}>Modules</span>
          <span style={font(12.5, 700, C.muted)}>6 modules</span>
        </div>
        {MODULES.map((m, i) => {
          const at = EV.six + i * 3;
          const pulse = Math.sin(lerp(frame, [at, at + 12], [0, 1]) * Math.PI);
          return (
            <ModuleRow
              key={m.id}
              m={m}
              stats={STATS[i]}
              pct={STATS[i].pct * ease(frame, enter + 10 + i * 4, 32)}
              pulse={pulse}
              style={{ ...rise(frame, enter + 8 + i * 3, 26), scale: `${1 + 0.035 * pulse}` }}
            />
          );
        })}
      </div>
      </div>
    </AbsoluteFill>
  );
};

const WarmupToday: React.FC<{ frame: number }> = ({ frame }) => {
  const { sync, bump } = offlineState(frame);
  const answered = frame >= EV.tapB + 1;
  const pop = sp(frame, EV.tapB + 1, { damping: 10, stiffness: 220 });
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AppHeader sync={<SyncPill state={sync} frame={frame} bump={bump} />} />
      <div style={{ position: "absolute", top: STATUS_H + 54, left: 0, right: 0, padding: "16px 16px 0" }}>
        <Title />
        <div style={{ marginTop: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={15} color={C.teal} strokeWidth={2.4} />
            <span style={font(13, 800, C.teal)}>Warm-up</span>
            <div style={{ flex: 1 }} />
            <ModuleChip {...MODULES[2]} name="Pharmacy Practice" />
          </div>
          <div style={{ ...font(15.5, 700), marginTop: 10, lineHeight: 1.35 }}>{WARMUP_Q.stem}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
            {WARMUP_Q.choices.map((ch) => {
              const isKey = ch.key === WARMUP_Q.answerKey;
              const right = answered && isKey;
              return (
                <div
                  key={ch.key}
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    height: 46,
                    padding: "0 10px",
                    borderRadius: 13,
                    background: right ? C.successSoft : C.card,
                    border: `1.5px solid ${right ? C.success : C.border}`,
                    opacity: answered && !isKey ? 0.5 : 1,
                    scale: right ? `${1 + 0.05 * Math.sin(pop * Math.PI)}` : undefined,
                  }}
                >
                  <LetterTile letter={ch.key} state={right ? "right" : "idle"} size={26} />
                  <span style={font(15, 700)}>{ch.text}</span>
                  {isKey && <Tap x="50%" y="50%" at={EV.tapB} frame={frame} />}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <StatTile icon={<Flame size={16} color="#e0782b" fill="#f6b04a" strokeWidth={2.2} />} label="Streak" value="12 days" />
          <StatTile icon={<Target size={16} color={C.teal} strokeWidth={2.4} />} label="Today" value={answered ? "88% right" : "87% right"} sub={answered ? "25 answered" : "24 answered"} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
