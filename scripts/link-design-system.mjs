#!/usr/bin/env node
/**
 * Symlinks @al-rayhaanat/* from a local checkout into node_modules.
 *
 * The design system is published to GitHub Packages and needs a PAT with
 * read:packages. Until that exists, this reproduces what `npm i` would have
 * produced — real entries in node_modules, resolved through each package's own
 * exports map. Nothing else in the app knows the difference, so removing this
 * step later changes no application code.
 *
 * Usage: node scripts/link-design-system.mjs [path-to-packages]
 */
import { mkdir, symlink, rm, stat } from "node:fs/promises";
import path from "node:path";

const PACKAGES = [
  "tokens", "contracts", "icons", "motion", "ui", "prose",
  "table", "filters", "patterns", "forms", "shell", "charts", "slides", "system",
];

const src = path.resolve(process.argv[2]
  || process.env.ARH_PATH
  || path.join(process.cwd(), "..", "rayhanat-design-system", "packages"));

const dest = path.join(process.cwd(), "node_modules", "@al-rayhaanat");

const exists = async (p) => !!(await stat(p).catch(() => null));

if (!(await exists(src))) {
  console.error(`design system not found at ${src}`);
  console.error("pass the path, or set ARH_PATH, or add a GitHub PAT and npm install instead.");
  process.exit(1);
}

await mkdir(dest, { recursive: true });
let linked = 0;
for (const p of PACKAGES) {
  const from = path.join(src, p);
  if (!(await exists(from))) { console.warn(`  skip ${p} (not in the checkout)`); continue; }
  const to = path.join(dest, p);
  await rm(to, { recursive: true, force: true });
  await symlink(from, to, "junction");
  linked++;
}
console.log(`linked ${linked} @al-rayhaanat packages from ${src}`);
