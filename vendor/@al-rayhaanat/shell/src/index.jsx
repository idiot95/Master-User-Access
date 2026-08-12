/**
 * @al-rayhaanat/shell — the frames a product lives in.
 *
 * Depends on @al-rayhaanat/tokens, /icons, /ui, /motion, /patterns.
 *
 * Four shells, and they are a choice, not a menu:
 *
 *   AppShell      sidebar + top bar. Requires the md breakpoint and up — below
 *                 it, MobileShell takes over. The default for the admin portal: many
 *                 sections, deep hierarchy, people in it for hours.
 *   MarketingShell top bar only, centred measure. Public site and sign-in.
 *   FocusShell    no navigation at all — one task, one way out. Sign-in,
 *                 onboarding, a destructive confirmation flow.
 *   MobileShell   hamburger drawer + bottom tab bar, 44px targets throughout.
 *
 * Everything here uses logical properties, so the sidebar moves to the right and
 * the drawer enters from the left under `dir="rtl"` with no code change.
 */
"use client";
import React, { useState, useRef, useEffect, useMemo } from "react";
import { Icon, Mark, Spinner } from "@al-rayhaanat/icons";
import { Button, IconButton, Input, SearchField, Avatar, Badge, Divider } from "@al-rayhaanat/ui";
import { Transition, FadeIn } from "@al-rayhaanat/motion";
import { Drawer, Breadcrumb, Tooltip } from "@al-rayhaanat/patterns";

/* ── dropdown, used by the menus below ──────────────────────────────────── */

/** A nested level of a menu. Opens on hover and on click, closes with its parent. */
function SubMenu({ item, onPick }) {
  const [open, setOpen] = useState(false);
  const rowStyle = {
    inlineSize: "100%", display: "flex", alignItems: "center", gap: "var(--space-3)",
    border: 0, cursor: "pointer", textAlign: "start", borderRadius: "var(--radius-sm)",
    paddingInline: "var(--space-3)", paddingBlock: "var(--space-2)",
    fontFamily: "var(--font-body)", fontSize: "var(--text-sm)"
  };
  return (
    <span onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      style={{ position: "relative", display: "block" }}>
      <button role="menuitem" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{ ...rowStyle, background: open ? "var(--surface-sunken)" : "transparent",
          color: "var(--text-primary)" }}>
        {item.icon && <Icon name={item.icon} size={15} />}
        <span style={{ marginInlineEnd: "auto" }}>{item.label}</span>
        <Icon name="chevron-right" size={13} style={{ color: "var(--text-muted)" }} />
      </button>
      <Transition show={open} preset="fade" duration="fast" role="menu"
        style={{ position: "absolute", insetBlockStart: "calc(var(--space-2) * -1)",
          insetInlineStart: "100%", minInlineSize: 200, zIndex: "var(--z-popover)",
          background: "var(--surface-raised)", borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)", borderWidth: "var(--border-hairline)",
          borderStyle: "solid", borderColor: "var(--border)", padding: "var(--space-2)" }}>
        {item.items.map((sub, i) => sub === "-" ? (
          <span key={i} style={{ display: "block", blockSize: 1, background: "var(--border)",
            marginBlock: "var(--space-2)" }} />
        ) : (
          <button key={sub.label} role="menuitem"
            onClick={() => { setOpen(false); onPick && onPick(); sub.run && sub.run(); }}
            style={{ ...rowStyle, background: "transparent",
              color: sub.tone === "danger" ? "var(--danger)" : "var(--text-primary)" }}>
            {sub.icon && <Icon name={sub.icon} size={15} />}
            <span style={{ marginInlineEnd: "auto" }}>{sub.label}</span>
            {sub.shortcut && <kbd className="arh-tnum" style={{ fontFamily: "var(--font-mono)",
              fontSize: "var(--text-3xs)", color: "var(--text-muted)" }}>{sub.shortcut}</kbd>}
          </button>
        ))}
      </Transition>
    </span>
  );
}
function Dropdown({ label, icon, items = [], align = "start", trigger }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <span onClick={() => setOpen(o => !o)} style={{ display: "inline-flex" }}>
        {trigger || (
          <button aria-expanded={open} aria-haspopup="menu"
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
              background: open ? "var(--surface-sunken)" : "transparent", border: 0, cursor: "pointer",
              borderRadius: "var(--radius-sm)", paddingInline: "var(--space-3)", paddingBlock: "var(--space-2)",
              fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>
            {icon && <Icon name={icon} size={15} />}{label}
            <Icon name="chevron-down" size={13} mirror={false} style={{ color: "var(--text-muted)" }} />
          </button>
        )}
      </span>
      <Transition show={open} preset="fade-down" duration="fast" role="menu"
        style={{ position: "absolute", insetBlockStart: "calc(100% + var(--space-2))",
          [align === "end" ? "insetInlineEnd" : "insetInlineStart"]: 0, minInlineSize: 200,
          zIndex: "var(--z-dropdown)", background: "var(--surface-raised)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
          borderWidth: "var(--border-hairline)", borderStyle: "solid", borderColor: "var(--border)",
          padding: "var(--space-2)" }}>
        {items.map((item, i) => item === "-" ? (
          <span key={i} style={{ display: "block", blockSize: 1, background: "var(--border)",
            marginBlock: "var(--space-2)" }} />
        ) : item.items ? (
          <SubMenu key={item.label} item={item} onPick={() => setOpen(false)} />
        ) : item.heading ? (
          <span key={item.label} style={{ display: "block", paddingInline: "var(--space-3)",
            paddingBlock: "var(--space-2) var(--space-1)", fontSize: "var(--text-3xs)",
            letterSpacing: "var(--tracking-kicker)", textTransform: "uppercase",
            color: "var(--text-muted)" }}>{item.label}</span>
        ) : (
          <button key={item.label} role="menuitem" onClick={() => { setOpen(false); item.run && item.run(); }}
            style={{ inlineSize: "100%", display: "flex", alignItems: "center", gap: "var(--space-3)",
              background: "transparent", border: 0, cursor: "pointer", textAlign: "start",
              borderRadius: "var(--radius-sm)", paddingInline: "var(--space-3)", paddingBlock: "var(--space-2)",
              fontFamily: "var(--font-body)", fontSize: "var(--text-sm)",
              color: item.tone === "danger" ? "var(--danger)" : "var(--text-primary)" }}>
            {item.icon && <Icon name={item.icon} size={15} />}
            <span style={{ marginInlineEnd: "auto" }}>{item.label}</span>
            {item.shortcut && <kbd style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-3xs)",
              color: "var(--text-muted)" }}>{item.shortcut}</kbd>}
          </button>
        ))}
      </Transition>
    </span>
  );
}
export { Dropdown };

/** A desktop menu bar — File / Edit style, for tool-shaped products. */
export function MenuBar({ menus = [] }) {
  return (
    <div role="menubar" style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
      {menus.map(m => <Dropdown key={m.label} label={m.label} items={m.items} />)}
    </div>
  );
}

/** The signed-in identity, and the things that hang off it. */
export function UserMenu({ name, initials, role, items = [] }) {
  return (
    <Dropdown align="end" items={items} trigger={
      <button style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-3)",
        background: "transparent", border: 0, cursor: "pointer", borderRadius: "var(--radius-full)",
        padding: "var(--space-1)" }}>
        <Avatar initials={initials} size={30} />
        <span style={{ display: "grid", textAlign: "start", lineHeight: 1.25 }}>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-primary)" }}>{name}</span>
          {role && <span style={{ fontSize: "var(--text-3xs)", color: "var(--text-muted)" }}>{role}</span>}
        </span>
        <Icon name="chevron-down" size={13} mirror={false} style={{ color: "var(--text-muted)" }} />
      </button>
    } />
  );
}

/** Top bar. `dense` for the app shell, tall for marketing. */
export function TopBar({ brand = "al-Rayhaanat", items = [], current, menus, search, actions, user, dense, subNav, sticky, style, ...rest }) {
  return (
    <div style={{ position: sticky ? "sticky" : undefined, insetBlockStart: sticky ? 0 : undefined,
      zIndex: sticky ? "var(--z-sticky)" : undefined, background: "var(--surface)",
      borderBlockEnd: "var(--border-hairline) solid var(--border)", ...style }} {...rest}>
    <header style={{ display: "flex", alignItems: "center", flexWrap: "wrap",
      gap: "var(--space-4) var(--space-5)",
      paddingInline: "var(--space-6)", paddingBlock: dense ? "var(--space-3)" : "var(--space-5)" }}>
      <span style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <Mark size={dense ? 22 : 26} />
        <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--weight-semibold)",
          fontSize: dense ? "var(--text-md)" : "var(--text-lg)" }}>{brand}</span>
      </span>
      {menus ? <MenuBar menus={menus} /> : (
        <nav style={{ display: "flex", gap: "var(--space-5)" }}>
          {items.map(i => {
            const label = i.label ?? i;
            const on = label === current;
            return (
              <a key={label} href={i.href || "#"} aria-current={on ? "page" : undefined}
                style={{ fontSize: "var(--text-sm)", textDecoration: "none",
                  color: on ? "var(--interactive)" : "var(--text-secondary)" }}>{label}</a>
            );
          })}
        </nav>
      )}
      <span style={{ marginInlineStart: "auto", display: "flex", alignItems: "center",
        gap: "var(--space-3)", flexWrap: "wrap", minInlineSize: 0 }}>
        {search && <SearchField size="sm" placeholder="Search records"
          style={{ flex: "1 1 140px", minInlineSize: 120, maxInlineSize: 240 }} />}
        {actions}
        {user && <UserMenu {...user} />}
      </span>
    </header>
    {subNav && (
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)",
        flexWrap: "wrap", paddingInline: "var(--space-6)",
        paddingBlock: "var(--space-2)",
        borderBlockStart: "var(--border-hairline) solid var(--border)" }}>{subNav}</div>
    )}
    </div>
  );
}

/** Grouped sidebar navigation. Collapses to icons, keeps its labels as tooltips. */
/**
 * Grouped, multi-level sidebar navigation.
 *
 *   groups: [{ label, items: [{ label, icon, count, href, children: [...] }] }]
 *
 * Level 1 is the group heading — a label, not a destination. Level 2 is a
 * destination, or a disclosure when it carries `children`. Level 3 is a
 * destination indented to the icon column and marked by a hairline, so the trail
 * reads without a second icon set. Three levels is the limit: a fourth means the
 * information architecture is wrong, not the component.
 */
export function SideNav({ groups = [], current, collapsed, onToggleCollapsed, footer,
  brand = "Bindery", onNavigate, fluid, touch, style, ...rest }) {
  /* touch: every row becomes a 44px target and the third level keeps body size,
     so the drawer carries the SAME tree as the rail without shrinking it. */
  const rowPad = touch
    ? { minBlockSize: 44, paddingBlock: "var(--space-2)", fontSize: "var(--text-md)" }
    : { paddingBlock: "var(--space-2)", fontSize: "var(--text-sm)" };
  const kidPad = touch
    ? { minBlockSize: 44, paddingBlock: "var(--space-2)", fontSize: "var(--text-sm)" }
    : { paddingBlock: "var(--space-2)", fontSize: "var(--text-xs)" };
  const trail = useMemo(() => {
    const open = new Set();
    groups.forEach(g => (g.items || []).forEach(i => {
      if (i.children && (i.defaultOpen || i.label === current ||
        i.children.some(c => c.label === current))) open.add(i.label);
    }));
    return open;
  }, [groups, current]);
  const [expanded, setExpanded] = useState(trail);
  useEffect(() => setExpanded(prev => new Set([...prev, ...trail])), [trail]);
  const toggleBranch = label => setExpanded(s => {
    const next = new Set(s); next.has(label) ? next.delete(label) : next.add(label); return next;
  });
  const width = fluid ? "100%" : collapsed ? 64 : 240;
  return (
    <aside style={{ inlineSize: width, transitionProperty: "inline-size",
      transitionDuration: "var(--duration-normal)", transitionTimingFunction: "var(--ease-standard)",
      background: "var(--surface-sunken)", borderInlineEnd: "var(--border-hairline) solid var(--border)",
      display: "grid", gridTemplateRows: "auto minmax(0,1fr) auto", gap: "var(--space-5)",
      paddingBlock: "var(--space-5)", overflow: "hidden", ...style }} {...rest}>
      <div style={{ display: brand === false && !onToggleCollapsed ? "none" : "flex",
        alignItems: "center",
        gap: "var(--space-3)", justifyContent: collapsed ? "center" : undefined,
        paddingInline: collapsed ? 0 : "var(--space-4)" }}>
        {/* Collapsed, the rail is 64px and the toggle takes the mark's place —
            rendering only the mark there left no way back out, which made
            collapsing a one-way door. */}
        {(!collapsed || !onToggleCollapsed) && <Mark size={22} />}
        {!collapsed && (
          <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--weight-semibold)",
            fontSize: "var(--text-md)", whiteSpace: "nowrap", marginInlineEnd: "auto" }}>{brand}</span>
        )}
        {onToggleCollapsed && (
          <IconButton size="sm" variant="ghost" name="menu"
            label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
            onClick={onToggleCollapsed} />
        )}
      </div>

      <nav style={{ overflow: "auto", overscrollBehavior: "contain",
        display: "grid", gap: "var(--space-5)", alignContent: "start",
        paddingInline: collapsed ? "var(--space-2)" : "var(--space-3)" }}>
        {groups.map(group => (
          <div key={group.label || "main"} style={{ display: "grid", gap: "var(--space-1)" }}>
            {group.label && !collapsed && (
              <span style={{ fontSize: "var(--text-3xs)", letterSpacing: "var(--tracking-kicker)",
                textTransform: "uppercase", color: "var(--text-muted)",
                paddingInline: "var(--space-3)", paddingBlockEnd: "var(--space-2)" }}>{group.label}</span>
            )}
            {group.items.map(item => {
              const on = item.label === current;
              const openBranch = expanded.has(item.label);
              const childActive = item.children && item.children.some(c => c.label === current);
              if (item.children && !collapsed) {
                return (
                  <div key={item.label} style={{ display: "grid" }}>
                    <button onClick={() => toggleBranch(item.label)} aria-expanded={openBranch}
                      style={{ display: "flex", alignItems: "center", gap: "var(--space-3)",
                        paddingInline: "var(--space-3)", ...rowPad,
                        borderRadius: "var(--radius-md)", border: 0, cursor: "pointer",
                        textAlign: "start", fontFamily: "var(--font-body)",
                        whiteSpace: "nowrap",
                        color: childActive ? "var(--interactive)" : "var(--text-secondary)",
                        background: childActive && !openBranch ? "var(--interactive-subtle)" : "transparent" }}>
                      {item.icon ? <Icon name={item.icon} size={16} /> : <Mark size={14} tone="quiet" />}
                      <span style={{ marginInlineEnd: "auto" }}>{item.label}</span>
                      {item.count !== undefined && (
                        <span className="arh-tnum" style={{ fontSize: "var(--text-2xs)",
                          color: "var(--text-muted)" }}>{item.count}</span>
                      )}
                      <Icon name={openBranch ? "chevron-up" : "chevron-down"} size={13} mirror={false}
                        style={{ color: "var(--text-muted)" }} />
                    </button>
                    {openBranch && (
                      <div style={{ display: "grid", gap: 1,
                        marginInlineStart: "calc(var(--space-3) + 8px)",
                        paddingInlineStart: "var(--space-3)",
                        borderInlineStart: "var(--border-hairline) solid var(--border-strong)" }}>
                        {item.children.map(child => {
                          const kidOn = child.label === current;
                          return (
                            <a key={child.label} href={child.href || "#"}
                              aria-current={kidOn ? "page" : undefined}
                              onClick={onNavigate ? () => onNavigate(child) : undefined}
                              style={{ display: "flex", alignItems: "center", gap: "var(--space-2)",
                                paddingInline: "var(--space-3)", ...kidPad,
                                borderRadius: "var(--radius-sm)", textDecoration: "none",
                                whiteSpace: "nowrap",
                                color: kidOn ? "var(--interactive)" : "var(--text-muted)",
                                background: kidOn ? "var(--interactive-subtle)" : "transparent" }}>
                              <span style={{ marginInlineEnd: "auto" }}>{child.label}</span>
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              const row = (
                <a key={item.label} href={item.href || "#"} aria-current={on ? "page" : undefined}
                  onClick={onNavigate ? () => onNavigate(item) : undefined}
                  /* Collapsed, the label is not rendered and the icon is
                     aria-hidden — without these the link has no accessible name
                     at all, and no tooltip. */
                  aria-label={collapsed ? item.label : undefined}
                  title={collapsed ? item.label : undefined}
                  style={{ display: "flex", alignItems: "center",
                    gap: collapsed ? 0 : "var(--space-3)",
                    justifyContent: collapsed ? "center" : undefined,
                    inlineSize: collapsed ? 44 : undefined, blockSize: collapsed ? 40 : undefined,
                    paddingInline: collapsed ? 0 : "var(--space-3)",
                    ...(collapsed ? { paddingBlock: 0 } : rowPad),
                    borderRadius: "var(--radius-md)", textDecoration: "none",
                    fontSize: "var(--text-sm)", whiteSpace: "nowrap",
                    color: on ? "var(--interactive)" : "var(--text-secondary)",
                    background: on ? "var(--interactive-subtle)" : "transparent",
                    boxShadow: on ? "inset 0 0 0 1px var(--interactive-solid)" : "none" }}>
                  {item.icon ? <Icon name={item.icon} size={16} /> : <Mark size={14} tone="quiet" />}
                  {!collapsed && <span style={{ marginInlineEnd: "auto" }}>{item.label}</span>}
                  {!collapsed && item.count !== undefined && (
                    <span style={{ fontSize: "var(--text-2xs)", fontFeatureSettings: "'tnum'",
                      color: "var(--text-muted)" }}>{item.count}</span>
                  )}
                </a>
              );
              return collapsed ? <Tooltip key={item.label} label={item.label} side="block-end">{row}</Tooltip> : row;
            })}
          </div>
        ))}
      </nav>

      {/* The expand control used to live here, so collapsing moved it from the
          top of the rail to the bottom and it read as gone. It is in the header
          now, in one place, whichever state the rail is in. */}
      <div style={{ paddingInline: collapsed ? 0 : "var(--space-4)",
        display: collapsed ? "grid" : undefined, justifyItems: collapsed ? "center" : undefined }}>
        {footer}
      </div>
    </aside>
  );
}

/** Breadcrumb, title, description, actions, and an optional tab row. */
export function PageHeader({ breadcrumb, title, description, actions, tabs, meta }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-4)", paddingBlockEnd: "var(--space-5)",
      borderBlockEnd: tabs ? undefined : "var(--border-hairline) solid var(--border)" }}>
      {breadcrumb && <Breadcrumb items={breadcrumb} />}
      <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-5)", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: "var(--space-2)", marginInlineEnd: "auto", maxInlineSize: "70ch" }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: "var(--weight-regular)",
            fontSize: "var(--text-3xl)", lineHeight: "var(--leading-3xl)" }}>{title}</h1>
          {description && <p style={{ margin: 0, fontSize: "var(--text-sm)",
            color: "var(--text-secondary)" }}>{description}</p>}
          {meta && <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap",
            fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{meta}</div>}
        </div>
        {actions && <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>{actions}</div>}
      </div>
      {tabs}
    </div>
  );
}

/** A row of tools above a list: filters, view switch, bulk actions. */
export function Toolbar({ children, style }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap",
      paddingBlock: "var(--space-3)", ...style }}>{children}</div>
  );
}

/**
 * The admin frame: sidebar + top bar + scrolling main.
 *
 * The root is exactly one viewport tall, because everything under it depends on
 * that: `main` can only scroll against a bounded parent, a sticky TopBar can
 * only stick inside one, and SideNav takes its height from the flex row rather
 * than from its own content. Left unbounded the shell shrink-wraps to whatever
 * it contains — the rail then stops mid-page with bare ground beneath it, and a
 * long page scrolls the document and `main` at the same time.
 *
 * `dvh` rather than `vh` so mobile browser chrome does not clip the last rows.
 * `style` still spreads last, so a host that genuinely wants a different height
 * can say so.
 */
export function AppShell({ sideNav, topBar, header, children, style }) {
  return (
    <div style={{ display: "flex", blockSize: "100dvh", background: "var(--canvas)",
      color: "var(--text-primary)", fontFamily: "var(--font-body)", ...style }}>
      {sideNav}
      {/* minBlockSize: 0 belongs here, on the flex item: it is what lets the grid
          row shrink below its content so `main` can scroll. On the root it did
          nothing except stop the shell filling the viewport. */}
      <div style={{ flex: 1, minInlineSize: 0, minBlockSize: 0, display: "grid",
        gridTemplateRows: `${topBar ? "auto " : ""}minmax(0,1fr)` }}>
        {topBar}
        <main style={{ overflow: "auto", padding: "var(--space-6)" }}>
          <FadeIn preset="fade-up" duration="fast">
            {header}
            {children}
          </FadeIn>
        </main>
      </div>
    </div>
  );
}

/**
 * Public site and sign-in pages: top bar, centred measure, no chrome.
 *
 * A *minimum* of one viewport, not a fixed one: this shell has no internal
 * scroll region, so a long page is meant to scroll the document. The minimum
 * only stops a short page — a sign-in form, a 404 — from leaving bare ground
 * below the footer.
 */
export function MarketingShell({ topBar, children, footer, style }) {
  return (
    <div style={{ background: "var(--canvas)", color: "var(--text-primary)",
      fontFamily: "var(--font-body)", display: "grid",
      gridTemplateRows: "auto minmax(0,1fr) auto", minBlockSize: "100dvh", ...style }}>
      {topBar}
      <main style={{ inlineSize: "100%", maxInlineSize: 1080, marginInline: "auto",
        paddingInline: "var(--space-6)", paddingBlock: "var(--space-9)" }}>{children}</main>
      {footer && <footer style={{ borderBlockStart: "var(--border-hairline) solid var(--border)",
        padding: "var(--space-6)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{footer}</footer>}
    </div>
  );
}

/**
 * One task, one way out. No navigation to wander into.
 *
 * A minimum rather than a fixed height, for the same reason as MarketingShell:
 * the single centred panel usually falls well short of the viewport, and the
 * task is allowed to be taller than one screen.
 */
export function FocusShell({ title, description, exitLabel = "Back", onExit, children, style }) {
  return (
    <div style={{ background: "var(--canvas)", color: "var(--text-primary)",
      fontFamily: "var(--font-body)", display: "grid", gridTemplateRows: "auto minmax(0,1fr)",
      minBlockSize: "100dvh", ...style }}>
      <header style={{ display: "flex", alignItems: "center", gap: "var(--space-4)",
        padding: "var(--space-4) var(--space-6)",
        borderBlockEnd: "var(--border-hairline) solid var(--border)" }}>
        <Mark size={22} />
        <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--weight-semibold)",
          fontSize: "var(--text-sm)", marginInlineEnd: "auto" }}>{title}</span>
        <Button size="sm" variant="ghost" icon="x" onClick={onExit}>{exitLabel}</Button>
      </header>
      <main style={{ display: "grid", placeItems: "center", padding: "var(--space-8) var(--space-6)" }}>
        <div style={{ inlineSize: "100%", maxInlineSize: 420, display: "grid", gap: "var(--space-5)" }}>
          {description && <p style={{ margin: 0, fontSize: "var(--text-sm)",
            color: "var(--text-secondary)" }}>{description}</p>}
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * Phone frame: hamburger drawer for the full navigation, bottom tab bar for the
 * four places people go constantly. Every target is at least 44px.
 */
export function MobileShell({ brand = "Bindery", groups = [], tabs = [], current, title,
  actions, onNavigate, defaultMenuOpen, contained, children, style }) {
  const [menu, setMenu] = useState(!!defaultMenuOpen);
  const close = item => { setMenu(false); onNavigate && onNavigate(item); };
  return (
    <div style={{ background: "var(--canvas)", color: "var(--text-primary)",
      fontFamily: "var(--font-body)", display: "grid",
      gridTemplateRows: "auto minmax(0,1fr) auto", minBlockSize: 0,
      /* contained: this root is the drawer's containing block, so the overlay
         stays inside the phone frame instead of covering the document */
      position: contained ? "relative" : undefined,
      overflow: contained ? "hidden" : undefined,
      /* Fill whatever box we are in: the frame when contained, the viewport
         otherwise. Either way it must be bounded — `main` scrolls internally and
         the tab bar is pinned to the last grid row, and neither works against a
         shell that shrink-wraps to its content. */
      blockSize: contained ? "100%" : "100dvh", ...style }}>
      <header style={{ display: "flex", alignItems: "center", gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)", background: "var(--surface)",
        borderBlockEnd: "var(--border-hairline) solid var(--border)" }}>
        <IconButton name="menu" label="Open navigation" variant="ghost" size="lg"
          onClick={() => setMenu(true)} />
        <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--weight-semibold)",
          fontSize: "var(--text-md)", marginInlineEnd: "auto" }}>{title || brand}</span>
        {actions || <IconButton name="search" label="Search" variant="ghost" size="lg" />}
      </header>

      <main style={{ overflow: "auto", padding: "var(--space-5) var(--space-4)" }}>{children}</main>

      <nav style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "1fr",
        background: "var(--surface)", borderBlockStart: "var(--border-hairline) solid var(--border)" }}>
        {tabs.map(t => {
          const on = t.label === current;
          return (
            <a key={t.label} href={t.href || "#"} aria-current={on ? "page" : undefined}
              style={{ minBlockSize: 56, display: "grid", justifyItems: "center", alignContent: "center",
                gap: "var(--space-1)", textDecoration: "none", fontSize: "var(--text-3xs)",
                color: on ? "var(--interactive)" : "var(--text-muted)" }}>
              {t.icon ? <Icon name={t.icon} size={20} /> : <Mark size={18} />}
              {t.label}
            </a>
          );
        })}
      </nav>

      {/* The hamburger drawer holds the SAME multi-level nav as the desktop
          rail — one component, one information architecture, so a phone user
          and a desk user learn the same structure. */}
      <Drawer open={menu} onClose={() => setMenu(false)} title={brand} side="start" width={296} touch contained={contained}>
        <SideNav groups={groups} current={current} brand={false} fluid touch
          onNavigate={close}
          style={{ background: "transparent", borderInlineEnd: 0, paddingBlock: 0 }} />
      </Drawer>
    </div>
  );
}
