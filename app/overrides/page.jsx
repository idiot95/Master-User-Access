import { getAccessOverrides, getModules } from "../../lib/model.js";
import { OverridesView } from "./view.jsx";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [overrides, modules] = await Promise.all([getAccessOverrides(), getModules()]);
  return (
    <OverridesView
      overrides={overrides}
      modules={modules.filter((m) => m.status !== "Retired")}
    />
  );
}
