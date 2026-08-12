import test from "node:test";
import assert from "node:assert/strict";
import { closure, membership, merge, pack, tierOf } from "../lib/resolve.js";

const role = (id, over = {}) => ({
  id, key: id, name: id, tier: "member", membership: "Explicit",
  orgRole: null, inheritsFrom: null, ...over,
});

const grant = (moduleKey, resource, over = {}) => ({
  moduleKey, resource, view: false, create: false, edit: false, delete: false,
  capabilities: [], scopeRule: "none", scopes: [], ...over,
});

const override = (moduleKey, effect, over = {}) => ({
  moduleKey, effect, resource: null, view: false, create: false, edit: false, delete: false,
  capabilities: [], scopeRule: null, expires: null, orphaned: false, ...over,
});

const find = (bs, m, r) => bs.find((b) => b.module === m && b.resource === r);

/* ---------------- membership: the 10,000 / 1,000 guarantee ---------------- */

test("Everyone resolves for a person with no row anywhere", () => {
  const roles = [role("everyone", { membership: "Everyone" })];
  const via = membership({ itsId: "999", eligible: true, roles, members: [], orgRoleTitles: new Set() });
  assert.deepEqual([...via.keys()], ["everyone"]);
});

test("Org Role resolves from assignments, storing no row for the person", () => {
  const roles = [role("sh", { membership: "Org Role", orgRole: "Section Head" })];
  const via = membership({
    itsId: "30456117", eligible: true, roles, members: [],
    orgRoleTitles: new Set(["Section Head"]),
  });
  assert.equal(via.get("sh").how, "orgRole");
});

test("an ineligible person holds nothing, not even Everyone", () => {
  const roles = [role("everyone", { membership: "Everyone" })];
  const via = membership({ itsId: "", eligible: false, roles, members: [], orgRoleTitles: new Set() });
  assert.equal(via.size, 0);
});

test("a suspended member loses only their explicit roles", () => {
  const roles = [
    role("everyone", { membership: "Everyone" }),
    role("producer"),
  ];
  const members = [{ itsId: "1", status: "Suspended", expires: null, roleIds: ["producer"] }];
  const via = membership({ itsId: "1", eligible: true, roles, members, orgRoleTitles: new Set() });
  assert.deepEqual([...via.keys()], ["everyone"], "suspension must not revoke a rule-based role");
});

test("an expired membership stops counting", () => {
  const roles = [role("producer")];
  const members = [{ itsId: "1", status: "Active", expires: "2020-01-01", roleIds: ["producer"] }];
  const via = membership({ itsId: "1", eligible: true, roles, members, orgRoleTitles: new Set() });
  assert.equal(via.size, 0);
});

/* ---------------- inheritance ---------------- */

test("inheritance follows explicit links only", () => {
  const rolesById = new Map([
    ["head", role("head", { inheritsFrom: "team" })],
    ["team", role("team")],
    ["other", role("other")],
  ]);
  const held = closure(["head"], rolesById);
  assert.deepEqual([...held].sort(), ["head", "team"]);
});

test("a cycle in Inherits From terminates", () => {
  const rolesById = new Map([
    ["a", role("a", { inheritsFrom: "b" })],
    ["b", role("b", { inheritsFrom: "a" })],
  ]);
  assert.deepEqual([...closure(["a"], rolesById)].sort(), ["a", "b"]);
});

/* ---------------- merge precedence ---------------- */

test("two roles granting the same resource union", () => {
  const bs = merge({ grants: [
    grant("hoto", "schedule", { view: true }),
    grant("hoto", "schedule", { edit: true, capabilities: ["publish"] }),
  ] });
  const b = find(bs, "hoto", "schedule");
  assert.deepEqual([b.v, b.c, b.e, b.d], [1, 0, 1, 0]);
  assert.deepEqual([...b.caps], ["publish"]);
});

test("no grant means no entry at all", () => {
  assert.deepEqual(merge({ grants: [] }), []);
});

test("a grant with nothing ticked produces no entry", () => {
  assert.deepEqual(merge({ grants: [grant("hoto", "schedule")] }), []);
});

test("deny beats any number of grants", () => {
  const bs = merge({
    grants: [
      grant("hoto", "schedule", { view: true, edit: true }),
      grant("hoto", "schedule", { view: true, edit: true }),
      grant("hoto", "schedule", { view: true, edit: true }),
    ],
    overrides: [override("hoto", "Deny", { resource: "schedule", edit: true })],
  });
  const b = find(bs, "hoto", "schedule");
  assert.equal(b.e, 0, "one deny outranks three grants");
  assert.equal(b.v, 1, "and touches nothing it did not name");
});

test("a grant override applied after a deny still loses", () => {
  const bs = merge({
    grants: [grant("hoto", "schedule", { view: true })],
    overrides: [
      override("hoto", "Deny", { resource: "schedule", view: true }),
      override("hoto", "Grant", { resource: "schedule", view: true }),
    ],
  });
  assert.equal(find(bs, "hoto", "schedule"), undefined, "deny is applied last, unconditionally");
});

test("a blanket deny removes the module entirely", () => {
  const bs = merge({
    grants: [
      grant("hoto", "schedule", { view: true, edit: true }),
      grant("hoto", "year", { view: true }),
      grant("safar", "city", { view: true }),
    ],
    overrides: [override("hoto", "Deny")],
  });
  assert.deepEqual(bs.map((b) => b.module), ["safar"]);
});

test("an expired deny has no effect", () => {
  const bs = merge({
    grants: [grant("hoto", "schedule", { view: true })],
    overrides: [override("hoto", "Deny", { resource: "schedule", view: true, expires: "2020-01-01" })],
  });
  assert.equal(find(bs, "hoto", "schedule").v, 1);
});

test("an orphaned override is ignored", () => {
  const bs = merge({
    grants: [grant("hoto", "schedule", { view: true })],
    overrides: [override("hoto", "Deny", { resource: "schedule", view: true, orphaned: true })],
  });
  assert.equal(find(bs, "hoto", "schedule").v, 1);
});

/* ---------------- scope ---------------- */

test("scope rule takes the widest granted, but a deny may only narrow it", () => {
  const widened = merge({ grants: [
    grant("hoto", "schedule", { view: true, scopeRule: "own" }),
    grant("hoto", "schedule", { view: true, scopeRule: "all" }),
  ] });
  assert.equal(find(widened, "hoto", "schedule").rule, "all");

  const narrowed = merge({
    grants: [grant("hoto", "schedule", { view: true, scopeRule: "all" })],
    overrides: [override("hoto", "Deny", { resource: "schedule", scopeRule: "own" })],
  });
  assert.equal(find(narrowed, "hoto", "schedule").rule, "own");

  const cannotWiden = merge({
    grants: [grant("hoto", "schedule", { view: true, scopeRule: "own" })],
    overrides: [override("hoto", "Deny", { resource: "schedule", scopeRule: "all" })],
  });
  assert.equal(find(cannotWiden, "hoto", "schedule").rule, "own", "a deny must never widen scope");
});

test("scopes from two roles dedupe", () => {
  const s = { t: "jamiat", id: "recA", l: "Talabat" };
  const bs = merge({ grants: [
    grant("hoto", "schedule", { view: true, scopeRule: "own", scopes: [s] }),
    grant("hoto", "schedule", { edit: true, scopeRule: "own", scopes: [s] }),
  ] });
  assert.equal(find(bs, "hoto", "schedule").scopes.length, 1);
});

/* ---------------- packing ---------------- */

test("the envelope omits empty caps and scopes", () => {
  const mods = pack(merge({ grants: [grant("explorer", "base_snapshot", { view: true, scopeRule: "all" })] }));
  const e = mods.explorer.res.base_snapshot;
  assert.deepEqual(e, { v: 1, c: 0, e: 0, d: 0, rule: "all" });
  assert.equal("caps" in e, false);
  assert.equal("scopes" in e, false);
});

test("a public module reaches a person with no grants", () => {
  const mods = pack(merge({ publicSeeds: [{ module: "directory", resource: "person" }] }));
  assert.equal(mods.directory.res.person.v, 1);
});

/* ---------------- tier ---------------- */

test("tier is the highest held, and recognised when nothing is held", () => {
  assert.equal(tierOf([]), "recognised");
  assert.equal(tierOf([role("a"), role("b", { tier: "admin" }), role("c", { tier: "steward" })]), "admin");
});
