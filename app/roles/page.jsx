import {
  getAccessRoles, getRolePermissions, getAccessMembers, getModules,
  getOrgRoles, orgRoleHolderCounts,
} from "../../lib/model.js";
import { RolesView } from "./view.jsx";

export const dynamic = "force-dynamic";

const VERBS = ["view", "create", "edit", "delete"];

export default async function Page() {
  const [roles, permissions, members, modules, orgRoles, holders] = await Promise.all([
    getAccessRoles(), getRolePermissions(), getAccessMembers(),
    getModules(), getOrgRoles(), orgRoleHolderCounts(),
  ]);

  const moduleName = new Map(modules.map((m) => [m.key, m.name]));

  /** What a role opens, in plain words, and how many people hold it. */
  const decorate = (r) => {
    const mine = permissions.filter((p) => p.roleId === r.id && !p.orphaned);
    const byModule = new Map();
    for (const p of mine) {
      const verbs = VERBS.filter((v) => p[v]);
      if (!verbs.length && !p.capabilities.length) continue;
      const cur = byModule.get(p.moduleKey) ?? new Set();
      verbs.forEach((v) => cur.add(v));
      byModule.set(p.moduleKey, cur);
    }
    return {
      ...r,
      opens: [...byModule].map(([key, v]) => ({
        module: moduleName.get(key) ?? key, verbs: VERBS.filter((x) => v.has(x)),
      })),
      // Held-by is knowable for two of the three kinds. "Everyone" is by
      // definition everyone who signs in, and saying a number there would be a
      // guess about a population this system deliberately does not store.
      heldBy: r.membership === "Explicit"
        ? members.filter((m) => m.roleIds.includes(r.id) && m.status === "Active").length
        : r.membership === "Org Role"
        ? (holders[r.orgRole] ?? 0)
        : null,
    };
  };

  return (
    <RolesView
      roles={roles.map(decorate)}
      orgRoles={orgRoles.map((o) => ({ ...o, holders: holders[o.name] ?? 0 }))}
      // Only roles that can be inherited from: everything except the role
      // being edited, filtered client-side.
      allRoles={roles.map((r) => ({ id: r.id, name: r.name, key: r.key }))}
    />
  );
}
