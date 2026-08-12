/**
 * @al-rayhaanat/contracts — the behaviour every component owes its caller.
 *
 * Depends on @al-rayhaanat/tokens and /ui.
 *
 * A design system that only specifies appearance drifts the moment two teams
 * build the same interaction differently. This file is the other half: for each
 * component family, the states it must carry, the keys it must answer, the ARIA
 * it must emit, what it must do under RTL and reduced motion, and what it must
 * never do. It is data, not prose, so the same list drives the documentation
 * board, the review checklist and the test suite:
 *
 *   import { CONTRACTS } from "@al-rayhaanat/contracts";
 *   CONTRACTS.forEach(c => describe(c.family, () => c.tests.forEach(t => it(t, …))));
 */
"use client";
import React from "react";
import { Icon } from "@al-rayhaanat/icons";

export const CONTRACTS = [
  {
    family: "Action — Button, IconButton, Link",
    states: "rest · hover · active · focus-visible · disabled · loading",
    keyboard: "Enter and Space activate. Never a div with an onClick.",
    aria: "Accessible name always; IconButton requires label. aria-busy while loading; disabled is the real attribute, not opacity.",
    rtl: "Leading icon sits inline-start and swaps side with dir; directional glyphs mirror.",
    motion: "Colour transitions at --duration-fast; nothing moves position.",
    never: "Never two primaries in one action group. Never a spinner replacing the label without keeping the width.",
    tests: [
      "renders a native button or anchor",
      "focus-visible paints the 2px accent ring at 2px offset",
      "loading sets aria-busy and blocks the press",
      "disabled sets the attribute and drops pointer events"
    ]
  },
  {
    family: "Field — Input, Textarea, Select, SearchField",
    states: "rest · hover · focus · invalid · disabled · read-only",
    keyboard: "Tab reaches it; Escape reverts an in-progress inline edit.",
    aria: "Label associated by id. aria-invalid when invalid, aria-describedby pointing at hint or error — the error replaces the hint, never both.",
    rtl: "Text direction from dir; the select chevron and any affix move to the inline-end edge.",
    motion: "Border colour only, at --duration-fast.",
    never: "Never placeholder-as-label. Never a disabled field without a reason in the hint.",
    tests: [
      "label[for] resolves to the control id",
      "aria-describedby names the error when invalid and the hint otherwise",
      "soft variant renders no border and one shadow step"
    ]
  },
  {
    family: "Selection — Checkbox, Radio, Switch, Segmented",
    states: "unchecked · checked · indeterminate (checkbox) · invalid · disabled · focus",
    keyboard: "Space toggles. Arrow keys move within a radio group and respect dir.",
    aria: "Native inputs, or role=switch with aria-checked. Groups take a fieldset and a legend, never a floating label.",
    rtl: "The switch knob travels toward the inline-end edge.",
    motion: "Knob and fill at --duration-fast; no bounce.",
    never: "Never a switch for a value that only applies on submit — that is a checkbox.",
    tests: [
      "toggles on Space",
      "radio group is a fieldset with a legend",
      "switch exposes role=switch and aria-checked"
    ]
  },
  {
    family: "Overlay — Modal, Drawer, BottomSheet, ConfirmDialog",
    states: "closed · open · closing",
    keyboard: "Escape closes. Tab is trapped inside. Focus starts on the first control and returns to the trigger on close.",
    aria: "role=dialog, aria-modal, an accessible name; background scroll locked while open.",
    rtl: "Drawer enters from the inline edge named by side, so it mirrors without code.",
    motion: "Backdrop fades at fast; panel scales or slides at normal; both zero under reduced motion.",
    never: "Never a second overlay over the first. Never a destructive confirm whose primary is 'OK'.",
    tests: [
      "Escape closes and focus returns to the trigger",
      "Tab cycles within the panel",
      "body scroll is locked while open and restored after"
    ]
  },
  {
    family: "Disclosure — Tabs, Accordion, Popover, Tooltip",
    states: "collapsed · expanded · hover (tooltip) · focus",
    keyboard: "Tabs: one tab stop, arrows move and respect dir. Accordion: Enter/Space toggles. Popover and tooltip: Escape dismisses.",
    aria: "aria-expanded on every trigger; role=tablist/tab/tabpanel wired; a tooltip is referenced by aria-describedby, never by title alone.",
    rtl: "Arrow direction swaps; the indicator stays on the same physical edge as the text baseline.",
    motion: "Height animates measured, never display; panels at normal.",
    never: "Never hide essential content in a tooltip. Never more than six tabs — that is navigation.",
    tests: [
      "arrow keys move the active tab and honour dir",
      "aria-expanded flips on the accordion trigger",
      "tooltip content is reachable by screen reader"
    ]
  },
  {
    family: "Data — DataTable, FilteredTable",
    states: "loading · empty · populated · error · row selected · row expanded · cell editing",
    keyboard: "Header cells are buttons; Enter sorts. Double-click or Enter starts an inline edit, Escape cancels, Enter commits.",
    aria: "aria-sort on the sorted header; the selection count is announced; the summary row is a tfoot.",
    rtl: "Column order flips, the sticky edge and the sort caret move with it, numeric cells stay LTR internally.",
    motion: "None on rows. Only the expand region animates.",
    never: "Never squeeze columns to fit — scroll with the first column sticky. Never a card fallback that breaks comparison.",
    tests: [
      "sorting toggles asc, desc, none and sets aria-sort",
      "empty state renders its action",
      "loading renders skeletons in the real column count"
    ]
  },
  {
    family: "Filters — FilterBar, ScopeTabs, QuickFilters, FacetList",
    states: "none applied · applied · saved view active · empty result",
    keyboard: "Every chip is removable by keyboard; the builder is fully operable without a mouse.",
    aria: "Chips announce field, operator and value; the result count is a live region.",
    rtl: "Chips and their remove buttons flow from the inline start.",
    motion: "Bar disclosure at fast.",
    never: "Never a filter state that the URL cannot hold. Never an empty result without a way back.",
    tests: [
      "serializeFilters and parseFilters round-trip exactly",
      "declared presets and the builder write the same group",
      "clearing the last chip restores the full set"
    ]
  },
  {
    family: "Feedback — Toast, Notice, Callout, the four states",
    states: "neutral · success · warning · danger · info",
    keyboard: "Toasts never steal focus; each is dismissible by keyboard.",
    aria: "Toast stack is aria-live=polite; an error state is role=alert; a callout is role=note.",
    rtl: "The stack sits on the inline-end edge and the tone edge on the inline-start.",
    motion: "Enter with fade-up at fast; auto-dismiss timer pauses on hover.",
    never: "Never a toast as the only record of something the user may need tomorrow. Never tone by hue alone.",
    tests: [
      "live region announces the toast text",
      "error state offers a retry and states nothing was changed",
      "empty state carries the action that fills it"
    ]
  },
  {
    family: "Navigation — SideNav, TopBar, MenuBar, Breadcrumb, Pagination",
    states: "rest · hover · current · expanded branch · collapsed rail",
    keyboard: "Menus open on Enter and close on Escape; submenus open on ArrowRight in LTR and ArrowLeft in RTL.",
    aria: "aria-current=page on the active destination; aria-expanded on every branch; menus are role=menu with menuitem children.",
    rtl: "The rail sits on the inline start and mirrors; chevrons flip; the breadcrumb reverses.",
    motion: "Dropdowns fade-down at fast; rail width at normal.",
    never: "Never more than three levels. Never a hamburger above md, and never a menu bar below it.",
    tests: [
      "active destination carries aria-current",
      "branch toggles aria-expanded and reveals its children",
      "the phone drawer renders the same tree as the rail"
    ]
  },
  {
    family: "Content — Prose, Callout, lists, Blockquote, CodeBlock",
    states: "static · truncated · translated (RTL)",
    keyboard: "Nothing interactive except links and code copy.",
    aria: "Semantic elements only — ul/ol/dl/blockquote/figure. Footnotes link both ways.",
    rtl: "Prose flips; Arabic takes the Naskh face and its leading floor; no hyphenation.",
    motion: "None.",
    never: "Never a heading level skipped. Never a list rendered as paragraphs with dashes.",
    tests: [
      "headings descend without skipping a level",
      "lists render as real list elements",
      "Arabic prose resolves to the Arabic family"
    ]
  }
];

/** The contracts, rendered. Same data the tests read. */
export function ContractTable({ contracts = CONTRACTS, style }) {
  const cell = { padding: "var(--space-4)", verticalAlign: "top", fontSize: "var(--text-xs)",
    color: "var(--text-secondary)", borderBlockEnd: "var(--border-hairline) solid var(--border)" };
  const head = { ...cell, color: "var(--text-muted)", fontSize: "var(--text-3xs)",
    letterSpacing: "var(--tracking-kicker)", textTransform: "uppercase",
    fontWeight: "var(--weight-medium)", textAlign: "start", whiteSpace: "nowrap",
    borderBlockEnd: "var(--border-hairline) solid var(--border-strong)" };
  return (
    <div style={{ overflow: "auto", borderWidth: "var(--border-hairline)", borderStyle: "solid",
      borderColor: "var(--border)", borderRadius: "var(--radius-lg)",
      background: "var(--surface)", ...style }}>
      <table style={{ inlineSize: "100%", borderCollapse: "collapse", minInlineSize: 900 }}>
        <thead>
          <tr>
            <th style={{ ...head, minInlineSize: 190 }}>Family</th>
            <th style={head}>States</th>
            <th style={head}>Keyboard</th>
            <th style={head}>ARIA</th>
            <th style={head}>RTL &amp; motion</th>
            <th style={head}>Never</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map(c => (
            <tr key={c.family}>
              <td style={{ ...cell, color: "var(--text-primary)" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: "var(--weight-semibold)",
                  fontSize: "var(--text-sm)" }}>{c.family}</div>
                <div style={{ display: "grid", gap: 4, marginBlockStart: "var(--space-3)" }}>
                  {c.tests.map(t => (
                    <span key={t} style={{ display: "flex", gap: 6, fontSize: "var(--text-3xs)",
                      color: "var(--text-muted)" }}>
                      <Icon name="check" size={11} strokeWidth={2} style={{ color: "var(--success)",
                        marginBlockStart: 3 }} />
                      {t}
                    </span>
                  ))}
                </div>
              </td>
              <td style={cell}>{c.states}</td>
              <td style={cell}>{c.keyboard}</td>
              <td style={cell}>{c.aria}</td>
              <td style={cell}>{c.rtl}<div style={{ marginBlockStart: "var(--space-2)",
                color: "var(--text-muted)" }}>{c.motion}</div></td>
              <td style={{ ...cell, color: "var(--danger)" }}>{c.never}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
