import { getAccessOverrides, getModules } from "../../lib/model.js";
import { OverridesView } from "./view.jsx";

import { consoleAccess, can, scopeModules } from "../../lib/console.js";
import { NoAccess } from "../no-access.jsx";
export const dynamic = "force-dynamic";

export default async function Page() {
  const access = await consoleAccess();
  if (!can(access, "override", "view")) {
    return <NoAccess resource="override" its={access.itsId} />;
  }

  const [overrides, modules] = await Promise.all([getAccessOverrides(), getModules()]);

  // An exception naming someone on another team's module is that team's
  // business, not this owner's — and the reason column often says why.
  const allowed = scopeModules(access, "override", "create");
  const mine = (key) => allowed === null || (key && allowed.includes(key));

  return (
    <OverridesView
      overrides={overrides.filter((o) => mine(o.moduleKey))}
      modules={modules.filter((m) => m.status !== "Retired").filter((m) => mine(m.key))}
    />
  );
}
