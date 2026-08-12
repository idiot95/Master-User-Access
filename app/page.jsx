import {
  getModules, getAccessRoles, getAccessMembers,
  getRolePermissions, getAccessOverrides,
} from "../lib/model.js";
import { loadVocabularies } from "../lib/vocab.js";
import { findings } from "../lib/findings.js";
import { OverviewView } from "./view.jsx";

export const dynamic = "force-dynamic";

/**
 * Server Component: fetch, then hand plain data to a client view. Every
 * al-Rayhaanat component is "use client", so none may be rendered from here.
 */
export default async function Page() {
  const [modules, roles, members, permissions, overrides] = await Promise.all([
    getModules(), getAccessRoles(), getAccessMembers(),
    getRolePermissions(), getAccessOverrides(),
  ]);
  const manifests = await loadVocabularies(modules);

  return (
    <OverviewView
      findings={findings({ modules, roles, permissions, members, overrides, manifests })}
      counts={{
        modules: modules.filter((m) => m.status === "Live").length,
        declared: modules.filter((m) => m.manifestStatus === "OK").length,
        roles: roles.length,
        members: members.filter((m) => m.status === "Active").length,
        grants: permissions.filter((p) => !p.orphaned).length,
      }}
      empty={modules.length === 0 && roles.length === 0}
    />
  );
}
