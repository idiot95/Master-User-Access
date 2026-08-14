import { getAccessOverrides, getModules } from "../../lib/model.js";
import { OverridesView } from "./view.jsx";

import { consoleAccess, can } from "../../lib/console.js";
import { NoAccess } from "../no-access.jsx";
export const dynamic = "force-dynamic";

export default async function Page() {
  const access = await consoleAccess();
  if (!can(access, "override", "view")) {
    return <NoAccess resource="override" its={access.itsId} />;
  }

  const [overrides, modules] = await Promise.all([getAccessOverrides(), getModules()]);
  return (
    <OverridesView
      overrides={overrides}
      modules={modules.filter((m) => m.status !== "Retired")}
    />
  );
}
