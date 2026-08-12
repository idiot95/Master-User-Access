/**
 * Copy @al-rayhaanat/* into vendor/ so the app builds anywhere.
 *
 * The design system is a pnpm monorepo that has never been published — there
 * are no git tags and the Changesets release workflow has not run — so
 * `npm i @al-rayhaanat/system` 404s with or without a GitHub token. Locally it
 * works only because `npm run link:ds` symlinks a sibling checkout, which a CI
 * builder does not have.
 *
 * Vendoring makes the packages part of this repo: no registry, no PAT, and the
 * build is reproducible from a clean clone.
 *
 * Two rewrites are needed on the way in:
 *   · `workspace:*` is pnpm-only; npm cannot resolve it. Each becomes a
 *     relative `file:` path to its sibling in vendor/.
 *   · nothing else changes, so re-running this pulls upstream fixes straight
 *     through.
 *
 *   node scripts/vendor-design-system.mjs [--from ../rayhanat-design-system]
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const i = process.argv.indexOf("--from");
const SRC = resolve(process.cwd(), i > -1 ? process.argv[i + 1] : "../rayhanat-design-system");
const OUT = resolve(process.cwd(), "vendor/@al-rayhaanat");
const ROOT_PKG = resolve(process.cwd(), "package.json");

const packagesDir = join(SRC, "packages");
if (!existsSync(packagesDir)) {
  console.error(`No packages/ under ${SRC}. Pass --from <path to rayhanat-design-system>.`);
  process.exit(1);
}

const names = readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(packagesDir, d.name, "package.json")))
  .map((d) => d.name);

console.log(`vendoring ${names.length} packages from ${SRC}\n`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const name of names) {
  const from = join(packagesDir, name);
  const to = join(OUT, name);

  // Everything except node_modules — the packages ship source, and the tokens
  // package also carries dist/ and the Arabic font that tokens.css points at.
  cpSync(from, to, {
    recursive: true,
    filter: (p) => !p.includes(`${join(from, "node_modules")}`),
  });

  const pkgPath = join(to, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  for (const field of ["dependencies", "peerDependencies", "devDependencies"]) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const [dep, range] of Object.entries(deps)) {
      if (!String(range).startsWith("workspace:")) continue;
      const local = dep.replace("@al-rayhaanat/", "");
      deps[dep] = `file:../${local}`;
    }
  }
  // devDependencies are the monorepo's own tooling and would drag pnpm-only
  // ranges into a plain npm install.
  delete pkg.devDependencies;
  delete pkg.scripts;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  console.log(`  ${name}`);
}

/* Point the app at the vendored copy. */
const root = JSON.parse(readFileSync(ROOT_PKG, "utf8"));
delete root.optionalDependencies?.["@al-rayhaanat/system"];
if (root.optionalDependencies && !Object.keys(root.optionalDependencies).length) {
  delete root.optionalDependencies;
}
root.dependencies["@al-rayhaanat/system"] = "file:vendor/@al-rayhaanat/system";
root.dependencies = Object.fromEntries(Object.entries(root.dependencies).sort());
writeFileSync(ROOT_PKG, JSON.stringify(root, null, 2) + "\n");

console.log(`\nvendor/@al-rayhaanat — ${names.length} packages`);
console.log("package.json now depends on file:vendor/@al-rayhaanat/system");
console.log("\nRe-run this after pulling design-system changes, then `npm install`.");
