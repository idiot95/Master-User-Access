import "server-only";
import { loadAccessState, buildEnvelope } from "./access.js";
import { currentClaims } from "./session.js";
import { can, ownersOf, CONSOLE_MODULE, OWNER_MAY, scopeModules, viewable } from "./owner.js";

/**
 * Resolving who is asking, and refusing them when they may not.
 *
 * The rules themselves are in `lib/owner.js`, which is pure and therefore
 * testable; this file is the half that touches Teable, the session and the
 * environment. Read that one first — it is where what ownership *means* is
 * decided.
 *
 * ── Not locking yourself out ──────────────────────────────────────────────
 *
 * A self-governing console has one failure mode above all others: nobody holds
 * the grant, and the screen you would use to fix that is the screen you can no
 * longer open. Three ways back in, in the order they are consulted:
 *
 *   1. CONSOLE_BOOTSTRAP_ADMINS — ITS IDs in the environment, read before any
 *      Teable call, so it works when the matrix is empty, when a row was
 *      deleted by mistake, and when the access base is misconfigured. A list
 *      rather than a boolean: "these two people" is auditable and removable,
 *      where OPEN_CONSOLE=1 would silently promote everyone the moment it
 *      landed on the wrong deployment.
 *   2. Owning `user-access` on its own registry row.
 *   3. Tier `admin` from the matrix, which PLAN.md defines as "manages the
 *      matrix itself".
 */

export { can, ownersOf, scopeModules, viewable, CONSOLE_MODULE, OWNER_MAY };

const BOOTSTRAP = String(process.env.CONSOLE_BOOTSTRAP_ADMINS || "")
  .split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);

export const isBootstrapAdmin = (itsId) => !!itsId && BOOTSTRAP.includes(String(itsId).trim());

export class ConsoleDenied extends Error {
  constructor(message, { resource, action, moduleKey, its } = {}) {
    super(message);
    this.name = "ConsoleDenied";
    this.status = 403;
    this.resource = resource;
    this.action = action;
    this.moduleKey = moduleKey;
    this.its = its;
  }
}

/**
 * Who is asking, what they own, and what the matrix additionally grants them.
 *
 * Manifests are deliberately not loaded. They only sharpen public-module seeds
 * and scope claims, this module declares no scope dimensions, and fetching them
 * would put every other module's uptime on the path of opening the console —
 * the one screen that has to work when something else is broken.
 */
export async function consoleAccess(request) {
  const claims = await currentClaims(request);
  const itsId = String(claims?.its_id ?? "").trim();

  const nobody = {
    authenticated: false, itsId: null, name: null, tier: null,
    rights: {}, owns: [], global: false,
  };
  if (!itsId) return nobody;

  // The escape hatch answers before anything can fail.
  if (isBootstrapAdmin(itsId)) {
    return {
      authenticated: true, itsId, name: claims.name ?? null, tier: "admin",
      rights: {}, owns: [], global: true, via: "bootstrap",
    };
  }

  let envelope, modules;
  try {
    const state = await loadAccessState();
    modules = state.modules;
    envelope = buildEnvelope({ itsId, claims, state });
  } catch (e) {
    // Teable unreachable is not "you have no rights" — reporting it that way
    // sends someone hunting a permission problem that does not exist.
    throw new Error(`Could not resolve access for ITS ${itsId}: ${e.message || e}`);
  }

  const owns = modules.filter((m) => ownersOf(m).includes(itsId)).map((m) => m.key);

  return {
    authenticated: true,
    itsId,
    name: envelope.name,
    tier: envelope.tier,
    rights: envelope.mods?.[CONSOLE_MODULE]?.res ?? {},
    owns,
    global: owns.includes(CONSOLE_MODULE) || envelope.tier === "admin",
    via: "matrix",
  };
}

/**
 * Explaining a person shows what they hold everywhere, which is more than an
 * owner should see. They get the same screen narrowed to their own modules.
 */
export const mayExplain = (access) => access?.global || (access?.owns?.length ?? 0) > 0;

/**
 * The one call every write here must make first.
 *
 * Returns the access so a caller can log who acted without resolving twice.
 */
export async function requireConsole({ resource, action, moduleKey }) {
  const access = await consoleAccess();

  if (!access.authenticated) {
    throw new ConsoleDenied("Not signed in.", { resource, action, moduleKey });
  }
  if (!can(access, resource, action, { moduleKey })) {
    throw new ConsoleDenied(
      moduleKey
        ? `You do not administer ${moduleKey}, so you cannot ${action} its ${resource}.`
        : `You do not hold ${action} on ${resource} in User Access.`,
      { resource, action, moduleKey, its: access.itsId });
  }
  return access;
}
