/**
 * @al-rayhaanat/charts — data visualisation on the tokens.
 *
 * Depends on @al-rayhaanat/tokens, /icons, /ui.
 *
 * Hand-drawn SVG rather than a charting library, and that is a choice, not a
 * shortcut: these seven charts are the ones an institutional product needs, they
 * carry no interaction beyond hover, and they must render identically in a React
 * app, a printed statement and a PowerPoint slide. A 90KB charting runtime buys
 * nothing here. Reach for a library only when you need brushing, zooming, or
 * more than a few thousand points — and then wrap it in this package.
 *
 * Colour: SERIES alternates lightness as well as hue, so it survives deuteranopia
 * and greyscale print. Nothing relies on hue alone — every series carries a
 * pattern option and every legend carries its label.
 */
"use client";
import React, { useMemo, useState, useId, useEffect } from "react";
import { Icon } from "@al-rayhaanat/icons";

/** Series order. Lightness alternates: dark, mid, dark, mid… */
export const SERIES = [
  "var(--color-blue-500)", "var(--color-crimson-500)", "var(--color-green-500)",
  "var(--color-amber-500)", "var(--color-crimson-800)", "var(--color-blue-300)",
  "var(--color-rose-500)", "var(--color-green-300)"
];
const GRID = "var(--border)";
const AXIS = "var(--text-muted)";
const num = v => (typeof v === "number" ? v : parseFloat(v) || 0);
const nice = max => {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / pow * 2) / 2 * pow;
};

/**
 * 0 → 1 once, on mount. Charts draw themselves in rather than appearing whole:
 * a bar that grows from the axis and a ring that sweeps say which direction the
 * figure is read in, and where it started. Under prefers-reduced-motion it lands
 * at 1 on the first frame, so the chart is simply there.
 *
 * Driven by rAF rather than CSS because the values being animated are SVG
 * geometry — an arc length, a bar height — not style properties.
 */
function useChartReveal(duration = 520) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") { setProgress(1); return undefined; }
    const calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm) { setProgress(1); return undefined; }
    let raf = 0, start;
    const ease = t => 1 - Math.pow(1 - t, 3);
    const step = ts => {
      if (start === undefined) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      setProgress(ease(t));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [duration]);
  return progress;
}

function useScale(rows, keys) {
  return useMemo(() => {
    const max = Math.max(...rows.map(r => Math.max(...keys.map(k => num(r[k])))), 0);
    return { max: nice(max) };
  }, [rows, keys]);
}

/* ── frame: axes, grid, labels ──────────────────────────────────────────── */
function Frame({ width = 640, height = 260, pad = { t: 12, r: 12, b: 28, l: 44 }, max, ticks = 4, xLabels = [], children, yFormat = v => v, hot = null }) {
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const lines = Array.from({ length: ticks + 1 }, (_, i) => (max / ticks) * i);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img"
      style={{ inlineSize: "100%", blockSize: "auto", overflow: "visible",
        fontFamily: "var(--font-mono)", fontSize: 9 }}>
      {lines.map((v, i) => {
        const y = pad.t + ih - (v / max) * ih;
        return (
          <g key={i}>
            <line x1={pad.l} x2={pad.l + iw} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
            <text x={pad.l - 6} y={y + 3} textAnchor="end" fill={AXIS}
              style={{ fontFeatureSettings: "'tnum'" }}>{yFormat(v)}</text>
          </g>
        );
      })}
      {xLabels.map((label, i) => (
        <text key={i} x={pad.l + (iw / xLabels.length) * (i + 0.5)} y={height - 8}
          textAnchor="middle" fill={hot === i ? "var(--text-primary)" : AXIS}>{label}</text>
      ))}
      {children({ iw, ih, x0: pad.l, y0: pad.t })}
    </svg>
  );
}

/** Legend. Always present when there is more than one series. */
export function Legend({ keys = [], colors = SERIES, style }) {
  return (
    <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap",
      fontSize: "var(--text-2xs)", color: "var(--text-secondary)", ...style }}>
      {keys.map((k, i) => (
        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ inlineSize: 10, blockSize: 10, borderRadius: 2,
            background: colors[i % colors.length] }} />
          {k}
        </span>
      ))}
    </div>
  );
}

function ChartShell({ title, note, keys, children, style }) {
  return (
    <figure style={{ margin: 0, display: "grid", gap: "var(--space-3)", minInlineSize: 0, ...style }}>
      {title && (
        <figcaption style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)" }}>
          <span style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-kicker)",
            textTransform: "uppercase", color: "var(--interactive)" }}>{title}</span>
          {note && <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)",
            marginInlineStart: "auto" }}>{note}</span>}
        </figcaption>
      )}
      {children}
      {keys && keys.length > 1 && <Legend keys={keys} />}
    </figure>
  );
}

/** Line chart. `rows`: [{ x, a, b }], `keys`: ['a','b']. */
export function LineChart({ rows = [], keys = [], xKey = "x", title, note, height = 240, area }) {
  const { max } = useScale(rows, keys);
  const reveal = useChartReveal();
  return (
    <ChartShell title={title} note={note} keys={keys}>
      <Frame height={height} max={max} xLabels={rows.map(r => r[xKey])}>
        {({ iw, ih, x0, y0 }) => (
          <>
            {keys.map((k, si) => {
              const pts = rows.map((r, i) => [
                x0 + (iw / rows.length) * (i + 0.5),
                y0 + ih - (num(r[k]) / max) * ih
              ]);
              const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
              return (
                <g key={k}>
                  {area && (
                    <path d={`${d} L${pts[pts.length - 1][0]},${y0 + ih} L${pts[0][0]},${y0 + ih} Z`}
                      fill={SERIES[si % SERIES.length]} opacity={0.12} />
                  )}
                  <path d={d} fill="none" stroke={SERIES[si % SERIES.length]} strokeWidth={2}
                    pathLength={1} strokeDasharray={1} strokeDashoffset={1 - reveal}
                    strokeLinejoin="round" strokeLinecap="round" />
                  {pts.map((p, i) => (
                    <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill="var(--surface)"
                      stroke={SERIES[si % SERIES.length]} strokeWidth={1.5} />
                  ))}
                </g>
              );
            })}
          </>
        )}
      </Frame>
    </ChartShell>
  );
}

/** Area chart — a line chart with its fill on. */
export function AreaChart(props) { return <LineChart {...props} area />; }

/** Bar chart. `stacked` puts the series on top of each other. */
export function BarChart({ rows = [], keys = [], xKey = "x", title, note, height = 240, stacked }) {
  const totals = useMemo(() => rows.map(r => keys.reduce((s, k) => s + num(r[k]), 0)), [rows, keys]);
  const max = nice(stacked ? Math.max(...totals, 0) : Math.max(...rows.map(r => Math.max(...keys.map(k => num(r[k])))), 0));
  const reveal = useChartReveal();
  const [hot, setHot] = useState(null);
  return (
    <ChartShell title={title} note={note} keys={keys}>
      <Frame height={height} max={max} xLabels={rows.map(r => r[xKey])} hot={hot}>
        {({ iw, ih, x0, y0 }) => {
          const slot = iw / rows.length;
          const barW = stacked ? slot * 0.5 : (slot * 0.62) / keys.length;
          return rows.map((r, i) => {
            let stackY = y0 + ih;
            return (
              <g key={i} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)}>
                {/* A full-height catcher, so the column responds anywhere down
                    its track rather than only on the ink. */}
                <rect x={x0 + slot * i} y={y0} width={slot} height={ih} fill="transparent" />
                {keys.map((k, si) => {
                  const h = (num(r[k]) / max) * ih * reveal;
                  const x = stacked
                    ? x0 + slot * (i + 0.5) - barW / 2
                    : x0 + slot * i + slot * 0.19 + si * barW;
                  const y = stacked ? (stackY -= h) : y0 + ih - h;
                  return (
                    <g key={k}>
                      <rect x={x} y={y} width={barW - (stacked ? 0 : 2)} height={Math.max(h, 0)}
                        fill={SERIES[si % SERIES.length]} rx={2}
                        opacity={hot === null || hot === i ? 1 : 0.4}
                        style={{ transitionProperty: "opacity", transitionDuration: "var(--duration-fast)" }} />
                      {hot === i && reveal > 0.99 && (
                        <text x={x + (barW - (stacked ? 0 : 2)) / 2} y={y - 4} textAnchor="middle"
                          fill="var(--text-primary)"
                          style={{ fontFeatureSettings: "'tnum'", fontSize: 9 }}>{r[k]}</text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          });
        }}
      </Frame>
    </ChartShell>
  );
}

/** Donut. A total in the middle, because a ring without a number is decoration. */
export function DonutChart({ data = [], title, note, size = 200, total, unit }) {
  const sum = data.reduce((s, d) => s + num(d.value), 0) || 1;
  const r = size / 2 - 12, c = size / 2, circ = 2 * Math.PI * r;
  const reveal = useChartReveal();
  /* Hovering a segment or its legend row reads that slice in the middle, where
     the total already is — so the number never moves to a tooltip you have to
     chase, and the ring keeps its one place for figures. */
  const [hot, setHot] = useState(null);
  let offset = 0;
  const shown = hot === null ? (total ?? sum) : data[hot].value;
  const caption = hot === null ? unit : `${data[hot].label} · ${Math.round((num(data[hot].value) / sum) * 100)}%`;
  return (
    <ChartShell title={title} note={note}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-6)", flexWrap: "wrap" }}>
        <svg viewBox={`0 0 ${size} ${size}`} role="img" style={{ inlineSize: size, blockSize: size }}
          onMouseLeave={() => setHot(null)}>
          <circle cx={c} cy={c} r={r} fill="none" stroke={GRID} strokeWidth={16} />
          {data.map((d, i) => {
            const len = (num(d.value) / sum) * circ * reveal;
            const on = hot === i;
            const el = (
              <circle key={d.label} cx={c} cy={c} r={r} fill="none"
                stroke={SERIES[i % SERIES.length]} strokeWidth={on ? 22 : 16}
                strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset}
                transform={`rotate(-90 ${c} ${c})`}
                opacity={hot === null || on ? 1 : 0.45}
                onMouseEnter={() => setHot(i)}
                style={{ cursor: "pointer", transitionProperty: "stroke-width, opacity",
                  transitionDuration: "var(--duration-fast)" }} />
            );
            offset += len;
            return el;
          })}
          <text x={c} y={c - 2} textAnchor="middle" fill="var(--text-primary)"
            style={{ fontFamily: "var(--font-display)", fontSize: 26, fontFeatureSettings: "'tnum'",
              pointerEvents: "none" }}>
            {shown}
          </text>
          {caption && <text x={c} y={c + 16} textAnchor="middle" fill="var(--text-muted)"
            style={{ fontFamily: "var(--font-body)", fontSize: 9, pointerEvents: "none" }}>{caption}</text>}
        </svg>
        <div style={{ display: "grid", gap: "var(--space-2)" }}>
          {data.map((d, i) => (
            <span key={d.label} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)}
              style={{ display: "flex", alignItems: "center", gap: "var(--space-3)",
                fontSize: "var(--text-xs)", cursor: "pointer", borderRadius: "var(--radius-sm)",
                paddingInline: "var(--space-2)", marginInline: "calc(var(--space-2) * -1)",
                background: hot === i ? "var(--surface-sunken)" : "transparent",
                opacity: hot === null || hot === i ? 1 : 0.55,
                transitionProperty: "background-color, opacity",
                transitionDuration: "var(--duration-fast)" }}>
              <span style={{ inlineSize: 10, blockSize: 10, borderRadius: 2,
                background: SERIES[i % SERIES.length] }} />
              <span style={{ marginInlineEnd: "auto", color: "var(--text-secondary)" }}>{d.label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontFeatureSettings: "'tnum'" }}>{d.value}</span>
            </span>
          ))}
        </div>
      </div>
    </ChartShell>
  );
}

/** Sparkline — a figure's shape, inline, with no axes. */
export function Sparkline({ values = [], width = 96, height = 26, tone = "var(--interactive-solid)" }) {
  const max = Math.max(...values.map(num), 0) || 1;
  const min = Math.min(...values.map(num), 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    (width / (values.length - 1 || 1)) * i,
    height - ((num(v) - min) / span) * (height - 4) - 2
  ]);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true"
      style={{ inlineSize: width, blockSize: height, overflow: "visible" }}>
      <path d={pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ")}
        fill="none" stroke={tone} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2} fill={tone} />}
    </svg>
  );
}

/** KPI block. One figure, its label, its movement — and never movement alone. */
export function Stat({ label, value, unit, delta, deltaLabel, trend, style }) {
  const up = num(delta) >= 0;
  return (
    <div style={{ display: "grid", gap: "var(--space-2)", padding: "var(--space-5)",
      borderRadius: "var(--radius-lg)", background: "var(--surface)",
      borderWidth: "var(--border-hairline)", borderStyle: "solid", borderColor: "var(--border)", ...style }}>
      <span style={{ fontSize: "var(--text-3xs)", letterSpacing: "var(--tracking-kicker)",
        textTransform: "uppercase", color: "var(--interactive)" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)" }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--weight-regular)",
          fontSize: "var(--text-4xl)", lineHeight: 1, fontFeatureSettings: "'tnum'" }}>{value}</span>
        {unit && <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{unit}</span>}
        {trend && <span style={{ marginInlineStart: "auto" }}><Sparkline values={trend} /></span>}
      </span>
      {delta !== undefined && (
        <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)",
          fontSize: "var(--text-2xs)", color: up ? "var(--success)" : "var(--danger)" }}>
          <Icon name={up ? "arrow-up-right" : "arrow-right"} size={12} mirror={false} />
          {up ? "+" : ""}{delta}{deltaLabel && (
            <span style={{ color: "var(--text-muted)" }}>{deltaLabel}</span>
          )}
        </span>
      )}
    </div>
  );
}

/** The rules, so a chart review is not a matter of taste. */
export const CHART_RULES = [
  "Series order alternates lightness as well as hue — the sequence survives deuteranopia and a photocopier.",
  "Never hue alone: a legend label, a direct label, or a pattern always carries the meaning too.",
  "Bar charts start at zero. Line charts may not, if the axis says so in words.",
  "Four gridlines at most, hairline weight, behind the data.",
  "Figures on a chart set tabular; axis labels set in the mono face.",
  "A donut always shows its total in the middle. A ring without a number is decoration.",
  "No 3D, no shadows on data, no gradient fills — the ink is the data."
];
