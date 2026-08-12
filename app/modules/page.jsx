import { getModules, getRolePermissions } from "../../lib/model.js";
import { ModulesView } from "./view.jsx";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [modules, permissions] = await Promise.all([getModules(), getRolePermissions()]);
  const grantCount = (key) => permissions.filter((p) => p.moduleKey === key && !p.orphaned).length;
  const orphanCount = (key) => permissions.filter((p) => p.moduleKey === key && p.orphaned).length;

  return (
    <ModulesView
      modules={modules.map((m) => ({ ...m, grants: grantCount(m.key), orphaned: orphanCount(m.key) }))}
    />
  );
}
