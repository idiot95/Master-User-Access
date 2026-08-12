import test from "node:test";
import assert from "node:assert/strict";
import { findings } from "../lib/findings.js";

const role = (id, over = {}) => ({
  id, key: id, name: id, tier: "member", membership: "Explicit", orgRole: null, ...over,
});
const perm = (roleId, moduleKey, resource, over = {}) => ({
  roleId, moduleKey, resource, view: false, create: false, edit: false, delete: false,
  capabilities: [], scopeRule: "none", orphaned: false, ...over,
});
const mod = (key, over = {}) => ({
  id: key, key, name: key, status: "Live", visibility: "Granted", manifestStatus: "OK", ...over,
});

const base = { modules: [], roles: [], permissions: [], members: [], overrides: [], manifests: new Map() };
const run = (o) => findings({ ...base, ...o });
const titles = (fs) => fs.map((f) => f.title);

test("a clean configuration reports nothing", () => {
  assert.deepEqual(run({
    modules: [mod("explorer")],
    roles: [role("r1")],
    permissions: [perm("r1", "explorer", "snap", { view: true })],
  }), []);
});

test("Everyone reaching a Granted module is a risk", () => {
  const f = run({
    modules: [mod("hoto")],
    roles: [role("everyone", { membership: "Everyone" })],
    permissions: [perm("everyone", "hoto", "schedule", { view: true })],
  });
  assert.equal(f[0].severity, "risk");
  assert.match(f[0].detail, /not just the office/);
});

test("Everyone with view on a Public module is fine, but writing is not", () => {
  const ok = run({
    modules: [mod("directory", { visibility: "Public" })],
    roles: [role("everyone", { membership: "Everyone" })],
    permissions: [perm("everyone", "directory", "person", { view: true })],
  });
  assert.equal(ok.filter((x) => x.severity === "risk").length, 0);

  const bad = run({
    modules: [mod("directory", { visibility: "Public" })],
    roles: [role("everyone", { membership: "Everyone" })],
    permissions: [perm("everyone", "directory", "person", { view: true, edit: true })],
  });
  assert.equal(bad[0].severity, "risk");
});

test("write access following an org role is flagged", () => {
  const f = run({
    modules: [mod("hoto")],
    roles: [role("sh", { membership: "Org Role", orgRole: "Section Head" })],
    permissions: [perm("sh", "hoto", "schedule", { view: true, edit: true })],
  });
  assert.equal(f[0].severity, "risk");
  assert.match(f[0].detail, /Section Head/);
});

test("own scope on a resource with no dimensions is broken", () => {
  const manifests = new Map([["explorer", { resources: [{ key: "snap", scopeDimensions: [] }] }]]);
  const f = run({
    modules: [mod("explorer")], roles: [role("r1")],
    permissions: [perm("r1", "explorer", "snap", { view: true, scopeRule: "own" })],
    manifests,
  });
  assert.match(f[0].title, /narrows nothing/);
});

test("own scope is fine where dimensions exist", () => {
  const manifests = new Map([["hoto", { resources: [{ key: "schedule", scopeDimensions: ["jamiat"] }] }]]);
  const f = run({
    modules: [mod("hoto")], roles: [role("r1")],
    permissions: [perm("r1", "hoto", "schedule", { view: true, scopeRule: "own" })],
    manifests,
  });
  assert.equal(f.length, 0);
});

test("a role people hold that grants nothing is broken, not a chore", () => {
  const f = run({
    modules: [mod("explorer")],
    roles: [role("producer")],
    members: [{ itsId: "1", roleIds: ["producer"], status: "Active", expires: null }],
  });
  const hit = f.find((x) => x.title.includes("producer"));
  assert.equal(hit.severity, "broken");
  assert.match(hit.detail, /1 person has/);
});

test("many empty roles collapse into one entry", () => {
  const f = run({
    modules: [mod("explorer")],
    roles: [role("a"), role("b"), role("c"), role("d"), role("e"), role("f")],
  });
  const empties = f.filter((x) => /open(s)? nothing/.test(x.title));
  assert.equal(empties.length, 1, "six silent roles must not produce six findings");
  assert.match(empties[0].title, /6 roles open nothing/);
});

test("an undeclared live module is broken; a beta one is a chore", () => {
  const a = run({ modules: [mod("x", { manifestStatus: "Never fetched" })] });
  assert.equal(a[0].severity, "broken");
  const b = run({ modules: [mod("x", { status: "Beta", manifestStatus: "Never fetched" })] });
  assert.equal(b[0].severity, "chore");
});

test("orphaned grants are reported once, with a count", () => {
  const f = run({
    modules: [mod("hoto")], roles: [role("r1")],
    permissions: [
      perm("r1", "hoto", "a", { view: true, orphaned: true }),
      perm("r1", "hoto", "b", { view: true, orphaned: true }),
    ],
  });
  assert.match(f.find((x) => /vanished/.test(x.title)).title, /^2 grants/);
});

test("only overrides expiring within a fortnight are surfaced", () => {
  const soon = new Date(Date.now() + 3 * 86400000).toISOString();
  const later = new Date(Date.now() + 90 * 86400000).toISOString();
  const f = run({
    modules: [mod("hoto")],
    overrides: [
      { itsId: "1", moduleKey: "hoto", effect: "Deny", reason: "handover", expires: soon },
      { itsId: "2", moduleKey: "hoto", effect: "Deny", reason: "other", expires: later },
    ],
  });
  const exp = f.filter((x) => x.severity === "expiring");
  assert.equal(exp.length, 1);
  assert.match(exp[0].title, /3 days/);
});

test("findings are ordered worst first", () => {
  const f = run({
    modules: [mod("hoto"), mod("x", { manifestStatus: "Never fetched" })],
    roles: [role("everyone", { membership: "Everyone" })],
    permissions: [perm("everyone", "hoto", "schedule", { view: true })],
  });
  assert.equal(f[0].severity, "risk");
  assert.ok(f.findIndex((x) => x.severity === "chore") > f.findIndex((x) => x.severity === "broken")
    || !f.some((x) => x.severity === "chore"));
});
