import { loadAccessState, buildExplanation } from "../../lib/access.js";
import { loadVocabularies } from "../../lib/vocab.js";
import { ExplainView } from "./view.jsx";

import { consoleAccess, can } from "../../lib/console.js";
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
  const modules = state.modules.filter((m) => m.status !== "Retired");

  if (!itsId) {
    return <ExplainView modules={modules} result={null} itsId="" moduleKey={moduleKey} />;
  }

  const manifests = await loadVocabularies(modules);
  const result = buildExplanation({
    itsId, claims: { its_id: itsId }, state, moduleKey, manifests,
  });

  return <ExplainView modules={modules} result={result} itsId={itsId} moduleKey={moduleKey} />;
}
