/**
 * @al-rayhaanat/slides — one source of truth for decks.
 *
 * Depends on @al-rayhaanat/tokens, /icons, /ui, /charts.
 *
 * Three deliverables, per §3.11, and they are deliberately in this order:
 *
 *   1. HTML deck theme (this file) — the only route to true visual parity with
 *      the web, because it IS the web. Use it for decks that matter.
 *   2. pptxgenjs helpers (`buildDeck` below + dist/pptx.theme.js, generated from
 *      brand.json by Style Dictionary) — for decks a service generates.
 *   3. The .potx template — for decks a person authors in PowerPoint. It is a
 *      binary artifact that must be built once in PowerPoint from the spec in
 *      POTX.md; nothing generates it from tokens, so it is the one place the
 *      system can drift. Re-check it whenever brand.json changes.
 *
 * Every slide here is a 16:9 container-query context, so the same component reads
 * correctly full-screen at 1920×1080, as a thumbnail, and on a printed handout.
 * Sizes are in cqw — never px, never vw.
 */
"use client";
import React from "react";
import { Mark, Petal, Icon } from "@al-rayhaanat/icons";
import { BarChart, LineChart, DonutChart, SERIES } from "@al-rayhaanat/charts";

const INK = "var(--color-sand-950)";

/** The frame every slide sits in. `tone`: paper | ink. */
export function Slide({ tone = "paper", pad = "8cqw", align = "center", lang, dir, children, style, ...rest }) {
  const ink = tone === "ink";
  const arabic = dir === "rtl" || lang === "ar";
  return (
    <section lang={lang} dir={dir} style={{
      /* border-box, or `aspect-ratio` resolves against the CONTENT box and the
         16:9 promise is broken by `pad` — a cover slide renders near 2.26:1, and
         the on-screen deck stops matching what buildDeck() exports. */
      boxSizing: "border-box",
      aspectRatio: "16 / 9", containerType: "size", position: "relative", overflow: "hidden",
      display: "grid", alignContent: align, paddingInline: pad,
      background: ink ? INK : "var(--canvas)",
      color: ink ? "var(--color-sand-100)" : "var(--text-primary)",
      fontFamily: "var(--font-body)",
      /* Arabic slides: redefine the family tokens here rather than on each child,
         and lift the display leading to the Naskh floor — the cqw line-heights
         below (1.02–1.18) are far under it. */
      ...(arabic ? {
        "--font-display": "var(--font-arabic)",
        "--font-body": "var(--font-arabic)",
        "--slide-lead-display": "var(--leading-ar-floor, 1.45)",
        "--slide-lead-body": "var(--leading-ar-base, 1.84)"
      } : null),
      ...style
    }} {...rest}>{children}</section>
  );
}

const kicker = ink => ({
  fontFamily: "var(--font-display)", fontSize: "1.4cqw", letterSpacing: "var(--tracking-kicker)",
  textTransform: "uppercase", fontFeatureSettings: "'tnum'",
  color: ink ? "var(--color-crimson-300)" : "var(--interactive)"
});

/** Cover. The mark at 12cqw, the title at 7cqw, and nothing else. */
export function SlideCover({ kicker: k, title, meta, tone = "paper", ...rest }) {
  const ink = tone === "ink";
  return (
    <Slide tone={tone} {...rest}>
      <Mark size="12cqw" tone={ink ? "brandTrue" : "brand"} style={{ marginBlockEnd: "3cqw" }} />
      {k && <div style={kicker(ink)}>{k}</div>}
      <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "7cqw",
        lineHeight: "var(--slide-lead-display, 1.02)", letterSpacing: "-0.015em", margin: "1.4cqw 0 0" }}>{title}</h1>
      {meta && <div style={{ fontSize: "1.5cqw", marginBlockStart: "2.4cqw", opacity: 0.7 }}>{meta}</div>}
    </Slide>
  );
}

/** Section divider. Ink ground, mark ghosted at the corner under 24% value. */
export function SlideDivider({ numeral, title, note, ...rest }) {
  return (
    <Slide tone="ink" {...rest}>
      <Mark size="42cqw" tone="quiet" color="var(--color-crimson-300)"
        style={{ position: "absolute", insetInlineEnd: "-6cqw", insetBlockStart: "-13cqw", opacity: 0.5 }} />
      <div style={{ display: "flex", alignItems: "center", gap: "1.4cqw", ...kicker(true) }}>
        <Mark size="2.2cqw" tone="quiet" color="var(--color-crimson-300)" />{numeral}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "7cqw",
        lineHeight: "var(--slide-lead-display, 1.02)", marginBlockStart: "2.2cqw" }}>{title}</div>
      {note && (
        <>
          <div style={{ blockSize: 1, inlineSize: "20cqw", marginBlock: "2.8cqw 1.8cqw",
            background: "color-mix(in srgb, var(--color-crimson-300) 45%, transparent)" }} />
          <div style={{ fontSize: "1.5cqw", lineHeight: "var(--slide-lead-body, 1.6)", maxInlineSize: "44cqw", opacity: 0.8 }}>{note}</div>
        </>
      )}
    </Slide>
  );
}

/** Content slide, one or two columns. `aside` is any node — chart, table, plate. */
export function SlideContent({ kicker: k, title, children, aside, tone = "paper", ...rest }) {
  const ink = tone === "ink";
  return (
    <Slide tone={tone} align="start" style={{ paddingBlock: "7cqw" }} {...rest}>
      <div style={{ display: "grid", gridTemplateColumns: aside ? "1.05fr 1fr" : "1fr",
        gap: "5cqw", alignItems: "start" }}>
        <div>
          {k && <div style={kicker(ink)}>{k}</div>}
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "4.2cqw",
            lineHeight: "var(--slide-lead-display, 1.06)", margin: "1cqw 0 1.8cqw" }}>{title}</h2>
          <div style={{ blockSize: 1, inlineSize: "12cqw", background: "var(--interactive-solid)",
            marginBlockEnd: "2.2cqw" }} />
          <div style={{ fontSize: "1.5cqw", lineHeight: "var(--slide-lead-body, 1.65)" }}>{children}</div>
        </div>
        {aside && <div style={{ minInlineSize: 0 }}>{aside}</div>}
      </div>
    </Slide>
  );
}

/** Bullets, with the petal as the marker. Six at most — past that, split. */
export function SlideBullets({ kicker: k, title, items = [], tone = "paper", ...rest }) {
  return (
    <SlideContent kicker={k} title={title} tone={tone} {...rest}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "1.4cqw" }}>
        {items.map((it, i) => (
          <li key={i} style={{ display: "flex", gap: "1.4cqw", alignItems: "baseline" }}>
            <Petal size="1.6cqw" rotate={-90} opacity={0.8} style={{ flex: "none" }} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </SlideContent>
  );
}

/** Figures. Three or four; more than that is a table. */
export function SlideStats({ title, stats = [], tone = "paper", ...rest }) {
  return (
    <Slide tone={tone} {...rest}>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "3.8cqw",
        margin: "0 0 3cqw" }}>{title}</h2>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.length || 1}, 1fr)`, gap: "3cqw" }}>
        {stats.map((s, i) => (
          <div key={i} style={{ borderBlockStart: "1px solid var(--border)", paddingBlockStart: "1.5cqw" }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "5.6cqw",
              lineHeight: 1, fontFeatureSettings: "'tnum'" }}>{s.value}</div>
            <div style={{ ...kicker(tone === "ink"), fontSize: "1.2cqw", marginBlockStart: "0.9cqw" }}>{s.label}</div>
            {s.note && <div style={{ fontSize: "1.1cqw", opacity: 0.6, marginBlockStart: "0.5cqw" }}>{s.note}</div>}
          </div>
        ))}
      </div>
    </Slide>
  );
}

/** A chart slide. The chart is the same component the app renders. */
export function SlideChart({ kicker: k, title, chart, note, tone = "paper", ...rest }) {
  return (
    <Slide tone={tone} align="start" style={{ paddingBlock: "6cqw" }} {...rest}>
      {k && <div style={kicker(tone === "ink")}>{k}</div>}
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "3.6cqw",
        margin: "1cqw 0 2.4cqw" }}>{title}</h2>
      <div style={{ minInlineSize: 0 }}>{chart}</div>
      {note && <div style={{ fontSize: "1.2cqw", opacity: 0.65, marginBlockStart: "1.6cqw" }}>{note}</div>}
    </Slide>
  );
}

/** A table slide. Eight rows at most — a deck is not a ledger. */
export function SlideTable({ title, columns = [], rows = [], tone = "paper", ...rest }) {
  return (
    <Slide tone={tone} align="start" style={{ paddingBlock: "6cqw" }} {...rest}>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "3.6cqw",
        margin: "0 0 2.4cqw" }}>{title}</h2>
      <table style={{ inlineSize: "100%", borderCollapse: "collapse", fontSize: "1.4cqw" }}>
        <thead>
          <tr>{columns.map(c => (
            <th key={c.key} style={{ textAlign: c.align === "end" ? "end" : "start",
              paddingBlock: "1cqw", fontWeight: 400, fontSize: "1.1cqw",
              letterSpacing: "var(--tracking-kicker)", textTransform: "uppercase", opacity: 0.6,
              borderBlockEnd: "1px solid var(--border-strong)" }}>{c.label}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{columns.map(c => (
              <td key={c.key} style={{ textAlign: c.align === "end" ? "end" : "start",
                paddingBlock: "1cqw", borderBlockEnd: "1px solid var(--border)",
                fontFeatureSettings: c.align === "end" ? "'tnum'" : undefined }}>{r[c.key]}</td>
            ))}</tr>
          ))}
        </tbody>
      </table>
    </Slide>
  );
}

/** A quote, and the close. Both are the same slide with different weight. */
export function SlideQuote({ quote, cite, tone = "paper", ...rest }) {
  return (
    <Slide tone={tone} pad="12cqw" {...rest}>
      <Petal size="3.4cqw" style={{ marginBlockEnd: "2.2cqw" }} />
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "4cqw",
        lineHeight: "var(--slide-lead-display, 1.18)" }}>{quote}</div>
      {cite && <div style={{ ...kicker(tone === "ink"), fontSize: "1.2cqw", marginBlockStart: "2.6cqw" }}>{cite}</div>}
    </Slide>
  );
}

export function SlideClose({ title = "Thank you", meta, ...rest }) {
  return (
    <Slide tone="ink" align="center" {...rest}>
      <Mark size="7cqw" tone="brandTrue" style={{ marginBlockEnd: "2.4cqw" }} />
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "5cqw", lineHeight: "var(--slide-lead-display, 1.05)" }}>{title}</div>
      {meta && <div style={{ fontSize: "1.4cqw", opacity: 0.7, marginBlockStart: "1.8cqw" }}>{meta}</div>}
    </Slide>
  );
}

/**
 * The deck rhythm that holds up past twenty slides. Exported as data so a
 * generator, a template and a reviewer all read the same sequence.
 */
export const DECK_RHYTHM = [
  "Cover, then contents.",
  "An ink divider opens every section — it is the only dark field in the run.",
  "Two or three content slides between dividers. Past three, the section is two sections.",
  "One stats or chart slide per section, never two in a row.",
  "A quote slide to break a long stretch of argument.",
  "An ink close that repeats the mark and nothing else.",
  "At most one dark field per spread; content slides return to paper."
];

/**
 * pptxgenjs helper. Pass a slide list in the same shape the components take and
 * it emits a deck on the generated theme (packages/slides/dist/pptx.theme.js).
 *
 *   import pptxgen from "pptxgenjs";
 *   import theme from "@al-rayhaanat/slides/pptx.theme";
 *   buildDeck(pptxgen, theme, [
 *     { layout: "cover", title: "Michaelmas run", kicker: "Bindery · 2026" },
 *     { layout: "divider", numeral: "Section I", title: "The ledger" },
 *     { layout: "stats", title: "The quarter, counted", stats: [...] }
 *   ]).writeFile({ fileName: "michaelmas.pptx" });
 *
 * Office keeps Latin and complex-script (Arabic) font slots separately, so the
 * theme sets both and RTL decks use the mirrored masters named in POTX.md.
 */
export function buildDeck(pptxgen, theme, slides = []) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";
  pptx.theme = { headFontFace: theme.fonts.latin, bodyFontFace: theme.fonts.latinBody };
  const paper = theme.theme.background, ink = "1E1A15";
  const text = theme.theme.text, accent = theme.theme.accent1;

  slides.forEach(s => {
    const slide = pptx.addSlide();
    const dark = s.layout === "divider" || s.layout === "close" || s.tone === "ink";
    slide.background = { color: dark ? ink : paper };
    const fg = dark ? "F9F3E9" : text;

    if (s.kicker || s.numeral) {
      slide.addText(String(s.kicker || s.numeral).toUpperCase(), {
        x: 0.9, y: 0.75, w: 8, h: 0.3, fontSize: 11, charSpacing: 2,
        color: dark ? "F79BAF" : accent, fontFace: theme.fonts.latin
      });
    }
    if (s.title) {
      slide.addText(s.title, {
        x: 0.9, y: s.layout === "cover" ? 2.6 : 1.15,
        w: 11.5, h: s.layout === "cover" ? 1.8 : 1.2,
        fontSize: s.layout === "cover" ? 54 : s.layout === "divider" ? 48 : 32,
        color: fg, fontFace: theme.fonts.latin, bold: false
      });
    }
    if (s.body) {
      slide.addText(s.body, { x: 0.9, y: 2.6, w: 6.4, h: 3, fontSize: 14, lineSpacingMultiple: 1.4,
        color: fg, fontFace: theme.fonts.latinBody });
    }
    if (s.bullets) {
      slide.addText(s.bullets.map(t => ({ text: t, options: { bullet: { code: "25CF" } } })), {
        x: 0.9, y: 2.5, w: 7, h: 3.4, fontSize: 14, lineSpacingMultiple: 1.5,
        color: fg, fontFace: theme.fonts.latinBody
      });
    }
    if (s.stats) {
      const w = 11.5 / s.stats.length;
      s.stats.forEach((st, i) => {
        slide.addShape(pptx.ShapeType.line, { x: 0.9 + i * w, y: 2.9, w: w - 0.4, h: 0,
          line: { color: dark ? "55493A" : "E2C9B8", width: 1 } });
        slide.addText(String(st.value), { x: 0.9 + i * w, y: 3.0, w: w - 0.4, h: 0.9,
          fontSize: 40, color: fg, fontFace: theme.fonts.latin });
        slide.addText(String(st.label).toUpperCase(), { x: 0.9 + i * w, y: 3.9, w: w - 0.4, h: 0.3,
          fontSize: 10, charSpacing: 2, color: dark ? "F79BAF" : accent, fontFace: theme.fonts.latin });
      });
    }
    if (s.table) {
      slide.addTable(s.table, { x: 0.9, y: 2.4, w: 11.5, fontSize: 12,
        color: fg, fontFace: theme.fonts.latinBody,
        border: { type: "solid", pt: 0.5, color: dark ? "55493A" : "E2C9B8" } });
    }
    if (s.image) slide.addImage({ path: s.image, x: 7.6, y: 1.6, w: 4.8, h: 3.6 });
    if (s.notes) slide.addNotes(s.notes);
  });
  return pptx;
}
