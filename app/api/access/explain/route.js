import { NextResponse } from "next/server";
import { loadAccessState, buildExplanation, buildEnvelope } from "../../../../lib/access.js";
import { loadVocabularies } from "../../../../lib/vocab.js";
import { currentClaims, isAdmin, devOverrideEnabled } from "../../../../lib/session.js";
import { CONSOLE_MODULE } from "../../../../lib/console.js";

export const dynamic = "force-dynamic";

/**
 * Why can this person see this?
 *
 *   /api/access/explain?its=30456117&module=hoto
 *
 * Reading someone else's derivation means reading their org roles, so it is
 * admin-only — with one exception: anyone may explain themselves, which is what
 * makes a "you do not have access" screen actionable rather than a dead end.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const subject = (url.searchParams.get("its") || "").trim();
  const moduleKey = url.searchParams.get("module") || null;
  if (!subject) {
    return NextResponse.json({ error: "missing_its" }, { status: 400 });
  }

  const claims = await currentClaims(request);
  const state = await loadAccessState();
  const manifests = await loadVocabularies(state.modules);

  const caller = claims?.its_id ? String(claims.its_id).trim() : null;
  const self = caller && caller === subject;

  if (!self) {
    const callerEnvelope = caller
      ? buildEnvelope({ itsId: caller, claims, state, manifests })
      : null;
    // The dev override already names an arbitrary ITS ID, so gating on it here
    // would be theatre. It is fenced in lib/session.js, which is the one place
    // that decision belongs.
    //
    // `explain:view` rather than the admin tier alone. Reading this shows
    // everything a person holds anywhere, which is worth being able to delegate
    // to whoever fields "why can they see this?" without also handing them the
    // matrix. Platform Admin still passes, because `can` lets the tier through.
    const rights = callerEnvelope?.mods?.[CONSOLE_MODULE]?.res ?? {};
    const mayExplain = isAdmin(callerEnvelope)
      || rights.explain?.v === 1
      || rights["*"]?.v === 1;
    if (!mayExplain && !devOverrideEnabled()) {
      return NextResponse.json(
        { error: "forbidden", detail: `Explaining another person needs explain:view in ${CONSOLE_MODULE}.` },
        { status: 403 });
    }
  }

  return NextResponse.json(
    buildExplanation({ itsId: subject, claims: { its_id: subject }, state, moduleKey, manifests }),
    { headers: { "Cache-Control": "private, no-store" } });
}
