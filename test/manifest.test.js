import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateManifest, manifestHash, orphansAgainst, revivedAgainst,
  referentialProblems, ManifestError,
} from "../lib/manifest.js";

const ok = {
  manifestVersion: 1,
  module: "hoto",
  revision: "3",
  generated: "2026-08-11T00:00:00Z",
  resources: [{
    key: "schedule",
    label: "HOTO Schedule",
    vced: ["view", "create", "edit"],
    capabilities: [
      { key: "import_year", label: "Import a year" },
      { key: "auto_schedule", label: "Auto-schedule" },
    ],
    scopeDimensions: ["year"],
  }],
  scopeDimensions: [
    { key: "year", label: "Hijri Year", source: "self", selfEndpoint: "/.well-known/access-scopes/year" },
  ],
};

const clone = (x) => JSON.parse(JSON.stringify(x));

test("a well-formed manifest validates", () => {
  assert.equal(validateManifest(clone(ok)).module, "hoto");
});

test("the shipped explorer manifest is valid and offers only view", () => {
  const m = JSON.parse(readFileSync(
    new URL("../../teable-local/explorer/.well-known/access-manifest.json", import.meta.url)));
  validateManifest(m, { expectModule: "explorer" });
  assert.deepEqual(m.resources[0].vced, ["view"]);
});

test("a capability may not be named after a VCED verb", () => {
  const m = clone(ok);
  m.resources[0].capabilities.push({ key: "delete", label: "Delete" });
  assert.throws(() => validateManifest(m), ManifestError);
});

test("a resource with neither verbs nor capabilities is rejected", () => {
  const m = clone(ok);
  m.resources[0] = { key: "empty", label: "Empty" };
  assert.throws(() => validateManifest(m), ManifestError);
});

test("a self dimension must carry an endpoint, a teable one a scope", () => {
  const a = clone(ok);
  delete a.scopeDimensions[0].selfEndpoint;
  assert.throws(() => validateManifest(a), ManifestError);

  const b = clone(ok);
  b.scopeDimensions[0] = { key: "jamiat", label: "Jamiat", source: "teable" };
  b.resources[0].scopeDimensions = ["jamiat"];
  assert.throws(() => validateManifest(b), ManifestError);
});

test("a resource may not name an undeclared dimension", () => {
  const m = clone(ok);
  m.resources[0].scopeDimensions = ["nope"];
  assert.deepEqual(referentialProblems(m),
    ['resource "schedule" names undeclared scope dimension "nope"']);
});

test("a module cannot claim another module's identity", () => {
  assert.throws(() => validateManifest(clone(ok), { expectModule: "safar" }), ManifestError);
});

test("the hash ignores revision and generated but not vocabulary", () => {
  const a = clone(ok);
  const b = clone(ok);
  b.revision = "99";
  b.generated = "2027-01-01T00:00:00Z";
  assert.equal(manifestHash(a), manifestHash(b), "a republish with no change must not churn");

  const c = clone(ok);
  c.resources[0].vced.push("delete");
  assert.notEqual(manifestHash(a), manifestHash(c));
});

test("the hash ignores key order", () => {
  const reordered = {
    generated: ok.generated, module: ok.module, manifestVersion: 1, revision: ok.revision,
    scopeDimensions: ok.scopeDimensions,
    resources: [{
      scopeDimensions: ["year"], capabilities: ok.resources[0].capabilities,
      vced: ["view", "create", "edit"], label: "HOTO Schedule", key: "schedule",
    }],
  };
  assert.equal(manifestHash(ok), manifestHash(reordered));
});

/* ---- orphan detection ---- */

const rows = [
  { id: "r1", resource: "schedule", view: true, create: true, edit: true, delete: false, capabilities: ["import_year"] },
  { id: "r2", resource: "schedule", view: true, delete: true, capabilities: [] },
  { id: "r3", resource: "gone", view: true, capabilities: [] },
  { id: "r4", resource: "", view: true, capabilities: [] },
];

test("a grant on a vanished resource is flagged", () => {
  const found = orphansAgainst(ok, rows);
  assert.ok(found.find((o) => o.row.id === "r3"), "r3 targets a resource that no longer exists");
});

test("a verb the resource does not support is flagged", () => {
  const found = orphansAgainst(ok, rows);
  const r2 = found.find((o) => o.row.id === "r2");
  assert.ok(r2, "delete is not in the manifest's vced list");
  assert.match(r2.reason, /delete/);
});

test("a module-wide row with no resource is never orphaned", () => {
  assert.equal(orphansAgainst(ok, rows).some((o) => o.row.id === "r4"), false);
});

test("a grant matching the manifest is left alone", () => {
  assert.equal(orphansAgainst(ok, rows).some((o) => o.row.id === "r1"), false);
});

test("a capability removed from the manifest is flagged", () => {
  const shrunk = clone(ok);
  shrunk.resources[0].capabilities = [{ key: "auto_schedule", label: "Auto-schedule" }];
  const found = orphansAgainst(shrunk, rows);
  assert.match(found.find((o) => o.row.id === "r1").reason, /import_year/);
});

test("a row un-flags itself when the manifest restores what it lost", () => {
  const flagged = [{ ...rows[0], orphaned: true }];
  assert.deepEqual(revivedAgainst(ok, flagged).map((r) => r.id), ["r1"],
    "flagging must be reversible or the matrix fills with permanent false alarms");
});
