/**
 * @al-rayhaanat/prose — rich text: the blocks a content field can produce.
 *
 * Depends on @al-rayhaanat/tokens, /icons, /ui.
 *
 * Everything an editor can insert has exactly one design here, so a CMS field, a
 * markdown renderer and a hand-written page cannot drift apart. `Prose` sets the
 * measure and the rhythm; every block below is also usable on its own.
 *
 * Yes — these are real React components, the same as the rest of the system:
 *   import { Prose, Callout, BulletList } from "@al-rayhaanat/prose";
 * and they carry a class equivalent in tokens.css (.arh-prose) for surfaces that
 * are not React.
 */
"use client";
import React from "react";
import { Icon, Mark, Petal } from "@al-rayhaanat/icons";

/** The reading measure and the space between blocks. Wrap any body content. */
export function Prose({ measure = "78ch", size = "base", children, style, ...rest }) {
  return (
    <div style={{ maxInlineSize: measure, fontSize: `var(--text-${size})`,
      lineHeight: `var(--leading-${size})`, display: "grid", gap: "var(--space-5)",
      color: "var(--text-primary)", ...style }} {...rest}>{children}</div>
  );
}

/** The opening paragraph. One per article, never two. */
export function Lede({ children, style }) {
  return (
    <p style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: "var(--weight-regular)",
      fontSize: "var(--text-xl)", lineHeight: "var(--leading-xl)",
      color: "var(--text-secondary)", ...style }}>{children}</p>
  );
}

/** A heading inside prose. `level` 2–4; the mark ornament is optional. */
export function ProseHeading({ level = 2, ornament, children, style }) {
  const Tag = `h${level}`;
  const size = { 2: "2xl", 3: "xl", 4: "lg" }[level] || "lg";
  return (
    <Tag style={{ margin: 0, fontFamily: "var(--font-display)",
      fontWeight: level > 2 ? "var(--weight-semibold)" : "var(--weight-regular)",
      fontSize: `var(--text-${size})`, lineHeight: `var(--leading-${size})`,
      display: "flex", alignItems: "baseline", gap: "var(--space-3)", ...style }}>
      {ornament && <Mark size={14} style={{ transform: "translateY(-1px)" }} />}
      {children}
    </Tag>
  );
}

const TONES = {
  note: { edge: "var(--border-strong)", tint: "var(--surface-sunken)", ink: "var(--text-primary)", icon: "book-open" },
  accent: { edge: "var(--interactive-solid)", tint: "var(--interactive-subtle)", ink: "var(--interactive)", icon: "bookmark" },
  success: { edge: "var(--success)", tint: "var(--success-subtle)", ink: "var(--success)", icon: "check" },
  warning: { edge: "var(--warning)", tint: "var(--warning-subtle)", ink: "var(--warning)", icon: "bell" },
  danger: { edge: "var(--danger)", tint: "var(--danger-subtle)", ink: "var(--danger)", icon: "x" },
  info: { edge: "var(--info)", tint: "var(--info-subtle)", ink: "var(--info)", icon: "file-text" }
};

/**
 * A callout.
 *
 * `tone`: note · accent · success · warning · danger · info
 * `variant`:
 *   bar   — a rule on the inline-start edge, no fill. The default: it interrupts
 *           the column without becoming a box in it.
 *   card  — bordered and tinted. For something the reader must not scroll past.
 *   plain — no edge and no fill, only the icon and the ink colour. For asides.
 *   quiet — sunken well, tone-neutral. For examples and notes about the text.
 */
export function Callout({ tone = "note", variant = "bar", title, icon, children, style }) {
  const t = TONES[tone] || TONES.note;
  const skin = {
    bar: { borderInlineStartWidth: "var(--border-thick)", borderInlineStartStyle: "solid",
      borderInlineStartColor: t.edge, paddingInlineStart: "var(--space-5)", background: "transparent" },
    card: { borderWidth: "var(--border-hairline)", borderStyle: "solid", borderColor: t.edge,
      borderRadius: "var(--radius-lg)", background: t.tint, padding: "var(--space-5)" },
    plain: { background: "transparent", padding: 0 },
    quiet: { background: "var(--surface-sunken)", borderRadius: "var(--radius-lg)",
      padding: "var(--space-5)" }
  }[variant] || {};
  return (
    <div role="note" style={{ display: "flex", gap: "var(--space-4)",
      paddingBlock: variant === "bar" ? "var(--space-2)" : undefined, ...skin, ...style }}>
      <Icon name={icon || t.icon} size={17} style={{ color: t.ink, marginBlockStart: 2 }} />
      <div style={{ display: "grid", gap: "var(--space-2)", minInlineSize: 0 }}>
        {title && <div style={{ fontFamily: "var(--font-display)",
          fontWeight: "var(--weight-semibold)", fontSize: "var(--text-md)",
          color: variant === "card" ? t.ink : "var(--text-primary)" }}>{title}</div>}
        <div style={{ fontSize: "var(--text-sm)", lineHeight: "var(--leading-sm)",
          color: "var(--text-secondary)" }}>{children}</div>
      </div>
    </div>
  );
}

const MARKERS = {
  petal: () => <Petal size={13} rotate={-90} opacity={0.85} style={{ flex: "none", marginBlockStart: 4 }} />,
  mark: () => <Mark size={12} tone="quiet" style={{ flex: "none", marginBlockStart: 4 }} />,
  dot: () => <span style={{ inlineSize: 5, blockSize: 5, borderRadius: "var(--radius-full)",
    background: "var(--interactive-solid)", flex: "none", marginBlockStart: 8, marginInline: 4 }} />,
  dash: () => <span style={{ inlineSize: 10, blockSize: 1, background: "var(--border-strong)",
    flex: "none", marginBlockStart: 10, marginInline: 2 }} />,
  check: () => <Icon name="check" size={14} strokeWidth={2} style={{ flex: "none",
    marginBlockStart: 3, color: "var(--success)" }} />
};

/**
 * A list.
 *
 * `marker`: petal (editorial default) · mark · dot · dash · check (a checklist)
 * `dense` tightens the gap for lists inside a card or a table cell.
 */
export function BulletList({ items = [], marker = "petal", dense, style }) {
  const M = MARKERS[marker] || MARKERS.petal;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid",
      gap: dense ? "var(--space-2)" : "var(--space-3)", ...style }}>
      {items.map((it, i) => (
        <li key={i} style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start",
          fontSize: "var(--text-sm)", lineHeight: "var(--leading-sm)" }}>
          <M />
          <span style={{ minInlineSize: 0 }}>{it}</span>
        </li>
      ))}
    </ul>
  );
}

/** A numbered list. Figures set tabular so the column of numbers lines up. */
export function NumberedList({ items = [], start = 1, style }) {
  return (
    <ol start={start} style={{ listStyle: "none", margin: 0, padding: 0, display: "grid",
      gap: "var(--space-3)", counterReset: `arh ${start - 1}`, ...style }}>
      {items.map((it, i) => (
        <li key={i} style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-start",
          fontSize: "var(--text-sm)", lineHeight: "var(--leading-sm)" }}>
          <span className="arh-tnum" style={{ fontFamily: "var(--font-display)",
            fontWeight: "var(--weight-semibold)", fontSize: "var(--text-sm)",
            color: "var(--interactive)", minInlineSize: "1.6em", textAlign: "end" }}>
            {start + i}.
          </span>
          <span style={{ minInlineSize: 0 }}>{it}</span>
        </li>
      ))}
    </ol>
  );
}

/** Numbered process, with the step number as a marker rather than a prefix. */
export function Steps({ items = [], style }) {
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", ...style }}>
      {items.map((it, i) => {
        /* Its siblings — BulletList, NumberedList — take a plain string, so this
           one does too. Reading `it.title` off a string yielded an empty step,
           which collapsed the row to the marker and left the connector between
           the dots with no height to fill. */
        const title = typeof it === "string" ? it : it.title;
        const body = typeof it === "string" ? null : it.body;
        return (
          <li key={i} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)",
            gap: "var(--space-4)" }}>
            <div style={{ display: "grid", justifyItems: "center", gridTemplateRows: "auto 1fr" }}>
              <span className="arh-tnum" style={{ inlineSize: 24, blockSize: 24, borderRadius: "var(--radius-full)",
                display: "grid", placeItems: "center", fontSize: "var(--text-2xs)",
                fontFamily: "var(--font-display)", fontWeight: "var(--weight-semibold)",
                color: "var(--text-on-interactive)", background: "var(--interactive-solid)" }}>{i + 1}</span>
              {/* minBlockSize so a one-line step still draws a rule to the next
                  dot — a `1fr` row on a short step resolves to nothing. */}
              {i < items.length - 1 && (
                <span style={{ inlineSize: 1, minBlockSize: "var(--space-5)",
                  background: "var(--border)" }} />
              )}
            </div>
            <div style={{ paddingBlockEnd: "var(--space-5)" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: "var(--weight-semibold)",
                fontSize: "var(--text-md)" }}>{title}</div>
              {body && <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)",
                marginBlockStart: "var(--space-1)" }}>{body}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Term and definition pairs, parted by hairlines. */
export function DefinitionList({ pairs = [], style }) {
  return (
    <dl style={{ margin: 0, display: "grid", ...style }}>
      {pairs.map(([term, def], i) => (
        <div key={term} style={{ display: "grid", gridTemplateColumns: "minmax(0,10rem) minmax(0,1fr)",
          gap: "var(--space-4)", paddingBlock: "var(--space-3)",
          borderBlockStart: i ? "var(--border-hairline) solid var(--border)" : "0" }}>
          <dt style={{ fontFamily: "var(--font-display)", fontWeight: "var(--weight-semibold)",
            fontSize: "var(--text-sm)" }}>{term}</dt>
          <dd style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{def}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A quotation.
 * `variant`: rule (a hairline on the inline-start edge) · plate (matted, for a
 * quotation that carries the page) · inline (small, inside a column).
 */
export function Blockquote({ variant = "rule", cite, children, style }) {
  const skin = {
    rule: { borderInlineStartWidth: "var(--border-thick)", borderInlineStartStyle: "solid",
      borderInlineStartColor: "var(--border-strong)", paddingInlineStart: "var(--space-5)" },
    plate: { background: "var(--surface-sunken)", borderRadius: "var(--radius-lg)",
      padding: "var(--space-6)" },
    inline: { paddingInlineStart: 0 }
  }[variant] || {};
  return (
    <blockquote style={{ margin: 0, display: "grid", gap: "var(--space-3)", ...skin, ...style }}>
      {variant === "plate" && <Petal size={18} />}
      <p style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: "var(--weight-regular)",
        fontSize: variant === "inline" ? "var(--text-lg)" : "var(--text-2xl)",
        lineHeight: variant === "inline" ? "var(--leading-lg)" : "var(--leading-2xl)" }}>{children}</p>
      {cite && <footer style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-kicker)",
        textTransform: "uppercase", color: "var(--text-muted)" }}>{cite}</footer>}
    </blockquote>
  );
}

/** Pull quote — sits beside the column, not in it. */
export function PullQuote({ children, style }) {
  return (
    <aside style={{ display: "grid", gap: "var(--space-3)", padding: "var(--space-5) 0",
      borderBlock: "var(--border-hairline) solid var(--border)", ...style }}>
      <Mark size={16} />
      <p style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--text-xl)",
        lineHeight: "var(--leading-xl)", color: "var(--interactive)" }}>{children}</p>
    </aside>
  );
}

/** Code, with an optional caption strip. */
export function CodeBlock({ caption, children, style }) {
  return (
    <figure style={{ margin: 0, borderWidth: "var(--border-hairline)", borderStyle: "solid",
      borderColor: "var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden", ...style }}>
      {caption && (
        <figcaption style={{ display: "flex", alignItems: "center", gap: "var(--space-2)",
          padding: "var(--space-2) var(--space-4)", background: "var(--surface-sunken)",
          borderBlockEnd: "var(--border-hairline) solid var(--border)",
          fontFamily: "var(--font-mono)", fontSize: "var(--text-3xs)", color: "var(--text-muted)" }}>
          <Icon name="file-text" size={12} />{caption}
        </figcaption>
      )}
      <pre style={{ margin: 0, padding: "var(--space-4)", overflow: "auto",
        fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)", lineHeight: 1.8,
        color: "var(--text-secondary)", background: "var(--surface)" }}>{children}</pre>
    </figure>
  );
}

export function InlineCode({ children }) {
  return <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.92em",
    background: "var(--surface-sunken)", borderRadius: "var(--radius-sm)",
    paddingInline: "0.35em", paddingBlock: "0.1em" }}>{children}</code>;
}

export function Kbd({ children }) {
  return <kbd style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-3xs)",
    borderWidth: "var(--border-hairline)", borderStyle: "solid", borderColor: "var(--border-strong)",
    borderBlockEndWidth: "var(--border-thick)", borderRadius: "var(--radius-sm)",
    paddingInline: "0.4em", paddingBlock: "0.15em", background: "var(--surface)" }}>{children}</kbd>;
}

/** An accent highlight. Tint, never a fill — the text stays readable. */
export function Highlight({ children }) {
  return <mark style={{ background: "var(--interactive-subtle)", color: "var(--interactive)",
    paddingInline: "0.2em", borderRadius: "var(--radius-sm)" }}>{children}</mark>;
}

/** Footnote reference and its note. */
export function FootnoteRef({ n }) {
  return <sup><a href={`#fn-${n}`} id={`fnref-${n}`} className="arh-tnum"
    style={{ fontSize: "0.7em", color: "var(--interactive)", textDecoration: "none" }}>{n}</a></sup>;
}
export function Footnotes({ notes = [], style }) {
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-2)",
      borderBlockStart: "var(--border-hairline) solid var(--border)",
      paddingBlockStart: "var(--space-4)", ...style }}>
      {notes.map((note, i) => (
        <li key={i} id={`fn-${i + 1}`} style={{ display: "flex", gap: "var(--space-3)",
          fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
          <span className="arh-tnum" style={{ color: "var(--interactive)" }}>{i + 1}</span>
          <span>{note}</span>
        </li>
      ))}
    </ol>
  );
}

/** A section break inside prose: hairline, or the mark set in it. */
export function Ornament({ mark = true, style }) {
  const line = { flex: 1, blockSize: 1, background: "var(--border)" };
  return (
    <div role="separator" style={{ display: "flex", alignItems: "center", gap: "var(--space-4)",
      marginBlock: "var(--space-4)", ...style }}>
      <span style={line} />{mark && <Mark size={14} tone="quiet" />}<span style={line} />
    </div>
  );
}

/** What a rich-text field may emit, and nothing else. */
export const RICH_TEXT_BLOCKS = [
  "Heading 2–4 (ProseHeading)", "Paragraph", "Lede", "Bullet list (5 markers)",
  "Numbered list", "Steps", "Definition list", "Callout (6 tones × 4 variants)",
  "Blockquote (3 variants)", "Pull quote", "Code block", "Inline code", "Keyboard key",
  "Highlight", "Footnote", "Ornament rule", "Link", "Image plate", "Table"
];
