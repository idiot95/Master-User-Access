import { SignJWT, jwtVerify, importPKCS8, importSPKI, exportJWK, calculateJwkThumbprint } from "jose";

/**
 * The signed envelope — what a module is actually handed.
 *
 * `lib/auth.js` decides who you are and holds that for 12 hours. This decides
 * what you may do and holds it for 15 minutes, which is the whole reason the
 * two are separate tokens rather than one:
 *
 *   · identity changes rarely, and re-typing a password hourly is theatre
 *   · rights change the moment an administrator ticks a box, and a grant that
 *     takes half a day to withdraw is not a grant that can be withdrawn
 *
 * Fifteen minutes is the bound on how stale a module's view of someone's
 * rights can be. It is short enough that a revocation lands within a coffee
 * break and long enough that the console is not re-signing on every click.
 *
 * RS256 rather than HS256, deliberately. Modules verify with the public half
 * from `/.well-known/jwks.json`, so every module can check an envelope and no
 * module can mint one. With a shared secret, leaking any one module's env var
 * would let it forge access to all the others.
 *
 * Kept free of `server-only` and of any Teable import so `proxy.js` can verify
 * without dragging the data layer into the request path.
 */

const COOKIE = "da_access";
const TTL = 15 * 60;

/** A JWT that will not fit in a cookie is worse than an error — see sizeOf(). */
const COOKIE_BUDGET = 3800;

export const ENVELOPE_COOKIE = COOKIE;
export const ENVELOPE_TTL = TTL;

/**
 * The issuer, as modules will see it.
 *
 * Fixed rather than derived from the incoming request: on a preview deployment
 * the request origin is a `*.vercel.app` host, and an envelope claiming that as
 * its issuer would be rejected by every module — or, worse, accepted, and then
 * a preview build could hand out production rights.
 */
export const issuer = () =>
  process.env.ACCESS_ISSUER || "https://access.daeratulaqeeq.org";

/**
 * PEM out of an environment variable.
 *
 * Vercel's dashboard keeps real newlines; a `.env` file usually cannot, so the
 * same key arrives as one line with literal backslash-n. Accepting both is not
 * laxness — it is the difference between "paste the key" working and a boot
 * failure whose message is about ASN.1.
 */
function pem(value, name) {
  const s = String(value || "").trim().replace(/\\n/g, "\n");
  if (!s) throw new Error(`${name} is not set. Generate a pair with: npm run keys`);
  if (!s.includes("-----BEGIN")) {
    throw new Error(`${name} does not look like a PEM block. Paste the whole key, BEGIN and END lines included.`);
  }
  return s;
}

/* ------------------------------------------------------------------ *
 * Keys — imported once, then held
 * ------------------------------------------------------------------ */

let _private, _public, _kid;

function privateKey() {
  _private ||= importPKCS8(pem(process.env.ACCESS_PRIVATE_KEY, "ACCESS_PRIVATE_KEY"), "RS256");
  return _private;
}

function publicKey() {
  // The public half is derivable from the private one, but requiring it to be
  // set explicitly means a mismatched pair fails on the first sign-in rather
  // than at whichever later moment a module first tries to verify.
  _public ||= importSPKI(pem(process.env.ACCESS_PUBLIC_KEY, "ACCESS_PUBLIC_KEY"), "RS256");
  return _public;
}

/**
 * The key id modules match against.
 *
 * Defaults to the RFC 7638 thumbprint — a fingerprint of the key itself, so it
 * cannot drift out of step with the key it names. `ACCESS_KEY_ID` overrides it
 * for the case where an existing fleet already knows a key by another name.
 */
export async function keyId() {
  if (process.env.ACCESS_KEY_ID) return process.env.ACCESS_KEY_ID;
  _kid ||= exportJWK(await publicKey()).then((jwk) => calculateJwkThumbprint(jwk, "sha256"));
  return _kid;
}

/** What `/.well-known/jwks.json` serves. Public by design — it verifies, it does not sign. */
export async function publicJwks() {
  const jwk = await exportJWK(await publicKey());
  return { keys: [{ ...jwk, kid: await keyId(), alg: "RS256", use: "sig" }] };
}

/* ------------------------------------------------------------------ *
 * Signing
 * ------------------------------------------------------------------ */

/**
 * Sign an envelope from `buildEnvelope`.
 *
 * The payload keeps the resolver's short keys (`v` `c` `e` `d` `rule`) rather
 * than expanding them for readability. This token rides on every request to
 * every module; the compact form is what keeps a person with rights in eight
 * modules inside one cookie.
 */
export async function signEnvelope(envelope, { ttl = TTL } = {}) {
  const kid = await keyId();
  return new SignJWT({
    nm: envelope.name ?? null,
    tier: envelope.tier,
    mods: envelope.mods,
  })
    .setProtectedHeader({ alg: "RS256", kid, typ: "JWT" })
    .setIssuer(issuer())
    .setSubject(String(envelope.its))
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(await privateKey());
}

/**
 * Verify one we issued. Modules use `@al-rayhaanat/access`; this is for the
 * console's own routes and for the tests.
 */
export async function verifyEnvelope(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await publicKey(), {
      algorithms: ["RS256"],
      issuer: issuer(),
    });
    return { its: String(payload.sub), name: payload.nm ?? null, tier: payload.tier, mods: payload.mods ?? {} };
  } catch {
    return null;   // expired, tampered, or signed by a key we have since rotated past
  }
}

/* ------------------------------------------------------------------ *
 * The cookie
 * ------------------------------------------------------------------ */

/**
 * Set on the parent domain so every module reads the same one.
 *
 * Unset `COOKIE_DOMAIN` and the cookie is host-only, which is what localhost
 * needs — `.localhost` is not a domain a browser will scope a cookie to, and a
 * hardcoded parent domain in development means the cookie is silently dropped
 * and nothing works for a reason nothing reports.
 */
export function envelopeCookieOptions() {
  const domain = (process.env.COOKIE_DOMAIN || "").trim();
  return {
    name: COOKIE,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL,
    ...(domain ? { domain } : {}),
  };
}

/** Same attributes, expired — a cookie only clears if the domain and path match the one that set it. */
export const clearEnvelopeCookie = () => ({ ...envelopeCookieOptions(), value: "", maxAge: 0 });

/**
 * How big the token came out, in bytes.
 *
 * Browsers cap a cookie at about 4 KB and drop anything larger **without
 * telling anyone** — the module then sees no envelope, redirects here for one,
 * gets the same oversized cookie, and the person watches the address bar
 * bounce forever. Callers check this and fail loudly instead.
 */
export const sizeOf = (token) => new TextEncoder().encode(token).length;
export const fitsInCookie = (token) => sizeOf(token) <= COOKIE_BUDGET;
export const COOKIE_LIMIT = COOKIE_BUDGET;
