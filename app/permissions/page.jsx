import { getModules, getAccessRoles, getRolePermissions } from "../../lib/model.js";
import { loadVocabularies } from "../../lib/vocab.js";
import { PermissionsView } from "./view.jsx";

import { consoleAccess, can, scopeModules } from "../../lib/console.js";
import { NoAccess } from "../no-access.jsx";
export const dynamic = "force-dynamic";

export default async function Page() {
  const access = await consoleAccess();
  if (!can(access, "permission", "view")) {
    return <NoAccess resource="permission" its={access.itsId} />;
  }

  const [modules, roles, permissions] = await Promise.all([
    getModules(), getAccessRoles(), getRolePermissions(),
  ]);

  /**
   * An owner sees only their own modules as columns.
   *
   * Narrowed here rather than in the view: the matrix is the screen where
   * access is handed out, and shipping every other module's grants to the
   * browser so a component can decline to draw them is not a boundary.
   */
  const allowed = scopeModules(access, "permission", "edit");
  const live = modules.filter((m) => m.status !== "Retired")
    .filter((m) => allowed === null || allowed.includes(m.key));
  const vocab = await loadVocabularies(live);

  // The matrix renders from the manifests, so a module whose manifest has never
  // been fetched shows no checkboxes at all rather than a guessed set. That is
  // the honest state: we do not yet know what it can be granted.
  const surfaces = live.map((m) => ({
    key: m.key,
    id: m.id,
    name: m.name,
    status: m.status,
    visibility: m.visibility,
    manifestStatus: m.manifestStatus,
    resources: (vocab.get(m.key)?.resources ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      vced: r.vced ?? [],
      capabilities: (r.capabilities ?? []).map((c) => ({ key: c.key, label: c.label })),
      // Needed so the editor can warn that "own" scope on a resource with no
      // dimensions behaves exactly like "all".
      scopeDimensions: r.scopeDimensions ?? [],
    })),
  }));

  // The grants themselves, narrowed the same way. Filtering only the columns
  // would leave every other module's grants sitting in the payload the browser
  // receives — invisible on screen and entirely readable to whoever looks.
  const mine = allowed === null
    ? permissions
    : permissions.filter((p) => allowed.includes(p.moduleKey));

  return (
    <PermissionsView
      modules={surfaces}
      roles={roles}
      permissions={mine}
    />
  );
}
