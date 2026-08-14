/**
 * What owning a module confers — pure, no I/O, no Next.
 *
 * Split out of `lib/console.js` for the same reason `lib/resolve.js` is split
 * out of `lib/access.js`: the rule that decides whether one person may hand out
 * access to another person's module is worth being able to state exhaustively
 * in a test, and anything importing `next/headers` cannot be run by `node
 * --test`. The I/O half stays in console.js; this half is the decision.
 *
 * ── Platform Admin is per module ──────────────────────────────────────────
 *
 * Not a global tier. It is written on a module's own row — `Modules.Platform
 * Admin`, ITS IDs one per line — and it means *this person built this thing*.
 * Which module you administer decides what you can do:
 *
 *   owns `user-access`   the console itself: roles, members, every module,
 *                        every grant. This is the global power, and it is
 *                        global precisely because that is the module it owns.
 *
 *   owns anything else   everything about **their** module and nothing about
 *                        anyone else's. They hand out access to it, to whoever
 *                        they like, without waiting on a central administrator
 *                        — which is the point, because the person who built a
 *                        module knows who needs it and a central queue does
 *                        not.
 *
 * An owner **uses** the access roles that exist and may not change them. A role
 * is fleet-wide vocabulary: editing "Section Head" to suit one module rewrites
 * what it means everywhere it is granted. So `access_role` is view-only for
 * owners, and shaping the role list stays with whoever owns this console.
 *
 * The two levers an owner does hold are deliberately different in kind:
 *
 *   permission   grant a *role* rights over their module — durable, and it
 *                follows whoever holds that role as people come and go
 *   override     grant or deny a *person* on their module — the exception,
 *                with a reason and an expiry
 *
 * Both are confined to modules they own. Neither reaches `user-access` itself
 * unless that is the module they own, so no owner can widen their own reach.
 */

export const CONSOLE_MODULE = "user-access";

const SHORT = { view: "v", create: "c", edit: "e", delete: "d" };

/**
 * Exactly what owning a module confers on this console, and nothing more.
 *
 * Listed rather than derived, so that adding a resource to the manifest can
 * never silently widen what every module owner can already do. Each line is a
 * decision; adding one should feel like making it.
 */
export const OWNER_MAY = new Set([
  // Their module's cells in the matrix: grant a role rights over their module.
  "permission:view",
  "permission:edit",
  "permission:bulk_edit",
  // Person-level exceptions on their module, including ending one early.
  "override:view",
  "override:create",
  "override:expire",
  // Use the roles that exist. Never shape them — see the note above.
  "access_role:view",
  // Their own registry row, and re-reading their own manifest after a deploy.
  "module:view",
  "module:fetch_manifest",
  // Hand their module to a colleague. Deliberately not `module:edit` — that
  // would also let them change the URL the manifest is read from, or flip the
  // module to Public, both of which reach past their own module.
  "module:set_owner",
  // Why a person can reach their module, narrowed to their own modules.
  "explain:view",
  // Their module's audit trail.
  "log:view",
]);

/** ITS IDs off a module row, one per line. Blank lines and stray commas ignored. */
export const ownersOf = (module) =>
  String(module?.platformAdmin ?? "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);

/**
 * May this caller do this, here, to this module?
 *
 * `moduleKey` is which module the write concerns. Omitting it asks the general
 * question — "may they open this screen at all" — which an owner passes, since
 * they hold the screen for their own module. Every *write* passes it, so the
 * general answer can never stand in for the specific one.
 */
export function can(access, resource, action, { moduleKey } = {}) {
  if (!access?.authenticated) return false;
  if (access.global) return true;

  if (moduleKey) {
    if (access.owns?.includes(moduleKey)) return OWNER_MAY.has(`${resource}:${action}`);
  } else if (access.owns?.length) {
    // No module named: an owner may reach the screen if owning anything grants
    // it. What they may do once inside is decided per row, with a moduleKey.
    if (OWNER_MAY.has(`${resource}:${action}`)) return true;
  }

  const r = access.rights?.[resource] ?? access.rights?.["*"];
  if (!r) return false;

  const bit = SHORT[action];
  if (bit) return r[bit] === 1 || r[bit] === true;
  return (r.caps ?? []).includes(action);
}

/**
 * Which modules this caller may act on for a given resource.
 *
 * `null` means every module — the answer for whoever owns this console, and for
 * a matrix grant that names no module. Otherwise it is the list, and a screen
 * showing anything outside it is showing rows nobody can use.
 */
export function scopeModules(access, resource, action = "edit") {
  if (!access?.authenticated) return [];
  if (access.global) return null;
  if (access.owns?.length && OWNER_MAY.has(`${resource}:${action}`)) return [...access.owns];
  // A matrix grant on this console is not module-scoped — Role Permissions has
  // no column for scope values, so a grant here is all modules or none.
  return can(access, resource, action) ? null : [];
}

/** Every resource of this console the caller may open at all. For the nav. */
export function viewable(access) {
  const out = {};
  for (const key of ["permission", "member", "access_role", "module", "override", "explain", "log"]) {
    out[key] = can(access, key, "view");
  }
  return out;
}
