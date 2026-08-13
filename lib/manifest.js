// The default ajv export only knows draft-07; the schema is draft 2020-12, and
// the mismatch fails at compile time rather than at validation time.
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { createHash } from "node:crypto";
import SCHEMA from "../schemas/access-manifest.json" with { type: "json" };

/**
 * Fetching, validating and diffing module manifests.
 *
 * A manifest says what a module *can* be granted. It is consulted by the admin
 * screens and the reconciliation job, and never at resolve time — so a module
 * being unreachable delays new grants and nothing else. Nobody's access depends
 * on another team's uptime.
 *
 * Deliberately free of `server-only` and of any Teable import: everything here
 * is pure enough to unit-test without a network or a base.
 */

const ajv = addFormats(new Ajv({ allErrors: true, strict: false }));
const validateSchema = ajv.compile(SCHEMA);

export const MANIFEST_PATH = "/.well-known/access-manifest.json";
export const VCED = ["view", "create", "edit", "delete"];

/** Body cap. A manifest is a page of vocabulary; anything larger is a mistake or an attack. */
const MAX_BYTES = 256 * 1024;

export class ManifestError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = "ManifestError";
    this.detail = detail;
  }
}

/**
 * The checks JSON Schema cannot express. Run after `validateSchema` passes.
 * Returns an array of human-readable problems; empty means good.
 */
export function referentialProblems(m) {
  const problems = [];

  const resourceKeys = m.resources.map((r) => r.key);
  for (const dupe of duplicates(resourceKeys)) problems.push(`duplicate resource "${dupe}"`);

  const dims = m.scopeDimensions || [];
  const dimKeys = dims.map((d) => d.key);
  for (const dupe of duplicates(dimKeys)) problems.push(`duplicate scope dimension "${dupe}"`);

  const known = new Set(dimKeys);

  // `dependsOn` naming a dimension that is not declared would draw a picker
  // that can never populate — the console would filter one list by another
  // list it does not have. Depending on itself is the same bug with a shorter
  // cycle, and both read as "the picker is broken" rather than as a typo.
  for (const d of dims) {
    if (!d.dependsOn) continue;
    if (d.dependsOn === d.key) problems.push(`scope dimension "${d.key}" depends on itself`);
    else if (!known.has(d.dependsOn)) {
      problems.push(`scope dimension "${d.key}" depends on undeclared dimension "${d.dependsOn}"`);
    }
  }

  for (const r of m.resources) {
    for (const dupe of duplicates((r.capabilities || []).map((c) => c.key))) {
      problems.push(`resource "${r.key}" declares capability "${dupe}" twice`);
    }
    for (const d of r.scopeDimensions || []) {
      if (!known.has(d)) problems.push(`resource "${r.key}" names undeclared scope dimension "${d}"`);
    }
  }
  return problems;
}

const duplicates = (xs) => [...new Set(xs.filter((x, i) => xs.indexOf(x) !== i))];

/** Validate a parsed manifest. Throws ManifestError, returns the manifest. */
export function validateManifest(m, { expectModule } = {}) {
  if (!validateSchema(m)) {
    throw new ManifestError("manifest does not match the schema",
      validateSchema.errors.map((e) => `${e.instancePath || "/"} ${e.message}`).slice(0, 8));
  }
  const problems = referentialProblems(m);
  if (problems.length) throw new ManifestError("manifest is internally inconsistent", problems);

  // A module may not claim another module's identity. The key is checked against
  // the registry row whose URL we actually fetched, not against the body.
  if (expectModule && m.module !== expectModule) {
    throw new ManifestError(
      `manifest declares module "${m.module}" but was served for "${expectModule}"`);
  }
  return m;
}

/**
 * A stable fingerprint of what can be granted.
 *
 * `revision` and `generated` are excluded on purpose: they change on every
 * republish, and a manifest whose vocabulary is unchanged must not look like a
 * change — otherwise every deploy would churn the orphan diff.
 */
export function manifestHash(m) {
  const canon = canonical({ resources: m.resources, scopeDimensions: m.scopeDimensions || [] });
  return createHash("sha256").update(JSON.stringify(canon)).digest("hex");
}

/** Sort object keys recursively so serialization is order-independent. */
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]));
  }
  return v;
}

/**
 * How long to wait for a module before giving up on it.
 *
 * `fetch` has no default timeout, and a module that accepts the connection and
 * then says nothing would hold this request open indefinitely. Manifests are
 * read while resolving someone's access — on `/authorize` — so without a bound
 * here one unhealthy module stalls sign-in for the whole fleet, which is the
 * exact coupling the pull model exists to avoid.
 */
const TIMEOUT_MS = 5000;

/** Fetch and validate a module's manifest. Never throws on network trouble. */
export async function fetchManifest(moduleKey, baseUrl, { revalidate = 900, timeout = TIMEOUT_MS } = {}) {
  if (!baseUrl) return { ok: false, status: "Unreachable", error: "no URL registered" };
  let url;
  try {
    url = new URL(MANIFEST_PATH, baseUrl).toString();
  } catch {
    return { ok: false, status: "Invalid", error: `"${baseUrl}" is not a URL` };
  }

  let res;
  try {
    res = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(timeout),
      next: { revalidate, tags: [`manifest:${moduleKey}`] },
    });
  } catch (e) {
    const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
    return {
      ok: false,
      status: "Unreachable",
      error: timedOut ? `no response in ${timeout}ms` : String(e.message || e),
    };
  }
  if (!res.ok) return { ok: false, status: "Unreachable", error: `HTTP ${res.status}` };

  const text = await res.text();
  if (text.length > MAX_BYTES) {
    return { ok: false, status: "Invalid", error: `over ${MAX_BYTES} bytes` };
  }

  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) { return { ok: false, status: "Invalid", error: `not JSON: ${e.message}` }; }

  try {
    const manifest = validateManifest(parsed, { expectModule: moduleKey });
    return { ok: true, status: "OK", manifest, hash: manifestHash(manifest) };
  } catch (e) {
    return { ok: false, status: "Invalid", error: e.message, detail: e.detail };
  }
}

/* ------------------------------------------------------------------ *
 * Reading a manifest
 * ------------------------------------------------------------------ */

/** Every (resource, verb) and (resource, capability) the manifest offers. */
export function vocabulary(manifest) {
  const resources = new Map();
  for (const r of manifest.resources) {
    resources.set(r.key, {
      key: r.key,
      label: r.label,
      description: r.description ?? null,
      vced: r.vced || [],
      capabilities: r.capabilities || [],
      capabilityKeys: new Set((r.capabilities || []).map((c) => c.key)),
      scopeDimensions: r.scopeDimensions || [],
    });
  }
  return {
    module: manifest.module,
    resources,
    dimensions: new Map((manifest.scopeDimensions || []).map((d) => [d.key, d])),
  };
}

/**
 * Which stored rows reference vocabulary the module no longer declares.
 *
 * Returns the rows to flag, with a reason. It never returns rows to delete:
 * the grant is history, and history that disappears when a module is
 * redeployed is worse than a stale row. The resolver excludes flagged rows, so
 * "kept" describes the record, not the effect.
 */
export function orphansAgainst(manifest, rows) {
  const vocab = vocabulary(manifest);
  const out = [];
  for (const row of rows) {
    const res = row.resource ? vocab.resources.get(row.resource) : null;

    if (row.resource && !res) {
      out.push({ row, reason: `resource "${row.resource}" is no longer declared` });
      continue;
    }
    // A row with no resource targets the whole module, which is always valid.
    if (!res) continue;

    const goneVerbs = VCED.filter((v) => row[v] && !res.vced.includes(v));
    const goneCaps = (row.capabilities || []).filter((c) => !res.capabilityKeys.has(c));

    if (goneVerbs.length || goneCaps.length) {
      out.push({
        row,
        reason: [
          goneVerbs.length ? `${goneVerbs.join(", ")} not supported by "${row.resource}"` : null,
          goneCaps.length ? `capabilities gone: ${goneCaps.join(", ")}` : null,
        ].filter(Boolean).join("; "),
      });
    }
  }
  return out;
}

/**
 * Rows that were flagged but are valid again — a capability removed by mistake
 * and put back, say. Un-flagging has to be as automatic as flagging, or the
 * matrix accumulates permanent false alarms nobody trusts.
 */
export function revivedAgainst(manifest, rows) {
  const stillOrphaned = new Set(orphansAgainst(manifest, rows).map((o) => o.row.id));
  return rows.filter((r) => r.orphaned && !stillOrphaned.has(r.id));
}
