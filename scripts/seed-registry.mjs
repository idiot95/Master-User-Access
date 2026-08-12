/**
 * Seed the module registry and the access roles.
 *
 * This writes the two things that are mechanical — the fleet's modules, and an
 * access role mirroring each org role that already exists in `Roles`.
 *
 * It deliberately writes NO `Role Permissions`. Deciding that Mushrefa may edit
 * hoto is a judgement about who should see whose data; it is the one genuinely
 * new decision in this project and it belongs to a person, not a seed script.
 * The matrix stays empty until someone fills it, and empty means nobody has
 * access — which is the safe direction to be wrong in.
 *
 *   node scripts/seed-registry.mjs --dry
 *   node scripts/seed-registry.mjs
 */

const URL_ = (process.env.TEABLE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const TOKEN = process.env.TEABLE_TOKEN || "";
const BASE = process.env.TEABLE_BASE || "bsex6xH0EwGHFOphy4r";
const DRY = process.argv.includes("--dry");

if (!TOKEN) { console.error("TEABLE_TOKEN is not set."); process.exit(1); }

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${URL_}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    let d = text.slice(0, 300);
    try { d = JSON.parse(text).message || d; } catch {}
    throw new Error(`${method} ${path} -> ${res.status}: ${d}`);
  }
  return text ? JSON.parse(text) : null;
}

const MODULES = [
  { Key: "directory", Name: "Directory", "Name (Arabic)": "الدليل",
    URL: "https://directory.daeratulaqeeq.org", Icon: "users", Sort: 1,
    Status: "Live", Visibility: "Public",
    Notes: "The people register and ITS One Login. Public: any recognised user may reach it." },
  { Key: "office-console", Name: "Office Console", URL: "https://console.daeratulaqeeq.org",
    Icon: "layers", Sort: 2, Status: "Live", Visibility: "Granted",
    Notes: "Roles, assignments, hierarchies, JDs. No delete path anywhere — its manifest omits the verb." },
  { Key: "explorer", Name: "Office Base Explorer", URL: "https://explorer.daeratulaqeeq.org",
    Icon: "table", Sort: 3, Status: "Live", Visibility: "Granted",
    Notes: "Read-only snapshot. Carries 125 real people; currently not access controlled." },
  { Key: "hoto", Name: "HOTO Schedules", "Name (Arabic)": "برنامج التسليم",
    URL: "https://hoto.daeratulaqeeq.org", Icon: "calendar", Sort: 4,
    Status: "Live", Visibility: "Granted",
    Notes: "PUT /api/schedules is unauthenticated today. Needs a gate before anything else." },
  { Key: "safar", Name: "Safar Dashboard", URL: "https://safar.daeratulaqeeq.org",
    Icon: "book-open", Sort: 5, Status: "Live", Visibility: "Granted",
    Notes: "Read-only. Reads a different (cloud) Teable base, so its scopes are all self-sourced." },
  { Key: "stream", Name: "Live Streaming", URL: "https://stream.daeratulaqeeq.org",
    Icon: "eye", Sort: 6, Status: "Hidden", Visibility: "Granted",
    Notes: "Repo not yet read. Hidden until its manifest exists." },
];

/** Level 1 leads a hierarchy; 2 and 3 sit within one. Review before granting. */
const tierFor = (level) => (level === 1 ? "steward" : "member");

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function main() {
  const tables = await api(`/base/${BASE}/table`);
  const id = (name) => {
    const t = tables.find((x) => x.name === name);
    if (!t) throw new Error(`table "${name}" missing — run create-tables.mjs first`);
    return t.id;
  };
  const tModules = id("Modules"), tAccessRoles = id("Access Roles"), tRoles = id("Roles");

  const page = (t) => api(`/table/${t}/record?take=1000&fieldKeyType=name`).then((r) => r.records || []);
  const [haveModules, haveAccess, orgRoles] = await Promise.all([
    page(tModules), page(tAccessRoles), page(tRoles),
  ]);

  /* ---- Modules ---- */
  const haveKeys = new Set(haveModules.map((r) => r.fields["Key"]));
  const newModules = MODULES.filter((m) => !haveKeys.has(m.Key));
  console.log(`modules: ${haveModules.length} present, ${newModules.length} to add`);
  if (newModules.length && !DRY) {
    await api(`/table/${tModules}/record`, {
      method: "POST",
      body: {
        fieldKeyType: "name", typecast: true,
        records: newModules.map((fields) => ({ fields: { ...fields, "Manifest Status": "Never fetched" } })),
      },
    });
  }
  newModules.forEach((m) => console.log(`  ${DRY ? "would add" : "added"}  ${m.Key}`));

  /* ---- Access roles: one per org role, plus a baseline and an admin ---- */
  const haveRoleKeys = new Set(haveAccess.map((r) => r.fields["Key"]));

  const mirrored = orgRoles
    .filter((r) => r.fields["Role Name"] && !r.fields["Legacy"])
    .map((r) => ({
      Key: slug(r.fields["Role Name"]),
      Name: r.fields["Role Name"],
      Level: r.fields["Level"] ?? null,
      Tier: tierFor(r.fields["Level"]),
      Membership: "Org Role",
      "Org Role": { id: r.id },
      Notes: `Follows the org role. Members are whoever currently holds "${r.fields["Role Name"]}" — no rows stored.`,
    }));

  const fixed = [
    { Key: "everyone", Name: "Everyone (signed in)", Level: 0, Tier: "recognised",
      Membership: "Everyone",
      Notes: "Anyone who passes ITS One Login and the eligibility filter. Stores no rows — this is what serves 10,000 people at zero cost. Grant it only Public modules." },
    { Key: "platform-admin", Name: "Platform Admin", Level: 0, Tier: "admin",
      Membership: "Explicit",
      Notes: "Manages the matrix itself. Explicit membership, deliberately — this list should be short and readable." },
  ];

  const newRoles = [...fixed, ...mirrored].filter((r) => !haveRoleKeys.has(r.Key));
  console.log(`\naccess roles: ${haveAccess.length} present, ${newRoles.length} to add`);
  if (newRoles.length && !DRY) {
    await api(`/table/${tAccessRoles}/record`, {
      method: "POST",
      body: { fieldKeyType: "name", typecast: true, records: newRoles.map((fields) => ({ fields })) },
    });
  }
  newRoles.forEach((r) =>
    console.log(`  ${DRY ? "would add" : "added"}  ${r.Key.padEnd(24)} ${r.Membership}`));

  console.log(`\nRole Permissions left empty on purpose — no row means no access.`);
  console.log("Fill the matrix deliberately; that is the one decision a script should not make.");
}

main().catch((e) => { console.error("\nFAILED:", e.message); process.exit(1); });
