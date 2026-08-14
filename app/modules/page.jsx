import { getModules, getRolePermissions } from "../../lib/model.js";
import { ModulesView } from "./view.jsx";

import { consoleAccess, can } from "../../lib/console.js";
import { NoAccess } from "../no-access.jsx";
export const dynamic = "force-dynamic";

export default async function Page() {
  const access = await consoleAccess();
  if (!can(access, "module", "view")) {
    return <NoAccess resource="module" its={access.itsId} />;
  }

  const [modules, permissions] = await Promise.all([getModules(), getRolePermissions()]);
  const grantCount = (key) => permissions.filter((p) => p.moduleKey === key && !p.orphaned).length;
  const orphanCount = (key) => permissions.filter((p) => p.moduleKey === key && p.orphaned).length;

  return (
    <ModulesView
      modules={modules.map((m) => ({ ...m, grants: grantCount(m.key), orphaned: orphanCount(m.key) }))}
    />
  );
}
