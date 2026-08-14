import { getAccessLog, getModules } from "../../lib/model.js";
import { consoleAccess, can, scopeModules } from "../../lib/console.js";
import { NoAccess } from "../no-access.jsx";
import { LogsView } from "./view.jsx";

export const dynamic = "force-dynamic";

export default async function Page() {
  const access = await consoleAccess();
  if (!can(access, "log", "view")) {
    return <NoAccess resource="log" its={access.itsId} />;
  }

  const [entries, modules] = await Promise.all([getAccessLog({ limit: 500 }), getModules()]);

  /**
   * An owner sees their own modules' entries and nothing else.
   *
   * Filtered on the server, never in the view. A client-side filter over the
   * whole log would ship every other module's history to the browser and rely
   * on the table not to draw it — which is a filter, not a boundary.
   *
   * Entries with no module are the fleet-wide acts: a role edited, a member
   * provisioned. Only whoever administers this console sees those, because
   * they are the ones who can perform them.
   */
  const allowed = scopeModules(access, "log", "view");
  const visible = allowed === null
    ? entries
    : entries.filter((e) => e.moduleKey && allowed.includes(e.moduleKey));

  const names = new Map(modules.map((m) => [m.key, m.name ?? m.key]));

  return (
    <LogsView
      entries={visible.map((e) => ({ ...e, moduleName: e.moduleKey ? names.get(e.moduleKey) ?? e.moduleKey : null }))}
      modules={(allowed === null ? modules.map((m) => m.key) : allowed)
        .map((k) => ({ key: k, name: names.get(k) ?? k }))}
      scoped={allowed !== null}
    />
  );
}
