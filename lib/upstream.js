import { jwtVerify, createRemoteJWKSet } from "jose";

/**
 * Identity, issued by the core DA module rather than by this app.
 *
 * User Access decides **what** a person may do. It has no business deciding
 * **who** they are — that is one question, asked once, at the front door of the
 * fleet. Set `DA_CORE_URL` and this console stops running a sign-in of its own:
 * the local form, the `Auth Store` table and `AUTH_SECRET` all fall out of the
 * path, and the only way in is a token core signed.
 *
 * The contract is the one this console already publishes to its own modules,
 * pointed the other way:
 *
 *   · an RS256 (or ES256) JWT, in a cookie on the parent domain
 *   · `iss` — DA_CORE_ISSUER, defaulting to DA_CORE_URL
 *   · `sub` — the ITS ID, and nothing else is accepted as one
 *   · `nm` or `name` — the display name, optional
 *   · verified against core's own /.well-known/jwks.json
 *
 * Asymmetric on purpose, exactly as the envelope is: every module in the fleet
 * can verify a core token, and none of them can mint one. A shared secret would
 * mean any module's leaked environment variable forges sign-in for all of them.
 *
 * This costs one JWKS fetch per cold start — the set is cached and rate-limited
 * after that, so the steady state is still a local signature check.
 *
 * Kept free of `server-only`, of Next imports and of any Teable import, so
 * `proxy.js` can call it on every request.
 */

const trim = (v) => String(v ?? "").trim().replace(/\/+$/, "");

export const coreUrl = () => trim(process.env.DA_CORE_URL);

/** The single switch. Unset, the console keeps its own interim sign-in. */
export const coreConfigured = () => coreUrl().length > 0;

export const coreCookie = () => (process.env.DA_CORE_COOKIE || "da_core").trim();
export const coreIssuer = () => trim(process.env.DA_CORE_ISSUER) || coreUrl();
export const coreJwksUrl = () =>
  trim(process.env.DA_CORE_JWKS_URL) || `${coreUrl()}/.well-known/jwks.json`;

/**
 * Where core takes an unauthenticated person, and where it drops them after.
 *
 * Paths rather than whole URLs, because the host is already `DA_CORE_URL` and
 * two places to change one hostname is one too many.
 */
const signInPath = () => process.env.DA_CORE_SIGNIN_PATH || "/login";
const signOutPath = () => process.env.DA_CORE_SIGNOUT_PATH || "/logout";

/**
 * The parameter core reads to send someone back.
 *
 * `redirect` matches what this console uses on `/authorize`, so the fleet has
 * one name for one idea. Overridable for the case where core lands on `next`.
 */
const returnParam = () => process.env.DA_CORE_RETURN_PARAM || "redirect";

let _set, _setFor;
function jwks() {
  const url = coreJwksUrl();
  if (!_set || _setFor !== url) {
    _setFor = url;
    _set = createRemoteJWKSet(new URL(url), {
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
    });
  }
  return _set;
}

/**
 * @returns {Promise<{itsId: string, name: string|null, via: string} | null>}
 */
export async function readCoreIdentity(token) {
  if (!token || !coreConfigured()) return null;
  try {
    const { payload } = await jwtVerify(token, jwks(), {
      issuer: coreIssuer(),
      algorithms: ["RS256", "ES256"],
    });
    const itsId = String(payload.sub ?? "").trim();
    // An upstream is exactly where a junk subject must be refused rather than
    // carried inward: everything downstream treats this string as a person.
    if (!/^\d{6,10}$/.test(itsId)) return null;
    return { itsId, name: payload.nm ?? payload.name ?? null, via: "da-core" };
  } catch {
    return null;   // absent, expired, tampered, or signed by a key core rotated past
  }
}

const withReturn = (path, returnTo) => {
  const u = new URL(`${coreUrl()}${path}`);
  if (returnTo) u.searchParams.set(returnParam(), returnTo);
  return u.toString();
};

export const coreSignIn = (returnTo) => withReturn(signInPath(), returnTo);
export const coreSignOut = (returnTo) => withReturn(signOutPath(), returnTo);

/**
 * This console's own origin, as the outside world addresses it.
 *
 * Taken from `ACCESS_ISSUER` rather than from the request, for the same reason
 * the envelope's issuer is: on a preview deployment the request host is a
 * `*.vercel.app` name, and handing that to core as a return address sends
 * somebody back to a build that is not the one they were using.
 */
export function selfOrigin(fallbackUrl) {
  const iss = trim(process.env.ACCESS_ISSUER);
  if (iss) { try { return new URL(iss).origin; } catch { /* fall through */ } }
  try { return new URL(fallbackUrl).origin; } catch { return ""; }
}
