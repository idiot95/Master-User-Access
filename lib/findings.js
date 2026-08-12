/**
 * What is wrong, or about to be, with the current access configuration.
 *
 * Pure and synchronous so every rule can be tested against fixtures. A counter
 * telling you there are 41 grants is a poster; these are the sentences someone
 * can act on, and each carries where to go and what to do.
 *
 * Ordered by severity, then by how cheap the fix is. Severity is about exposure:
 * `risk` means someone can probably see something they should not, `broken`
 * means the configuration does not do what it appears to, `chore` is untidiness.
 */

const VERBS = ["view", "create", "edit", "delete"];
const RANK = { risk: 0, broken: 1, expiring: 2, chore: 3 };

export function findings({ modules, roles, permissions, members, overrides, manifests }) {
  const out = [];
  const add = (f) => out.push(f);

  const byRoleId = new Map(roles.map((r) => [r.id, r]));
  const moduleByKey = new Map(modules.map((m) => [m.key, m]));
  const live = (p) => !p.orphaned && VERBS.some((v) => p[v]);
  const now = Date.now();
  const days = (d) => Math.ceil((new Date(d).getTime() - now) / 86400000);

  /* ---------------- risk ---------------- */

  // Everyone-membership roles reaching anything beyond a Public module. This is
  // the single most consequential misconfiguration the system allows: it hands
  // a right to the whole authenticated population, which is not the office.
  for (const p of permissions.filter(live)) {
    const role = byRoleId.get(p.roleId);
    if (role?.membership !== "Everyone") continue;
    const mod = moduleByKey.get(p.moduleKey);
    if (mod?.visibility === "Public" && !p.create && !p.edit && !p.delete) continue;
    add({
      severity: "risk",
      title: `“${role.name}” reaches ${mod?.name ?? p.moduleKey}`,
      detail: `Everyone who signs in — not just the office — gets ${VERBS.filter((v) => p[v]).join(", ")} on ${p.resource}.`
        + (mod?.visibility === "Public" ? " This module is Public, but that only covers viewing." : ""),
      action: "Review on Permissions", href: "/permissions",
    });
  }

  // Write access granted to a role nobody can be removed from individually.
  for (const p of permissions.filter((x) => live(x) && (x.create || x.edit || x.delete))) {
    const role = byRoleId.get(p.roleId);
    if (role?.membership !== "Org Role") continue;
    add({
      severity: "risk",
      title: `Write access follows an org role`,
      detail: `“${role.name}” gets ${VERBS.filter((v) => p[v] && v !== "view").join(", ")} on ${p.moduleKey}·${p.resource}. `
        + `Membership changes whenever someone is given “${role.orgRole}” in the office console — nobody approves it here.`,
      action: "Check who holds it", href: "/roles",
    });
  }

  /* ---------------- broken ---------------- */

  // A grant that says "own scope" on a resource with no scope dimensions is a
  // restriction that exists only in the console.
  for (const p of permissions.filter(live)) {
    if (p.scopeRule !== "own") continue;
    const vocab = manifests?.get(p.moduleKey);
    const res = vocab?.resources?.find((r) => r.key === p.resource);
    if (!res || (res.scopeDimensions ?? []).length > 0) continue;
    add({
      severity: "broken",
      title: `“Own scope” narrows nothing on ${p.moduleKey}·${p.resource}`,
      detail: `${byRoleId.get(p.roleId)?.name ?? "A role"} is scoped to “own”, but this resource declares no scope dimensions — so it behaves exactly like “all”.`,
      action: "Set it to all, or add scopes", href: "/permissions",
    });
  }

  // Roles that grant nothing. A role someone has been *given* that grants
  // nothing is broken — they believe they received something. A role nobody
  // holds yet is merely untidy, and while the matrix is still being filled in
  // there will be many, so those are reported once rather than once each.
  const empties = roles.filter((r) => !permissions.some((p) => p.roleId === r.id && live(p)));
  const heldEmpties = empties.filter((r) => r.membership === "Explicit"
    && members.some((m) => m.roleIds.includes(r.id) && m.status === "Active"));

  for (const r of heldEmpties) {
    const held = members.filter((m) => m.roleIds.includes(r.id) && m.status === "Active").length;
    add({
      severity: "broken",
      title: `“${r.name}” opens nothing`,
      detail: `${held} ${held === 1 ? "person has" : "people have"} been given this role, and it grants no access at all.`,
      action: "Give it something", href: "/permissions",
    });
  }

  const quiet = empties.filter((r) => !heldEmpties.includes(r));
  if (quiet.length === 1) {
    add({
      severity: "chore",
      title: `“${quiet[0].name}” opens nothing`,
      detail: "Nothing is ticked for it on Permissions.",
      action: "Give it something", href: "/permissions",
    });
  } else if (quiet.length > 1) {
    add({
      severity: "chore",
      title: `${quiet.length} roles open nothing yet`,
      detail: `${quiet.slice(0, 4).map((r) => r.name).join(", ")}`
        + `${quiet.length > 4 ? ` and ${quiet.length - 4} more` : ""}. `
        + "Expected while the grid is still being filled in — nobody is affected until something is ticked.",
      action: "Open Permissions", href: "/permissions",
    });
  }

  // Modules that cannot be granted yet.
  for (const m of modules) {
    if (m.status === "Retired" || m.manifestStatus === "OK") continue;
    add({
      severity: m.status === "Live" ? "broken" : "chore",
      title: `${m.name} has not declared itself`,
      detail: m.manifestStatus === "Unreachable"
        ? `Its manifest could not be fetched${m.url ? ` from ${m.url}` : " — no URL is set"}. Existing grants are untouched, but nothing new can be granted.`
        : "No manifest has been fetched, so there is nothing to grant against it.",
      action: "Fetch its manifest", href: "/modules",
    });
  }

  // Grants pointing at vocabulary a module dropped.
  const orphans = permissions.filter((p) => p.orphaned);
  if (orphans.length) {
    add({
      severity: "broken",
      title: `${orphans.length} grant${orphans.length === 1 ? "" : "s"} reference vanished vocabulary`,
      detail: "Their module no longer declares that resource or capability. They are excluded when access is resolved, so nobody holds a right through them.",
      action: "Clean them up", href: "/permissions",
    });
  }

  /* ---------------- expiring ---------------- */

  for (const o of overrides) {
    if (!o.expires) continue;
    const d = days(o.expires);
    if (d < 0 || d > 14) continue;
    add({
      severity: "expiring",
      title: `${o.effect} override on ${o.moduleKey} ends in ${d} ${d === 1 ? "day" : "days"}`,
      detail: `For ITS ${o.itsId}. ${o.reason ? `“${o.reason}”` : "No reason was recorded."} `
        + (o.effect === "Deny" ? "When it lapses, whatever their roles grant comes back." : "When it lapses, the extra rights go."),
      action: "Review it", href: "/overrides",
    });
  }

  for (const m of members) {
    if (!m.expires || m.status !== "Active") continue;
    const d = days(m.expires);
    if (d < 0 || d > 14) continue;
    add({
      severity: "expiring",
      title: `${m.name || m.itsId} loses access in ${d} ${d === 1 ? "day" : "days"}`,
      detail: "Their membership expires. Extend it or let it lapse deliberately.",
      action: "Open Members", href: "/members",
    });
  }

  /* ---------------- chores ---------------- */

  // Denies with no reason. The reason is required by the form, so these are
  // rows written before that existed or edited in Teable directly.
  const unexplained = overrides.filter((o) => !o.reason?.trim() && (!o.expires || days(o.expires) >= 0));
  if (unexplained.length) {
    add({
      severity: "chore",
      title: `${unexplained.length} override${unexplained.length === 1 ? "" : "s"} without a reason`,
      detail: "An exception whose reason is unrecorded is indistinguishable from a mistake six months from now.",
      action: "Add reasons", href: "/overrides",
    });
  }

  const stranded = members.filter((m) => m.status === "Active" && m.roleIds.length === 0);
  if (stranded.length) {
    add({
      severity: "chore",
      title: `${stranded.length} member${stranded.length === 1 ? "" : "s"} hold no role`,
      detail: "They are recorded but have been given nothing. Either grant them something or remove them.",
      action: "Open Members", href: "/members",
    });
  }

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

export const SEVERITY = {
  risk:     { label: "Risk",     tone: "danger",  icon: "lock" },
  broken:   { label: "Broken",   tone: "warning", icon: "bell" },
  expiring: { label: "Expiring", tone: "info",    icon: "clock" },
  chore:    { label: "Tidy up",  tone: "neutral", icon: "sliders" },
};
