import "server-only";
import { loadAccessState, buildEnvelope } from "./access.js";
import { currentClaims } from "./session.js";

/**
 * The console governing itself.
 *
 * Until now anyone who could sign in could do everything: change the matrix,
 * provision members, retire modules. Four people made that survivable rather
 * than safe. This makes User Access a module in its own registry, so the right
 * to hand out rights is itself something you hold or do not.
 *
 * The circularity is the whole point and it is worth being explicit about:
 * `permission:edit` is the grant that lets someone change grants. Give it to
 * a person and they can give it to anyone, including back to themselves. That
 * is what delegation *is* — it is not a flaw to be engineered away, it is the
 * thing being asked for, and the audit trail is `Explain` plus the Teable row
 * history.
 *
 * ── Not locking yourself out ──────────────────────────────────────────────
 *
 * A self-governing console has one failure mode that matters more than any
 * other: nobody holds the grant, and the screen you would use to fix that is
 * the screen you can no longer open. Two independent ways back in:
 *
 *   1. **Platform Admin.** Tier `admin` passes everything here. That is not a
 *      shortcut — PLAN.md defines the tier as "manages the matrix itself", so
 *      the console is exactly what it is for.
 *   2. **CONSOLE_BOOTSTRAP_ADMINS.** A list of ITS IDs in the environment,
 *      read before any Teable call. It works when the matrix is empty, when
 *      the grant was deleted by mistake, and when Teable is answering but the
 *      access base is wrong. A list rather than a boolean, deliberately:
 *      "these two people" is auditable and removable, where an
 *      OPEN_CONSOLE=1 flag would silently make every signed-in person an
 *      administrator the moment it landed on the wrong deployment.
 *
 * Delete the variable once a real Platform Admin exists. Nothing else changes,
 * because every call below still goes through `can`.
 */

export const CONSOLE_MODULE = "user-access";

const BOOTSTRAP = String(process.env.CONSOLE_BOOTSTRAP_ADMINS || "")
  .split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);

export const isBootstrapAdmin = (itsId) => !!itsId && BOOTSTRAP.includes(String(itsId).trim());

const SHORT = { view: "v", create: "c", edit: "e", delete: "d" };

export class ConsoleDenied extends Error {
  constructor(message, { resource, action, its } = {}) {
    super(message);
    this.name = "ConsoleDenied";
    this.status = 403;
    this.resource = resource;
    this.action = action;
    this.its = its;
  }
}

/**
 * Who is asking, and what they hold *here*.
 *
 * Manifests are deliberately not loaded. They only sharpen public-module seeds
 * and scope claims, this module declares no scope dimensions, and fetching
 * them would put every other module's uptime on the path of opening the
 * console — the one screen that has to work when something else is broken.
 */
export async function consoleAccess(request) {
  const claims = await currentClaims(request);
  const itsId = String(claims?.its_id ?? "").trim();
  if (!itsId) {
    return { authenticated: false, itsId: null, name: null, tier: null, rights: {}, admin: false };
  }

  // The escape hatch answers before anything can fail.
  if (isBootstrapAdmin(itsId)) {
    return {
      authenticated: true, itsId, name: claims.name ?? null,
      tier: "admin", rights: {}, admin: true, via: "bootstrap",
    };
  }

  let envelope;
  try {
    const state = await loadAccessState();
    envelope = buildEnvelope({ itsId, claims, state });
  } catch (e) {
    // Teable unreachable is not "you have no rights" — reporting it that way
    // sends someone hunting a permission problem that does not exist.
    throw new Error(`Could not resolve access for ITS ${itsId}: ${e.message || e}`);
  }

  return {
    authenticated: true,
    itsId,
    name: envelope.name,
    tier: envelope.tier,
    rights: envelope.mods?.[CONSOLE_MODULE]?.res ?? {},
    admin: envelope.tier === "admin",
    via: "matrix",
  };
}

/**
 * May this caller do this, here?
 *
 * `action` is a VCED verb or a capability key, the same shape a module asks
 * with — the console is not a special case in its own vocabulary.
 */
export function can(access, resource, action) {
  if (!access?.authenticated) return false;
  if (access.admin) return true;

  const r = access.rights?.[resource] ?? access.rights?.["*"];
  if (!r) return false;

  const bit = SHORT[action];
  if (bit) return r[bit] === 1 || r[bit] === true;
  return (r.caps ?? []).includes(action);
}

/** Every resource of this console the caller may open at all. For the nav. */
export function viewable(access) {
  const out = {};
  for (const key of ["permission", "member", "access_role", "module", "override", "explain"]) {
    out[key] = can(access, key, "view");
  }
  return out;
}

/**
 * The one call every write here must make first.
 *
 * Returns the access so a caller can record who acted without resolving twice.
 */
export async function requireConsole({ resource, action }) {
  const access = await consoleAccess();

  if (!access.authenticated) {
    throw new ConsoleDenied("Not signed in.", { resource, action });
  }
  if (!can(access, resource, action)) {
    throw new ConsoleDenied(
      `You do not hold ${action} on ${resource} in User Access.`,
      { resource, action, its: access.itsId });
  }
  return access;
}
