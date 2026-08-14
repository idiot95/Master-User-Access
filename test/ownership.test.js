import test from "node:test";
import assert from "node:assert/strict";
import { can, scopeModules, ownersOf, OWNER_MAY, CONSOLE_MODULE } from "../lib/owner.js";

/**
 * What owning a module does and does not confer.
 *
 * `can` is pure given an access object, which is the point — the rule that
 * decides whether one person may hand out access to another's module is worth
 * being able to state exhaustively rather than infer from a running console.
 *
 * The cases that matter most are the negative ones. A permission system is
 * judged by what it refuses.
 */

const owner = (...owns) => ({ authenticated: true, itsId: "1", owns, rights: {}, global: false });
const globalAdmin = { authenticated: true, itsId: "2", owns: [CONSOLE_MODULE], rights: {}, global: true };
const nobody = { authenticated: false, itsId: null, owns: [], rights: {} };

/** Someone with a matrix grant on this console but who owns nothing. */
const granted = (res) => ({ authenticated: true, itsId: "3", owns: [], global: false, rights: res });

test("ITS IDs come off a module row one per line", () => {
  assert.deepEqual(ownersOf({ platformAdmin: "40452114\n30456117" }), ["40452114", "30456117"]);
  assert.deepEqual(ownersOf({ platformAdmin: " 40452114 , 30456117 " }), ["40452114", "30456117"]);
  assert.deepEqual(ownersOf({ platformAdmin: "" }), []);
  assert.deepEqual(ownersOf({}), []);
});

test("an owner may hand out access to their own module", () => {
  const a = owner("mawaqeet");
  assert.equal(can(a, "permission", "edit", { moduleKey: "mawaqeet" }), true);
  assert.equal(can(a, "permission", "bulk_edit", { moduleKey: "mawaqeet" }), true);
  assert.equal(can(a, "override", "create", { moduleKey: "mawaqeet" }), true);
  assert.equal(can(a, "log", "view", { moduleKey: "mawaqeet" }), true);
});

test("an owner may not touch anyone else's module", () => {
  // The whole reason the model exists. Owning one module must confer nothing
  // whatsoever over another, or "owner" is just "admin" with extra steps.
  const a = owner("mawaqeet");
  assert.equal(can(a, "permission", "edit", { moduleKey: "hoto" }), false);
  assert.equal(can(a, "override", "create", { moduleKey: "hoto" }), false);
  assert.equal(can(a, "log", "view", { moduleKey: "hoto" }), false);
});

test("an owner may not grant themselves the console", () => {
  // Owning any module and then editing user-access's own matrix would be a
  // one-step path from "runs one module" to "runs everything".
  const a = owner("mawaqeet");
  assert.equal(can(a, "permission", "edit", { moduleKey: CONSOLE_MODULE }), false);
  assert.equal(can(a, "override", "create", { moduleKey: CONSOLE_MODULE }), false);
});

test("an owner uses roles but never edits them", () => {
  const a = owner("mawaqeet");
  assert.equal(can(a, "access_role", "view"), true);
  assert.equal(can(a, "access_role", "edit"), false);
  assert.equal(can(a, "access_role", "create"), false);
});

test("an owner does not provision people", () => {
  // A member row grants a role fleet-wide, so it reaches every module. An owner
  // hands out access to their own module with a permission or an override.
  const a = owner("mawaqeet");
  assert.equal(can(a, "member", "view"), false);
  assert.equal(can(a, "member", "create"), false);
  assert.equal(can(a, "member", "suspend"), false);
});

test("owning user-access is the global power", () => {
  assert.equal(can(globalAdmin, "access_role", "edit"), true);
  assert.equal(can(globalAdmin, "member", "create"), true);
  assert.equal(can(globalAdmin, "permission", "edit", { moduleKey: "anything-at-all" }), true);
});

test("signed out holds nothing, whatever is asked", () => {
  for (const [resource, action] of [["permission", "view"], ["log", "view"], ["member", "create"]]) {
    assert.equal(can(nobody, resource, action), false);
  }
});

test("a matrix grant on this console is not confined to a module", () => {
  // Role Permissions has no column for scope values, so a grant here is every
  // module or none. Pretending otherwise would be a restriction that exists
  // only in the console's own head.
  const a = granted({ permission: { v: 1, e: 1 } });
  assert.equal(can(a, "permission", "edit", { moduleKey: "mawaqeet" }), true);
  assert.equal(can(a, "permission", "edit", { moduleKey: "hoto" }), true);
  assert.deepEqual(scopeModules(a, "permission", "edit"), null);
});

test("scopeModules says which modules a screen may show", () => {
  assert.deepEqual(scopeModules(owner("mawaqeet", "hoto"), "permission", "edit"), ["mawaqeet", "hoto"]);
  assert.deepEqual(scopeModules(globalAdmin, "permission", "edit"), null);
  assert.deepEqual(scopeModules(nobody, "permission", "edit"), []);
  // An owner holds no member rights, so the members screen is not narrowed —
  // it is refused, and [] is what says so.
  assert.deepEqual(scopeModules(owner("mawaqeet"), "member", "create"), []);
});

test("every right an owner holds is spelled out, not derived", () => {
  // OWNER_MAY is a list precisely so that adding a resource to the manifest
  // cannot silently widen what every module owner can already do. If this
  // fails, someone added a line — which should have been a decision.
  assert.deepEqual([...OWNER_MAY].sort(), [
    "access_role:view",
    "explain:view",
    "log:view",
    "module:fetch_manifest",
    "module:set_owner",
    "module:view",
    "override:create",
    "override:expire",
    "override:view",
    "permission:bulk_edit",
    "permission:edit",
    "permission:view",
  ]);
});

test("nothing in OWNER_MAY names a resource the manifest does not declare", async () => {
  const { readFileSync } = await import("node:fs");
  const manifest = JSON.parse(
    readFileSync(new URL("../public/.well-known/access-manifest.json", import.meta.url), "utf8"));
  const declared = new Map(manifest.resources.map((r) => [
    r.key, new Set([...(r.vced ?? []), ...(r.capabilities ?? []).map((c) => c.key)]),
  ]));

  const bad = [];
  for (const entry of OWNER_MAY) {
    const [resource, action] = entry.split(":");
    if (!declared.has(resource)) bad.push(`unknown resource "${resource}"`);
    else if (!declared.get(resource).has(action)) bad.push(`"${action}" not declared on "${resource}"`);
  }
  assert.deepEqual(bad, []);
});
