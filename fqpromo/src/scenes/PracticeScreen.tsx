import { AbsoluteFill } from "remotion";
import { Check, Lightbulb } from "lucide-react";
import { C, M4 } from "../theme";
import { EV } from "../timeline";
import { PRACTICE_Q as Q } from "../data/questions";
import { ease, lerp, sp } from "../components/anim";
import { STATUS_H } from "../components/Phone";
import { FocusHeader, LetterTile, ModuleChip, Tap, font, type Seg } from "../components/ui";

/** Dashed "perforated" divider with notches, as on the app's dispensing-label answer panel. */
const Perforation = () => (
  <div style={{ position: "relative", height: 16 }}>
    <div style={{ position: "absolute", left: 16, right: 16, top: 7, borderTop: `2px dashed ${C.border}` }} />
    {[-9, null].map((l, i) => (
      <div
        key={i}
        style={{
          position: "absolute",
          top: -1,
          left: l ?? undefined,
          right: l === null ? -9 : undefined,
          width: 18,
          height: 18,
          borderRadius: 9,
          background: C.bg,
          border: `1.5px solid ${C.border}`,
        }}
      />
    ))}
  </div>
);

export const PracticeScreen: React.FC<{ frame: number }> = ({ frame }) => {
  const answered = frame >= EV.tapD + 1;
  const bounce = Math.sin(sp(frame, EV.tapD + 1, { damping: 12, stiffness: 220 }) * Math.PI);
  const panel = sp(frame, EV.panel, { damping: 18, stiffness: 110 });
  const remember = sp(frame, EV.mnemonic - 4, { damping: 16, stiffness: 150 });
  const scroll = -290 * ease(frame, EV.panel - 2, 18) - 60 * ease(frame, EV.mnemonic - 6, 16);
  const segs: Seg[] = ["right", "right", answered ? "right" : "current", ...Array<Seg>(17).fill("todo")];

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <FocusHeader title="Practice 3 of 20" segs={segs} />
      <div style={{ position: "absolute", top: STATUS_H + 63, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 13, left: 16, right: 16, transform: `translateY(${scroll}px)` }}>
        <ModuleChip {...M4} />
        <div style={{ ...font(19.5, 700), marginTop: 12, lineHeight: 1.35 }}>
          {Q.stem[0]}
          <b style={{ fontWeight: 800 }}>{Q.stem[1]}</b>
          {Q.stem[2]}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 16 }}>
          {Q.choices.map((ch) => {
            const isKey = ch.key === Q.answerKey;
            const right = answered && isKey;
            return (
              <div
                key={ch.key}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  minHeight: 54,
                  padding: "8px 12px",
                  borderRadius: 14,
                  background: right ? C.successSoft : C.card,
                  border: `1.5px solid ${right ? C.success : C.border}`,
                  opacity: answered && !isKey ? 0.5 : 1,
                  scale: isKey ? `${1 + 0.04 * bounce}` : undefined,
                }}
              >
                <LetterTile letter={ch.key} state={right ? "right" : "idle"} />
                <div>
                  <div style={font(16, 700)}>{ch.text}</div>
                  {right && <div style={font(11.5, 800, C.success)}>Correct answer</div>}
                </div>
                {isKey && <Tap x="50%" y="50%" at={EV.tapD} frame={frame} />}
              </div>
            );
          })}
        </div>

        {panel > 0.01 && (
          <div
            style={{
              marginTop: 16,
              background: C.card,
              borderRadius: 18,
              border: `1.5px solid ${C.border}`,
              overflow: "hidden",
              boxShadow: "0 12px 30px rgba(23,37,46,0.08)",
              opacity: Math.min(1, panel * 1.4),
              transform: `translateY(${(1 - panel) * 70}px)`,
            }}
          >
            <div style={{ height: 34, background: C.success, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px" }}>
              <span style={{ ...font(11.5, 800, "rgba(255,255,255,0.92)"), letterSpacing: "0.14em" }}>ANSWER</span>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  height: 22,
                  padding: "0 9px",
                  borderRadius: 11,
                  background: "#fff",
                  ...font(12, 800, C.success),
                }}
              >
                <Check size={13} strokeWidth={3.2} /> You got it
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 14px 12px" }}>
              <div style={{ width: 54, height: 54, borderRadius: 14, background: C.successSoft, display: "grid", placeItems: "center", ...font(32, 800, C.success) }}>
                D
              </div>
              <div style={font(18, 800)}>Decreased renal blood flow</div>
            </div>
            <Perforation />
            <div style={{ padding: "8px 14px 14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                {Q.rationale.map((row, r) =>
                  row.map((cell, c) => (
                    <div
                      key={`${r}-${c}`}
                      style={{
                        padding: "5px 0",
                        borderTop: r > 0 ? `1px solid ${C.border}` : undefined,
                        ...(r === 0 ? font(11.5, 800, C.muted) : font(13.5, 600)),
                        opacity: lerp(frame, [EV.panel + 6 + r * 3, EV.panel + 12 + r * 3], [0, 1]),
                      }}
                    >
                      {cell}
                    </div>
                  )),
                )}
              </div>
              {remember > 0.01 && (
                <div
                  style={{
                    marginTop: 12,
                    borderRadius: 14,
                    background: C.warningSoft,
                    border: "1.5px solid #efd193",
                    padding: "10px 12px",
                    opacity: Math.min(1, remember * 1.5),
                    transform: `translateY(${(1 - remember) * 24}px)`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, ...font(12.5, 800, C.warningInk) }}>
                    <Lightbulb size={15} strokeWidth={2.6} /> Remember
                  </div>
                  <div style={{ display: "flex", gap: 2, marginTop: 2 }}>
                    {Q.mnemonic.split("").map((l, i) => {
                      const s = sp(frame, EV.mnemonic + 2 + i * 2.5, { damping: 9, stiffness: 220, mass: 0.6 });
                      return (
                        <span
                          key={i}
                          style={{
                            display: "inline-block",
                            ...font(30, 800, C.warningInk),
                            letterSpacing: "0.04em",
                            opacity: Math.min(1, s * 2),
                            transform: `translateY(${(1 - s) * 12}px) scale(${0.4 + 0.6 * s})`,
                          }}
                        >
                          {l}
                        </span>
                      );
                    })}
                  </div>
                  <div style={{ ...font(11.5, 600, "#8a6a2a"), opacity: lerp(frame, [EV.mnemonic + 20, EV.mnemonic + 28], [0, 1]) }}>
                    {Q.mnemonicExpansion}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </div>
    </AbsoluteFill>
  );
};
