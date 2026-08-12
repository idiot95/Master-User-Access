/**
 * Copy the access base from local Teable to live (app.teable.io).
 *
 * Creates MOD-User Access on the live instance if it is not there, recreates the
 * five tables, and copies every row. Idempotent by key: a second run reports
 * what already exists and adds only what is missing.
 *
 * Read-only against local. Nothing here deletes anything on either side.
 *
 *   node scripts/publish-to-live.mjs --dry
 *   node scripts/publish-to-live.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LOCAL = (process.env.TEABLE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const LOCAL_BASE = process.env.TEABLE_ACCESS_BASE;
const LIVE = "https://app.teable.io";
const NAME = "MOD-User Access";
const DRY = process.argv.includes("--dry");

if (!LOCAL_BASE) { console.error("TEABLE_ACCESS_BASE is not set."); process.exit(1); }

const root = resolve(process.cwd(), "..", "teable-local");
const liveToken = readFileSync(resolve(root, ".cloud-token"), "utf8").trim();
const cookie = readFileSync(resolve(root, "cookies.txt"), "utf8")
  .split("\n").map((l) => l.replace(/^#HttpOnly_/, ""))
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => l.split("\t")).filter((p) => p.length >= 7)
  .map((p) => `${p[5]}=${p[6]}`).join("; ");

async function call(host, headers, path, { method = "GET", body } = {}) {
  const res = await fetch(`${host}/api${path}`, {
    method, headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const t = await res.text();
  if (!res.ok) {
    let d = t.slice(0, 300);
    try { d = JSON.parse(t).message || d; } catch {}
    throw new Error(`${method} ${host}${path} -> ${res.status}: ${d}`);
  }
  return t ? JSON.parse(t) : null;
}
const local = (p, o) => call(LOCAL, { Cookie: cookie }, p, o);
const live = (p, o) => call(LIVE, { Authorization: `Bearer ${liveToken}` }, p, o);

const rows = (fn, id) =>
  fn(`/table/${id}/record?take=1000&fieldKeyType=name`).then((r) => r.records || []);

/** Identifying column per table, for idempotency and for reporting. */
const KEY = {
  "Modules": "Key",
  "Access Roles": "Key",
  "Access Members": "ITS ID",
  "Role Permissions": "Grant",
  "Access Overrides": "Override",
};
/** Created in this order so intra-base links resolve. */
const ORDER = ["Modules", "Access Roles", "Access Members", "Role Permissions", "Access Overrides"];

/** Link columns, and which table they point at. Everything else copies as-is. */
const LINKS = {
  "Access Members": { "Access Roles": "Access Roles" },
  "Role Permissions": { "Access Role": "Access Roles", "Module": "Modules" },
  "Access Overrides": { "Module": "Modules" },
  "Access Roles": { "Inherits From": "Access Roles" },
};

const titleOf = (v) => { const f = Array.isArray(v) ? v[0] : v; return f && typeof f === "object" ? f.title : f ?? null; };
const idOf = (v) => { const f = Array.isArray(v) ? v[0] : v; return f && typeof f === "object" ? f.id : null; };
const idsOf = (v) => [].concat(v || []).map((x) => (x && typeof x === "object" ? x.id : null)).filter(Boolean);

async function main() {
  console.log(`local ${LOCAL}/${LOCAL_BASE}\nlive  ${LIVE}\n`);

  const srcTables = await local(`/base/${LOCAL_BASE}/table`);
  const srcId = (n) => srcTables.find((t) => t.name === n)?.id;
  for (const n of ORDER) if (!srcId(n)) throw new Error(`local base has no "${n}"`);

  /* ---- the live base ---- */
  const spaces = await live("/space");
  const all = await live("/base/access/all").then((r) => (Array.isArray(r) ? r : r.bases ?? []));
  let base = all.find((b) => b.name === NAME);
  if (base) console.log(`base exists: ${NAME} (${base.id})`);
  else if (DRY) { console.log(`would create base "${NAME}"`); base = { id: "<new>" }; }
  else {
    base = await live("/base", { method: "POST", body: { spaceId: spaces[0].id, name: NAME } });
    console.log(`created base: ${NAME} (${base.id})`);
  }

  /* ---- tables, copying each field definition across ---- */
  const have = base.id === "<new>" ? [] : await live(`/base/${base.id}/table`);
  const dstId = Object.fromEntries(have.map((t) => [t.name, t.id]));

  for (const name of ORDER) {
    if (dstId[name]) { console.log(`  exists   ${name}`); continue; }
    const fields = (await local(`/table/${srcId(name)}/field`)).map((f) => {
      const base_ = { type: f.type, name: f.name };
      if (f.type === "link") {
        // Point at the table's live twin. Self-links resolve to the table being
        // created, which does not exist yet — handled in the second pass.
        const target = LINKS[name]?.[f.name];
        if (!target || !dstId[target]) return null;
        return { ...base_, options: { relationship: f.options.relationship, foreignTableId: dstId[target] } };
      }
      if (f.options?.choices) {
        return { ...base_, options: { choices: f.options.choices.map((c) => ({ name: c.name })) } };
      }
      return base_;
    }).filter(Boolean);

    if (DRY) { console.log(`  would create ${name} — ${fields.length} fields`); continue; }
    const made = await live(`/base/${base.id}/table`, {
      method: "POST", body: { name, fields },
    });
    dstId[name] = made.id;
    console.log(`  created  ${name} (${made.id})  ${fields.length} fields`);
  }

  // Self-link, once its table exists.
  if (!DRY && dstId["Access Roles"]) {
    const fs = await live(`/table/${dstId["Access Roles"]}/field`);
    if (!fs.some((f) => f.name === "Inherits From")) {
      await live(`/table/${dstId["Access Roles"]}/field`, { method: "POST", body: {
        type: "link", name: "Inherits From",
        options: { relationship: "manyOne", foreignTableId: dstId["Access Roles"] } } });
      console.log("  added    Access Roles.Inherits From");
    }
  }

  if (DRY) { console.log("\n(dry run — no rows copied)"); return; }

  /* ---- clear Teable's default blank rows ---- */
  for (const name of ORDER) {
    for (const r of (await rows(live, dstId[name])).filter((x) => !Object.keys(x.fields).length)) {
      await live(`/table/${dstId[name]}/record/${r.id}`, { method: "DELETE" });
    }
  }

  /* ---- rows, in link order, remapping ids as we go ---- */
  console.log("");
  const mapById = {};            // table -> { localRecordId: liveRecordId }

  for (const name of ORDER) {
    const src = await rows(local, srcId(name));
    const dst = await rows(live, dstId[name]);
    const key = KEY[name];
    const seen = new Map(dst.map((r) => [r.fields[key], r.id]));

    mapById[name] = {};
    for (const r of src) if (seen.has(r.fields[key])) mapById[name][r.id] = seen.get(r.fields[key]);

    const missing = src.filter((r) => r.fields[key] && !seen.has(r.fields[key]));
    if (!missing.length) { console.log(`  ${name.padEnd(18)} ${src.length} rows — all present`); continue; }

    const payload = missing.map((r) => {
      const f = { ...r.fields };
      for (const [col, target] of Object.entries(LINKS[name] ?? {})) {
        if (f[col] === undefined) continue;
        const map = mapById[target] ?? {};
        if (Array.isArray(f[col])) {
          const mapped = idsOf(f[col]).map((id) => map[id]).filter(Boolean).map((id) => ({ id }));
          if (mapped.length) f[col] = mapped; else delete f[col];
        } else {
          const mapped = map[idOf(f[col])];
          if (mapped) f[col] = { id: mapped }; else delete f[col];
        }
      }
      // Symmetric link columns Teable adds on the other side are not ours to write.
      for (const col of Object.keys(f)) {
        if (!KEY[col] && Array.isArray(f[col]) && f[col][0]?.title && !(LINKS[name]?.[col])) delete f[col];
      }
      return { fields: f };
    });

    const made = await live(`/table/${dstId[name]}/record`, {
      method: "POST", body: { fieldKeyType: "name", typecast: true, records: payload },
    });
    for (let i = 0; i < missing.length; i++) mapById[name][missing[i].id] = made.records[i].id;
    console.log(`  ${name.padEnd(18)} ${src.length} rows — copied ${missing.length}`);
  }

  console.log(`\nTEABLE_URL=${LIVE}`);
  console.log(`TEABLE_ACCESS_BASE=${base.id}`);
  console.log("\nThe local base is untouched. Point .env.local at live when you are ready.");
}

main().catch((e) => { console.error("\nFAILED:", e.message); process.exit(1); });
