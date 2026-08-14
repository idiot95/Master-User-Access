import { getModules, getRolePermissions } from "../../lib/model.js";
import { ModulesView } from "./view.jsx";

import { consoleAccess, can, scopeModules } from "../../lib/console.js";
import { NoAccess } from "../no-access.jsx";
export const dynamic = "force-dynamic";

export default async function Page() {
  const access = await consoleAccess();
  if (!can(access, "module", "view")) {
    return <NoAccess resource="module" its={access.itsId} />;
  }

  const [all, permissions] = await Promise.all([getModules(), getRolePermissions()]);
  // An owner sees their own rows. Registering a new module, or changing a URL
  // or visibility, is a fleet act and stays with whoever administers this
  // console — an owner names co-administrators instead, which is its own
  // capability precisely so the two do not travel together.
  const allowed = scopeModules(access, "module", "view");
  const modules = allowed === null ? all : all.filter((m) => allowed.includes(m.key));
  const grantCount = (key) => permissions.filter((p) => p.moduleKey === key && !p.orphaned).length;
  const orphanCount = (key) => permissions.filter((p) => p.moduleKey === key && p.orphaned).length;

  return (
    <ModulesView
      modules={modules.map((m) => ({ ...m, grants: grantCount(m.key), orphaned: orphanCount(m.key) }))}
      mayRegister={can(access, "module", "create")}
    />
  );
}
