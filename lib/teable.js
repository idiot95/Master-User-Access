import "server-only";

/**
 * The only place this app talks to Teable.
 *
 * Local and cloud Teable expose the same REST API, so moving between them is
 * two environment variables and nothing else — no code path, no conditional, no
 * second client. TEABLE_TOKEN is read here and never leaves the server: every
 * caller is a Server Component or a Server Action, and the browser is given
 * plain data, never a credential.
 */

const clean = (u) => String(u || "").replace(/\/$/, "");

/**
 * The localhost default is a development convenience and nothing more.
 *
 * On a deployment it is actively harmful: an unset TEABLE_*_URL silently points
 * at 127.0.0.1, every fetch fails somewhere no one can see, and the page throws
 * an opaque Next digest number instead of saying which variable is missing.
 * So the fallback applies only outside production; a deployment must be told.
 */
const DEFAULT_URL = () =>
  clean(process.env.TEABLE_URL)
  || (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:3100");

/**
 * A host and a token per base.
 *
 * The two bases need not live on the same Teable. Access config can be on the
 * live instance while the office register is still local, which is exactly the
 * state during a migration — and pretending otherwise would mean either holding
 * the access base back or reading org data that is not there yet.
 *
 * The tokens are separate for a different reason: a Teable token carries scopes
 * plus an explicit base list, and those scopes apply across every base on the
 * list. One token able to write access rows could also rewrite the office
 * register. Splitting them makes "this app never writes org data" true at the
 * credential rather than only in the code — a bug fails with a 403 instead of
 * corrupting the register.
 */
const ACCESS_URL = () => clean(process.env.TEABLE_ACCESS_URL) || DEFAULT_URL();
const OFFICE_URL = () => clean(process.env.TEABLE_OFFICE_URL) || DEFAULT_URL();

const ACCESS_TOKEN = () => process.env.TEABLE_TOKEN || "";
const OFFICE_TOKEN = () => process.env.TEABLE_OFFICE_TOKEN || ACCESS_TOKEN();

const isOffice = (baseId) => !!baseId && baseId === OFFICE_BASE();
const TOKEN = (baseId) => (isOffice(baseId) ? OFFICE_TOKEN() : ACCESS_TOKEN());
const HOST = (baseId) => (isOffice(baseId) ? OFFICE_URL() : ACCESS_URL());

/**
 * Two bases, deliberately.
 *
 * Access config lives apart from the office data it governs, so the office base
 * can be rebuilt, re-imported or handed to someone else without disturbing who
 * can open what. Teable has no cross-base links, which is a constraint that
 * happens to enforce the separation: nothing on the access side can quietly
 * grow a dependency on a row over here.
 */
export const ACCESS_BASE = () => process.env.TEABLE_ACCESS_BASE || "";
export const OFFICE_BASE = () => process.env.TEABLE_OFFICE_BASE || "";

export class TeableError extends Error {
  constructor(message, status, path) {
    super(message);
    this.name = "TeableError";
    this.status = status;
    this.path = path;
  }
}

/**
 * Which base a table belongs to, learned from `tables()` rather than guessed.
 * A request path names either a base or a table, and only the former says so
 * directly — so the latter is resolved through here.
 */
const tableBase = new Map();

function baseOfPath(path) {
  const b = path.match(/^\/base\/([^/?]+)/);
  if (b) return b[1];
  const t = path.match(/^\/table\/([^/?]+)/);
  if (t) return tableBase.get(t[1]) ?? null;
  return null;
}

async function call(path, { method = "GET", body, revalidate = 30, tags } = {}) {
  const baseId = baseOfPath(path);
  const token = TOKEN(baseId);
  if (!token) {
    throw new TeableError(
      "TEABLE_TOKEN is not set — copy .env.example to .env.local and paste a Teable API token.",
      0, path,
    );
  }

  const res = await fetch(`${HOST(baseId)}/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    // Reads are cached briefly and tagged so a write can invalidate them.
    // Writes must never be cached.
    ...(method === "GET" ? { next: { revalidate, tags } } : { cache: "no-store" }),
  });

  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 300);
    try { detail = JSON.parse(text).message || detail; } catch {}
    throw new TeableError(detail, res.status, path);
  }
  return text ? JSON.parse(text) : null;
}

export const get = (path, opts) => call(path, { ...opts, method: "GET" });
export const post = (path, body) => call(path, { method: "POST", body });
export const patch = (path, body) => call(path, { method: "PATCH", body });

/** Every table in a base, with its fields. Also teaches `call` where each lives. */
export async function tables(baseId) {
  if (!baseId) throw new TeableError("tables() needs a base id", 0, "/base");
  const list = await get(`/base/${baseId}/table`, { tags: [`schema:${baseId}`], revalidate: 300 });
  for (const t of list) tableBase.set(t.id, baseId);
  return list;
}

export async function fields(tableId) {
  return get(`/table/${tableId}/field`, { tags: ["schema"], revalidate: 300 });
}

/** All records, paged. Teable caps a page at 1000. */
export async function records(tableId, { tags } = {}) {
  const out = [];
  for (let skip = 0; ; skip += 1000) {
    const page = await get(
      `/table/${tableId}/record?take=1000&skip=${skip}&fieldKeyType=name`,
      { tags: tags || [`table:${tableId}`] },
    );
    const rows = page?.records || [];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export function createRecords(tableId, rows) {
  return post(`/table/${tableId}/record`, {
    fieldKeyType: "name", typecast: true,
    records: rows.map((fields) => ({ fields })),
  });
}

export function updateRecord(tableId, recordId, fields) {
  return patch(`/table/${tableId}/record/${recordId}`, {
    fieldKeyType: "name", typecast: true, record: { fields },
  });
}

/** A link cell is {id,title} or an array of them; callers want the readable side. */
export const title = (v) => {
  const first = Array.isArray(v) ? v[0] : v;
  return first && typeof first === "object" ? first.title : first ?? null;
};

const isLocalHost = (u) => /^https?:\/\/(127\.0\.0\.1|localhost)\b/.test(u);
const short = (u) => u.replace(/^https?:\/\//, "");

/**
 * Which Teable each base is on — shown in the UI so it is never a guess.
 *
 * `split` is the state worth being loud about: granting rights against live
 * while the org roles behind them come from a laptop is a thing you want to
 * notice, not discover.
 */
export function target() {
  const access = ACCESS_URL();
  const office = OFFICE_URL();
  const split = access && office && access !== office;

  // Named so the UI can print exactly what to paste, rather than leaving
  // someone to work it out from a stack trace they cannot see.
  const missing = [
    !access && "TEABLE_ACCESS_URL",
    !ACCESS_BASE() && "TEABLE_ACCESS_BASE",
    !ACCESS_TOKEN() && "TEABLE_TOKEN",
    !office && "TEABLE_OFFICE_URL",
    !OFFICE_BASE() && "TEABLE_OFFICE_BASE",
  ].filter(Boolean);

  return {
    url: access,
    isLocal: isLocalHost(access),
    label: split
      ? `${isLocalHost(access) ? "Local" : "Live"} + ${isLocalHost(office) ? "local" : "live"} org`
      : (isLocalHost(access) ? "Local" : "Live"),
    detail: split ? `${short(access)} · org ${short(office)}` : short(access),
    split,
    configured: missing.length === 0,
    missing,
    accessBase: ACCESS_BASE(),
    officeBase: OFFICE_BASE(),
  };
}
