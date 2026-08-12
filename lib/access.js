import "server-only";
import {
  getModules, getAccessRoles, getAccessMembers, getRolePermissions, getAccessOverrides,
  rawPeople, rawAssignments, linkId, SCOPE_FIELD,
} from "./model.js";
import { title } from "./teable.js";
import { closure, membership, merge, pack, tierOf, isExpired } from "./resolve.js";

/**
 * Turning an ITS ID into an envelope.
 *
 * Seven Teable reads, each tagged. Next's fetch cache dedupes them, so that is
 * seven calls per cache window across every user — not per resolution. A matrix
 * edit calls revalidateTag and is live on the next resolve, with no deploy.
 */

/** Cheap, no I/O. A person who fails this costs the system nothing at all. */
export function isEligible(claims) {
  return !!(claims && String(claims.its_id || claims.sub || "").trim());
}

export async function loadAccessState() {
  const [modules, roles, members, permissions, overrides, people, assignments] = await Promise.all([
    getModules(), getAccessRoles(), getAccessMembers(),
    getRolePermissions(), getAccessOverrides(), rawPeople(), rawAssignments(),
  ]);
  return { modules, roles, members, permissions, overrides, people, assignments };
}

/**
 * Bridge an ITS ID to the org side.
 *
 * Matching is on the Person link's `.id`, never on its title. Two people with
 * the same name is not hypothetical in a register of 125, and a title match
 * would silently merge them into one identity — a permission bug that reads
 * like a typo.
 */
function orgSide(itsId, { people, assignments }) {
  const person = people.find((r) => String(r.fields["ITS ID"] ?? "").trim() === itsId);
  if (!person) return { roleTitles: new Set(), scopes: [] };

  const mine = assignments.filter(
    (r) => r.fields["Current"] === true && linkId(r.fields["Person"]) === person.id);

  const scopes = [];
  for (const r of mine) {
    const type = r.fields["Scope Type"];
    const field = SCOPE_FIELD[type];
    const cell = field && r.fields[field];
    const id = cell && linkId(cell);
    if (!id) continue;
    const s = { t: slug(type), id, l: title(cell) };
    if (!scopes.some((x) => x.t === s.t && x.id === s.id)) scopes.push(s);
  }
  return { roleTitles: new Set(mine.map((r) => title(r.fields["Role"])).filter(Boolean)), scopes };
}

const slug = (s) => String(s || "").toLowerCase().replace(/\s+/g, "_");

/**
 * Build the envelope. Pure given state — `manifests` is optional and only
 * sharpens two things: which resources a Public module seeds, and which scope
 * dimensions a resource is allowed to receive. Without it the resolver still
 * answers correctly, it is simply less specific.
 */
export function buildEnvelope({ itsId, claims, state, manifests = new Map() }) {
  const eligible = isEligible(claims);
  const { roles, members, permissions, overrides, modules } = state;
  const org = eligible ? orgSide(itsId, state) : { roleTitles: new Set(), scopes: [] };

  const via = membership({
    itsId, eligible, roles, members, orgRoleTitles: org.roleTitles,
  });

  const rolesById = new Map(roles.map((r) => [r.id, r]));
  const held = closure([...via.keys()], rolesById);
  const heldRoles = [...held].map((id) => rolesById.get(id)).filter(Boolean);

  // Public modules are reachable by anyone recognised, with no grant at all.
  const publicSeeds = [];
  for (const m of modules) {
    if (m.visibility !== "Public" || m.status === "Retired" || !eligible) continue;
    const vocab = manifests.get(m.key);
    for (const r of vocab ? vocab.resources.map((x) => x.key) : ["*"]) {
      publicSeeds.push({ module: m.key, resource: r });
    }
  }

  const grants = permissions
    .filter((p) => !p.orphaned && held.has(p.roleId) && p.resource)
    .map((p) => ({ ...p, scopes: scopesFor(p, org.scopes, manifests) }));

  const mine = overrides.filter((o) => o.itsId === itsId);
  const buckets = merge({ publicSeeds, grants, overrides: mine });

  return {
    its: itsId,
    name: claims?.name ?? nameFor(itsId, state) ?? null,
    tier: heldRoles.length ? tierOf(heldRoles) : "recognised",
    mods: pack(buckets),
  };
}

/** Scope claims only reach a resource that declares the matching dimension. */
function scopesFor(perm, orgScopes, manifests) {
  if (perm.scopeRule !== "own") return [];
  const vocab = manifests.get(perm.moduleKey);
  if (!vocab) return orgScopes;
  const resource = vocab.resources.find((r) => r.key === perm.resource);
  if (!resource) return orgScopes;
  const wanted = new Set(
    (resource.scopeDimensions || [])
      .map((k) => vocab.dimensions.get(k))
      .filter((d) => d && d.source === "teable")
      .map((d) => slug(d.teableScope)));
  return orgScopes.filter((s) => wanted.has(s.t));
}

function nameFor(itsId, { members, people }) {
  const m = members.find((x) => x.itsId === itsId);
  if (m?.name) return m.name;
  const p = people.find((r) => String(r.fields["ITS ID"] ?? "").trim() === itsId);
  return p?.fields?.["Name"] ?? null;
}

export async function resolve(itsId, claims, manifests) {
  const state = await loadAccessState();
  return buildEnvelope({ itsId, claims, state, manifests });
}

/**
 * The same pipeline with provenance kept.
 *
 * This is the screen that decides whether a permission system is maintainable
 * or merely feared — "why can this person see this" has to be answerable
 * without reading the code.
 */
export function buildExplanation({ itsId, claims, state, moduleKey, manifests = new Map() }) {
  const eligible = isEligible(claims);
  const { roles, members, permissions, overrides, modules } = state;
  const org = eligible ? orgSide(itsId, state) : { roleTitles: new Set(), scopes: [] };
  const via = membership({ itsId, eligible, roles, members, orgRoleTitles: org.roleTitles });
  const rolesById = new Map(roles.map((r) => [r.id, r]));
  const held = closure([...via.keys()], rolesById);

  const contributions = [];

  for (const m of modules) {
    if (m.visibility !== "Public" || !eligible) continue;
    if (moduleKey && m.key !== moduleKey) continue;
    contributions.push({ via: "public", module: m.key, grants: { v: 1 }, note: "module is Public" });
  }

  for (const roleId of held) {
    const role = rolesById.get(roleId);
    const direct = via.get(roleId);
    for (const p of permissions) {
      if (p.roleId !== roleId || !p.resource) continue;
      if (moduleKey && p.moduleKey !== moduleKey) continue;
      contributions.push({
        via: direct ? direct.how : "inherited",
        role: role?.name ?? roleId,
        detail: direct?.detail ?? `inherited via ${rolesById.get(role?.inheritsFrom)?.name ?? "a parent role"}`,
        module: p.moduleKey,
        resource: p.resource,
        grants: pick(p),
        capabilities: p.capabilities,
        scope: p.scopeRule === "own" ? scopesFor(p, org.scopes, manifests) : [],
        orphaned: p.orphaned || false,
        orphanedReason: p.orphanedReason,
      });
    }
  }

  for (const o of overrides) {
    if (o.itsId !== itsId) continue;
    if (moduleKey && o.moduleKey !== moduleKey) continue;
    contributions.push({
      via: "override",
      effect: o.effect.toLowerCase(),
      module: o.moduleKey,
      resource: o.resource,
      grants: pick(o),
      capabilities: o.capabilities,
      reason: o.reason,
      expires: o.expires,
      expired: isExpired(o.expires),
    });
  }

  const envelope = buildEnvelope({ itsId, claims, state, manifests });
  const net = moduleKey ? { [moduleKey]: envelope.mods[moduleKey] ?? null } : envelope.mods;

  return { its: itsId, name: envelope.name, tier: envelope.tier, eligible, contributions, net };
}

const pick = (r) => ({ v: +!!r.view, c: +!!r.create, e: +!!r.edit, d: +!!r.delete });

export async function explain(itsId, claims, moduleKey, manifests) {
  const state = await loadAccessState();
  return buildExplanation({ itsId, claims, state, moduleKey, manifests });
}
