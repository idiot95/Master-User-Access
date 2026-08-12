/**
 * Remove the five access tables from the office base, now that they live in
 * their own.
 *
 * It refuses to delete anything unless the new base demonstrably holds at least
 * what the old one does — checked per table, by key, not by row count alone.
 * A count can match while the contents differ; comparing the actual keys cannot.
 *
 *   node scripts/drop-old-access-tables.mjs            # verify only
 *   node scripts/drop-old-access-tables.mjs --delete   # verify, then delete
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const U = (process.env.TEABLE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const OFFICE = process.env.TEABLE_OFFICE_BASE || "bsex6xH0EwGHFOphy4r";
const ACCESS = process.env.TEABLE_ACCESS_BASE;
const DELETE = process.argv.includes("--delete");

if (!ACCESS) { console.error("TEABLE_ACCESS_BASE is not set."); process.exit(1); }

const jarPath = resolve(process.cwd(), process.env.TEABLE_COOKIE || "../teable-local/cookies.txt");
const COOKIE = readFileSync(jarPath, "utf8")
  .split("\n").map((l) => l.replace(/^#HttpOnly_/, ""))
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => l.split("\t")).filter((p) => p.length >= 7)
  .map((p) => `${p[5]}=${p[6]}`).join("; ");

const H = { Cookie: COOKIE, "Content-Type": "application/json" };

async function api(path, { method = "GET" } = {}) {
  const res = await fetch(`${U}/api${path}`, { method, headers: H });
  const t = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

/** The five, and the field that identifies a row in each. */
const TABLES = {
  "Modules": "Key",
  "Access Roles": "Key",
  "Access Members": "ITS ID",
  "Role Permissions": "Grant",
  "Access Overrides": "Override",
};

const rows = (id) =>
  api(`/table/${id}/record?take=1000&fieldKeyType=name`).then((r) => r.records || []);

async function main() {
  const [oldTables, newTables] = await Promise.all([
    api(`/base/${OFFICE}/table`), api(`/base/${ACCESS}/table`),
  ]);
  const oldId = (n) => oldTables.find((t) => t.name === n)?.id;
  const newId = (n) => newTables.find((t) => t.name === n)?.id;

  console.log(`old: ${OFFICE}   new: ${ACCESS}\n`);

  let safe = true;
  const plan = [];

  for (const [name, key] of Object.entries(TABLES)) {
    const o = oldId(name), n = newId(name);
    if (!o) { console.log(`  ${name.padEnd(18)} not in the office base — nothing to remove`); continue; }
    if (!n) {
      console.log(`  ${name.padEnd(18)} MISSING from the new base`);
      safe = false; continue;
    }

    const [oldRows, newRows] = await Promise.all([rows(o), rows(n)]);
    const oldKeys = new Set(oldRows.map((r) => r.fields[key]).filter(Boolean));
    const newKeys = new Set(newRows.map((r) => r.fields[key]).filter(Boolean));
    const missing = [...oldKeys].filter((k) => !newKeys.has(k));

    const verdict = missing.length ? `MISSING ${missing.length}: ${missing.slice(0, 3).join(", ")}` : "all present";
    console.log(`  ${name.padEnd(18)} old ${String(oldKeys.size).padStart(3)} → new ${String(newKeys.size).padStart(3)}   ${verdict}`);

    if (missing.length) safe = false;
    else plan.push({ name, id: o });
  }

  if (!safe) {
    console.log("\nRefusing to delete — the new base does not hold everything the old one does.");
    process.exit(1);
  }
  if (!plan.length) { console.log("\nNothing to remove."); return; }

  console.log(`\n${plan.length} table(s) can be removed from the office base:`);
  plan.forEach((p) => console.log(`  ${p.name}  (${p.id})`));

  if (!DELETE) {
    console.log("\nVerify only. Re-run with --delete to remove them.");
    return;
  }

  for (const p of plan) {
    await api(`/table/${OFFICE}/table/${p.id}`, { method: "DELETE" })
      .catch(() => api(`/base/${OFFICE}/table/${p.id}`, { method: "DELETE" }));
    console.log(`  deleted  ${p.name}`);
  }
  console.log("\nDone. Teable keeps deleted tables in the base trash, so this is recoverable.");
}

main().catch((e) => { console.error("\nFAILED:", e.message); process.exit(1); });
