import { SignJWT, jwtVerify } from "jose";

/**
 * Signing in against the existing `Auth Store` table.
 *
 * This is a stopgap, and worth naming as one. ITS One Login is the intended
 * front door; until it exists the console is otherwise reachable by anyone with
 * the URL, and it is the screen that decides who can open everything else.
 *
 * `Auth Store` holds a 64-hex digest and a 32-hex salt per ITS ID — SHA-256,
 * which is fast, GPU-friendly and the wrong primitive for a password. Nothing
 * here makes that better; it only reads what the directory already wrote. When
 * ITS One Login lands, this file and the table both go.
 *
 * Kept free of `server-only` and of any Teable import so the token half can be
 * verified from middleware, where there is no Node runtime and no network.
 */

const COOKIE = "ua_session";
const MAX_AGE = 60 * 60 * 12;   // 12 hours — a console session, not a login you keep

/**
 * No fallback secret, deliberately.
 *
 * `process.env.X || "some-literal"` in a public repo is how a development
 * convenience becomes a forgeable session — it is sitting in yaadi-new today.
 * A missing secret must stop the app, not quietly weaken it.
 */
function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "AUTH_SECRET is not set, or is shorter than 32 characters. " +
      "Generate one with: openssl rand -base64 48");
  }
  return new TextEncoder().encode(s);
}

/* ------------------------------------------------------------------ *
 * Password verification
 * ------------------------------------------------------------------ */

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  return hex(await crypto.subtle.digest("SHA-256", data));
}

/**
 * The orderings a salted SHA-256 is plausibly written as.
 *
 * The directory wrote these hashes and its source is not available here, so
 * rather than guess one and lock four people out, every candidate is tried and
 * the one that matched is returned. Set AUTH_HASH_SCHEME to pin it once known —
 * `matched` is there so you can read it off a successful sign-in.
 *
 * Trying several costs nothing an attacker gains from: each is the same
 * one-round SHA-256, so this widens no door that is not already open.
 */
export const SCHEMES = {
  "salt+password": (salt, pw) => `${salt}${pw}`,
  "password+salt": (salt, pw) => `${pw}${salt}`,
  "password:salt": (salt, pw) => `${pw}:${salt}`,
  "salt:password": (salt, pw) => `${salt}:${pw}`,
};

/** Constant-time-ish compare. Both sides are fixed-length hex from our own code. */
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** @returns {Promise<{ok: true, matched: string} | {ok: false}>} */
export async function verifyPassword({ password, salt, passwordHash }) {
  if (!password || !salt || !passwordHash) return { ok: false };

  const pinned = process.env.AUTH_HASH_SCHEME;
  const names = pinned && SCHEMES[pinned] ? [pinned] : Object.keys(SCHEMES);

  for (const name of names) {
    const digest = await sha256(SCHEMES[name](salt, password));
    if (same(digest, passwordHash.toLowerCase())) return { ok: true, matched: name };
  }
  return { ok: false };
}

/* ------------------------------------------------------------------ *
 * Session
 * ------------------------------------------------------------------ */

export async function issueSession({ itsId, name }) {
  return new SignJWT({ nm: name ?? null })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(itsId))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

/** @returns {Promise<{itsId: string, name: string|null} | null>} */
export async function readSession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return { itsId: String(payload.sub), name: payload.nm ?? null };
  } catch {
    return null;   // expired, tampered, or signed with a rotated secret
  }
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_MAX_AGE = MAX_AGE;

export const cookieOptions = () => ({
  name: COOKIE,
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
});
