/**
 * @al-rayhaanat/icons — the mark, its derivatives, and the Lucide set.
 *
 * Depends only on @al-rayhaanat/tokens. Every size comes from the token scale;
 * every colour is currentColor or a semantic variable.
 *
 * RTL: directional glyphs carry `mirror: true` and flip with `dir` automatically.
 * The brand mark never mirrors.
 */
"use client";
import React from "react";

/* ── mark geometry — one petal, rotated eight times ─────────────────────── */
const OUTER = [
  "M1000.05,1815.32s380.76-310.64,0-659.49c-380.76,348.84,0,659.49,0,659.49Z",
  "M444.6,1585.24s488.89,49.58,466.33-466.33c-515.91-22.57-466.33,466.33-466.33,466.33Z",
  "M214.53,1029.79s310.64,380.76,659.49,0c-348.84-380.76-659.49,0-659.49,0Z",
  "M444.6,474.34s-49.58,488.89,466.33,466.33c22.57-515.91-466.33-466.33-466.33-466.33Z",
  "M1000.05,244.26s-380.76,310.64,0,659.49c380.76-348.84,0-659.49,0-659.49Z",
  "M1555.5,474.34s-488.89-49.58-466.33,466.33c515.91,22.57,466.33-466.33,466.33-466.33Z",
  "M1785.58,1029.79s-310.64-380.76-659.49,0c348.84,380.76,659.49,0,659.49,0Z",
  "M1555.5,1585.24s49.58-488.89-466.33-466.33c-22.57,515.91,466.33,466.33,466.33,466.33Z"
];
const INNER = [
  "M1000.05,1618.61s255.26-241.41,0-514.15c-255.26,272.74,0,514.15,0,514.15Z",
  "M583.69,1446.15s351.2,9.8,363.56-363.56c-373.36,12.36-363.56,363.56-363.56,363.56Z",
  "M411.23,1029.79s241.41,255.26,514.15,0c-272.74-255.26-514.15,0-514.15,0Z",
  "M583.69,613.43s-9.8,351.2,363.56,363.56c-12.36-373.36-363.56-363.56-363.56-363.56Z",
  "M1000.05,440.97s-255.26,241.41,0,514.15c255.26-272.74,0-514.15,0-514.15Z",
  "M1416.41,613.43s-351.2-9.8-363.56,363.56c373.36-12.36,363.56-363.56,363.56-363.56Z",
  "M1588.87,1029.79s-241.41-255.26-514.15,0c272.74,255.26,514.15,0,514.15,0Z",
  "M1416.41,1446.15s9.8-351.2-363.56-363.56c12.36,373.36,363.56,363.56,363.56,363.56Z"
];
const PETAL = OUTER[4];
const FULL_BOX = "204 234 1592 1592";
const SIMPLE_BOX = "384 414 1232 1232";

/**
 * The brand mark.
 *
 * `tone` — brand: the complete three-layer set, opaque, with the outer rank on
 *          its light-ground step so the silhouette reads on paper-white;
 *          brandTrue: the literal cream, for ink grounds and print;
 *          mono / quiet / outline: one-colour contexts, tinted by opacity.
 * `shape` — full (16 petals) · simple (8, wide core) · core. Resolved by size
 *           when omitted: sixteen petals go spiky below 20px.
 *
 * Never mirrors. Clear space is one core radius on all four sides.
 */
export function Mark({ size = 24, tone = "brand", shape, color = "var(--interactive-solid)", style, ...rest }) {
  const px = typeof size === "number" ? size : 100;
  const form = shape || (tone === "core" ? "core" : px <= 13 ? "core" : px <= 20 ? "simple" : "full");
  const layers = tone === "brandTrue"
    ? ["var(--color-motif-outer)", "var(--color-motif-inner)", "var(--color-motif-core)"]
    : tone === "brand"
      ? ["var(--color-motif-outer-on-light)", "var(--color-motif-inner)", "var(--color-motif-core)"]
      : null;
  const opacity = { mono: [1, 1, 1], quiet: [0.16, 0.34, 0.7], outline: [1, 1, 1], core: [0, 0, 1] }[tone] || [1, 1, 1];
  const paint = (i) => tone === "outline"
    ? { fill: "none", stroke: "currentColor", strokeWidth: form === "full" ? 16 : 22 }
    : { fill: layers ? layers[i] : "currentColor", fillOpacity: layers ? 1 : opacity[i] };
  return (
    <svg viewBox={form === "full" ? FULL_BOX : SIMPLE_BOX} aria-hidden="true"
      style={{ width: size, height: size, color, display: "block", pointerEvents: "none", ...style }} {...rest}>
      {form === "full" && <g {...paint(0)}>{OUTER.map((d, i) => <path key={i} d={d} />)}</g>}
      {form !== "core" && <g {...paint(1)}>{INNER.map((d, i) => <path key={i} d={d} />)}</g>}
      <circle cx="1000.05" cy="1029.79" r={form === "full" ? 212.56 : form === "simple" ? 300 : 500} {...paint(2)} />
    </svg>
  );
}

/** One petal — bullet, marker, sort caret, ornament. */
export function Petal({ size = 16, rotate = 0, opacity = 1, style }) {
  /* `size` may be a number OR any CSS length — /slides sizes its petals in `cqw`
     so they scale with the deck. Multiplying a string gives NaN, which React
     drops, leaving the petal to fall back on its intrinsic ratio. */
  const width = typeof size === "number" ? size * 0.52 : `calc(${size} * 0.52)`;
  return (
    <svg viewBox="826 238 348 672" aria-hidden="true"
      style={{ width, height: size, display: "block", pointerEvents: "none",
        transform: `rotate(${rotate}deg)`, opacity, ...style }}>
      <path d={PETAL} fill="currentColor" />
    </svg>
  );
}

/** Indeterminate work (spin) or a pending record (bloom). Honours reduced motion via the token. */
export function Spinner({ size = 20, variant = "spin", label, style }) {
  return (
    <span role="status" aria-label={label || "Loading"}
      style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-3)", ...style }}>
      <Mark size={size} tone="mono" color="var(--interactive)" style={{
        animation: `${variant === "bloom" ? "arh-bloom 1.8s" : "arh-spin 3.2s"} linear infinite`
      }} />
      {label && <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{label}</span>}
    </span>
  );
}

/* ── Lucide set — 24×24, stroked on currentColor ────────────────────────── */
const GLYPHS = {
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-up": '<path d="m18 15-6-6-6 6"/>',
  "arrow-right": '<path d="M5 12h14M12 5l7 7-7 7"/>',
  "arrow-left": '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  "arrow-up-right": '<path d="M7 17 17 7M7 7h10v10"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  "file-text": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z"/>',
  "book-open": '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.6-4.6a2 2 0 0 0-2.8 0L3 21"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M12 3v18"/>',
  layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="m6.08 11-3.5 1.6a1 1 0 0 0 0 1.81l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9a1 1 0 0 0 0-1.83L17.9 11"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 9V3h12v6"/><rect x="6" y="14" width="12" height="8"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  pencil: '<path d="M21.2 6.8a1 1 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8L2 21.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5z"/><path d="m15 5 4 4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  star: '<path d="m12 2.5 2.9 5.9 6.6.9-4.8 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.5 9.3l6.6-.9z"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  "external-link": '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  "more-horizontal": '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.1a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 2.6 14H2.5a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 2.6V2.5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.3 1z"/>',
  "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'
};

/** Directional glyphs mirror under RTL. Everything else — and the mark — does not. */
export const MIRRORED = new Set([
  "chevron-right", "chevron-left", "arrow-right", "arrow-left", "arrow-up-right",
  "external-link", "log-out", "filter"
]);

export const ICON_NAMES = Object.keys(GLYPHS);
export const ICONS = GLYPHS;

/**
 * A Lucide glyph. `aria-hidden` by default; pass `label` to make it semantic.
 *
 * `pointer-events: none` is load-bearing, not tidiness. The glyph is drawn with
 * dangerouslySetInnerHTML, so every re-render replaces its <path> nodes — and a
 * button re-renders on mousedown to paint its active state. Press exactly on a
 * stroke and the path you pressed is gone before mouseup, leaving the browser no
 * common ancestor for the two events and firing NO click at all. Taking the glyph
 * out of hit testing keeps the <button> the target for both, so the press always
 * lands. Decorative marks should never be hit targets anyway.
 * Directional glyphs flip under `dir="rtl"` unless `mirror={false}`.
 * `size` should come from the token scale — 16 beside 13–14px text, 20 in
 * buttons, 24 standalone; above 24 drop strokeWidth to 1.25.
 */
export function Icon({ name = "search", size = 20, strokeWidth = 1.5, label, mirror, style, ...rest }) {
  const flips = mirror ?? MIRRORED.has(name);
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : "true"}
      style={{ width: size, height: size, display: "block", flex: "none", pointerEvents: "none",
        ...(flips ? { transform: "scaleX(var(--icon-flip, 1))" } : null), ...style }}
      dangerouslySetInnerHTML={{ __html: GLYPHS[name] || "" }} {...rest} />
  );
}
