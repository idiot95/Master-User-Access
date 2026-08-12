/**
 * @al-rayhaanat/system — the whole system in one dependency.
 *
 * The packages are split so a marketing site does not ship the table core, and
 * so ownership is legible. But a product that installs a SUBSET loses behaviour
 * silently: overlays without /motion animate at zero and ignore reduced-motion
 * preferences; /ui without the token stylesheet renders unstyled; /filters
 * without /table has a bar and nothing to filter. So this package exists: one
 * install, every dependency, no missing UX.
 *
 *   npm i @al-rayhaanat/system
 *   import "@al-rayhaanat/system/tokens.css";   // once, at the root
 *   import { Button, DataTable, AppShell, Callout } from "@al-rayhaanat/system";
 *
 * Reach for the individual packages only when bundle size is measured and the
 * saving is real — and then read packages/README.md for what each one needs.
 */
export * as tokens from "@al-rayhaanat/tokens";
export * from "@al-rayhaanat/contracts";
export * from "@al-rayhaanat/icons";
export * from "@al-rayhaanat/motion";
export * from "@al-rayhaanat/ui";
export * from "@al-rayhaanat/prose";
export * from "@al-rayhaanat/table";
export * from "@al-rayhaanat/filters";
export * from "@al-rayhaanat/patterns";
export * from "@al-rayhaanat/forms";
export * from "@al-rayhaanat/shell";
export * from "@al-rayhaanat/charts";
export * from "@al-rayhaanat/slides";
