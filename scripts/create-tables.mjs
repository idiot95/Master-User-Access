/**
 * Create the five User Access tables in the office base.
 *
 * Idempotent: a table that already exists is left alone, and a link field that
 * needs a table created later is added in a second pass. Run it twice and the
 * second run reports "exists" for everything and changes nothing.
 *
 *   node scripts/create-tables.mjs           # against $TEABLE_URL
 *   node scripts/create-tables.mjs --dry     # print what it would create
 *
 * Reads TEABLE_URL / TEABLE_TOKEN / TEABLE_BASE from the environment, same
 * three variables the app itself uses.
 */

const URL_ = (process.env.TEABLE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const TOKEN = process.env.TEABLE_TOKEN || "";
const BASE = process.env.TEABLE_BASE || "bsex6xH0EwGHFOphy4r";
const DRY = process.argv.includes("--dry");

/**
 * Creating a table needs `table|create`, which an app token scoped for records
 * does not carry. TEABLE_COOKIE points at a Netscape cookie jar from a browser
 * session, which does. Prefer the token when it is sufficient; fall back to the
 * cookie for schema work, which is a one-off.
 */
const COOKIE = process.env.TEABLE_COOKIE
  ? (await import("node:fs")).readFileSync(process.env.TEABLE_COOKIE, "utf8")
      .split("\n")
      // curl marks HttpOnly cookies with a #HttpOnly_ prefix on an otherwise
      // ordinary line — strip it rather than treating the line as a comment,
      // which is exactly where the session cookie lives.
      .map((l) => l.replace(/^#HttpOnly_/, ""))
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.split("\t"))
      .filter((p) => p.length >= 7)
      .map((p) => `${p[5]}=${p[6]}`)
      .join("; ")
  : "";

if (!TOKEN && !COOKIE) {
  console.error("Set TEABLE_TOKEN, or TEABLE_COOKIE to a cookie jar path.");
  process.exit(1);
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${URL_}/api${path}`, {
    method,
    headers: {
      ...(COOKIE ? { Cookie: COOKIE } : { Authorization: `Bearer ${TOKEN}` }),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 400);
    try { detail = JSON.parse(text).message || detail; } catch {}
    throw new Error(`${method} ${path} -> ${res.status}: ${detail}`);
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
/** A link field, resolved to a foreign table id at build time. */
const link = (name, to, relationship = "manyOne") => ({ type: "link", name, __to: to, relationship });

/**
 * The five tables, in dependency order. `__to` names a table rather than an id
 * so this file stays readable; ids are resolved against the live base below.
 */
const TABLES = [
  {
    name: "Modules",
    description: "The module registry. Drives the launcher and the rights matrix.",
    fields: [
      text("Key"),                       // primary — hoto | explorer | safar | stream
      text("Name"),
      text("Name (Arabic)"),
      text("URL"),
      text("Icon"),
      num("Sort"),
      select("Status", "Live", "Beta", "Hidden", "Retired"),
      // Public = any recognised user may open it. Granted = matrix only.
      select("Visibility", "Granted", "Public"),
      text("Manifest Token"),            // bearer UA sends to this module's scope endpoints
      text("Manifest Hash"),             // sha256 of {resources, scopeDimensions}
      text("Manifest Checked"),
      select("Manifest Status", "OK", "Unreachable", "Invalid", "Never fetched"),
      long("Notes"),
    ],
  },
  {
    name: "Access Roles",
    description: "In-house roles. Membership is a rule, not a list — only Explicit stores rows.",
    fields: [
      text("Key"),                       // primary
      text("Name"),
      text("Name (Arabic)"),
      num("Level"),                      // display and sort only; never implies authority
      select("Tier", "member", "steward", "admin"),
      select("Membership", "Everyone", "Org Role", "Explicit"),
      link("Org Role", "Roles"),         // required when Membership = Org Role
      long("Notes"),
      // "Inherits From" is a self-link, added in the second pass below.
    ],
  },
  {
    name: "Access Members",
    description: "The ~1,000 explicitly provisioned people, keyed on ITS ID.",
    fields: [
      text("ITS ID"),                    // primary — the key, not a link
      text("Name"),
      link("Person", "DA Office Attendees"),   // optional: most are not office attendees
      link("Access Roles", "Access Roles", "manyMany"),
      select("Status", "Active", "Suspended"),
      text("Added By"),
      date("Added On"),
      date("Expires"),
      long("Notes"),
    ],
  },
  {
    name: "Role Permissions",
    description: "The matrix: one row per (access role, module, resource).",
    fields: [
      text("Grant"),                     // primary — label, e.g. "Section Head — hoto — schedule"
      link("Access Role", "Access Roles"),
      link("Module", "Modules"),
      text("Resource"),                  // matches a manifest resource.key
      check("View"), check("Create"), check("Edit"), check("Delete"),
      long("Capabilities"),              // one capability key per line
      select("Scope Rule", "own", "all", "none"),
      check("Orphaned"),
      text("Orphaned Reason"),
      long("Notes"),
    ],
  },
  {
    name: "Access Overrides",
    description: "Person-level exceptions. Deny always wins. Reason is required.",
    fields: [
      text("Override"),                  // primary — label
      text("Person ITS ID"),             // text, not a link: works for people outside the register
      link("Module", "Modules"),
      text("Resource"),                  // blank = every resource in the module
      select("Effect", "Grant", "Deny"),
      check("View"), check("Create"), check("Edit"), check("Delete"),
      long("Capabilities"),
      select("Scope Rule", "own", "all", "none"),
      long("Reason"),                    // required by the UI, not by Teable
      date("Expires"),
      check("Orphaned"),
      text("Orphaned Reason"),
    ],
  },
];

/** Self-links and any link whose target is created in the same run. */
const SECOND_PASS = [
  { table: "Access Roles", field: link("Inherits From", "Access Roles") },
];

async function main() {
  const existing = await api(`/base/${BASE}/table`);
  const ids = Object.fromEntries(existing.map((t) => [t.name, t.id]));
  console.log(`base ${BASE} at ${URL_} — ${existing.length} tables\n`);

  const planned = new Set(TABLES.map((t) => t.name));
  const resolve = (name) => {
    const id = ids[name];
    if (id) return id;
    // On a real run the tables are created in dependency order, so a missing id
    // here is a genuine error. On a dry run the target may simply not exist yet.
    if (DRY && planned.has(name)) return `<${name}>`;
    throw new Error(`link target "${name}" does not exist in the base`);
  };

  for (const spec of TABLES) {
    if (ids[spec.name]) {
      console.log(`  exists   ${spec.name}  (${ids[spec.name]})`);
      continue;
    }
    const fields = spec.fields.map((f) => {
      if (!f.__to) return f;
      return {
        type: "link", name: f.name,
        options: { relationship: f.relationship, foreignTableId: resolve(f.__to) },
      };
    });
    if (DRY) {
      console.log(`  would create ${spec.name} — ${fields.length} fields`);
      continue;
    }
    const made = await api(`/base/${BASE}/table`, {
      method: "POST",
      body: { name: spec.name, description: spec.description, fields },
    });
    ids[spec.name] = made.id;
    console.log(`  created  ${spec.name}  (${made.id})  ${fields.length} fields`);
  }

  for (const { table, field } of SECOND_PASS) {
    const tableId = ids[table];
    if (!tableId) { console.log(`  skip     ${table}.${field.name} — table missing`); continue; }
    const have = await api(`/table/${tableId}/field`);
    if (have.some((f) => f.name === field.name)) {
      console.log(`  exists   ${table}.${field.name}`);
      continue;
    }
    if (DRY) { console.log(`  would add ${table}.${field.name}`); continue; }
    await api(`/table/${tableId}/field`, {
      method: "POST",
      body: {
        type: "link", name: field.name,
        options: { relationship: field.relationship, foreignTableId: resolve(field.__to) },
      },
    });
    console.log(`  added    ${table}.${field.name}`);
  }

  console.log("\ndone.");
}

main().catch((e) => { console.error("\nFAILED:", e.message); process.exit(1); });
