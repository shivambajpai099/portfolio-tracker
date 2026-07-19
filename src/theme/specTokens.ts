// ---------------------------------------------------------------------------
// Spec color tokens
// ---------------------------------------------------------------------------
// Fixed palette used by the redesigned Settings and Insights screens.
// These are intentionally a self-contained dark palette (per the UI/UX spec)
// and do not affect the global theme tokens used elsewhere in the app.

export const spec = {
  BG: "#09090f", // page background
  CARD: "#13131a", // card background
  CARD2: "#1c1c26", // elevated surface (inputs, sub-cards)
  BDR: "rgba(255,255,255,0.07)", // border
  TEAL: "#00d4c8", // primary accent
  GREEN: "#22c55e", // positive / gain
  RED: "#f87171", // negative / loss
  SUB: "#80809a", // secondary text
  MUTED: "#454560", // muted / disabled text
} as const;

export type SpecColors = typeof spec;

