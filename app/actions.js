"use server";

import { revalidateTag } from "next/cache";
import { createRecords, updateRecord } from "../lib/teable.js";
import {
  idOf, T, getRolePermissions, getAccessMembers, getModules, getAccessRoles,
} from "../lib/model.js";
import { fetchManifest } from "../lib/manifest.js";
import { orphansAgainst, revivedAgainst } from "../lib/manifest.js";
import { requireConsole } from "../lib/console.js";
import { record } from "../lib/log.js";

/**
 * Every write in the app.
 *
 * Three rules hold throughout, the first two inherited from office-console:
 *   · a write is followed by revalidateTag, so a change is live on the next
 *     resolve rather than up to 30 seconds later
 *   · nothing is ever deleted. A grant that is withdrawn is emptied, and an
 *     override that ends is expired, so the record of what was once true
 *     survives — an audit trail that vanishes on edit is not one.
 *   · **every one of them opens with `guard`.** This console is a module in
 *     its own registry, and the right to hand out rights is itself a grant
 *     someone holds or does not. Hiding a button is a courtesy; this is the
 *     control.
 */

const ok = (message, extra = {}) => ({ ok: true, message, ...extra });
const fail = (message) => ({ ok: false, message });

/**
 * Check first, and report a refusal the way every other failure is reported.
 *
 * A denial returns rather than throws because the view renders the result
 * beside the control the person just used — a thrown error would replace the
 * whole screen with an error boundary and lose what they had typed.
 *
 * `moduleKey` is which module the write concerns, and it is what confines a
 * module owner to their own. Omit it only where a write genuinely touches no
 * single module — a role, or a member's roles across the fleet.
 *
 * A refusal is logged before it returns. An attempt that was turned away
 * leaves no other trace anywhere, which makes it the half of the trail worth
 * being careful about.
 *
 * @returns {Promise<{denied: object}|{access: object}>} — check `.denied` first.
 */
async function guard(resource, action, moduleKey) {
  try {
    const access = await requireConsole({ resource, action, moduleKey });
    return { access };
  } catch (e) {
    await record({
      actor: e.its ?? "(unknown)", moduleKey, resource, action,
      result: "denied", detail: e.message,
    });
    return { denied: fail(e.message) };
  }
}

/** Record a write that happened. Never throws — see lib/log.js. */
const logged = (access, e) => record({
  actor: access?.itsId, actorName: access?.name, result: "ok", ...e,
});

const bump = (...tables) => tables.forEach((t) => revalidateTag(`t:${t}`));

const bool = (form, name) => form.get(name) === "on" || form.get(name) === "true";
const str = (form, name) => String(form.get(name) ?? "").trim();

/* ------------------------------------------------------------------ *
 * The matrix
 * ------------------------------------------------------------------ */

/**
 * Set one cell: an access role's rights over one resource of one module.
 *
 * Upsert by (role, module, resource) — never a second live row for the same
 * cell, the same way office-console refuses a duplicate assignment.
 */
export async function setPermission(_prev, form) {
  const { denied, access } = await guard("permission", "edit", str(form, "moduleKey"));
  if (denied) return denied;
  const roleId = str(form, "roleId");
  const moduleId = str(form, "moduleId");
  const moduleKey = str(form, "moduleKey");
  const resource = str(form, "resource");
  if (!roleId || !moduleId || !resource) return fail("Role, module and resource are all required.");

  const fields = {
    View: bool(form, "view"), Create: bool(form, "create"),
    Edit: bool(form, "edit"), Delete: bool(form, "delete"),
    Capabilities: str(form, "capabilities"),
    "Scope Rule": str(form, "scopeRule") || "none",
  };

  const table = await idOf(T.ROLE_PERMISSIONS);
  const existing = (await getRolePermissions())
    .find((p) => p.roleId === roleId && p.moduleKey === moduleKey && p.resource === resource);

  if (existing) {
    await updateRecord(table, existing.id, fields);
  } else {
    await createRecords(table, [{
      Grant: `${str(form, "roleName") || roleId} — ${moduleKey} — ${resource}`,
      "Access Role": { id: roleId },
      Module: { id: moduleId },
      Resource: resource,
      ...fields,
    }]);
  }
  bump(T.ROLE_PERMISSIONS);

  const granted = fields.View || fields.Create || fields.Edit || fields.Delete;
  await logged(access, {
    moduleKey, resource: "permission", action: "edit",
    target: `${str(form, "roleName") || roleId} — ${resource}`,
    detail: granted
      ? `${["view", "create", "edit", "delete"].filter((v) => fields[v[0].toUpperCase() + v.slice(1)]).join(" ")}`
        + `${fields.Capabilities ? ` · caps: ${fields.Capabilities.replace(/\n/g, ", ")}` : ""}`
        + ` · scope ${fields["Scope Rule"]}`
      : "cleared — grants nothing",
  });
  return ok(granted ? "Saved." : "Cleared — with nothing ticked, this cell grants no access.");
}

/**
 * Set one verb across many cells at once — a whole role's row, a whole module's
 * column, or every resource inside a single cell.
 *
 * The caller sends the exact list of (role, module, resource) triples it means,
 * computed from the manifests it is already rendering. This action does not
 * expand "all" itself: a bulk write that decides its own scope on the server is
 * one where the confirmation dialog and the effect can drift apart.
 *
 * A verb is only ever written where the resource declares it. Ticking "delete"
 * across a column must not invent a delete on a module that has no such path.
 */
export async function setVerbAcross(_prev, form) {
  const verb = str(form, "verb");
  if (!["View", "Create", "Edit", "Delete"].includes(verb)) return fail("Unknown action.");
  const value = form.get("value") === "true";

  let targets;
  try { targets = JSON.parse(str(form, "targets") || "[]"); }
  catch { return fail("Could not read the selection."); }
  if (!Array.isArray(targets) || targets.length === 0) return fail("Nothing selected.");
  if (targets.length > 500) return fail("Too many at once — narrow the selection.");

  // A bulk spans many cells and so, possibly, many modules. Every one is checked
  // rather than the request as a whole: an owner ticking a whole role's row must
  // not sweep up modules they do not administer. All or nothing, because this
  // file's own rule is that a bulk write's confirmation and its effect must not
  // drift apart — a partial sweep is precisely that drift.
  const moduleKeys = [...new Set(targets.map((t) => t.moduleKey).filter(Boolean))];
  if (!moduleKeys.length) return fail("Nothing selected names a module.");
  let access;
  for (const key of moduleKeys) {
    const g = await guard("permission", "bulk_edit", key);
    if (g.denied) return g.denied;
    access = g.access;
  }

  const table = await idOf(T.ROLE_PERMISSIONS);
  const existing = await getRolePermissions();
  const find = (t) => existing.find((p) =>
    p.roleId === t.roleId && p.moduleKey === t.moduleKey && p.resource === t.resource);

  let created = 0;
  const toCreate = [];
  const toUpdate = [];

  for (const t of targets) {
    if (!t.roleId || !t.moduleKey || !t.resource) continue;
    const row = find(t);
    if (row) {
      // Already in the wanted state — leave it alone rather than churn the row
      // and its modified time.
      if (!!row[verb.toLowerCase()] === value) continue;
      toUpdate.push(row.id);
    } else if (value) {
      toCreate.push({
        Grant: `${t.roleName || t.roleId} — ${t.moduleKey} — ${t.resource}`,
        "Access Role": { id: t.roleId },
        Module: { id: t.moduleId },
        Resource: t.resource,
        View: verb === "View", Create: verb === "Create",
        Edit: verb === "Edit", Delete: verb === "Delete",
        "Scope Rule": t.scopeRule || "none",
      });
      created++;
    }
    // value === false with no row is already the desired state: absent is denied.
  }

  // Teable has no batch PATCH, so updates go one call each — but in bounded
  // parallel rather than in series. A hundred sequential round-trips is slow
  // enough to look hung, and a bulk that looks hung is a bulk someone
  // interrupts halfway.
  const CONCURRENCY = 8;
  for (let i = 0; i < toUpdate.length; i += CONCURRENCY) {
    await Promise.all(toUpdate.slice(i, i + CONCURRENCY)
      .map((id) => updateRecord(table, id, { [verb]: value })));
  }
  if (toCreate.length) await createRecords(table, toCreate);
  bump(T.ROLE_PERMISSIONS);

  const total = toUpdate.length + created;
  await logged(access, {
    moduleKey: moduleKeys.length === 1 ? moduleKeys[0] : "",
    resource: "permission", action: "bulk_edit",
    target: `${targets.length} cell(s)`,
    detail: `${value ? "granted" : "removed"} ${verb.toLowerCase()} across ${moduleKeys.join(", ")}`
      + ` — ${total} changed`,
  });
  if (total === 0) return ok("Nothing to change — already in that state.");
  return ok(value
    ? `${verb.toLowerCase()} granted on ${total} ${total === 1 ? "resource" : "resources"}.`
    : `${verb.toLowerCase()} removed from ${total} ${total === 1 ? "resource" : "resources"}.`);
}

/* ------------------------------------------------------------------ *
 * Modules
 * ------------------------------------------------------------------ */

export async function saveModule(_prev, form) {
  const { denied, access } = await guard("module", str(form, "id") ? "edit" : "create", str(form, "key").toLowerCase());
  if (denied) return denied;
  const key = str(form, "key").toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,31}$/.test(key)) {
    return fail("Key must be lowercase letters, digits, dash or underscore.");
  }
  const fields = {
    Key: key,
    Name: str(form, "name") || key,
    "Name (Arabic)": str(form, "nameArabic"),
    URL: str(form, "url"),
    Icon: str(form, "icon"),
    Sort: Number(str(form, "sort") || 0),
    Status: str(form, "status") || "Beta",
    Visibility: str(form, "visibility") || "Granted",
    Notes: str(form, "notes"),
  };

  const table = await idOf(T.MODULES);
  const id = str(form, "id");
  if (id) {
    await updateRecord(table, id, fields);
  } else {
    if ((await getModules()).some((m) => m.key === key)) return fail(`Module "${key}" already exists.`);
    await createRecords(table, [{ ...fields, "Manifest Status": "Never fetched" }]);
  }
  bump(T.MODULES);
  await logged(access, {
    moduleKey: key, resource: "module", action: id ? "edit" : "create", target: key,
    detail: `${fields.Status}/${fields.Visibility}${fields.URL ? ` · ${fields.URL}` : ""}`,
  });
  return ok(id ? "Module saved." : `Module "${key}" registered.`);
}

/**
 * Who administers this module.
 *
 * The per-module half of Platform Admin, and the only way to set it that is not
 * a Teable row edit. Its own capability rather than part of `module:edit`,
 * because an owner handing their module to a colleague is a different act from
 * changing the URL its manifest is read from or flipping it to Public — those
 * reach past their own module, and this does not.
 *
 * An owner may name co-owners of a module they already administer, which is
 * what makes the model self-sustaining: a team does not have to come back to
 * whoever runs the console every time someone joins it.
 *
 * The list is stored as ITS IDs, one per line, and validated here rather than
 * trusted: a typo'd digit is a person who quietly holds nothing, which reads as
 * "the console is broken" long before anyone suspects the input.
 */
export async function setModuleOwners(_prev, form) {
  const { denied, access } = await guard("module", "set_owner", str(form, "moduleKey"));
  if (denied) return denied;

  const moduleId = str(form, "moduleId");
  if (!moduleId) return fail("No module named.");

  const raw = String(form.get("owners") ?? "");
  const ids = [...new Set(raw.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean))];
  const bad = ids.filter((x) => !/^\d{6,10}$/.test(x));
  if (bad.length) {
    return fail(`Not an ITS ID: ${bad.join(", ")}. Six to ten digits, one per line.`);
  }

  // Emptying it is allowed and is not a mistake worth blocking — a module whose
  // owner has left should be administrable by whoever runs the console until a
  // new one is named. But say what it means, because it is easy to do by accident.
  await updateRecord(await idOf(T.MODULES), moduleId, { "Platform Admin": ids.join("\n") });
  bump(T.MODULES);

  await logged(access, {
    moduleKey: str(form, "moduleKey"), resource: "module", action: "set_owner",
    target: ids.join(", ") || "(nobody)",
    detail: `${ids.length} administrator${ids.length === 1 ? "" : "s"}`,
  });

  return ok(ids.length
    ? `${ids.length} administrator${ids.length === 1 ? "" : "s"} — they hold this module's permissions, overrides and log.`
    : "Cleared. Only whoever administers User Access can grant access to this module now.");
}

/**
 * Re-read a module's manifest and reconcile the grants that point at it.
 *
 * A fetch failure leaves the stored hash and every orphan flag untouched. A
 * module being briefly unreachable must never retroactively invalidate grants
 * that were correct a minute ago.
 */
export async function refreshManifest(_prev, form) {
  const { denied, access } = await guard("module", "fetch_manifest", str(form, "moduleKey"));
  if (denied) return denied;
  const moduleId = str(form, "moduleId");
  const moduleKey = str(form, "moduleKey");
  const url = str(form, "url");

  const table = await idOf(T.MODULES);
  const result = await fetchManifest(moduleKey, url, { revalidate: 0 });

  if (!result.ok) {
    await updateRecord(table, moduleId, {
      "Manifest Status": result.status,
      "Manifest Checked": new Date().toISOString(),
    });
    bump(T.MODULES);
    // A failed fetch is recorded too: "the manifest stopped resolving on the
    // 12th" is the fact someone needs when grants start reading as orphaned.
    await logged(access, {
      moduleKey, resource: "module", action: "fetch_manifest", target: url,
      detail: `${result.status} — ${result.error}`,
    });
    return fail(`${moduleKey}: ${result.error}`);
  }

  await updateRecord(table, moduleId, {
    "Manifest Status": "OK",
    "Manifest Hash": result.hash,
    "Manifest Checked": new Date().toISOString(),
  });

  const rows = (await getRolePermissions()).filter((p) => p.moduleKey === moduleKey);
  const permTable = await idOf(T.ROLE_PERMISSIONS);

  const orphans = orphansAgainst(result.manifest, rows).filter((o) => !o.row.orphaned);
  for (const { row, reason } of orphans) {
    await updateRecord(permTable, row.id, { Orphaned: true, "Orphaned Reason": reason });
  }
  const revived = revivedAgainst(result.manifest, rows);
  for (const row of revived) {
    await updateRecord(permTable, row.id, { Orphaned: false, "Orphaned Reason": "" });
  }

  bump(T.MODULES, T.ROLE_PERMISSIONS);
  await logged(access, {
    moduleKey, resource: "module", action: "fetch_manifest", target: url,
    detail: `OK · hash ${result.hash.slice(0, 12)}`
      + `${orphans.length ? ` · ${orphans.length} flagged` : ""}`
      + `${revived.length ? ` · ${revived.length} un-flagged` : ""}`,
  });
  const notes = [
    orphans.length ? `${orphans.length} grant${orphans.length === 1 ? "" : "s"} flagged` : null,
    revived.length ? `${revived.length} un-flagged` : null,
  ].filter(Boolean).join(", ");
  return ok(`${moduleKey} manifest OK${notes ? ` — ${notes}` : ""}.`, { hash: result.hash });
}

/* ------------------------------------------------------------------ *
 * Access roles
 * ------------------------------------------------------------------ */

/**
 * Create or edit an access role.
 *
 * The three membership kinds are the whole design, so they are validated hard:
 * an Org Role with no org role behind it would match nobody and read as a bug,
 * and an Explicit role is the only kind that ever stores a person.
 */
export async function saveAccessRole(_prev, form) {
  const { denied, access } = await guard("access_role", str(form, "id") ? "edit" : "create");
  if (denied) return denied;
  const id = str(form, "id");
  const key = str(form, "key").toLowerCase();
  const name = str(form, "name");
  const membership = str(form, "membership");
  const orgRole = str(form, "orgRole");
  const inherits = str(form, "inheritsFrom");

  if (!/^[a-z][a-z0-9_-]{1,47}$/.test(key)) {
    return fail("Key must be lowercase letters, digits, dash or underscore.");
  }
  if (!name) return fail("Give the role a name people will recognise.");
  if (!["Everyone", "Org Role", "Explicit"].includes(membership)) return fail("Pick how membership is decided.");
  if (membership === "Org Role" && !orgRole) {
    return fail("Choose which org role this follows, or it will match nobody.");
  }

  const roles = await getAccessRoles();
  const clash = roles.find((r) => r.key === key && r.id !== id);
  if (clash) return fail(`The key "${key}" is already used by ${clash.name}.`);

  // A cycle in Inherits From would make the closure walk pointless work; the
  // resolver guards it too, but a role that inherits from itself is a mistake
  // worth refusing at the point it is made.
  if (inherits) {
    if (inherits === id) return fail("A role cannot inherit from itself.");
    const byId = new Map(roles.map((r) => [r.id, r]));
    let cur = byId.get(inherits), hops = 0;
    while (cur && hops++ < 32) {
      if (cur.id === id) return fail("That would make the two roles inherit from each other.");
      cur = cur.inheritsFrom ? byId.get(cur.inheritsFrom) : null;
    }
  }

  const fields = {
    Key: key,
    Name: name,
    "Name (Arabic)": str(form, "nameArabic"),
    Level: Number(str(form, "level") || 0),
    Tier: str(form, "tier") || "member",
    Membership: membership,
    // Only meaningful for Org Role; cleared otherwise so a later change of mind
    // does not leave a stale rule behind.
    "Org Role": membership === "Org Role" ? orgRole : "",
    "Inherits From": inherits ? { id: inherits } : null,
    Notes: str(form, "notes"),
  };

  const table = await idOf(T.ACCESS_ROLES);
  if (id) await updateRecord(table, id, fields);
  else await createRecords(table, [fields]);
  bump(T.ACCESS_ROLES);
  await logged(access, {
    resource: "access_role", action: id ? "edit" : "create", target: name,
    detail: `${membership}${orgRole ? ` — ${orgRole}` : ""} · tier ${fields.Tier}`
      + `${inherits ? " · inherits" : ""}`,
  });

  const how = membership === "Everyone"
    ? "Everyone who signs in now holds it — grant it only what any recognised person may see."
    : membership === "Org Role"
    ? `Held by whoever currently has “${orgRole}”. Nobody is listed by name.`
    : "Add people to it on Members.";
  return ok(`${id ? "Saved" : "Created"} — ${how}`);
}

/* ------------------------------------------------------------------ *
 * Members
 * ------------------------------------------------------------------ */

/**
 * Grant by ITS ID, creating the person's row if there is not one.
 *
 * Keyed on ITS ID and not on a link to the register, which is what lets you
 * provision someone the office has never heard of — most of the eligible
 * population.
 */
export async function grantMember(_prev, form) {
  const { denied, access } = await guard("member", "create");
  if (denied) return denied;
  const itsId = str(form, "itsId");
  if (!/^\d{6,10}$/.test(itsId)) return fail("An ITS ID is 6–10 digits.");

  const roleIds = form.getAll("roleIds").map(String).filter(Boolean);
  const table = await idOf(T.ACCESS_MEMBERS);
  const existing = (await getAccessMembers()).find((m) => m.itsId === itsId);

  const fields = {
    "ITS ID": itsId,
    Name: str(form, "name"),
    Status: str(form, "status") || "Active",
    Expires: str(form, "expires") || null,
    "Access Roles": roleIds.map((id) => ({ id })),
  };

  if (existing) {
    await updateRecord(table, existing.id, fields);
  } else {
    await createRecords(table, [{
      ...fields,
      "Added By": str(form, "addedBy") || "console",
      "Added On": new Date().toISOString(),
    }]);
  }
  bump(T.ACCESS_MEMBERS);
  await logged(access, {
    resource: "member", action: "create", target: itsId,
    detail: `${existing ? "updated" : "provisioned"} with ${roleIds.length} role(s)`
      + `${fields.Expires ? ` · expires ${fields.Expires}` : ""}`,
  });
  return ok(existing ? `${itsId} updated.` : `${itsId} provisioned with ${roleIds.length} role(s).`);
}

/** Suspend or reinstate. Never a delete — the history of who had access is the point. */
export async function setMemberStatus(_prev, form) {
  const { denied, access } = await guard("member", "suspend");
  if (denied) return denied;
  const id = str(form, "id");
  const status = str(form, "status");
  if (!id || !["Active", "Suspended"].includes(status)) return fail("Unknown status.");
  await updateRecord(await idOf(T.ACCESS_MEMBERS), id, { Status: status });
  bump(T.ACCESS_MEMBERS);
  await logged(access, { resource: "member", action: "suspend", target: id, detail: status });
  return ok(status === "Suspended"
    ? "Suspended. Rule-based roles are unaffected — use a deny override to lock someone out entirely."
    : "Reinstated.");
}

/* ------------------------------------------------------------------ *
 * Overrides
 * ------------------------------------------------------------------ */

export async function saveOverride(_prev, form) {
  const { denied, access } = await guard("override", "create", str(form, "moduleKey"));
  if (denied) return denied;
  const itsId = str(form, "itsId");
  const moduleId = str(form, "moduleId");
  const moduleKey = str(form, "moduleKey");
  const effect = str(form, "effect");
  const reason = str(form, "reason");

  if (!/^\d{6,10}$/.test(itsId)) return fail("An ITS ID is 6–10 digits.");
  if (!moduleId) return fail("Pick a module.");
  if (!["Grant", "Deny"].includes(effect)) return fail("Effect must be Grant or Deny.");
  // Required by the UI rather than by Teable: an exception whose reason is
  // unrecorded is indistinguishable from a mistake six months later.
  if (reason.length < 4) return fail("Give a reason — this is the record of why the exception exists.");

  const resource = str(form, "resource");
  await createRecords(await idOf(T.ACCESS_OVERRIDES), [{
    Override: `${itsId} — ${moduleKey}${resource ? ` — ${resource}` : ""} — ${effect}`,
    "Person ITS ID": itsId,
    Module: { id: moduleId },
    Resource: resource,
    Effect: effect,
    View: bool(form, "view"), Create: bool(form, "create"),
    Edit: bool(form, "edit"), Delete: bool(form, "delete"),
    Capabilities: str(form, "capabilities"),
    "Scope Rule": str(form, "scopeRule") || null,
    Reason: reason,
    Expires: str(form, "expires") || null,
  }]);
  bump(T.ACCESS_OVERRIDES);
  await logged(access, {
    moduleKey, resource: "override", action: "create", target: itsId,
    detail: `${effect}${resource ? ` on ${resource}` : " (whole module)"} — ${reason}`,
  });

  const blanket = effect === "Deny" && !resource
    && !bool(form, "view") && !bool(form, "create") && !bool(form, "edit") && !bool(form, "delete");
  return ok(blanket
    ? `Full lockout on ${moduleKey} for ${itsId}. Deny always wins — no grant can override it.`
    : `${effect} saved for ${itsId}.`);
}

/** End an override now by stamping it expired, rather than removing the row. */
export async function expireOverride(_prev, form) {
  const { denied, access } = await guard("override", "expire", str(form, "moduleKey"));
  if (denied) return denied;
  const id = str(form, "id");
  if (!id) return fail("No override named.");
  await updateRecord(await idOf(T.ACCESS_OVERRIDES), id, { Expires: new Date().toISOString() });
  bump(T.ACCESS_OVERRIDES);
  await logged(access, {
    moduleKey: str(form, "moduleKey"), resource: "override", action: "expire", target: id,
    detail: "ended early",
  });
  return ok("Expired. The row is kept — it is the record of an exception that once applied.");
}
