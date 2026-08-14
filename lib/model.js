import "server-only";
import { tables, records, title, ACCESS_BASE, OFFICE_BASE } from "./teable.js";

/**
 * The access domain on top of the raw tables.
 *
 * Table ids are resolved by name rather than hardcoded, exactly as
 * office-console does, so this survives a rebuild of the base and works
 * unchanged against local or cloud.
 *
 * Two kinds of reader live here:
 *
 *   shaped  — the five access tables, mapped to plain objects for the UI
 *   raw     — Role Assignments and DA Office Attendees, returned untouched
 *
 * The raw pair is deliberate. A link cell is `{id, title}`, and the resolver
 * must match a person on `.id`; matching on the title would make two people
 * with the same name a single identity, which is a permission bug that reads
 * like a typo.
 */

export const T = {
  // Existing office tables — read-only here. office-console owns writing them.
  ROLES: "Roles",
  ASSIGNMENTS: "Role Assignments",
  PEOPLE: "DA Office Attendees",
  // Written by the directory, read here only to sign someone in.
  AUTH_STORE: "Auth Store",
  // The five this app owns.
  MODULES: "Modules",
  ACCESS_ROLES: "Access Roles",
  ACCESS_MEMBERS: "Access Members",
  ROLE_PERMISSIONS: "Role Permissions",
  ACCESS_OVERRIDES: "Access Overrides",
  ACCESS_LOG: "Access Log",
};

/** Which link column on Role Assignments a given scope writes to. */
export const SCOPE_FIELD = {
  "Initiative Year": "Initiative",
  Section: "Section",
  Jamiat: "Jamiat",
  Umoor: "Umoor",
};

/** Which base each table lives in. The office tables are read-only here. */
const OFFICE_TABLES = new Set([T.ROLES, T.ASSIGNMENTS, T.PEOPLE, T.AUTH_STORE]);
const baseFor = (name) => (OFFICE_TABLES.has(name) ? OFFICE_BASE() : ACCESS_BASE());

const _ids = new Map();   // baseId -> Promise<{name: id}>
/** name -> tableId for a base, resolved once per server lifetime. */
export function tableIds(baseId) {
  if (!baseId) {
    throw new Error(
      "No base configured. Set TEABLE_ACCESS_BASE and TEABLE_OFFICE_BASE in .env.local.");
  }
  if (!_ids.has(baseId)) {
    _ids.set(baseId, tables(baseId)
      .then((list) => Object.fromEntries(list.map((t) => [t.name, t.id])))
      .catch((e) => { _ids.delete(baseId); throw e; }));
  }
  return _ids.get(baseId);
}

export async function idOf(name) {
  const baseId = baseFor(name);
  const ids = await tableIds(baseId);
  const id = ids[name];
  if (!id) throw new Error(`table "${name}" is not in base ${baseId}`);
  return id;
}

/** Every row of a table, tagged so a write can invalidate it. */
export const rowsOf = async (name) => records(await idOf(name), { tags: [`t:${name}`] });

/* ------------------------------------------------------------------ *
 * Small helpers over Teable's link cells
 * ------------------------------------------------------------------ */

/** A link cell is {id,title} or an array of them; the resolver wants the id. */
export const linkId = (v) => {
  const first = Array.isArray(v) ? v[0] : v;
  return first && typeof first === "object" ? first.id : null;
};

/** Every id from a multi-link cell. */
export const linkIds = (v) =>
  [].concat(v || []).map((x) => (x && typeof x === "object" ? x.id : null)).filter(Boolean);

/** A longText column holding one key per line -> array of keys. */
export const lines = (v) =>
  String(v || "").split("\n").map((s) => s.trim()).filter(Boolean);

/** True when a date column is set and in the past. Blank never expires. */
export const expired = (v, now = Date.now()) => !!v && new Date(v).getTime() < now;

/* ------------------------------------------------------------------ *
 * Shaped readers — the five access tables
 * ------------------------------------------------------------------ */

export async function getModules() {
  const rows = await rowsOf(T.MODULES);
  return rows.map((r) => ({
    id: r.id,
    key: r.fields["Key"],
    name: r.fields["Name"] ?? r.fields["Key"],
    nameArabic: r.fields["Name (Arabic)"] ?? null,
    url: r.fields["URL"] ?? null,
    icon: r.fields["Icon"] ?? null,
    sort: r.fields["Sort"] ?? 0,
    status: r.fields["Status"] ?? "Live",
    visibility: r.fields["Visibility"] ?? "Granted",
    manifestHash: r.fields["Manifest Hash"] ?? null,
    manifestChecked: r.fields["Manifest Checked"] ?? null,
    manifestStatus: r.fields["Manifest Status"] ?? "Never fetched",
    // Who owns this module: ITS IDs, one per line. Kept raw here — lib/console.js
    // parses it, because that is where what ownership *means* is decided.
    platformAdmin: r.fields["Platform Admin"] ?? "",
    notes: r.fields["Notes"] ?? "",
  })).filter((m) => m.key).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

/**
 * The audit trail, newest first.
 *
 * Read straight rather than shaped into the domain: a log entry is already the
 * flat record of one act, and giving it a second representation would be a
 * place for the two to disagree about what happened.
 */
export async function getAccessLog({ limit = 500 } = {}) {
  const rows = await rowsOf(T.ACCESS_LOG);
  return rows.map((r) => ({
    id: r.id,
    at: r.fields["At"] ?? "",
    actor: String(r.fields["Actor"] ?? "").trim(),
    actorName: r.fields["Actor Name"] ?? "",
    moduleKey: (r.fields["Module"] ?? "").trim() || null,
    resource: r.fields["Resource"] ?? "",
    action: r.fields["Action"] ?? "",
    target: r.fields["Target"] ?? "",
    result: r.fields["Result"] ?? "ok",
    detail: r.fields["Detail"] ?? "",
    entry: r.fields["Entry"] ?? "",
  })).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}

export async function getAccessRoles() {
  const rows = await rowsOf(T.ACCESS_ROLES);
  return rows.map((r) => ({
    id: r.id,
    key: r.fields["Key"],
    name: r.fields["Name"] ?? r.fields["Key"],
    nameArabic: r.fields["Name (Arabic)"] ?? null,
    level: r.fields["Level"] ?? null,
    tier: r.fields["Tier"] ?? "member",
    membership: r.fields["Membership"] ?? "Explicit",
    // The org role this mirrors, by name. Plain text rather than a link, because
    // Roles lives in the office base and Teable has no cross-base links — and
    // the resolver compared by title anyway, so nothing is lost.
    orgRole: (r.fields["Org Role"] ?? "").trim() || null,
    inheritsFrom: linkId(r.fields["Inherits From"]),
    notes: r.fields["Notes"] ?? "",
  })).filter((r) => r.key);
}

export async function getAccessMembers() {
  const rows = await rowsOf(T.ACCESS_MEMBERS);
  return rows.map((r) => ({
    id: r.id,
    itsId: String(r.fields["ITS ID"] ?? "").trim(),
    name: r.fields["Name"] ?? "",
    roleIds: linkIds(r.fields["Access Roles"]),
    status: r.fields["Status"] ?? "Active",
    addedBy: r.fields["Added By"] ?? null,
    addedOn: r.fields["Added On"] ?? null,
    expires: r.fields["Expires"] ?? null,
  })).filter((m) => m.itsId);
}

export async function getRolePermissions() {
  const rows = await rowsOf(T.ROLE_PERMISSIONS);
  return rows.map((r) => ({
    id: r.id,
    label: r.fields["Grant"] ?? "",
    roleId: linkId(r.fields["Access Role"]),
    moduleKey: title(r.fields["Module"]),
    resource: (r.fields["Resource"] ?? "").trim(),
    view: r.fields["View"] === true,
    create: r.fields["Create"] === true,
    edit: r.fields["Edit"] === true,
    delete: r.fields["Delete"] === true,
    capabilities: lines(r.fields["Capabilities"]),
    scopeRule: r.fields["Scope Rule"] ?? "none",
    orphaned: r.fields["Orphaned"] === true,
    orphanedReason: r.fields["Orphaned Reason"] ?? null,
  })).filter((p) => p.roleId && p.moduleKey);
}

export async function getAccessOverrides() {
  const rows = await rowsOf(T.ACCESS_OVERRIDES);
  return rows.map((r) => ({
    id: r.id,
    label: r.fields["Override"] ?? "",
    itsId: String(r.fields["Person ITS ID"] ?? "").trim(),
    moduleKey: title(r.fields["Module"]),
    resource: (r.fields["Resource"] ?? "").trim() || null,   // null = every resource
    effect: r.fields["Effect"] ?? "Deny",
    view: r.fields["View"] === true,
    create: r.fields["Create"] === true,
    edit: r.fields["Edit"] === true,
    delete: r.fields["Delete"] === true,
    capabilities: lines(r.fields["Capabilities"]),
    scopeRule: r.fields["Scope Rule"] ?? null,
    reason: r.fields["Reason"] ?? "",
    expires: r.fields["Expires"] ?? null,
    orphaned: r.fields["Orphaned"] === true,
  })).filter((o) => o.itsId && o.moduleKey);
}

/* ------------------------------------------------------------------ *
 * Raw readers — the org side the resolver joins against
 * ------------------------------------------------------------------ */

/** Raw people rows. The resolver needs `.id` and the ITS ID field, nothing else. */
export const rawPeople = () => rowsOf(T.PEOPLE);

/**
 * The org roles, by name, for the "follows an org role" picker.
 *
 * Names rather than ids: the link is text now that the two tables live in
 * different bases, and the name is what `Role Assignments` carries anyway.
 * Legacy roles are kept but marked — a retired role still has holders in the
 * history, and hiding it would make an existing grant unexplainable.
 */
export async function getOrgRoles() {
  const rows = await rowsOf(T.ROLES);
  return rows.map((r) => ({
    name: r.fields["Role Name"],
    hierarchy: r.fields["Hierarchy"] ?? null,
    level: r.fields["Level"] ?? null,
    scopeType: r.fields["Scope Type"] ?? null,
    legacy: r.fields["Legacy"] === true,
  })).filter((r) => r.name)
    .sort((a, b) => Number(a.legacy) - Number(b.legacy) || a.name.localeCompare(b.name));
}

/** How many people currently hold each org role — shown when picking one. */
export async function orgRoleHolderCounts() {
  const rows = await rowsOf(T.ASSIGNMENTS);
  const out = {};
  for (const r of rows) {
    if (r.fields["Current"] !== true) continue;
    const name = title(r.fields["Role"]);
    if (name) out[name] = (out[name] || 0) + 1;
  }
  return out;
}

/** Raw assignment rows, so `Person` and the scope links keep their ids. */
export const rawAssignments = () => rowsOf(T.ASSIGNMENTS);
