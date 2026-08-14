import "server-only";
import { createRecords } from "./teable.js";
import { idOf, T } from "./model.js";

/**
 * The audit trail.
 *
 * Append only, and it records refusals as well as writes. The refused half is
 * the more interesting one: a grant that succeeded is visible in the matrix
 * afterwards, while an attempt that was turned away leaves no other trace at
 * all — and "who kept trying to reach that module" is exactly the question an
 * audit trail exists to answer.
 *
 * ── Never let logging break the thing it is logging ───────────────────────
 *
 * Every call here swallows its own errors. A write that succeeded and then
 * failed to log must still report success, because it *did* happen — telling
 * the person it failed would have them do it twice. The cost is that a Teable
 * outage silently loses entries, which is the right trade for a console whose
 * job is granting access rather than keeping books.
 *
 * Written after the fact rather than as part of the write: Teable has no
 * transactions, so a log entry written first would be a record of something
 * that may not have happened, which is worse than a missing one.
 */

/** One line, readable on its own — the log is scanned far more often than it is parsed. */
function summarise({ actor, actorName, moduleKey, resource, action, target, result }) {
  const who = actorName ? `${actorName} (${actor})` : actor;
  const what = `${action} ${resource}${moduleKey ? ` on ${moduleKey}` : ""}`;
  const refused = result === "denied" ? "refused: " : "";
  return `${refused}${who} — ${what}${target ? ` — ${target}` : ""}`;
}

/**
 * @param {object} e
 * @param {string} e.actor       ITS ID of whoever acted
 * @param {string} [e.actorName] their name at the time
 * @param {string} [e.moduleKey] which module this concerned, if one
 * @param {string} e.resource    the console resource
 * @param {string} e.action      verb or capability
 * @param {string} [e.target]    what was written
 * @param {"ok"|"denied"} [e.result]
 * @param {string} [e.detail]
 */
export async function record(e) {
  const entry = {
    Entry: summarise(e),
    At: new Date().toISOString(),
    Actor: String(e.actor ?? "").trim(),
    "Actor Name": e.actorName ?? "",
    Module: e.moduleKey ?? "",
    Resource: e.resource ?? "",
    Action: e.action ?? "",
    Target: e.target ?? "",
    Result: e.result ?? "ok",
    Detail: e.detail ?? "",
  };

  try {
    await createRecords(await idOf(T.ACCESS_LOG), [entry]);
  } catch (err) {
    // Deliberately not rethrown. Loud enough to find in the platform logs,
    // quiet enough that the person who just granted something is not told
    // their grant failed when it did not.
    console.error("[access-log] could not record:", entry.Entry, "—", err?.message || err);
  }
}

/**
 * Not revalidated on write, on purpose.
 *
 * Every other table here calls revalidateTag after a change so the next resolve
 * is current. The log is different: it is appended to on literally every write,
 * and busting its tag each time would make every grant pay to refresh a screen
 * almost nobody has open. The log page reads it fresh instead.
 */
export const LOG_IS_NOT_REVALIDATED = true;
