import { cookies } from "next/headers";
import {
  verifyEnvelope, allows, rightsFor, resourcesOf, scopesFor,
  ENVELOPE_COOKIE, VCED, consoleUrl,
} from "./verify.js";

/**
 * The server-side check. This is the one that is security.
 *
 * `accessProxy` decides whether someone may reach the module at all, and it
 * runs before Next has chosen a route — so it cannot know that this particular
 * POST is trying to overwrite a whole year of schedules. Every write path has
 * to say what it is doing:
 *
 *   const access = await requireAccess({ resource: "schedule", action: "edit" });
 *
 * Two reasons this cannot be skipped on the grounds that the proxy already ran:
 *
 *   · Server Functions are POSTs to whatever route they were used on. Move one,
 *     or narrow a matcher, and the gate silently stops covering it. Next's own
 *     docs say to check inside the function rather than rely on the proxy.
 *   · Hiding a button is a courtesy to the person clicking. It is not a control.
 *     If the route does not check, the button may as well not exist.
 */

export {
  verifyEnvelope, allows, rightsFor, resourcesOf, scopesFor,
  ENVELOPE_COOKIE, VCED, consoleUrl,
};
export { accessProxy, accessMiddleware, accessMatcher } from "./proxy.js";

/**
 * The module key, when a module would rather not repeat it on thirty call
 * sites. `ACCESS_MODULE=hoto` in the environment, or pass `module:` every time.
 * A typo'd key silently grants nothing, so having one place to spell it is
 * worth the small amount of magic.
 */
const defaultModule = () => process.env.ACCESS_MODULE || null;

export class AccessDenied extends Error {
  constructor(message, { status = 403, module, resource, action, capability, its } = {}) {
    super(message);
    this.name = "AccessDenied";
    this.status = status;
    this.module = module;
    this.resource = resource;
    this.action = action;
    this.capability = capability;
    this.its = its;
  }
}

/** The current envelope, or null. Reads the cookie; verification is local. */
export async function getEnvelope() {
  const jar = await cookies();
  return verifyEnvelope(jar.get(ENVELOPE_COOKIE)?.value);
}

/** The current envelope, or a 401. For a route that needs to know who, not what. */
export async function requireEnvelope() {
  const envelope = await getEnvelope();
  if (!envelope) {
    throw new AccessDenied(`No access envelope on this request. Sign in at ${consoleUrl()}.`, { status: 401 });
  }
  return envelope;
}

/**
 * Assert one specific right, or throw.
 *
 * Returns the envelope so the caller can use `access.its` for an audit column
 * without reading the cookie twice.
 */
export async function requireAccess({ module = defaultModule(), resource, action, capability, scope } = {}) {
  if (!module) {
    throw new Error("requireAccess needs a module key — pass `module:` or set ACCESS_MODULE.");
  }
  const envelope = await requireEnvelope();

  if (!allows(envelope, { module, resource, action, capability, scope })) {
    throw new AccessDenied(refusal({ envelope, module, resource, action, capability, scope }), {
      status: 403, module, resource, action, capability, its: envelope.its,
    });
  }
  return envelope;
}

/** The same question without the throw, for deciding whether to draw a button. */
export async function can({ module = defaultModule(), resource, action, capability, scope } = {}) {
  const envelope = await getEnvelope();
  return !!envelope && allows(envelope, { module, resource, action, capability, scope });
}

/**
 * What to filter this person's query by.
 *
 *   const { rule, values } = await scopeFilter({ resource: "schedule", dimension: "jamiat" });
 *   if (rule === "own") query.where("jamiat", "in", values);
 *
 * `rule` is "all" (no filter), "own" (filter to `values`) or "none" (they hold
 * no scope authority — and if you are asking, that means no rows).
 */
export async function scopeFilter({ module = defaultModule(), resource, dimension } = {}) {
  const envelope = await getEnvelope();
  if (!envelope) return { rule: "none", values: [] };
  return scopesFor(envelope, module, resource, dimension);
}

/**
 * A message that says what was refused, not just that something was.
 *
 * "Forbidden" sends the person to whoever administers access with nothing
 * useful to say. This names the resource and the verb, which is exactly what
 * has to be ticked on the matrix to fix it.
 */
function refusal({ envelope, module, resource, action, capability, scope }) {
  const what = [
    action && `${action} on`,
    resource ? `"${resource}"` : "the module",
    capability && `(capability "${capability}")`,
    scope && `in ${scope.t} ${scope.id}`,
  ].filter(Boolean).join(" ");
  return `${envelope.its} may not ${what} in ${module}.`;
}
