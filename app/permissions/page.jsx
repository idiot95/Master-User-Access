import { getModules, getAccessRoles, getRolePermissions } from "../../lib/model.js";
import { loadVocabularies } from "../../lib/vocab.js";
import { PermissionsView } from "./view.jsx";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [modules, roles, permissions] = await Promise.all([
    getModules(), getAccessRoles(), getRolePermissions(),
  ]);

  const live = modules.filter((m) => m.status !== "Retired");
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

  return (
    <PermissionsView
      modules={surfaces}
      roles={roles}
      permissions={permissions}
    />
  );
}
