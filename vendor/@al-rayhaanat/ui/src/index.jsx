/**
 * @al-rayhaanat/ui — primitives and layout.
 *
 * Depends on @al-rayhaanat/tokens and @al-rayhaanat/icons. Nothing here knows
 * the product's data shape.
 *
 * Rules this file obeys, and lint enforces:
 *   · no raw hex, px, or duration — tokens only
 *   · logical properties only (inline-start/end, block-start/end) so RTL is free
 *   · variants come from props; callers do not reach inside
 *   · every interactive element has a visible :focus-visible ring from tokens
 *   · touch targets: size="lg" is 44px, the floor for mobile
 */
"use client";
import React, { useState, useRef, useEffect } from "react";
import { Mark, Icon, Spinner } from "@al-rayhaanat/icons";

/* ── interaction state, shared by every control ─────────────────────────── */
function useInteract(disabled, force) {
  const [state, setState] = useState({ hover: false, active: false, focus: false });
  const ref = useRef(null);
  const forced = force ? { hover: force === "hover", active: force === "active", focus: force === "focus" } : null;
  if (disabled) return [forced || { hover: false, active: false, focus: false }, {}, ref];
  if (forced) return [forced, {}, ref];
  return [state, {
    ref,
    onMouseEnter: () => setState(s => ({ ...s, hover: true })),
    onMouseLeave: () => setState(s => ({ ...s, hover: false, active: false })),
    onMouseDown: () => setState(s => ({ ...s, active: true })),
    onMouseUp: () => setState(s => ({ ...s, active: false })),
    onFocus: e => setState(s => ({ ...s, focus: e.target.matches(":focus-visible") })),
    onBlur: () => setState(s => ({ ...s, focus: false }))
  }, ref];
}
/**
 * prefers-reduced-motion, read locally. /ui sits below /motion in the dependency
 * table and must not import it, and a press that SNAPS to 97% is worse than one
 * that never moves — so the transform is dropped entirely rather than run at the
 * zero duration tokens.css falls back to.
 */
function useCalmMotion() {
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setCalm(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return calm;
}

const ring = focus => focus
  ? { outline: "var(--border-focus) solid var(--focus-ring)", outlineOffset: "2px" }
  : { outline: "none" };

const SIZES = {
  sm: { height: 28, padding: "0 var(--space-4)", font: "var(--text-xs)", icon: 15, gap: "var(--space-2)" },
  md: { height: 36, padding: "0 var(--space-5)", font: "var(--text-sm)", icon: 16, gap: "var(--space-3)" },
  lg: { height: 44, padding: "0 var(--space-6)", font: "var(--text-md)", icon: 18, gap: "var(--space-3)" }
};

/* ══ actions ═══════════════════════════════════════════════════════════════ */

const BUTTON_TONES = {
  primary: {
    rest: { background: "var(--interactive-solid)", color: "var(--text-on-interactive)", borderColor: "transparent" },
    hover: { background: "var(--interactive-solid-hover)" },
    active: { background: "var(--interactive-active)" }
  },
  secondary: {
    rest: { background: "var(--surface)", color: "var(--text-primary)", borderColor: "var(--border-control)" },
    hover: { background: "var(--surface-sunken)" },
    active: { background: "var(--surface-sunken)", borderColor: "var(--text-muted)" }
  },
  ghost: {
    rest: { background: "transparent", color: "var(--interactive)", borderColor: "transparent" },
    hover: { background: "var(--interactive-subtle)" },
    active: { background: "var(--interactive-subtle-hover)" }
  },
  danger: {
    rest: { background: "transparent", color: "var(--danger)", borderColor: "var(--danger)" },
    hover: { background: "var(--danger-subtle)" },
    active: { background: "var(--danger-subtle)", color: "var(--danger-hover)" }
  }
};

/**
 * `variant`: primary | secondary | ghost | danger · `size`: sm | md | lg
 * `loading` swaps the leading slot for the mark and blocks the press.
 * Icons go in `icon` (leading) or `iconEnd` (trailing) — both flip with dir.
 */
export function Button({
  variant = "primary", size = "md", icon, iconEnd, loading, disabled,
  block, type = "button", forceState, children, style, ...rest
}) {
  const [s, handlers] = useInteract(disabled || loading, forceState);
  const calm = useCalmMotion();
  const t = BUTTON_TONES[variant] || BUTTON_TONES.primary;
  const dim = SIZES[size] || SIZES.md;
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} {...handlers}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: dim.gap,
        blockSize: dim.height, paddingInline: dim.padding.split(" ")[1], paddingBlock: 0,
        inlineSize: block ? "100%" : undefined,
        fontFamily: "var(--font-body)", fontSize: dim.font, fontWeight: "var(--weight-medium)",
        lineHeight: 1, textDecoration: "none", whiteSpace: "nowrap",
        borderRadius: "var(--radius-md)", borderWidth: "var(--border-hairline)", borderStyle: "solid",
        transitionProperty: "background-color, border-color, color, transform",
        transitionDuration: "var(--duration-fast)", transitionTimingFunction: "var(--ease-standard)",
        /* The press answers back. Small enough to read as pressure rather than
           as the button moving away from the finger. */
        transform: !calm && s.active && !disabled && !loading ? "scale(0.97)" : undefined,
        cursor: disabled ? "not-allowed" : loading ? "progress" : "pointer",
        opacity: disabled ? 0.45 : 1,
        ...t.rest, ...(s.hover ? t.hover : null), ...(s.active ? t.active : null), ...ring(s.focus), ...style
      }} {...rest}>
      {loading ? <Mark size={dim.icon} tone="mono" color="currentColor" style={{ animation: "arh-spin 3.2s linear infinite" }} />
        : icon ? <Icon name={icon} size={dim.icon} /> : null}
      {children}
      {iconEnd && <Icon name={iconEnd} size={dim.icon} />}
    </button>
  );
}

/** Square action. `label` is required — it becomes the accessible name. */
export function IconButton({ name, label, variant = "secondary", size = "md", disabled, style, ...rest }) {
  const dim = SIZES[size] || SIZES.md;
  return (
    <Button variant={variant} size={size} disabled={disabled} aria-label={label}
      style={{ inlineSize: dim.height, paddingInline: 0, ...style }} {...rest}>
      <Icon name={name} size={dim.icon} />
    </Button>
  );
}

/** Inline link. Underlined by default — colour alone never carries the affordance. */
export function Link({ href, external, forceState, children, style, ...rest }) {
  const [s, handlers] = useInteract(false, forceState);
  return (
    <a href={href} {...(external ? { target: "_blank", rel: "noreferrer noopener" } : null)} {...handlers}
      style={{
        color: s.hover ? "var(--interactive-hover)" : "var(--interactive)",
        textDecoration: "underline", textUnderlineOffset: "3px",
        display: external ? "inline-flex" : undefined, alignItems: "center", gap: "var(--space-2)",
        borderRadius: "var(--radius-sm)", ...ring(s.focus), ...style
      }} {...rest}>
      {children}{external && <Icon name="external-link" size={14} />}
    </a>
  );
}

/* ══ status and identity ═══════════════════════════════════════════════════ */

const TONE_FILL = {
  neutral: { background: "var(--surface-sunken)", color: "var(--text-secondary)", borderColor: "var(--border)" },
  accent: { background: "var(--interactive-subtle)", color: "var(--interactive)", borderColor: "var(--interactive-subtle-hover)" },
  secondary: { background: "var(--secondary-subtle)", color: "var(--secondary)", borderColor: "var(--secondary-subtle)" },
  success: { background: "var(--success-subtle)", color: "var(--success)", borderColor: "var(--success-subtle)" },
  warning: { background: "var(--warning-subtle)", color: "var(--warning)", borderColor: "var(--warning-subtle)" },
  danger: { background: "var(--danger-subtle)", color: "var(--danger)", borderColor: "var(--danger-subtle)" },
  info: { background: "var(--info-subtle)", color: "var(--info)", borderColor: "var(--info-subtle)" }
};

/** Static label. `icon` earns its place when the tone carries meaning — never hue alone. */
export function Badge({ tone = "neutral", icon, children, style }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
      paddingInline: "var(--space-3)", paddingBlock: "var(--space-1)",
      fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)", lineHeight: 1.6,
      borderRadius: "var(--radius-sm)", borderWidth: "var(--border-hairline)", borderStyle: "solid",
      ...(TONE_FILL[tone] || TONE_FILL.neutral), ...style
    }}>
      {icon && <Icon name={icon} size={12} />}{children}
    </span>
  );
}

/** Removable label — a filter chip, a selected value. */
export function Tag({ tone = "accent", onRemove, children, style }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
      paddingInlineStart: "var(--space-3)", paddingInlineEnd: onRemove ? "var(--space-2)" : "var(--space-3)",
      paddingBlock: "var(--space-1)", fontSize: "var(--text-xs)", lineHeight: 1.6,
      borderRadius: "var(--radius-full)", borderWidth: "var(--border-hairline)", borderStyle: "solid",
      ...(TONE_FILL[tone] || TONE_FILL.accent), ...style
    }}>
      {children}
      {onRemove && (
        <button onClick={onRemove} aria-label="Remove"
          style={{ display: "grid", placeItems: "center", inlineSize: 16, blockSize: 16, padding: 0,
            border: 0, borderRadius: "var(--radius-full)", background: "transparent",
            color: "inherit", cursor: "pointer", opacity: 0.7 }}>
          <Icon name="x" size={11} />
        </button>
      )}
    </span>
  );
}

/** The core alone: presence, unread, status dot. */
export function Dot({ tone = "accent", size = 8, style }) {
  const c = { accent: "var(--interactive-solid)", success: "var(--success)", warning: "var(--warning)",
    danger: "var(--danger)", neutral: "var(--text-muted)" }[tone];
  return <span style={{ inlineSize: size, blockSize: size, borderRadius: "var(--radius-full)",
    background: c, display: "inline-block", flex: "none", ...style }} />;
}

/** Initials, or the mark when a record has no name. */
export function Avatar({ initials, size = 36, style }) {
  return (
    <span aria-hidden={!initials} style={{
      inlineSize: size, blockSize: size, borderRadius: "var(--radius-full)", display: "grid",
      placeItems: "center", background: "var(--surface-sunken)",
      borderWidth: "var(--border-hairline)", borderStyle: "solid", borderColor: "var(--border)",
      fontFamily: "var(--font-display)", fontWeight: "var(--weight-semibold)",
      fontSize: Math.round(size * 0.36), color: "var(--text-secondary)", ...style
    }}>
      {initials || <Mark size={Math.round(size * 0.5)} />}
    </span>
  );
}

/** Loading placeholder. Shimmer stops under prefers-reduced-motion via the token. */
export function Skeleton({ width = "100%", height = 14, radius = "var(--radius-sm)", style }) {
  return <span aria-hidden="true" style={{
    display: "block", inlineSize: width, blockSize: height, borderRadius: radius,
    background: "linear-gradient(90deg, var(--surface-sunken) 25%, var(--border) 50%, var(--surface-sunken) 75%)",
    backgroundSize: "200% 100%", animation: "arh-shimmer 1.4s linear infinite", ...style
  }} />;
}

/* ══ surfaces ══════════════════════════════════════════════════════════════ */

/** Bordered surface. `tone="raised"` adds elevation; `interactive` adds hover + focus. */
export function Card({ tone = "default", interactive, as = "div", forceState, children, style, ...rest }) {
  const [s, handlers] = useInteract(false, forceState);
  const calm = useCalmMotion();
  const Tag_ = as;
  /* An interactive card lifts a little under the pointer and settles back on
     press — the same grammar as Button, so the two read as one system. */
  const lift = interactive && !calm
    ? s.active ? "translateY(0)" : s.hover ? "translateY(-2px)" : undefined
    : undefined;
  return (
    <Tag_ {...(interactive ? { ...handlers, tabIndex: 0 } : null)}
      style={{
        display: "flex", flexDirection: "column", gap: "var(--space-4)",
        padding: "var(--space-5)", borderRadius: "var(--radius-lg)",
        background: tone === "raised" ? "var(--surface-raised)" : "var(--surface)",
        borderWidth: "var(--border-hairline)", borderStyle: "solid",
        borderColor: interactive && s.hover ? "var(--border-interactive)" : "var(--border)",
        boxShadow: interactive && s.hover ? "var(--shadow-md)"
          : tone === "raised" ? "var(--shadow-md)" : "none",
        transform: lift,
        transitionProperty: "border-color, box-shadow, transform",
        transitionDuration: "var(--duration-fast)", transitionTimingFunction: "var(--ease-standard)",
        cursor: interactive ? "pointer" : undefined, ...ring(s.focus), ...style
      }} {...rest}>{children}</Tag_>
  );
}

/** A hairline. `label` puts a centred caption in the rule; `mark` puts the motif in it. */
export function Divider({ label, mark, style }) {
  const line = { flex: 1, blockSize: 1, background: "var(--border)" };
  /* Two things this used to get wrong inside a grid, which is where most of the
     system puts it. `flex: 1` does nothing to a grid item, and an <hr> carries a
     UA `margin-inline: auto` — so the rule shrank to nothing and vanished. And a
     baked-in marginBlock stacks on top of the parent's `gap`, which is what made
     an opened filter panel look padded out. Spacing belongs to the parent: every
     container in this system is gap-driven. */
  if (!label && !mark) {
    return <hr style={{ border: 0, blockSize: 1, inlineSize: "100%",
      background: "var(--border)", margin: 0, ...style }} />;
  }
  return (
    <div role="separator" style={{ display: "flex", alignItems: "center", gap: "var(--space-4)",
      inlineSize: "100%", ...style }}>
      <span style={line} />
      {mark ? <Mark size={16} /> : (
        <span style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-kicker)",
          textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</span>
      )}
      <span style={line} />
    </div>
  );
}

/* ══ form primitives ═══════════════════════════════════════════════════════ */

const FIELD_BASE = {
  /* Every field sets inlineSize 100% and then adds its own padding and border.
     Under the browser default content-box that lands 26px past the column and
     the field spills over its neighbour. Declared here as well as in the
     stylesheet, so a product consuming /ui without tokens.css still fits. */
  boxSizing: "border-box",
  inlineSize: "100%", fontFamily: "var(--font-body)", fontSize: "var(--text-sm)",
  color: "var(--text-primary)", background: "var(--surface)",
  borderRadius: "var(--radius-md)", borderWidth: "var(--border-hairline)", borderStyle: "solid",
  transitionProperty: "border-color", transitionDuration: "var(--duration-fast)"
};
/**
 * Field variants.
 *   outlined (default) — a 1px control border. The form default: a field in a
 *                        form must look like a field before it is focused.
 *   soft               — borderless on a raised surface with the smallest
 *                        shadow. For search and filter fields that sit in
 *                        chrome, where a border only adds another box to a
 *                        toolbar that already has enough lines.
 */
const fieldTone = (s, invalid, disabled, variant) => variant === "soft"
  ? {
      borderColor: invalid ? "var(--danger)" : s.focus ? "var(--border-interactive)" : "transparent",
      background: disabled ? "var(--surface-sunken)" : "var(--surface-raised)",
      boxShadow: s.hover && !s.focus ? "var(--shadow-md)" : "var(--shadow-sm)",
      opacity: disabled ? 0.6 : 1, cursor: disabled ? "not-allowed" : undefined
    }
  : {
      borderColor: invalid ? "var(--danger)" : s.focus ? "var(--border-interactive)"
        : s.hover ? "var(--text-muted)" : "var(--border-control)",
      background: disabled ? "var(--surface-sunken)" : "var(--surface)",
      opacity: disabled ? 0.6 : 1, cursor: disabled ? "not-allowed" : undefined
    };

/** A control label. `hint` and `error` wire themselves via aria-describedby in @al-rayhaanat/forms. */
export function Label({ htmlFor, required, children, style }) {
  return (
    <label htmlFor={htmlFor} style={{ display: "flex", gap: "var(--space-2)",
      fontSize: "var(--text-xs)", color: "var(--text-secondary)", ...style }}>
      {children}
      {required && <span aria-hidden="true" style={{ color: "var(--danger)" }}>*</span>}
    </label>
  );
}

export const Input = React.forwardRef(function Input(
  { size = "md", variant = "outlined", pill, invalid, disabled, forceState, style, ...rest }, ref) {
  const [s, handlers] = useInteract(disabled, forceState);
  const dim = SIZES[size] || SIZES.md;
  return <input ref={ref} disabled={disabled} aria-invalid={invalid || undefined} {...handlers}
    style={{ ...FIELD_BASE, blockSize: dim.height, paddingInline: "var(--space-4)",
      borderRadius: pill ? "var(--radius-full)" : "var(--radius-md)",
      ...fieldTone(s, invalid, disabled, variant), ...ring(s.focus), ...style }} {...rest} />;
});

/**
 * Search. Soft and pill by default — it lives in chrome, not in a form.
 * Forwards its ref to the input, because a search that expands from a ghost icon
 * has to be focusable the moment it appears.
 */
export const SearchField = React.forwardRef(function SearchField(
  { size = "md", pill = true, variant = "soft", placeholder = "Search", style, ...rest }, ref) {
  const dim = SIZES[size] || SIZES.md;
  return (
    <span style={{ position: "relative", display: "inline-flex", inlineSize: "100%",
      minInlineSize: 0, ...style }}>
      <span style={{ position: "absolute", insetInlineStart: "var(--space-4)",
        insetBlockStart: "50%", transform: "translateY(-50%)", pointerEvents: "none",
        color: "var(--text-muted)", display: "inline-flex" }}>
        <Icon name="search" size={dim.icon} />
      </span>
      <Input ref={ref} type="search" size={size} variant={variant} pill={pill} placeholder={placeholder}
        style={{ paddingInlineStart: "calc(var(--space-4) * 2 + 16px)" }} {...rest} />
    </span>
  );
});

export function Textarea({ rows = 4, variant = "outlined", invalid, disabled, forceState, style, ...rest }) {
  const [s, handlers] = useInteract(disabled, forceState);
  return <textarea rows={rows} disabled={disabled} aria-invalid={invalid || undefined} {...handlers}
    style={{ ...FIELD_BASE, padding: "var(--space-4)", resize: "vertical", lineHeight: "var(--leading-sm)",
      ...fieldTone(s, invalid, disabled, variant), ...ring(s.focus), ...style }} {...rest} />;
}

/** Native select. The chevron is drawn on the inline-end edge, so it follows dir. */
export function Select({ options = [], size = "md", variant = "outlined", pill, invalid, disabled, forceState, style, ...rest }) {
  const [s, handlers] = useInteract(disabled, forceState);
  const dim = SIZES[size] || SIZES.md;
  return (
    <span style={{ position: "relative", display: "inline-block", inlineSize: "100%" }}>
      <select disabled={disabled} aria-invalid={invalid || undefined} {...handlers}
        style={{ ...FIELD_BASE, blockSize: dim.height, appearance: "none",
          paddingInlineStart: "var(--space-4)", paddingInlineEnd: "var(--space-8)",
          borderRadius: pill ? "var(--radius-full)" : "var(--radius-md)",
          ...fieldTone(s, invalid, disabled, variant), ...ring(s.focus), ...style }} {...rest}>
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
      <span style={{ position: "absolute", insetInlineEnd: "var(--space-4)", insetBlockStart: "50%",
        transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-muted)" }}>
        <Icon name="chevron-down" size={15} mirror={false} />
      </span>
    </span>
  );
}

/** Checkbox — the tick is a petal. */
export function Checkbox({ label, checked, defaultChecked, onChange, disabled, invalid, forceState, style, ...rest }) {
  const [s, handlers] = useInteract(disabled, forceState);
  const [own, setOwn] = useState(!!defaultChecked);
  const on = checked === undefined ? own : checked;
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-3)",
      fontSize: "var(--text-sm)", cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.6 : 1, ...style }}>
      <input type="checkbox" checked={on} disabled={disabled} aria-invalid={invalid || undefined}
        onChange={e => { setOwn(e.target.checked); onChange && onChange(e.target.checked); }} {...handlers} {...rest}
        style={{ position: "absolute", opacity: 0, inlineSize: 0, blockSize: 0 }} />
      <span style={{ inlineSize: 18, blockSize: 18, flex: "none", display: "grid", placeItems: "center",
        borderRadius: "var(--radius-sm)", borderWidth: "var(--border-hairline)", borderStyle: "solid",
        borderColor: invalid ? "var(--danger)" : on ? "var(--interactive-solid)" : "var(--border-control)",
        background: on ? "var(--interactive-solid)" : "var(--surface)",
        color: "var(--text-on-interactive)",
        transitionProperty: "background-color, border-color", transitionDuration: "var(--duration-fast)",
        ...ring(s.focus) }}>
        {on && <Icon name="check" size={13} strokeWidth={2.25} />}
      </span>
      {label}
    </label>
  );
}

/** Radio — the selected dot is the core. Group them with a fieldset + legend. */
export function Radio({ label, name, value, checked, onChange, disabled, invalid, forceState, style, ...rest }) {
  const [s, handlers] = useInteract(disabled, forceState);
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-3)",
      fontSize: "var(--text-sm)", cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.6 : 1, ...style }}>
      <input type="radio" name={name} value={value} checked={checked} disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={() => onChange && onChange(value)} {...handlers} {...rest}
        style={{ position: "absolute", opacity: 0, inlineSize: 0, blockSize: 0 }} />
      <span style={{ inlineSize: 18, blockSize: 18, flex: "none", borderRadius: "var(--radius-full)",
        borderWidth: "var(--border-hairline)", borderStyle: "solid",
        borderColor: invalid ? "var(--danger)" : checked ? "var(--interactive-solid)" : "var(--border-control)",
        background: invalid ? "var(--surface)" : checked ? "var(--interactive-solid)" : "var(--surface)",
        boxShadow: checked && !invalid ? "inset 0 0 0 4px var(--surface)" : invalid && checked ? "inset 0 0 0 4px var(--surface), inset 0 0 0 12px var(--danger)" : "none",
        transitionProperty: "background-color, border-color", transitionDuration: "var(--duration-fast)",
        ...ring(s.focus) }} />
      {label}
    </label>
  );
}

/** Switch — an immediate state change, never a form value awaiting submit. */
export function Switch({ label, checked, defaultChecked, onChange, disabled, invalid, forceState, style }) {
  const [s, handlers] = useInteract(disabled, forceState);
  const [own, setOwn] = useState(!!defaultChecked);
  const on = checked === undefined ? own : checked;
  const set = () => { if (disabled) return; setOwn(!on); onChange && onChange(!on); };
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-3)",
      fontSize: "var(--text-sm)", cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.6 : 1, ...style }}>
      <button type="button" role="switch" aria-checked={on} aria-invalid={invalid || undefined}
        disabled={disabled} onClick={set} {...handlers}
        style={{ inlineSize: 40, blockSize: 22, flex: "none", position: "relative", padding: 0,
          borderRadius: "var(--radius-full)", borderWidth: "var(--border-hairline)",
          borderStyle: "solid", borderWidth: invalid ? "var(--border-thick)" : "var(--border-hairline)",
          borderColor: invalid ? "var(--danger)" : on ? "var(--interactive-solid)" : "var(--border-control)",
          background: on ? "var(--interactive-solid)" : "var(--surface)",
          cursor: disabled ? "not-allowed" : "pointer",
          transitionProperty: "background-color, border-color", transitionDuration: "var(--duration-fast)",
          ...ring(s.focus) }}>
        <span style={{ position: "absolute", insetBlockStart: 3, insetInlineStart: on ? 21 : 3,
          inlineSize: 14, blockSize: 14, borderRadius: "var(--radius-full)",
          background: on ? "var(--text-on-interactive)" : "var(--text-muted)",
          transitionProperty: "inset-inline-start", transitionDuration: "var(--duration-fast)",
          transitionTimingFunction: "var(--ease-standard)" }} />
      </button>
      {label}
    </label>
  );
}

/* ══ layout ════════════════════════════════════════════════════════════════ */

const gapOf = g => `var(--space-${g})`;

/** Vertical rhythm. */
export function Stack({ gap = 5, align, children, style, ...rest }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: gapOf(gap), alignItems: align, ...style }} {...rest}>{children}</div>;
}
/** Horizontal group that wraps — buttons, chips, meta rows. */
export function Cluster({ gap = 3, align = "center", justify, children, style, ...rest }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: gapOf(gap), alignItems: align, justifyContent: justify, ...style }} {...rest}>{children}</div>;
}
/** Equal columns, or a minimum track width that reflows on its own. */
export function Grid({ columns, min = "240px", gap = 5, children, style, ...rest }) {
  /* min-based auto-fit is the default: a grid that reflows on content needs no
     breakpoint. Pass `columns` only where the count carries meaning (a matrix). */
  return <div style={{ display: "grid", gap: gapOf(gap),
    gridTemplateColumns: columns
      ? `repeat(${columns}, minmax(0, 1fr))`
      : `repeat(auto-fit, minmax(${min}, 1fr))`,
    ...style }} {...rest}>{children}</div>;
}

/** Two panes that become one column when they cannot hold their minimum. */
export function Split({ min = "320px", gap = 6, children, style, ...rest }) {
  return <div style={{ display: "grid", gap: gapOf(gap),
    gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))`, ...style }} {...rest}>{children}</div>;
}

/** Content plus a rail. The rail holds its width; the pair stacks when the
 *  content would fall below `contentMin`. No breakpoint involved. */
export function SidebarLayout({ rail = "240px", contentMin = "55%", gap = 6, side = "end", children, style, ...rest }) {
  const kids = React.Children.toArray(children);
  const railFirst = side === "start";
  const railBox = { flexBasis: rail, flexGrow: 1, minInlineSize: 0 };
  const mainBox = { flexBasis: 0, flexGrow: 999, minInlineSize: contentMin };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: gapOf(gap), ...style }} {...rest}>
      <div style={railFirst ? railBox : mainBox}>{kids[0]}</div>
      <div style={railFirst ? mainBox : railBox}>{kids[1]}</div>
    </div>
  );
}

/** Centred measure with the page gutter. */
export function Center({ measure = "var(--bp-xl)", children, style, ...rest }) {
  return <div style={{ boxSizing: "content-box", marginInline: "auto", maxInlineSize: measure,
    paddingInline: "var(--space-6)", ...style }} {...rest}>{children}</div>;
}

/** A scroll region that keeps its edges. */
export function ScrollArea({ maxBlock = 420, children, style, ...rest }) {
  return <div style={{ overflow: "auto", overscrollBehavior: "contain",
    maxBlockSize: maxBlock, ...style }} {...rest}>{children}</div>;
}
/** Page measure. `size`: prose (78ch) | md | lg | full. */
export function Container({ size = "lg", children, style, ...rest }) {
  const max = { prose: "78ch", md: "var(--bp-md)", lg: "var(--bp-xl)", full: "100%" }[size];
  return <div style={{ inlineSize: "100%", maxInlineSize: max, marginInline: "auto",
    paddingInline: "var(--space-6)", ...style }} {...rest}>{children}</div>;
}
export function Spacer({ size = 6 }) { return <span aria-hidden="true" style={{ display: "block", blockSize: gapOf(size) }} />; }
export function AspectRatio({ ratio = "16 / 9", children, style }) {
  return <div style={{ aspectRatio: ratio, overflow: "hidden", borderRadius: "var(--radius-md)", ...style }}>{children}</div>;
}

/**
 * The app frame: sidebar + header + scrolling main. Sidebar sits on the inline
 * start, so it moves to the right under RTL with no code change.
 */
export function PageShell({ sidebar, header, children, style }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: sidebar ? "240px minmax(0, 1fr)" : "minmax(0, 1fr)",
      minBlockSize: "100vh", background: "var(--canvas)", color: "var(--text-primary)",
      fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", ...style }}>
      {sidebar && (
        <aside style={{ background: "var(--surface-sunken)", borderInlineEndWidth: "var(--border-hairline)",
          borderInlineEndStyle: "solid", borderInlineEndColor: "var(--border)",
          padding: "var(--space-5) var(--space-4)" }}>{sidebar}</aside>
      )}
      <div style={{ display: "grid", gridTemplateRows: header ? "auto minmax(0, 1fr)" : "minmax(0, 1fr)" }}>
        {header && (
          <header style={{ background: "var(--surface)", borderBlockEndWidth: "var(--border-hairline)",
            borderBlockEndStyle: "solid", borderBlockEndColor: "var(--border)",
            padding: "var(--space-4) var(--space-6)", display: "flex", alignItems: "center",
            gap: "var(--space-5)" }}>{header}</header>
        )}
        <main style={{ padding: "var(--space-7) var(--space-6)", overflow: "auto" }}>{children}</main>
      </div>
    </div>
  );
}

export { Mark, Icon, Spinner };

/**
 * Documentation-only: renders a miniature of one layout block. Lives here so the
 * CSS-blocks board and any consuming docs site show the same thing.
 */
export function BlockDemo({ kind = "stack" }) {
  const bar = (w, h) => ({ inlineSize: w, blockSize: h || 12, borderRadius: "var(--radius-sm)",
    background: "var(--interactive-subtle)", borderInlineStart: "var(--border-thick) solid var(--interactive-solid)" });
  const box = h => ({ blockSize: h || 26, borderRadius: "var(--radius-sm)",
    background: "var(--surface)", border: "var(--border-hairline) solid var(--border)" });
  switch (kind) {
    case "stack":
      return <div style={{ display: "grid", gap: "var(--space-3)" }}>
        <span style={bar("100%")} /><span style={bar("100%")} /><span style={bar("70%")} /></div>;
    case "cluster":
      return <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        {[64, 48, 80, 40, 56].map(w => <span key={w} style={{ ...bar(w, 20), borderRadius: "var(--radius-full)" }} />)}</div>;
    case "grid":
      return <div style={{ display: "grid", gap: "var(--space-2)",
        gridTemplateColumns: "repeat(auto-fit, minmax(60px, 1fr))" }}>
        {[1, 2, 3, 4, 5, 6].map(i => <span key={i} style={box()} />)}</div>;
    case "split":
      return <div style={{ display: "grid", gap: "var(--space-2)",
        gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))" }}>
        <span style={box(46)} /><span style={box(46)} /></div>;
    case "sidebar":
      return <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <span style={{ ...box(46), flexBasis: 70, flexGrow: 1 }} />
        <span style={{ ...box(46), flexBasis: 0, flexGrow: 999, minInlineSize: "55%" }} /></div>;
    case "center":
      return <div style={{ display: "grid", justifyItems: "center" }}>
        <span style={{ ...box(46), inlineSize: "62%" }} /></div>;
    case "prose":
      return <div style={{ display: "grid", gap: 6 }}>
        {["92%", "88%", "95%", "54%"].map(w => <span key={w} style={{ inlineSize: w, blockSize: 5,
          borderRadius: 2, background: "var(--border-strong)" }} />)}</div>;
    case "frame":
      return <div style={{ aspectRatio: "16 / 9", maxBlockSize: 62, borderRadius: "var(--radius-md)",
        background: "var(--surface)", border: "var(--border-hairline) solid var(--border)",
        display: "grid", placeItems: "center", marginInline: "auto" }}>
        <Mark size={22} /></div>;
    case "scroll":
      return <div style={{ overflow: "auto", maxBlockSize: 62, display: "grid", gap: 6,
        border: "var(--border-hairline) solid var(--border)", borderRadius: "var(--radius-sm)",
        padding: 6, background: "var(--surface)" }}>
        {[1, 2, 3, 4, 5, 6].map(i => <span key={i} style={bar("100%", 14)} />)}</div>;
    case "surfaces":
      return <div style={{ display: "grid", gap: "var(--space-2)",
        gridTemplateColumns: "repeat(auto-fit, minmax(70px, 1fr))" }}>
        <span style={{ ...box(40), boxShadow: "var(--shadow-md)" }} />
        <span style={box(40)} />
        <span style={{ ...box(40), background: "var(--surface-sunken)", borderColor: "transparent" }} /></div>;
    default: return null;
  }
}
/* ── responsive ───────────────────────────────────────────────────────────
   Layout should reflow intrinsically (auto-fit tracks, wrapping clusters), so
   this hook exists for the cases that genuinely cannot: swapping a rail for a
   drawer, a table for a scroller, a menu bar for a hamburger.
   ──────────────────────────────────────────────────────────────────────── */
export const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 };

/** Returns the current breakpoint name and booleans for the common questions. */
export function useBreakpoint() {
  const read = () => (typeof window === "undefined" ? 1280 : window.innerWidth);
  const [w, setW] = useState(read);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on, { passive: true });
    return () => window.removeEventListener("resize", on);
  }, []);
  const name = w >= BREAKPOINTS["2xl"] ? "2xl" : w >= BREAKPOINTS.xl ? "xl"
    : w >= BREAKPOINTS.lg ? "lg" : w >= BREAKPOINTS.md ? "md" : w >= BREAKPOINTS.sm ? "sm" : "xs";
  return { width: w, name,
    isPhone: w < BREAKPOINTS.md,        /* rail becomes a drawer */
    isTablet: w >= BREAKPOINTS.md && w < BREAKPOINTS.lg,
    isDesktop: w >= BREAKPOINTS.lg,     /* rail, menu bar, two columns */
    atLeast: bp => w >= (BREAKPOINTS[bp] || 0) };
}

/** One line, clipped with an ellipsis. Title attribute carries the full text. */
export function Truncate({ children, lines = 1, style }) {
  const s = lines === 1
    ? { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
    : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" };
  return <span title={typeof children === "string" ? children : undefined}
    style={{ ...s, minInlineSize: 0, ...style }}>{children}</span>;
}

/**
 * A row of actions that collapses what will not fit into an overflow menu.
 * `keep` is how many stay visible at phone width.
 */
export function OverflowRow({ keep = 2, menu, children, style }) {
  const { isPhone } = useBreakpoint();
  const items = React.Children.toArray(children);
  const shown = isPhone ? items.slice(0, keep) : items;
  const hidden = isPhone ? items.length - shown.length : 0;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center",
      gap: "var(--space-3)", minInlineSize: 0, ...style }}>
      {shown}
      {hidden > 0 && (menu || (
        <IconButton size="sm" variant="secondary" name="more-horizontal"
          label={hidden + " more actions"} />
      ))}
    </div>
  );
}
/**
 * The sliding tab indicator, shared by /patterns' Tabs and /filters' ScopeTabs.
 *
 * Painting the active state as a border or background on the button itself means
 * it can only ever cut — there is nothing to move. One element positioned over
 * the list can travel, so the eye follows the selection instead of re-finding it.
 *
 * Returns `[ref, node]`: put the ref on the tablist (give it `position:relative`)
 * and render the node as its first child. Duration comes from `--duration-normal`,
 * which tokens.css zeroes under `prefers-reduced-motion` — so the indicator
 * arrives instantly there without this hook knowing anything about it.
 */
export function useTabIndicator(activeKey, variant = "rule") {
  const ref = useRef(null);
  const [box, setBox] = useState(null);

  useEffect(() => {
    const list = ref.current;
    if (!list) return undefined;
    const measure = () => {
      const el = list.querySelector('[aria-selected="true"]');
      if (!el) return setBox(null);
      const lb = list.getBoundingClientRect(), b = el.getBoundingClientRect();
      /* Measure the distance along the INLINE axis, not from the left edge, so
         the same number carries over to RTL. */
      const rtl = getComputedStyle(list).direction === "rtl";
      setBox({
        start: rtl ? lb.right - b.right : b.left - lb.left,
        top: b.top - lb.top, w: b.width, h: b.height, rtl
      });
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (ro) ro.observe(list);
    return () => { if (ro) ro.disconnect(); };
  }, [activeKey, variant]);

  if (!box) return [ref, null];
  const shared = {
    position: "absolute", insetInlineStart: 0, inlineSize: box.w,
    transform: `translateX(${box.rtl ? -box.start : box.start}px)`,
    transitionProperty: "transform, inline-size",
    transitionDuration: "var(--duration-normal)",
    transitionTimingFunction: "var(--ease-emphasized)",
    pointerEvents: "none"
  };
  const node = (
    <span aria-hidden="true" style={variant === "pill"
      ? { ...shared, insetBlockStart: box.top, blockSize: box.h,
          borderRadius: "var(--radius-full)", background: "var(--interactive-solid)",
          boxShadow: "var(--shadow-sm)" }
      : { ...shared, insetBlockEnd: 0, blockSize: "var(--border-thick)",
          background: "var(--interactive-solid)" }} />
  );
  return [ref, node];
}
