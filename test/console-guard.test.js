import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The checklist this console hands every module, turned on itself.
 *
 * `docs/module-integration-prompt.md` ends by telling a module author to list
 * every write path and tick off that each one calls `requireAccess`. Ticking by
 * hand works exactly once — the next action someone adds is the one that gets
 * forgotten, and a missing check here is not "a screen leaks", it is "anyone
 * signed in can grant themselves anything".
 *
 * So the list is derived from the file rather than maintained beside it, the
 * same way mawaqeet does it. A console that demanded this of others and did not
 * do it itself would be worth less than the document.
 */

const SOURCE = readFileSync(new URL("../app/actions.js", import.meta.url), "utf8");
const MANIFEST = JSON.parse(
  readFileSync(new URL("../public/.well-known/access-manifest.json", import.meta.url), "utf8"));

/** Split the module into its exported server actions and their bodies. */
function exportedActions(src) {
  const starts = [];
  const re = /export\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(/g;
  let m;
  while ((m = re.exec(src))) starts.push({ name: m[1], at: m.index });
  return starts.map((s, i) => ({
    name: s.name,
    body: src.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : src.length),
  }));
}

const actions = exportedActions(SOURCE);

/** Everything a resource may legally be asked for: its verbs and its capabilities. */
const declared = new Map(MANIFEST.resources.map((r) => [
  r.key,
  new Set([...(r.vced ?? []), ...(r.capabilities ?? []).map((c) => c.key)]),
]));

test("the console declares itself as a module", () => {
  assert.equal(MANIFEST.module, "user-access");
  assert.ok(MANIFEST.resources.length >= 5);
});

test("actions.js exports the write surface as server actions", () => {
  assert.ok(SOURCE.startsWith('"use server"'));
  assert.ok(actions.length >= 9, `expected the full write surface, found ${actions.length}`);
});

test("every exported action guards before it writes", () => {
  const unguarded = actions.filter((a) => !/\bawait guard\(/.test(a.body));
  assert.deepEqual(unguarded.map((a) => a.name), [],
    "these write without checking access first — that is the whole control, not a courtesy");
});

test("the guard is the first thing each action does", () => {
  // A check after the write has already happened is not a check. Anything
  // between the signature and the guard is a chance to have done something.
  const late = actions.filter((a) => {
    const body = a.body.slice(a.body.indexOf("{") + 1);
    const upToGuard = body.slice(0, body.indexOf("await guard("));
    return /\b(updateRecord|createRecords|bump)\s*\(/.test(upToGuard);
  });
  assert.deepEqual(late.map((a) => a.name), []);
});

test("every resource and action named is declared in our own manifest", () => {
  const bad = [];
  for (const a of actions) {
    for (const call of a.body.matchAll(/await guard\((.*)\);/g)) {
      // An upsert asks for a different right depending on what it finds:
      //   guard("module", str(form, "id") ? "edit" : "create")
      // Both branches must be declared, so every literal counts — but the ones
      // belonging to a nested call do not, or `"id"` would read as a verb.
      const args = call[1].replace(/[A-Za-z_$][\w$]*\([^()]*\)/g, "");
      const strings = [...args.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
      const [resource, ...verbs] = strings;
      if (!declared.has(resource)) { bad.push(`${a.name}: unknown resource "${resource}"`); continue; }
      for (const v of verbs) {
        if (!declared.get(resource).has(v)) bad.push(`${a.name}: "${v}" is not declared on "${resource}"`);
      }
    }
  }
  assert.deepEqual(bad, [],
    "an action the manifest does not declare can never be granted, so it can never be performed");
});

test("no capability is named after a CRUD verb", () => {
  const reserved = new Set(["view", "create", "edit", "delete"]);
  const offenders = MANIFEST.resources
    .flatMap((r) => (r.capabilities ?? []).map((c) => c.key))
    .filter((k) => reserved.has(k));
  assert.deepEqual(offenders, [], "the schema rejects these, and so should we");
});

test("the manifest claims no delete, because nothing here deletes", () => {
  // The rule the brief presses hardest: declare only what you have a code path
  // for. This app expires and empties; it never removes a row.
  const claimsDelete = MANIFEST.resources.filter((r) => (r.vced ?? []).includes("delete"));
  assert.deepEqual(claimsDelete.map((r) => r.key), []);
  assert.equal(/\b(deleteRecord|removeRow|deleteRow)\s*\(/.test(SOURCE), false,
    "a delete path appeared — the manifest now understates what this app can do");
});

test("every admin page gates itself on view", () => {
  const pages = {
    modules: "module", roles: "access_role", permissions: "permission",
    members: "member", overrides: "override", explain: "explain", logs: "log",
  };
  const missing = [];
  for (const [page, resource] of Object.entries(pages)) {
    const src = readFileSync(new URL(`../app/${page}/page.jsx`, import.meta.url), "utf8");
    if (!src.includes(`can(access, "${resource}", "view")`)) missing.push(page);
  }
  assert.deepEqual(missing, [],
    "a page that does not check renders the data to anyone who can sign in");
});
