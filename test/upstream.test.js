import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { generateKeyPairSync } from "node:crypto";
import { SignJWT, importPKCS8, importSPKI, exportJWK, calculateJwkThumbprint } from "jose";

/**
 * Identity arriving from the core DA module.
 *
 * The half worth testing is the refusals. A token that verifies is the easy
 * case and fails loudly when it breaks; a token that should not have verified
 * — wrong issuer, wrong key, a subject that is not an ITS ID — fails silently
 * by letting somebody in, which is the only failure mode of this file that
 * nobody would notice.
 *
 * A real JWKS is served over loopback rather than stubbed, because the thing
 * being checked is that we fetch and match a key the way core will publish one.
 */

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const other = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const priv = await importPKCS8(privateKey, "RS256");
const pub = await importSPKI(publicKey, "RS256");
const jwk = await exportJWK(pub);
const kid = await calculateJwkThumbprint(jwk, "sha256");

const server = createServer((req, res) => {
  if (req.url === "/.well-known/jwks.json") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }] }));
    return;
  }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const CORE = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

process.env.DA_CORE_URL = CORE;
process.env.ACCESS_ISSUER = "https://useraccess.daeratulaqeeq.org";

const {
  coreConfigured, coreCookie, coreIssuer, coreJwksUrl,
  coreSignIn, coreSignOut, selfOrigin, readCoreIdentity,
} = await import("../lib/upstream.js");

const sign = async (claims = {}, { key = priv, iss = CORE, ttl = "5m" } = {}) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(iss)
    .setSubject(claims.sub ?? "30411786")
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(key);

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

test("core is configured by one variable, and defaults fill in the rest", () => {
  assert.equal(coreConfigured(), true);
  assert.equal(coreCookie(), "da_core");
  assert.equal(coreIssuer(), CORE);
  assert.equal(coreJwksUrl(), `${CORE}/.well-known/jwks.json`);
});

test("a trailing slash on DA_CORE_URL does not become a double slash", () => {
  process.env.DA_CORE_URL = `${CORE}/`;
  assert.equal(coreJwksUrl(), `${CORE}/.well-known/jwks.json`);
  process.env.DA_CORE_URL = CORE;
});

test("sign-in and sign-out carry the return address", () => {
  const back = "https://useraccess.daeratulaqeeq.org/permissions?role=x";
  assert.equal(coreSignIn(back), `${CORE}/login?redirect=${encodeURIComponent(back)}`);
  assert.equal(coreSignOut(back), `${CORE}/logout?redirect=${encodeURIComponent(back)}`);
});

test("the return address is this console's public origin, not the request's", () => {
  // A preview deployment answers on a *.vercel.app host. Sending core that as
  // a return address strands the person on a build they were never using.
  assert.equal(
    selfOrigin("https://master-user-access-abc123.vercel.app/modules"),
    "https://useraccess.daeratulaqeeq.org");
});

/* ------------------------------------------------------------------ *
 * What is accepted
 * ------------------------------------------------------------------ */

test("a token core signed is read as that person", async () => {
  const id = await readCoreIdentity(await sign({ nm: "Abdeali" }));
  assert.deepEqual(id, { itsId: "30411786", name: "Abdeali", via: "da-core" });
});

test("either name claim is accepted, and neither is required", async () => {
  assert.equal((await readCoreIdentity(await sign({ name: "Zainab" }))).name, "Zainab");
  assert.equal((await readCoreIdentity(await sign({}))).name, null);
});

/* ------------------------------------------------------------------ *
 * What is refused — the half that matters
 * ------------------------------------------------------------------ */

test("no token is nobody", async () => {
  assert.equal(await readCoreIdentity(undefined), null);
  assert.equal(await readCoreIdentity(""), null);
});

test("a token signed by a key core does not publish is refused", async () => {
  const forged = await sign({}, { key: await importPKCS8(other.privateKey, "RS256") });
  assert.equal(await readCoreIdentity(forged), null);
});

test("a token from another issuer is refused", async () => {
  assert.equal(await readCoreIdentity(await sign({}, { iss: "https://evil.example" })), null);
});

test("an expired token is refused", async () => {
  assert.equal(await readCoreIdentity(await sign({}, { ttl: "-1s" })), null);
});

test("a subject that is not an ITS ID is refused", async () => {
  // Everything downstream treats this string as a person and looks them up by
  // it. An upstream is exactly where a junk subject stops, not where it starts.
  for (const sub of ["admin", "30411786; drop", "", "12345", "1234567890123"]) {
    assert.equal(await readCoreIdentity(await sign({ sub })), null, `accepted ${sub}`);
  }
});

test("garbage is refused rather than thrown", async () => {
  assert.equal(await readCoreIdentity("not.a.jwt"), null);
});

test("with core unconfigured nothing verifies, whatever the token", async () => {
  const good = await sign({});
  const saved = process.env.DA_CORE_URL;
  delete process.env.DA_CORE_URL;
  const { readCoreIdentity: fresh, coreConfigured: off } = await import(
    `../lib/upstream.js?off=${Date.now()}`);
  assert.equal(off(), false);
  assert.equal(await fresh(good), null);
  process.env.DA_CORE_URL = saved;
});
