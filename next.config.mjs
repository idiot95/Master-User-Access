/**
 * The design system ships source JSX rather than a built bundle, and Next does
 * not transpile node_modules by default. transpilePackages is the one line
 * every consumer of @al-rayhaanat/* needs.
 *
 * The `root` line is only needed while the packages are symlinked from a
 * sibling checkout (npm run link:ds). Turbopack refuses to resolve through a
 * symlink whose target sits outside the project, so the root is widened to the
 * directory holding both. Once a GitHub PAT is in .npmrc and the packages are
 * installed normally, delete the ARH_LOCAL branch entirely — nothing else in
 * the app depends on it.
 */
import path from "node:path";

const ARH = [
  "tokens", "contracts", "icons", "motion", "ui", "prose",
  "table", "filters", "patterns", "forms", "shell", "charts", "slides", "system",
].map((p) => `@al-rayhaanat/${p}`);

const linkedLocally = process.env.ARH_LOCAL === "1";

export default {
  transpilePackages: ARH,
  ...(linkedLocally ? { turbopack: { root: path.resolve(process.cwd(), "..") } } : {}),
  outputFileTracingRoot: linkedLocally ? path.resolve(process.cwd(), "..") : undefined,
};
