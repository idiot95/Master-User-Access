/**
 * @al-rayhaanat/motion — the system's movement, in one place.
 *
 * Depends on @al-rayhaanat/tokens only.
 *
 * DEVIATION ON RECORD: §3.5 says wrap Framer Motion rather than hand-roll.
 * This is a hand-rolled CSS-transition layer, for the same reason as /table and
 * /patterns: no npm install in the review environment. The API is deliberately
 * Framer-shaped — a `show` boolean, named enter/exit presets, a `Stagger`
 * container — so swapping in `AnimatePresence` + `motion.div` is a change inside
 * these five components and nothing else. Framer earns its place the moment you
 * need layout animation, drag, or spring interruption; until then CSS is cheaper
 * and never blocks the main thread.
 *
 * `prefers-reduced-motion` is handled HERE, once. No product component, and no
 * individual developer, has to remember it: durations collapse to zero in the
 * token layer and every component below also drops its transform.
 */
"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";

/** True when the user has asked for less movement. Live — it re-renders on change. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = e => setReduced(e.matches);
    mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on));
  }, []);
  return reduced;
}

const MS = { instant: 0, fast: 120, normal: 200, slow: 320, deliberate: 480 };

/** Named entrances. Each is [hidden, visible] transform pairs. */
export const PRESETS = {
  fade: { from: { opacity: 0 }, to: { opacity: 1 } },
  "fade-up": { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "none" } },
  "fade-down": { from: { opacity: 0, transform: "translateY(-8px)" }, to: { opacity: 1, transform: "none" } },
  "slide-inline": { from: { opacity: 0, transform: "translateX(calc(12px * var(--icon-flip, 1)))" }, to: { opacity: 1, transform: "none" } },
  scale: { from: { opacity: 0, transform: "scale(0.97)" }, to: { opacity: 1, transform: "none" } },
  bloom: { from: { opacity: 0, transform: "scale(0.86)" }, to: { opacity: 1, transform: "none" } }
};

/**
 * Mount/unmount with an enter and an exit. Keeps the node in the DOM until the
 * exit finishes, which is the whole reason this component exists.
 *
 * `preset` from PRESETS · `duration` a token name · `delay` in ms.
 */
export function Transition({
  show = true, preset = "fade", duration = "normal", exitDuration, delay = 0,
  as = "div", children, style, ...rest
}) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(show);
  const [visible, setVisible] = useState(false);
  /* `will-change` is a promise to the compositor, and an expensive one to leave
     standing: it creates a stacking context AND becomes the containing block for
     any descendant `position: fixed`. Left on permanently it traps every popover
     and menu inside this element's stacking context, and it makes a fixed modal
     scrim size itself to this element rather than the viewport. So the hint is
     held only while the transition is actually running, and dropped after. */
  const [animating, setAnimating] = useState(false);
  const timer = useRef(null);
  const enterMs = reduced ? 0 : MS[duration] ?? MS.normal;
  const exitMs = reduced ? 0 : MS[exitDuration || duration] ?? enterMs;

  useEffect(() => {
    clearTimeout(timer.current);
    if (show) {
      setMounted(true);
      timer.current = setTimeout(() => setVisible(true), 16 + delay);
    } else {
      setVisible(false);
      timer.current = setTimeout(() => setMounted(false), exitMs);
    }
    return () => clearTimeout(timer.current);
  }, [show, delay, exitMs]);

  useEffect(() => {
    if (reduced) { setAnimating(false); return undefined; }
    setAnimating(true);
    const ms = (visible ? enterMs : exitMs) + 60;
    const t = setTimeout(() => setAnimating(false), ms);
    return () => clearTimeout(t);
  }, [visible, reduced, enterMs, exitMs]);

  if (!mounted) return null;
  const p = PRESETS[preset] || PRESETS.fade;
  const Tag = as;
  return (
    <Tag style={{
      transitionProperty: "opacity, transform",
      transitionDuration: `${visible ? enterMs : exitMs}ms`,
      transitionTimingFunction: visible ? "var(--ease-emphasized)" : "var(--ease-exit)",
      willChange: animating && !reduced ? "opacity, transform" : undefined,
      ...(reduced ? { opacity: visible ? 1 : 0 } : (visible ? p.to : p.from)),
      ...style
    }} {...rest}>{children}</Tag>
  );
}

/** The common case: appear once, on mount. */
export function FadeIn({ preset = "fade-up", delay = 0, children, ...rest }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 16); return () => clearTimeout(t); }, []);
  return <Transition show={on} preset={preset} delay={delay} {...rest}>{children}</Transition>;
}

/** Height disclosure. Animates the block size, not `display`. */
export function Collapse({ open, children, duration = "normal", style }) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const [height, setHeight] = useState(open ? "auto" : 0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduced) { setHeight(open ? "auto" : 0); return; }
    if (open) {
      setHeight(node.scrollHeight);
      const t = setTimeout(() => setHeight("auto"), MS[duration] ?? MS.normal);
      return () => clearTimeout(t);
    }
    setHeight(node.scrollHeight);
    requestAnimationFrame(() => setHeight(0));
  }, [open, reduced, duration]);
  return (
    <div style={{ blockSize: height, overflow: height === "auto" ? "visible" : "hidden",
      transitionProperty: "block-size", transitionDuration: reduced ? "0ms" : `var(--duration-${duration})`,
      transitionTimingFunction: "var(--ease-standard)", ...style }}>
      <div ref={ref}>{children}</div>
    </div>
  );
}

/** Children enter in sequence. `step` is the gap between them, in ms. */
export function Stagger({ step = 60, preset = "fade-up", children, style, ...rest }) {
  const reduced = useReducedMotion();
  const items = React.Children.toArray(children);
  return (
    <div style={style} {...rest}>
      {items.map((child, i) => (
        <FadeIn key={i} preset={preset} delay={reduced ? 0 : i * step}>{child}</FadeIn>
      ))}
    </div>
  );
}

/**
 * Route-level transition. Key it on the path so a change re-runs the entrance.
 * Deliberately short: a page that takes 400ms to appear feels slower than one
 * that appears at once.
 */
export function PageTransition({ routeKey, children }) {
  return <FadeIn key={routeKey} preset="fade-up" duration="fast">{children}</FadeIn>;
}

/** The motion contract, for documentation and for tests. */
export const MOTION = {
  duration: { ...MS },
  easing: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    emphasized: "cubic-bezier(0.3, 0, 0, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
    spring: "cubic-bezier(0.34, 1.4, 0.64, 1)"
  },
  rules: [
    "Entrances use emphasized easing; exits use exit easing and are faster.",
    "Nothing moves more than 8px on entry — movement points, it does not travel.",
    "Overlays scale from 0.97, never from 0.8; the page is not a slideshow.",
    "One thing moves at a time. Staggers step 60ms and stop after six items.",
    "Anything over 320ms needs a reason written next to it.",
    "prefers-reduced-motion removes transforms and zeroes durations, library-wide."
  ]
};
