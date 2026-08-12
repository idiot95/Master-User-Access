/**
 * The design system ships source JSX rather than a built bundle, and Next does
 * not transpile dependencies by default. `transpilePackages` is the one line
 * every consumer of @al-rayhaanat/* needs.
 *
 * The packages are vendored under vendor/@al-rayhaanat and referenced with
 * `file:` paths, so they resolve from a clean clone with no registry, no token
 * and no sibling checkout. Run `npm run vendor:ds` to pull upstream changes in.
 */
const ARH = [
  "tokens", "contracts", "icons", "motion", "ui", "prose",
  "table", "filters", "patterns", "forms", "shell", "charts", "slides", "system",
].map((p) => `@al-rayhaanat/${p}`);

export default {
  transpilePackages: ARH,
};
