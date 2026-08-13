import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { SignJWT, importPKCS8, decodeProtectedHeader } from "jose";

/**
 * The envelope is the only thing a module is ever shown, so these cover the
 * three ways it can go wrong quietly: a signature that should not verify and
 * does, a cookie the browser drops without saying so, and a key that is not
 * configured at all.
 *
 * The keys are generated here rather than fixtured. A test that ships a private
 * key teaches everyone reading it that private keys go in repositories.
 */

const pair = () => generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const ours = pair();

// Stored the way a .env file has to store them — one line, literal backslash-n.
// If that normalization ever breaks, every test below fails on import.
const oneLine = (pem) => pem.trim().replace(/\n/g, "\\n");
process.env.ACCESS_PRIVATE_KEY = oneLine(ours.privateKey);
process.env.ACCESS_PUBLIC_KEY = oneLine(ours.publicKey);
process.env.ACCESS_ISSUER = "https://access.test";
delete process.env.ACCESS_KEY_ID;
delete process.env.COOKIE_DOMAIN;

const {
  signEnvelope, verifyEnvelope, publicJwks, keyId, issuer,
  envelopeCookieOptions, clearEnvelopeCookie, fitsInCookie, sizeOf,
  ENVELOPE_COOKIE, ENVELOPE_TTL, COOKIE_LIMIT,
} = await import("../lib/envelope.js");

const envelope = {
  its: "30411786",
  name: "Abdeali",
  tier: "steward",
  mods: { hoto: { res: { schedule: { v: 1, c: 0, e: 1, d: 0, rule: "own", caps: ["import_year"] } } } },
};

test("an envelope survives a round trip intact", async () => {
  const back = await verifyEnvelope(await signEnvelope(envelope));
  assert.equal(back.its, "30411786");
  assert.equal(back.name, "Abdeali");
  assert.equal(back.tier, "steward");
  assert.deepEqual(back.mods.hoto.res.schedule.caps, ["import_year"]);
});

test("the header names the key, and the key id is the thumbprint of it", async () => {
  const header = decodeProtectedHeader(await signEnvelope(envelope));
  assert.equal(header.alg, "RS256");
  assert.equal(header.kid, await keyId());
  assert.equal(header.typ, "JWT");
});

test("a tampered payload does not verify", async () => {
  const token = await signEnvelope(envelope);
  const [h, p, s] = token.split(".");
  const claims = JSON.parse(Buffer.from(p, "base64url"));
  claims.tier = "admin";
  const forged = [h, Buffer.from(JSON.stringify(claims)).toString("base64url"), s].join(".");
  assert.equal(await verifyEnvelope(forged), null);
});

test("a token signed by another key does not verify", async () => {
  // The whole reason for RS256: a module holds only the public half, so even a
  // module that is fully compromised cannot mint one of these.
  const theirs = pair();
  const token = await new SignJWT({ tier: "admin", mods: {} })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(issuer())
    .setSubject("30411786")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(await importPKCS8(theirs.privateKey, "RS256"));
  assert.equal(await verifyEnvelope(token), null);
});

test("an expired envelope does not verify", async () => {
  assert.equal(await verifyEnvelope(await signEnvelope(envelope, { ttl: -10 })), null);
});

test("an envelope from another issuer does not verify", async () => {
  const token = await new SignJWT({ tier: "admin", mods: {} })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer("https://access.evil.example")
    .setSubject("30411786")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(await importPKCS8(ours.privateKey, "RS256"));
  assert.equal(await verifyEnvelope(token), null);
});

test("verifying nothing is null, not a throw", async () => {
  assert.equal(await verifyEnvelope(null), null);
  assert.equal(await verifyEnvelope(""), null);
  assert.equal(await verifyEnvelope("not.a.jwt"), null);
});

test("the JWKS publishes the public half and no private material", async () => {
  const jwks = await publicJwks();
  assert.equal(jwks.keys.length, 1);
  const [jwk] = jwks.keys;
  assert.equal(jwk.kty, "RSA");
  assert.equal(jwk.alg, "RS256");
  assert.equal(jwk.use, "sig");
  assert.equal(jwk.kid, await keyId());
  // d, p, q, dp, dq, qi are the private half. None of them may ever be served.
  for (const secret of ["d", "p", "q", "dp", "dq", "qi"]) {
    assert.equal(jwk[secret], undefined, `JWKS leaked "${secret}"`);
  }
});

test("ACCESS_KEY_ID overrides the computed thumbprint", async () => {
  process.env.ACCESS_KEY_ID = "fleet-2026";
  try {
    assert.equal(await keyId(), "fleet-2026");
  } finally {
    delete process.env.ACCESS_KEY_ID;
  }
});

test("the cookie is host-only without COOKIE_DOMAIN, and shared with it", () => {
  const local = envelopeCookieOptions();
  assert.equal(local.name, ENVELOPE_COOKIE);
  assert.equal(local.maxAge, ENVELOPE_TTL);
  assert.equal(local.httpOnly, true);
  // localhost cannot be scoped to a parent domain; a hardcoded one here is a
  // cookie the browser silently drops and a dev session that never works.
  assert.equal("domain" in local, false);

  process.env.COOKIE_DOMAIN = ".daeratulaqeeq.org";
  try {
    assert.equal(envelopeCookieOptions().domain, ".daeratulaqeeq.org");
    // Clearing must carry the same domain, or it clears a different cookie.
    const gone = clearEnvelopeCookie();
    assert.equal(gone.domain, ".daeratulaqeeq.org");
    assert.equal(gone.maxAge, 0);
    assert.equal(gone.value, "");
  } finally {
    delete process.env.COOKIE_DOMAIN;
  }
});

test("an ordinary envelope fits in a cookie, an absurd one is caught", async () => {
  assert.equal(fitsInCookie(await signEnvelope(envelope)), true);

  // Rights on eighty modules. The browser would drop this without a word, the
  // module would bounce them back for another, and the address bar would never
  // settle — so it has to be caught before it is set.
  const huge = { ...envelope, mods: {} };
  for (let i = 0; i < 80; i++) {
    huge.mods[`module_number_${i}`] = {
      res: { records: { v: 1, c: 1, e: 1, d: 1, rule: "all", caps: ["publish", "import", "recalculate"] } },
    };
  }
  const token = await signEnvelope(huge);
  assert.ok(sizeOf(token) > COOKIE_LIMIT);
  assert.equal(fitsInCookie(token), false);
});

test("a missing key says which variable, not what ASN.1 is", async () => {
  const fresh = await import("../lib/envelope.js?no-key");
  const kept = process.env.ACCESS_PRIVATE_KEY;
  delete process.env.ACCESS_PRIVATE_KEY;
  try {
    await assert.rejects(
      () => fresh.signEnvelope(envelope),
      (e) => e.message.includes("ACCESS_PRIVATE_KEY") && e.message.includes("npm run keys"));
  } finally {
    process.env.ACCESS_PRIVATE_KEY = kept;
  }
});

test("a key pasted without its BEGIN line is rejected as such", async () => {
  const fresh = await import("../lib/envelope.js?bad-key");
  const kept = process.env.ACCESS_PRIVATE_KEY;
  process.env.ACCESS_PRIVATE_KEY = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcw";
  try {
    await assert.rejects(
      () => fresh.signEnvelope(envelope),
      (e) => e.message.includes("does not look like a PEM block"));
  } finally {
    process.env.ACCESS_PRIVATE_KEY = kept;
  }
});
