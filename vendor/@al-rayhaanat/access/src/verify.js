import { jwtVerify, importSPKI, createRemoteJWKSet } from "jose";

/**
 * Reading an envelope, and deciding what it permits.
 *
 * No Next import anywhere in this file. Everything here is a pure function of a
 * token and a question, which is what lets a module test its own gating without
 * standing up a server or reaching the access console.
 *
 * The console signs with RS256 and publishes the public half. A module can
 * therefore check any envelope and forge none — which matters because there are
 * several modules and they do not all deserve the same trust. With a shared
 * secret, leaking one module's environment would hand out the whole fleet.
 */

/** Set by the console on the fleet's parent domain. Both sides hardcode it; both must agree. */
export const ENVELOPE_COOKIE = "da_access";

export const VCED = ["view", "create", "edit", "delete"];
const SHORT = { view: "v", create: "c", edit: "e", delete: "d" };

export const consoleUrl = () =>
  (process.env.ACCESS_CONSOLE_URL || "https://access.daeratulaqeeq.org").replace(/\/+$/, "");

export const issuer = () => process.env.ACCESS_ISSUER || consoleUrl();

/* ------------------------------------------------------------------ *
 * The key
 * ------------------------------------------------------------------ */

let _key;

/**
 * Where the public key comes from.
 *
 * `ACCESS_PUBLIC_KEY` pins it in the module's own environment: no network on
 * any path, ever, and the console being down cannot affect a module that is up.
 * The cost is that a key rotation needs a redeploy here.
 *
 * Unset, the JWKS endpoint is fetched and cached for five minutes, so rotation
 * is automatic. jose serves the cached set while it is warm and refuses to
 * hammer the endpoint on an unknown `kid` more than twice a minute — an
 * envelope signed by a key nobody publishes must not become a way to make this
 * module DoS the console.
 */
function key() {
  if (_key) return _key;

  const pinned = String(process.env.ACCESS_PUBLIC_KEY || "").trim().replace(/\\n/g, "\n");
  if (pinned) {
    _key = importSPKI(pinned, "RS256");
    return _key;
  }

  const jwks = createRemoteJWKSet(new URL("/.well-known/jwks.json", consoleUrl()), {
    cacheMaxAge: 5 * 60 * 1000,
    cooldownDuration: 30 * 1000,
  });
  _key = Promise.resolve(jwks);
  return _key;
}

/** Only for tests, and for a process that has changed its own configuration. */
export function forgetKey() {
  _key = undefined;
}

/* ------------------------------------------------------------------ *
 * Verification
 * ------------------------------------------------------------------ */

/**
 * @returns {Promise<{its: string, name: string|null, tier: string, mods: object}|null>}
 *
 * Null for every failure — expired, tampered, wrong issuer, no key to be had.
 * A module has exactly one useful response to all of those (send them to the
 * console for a fresh one), so distinguishing them here would only invite a
 * caller to treat some of them as "close enough".
 */
export async function verifyEnvelope(token) {
  if (!token) return null;
  try {
    const resolved = await key();
    const { payload } = await jwtVerify(token, resolved, {
      algorithms: ["RS256"],
      issuer: issuer(),
    });
    return {
      its: String(payload.sub),
      name: payload.nm ?? null,
      tier: payload.tier ?? "recognised",
      mods: payload.mods ?? {},
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * The question a module actually asks
 * ------------------------------------------------------------------ */

/** What this envelope grants on one resource, or null if it grants nothing there. */
export function rightsFor(envelope, module, resource) {
  const res = envelope?.mods?.[module]?.res;
  if (!res) return null;
  return res[resource] ?? res["*"] ?? null;
}

/** Every resource of this module the envelope touches. Empty means no access at all. */
export function resourcesOf(envelope, module) {
  return Object.keys(envelope?.mods?.[module]?.res ?? {});
}

/**
 * Whether the envelope permits one specific thing.
 *
 * `action` is a VCED verb, `capability` is anything that is not CRUD, and
 * `scope` is `{t, id}` — a dimension and a value, the same shape the console
 * puts in the envelope.
 *
 * On scope, which is the part worth reading twice:
 *
 *   rule "all"   every value of every dimension
 *   rule "own"   only the values listed on the grant
 *   rule "none"  the grant carries no scope authority at all
 *
 * Ask without a `scope` and scoping is not consulted — correct for a module
 * whose data is not partitioned, and the reason an unscoped grant is not
 * accidentally useless. Ask *with* one and "none" denies, because a grant that
 * was never given a scope rule has not been given that jamiat either.
 *
 * A module that declares a dimension and then never passes `scope` here has a
 * restriction that exists only in the console. That is not a thing this package
 * can detect for you.
 */
export function allows(envelope, { module, resource, action, capability, scope } = {}) {
  const rights = rightsFor(envelope, module, resource);
  if (!rights) return false;

  if (action) {
    const bit = SHORT[action];
    if (!bit) throw new Error(`"${action}" is not one of ${VCED.join(", ")}`);
    if (!rights[bit]) return false;
  }

  if (capability && !(rights.caps || []).includes(capability)) return false;

  if (scope) {
    const rule = rights.rule || "none";
    if (rule === "none") return false;
    if (rule === "own") {
      const held = rights.scopes || [];
      if (!held.some((s) => s.t === scope.t && String(s.id) === String(scope.id))) return false;
    }
  }

  // Asking nothing of a resource that appears at all is asking "may they see
  // this exists", and the resolver already dropped anything empty.
  return true;
}

/** The scope values held on a resource, for a module filtering its own query. */
export function scopesFor(envelope, module, resource, dimension) {
  const rights = rightsFor(envelope, module, resource);
  if (!rights) return { rule: "none", values: [] };
  const rule = rights.rule || "none";
  const values = (rights.scopes || [])
    .filter((s) => !dimension || s.t === dimension)
    .map((s) => s.id);
  return { rule, values };
}
