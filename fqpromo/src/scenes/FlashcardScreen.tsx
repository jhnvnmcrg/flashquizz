import { AbsoluteFill } from "remotion";
import { Check, RefreshCw, RotateCcw } from "lucide-react";
import { C, M4 } from "../theme";
import { EV } from "../timeline";
import { FLASH_Q as Q } from "../data/questions";
import { ease, lerp, sp } from "../components/anim";
import { STATUS_H } from "../components/Phone";
import { FocusHeader, Kbd, ModuleChip, Tap, font, rise, type Seg } from "../components/ui";

const CARD = { x: 16, y: STATUS_H + 84, w: 358, h: 318 };
const CARD_CX = CARD.x + CARD.w / 2;
const CARD_CY = CARD.y + CARD.h / 2;
const TRACK_Y = CARD.y + 196;
const CHIP_W = 80;
const CHIP_GAP = (CARD.w - CHIP_W * 4) / 3;
const chipX = (i: number) => CARD.x + i * (CHIP_W + CHIP_GAP) + CHIP_W / 2;
const TOKEN_Y = TRACK_Y - 46;
const TOKEN_SCALE = 0.24;
const LABELS = ["Tomorrow", "3 days", "1 week", "3 weeks"];

const face: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: C.card,
  border: `1.5px solid ${C.border}`,
  borderRadius: 22,
  boxShadow: "0 18px 40px rgba(23,37,46,0.10)",
  backfaceVisibility: "hidden",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

/** Where the card (or its token) sits: full size in place, then flying into the schedule track. */
const cardPose = (frame: number) => {
  const flyAt = EV.comesBack - 4;
  if (frame < flyAt) return { x: CARD_CX, y: CARD_CY, s: 1, rot: 0 };
  const [c0, c1, c2, c3] = EV.chips;
  if (frame < c0) {
    const p = ease(frame, flyAt, c0 - flyAt);
    return {
      x: CARD_CX + (chipX(0) - CARD_CX) * p,
      y: CARD_CY + (TOKEN_Y - CARD_CY) * p - 70 * Math.sin(p * Math.PI),
      s: 1 + (TOKEN_SCALE - 1) * p,
      rot: -10 * Math.sin(p * Math.PI),
    };
  }
  const hops = [c1, c2, c3];
  for (let k = hops.length - 1; k >= 0; k--) {
    const hopStart = hops[k] - 9;
    if (frame >= hopStart) {
      const p = lerp(frame, [hopStart, hops[k]], [0, 1]);
      return { x: chipX(k) + (chipX(k + 1) - chipX(k)) * p, y: TOKEN_Y - 46 * Math.sin(p * Math.PI), s: TOKEN_SCALE, rot: -12 * Math.sin(p * Math.PI) };
    }
  }
  return { x: chipX(0), y: TOKEN_Y, s: TOKEN_SCALE, rot: 0 };
};

export const FlashcardScreen: React.FC<{ frame: number }> = ({ frame }) => {
  const FLIP_FRAMES = 18;
  const flipAt = EV.tapShow + 2;
  const flip = sp(frame, flipAt, { damping: 15, mass: 0.9, stiffness: 110 }, FLIP_FRAMES);
  // Chrome rasterises 3D layers before the phone's scale-up, so only go 3D mid-flip.
  const flipping = frame >= flipAt && frame < flipAt + FLIP_FRAMES;
  const shown = frame >= flipAt + FLIP_FRAMES ? "back" : "front";
  const showButtons = lerp(frame, [EV.tapShow + 4, EV.tapShow + 10], [0, 1]);
  const again = frame >= EV.tapAgain;
  const againFlash = lerp(frame, [EV.tapAgain, EV.tapAgain + 4, EV.tapAgain + 12], [0, 1, 0]);
  const buttonsOut = lerp(frame, [EV.comesBack - 4, EV.comesBack + 4], [1, 0]);
  const track = EV.comesBack;
  const pose = cardPose(frame);
  const segs: Seg[] = ["right", "right", "wrong", "right", "current", ...Array<Seg>(15).fill("todo")];
  const currentChip = EV.chips.filter((c) => frame >= c).length - 1;

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <FocusHeader title="Flashcards 5 of 20" segs={segs} />

      {/* review schedule track, revealed as the card leaves */}
      {frame >= track - 2 && (
        <div style={{ position: "absolute", left: CARD.x, top: CARD.y + 30, width: CARD.w }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, ...rise(frame, track) }}>
            <RefreshCw size={18} color={C.teal} strokeWidth={2.6} />
            <span style={font(19, 800)}>Your deck</span>
          </div>
          <div style={{ ...font(13.5, 500, C.muted), marginTop: 4, ...rise(frame, track + 3) }}>A miss comes back on a schedule.</div>
        </div>
      )}
      {frame >= track - 2 &&
        LABELS.map((label, i) => {
          const state = i < currentChip ? "done" : i === currentChip ? "active" : "idle";
          const land = Math.sin(lerp(frame, [EV.chips[i], EV.chips[i] + 10], [0, 1]) * Math.PI);
          const look = {
            idle: { bg: C.card, border: C.border, fg: C.muted },
            active: { bg: C.tealSoft, border: C.teal, fg: C.teal },
            done: { bg: C.successSoft, border: "#b9dcc0", fg: C.success },
          }[state];
          return (
            <div
              key={label}
              style={{
                position: "absolute",
                left: chipX(i) - CHIP_W / 2,
                top: TRACK_Y,
                width: CHIP_W,
                height: 70,
                borderRadius: 16,
                background: look.bg,
                border: `2px solid ${look.border}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                ...rise(frame, track + 4 + i * 3, 24),
                scale: `${1 + 0.08 * land}`,
              }}
            >
              {state === "done" ? <Check size={16} color={C.success} strokeWidth={3.2} /> : <div style={{ width: 9, height: 9, borderRadius: 5, background: look.fg, opacity: state === "idle" ? 0.4 : 1 }} />}
              <span style={font(label.length > 7 ? 13.5 : 15, 800, state === "idle" ? C.ink : look.fg)}>{label}</span>
            </div>
          );
        })}
      {frame >= track - 2 && (
        <div
          style={{
            position: "absolute",
            left: chipX(0),
            width: chipX(3) - chipX(0),
            top: TRACK_Y + 35,
            borderTop: `2px dashed ${C.border}`,
            zIndex: -1,
            opacity: lerp(frame, [track + 6, track + 14], [0, 1]),
          }}
        />
      )}

      {/* the card */}
      <div
        style={{
          position: "absolute",
          left: pose.x - CARD.w / 2,
          top: pose.y - CARD.h / 2,
          width: CARD.w,
          height: CARD.h,
          perspective: 1400,
          transform: `scale(${pose.s}) rotate(${pose.rot}deg)`,
          zIndex: 10,
        }}
      >
        <div style={flipping ? { position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `rotateY(${flip * 180}deg)` } : { position: "absolute", inset: 0 }}>
          {(flipping || shown === "front") && (
          <div style={{ ...face, padding: 18 }}>
            <ModuleChip {...M4} />
            <div style={{ flex: 1, display: "grid", placeItems: "center", textAlign: "center", padding: "0 8px", ...font(24, 800), lineHeight: 1.3 }}>{Q.stem}</div>
            <div style={{ textAlign: "center", ...font(12.5, 600, C.muted) }}>Think of the answer, flip, then rate yourself.</div>
          </div>
          )}
          {(flipping || shown === "back") && (
          <div style={{ ...face, transform: flipping ? "rotateY(180deg)" : undefined }}>
            <div style={{ height: 30, background: C.teal, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
              <span style={{ ...font(11.5, 800, "rgba(255,255,255,0.92)"), letterSpacing: "0.14em" }}>ANSWER</span>
              {again && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, height: 20, padding: "0 8px", borderRadius: 10, background: "#fff", ...font(11.5, 800, C.destructive) }}>
                  <RotateCcw size={11} strokeWidth={3} /> Again
                </span>
              )}
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "0 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 58, height: 58, borderRadius: 15, background: C.successSoft, display: "grid", placeItems: "center", ...font(34, 800, C.success) }}>
                  {Q.answerKey}
                </div>
                <span style={{ ...font(32, 800), letterSpacing: "-0.02em" }}>{Q.answer}</span>
              </div>
              <div style={{ textAlign: "center", ...font(14.5, 500, C.muted), lineHeight: 1.45 }}>{Q.rationale}</div>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* controls */}
      <div style={{ position: "absolute", left: CARD.x, top: CARD.y + CARD.h + 18, width: CARD.w, height: 54, opacity: buttonsOut }}>
        {showButtons < 1 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 15,
              background: C.primary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              opacity: 1 - showButtons,
              ...font(16.5, 800, "#fff"),
            }}
          >
            Show answer <Kbd dark>Space</Kbd>
            <Tap x="50%" y="50%" at={EV.tapShow} frame={frame} />
          </div>
        )}
        {showButtons > 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", gap: 10, opacity: showButtons }}>
            <div
              style={{
                position: "relative",
                flex: 1,
                borderRadius: 15,
                background: againFlash > 0 ? `rgba(204,51,54,${0.12 + 0.2 * againFlash})` : C.card,
                border: `1.5px solid ${C.destructive}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                ...font(16.5, 800, C.destructive),
              }}
            >
              Again <Kbd>1</Kbd>
              <Tap x="50%" y="50%" at={EV.tapAgain} frame={frame} />
            </div>
            <div style={{ flex: 1, borderRadius: 15, background: C.success, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, ...font(16.5, 800, "#fff") }}>
              Got it <Kbd dark>2</Kbd>
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
