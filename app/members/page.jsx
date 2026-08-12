import {
  getAccessMembers, getAccessRoles, rawPeople, getRolePermissions, getModules,
} from "../../lib/model.js";
import { MembersView } from "./view.jsx";

export const dynamic = "force-dynamic";

const VERBS = ["view", "create", "edit", "delete"];

export default async function Page() {
  const [members, roles, people, permissions, modules] = await Promise.all([
    getAccessMembers(), getAccessRoles(), rawPeople(), getRolePermissions(), getModules(),
  ]);
  const byId = new Map(roles.map((r) => [r.id, r]));
  const moduleName = new Map(modules.map((m) => [m.key, m.name]));

  /** Plain-language summary of what a role opens, for the grant form. */
  const opensFor = (roleId) => {
    const mine = permissions.filter((p) => p.roleId === roleId && !p.orphaned);
    const byModule = new Map();
    for (const p of mine) {
      const verbs = VERBS.filter((v) => p[v]);
      if (!verbs.length && !p.capabilities.length) continue;
      const cur = byModule.get(p.moduleKey) ?? new Set();
      verbs.forEach((v) => cur.add(v));
      byModule.set(p.moduleKey, cur);
    }
    return [...byModule].map(([key, verbs]) => ({
      module: moduleName.get(key) ?? key,
      verbs: VERBS.filter((v) => verbs.has(v)),
    }));
  };

  // Whether a member is also in the office register, matched on ITS ID across
  // the two bases. Purely informational — access never depends on it, which is
  // what lets most members be people the office has never heard of.
  const register = new Map(people
    .map((r) => [String(r.fields["ITS ID"] ?? "").trim(), r.fields["Name"]])
    .filter(([its]) => its));

  return (
    <MembersView
      members={members.map((m) => ({
        ...m,
        inRegister: register.has(m.itsId),
        registerName: register.get(m.itsId) ?? null,
        roleNames: m.roleIds.map((id) => byId.get(id)?.name).filter(Boolean),
      }))}
      register={[...register].map(([its, name]) => ({ its, name }))}
      // Only Explicit roles can be handed to a person. Everyone and Org Role
      // decide their own membership, and offering them here would imply you
      // could add someone to a rule.
      grantable={roles.filter((r) => r.membership === "Explicit").map((r) => ({
        ...r,
        // What ticking this box actually does, in plain words. Nobody should
        // have to hold the matrix in their head to grant someone access.
        opens: opensFor(r.id),
      }))}
      ruleRoles={roles.filter((r) => r.membership !== "Explicit")}
    />
  );
}
