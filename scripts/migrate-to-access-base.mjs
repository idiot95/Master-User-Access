/**
 * Move the five access tables out of the office base into their own.
 *
 * Access config does not belong in the base it governs. Separating them means
 * the office base can be rebuilt, re-imported or handed to someone else without
 * touching who can open what.
 *
 * Teable has no cross-base links, so two references have to change shape:
 *
 *   Access Roles.Org Role   link -> Roles          becomes text (the role name)
 *   Access Members.Person   link -> DA Office …    dropped entirely
 *
 * Neither is a loss. The resolver already matched org roles by title, and
 * Access Members has always been keyed on ITS ID — the Person link was
 * convenience, and convenience that only works for the 125 people in the
 * register is the wrong thing to depend on when most members will not be in it.
 *
 *   node scripts/migrate-to-access-base.mjs --dry
 *   node scripts/migrate-to-access-base.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const U = (process.env.TEABLE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const OFFICE = process.env.TEABLE_BASE || "bsex6xH0EwGHFOphy4r";
const NEW_BASE_NAME = process.env.ACCESS_BASE_NAME || "MOD-User Access";
const DRY = process.argv.includes("--dry");

// Resolved against the working directory, not this file — so the path reads the
// same way you would type it at the prompt.
const jarPath = resolve(process.cwd(), process.env.TEABLE_COOKIE || "../teable-local/cookies.txt");
const COOKIE = readFileSync(jarPath, "utf8")
  .split("\n").map((l) => l.replace(/^#HttpOnly_/, ""))
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => l.split("\t")).filter((p) => p.length >= 7)
  .map((p) => `${p[5]}=${p[6]}`).join("; ");

const H = { Cookie: COOKIE, "Content-Type": "application/json" };

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${U}/api${path}`, {
    method, headers: H, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    let d = text.slice(0, 300);
    try { d = JSON.parse(text).message || d; } catch {}
    throw new Error(`${method} ${path} -> ${res.status}: ${d}`);
  }
  return text ? JSON.parse(text) : null;
}

const text = (name) => ({ type: "singleLineText", name });
const long = (name) => ({ type: "longText", name });
const check = (name) => ({ type: "checkbox", name });
const num = (name) => ({ type: "number", name });
const date = (name) => ({ type: "date", name });
const select = (name, ...choices) => ({
  type: "singleSelect", name, options: { choices: choices.map((n) => ({ name: n })) },
});
const link = (name, to, relationship = "manyOne") => ({ type: "link", name, __to: to, relationship });

/** The five tables, with every reference now inside this one base. */
const TABLES = [
  {
    name: "Modules",
    description: "The module registry. Drives the launcher and the rights matrix.",
    fields: [
      text("Key"), text("Name"), text("Name (Arabic)"), text("URL"), text("Icon"), num("Sort"),
      select("Status", "Live", "Beta", "Hidden", "Retired"),
      select("Visibility", "Granted", "Public"),
      text("Manifest Token"), text("Manifest Hash"), text("Manifest Checked"),
      select("Manifest Status", "OK", "Unreachable", "Invalid", "Never fetched"),
      long("Notes"),
    ],
  },
  {
    name: "Access Roles",
    description: "In-house roles. Membership is a rule, not a list — only Explicit stores rows.",
    fields: [
      text("Key"), text("Name"), text("Name (Arabic)"), num("Level"),
      select("Tier", "recognised", "member", "steward", "admin"),
      select("Membership", "Everyone", "Org Role", "Explicit"),
      // Was a link into the office base. Now the role's name as text — which is
      // what the resolver compared against anyway.
      text("Org Role"),
      long("Notes"),
    ],
  },
  {
    name: "Access Members",
    description: "The explicitly provisioned people, keyed on ITS ID. No link to the office register: most members are not in it.",
    fields: [
      text("ITS ID"), text("Name"),
      link("Access Roles", "Access Roles", "manyMany"),
      select("Status", "Active", "Suspended"),
      text("Added By"), date("Added On"), date("Expires"), long("Notes"),
    ],
  },
  {
    name: "Role Permissions",
    description: "The matrix: one row per (access role, module, resource).",
    fields: [
      text("Grant"),
      link("Access Role", "Access Roles"),
      link("Module", "Modules"),
      text("Resource"),
      check("View"), check("Create"), check("Edit"), check("Delete"),
      long("Capabilities"),
      select("Scope Rule", "own", "all", "none"),
      check("Orphaned"), text("Orphaned Reason"), long("Notes"),
    ],
  },
  {
    name: "Access Overrides",
    description: "Person-level exceptions. Deny always wins. Reason is required.",
    fields: [
      text("Override"), text("Person ITS ID"),
      link("Module", "Modules"),
      text("Resource"),
      select("Effect", "Grant", "Deny"),
      check("View"), check("Create"), check("Edit"), check("Delete"),
      long("Capabilities"),
      select("Scope Rule", "own", "all", "none"),
      long("Reason"), date("Expires"), check("Orphaned"), text("Orphaned Reason"),
    ],
  },
];

const SECOND_PASS = [{ table: "Access Roles", field: link("Inherits From", "Access Roles") }];

const rows = (tableId) =>
  api(`/table/${tableId}/record?take=1000&fieldKeyType=name`).then((r) => r.records || []);

async function main() {
  /* ---- find or create the base ---- */
  const spaces = await api("/space");
  const spaceId = spaces[0].id;
  const existing = await api("/base/access/all").then((r) => (Array.isArray(r) ? r : r.bases ?? []));
  let base = existing.find((b) => b.name === NEW_BASE_NAME);

  if (base) {
    console.log(`base exists: ${NEW_BASE_NAME} (${base.id})`);
  } else if (DRY) {
    console.log(`would create base "${NEW_BASE_NAME}" in space ${spaceId}`);
    base = { id: "<new>" };
  } else {
    base = await api("/base", { method: "POST", body: { spaceId, name: NEW_BASE_NAME } });
    console.log(`created base: ${NEW_BASE_NAME} (${base.id})`);
  }

  /* ---- create the tables ---- */
  const have = base.id === "<new>" ? [] : await api(`/base/${base.id}/table`);
  const ids = Object.fromEntries(have.map((t) => [t.name, t.id]));

  for (const spec of TABLES) {
    if (ids[spec.name]) { console.log(`  exists   ${spec.name}`); continue; }
    const fields = spec.fields.map((f) => f.__to
      ? { type: "link", name: f.name,
          options: { relationship: f.relationship, foreignTableId: ids[f.__to] } }
      : f);
    if (DRY) { console.log(`  would create ${spec.name} — ${fields.length} fields`); continue; }
    const made = await api(`/base/${base.id}/table`, {
      method: "POST", body: { name: spec.name, description: spec.description, fields },
    });
    ids[spec.name] = made.id;
    console.log(`  created  ${spec.name} (${made.id})`);
  }

  for (const { table, field } of SECOND_PASS) {
    if (!ids[table]) { console.log(`  skip     ${table}.${field.name}`); continue; }
    const fs = await api(`/table/${ids[table]}/field`);
    if (fs.some((f) => f.name === field.name)) { console.log(`  exists   ${table}.${field.name}`); continue; }
    if (DRY) { console.log(`  would add ${table}.${field.name}`); continue; }
    await api(`/table/${ids[table]}/field`, { method: "POST", body: {
      type: "link", name: field.name,
      options: { relationship: field.relationship, foreignTableId: ids[table] } } });
    console.log(`  added    ${table}.${field.name}`);
  }

  if (DRY) { console.log("\n(dry run — no data copied)"); return; }

  /* ---- clear Teable's default blank rows ---- */
  for (const name of TABLES.map((t) => t.name)) {
    const blank = (await rows(ids[name])).filter((r) => Object.keys(r.fields).length === 0);
    for (const b of blank) await api(`/table/${ids[name]}/record/${b.id}`, { method: "DELETE" });
  }

  /* ---- copy the data across ---- */
  const oldTables = await api(`/base/${OFFICE}/table`);
  const oldId = (n) => oldTables.find((t) => t.name === n)?.id;

  const copied = { modules: 0, roles: 0, members: 0, permissions: 0, overrides: 0 };
  const already = async (tableId, key) =>
    new Set((await rows(tableId)).map((r) => r.fields[key]).filter(Boolean));

  /* Modules */
  if (oldId("Modules")) {
    const seen = await already(ids.Modules, "Key");
    const src = (await rows(oldId("Modules"))).filter((r) => r.fields.Key && !seen.has(r.fields.Key));
    if (src.length) {
      await api(`/table/${ids.Modules}/record`, { method: "POST", body: {
        fieldKeyType: "name", typecast: true,
        records: src.map((r) => ({ fields: strip(r.fields) })) } });
      copied.modules = src.length;
    }
  }

  /* Access Roles — Org Role link collapses to its title */
  const roleKeyToNewId = new Map();
  if (oldId("Access Roles")) {
    const seen = await already(ids["Access Roles"], "Key");
    const src = (await rows(oldId("Access Roles"))).filter((r) => r.fields.Key && !seen.has(r.fields.Key));
    if (src.length) {
      await api(`/table/${ids["Access Roles"]}/record`, { method: "POST", body: {
        fieldKeyType: "name", typecast: true,
        records: src.map((r) => {
          const f = strip(r.fields);
          f["Org Role"] = titleOf(r.fields["Org Role"]);
          delete f["Access Members"]; delete f["Role Permissions"]; delete f["Inherits From"];
          delete f["Access Roles"];
          return { fields: f };
        }) } });
      copied.roles = src.length;
    }
    for (const r of await rows(ids["Access Roles"])) roleKeyToNewId.set(r.fields.Key, r.id);
  }

  /* Role Permissions — links remapped by key */
  if (oldId("Role Permissions")) {
    const moduleKeyToNewId = new Map(
      (await rows(ids.Modules)).map((r) => [r.fields.Key, r.id]));
    const oldRoles = new Map((await rows(oldId("Access Roles"))).map((r) => [r.id, r.fields.Key]));
    const seen = await already(ids["Role Permissions"], "Grant");
    const src = (await rows(oldId("Role Permissions")))
      .filter((r) => r.fields.Grant && !seen.has(r.fields.Grant));

    const mapped = src.map((r) => {
      const f = strip(r.fields);
      const roleKey = oldRoles.get(linkId(r.fields["Access Role"]));
      const modKey = titleOf(r.fields["Module"]);
      const roleId = roleKeyToNewId.get(roleKey);
      const modId = moduleKeyToNewId.get(modKey);
      if (!roleId || !modId) return null;
      f["Access Role"] = { id: roleId };
      f["Module"] = { id: modId };
      return { fields: f };
    }).filter(Boolean);

    if (mapped.length) {
      await api(`/table/${ids["Role Permissions"]}/record`, { method: "POST", body: {
        fieldKeyType: "name", typecast: true, records: mapped } });
      copied.permissions = mapped.length;
    }
    if (mapped.length < src.length) {
      console.log(`  ! ${src.length - mapped.length} grant(s) skipped — role or module missing`);
    }
  }

  console.log("\ncopied:", JSON.stringify(copied));
  console.log(`\nTEABLE_ACCESS_BASE=${base.id}`);
  console.log(`TEABLE_OFFICE_BASE=${OFFICE}`);
  console.log("\nThe originals in the office base are left in place. Verify the new base, then");
  console.log("delete them there by hand — an automated delete of live config is not worth the risk.");
}

/** Drop Teable's computed/symmetric fields; keep only what we wrote. */
function strip(fields) {
  const out = { ...fields };
  for (const k of Object.keys(out)) {
    if (out[k] === null || out[k] === undefined) delete out[k];
  }
  return out;
}
const titleOf = (v) => {
  const f = Array.isArray(v) ? v[0] : v;
  return f && typeof f === "object" ? f.title : f ?? null;
};
const linkId = (v) => {
  const f = Array.isArray(v) ? v[0] : v;
  return f && typeof f === "object" ? f.id : null;
};

main().catch((e) => { console.error("\nFAILED:", e.message); process.exit(1); });
