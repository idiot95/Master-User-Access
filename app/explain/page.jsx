import { loadAccessState, buildExplanation } from "../../lib/access.js";
import { loadVocabularies } from "../../lib/vocab.js";
import { ExplainView } from "./view.jsx";

import { consoleAccess, can, scopeModules } from "../../lib/console.js";
import { NoAccess } from "../no-access.jsx";
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }) {
  const access = await consoleAccess();
  if (!can(access, "explain", "view")) {
    return <NoAccess resource="explain" its={access.itsId} />;
  }

  const params = await searchParams;
  const itsId = String(params?.its ?? "").trim();
  const moduleKey = params?.module ? String(params.module) : null;

  const state = await loadAccessState();
  /**
   * An owner explains within their own modules only.
   *
   * This screen answers "why can this person see this", and answered without a
   * bound it also answers "what else does this person have, everywhere" — which
   * is a fair question for whoever runs the console and nobody else's business
   * on another team's module.
   */
  const allowed = scopeModules(access, "explain", "view");
  const mine = (key) => allowed === null || (key && allowed.includes(key));
  const modules = state.modules.filter((m) => m.status !== "Retired").filter((m) => mine(m.key));

  if (!itsId) {
    return <ExplainView modules={modules} result={null} itsId="" moduleKey={moduleKey} />;
  }

  const manifests = await loadVocabularies(modules);
  const full = buildExplanation({
    itsId, claims: { its_id: itsId }, state, moduleKey, manifests,
  });

  // Filtered after the fact rather than by passing one moduleKey down: an owner
  // may administer several, and the resolver takes a single module or none.
  const result = allowed === null ? full : {
    ...full,
    contributions: full.contributions.filter((c) => mine(c.module)),
    net: Object.fromEntries(Object.entries(full.net ?? {}).filter(([k]) => mine(k))),
  };

  return <ExplainView modules={modules} result={result} itsId={itsId} moduleKey={moduleKey} />;
}
