import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { merge, pack } from "../lib/resolve.js";

/**
 * The contract, end to end: what this console signs, a module accepts, and both
 * sides read the same way.
 *
 * Every other test here checks one side. This one runs the resolver, signs the
 * result with `lib/envelope.js`, and hands the token to the code a module
 * actually imports — the vendored `@al-rayhaanat/access`. The two live in
 * different repositories and can drift: a renamed short key, a changed cookie
 * name, an issuer that stops matching. Each of those would look fine in
 * isolation and lock the fleet out in production.
 *
 * `vendor/` rather than the design system checkout, deliberately — vendored is
 * what deploys, so vendored is what is tested.
 */

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

process.env.ACCESS_PRIVATE_KEY = privateKey;
process.env.ACCESS_PUBLIC_KEY = publicKey;
process.env.ACCESS_ISSUER = "https://access.contract.test";
process.env.ACCESS_CONSOLE_URL = "https://access.contract.test";

const { signEnvelope } = await import("../lib/envelope.js");
const module_ = await import("../vendor/@al-rayhaanat/access/src/verify.js");
const { verifyEnvelope, allows, scopesFor, resourcesOf, ENVELOPE_COOKIE } = module_;

const grant = (moduleKey, resource, over = {}) => ({
  moduleKey, resource, view: false, create: false, edit: false, delete: false,
  capabilities: [], scopeRule: "none", scopes: [], ...over,
});

/** Run the real resolver, sign the real envelope, read it back as a module would. */
async function roundTrip({ grants = [], overrides = [], publicSeeds = [] }) {
  const mods = pack(merge({ grants, overrides, publicSeeds }));
  const token = await signEnvelope({ its: "30411786", name: "Abdeali", tier: "steward", mods });
  return verifyEnvelope(token);
}

test("both sides agree on the cookie name", async () => {
  const { ENVELOPE_COOKIE: mine } = await import("../lib/envelope.js");
  assert.equal(mine, ENVELOPE_COOKIE,
    "the console sets one cookie and the module reads another — nothing would work");
});

test("a module reads back exactly what the matrix granted", async () => {
  const envelope = await roundTrip({
    grants: [grant("hoto", "schedule", { view: true, edit: true, capabilities: ["import_year"] })],
  });

  assert.equal(envelope.its, "30411786");
  assert.equal(envelope.tier, "steward");
  assert.deepEqual(resourcesOf(envelope, "hoto"), ["schedule"]);

  assert.equal(allows(envelope, { module: "hoto", resource: "schedule", action: "view" }), true);
  assert.equal(allows(envelope, { module: "hoto", resource: "schedule", action: "edit" }), true);
  assert.equal(allows(envelope, { module: "hoto", resource: "schedule", action: "create" }), false);
  assert.equal(allows(envelope, { module: "hoto", resource: "schedule", action: "delete" }), false);
  assert.equal(allows(envelope, { module: "hoto", resource: "schedule", capability: "import_year" }), true);
  assert.equal(allows(envelope, { module: "hoto", resource: "schedule", capability: "reset_year" }), false);
});

test("a module the person holds nothing in is absent, not empty", async () => {
  const envelope = await roundTrip({ grants: [grant("hoto", "schedule", { view: true })] });
  assert.deepEqual(resourcesOf(envelope, "safar"), []);
  assert.equal(allows(envelope, { module: "safar", resource: "trip", action: "view" }), false);
});

test("a deny that beat a grant is gone by the time a module sees it", async () => {
  // The precedence rule that matters most, checked where it lands rather than
  // where it is decided: the module never learns there was a grant at all.
  const envelope = await roundTrip({
    grants: [grant("hoto", "schedule", { view: true, edit: true })],
    overrides: [{
      moduleKey: "hoto", effect: "Deny", resource: "schedule", view: false, create: false,
      edit: true, delete: false, capabilities: [], scopeRule: null, expires: null, orphaned: false,
    }],
  });
  assert.equal(allows(envelope, { module: "hoto", resource: "schedule", action: "view" }), true);
  assert.equal(allows(envelope, { module: "hoto", resource: "schedule", action: "edit" }), false);
});

test("a blanket deny leaves the module entirely absent", async () => {
  const envelope = await roundTrip({
    grants: [grant("hoto", "schedule", { view: true })],
    overrides: [{
      moduleKey: "hoto", effect: "Deny", resource: null, view: false, create: false,
      edit: false, delete: false, capabilities: [], scopeRule: null, expires: null, orphaned: false,
    }],
  });
  assert.deepEqual(resourcesOf(envelope, "hoto"), []);
});

test("scope rules survive the trip and mean the same thing on both sides", async () => {
  const envelope = await roundTrip({
    grants: [grant("hoto", "schedule", {
      view: true, scopeRule: "own",
      scopes: [{ t: "jamiat", id: "recAHM", l: "Ahmedabad" }],
    })],
  });

  const asked = { module: "hoto", resource: "schedule", action: "view" };
  assert.equal(allows(envelope, { ...asked, scope: { t: "jamiat", id: "recAHM" } }), true);
  assert.equal(allows(envelope, { ...asked, scope: { t: "jamiat", id: "recSUR" } }), false);
  // Asking nothing about scope is the unpartitioned case, and must still pass.
  assert.equal(allows(envelope, asked), true);

  const filter = scopesFor(envelope, "hoto", "schedule", "jamiat");
  assert.equal(filter.rule, "own");
  assert.deepEqual(filter.values, ["recAHM"]);
});

test("an unscoped grant answers no to a scoped question", async () => {
  // "none" is the resolver's lowest rank, so it cannot mean "everything". A
  // module that partitions its data and asks properly gets a refusal.
  const envelope = await roundTrip({
    grants: [grant("hoto", "schedule", { view: true, scopeRule: "none" })],
  });
  assert.equal(allows(envelope, { module: "hoto", resource: "schedule", action: "view" }), true);
  assert.equal(
    allows(envelope, { module: "hoto", resource: "schedule", action: "view", scope: { t: "jamiat", id: "recAHM" } }),
    false);
});

test("a public module's bare view arrives as a bare view", async () => {
  const envelope = await roundTrip({ publicSeeds: [{ module: "explorer", resource: "base_snapshot" }] });
  assert.equal(allows(envelope, { module: "explorer", resource: "base_snapshot", action: "view" }), true);
  assert.equal(allows(envelope, { module: "explorer", resource: "base_snapshot", action: "edit" }), false);
  // Public seeds are granted scope rule "all", so a scoped question passes.
  assert.equal(
    allows(envelope, { module: "explorer", resource: "base_snapshot", action: "view", scope: { t: "year", id: "1448H" } }),
    true);
});

test("the module rejects an envelope signed by anyone else", async () => {
  const other = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const kept = process.env.ACCESS_PRIVATE_KEY;
  process.env.ACCESS_PRIVATE_KEY = other.privateKey;
  try {
    const forged = await import("../lib/envelope.js?forged");
    const token = await forged.signEnvelope({ its: "1", name: null, tier: "admin", mods: {} });
    assert.equal(await verifyEnvelope(token), null);
  } finally {
    process.env.ACCESS_PRIVATE_KEY = kept;
  }
});

test("an unknown verb is a mistake in the module's code, not a silent no", async () => {
  const envelope = await roundTrip({ grants: [grant("hoto", "schedule", { view: true })] });
  assert.throws(
    () => allows(envelope, { module: "hoto", resource: "schedule", action: "publish" }),
    /not one of view, create, edit, delete/);
});
